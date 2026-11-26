import type { ReactNode } from 'react';
import { DOCS_WINDOW_ID, RECORDS_WINDOW_ID, useWindowStore } from '../../store/useWindowStore';
import { FarmIcon, GearIcon, InfoIcon, PlusIcon, TreeIcon, TrophyIcon } from '../icons';
import { createScriptWindow } from '../windows/actions';
import { SettingsPanel } from './SettingsPanel';

function SystemButton(props: {
  label: string;
  onClick?: () => void;
  pressed?: boolean;
  disabled?: boolean;
  toggle?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="sys-btn"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.pressed}
      aria-disabled={props.disabled || undefined}
      data-settings-toggle={props.toggle}
      onClick={props.disabled ? undefined : props.onClick}
    >
      {props.children}
    </button>
  );
}

/** Esquina superior derecha: nuevo archivo, documentación, registros, árbol tecnológico y ajustes. */
export function SystemButtons() {
  const docsOpen = useWindowStore((s) => s.windows.some((w) => w.id === DOCS_WINDOW_ID));
  const recordsOpen = useWindowStore((s) => s.windows.some((w) => w.id === RECORDS_WINDOW_ID));
  const settingsOpen = useWindowStore((s) => s.settingsOpen);
  const inTree = useWindowStore((s) => s.view === 'tree');
  const { toggleDocs, setSettingsOpen, toggleTree, toggleRecords } = useWindowStore.getState();
  return (
    <div className="hud-system">
      <div className="flex gap-[6px]">
        <SystemButton label="Nuevo archivo .py" onClick={createScriptWindow}>
          <PlusIcon size={20} />
        </SystemButton>
        <SystemButton label="Documentación de la API" pressed={docsOpen} onClick={toggleDocs}>
          <InfoIcon size={20} />
        </SystemButton>
        <SystemButton label="Logros y marcadores (L)" pressed={recordsOpen} onClick={toggleRecords}>
          <TrophyIcon size={20} />
        </SystemButton>
        <SystemButton label={inTree ? 'Volver a la granja (T)' : 'Árbol tecnológico (T)'} onClick={toggleTree}>
          {inTree ? <FarmIcon size={20} /> : <TreeIcon size={20} />}
        </SystemButton>
        <SystemButton label="Ajustes" pressed={settingsOpen} toggle="" onClick={() => setSettingsOpen(!settingsOpen)}>
          <GearIcon size={20} />
        </SystemButton>
      </div>
      {settingsOpen && <SettingsPanel />}
    </div>
  );
}
