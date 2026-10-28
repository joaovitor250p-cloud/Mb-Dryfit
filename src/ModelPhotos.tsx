import { useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { Camera, ImagePlus, Search, Trash2, Upload, X, FileSpreadsheet, ExternalLink, Filter } from 'lucide-react';
import { normalizeText, sortModels, type Model } from './lib/catalog';
import { optimizePhoto } from './lib/photos';

type Props = {db: Firestore; user: User; canEdit: boolean; models: Model[]};
type PhotoRow = { name:string; reference:string; url:string; model:Model|null; status:string };
const keyFor=(v:string)=>normalizeText(v).replace(/[.,;:()\-_/]/g,' ').replace(/\s+/g,' ').trim();

export default function ModelPhotos({db,user,canEdit,models}: Props) {
  const [search,setSearch]=useState('');
  const [onlyMissing,setOnlyMissing]=useState(false);
  const [selected,setSelected]=useState<Model|null>(null);
  const [preview,setPreview]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [rows,setRows]=useState<PhotoRow[]|null>(null);
  const [report,setReport]=useState('');
  const mappingInput=useRef<HTMLInputElement>(null);
  const list=useMemo(()=>sortModels(models,'reference').filter(m=>(!onlyMissing||!m.imageData)&&[m.name,m.reference].some(v=>normalizeText(v).includes(normalizeText(search)))),[models,search,onlyMissing]);
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
      setSelected(null);setMessage(preview?'Foto do modelo salva e sincronizada para todos os aparelhos.':'Foto removida do modelo e sincronizada.');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar a foto')}
    finally{setBusy(false)}
  };
  const readMapping=async(file?:File)=>{
    if(!file)return;
    setError('');setMessage('');setRows(null);setReport('');
    try{
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
      const sheet=wb.Sheets[wb.SheetNames[0]];
      const raw=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:''});
      if(!raw.length)throw Error('O arquivo não contém linhas.');
      const keys=Object.keys(raw[0]);
      const find=(patterns:RegExp[])=>keys.find(k=>patterns.some(p=>p.test(k.trim())));
      const nameKey=find([/^nome do modelo$/i,/^modelo$/i,/^nome$/i,/^name$/i]);
      const refKey=find([/^ref(?:er[eê]ncia)?\.?$/i,/c[oó]digo extra/i,/refer[eê]ncia/i]);
      const urlKey=find([/^url(?: da imagem| da foto)?$/i,/imagem/i,/foto/i,/image/i]);
      if(!nameKey||!urlKey)throw Error('A planilha precisa ter as colunas Nome do modelo e URL da imagem. REF é opcional.');
      const parsed:PhotoRow[]=raw.map(r=>{
        const name=String(r[nameKey]||'').trim(), reference=refKey?String(r[refKey]||'').trim():'', url=String(r[urlKey]||'').trim();
        const candidates=models.filter(m=>keyFor(m.name)===keyFor(name));
        const model=candidates.length===1?candidates[0]:null;
        return {name,reference,url,model,status:!name||!url?'Linha incompleta':!/^https?:\\/\\//i.test(url)?'URL inválida':candidates.length===0?'Modelo não encontrado':candidates.length>1?'Correspondência ambígua':model?.imageData?'Já possui foto':'Pronto para conferir'};
      }).filter(r=>r.name||r.url);
      setRows(parsed);
      setReport(`Prévia: ${parsed.filter(r=>r.status==='Pronto para conferir').length} correspondências seguras pelo nome exato, ${parsed.filter(r=>r.status==='Modelo não encontrado').length} sem modelo correspondente e ${parsed.filter(r=>r.status==='Correspondência ambígua').length} ambíguas. Nenhuma foto foi salva ainda.`);
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível ler o arquivo.');}
    finally{if(mappingInput.current)mappingInput.current.value='';}
  };
  const importMappings=async()=>{
    if(!rows||!canEdit)return;
    const ready=rows.filter(r=>r.status==='Pronto para conferir'&&r.model);
    if(!ready.length){setError('Não há correspondências prontas para importar.');return;}
    if(!window.confirm(`Salvar ${ready.length} link(s) de foto? Fotos existentes não serão substituídas. As imagens permanecerão hospedadas no catálogo de origem.`))return;
    setBusy(true);setError('');let saved=0,failed=0,skipped=0;
    for(const row of ready){
      try{
        if(!row.model||row.model.imageData){skipped++;continue;}
        // Keep the publicly accessible source URL; do not copy image bytes/Base64 into Firestore.
        await updateDoc(doc(db,'models',row.model.id),{imageData:row.url,updatedAt:serverTimestamp(),updatedBy:user.uid});
        saved++;
      }catch{failed++;}
    }
    setReport(`Resultado da importação: ${saved} link(s) de foto salvos, ${failed} falharam ao atualizar o Firestore e ${skipped} foram ignorados. As imagens continuam hospedadas na origem pública; se o fornecedor remover ou alterar os links, será necessário atualizar as fotos.`);
    setRows(rows.map(r=>r.status==='Pronto para conferir'&&r.model?{...r,status:r.model.imageData?'Já possui foto':'Processado, confira o resultado'}:r));
    setBusy(false);
  };
  const startCatalogSearch=()=>{
    setMessage('O catálogo externo pode carregar os produtos por JavaScript e bloquear leitura por outro domínio. Vou abrir o catálogo para consulta; para importar com segurança, use uma planilha de correspondência com Nome do modelo, REF (opcional) e URL da imagem. O sistema só aceita correspondência pelo nome exato e não substitui fotos existentes.');
    window.open('https://meucomercio.com.br/mbdryfit','_blank','noopener,noreferrer');
    mappingInput.current?.click();
  };
  return <div className="page-wrap photos-page">
    <div className="page-heading"><div><span className="eyebrow">FOTOS POR MODELO</span><h1>Fotos dos modelos</h1><p>Uma foto principal por modelo. Tamanhos e cores não viram modelos separados; diferenças reais de estampa, bordado ou recorte precisam continuar separadas.</p></div>
      {canEdit&&<div className="heading-actions"><button className="outline-button" onClick={()=>mappingInput.current?.click()}><FileSpreadsheet size={16}/> Importar CSV de fotos</button><button className="primary-button" onClick={startCatalogSearch}><ExternalLink size={16}/> Buscar fotos do catálogo</button><input ref={mappingInput} type="file" accept=".csv,.xls,.xlsx" hidden onChange={e=>void readMapping(e.target.files?.[0])}/></div>}
    </div>
    <section className="stats-grid"><div className="stat-card"><div className="stat-icon blue"><Camera/></div><div><span>Total de modelos</span><strong>{models.length}</strong><small>Catálogo existente</small></div></div><div className="stat-card"><div className="stat-icon green"><ImagePlus/></div><div><span>Com foto</span><strong>{models.filter(m=>!!m.imageData).length}</strong><small>Uma imagem por modelo</small></div></div><div className="stat-card"><div className="stat-icon amber"><Camera/></div><div><span>Sem foto</span><strong>{models.filter(m=>!m.imageData).length}</strong><small>Podem receber foto depois</small></div></div></section>
    <section className="catalog-panel"><div className="production-toolbar"><label className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome ou REF..."/></label><label className="filter-select"><Filter size={15}/><input type="checkbox" checked={onlyMissing} onChange={e=>setOnlyMissing(e.target.checked)}/> Mostrar apenas sem foto</label></div>
      {message&&<div className="production-ok">{message}</div>}{error&&<div className="production-alert">{error}</div>}{report&&<div className="production-ok">{report}</div>}
      {rows&&<div className="catalog-panel mapping-panel"><h2>Prévia de correspondências</h2><p>Somente nome exato é usado para associar a imagem. A REF serve como conferência, pois pode ser compartilhada por modelos diferentes. Fotos já existentes não serão sobrescritas.</p><div className="table-scroll"><table><thead><tr><th>Modelo do arquivo</th><th>REF</th><th>URL da imagem</th><th>Correspondência</th></tr></thead><tbody>{rows.map((r,i)=><tr key={`${r.name}-${i}`}><td>{r.name||'—'}</td><td>{r.reference||'—'}</td><td><a href={r.url} target="_blank" rel="noreferrer">{r.url||'—'}</a></td><td>{r.status}{r.model&&<small> → {r.model.name}</small>}</td></tr>)}</tbody></table></div><div className="modal-actions"><button className="outline-button" onClick={()=>setRows(null)}>Cancelar</button><button className="primary-button" disabled={busy} onClick={()=>void importMappings()}><Upload size={16}/>{busy?'Importando...':'Importar correspondências seguras'}</button></div></div>}
      <div className="production-grid photos-grid">{list.map(m=><article className="production-card" key={m.id}>
        <div className="production-photo model-image">{m.imageData?<img src={m.imageData} alt={'Foto de '+m.name}/>:<div className="model-photo-placeholder"><ImagePlus size={32}/><span>Sem foto</span></div>}<span className={`production-status ${m.imageData?'done':'in_progress'}`}>{m.imageData?'Com foto':'Sem foto'}</span></div>
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
