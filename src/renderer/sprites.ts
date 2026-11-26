import { Container, Graphics, Text, Texture } from 'pixi.js';
import { PALETTE } from './palette';

/** Mini icono facetado del recurso cosechado: vuela hasta su contador en el inventario. */
export function createItemFlyer(item: string): Container {
  const c = new Container();
  const g = new Graphics();
  if (item === 'Wood') {
    g.poly([-9, -1, 5, -7, 9, -4, 9, 3, -5, 9, -9, 6]).fill(0x6b3f1d);
    g.poly([-9, -1, 5, -7, 9, -4, -5, 2]).fill(0x8a552a);
    g.ellipse(-7, 3.5, 2.6, 3.6).fill(0xc99a5b);
  } else if (item === 'Carrot') {
    g.poly([-4, -4, 5, -2, -2, 11]).fill(PALETTE.carrot);
    g.poly([-4, -4, 0, -3, -2, 11]).fill(PALETTE.carrotLight);
    g.poly([-2, -4, -4, -11, 1, -5]).fill(PALETTE.carrotLeaf);
    g.poly([0, -4, 4, -10, 3, -3]).fill(PALETTE.carrotLeafLight);
  } else if (item === 'Pumpkin') {
    g.poly([0, -7, 7, -5, 10, 1, 7, 8, 0, 9, -7, 8, -10, 1, -7, -5]).fill(PALETTE.pumpkin);
    g.poly([0, -7, -7, -5, -10, 1, -7, 8, 0, 9, -3.5, 1]).fill(PALETTE.pumpkinLight);
    g.poly([0, -7, 7, -5, 10, 1, 7, 8, 0, 9, 3.5, 1]).fill(PALETTE.pumpkinDark);
    g.poly([-1, -7, 1, -7, 2, -11, 0, -11.5]).fill(PALETTE.pumpkinStem);
  } else if (item === 'Power') {
    g.poly([2, -11, -7, 1, -1, 1, -3, 11, 7, -2, 1, -2, 4, -11]).fill(PALETTE.sunPetal);
    g.poly([2, -11, -7, 1, -1, 1, 1, -2, 4, -11]).fill(PALETTE.sunPetalLight);
  } else if (item === 'Cactus') {
    g.poly([-3, -9, 0, -11, 3, -9, 3, 10, -3, 10]).fill(PALETTE.cactus);
    g.poly([-3, -9, 0, -11, 0, 10, -3, 10]).fill(PALETTE.cactusLight);
    g.poly([3, 0, 7, 0, 7, -5, 9, -5, 9, 3, 3, 3]).fill(PALETTE.cactusDark);
    g.poly([-3, 3, -7, 3, -7, -2, -9, -2, -9, 6, -3, 6]).fill(PALETTE.cactus);
  } else if (item === 'Gold') {
    g.ellipse(0, 3, 9, 4).fill(0xa87a1e);
    g.rect(-9, -1, 18, 4).fill(0xc99a2e);
    g.ellipse(0, -1, 9, 4).fill(PALETTE.chestGold);
    g.ellipse(0, -1, 5.5, 2.3).fill(PALETTE.chestGoldLight);
  } else if (item === 'Bone') {
    g.rotation = -0.6;
    g.rect(-7, -2.2, 14, 4.4).fill(0xe8dcc0);
    for (const [bx, by] of [
      [-7.5, -2.6],
      [-7.5, 2.6],
      [7.5, -2.6],
      [7.5, 2.6],
    ]) {
      g.circle(bx, by, 3).fill(by < 0 ? 0xf6efdf : 0xddd0b2);
    }
  } else if (item === 'Weird_Substance') {
    g.poly([-3, -10, 3, -10, 3, -4, 8, 8, -8, 8, -3, -4]).fill(0xd7d2e6);
    g.poly([-5.5, 1, 5.5, 1, 8, 8, -8, 8]).fill(PALETTE.weird);
  } else {
    g.poly([0, 9, -6, -7, -2.5, -9, 0, 0]).fill(PALETTE.bladeShade);
    g.poly([0, 9, -2.5, -9, 0, -11, 0, 0]).fill(PALETTE.bladeGrown);
    g.poly([0, 9, 0, -11, 2.5, -9, 0, 0]).fill(PALETTE.bladeTip);
    g.poly([0, 9, 2.5, -9, 6, -7, 0, 0]).fill(PALETTE.bladeGrown);
    g.rect(-4.2, 2.2, 8.4, 2.6).fill(PALETTE.dust);
  }
  c.addChild(g);
  return c;
}

/** Corazón facetado para la celebración del perro. */
export function createHeart(): Graphics {
  const g = new Graphics();
  g.poly([0, 7, -7, -1, -6.5, -5, -3.5, -7, 0, -4]).fill(PALETTE.heart);
  g.poly([0, 7, 7, -1, 6.5, -5, 3.5, -7, 0, -4]).fill(PALETTE.heart);
  g.poly([-6.5, -5, -3.5, -7, -2, -4.5, -5, -2]).fill(PALETTE.heartLight);
  return g;
}

/** Nubecilla blanca (cambio de sombrero). */
export function createPuff(): Graphics {
  const g = new Graphics();
  g.poly([-6, 0, -3, -5, 3, -5, 6, 0, 3, 5, -3, 5]).fill(PALETTE.puff);
  return g;
}

/** Texto flotante de print() sobre el dron. */
export function createBubble(text: string): Container {
  const c = new Container();
  const label = new Text({
    text: text.length > 48 ? text.slice(0, 47) + '…' : text,
    style: {
      fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace',
      fontSize: 13,
      fontWeight: '600',
      fill: PALETTE.bubbleText,
    },
  });
  label.anchor.set(0.5, 0.5);
  const w = Math.max(28, label.width + 16);
  const h = label.height + 8;
  const bg = new Graphics();
  bg.roundRect(-w / 2, -h / 2, w, h, 3).fill(PALETTE.bubble);
  bg.poly([-5, h / 2 - 0.5, 5, h / 2 - 0.5, 0, h / 2 + 6]).fill(PALETTE.bubble);
  c.addChild(bg, label);
  return c;
}

/** Halo radial suave detrás de la isla (gradiente del lienzo, doc 05). */
export function createGlowTexture(): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return Texture.from(canvas);
}
