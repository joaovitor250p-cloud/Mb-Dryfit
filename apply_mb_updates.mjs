import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const changed = [];
const staged = new Map();
function read(rel) {
  if (staged.has(rel)) return staged.get(rel);
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) throw new Error('Arquivo não encontrado: ' + rel + '. Execute este script na raiz do projeto Mb-Dryfit.');
  return fs.readFileSync(file, 'utf8');
}
function write(rel, content) {
  if (!changed.includes(rel)) changed.push(rel);
  staged.set(rel, content);
}
function replaceOnce(rel, oldText, newText, label = oldText.slice(0, 60)) {
  let content = read(rel);
  const count = content.split(oldText).length - 1;
  if (count !== 1) throw new Error(rel + ': esperado 1 trecho para "' + label + '", encontrado ' + count + '. Nenhuma alteração foi feita neste trecho.');
  content = content.replace(oldText, newText);
  write(rel, content);
}
function replaceAll(rel, oldText, newText, expectedMin = 1, label = oldText.slice(0, 60)) {
  let content = read(rel);
  const count = content.split(oldText).length - 1;
  if (count < expectedMin) throw new Error(rel + ': trecho "' + label + '" encontrado ' + count + ' vez(es), mínimo esperado ' + expectedMin + '.');
  content = content.split(oldText).join(newText);
  write(rel, content);
}
function replaceRegexOnce(rel, regex, newText, label) {
  let content = read(rel);
  const matches = content.match(regex);
  if (!matches || matches.length !== 1) throw new Error(rel + ': padrão "' + label + '" precisa corresponder uma vez; encontrado ' + (matches?.length || 0) + '.');
  content = content.replace(regex, newText);
  write(rel, content);
}

