import { createPortal } from 'react-dom';
import { useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore, DocumentData } from 'firebase/firestore';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Building2, CheckCircle2, Copy, MapPin, Pencil, Phone, Plus, Search, Store, Trash2, X } from 'lucide-react';
import { TAILORS, eligibleTypes, TYPES, parsePrice } from './lib/referencePrices';
import { PageActiveContext, readPageMemory, usePageMemory } from './lib/pageMemory';
import { safeProviderMessage } from './lib/safeMessage';

type Props = { db: Firestore; user: User; canEdit: boolean };
type SpecialPrice = { reference: string; type: string; price: string };
type Service = { name: string; price: string }; // dados antigos: preservados sem reexibir o cadastro de peças e preços
export type Workshop = { id:string; name:string; phone:string; pix:string; address:string; types:string[]; specialPrices:SpecialPrice[]; services:Service[]; notes:string; createdBy?:string };
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const fromDoc=(id:string,d:DocumentData):Workshop=>({id,name:String(d.name||''),phone:String(d.phone||''),pix:String(d.pix||''),address:String(d.address||''),types:Array.isArray(d.types)?d.types:[],specialPrices:Array.isArray(d.specialPrices)?d.specialPrices:[],services:Array.isArray(d.services)?d.services:[],notes:String(d.notes||''),createdBy:String(d.createdBy||'')});

