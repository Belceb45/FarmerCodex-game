import type { SVGProps } from 'react';
import { AtlasSprite, ITEM_SPRITE } from './AtlasSprite';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

/** ▶ Ejecutar / continuar. */
export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4.8v14.4c0 .8.9 1.3 1.6.8l10.6-7.2a1 1 0 0 0 0-1.6L8.6 4C7.9 3.5 7 4 7 4.8z" fill="currentColor" />
    </Svg>
  );
}

/** ▷ Paso a paso (triángulo hueco). */
export function StepIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M7.5 5.6v12.8c0 .6.7 1 1.2.6l9.3-6.4a.7.7 0 0 0 0-1.2L8.7 5c-.5-.4-1.2 0-1.2.6z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** ‖ Pausa. */
export function PauseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="4.5" width="4.4" height="15" rx="1" fill="currentColor" />
      <rect x="13.6" y="4.5" width="4.4" height="15" rx="1" fill="currentColor" />
    </Svg>
  );
}

/** ■ Detener. */
export function StopIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" fill="currentColor" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </Svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 12h13" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </Svg>
  );
}

/** Restaurar una ventana minimizada. */
export function RestoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </Svg>
  );
}

/** «i» de documentación. */
export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="5.8" r="1.9" fill="currentColor" />
      <path d="M9.5 10h3.3v8.2M9.5 18.5h6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Árbol tecnológico (doc 07: ícono de chip/engranaje): chip con patillas y un engranaje. */
export function TreeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M12 8.6l.8 1.1 1.3-.3.3 1.3 1.2.6-.5 1.2.8 1.1-1.1.8.1 1.3-1.3.2-.6 1.2-1.2-.5-1.2.5-.6-1.2-1.3-.2.1-1.3-1.1-.8.8-1.1-.5-1.2 1.2-.6.3-1.3 1.3.3zM12 11.2a1.3 1.3 0 1 0 0 2.6a1.3 1.3 0 1 0 0-2.6z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </Svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 2.8l1.6 2.2 2.7-.5.6 2.6 2.5 1.2-.9 2.6 1.6 2.2-2.2 1.6.1 2.7-2.7.4-1.3 2.4-2.5-1.1-2.5 1.1-1.3-2.4-2.7-.4.1-2.7-2.2-1.6 1.6-2.2-.9-2.6 2.5-1.2.6-2.6 2.7.5zM12 8.8a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M5 7h14M10 4h4M7.5 7l.8 11.4a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9L16.5 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Icono de la consola de salida. */
export function ConsoleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 7l5 5-5 5M12.5 17.5h6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Icono low-poly de heno (28×28 en el HUD): gavilla facetada atada con cordel. */
export function HayIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <polygon points="16,28 9.5,6.5 13,4.8 16,14" fill="#a67b20" />
      <polygon points="16,28 13,4.8 16,3 16,14" fill="#d8aa3c" />
      <polygon points="16,28 16,3 19,4.8 16,14" fill="#ecc45a" />
      <polygon points="16,28 19,4.8 22.5,6.5 16,14" fill="#d8aa3c" />
      <polygon points="16,28 5,10 8.2,8.4 13,18" fill="#a67b20" />
      <polygon points="16,28 27,10 23.8,8.4 19,18" fill="#d8aa3c" />
      <polygon points="9.5,6.5 13,4.8 12,2.6 9.2,3.8" fill="#ecc45a" />
      <polygon points="13,4.8 16,3 16,0.8 13.2,2" fill="#f5d987" />
      <polygon points="16,3 19,4.8 18.8,2 16,0.8" fill="#ecc45a" />
      <polygon points="19,4.8 22.5,6.5 22.8,3.8 20,2.6" fill="#e2b84c" />
      <polygon points="10.6,18.4 21.4,18.4 20.6,21.6 11.4,21.6" fill="#8c5622" />
      <polygon points="10.6,18.4 21.4,18.4 21.1,19.6 10.9,19.6" fill="#b87836" />
    </svg>
  );
}

/** Tronco low-poly con anillos (madera). */
export function WoodIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <polygon points="4,13 22,6 28,10 28,20 10,27 4,23" fill="#6b3f1d" />
      <polygon points="4,13 22,6 28,10 10,17" fill="#8a552a" />
      <polygon points="4,13 10,17 10,27 4,23" fill="#4d2b12" />
      <ellipse cx="7" cy="20" rx="3.4" ry="5" fill="#c99a5b" />
      <ellipse cx="7" cy="20" rx="2.1" ry="3.1" fill="#a87a43" />
      <ellipse cx="7" cy="20" rx="0.9" ry="1.4" fill="#7d5428" />
      <polygon points="16,9 20,7.6 21,9 17,10.5" fill="#a46a35" />
    </svg>
  );
}

