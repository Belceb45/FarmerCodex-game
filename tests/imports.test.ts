import { describe, expect, it } from 'vitest';
import { createHost, runProgram } from './helpers';

describe('import entre archivos del jugador', () => {
  const files = {
    'utils.py': 'VERSION = 2\n\ndef doble(x):\n    return x * 2\n\ndef _privada():\n    return 0\n',
  };

  it('import modulo y acceso a sus atributos', () => {
    const r = runProgram('import utils\nquick_print(utils.doble(21), utils.VERSION, utils)', { files });
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['42 2 <módulo utils>']);
  });

  it('import con alias y from modulo import nombre as alias', () => {
    const r = runProgram('import utils as u\nfrom utils import doble as d, VERSION\nquick_print(u.doble(1), d(5), VERSION)', {
      files,
    });
    expect(r.output).toEqual(['2 10 2']);
  });

  it('from modulo import * trae solo los nombres públicos', () => {
    const r = runProgram('from utils import *\nquick_print(doble(4), VERSION)\nquick_print(_privada())', { files });
    expect(r.output).toEqual(['8 2']);
    expect(r.error).toMatch(/^NameError: el nombre '_privada'/);
  });

  it('cada módulo se ejecuta una sola vez y tiene su propio ámbito global', () => {
    const r = runProgram('import contador\nimport contador\nfrom contador import n\nx = 5\nquick_print(n, contador.leer())', {
      files: { 'contador.py': 'quick_print("cargando")\nn = 1\nx = 100\n\ndef leer():\n    return x\n' },
    });
    expect(r.output).toEqual(['cargando', '1 100']);
  });

  it('las importaciones circulares no se repiten', () => {
    const r = runProgram('import a\nquick_print(a.desde_b())', {
      files: {
        'a.py': 'import b\nA = "a"\n\ndef desde_b():\n    return b.valor()\n',
        'b.py': 'import a\n\ndef valor():\n    return a.A + "b"\n',
      },
    });
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['ab']);
  });

  it('importar dentro de una función también funciona', () => {
    const r = runProgram('def f():\n    import utils\n    return utils.doble(3)\nquick_print(f())', { files });
    expect(r.output).toEqual(['6']);
  });

  it('un archivo inexistente o un nombre que no está dan ImportError', () => {
    expect(runProgram('import nada', { files }).error).toMatch(/^ImportError: no existe el archivo 'nada\.py'/);
    expect(runProgram('from utils import triple', { files }).error).toMatch(/^ImportError: no se puede importar 'triple'/);
    expect(runProgram('import utils\nutils.triple', { files }).error).toMatch(/^AttributeError/);
  });

  it('los errores dentro de un módulo apuntan a su archivo y línea', () => {
    const roto = { 'roto.py': 'x = 1\ny = x +\n' };
    const syntax = runProgram('import roto', { files: roto });
    expect(syntax.error).toMatch(/^SyntaxError/);
    expect(syntax.vm.error).toMatchObject({ file: 'roto.py', line: 2 });
    const runtime = runProgram('import falla', { files: { 'falla.py': '\n\nz = 1 / 0\n' } });
    expect(runtime.vm.error).toMatchObject({ file: 'falla.py', line: 3, pyType: 'ZeroDivisionError' });
  });

  it('en el simulador, import resuelve contra los archivos sincronizados', () => {
    const h = createHost();
    h.host.handleMessage({
      type: 'SYNC_FILES',
      files: { 'main.py': 'from rutas import columna\ncolumna(2)', 'rutas.py': 'def columna(n):\n    for i in range(n):\n        move(North)\n' },
    });
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.advance(2000);
    expect(h.errors()).toEqual([]);
    expect(h.host.currentWorld.drones[0].y).toBe(2);
  });
});
