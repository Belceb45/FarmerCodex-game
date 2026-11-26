import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { DEFAULT_TECH_TREE, techLevel, type TechNode } from '../../engine/tech';
import { unlockTech, useGameStore } from '../../store/useGameStore';
import { useWindowStore } from '../../store/useWindowStore';
import { formatCompact } from '../format';
import { AtlasSprite } from '../AtlasSprite';
import { ItemIcon } from '../icons';

/** Separación entre nodos de la cuadrícula del árbol (px a zoom 1). */
const STEP_X = 150;
const STEP_Y = 132;
const CARD = 72;

type NodeState = 'done' | 'progress' | 'available' | 'locked';

function nodeState(node: TechNode, unlocks: Record<string, number>): NodeState {
  const level = techLevel(unlocks, node.id);
  if (level >= node.levels.length) return 'done';
  if (node.requires.some((r) => techLevel(unlocks, r) < 1)) return 'locked';
  return level > 0 ? 'progress' : 'available';
}

function canPay(cost: Record<string, number>, inventory: Record<string, number>): boolean {
  return Object.entries(cost).every(([item, amount]) => (inventory[item] ?? 0) >= amount);
}

/** Nodo del árbol → sprite del atlas (mismo arte que la granja). */
const TECH_SPRITES: Readonly<Record<string, string>> = {
  grass: 'grass_mature',
  expand: 'tile_soil',
  plant: 'bush_sprout',
  tree: 'tree_mid',
  carrot: 'carrot_mature',
  water: 'item_water',
  fertilizer: 'item_fertilizer',
  sunflower: 'sunflower_mature',
  pumpkin: 'pumpkin_mature',
  cactus: 'cactus_mature',
  dino: 'dino_head',
  maze: 'treasure_closed',
  polyculture: 'bush_mature',
  megafarm: 'drone_body',
  tophat: 'hat_Top_Hat',
};

/** Ícono del nodo: el sprite del atlas; si no carga, el dibujo vectorial. */
function TechIcon({ icon }: { icon: string }): ReactNode {
  const sprite = TECH_SPRITES[icon];
  const vector = <VectorTechIcon icon={icon} />;
  return sprite ? <AtlasSprite name={sprite} size={52} fallback={vector} /> : vector;
}

