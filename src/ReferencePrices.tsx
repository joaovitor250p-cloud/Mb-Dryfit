import { useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { CheckCircle2, Filter, Pencil, Plus, Search, Sparkles, Tags, X } from 'lucide-react';
import { STARTER_PRICES, TYPES, KEY, parsePrice, currency, normalizedGarmentType, type ReferencePrice } from './lib/referencePrices';
import { safeProviderMessage } from './lib/safeMessage';
import { PageActiveContext } from './lib/pageMemory';

const normalizeSearch = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

export default function ReferencePrices({db,user,canEdit}:{db:Firestore;user:User;canEdit:boolean}){
  const pageActive=useContext(PageActiveContext);
  const [rows,setRows]=useState<ReferencePrice[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [type,setType]=useState('Camiseta');
  const [reference,setReference]=useState('');
  const [price,setPrice]=useState('');
  const [filter,setFilter]=useState('');
  const [typeFilter,setTypeFilter]=useState('all');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    if(!pageActive)return;
    return onSnapshot(collection(db,'reference_prices'),snap=>{
      setRows(snap.docs.map(d=>({
        reference:String(d.data().reference||''),
        type:String(d.data().type||''),
        price:String(d.data().price||'')
      })));
      setLoading(false);
    },e=>{setError(safeProviderMessage(e));setLoading(false)});
  },[db,pageActive]);

  const categories=useMemo(()=>[...new Set(rows.map(r=>normalizedGarmentType(r.type)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')),[rows]);
  const visible=useMemo(()=>{
    const search=normalizeSearch(filter).replace(/^ref[.\s]*/,'');
    return rows.filter(r=>{
      if(typeFilter!=='all'&&normalizedGarmentType(r.type)!==typeFilter)return false;
      return !search||normalizeSearch([r.reference,r.type,r.price].join(' ')).includes(search);
    }).sort((a,b)=>a.type.localeCompare(b.type,'pt-BR')||a.reference.localeCompare(b.reference,'pt-BR',{numeric:true}));
  },[rows,filter,typeFilter]);
  const isEditing=rows.some(r=>normalizedGarmentType(r.type)===normalizedGarmentType(type)&&r.reference.trim().toUpperCase()===reference.trim().toUpperCase());

  const startEdit=(row:ReferencePrice)=>{
    setType(row.type);
    setReference(row.reference);
    setPrice(row.price);
    setError('');
    setMessage('');
    document.getElementById('reference-price-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  const save=async()=>{
    if(!canEdit||busy)return;
    const ref=reference.trim().toUpperCase(),kind=normalizedGarmentType(type),amount=parsePrice(price);
    if(!ref||!kind||!Number.isFinite(amount)||amount<0){setError('Informe o tipo de peça, a REF e um preço válido.');return;}
    setBusy(true);setError('');setMessage('');
    try{
      await setDoc(doc(db,'reference_prices',KEY(kind,ref)),{
        reference:ref,type:kind,price:amount.toFixed(2).replace('.',','),
        updatedAt:serverTimestamp(),updatedBy:user.uid
      });
      setMessage('Preço padrão salvo com sucesso. A referência já está disponível na tabela.');
      setReference('');setPrice('');
    }catch(e){setError(safeProviderMessage(e))}finally{setBusy(false)}
  };
  const importStarter=async()=>{
    if(!canEdit||busy||!window.confirm('Importar preços iniciais? Referências já cadastradas serão preservadas.'))return;
    setBusy(true);setError('');setMessage('');
    try{
      const {getDoc}=await import('firebase/firestore');
      let count=0;
      for(const row of STARTER_PRICES){
        const ref=doc(db,'reference_prices',KEY(row.type,row.reference));
        if(!(await getDoc(ref)).exists()){
          await setDoc(ref,{...row,updatedAt:serverTimestamp(),updatedBy:user.uid});count++;
        }
      }
      setMessage('Foram importadas '+count+' referências novas; preços existentes foram preservados.');
    }catch(e){setError(safeProviderMessage(e))}finally{setBusy(false)}
  };

  return <div className="page-wrap extra-page ref-price-page">
    <div className="page-heading ref-price-heading">
      <div className="page-heading-copy">
        <span className="eyebrow">CONFIGURAÇÕES / TABELA DE VALORES</span>
        <h1>Preços padrão por REF</h1>
        <p>Consulte e altere o valor padrão de cada referência e tipo de peça. Preços especiais de costureiros são configurados em Oficinas e costureiros.</p>
      </div>
      <div className="ref-price-total"><Tags size={20}/><div><span>Referências com preço</span><strong>{loading?'—':rows.length.toLocaleString('pt-BR')}</strong></div></div>
    </div>
    {error&&<div className="production-alert" role="alert">{error}</div>}
    {message&&<div className="production-ok" role="status"><CheckCircle2 size={17}/>{message}</div>}

    <section className="catalog-panel ref-price-search-panel" aria-label="Pesquisa de preços de referência">
      <div className="ref-price-search-intro">
        <span className="ref-price-spark"><Sparkles size={21}/></span>
        <div><h2>Encontre o preço de uma referência</h2><p>Pesquise pelo número da REF, tipo de roupa ou valor.</p></div>
      </div>
      <div className="ref-price-search-field">
        <Search size={22} aria-hidden="true"/>
        <input type="search" value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Buscar preço por REF, roupa ou valor" placeholder="Ex.: 10088, camiseta, bermuda ou 4,50" autoComplete="off"/>
        {filter&&<button type="button" className="ref-price-clear" onClick={()=>setFilter('')} aria-label="Limpar busca"><X size={17}/><span>Limpar</span></button>}
      </div>
      <div className="ref-price-filter-group">
        <span className="ref-price-filter-label"><Filter size={15}/> Tipo de peça</span>
        <div className="ref-price-filter-chips" role="group" aria-label="Filtrar preços por tipo de peça">
          <button type="button" className={typeFilter==='all'?'selected':''} aria-pressed={typeFilter==='all'} onClick={()=>setTypeFilter('all')}>Todos</button>
          {categories.map(kind=><button type="button" key={kind} className={typeFilter===kind?'selected':''} aria-pressed={typeFilter===kind} onClick={()=>setTypeFilter(kind)}>{kind}</button>)}
        </div>
      </div>
      <div className="ref-price-result-status" role="status" aria-live="polite">
        <span>{loading?'Carregando preços...':visible.length===0?'Nenhuma referência encontrada':visible.length+' de '+rows.length+' referências encontradas'}</span>
        {(filter||typeFilter!=='all')&&<button type="button" onClick={()=>{setFilter('');setTypeFilter('all')}}>Limpar filtros</button>}
      </div>
    </section>

    {canEdit&&<section className="catalog-panel ref-price-edit-panel" id="reference-price-editor">
      <div className="ref-price-section-title"><span><Plus size={19}/></span><div><h2>{isEditing?'Atualizar preço de referência':'Cadastrar preço por referência'}</h2><p>Selecione o tipo de peça e informe REF e valor padrão.</p></div></div>
      <form className="ref-price-form" onSubmit={e=>{e.preventDefault();void save()}}>
        <label>Tipo de peça<input list="reference-types-list" value={type} maxLength={80} onChange={e=>setType(e.target.value)} placeholder="Ex.: Camiseta ou Jaqueta"/><datalist id="reference-types-list">{TYPES.map(t=><option key={t} value={t}/>)}</datalist></label>
        <label>Número da REF<input value={reference} maxLength={80} onChange={e=>setReference(e.target.value)} placeholder="Ex.: 10088" required/></label>
        <label>Preço padrão (R$)<input value={price} onChange={e=>setPrice(e.target.value)} inputMode="decimal" placeholder="Ex.: 3,50" required/></label>
        <button type="submit" className="primary-button" disabled={busy}>{busy?'Salvando...':isEditing?'Atualizar preço':'Salvar preço'}</button>
      </form>
      <div className="ref-price-edit-footer"><small>Uma REF existente do mesmo tipo será atualizada, sem criar outro registro.</small><button type="button" className="outline-button" disabled={busy} onClick={()=>void importStarter()}>Importar lista inicial</button></div>
    </section>}

    <section className="catalog-panel ref-price-results-panel">
      <div className="ref-price-results-heading"><div><h2>Valores cadastrados</h2><p>Consulte a tabela ou toque em Editar para alterar um preço.</p></div><strong>{visible.length} resultado(s)</strong></div>
      {loading?<div className="empty-state">Carregando tabela de preços...</div>
        :visible.length===0?<div className="ref-price-empty"><Search size={30}/><strong>Nenhum preço encontrado</strong><span>Experimente outra REF ou limpe os filtros acima.</span></div>
        :<div className="price-table-wrap ref-price-table-scroll"><table className="sheet-table ref-price-table"><thead><tr><th>Tipo de peça</th><th>REF</th><th>Preço padrão</th>{canEdit&&<th>Ação</th>}</tr></thead><tbody>{visible.map(r=><tr key={KEY(r.type,r.reference)}><td>{r.type}</td><td><span className="ref-price-code">{r.reference}</span></td><td><strong className="ref-price-amount">{currency(parsePrice(r.price))}</strong></td>{canEdit&&<td><button type="button" className="outline-button ref-price-edit-button" onClick={()=>startEdit(r)}><Pencil size={14}/> Editar</button></td>}</tr>)}</tbody></table></div>}
    </section>
  </div>;
}
