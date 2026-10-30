import { useState } from 'react';
import { collection, getDocs, type Firestore } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, ShieldCheck, X } from 'lucide-react';
import type { Model } from './lib/catalog';
import { safeProviderMessage } from './lib/safeMessage';

type Fields = {name:boolean;reference:boolean;image:boolean;oc:boolean;tailor:boolean;status:boolean;date:boolean};
type Groups = {models:boolean;cuts:boolean;users:boolean;history:boolean};
// Os registros incluem campos de dados dinâmicos além do identificador.
// A tipagem anterior inferia apenas { id: string }, causando TS2339 no build.
type ExportDocument = {id:string} & Record<string,unknown>;
type Props={db:Firestore;models:Model[];admin:boolean;onClose:()=>void};
const defaults:Fields={name:true,reference:true,image:false,oc:true,tailor:true,status:true,date:true};
const dateText=(v:unknown)=>{
  const x=v as {toDate?:()=>Date;seconds?:number}|string|null;
  if(typeof x==='string')return x;
  if(x&&typeof x.toDate==='function')return x.toDate().toISOString();
  if(x&&typeof x.seconds==='number')return new Date(x.seconds*1000).toISOString();
  return '';
};
const sanitize=(v:unknown):unknown=>{
  if(v&&typeof v==='object'){
    if(typeof (v as {toDate?:()=>Date}).toDate==='function')return (v as {toDate:()=>Date}).toDate().toISOString();
    if(Array.isArray(v))return v.map(sanitize);
    return Object.fromEntries(Object.entries(v).map(([k,value])=>[k,sanitize(value)]));
  }
  return v;
};
// Registros antigos em 'store' permanecem armazenados, mas são exibidos como Pronto.
const statusText=(s:unknown)=>s==='done'||s==='store'?'PRONTO':'EM ANDAMENTO';
const imageCell=(image:unknown, fallback:unknown)=>{
  const value=String(image||'');
  if(value.startsWith('https://'))return value;
  if(value.startsWith('data:image/'))return 'Foto salva no sistema — disponível no backup JSON';
  return typeof fallback==='string'&&fallback.startsWith('https://')?fallback:'';
};
const choices:{key:keyof Fields;label:string}[]=[
 {key:'name',label:'Nome do modelo'},
 {key:'reference',label:'Referência (REF)'},
 {key:'image',label:'Foto / link da imagem'},
 {key:'oc',label:'Número da OC'},
 {key:'tailor',label:'Costureiro'},
 {key:'status',label:'Status do corte'},
 {key:'date',label:'Datas'}
];
export default function BackupExport({db,models,admin,onClose}:Props){
 const [groups,setGroups]=useState<Groups>({models:true,cuts:true,users:false,history:false});
 const [fields,setFields]=useState<Fields>(defaults);
 const [format,setFormat]=useState<'xlsx'|'json'>('xlsx');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const toggleGroup=(k:keyof Groups)=>setGroups(s=>({...s,[k]:!s[k]}));
 const toggleField=(k:keyof Fields)=>setFields(s=>({...s,[k]:!s[k]}));
 const exportNow=async()=>{
   if(!Object.values(groups).some(Boolean)){setError('Escolha pelo menos uma seção.');return}
   if(format==='xlsx'&&!Object.values(fields).some(Boolean)){setError('Selecione pelo menos um campo.');return}
   setBusy(true);setError('');
   try {
     const get=async(name:string):Promise<ExportDocument[]> =>
       (await getDocs(collection(db,name))).docs.map(d=>({ ...d.data(), id:d.id } as ExportDocument));
     // Use dados atualizados do servidor; o catálogo visto na tela não é usado como substituto.
     const sourceModels=(groups.models||(groups.cuts&&fields.image))?await get('models'):[];
     const modelRows=groups.models?sourceModels:[];
     const cutsRows=groups.cuts?await get('production_samples'):[];
     const rolesRows=groups.users&&admin?await get('user_roles'):[];
     const auditRows=groups.history&&admin?await get('audit_log'):[];
     const fallback=new Map(models.map(m=>[m.id,m.fallbackImageData||'']));
     const modelByName=new Map(sourceModels.map(r=>[String(r.name||'').trim().toLocaleLowerCase('pt-BR'),r]));
     const suffix=new Date().toISOString().slice(0,10);
     if(format==='json'){
       // JSON é backup fiel dos documentos, inclusive fotos Base64 salvas manualmente.
       const body={system:'MB REFERENCIAS',exportedAt:new Date().toISOString(),
         collections:{models:modelRows.map(sanitize),production_samples:cutsRows.map(sanitize),
           user_roles:rolesRows.map(sanitize),audit_log:auditRows.map(sanitize)},
         photoLinks:modelRows.map(r=>({id:r.id,fallbackImageData:fallback.get(String(r.id))||''})),
         note:'Arquivo de backup para guarda segura. Não publicar no GitHub: pode conter fotos e dados de usuários.'};
       const blob=new Blob([JSON.stringify(body,null,2)],{type:'application/json'});
       const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`MB_REFERENCIAS_BACKUP_${suffix}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
     }else{
       const book=XLSX.utils.book_new();
       const add=(name:string,rows:Record<string,unknown>[])=>{
         const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{'SEM REGISTROS':'Nenhum registro selecionado'}]);
         const cols=Object.keys(rows[0]||{'SEM REGISTROS':''}).map(h=>({wch:Math.min(48,Math.max(17,h.length+7))}));
         ws['!cols']=cols;XLSX.utils.book_append_sheet(book,ws,name);
       };
       if(groups.models){
         const rows=modelRows.map(r=>{
           const data:Record<string,unknown>={};
           if(fields.name)data['MODELO']=r.name||'';
           if(fields.reference)data['REFERÊNCIA']=r.reference||'SEM CÓDIGO';
           if(fields.image)data['FOTO / URL']=imageCell(r.imageData,fallback.get(String(r.id)));
           if(fields.date)data['ATUALIZADO EM']=dateText(r.updatedAt);
           return data;
         });add('MODELOS',rows);
       }
       if(groups.cuts){
         const rows=cutsRows.map(r=>{
           const data:Record<string,unknown>={};
           if(fields.oc)data['OC']=String(r.oc||'');
           if(fields.name)data['MODELO']=r.name||'';
           if(fields.reference)data['REF']=r.reference||'SEM CÓDIGO';
           if(fields.tailor)data['COSTUREIRO']=r.tailor||'';
           if(fields.status)data['STATUS']=statusText(r.status);
           if(fields.image)data['FOTO / URL']=imageCell(r.imageData,modelByName.get(String(r.name||'').trim().toLocaleLowerCase('pt-BR'))?.imageData||fallback.get(String(modelByName.get(String(r.name||'').trim().toLocaleLowerCase('pt-BR'))?.id||''))||'');
           if(fields.date){data['CADASTRADO EM']=dateText(r.createdAt);data['PRONTO EM']=dateText(r.completedAt)}
           return data;
         });add('CORTES',rows);
       }
       if(groups.users&&admin)add('USUARIOS',rolesRows.map(r=>({UID:r.id,EMAIL:r.email||'',PERFIL:r.role||''})));
       if(groups.history&&admin)add('HISTORICO',auditRows.map(r=>({ACAO:r.action||'',ITEM:r.modelName||'',USUARIO:r.actorEmail||'',DATA:dateText(r.at)})));
       XLSX.writeFile(book,`MB_REFERENCIAS_EXPORTACAO_${suffix}.xlsx`);
     }
     onClose();
   }catch(e){setError(`Erro ao exportar: ${safeProviderMessage(e)}`)}finally{setBusy(false)}
 };
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
  <section className="modal modal-wide backup-export-modal" role="dialog" aria-modal="true" aria-label="Backup e exportação">
   <div className="modal-head"><div><span className="eyebrow">BACKUP / EXPORTAR</span><h2>Escolha o que deseja exportar</h2><p>Planilha Excel com os campos escolhidos ou backup JSON completo.</p></div><button className="icon-button" disabled={busy} title="Fechar" onClick={onClose}><X/></button></div>
   <div className="export-section"><strong>1. Conteúdo</strong><div className="export-check-grid">
    <label><input type="checkbox" checked={groups.models} onChange={()=>toggleGroup('models')}/> Catálogo de modelos</label>
    <label><input type="checkbox" checked={groups.cuts} onChange={()=>toggleGroup('cuts')}/> Amostras e cortes (todas as OCs)</label>
    {admin&&<label><input type="checkbox" checked={groups.users} onChange={()=>toggleGroup('users')}/> Usuários e permissões</label>}
    {admin&&<label><input type="checkbox" checked={groups.history} onChange={()=>toggleGroup('history')}/> Histórico</label>}
   </div></div>
   <div className="export-section"><strong>2. Campos da planilha</strong><div className="export-check-grid">{choices.map(item=><label key={item.key}><input type="checkbox" checked={fields[item.key]} disabled={format==='json'} onChange={()=>toggleField(item.key)}/>{item.label}</label>)}</div></div>
   <div className="export-section"><strong>3. Formato</strong><div className="export-formats"><label><input type="radio" name="export-format" checked={format==='xlsx'} onChange={()=>setFormat('xlsx')}/><FileSpreadsheet size={18}/> Planilha Excel (.xlsx)</label><label><input type="radio" name="export-format" checked={format==='json'} onChange={()=>setFormat('json')}/><ShieldCheck size={18}/> Backup completo (.json)</label></div><p className="helper-text">O Excel exporta links das fotos. Fotos guardadas como imagem compactada são preservadas no backup JSON. Não publique arquivos de backup que contenham dados pessoais.</p></div>
   {error&&<div className="production-alert" role="alert">{error}</div>}
   <div className="modal-actions"><button className="outline-button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} onClick={()=>void exportNow()}><Download size={17}/>{busy?'Preparando...':`Exportar ${format==='xlsx'?'planilha':'backup'}`}</button></div>
  </section>
 </div>;
}