function VectorTechIcon({ icon }: { icon: string }): ReactNode {
  switch (icon) {
    case 'grass':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <polygon points="8,34 12,12 15,34" fill="#d8aa3c" />
          <polygon points="14,34 19,6 23,34" fill="#ecc45a" />
          <polygon points="22,34 28,13 30,34" fill="#a67b20" />
          <polygon points="27,34 33,18 34,34" fill="#d8aa3c" />
        </svg>
      );
    case 'speed':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <polygon points="6,8 18,20 6,32 12,32 24,20 12,8" fill="#ecc45a" />
          <polygon points="18,8 30,20 18,32 24,32 36,20 24,8" fill="#d8aa3c" />
        </svg>
      );
    case 'expand':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <rect x="13" y="13" width="14" height="14" fill="#7e8e28" />
          <polygon points="4,4 14,4 4,14" fill="#ecc45a" />
          <polygon points="36,4 26,4 36,14" fill="#ecc45a" />
          <polygon points="4,36 14,36 4,26" fill="#ecc45a" />
          <polygon points="36,36 26,36 36,26" fill="#ecc45a" />
        </svg>
      );
    case 'plant':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <polygon points="6,30 34,30 30,36 10,36" fill="#a6672b" />
          <rect x="19" y="14" width="2.6" height="17" fill="#6e8f2e" />
          <polygon points="20,18 8,12 12,22" fill="#8ca632" />
          <polygon points="21,15 33,8 30,19" fill="#a8c443" />
        </svg>
      );
    case 'tree':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <polygon points="17,24 23,24 22,37 18,37" fill="#4d2b12" />
          <polygon points="20,3 33,14 30,27 10,27 7,14" fill="#8ca632" />
          <polygon points="20,3 7,14 10,27 20,20" fill="#a8c443" />
          <polygon points="20,20 30,27 33,14" fill="#5b701c" />
        </svg>
      );
    case 'carrot':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <polygon points="14,14 27,16 16,37" fill="#e68526" />
          <polygon points="14,14 19,15 16,37" fill="#f29a3c" />
          <polygon points="18,13 15,3 21,10" fill="#6e8f2e" />
          <polygon points="20,13 26,3 24,12" fill="#8cb03a" />
        </svg>
      );
    case 'water':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <polygon points="20,4 30,21 20,36 10,21" fill="#4aa3d8" />
          <polygon points="20,4 20,36 10,21" fill="#6cc0ee" />
          <polygon points="14,20 16,16 16.5,23 14.5,25" fill="#c8ecff" />
        </svg>
      );
    case 'fertilizer':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <polygon points="11,10 29,10 33,35 7,35" fill="#a07a4a" />
          <polygon points="11,10 20,10 20,35 7,35" fill="#b98e58" />
          <polygon points="13,5 27,5 29,10 11,10" fill="#7d5d36" />
          <polygon points="20,17 24,22 20,27 16,22" fill="#9bc24a" />
        </svg>
      );
    case 'sunflower':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <rect x="19" y="20" width="2.6" height="17" fill="#5f8f2e" />
          <polygon points="20,29 9,24 13,32" fill="#77a83a" />
          <polygon points="20,3 23,10 30,6 27,13 35,15 28,18 32,24 25,22 23,29 20,23 17,29 15,22 8,24 12,18 5,15 13,13 10,6 17,10" fill="#f6c431" />
          <polygon points="20,3 23,10 20,15 17,10" fill="#ffdc5a" />
          <circle cx="20" cy="16" r="5.6" fill="#5a3416" />
          <circle cx="20" cy="16" r="2.8" fill="#7a4a22" />
        </svg>
      );
    case 'pumpkin':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <polygon points="20,12 31,14 36,23 31,33 20,35 9,33 4,23 9,14" fill="#f7bc4a" />
          <polygon points="20,12 9,14 4,23 9,33 20,35 14.5,23" fill="#ffd470" />
          <polygon points="20,12 31,14 36,23 31,33 20,35 25.5,23" fill="#d98c26" />
          <polygon points="18.6,12.5 21.4,12.5 23,6 20,5.2" fill="#6b7f2a" />
          <polygon points="22,8.5 30,5 27,11" fill="#6e8f2e" />
        </svg>
      );
    case 'cactus':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <polygon points="24,19 30,19 30,11 34,10 34.5,23 24,23.5" fill="#23784a" />
          <polygon points="16,23.5 10,23.5 10,15 6,14 5.5,27 16,27" fill="#2f9a5c" />
          <polygon points="15.5,7 20,4 24.5,7 24.5,36 15.5,36" fill="#2f9a5c" />
          <polygon points="15.5,7 20,4 20,36 15.5,36" fill="#49b877" />
          <circle cx="20" cy="4.4" r="2.2" fill="#f08fb0" />
        </svg>
      );
    case 'dino':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <polygon points="9,6 13,1 15,7 19,2 20,8 24,4 24,10" fill="#e5843a" />
          <polygon points="6,10 26,8 33,14 35,22 24,24 22,33 10,33 6,24" fill="#5f9e4a" />
          <polygon points="6,10 26,8 24,15 8,18" fill="#74b45c" />
          <polygon points="22,22 35,22 34,27 23,28" fill="#d9d48c" />
          <polygon points="26,22 28,25 30,22 32,25 34,22" fill="#f6f2e4" />
          <circle cx="23" cy="14" r="3" fill="#f6f2e4" />
          <circle cx="24" cy="14.4" r="1.5" fill="#1e1a14" />
        </svg>
      );
    case 'maze':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <rect x="4" y="4" width="32" height="32" fill="#7e8e28" />
          <path d="M4 4h32v32H4zM12 4v16M12 28v8M20 12v16h-8M28 4v8M28 20v16M20 12h8M4 20h4" stroke="#2e5220" strokeWidth="4" fill="none" />
          <path d="M4 4h32v32H4zM12 4v16M12 28v8M20 12v16h-8M28 4v8M28 20v16M20 12h8M4 20h4" stroke="#56873a" strokeWidth="2" fill="none" />
          <polygon points="23,22 27,22 28,26 22,26" fill="#e9b949" />
          <polygon points="23,22 27,22 26,20 24,20" fill="#f8dc7a" />
        </svg>
      );
    case 'leaderboard':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <path d="M12 7h16v8a8 8 0 0 1-16 0z" fill="#d8aa3c" />
          <path d="M12 10H7v2.5a5 5 0 0 0 5 5M28 10h5v2.5a5 5 0 0 1-5 5" stroke="#ecc45a" strokeWidth="2.4" fill="none" />
          <rect x="18" y="22" width="4" height="6" fill="#a67b20" />
          <rect x="13" y="28" width="14" height="5" rx="1" fill="#8c5327" />
          <circle cx="16" cy="11" r="1.2" fill="#5c4220" />
          <circle cx="24" cy="11" r="1.2" fill="#5c4220" />
        </svg>
      );
    case 'polyculture':
      return (
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <polygon points="4,34 36,34 34,38 6,38" fill="#a6672b" />
          <polygon points="9,34 7,22 12,16 17,22 15,34" fill="#7e992b" />
          <polygon points="12,16 7,22 9,34 12,28" fill="#a8c443" />
          <polygon points="26,22 32,24 27,36" fill="#e68526" />
          <polygon points="27,22 25,13 29,19" fill="#6e8f2e" />
          <polygon points="28,22 33,14 31,21" fill="#8cb03a" />
          <polygon points="20,8 23,5 26,8 20,14 14,8 17,5" fill="#e5536b" />
          <polygon points="20,8 17,5 14,8 20,14" fill="#f59ab0" />
        </svg>
      );
    default:
      return null;
  }
}

