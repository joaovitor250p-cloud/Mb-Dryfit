import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus, RotateCcw, X } from 'lucide-react';

type Point = { x: number; y: number };
type Props = {
  src?: string;
  images?: string[];
  initialIndex?: number;
  title: string;
  detail?: string;
  onClose: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export default function PhotoLightbox({ src, images, initialIndex = 0, title, detail, onClose }: Props) {
  const sources = useMemo(() => {
    const valid = (images || []).filter((item): item is string => typeof item === 'string' && item.length > 0);
    return valid.length ? valid : (src ? [src] : []);
  }, [images, src]);

  const [activeIndex, setActiveIndex] = useState(() => clamp(initialIndex, 0, Math.max(0, sources.length - 1)));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const pointers = useRef(new Map<number, Point>());
  const swipeStart = useRef<Point | null>(null);
  const dragStart = useRef<{ point: Point; pan: Point } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number; center: Point; pan: Point } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const currentSrc = sources[activeIndex] || src || '';
  const hasMultiple = sources.length > 1;

  const resetZoom = () => {
    zoomRef.current = 1;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const applyZoom = (value: number) => {
    const next = clamp(value, 1, 5);
    zoomRef.current = next;
    setZoom(next);
    if (next <= 1) setPan({ x: 0, y: 0 });
  };

  const zoomBy = (factor: number) => applyZoom(zoomRef.current * factor);

  const clearGestures = () => {
    pointers.current.clear();
    swipeStart.current = null;
    dragStart.current = null;
    pinchStart.current = null;
  };

  const goTo = (index: number) => {
    const next = clamp(index, 0, Math.max(0, sources.length - 1));
    if (next === activeIndex) return;
    setActiveIndex(next);
    resetZoom();
    setImageError(false);
    setImageLoading(true);
    clearGestures();
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && hasMultiple) goTo(activeIndex - 1);
      if (event.key === 'ArrowRight' && hasMultiple) goTo(activeIndex + 1);
      if (event.key === '+' || event.key === '=') zoomBy(1.2);
      if (event.key === '-') zoomBy(1 / 1.2);
      if (event.key === '0') resetZoom();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeIndex, hasMultiple, onClose, zoom, sources.length]);

  useEffect(() => {
    setActiveIndex(clamp(initialIndex, 0, Math.max(0, sources.length - 1)));
    resetZoom();
    setImageError(false);
    setImageLoading(true);
    clearGestures();
  }, [initialIndex, sources.length]);

  useEffect(() => {
    setImageError(false);
    setImageLoading(true);
    resetZoom();
    clearGestures();
  }, [currentSrc]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!currentSrc || (event.target as HTMLElement).closest('button')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Alguns navegadores podem não oferecer captura de ponteiro.
    }

    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 1) {
      const point = { x: event.clientX, y: event.clientY };
      swipeStart.current = point;
      dragStart.current = { point, pan };
      pinchStart.current = null;
    } else if (pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStart.current = {
        distance: Math.max(1, distance(a, b)),
        zoom: zoomRef.current,
        center: midpoint(a, b),
        pan,
      };
      swipeStart.current = null;
      dragStart.current = null;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = Array.from(pointers.current.values());
      const start = pinchStart.current;
      const nextZoom = clamp(start.zoom * (distance(a, b) / Math.max(1, start.distance)), 1, 5);
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      const center = midpoint(a, b);
      if (nextZoom <= 1.02) setPan({ x: 0, y: 0 });
      else setPan({ x: start.pan.x + center.x - start.center.x, y: start.pan.y + center.y - start.center.y });
      return;
    }

    if (pointers.current.size === 1 && zoomRef.current > 1.02 && dragStart.current) {
      const start = dragStart.current;
      setPan({ x: start.pan.x + event.clientX - start.point.x, y: start.pan.y + event.clientY - start.point.y });
    }
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const start = swipeStart.current;
    if (!cancelled && pointers.current.size === 1 && zoomRef.current <= 1.05 && start && hasMultiple) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) >= 52 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        goTo(activeIndex + (dx < 0 ? 1 : -1));
      }
    }

    pointers.current.delete(event.pointerId);
    if (cancelled) {
      if (pointers.current.size === 1) {
        const [remaining] = Array.from(pointers.current.values());
        dragStart.current = remaining ? { point: remaining, pan } : null;
        swipeStart.current = null;
        pinchStart.current = null;
      } else if (pointers.current.size === 0) {
        clearGestures();
      }
      return;
    }

    if (pointers.current.size === 1) {
      const [remaining] = Array.from(pointers.current.values());
      dragStart.current = remaining ? { point: remaining, pan } : null;
      swipeStart.current = null;
      pinchStart.current = null;
    } else if (pointers.current.size === 0) {
      clearGestures();
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    // A rolagem comum não deve alterar o zoom nem reposicionar a imagem.
    // No notebook, use Ctrl + roda para ampliar/reduzir.
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    zoomBy(Math.exp(-event.deltaY * 0.008));
  };

  return createPortal(
    <>
      <style>{`
        .mb-photo-viewer, .mb-photo-viewer * { box-sizing: border-box; }
        .mb-photo-viewer {
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483000 !important;
          width: 100vw !important;
          height: 100vh !important;
          height: 100dvh !important;
          display: grid !important;
          grid-template-rows: auto minmax(0, 1fr) auto auto;
          gap: 12px;
          padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
          overflow: hidden;
          isolation: isolate;
          background: rgba(7, 12, 17, .98);
          color: #fff;
          font-family: inherit;
          overscroll-behavior: contain;
        }
        .mb-photo-viewer__header {
          width: min(100%, 1500px);
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          min-width: 0;
        }
        .mb-photo-viewer__heading { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .mb-photo-viewer__heading strong { font-size: clamp(14px, 2vw, 20px); line-height: 1.25; overflow-wrap: anywhere; }
        .mb-photo-viewer__heading span { color: #b9c7d0; font-size: 12px; }
        .mb-photo-viewer__icon-button {
          flex: 0 0 auto; width: 46px; height: 46px; display: grid; place-items: center;
          border: 1px solid rgba(255,255,255,.22); border-radius: 13px;
          background: rgba(255,255,255,.10); color: #fff; cursor: pointer;
        }
        .mb-photo-viewer__icon-button:hover { background: rgba(255,255,255,.19); }
        .mb-photo-viewer__stage {
          position: relative; width: min(100%, 1500px); height: 100%; min-width: 0; min-height: 0;
          margin: 0 auto; display: grid; place-items: center; overflow: hidden;
          border: 1px solid rgba(255,255,255,.08); border-radius: 15px;
          background: radial-gradient(ellipse at center, #18232c 0%, #0c131a 72%);
          touch-action: none; user-select: none; -webkit-user-select: none;
          cursor: default;
        }
        .mb-photo-viewer__stage.is-zoomed { cursor: grab; }
        .mb-photo-viewer__stage.is-zoomed:active { cursor: grabbing; }
        .mb-photo-viewer__image {
          display: block; position: relative;
          width: auto !important; height: auto !important;
          max-width: min(calc(100% - 112px), 1200px) !important;
          max-height: min(100%, calc(100dvh - 250px)) !important;
          object-fit: contain !important; object-position: center center;
          pointer-events: none; user-select: none; -webkit-user-drag: none;
          transform-origin: center center; will-change: transform;
        }
        /* O arquivo inteiro precisa caber na área útil do visualizador.
           Não usar limites percentuais baixos: eles deixam fotos verticais enormes
           e podem parecer cortadas em telas de notebook. */
        @media (min-width: 701px) {
          .mb-photo-viewer__image {
            max-width: min(calc(100% - 112px), calc(100vw - 160px), 1200px) !important;
            max-height: min(100%, calc(100dvh - 250px)) !important;
          }
        }
        .mb-photo-viewer__message {
          position: absolute; z-index: 2; inset: 0; display: grid; place-items: center;
          padding: 24px; color: #dbe5eb; text-align: center; font-size: 14px;
          pointer-events: none;
        }
        .mb-photo-viewer__arrow {
          position: absolute; z-index: 3; top: 50%; transform: translateY(-50%);
          width: 48px; height: 58px; display: grid; place-items: center;
          border: 1px solid rgba(255,255,255,.22); border-radius: 13px;
          background: rgba(10,17,23,.72); color: #fff; cursor: pointer;
        }
        .mb-photo-viewer__arrow:hover:not(:disabled) { background: #df792c; }
        .mb-photo-viewer__arrow:disabled { opacity: .25; cursor: default; }
        .mb-photo-viewer__prev { left: 12px; }
        .mb-photo-viewer__next { right: 12px; }
        .mb-photo-viewer__thumbs {
          width: min(100%, 900px); margin: 0 auto; display: flex; align-items: center;
          justify-content: center; gap: 9px; padding: 2px 8px; overflow-x: auto;
          overscroll-behavior-x: contain; scrollbar-width: thin;
        }
        .mb-photo-viewer__thumb {
          flex: 0 0 auto; width: 64px; height: 58px; padding: 3px; overflow: hidden;
          border: 1px solid rgba(255,255,255,.3); border-radius: 10px;
          background: rgba(255,255,255,.08); opacity: .65; cursor: pointer;
        }
        .mb-photo-viewer__thumb.active { opacity: 1; border: 2px solid #f0a66c; }
        .mb-photo-viewer__thumb img { display: block; width: 100%; height: 100%; object-fit: contain; }
        .mb-photo-viewer__toolbar {
          width: min(100%, 1500px); margin: 0 auto; min-height: 44px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .mb-photo-viewer__counter { color: #dbe5eb; min-width: 70px; font-size: 12px; font-weight: 750; }
        .mb-photo-viewer__controls { display: flex; align-items: center; justify-content: center; gap: 8px; }
        .mb-photo-viewer__control {
          min-width: 44px; height: 42px; padding: 0 12px; display: inline-flex;
          align-items: center; justify-content: center; gap: 7px;
          border: 1px solid rgba(255,255,255,.22); border-radius: 11px;
          background: rgba(255,255,255,.09); color: #fff; cursor: pointer;
          font-size: 12px; font-weight: 700; text-decoration: none;
        }
        .mb-photo-viewer__control:hover:not(:disabled) { background: rgba(255,255,255,.18); }
        .mb-photo-viewer__control:disabled { opacity: .35; cursor: default; }
        .mb-photo-viewer__hint { color: #aebdc7; font-size: 11px; text-align: right; }
        @media (max-width: 700px) {
          .mb-photo-viewer { gap: 8px; padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); }
          .mb-photo-viewer__icon-button { width: 42px; height: 42px; }
          .mb-photo-viewer__stage { border-radius: 10px; }
          .mb-photo-viewer__image {
            max-width: min(calc(100% - 66px), calc(100vw - 66px)) !important;
            max-height: min(100%, calc(100dvh - 220px)) !important;
          }
          .mb-photo-viewer__arrow { width: 34px; height: 44px; border-radius: 9px; }
          .mb-photo-viewer__prev { left: 5px; } .mb-photo-viewer__next { right: 5px; }
          .mb-photo-viewer__thumb { width: 50px; height: 46px; }
          .mb-photo-viewer__toolbar { flex-wrap: wrap; justify-content: center; gap: 7px; }
          .mb-photo-viewer__counter { min-width: 42px; text-align: center; }
          .mb-photo-viewer__hint { flex-basis: 100%; text-align: center; font-size: 10px; }
          .mb-photo-viewer__control { min-width: 40px; height: 38px; padding: 0 10px; }
        }
      `}</style>

      <div
        className="mb-photo-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={`Visualizar fotos: ${title}`}
        onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      >
        <header className="mb-photo-viewer__header">
          <div className="mb-photo-viewer__heading">
            <strong>{title}</strong>
            <span>{detail ? `${detail} · ` : ''}{hasMultiple ? `Foto ${activeIndex + 1} de ${sources.length}` : 'Foto principal'}</span>
          </div>
          <button type="button" className="mb-photo-viewer__icon-button" onClick={onClose} title="Fechar" aria-label="Fechar visualizador"><X size={23} /></button>
        </header>

        <div
          className={`mb-photo-viewer__stage${zoom > 1.02 ? ' is-zoomed' : ''}`}
          aria-label="Arraste para mover ou trocar de foto. Use dois dedos para ampliar."
          onDoubleClick={event => {
            if ((event.target as HTMLElement).closest('button')) return;
            zoomRef.current > 1.02 ? resetZoom() : applyZoom(2);
          }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={event => finishPointer(event)}
          onPointerCancel={event => finishPointer(event, true)}
          onLostPointerCapture={event => {
            if (!pointers.current.has(event.pointerId)) return;
            pointers.current.delete(event.pointerId);
            if (pointers.current.size === 0) clearGestures();
          }}
        >
          {currentSrc && !imageError && (
            <img
              key={currentSrc}
              className="mb-photo-viewer__image"
              src={currentSrc}
              alt={`${title} — foto ${activeIndex + 1}`}
              draggable={false}
              onLoad={() => setImageLoading(false)}
              onError={() => { setImageLoading(false); setImageError(true); }}
              style={{
                width: 'auto',
                height: 'auto',
                maxWidth: 'min(calc(100% - 112px), calc(100vw - 112px), 1200px)',
                maxHeight: 'min(100%, calc(100dvh - 250px))',
                objectFit: 'contain',
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`
              }}
            />
          )}

          {!currentSrc && <div className="mb-photo-viewer__message">Nenhuma imagem disponível para visualizar.</div>}
          {imageLoading && currentSrc && !imageError && <div className="mb-photo-viewer__message">Carregando imagem...</div>}
          {imageError && <div className="mb-photo-viewer__message">Não foi possível carregar esta imagem neste visualizador. Você ainda pode tentar abri-la em uma nova guia.</div>}

          {hasMultiple && (
            <>
              <button type="button" className="mb-photo-viewer__arrow mb-photo-viewer__prev" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0} aria-label="Foto anterior"><ChevronLeft size={28} /></button>
              <button type="button" className="mb-photo-viewer__arrow mb-photo-viewer__next" onClick={() => goTo(activeIndex + 1)} disabled={activeIndex === sources.length - 1} aria-label="Próxima foto"><ChevronRight size={28} /></button>
            </>
          )}
        </div>

        {hasMultiple && (
          <div className="mb-photo-viewer__thumbs" aria-label="Escolher foto">
            {sources.map((image, index) => (
              <button
                key={`${index}-${image.slice(0, 24)}`}
                type="button"
                className={`mb-photo-viewer__thumb${index === activeIndex ? ' active' : ''}`}
                onClick={() => goTo(index)}
                aria-label={`Abrir foto ${index + 1}`}
                aria-current={index === activeIndex ? 'true' : undefined}
              >
                <img src={image} alt={`Miniatura ${index + 1}`} loading="lazy" />
              </button>
            ))}
          </div>
        )}

        <footer className="mb-photo-viewer__toolbar">
          <span className="mb-photo-viewer__counter">{hasMultiple ? `${activeIndex + 1} / ${sources.length}` : '1 foto'}</span>
          <div className="mb-photo-viewer__controls">
            <button type="button" className="mb-photo-viewer__control" onClick={() => zoomBy(1 / 1.2)} disabled={zoom <= 1.01} title="Diminuir zoom" aria-label="Diminuir zoom"><Minus size={18} /></button>
            <button type="button" className="mb-photo-viewer__control" onClick={resetZoom} title="Ajustar à tela" aria-label="Ajustar à tela"><RotateCcw size={16} /><span>{Math.round(zoom * 100)}%</span></button>
            <button type="button" className="mb-photo-viewer__control" onClick={() => zoomBy(1.2)} disabled={zoom >= 4.99} title="Aumentar zoom" aria-label="Aumentar zoom"><Plus size={18} /></button>
            {currentSrc && <a className="mb-photo-viewer__control" href={currentSrc} target="_blank" rel="noreferrer" title="Abrir imagem em nova guia"><ExternalLink size={17} /><span>Abrir original</span></a>}
          </div>
          <span className="mb-photo-viewer__hint">Notebook: Ctrl + roda ou botões · Duplo clique: zoom · Arraste após ampliar · Celular: pinça para ampliar</span>
        </footer>
      </div>
    </>,
    document.body
  );
}
