import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useWindowStore, type WindowState } from '../../store/useWindowStore';
import { moveRect, resizeRect, TITLE_BAR_HEIGHT, type Rect, type ResizeDir } from './layout';

const HANDLES: readonly ResizeDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export type TitleButtonTone = 'go' | 'run';

/** Botón cuadrado de la barra de título: verde (acciones) o naranja (script en marcha). */
export function TitleButton(props: {
  tone: TitleButtonTone;
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className={`tb tb-${props.tone}`}
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.pressed}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

interface FloatingWindowProps {
  win: WindowState;
  label: string;
  /** Controles a la izquierda de la barra (▶ ▷ / ■ ‖). */
  left?: ReactNode;
  title: ReactNode;
  /** Controles a la derecha (minimizar, cerrar…). */
  right?: ReactNode;
  children: ReactNode;
  /** Elementos anclados a la ventana fuera del cuerpo (p. ej. una confirmación). */
  overlay?: ReactNode;
}

/**
 * Ventana flotante del escritorio: se arrastra por la barra de título, se redimensiona por
 * bordes y esquinas y pasa al frente al tocarla. Durante el gesto se mueve el DOM directamente
 * y la geometría se guarda en el store al soltar.
 */
export function FloatingWindow({ win, label, left, title, right, children, overlay }: FloatingWindowProps) {
  const frameRef = useRef<HTMLElement>(null);

  const track = (e: ReactPointerEvent<HTMLElement>, apply: (dx: number, dy: number) => Rect, gestureClass: string) => {
    const el = frameRef.current;
    if (!el) return;
    e.preventDefault();
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    const sx = e.clientX;
    const sy = e.clientY;
    target.setPointerCapture(pointerId);
    document.documentElement.classList.add(gestureClass);
    let last: Rect | null = null;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      last = apply(ev.clientX - sx, ev.clientY - sy);
      el.style.left = `${last.x}px`;
      el.style.top = `${last.y}px`;
      el.style.width = `${last.w}px`;
      if (!win.minimized) el.style.height = `${last.h}px`;
    };
    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onEnd);
      target.removeEventListener('pointercancel', onEnd);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      document.documentElement.classList.remove(gestureClass);
      if (last) useWindowStore.getState().setRect(win.id, last);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onEnd);
    target.addEventListener('pointercancel', onEnd);
  };

  const startMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, [data-no-drag]')) return;
    const start: Rect = { x: win.x, y: win.y, w: win.w, h: win.h };
    const vp = useWindowStore.getState().viewport;
    track(e, (dx, dy) => moveRect(start, dx, dy, win.kind, vp, win.minimized), 'fw-moving');
  };

  const startResize = (dir: ResizeDir) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const start: Rect = { x: win.x, y: win.y, w: win.w, h: win.h };
    const vp = useWindowStore.getState().viewport;
    track(e, (dx, dy) => resizeRect(start, dir, dx, dy, win.kind, vp), `fw-resizing-${dir}`);
  };

  const focus = () => useWindowStore.getState().focus(win.id);

  return (
    <section
      ref={frameRef}
      aria-label={label}
      className="fw pointer-events-auto"
      data-minimized={win.minimized ? '' : undefined}
      style={{
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.minimized ? TITLE_BAR_HEIGHT : win.h,
        zIndex: win.z,
      }}
      onPointerDownCapture={focus}
      onFocusCapture={focus}
    >
      <header className="fw-title" onPointerDown={startMove}>
        {left && <div className="flex shrink-0 items-center gap-1">{left}</div>}
        <div className="fw-title-text">{title}</div>
        {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
      </header>
      <div className="fw-body" hidden={win.minimized}>
        {children}
      </div>
      {overlay}
      {!win.minimized &&
        HANDLES.map((dir) => <div key={dir} className={`fw-handle fw-handle-${dir}`} onPointerDown={startResize(dir)} />)}
    </section>
  );
}
