import { useEffect, useRef, useState } from 'react';
import { entityFromCode } from '../engine/types';
import { MEGA_MEMBER, TILE_FLAG_INFECTED, TILE_FLAG_UNSORTED } from '../worker/protocol';
import { FarmStage } from '../renderer/FarmStage';
import { IsoStage } from '../renderer/iso/IsoStage';
import type { FarmScene, HoverTile, StageCallbacks } from '../renderer/stageTypes';
import { liveSnapshot } from '../store/liveSnapshot';
import { useGameStore } from '../store/useGameStore';
import { useWindowStore } from '../store/useWindowStore';
import { hudTargets, stageControls } from './hud/registry';
import { computeFitInsets } from './windows/layout';

const GROUND_LABELS = ['Grassland', 'Soil'];

/** Busca la esquina de la megacalabaza a la que pertenece la casilla y devuelve su lado. */
function megaSideAt(mega: Uint8Array, width: number, x: number, y: number): number {
  for (let cy = y; cy >= 0; cy--) {
    for (let cx = x; cx >= 0; cx--) {
      const v = mega[cy * width + cx];
      if (v !== 0 && v !== MEGA_MEMBER && cx + v > x && cy + v > y) return v;
    }
  }
  return 0;
}

/** Tooltip compacto por casilla: coordenadas, suelo, entidad, crecimiento, agua, infección y metadatos. */
function TileTooltip({ hover }: { hover: HoverTile }) {
  useGameStore((s) => s.tick); // refresca el contenido con cada snapshot
  const snap = liveSnapshot.current;
  if (!snap || hover.x >= snap.width || hover.y >= snap.height) return null;
  const i = hover.y * snap.width + hover.x;
  const entity = entityFromCode(snap.tiles.entity[i]);
  const growth = Math.min(1, snap.tiles.growth[i]);
  const water = snap.tiles.water[i];
  const { flags, meta, mega, compEntity, compX, compY } = snap.tiles;
  const infected = (flags[i] & TILE_FLAG_INFECTED) !== 0;
  const megaSide = entity === 'Pumpkin' && mega[i] !== 0 ? megaSideAt(mega, snap.width, hover.x, hover.y) : 0;
  const companion = entityFromCode(compEntity[i]);
  const companionOk =
    companion !== null && compX[i] < snap.width && compY[i] < snap.height && entityFromCode(snap.tiles.entity[compY[i] * snap.width + compX[i]]) === companion;
  const flipX = hover.clientX + 230 > window.innerWidth;
  const flipY = hover.clientY + 230 > window.innerHeight;
  return (
    <div
      className="tile-tip"
      style={{
        left: flipX ? undefined : hover.clientX + 14,
        right: flipX ? window.innerWidth - hover.clientX + 14 : undefined,
        top: flipY ? undefined : hover.clientY + 14,
        bottom: flipY ? window.innerHeight - hover.clientY + 14 : undefined,
      }}
    >
      <div className="tile-tip-title">
        ({hover.x}, {hover.y})
      </div>
      <dl>
        <dt>suelo</dt>
        <dd>{GROUND_LABELS[snap.tiles.ground[i]] ?? '?'}</dd>
        <dt>entidad</dt>
        <dd>{entity ?? '—'}</dd>
        {entity && (
          <>
            <dt>crecimiento</dt>
            <dd className="flex items-center gap-1.5">
              <span className="tile-tip-bar">
                <span className={growth >= 1 ? 'bg-[#f0c862]' : 'bg-[#8fb04a]'} style={{ width: `${growth * 100}%` }} />
              </span>
              {growth >= 1 ? 'madura' : `${Math.floor(growth * 100)}%`}
            </dd>
          </>
        )}
        {entity === 'Sunflower' && (
          <>
            <dt>pétalos</dt>
            <dd>{meta[i]}</dd>
          </>
        )}
        {entity === 'Cactus' && (
          <>
            <dt>tamaño</dt>
            <dd>
              {meta[i]} · {flags[i] & TILE_FLAG_UNSORTED ? <span className="text-[#e0a16a]">mal ordenado</span> : 'ordenado'}
            </dd>
          </>
        )}
        {megaSide >= 2 && (
          <>
            <dt>megacalabaza</dt>
            <dd>
              {megaSide}×{megaSide}
            </dd>
          </>
        )}
        {companion && (
          <>
            <dt>compañero</dt>
            <dd>
              {companion} ({compX[i]}, {compY[i]}) {companionOk ? '✓' : ''}
            </dd>
          </>
        )}
        <dt>agua</dt>
        <dd>{Math.round(water * 100)}%</dd>
        <dt>infectada</dt>
        <dd>{infected ? 'sí' : 'no'}</dd>
      </dl>
    </div>
  );
}

/** La granja ocupa todo el fondo; las ventanas y el HUD flotan encima. */
export function FarmBackground() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverTile | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const callbacks: StageCallbacks = {
      onHoverTile: setHover,
      onFps: (fps) => useGameStore.getState().setFps(fps),
      getItemTarget: (item) => {
        const target = hudTargets.get(item);
        if (!target || !useWindowStore.getState().hudVisible) return null;
        const r = target.getBoundingClientRect();
        const c = host.getBoundingClientRect();
        return { x: r.left - c.left + r.width / 2, y: r.top - c.top + 14 };
      },
      onItemArrived: (item) => {
        // Pulso del contador al llegar el recurso (doc 07: 1.0 → 1.18 → 1.0).
        const target = hudTargets.get(item);
        target?.classList.remove('hud-arrive');
        void target?.offsetWidth;
        target?.classList.add('hud-arrive');
      },
      getFitInsets: () => {
        const { windows, viewport, hudVisible } = useWindowStore.getState();
        if (!hudVisible) return { left: 0, right: 0, top: 0, bottom: 0 };
        return computeFitInsets(
          windows.filter((w) => !w.minimized),
          viewport,
        );
      },
    };
    let disposed = false;
    // Arte final con sprites del atlas (docs 05/06); si el atlas no carga, el proyector low-poly de respaldo.
    const iso = new IsoStage(host, callbacks);
    let scene: FarmScene = iso;
    iso.init().catch((err: unknown) => {
      console.warn('Atlas de sprites no disponible: se usa el renderizador low-poly de respaldo.', err);
      iso.destroy();
      if (disposed) return;
      const fallback = new FarmStage(host, callbacks);
      scene = fallback;
      void fallback.init();
    });
    stageControls.resetView = () => scene.resetView();
    const unsubscribe = useWindowStore.subscribe((next, prev) => {
      if (next.hudVisible !== prev.hudVisible) {
        setHover(null);
        scene.refit();
      }
      if (next.view !== prev.view) {
        setHover(null);
        scene.setPaused(next.view === 'tree');
      }
    });
    return () => {
      disposed = true;
      unsubscribe();
      scene.destroy();
      stageControls.resetView = null;
    };
  }, []);

  return (
    <>
      <div ref={hostRef} className="absolute inset-0" />
      {hover && <TileTooltip hover={hover} />}
    </>
  );
}
