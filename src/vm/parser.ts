import type {
  BinOpKind,
  CallExpr,
  CmpOpKind,
  Expr,
  ForStmt,
  FunctionDefStmt,
  IfStmt,
  ImportAlias,
  Keyword,
  Module,
  Param,
  Stmt,
  WhileStmt,
} from './ast';
import { indentationError, syntaxError, type PyError } from './errors';
import { tokenize, type Token } from './lexer';

const UNSUPPORTED_KEYWORDS: Readonly<Record<string, string>> = {
  class: "las clases ('class') no están soportadas",
  try: "'try/except' no está soportado",
  except: "'try/except' no está soportado",
  finally: "'try/finally' no está soportado",
  with: "'with' no está soportado",
  lambda: "las expresiones 'lambda' no están soportadas; define una función con 'def'",
  yield: "los generadores ('yield') no están soportados",
  async: "'async' no está soportado",
  await: "'await' no está soportado",
  del: "'del' no está soportado",
  assert: "'assert' no está soportado",
  raise: "'raise' no está soportado",
  nonlocal: "'nonlocal' no está soportado; usa 'global' o devuelve el valor con 'return'",
};

const AUG_OPS: Readonly<Record<string, BinOpKind>> = {
  '+=': '+', '-=': '-', '*=': '*', '/=': '/', '//=': '//', '%=': '%', '**=': '**',
};

const BITWISE_OPS = new Set(['&', '|', '^', '~', '<<', '>>', '&=', '|=', '^=', '<<=', '>>=', '@', '@=']);
const COMPARISON_OPS = new Set(['==', '!=', '<', '<=', '>', '>=']);
const COMPOUND_KEYWORDS = new Set(['if', 'while', 'for', 'def', 'elif', 'else']);
const MAX_NESTING = 100;

/** Analiza el código fuente y devuelve el AST del módulo. Lanza PyError (SyntaxError / IndentationError). */
export function parse(source: string, file = 'main.py'): Module {
  return new Parser(tokenize(source), file).parseModule();
}

class Parser {
  private pos = 0;
  private depth = 0;
  private readonly tokens: Token[];
  private readonly file: string;

  constructor(tokens: Token[], file: string) {
    this.tokens = tokens;
    this.file = file;
  }

