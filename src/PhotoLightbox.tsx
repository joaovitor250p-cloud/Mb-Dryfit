import { useEffect, useState } from 'react';
import { Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';

type Props = { src: string; title: string; detail?: string; onClose: () => void };
export default function PhotoLightbox({src,title,detail,onClose}:Props) {
  const [zoom,setZoom]=useState(1);
  const [pan,setPan]=useState({x:0,y:0});
  const [drag,setDrag]=useState<{x:number;y:number;ox:number;oy:number}|null>(null);
  useEffect(()=>{
    const old=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==='Escape')onClose();
      if(e.key==='+'||e.key==='=')setZoom(z=>Math.min(5,Number((z+.25).toFixed(2))));
      if(e.key==='-')setZoom(z=>Math.max(1,Number((z-.25).toFixed(2))));
    };
    window.addEventListener('keydown',onKey);
    return ()=>{document.body.style.overflow=old;window.removeEventListener('keydown',onKey)};
  },[onClose]);
  const updateZoom=(next:number)=>{const n=Math.min(5,Math.max(1,next));setZoom(n);if(n===1)setPan({x:0,y:0})};
  return <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`Visualizar foto: ${title}`} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="photo-lightbox-top"><div><strong>{title}</strong>{detail&&<span>{detail}</span>}</div><button className="photo-lightbox-close" title="Fechar" aria-label="Fechar foto" onClick={onClose}><X size={24}/></button></div>
    <div className="photo-lightbox-stage" onWheel={e=>{if(e.ctrlKey){e.preventDefault();updateZoom(zoom+(e.deltaY<0?.25:-.25))}}}>
      <img src={src} alt={title} draggable={false} style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`,cursor:zoom>1?(drag?'grabbing':'grab'):'zoom-in'}}
        onClick={()=>{if(zoom===1)updateZoom(2)}}
        onPointerDown={e=>{if(zoom<=1)return;e.currentTarget.setPointerCapture(e.pointerId);setDrag({x:e.clientX,y:e.clientY,ox:pan.x,oy:pan.y})}}
        onPointerMove={e=>{if(drag)setPan({x:drag.ox+e.clientX-drag.x,y:drag.oy+e.clientY-drag.y})}}
        onPointerUp={()=>setDrag(null)} onPointerCancel={()=>setDrag(null)} />
    </div>
    <div className="photo-lightbox-controls">
      <button type="button" title="Diminuir zoom" aria-label="Diminuir zoom" onClick={()=>updateZoom(zoom-.25)} disabled={zoom<=1}><Minus size={18}/></button>
      <input type="range" aria-label="Ampliação da foto" min="1" max="5" step="0.25" value={zoom} onChange={e=>updateZoom(Number(e.target.value))}/>
      <b>{Math.round(zoom*100)}%</b>
      <button type="button" title="Aumentar zoom" aria-label="Aumentar zoom" onClick={()=>updateZoom(zoom+.25)} disabled={zoom>=5}><Plus size={18}/></button>
      <button type="button" title="Ajustar à tela" onClick={()=>{updateZoom(1);setPan({x:0,y:0})}}><Maximize2 size={18}/><span>Ajustar</span></button>
      <button type="button" title="Restaurar zoom" onClick={()=>{updateZoom(1);setPan({x:0,y:0})}}><RotateCcw size={16}/></button>
    </div>
  </div>;
}