function Costs({ cost, inventory }: { cost: Record<string, number>; inventory: Record<string, number> }) {
  const entries = Object.entries(cost);
  if (entries.length === 0) return <span className="tt-free">gratis</span>;
  return (
    <ul className="tt-costs">
      {entries.map(([item, amount]) => {
        const ok = (inventory[item] ?? 0) >= amount;
        return (
          <li key={item} className={ok ? 'tt-ok' : 'tt-missing'}>
            <ItemIcon item={item} size={16} />
            {formatCompact(amount)}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Árbol tecnológico (doc 07 §3): ocupa toda la pantalla sobre el fondo gris azulado, con paneo y zoom.
 * Cada tarjeta muestra su nivel; el borde indica si está completa, mejorable o bloqueada.
 */
export function TechTreeView() {
  const unlocks = useGameStore((s) => s.unlocks);
  const inventory = useGameStore((s) => s.inventory);
  const [hover, setHover] = useState<{ node: TechNode; x: number; y: number } | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [pulse, setPulse] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const prevUnlocks = useRef(unlocks);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  const nodes = DEFAULT_TECH_TREE.nodes;
  const bounds = useMemo(() => {
    const xs = nodes.map((n) => n.pos[0] * STEP_X);
    const ys = nodes.map((n) => n.pos[1] * STEP_Y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }, [nodes]);

  // Centrar el árbol al abrir la vista.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    setView({ x: r.width / 2 - (bounds.x0 + bounds.x1) / 2, y: r.height / 2 - (bounds.y0 + bounds.y1) / 2 + 20, zoom: 1 });
  }, [bounds]);

  // Destello en la tarjeta recién desbloqueada.
  useEffect(() => {
    const prev = prevUnlocks.current;
    prevUnlocks.current = unlocks;
    const changed = Object.keys(unlocks).find((id) => (unlocks[id] ?? 0) > (prev[id] ?? 0));
    if (!changed) return;
    setPulse(changed);
    const t = setTimeout(() => setPulse(null), 700);
    return () => clearTimeout(t);
  }, [unlocks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useWindowStore.getState().toggleTree();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    const host = hostRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    setView((v) => {
      const zoom = Math.min(2.2, Math.max(0.45, v.zoom * Math.exp(-e.deltaY * 0.0015)));
      return { zoom, x: cx - (cx - v.x) * (zoom / v.zoom), y: cy - (cy - v.y) * (zoom / v.zoom) };
    });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const center = (n: TechNode) => ({ x: n.pos[0] * STEP_X, y: n.pos[1] * STEP_Y });

  return (
    <div
      ref={hostRef}
      className="tt-view"
      role="region"
      aria-label="Árbol tecnológico"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="tt-canvas" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg className="tt-links" aria-hidden="true">
          {nodes.flatMap((n) =>
            n.requires.map((req) => {
              const parent = nodes.find((p) => p.id === req);
              if (!parent) return null;
              const a = center(parent);
              const b = center(n);
              const midY = (a.y + CARD / 2 + b.y - CARD / 2) / 2;
              const lit = techLevel(unlocks, req) >= 1;
              return (
                <path
                  key={`${req}-${n.id}`}
                  d={`M ${a.x} ${a.y + CARD / 2} V ${midY} H ${b.x} V ${b.y - CARD / 2}`}
                  className={lit ? 'tt-link tt-link-lit' : 'tt-link'}
                />
              );
            }),
          )}
        </svg>
        {nodes.map((n) => {
          const state = nodeState(n, unlocks);
          const level = techLevel(unlocks, n.id);
          const next = n.levels[level];
          const affordable = next !== undefined && state !== 'locked' && canPay(next.cost, inventory);
          const c = center(n);
          return (
            <button
              key={n.id}
              type="button"
              className={`tt-node tt-${state} ${affordable ? 'tt-affordable' : ''} ${pulse === n.id ? 'tt-pulse' : ''}`}
              style={{ left: c.x - CARD / 2, top: c.y - CARD / 2 }}
              aria-label={`${n.name}, nivel ${level} de ${n.levels.length}`}
              aria-disabled={!affordable}
              onPointerEnter={(e) => setHover({ node: n, x: e.clientX, y: e.clientY })}
              onPointerMove={(e) => setHover({ node: n, x: e.clientX, y: e.clientY })}
              onPointerLeave={() => setHover(null)}
              onFocus={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setHover({ node: n, x: r.right, y: r.top });
              }}
              onBlur={() => setHover(null)}
              onClick={() => {
                if (affordable) unlockTech(n.id);
              }}
            >
              <TechIcon icon={n.icon} />
              <span className="tt-level">
                {level} / {n.levels.length}
              </span>
            </button>
          );
        })}
      </div>
      {hover && <TechTooltip node={hover.node} x={hover.x} y={hover.y} unlocks={unlocks} inventory={inventory} />}
      <p className="tt-hint">Arrastra para moverte · rueda para el zoom · clic en una tarjeta para desbloquearla · Esc vuelve a la granja</p>
    </div>
  );
}

function TechTooltip(props: {
  node: TechNode;
  x: number;
  y: number;
  unlocks: Record<string, number>;
  inventory: Record<string, number>;
}) {
  const { node, unlocks, inventory } = props;
  const level = techLevel(unlocks, node.id);
  const next = node.levels[level];
  const state = nodeState(node, unlocks);
  const missing = node.requires.filter((r) => techLevel(unlocks, r) < 1);
  const flipX = props.x + 300 > window.innerWidth;
  return (
    <div
      className="tt-tip"
      role="tooltip"
      style={{
        left: flipX ? undefined : props.x + 16,
        right: flipX ? window.innerWidth - props.x + 16 : undefined,
        top: Math.min(props.y + 12, window.innerHeight - 220),
      }}
    >
      <div className="tt-tip-head">
        <b>{node.name}</b>
        <span>
          nivel {level} / {node.levels.length}
        </span>
      </div>
      <p className="tt-tip-desc">{node.description}</p>
      {next ? (
        <>
          <div className="tt-tip-label">Siguiente nivel</div>
          <p className="tt-tip-effect">{next.effect}</p>
          <Costs cost={next.cost} inventory={inventory} />
          {state === 'locked' ? (
            <p className="tt-tip-note">Requiere: {missing.map((m) => DEFAULT_TECH_TREE.nodes.find((n) => n.id === m)?.name ?? m).join(', ')}</p>
          ) : canPay(next.cost, inventory) ? (
            <p className="tt-tip-note tt-ok">Clic para desbloquear</p>
          ) : (
            <p className="tt-tip-note tt-missing">Faltan recursos</p>
          )}
        </>
      ) : (
        <p className="tt-tip-note tt-max">Nivel máximo alcanzado</p>
      )}
    </div>
  );
}
