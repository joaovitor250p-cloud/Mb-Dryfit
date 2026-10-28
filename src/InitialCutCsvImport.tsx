import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDocFromServer, getDocs, query, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import * as XLSX from 'xlsx';
import { CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import { normalizeReference, normalizeText, type Model } from './lib/catalog';

type Row = {oc:string;name:string;reference:string;tailor:string;reason:string};
type Props = {db:Firestore;user:User;isAdmin:boolean;models:Model[];alreadyOcs:string[]};
const MARKER_ID = 'mb_referencias_csv_inicial_ocs';
const normalizeOc=(v:string)=>v.trim().normalize('NFKC').toLocaleUpperCase('pt-BR').replace(/\s+/g,' ');
const documentForOc=(oc:string)=>`oc_${encodeURIComponent(normalizeOc(oc))}`;
const columnKey=(s:string)=>normalizeText(s).replace(/[^a-z0-9]/g,'');
const pick=(obj:Record<string,unknown>,keys:string[])=>{
  const key=Object.keys(obj).find(k=>keys.some(pattern=>columnKey(k)===pattern));
  return key===undefined?'':String(obj[key]??'').trim();
};
export default function InitialCutCsvImport({db,user,isAdmin,models,alreadyOcs}:Props){
  const [imported,setImported]=useState(false);
  const [checking,setChecking]=useState(true);
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState<Row[]>([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const fileInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    if(!isAdmin)return;
    let active=true;
    getDocFromServer(doc(db,'audit_log',MARKER_ID)).then(s=>{if(active){setImported(s.exists());setChecking(false)}}).catch(e=>{if(active){setMessage(`Não foi possível verificar o CSV inicial: ${e.message}`);setChecking(false)}});
    return ()=>{active=false};
  },[db,isAdmin]);
  const preview=useMemo(()=>{
    const known=new Set(alreadyOcs.map(normalizeOc));
    const seen=new Set<string>();
    return rows.map(r=>{
      let reason=r.reason;
      if(!reason && known.has(normalizeOc(r.oc)))reason='OC já cadastrada — não será sobrescrita';
      if(!reason && seen.has(normalizeOc(r.oc)))reason='OC repetida no arquivo';
      seen.add(normalizeOc(r.oc));
      return {...r,reason};
    });
  },[rows,alreadyOcs]);
  const valid=preview.filter(r=>!r.reason);
  const readCsv=async(file?:File)=>{
    if(!file)return;
    setRows([]);setMessage('');
    try {
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
      const sheet=wb.Sheets[wb.SheetNames[0]];
      const raw=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:''});
      if(!raw.length)throw Error('A planilha está vazia.');
      if(raw.length>1500)throw Error('O CSV inicial deve ter no máximo 1.500 linhas.');
      const fields=Object.keys(raw[0]).map(columnKey);
      const needed=[['oc','ordemdecorte','numerodaoc','numeroc','nrooc'],['costureiro','responsavel','nomedocostureiro'],['modelo','nomedomodelo','nome','nomepeca','nomedapeca']];
      if(needed.some(list=>!list.some(k=>fields.includes(k))))throw Error('O arquivo precisa de colunas OC, Costureiro e Nome do modelo. REF é opcional.');
      const parsed=raw.map(row=>{
        const oc=normalizeOc(pick(row,needed[0]));
        const tailor=pick(row,needed[1]);
        const name=pick(row,needed[2]);
        const incomingRef=normalizeReference(pick(row,['ref','referencia','codigoextra','codigoref']));
        const found=models.filter(m=>normalizeText(m.name)===normalizeText(name));
        const model=found.length===1?found[0]:null;
        const reference=incomingRef||(model?.reference||'');
        let reason='';
        if(!oc||!name||!tailor)reason='Faltam OC, nome ou costureiro';
        else if(oc.length>80||name.length>250||tailor.length>120||reference.length>200)reason='Campo maior que o limite permitido';
        else if(model && incomingRef && model.reference && normalizeReference(model.reference)!==incomingRef)reason='REF diferente do modelo do catálogo — conferir';
        return {oc,name,reference,tailor,reason};
      });
      setRows(parsed);
    }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível ler o arquivo.');}
    if(fileInput.current)fileInput.current.value='';
  };
  const confirm=async()=>{
    if(busy||!isAdmin||!valid.length)return;
    if(!window.confirm(`Importar ${valid.length} OCs novas? Esta importação inicial é feita uma única vez e não substitui OCs existentes.`))return;
    setBusy(true);setMessage('');
    let created=0;
    try {
      const marker=doc(db,'audit_log',MARKER_ID);
      if((await getDocFromServer(marker)).exists())throw Error('A importação inicial já foi realizada. Atualize a página.');
      const existing=await getDocs(query(collection(db,'production_samples')));
      const existingOcs=new Set(existing.docs.map(d=>normalizeOc(String(d.data().oc||''))));
      const existingIds=new Set(existing.docs.map(d=>d.id));
      const toCreate=valid.filter(r=>!existingOcs.has(normalizeOc(r.oc))&&!existingIds.has(documentForOc(r.oc)));
      for(let i=0;i<toCreate.length;i+=35){
        const batch=writeBatch(db);
        for(const r of toCreate.slice(i,i+35)){
          batch.set(doc(db,'production_samples',documentForOc(r.oc)),{
            oc:r.oc,name:r.name,reference:r.reference,tailor:r.tailor,imageData:'',status:'in_progress',
            createdAt:serverTimestamp(),createdBy:user.uid,updatedAt:serverTimestamp(),updatedBy:user.uid,
            completedAt:null,completedBy:null
          });
        }
        await batch.commit();created+=Math.min(35,toCreate.length-i);
      }
      await setDoc(marker,{
        actorUid:user.uid,actorEmail:user.email||'',action:'importacao_csv_inicial_ocs',
        modelName:'CSV inicial de OCs',at:serverTimestamp(),
        before:null,after:{created,ignored:rows.length-created,total:rows.length}
      });
      setImported(true);setOpen(false);setRows([]);
      setMessage(`${created} OCs importadas. O cadastro inicial foi concluído e não aparecerá novamente.`);
    }catch(e){setMessage(`Foram criadas ${created} OCs antes do erro. Nenhum registro existente foi sobrescrito. É possível repetir a mesma planilha para completar: ${e instanceof Error?e.message:String(e)}`)}
    finally{setBusy(false)};
  };
  if(!isAdmin)return null;
  return <>
    {!checking&&!imported&&<button className="outline-button" disabled={busy} onClick={()=>setOpen(true)}><Upload size={16}/> Importar CSV inicial</button>}
    {message&&<div className="initial-csv-message" role="status">{message}</div>}
    {open&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false)}}><section className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Importar CSV inicial de produção">
      <div className="modal-head"><div><span className="eyebrow">CONFIGURAÇÃO INICIAL · UMA VEZ</span><h2>Importar OCs e costureiros</h2><p>Selecione seu CSV com <b>OC, Costureiro, Nome do modelo e REF</b>. As OCs existentes não serão modificadas.</p></div><button className="icon-button" title="Fechar" disabled={busy} onClick={()=>setOpen(false)}><X/></button></div>
      <label className="file-drop"><FileSpreadsheet size={24}/><strong>Escolher CSV, XLS ou XLSX</strong><span>Confira os dados antes da gravação no Firebase.</span><input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={e=>void readCsv(e.target.files?.[0])}/></label>
      {rows.length>0&&<><p className="csv-import-summary"><CheckCircle2 size={16}/> {rows.length} linhas · {valid.length} novas OCs · {rows.length-valid.length} itens para conferir/ignorar</p><div className="preview-list"><table><thead><tr><th>OC</th><th>NOME</th><th>REF</th><th>COSTUREIRO</th><th>SITUAÇÃO</th></tr></thead><tbody>{preview.slice(0,80).map((r,i)=><tr key={`${r.oc}-${i}`}><td>{r.oc}</td><td>{r.name}</td><td>{r.reference||'SEM CÓDIGO'}</td><td>{r.tailor}</td><td>{r.reason||'Importar'}</td></tr>)}</tbody></table></div>{rows.length>80&&<p className="helper-text">Exibindo as primeiras 80 linhas; todas serão verificadas.</p>}</>}
      {message&&<div className="production-alert" role="alert">{message}</div>}
      <div className="modal-actions"><button className="outline-button" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button><button className="primary-button" disabled={busy||!valid.length} onClick={()=>void confirm()}>{busy?'Importando...':`Confirmar ${valid.length} OCs`}</button></div>
    </section></div>}
  </>;
}
