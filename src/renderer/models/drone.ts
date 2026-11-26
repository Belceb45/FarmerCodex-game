import { DOUBLE, GLOW, MeshBuilder, NO_SHADOW } from '../iso3d';
import { PALETTE } from '../palette';
import { buildHat } from './hats';

/** Altura de vuelo del centro del dron sobre las casillas. */
export const DRONE_HOVER = 0.58;
/** Distancia del centro a cada motor (brazos en X). */
const ARM = 0.3;
const BODY_R = 0.165;
/** Escala general: el dron abarca algo más de una casilla en diagonal (doc 06: ~1.15 · tileSize). */
const DRONE_SCALE = 1.3;

export interface DroneAnim {
  time: number;
  /** Ángulo acumulado de las hélices. */
  rotor: number;
  /** Hélices girando (script en marcha). */
  spinning: boolean;
  /** Inclinación hacia el este (+) / oeste (−), en radianes. */
  tiltX: number;
  /** Inclinación hacia el norte (+) / sur (−), en radianes. */
  tiltY: number;
  /** Giro sobre sí mismo (cambio de sombrero). */
  yaw: number;
  eye: number;
  lookX: number;
  lookY: number;
  hat: string;
  /** Escala elástica del sombrero (pop-in en change_hat). */
  hatScale?: number;
  /** Extensión de la herramienta inferior durante acciones de trabajo (0..1). */
  workPulse?: number;
  /** True si Items.Power acelera al dron (añade destello energético en los rotores). */
  powered?: boolean;
}

const isFront = (a: number): boolean => Math.cos(a + Math.PI / 2) > 0.5;

/**
 * Dron cuadricóptero en X: cuerpo octogonal marfil con banda de visor y ojo de estado,
 * brazos verde azulado, motores grafito con hélices de dos palas y el sombrero encima.
 */
export function buildDrone(mb: MeshBuilder, a: DroneAnim): void {
  const work = a.workPulse ?? 0;
  const hatScale = a.hatScale ?? 1;
  mb.save();
  mb.rotateY(a.tiltX);
  mb.rotateX(-a.tiltY);
  mb.rotateZ(a.yaw);
  mb.scale(DRONE_SCALE);

  // Pequeña pinza/emisor inferior que se despliega suavemente durante acciones físicas.
  if (work > 0.02) {
    const ext = work * 0.095;
    mb.prism(6, 0.024, 0.018, -0.08 - ext, -0.072, PALETTE.droneMotor, { top: null });
    mb.prism(6, 0.015, 0.032, -0.095 - ext, -0.08 - ext, a.powered ? PALETTE.sunPetalLight : PALETTE.droneEyeRun, {
      flags: GLOW | NO_SHADOW,
      top: null,
    });
  }

  for (let k = 0; k < 4; k++) {
    mb.save();
    mb.rotateZ(Math.PI / 4 + (k * Math.PI) / 2);
    mb.box(0.06, -0.019, -0.022, ARM, 0.019, 0.01, PALETTE.droneArm);
    mb.restore();
  }

  for (let k = 0; k < 4; k++) {
    const ang = Math.PI / 4 + (k * Math.PI) / 2;
    mb.save();
    mb.translate(Math.cos(ang) * ARM, Math.sin(ang) * ARM, 0);
    mb.prism(6, 0.044, 0.04, -0.035, 0.026, PALETTE.droneMotor, { top: PALETTE.droneMotorTop });
    mb.translate(0, 0, 0.03);
    if (a.spinning) {
      const blurColor = a.powered ? PALETTE.sunPetalLight : PALETTE.droneBlur;
      mb.disc(14, 0.118, 0.006, blurColor, DOUBLE | GLOW | NO_SHADOW, a.powered ? 0.34 : 0.28, 0.005);
    }
    mb.save();
    mb.rotateZ(a.rotor * (k % 2 === 0 ? 1 : -1) + k * 0.8);
    mb.box(-0.115, -0.014, 0, 0.115, 0.014, 0.008, PALETTE.droneBlade, { alpha: a.spinning ? 0.4 : 1 });
    mb.restore();
    mb.prism(6, 0.016, 0.012, 0.008, 0.022, PALETTE.droneMotorTop);
    mb.restore();
  }

  mb.prism(8, 0.118, BODY_R, -0.08, -0.022, PALETTE.droneShell, { bottom: PALETTE.droneBelly, top: null });
  mb.prism(8, BODY_R, BODY_R, -0.022, 0.03, PALETTE.droneShell, {
    top: null,
    bottom: null,
    side: (ang) => (isFront(ang) ? PALETTE.droneVisor : PALETTE.droneShell),
  });
  mb.prism(8, BODY_R, 0.1, 0.03, 0.075, PALETTE.droneShell, { bottom: null });

  // Ojo luminoso sobre el visor: se desplaza hacia donde avanza el dron.
  const y = -(BODY_R * Math.cos(Math.PI / 8) + 0.002);
  const ex = a.lookX * 0.025;
  const ez = 0.004 + a.lookY * 0.005;
  const eyeScale = 1 + work * 0.18;
  const hw = 0.028 * eyeScale;
  const hh = 0.014 * eyeScale;
  mb.face(
    [
      [ex - hw, y, ez - hh],
      [ex + hw, y, ez - hh],
      [ex + hw, y, ez + hh],
      [ex - hw, y, ez + hh],
    ],
    a.eye,
    GLOW | NO_SHADOW,
    1,
    [0, 0, 0],
    0.03,
  );

  if (hatScale > 0.02) {
    mb.save();
    mb.translate(0, 0, 0.075);
    mb.scale(1.06 * hatScale);
    buildHat(mb, a.hat, a.time);
    mb.restore();
  }

  mb.restore();
}
