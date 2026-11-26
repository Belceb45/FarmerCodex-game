import type { SpriteDef } from './iso';

/**
 * Partículas compartidas (doc 06 §2), en blanco para teñirlas por código, y la sombra difusa de
 * drones y mascota. Son dibujos 2D: no tienen malla.
 */
function fx(name: string, w: number, h: number, svg: string): SpriteDef {
  return { name, w, h, ax: w / 2, ay: h / 2, anchor: [0.5, 0.5], outline: 0, flat: true, build: () => undefined, extra: () => svg };
}

export const FX: SpriteDef[] = [
  fx(
    'fx_spark',
    32,
    32,
    `<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4"/></filter></defs>` +
      `<circle cx="16" cy="16" r="6" fill="#fff" opacity="0.55" filter="url(#b)"/>` +
      `<polygon points="16,2 18,14 30,16 18,18 16,30 14,18 2,16 14,14" fill="#fff"/>` +
      `<circle cx="16" cy="16" r="2.6" fill="#fff"/>`,
  ),
  fx(
    'fx_dust',
    48,
    48,
    `<defs><filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>` +
      `<g filter="url(#b)" fill="#fff"><circle cx="20" cy="26" r="11" opacity="0.8"/><circle cx="29" cy="22" r="9" opacity="0.75"/><circle cx="26" cy="30" r="8" opacity="0.7"/></g>`,
  ),
  fx(
    'fx_glow',
    64,
    64,
    `<defs><radialGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>` +
      `<circle cx="32" cy="32" r="32" fill="url(#g)"/>`,
  ),
  fx(
    'fx_bubble',
    24,
    24,
    `<circle cx="12" cy="12" r="9" fill="#fff" opacity="0.8"/><circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="1.4"/><ellipse cx="9" cy="8.5" rx="3" ry="2" fill="#fff"/>`,
  ),
  fx(
    'fx_shadow',
    64,
    32,
    `<defs><filter id="b" x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="3.2"/></filter></defs>` +
      `<ellipse cx="32" cy="16" rx="24" ry="9" fill="#120d0a" filter="url(#b)"/>`,
  ),
  fx('fx_leaf', 16, 16, `<path d="M2 12 C 4 4, 10 2, 14 3 C 12 9, 8 13, 2 12 Z" fill="#fff"/><path d="M3 11 L 12 4" stroke="#bbb" stroke-width="0.8"/>`),
  fx('fx_splinter', 16, 16, `<polygon points="2,9 13,5 15,7 4,12" fill="#fff"/><polygon points="2,9 13,5 13,6 3,10" fill="#ddd"/>`),
];
