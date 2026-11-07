import type {Entity} from './types';

export type PageBlock={id:string;type:string;text?:string;html?:string;checked?:boolean;data?:Record<string,any>;[key:string]:any};
export type PageDraft={title:string;blocks:PageBlock[];appearance:Record<string,any>};
export const APPEARANCE_KEYS=['icon','icon_mode','cover_type','cover_value','cover_attachment_id','cover_position'] as const;
export const newBlock=(type='text'):PageBlock=>({id:Date.now().toString(36)+Math.random().toString(36).slice(2,9),type,text:''});
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function pageDraft(page:Entity):PageDraft {
 let blocks:PageBlock[]=[];
 try {const parsed=JSON.parse(String(page.data?.blocks_json||'[]'));if(Array.isArray(parsed))blocks=parsed; } catch { /* Keep malformed source untouched unless the body itself is edited. */ }
 const appearance:Record<string,any>={};for(const k of APPEARANCE_KEYS)appearance[k]=page.data?.[k]??'';
 return {title:page.title,blocks:blocks.length?clone(blocks):[newBlock()],appearance};
}
export function pagePatch(base:Entity,before:PageDraft,after:PageDraft):Partial<Entity> {
 const data:Record<string,any>={};
 if(!same(before.blocks,after.blocks))data.blocks_json=JSON.stringify(after.blocks);
 for(const k of APPEARANCE_KEYS)if(!same(before.appearance[k],after.appearance[k]))data[k]=after.appearance[k];
 return {id:base.id,revision:base.revision,...(before.title!==after.title?{title:after.title.trim()||'Sem título'}:{}),
  ...(Object.keys(data).length?{data:{...base.data,...data}}:{})};
}
export function conflictingFields(base:Entity,patch:Partial<Entity>,remote:Entity):string[] {
 const out:string[]=[];
 if(patch.title!==undefined&&remote.title!==base.title&&remote.title!==patch.title)out.push('title');
 for(const k of ['blocks_json',...APPEARANCE_KEYS])if(patch.data&& !same(patch.data[k],base.data?.[k]) && !same(remote.data?.[k],base.data?.[k]) && !same(remote.data?.[k],patch.data[k]))out.push(k);
 return out;
}
export type SaveState='saved'|'pending'|'saving'|'error'|'conflict'|'secret';
/** 06/11/2026: pagina com senha escrita que o dono decidiu deixar sem trancar (o servidor aceita e a IA nao le). */
export const SECRET_OK_TAG='sofia-secret-ok-v1';
const ALLOW_SECRET=new Set<string>(),STORES=new Set<PageEditorStore>();
export type PageEntry={allowSecret?:boolean;secretAsk?:boolean;base:Entity;baseDraft:PageDraft;draft:PageDraft;past:PageDraft[];future:PageDraft[];version:number;acked:number;state:SaveState;error:string;group:string;groupAt:number;firstChange:number};
export type PendingPage={base:Entity;baseDraft:PageDraft;draft:PageDraft};
type Deps={view?:(e:Entity)=>Entity;save:(patch:Partial<Entity>)=>Promise<Entity>;read:(id:string)=>Promise<Entity>;
 persist:(entries:PendingPage[])=>Promise<void>;onSaved?:(page:Entity)=>void;delay?:number;maxWait?:number;now?:()=>number};

