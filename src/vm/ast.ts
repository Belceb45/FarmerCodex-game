/** Árbol de sintaxis abstracta del DSL (subconjunto de Python 3). */

export interface NodeBase {
  line: number;
  col: number;
}

export type BinOpKind = '+' | '-' | '*' | '/' | '//' | '%' | '**';
export type UnaryOpKind = 'neg' | 'pos' | 'not';
export type CmpOpKind = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not in' | 'is' | 'is not';

export interface NameExpr extends NodeBase {
  kind: 'Name';
  id: string;
}
export interface ConstantExpr extends NodeBase {
  kind: 'Constant';
  value: number | string | boolean | null;
}
export interface BinOpExpr extends NodeBase {
  kind: 'BinOp';
  op: BinOpKind;
  left: Expr;
  right: Expr;
}
export interface UnaryOpExpr extends NodeBase {
  kind: 'UnaryOp';
  op: UnaryOpKind;
  operand: Expr;
}
export interface BoolOpExpr extends NodeBase {
  kind: 'BoolOp';
  op: 'and' | 'or';
  values: Expr[];
}
export interface CompareExpr extends NodeBase {
  kind: 'Compare';
  left: Expr;
  ops: CmpOpKind[];
  comparators: Expr[];
}
export interface Keyword {
  name: string;
  value: Expr;
  line: number;
  col: number;
}
export interface CallExpr extends NodeBase {
  kind: 'Call';
  func: Expr;
  args: Expr[];
  keywords: Keyword[];
}
export interface AttributeExpr extends NodeBase {
  kind: 'Attribute';
  value: Expr;
  attr: string;
}
export interface SubscriptExpr extends NodeBase {
  kind: 'Subscript';
  value: Expr;
  index: Expr;
}
export interface SliceExpr extends NodeBase {
  kind: 'Slice';
  lower: Expr | null;
  upper: Expr | null;
  step: Expr | null;
}
export interface ListExpr extends NodeBase {
  kind: 'List';
  elts: Expr[];
}
export interface TupleExpr extends NodeBase {
  kind: 'Tuple';
  elts: Expr[];
}
export interface DictExpr extends NodeBase {
  kind: 'Dict';
  keys: Expr[];
  values: Expr[];
}
export interface SetExpr extends NodeBase {
  kind: 'Set';
  elts: Expr[];
}
export interface IfExpExpr extends NodeBase {
  kind: 'IfExp';
  test: Expr;
  body: Expr;
  orelse: Expr;
}

export type Expr =
  | NameExpr
  | ConstantExpr
  | BinOpExpr
  | UnaryOpExpr
  | BoolOpExpr
  | CompareExpr
  | CallExpr
  | AttributeExpr
  | SubscriptExpr
  | SliceExpr
  | ListExpr
  | TupleExpr
  | DictExpr
  | SetExpr
  | IfExpExpr;

export interface ExprStmt extends NodeBase {
  kind: 'Expr';
  value: Expr;
}
export interface AssignStmt extends NodeBase {
  kind: 'Assign';
  /** `a = b = valor` produce dos objetivos. */
  targets: Expr[];
  value: Expr;
}
export interface AugAssignStmt extends NodeBase {
  kind: 'AugAssign';
  target: Expr;
  op: BinOpKind;
  value: Expr;
}
/** Asignación anotada (`x: int = 5`): la anotación se ignora en ejecución. */
export interface AnnAssignStmt extends NodeBase {
  kind: 'AnnAssign';
  target: Expr;
  value: Expr | null;
}
export interface IfStmt extends NodeBase {
  kind: 'If';
  test: Expr;
  body: Stmt[];
  orelse: Stmt[];
}
export interface WhileStmt extends NodeBase {
  kind: 'While';
  test: Expr;
  body: Stmt[];
}
export interface ForStmt extends NodeBase {
  kind: 'For';
  target: Expr;
  iter: Expr;
  body: Stmt[];
}
export interface Param {
  name: string;
  default: Expr | null;
  line: number;
  col: number;
}
export interface FunctionDefStmt extends NodeBase {
  kind: 'FunctionDef';
  name: string;
  params: Param[];
  body: Stmt[];
}
export interface ReturnStmt extends NodeBase {
  kind: 'Return';
  value: Expr | null;
}
export interface BreakStmt extends NodeBase {
  kind: 'Break';
}
export interface ContinueStmt extends NodeBase {
  kind: 'Continue';
}
export interface PassStmt extends NodeBase {
  kind: 'Pass';
}
export interface GlobalStmt extends NodeBase {
  kind: 'Global';
  names: string[];
}
export interface ImportAlias {
  name: string;
  asname: string | null;
}
export interface ImportStmt extends NodeBase {
  kind: 'Import';
  names: ImportAlias[];
}
export interface ImportFromStmt extends NodeBase {
  kind: 'ImportFrom';
  module: string;
  /** `null` representa `from modulo import *`. */
  names: ImportAlias[] | null;
}

export type Stmt =
  | ExprStmt
  | AssignStmt
  | AugAssignStmt
  | AnnAssignStmt
  | IfStmt
  | WhileStmt
  | ForStmt
  | FunctionDefStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | PassStmt
  | GlobalStmt
  | ImportStmt
  | ImportFromStmt;

export interface Module {
  kind: 'Module';
  file: string;
  body: Stmt[];
}