/** Zanahoria facetada con hojas. */
export function CarrotIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <polygon points="12,10 22,12 13,29" fill="#e68526" />
      <polygon points="12,10 16,11 13,29" fill="#f29a3c" />
      <polygon points="17,11.5 22,12 13,29" fill="#b85f12" />
      <polygon points="15,10 13,2 17,8" fill="#6e8f2e" />
      <polygon points="16,10 20,2.5 19,9" fill="#8cb03a" />
      <polygon points="17,10.5 25,5 21,11" fill="#6e8f2e" />
    </svg>
  );
}

/** Gota de agua facetada. */
export function WaterIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <polygon points="16,3 24,17 16,29 8,17" fill="#4aa3d8" />
      <polygon points="16,3 16,29 8,17" fill="#6cc0ee" />
      <polygon points="16,3 24,17 16,17" fill="#3a8fc4" />
      <polygon points="11,16 13,13 13.5,18 11.5,20" fill="#c8ecff" />
    </svg>
  );
}

/** Saco de fertilizante. */
export function FertilizerIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <polygon points="9,8 23,8 26,27 6,27" fill="#a07a4a" />
      <polygon points="9,8 16,8 16,27 6,27" fill="#b98e58" />
      <polygon points="10,4 22,4 23,8 9,8" fill="#7d5d36" />
      <polygon points="12,15 20,15 19,22 13,22" fill="#6e8f2e" />
      <polygon points="16,13 18.5,17 16,20 13.5,17" fill="#9bc24a" />
    </svg>
  );
}

/** Frasco de sustancia extraña (morada). */
export function WeirdIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <polygon points="13,3 19,3 19,10 26,26 6,26 13,10" fill="#d7d2e6" />
      <polygon points="10.5,17 21.5,17 26,26 6,26" fill="#9b4a8b" />
      <polygon points="10.5,17 16,17 16,26 6,26" fill="#c76bb5" />
      <circle cx="14" cy="21" r="1.4" fill="#f0c4e8" />
      <circle cx="19" cy="23" r="1" fill="#f0c4e8" />
      <rect x="12" y="2" width="8" height="2.4" rx="0.8" fill="#8a849c" />
    </svg>
  );
}

/** Calabaza de gajos con tallo y hoja. */
export function PumpkinIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <polygon points="16,9 25,10.5 29.5,18 25.5,26.5 16,28 6.5,26.5 2.5,18 7,10.5" fill="#f7bc4a" />
      <polygon points="16,9 7,10.5 2.5,18 6.5,26.5 16,28 11.5,18" fill="#ffd470" />
      <polygon points="16,9 25,10.5 29.5,18 25.5,26.5 16,28 20.5,18" fill="#d98c26" />
      <polygon points="11.5,18 16,9 20.5,18 16,28" fill="#f7bc4a" />
      <polygon points="15,9.5 17.2,9.5 18.6,4 16.2,3.4" fill="#6b7f2a" />
      <polygon points="17.5,6.5 24,3.8 21.6,8.6" fill="#6e8f2e" />
    </svg>
  );
}

/** Energía (Items.Power): rayo facetado. */
export function PowerIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <polygon points="19,2 6,18.5 14.5,18.5 11.5,30 26,12.5 17.5,12.5 22,2" fill="#f6c431" />
      <polygon points="19,2 6,18.5 14.5,18.5 17.5,12.5 22,2" fill="#ffdc5a" />
      <polygon points="14.5,18.5 11.5,30 26,12.5 20,16" fill="#d9a21e" />
    </svg>
  );
}

/** Cactus columnar con dos brazos en maceta. */
export function CactusIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <polygon points="19,15 24,15 24,9 27,8 27.5,18 19,18.5" fill="#23784a" />
      <polygon points="13,18.5 8,18.5 8,12 5,11 4.5,21.5 13,21.5" fill="#2f9a5c" />
      <polygon points="12.5,6 16,3.5 19.5,6 19.5,27 12.5,27" fill="#2f9a5c" />
      <polygon points="12.5,6 16,3.5 16,27 12.5,27" fill="#49b877" />
      <polygon points="9.5,26 22.5,26 21,30.5 11,30.5" fill="#c2693e" />
      <polygon points="9.5,26 16,26 16,30.5 11,30.5" fill="#d98457" />
    </svg>
  );
}

