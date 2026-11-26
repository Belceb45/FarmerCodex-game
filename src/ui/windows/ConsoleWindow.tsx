import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { consoleBuffer, type ConsoleEntry } from '../../store/consoleBuffer';
import { useGameStore } from '../../store/useGameStore';
import { CONSOLE_WINDOW_ID, useWindowStore } from '../../store/useWindowStore';
import { CloseIcon, ConsoleIcon, MinusIcon, RestoreIcon, TrashIcon } from '../icons';
import { FloatingWindow, TitleButton } from './FloatingWindow';

const ConsoleRow = memo(function ConsoleRow({ entry }: { entry: ConsoleEntry }) {
  return (
    <div className={`console-line console-${entry.kind}`} title={`tick ${entry.tick}`}>
      {entry.kind === 'log' && entry.droneId > 0 && <span className="console-drone">[dron {entry.droneId}]</span>}
      {entry.text}
    </div>
  );
});

function ConsoleLines() {
  const version = useGameStore((s) => s.consoleVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` señala cambios en el búfer externo
  const lines = useMemo(() => consoleBuffer.toArray(), [version]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      onScroll={(e) => {
        const el = e.currentTarget;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
      className="console-body"
    >
      {lines.map((entry) => (
        <ConsoleRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function LineCount() {
  useGameStore((s) => s.consoleVersion);
  return <span className="fw-meta">{consoleBuffer.size}/1000</span>;
}

/** Consola de salida (búfer circular de 1000 líneas): ventana opcional que se abre desde Ajustes. */
export function ConsoleWindow() {
  const win = useWindowStore((s) => s.windows.find((w) => w.id === CONSOLE_WINDOW_ID));
  if (!win) return null;
  return (
    <FloatingWindow
      win={win}
      label="Consola"
      title={
        <span className="inline-flex items-center gap-1.5">
          <ConsoleIcon size={13} />
          consola
        </span>
      }
      right={
        <>
          <LineCount />
          <TitleButton tone="go" label="Limpiar la consola" onClick={() => useGameStore.getState().clearConsole()}>
            <TrashIcon size={12} />
          </TitleButton>
          <TitleButton
            tone="go"
            label={win.minimized ? 'Restaurar' : 'Minimizar'}
            onClick={() => useWindowStore.getState().toggleMinimize(win.id)}
          >
            {win.minimized ? <RestoreIcon size={11} /> : <MinusIcon size={12} />}
          </TitleButton>
          <TitleButton tone="go" label="Cerrar la consola" onClick={() => useWindowStore.getState().toggleConsole()}>
            <CloseIcon size={12} />
          </TitleButton>
        </>
      }
    >
      <ConsoleLines />
    </FloatingWindow>
  );
}
