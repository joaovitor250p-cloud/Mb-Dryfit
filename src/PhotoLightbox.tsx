import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from 'lucide-react';

type Point = { x: number; y: number };
type GestureMode = 'swipe' | 'pan' | 'pinch' | 'none';
type Props = {
  src?: string;
  images?: string[];
  initialIndex?: number;
  title: string;
  detail?: string;
  onClose: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const pointDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pointMidpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export default function PhotoLightbox({ src, images, initialIndex = 0, title, detail, onClose }: Props) {
  const sources = useMemo(() => {
    const valid = (images || []).filter((item): item is string => typeof item === 'string' && item.length > 0);
    return valid.length ? valid : (src ? [src] : []);
  }, [images, src]);
  const [activeIndex, setActiveIndex] = useState(() => clamp(initialIndex, 0, Math.max(0, sources.length - 1)));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });

  // Pointer Events unify touchscreen fingers, pen, and mouse dragging.
  // Two simultaneous touch pointers perform a real pinch gesture.
  const pointers = useRef(new Map<number, Point>());
  const gestureMode = useRef<GestureMode>('none');
  const swipeStart = useRef<Point | null>(null);
  const panStart = useRef<{ point: Point; pan: Point } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number; center: Point; pan: Point } | null>(null);
  const zoomRef = useRef(zoom);
  const wheelSwipe = useRef(0);
  const wheelLocked = useRef(false);
  const wheelLockTimer = useRef<number | null>(null);
  zoomRef.current = zoom;

  const currentSrc = sources[activeIndex] || src || '';
  const hasMultiple = sources.length > 1;

  const applyZoom = (nextValue: number) => {
    const next = clamp(nextValue, 1, 5);
    zoomRef.current = next;
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 });
  };
  const resetZoom = () => {
    zoomRef.current = 1;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const zoomBy = (factor: number) => applyZoom(zoomRef.current * factor);
  const goTo = (index: number) => {
    const next = clamp(index, 0, Math.max(0, sources.length - 1));
    if (next === activeIndex) return;
    setActiveIndex(next);
    resetZoom();
    pointers.current.clear();
    gestureMode.current = 'none';
    swipeStart.current = null;
    panStart.current = null;
    pinchStart.current = null;
  };

  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && hasMultiple) goTo(activeIndex - 1);
      if (event.key === 'ArrowRight' && hasMultiple) goTo(activeIndex + 1);
      if (event.key === '+' || event.key === '=') zoomBy(1.2);
      if (event.key === '-') zoomBy(1 / 1.2);
      if (event.key === '0') resetZoom();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener('keydown', onKey);
      if (wheelLockTimer.current !== null) window.clearTimeout(wheelLockTimer.current);
    };
  }, [onClose, activeIndex, hasMultiple, sources.length]);

  useEffect(() => {
    setActiveIndex(clamp(initialIndex, 0, Math.max(0, sources.length - 1)));
    resetZoom();
    // A new photo set starts with a clean gesture state.
    pointers.current.clear();
    gestureMode.current = 'none';
  }, [initialIndex, sources.length]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!currentSrc || (event.target as HTMLElement).closest('button')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* browser may not support capture */ }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 1) {
      const point = { x: event.clientX, y: event.clientY };
      gestureMode.current = zoomRef.current > 1.02 ? 'pan' : 'swipe';
      swipeStart.current = gestureMode.current === 'swipe' ? point : null;
      panStart.current = { point, pan };
      pinchStart.current = null;
    } else if (pointers.current.size >= 2) {
      const points = Array.from(pointers.current.values());
      const [a, b] = points;
      gestureMode.current = 'pinch';
      swipeStart.current = null;
      panStart.current = null;
      pinchStart.current = { distance: Math.max(1, pointDistance(a, b)), zoom: zoomRef.current, center: pointMidpoint(a, b), pan };
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = Array.from(pointers.current.values());
      const start = pinchStart.current;
      const nextZoom = clamp(start.zoom * (pointDistance(a, b) / Math.max(1, start.distance)), 1, 5);
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      const center = pointMidpoint(a, b);
      if (nextZoom <= 1.02) setPan({ x: 0, y: 0 });
      else setPan({ x: start.pan.x + center.x - start.center.x, y: start.pan.y + center.y - start.center.y });
      gestureMode.current = 'pinch';
      return;
    }

    if (pointers.current.size === 1 && gestureMode.current === 'pan' && panStart.current && zoomRef.current > 1.02) {
      const start = panStart.current;
      setPan({ x: start.pan.x + event.clientX - start.point.x, y: start.pan.y + event.clientY - start.point.y });
    }
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const beforeCount = pointers.current.size;
    const start = swipeStart.current;
    if (!cancelled && beforeCount === 1 && gestureMode.current === 'swipe' && zoomRef.current <= 1.05 && start && hasMultiple) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.15) goTo(activeIndex + (dx < 0 ? 1 : -1));
    }

    pointers.current.delete(event.pointerId);
    if (cancelled) {
      pointers.current.clear();
      gestureMode.current = 'none';
      swipeStart.current = null;
      panStart.current = null;
      pinchStart.current = null;
      return;
    }

    if (pointers.current.size === 1 && beforeCount >= 2) {
      // After a pinch, the remaining finger may pan, but must not accidentally
      // trigger a photo swipe when it is lifted.
      const [remaining] = Array.from(pointers.current.values());
      gestureMode.current = zoomRef.current > 1.02 ? 'pan' : 'none';
      swipeStart.current = null;
      panStart.current = remaining ? { point: remaining, pan } : null;
      pinchStart.current = null;
    } else if (pointers.current.size === 0) {
      gestureMode.current = 'none';
      swipeStart.current = null;
      panStart.current = null;
      pinchStart.current = null;
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    // Precision touchpads report pinch-to-zoom as a Ctrl/Cmd + wheel event.
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      zoomBy(Math.exp(-event.deltaY * 0.008));
      return;
    }

    // Horizontal two-finger touchpad swipes move through the gallery.
    if (hasMultiple && Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.25 && Math.abs(event.deltaX) > 2) {
      event.preventDefault();
      event.stopPropagation();
      wheelSwipe.current += event.deltaX;
      if (Math.abs(wheelSwipe.current) >= 65 && !wheelLocked.current) {
        goTo(activeIndex + (wheelSwipe.current > 0 ? 1 : -1));
        wheelSwipe.current = 0;
        wheelLocked.current = true;
        wheelLockTimer.current = window.setTimeout(() => { wheelLocked.current = false; wheelSwipe.current = 0; }, 420);
      }
      return;
    }

    // Ordinary mouse wheel remains a convenient zoom control while the viewer is open.
    if (Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
      event.preventDefault();
      zoomBy(Math.exp(-event.deltaY * 0.0015));
    }
  };

  return <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`Visualizar fotos: ${title}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="photo-lightbox-top">
      <div>
        <strong>{title}</strong>
        <span>{detail ? `${detail} · ` : ''}{sources.length > 1 ? `Foto ${activeIndex + 1} de ${sources.length}` : 'Foto principal'}</span>
      </div>
      <button className="photo-lightbox-close" title="Fechar" aria-label="Fechar fotos" onClick={onClose}><X size={24} /></button>
    </div>

    <div
      className={`photo-lightbox-stage${zoom > 1.02 ? ' is-zoomed' : ''}`}
      aria-label="Deslize com um dedo para trocar de foto. Faça o movimento de pinça com dois dedos para ampliar ou reduzir."
      onDoubleClick={event => { if ((event.target as HTMLElement).closest('button')) return; zoomRef.current > 1.02 ? resetZoom() : applyZoom(2); }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={event => finishPointer(event)}
      onPointerCancel={event => finishPointer(event, true)}
      onLostPointerCapture={event => { if (pointers.current.has(event.pointerId)) finishPointer(event, true); }}
    >
      {currentSrc && <img src={currentSrc} alt={`${title} — foto ${activeIndex + 1}`} draggable={false} style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }} />}
      {hasMultiple && <>
        <button type="button" className="photo-lightbox-arrow photo-lightbox-prev" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0} aria-label="Foto anterior"><ChevronLeft size={30}/></button>
        <button type="button" className="photo-lightbox-arrow photo-lightbox-next" onClick={() => goTo(activeIndex + 1)} disabled={activeIndex === sources.length - 1} aria-label="Próxima foto"><ChevronRight size={30}/></button>
      </>}
    </div>

    <div className="photo-lightbox-toolbar" aria-label="Controles da imagem">
      {hasMultiple && <span className="photo-lightbox-counter">{activeIndex + 1} / {sources.length}</span>}
      <div className="photo-lightbox-zoom-controls">
        <button type="button" onClick={() => zoomBy(1 / 1.2)} disabled={zoom <= 1.01} aria-label="Diminuir zoom" title="Diminuir zoom"><Minus size={18}/></button>
        <button type="button" onClick={resetZoom} title="Ajustar à tela" aria-label="Ajustar à tela"><RotateCcw size={16}/><span>{Math.round(zoom * 100)}%</span></button>
        <button type="button" onClick={() => zoomBy(1.2)} disabled={zoom >= 4.99} aria-label="Aumentar zoom" title="Aumentar zoom"><Plus size={18}/></button>
      </div>
      {hasMultiple && <span className="photo-lightbox-swipe-hint">Deslize para ver as outras fotos</span>}
    </div>
    <div className="photo-lightbox-hint">Tela touch: pinça com dois dedos para zoom · Um dedo para trocar foto · Touchpad: pinça para zoom · Mouse: roda ou botões · Arraste para mover</div>
  </div>;
}
