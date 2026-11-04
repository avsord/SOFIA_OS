import type {AgendaItem} from './types';
export type AgendaResponse={items:AgendaItem[];refresh_pending?:boolean};
export type AgendaSnapshot={items:AgendaItem[];loading:boolean;pending:boolean;error:unknown;loadedAt:number};
type Entry={snapshot:AgendaSnapshot;listeners:Set<()=>void>;request?:Promise<void>;timer?:ReturnType<typeof setTimeout>;polls:number;stale?:boolean};
export function monthKey(month:Date){return `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`;}
export function createAgendaCache(fetchMonth:(month:string)=>Promise<AgendaResponse>,now=Date.now){
 const entries=new Map<string,Entry>();
 function entry(key:string){let value=entries.get(key);if(!value){value={snapshot:{items:[],loading:true,pending:false,error:null,loadedAt:0},listeners:new Set(),polls:0};entries.set(key,value);}return value;}
 function publish(e:Entry,patch:Partial<AgendaSnapshot>){e.snapshot={...e.snapshot,...patch};e.listeners.forEach(fn=>fn());}
 function schedule(key:string,e:Entry){if(e.timer||!e.listeners.size||!e.snapshot.pending||e.polls>=60)return;e.timer=setTimeout(()=>{e.timer=undefined;e.polls++;void load(key,true);},2000);}
 function load(key:string,force=false):Promise<void>{
  const e=entry(key);if(e.request){if(!force&&!e.stale)return e.request; /* 04/11/2026: depois de criar algo, nao reaproveita a leitura antiga em andamento: espera ela e le de novo */const prev=e.request;return prev.then(()=>load(key,true),()=>load(key,true));}
  if(!force&&!e.stale&&e.snapshot.loadedAt&&now()-e.snapshot.loadedAt<60000){schedule(key,e);return Promise.resolve();}
  publish(e,{loading:!e.snapshot.loadedAt,error:null});
  e.request=(async()=>{try{const result=await fetchMonth(key);e.stale=false;publish(e,{items:result.items,loading:false,pending:result.refresh_pending===true,error:null,loadedAt:now()});if(!result.refresh_pending)e.polls=0;}catch(error){publish(e,{loading:false,error});}finally{e.request=undefined;schedule(key,e);}})();
  return e.request;
 }
 return {
  seed(key:string,value:AgendaResponse){const e=entry(key);if(e.snapshot.loadedAt||e.request||!Array.isArray(value?.items))return;publish(e,{items:value.items,loading:false,pending:value.refresh_pending===true,error:null,loadedAt:now()});},
  snapshot:(key:string)=>entry(key).snapshot,
  subscribe(key:string,listener:()=>void){const e=entry(key);e.listeners.add(listener);schedule(key,e);return()=>{e.listeners.delete(listener);if(!e.listeners.size&&e.timer){clearTimeout(e.timer);e.timer=undefined;}};},
  load,
  async warm(key:string,force=false){await load(key,force);if(entry(key).snapshot.error)return;const [y,m]=key.split('-').map(Number);await Promise.all([-1,1].map(delta=>load(monthKey(new Date(y,m-1+delta,1)))));},
  invalidate(){entries.forEach(e=>{e.stale=true;e.polls=0;});},
 };
}
