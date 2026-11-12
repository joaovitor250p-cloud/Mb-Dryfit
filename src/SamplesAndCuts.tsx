import { lazy, Suspense, useContext, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Model } from './lib/catalog';
import { Camera, Scissors } from 'lucide-react';
import { PageActiveContext,readPageMemory,usePageMemory } from './lib/pageMemory';
const SampleWorkflow=lazy(()=>import('./SampleWorkflow'));
type Key='samples'|'cuts';
type Props={db:Firestore;user:User;models:Model[];isAdmin:boolean;canViewSamples:boolean;canViewCuts:boolean;canEditSamples:boolean;canEditCuts:boolean;canReadOrders:boolean};
export default function SamplesAndCuts({db,user,models,isAdmin,canViewSamples,canViewCuts,canEditSamples,canEditCuts,canReadOrders}:Props){
  const available:Key[]=[...(canViewSamples?['samples' as Key]:[]),...(canViewCuts?['cuts' as Key]:[])];
  const outerActive=useContext(PageActiveContext);
  const key=`mb-referencias:${user.uid}:samples-combined`;
  const [initial]=useState(()=>readPageMemory(key,{tab:available[0]||'samples'}));
  const [tab,setTab]=useState<Key>(available.includes(initial.tab as Key)?initial.tab as Key:available[0]||'samples');
  const [visited,setVisited]=useState<Key[]>([tab]);
  usePageMemory(key,{tab});
  return <div className="combined-work-area"><div className="combined-work-tabs" aria-label="Amostras e cortes">
    {canViewSamples&&<button className={tab==='samples'?'active':''} onClick={()=>{setTab('samples');setVisited(old=>old.includes('samples')?old:[...old,'samples'])}}><Camera size={17}/> Amostras</button>}
    {canViewCuts&&<button className={tab==='cuts'?'active':''} onClick={()=>{setTab('cuts');setVisited(old=>old.includes('cuts')?old:[...old,'cuts'])}}><Scissors size={17}/> Cortes e fotos</button>}
  </div>{visited.filter(x=>available.includes(x)).map(item=><div key={item} hidden={item!==tab} className="combined-work-content"><PageActiveContext.Provider value={outerActive&&item===tab}><Suspense fallback={<div className="empty-state">Carregando...</div>}><SampleWorkflow view={item} db={db} user={user} models={models} isAdmin={isAdmin} canReadOrders={canReadOrders} canEdit={item==='samples'?canEditSamples:canEditCuts}/></Suspense></PageActiveContext.Provider></div>)}</div>;
}
