import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore, DocumentData } from 'firebase/firestore';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Building2, CheckCircle2, ClipboardList, Pencil, Phone, Plus, Search, Store, Trash2, Wrench, X } from 'lucide-react';
import brandLogo from './assets/mb-dryfit-logo.png';

type Props = { db: Firestore; user: User; canEdit: boolean };
type Service = { name: string; price: string };
type Workshop = { id: string; name: string; phone: string; services: Service[]; notes: string; createdBy?: string };
const normalize = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const parseMoney = (raw:string) => { const cleaned=String(raw).replace(/[^\d,.-]/g,''); const normalized=cleaned.includes(',')?cleaned.replace(/\./g,'').replace(',','.'):cleaned; const value=Number(normalized); return Number.isFinite(value) ? value : NaN; };
const formatMoney = (raw:string) => { const value=parseMoney(raw); return Number.isFinite(value) ? value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : 'Valor não informado'; };
const mapDoc = (id:string, d:DocumentData): Workshop => ({
  id,
  name: String(d.name || ''),
  phone: String(d.phone || ''),
  services: Array.isArray(d.services) ? d.services.map((s:unknown) => {
    const service=s && typeof s==='object' ? s as Record<string,unknown> : {};
    return { name:String(service.name || ''), price:String(service.price ?? '') };
  }).filter((s:Service)=>s.name || s.price) : [],
  notes: String(d.notes || ''),
  createdBy: String(d.createdBy || ''),
});

export default function WorkshopsPage({ db, user, canEdit }: Props) {
  const [items, setItems] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Workshop | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [services, setServices] = useState<Service[]>([{name:'',price:''}]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => onSnapshot(query(collection(db, 'workshops'), orderBy('name')), snap => {
    setItems(snap.docs.map(d => mapDoc(d.id, d.data())));
    setLoading(false);
  }, e => { setError('Não foi possível carregar as oficinas: ' + e.message); setLoading(false); }), [db]);

  const filtered = useMemo(() => items.filter(item => !queryText.trim() || normalize([item.name,item.phone,item.notes,...item.services.flatMap(s=>[s.name,s.price])].join(' ')).includes(normalize(queryText))), [items, queryText]);
  const reset = () => { setEditing(null); setName(''); setPhone(''); setServices([{name:'',price:''}]); setNotes(''); setOpen(false); };
  const openNew = () => { setEditing(null); setName(''); setPhone(''); setServices([{name:'',price:''}]); setNotes(''); setOpen(true); };
  const openEdit = (item:Workshop) => { setEditing(item); setName(item.name); setPhone(item.phone); setServices(item.services.length ? item.services.map(s=>({...s})) : [{name:'',price:''}]); setNotes(item.notes); setOpen(true); };
  const notify = (msg:string, isError=false) => { setError(isError ? msg : ''); setMessage(isError ? '' : msg); };
  const updateService = (index:number, field:keyof Service, value:string) => setServices(old=>old.map((service,i)=>i===index?{...service,[field]:value}:service));
  const addService = () => setServices(old=>[...old,{name:'',price:''}]);
  const removeService = (index:number) => setServices(old=>old.length>1?old.filter((_,i)=>i!==index):[{name:'',price:''}]);

  const save = async () => {
    if (!canEdit || busy) return;
    if (!name.trim()) return notify('Informe o nome da oficina.', true);
    const entered = services.filter(s=>s.name.trim() || s.price.trim());
    if (!entered.length) return notify('Cadastre pelo menos um tipo de peça e seu preço.', true);
    if (entered.some(s=>!s.name.trim() || !s.price.trim() || !Number.isFinite(parseMoney(s.price)))) return notify('Preencha o nome e um preço válido para cada peça iniciada.', true);
    setBusy(true);
    try {
      const payload = { name:name.trim(), phone:phone.trim(), services:entered.map(s=>({name:s.name.trim(),price:s.price.trim()})), notes:notes.trim(), updatedAt:serverTimestamp(), updatedBy:user.uid };
      if (editing) await updateDoc(doc(db,'workshops',editing.id),payload);
      else await setDoc(doc(collection(db,'workshops')),{...payload,createdAt:serverTimestamp(),createdBy:user.uid});
      notify(editing ? 'Oficina atualizada.' : 'Oficina cadastrada.');
      reset();
    } catch(e) { notify(e instanceof Error ? e.message : 'Não foi possível salvar a oficina.',true); }
    finally { setBusy(false); }
  };

  const remove = async (item:Workshop) => {
    if (!canEdit || busy || !window.confirm(`Excluir a oficina "${item.name}"?`)) return;
    setBusy(true);
    try { await deleteDoc(doc(db,'workshops',item.id)); notify('Oficina excluída.'); }
    catch(e) { notify(e instanceof Error ? e.message : 'Não foi possível excluir a oficina.',true); }
    finally { setBusy(false); }
  };

  const serviceCount = filtered.reduce((total,item)=>total+item.services.length,0);

  return <div className="page-wrap extra-page workshops-page">
    <div className="page-heading">
      <div className="page-heading-copy">
        <div className="page-brand-row"><img className="page-brand-logo" src={brandLogo} alt="MB DryFit"/><div><span className="eyebrow">CADASTRO DE PARCEIROS</span><h1>Oficinas</h1></div></div>
        <p>Cadastre cada oficina, o telefone de contato e o preço de cada tipo de peça.</p>
      </div>
      {canEdit && <div className="heading-actions"><button className="primary-button" onClick={openNew} disabled={busy}><Plus size={16}/> Nova oficina</button></div>}
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
        {item.notes && <p className="workshop-notes">{item.notes}</p>}
        {canEdit && <div className="simple-card-actions"><button className="outline-button" onClick={()=>openEdit(item)}><Pencil size={14}/> Editar</button><button className="danger-button" onClick={()=>void remove(item)}><Trash2 size={14}/> Excluir</button></div>}
      </article>)}</div>}
    </section>
    {open && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)reset()}}><section className="modal extra-modal workshop-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">OFICINAS</span><h2>{editing?'Editar oficina':'Nova oficina'}</h2><p>Informe o contato e os valores combinados por peça.</p></div><button className="icon-button" onClick={reset} aria-label="Fechar"><X/></button></div>
      <form className="modal-form" onSubmit={e=>{e.preventDefault();void save()}}>
        <label>Nome da oficina / responsável *<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Mauro"/></label>
        <label>Telefone / WhatsApp<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Ex.: (11) 99999-9999"/></label>
        <div className="workshop-services-form-head"><strong>Peças e preços</strong><span>Cadastre cada peça e o valor por unidade.</span></div>
        <div className="workshop-services-form">{services.map((service,index)=><div className="workshop-service-input-row" key={index}><label>Peça / serviço<input value={service.name} onChange={e=>updateService(index,'name',e.target.value)} placeholder="Ex.: Bermuda"/></label><label>Preço por peça (R$)<input inputMode="decimal" value={service.price} onChange={e=>updateService(index,'price',e.target.value)} placeholder="10,00"/></label><button type="button" className="workshop-remove-service" onClick={()=>removeService(index)} aria-label="Remover peça"><Trash2 size={16}/></button></div>)}</div>
        <button type="button" className="outline-button workshop-add-service" onClick={addService}><Plus size={15}/> Adicionar outra peça</button>
        <label>Observações<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Opcional"/></label>
        <div className="modal-actions"><button type="button" className="outline-button" onClick={reset}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>{busy?'Salvando...':'Salvar oficina'}</button></div>
      </form>
    </section></div>}
  </div>;
}
