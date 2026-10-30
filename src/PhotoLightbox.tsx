import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from 'lucide-react';

type Point = { x: number; y: number };
type Props = {
  src?: string;
  images?: string[];
  initialIndex?: number;
  title: string;
  detail?: string;
  onClose: () => void;
};

export default function PhotoLightbox({ src, images, initialIndex = 0, title, detail, onClose }: Props) {
  const sources = useMemo(() => {
    const valid = (images || []).filter((item): item is string => typeof item === 'string' && item.length > 0);
    return valid.length ? valid : (src ? [src] : []);
  }, [images, src]);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, Math.min(initialIndex, Math.max(0, sources.length - 1))));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  const pointerStart = useRef<Point | null>(null);
  const dragStart = useRef<{ point: Point; pan: Point } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number; center: Point; pan: Point } | null>(null);
  const currentSrc = sources[activeIndex] || src || '';
  const hasMultiple = sources.length > 1;

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const goTo = (index: number) => {
    const next = Math.max(0, Math.min(sources.length - 1, index));
    if (next === activeIndex) return;
    setActiveIndex(next);
    resetZoom();
  };

  const zoomBy = (factor: number) => {
    const next = Math.max(1, Math.min(5, zoom * factor));
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 });
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
    };
  }, [onClose, activeIndex, hasMultiple, sources.length, zoom]);

  useEffect(() => {
    setActiveIndex(Math.max(0, Math.min(initialIndex, Math.max(0, sources.length - 1))));
    resetZoom();
  }, [initialIndex, sources.length]);

  const pointList = (): Point[] => Array.from(pointers.current.values());
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  return <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`Visualizar fotos: ${title}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="photo-lightbox-top">
      <div>
        <strong>{title}</strong>
        <span>{detail ? `${detail} · ` : ''}{sources.length > 1 ? `Foto ${activeIndex + 1} de ${sources.length}` : 'Foto principal'}</span>
      </div>
      <button className="photo-lightbox-close" title="Fechar" aria-label="Fechar fotos" onClick={onClose}><X size={24} /></button>
    </div>

    <div
      className={`photo-lightbox-stage${zoom > 1 ? ' is-zoomed' : ''}`}
      aria-label="Deslize para trocar de foto. Use os controles para ampliar."
      onDoubleClick={event => { if ((event.target as HTMLElement).closest('button')) return; zoom > 1 ? resetZoom() : setZoom(2); }}
      onWheel={event => {
        if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
        event.preventDefault();
        zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1);
      }}
      onPointerDown={event => {
        if (!currentSrc || (event.target as HTMLElement).closest('button')) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 1) {
          const point = { x: event.clientX, y: event.clientY };
          pointerStart.current = point;
          dragStart.current = { point, pan };
        }
        if (pointers.current.size === 2) {
          const [a, b] = pointList();
          pinchStart.current = { distance: distance(a, b), zoom, center: midpoint(a, b), pan };
          pointerStart.current = null;
          dragStart.current = null;
        }
      }}
      onPointerMove={event => {
        if (!pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 2 && pinchStart.current) {
          const [a, b] = pointList();
          const start = pinchStart.current;
          const nextZoom = Math.min(5, Math.max(1, start.zoom * (distance(a, b) / Math.max(1, start.distance))));
          setZoom(nextZoom);
          const currentCenter = midpoint(a, b);
          if (nextZoom <= 1) setPan({ x: 0, y: 0 });
          else setPan({ x: start.pan.x + currentCenter.x - start.center.x, y: start.pan.y + currentCenter.y - start.center.y });
        } else if (pointers.current.size === 1 && zoom > 1 && dragStart.current) {
          const start = dragStart.current;
          setPan({ x: start.pan.x + event.clientX - start.point.x, y: start.pan.y + event.clientY - start.point.y });
        }
      }}
      onPointerUp={event => {
        const start = pointerStart.current;
        if (pointers.current.size === 1 && zoom <= 1.05 && start && hasMultiple) {
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) >= 52 && Math.abs(dx) > Math.abs(dy) * 1.2) goTo(activeIndex + (dx < 0 ? 1 : -1));
        }
        pointers.current.delete(event.pointerId);
        if (pointers.current.size < 2) pinchStart.current = null;
        if (pointers.current.size === 0) {
          pointerStart.current = null;
          dragStart.current = null;
        } else if (pointers.current.size === 1) {
          const [remaining] = pointList();
          pointerStart.current = remaining;
          dragStart.current = remaining ? { point: remaining, pan } : null;
        }
      }}
      onPointerCancel={event => {
        pointers.current.delete(event.pointerId);
        pinchStart.current = null;
        pointerStart.current = null;
        dragStart.current = null;
      }}
    >
      {currentSrc && <img src={currentSrc} alt={`${title} — foto ${activeIndex + 1}`} draggable={false} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} />}
      {hasMultiple && <>
        <button type="button" className="photo-lightbox-arrow photo-lightbox-prev" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0} aria-label="Foto anterior"><ChevronLeft size={30}/></button>
        <button type="button" className="photo-lightbox-arrow photo-lightbox-next" onClick={() => goTo(activeIndex + 1)} disabled={activeIndex === sources.length - 1} aria-label="Próxima foto"><ChevronRight size={30}/></button>
      </>}
    </div>

    <div className="photo-lightbox-toolbar" aria-label="Controles da imagem">
      {hasMultiple && <span className="photo-lightbox-counter">{activeIndex + 1} / {sources.length}</span>}
      <div className="photo-lightbox-zoom-controls">
        <button type="button" onClick={() => zoomBy(1 / 1.2)} disabled={zoom <= 1} aria-label="Diminuir zoom" title="Diminuir zoom"><Minus size={18}/></button>
        <button type="button" onClick={resetZoom} title="Ajustar à tela" aria-label="Ajustar à tela"><RotateCcw size={16}/><span>{Math.round(zoom * 100)}%</span></button>
        <button type="button" onClick={() => zoomBy(1.2)} disabled={zoom >= 5} aria-label="Aumentar zoom" title="Aumentar zoom"><Plus size={18}/></button>
      </div>
      {hasMultiple && <span className="photo-lightbox-swipe-hint">Deslize para ver as outras fotos</span>}
    </div>
    <div className="photo-lightbox-hint">Use os botões, dê dois cliques ou use a roda do mouse para ampliar · Arraste para mover</div>
  </div>;
}
