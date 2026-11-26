import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Verifica las "Reglas inquebrantables" de la guía maestra sobre el código fuente. */
const ROOT = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (path.endsWith('.ts')) out.push(path);
  }
  return out;
}

const PURE_FILES = [
  ...sourceFiles(join(ROOT, 'src/engine')),
  ...sourceFiles(join(ROOT, 'src/vm')),
  join(ROOT, 'src/worker/simulationHost.ts'),
  join(ROOT, 'src/worker/protocol.ts'),
];

/** Elimina comentarios para no dar falsos positivos con la documentación del código. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Reglas inquebrantables', () => {
  it('hay archivos que revisar', () => {
    expect(PURE_FILES.length).toBeGreaterThan(8);
  });

  it.each([
    ['Math.random() (usar el PRNG determinista)', /Math\.random/],
    ['eval()', /\beval\s*\(/],
    ['new Function()', /new\s+Function\s*\(/],
    ['document (DOM)', /\bdocument\./],
    ['window (DOM)', /\bwindow\./],
    ['localStorage', /\blocalStorage\b/],
    ['setTimeout / tiempo real', /\b(setTimeout|setInterval|performance\.now|Date\.now)\b/],
  ])('el motor y la VM no usan %s', (_label, pattern) => {
    const offenders = PURE_FILES.filter((f) => pattern.test(stripComments(readFileSync(f, 'utf8')))).map((f) =>
      relative(ROOT, f),
    );
    expect(offenders).toEqual([]);
  });

  it('el código de la UI no ejecuta el intérprete en el hilo principal', () => {
    const uiFiles = [...sourceFiles(join(ROOT, 'src/ui')), ...sourceFiles(join(ROOT, 'src/store'))];
    const offenders = uiFiles.filter((f) => /from ['"](\.\.\/)+(vm|engine\/world)/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});
