import {newFluency,queueOptional} from './fluency';
import {perfSync,perfEvent,perfNow,measureVolume} from './fluency-metrics';
// historyBytes in the report is now raw.length (UTF-16 units): the exact UTF-8 walk cost ~O(n) on the JS thread at every hydrate.
import {recentChatPage} from './chat-window';
/** A disposable encrypted view cache. The server remains authoritative. */
export type SnapshotStorage={read:(scope:string)=>Promise<string|null>;write:(scope:string,value:string)=>Promise<unknown>;remove:(scope:string)=>Promise<unknown>};
type Entry={at:number;value:unknown};
const MAX_AGE=14*86400000,MAX_BYTES=4*1024*1024;
/** Real-device report (0.3.112): 11 full rewrites of the ~4 MB archive in 3 minutes, each a ~200 ms JS stall at its start.
 * Ordinary refreshes now (a) never rewrite when the response is identical and (b) are spaced at least this far apart.
 * Erasing data and explicit flushes are never delayed. */
export const MIN_WRITE_GAP_MS=30000;
/** Resumo pronto do widget Price Tracker da Início (não é rota do servidor): permite
 * desenhar o widget já no primeiro quadro, com a última leitura conhecida. */
export const MONITOR_WIDGET_PATH='/local/monitor-widget';
/** 0.3.240: ultimo estado da Meta da Início (numeros + se o dono a escondeu). Pequeno e fixo, no mesmo pacote de abertura,
 * para a Meta ja vir desenhada no PRIMEIRO quadro (antes nascia vazia e entrava no topo empurrando a tela). */
export const GOAL_WIDGET_PATH='/local/goal-widget';
/** 0.3.255: olho dos valores (Inicio e Financas) - o ultimo estado ja no primeiro quadro, sem mostrar valor escondido. */
export const VALUES_MASK_PATH='/local/values-mask';
export const chatRead=(path:string)=>path==='/chat-sync/current'||path==='/conversations?offset=0'||/^\/conversations\/[\w-]+$/.test(path);
// Keep the next launch independent of recently opened history/detail pages.
// MONITOR_WIDGET_PATH is intentionally NOT in this tier-1 group: it only needs
// to be in launchRead() below (the small, fixed-size home-v1 blob) to show up
// instantly on open. Putting it here too made it compete for the shared 32-slot
// cap in flush() against real user data (page drafts, chat) under heavy use —
// a widget summary must never be able to evict something the user actually saved.
export const startupPriority=(path:string)=>path==='/chat-sync/current'?0:
 ['/tasks','/home','/workspace/catalog','/md/dashboard','/agenda'].includes(path)?1:
 /^\/agenda\?month=\d{4}-\d{2}$/.test(path)?2:3;