/** One serialized save lane per page. A response never replaces newer local typing. */
export class PageEditorStore {
 private entries=new Map<string,PageEntry>();
 private timers=new Map<string,ReturnType<typeof setTimeout>>();
 private flights=new Map<string,Promise<void>>();
 private listeners=new Set<()=>void>();
 private disk:Promise<void>=Promise.resolve();
 private disposed=false;
 private now:()=>number;
 constructor(private deps:Deps){this.now=deps.now||Date.now;STORES.add(this);}
 subscribe(fn:()=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
 private changed(){if(!this.disposed)this.listeners.forEach(fn=>fn());}
 get(id:string){return this.entries.get(id);}
 open(base:Entity):PageEntry {
  if(this.deps.view)base=this.deps.view(base); /* 06/11/2026: pagina trancada e aberta entra com o texto decifrado */
  let e=this.entries.get(base.id);
  if(!e){const d=pageDraft(base);e={base,baseDraft:clone(d),draft:d,past:[],future:[],version:0,acked:0,state:'saved',error:'',group:'',groupAt:0,firstChange:0};this.entries.set(base.id,e);}
  else if(e.state==='saved'&&base.revision>e.base.revision){e.base=base;e.baseDraft=pageDraft(base);e.draft=clone(e.baseDraft);e.past=[];e.future=[];}
  return e;
 }
 restore(saved:unknown){
  if(!Array.isArray(saved))return;
  for(const p of saved){if(!p?.base?.id||p.base.kind!=='user_page'||!p.draft||!Array.isArray(p.draft.blocks)||!p.baseDraft||!p.draft.appearance||this.entries.has(p.base.id))continue;
   const e=this.open(p.base);e.baseDraft=p.baseDraft;e.draft=p.draft;e.version=1;e.state='pending';e.firstChange=this.now();}
 }
 resume(){this.disposed=false;for(const [id,e] of this.entries)if(e.version>e.acked&&e.state!=='conflict')this.schedule(id);}
 /** 06/11/2026 (pagina com senha): texto decifrado chegou ou a pagina acabou de ser trancada - troca a base sem perder
  * digitacao pendente (se o rascunho igual a base nova, fica salvo). */
 rebase(base:Entity){if(this.deps.view)base=this.deps.view(base);const e=this.entries.get(base.id);if(!e){this.open(base);this.changed();return;}
  if((base.tags||[]).includes('sofia-lock-v1'))e.secretAsk=false;
  const d=pageDraft(base);if(e.state==='saved'){e.base=base;e.baseDraft=d;e.draft=clone(d);e.past=[];e.future=[];this.changed();void this.persist();return;}
  e.base=base;e.baseDraft=d;if(same(d,e.draft)){e.acked=e.version;e.state='saved';e.error='';}else{e.state='pending';this.schedule(base.id);}this.changed();void this.persist(); /* 07/11/2026: trancou - o rascunho aberto sai do disco na hora */}
 /** "Nao, salvar sem senha": marca a pagina e salva de novo. */
 // a resposta vale para a pagina em qualquer copia do editor (a tela pode ter mais de uma; a que salva pode nao ser a que perguntou)
 allowSecret(id:string){ALLOW_SECRET.add(id);for(const st of STORES)st.wakeSecret(id);}
 private wakeSecret(id:string){const e=this.entries.get(id);if(!e)return;e.allowSecret=true;e.secretAsk=false;if(e.version>e.acked&&e.state!=='conflict'){e.state='pending';e.error='';this.schedule(id);}this.changed();}
 edit(id:string,change:(draft:PageDraft)=>PageDraft,group=''){
  const e=this.entries.get(id);if(!e)return;const next=change(clone(e.draft));if(same(next,e.draft))return;
  const now=this.now();if(!group||group!==e.group||now-e.groupAt>700){e.past.push(clone(e.draft));if(e.past.length>80)e.past.shift();}
  e.future=[];e.group=group;e.groupAt=now;e.draft=next;this.dirty(id,e);
 }
 undo(id:string){const e=this.entries.get(id);if(!e?.past.length)return;e.future.push(clone(e.draft));e.draft=e.past.pop()!;e.group='';this.dirty(id,e);}
 redo(id:string){const e=this.entries.get(id);if(!e?.future.length)return;e.past.push(clone(e.draft));e.draft=e.future.pop()!;e.group='';this.dirty(id,e);}
 private dirty(id:string,e:PageEntry){if(e.version===e.acked)e.firstChange=this.now();e.version++;if(e.state!=='conflict'){e.state='pending';e.error='';this.schedule(id);}this.changed();this.persist();}
 private schedule(id:string){
  if(this.disposed)return;const e=this.entries.get(id);if(!e||e.state==='conflict')return;
  const old=this.timers.get(id);if(old)clearTimeout(old);
  const remaining=(this.deps.maxWait??1800)-(this.now()-e.firstChange);
  this.timers.set(id,setTimeout(()=>{this.timers.delete(id);void this.flush(id);},Math.max(0,Math.min(this.deps.delay??650,remaining))));
 }
 private persist(){
  const pending=[...this.entries.values()].filter(e=>e.version>e.acked).map(e=>clone({base:e.base,baseDraft:e.baseDraft,draft:e.draft}));
  this.disk=this.disk.catch(()=>{}).then(()=>this.deps.persist(pending)).catch(()=>{
   for(const e of this.entries.values())if(e.version>e.acked&&e.state!=='conflict'){e.state='error';e.error='Não foi possível guardar o rascunho no aparelho. Mantenha o app aberto até sincronizar.';}
   this.changed();
  });return this.disk;
 }
 async flush(id:string):Promise<void> {
  const timer=this.timers.get(id);if(timer)clearTimeout(timer);this.timers.delete(id);
  const running=this.flights.get(id);if(running){await running;const e=this.entries.get(id);if(e&&e.version>e.acked&&e.state==='pending')await this.flush(id);return;}
  const e=this.entries.get(id);if(!e||e.version===e.acked||e.state==='conflict')return;
  const job=this.saveEntry(id,e);this.flights.set(id,job);await job;this.flights.delete(id);
  if(!this.disposed&&this.entries.get(id)===e&&e.version>e.acked&&e.state==='pending')this.schedule(id);
 }
 private async saveEntry(id:string,e:PageEntry){
  const version=e.version,snapshot=clone(e.draft);let patch=pagePatch(e.base,e.baseDraft,snapshot);
  if((e.allowSecret||ALLOW_SECRET.has(id))&&!(e.base.tags||[]).includes(SECRET_OK_TAG))patch={...patch,tags:[...(e.base.tags||[]),SECRET_OK_TAG]};
  if(patch.title===undefined&&!patch.data){e.acked=version;e.state='saved';await this.persist();this.changed();return;}
  e.state='saving';e.error='';this.changed();
  try {
   let saved:Entity;
   try{saved=await this.deps.save(patch);}catch(error:any){
    // 06/11/2026 (Pedro): texto com senha - em vez do erro, a pagina pergunta se quer trancar com senha (o rascunho fica guardado)
    if(error?.code==='POSSIBLE_SECRET'){const ok=e.allowSecret||ALLOW_SECRET.has(id);e.state=ok?'pending':'secret';e.secretAsk=!ok;e.error='';this.changed();await this.persist();if(ok)this.schedule(id); /* respondeu "nao" enquanto este salvar estava no caminho: tenta de novo, agora com a marca */ return;}
    if(error?.status!==409)throw error;
    e.state='conflict';e.error='Esta página também foi alterada no site. Seu rascunho está preservado; escolha qual versão manter.';this.changed();await this.persist();return;
   }
   if(this.entries.get(id)!==e)return;
   e.base=this.deps.view?this.deps.view(saved):saved;e.baseDraft=snapshot; /* trancada: a base guarda o texto aberto (senao o proximo salvar cifraria "[]") */e.acked=version;e.state=e.version===version?'saved':'pending';e.firstChange=this.now();e.error='';
   if(!this.disposed)this.deps.onSaved?.(saved);
  }catch(error:any){if(this.entries.get(id)===e){e.state='error';e.error=error instanceof Error?error.message:'Não foi possível sincronizar. O rascunho continua no aparelho.';}}
  await this.persist();this.changed();
 }
 async resolve(id:string,keepLocal:boolean){const e=this.entries.get(id);if(!e)return;try{const remote=await this.deps.read(id);e.base=remote;e.baseDraft=pageDraft(remote);
  if(!keepLocal){e.draft=clone(e.baseDraft);e.past=[];e.future=[];e.acked=e.version;e.state='saved';}else{e.version++;e.state='pending';e.firstChange=this.now();}
  e.error='';this.changed();await this.persist();if(keepLocal)await this.flush(id);
 }catch(error:any){e.error=String(error?.message||error);this.changed();}}
 forget(id:string){const t=this.timers.get(id);if(t)clearTimeout(t);this.timers.delete(id);this.entries.delete(id);void this.persist();this.changed();}
 async flushAll(){await Promise.all([...this.entries.keys()].map(id=>this.flush(id)));await this.disk;}
 pending(){return [...this.entries.values()].filter(e=>e.version>e.acked);}
 dispose(){this.disposed=true;STORES.delete(this);this.timers.forEach(clearTimeout);this.timers.clear();this.listeners.clear();}
}

export function expandedIds(raw:unknown):Set<string>{
 if(!Array.isArray(raw))return new Set();return new Set(raw.filter(x=>typeof x==='string'&&x.length<160));
}
export function toggleExpanded(current:Set<string>,id:string):Set<string>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;}