// 1) Amostras: câmera + galeria, até 3 fotos e primeira foto sempre principal.
const sample = 'src/SampleWorkflow.tsx';
replaceOnce(sample, "import { useEffect, useMemo, useState } from 'react';", "import { useEffect, useMemo, useRef, useState } from 'react';", 'import React');
replaceOnce(sample, "  imageData: string; status: Stage; createdAt?: unknown; completedAt?: unknown; completedBy?: string|null;", "  imageData: string; imageDataList?: string[]; status: Stage; createdAt?: unknown; completedAt?: unknown; completedBy?: string|null;", 'Production image list');
replaceOnce(sample, 'async function makePhoto(file: File): Promise<string> {', 'async function makePhoto(file: File, maxLength = 60000): Promise<string> {', 'makePhoto limit');
replaceOnce(sample, 'if (encoded.length < MAX_DATA_LENGTH) return encoded;', 'if (encoded.length <= maxLength) return encoded;', 'photo size limit');
replaceOnce(sample, "  const [imageData, setImageData] = useState('');\n  const [busy, setBusy] = useState(false);\n  const [lightbox,setLightbox]=useState<{src:string;name:string;reference:string;oc:string}|null>(null);", "  const [imageData, setImageData] = useState('');\n  const [imageDataList, setImageDataList] = useState<string[]>([]);\n  const cameraInputRef = useRef<HTMLInputElement>(null);\n  const galleryInputRef = useRef<HTMLInputElement>(null);\n  const [busy, setBusy] = useState(false);\n  const [lightbox,setLightbox]=useState<{src:string;name:string;reference:string;oc:string;images?:string[];index?:number}|null>(null);", 'photo states');
replaceOnce(sample, "  const progress = items.filter(x => x.status === 'in_progress').length;\n  // OCs antigas no estado 'store' continuam acessíveis em Prontos, sem migração destrutiva.\n  const finished = items.filter(x => x.status === 'done' || x.status === 'store').length;", "  const progress = useMemo(() => items.filter(x => x.status === 'in_progress').length, [items]);\n  // OCs antigas no estado 'store' continuam acessíveis em Prontos, sem migração destrutiva.\n  const finished = useMemo(() => items.filter(x => x.status === 'done' || x.status === 'store').length, [items]);\n  const modelByName = useMemo(() => new Map(models.map(model => [normalizeText(model.name), model])), [models]);", 'memoized counts and model lookup');
replaceOnce(sample, "  const selectedCuts=items.filter(x=>selectedCutIds.includes(x.id));\n  const visibleCutIds=filtered.map(x=>x.id);", "  const selectedCuts=useMemo(()=>items.filter(x=>selectedCutIds.includes(x.id)),[items,selectedCutIds]);\n  const visibleCutIds=useMemo(()=>filtered.map(x=>x.id),[filtered]);\n  const currentPhotos = [imageData, ...imageDataList].filter(Boolean);\n  const removePhoto = (index:number) => { const next=currentPhotos.filter((_,i)=>i!==index); setImageData(next[0]||''); setImageDataList(next.slice(1)); };", 'memoized selection and photo list');
replaceOnce(sample, "  const openNew = () => { setEditing(null); setOc(''); setName(''); setReference(''); setTailor(''); setImageData(''); setModal(true); };\n  const openEdit = (p: Production) => { setEditing(p); setOc(p.oc); setName(p.name); setReference(p.reference); setTailor(p.tailor); setImageData(p.imageData || ''); setModal(true); };", "  const openNew = () => { setEditing(null); setOc(''); setName(''); setReference(''); setTailor(''); setImageData(''); setImageDataList([]); setModal(true); };\n  const openEdit = (p: Production) => { setEditing(p); setOc(p.oc); setName(p.name); setReference(p.reference); setTailor(p.tailor); setImageData(p.imageData || ''); setImageDataList(Array.isArray(p.imageDataList) ? p.imageDataList.filter(Boolean).slice(0,2) : []); setModal(true); };", 'open and edit photo states');
replaceRegexOnce(sample, /  const processFile = async \(file\?: File\) => \{[\s\S]*?\n  \};\n  const save = async \(\) => \{/, String.raw`  const processFiles = async (files?: FileList | null) => {
    if (!files || !files.length) return;
    const currentCount = (imageData ? 1 : 0) + imageDataList.length;
    const remaining = Math.max(0, 3 - currentCount);
    if (!remaining) return showMessage('Cada amostra pode ter até 3 fotos. Remova uma foto para adicionar outra.', true);
    const chosen = Array.from(files).slice(0, remaining);
    setBusy(true);
    try {
      const prepared: string[] = [];
      for (const file of chosen) prepared.push(await makePhoto(file, 60000));
      const nextPrimary = imageData || prepared[0] || '';
      const additions = imageData ? prepared : prepared.slice(1);
      setImageData(current => current || nextPrimary);
      setImageDataList(current => [...current, ...additions].slice(0, 2));
      showMessage('Foto(s) preparada(s). A primeira foto é a principal.');
    } catch (e) { showMessage(e instanceof Error ? e.message : 'Não foi possível carregar a imagem.', true); }
    finally { setBusy(false); }
  };
  const save = async () => {`, 'process photo files');
replaceOnce(sample, "    if (imageData.length > MAX_DATA_LENGTH) return showMessage('Imagem acima do limite. Selecione outra foto.', true);", "    if ([imageData, ...imageDataList].some(photo => photo.length > MAX_DATA_LENGTH) || imageDataList.length > 2 || imageData.length + imageDataList.reduce((sum, photo) => sum + photo.length, 0) > 190000) return showMessage('As fotos ultrapassam o limite total. Remova uma foto ou escolha imagens menores.', true);", 'validate total photo size');
replaceOnce(sample, "      const data = { oc: cleanedOC, name: name.trim(), reference: normalizeReference(reference), tailor: tailor.trim(), imageData, updatedAt: serverTimestamp(), updatedBy: user.uid };", "      const data = { oc: cleanedOC, name: name.trim(), reference: normalizeReference(reference), tailor: tailor.trim(), imageData, imageDataList, updatedAt: serverTimestamp(), updatedBy: user.uid };", 'save photo array');
replaceAll(sample, 'models.find(m=>normalizeText(m.name)===normalizeText(p.name))', 'modelByName.get(normalizeText(p.name))', 3, 'avoid repeated model scans');
replaceRegexOnce(sample, /onClick=\{\(\)=>setLightbox\(\{src:p\.imageData \|\| modelByName\.get\(normalizeText\(p\.name\)\)\?\.imageData \|\| modelByName\.get\(normalizeText\(p\.name\)\)\?\.fallbackImageData \|\| '',name:p\.name,reference:p\.reference,oc:p\.oc\}\)\}/, String.raw`onClick={()=>{const primary=p.imageData || modelByName.get(normalizeText(p.name))?.imageData || modelByName.get(normalizeText(p.name))?.fallbackImageData || '';const photos=[primary,...(p.imageDataList||[])].filter(Boolean);setLightbox({src:photos[0]||primary,name:p.name,reference:p.reference,oc:p.oc,images:photos,index:0})}}`, 'open all sample photos');
replaceRegexOnce(sample, /<img src=\{p\.imageData \|\| modelByName\.get\(normalizeText\(p\.name\)\)\?\.imageData \|\| modelByName\.get\(normalizeText\(p\.name\)\)\?\.fallbackImageData\} alt=\{`Foto de \$\{p\.name\}`\}\/>\s*<span className="image-zoom-hint">Ampliar foto<\/span>/, String.raw`<img src={p.imageData || modelByName.get(normalizeText(p.name))?.imageData || modelByName.get(normalizeText(p.name))?.fallbackImageData} alt={"Foto de " + p.name} loading="lazy" decoding="async"/><span className="image-zoom-hint">Ampliar foto</span>{(p.imageDataList?.length||0)>0&&<span className="production-photo-count">{1+(p.imageDataList?.length||0)} fotos</span>}`, 'lazy sample image and photo count');
replaceRegexOnce(sample, /\{lightbox&&<PhotoLightbox src=\{lightbox\.src\} title=\{lightbox\.name\} detail=\{`OC \$\{lightbox\.oc\} · \$\{lightbox\.reference\|\|'SEM CÓDIGO'\}`\}\s+onClose=\{\(\)=>setLightbox\(null\)\}\/>\}/, String.raw`{lightbox&&<PhotoLightbox src={lightbox.images?.[lightbox.index ?? 0] || lightbox.src} title={lightbox.name} detail={"OC " + lightbox.oc + " · " + (lightbox.reference||'SEM CÓDIGO')} images={lightbox.images} index={lightbox.index ?? 0} onChangeImage={index=>setLightbox(current=>current?{...current,index,src:current.images?.[index]||current.src}:current)} onClose={()=>setLightbox(null)}/>}`, 'sample gallery lightbox');
replaceRegexOnce(sample, /<label className="production-image-field"><span>Foto da peça \(opcional\)<\/span>[\s\S]*?<\/label>/, String.raw`<div className="production-image-field"><span>Fotos da peça (até 3; a primeira é a principal)</span>
      <div className="production-photo-picker-actions"><button type="button" className="outline-button" disabled={busy||currentPhotos.length>=3} onClick={()=>cameraInputRef.current?.click()}><Camera size={16}/> Tirar foto</button><button type="button" className="outline-button" disabled={busy||currentPhotos.length>=3} onClick={()=>galleryInputRef.current?.click()}><ImagePlus size={16}/> Galeria</button>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden disabled={busy||currentPhotos.length>=3} onChange={e=>{void processFiles(e.currentTarget.files);e.currentTarget.value='';}}/><input ref={galleryInputRef} type="file" accept="image/*" multiple hidden disabled={busy||currentPhotos.length>=3} onChange={e=>{void processFiles(e.currentTarget.files);e.currentTarget.value='';}}/></div>
      {currentPhotos.length>0?<div className="production-photo-thumbnails">{currentPhotos.map((photo,index)=><div className="production-photo-thumb" key={index}><button type="button" className="production-photo-thumb-open" onClick={()=>setLightbox({src:photo,name:name||'Foto da peça',reference,oc:oc||'Nova amostra',images:currentPhotos,index})}><img src={photo} alt={index===0?'Foto principal':'Foto adicional'} loading="lazy" decoding="async"/><span>{index===0?'Principal':'Foto '+(index+1)}</span></button><button type="button" className="production-photo-remove" aria-label="Remover foto" disabled={busy} onClick={()=>removePhoto(index)}><X size={14}/></button></div>)}</div>:<div className="production-image-preview"><ImagePlus size={28}/><span>Adicione uma foto pela câmera ou galeria</span></div>}
      <small>As fotos são compactadas para reduzir travamentos. Você pode adicionar até 3; a primeira fica como principal e aparece no cartão.</small></div>`, 'camera and gallery inputs');

// 2) Galeria de fotos reutilizável, com navegação quando o registro tiver mais de uma foto.
const lightbox = 'src/PhotoLightbox.tsx';
replaceOnce(lightbox, "import { X } from 'lucide-react';", "import { ChevronLeft, ChevronRight, X } from 'lucide-react';", 'gallery arrows');
replaceOnce(lightbox, "type Props = { src: string; title: string; detail?: string; onClose: () => void };", "type Props = { src: string; title: string; detail?: string; onClose: () => void; images?: string[]; index?: number; onChangeImage?: (index:number) => void };", 'lightbox props');
replaceOnce(lightbox, 'export default function PhotoLightbox({ src, title, detail, onClose }: Props) {', 'export default function PhotoLightbox({ src, title, detail, onClose, images, index = 0, onChangeImage }: Props) {', 'lightbox args');
replaceOnce(lightbox, "  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });", "  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });", 'lightbox pan state');
replaceOnce(lightbox, "  const pinchStart = useRef<{ distance: number; zoom: number; center: Point; pan: Point } | null>(null);", "  const pinchStart = useRef<{ distance: number; zoom: number; center: Point; pan: Point } | null>(null);\n  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); setDrag(null); }, [src]);", 'reset zoom on image change');
replaceOnce(lightbox, '    <div className="photo-lightbox-hint">Use dois dedos para ampliar ou afastar · Arraste a foto ampliada para mover</div>', '    {images && images.length > 1 && <div className="photo-lightbox-gallery-controls"><button type="button" aria-label="Foto anterior" onClick={() => onChangeImage?.((index + images.length - 1) % images.length)}><ChevronLeft size={20}/></button><span>Foto {index + 1} de {images.length}</span><button type="button" aria-label="Próxima foto" onClick={() => onChangeImage?.((index + 1) % images.length)}><ChevronRight size={20}/></button></div>}\n    <div className="photo-lightbox-hint">Use dois dedos para ampliar ou afastar · Arraste a foto ampliada para mover</div>', 'lightbox gallery controls');

// 3) Gastos: nota fiscal opcional, invisível na lista e exibida apenas ao abrir o gasto.
const expenses = 'src/ExpensesPage.tsx';
replaceOnce(expenses, "import { useEffect, useMemo, useState } from 'react';", "import { useEffect, useMemo, useRef, useState } from 'react';", 'expense hooks');
replaceOnce(expenses, "import { CalendarDays, CheckCircle2, Pencil, Plus, Receipt, Search, Trash2, Wallet, X } from 'lucide-react';", "import { CalendarDays, Camera, CheckCircle2, ImagePlus, Pencil, Plus, Receipt, Search, Trash2, Wallet, X } from 'lucide-react';\nimport { optimizePhoto } from './lib/photos';\nimport PhotoLightbox from './PhotoLightbox';", 'expense photo imports');
replaceOnce(expenses, "type Expense = { id: string; name: string; amount: string; date: string; notes: string; createdBy?: string };", "type Expense = { id: string; name: string; amount: string; date: string; notes: string; receiptImage?: string; createdBy?: string };", 'receipt type');
replaceOnce(expenses, "const mapDoc = (id:string, d:DocumentData): Expense => ({ id, name: String(d.name || ''), amount: String(d.amount ?? ''), date: String(d.date || ''), notes: String(d.notes || ''), createdBy: String(d.createdBy || '') });", "const mapDoc = (id:string, d:DocumentData): Expense => ({ id, name: String(d.name || ''), amount: String(d.amount ?? ''), date: String(d.date || ''), notes: String(d.notes || ''), receiptImage: typeof d.receiptImage === 'string' ? d.receiptImage : '', createdBy: String(d.createdBy || '') });", 'receipt mapping');
replaceOnce(expenses, "  const [editing, setEditing] = useState<Expense | null>(null);\n  const [open, setOpen] = useState(false);", "  const [editing, setEditing] = useState<Expense | null>(null);\n  const [viewing, setViewing] = useState<Expense | null>(null);\n  const [receiptImage, setReceiptImage] = useState('');\n  const [receiptLightbox, setReceiptLightbox] = useState<string | null>(null);\n  const receiptCameraRef = useRef<HTMLInputElement>(null);\n  const receiptGalleryRef = useRef<HTMLInputElement>(null);\n  const [open, setOpen] = useState(false);", 'receipt state');
replaceOnce(expenses, "  const reset = () => { setEditing(null); setName(''); setAmount(''); setDate(today()); setNotes(''); setOpen(false); };\n  const openNew = () => { setEditing(null); setName(''); setAmount(''); setDate(today()); setNotes(''); setOpen(true); };\n  const openEdit = (item: Expense) => { setEditing(item); setName(item.name); setAmount(item.amount); setDate(/^\\d{4}-\\d\\d-\\d\\d$/.test(item.date) ? item.date : today()); setNotes(item.notes || ''); setOpen(true); };\n  const notify = (msg:string, isError=false) => { setError(isError ? msg : ''); setMessage(isError ? '' : msg); };", "  const reset = () => { setEditing(null); setName(''); setAmount(''); setDate(today()); setNotes(''); setReceiptImage(''); setOpen(false); setViewing(null); };\n  const openNew = () => { setEditing(null); setName(''); setAmount(''); setDate(today()); setNotes(''); setReceiptImage(''); setViewing(null); setOpen(true); };\n  const openEdit = (item: Expense) => { setViewing(null); setEditing(item); setName(item.name); setAmount(item.amount); setDate(/^\\d{4}-\\d\\d-\\d\\d$/.test(item.date) ? item.date : today()); setNotes(item.notes || ''); setReceiptImage(item.receiptImage || ''); setOpen(true); };\n  const notify = (msg:string, isError=false) => { setError(isError ? msg : ''); setMessage(isError ? '' : msg); };\n  const processReceipt = async (file?: File) => { if (!file) return; setBusy(true); try { setReceiptImage(await optimizePhoto(file, 100000)); notify('Nota fiscal preparada e compactada.'); } catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível processar a nota fiscal.', true); } finally { setBusy(false); } };", 'expense form state and photo processing');
replaceOnce(expenses, "      const payload = { name: name.trim(), amount: amount.trim(), date, notes: notes.trim(), updatedAt: serverTimestamp(), updatedBy: user.uid };", "      const payload = { name: name.trim(), amount: amount.trim(), date, notes: notes.trim(), receiptImage, updatedAt: serverTimestamp(), updatedBy: user.uid };", 'save receipt');
replaceOnce(expenses, '<article key={item.id} className="simple-card expense-card fade-in-up">', '<article key={item.id} className="simple-card expense-card expense-card-clickable">', 'expense card without animation');
replaceOnce(expenses, '<div className="expense-card-head">', '<button type="button" className="expense-card-open" aria-label={"Abrir detalhes do gasto " + item.name} onClick={()=>setViewing(item)}><div className="expense-card-head">', 'expense details button');
replaceOnce(expenses, '        {item.notes && <p className="expense-notes">{item.notes}</p>}\n        {canEdit && <div className="simple-card-actions"><button className="outline-button" onClick={()=>openEdit(item)}><Pencil size={14}/> Editar</button><button className="danger-button" onClick={()=>void remove(item)}><Trash2 size={14}/> Excluir</button></div>}', '        {item.notes && <p className="expense-notes">{item.notes}</p>}\n        <small className="expense-open-hint">Clique para ver detalhes e nota fiscal</small></button>\n        {canEdit && <div className="simple-card-actions"><button className="outline-button" onClick={()=>openEdit(item)}><Pencil size={14}/> Editar</button><button className="danger-button" onClick={()=>void remove(item)}><Trash2 size={14}/> Excluir</button></div>}', 'expense card actions');
replaceOnce(expenses, '<form className="modal-form" onSubmit={e=>{e.preventDefault(); void save();}}><div className="production-form-grid"><label>Data<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Valor *<input required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Ex.: 250,00"/></label></div><label>Nome do gasto *<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Compra de tecido"/></label><label>Observações<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional" rows={3}/></label><div className="modal-actions"><button type="button" className="outline-button" onClick={reset}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>{busy ? \'Salvando...\' : \'Salvar gasto\'}</button></div></form>', String.raw`<form className="modal-form" onSubmit={e=>{e.preventDefault(); void save();}}><div className="production-form-grid"><label>Data<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Valor *<input required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Ex.: 250,00"/></label></div><label>Nome do gasto *<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Compra de tecido"/></label><label>Observações<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional" rows={3}/></label>
      <div className="receipt-editor"><strong>Nota fiscal (opcional)</strong><p>Tire uma foto da nota ou escolha uma imagem da galeria. Ela não aparece na lista de gastos.</p><div className="receipt-editor-actions"><button type="button" className="outline-button" disabled={busy} onClick={()=>receiptCameraRef.current?.click()}><Camera size={15}/> Tirar foto</button><button type="button" className="outline-button" disabled={busy} onClick={()=>receiptGalleryRef.current?.click()}><ImagePlus size={15}/> Galeria</button><input ref={receiptCameraRef} type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={e=>{void processReceipt(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/><input ref={receiptGalleryRef} type="file" accept="image/*" hidden disabled={busy} onChange={e=>{void processReceipt(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/></div>{receiptImage?<><img className="receipt-editor-preview" src={receiptImage} alt="Prévia da nota fiscal" loading="lazy" decoding="async"/><button type="button" className="outline-button" onClick={()=>setReceiptImage('')}><Trash2 size={14}/> Remover nota fiscal</button></>:<span className="receipt-empty">Nenhuma nota fiscal anexada.</span>}</div>
      <div className="modal-actions"><button type="button" className="outline-button" onClick={reset}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Salvando...' : 'Salvar gasto'}</button></div></form>`, 'expense modal form');
replaceRegexOnce(expenses, /\n  <\/div>;\n\}/, String.raw`
    {viewing && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setViewing(null)}}><section className="modal expense-detail-modal" role="dialog" aria-modal="true" aria-label="Detalhes do gasto"><div className="modal-head"><div><span className="eyebrow">DETALHES DO GASTO</span><h2>{viewing.name}</h2><p>{toBR(viewing.date)}</p></div><button className="icon-button" onClick={()=>setViewing(null)} aria-label="Fechar"><X/></button></div><div className="expense-detail-body"><div className="expense-detail-amount"><small>Valor do gasto</small><strong>{money(viewing.amount)}</strong></div>{viewing.notes&&<div className="expense-detail-notes"><strong>Observações</strong><p>{viewing.notes}</p></div>}<section className="expense-receipt-section"><h3><Receipt size={17}/> Nota fiscal</h3>{viewing.receiptImage?<button type="button" className="expense-receipt-open" onClick={()=>setReceiptLightbox(viewing.receiptImage||null)}><img src={viewing.receiptImage} alt={"Nota fiscal de " + viewing.name} loading="lazy" decoding="async"/><span>Toque para ampliar</span></button>:<p className="receipt-empty">Nenhuma nota fiscal foi anexada a este gasto.</p>}</section></div><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>{setViewing(null);openEdit(viewing)}}><Pencil size={14}/> Editar gasto</button><button type="button" className="primary-button" onClick={()=>setViewing(null)}>Fechar</button></div></section></div>}
    {receiptLightbox && <PhotoLightbox src={receiptLightbox} title="Nota fiscal" detail={viewing?.name || 'Gasto'} onClose={()=>setReceiptLightbox(null)}/>}
  </div>;
}`, 'expense detail modal');