export default function WorkshopsPage({db,user,canEdit}:Props){
  const pageActive=useContext(PageActiveContext);
  const key=`mb-referencias:${user.uid}:workshops`;
  const [initial]=useState(()=>readPageMemory(key,{queryText:''}));
  const [items,setItems]=useState<Workshop[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [search,setSearch]=useState(String(initial.queryText||'')),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [open,setOpen]=useState(false),[editing,setEditing]=useState<Workshop|null>(null);
  const [name,setName]=useState(''),[phone,setPhone]=useState(''),[pix,setPix]=useState(''),[address,setAddress]=useState(''),[notes,setNotes]=useState('');
  const [types,setTypes]=useState<string[]>([]),[specialPrices,setSpecialPrices]=useState<SpecialPrice[]>([]);
  const [pricesExpanded,setPricesExpanded]=useState(false);
  usePageMemory(key,{queryText:search},!loading);
  useEffect(()=>{if(!pageActive)return;return onSnapshot(query(collection(db,'workshops'),orderBy('name')),s=>{setItems(s.docs.map(d=>fromDoc(d.id,d.data())));setLoading(false);setError('')},e=>{setError('Não foi possível carregar as oficinas: '+safeProviderMessage(e));setLoading(false)})},[db,pageActive]);
  const filtered=useMemo(()=>{const q=norm(search);return q?items.filter(w=>norm([w.name,w.phone,w.pix,w.address,w.notes,...w.types].join(' ')).includes(q)):items},[items,search]);
  const notify=(text:string,bad=false)=>{setError(bad?text:'');setNotice(bad?'':text)};
  const reset=()=>{setPricesExpanded(false);setEditing(null);setName('');setPhone('');setPix('');setAddress('');setTypes([]);setSpecialPrices([]);setNotes('');setOpen(false)};
  const add=()=>{reset();setOpen(true)};
  const edit=(item:Workshop)=>{setPricesExpanded(false);setEditing(item);setName(item.name);setPhone(item.phone);setPix(item.pix);setAddress(item.address);setTypes([...item.types]);setSpecialPrices(item.specialPrices.map(x=>({...x})));setNotes(item.notes);setOpen(true)};
  const save=async()=>{
    if(!canEdit||busy)return;
    if(!name.trim())return notify('Informe o nome da oficina.',true);
    if(address.length>800)return notify('O endereço deve ter no máximo 800 caracteres.',true);
    const valid=specialPrices.filter(x=>x.reference.trim()||x.price.trim());
    if(valid.some(x=>!x.reference.trim()||!Number.isFinite(parsePrice(x.price))||parsePrice(x.price)<0))return notify('Confira a REF e o valor dos preços especiais.',true);
    setBusy(true);
    try{
      const payload={name:name.trim(),phone:phone.trim(),pix:pix.trim(),address:address.trim(),types,
        specialPrices:valid.map(x=>({reference:x.reference.trim().toUpperCase(),type:x.type,price:x.price.trim()})),
        services:editing?.services||[], // não apagar os serviços antigos ao editar outro dado
        notes:notes.trim(),updatedAt:serverTimestamp(),updatedBy:user.uid};
      if(editing)await updateDoc(doc(db,'workshops',editing.id),payload);
      else await setDoc(doc(collection(db,'workshops')),{...payload,createdAt:serverTimestamp(),createdBy:user.uid});
      reset();notify(editing?'Oficina atualizada.':'Oficina cadastrada.');
    }catch(e){notify(safeProviderMessage(e,'Não foi possível salvar a oficina.'),true)}finally{setBusy(false)}
  };
  const remove=async(item:Workshop)=>{
    if(!canEdit||busy||!window.confirm(`Excluir a oficina "${item.name}"?`))return;
    setBusy(true);try{await deleteDoc(doc(db,'workshops',item.id));notify('Oficina excluída.')}catch(e){notify(safeProviderMessage(e),true)}finally{setBusy(false)}
  };
  const copy=async(value:string,field:string)=>{try{await navigator.clipboard.writeText(value);notify(`${field} copiado.`)}catch{notify('Não foi possível copiar. Selecione e copie o texto manualmente.',true)}};
  const importTailors=async()=>{
    if(!canEdit||busy||!window.confirm('Cadastrar ou completar os 9 costureiros iniciais? Os dados existentes serão preservados.'))return;
    setBusy(true);
    try{let added=0,updated=0;
      for(const person of TAILORS){
        const specials:SpecialPrice[]=person==='Mauro'?[{reference:'10088',type:'Camiseta',price:'4,00'},{reference:'10216',type:'Camiseta',price:'4,00'},{reference:'10089',type:'Camiseta',price:'4,00'},{reference:'10002',type:'M.L.',price:'6,00'}]:[];
        const existing=items.find(w=>norm(w.name)===norm(person));
        if(existing){const nextTypes=[...new Set([...existing.types,...eligibleTypes(person)])],nextSpecials=[...existing.specialPrices];
          for(const sp of specials)if(!nextSpecials.some(x=>x.reference===sp.reference&&x.type===sp.type))nextSpecials.push(sp);
          if(nextTypes.length!==existing.types.length||nextSpecials.length!==existing.specialPrices.length){await updateDoc(doc(db,'workshops',existing.id),{types:nextTypes,specialPrices:nextSpecials,updatedAt:serverTimestamp(),updatedBy:user.uid});updated++}
        }else{await setDoc(doc(collection(db,'workshops')),{name:person,phone:'',pix:'',address:'',types:eligibleTypes(person),specialPrices:specials,services:[],notes:'',createdAt:serverTimestamp(),createdBy:user.uid,updatedAt:serverTimestamp(),updatedBy:user.uid});added++}
      }notify(`${added} costureiros cadastrados, ${updated} complementados.`)
    }catch(e){notify(safeProviderMessage(e),true)}finally{setBusy(false)}
  };
  return <div className="page-wrap extra-page workshops-page workshops-simple">
    <div className="page-heading"><div className="page-heading-copy"><span className="eyebrow">CONFIGURAÇÕES / PARCEIROS</span><h1>Oficinas</h1><p>Contatos, PIX, endereço e condições por referência, em um cadastro simples e rápido.</p></div>
      {canEdit&&<div className="heading-actions"><button className="outline-button" onClick={()=>void importTailors()} disabled={busy}>Importar costureiros</button><button className="primary-button" onClick={add} disabled={busy}><Plus size={16}/> Nova oficina</button></div>}</div>
    {error&&<div className="production-alert" role="alert">{error}</div>}{notice&&<div className="production-ok"><CheckCircle2 size={16}/>{notice}</div>}
    <section className="catalog-panel workshops-directory"><div className="production-toolbar"><label className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar oficina, telefone, endereço ou PIX..."/></label><span className="office-result-count">{filtered.length} oficina(s)</span></div>
      {loading?<div className="empty-state">Carregando oficinas...</div>:!filtered.length?<div className="empty-state"><Store size={24}/><strong>Nenhuma oficina encontrada</strong></div>:
      <div className="office-directory-list">{filtered.map(item=><article key={item.id} className="office-directory-row">
        <div className="office-directory-avatar"><Building2 size={21}/></div>
        <div className="office-directory-main"><strong>{item.name}</strong><small>{item.types.join(' · ')||'Produção não informada'}</small>{item.address&&<span className="office-directory-address"><MapPin size={14}/>{item.address}</span>}</div>
        <div className="office-directory-contact"><span><Phone size={14}/>{item.phone?<a href={`tel:${item.phone.replace(/[^\d+]/g,'')}`}>{item.phone}</a>:'WhatsApp não informado'}</span><span className="office-pix-text"><b>PIX</b> {item.pix||'Não informado'}</span></div>
        <div className="office-directory-actions">{item.pix&&<button className="outline-button" title={`Copiar PIX de ${item.name}`} onClick={()=>void copy(item.pix,'PIX')}><Copy size={14}/> PIX</button>}{canEdit&&<><button className="outline-button" onClick={()=>edit(item)}><Pencil size={14}/> Editar</button><button className="icon-button office-delete" onClick={()=>void remove(item)} aria-label={`Excluir oficina ${item.name}`} title={`Excluir ${item.name}`}><Trash2 size={15}/></button></>}</div>
      </article>)}</div>}</section>
    {open&&pageActive&&createPortal(<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)reset()}}><section className="modal extra-modal workshop-modal" role="dialog" aria-modal="true" aria-label="Cadastro de oficina"><div className="modal-head"><div><span className="eyebrow">OFICINAS</span><h2>{editing?'Editar oficina':'Nova oficina'}</h2><p>Cadastre os dados de contato e os preços especiais necessários.</p></div><button className="icon-button" onClick={reset} aria-label="Fechar"><X/></button></div>
      <form className="modal-form" onSubmit={e=>{e.preventDefault();void save()}}>
        <label>Nome da oficina / costureiro *<input required maxLength={250} value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Mauro"/></label>
        <div className="office-form-pair"><label>WhatsApp / telefone<input value={phone} maxLength={60} onChange={e=>setPhone(e.target.value)} placeholder="(11) 99999-9999"/></label><label>Chave PIX<input value={pix} maxLength={250} onChange={e=>setPix(e.target.value)} placeholder="Chave do responsável"/></label></div>
        <label>Endereço completo<textarea rows={2} maxLength={800} value={address} onChange={e=>setAddress(e.target.value)} placeholder="Rua, número, bairro, cidade, CEP"/></label>
        <div className="office-form-types"><strong>O que produz</strong><div className="price-types">{TYPES.map(t=><label key={t}><input type="checkbox" checked={types.includes(t)} onChange={e=>setTypes(v=>e.target.checked?[...v,t]:v.filter(x=>x!==t))}/>{t}</label>)}</div></div>
        <details className="office-overrides" onToggle={e=>setPricesExpanded(e.currentTarget.open)}><summary>Preços especiais por referência <span>({specialPrices.length})</span></summary><p>Opcional: se não houver preço especial, será utilizado o preço de REF padrão. Os valores cadastrados continuam editáveis.</p>{pricesExpanded&&specialPrices.map((x,i)=><div className="price-form" key={i}><select value={x.type} onChange={e=>setSpecialPrices(v=>v.map((a,j)=>i===j?{...a,type:e.target.value}:a))}>{TYPES.map(t=><option key={t}>{t}</option>)}</select><input placeholder="REF" value={x.reference} onChange={e=>setSpecialPrices(v=>v.map((a,j)=>i===j?{...a,reference:e.target.value}:a))}/><input placeholder="Valor R$" value={x.price} onChange={e=>setSpecialPrices(v=>v.map((a,j)=>i===j?{...a,price:e.target.value}:a))}/><button type="button" onClick={()=>setSpecialPrices(v=>v.filter((_,j)=>j!==i))}>Remover</button></div>)}<button type="button" className="outline-button" onClick={()=>setSpecialPrices(v=>[...v,{reference:'',type:types[0]||'Camiseta',price:''}])}><Plus size={15}/> Adicionar exceção</button></details>
        <label>Observações<textarea rows={2} value={notes} maxLength={1000} onChange={e=>setNotes(e.target.value)}/></label>
        <div className="modal-actions"><button type="button" className="outline-button" onClick={reset}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>{busy?'Salvando...':'Salvar oficina'}</button></div>
      </form></section></div>,document.body)}
  </div>;
}
