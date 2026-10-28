import { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Camera, ImagePlus, Search, Trash2, Upload, X } from 'lucide-react';
import { normalizeText, sortModels, type Model } from './lib/catalog';
import { optimizePhoto } from './lib/photos';

type Props = {db: Firestore; user: User; canEdit: boolean; models: Model[]};
export default function ModelPhotos({db,user,canEdit,models}: Props) {
  const [search,setSearch]=useState('');
  const [selected,setSelected]=useState<Model|null>(null);
  const [preview,setPreview]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const list=useMemo(()=>sortModels(models,'reference').filter(m=>[m.name,m.reference].some(v=>normalizeText(v).includes(normalizeText(search)))),[models,search]);
  const open=(m:Model)=>{setSelected(m);setPreview(m.imageData||'');setMessage('');setError('')};
  const upload=async(file?:File)=>{
    if(!file)return;
    setBusy(true);setError('');
    try{setPreview(await optimizePhoto(file))}catch(e){setError(e instanceof Error?e.message:'Erro ao abrir a foto')}
    finally{setBusy(false)}
  };
  const save=async()=>{
    if(!selected||!canEdit)return;
    setBusy(true);setError('');
    try{
      await updateDoc(doc(db,'models',selected.id),{imageData:preview,updatedAt:serverTimestamp(),updatedBy:user.uid});
      setSelected(null);setMessage('Foto do modelo salva e sincronizada para todos os aparelhos.');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar a foto')}
    finally{setBusy(false)}
  };
  return <div className="page-wrap photos-page">
    <div className="page-heading"><div><span className="eyebrow">FOTOS POR MODELO</span><h1>Fotos dos modelos</h1><p>Uma única imagem por modelo, sem repetir tamanhos ou cores. Importe o CSV primeiro e adicione as fotos depois.</p></div></div>
    <section className="stats-grid"><div className="stat-card"><div className="stat-icon blue"><Camera/></div><div><span>Total de modelos</span><strong>{models.length}</strong><small>Seu catálogo existente</small></div></div><div className="stat-card"><div className="stat-icon green"><ImagePlus/></div><div><span>Com foto</span><strong>{models.filter(m=>!!m.imageData).length}</strong><small>Uma imagem por modelo</small></div></div><div className="stat-card"><div className="stat-icon amber"><Camera/></div><div><span>Faltam fotos</span><strong>{models.filter(m=>!m.imageData).length}</strong><small>Adicione quando quiser</small></div></div></section>
    <section className="catalog-panel"><div className="production-toolbar"><label className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar modelo ou referência para adicionar foto..."/></label></div>
      {message&&<div className="production-ok">{message}</div>}
      <div className="production-grid photos-grid">{list.map(m=><article className="production-card" key={m.id}>
        <div className="production-photo model-image">{m.imageData?<img src={m.imageData} alt={'Foto de '+m.name}/>:<div className="model-photo-placeholder"><ImagePlus size={32}/><span>Sem foto</span></div>}</div>
        <div className="production-details"><h3>{m.name}</h3><div className="model-photo-ref">{m.reference||'SEM CÓDIGO'}</div>
          {canEdit&&<button className="outline-button photo-add-button" onClick={()=>open(m)}><ImagePlus size={16}/>{m.imageData?'Trocar foto':'Adicionar foto'}</button>}
        </div></article>)}</div>
      {!list.length&&<div className="empty-state">Nenhum modelo encontrado.</div>}
    </section>
    {selected&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><section className="modal production-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">FOTO ÚNICA DO MODELO</span><h2>{selected.name}</h2><p>{selected.reference||'SEM CÓDIGO'}</p></div><button className="icon-button" onClick={()=>setSelected(null)}><X/></button></div>
      <div className="modal-form"><label className="production-image-field"><span>Foto representativa</span><div className="production-image-preview">{preview?<img src={preview} alt="Prévia da foto do modelo"/>:<><ImagePlus size={30}/><span>Selecionar foto</span></>}<input type="file" accept="image/*" onChange={e=>void upload(e.target.files?.[0])}/></div><small>A foto será reduzida e salva para esse modelo, não para cada tamanho ou cor.</small></label>
      {error&&<div className="production-alert">{error}</div>}
      <div className="modal-actions"><button className="outline-button" onClick={()=>setSelected(null)}>Cancelar</button>{preview&&<button className="outline-button" disabled={busy} onClick={()=>setPreview('')}><Trash2 size={16}/> Remover foto</button>}<button className="primary-button" disabled={busy} onClick={()=>void save()}><Upload size={16}/>{busy?'Salvando...':'Salvar foto'}</button></div></div>
    </section></div>}
  </div>;
}
