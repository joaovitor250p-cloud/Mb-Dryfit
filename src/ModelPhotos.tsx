import { useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { Camera, ImagePlus, Search, Filter, Trash2, Upload, X, FileSpreadsheet, Pencil, Plus, Download } from 'lucide-react';
import { normalizeReference, normalizeText, sortModels, type Model } from './lib/catalog';
import { optimizePhoto } from './lib/photos';

type Props = {
  db: Firestore; user: User; canEdit: boolean; models: Model[];
  onAddModel:()=>void; onEditModel:(model:Model)=>void; onDeleteModel:(model:Model)=>void;
  onImportModels:()=>void; onExportModels:()=>void; onBackup:()=>void;
};
type PhotoRow = {name:string; reference:string; url:string; model:Model|null; status:string; selected:boolean; eligible:boolean};
const keyFor=(v:string)=>normalizeText(v).replace(/[.,;:()\-_/]/g,' ').replace(/\s+/g,' ').trim();
const isImageUrl=(url:string)=>{try {const p=new URL(url);return p.protocol==='https:' && !!p.hostname;}catch{return false}};
function imageLoads(url:string):Promise<boolean> {
  return new Promise(resolve=>{
    if(!isImageUrl(url))return resolve(false);
    const img=new Image();let done=false;
    const finish=(result:boolean)=>{if(done)return;done=true;clearTimeout(timer);img.onload=null;img.onerror=null;resolve(result)};
    const timer=setTimeout(()=>finish(false),12000);
    img.onload=()=>finish(img.naturalWidth>0);
    img.onerror=()=>finish(false);
    img.src=url;
  });
}

function readableFirestoreError(error:unknown):string {
  const err=error as {code?:string;message?:string};
  const code=String(err?.code||'');
  if(code.includes('permission-denied')) return 'O Firestore recusou a gravação (permission-denied). A gravação de imagem compactada foi negada. Confirme as regras PUBLICADAS de models e o perfil admin/editor. Nenhuma alteração foi feita.';
  if(code.includes('unavailable')||code.includes('deadline-exceeded'))return 'Firebase indisponível ou conexão interrompida. Confira a internet e tente novamente.';
  if(code.includes('unauthenticated'))return 'Seu login expirou. Entre novamente no sistema.';
  return `Erro ${code||'inesperado'}: ${err?.message||String(error)}`;
}

export default function ModelPhotos({db,user,canEdit,models,onAddModel,onEditModel,onDeleteModel,onImportModels,onExportModels,onBackup}:Props) {
  const [search,setSearch]=useState('');
  const [onlyMissing,setOnlyMissing]=useState(false);
  const [selected,setSelected]=useState<Model|null>(null);
  const [preview,setPreview]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [rows,setRows]=useState<PhotoRow[]|null>(null);
  const [report,setReport]=useState('');
  const [progress,setProgress]=useState('');
  const mappingInput=useRef<HTMLInputElement>(null);
  const list=useMemo(()=>sortModels(models,'reference').filter(m=>(!onlyMissing||!(m.imageData||m.fallbackImageData))&&[m.name,m.reference].some(v=>normalizeText(v).includes(normalizeText(search)))),[models,search,onlyMissing]);
  const open=(m:Model)=>{setSelected(m);setPreview(m.imageData||m.fallbackImageData||'');setMessage('');setError('')};
  const upload=async(file?:File)=>{if(!file)return;setBusy(true);setError('');try{setPreview(await optimizePhoto(file))}catch(e){setError(e instanceof Error?e.message:'Erro ao abrir a foto')}finally{setBusy(false)}};
  const save=async()=>{
    if(!selected||!canEdit)return;
    setBusy(true);setError('');
    try{
      if(preview && preview===selected.fallbackImageData && !selected.imageData)throw Error('Essa foto já aparece no catálogo por meio do CSV inicial. Para substituir, selecione uma foto do aparelho.');
      if(preview && !preview.startsWith('data:image/') && !isImageUrl(preview))throw Error('Use uma foto do aparelho ou uma URL HTTPS válida.');
      if(isImageUrl(preview) && !(await imageLoads(preview)))throw Error('A URL da imagem não carregou no navegador.');
      const savedPhoto = isImageUrl(preview) ? await compactPublicImage(preview) : preview;
      await runTransaction(db,async tx=>{
        const ref=doc(db,'models',selected.id),latest=await tx.get(ref);
        if(!latest.exists())throw Error('Este modelo não existe mais.');
        const current=String(latest.data().imageData||'');
        if(current!==String(selected.imageData||''))throw Error('A foto foi alterada por outra pessoa. Atualize a página.');
        tx.update(ref,{imageData:savedPhoto,updatedAt:serverTimestamp(),updatedBy:user.uid});
      });
      setSelected(null);setMessage(preview?'Foto compactada salva no Firebase.':'Foto removida do Firebase. Se houver foto do catálogo público, ela volta a aparecer.');
    }catch(e){setError(readableFirestoreError(e))}finally{setBusy(false)}
  };
  // Converte URLs públicas em imagem compactada, da mesma forma que o upload manual.
  // O navegador somente permite isso quando o servidor fornece CORS para a origem.
  const compactPublicImage = async (url: string): Promise<string> => {
    let response: Response;
    try {
      response = await fetch(url, {mode:'cors', credentials:'omit'});
    } catch {
      throw Error('A imagem abre na página, mas o servidor não autoriza sua conversão (CORS). A foto inicial já aparece pelo catálogo; para gravar uma cópia no Firebase, envie o arquivo pelo botão Escolher foto.');
    }
    if(!response.ok) throw Error(`Não foi possível baixar a imagem: HTTP ${response.status}.`);
    const blob = await response.blob();
    if(!blob.type.startsWith('image/')) throw Error('O endereço não retornou um arquivo de imagem.');
    if(blob.size > 12 * 1024 * 1024) throw Error('Imagem muito grande para compactar (limite de 12 MB).');
    return await optimizePhoto(new File([blob],'modelo.jpg',{type:blob.type}));
  };
  const readMapping=async(file?:File)=>{
    if(!file)return;
    setError('');setMessage('');setRows(null);setReport('');
    try{
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
      const raw=XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]],{defval:''});
      if(!raw.length)throw Error('O arquivo não contém linhas.');
      const keys=Object.keys(raw[0]);
      const find=(patterns:RegExp[])=>keys.find(k=>patterns.some(p=>p.test(k.trim())));
      const nameKey=find([/^nome do modelo$/i,/^modelo$/i,/^nome$/i,/^name$/i]);
      const refKey=find([/^ref(?:er[eê]ncia)?\.?$/i,/c[oó]digo extra/i,/refer[eê]ncia/i]);
      const urlKey=find([/^url(?: da imagem| da foto)?$/i,/imagem/i,/foto/i,/image/i]);
      if(!nameKey||!urlKey)throw Error('O arquivo precisa ter Nome do modelo e URL da imagem.');
      const seen=new Set<string>();
      const parsed:PhotoRow[]=raw.map(r=>{
        const name=String(r[nameKey]||'').trim(), reference=refKey?String(r[refKey]||'').trim():'',url=String(r[urlKey]||'').trim();
        const candidates=models.filter(m=>keyFor(m.name)===keyFor(name));
        const model=candidates.length===1?candidates[0]:null;
        const key=model?.id||keyFor(name);
        let status='Pronto para conferir';
        if(!name||!url)status='Linha incompleta';
        else if(!isImageUrl(url))status='URL inválida (use HTTPS)';
        else if(candidates.length===0)status='Modelo não encontrado';
        else if(candidates.length>1)status='Correspondência ambígua';
        else if(reference && normalizeReference(reference)!==normalizeReference(model?.reference||''))status='REF divergente — conferir manualmente';
        else if(seen.has(key))status='Modelo repetido no CSV';
        else if(model?.imageData||model?.fallbackImageData)status='Foto já disponível no catálogo';
        seen.add(key);
        return {name,reference,url,model,status,selected:status==='Pronto para conferir',eligible:status==='Pronto para conferir'};
      }).filter(r=>r.name||r.url);
      setRows(parsed);
      setReport(`Arquivo lido: ${parsed.length} linhas; ${parsed.filter(r=>r.status==='Pronto para conferir').length} correspondências por nome e REF; ${parsed.filter(r=>r.status==='Modelo não encontrado').length} não encontradas; ${parsed.filter(r=>r.status.includes('divergente')).length} divergências de REF. Nenhuma foto foi salva.`);
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível ler o arquivo.')}finally{if(mappingInput.current)mappingInput.current.value=''}
  };
  const importMappings=async()=>{
    if(!rows||!canEdit||busy)return;
    const ready=rows.filter(r=>r.selected&&r.eligible&&r.model);
    if(!ready.length){setError('Selecione uma foto pendente para importar.');return}
    if(!window.confirm(`Associar ${ready.length} fotos aos modelos? Nenhuma imagem existente será substituída.`))return;
    setBusy(true);setError('');setProgress(`Conferindo 0 de ${ready.length} fotos...`);
    let saved=0,failed=0,skipped=0,invalid=0;
    const outcomes=new Map<number,{status:string;selected:boolean;eligible:boolean}>();
    let firstError='',stopForPermissions=false;
    try {
      // Lotes pequenos: não sobrecarregam o Firebase nem deixam o usuário aguardando
      // centenas de requisições quando o banco estiver negando acesso.
      for(let start=0;start<ready.length;start++){
        if(stopForPermissions)break;
        await Promise.all(ready.slice(start,start+1).map(async row=>{
        const index=rows.indexOf(row);
        try {
          if(!row.model){skipped++;return}
          if(!(await imageLoads(row.url))){
            invalid++;outcomes.set(index,{status:'Imagem não carregou: verifique o endereço',selected:false,eligible:false});return;
          }
          const savedPhoto = await compactPublicImage(row.url);
          const ref=doc(db,'models',row.model.id);
          const updated=await runTransaction(db,async tx=>{
            const current=await tx.get(ref);
            if(!current.exists()||current.data().imageData)return false;
            if(normalizeReference(String(current.data().reference||''))!==normalizeReference(row.reference))return false;
            tx.update(ref,{imageData:savedPhoto,updatedAt:serverTimestamp(),updatedBy:user.uid});
            return true;
          });
          if(!updated){skipped++;outcomes.set(index,{status:'Já possui foto ou o cadastro mudou',selected:false,eligible:false});return}
          // Não informe sucesso enquanto o valor não puder ser lido de volta do servidor.
          const savedDoc=await getDocFromServer(ref);
          if(savedDoc.data()?.imageData!==savedPhoto)throw Error('Gravação não confirmada no servidor. Confira o modelo antes de repetir.');
          saved++;outcomes.set(index,{status:'Foto salva no modelo ✓',selected:false,eligible:false});
        }catch(e){
          failed++;
          const detail=readableFirestoreError(e);
          if(!firstError)firstError=detail;
          if(String((e as {code?:string})?.code||'').includes('permission-denied'))stopForPermissions=true;
          outcomes.set(index,{status:`Não foi salva: ${detail}`,selected:true,eligible:true});
        }
        }));
        setProgress(`Processadas ${Math.min(start+1,ready.length)} de ${ready.length} · ${saved} salvas · ${failed} com erro`);
        setRows(previous=>previous?.map((r,j)=>outcomes.has(j)?{...r,...outcomes.get(j)!}:r)||null);
      }
      setReport(`Resultado: ${saved} fotos SALVAS e confirmadas no Firestore; ${invalid} imagens inacessíveis; ${skipped} ignoradas; ${failed} falhas. ${stopForPermissions?'Importação interrompida porque o Firebase negou a gravação. ':''}${failed?'Os itens com erro continuam selecionados para uma nova tentativa.':''}`);
      if(firstError)setError(`Primeira falha: ${firstError}`);
      else if(saved)setMessage(`${saved} modelos receberam suas fotos. Elas aparecerão diretamente neste catálogo.`);
    }finally{setBusy(false);setProgress('')}
  };
  return <div className="page-wrap photos-page">
    
    <div className="page-heading"><div><span className="eyebrow">CATÁLOGO COMPARTILHADO</span><h1>Modelos e referências</h1><p>Foto, nome e REF juntos. Cada modelo tem apenas uma foto principal, utilizada também nos cortes.</p></div>
      <div className="heading-actions">
      {canEdit&&<button className="outline-button" onClick={onImportModels}><Upload size={16}/> Importar modelos</button>}
      {canEdit&&<button className="outline-button" onClick={()=>mappingInput.current?.click()}><Camera size={16}/> Importar CSV de fotos</button>}
      <button className="outline-button" onClick={onExportModels}><FileSpreadsheet size={16}/> Exportar Excel</button>
      <button className="outline-button" onClick={onBackup}><Download size={16}/> Backup</button>
      {canEdit&&<button className="primary-button" onClick={onAddModel}><Plus size={16}/> Novo modelo</button>}
      <input ref={mappingInput} type="file" accept=".csv,.xls,.xlsx" hidden onChange={e=>void readMapping(e.target.files?.[0])}/>
    </div>
    </div>
    <div className="production-ok">As 175 fotos já conferidas do CSV estão disponíveis como imagens iniciais do catálogo. As fotos adicionadas manualmente e salvas no Firebase prevalecem. Não é necessário importar novamente as mesmas 175 URLs.</div>
    <section className="stats-grid"><div className="stat-card"><div className="stat-icon blue"><Camera/></div><div><span>Modelos</span><strong>{models.length}</strong></div></div><div className="stat-card"><div className="stat-icon green"><ImagePlus/></div><div><span>Com foto</span><strong>{models.filter(m=>!!(m.imageData||m.fallbackImageData)).length}</strong></div></div><div className="stat-card"><div className="stat-icon amber"><Camera/></div><div><span>Sem foto</span><strong>{models.filter(m=>!(m.imageData||m.fallbackImageData)).length}</strong></div></div></section>
    <section className="catalog-panel"><div className="production-toolbar"><label className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar modelo ou REF..."/></label><label className="filter-select"><Filter size={15}/><input type="checkbox" checked={onlyMissing} onChange={e=>setOnlyMissing(e.target.checked)}/> Somente sem foto</label></div>
      {message&&<div className="production-ok">{message}</div>}{error&&<div className="production-alert">{error}</div>}{report&&<div className="production-ok">{report}</div>}{progress&&<div className="production-ok" role="status">{progress}</div>}
      {rows&&<div className="catalog-panel mapping-panel"><h2>Conferência antes de importar</h2><p>Marque as fotos que deseja associar. O nome deve corresponder ao modelo e a REF informada também precisa coincidir. Cores e tamanhos não criam novos modelos. Fotos existentes não serão substituídas.</p><div className="table-scroll"><table><thead><tr><th>Usar</th><th>Imagem</th><th>Modelo do CSV</th><th>REF</th><th>Conferência</th></tr></thead><tbody>{rows.map((r,i)=><tr key={`${r.name}-${i}`}><td><input type="checkbox" checked={r.selected} disabled={!r.eligible||busy} onChange={e=>setRows(previous=>previous?.map((p,j)=>i===j?{...p,selected:e.target.checked}:p)||null)}/></td><td>{isImageUrl(r.url)?<a href={r.url} target="_blank" rel="noreferrer"><img style={{width:72,height:80,objectFit:'cover',borderRadius:8}} src={r.url} alt={r.name} loading="lazy"/></a>:'—'}</td><td>{r.name}</td><td>{r.reference||'—'}</td><td>{r.status}{r.model&&<small> → {r.model.name}</small>}</td></tr>)}</tbody></table></div><div className="modal-actions"><button className="outline-button" onClick={()=>setRows(null)}>Cancelar</button><button className="primary-button" disabled={busy} onClick={()=>void importMappings()}><Upload size={16}/>{busy?'Conferindo e importando...':'Confirmar fotos selecionadas'}</button></div></div>}
      <div className="production-grid photos-grid">{list.map(m=><article className="production-card" key={m.id}><div className="production-photo model-image">{(m.imageData||m.fallbackImageData)?<img src={m.imageData||m.fallbackImageData} alt={'Foto de '+m.name} loading="lazy"/>:<div className="model-photo-placeholder"><ImagePlus size={32}/><span>Sem foto</span></div>}</div><div className="production-details"><h3>{m.name}</h3><div className="model-photo-ref">{m.reference||'SEM CÓDIGO'}</div>{m.pendingReview&&<span className="status-badge pending">REF em conferência</span>}<div className="model-card-actions">{canEdit&&<><button className="outline-button" onClick={()=>open(m)}><ImagePlus size={16}/>{(m.imageData||m.fallbackImageData)?'Trocar foto':'Adicionar foto'}</button><button className="outline-button" onClick={()=>onEditModel(m)}><Pencil size={16}/> Editar</button><button className="icon-button" onClick={()=>onDeleteModel(m)} title="Excluir modelo"><Trash2 size={16}/></button></>}</div></div></article>)}</div>
      {!list.length&&<div className="empty-state"><Search size={22}/> Nenhum modelo encontrado.</div>}
    </section>
    {selected&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><section className="modal production-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><h2>Foto principal do modelo</h2><p>{selected.name} · {selected.reference||'SEM CÓDIGO'}</p></div><button className="icon-button" onClick={()=>setSelected(null)}><X/></button></div><div className="modal-form"><div className="production-image-preview">{preview?<img src={preview} alt="Prévia"/>:<span>Sem foto</span>}</div><label>Escolher foto do aparelho<input type="file" accept="image/*" onChange={e=>void upload(e.target.files?.[0])}/></label><label>Ou usar URL pública HTTPS<input value={preview.startsWith('data:')?'':preview} onChange={e=>setPreview(e.target.value.trim())} placeholder="https://storage.googleapis.com/..."/></label>{error&&<div className="production-alert">{error}</div>}<div className="modal-actions"><button className="outline-button" onClick={()=>setPreview('')}><Trash2 size={16}/> Remover</button><button className="outline-button" onClick={()=>setSelected(null)}>Cancelar</button><button className="primary-button" disabled={busy} onClick={()=>void save()}>{busy?'Salvando...':'Salvar foto'}</button></div></div></section></div>}
  </div>;
}
