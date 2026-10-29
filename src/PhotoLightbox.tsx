import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

type Props = { src: string; title: string; detail?: string; onClose: () => void };
type Point = { x: number; y: number };
export default function PhotoLightbox({ src, title, detail, onClose }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinchStart = useRef<{ distance: number; zoom: number; center: Point; pan: Point } | null>(null);

  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = oldOverflow; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const pointList = () => Array.from(pointers.current.values());
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  return <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`Visualizar foto: ${title}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="photo-lightbox-top">
      <div><strong>{title}</strong>{detail && <span>{detail}</span>}</div>
      <button className="photo-lightbox-close" title="Fechar" aria-label="Fechar foto" onClick={onClose}><X size={24} /></button>
    </div>
    <div className="photo-lightbox-stage" aria-label="Use dois dedos para aproximar ou afastar a imagem" onWheel={event => { if (event.ctrlKey) { event.preventDefault(); setZoom(current => Math.min(5, Math.max(1, current * (event.deltaY < 0 ? 1.08 : 0.92)))); } }}>
      <img src={src} alt={title} draggable={false}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, cursor: zoom > 1 ? (drag ? 'grabbing' : 'grab') : 'default' }}
        onPointerDown={event => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pointers.current.size === 2) {
            const [a, b] = pointList();
            pinchStart.current = { distance: distance(a, b), zoom, center: midpoint(a, b), pan };
            setDrag(null);
          } else if (pointers.current.size === 1 && zoom > 1) {
            setDrag({ x: event.clientX, y: event.clientY, ox: pan.x, oy: pan.y });
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
          } else if (drag && zoom > 1) {
            setPan({ x: drag.ox + event.clientX - drag.x, y: drag.oy + event.clientY - drag.y });
          }
        }}
        onPointerUp={event => {
          pointers.current.delete(event.pointerId);
          if (pointers.current.size < 2) pinchStart.current = null;
          if (pointers.current.size === 1 && zoom > 1) {
            const [remaining] = pointList();
            setDrag(remaining ? { x: remaining.x, y: remaining.y, ox: pan.x, oy: pan.y } : null);
          } else setDrag(null);
        }}
        onPointerCancel={event => { pointers.current.delete(event.pointerId); pinchStart.current = null; setDrag(null); }}
      />
    </div>
    <div className="photo-lightbox-hint">Use dois dedos para ampliar ou afastar · Arraste a foto ampliada para mover</div>
  </div>;
}
