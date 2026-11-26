import { useEffect, useRef, useState } from 'react';
import { isFileActive, useGameStore } from '../../store/useGameStore';
import { useWindowStore } from '../../store/useWindowStore';
import { CodeEditor } from '../CodeEditor';
import { CloseIcon, MinusIcon, PauseIcon, PlayIcon, RestoreIcon, StepIcon, StopIcon } from '../icons';
import { deleteScriptWindow, renameScript } from './actions';
import { FloatingWindow, TitleButton } from './FloatingWindow';
import { displayName } from './layout';

/** Controles de ejecución: verdes cuando el script está detenido, naranjas mientras corre. */
function RunControls({ file }: { file: string }) {
  const running = useGameStore((s) => s.entryFile === file && s.runState === 'running');
  const paused = useGameStore((s) => s.entryFile === file && s.runState === 'paused');
  const { run, step, pause, stop } = useGameStore.getState();
  if (running) {
    return (
      <>
        <TitleButton tone="run" label="Detener (Ctrl+Shift+Enter)" onClick={stop}>
          <StopIcon size={12} />
        </TitleButton>
        <TitleButton tone="run" label="Pausar (Ctrl+Enter)" onClick={pause}>
          <PauseIcon size={12} />
        </TitleButton>
      </>
    );
  }
  if (paused) {
    return (
      <>
        <TitleButton tone="run" label="Detener (Ctrl+Shift+Enter)" onClick={stop}>
          <StopIcon size={12} />
        </TitleButton>
        <TitleButton tone="go" label="Continuar (Ctrl+Enter)" onClick={() => run(file)}>
          <PlayIcon size={12} />
        </TitleButton>
        <TitleButton tone="go" label="Siguiente paso (F10)" onClick={() => step(file)}>
          <StepIcon size={12} />
        </TitleButton>
      </>
    );
  }
  return (
    <>
      <TitleButton tone="go" label="Ejecutar (Ctrl+Enter)" onClick={() => run(file)}>
        <PlayIcon size={12} />
      </TitleButton>
      <TitleButton tone="go" label="Paso a paso (F10)" onClick={() => step(file)}>
        <StepIcon size={12} />
      </TitleButton>
    </>
  );
}

/** Nombre del archivo en la barra de título; doble clic para renombrarlo. */
function FileTitle({ windowId, file }: { windowId: string; file: string }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);
  const lastTapRef = useRef(0);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEditing = () => {
    doneRef.current = false;
    setEditing(true);
  };

  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    const value = inputRef.current?.value ?? '';
    if (commit) {
      const problem = renameScript(windowId, value);
      if (problem) {
        setError(problem);
        inputRef.current?.focus();
        return;
      }
    }
    doneRef.current = true;
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    return (
      <span
        className="fw-file"
        title="Doble clic para renombrar"
        onDoubleClick={startEditing}
        onPointerDown={(e) => {
          // La barra de título captura el puntero para arrastrar: el doble toque se detecta aquí.
          const now = e.timeStamp;
          if (now - lastTapRef.current < 350) {
            e.stopPropagation();
            lastTapRef.current = 0;
            startEditing();
          } else {
            lastTapRef.current = now;
          }
        }}
      >
        {displayName(file)}
      </span>
    );
  }
  return (
    <span className="relative inline-flex" data-no-drag>
      <input
        ref={inputRef}
        defaultValue={displayName(file)}
        aria-label="Nuevo nombre del archivo"
        aria-invalid={error !== null}
        spellCheck={false}
        maxLength={32}
        className={`fw-rename ${error ? 'fw-rename-error' : ''}`}
        onChange={() => error && setError(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(true);
          else if (e.key === 'Escape') finish(false);
        }}
        onBlur={() => finish(!error)}
      />
      {error && (
        <span role="alert" className="fw-rename-msg">
          {error}
        </span>
      )}
    </span>
  );
}

function CloseConfirm({ file, onConfirm, onCancel }: { file: string; onConfirm: () => void; onCancel: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  return (
    <div
      role="alertdialog"
      aria-label={`Eliminar ${displayName(file)}`}
      className="fw-popover"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <p className="text-[13px] font-semibold text-white">¿Eliminar «{displayName(file)}»?</p>
      <p className="mt-0.5 text-[12px] text-[#c9cfd1]">Se cerrará la ventana y se perderá su código.</p>
      <div className="mt-2.5 flex justify-end gap-2">
        <button ref={cancelRef} type="button" className="ui-btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="ui-btn ui-btn-danger" onClick={onConfirm}>
          Eliminar
        </button>
      </div>
    </div>
  );
}

/** Error del último script de este archivo: aparece al pie de su ventana (no hay consola visible). */
function ErrorBar({ file }: { file: string }) {
  const message = useGameStore((s) => (s.errorFile === file ? s.errorMessage : null));
  const line = useGameStore((s) => (s.errorFile === file ? s.errorLine : null));
  if (!message) return null;
  return (
    <div className="fw-error" role="alert">
      <span className="fw-error-text">
        {line ? <b>línea {line} · </b> : null}
        {message}
      </span>
      <button
        type="button"
        className="fw-error-close"
        aria-label="Descartar el error"
        title="Descartar"
        onClick={() => useGameStore.getState().dismissError()}
      >
        <CloseIcon size={11} />
      </button>
    </div>
  );
}

/** Ventana flotante de un script `.py`. */
export function CodeWindow({ id }: { id: string }) {
  const win = useWindowStore((s) => s.windows.find((w) => w.id === id));
  const [confirming, setConfirming] = useState(false);
  const file = win?.file ?? null;
  const active = useGameStore((s) => file !== null && isFileActive(s, file));
  if (!win || file === null) return null;

  const requestClose = () => {
    const content = useGameStore.getState().files[file] ?? '';
    if (content.trim() === '') deleteScriptWindow(id);
    else setConfirming(true);
  };

  return (
    <FloatingWindow
      win={win}
      label={`Script ${displayName(file)}`}
      left={<RunControls file={file} />}
      title={
        <>
          <FileTitle windowId={id} file={file} />
          {active && <span className="fw-live" aria-label="en ejecución" />}
        </>
      }
      right={
        <>
          <TitleButton
            tone="go"
            label={win.minimized ? 'Restaurar' : 'Minimizar'}
            onClick={() => useWindowStore.getState().toggleMinimize(id)}
          >
            {win.minimized ? <RestoreIcon size={11} /> : <MinusIcon size={12} />}
          </TitleButton>
          <TitleButton tone="go" label="Cerrar y eliminar el archivo" onClick={requestClose}>
            <CloseIcon size={12} />
          </TitleButton>
        </>
      }
      overlay={
        confirming && (
          <CloseConfirm
            file={file}
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false);
              deleteScriptWindow(id);
            }}
          />
        )
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <CodeEditor file={file} windowId={id} />
        </div>
        <ErrorBar file={file} />
      </div>
    </FloatingWindow>
  );
}
