import { DOUBLE, GLOW, MeshBuilder, NO_SHADOW, SOFT } from '../iso3d';
import { PALETTE } from '../palette';

/** Escala general del perro (≈ 0.75 casillas de largo). */
const DOG_SCALE = 1.45;

export interface DogAnim {
  /** Rumbo en radianes (0 = este). */
  heading: number;
  /** Alabeo en los giros. */
  bank: number;
  /** Ángulo de las orejas, que hacen de alas. */
  flap: number;
  /** Meneo de la cola. */
  wag: number;
  /** Estiramiento vertical elástico durante la celebración (1 = neutro). */
  stretch?: number;
}

/**
 * Perro alcancía volador: cuerpo de cerámica crema con mancha marrón y ranura para monedas,
 * collar rojo con chapa dorada, y orejas que aletean como alas. Mira hacia +x en local.
 */
export function buildDog(mb: MeshBuilder, a: DogAnim): void {
  const P = PALETTE;
  const stretch = a.stretch ?? 1;
  const horiz = 1 / Math.sqrt(Math.max(0.5, stretch));
  mb.save();
  mb.rotateZ(a.heading);
  mb.rotateX(a.bank);
  mb.scale(DOG_SCALE * horiz, DOG_SCALE * horiz, DOG_SCALE * stretch);

  // Cuerpo a lo largo de x (el eje del prisma se gira de z a x); mancha marrón en el lomo.
  const saddle = (ang: number) => (Math.cos(ang - Math.PI) > 0.55 ? P.dogBrown : P.dogCream);
  mb.save();
  mb.rotateY(Math.PI / 2);
  mb.prism(8, 0.055, 0.095, -0.185, -0.115, P.dogCream, { side: saddle, bottom: P.dogCream, top: null });
  mb.prism(8, 0.095, 0.095, -0.115, 0.055, P.dogCream, { side: saddle, top: null, bottom: null });
  mb.prism(8, 0.095, 0.072, 0.055, 0.12, P.dogCream, { bottom: null });
  mb.prism(10, 0.08, 0.077, 0.108, 0.13, P.dogCollar, { top: null, bottom: null });
  mb.restore();

  // Ranura de la alcancía en el lomo.
  const top = 0.095 * Math.cos(Math.PI / 8) + 0.0015;
  mb.face(
    [
      [-0.05, -0.009, top],
      [0.03, -0.009, top],
      [0.03, 0.009, top],
      [-0.05, 0.009, top],
    ],
    P.dogSlot,
    NO_SHADOW,
    1,
    [0, 0, 0],
    0.03,
  );

  // Chapa dorada colgando del collar.
  mb.save();
  mb.translate(0.135, 0, -0.078);
  mb.rotateY(Math.PI / 2);
  mb.disc(8, 0.02, 0, P.dogTag, DOUBLE);
  mb.restore();

  // Patas.
  for (const [lx, ly] of [
    [0.09, 0.05],
    [0.09, -0.05],
    [-0.1, 0.05],
    [-0.1, -0.05],
  ]) {
    mb.save();
    mb.translate(lx, ly, 0);
    mb.prism(6, 0.022, 0.026, -0.114, -0.06, P.dogCream, { bottom: P.dogPaw, top: null });
    mb.restore();
  }

  // Cola que se menea.
  mb.save();
  mb.translate(-0.175, 0, 0.04);
  mb.rotateZ(a.wag);
  mb.rotateY(-0.75);
  mb.prism(6, 0.02, 0.007, 0, 0.1, P.dogCream, { top: P.dogBrown, bottom: null });
  mb.restore();

  // Cabeza, hocico, nariz y ojos.
  mb.save();
  mb.translate(0.19, 0, 0.05);
  mb.box(-0.062, -0.064, -0.058, 0.058, 0.064, 0.064, P.dogCream, { top: P.dogBrown });
  mb.box(0.058, -0.04, -0.05, 0.112, 0.04, 0.008, P.dogMuzzle);
  mb.box(0.106, -0.017, -0.012, 0.124, 0.017, 0.012, P.dogNose);
  for (const s of [-1, 1]) {
    mb.face(
      [
        [0.0595, s * 0.03 - 0.011, 0.024],
        [0.0595, s * 0.03 + 0.011, 0.024],
        [0.0595, s * 0.03 + 0.011, 0.042],
        [0.0595, s * 0.03 - 0.011, 0.042],
      ],
      P.dogEye,
      GLOW | NO_SHADOW,
      1,
      [0, 0, 0],
      0.03,
    );
  }
  // Orejas: cuelgan de los lados de la cabeza y aletean como alas.
  for (const s of [-1, 1]) {
    mb.save();
    mb.translate(-0.012, s * 0.064, 0.05);
    mb.rotateX(s * a.flap);
    mb.face(
      [
        [-0.042, 0, 0],
        [0.034, 0, 0],
        [0.028, s * 0.012, -0.118],
        [-0.048, s * 0.012, -0.102],
      ],
      P.dogEar,
      DOUBLE | SOFT,
    );
    mb.restore();
  }
  mb.restore();

  mb.restore();
}