const fresh=(path:string,at:number,now:number)=>at<=now+60000&&(chatRead(path)||now-at<MAX_AGE);
// A separate, encrypted first-screen projection prevents years of chat/detail
// history from being decrypted, transferred and parsed before Home can mount.
// 04/11/2026 (Pedro: "os blocos do Inicio ja tem que aparecer logo de primeira"): no SITE o pacote da abertura tambem leva o
// que os blocos do Inicio esperam (meses seguintes da Agenda, encomendas, e-mails, capsulas, rotina, monitor e avisos);
// no Android nada muda (o pacote pequeno continua pequeno). Sem document = Android/testes.
const WEB_SNAPSHOT=typeof document!=='undefined';
const WEB_LAUNCH=/^\/workspace\/entities\?limit=100&kind=(?:package|mail_hit|capsule|routine|monitor)&q=&offset=0$/;
function webLaunchRead(path:string){return WEB_SNAPSHOT&&(path.startsWith('/local/web/')||/^\/agenda\?month=\d{4}-\d{2}$/.test(path)||WEB_LAUNCH.test(path)||path==='/md/notifications?offset=0');}
export function launchRead(path:string,now=Date.now()){
 if(webLaunchRead(path))return true;
 const date=new Date(now),month=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
 return ['/tasks','/home','/md/dashboard','/workspace/catalog','/chat-sync/current','/agenda?month='+month,MONITOR_WIDGET_PATH,GOAL_WIDGET_PATH,VALUES_MASK_PATH].includes(path);
}
export function cacheableRead(path:string){
 if(WEB_SNAPSHOT&&(path==='/md/notifications?offset=0'||path.startsWith('/local/web/')))return true;
 if(chatRead(path))return true;
 if(['/bootstrap','/home','/tasks','/workspace/catalog','/workspace/integrations','/md/dashboard','/agenda','/chat-sync/current',MONITOR_WIDGET_PATH,GOAL_WIDGET_PATH,VALUES_MASK_PATH].includes(path))return true;
 if(/^\/agenda\?month=\d{4}-\d{2}$/.test(path))return true;
 return path.startsWith('/workspace/entities?')&&/(?:\?|&)offset=0(?:&|$)/.test(path)&&!/[?&]q=[^&]+/.test(path);
}
export class StartupSnapshot {
 private launchEntries=new WeakSet<Entry>();
 private encoded=new WeakMap<Entry,string>();private exposed=new WeakSet<Entry>();
 private entries=new Map<string,Entry>();private timer:ReturnType<typeof setTimeout>|undefined;private closed=false;private revision=0;
 private cancelSave:(()=>void)|null=null;private lazyTimer:ReturnType<typeof setTimeout>|undefined;private lastWriteAt=-Infinity;private valueText=new WeakMap<Entry,string>();
 private hydration:Promise<void>|null=null;private launchOnly=false;private lastLaunch='';
 private forgotten=new Set<string>();private erasedChat=false;private erasedData=false;
 constructor(private storage:SnapshotStorage,private scope:string,private now=Date.now){}
 private importRaw(raw:string|null,revision:number,onlyLaunch=false){
  if(!raw||raw.length>MAX_BYTES*2||this.closed||revision!==this.revision)return;
  const parsed=perfSync(onlyLaunch?'parse:home':'parse:history',()=>JSON.parse(raw));if(parsed.schema!==1||!Array.isArray(parsed.entries))return;
  for(const pair of parsed.entries){if(!Array.isArray(pair)||pair.length!==2)continue;const [path,e]=pair;
   if(typeof path==='string'&&cacheableRead(path)&&!this.forgotten.has(path)&&!(this.erasedChat&&chatRead(path))&&!(this.erasedData&&path!=='/bootstrap'&&!chatRead(path))&&(!onlyLaunch||launchRead(path,this.now()))&&e&&typeof e.at==='number'&&fresh(path,e.at,this.now())){
    const existing=this.entries.get(path);
    if(!existing||(!onlyLaunch&&this.launchEntries.has(existing)&&existing.at===e.at)){this.entries.set(path,e);if(onlyLaunch)this.launchEntries.add(e);}
   }
  }
  if(!onlyLaunch){const size=raw.length;queueOptional('count:history',()=>perfSync('count:history',()=>measureVolume([...this.entries].map(([k,e])=>[k,e.value] as const),size)),9,15000);}
 }
 async hydrateLaunch(){
  const revision=this.revision;
  try{this.importRaw(await this.storage.read(this.scope+'|home-v1'),revision,true);}catch{}
  const date=new Date(this.now()),month=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  if(this.entries.has('/tasks')&&this.entries.has('/agenda?month='+month)){this.launchOnly=true;return;}
  // Upgrade/month rollover: recover the existing full snapshot once. Never
  // substitute invented empty tasks or calendar for missing user records.
  // An already-usable Home projection must not wait for decrypting/parsing
  // the much larger history archive merely because the current month changed.
  // Recover secondary entries safely in the background; never discard them.
  if(this.entries.has('/home')||this.entries.has('/tasks')){
   this.launchOnly=true;
   void this.hydrate().then(()=>this.flushLaunch()).catch(()=>{});
   return;
  }
  await this.hydrate();void this.flushLaunch();
 }
 async hydrate(){
  if(!this.hydration){const revision=this.revision;this.hydration=(async()=>{
   try{const t=perfNow();const raw=await this.storage.read(this.scope);perfEvent('hidratar:read',t);this.importRaw(raw,revision);}catch{}finally{this.launchOnly=false;}
  })();}return this.hydration;
 }
 /** 0.3.243: grava SO o pacote pequeno da abertura, agora (sem esperar o arquivo grande nem a saida do app).
  * Usado quando um dado do primeiro quadro muda (ex.: a Meta): se o Android congelar ou matar o app logo depois,
  * a abertura seguinte ja tem o dado. Nao toca no arquivo grande de historico. */
 async persistLaunchNow(){await this.flushLaunch();}
 private async flushLaunch(){
  if(this.closed)return;
  const pairs=[...this.entries].filter(([path])=>launchRead(path,this.now())).map(([path,e])=>{
   const value=e.value as {messages?:unknown};
   return path==='/chat-sync/current'&&Array.isArray(value?.messages)?[path,{...e,value:recentChatPage(value as any)}]:[path,e];
  });
  const raw=JSON.stringify({schema:1,entries:pairs});if(raw===this.lastLaunch)return;
  try{await this.storage.write(this.scope+'|home-v1',raw);this.lastLaunch=raw;}catch{}
 }
 private expose(entry:Entry){this.exposed.add(entry);this.encoded.delete(entry);return entry.value;}
 peek<T>(path:string):T|undefined {const e=this.entries.get(path);return e&&fresh(path,e.at,this.now())?this.expose(e) as T:undefined;}
 all(){return [...this.entries].map(([key,e])=>[key,this.expose(e)] as const);}
 remember(path:string,value:unknown){if(this.closed||!cacheableRead(path))return;
  const prior=this.entries.get(path)?.value as any,latest=value as any;
  // Protect chat history against unexplained empty API responses.
  // Confirmed user deletions use forgetChat()/forget(), never this path.
  if(chatRead(path)&&prior&&latest){
   if(Array.isArray(prior.messages)&&prior.messages.length&&Array.isArray(latest.messages)&&!latest.messages.length&&
      prior.conversation?.id===latest.conversation?.id&&!(latest.deleted_ids||[]).length)return;
   if(path==='/conversations?offset=0'&&Array.isArray(prior.items)&&prior.items.length&&Array.isArray(latest.items)&&!latest.items.length)return;
  }
  try{const text=JSON.stringify(value);if(text.length>1024*1024)return;
  const previous=this.entries.get(path);
  // Same bytes as what is already persisted, and nobody could have mutated that object: nothing new to write.
  const unchanged=newFluency()&&!!previous&&!this.exposed.has(previous)&&this.valueText.get(previous)===text;
  const entry:Entry={at:this.now(),value:JSON.parse(text)};this.entries.set(path,entry);this.valueText.set(entry,text);this.encoded.set(entry,'{"at":'+JSON.stringify(entry.at)+',"value":'+text+'}');
  if(!unchanged)this.schedule(false);}catch{}}
 /** Reconcile only a deletion already acknowledged by the server. A failed
  * request must never erase unrelated launch data or retained chat history. */
 deleteRecord(domain:'task'|'entity',id:string){
  if(this.closed||!id)return;
  this.revision++;
  for(const [path,entry] of this.entries){
   if(chatRead(path))continue;
   const value=entry.value as Record<string,unknown>|null;
   if(!value||typeof value!=='object')continue;
   let next=value;
   const prune=(field:string)=>{
    const rows=value[field];if(!Array.isArray(rows)||!rows.some(row=>row?.id===id))return;
    next={...next,[field]:rows.filter(row=>row?.id!==id)};
   };
   if(domain==='task'){
    if(path==='/tasks')prune('items');
    if(path==='/home'){prune('tasks');prune('today_tasks');}
   }else{
    if(path==='/agenda'||path.startsWith('/agenda?month='))prune('items');
    if(path.startsWith('/workspace/entities?')){
     const rows=value.items;
     // A page deletion can change descendant hierarchy. Invalidate only that
     // listing rather than inventing a cascade or discarding Agenda and Tasks.
     if(Array.isArray(rows)&&rows.some(row=>row?.id===id&&row.kind==='user_page')){this.entries.delete(path);continue;}
     prune('items');
    }
   }
   // Keep the original read timestamp: this is a local reconciliation, not a
   // claim that all remaining rows were freshly fetched from the server.
   if(next!==value)this.entries.set(path,{at:entry.at,value:next});
  }
  this.schedule();
 }
 forgetData(){if(this.closed)return;this.erasedData=true;this.revision++;for(const key of this.entries.keys())if(key!=='/bootstrap'&&!chatRead(key))this.entries.delete(key);this.schedule();}
 forgetChat(){if(this.closed)return;this.erasedChat=true;this.revision++;for(const key of this.entries.keys())if(chatRead(key))this.entries.delete(key);this.schedule();}
 forget(path:string){if(this.closed)return;this.forgotten.add(path);this.revision++;this.entries.delete(path);this.schedule();}
 private schedule(urgent=true){
  if(newFluency()){
   const enqueue=()=>{if(!this.cancelSave)this.cancelSave=queueOptional('snapshot:write',()=>{this.cancelSave=null;return this.flush();},9,8000);};
   if(urgent){if(this.lazyTimer){clearTimeout(this.lazyTimer);this.lazyTimer=undefined;}enqueue();return;}
   const wait=this.lastWriteAt+MIN_WRITE_GAP_MS-this.now();
   if(wait<=0){enqueue();return;}
   if(!this.lazyTimer)this.lazyTimer=setTimeout(()=>{this.lazyTimer=undefined;enqueue();},wait);
   return;
  }
  if(this.timer)return;this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},450);
 }
 async flush(){
  if(this.closed)return;
  this.lastWriteAt=this.now();
  // A write after fast launch must merge the old archive before replacing it.
  // Otherwise the small projection could overwrite retained chat and pages.
  if(this.launchOnly)await this.hydrate();
  if(this.closed)return;
  await this.flushLaunch();
  if(this.closed)return;
  const entries=[...this.entries].sort((a,b)=>startupPriority(a[0])-startupPriority(b[0])||b[1].at-a[1].at).slice(0,32);
  const prefix='{"schema":1,"entries":[',suffix=']}',parts:string[]=[];
  let size=prefix.length+suffix.length;
  for(const [path,entry] of entries){
   let encoded=this.exposed.has(entry)?undefined:this.encoded.get(entry);
   if(encoded===undefined){encoded=JSON.stringify(entry);if(!this.exposed.has(entry))this.encoded.set(entry,encoded);}
   const part='['+JSON.stringify(path)+','+encoded+']',extra=part.length+(parts.length?1:0);
   // Same schema, 32-entry limit and character budget; launch reads are pinned ahead of secondary entries. Do not
   // repeatedly serialize all the old records while trimming the tail.
   if(parts.length&&size+extra>MAX_BYTES)break;
   parts.push(part);size+=extra;
  }
  try{await this.storage.write(this.scope,prefix+parts.join(',')+suffix);}catch{/* Confirmed server writes never depend on the optional cache. */}
 }
 async clear(){this.cancelSave?.();this.cancelSave=null;if(this.lazyTimer){clearTimeout(this.lazyTimer);this.lazyTimer=undefined;}this.closed=true;if(this.timer)clearTimeout(this.timer);this.entries.clear();this.encoded=new WeakMap();this.exposed=new WeakSet();for(const scope of [this.scope,this.scope+'|home-v1'])try{await this.storage.remove(scope);}catch{}}
}
