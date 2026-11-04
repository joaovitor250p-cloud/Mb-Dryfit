import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore, DocumentData } from 'firebase/firestore';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Building2, CheckCircle2, ClipboardList, Pencil, Phone, Plus, Search, Store, Trash2, Wrench, X } from 'lucide-react';
import {TAILORS,eligibleTypes,TYPES,parsePrice,currency} from './lib/referencePrices';
import brandLogo from './assets/mb-dryfit-logo.webp';
import { readPageMemory, usePageMemory } from './lib/pageMemory';
import { safeProviderMessage } from './lib/safeMessage';

type Props = { db: Firestore; user: User; canEdit: boolean; canSeeOrders: boolean };
type Service = { name: string; price: string };
type OfficeOrder = {oc:string;ref:string;model:string;office:string;qty:string;piecePrice:string;total:string;sent:string;status:string;paymentDone:string;paidAt:string};
type Workshop = { id: string; name: string; phone: string; pix:string; types:string[]; specialPrices:{reference:string;type:string;price:string}[]; services: Service[]; notes: string; createdBy?: string };
const normalize = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const parseMoney = (raw:string) => { const cleaned=String(raw).replace(/[^\d,.-]/g,''); const normalized=cleaned.includes(',')?cleaned.replace(/\./g,'').replace(',','.'):cleaned; const value=Number(normalized); return Number.isFinite(value) ? value : NaN; };
const formatMoney = (raw:string) => { const value=parseMoney(raw); return Number.isFinite(value) ? value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : 'Valor não informado'; };
const mapDoc = (id:string, d:DocumentData): Workshop => ({
  id,
  name: String(d.name || ''),
  phone: String(d.phone || ''),
  pix:String(d.pix||''),types:Array.isArray(d.types)?d.types:[],specialPrices:Array.isArray(d.specialPrices)?d.specialPrices:[],
  services: Array.isArray(d.services) ? d.services.map((s:unknown) => {
    const service=s && typeof s==='object' ? s as Record<string,unknown> : {};
    return { name:String(service.name || ''), price:String(service.price ?? '') };
  }).filter((s:Service)=>s.name || s.price) : [],
  notes: String(d.notes || ''),
  createdBy: String(d.createdBy || ''),
});

