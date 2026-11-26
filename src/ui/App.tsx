import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { findAchievement } from '../engine/achievements';
import { findLeaderboard } from '../engine/leaderboards';
import { formatTicks } from '../store/records';
import { bootGame, useGameStore } from '../store/useGameStore';
import { activeCodeFile, useWindowStore } from '../store/useWindowStore';
import { FarmBackground } from './FarmBackground';
import { InventoryBar } from './hud/InventoryBar';
import { SystemButtons } from './hud/SystemButtons';
import { TechTreeView } from './tech/TechTreeView';
import { CodeWindow } from './windows/CodeWindow';
import { ConsoleWindow } from './windows/ConsoleWindow';
import { DocsWindow } from './windows/DocsWindow';
import { RecordsWindow } from './windows/RecordsWindow';
import { SymbolBar } from './SymbolBar';

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest?.('.cm-editor, input, textarea, select, [contenteditable="true"]'));
}

/** Atajos globales (también con el foco dentro del editor, salvo H). */
function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const game = useGameStore.getState();
      const isHudKey = e.key === 'F1' || ((e.key === 'h' || e.key === 'H') && !mod && !e.altKey && !isEditable(e.target));
      if (isHudKey) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) useWindowStore.getState().toggleHud();
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          game.stop();
          return;
        }
        const file = activeCodeFile();
        if (file) game.togglePause(file);
        return;
      }
      if (e.key === 'F10') {
        e.preventDefault();
        e.stopPropagation();
        const file = activeCodeFile();
        if (file) game.step(file);
        return;
      }
      // Atajos de una tecla fuera del editor: T árbol, L registros, Esc cierra lo de arriba.
      if (mod || e.altKey || isEditable(e.target)) return;
      const windows = useWindowStore.getState();
      if (e.key === 'Escape') {
        if (windows.closeTop()) e.preventDefault();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        if (!e.repeat) windows.toggleTree();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        if (!e.repeat) windows.toggleRecords();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}

/** Aviso breve al ocultar la interfaz con Toggle HUD. */
function HudToast() {
  const hudVisible = useWindowStore((s) => s.hudVisible);
  const [shown, setShown] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (hudVisible) {
      setShown(0);
      return;
    }
    setShown((n) => n + 1);
    const timer = setTimeout(() => setShown(0), 2600);
    return () => clearTimeout(timer);
  }, [hudVisible]);
  if (!shown) return null;
  return (
    <div key={shown} className="hud-toast" role="status">
      Interfaz oculta · pulsa F1 o H para mostrarla
    </div>
  );
}

/** Aviso al conseguir un logro (por ejemplo Mud Farm). */
function AchievementToast() {
  const achievement = useGameStore((s) => s.achievement);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!achievement) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [achievement]);
  if (!achievement || !visible) return null;
  return (
    <div key={achievement.at} className="hud-toast hud-achievement" role="status">
      ★ Logro desbloqueado: <b>{findAchievement(achievement.id)?.name ?? achievement.id}</b>
    </div>
  );
}

/** Aviso al terminar un intento de marcador (o al registrar Fastest_Reset). */
function RecordToast() {
  const result = useGameStore((s) => s.lastResult);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!result) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [result]);
  if (!result || !visible) return null;
  const name = findLeaderboard(result.boardId)?.name ?? result.boardId;
  return (
    <div key={result.at} className={`hud-toast hud-achievement hud-record${result.success ? '' : ' hud-record-fail'}`} role="status">
      {result.success ? (
        <>
          🏁 <b>{name}</b>: {formatTicks(result.ticks)}
          {result.improved ? ' · ¡nueva marca!' : result.previous !== null ? ` · marca: ${formatTicks(result.previous)}` : ''}
        </>
      ) : (
        <>
          ✖ <b>{name}</b>: {result.reason ?? 'intento no completado'}
        </>
      )}
    </div>
  );
}

/** Banda inferior durante un intento de marcador: progreso de la meta y botón para detenerlo. */
function LeaderboardBanner() {
  const run = useGameStore((s) => s.leaderboard);
  const tick = useGameStore((s) => s.tick);
  if (!run) return null;
  const pct = run.goalAmount > 0 ? Math.min(100, (run.progress / run.goalAmount) * 100) : 0;
  return (
    <div className="leaderboard-banner" role="status" aria-label={`Intento de marcador ${run.name}`}>
      <span>
        ⏱ <b>{run.name}</b> · {run.file}
      </span>
      <span className="records-progress" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="leaderboard-banner-meta">
        {Math.floor(run.progress)}/{run.goalAmount} {run.goalItem} · {formatTicks(tick)}
      </span>
      <button type="button" onClick={() => useGameStore.getState().stop()}>
        Detener
      </button>
    </div>
  );
}

/** simulate() en curso: la granja que se ve es la simulada; tu partida espera congelada. */
function SimulationBanner() {
  const sim = useGameStore((s) => s.simulation);
  if (!sim) return null;
  return (
    <div className="leaderboard-banner simulation-banner" role="status" aria-label={`Simulación de ${sim.file}`}>
      <span>
        🧪 <b>Simulación</b> · {sim.file}
      </span>
      <span className="leaderboard-banner-meta">
        semilla {sim.seed} · ×{sim.speedup} · {sim.simTime.toFixed(2)} s simulados
      </span>
      <button type="button" onClick={() => useGameStore.getState().stop()}>
        Detener
      </button>
    </div>
  );
}

export function App() {
  const hudVisible = useWindowStore((s) => s.hudVisible);
  const initialized = useWindowStore((s) => s.initialized);
  const inTree = useWindowStore((s) => s.view === 'tree');
  const codeIds = useWindowStore(useShallow((s) => s.windows.filter((w) => w.kind === 'code').map((w) => w.id)));
  const theme = useGameStore((s) => s.editorTheme);

  useLayoutEffect(() => {
    const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
    void bootGame(viewport());
    const onResize = () => useWindowStore.getState().setViewport(viewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useGlobalShortcuts();

  return (
    <div className="desk" data-editor-theme={theme}>
      <FarmBackground />
      {inTree && <TechTreeView />}
      {hudVisible && <InventoryBar />}
      {initialized && (
        <div className="window-layer" hidden={!hudVisible || inTree}>
          {codeIds.map((id) => (
            <CodeWindow key={id} id={id} />
          ))}
          <ConsoleWindow />
          <DocsWindow />
          <RecordsWindow />
        </div>
      )}
      {hudVisible && <SystemButtons />}
      {hudVisible && <LeaderboardBanner />}
      {hudVisible && <SimulationBanner />}
      <HudToast />
      <AchievementToast />
      <RecordToast />
      <SymbolBar />
    </div>
  );
}
