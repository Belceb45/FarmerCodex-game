import { useEffect, useRef } from 'react';
import { useState } from 'react';
import { EDITOR_THEMES, resetGame, SPEED_OPTIONS, useGameStore, type EditorTheme } from '../../store/useGameStore';

const THEME_LABELS: Record<EditorTheme, { short: string; title: string }> = {
  amber: { short: 'Ámbar', title: 'Terminal Industrial Ámbar' },
  dark: { short: 'Oscuro', title: 'Oscuro Clásico' },
  light: { short: 'Claro', title: 'Claro' },
};
import { useWindowStore } from '../../store/useWindowStore';
import type { RunState } from '../../worker/protocol';
import { formatInteger, formatSimTime } from '../format';
import { CloseIcon } from '../icons';
import { TitleButton } from '../windows/FloatingWindow';
import { stageControls } from './registry';

const RUN_LABELS: Record<RunState, string> = {
  idle: 'detenido',
  running: 'en ejecución',
  paused: 'en pausa',
  finished: 'finalizado',
  error: 'error',
};

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <span className="switch-knob" />
    </button>
  );
}

function Stats() {
  const runState = useGameStore((s) => s.runState);
  const simTime = useGameStore((s) => s.simTime);
  const tick = useGameStore((s) => s.tick);
  const fps = useGameStore((s) => s.fps);
  return (
    <dl className="settings-stats">
      <dt>estado</dt>
      <dd>{RUN_LABELS[runState]}</dd>
      <dt>tiempo simulado</dt>
      <dd>{formatSimTime(simTime)}</dd>
      <dt>ticks</dt>
      <dd>{formatInteger(tick)}</dd>
      <dt>fps</dt>
      <dd className={fps >= 55 ? 'text-[#a9d47a]' : 'text-[#f0b860]'}>{fps}</dd>
    </dl>
  );
}

/** Reiniciar la partida: borra los archivos, el progreso y la disposición guardados (pide confirmación). */
function ResetGame() {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <div className="settings-row">
        <span>
          Partida
          <small className="settings-hint">Se guarda sola en este navegador.</small>
        </span>
        <button type="button" className="ui-btn" onClick={() => setConfirming(true)}>
          Reiniciar…
        </button>
      </div>
    );
  }
  return (
    <div className="settings-confirm" role="alertdialog" aria-label="Reiniciar la partida">
      <p>Se borrarán tus scripts, el inventario, la granja y los desbloqueos.</p>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="ui-btn" onClick={() => setConfirming(false)}>
          Cancelar
        </button>
        <button type="button" className="ui-btn ui-btn-danger" onClick={() => void resetGame()}>
          Reiniciar partida
        </button>
      </div>
    </div>
  );
}

/** Ajustes (engranaje): tema del editor, destellos de línea, simulación, vista y estado. */
export function SettingsPanel() {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useGameStore((s) => s.editorTheme);
  const highlight = useGameStore((s) => s.highlightActiveLine);
  const speed = useGameStore((s) => s.speed);
  const volume = useGameStore((s) => s.volume);
  const consoleOpen = useWindowStore((s) => s.windows.some((w) => w.kind === 'console'));
  const game = useGameStore.getState();
  const close = () => useWindowStore.getState().setSettingsOpen(false);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (ref.current?.contains(target) || target.closest('[data-settings-toggle]')) return;
      useWindowStore.getState().setSettingsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useWindowStore.getState().setSettingsOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div ref={ref} className="settings-panel" role="dialog" aria-label="Ajustes">
      <div className="settings-head">
        <span>ajustes</span>
        <TitleButton tone="go" label="Cerrar los ajustes" onClick={close}>
          <CloseIcon size={12} />
        </TitleButton>
      </div>
      <div className="settings-body">
        <section>
          <h3 className="settings-group-title">Editor</h3>
          <div className="settings-row">
            <span>Tema</span>
            <div className="seg" role="group" aria-label="Tema del editor">
              {EDITOR_THEMES.map((t) => (
                <button key={t} type="button" aria-pressed={theme === t} title={THEME_LABELS[t].title} onClick={() => game.setEditorTheme(t)}>
                  {THEME_LABELS[t].short}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <span>
              Destello de línea activa
              <small className="settings-hint">Desactívalo para ahorrar CPU en ejecuciones rápidas.</small>
            </span>
            <Switch checked={highlight} onChange={game.setHighlightActiveLine} label="Destello de línea activa" />
          </div>
        </section>

        <section>
          <h3 className="settings-group-title">Simulación</h3>
          <label className="settings-row">
            <span>
              Tope de velocidad
              <small className="settings-hint">La velocidad máxima sube con la mejora Velocidad del árbol.</small>
            </span>
            <select className="ui-select" value={speed} onChange={(e) => game.setSpeed(Number(e.target.value))}>
              {SPEED_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v === 1 ? 'máximo' : `${v}×`}
                </option>
              ))}
            </select>
          </label>
          <ResetGame />
        </section>

        <section>
          <h3 className="settings-group-title">Sonido</h3>
          <label className="settings-row">
            <span>
              Volumen de efectos
              <small className="settings-hint">Se limita solo a altas velocidades para no saturar.</small>
            </span>
            <span className="inline-flex items-center gap-2">
              <input
                type="range"
                className="ui-range"
                min={0}
                max={100}
                step={5}
                value={Math.round(volume * 100)}
                aria-label="Volumen de efectos"
                onChange={(e) => game.setVolume(Number(e.target.value) / 100)}
              />
              <span className="settings-hint w-9 text-right">{volume === 0 ? 'mudo' : `${Math.round(volume * 100)}%`}</span>
            </span>
          </label>
        </section>

        <section>
          <h3 className="settings-group-title">Vista</h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-btn" onClick={() => stageControls.resetView?.()}>
              Centrar granja
            </button>
            <button type="button" className="ui-btn" onClick={() => useWindowStore.getState().resetLayout()}>
              Reordenar ventanas
            </button>
            <button
              type="button"
              className="ui-btn"
              onClick={() => {
                useWindowStore.getState().setSettingsOpen(false);
                if (!useWindowStore.getState().windows.some((w) => w.kind === 'records')) useWindowStore.getState().toggleRecords();
              }}
            >
              Logros y marcadores
            </button>
          </div>
          <div className="settings-row mt-1">
            <span>
              Consola de salida
              <small className="settings-hint">Muestra quick_print() y el historial de mensajes.</small>
            </span>
            <Switch checked={consoleOpen} onChange={() => useWindowStore.getState().toggleConsole()} label="Consola de salida" />
          </div>
          <p className="settings-hint mt-2">
            F1 o H oculta la interfaz · T árbol tecnológico · L logros y marcadores · Esc cierra (fuera del editor).
          </p>
        </section>

        <section>
          <h3 className="settings-group-title">Estado</h3>
          <Stats />
        </section>
      </div>
    </div>
  );
}