// 4) CSS: dois cartões lado a lado no celular, miniaturas de fotos e cartões de gasto sem animação pesada.
const css = 'src/styles.css';
const marker = '/* MB REFERENCIAS 4.9 — galeria de amostras, nota fiscal e ajuste de desempenho */';
if (!read(css).includes(marker)) {
  const addition = String.raw`

${marker}
.production-photo-picker-actions{display:flex;gap:8px;flex-wrap:wrap;margin:9px 0 12px}
.production-photo-thumbnails{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:10px 0}
.production-photo-thumb{position:relative;min-width:0;border:1px solid var(--line);border-radius:11px;overflow:hidden;background:var(--panel2)}
.production-photo-thumb-open{display:flex;flex-direction:column;gap:6px;width:100%;padding:7px;border:0;background:transparent;color:var(--text);font-size:11px;font-weight:700;cursor:zoom-in}
.production-photo-thumb-open img{width:100%;height:94px;object-fit:contain;border-radius:7px;background:var(--panel)}
.production-photo-remove{position:absolute;right:8px;top:8px;width:27px;height:27px;display:grid;place-items:center;border:0;border-radius:50%;background:#b52b2b;color:white;cursor:pointer}
.production-photo-count{position:absolute;left:10px;bottom:10px;border-radius:99px;padding:5px 8px;background:#1f2937e8;color:white;font-size:11px;font-weight:800}
.photo-lightbox-gallery-controls{display:flex;align-items:center;justify-content:center;gap:22px;padding:10px;color:#fff;font-size:13px;font-weight:700}
.photo-lightbox-gallery-controls button{width:38px;height:38px;display:grid;place-items:center;border:1px solid #ffffff55;border-radius:50%;background:#ffffff15;color:white}
.receipt-editor{display:grid;gap:9px;padding:13px;border:1px solid var(--line);border-radius:12px;background:var(--panel2)}
.receipt-editor>strong{font-size:13px;color:var(--text)}
.receipt-editor>p{margin:0;color:var(--muted);font-size:11px;line-height:1.5}
.receipt-editor-actions{display:flex;gap:8px;flex-wrap:wrap}
.receipt-editor input[type=file]{display:none}
.receipt-editor-preview{width:100%;max-height:260px;object-fit:contain;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
.receipt-empty{display:block;color:var(--muted);font-size:12px;padding:12px;border:1px dashed var(--line);border-radius:10px}
.expense-card-clickable{transition:border-color .15s ease,box-shadow .15s ease}
.expense-card-clickable:hover,.expense-card-clickable:focus-within{border-color:#efb47e;box-shadow:0 6px 18px rgba(146,78,25,.09)}
.expense-card-open{display:grid;gap:10px;width:100%;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}
.expense-card-open:focus-visible{outline:2px solid #e87518;outline-offset:4px;border-radius:8px}
.expense-open-hint{font-size:11px;color:var(--muted)}
.expense-detail-modal{width:min(620px,95vw);max-height:90vh;overflow:auto}
.expense-detail-body{display:grid;gap:18px;padding:4px 0 16px}
.expense-detail-amount{padding:15px;border-radius:12px;background:var(--panel2);border:1px solid var(--line)}
.expense-detail-amount small{display:block;color:var(--muted);font-size:11px;margin-bottom:5px}
.expense-detail-amount strong{font-size:27px;font-weight:850;color:var(--teal);overflow-wrap:anywhere}
.expense-detail-notes p{margin:6px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--text);font-size:13px;line-height:1.55}
.expense-receipt-section h3{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:14px;color:var(--text)}
.expense-receipt-open{display:grid;gap:8px;width:100%;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--panel2);color:var(--teal);font-weight:700;cursor:zoom-in}
.expense-receipt-open img{width:100%;max-height:440px;object-fit:contain;border-radius:8px;background:var(--panel)}
@media(max-width:700px){
  .photos-page .production-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px;padding:10px!important}
  .photos-page .production-card{width:auto;max-width:none;margin:0}
  .photos-page .production-photo{height:130px;min-height:130px}
  .photos-page .production-details{padding:10px;gap:8px}
  .photos-page .production-details h3{font-size:13px;line-height:1.3}
  .photos-page .production-oc{font-size:12px;letter-spacing:.04em}
  .photos-page .production-details dl>div{grid-template-columns:minmax(0,1fr);gap:2px;font-size:10px;padding:5px 0}
  .photos-page .production-actions{gap:5px;margin-top:9px}
  .photos-page .production-actions .outline-button,.photos-page .production-actions .icon-button{font-size:10px;padding:7px}
  .production-photo-thumbnails{gap:6px}
  .production-photo-thumb-open{padding:5px;font-size:10px}
  .production-photo-thumb-open img{height:72px}
  .expense-detail-modal{padding:16px}
}
@media(max-width:360px){.photos-page .production-photo{height:110px;min-height:110px}.photos-page .production-details{padding:8px}}
`;
  write(css, read(css) + addition);
}

for (const rel of changed) {
  const file = path.join(root, rel);
  fs.copyFileSync(file, file + '.backup-before-mb-update');
  fs.writeFileSync(file, staged.get(rel), 'utf8');
}
console.log('Atualização aplicada com sucesso. Arquivos alterados:');
for (const file of changed) console.log(' - ' + file + ' (backup: ' + file + '.backup-before-mb-update)');
console.log('Próximo passo: execute npm run build e revise o diff antes de publicar.');