  // ---------------------------------------------------------------- utilidades

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const token = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return token;
  }

  private isOp(value: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.type === 'OP' && t.value === value;
  }

  private isKeyword(value: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.type === 'KEYWORD' && t.value === value;
  }

  private acceptOp(value: string): boolean {
    if (!this.isOp(value)) return false;
    this.next();
    return true;
  }

  private acceptKeyword(value: string): boolean {
    if (!this.isKeyword(value)) return false;
    this.next();
    return true;
  }

  private expectOp(value: string, context = ''): Token {
    if (!this.isOp(value)) {
      throw this.error(`se esperaba '${value}'${context ? ' ' + context : ''}, pero se encontró ${describe(this.peek())}`);
    }
    return this.next();
  }

  private expectName(what: string): Token {
    const t = this.peek();
    if (t.type === 'NAME') return this.next();
    if (t.type === 'KEYWORD') throw this.error(`'${t.value}' es una palabra reservada y no puede usarse como nombre`);
    throw this.error(`se esperaba ${what}, pero se encontró ${describe(t)}`);
  }

  private error(message: string, token: Token = this.peek()): PyError {
    return syntaxError(message, token.line, token.col);
  }

  private enter(token: Token): void {
    this.depth++;
    if (this.depth > MAX_NESTING) throw this.error('el código está demasiado anidado', token);
  }

  private leave(): void {
    this.depth--;
  }

  private atStatementEnd(): boolean {
    const t = this.peek();
    return t.type === 'NEWLINE' || t.type === 'EOF' || (t.type === 'OP' && t.value === ';');
  }

  /** Fin de una lista de expresiones (para permitir la coma final: `x = 1,`). */
  private atExprListEnd(): boolean {
    const t = this.peek();
    if (t.type === 'NEWLINE' || t.type === 'EOF') return true;
    if (t.type === 'KEYWORD' && t.value === 'in') return true;
    return t.type === 'OP' && [')', ']', '}', '=', ':', ';'].includes(t.value);
  }

  // ---------------------------------------------------------------- sentencias

  parseModule(): Module {
    const body: Stmt[] = [];
    while (this.peek().type !== 'EOF') {
      if (this.peek().type === 'NEWLINE') {
        this.next();
        continue;
      }
      body.push(...this.parseStatement());
    }
    return { kind: 'Module', file: this.file, body };
  }

  private parseStatement(): Stmt[] {
    const t = this.peek();
    if (t.type === 'INDENT') throw indentationError('sangría inesperada', t.line, t.col);
    if (t.type === 'KEYWORD') {
      switch (t.value) {
        case 'if':
          return [this.parseIf()];
        case 'while':
          return [this.parseWhile()];
        case 'for':
          return [this.parseFor()];
        case 'def':
          return [this.parseDef()];
        case 'elif':
        case 'else':
          throw this.error(`'${t.value}' sin un 'if' correspondiente (revisa la sangría)`);
        default:
          break;
      }
    }
    if (this.isOp('@')) throw this.error('los decoradores no están soportados');
    return this.parseSimpleStatements();
  }

  private parseSimpleStatements(): Stmt[] {
    const stmts: Stmt[] = [this.parseSmallStatement()];
    while (this.acceptOp(';')) {
      if (this.peek().type === 'NEWLINE' || this.peek().type === 'EOF') break;
      stmts.push(this.parseSmallStatement());
    }
    const t = this.peek();
    if (t.type === 'NEWLINE') this.next();
    else if (t.type !== 'EOF') throw this.error(`sintaxis inválida: no se esperaba ${describe(t)}`);
    return stmts;
  }

  private parseSmallStatement(): Stmt {
    const t = this.peek();
    const pos = { line: t.line, col: t.col };
    if (t.type === 'KEYWORD') {
      switch (t.value) {
        case 'pass':
          this.next();
          return { kind: 'Pass', ...pos };
        case 'break':
          this.next();
          return { kind: 'Break', ...pos };
        case 'continue':
          this.next();
          return { kind: 'Continue', ...pos };
        case 'return': {
          this.next();
          const value = this.atStatementEnd() ? null : this.parseTestList();
          return { kind: 'Return', value, ...pos };
        }
        case 'global': {
          this.next();
          const names = [this.expectName('un nombre de variable').value];
          while (this.acceptOp(',')) names.push(this.expectName('un nombre de variable').value);
          return { kind: 'Global', names, ...pos };
        }
        case 'import':
          return this.parseImport();
        case 'from':
          return this.parseFromImport();
        default:
          if (COMPOUND_KEYWORDS.has(t.value)) {
            throw this.error(`'${t.value}' debe ir en su propia línea, con sangría, no después de ':' o ';'`);
          }
          if (UNSUPPORTED_KEYWORDS[t.value]) throw this.error(UNSUPPORTED_KEYWORDS[t.value]);
      }
    }

    const first = this.parseTestList();
    const op = this.peek();
    if (op.type === 'OP') {
      if (op.value === '=') {
        const targets: Expr[] = [first];
        let value: Expr = first;
        while (this.acceptOp('=')) {
          value = this.parseTestList();
          if (this.isOp('=')) targets.push(value);
        }
        for (const target of targets) this.validateTarget(target);
        return { kind: 'Assign', targets, value, ...pos };
      }
      const aug = AUG_OPS[op.value];
      if (aug !== undefined) {
        this.next();
        if (first.kind !== 'Name' && first.kind !== 'Subscript' && first.kind !== 'Attribute') {
          throw syntaxError('expresión no válida para una asignación aumentada', first.line, first.col);
        }
        const value = this.parseTestList();
        return { kind: 'AugAssign', target: first, op: aug, value, ...pos };
      }
      if (op.value === ':') {
        if (first.kind !== 'Name' && first.kind !== 'Attribute' && first.kind !== 'Subscript') {
          throw this.error('anotación de tipo no válida');
        }
        this.next();
        this.parseTest(); // la anotación se acepta y se ignora
        const value = this.acceptOp('=') ? this.parseTestList() : null;
        this.validateTarget(first);
        return { kind: 'AnnAssign', target: first, value, ...pos };
      }
      if (BITWISE_OPS.has(op.value)) throw this.error(`el operador '${op.value}' no está soportado`);
    }
    return { kind: 'Expr', value: first, ...pos };
  }

  private validateTarget(target: Expr): void {
    switch (target.kind) {
      case 'Name':
      case 'Subscript':
      case 'Attribute':
        return;
      case 'Tuple':
      case 'List':
        for (const elt of target.elts) this.validateTarget(elt);
        return;
      case 'Call':
        throw syntaxError('no se puede asignar a una llamada de función', target.line, target.col);
      case 'Constant':
        throw syntaxError('no se puede asignar a un valor literal', target.line, target.col);
      default:
        throw syntaxError('no se puede asignar a esta expresión', target.line, target.col);
    }
  }

  private parseSuite(owner: string, ownerToken: Token): Stmt[] {
    if (!this.isOp(':')) {
      throw this.error(`se esperaba ':' al final de la sentencia '${owner}', pero se encontró ${describe(this.peek())}`);
    }
    this.next();
    const t = this.peek();
    if (t.type === 'NEWLINE') {
      this.next();
      const indent = this.peek();
      if (indent.type !== 'INDENT') {
        throw indentationError(
          `se esperaba un bloque con sangría después de '${owner}' (línea ${ownerToken.line})`,
          indent.line,
          indent.col,
        );
      }
      this.next();
      this.enter(indent);
      const body: Stmt[] = [];
      while (this.peek().type !== 'DEDENT' && this.peek().type !== 'EOF') {
        if (this.peek().type === 'NEWLINE') {
          this.next();
          continue;
        }
        body.push(...this.parseStatement());
      }
      if (this.peek().type === 'DEDENT') this.next();
      this.leave();
      return body;
    }
    if (t.type === 'EOF') {
      throw indentationError(`se esperaba un bloque después de '${owner}'`, t.line, t.col);
    }
    return this.parseSimpleStatements();
  }

  private parseIf(): IfStmt {
    const t = this.next(); // 'if' o 'elif'
    const test = this.parseTest();
    const body = this.parseSuite(t.value, t);
    let orelse: Stmt[] = [];
    if (this.isKeyword('elif')) {
      orelse = [this.parseIf()];
    } else if (this.isKeyword('else')) {
      const e = this.next();
      orelse = this.parseSuite('else', e);
    }
    return { kind: 'If', test, body, orelse, line: t.line, col: t.col };
  }

  private parseWhile(): WhileStmt {
    const t = this.next();
    const test = this.parseTest();
    const body = this.parseSuite('while', t);
    if (this.isKeyword('else')) throw this.error("'while ... else' no está soportado");
    return { kind: 'While', test, body, line: t.line, col: t.col };
  }

  private parseFor(): ForStmt {
    const t = this.next();
    const first = this.parseExpr();
    let target: Expr = first;
    if (this.isOp(',')) {
      const elts = [first];
      while (this.acceptOp(',')) {
        if (this.isKeyword('in')) break;
        elts.push(this.parseExpr());
      }
      target = { kind: 'Tuple', elts, line: first.line, col: first.col };
    }
    this.validateTarget(target);
    if (!this.acceptKeyword('in')) {
      throw this.error(`se esperaba 'in' en el bucle 'for', pero se encontró ${describe(this.peek())}`);
    }
    const iter = this.parseTestList();
    const body = this.parseSuite('for', t);
    if (this.isKeyword('else')) throw this.error("'for ... else' no está soportado");
    return { kind: 'For', target, iter, body, line: t.line, col: t.col };
  }

  private parseDef(): FunctionDefStmt {
    const t = this.next();
    const name = this.expectName('el nombre de la función').value;
    this.expectOp('(', 'después del nombre de la función');
    const params: Param[] = [];
    let seenDefault = false;
    while (!this.isOp(')')) {
      if (this.isOp('*') || this.isOp('**')) throw this.error('los parámetros *args / **kwargs no están soportados');
      const p = this.expectName('el nombre de un parámetro');
      if (this.acceptOp(':')) this.parseTest(); // anotación ignorada
      let defaultValue: Expr | null = null;
      if (this.acceptOp('=')) {
        defaultValue = this.parseTest();
        seenDefault = true;
      } else if (seenDefault) {
        throw syntaxError(
          'un parámetro sin valor por defecto no puede ir después de uno con valor por defecto',
          p.line,
          p.col,
        );
      }
      if (params.some((q) => q.name === p.value)) {
        throw syntaxError(`parámetro duplicado '${p.value}' en la definición de la función`, p.line, p.col);
      }
      params.push({ name: p.value, default: defaultValue, line: p.line, col: p.col });
      if (!this.acceptOp(',')) break;
    }
    this.expectOp(')', 'para cerrar la lista de parámetros');
    if (this.acceptOp('->')) this.parseTest(); // anotación de retorno ignorada
    const body = this.parseSuite('def', t);
    return { kind: 'FunctionDef', name, params, body, line: t.line, col: t.col };
  }

  private parseModuleName(): string {
    const name = this.expectName('el nombre de un módulo').value;
    if (this.isOp('.')) throw this.error('los paquetes (import a.b) no están soportados; importa el archivo directamente');
    return name;
  }

  private parseAlias(): ImportAlias {
    const name = this.expectName('un nombre').value;
    const asname = this.acceptKeyword('as') ? this.expectName('un alias').value : null;
    return { name, asname };
  }

  private parseImport(): Stmt {
    const t = this.next();
    const names: ImportAlias[] = [];
    do {
      const name = this.parseModuleName();
      const asname = this.acceptKeyword('as') ? this.expectName('un alias').value : null;
      names.push({ name, asname });
    } while (this.acceptOp(','));
    return { kind: 'Import', names, line: t.line, col: t.col };
  }

  private parseFromImport(): Stmt {
    const t = this.next();
    const module = this.parseModuleName();
    if (!this.acceptKeyword('import')) throw this.error("se esperaba 'import'");
    if (this.acceptOp('*')) return { kind: 'ImportFrom', module, names: null, line: t.line, col: t.col };
    const paren = this.acceptOp('(');
    const names: ImportAlias[] = [this.parseAlias()];
    while (this.acceptOp(',')) {
      if (paren && this.isOp(')')) break;
      names.push(this.parseAlias());
    }
    if (paren) this.expectOp(')');
    return { kind: 'ImportFrom', module, names, line: t.line, col: t.col };
  }

  // ---------------------------------------------------------------- expresiones

  /** test (',' test)* [','] — produce una tupla si hay comas. */
  private parseTestList(): Expr {
    const first = this.parseTest();
    if (!this.isOp(',')) return first;
    const elts = [first];
    while (this.acceptOp(',')) {
      if (this.atExprListEnd()) break;
      elts.push(this.parseTest());
    }
    return { kind: 'Tuple', elts, line: first.line, col: first.col };
  }

  private parseTest(): Expr {
    if (this.isKeyword('lambda')) throw this.error(UNSUPPORTED_KEYWORDS.lambda);
    const body = this.parseOrTest();
    if (this.isKeyword('if')) {
      this.next();
      const test = this.parseOrTest();
      if (!this.acceptKeyword('else')) throw this.error("se esperaba 'else' en la expresión condicional");
      const orelse = this.parseTest();
      return { kind: 'IfExp', test, body, orelse, line: body.line, col: body.col };
    }
    return body;
  }

  private parseOrTest(): Expr {
    const left = this.parseAndTest();
    if (!this.isKeyword('or')) return left;
    const values = [left];
    while (this.acceptKeyword('or')) values.push(this.parseAndTest());
    return { kind: 'BoolOp', op: 'or', values, line: left.line, col: left.col };
  }

  private parseAndTest(): Expr {
    const left = this.parseNotTest();
    if (!this.isKeyword('and')) return left;
    const values = [left];
    while (this.acceptKeyword('and')) values.push(this.parseNotTest());
    return { kind: 'BoolOp', op: 'and', values, line: left.line, col: left.col };
  }

  private parseNotTest(): Expr {
    if (this.isKeyword('not')) {
      const t = this.next();
      this.enter(t);
      const operand = this.parseNotTest();
      this.leave();
      return { kind: 'UnaryOp', op: 'not', operand, line: t.line, col: t.col };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    const left = this.parseExpr();
    const ops: CmpOpKind[] = [];
    const comparators: Expr[] = [];
    for (;;) {
      const t = this.peek();
      let op: CmpOpKind;
      if (t.type === 'OP' && COMPARISON_OPS.has(t.value)) {
        this.next();
        op = t.value as CmpOpKind;
      } else if (this.isKeyword('in')) {
        this.next();
        op = 'in';
      } else if (this.isKeyword('not') && this.isKeyword('in', 1)) {
        this.next();
        this.next();
        op = 'not in';
      } else if (this.isKeyword('is')) {
        this.next();
        op = this.acceptKeyword('not') ? 'is not' : 'is';
      } else {
        break;
      }
      ops.push(op);
      comparators.push(this.parseExpr());
    }
    if (ops.length === 0) return left;
    return { kind: 'Compare', left, ops, comparators, line: left.line, col: left.col };
  }

  /** Nivel aritmético (sin comparaciones): también se usa para los objetivos de `for`. */
  private parseExpr(): Expr {
    const expr = this.parseArith();
    const t = this.peek();
    if (t.type === 'OP' && ['|', '&', '^', '<<', '>>'].includes(t.value)) {
      throw this.error(`el operador de bits '${t.value}' no está soportado`);
    }
    return expr;
  }

  private parseArith(): Expr {
    let left = this.parseTerm();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next().value as BinOpKind;
      const right = this.parseTerm();
      left = { kind: 'BinOp', op, left, right, line: left.line, col: left.col };
    }
    return left;
  }

  private parseTerm(): Expr {
    let left = this.parseFactor();
    for (;;) {
      if (this.isOp('*') || this.isOp('/') || this.isOp('//') || this.isOp('%')) {
        const op = this.next().value as BinOpKind;
        const right = this.parseFactor();
        left = { kind: 'BinOp', op, left, right, line: left.line, col: left.col };
      } else if (this.isOp('@')) {
        throw this.error("el operador '@' no está soportado");
      } else {
        return left;
      }
    }
  }

  private parseFactor(): Expr {
    const t = this.peek();
    if (this.isOp('-') || this.isOp('+')) {
      this.next();
      this.enter(t);
      const operand = this.parseFactor();
      this.leave();
      return { kind: 'UnaryOp', op: t.value === '-' ? 'neg' : 'pos', operand, line: t.line, col: t.col };
    }
    if (this.isOp('~')) throw this.error("el operador de bits '~' no está soportado");
    return this.parsePower();
  }

  private parsePower(): Expr {
    const base = this.parseAtomExpr();
    if (this.isOp('**')) {
      const t = this.next();
      this.enter(t);
      const exponent = this.parseFactor();
      this.leave();
      return { kind: 'BinOp', op: '**', left: base, right: exponent, line: base.line, col: base.col };
    }
    return base;
  }

  private parseAtomExpr(): Expr {
    let expr = this.parseAtom();
    for (;;) {
      if (this.isOp('(')) {
        const open = this.next();
        this.enter(open);
        expr = this.parseCallArgs(expr);
        this.leave();
      } else if (this.isOp('[')) {
        const open = this.next();
        this.enter(open);
        expr = this.parseSubscript(expr);
        this.leave();
      } else if (this.isOp('.')) {
        this.next();
        const name = this.expectName('el nombre de un atributo');
        expr = { kind: 'Attribute', value: expr, attr: name.value, line: expr.line, col: expr.col };
      } else {
        return expr;
      }
    }
  }

  private parseCallArgs(func: Expr): CallExpr {
    const args: Expr[] = [];
    const keywords: Keyword[] = [];
    while (!this.isOp(')')) {
      if (this.isOp('*') || this.isOp('**')) {
        throw this.error('el desempaquetado *args / **kwargs en llamadas no está soportado');
      }
      if (this.peek().type === 'NAME' && this.isOp('=', 1)) {
        const nameTok = this.next();
        this.next();
        const value = this.parseTest();
        if (keywords.some((k) => k.name === nameTok.value)) {
          throw syntaxError(`argumento con nombre repetido '${nameTok.value}'`, nameTok.line, nameTok.col);
        }
        keywords.push({ name: nameTok.value, value, line: nameTok.line, col: nameTok.col });
      } else {
        if (keywords.length > 0) throw this.error('un argumento posicional no puede ir después de uno con nombre');
        const arg = this.parseTest();
        if (this.isKeyword('for')) throw this.error('las expresiones generadoras no están soportadas');
        args.push(arg);
      }
      if (!this.acceptOp(',')) break;
    }
    this.expectOp(')', 'para cerrar la llamada');
    return { kind: 'Call', func, args, keywords, line: func.line, col: func.col };
  }

  private parseSubscript(value: Expr): Expr {
    const items: Expr[] = [];
    let hadComma = false;
    while (!this.isOp(']')) {
      items.push(this.parseSliceItem());
      if (!this.acceptOp(',')) break;
      hadComma = true;
    }
    this.expectOp(']', 'para cerrar el índice');
    if (items.length === 0) throw this.error('índice vacío');
    const index: Expr =
      items.length === 1 && !hadComma ? items[0] : { kind: 'Tuple', elts: items, line: items[0].line, col: items[0].col };
    return { kind: 'Subscript', value, index, line: value.line, col: value.col };
  }

  private parseSliceItem(): Expr {
    const start = this.peek();
    let lower: Expr | null = null;
    if (!this.isOp(':')) {
      lower = this.parseTest();
      if (!this.isOp(':')) return lower;
    }
    this.expectOp(':');
    let upper: Expr | null = null;
    let step: Expr | null = null;
    if (!this.isOp(']') && !this.isOp(',') && !this.isOp(':')) upper = this.parseTest();
    if (this.acceptOp(':')) {
      if (!this.isOp(']') && !this.isOp(',')) step = this.parseTest();
    }
    return { kind: 'Slice', lower, upper, step, line: start.line, col: start.col };
  }

  private parseAtom(): Expr {
    const t = this.peek();
    const pos = { line: t.line, col: t.col };
    if (t.type === 'NAME') {
      this.next();
      return { kind: 'Name', id: t.value, ...pos };
    }
    if (t.type === 'NUMBER') {
      this.next();
      return { kind: 'Constant', value: t.num ?? 0, ...pos };
    }
    if (t.type === 'STRING') {
      let value = '';
      while (this.peek().type === 'STRING') value += this.next().value;
      return { kind: 'Constant', value, ...pos };
    }
    if (t.type === 'KEYWORD') {
      if (t.value === 'True' || t.value === 'False') {
        this.next();
        return { kind: 'Constant', value: t.value === 'True', ...pos };
      }
      if (t.value === 'None') {
        this.next();
        return { kind: 'Constant', value: null, ...pos };
      }
      if (UNSUPPORTED_KEYWORDS[t.value]) throw this.error(UNSUPPORTED_KEYWORDS[t.value]);
      throw this.error(`sintaxis inválida: no se esperaba la palabra reservada '${t.value}'`);
    }
    if (t.type === 'OP') {
      if (t.value === '(') {
        this.next();
        this.enter(t);
        let result: Expr;
        if (this.isOp(')')) {
          result = { kind: 'Tuple', elts: [], ...pos };
        } else {
          const first = this.parseTest();
          if (this.isKeyword('for')) throw this.error('las expresiones generadoras no están soportadas');
          if (this.isOp(',')) {
            const elts = [first];
            while (this.acceptOp(',')) {
              if (this.isOp(')')) break;
              elts.push(this.parseTest());
            }
            result = { kind: 'Tuple', elts, ...pos };
          } else {
            result = first;
          }
        }
        this.expectOp(')', 'para cerrar el paréntesis');
        this.leave();
        return result;
      }
      if (t.value === '[') {
        this.next();
        this.enter(t);
        const elts: Expr[] = [];
        while (!this.isOp(']')) {
          elts.push(this.parseTest());
          if (this.isKeyword('for')) throw this.error('las comprensiones de listas no están soportadas; usa un bucle for');
          if (!this.acceptOp(',')) break;
        }
        this.expectOp(']', 'para cerrar la lista');
        this.leave();
        return { kind: 'List', elts, ...pos };
      }
      if (t.value === '{') {
        this.next();
        this.enter(t);
        let result: Expr;
        if (this.isOp('}')) {
          result = { kind: 'Dict', keys: [], values: [], ...pos };
        } else {
          if (this.isOp('**')) throw this.error("el desempaquetado '**' no está soportado");
          const first = this.parseTest();
          if (this.acceptOp(':')) {
            const keys = [first];
            const values = [this.parseTest()];
            if (this.isKeyword('for')) throw this.error('las comprensiones de diccionarios no están soportadas');
            while (this.acceptOp(',')) {
              if (this.isOp('}')) break;
              keys.push(this.parseTest());
              this.expectOp(':', 'entre la clave y el valor del diccionario');
              values.push(this.parseTest());
            }
            result = { kind: 'Dict', keys, values, ...pos };
          } else {
            if (this.isKeyword('for')) throw this.error('las comprensiones de conjuntos no están soportadas');
            const elts = [first];
            while (this.acceptOp(',')) {
              if (this.isOp('}')) break;
              elts.push(this.parseTest());
            }
            result = { kind: 'Set', elts, ...pos };
          }
        }
        this.expectOp('}', 'para cerrar las llaves');
        this.leave();
        return result;
      }
      if (t.value === '...') throw this.error("'...' (Ellipsis) no está soportado");
      if (t.value === '*') throw this.error("el desempaquetado con '*' no está soportado");
    }
    if (t.type === 'INDENT') throw indentationError('sangría inesperada', t.line, t.col);
    throw this.error(`sintaxis inválida: no se esperaba ${describe(t)}`);
  }
}

function describe(token: Token): string {
  switch (token.type) {
    case 'NEWLINE':
      return 'el fin de la línea';
    case 'EOF':
      return 'el final del archivo';
    case 'INDENT':
      return 'una sangría';
    case 'DEDENT':
      return 'el fin del bloque';
    case 'STRING':
      return 'una cadena de texto';
    case 'NUMBER':
      return `el número ${token.value}`;
    default:
      return `'${token.value}'`;
  }
}