/** Monedas de oro apiladas. */
export function GoldIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <ellipse cx="14" cy="24" rx="10.5" ry="4.5" fill="#a87a1e" />
      <rect x="3.5" y="20" width="21" height="4" fill="#c99a2e" />
      <ellipse cx="14" cy="20" rx="10.5" ry="4.5" fill="#e9b949" />
      <ellipse cx="14" cy="20" rx="6.5" ry="2.6" fill="#f6d673" />
      <ellipse cx="19" cy="14" rx="10" ry="4.3" fill="#a87a1e" />
      <rect x="9" y="10" width="20" height="4" fill="#c99a2e" />
      <ellipse cx="19" cy="10" rx="10" ry="4.3" fill="#e9b949" />
      <ellipse cx="19" cy="10" rx="6" ry="2.4" fill="#f8dc7a" />
    </svg>
  );
}

/** Hueso (Items.Bone). */
export function BoneIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <g transform="rotate(-35 16 16)">
        <rect x="8.5" y="13.4" width="15" height="5.2" fill="#e8dcc0" />
        <rect x="8.5" y="13.4" width="15" height="2.4" fill="#f6efdf" />
        <circle cx="8" cy="12.8" r="3.4" fill="#f6efdf" />
        <circle cx="8" cy="19.2" r="3.4" fill="#ddd0b2" />
        <circle cx="24" cy="12.8" r="3.4" fill="#f6efdf" />
        <circle cx="24" cy="19.2" r="3.4" fill="#ddd0b2" />
      </g>
    </svg>
  );
}

/** Icono de un ítem: el sprite del atlas; mientras carga (o si falta), el dibujo vectorial. */
export function ItemIcon({ item, size = 28 }: { item: string; size?: number }) {
  const sprite = ITEM_SPRITE[item];
  const fallback = <VectorItemIcon item={item} size={size} />;
  return sprite ? <AtlasSprite name={sprite} size={size} fallback={fallback} /> : fallback;
}

function VectorItemIcon({ item, size }: { item: string; size: number }) {
  switch (item) {
    case 'Pumpkin':
      return <PumpkinIcon size={size} />;
    case 'Power':
      return <PowerIcon size={size} />;
    case 'Cactus':
      return <CactusIcon size={size} />;
    case 'Gold':
      return <GoldIcon size={size} />;
    case 'Bone':
      return <BoneIcon size={size} />;
    case 'Wood':
      return <WoodIcon size={size} />;
    case 'Carrot':
      return <CarrotIcon size={size} />;
    case 'Water':
      return <WaterIcon size={size} />;
    case 'Fertilizer':
      return <FertilizerIcon size={size} />;
    case 'Weird_Substance':
      return <WeirdIcon size={size} />;
    default:
      return <HayIcon size={size} />;
  }
}

/** Volver a la granja (cubo de tierra con pasto). */
export function FarmIcon(props: IconProps) {
  // Plataforma flotante isométrica con cables colgando (volver a la granja).
  return (
    <Svg {...props}>
      <polygon points="12,4 22,9 12,14 2,9" fill="currentColor" />
      <polygon points="2,9 12,14 12,17 2,12" fill="currentColor" opacity="0.72" />
      <polygon points="22,9 12,14 12,17 22,12" fill="currentColor" opacity="0.5" />
      <path d="M6 13.5c0 2.5 1 3.5 2 4.5M17.5 13.5c0 2-1 3.5-.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
    </Svg>
  );
}

/** Registros: trofeo remachado (logros y marcadores). */
export function TrophyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4h10v4.5a5 5 0 0 1-10 0z" fill="currentColor" />
      <path d="M7 6H4.2v1.4A3.2 3.2 0 0 0 7.4 10.6M17 6h2.8v1.4a3.2 3.2 0 0 1-3.2 3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 13.5v3.4M8.5 20h7M9.5 17h5v3h-5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="9.6" cy="6.4" r="0.8" fill="var(--color-win-body, #1e1916)" />
      <circle cx="14.4" cy="6.4" r="0.8" fill="var(--color-win-body, #1e1916)" />
    </Svg>
  );
}
