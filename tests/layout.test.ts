import { describe, expect, it } from 'vitest';
import {
  cascadeRect,
  clampRect,
  computeFitInsets,
  defaultLayout,
  displayName,
  HUD_SAFE_TOP,
  MIN_SIZE,
  moveRect,
  nextScriptName,
  resizeRect,
  TITLE_BAR_HEIGHT,
  validateScriptName,
} from '../src/ui/windows/layout';

const VP = { width: 1440, height: 900 };

describe('Ventanas flotantes: geometría', () => {
  it('mantiene la ventana dentro del viewport', () => {
    expect(clampRect({ x: -50, y: -20, w: 400, h: 300 }, 'code', VP)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
    expect(clampRect({ x: 1300, y: 800, w: 400, h: 300 }, 'code', VP)).toEqual({ x: 1040, y: 600, w: 400, h: 300 });
  });

  it('una ventana minimizada solo necesita que su barra de título quede visible', () => {
    const r = clampRect({ x: 10, y: 2000, w: 400, h: 300 }, 'code', VP, true);
    expect(r.y).toBe(VP.height - TITLE_BAR_HEIGHT);
    expect(r.h).toBe(300);
  });

  it('respeta el tamaño mínimo y no supera el viewport', () => {
    expect(clampRect({ x: 0, y: 0, w: 10, h: 10 }, 'code', VP)).toMatchObject(MIN_SIZE.code);
    expect(clampRect({ x: 0, y: 0, w: 5000, h: 5000 }, 'docs', VP)).toMatchObject({ w: VP.width, h: VP.height });
  });

  it('mover desplaza y recorta contra los bordes', () => {
    const start = { x: 100, y: 100, w: 400, h: 300 };
    expect(moveRect(start, 50, 25, 'code', VP)).toEqual({ x: 150, y: 125, w: 400, h: 300 });
    expect(moveRect(start, -500, -500, 'code', VP)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });

  it('redimensionar por el borde este y sur cambia solo el tamaño', () => {
    const start = { x: 100, y: 100, w: 400, h: 300 };
    expect(resizeRect(start, 'se', 60, 40, 'code', VP)).toEqual({ x: 100, y: 100, w: 460, h: 340 });
    expect(resizeRect(start, 'e', 5000, 0, 'code', VP).w).toBe(VP.width - 100);
  });

  it('redimensionar por el oeste y el norte mantiene fijo el borde opuesto', () => {
    const start = { x: 100, y: 100, w: 400, h: 300 };
    const r = resizeRect(start, 'nw', -30, 20, 'code', VP);
    expect(r).toEqual({ x: 70, y: 120, w: 430, h: 280 });
    expect(r.x + r.w).toBe(start.x + start.w);
    const shrunk = resizeRect(start, 'w', 1000, 0, 'code', VP);
    expect(shrunk.w).toBe(MIN_SIZE.code.w);
    expect(shrunk.x + shrunk.w).toBe(500);
  });

  it('la disposición inicial deja la granja libre a la derecha en escritorio', () => {
    const layout = defaultLayout(VP);
    expect(layout.compact).toBe(false);
    expect(layout.code.x + layout.code.w).toBeLessThan(VP.width / 2);
    expect(layout.code.y).toBeGreaterThanOrEqual(HUD_SAFE_TOP);
    expect(layout.console.y).toBeGreaterThan(layout.code.y + layout.code.h);
    expect(layout.console.y + layout.console.h).toBeLessThanOrEqual(VP.height);
  });

  it('en móvil las ventanas ocupan el ancho y quedan dentro de la pantalla', () => {
    const phone = { width: 390, height: 844 };
    const layout = defaultLayout(phone);
    expect(layout.compact).toBe(true);
    for (const r of [layout.code, layout.console, layout.docs]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(phone.width);
      expect(r.y + r.h).toBeLessThanOrEqual(phone.height);
    }
  });

  it('las ventanas nuevas se colocan en cascada sin taparse exactamente', () => {
    const base = defaultLayout(VP).code;
    const a = cascadeRect([], base, 'code', VP);
    const b = cascadeRect([a], base, 'code', VP);
    const c = cascadeRect([a, b], base, 'code', VP);
    expect(a).toEqual(base);
    expect(b.x - a.x).toBe(28);
    expect(c.y - b.y).toBe(28);
  });

  it('los márgenes de encuadre reservan el lado que ocupan las ventanas', () => {
    const insets = computeFitInsets([{ x: 16, y: 64, w: 480, h: 400 }], VP);
    expect(insets.left).toBe(496);
    expect(insets.right).toBe(0);
    expect(insets.top).toBe(HUD_SAFE_TOP);
    const wide = computeFitInsets([{ x: 8, y: 58, w: 1400, h: 300 }], VP);
    expect(wide.top).toBe(358);
    expect(wide.left).toBe(0);
  });

  it('los márgenes nunca dejan sin espacio a la granja', () => {
    const insets = computeFitInsets(
      [
        { x: 0, y: 60, w: 700, h: 400 },
        { x: 740, y: 60, w: 700, h: 400 },
      ],
      VP,
    );
    expect(insets.left + insets.right).toBeLessThanOrEqual(VP.width * 0.62 + 1e-9);
  });
});

describe('Ventanas flotantes: nombres de archivo', () => {
  it('muestra el nombre sin la extensión', () => {
    expect(displayName('main.py')).toBe('main');
    expect(displayName('helper')).toBe('helper');
  });

  it('propone el primer scriptN.py libre', () => {
    expect(nextScriptName(['main.py'])).toBe('script1.py');
    expect(nextScriptName(['main.py', 'script1.py', 'script3.py'])).toBe('script2.py');
  });

  it('valida nombres importables y únicos', () => {
    const files = ['main.py', 'helper.py'];
    expect(validateScriptName('cosecha_2', files)).toBeNull();
    expect(validateScriptName('', files)).toMatch(/nombre/);
    expect(validateScriptName('2cosas', files)).toMatch(/letras/);
    expect(validateScriptName('mi archivo', files)).toMatch(/letras/);
    expect(validateScriptName('while', files)).toMatch(/reservada/);
    expect(validateScriptName('Helper', files)).toMatch(/Ya existe/);
    expect(validateScriptName('x'.repeat(33), files)).toMatch(/Máximo/);
  });

  it('un archivo puede conservar su propio nombre al renombrarlo', () => {
    expect(validateScriptName('main', ['main.py', 'helper.py'], 'main.py')).toBeNull();
  });
});