export default function WorkshopsPage({ db, user, canEdit, canSeeOrders }: Props) {
  const pageMemoryKey = `mb-referencias:${user.uid}:workshops`;
  const [initialPageState] = useState(() => readPageMemory(pageMemoryKey, { queryText: '' }));
  const [items, setItems] = useState<Workshop[]>([]);
  const [orders,setOrders]=useState<OfficeOrder[]>([]);
  const [expandedOrders,setExpandedOrders]=useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState(String(initialPageState.queryText || ''));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Workshop | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pix,setPix]=useState('');const [types,setTypes]=useState<string[]>([]);const [specialPrices,setSpecialPrices]=useState<{reference:string;type:string;price:string}[]>([]);
  const [services, setServices] = useState<Service[]>([{name:'',price:''}]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  usePageMemory(pageMemoryKey, { queryText }, !loading);

  useEffect(() => onSnapshot(query(collection(db, 'workshops'), orderBy('name')), snap => {
    setItems(snap.docs.map(d => mapDoc(d.id, d.data())));
    setLoading(false);
  }, e => { setError('Não foi possível carregar as oficinas: ' + safeProviderMessage(e)); setLoading(false); }), [db]);

  // OCs financeiras só são consultadas por quem já tem permissão para Ordem de Corte.
  useEffect(()=>{
    if(!canSeeOrders){setOrders([]);return;}
    return onSnapshot(collection(db,'cut_orders'),snap=>setOrders(snap.docs.map(d=>{
      const data=d.data();
      const str=(key:string)=>String(data[key]??'');
      return {oc:str('oc'),ref:str('ref'),model:str('model'),office:str('office'),qty:str('qty'),piecePrice:str('piecePrice'),total:str('total'),sent:str('sent'),status:str('status'),paymentDone:str('paymentDone'),paidAt:str('paidAt')};
    })),e=>setError('Não foi possível carregar as OCs das oficinas: '+safeProviderMessage(e)));
  },[db,canSeeOrders]);
  const ordersFor=(name:string)=>orders.filter(order=>normalize(order.office)===normalize(name)).sort((a,b)=>(Number(b.oc)||0)-(Number(a.oc)||0));
  const exportOCs=(name:string)=>{
    const headers=['OC','REF','MODELO','OFICINA','QUANTIDADE','PREÇO UNITÁRIO','TOTAL','DATA ENVIO','STATUS','PAGO','DATA PAGAMENTO'];
    const lines=[headers,...ordersFor(name).map(o=>[o.oc,o.ref,o.model,o.office,o.qty,o.piecePrice,o.total,o.sent,o.status,o.paymentDone,o.paidAt])];
    // Prefixa conteúdo que poderia ser interpretado como fórmula pelo Excel.
    const esc=(v:string)=>{const safe=/^[=+@\-\t\r]/.test(v.trimStart())?"'"+v:v;return '"'+safe.replace(/"/g,'""')+'"';};
    const csv='\uFEFF'+lines.map(row=>row.map(esc).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='OCs_'+name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'_')+'.csv';document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };

  const filtered = useMemo(() => items.filter(item => !queryText.trim() || normalize([item.name,item.phone,item.notes,...item.services.flatMap(s=>[s.name,s.price])].join(' ')).includes(normalize(queryText))), [items, queryText]);
  const reset = () => { setEditing(null); setName(''); setPhone('');setPix('');setTypes([]);setSpecialPrices([]); setServices([{name:'',price:''}]); setNotes(''); setOpen(false); };
  const openNew = () => { setEditing(null); setName(''); setPhone('');setPix('');setTypes([]);setSpecialPrices([]); setServices([{name:'',price:''}]); setNotes(''); setOpen(true); };
  const openEdit = (item:Workshop) => { setEditing(item); setName(item.name); setPhone(item.phone);setPix(item.pix);setTypes(item.types);setSpecialPrices(item.specialPrices); setServices(item.services.length ? item.services.map(s=>({...s})) : [{name:'',price:''}]); setNotes(item.notes); setOpen(true); };
  const notify = (msg:string, isError=false) => { setError(isError ? msg : ''); setMessage(isError ? '' : msg); };
  const updateService = (index:number, field:keyof Service, value:string) => setServices(old=>old.map((service,i)=>i===index?{...service,[field]:value}:service));
  const addService = () => setServices(old=>[...old,{name:'',price:''}]);
  const removeService = (index:number) => setServices(old=>old.length>1?old.filter((_,i)=>i!==index):[{name:'',price:''}]);

  const save = async () => {
    if (!canEdit || busy) return;
    if (!name.trim()) return notify('Informe o nome da oficina.', true);
    const entered = services.filter(s=>s.name.trim() || s.price.trim());
    // Tipos de peça e preços especiais podem ser cadastrados sem serviços genéricos.
    if (entered.some(s=>!s.name.trim() || !s.price.trim() || !Number.isFinite(parseMoney(s.price)))) return notify('Preencha o nome e um preço válido para cada peça iniciada.', true);
    setBusy(true);
    try {
      const payload = { name:name.trim(), phone:phone.trim(),pix:pix.trim(),types,specialPrices:specialPrices.filter(x=>x.reference.trim()&&Number.isFinite(parsePrice(x.price))).map(x=>({...x,reference:x.reference.trim().toUpperCase()})), services:entered.map(s=>({name:s.name.trim(),price:s.price.trim()})), notes:notes.trim(), updatedAt:serverTimestamp(), updatedBy:user.uid };
      if (editing) await updateDoc(doc(db,'workshops',editing.id),payload);
      else await setDoc(doc(collection(db,'workshops')),{...payload,createdAt:serverTimestamp(),createdBy:user.uid});
      notify(editing ? 'Oficina atualizada.' : 'Oficina cadastrada.');
      reset();
    } catch(e) { notify(safeProviderMessage(e, 'Não foi possível salvar a oficina.'),true); }
    finally { setBusy(false); }
  };

  const remove = async (item:Workshop) => {
    if (!canEdit || busy || !window.confirm(`Excluir a oficina "${item.name}"?`)) return;
    setBusy(true);
    try { await deleteDoc(doc(db,'workshops',item.id)); notify('Oficina excluída.'); }
    catch(e) { notify(safeProviderMessage(e, 'Não foi possível excluir a oficina.'),true); }
    finally { setBusy(false); }
  };

  const importTailors=async()=>{
    if(!canEdit||busy||!window.confirm('Cadastrar ou completar os 9 costureiros iniciais? Dados e preços especiais que você já editou serão preservados.'))return;
    setBusy(true);
    try{
      let added=0,updated=0;
      for(const person of TAILORS){
        const specials=person==='Mauro'?[{reference:'10088',type:'Camiseta',price:'4,00'},{reference:'10216',type:'Camiseta',price:'4,00'},{reference:'10089',type:'Camiseta',price:'4,00'},{reference:'10002',type:'M.L.',price:'6,00'}]:[];
        const existing=items.find(w=>normalize(w.name)===normalize(person));
        if(existing){
          const nextTypes=[...new Set([...existing.types,...eligibleTypes(person)])];
          const nextSpecials=[...existing.specialPrices];
          for(const item of specials){if(!nextSpecials.some(x=>x.reference.trim().toUpperCase()===item.reference&&x.type===item.type))nextSpecials.push(item);}
          if(nextTypes.length!==existing.types.length||nextSpecials.length!==existing.specialPrices.length){
            await updateDoc(doc(db,'workshops',existing.id),{types:nextTypes,specialPrices:nextSpecials,updatedAt:serverTimestamp(),updatedBy:user.uid});
            updated++;
          }
        }else{
          await setDoc(doc(collection(db,'workshops')),{name:person,phone:'',pix:'',types:eligibleTypes(person),specialPrices:specials,services:[],notes:'',createdAt:serverTimestamp(),createdBy:user.uid,updatedAt:serverTimestamp(),updatedBy:user.uid});
          added++;
        }
      }
      notify(`${added} costureiros cadastrados e ${updated} cadastros complementados. Valores especiais existentes preservados.`);
    }catch(e){notify(safeProviderMessage(e),true)}finally{setBusy(false)}
  };
  const serviceCount = filtered.reduce((total,item)=>total+item.services.length,0);

  return <div className="page-wrap extra-page workshops-page">
    <div className="page-heading">
      <div className="page-heading-copy">
        <div className="page-brand-row"><img className="page-brand-logo" src={brandLogo} alt="MB DryFit"/><div><span className="eyebrow">CADASTRO DE PARCEIROS</span><h1>Oficinas</h1></div></div>
        <p>Cadastre costureiros, WhatsApp, PIX, tipos de peça e preços especiais por referência.</p>
      </div>
      {canEdit && <div className="heading-actions"><button className="outline-button" onClick={()=>void importTailors()} disabled={busy}>Importar 9 costureiros</button><button className="primary-button" onClick={openNew} disabled={busy}><Plus size={16}/> Nova oficina</button></div>}
    </div>
    {error && <div className="production-alert" role="alert">{error}</div>}
    {message && <div className="production-ok"><CheckCircle2 size={16}/>{message}</div>}
    <section className="stats-grid extra-stats workshop-stats">
      <div className="stat-card"><div className="stat-icon amber"><Building2/></div><div><span>Oficinas</span><strong>{filtered.length}</strong><small>Parceiros encontrados</small></div></div>
      <div className="stat-card"><div className="stat-icon teal"><ClipboardList/></div><div><span>Tipos de peça</span><strong>{serviceCount}</strong><small>Serviços cadastrados</small></div></div>
    </section>
    <section className="catalog-panel extra-panel">
      <div className="production-toolbar"><label className="search-box"><Search size={18}/><input value={queryText} onChange={e=>setQueryText(e.target.value)} placeholder="Pesquisar oficina, telefone ou peça..."/></label></div>
      {loading ? <div className="empty-state">Carregando oficinas...</div> : !filtered.length ? <div className="empty-state"><Store size={28}/><strong>Nenhuma oficina cadastrada</strong><span>Use “Nova oficina” para cadastrar o primeiro parceiro.</span></div> : <div className="workshop-list">{filtered.map(item=><article key={item.id} className="workshop-card fade-in-up">
        <header className="workshop-card-head"><div className="workshop-identity"><span className="workshop-icon"><Store size={20}/></span><div><h2>{item.name}</h2><span>Oficina parceira</span></div></div><div className="workshop-phone"><Phone size={17}/>{item.phone ? <a href={`tel:${item.phone.replace(/[^\d+]/g,'')}`}>{item.phone}</a> : <span>Telefone não informado</span>}</div></header>
        <div className="workshop-service-heading"><Wrench size={16}/><strong>Peças e preços</strong></div>
        {item.services.length ? <div className="workshop-services">{item.services.map((service,index)=><div className="workshop-service-row" key={`${service.name}-${index}`}><div><strong>{service.name}</strong><small>Preço por peça</small></div><b>{formatMoney(service.price)}</b></div>)}</div> : <p className="workshop-no-services">Nenhuma peça cadastrada.</p>}
        <p><b>Produz:</b> {item.types.join(', ')||'Não informado'} · <b>PIX:</b> {item.pix||'Não informado'}</p>{item.specialPrices.length>0&&<div className="workshop-services"><strong>Preços especiais por REF</strong>{item.specialPrices.map((x,i)=><div className="workshop-service-row" key={i}>{x.type} · REF {x.reference} — {currency(parsePrice(x.price))}</div>)}</div>}{item.notes && <p className="workshop-notes">{item.notes}</p>}
        {canSeeOrders&&<section className="workshop-oc-panel"><div className="office-oc-header"><strong>Ordens de Corte ({ordersFor(item.name).length})</strong><div className="workshop-oc-actions"><button className="outline-button" onClick={()=>setExpandedOrders(v=>v===item.id?null:item.id)}>{expandedOrders===item.id?'Ocultar OCs':'Ver OCs'}</button><button className="outline-button" disabled={!ordersFor(item.name).length} onClick={()=>exportOCs(item.name)}>Baixar OCs (CSV)</button></div></div>{expandedOrders===item.id&&<div className="workshop-oc-table-wrap"><table className="sheet-table"><thead><tr><th>OC</th><th>REF</th><th>Modelo</th><th>Qtd.</th><th>Enviada</th><th>Status</th><th>Pago</th></tr></thead><tbody>{ordersFor(item.name).map((o,i)=><tr key={o.oc+'-'+i}><td>{o.oc}</td><td>{o.ref}</td><td>{o.model}</td><td>{o.qty}</td><td>{o.sent}</td><td>{o.status}</td><td>{o.paymentDone==='OK'?'Sim':'Não'}</td></tr>)}</tbody></table>{!ordersFor(item.name).length&&<p>Nenhuma OC encontrada para esta oficina.</p>}</div>}</section>}
        {canEdit && <div className="simple-card-actions"><button className="outline-button" onClick={()=>openEdit(item)}><Pencil size={14}/> Editar</button><button className="danger-button" onClick={()=>void remove(item)}><Trash2 size={14}/> Excluir</button></div>}
      </article>)}</div>}
    </section>
    {open && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)reset()}}><section className="modal extra-modal workshop-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">OFICINAS</span><h2>{editing?'Editar oficina':'Nova oficina'}</h2><p>Informe o contato e os valores combinados por peça.</p></div><button className="icon-button" onClick={reset} aria-label="Fechar"><X/></button></div>
      <form className="modal-form" onSubmit={e=>{e.preventDefault();void save()}}>
        <label>Nome da oficina / responsável *<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Mauro"/></label>
        <label>Telefone / WhatsApp<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Ex.: (11) 99999-9999"/></label><label>Chave PIX<input value={pix} onChange={e=>setPix(e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória"/></label><div><strong>Tipos de peça que produz</strong><div className="price-types">{TYPES.map(t=><label key={t}><input type="checkbox" checked={types.includes(t)} onChange={e=>setTypes(v=>e.target.checked?[...v,t]:v.filter(x=>x!==t))}/>{t}</label>)}</div></div><div><strong>Preços especiais por referência</strong><p>Se não houver preço especial, será usado o preço padrão.</p>{specialPrices.map((x,i)=><div className="price-form" key={i}><select value={x.type} onChange={e=>setSpecialPrices(v=>v.map((a,j)=>i===j?{...a,type:e.target.value}:a))}>{TYPES.map(t=><option key={t}>{t}</option>)}</select><input placeholder="REF" value={x.reference} onChange={e=>setSpecialPrices(v=>v.map((a,j)=>i===j?{...a,reference:e.target.value}:a))}/><input placeholder="Preço R$" value={x.price} onChange={e=>setSpecialPrices(v=>v.map((a,j)=>i===j?{...a,price:e.target.value}:a))}/><button type="button" onClick={()=>setSpecialPrices(v=>v.filter((_,j)=>j!==i))}>Remover</button></div>)}<button type="button" className="outline-button" onClick={()=>setSpecialPrices(v=>[...v,{reference:'',type:types[0]||'Camiseta',price:''}])}>+ Preço especial de REF</button></div>
        <div className="workshop-services-form-head"><strong>Peças e preços</strong><span>Cadastre cada peça e o valor por unidade.</span></div>
        <div className="workshop-services-form">{services.map((service,index)=><div className="workshop-service-input-row" key={index}><label>Peça / serviço<input value={service.name} onChange={e=>updateService(index,'name',e.target.value)} placeholder="Ex.: Bermuda"/></label><label>Preço por peça (R$)<input inputMode="decimal" value={service.price} onChange={e=>updateService(index,'price',e.target.value)} placeholder="10,00"/></label><button type="button" className="workshop-remove-service" onClick={()=>removeService(index)} aria-label="Remover peça"><Trash2 size={16}/></button></div>)}</div>
        <button type="button" className="outline-button workshop-add-service" onClick={addService}><Plus size={15}/> Adicionar outra peça</button>
        <label>Observações<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Opcional"/></label>
        <div className="modal-actions"><button type="button" className="outline-button" onClick={reset}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>{busy?'Salvando...':'Salvar oficina'}</button></div>
      </form>
    </section></div>}
  </div>;
}
