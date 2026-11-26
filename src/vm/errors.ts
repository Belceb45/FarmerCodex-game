export type PyErrorType =
  | 'SyntaxError'
  | 'IndentationError'
  | 'NameError'
  | 'UnboundLocalError'
  | 'TypeError'
  | 'ValueError'
  | 'ZeroDivisionError'
  | 'IndexError'
  | 'KeyError'
  | 'AttributeError'
  | 'RecursionError'
  | 'ImportError'
  | 'UnlockError'
  | 'RuntimeError'
  | 'InternalError';

/** Error del lenguaje del jugador (compilación o ejecución), con posición en el código fuente. */
export class PyError extends Error {
  readonly pyType: PyErrorType;
  line: number | null;
  col: number | null;
  file: string | null;

  constructor(pyType: PyErrorType, message: string, line: number | null = null, col: number | null = null) {
    super(message);
    this.name = pyType;
    this.pyType = pyType;
    this.line = line;
    this.col = col;
    this.file = null;
  }

  /** Texto estilo Python: `TipoError: mensaje`. */
  format(): string {
    return `${this.pyType}: ${this.message}`;
  }
}

export function syntaxError(message: string, line: number, col: number | null = null): PyError {
  return new PyError('SyntaxError', message, line, col);
}

export function indentationError(message: string, line: number, col: number | null = null): PyError {
  return new PyError('IndentationError', message, line, col);
}
