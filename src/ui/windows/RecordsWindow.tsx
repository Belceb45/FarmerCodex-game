import { useMemo, useState } from 'react';
import { achievementProgress, ACHIEVEMENT_DEFS, createStats } from '../../engine/achievements';
import { LEADERBOARD_DEFS } from '../../engine/leaderboards';
import { DEFAULT_TECH_TREE } from '../../engine/tech';
import { formatTicks } from '../../store/records';
import { useGameStore } from '../../store/useGameStore';
import { activeCodeFile, RECORDS_WINDOW_ID, useWindowStore } from '../../store/useWindowStore';
import { AtlasSprite, ITEM_SPRITE } from '../AtlasSprite';
import { CloseIcon, MinusIcon, PlayIcon, RestoreIcon, TrophyIcon } from '../icons';
import { FloatingWindow, TitleButton } from './FloatingWindow';

type Tab = 'achievements' | 'boards';

/** Velocidades del intento (ritmo de tiempo real: los ticks simulados medidos no cambian). */
const SPEEDUPS = [1, 4, 16, 64, 256] as const;

function ProgressBar({ value, target }: { value: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <span className="records-progress" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(value, target)}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(0)}k`;
  return String(Math.floor(n));
}

function AchievementsTab() {
  const achieved = useGameStore((s) => s.achievements);
  const stats = useGameStore((s) => s.stats);
  const unlocks = useGameStore((s) => s.unlocks);
  const done = useMemo(() => new Set(achieved), [achieved]);
  const current = stats ?? createStats();
  return (
    <>
      <p className="records-summary">
        <b>{done.size}</b> de {ACHIEVEMENT_DEFS.length} logros · el progreso se actualiza con cada guardado
      </p>
      <ul className="records-list">
        {ACHIEVEMENT_DEFS.map((def) => {
          const ok = done.has(def.id);
          const progress = achievementProgress(def, current, DEFAULT_TECH_TREE, unlocks);
          const hat = def.reward?.hat;
          return (
            <li key={def.id} className="records-card" data-done={ok || undefined}>
              <span className="records-check" aria-label={ok ? 'Conseguido' : 'Pendiente'}>
                {ok ? '★' : '☆'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="records-name">{def.name}</span>
                  {progress && !ok && (
                    <span className="records-count">
                      {compact(progress.value)} / {compact(progress.target)}
                    </span>
                  )}
                </div>
                <p className="records-desc">{def.description}</p>
                {progress && !ok && <ProgressBar value={progress.value} target={progress.target} />}
              </div>
              {hat && (
                <span className="records-reward" title={`Recompensa: Hats.${hat}`}>
                  <AtlasSprite name={`hat_${hat}`} size={26} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function BoardsTab() {
  const files = useGameStore((s) => s.files);
  const records = useGameStore((s) => s.records);
  const unlocked = useGameStore((s) => (s.unlocks.Leaderboard ?? 0) > 0);
  const running = useGameStore((s) => s.leaderboard);
  const startLeaderboard = useGameStore((s) => s.startLeaderboard);
  const names = Object.keys(files).sort();
  const [file, setFile] = useState(() => activeCodeFile() ?? names[0] ?? 'main.py');
  const [speedup, setSpeedup] = useState<number>(16);
  const selected = names.includes(file) ? file : (names[0] ?? '');
  return (
    <>
      {!unlocked && (
        <p className="records-note">
          Desbloquea <b>Marcadores</b> en el árbol tecnológico para hacer intentos cronometrados (también con{' '}
          <code>leaderboard_run()</code>).
        </p>
      )}
      <div className="records-controls">
        <label>
          archivo
          <select className="ui-select" value={selected} onChange={(e) => setFile(e.target.value)}>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          ritmo
          <select className="ui-select" value={speedup} onChange={(e) => setSpeedup(Number(e.target.value))}>
            {SPEEDUPS.map((s) => (
              <option key={s} value={s}>
                ×{s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="records-summary">Se mide en ticks simulados: el ritmo solo cambia lo que tardas en verlo.</p>
      <ul className="records-list">
        {LEADERBOARD_DEFS.map((board) => {
          const best = records[board.id];
          const isRunning = running?.boardId === board.id;
          const canRun = unlocked && !running && board.special !== 'reset' && selected !== '';
          return (
            <li key={board.id} className="records-card" data-running={isRunning || undefined}>
              <span className="records-goal" aria-hidden="true">
                {board.goal ? <AtlasSprite name={ITEM_SPRITE[board.goal.item] ?? ''} size={26} /> : <AtlasSprite name="hat_Top_Hat" size={26} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="records-name">{board.name}</span>
                  <span className="records-count">{board.goal ? `${compact(board.goal.amount)} ${board.goal.item}` : 'Top_Hat'}</span>
                </div>
                <p className="records-desc">
                  {board.description}
                  {board.size && ` · ${board.size[0]}×${board.size[1]}`}
                </p>
                <p className="records-best">
                  {best ? (
                    <>
                      🏆 {formatTicks(best.bestTicks)}
                      {best.file ? ` · ${best.file}` : ''}
                      {best.runs ? ` · ${best.runs} intento${best.runs === 1 ? '' : 's'}` : ''}
                    </>
                  ) : (
                    'sin marca'
                  )}
                </p>
                {isRunning && running && <ProgressBar value={running.progress} target={running.goalAmount} />}
              </div>
              {board.special !== 'reset' && (
                <button
                  type="button"
                  className="records-run"
                  disabled={!canRun}
                  aria-label={`Intento cronometrado de ${board.name} con ${selected}`}
                  title={canRun ? `Ejecutar ${selected} en «${board.name}»` : undefined}
                  onClick={() => startLeaderboard(board.id, selected, speedup)}
                >
                  <PlayIcon size={12} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Logros (59) y marcadores locales (16) como ventana flotante (atajo L o botón del trofeo). */
export function RecordsWindow() {
  const win = useWindowStore((s) => s.windows.find((w) => w.id === RECORDS_WINDOW_ID));
  const [tab, setTab] = useState<Tab>('achievements');
  if (!win) return null;
  return (
    <FloatingWindow
      win={win}
      label="Registros"
      title={
        <span className="inline-flex items-center gap-1.5">
          <TrophyIcon size={13} />
          registros
        </span>
      }
      right={
        <>
          <TitleButton
            tone="go"
            label={win.minimized ? 'Restaurar' : 'Minimizar'}
            onClick={() => useWindowStore.getState().toggleMinimize(win.id)}
          >
            {win.minimized ? <RestoreIcon size={11} /> : <MinusIcon size={12} />}
          </TitleButton>
          <TitleButton tone="go" label="Cerrar los registros" onClick={() => useWindowStore.getState().toggleRecords()}>
            <CloseIcon size={12} />
          </TitleButton>
        </>
      }
    >
      <div className="records-body">
        <div className="records-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'achievements'} onClick={() => setTab('achievements')}>
            Logros
          </button>
          <button type="button" role="tab" aria-selected={tab === 'boards'} onClick={() => setTab('boards')}>
            Marcadores
          </button>
        </div>
        <div className="records-scroll">{tab === 'achievements' ? <AchievementsTab /> : <BoardsTab />}</div>
      </div>
    </FloatingWindow>
  );
}
