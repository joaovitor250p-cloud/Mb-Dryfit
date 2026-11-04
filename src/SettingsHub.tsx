import { lazy, Suspense, useContext, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { Building2, FileText, Settings2, Tags } from 'lucide-react';
import { readPageMemory, usePageMemory, PageActiveContext } from './lib/pageMemory';
const InfoPage=lazy(()=>import('./InfoPage'));
const WorkshopsPage=lazy(()=>import('./WorkshopsPage'));
const ReferencePrices=lazy(()=>import('./ReferencePrices'));
type Key='info'|'workshops'|'prices';
type Props={db:Firestore; user:User; canViewInfo:boolean; canViewOffices:boolean; canEditInfo:boolean; canEditOffices:boolean};
export default function SettingsHub({db,user,canViewInfo,canViewOffices,canEditInfo,canEditOffices}:Props){
  const visible:Key[]=[...(canViewInfo?['info' as Key]:[]),...(canViewOffices?['workshops' as Key,'prices' as Key]:[])];
  const outerActive=useContext(PageActiveContext);
  const key=`mb-referencias:${user.uid}:settings`;
  const [initial]=useState(()=>readPageMemory(key,{tab:visible[0]||'info'}));
  const [tab,setTab]=useState<Key>(visible.includes(initial.tab as Key)?initial.tab as Key:visible[0]||'info');
  const [visited,setVisited]=useState<Key[]>([tab]);
  usePageMemory(key,{tab});
  const choose=(next:Key)=>{setTab(next);setVisited(old=>old.includes(next)?old:[...old,next])};
  return <div className="settings-hub">
    <header className="settings-header"><span className="settings-symbol"><Settings2 size={23}/></span><div><span className="eyebrow">ADMINISTRAÇÃO E CADASTROS</span><h1>Configurações</h1><p>Gerencie informações da empresa, oficinas e preços em um único lugar.</p></div></header>
    <nav className="settings-tabs" aria-label="Seções de configurações">
      {canViewInfo&&<button className={tab==='info'?'active':''} onClick={()=>choose('info')}><FileText size={17}/> Informações MB</button>}
      {canViewOffices&&<button className={tab==='workshops'?'active':''} onClick={()=>choose('workshops')}><Building2 size={17}/> Oficinas</button>}
      {canViewOffices&&<button className={tab==='prices'?'active':''} onClick={()=>choose('prices')}><Tags size={17}/> Preços de REF</button>}
    </nav>
    {visited.filter(x=>visible.includes(x)).map(item=><div key={item} hidden={item!==tab} className="settings-content"><PageActiveContext.Provider value={outerActive&&item===tab}><Suspense fallback={<div className="empty-state">Carregando configurações...</div>}>
      {item==='info'?<InfoPage db={db} user={user} canEdit={canEditInfo}/>:item==='workshops'?<WorkshopsPage db={db} user={user} canEdit={canEditOffices}/>:<ReferencePrices db={db} user={user} canEdit={canEditOffices}/>}
    </Suspense></PageActiveContext.Provider></div>)}
  </div>;
}
