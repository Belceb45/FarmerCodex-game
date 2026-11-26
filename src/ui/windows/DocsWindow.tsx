import { DOCS_WINDOW_ID, useWindowStore } from '../../store/useWindowStore';
import { API_ENTRIES, ENUM_DOCS, LANGUAGE_NOTES, type ApiCategory } from '../apiDocs';
import { CloseIcon, InfoIcon, MinusIcon, RestoreIcon } from '../icons';
import { FloatingWindow, TitleButton } from './FloatingWindow';

const CATEGORY_LABELS: Record<ApiCategory, string> = {
  acciones: 'Acciones físicas',
  drones: 'Megagranja (varios drones)',
  sensores: 'Sensores',
  salida: 'Salida',
  cosmeticos: 'Cosméticos',
  simulacion: 'Simulación y marcadores',
  utilidades: 'Utilidades',
};

const SHORTCUTS: readonly [string, string][] = [
  ['Ctrl+Enter', 'ejecutar · pausar · continuar el script de la ventana activa'],
  ['F10', 'paso a paso'],
  ['Ctrl+Shift+Enter', 'detener'],
  ['F1 · H', 'ocultar o mostrar la interfaz (H fuera del editor)'],
  ['T', 'árbol tecnológico (fuera del editor)'],
  ['L', 'logros y marcadores (fuera del editor)'],
  ['Esc', 'cerrar ajustes, árbol o la ventana auxiliar de arriba'],
  ['Rueda · arrastrar', 'zoom; arrastrar mueve solo la granja (el dron y el perro vuelan por su cuenta y también se pueden agarrar); doble clic recentra'],
  ['Doble clic en el nombre', 'renombrar el archivo de una ventana'],
];

/** Manual interno de la API como ventana flotante (botón «i»). */
export function DocsWindow() {
  const win = useWindowStore((s) => s.windows.find((w) => w.id === DOCS_WINDOW_ID));
  if (!win) return null;
  const categories = Object.keys(CATEGORY_LABELS) as ApiCategory[];
  return (
    <FloatingWindow
      win={win}
      label="Documentación"
      title={
        <span className="inline-flex items-center gap-1.5">
          <InfoIcon size={13} />
          documentación
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
          <TitleButton tone="go" label="Cerrar la documentación" onClick={() => useWindowStore.getState().toggleDocs()}>
            <CloseIcon size={12} />
          </TitleButton>
        </>
      }
    >
      <div className="docs-body">
        <ul className="docs-notes">
          {LANGUAGE_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        {categories.map((category) => (
          <section key={category}>
            <h3 className="docs-heading">{CATEGORY_LABELS[category]}</h3>
            <div className="space-y-1.5">
              {API_ENTRIES.filter((e) => e.category === category).map((entry) => (
                <div key={entry.name} className="docs-card">
                  <div className="flex items-baseline justify-between gap-3">
                    <code className="docs-sig">{entry.signature}</code>
                    <span className="docs-cost">{entry.cost}</span>
                  </div>
                  <p className="docs-desc">{entry.description}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
        <section>
          <h3 className="docs-heading">Enumeraciones</h3>
          <div className="space-y-1.5">
            {Object.entries(ENUM_DOCS).map(([name, doc]) => (
              <div key={name} className="docs-card">
                <code className="docs-enum">{name}</code>
                <span className="docs-desc ml-2">{doc.description}</span>
                <div className="docs-members">{doc.members.join(' · ')}</div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 className="docs-heading">Atajos</h3>
          <dl className="docs-shortcuts">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys}>
                <dt>{keys}</dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </FloatingWindow>
  );
}
