// 0.3.146: quando o app foi para o segundo plano (para saber se uma falha foi so interrupcao).
// AppState e carregado sob demanda: os testes carregam este modulo fora do React Native.
let lastBackgroundAt=0;
const appState=(()=>{try{return require('react-native').AppState as {currentState:string;addEventListener:(e:string,f:(s:string)=>void)=>{remove:()=>void}};}catch{return null;}})();
try{appState?.addEventListener('change',state=>{if(state!=='active')lastBackgroundAt=Date.now();});}catch{}
export function wentToBackgroundSince(t:number){return lastBackgroundAt>=t||(!!appState&&appState.currentState!=='active');}
export function waitForActive(maxMs=15000){if(!appState||appState.currentState==='active')return Promise.resolve();return new Promise<void>(resolve=>{let sub:{remove:()=>void}|null=null;const done=()=>{sub?.remove();clearTimeout(timer);resolve();};sub=appState.addEventListener('change',s=>{if(s==='active')done();});const timer=setTimeout(done,maxMs);});}
export function isChatSend(path:string,method:string){return method==='POST'&&/^\/(chat|conversations|messages)/.test(path)&&!path.startsWith('/chat-sync');}
import {mergeOnConflict} from './merge-save';
import type {MercadoLivreOptions, MercadoLivreResponse} from './mercado-livre-types';
import type {StoreConnectionsState} from './store-connections-types';
import {readMercadoLivrePageOnDevice,canonicalMercadoLivreUrl,resolveMercadoLivreCatalogUrl,resolveCatalogViaBrowser,resetCatalogTrace,lastCatalogTrace} from './mercado-livre-device';
import {AUTH_STORAGE_KEY,PREFS_STORAGE_KEY,takeStartupAuth,takeStartupPrefs,invalidateStartupAuth,invalidateStartupPrefs} from './startup-read-ahead';
import {StartupSnapshot} from './startup-snapshot';
import {encryptedStorage} from './encrypted-storage';
export type DriveCategory={key:string;label:string;hint:string;count:number;bytes:number;deletable?:boolean};
export type ReceiptsCleanup={enabled:boolean;days:number;last_at:string;last_removed:number};
export type DriveExport={state:'running'|'done'|'error';folder_name:string;link:string;total:number;done:number;failed:number;bytes:number;started_at:string;finished_at:string;error:string};
export type DriveSummary={connected:boolean;mode:'hidden'|'folder';needs_reconnect:boolean;migration:{state:string;moved:number;left:number;error:string;finished_at:string};export:DriveExport|null;wiped_at:string;categories:DriveCategory[];quota:DriveQuota|null;receipts_cleanup?:ReceiptsCleanup;voices_cleanup?:ReceiptsCleanup};
export type DriveQuota={limit:number;usage:number;usage_in_drive:number;usage_in_trash:number};
export type DriveStorage={quota:DriveQuota|null;categories:{key:string;label:string;count:number;bytes:number}[];sofia_bytes:number;mode:'hidden'|'folder'};
export type DriveFile={id:string;name:string;mime:string;size:number;modified:string;origin:string;deletable?:boolean};
export type CalendarState={configured:boolean;connected:boolean;syncing?:boolean;last_sync?:string;error?:string;calendar_name?:string;calendar_id?:string;warnings?:string[];item_errors?:{id:string;title:string;reason:string}[];conflicts?:{id:string;reason:string}[];calendars?:{id:string;summary:string;accessRole:string;selected?:boolean;primary?:boolean}[];email?:string;redirect_uri?:string;history?:{at:string;imported:number;created:number;updated:number;sent:number;removed:number;skipped:number;conflicts:number;ms:number}[];gmail?:{connected:boolean};drive?:{connected:boolean;mode?:'hidden'|'folder';needs_reconnect?:boolean;migration?:{state:string;moved:number;left:number;error:string;finished_at:string};portable?:{configured:boolean;at:string;error:string};folders?:string[];attachments?:{total:number;in_drive:number;local_mb:number};voices?:{total:number;in_drive:number;local_mb:number};pages?:number;last_backup?:string;last_backup_error?:string;backups:number;folder:string}};
import {StartupReads,preloadStartup} from './startup-preload';
import {themeTimes} from './theme-schedule';
import {agendaChanged,recordRemoved} from './agenda-events';
import {systemChanged} from './system-events';
import {mergeMessages} from './chat-model';
import {LegacyMdAdapter} from './legacy-md';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Auth, Bootstrap, Conversation, MessagePage, ChatResult, HomeData, Task, AgendaItem, Notice, Profile, Prefs, Catalog, Entity, ChatSnapshot } from './types';
// 0.3.247: no navegador o site fala com o servidor que o serviu (mesma origem); no celular, o endereco publico
const inBrowser = typeof document !== 'undefined' && typeof location !== 'undefined' && /^https?:/.test(location.origin);
const rawBase = (inBrowser ? location.origin : (process.env.EXPO_PUBLIC_API_URL || 'https://sofiaos.up.railway.app')).replace(/\/+$/, '');
const parsedBase = new URL(rawBase);
if ((parsedBase.protocol !== 'https:' && !(inBrowser && parsedBase.protocol === 'http:')) || parsedBase.username || parsedBase.password || parsedBase.search || parsedBase.hash || parsedBase.pathname !== '/') throw new Error('Configure a raiz HTTPS do servidor Sofia.');
export type BoardTopic = {title: string; started_at: string | null; message_id: string | null; decided: string[]; todo: string[]; open: {title: string; detail: string}[]; numbers: {label: string; value: string}[]; refs: string[]};
export type BoardData = {topics: BoardTopic[]; updated_at: string | null};
export type LoginCodeNeeded = {need_code: true; challenge: string; sent_to: string};
const WEB_TRUST_KEY = 'sofia.web.trust.v1';
/** 04/11/2026 (Pedro: "quando o texto parar, os 3 blocos ja tem que estar carregados"): no site, anota SO os enderecos
 * (nunca os dados) das leituras feitas ate os blocos do Inicio aparecerem; na proxima abertura public/assets/early.js
 * pede todas de uma vez enquanto o codigo do site ainda baixa (antes eram 3 ondas, uma depois da outra). */
const EARLY_PATHS_KEY = 'sofia.early.paths.v1';
let earlyPaths: Set<string> | null = typeof document !== 'undefined' ? new Set() : null;
function noteEarlyPath(path: string) { if (earlyPaths && earlyPaths.size < 40 && !/[?&]q=[^&]/.test(path) && !path.startsWith('/auth')) earlyPaths.add(path); }
export function saveEarlyPaths() { if (!earlyPaths) return; const list = [...earlyPaths]; earlyPaths = null; try { if (list.length) localStorage.setItem(EARLY_PATHS_KEY, JSON.stringify(list)); } catch { /* modo privado */ } }
// sem importar react-native aqui (os testes carregam este arquivo sozinho): no site existe document
const isWebRuntime = () => typeof document !== 'undefined';
export const SITE = rawBase;
const AUTH_KEY = AUTH_STORAGE_KEY, PREFS_KEY = PREFS_STORAGE_KEY;
const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export async function readAuth(): Promise<Auth | null> {
  const raw = await takeStartupAuth(()=>SecureStore.getItemAsync(AUTH_KEY));
  if (!raw) return null;
  try { const a = JSON.parse(raw); if (typeof a.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(a.token) || !Number.isFinite(Date.parse(a.expires_at)) || !a.profile) { await forgetAuth(); return null; } return a as Auth; }
  catch { await forgetAuth(); return null; }
}
export function saveAuth(auth: Auth) { invalidateStartupAuth(); return SecureStore.setItemAsync(AUTH_KEY, JSON.stringify(auth), secureOptions); }
export function forgetAuth() { invalidateStartupAuth(); return SecureStore.deleteItemAsync(AUTH_KEY); }
export async function readPrefs(): Promise<Prefs> {
  try { const p = JSON.parse(await takeStartupPrefs(()=>AsyncStorage.getItem(PREFS_KEY)) || '{}'); return { appearance: ['system','light','dark','schedule'].includes(p.appearance) ? p.appearance : 'schedule', enterToSend: p.enterToSend === true, autoSendVoice: p.autoSendVoice !== false, ...themeTimes(p) }; }
  catch { return { appearance: 'schedule', enterToSend: false, autoSendVoice: true, lightAt:'05:00', darkAt:'19:00' }; }
}
export function savePrefs(p: Prefs) { invalidateStartupPrefs(); return AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p)); }
export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number, public data?: Record<string, unknown>) { super(message); this.name = 'ApiError'; }
}
// Organização dos widgets da Início guardada no aparelho enquanto o servidor
// não sincroniza (antes dava erro e o widget de Cápsulas não entrava).
const LOCAL_WIDGETS_KEY='sofia.native.dashboard-widgets.v1';
// Diagnóstico: últimas falhas de rede (rota, código, tempo). Sem corpo, token ou dados.
const apiFailures:Array<{at:string;path:string;method:string;status:number;code:string;ms:number}>=[];
function noteApiFailure(path:string,method:string,e:ApiError,ms:number){apiFailures.push({at:new Date().toISOString(),path:path.split('?')[0].slice(0,80),method,status:Number(e?.status)||0,code:String(e?.code||'?'),ms});if(apiFailures.length>40)apiFailures.shift();}
export function apiDiagnostics(){return {recentFailures:apiFailures.slice(-25)};}
export function startupSnapshotFor(scope:string){return new StartupSnapshot(encryptedStorage,SITE+'|'+scope.trim().toLowerCase()+'|startup-v1');}
export type ImportItem = {import_id: string; date: string; desc: string; amount: number; kind: string; category: string; duplicate: boolean; skip: string; checked?: boolean; before?: boolean; match?: {id: string; title: string; amount?: number} | null; original?: string};
/** 0.3.268: a ultima API com sessao (para partes que nao recebem a API por props, como a foto do perfil). */
let activeApi: SofiaApi | null = null;
export function currentApi() { return activeApi; }
export type ProfilePhoto = {mime: string; base64: string; updated_at: string};
export type CatalogHit = {type: string; title: string; year: number | null; creator: string; cover: string; genre: string; source: string};
export type LinkPreview = {url: string; title: string; site: string; image: string; price: number | null; description: string; type?: string; read: boolean};
export class SofiaApi {
  private readonly md:LegacyMdAdapter;
  private readonly startupReads=new StartupReads();
  private warming=false;
  private preloadFlight:Promise<void>|null=null;
  private readonly snapshots:StartupSnapshot;
  private hydration:Promise<void>|null=null;
  private chatOpening:Promise<ChatSnapshot>|null=null;
  private cacheGeneration=0;
  private networkGate:Promise<void>=Promise.resolve();
  private releaseGate:(()=>void)|null=null;
  /** Cached reads stay available; live I/O cannot contend with first layout. */
  deferNetworkUntilPaint(){if(!this.releaseGate)this.networkGate=new Promise<void>(resolve=>{this.releaseGate=resolve;});return this;}
  releaseNetwork(){this.releaseGate?.();this.releaseGate=null;}

  private rememberChatResult(result:ChatResult,input:object){
    const id=result.conversation_id||(input as {conversation_id?:string}).conversation_id;if(!id)return;
    const current=this.snapshots.peek<ChatSnapshot>('/chat-sync/current');
    const before=current?.conversation?.id===id?current:this.snapshots.peek<ChatSnapshot>('/conversations/'+id);
    const conversation=before?.conversation||(result.conversation?.id===id?result.conversation:undefined)||{id,title:'Conversa com a Sofia',channel:'mobile',state:'active',created_at:result.messages[0]?.created_at||new Date().toISOString(),updated_at:new Date().toISOString()};
    const saved:ChatSnapshot={...before,conversation,current_id:id,cursor_revision:before?.cursor_revision||0,deleted_ids:before?.deleted_ids||[],messages:mergeMessages(before?.messages||[],result.messages).slice(-100),has_more:result.has_more};
    this.snapshots.remember('/chat-sync/current',saved);this.snapshots.remember('/conversations/'+id,saved);
  }
  async hydrate(){if(!this.hydration)this.hydration=this.snapshots.hydrate().then(()=>{for(const [key,value] of this.snapshots.all())this.startupReads.seed(key,value);});return this.hydration;}
  async persistLaunch(){await this.snapshots.flush();}
  /** 0.3.243: grava ja so o pacote pequeno da abertura (ver StartupSnapshot.persistLaunchNow). */
  async persistLaunchProjection(){await this.snapshots.persistLaunchNow();}
  async prefetchCache(path:string){if(!/^\/(workspace\/|conversations\?|agenda\?|md\/dashboard)/.test(path))return;const value=await this.fetchRequest(path,undefined,'GET',20000);this.startupReads.seed(path,value);}
  cached<T>(path:string){return this.snapshots.peek<T>(path);}
  /** Guarda um resumo calculado no app (ex.: widget da Início) no mesmo cache criptografado da abertura. */
  rememberLocal(path:string,value:unknown){this.snapshots.remember(path,value);}
  /** 04/11/2026: no site, o que os blocos do Inicio mostram fica no pacote criptografado da abertura (abre ja pronto e atualiza por tras). */
  webPeek<T>(name:string):T|undefined{return typeof document!=='undefined'?this.cached<T>('/local/web/'+name):undefined;}
  webKeep(name:string,value:unknown){if(typeof document==='undefined')return;this.rememberLocal('/local/web/'+name,value);clearTimeout(this.webKeepTimer);this.webKeepTimer=setTimeout(()=>{void this.persistLaunchProjection().catch(()=>{});},1500);}
  private webKeepTimer:any;
  async discardCache(){this.cacheGeneration++;this.startupReads.invalidate();await this.snapshots.clear();}
  async liveBootstrap(){return this.fetchRequest<Bootstrap>('/bootstrap',undefined,'GET',20000);}
  preload(agenda:()=>Promise<unknown>){
    if(!this.preloadFlight){const flight=this.runPreload(agenda);this.preloadFlight=flight;void flight.finally(()=>{if(this.preloadFlight===flight)this.preloadFlight=null;}).catch(()=>{});}
    return this.preloadFlight;
  }
  private async runPreload(agenda:()=>Promise<unknown>){
    await this.hydrate();
    // Only paths that already came from disk need an explicit live refresh.
    // On a cold cache preloadStartup fetches them once, so do not fetch twice.
    const paths=['/home','/tasks','/md/dashboard','/workspace/catalog',...['user_page','capsule','routine','monitor'].map(kind=>'/workspace/entities?limit=100&kind='+kind+'&q=&offset=0')];
    const refresh=paths.filter(path=>this.snapshots.peek(path)!==undefined);
    this.warming=true;void this.conversations().catch(()=>{});try{await preloadStartup(this,agenda);}finally{this.warming=false;}
    let index=0;await Promise.all(Array.from({length:2},async()=>{while(index<refresh.length){const path=refresh[index++];try{const value=await this.fetchRequest(path,undefined,'GET',20000);this.startupReads.seed(path,value);}catch{}}}));
    if(refresh.length)systemChanged(this);
  }
  readonly owner: string;
  constructor(private token = '', private onExpired: () => void = () => {},scope='anonymous',restored?:StartupSnapshot) {if(token)activeApi=this;this.owner=scope;this.md=new LegacyMdAdapter(this.request.bind(this),AsyncStorage,scope);this.snapshots=restored||startupSnapshotFor(scope);if(restored){for(const [key,value] of restored.all())this.startupReads.seed(key,value);}}
  get mdLocalOnly(){return this.md.localOnly;}
  /** 0.3.256: ordem das Paginas guardada no aparelho - pronta? carregar; aplicar sem rede */
  get pageOrderReady(){return this.md.orderLoaded;}
  pageOrderLoad(){return this.md.loadOrder();}
  pageOrderApply(items:Entity[]){return this.md.decorateNow(items);}
  private async request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', timeout = 20000): Promise<T> {
    if(method!=='GET'){
      // Merge retained records before a mutation can reconcile or remove any
      // projection restored by the lightweight launch path.
      await this.hydrate();
      if(!path.startsWith('/chat-sync/current')&&!path.startsWith('/chat-sync/select')){this.cacheGeneration++;this.startupReads.invalidate();}
      const result=await this.fetchRequest<T>(path,body,method,timeout);
      // 04/11/2026: leituras feitas DURANTE a escrita (ex.: conversa que cria uma tarefa) eram reaproveitadas depois com dado velho
      if(!path.startsWith('/chat-sync/current')&&!path.startsWith('/chat-sync/select')){this.cacheGeneration++;this.startupReads.invalidate();}
      if(method==='DELETE'){
        // Fence reads begun during the write too. Failed deletes never get here.
        this.cacheGeneration++;this.startupReads.invalidate();
        const task=/^\/tasks\/([^/]+)$/.exec(path),entity=/^\/workspace\/entities\/([^/]+)$/.exec(path);
        if(task||entity){this.snapshots.deleteRecord(task?'task':'entity',decodeURIComponent((task||entity)![1]));await this.snapshots.flush();}
      }
      return result;
    }
    const read=()=>this.fetchRequest<T>(path,body,method,timeout);
    return this.warming&&path!=='/bootstrap' ? this.startupReads.prime(path,read) : this.startupReads.read(path,read);
  }
  private async fetchRequest<T>(path:string,body:unknown,method:string,timeout:number,signal?:AbortSignal):Promise<T>{
    const started=Date.now();
    try{return await this.fetchOnce<T>(path,body,method,timeout,signal);}
    catch(error){
      const e=error as ApiError;
      // 0.3.146: requisicao que "caiu" porque o app foi para o segundo plano (Gmail, navegador,
      // tela bloqueada) nao e falha da Sofia nem falta de internet. Leitura: espera o app voltar
      // e repete uma vez, em silencio. Escrita: vira INTERRUPTED, com texto da propria operacao.
      const interrupted=wentToBackgroundSince(started);
      if(interrupted&&method!=='GET'&&(e.code==='TIMEOUT'||e.code==='NETWORK')&&!isChatSend(path,method)){noteApiFailure(path,method,e,Date.now()-started);throw new ApiError('A operação foi interrompida quando o app saiu da tela. Confira se ela foi concluída antes de repetir.','INTERRUPTED',0);}
      // Leitura que caiu porque o servidor estava reiniciando, ocupado, demorou ou o app saiu da tela: tenta de novo uma vez, em silêncio.
      // (Antes a nova tentativa so valia se o erro viesse antes do prazo - um TIMEOUT nunca repetia.)
      if(method==='GET'&&!signal?.aborted&&(e.status===502||e.status===503||e.status===504||e.code==='TIMEOUT'||(e.code==='NETWORK'&&interrupted))){
        await waitForActive();
        await new Promise(r=>setTimeout(r,interrupted?300:1200));
        try{return await this.fetchOnce<T>(path,body,method,timeout,signal);}catch(again){noteApiFailure(path,method,again as ApiError,Date.now()-started);throw again;}
      }
      noteApiFailure(path,method,e,Date.now()-started);throw error;
    }
  }
  private async fetchOnce<T>(path:string,body:unknown,method:string,timeout:number,signal?:AbortSignal):Promise<T>{
    if(signal?.aborted)throw new ApiError('Leitura cancelada.','CANCELLED',0);
    // 04/11/2026: no site, public/assets/early.js ja pediu esta leitura enquanto o codigo baixava
    if(method==='GET')noteEarlyPath(path);
    const early=method==='GET'&&typeof window!=='undefined'?(window as any).__sofiaEarly?.[path]:undefined;
    if(early){delete (window as any).__sofiaEarly[path];const data=await early;if(data)return data as T;}
    await this.networkGate;
    if(signal?.aborted)throw new ApiError('Leitura cancelada.','CANCELLED',0);
    const generation=this.cacheGeneration,controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
    try {
      const response = await fetch(SITE + '/api/mobile' + path, { method, signal: controller.signal,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error' });
      let data: Record<string, any>;
      try { data = await response.json(); } catch { throw new ApiError('O servidor não retornou dados válidos. A API móvel da Sofia precisa estar publicada.', 'INVALID_RESPONSE', response.status); }
      if (!response.ok && path === '/auth/login' && (response.status === 404 || response.status === 405 || data.code === 'AUTH_REQUIRED')) throw new ApiError('O servidor ainda precisa receber a API móvel da Sofia. Não é um erro da sua senha.', 'MOBILE_API_NOT_PUBLISHED', response.status);
      if (!response.ok) { if (response.status === 401 && path !== '/auth/login') {this.onExpired();} throw new ApiError(data.error || (response.status>=502&&response.status<=504?'O servidor da Sofia está reiniciando ou ocupado ('+response.status+'). Tente de novo em alguns segundos.':'Não foi possível concluir ('+response.status+').'), data.code || (response.status>=502&&response.status<=504?'SERVER_UNAVAILABLE':'HTTP_ERROR'), response.status, data); }
      this.noteSeen(data);
      if(method==='GET'&&generation===this.cacheGeneration)this.snapshots.remember(path,data);
      if(generation===this.cacheGeneration&&path.startsWith('/chat-sync')&&data.conversation&&Array.isArray(data.messages)){this.snapshots.remember('/chat-sync/current',{...data,messages:data.messages.slice(-100)});this.snapshots.remember('/conversations/'+data.conversation.id,{...data,messages:data.messages.slice(-100)});}
      return data as T;
    } catch (error) {
      if(signal?.aborted)throw new ApiError('Leitura cancelada.','CANCELLED',0);
      if (error instanceof ApiError) throw error;
      // 0.3.146: o aviso de "mensagem pode ter chegado" e so do envio do chat; as outras operacoes dizem o que demorou.
      if (controller.signal.aborted) throw new ApiError(isChatSend(path, method) ? 'A conexão demorou. Recarregue antes de reenviar: sua mensagem pode ter chegado.' : 'A Sofia demorou para responder. Tente de novo.', 'TIMEOUT', 0);
      throw new ApiError('Sem conexão com a Sofia. Verifique a internet e tente novamente.', 'NETWORK', 0);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort',cancel); }
  }
  /** Encomendas (0.3.142): consulta a transportadora agora e devolve o registro atualizado. */
  packagesQuota() { return this.request<{used: number; limit: number; month: string; configured: boolean}>('/packages/quota'); }
  refreshPackage(id: string) { return this.request<{item: Entity; changed: boolean; error: string}>('/packages/refresh', { id }); }
  /** 0.3.258: no site, um navegador novo pede um codigo enviado ao e-mail cadastrado (segundo passo); depois de
   * acertar, o navegador guarda uma marca de confianca de 90 dias. No app do celular nada muda. */
  async login(email: string, password: string, device: string, step: {code?: string; challenge?: string} = {}): Promise<Auth | LoginCodeNeeded> {
    const trust = isWebRuntime() ? await AsyncStorage.getItem(WEB_TRUST_KEY).catch(() => null) : null;
    const r = await this.request<Auth & {need_code?: boolean; challenge?: string; sent_to?: string; trust?: string}>('/auth/login', { email: email.trim(), password, device_name: device, ...(trust ? {trust} : {}), ...step });
    if (r.need_code) return {need_code: true, challenge: String(r.challenge || ''), sent_to: String(r.sent_to || '')};
    if (r.trust && isWebRuntime()) await AsyncStorage.setItem(WEB_TRUST_KEY, r.trust).catch(() => {});
    const {trust: _t, ...auth} = r; return auth as Auth;
  }
  bootstrap() { return this.request<Bootstrap>('/bootstrap'); }
  logout() { return this.request<{ok: boolean}>('/auth/logout', {}); }
  logoutAll() { return this.request<{ok: boolean}>('/auth/logout-all', {}); }
  changePassword(currentPassword: string,newPassword: string,confirmPassword: string) { return this.request<{ok: boolean}>('/auth/change-password', {currentPassword,newPassword,confirmPassword}); }
  syncChat(id?:string) { return this.request<ChatSnapshot>('/chat-sync'+(id?'?conversation_id='+encodeURIComponent(id):'')); }
  private async resumeChat():Promise<ChatSnapshot>{
    await this.hydrate();
    const current=await this.request<ChatSnapshot>('/chat-sync');
    // An explicit deletion is authoritative. Do not recover deleted messages.
    if(current.messages?.length||current.deleted_ids?.length)return current;
    const listing=await this.conversations();
    const candidates=listing.items.filter(c=>['web','mobile'].includes(c.channel)&&(!c.state||c.state==='active')&&c.id!==current.conversation?.id&&c.message_count!==0);
    // Legacy servers omit counts; bound probes. New servers place populated threads first.
    for(const item of candidates.slice(0,6)){
      try{
        const history=await this.history(item.id);
        if(history.messages.length)return await this.selectChat(item.id);
      }catch(e){if((e as ApiError).status!==404)throw e;}
    }
    return current;
  }
  ensureChat() {
    if(!this.chatOpening){const opening=this.resumeChat().then(async page=>{await this.snapshots.flush();return page;});this.chatOpening=opening;void opening.finally(()=>{if(this.chatOpening===opening)this.chatOpening=null;}).catch(()=>{});}
    return this.chatOpening;
  }
  selectChat(id:string) { return this.request<ChatSnapshot>('/chat-sync/select',{conversation_id:id}); }
  async deleteChatMessages(id:string,ids:string[]) {const result=await this.request<{deleted_ids:string[];failed:{id:string;error:string}[]}>('/chat-sync/delete',{conversation_id:id,ids});this.cacheGeneration++;this.startupReads.invalidate();const before=this.snapshots.peek<ChatSnapshot>('/chat-sync/current');if(before?.conversation?.id===id&&before){const removed=new Set(result.deleted_ids);this.snapshots.remember('/chat-sync/current',{...before,messages:before.messages.filter(m=>!removed.has(m.id)),deleted_ids:[...new Set([...before.deleted_ids,...result.deleted_ids])]});}this.snapshots.forget('/conversations/'+id);await this.snapshots.flush();return result;}
  /** 0.3.265: Quadro da conversa (assuntos com decidido, a fazer, em aberto, numeros e referencias). */
  conversationBoard(id: string) { return this.request<BoardData>('/conversations/' + encodeURIComponent(id) + '/board'); }
  conversations(offset = 0) { return this.request<{items: Conversation[]; has_more: boolean; next_offset: number}>('/conversations?offset=' + offset); }
  capsuleHistory(from:string,to:string){return this.request<{items:Entity[]}>('/md/capsules/doses?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to));}
  capsuleTake(capsule_id:string,day:string,time:string,taken=true){return this.request<{ok:boolean;item:Entity|null}>('/md/capsules/doses',{capsule_id,day,time,taken},'POST');}
  async dashboardWidgets(){const raw=await AsyncStorage.getItem(LOCAL_WIDGETS_KEY).catch(()=>null);const local=raw?JSON.parse(raw):null;if(!await this.feature('dashboard_widgets')){if(Array.isArray(local))return {widgets:local as string[]};return {widgets:['monitoring','tasks']};}const r=await this.request<{widgets:string[]|null;saved?:boolean}>('/md/dashboard');if(Array.isArray(r.widgets)&&(r.saved!==false||!Array.isArray(local)))return {widgets:r.widgets};
   // Servidor ainda sem organização salva: leva a do aparelho para lá (nada se perde ao trocar de celular).
   const start=Array.isArray(local)?local as string[]:['monitoring','tasks'];await this.request('/md/dashboard',{widgets:start},'POST').catch(()=>{});return {widgets:start};}
  async saveDashboardWidgets(widgets:string[]){if(!await this.feature('dashboard_widgets')){const clean=widgets.filter(w=>['monitoring','tasks','capsules','reminders','packages'].includes(w));await AsyncStorage.setItem(LOCAL_WIDGETS_KEY,JSON.stringify(clean));return {widgets:clean};}return this.request<{widgets:string[]}>('/md/dashboard',{widgets},'PATCH');}
  async deleteConversations(ids:string[]) { if(!await this.feature('conversation_delete'))throw new Error('A exclusão de conversas aguarda a atualização do servidor. Nenhuma conversa foi apagada.');const result=await this.request<{ok:boolean}>('/md/conversations',{ids},'DELETE');this.cacheGeneration++;this.startupReads.invalidate();this.snapshots.forget('/conversations?offset=0');for(const id of ids)this.snapshots.forget('/conversations/'+id);const current=this.snapshots.peek<ChatSnapshot>('/chat-sync/current');if(current?.conversation&&ids.includes(current.conversation.id))this.snapshots.forget('/chat-sync/current');await this.snapshots.flush();return result; }
  newConversation(title = 'Conversa com a Sofia') { return this.request<{conversation: Conversation}>('/conversations', {title}); }
  async deleteMessage(id: string) {const result=await this.request<{ok:boolean;id:string;conversation_id:string}>('/messages/' + encodeURIComponent(id), {}, 'DELETE');this.cacheGeneration++;this.startupReads.invalidate();this.snapshots.forget('/conversations/'+result.conversation_id);const current=this.snapshots.peek<ChatSnapshot>('/chat-sync/current');if(current?.conversation?.id===result.conversation_id&&current)this.snapshots.remember('/chat-sync/current',{...current,messages:current.messages.filter(m=>m.id!==id),deleted_ids:[...current.deleted_ids,id]});await this.snapshots.flush();return result;}
  async clearChatHistory() {const result=await this.request<{ok:boolean;conversations:number;messages:number}>('/chat-history', {}, 'DELETE');this.cacheGeneration++;this.startupReads.invalidate();this.snapshots.forgetChat();await this.snapshots.flush();return result;}
  history(id: string, before?: number) { return this.request<MessagePage>(`/conversations/${encodeURIComponent(id)}${before ? '?before=' + before : ''}`); }
  // 05/11/2026 (Pedro: "coloquei importante e ficou assim" - "A chamada foi interrompida"): o servidor reiniciou (publicacao) no meio
  // da resposta. Interrompida pelo reinicio ou sem conexao, a mesma mensagem (mesmo client_id) e reenviada sozinha ate 2 vezes;
  // o servidor reconhece a repeticao e nao duplica (retry=true so autoriza refazer a que nao terminou).
  private async chatOnce(data: object) {let last: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {return await this.request<ChatResult>('/messages', attempt ? {...(data as any), retry: true} : data, 'POST', 180000);}
      catch (e) {const err = e as ApiError, code = String((err as any)?.code || ''), status = Number((err as any)?.status || 0);
        const restart = code === 'CANCELLED' || code === 'NETWORK' || code === 'RETRY_REQUIRED' || ((status === 502 || status === 503) && code !== 'TURN_TIMEOUT');
        if (!restart || attempt === 2) throw e; last = e; await new Promise(r => setTimeout(r, attempt ? 8000 : 4000));}}
    throw last;}
  async chat(data: object) { const result=await this.chatOnce(data);this.rememberChatResult(result,data);agendaChanged(this);systemChanged(this);await this.snapshots.flush();return result; /* 04/11/2026 (Pedro: "criar com a Sofia demora a aparecer"): avisa as telas antes de gravar o cache (a gravacao continua antes de responder) */ }
  async audio(data: object) { const result=await this.request<ChatResult>('/messages/audio', data, 'POST', 180000);this.rememberChatResult(result,data);agendaChanged(this);systemChanged(this);await this.snapshots.flush();return result; /* 04/11/2026 (Pedro: "criar com a Sofia demora a aparecer"): avisa as telas antes de gravar o cache (a gravacao continua antes de responder) */ }
  home() { return this.request<HomeData>('/home'); }
  movePage(input:{id:string;revision:number;parentId:string;kind:string;anchorId:string}) { return this.md.move(input); }
  allNotifications(offset=0) { return this.md.notices(offset); }
  clearNotification(id:string) { return this.md.clear(id); }
  // Não depende mais de page_order: o servidor responde a agenda Google por conta própria.
  async calendarStatus():Promise<CalendarState> { try{return await this.request<CalendarState>('/md/calendar/status');}catch(e){if((e as ApiError).status===404)return {configured:false,connected:false};throw e;} }
  /** 0.3.244: Arquivos da Sofia (área oculta do Drive). */
  driveFiles() { return this.request<DriveSummary>('/md/drive/files',undefined,'GET',30000); }
  driveStorage() { return this.request<DriveStorage>('/md/drive/storage',undefined,'GET',30000); }
  driveList(cat:string,page='') { return this.request<{cat:string;items:DriveFile[];next_page:string}>('/md/drive/files?cat='+encodeURIComponent(cat)+(page?'&page='+encodeURIComponent(page):''),undefined,'GET',30000); }
  driveFileSource(id:string) { if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('Arquivo inválido.');return {uri:SITE+'/api/mobile/md/drive/files/'+encodeURIComponent(id)+'/content',headers:{Authorization:'Bearer '+this.token}}; }
  driveDelete(id:string) { if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('Arquivo inválido.');return this.request<{ok:boolean;name:string}>('/md/drive/files/'+encodeURIComponent(id),{},'DELETE',30000); }
  driveCleanup(cat:'Comprovantes'|'Áudios',enabled:boolean) { return this.request<ReceiptsCleanup>('/md/drive/cleanup',{cat,enabled},'POST',30000); }
  driveReceiptsCleanup(enabled:boolean) { return this.request<ReceiptsCleanup>('/md/drive/receipts-cleanup',{enabled},'POST',30000); }
  driveExport(categories:string[]) { return this.request<{export:DriveExport}>('/md/drive/export',{categories},'POST',120000); }
  driveBackup() { return this.request<{ok?:boolean;skipped?:boolean;bytes?:number}>('/md/drive/backup',{},'POST',120000); }
  calendarConnect() { return this.request<{url:string}>('/md/calendar/connect',{app:true}); }
  // Conexoes de lojas (Price Tracker): o mesmo formato para todas as lojas.
  storeConnections() { return this.request<StoreConnectionsState>('/price-tracker/connections'); }
  private mlConnectedCache:{at:number;value:boolean}|null=null;
  /** Lembrado por 5 min: evita uma consulta extra a cada leitura de preco. */
  async mlAccountConnected(){
    if(this.mlConnectedCache&&Date.now()-this.mlConnectedCache.at<300000)return this.mlConnectedCache.value;
    try{const st=await this.storeConnections();const value=!!st.stores.find(x=>x.provider==='mercadolivre')?.connected;this.mlConnectedCache={at:Date.now(),value};return value;}
    catch{return this.mlConnectedCache?.value??false;}
  }
  storeConnect(provider:string) { this.mlConnectedCache=null; return this.request<{url:string}>('/price-tracker/connections/'+provider+'/connect',{app:true}); }
  storeDisconnect(provider:string) { this.mlConnectedCache=null; return this.request<{ok:boolean}>('/price-tracker/connections/'+provider+'/disconnect',{}); }
  calendarDisconnect() { return this.request<{ok:boolean}>('/md/calendar/disconnect',{}); }
  calendarSync() { return this.request<{ok:boolean}>('/md/calendar/sync',{},'POST',90000); }
  calendarSelect(id:string) { return this.request<{ok:boolean}>('/md/calendar/select',{id}); }
  async feature(name:string):Promise<boolean>{try{const c=await this.request<Record<string,unknown>>('/md/capabilities');return c[name]===true;}catch(e){if((e as ApiError).status===404)return false;throw e;}}
  tasks() { return this.request<{items: Task[]}>('/tasks'); }
  /** 0.3.255: qualquer estado valido (ex.: "scheduled" = tarefa que esta na agenda) */
  async taskSetState(task: Pick<Task,'id'|'revision'>, state: 'done' | 'todo' | 'scheduled') { const r=await this.request<{item: Task}>('/tasks/' + encodeURIComponent(task.id), { state, revision: task.revision }, 'PATCH');this.taskTouched();return r; }
  async taskState(task: Task, state: 'done' | 'todo') { const r=await this.request<{item: Task}>('/tasks/' + encodeURIComponent(task.id), { state, revision: task.revision }, 'PATCH');this.taskTouched();return r; }
  async saveTask(task: Partial<Task>) { const saved=await this.request<{item: Task}>('/tasks' + (task.id ? '/' + encodeURIComponent(task.id) : ''), task, task.id ? 'PATCH' : 'POST');systemChanged(this);return saved; }
  /** 0.3.351 (Pedro: apagou "Emitir nota" na agenda e continuou na linha do tempo): apagar, ticar ou desticar tarefa avisa
   * as outras telas na hora (antes so o salvar avisava e o Inicio esperava ate 60 s para atualizar). */
  async deleteTask(id: string) { const r=await this.request<{ok: boolean}>('/tasks/' + encodeURIComponent(id), undefined, 'DELETE');recordRemoved(this,id);this.taskTouched();return r; }
  private taskTouched(){agendaChanged(this);systemChanged(this);}
  agenda(month?:string) { return this.request<{items: AgendaItem[];refresh_pending?:boolean}>('/agenda'+(month?'?month='+encodeURIComponent(month):'')); }
  createEvent(title: string, start_at: string) { return this.request<{item: AgendaItem}>('/agenda', { title, start_at }); }
  notifications() { return this.request<{items: Notice[]; push_enabled: boolean}>('/notifications'); }
  /** 0.3.146: marcar TODAS como lidas no servidor (nao so as carregadas). */
  markAllRead() { return this.md.readAll(); }
  /** 0.3.182: registros de Financas apagados que ainda estao nos backups diarios do servidor. */
  financeRecoverable() { return this.request<{items: {id: string; kind: string; title: string; data: Record<string, any>; state: string; updated_at: string; backup: string}[]}>('/md/finance/recoverable'); }
  financeRecover(id: string) { return this.request<Entity>('/md/finance/recover', {id}, 'POST'); }
  markRead(id: string) { return this.request<{ok: boolean}>('/notifications/' + encodeURIComponent(id) + '/read', {}); }
  profile(name: string) { return this.request<{profile: Profile}>('/profile', {name}, 'PATCH'); }
  /** 0.3.269: titulo, imagem, site e preco de um link colado (Listas, Biblioteca). Nunca falha: sem leitura volta so o link. */
  librarySearch(q: string, prefer = '') { return this.request<{items: CatalogHit[]}>('/library/search', {q, prefer}, 'POST', 15000); }
  readReceipt(mime: string, base64: string) { return this.request<{receipt: {desc: string; amount: number; date: string; category: string; items: string}}>('/finance/read-receipt', {mime, base64}, 'POST', 60000); }
  linkPreview(url: string) { return this.request<LinkPreview>('/link/preview', {url}, 'POST', 15000); }
  profilePhoto() { return this.request<{photo: ProfilePhoto | null}>('/profile/photo'); }
  saveProfilePhoto(mime: string, base64: string) { return this.request<{ok: boolean; updated_at: string}>('/profile/photo', {mime, base64}, 'POST', 60000); }
  deleteProfilePhoto() { return this.request<{ok: boolean}>('/profile/photo', undefined, 'DELETE'); }
  catalog() { return this.request<Catalog>('/workspace/catalog'); }
  /** 05/11/2026: áreas criadas pela pessoa (criar, tirar da lista, renomear). Os registros antigos mantêm a área que têm. */
  areaChange(body:{add?:string;remove?:string;rename?:{from:string;to:string}}) { return this.request<{areas:string[]}>('/workspace/areas', body, 'POST'); }
  async entities(kind: string, q = '', offset = 0) { const path='/workspace/entities?limit=100&kind='+encodeURIComponent(kind)+'&q='+encodeURIComponent(q)+'&offset='+offset,generation=this.cacheGeneration;const result=await this.request<{items:Entity[]}>(path);if(kind!=='user_page')return result;const decorated={...result,items:await this.md.decorate(result.items)};
    // 0.3.255: a copia guardada para abrir rapido ja vai na ordem que a pessoa escolheu neste aparelho. Antes ela ficava
    // na ordem do servidor e a lista abria assim, trocando de lugar (piscada) quando a ordem do aparelho chegava.
    if(generation===this.cacheGeneration&&decorated.items!==result.items)this.snapshots.remember(path,decorated);
    return decorated; }
  library(q = '', offset = 0) { return this.request<{items:Entity[]}>('/workspace/entities?limit=100&group=library&q='+encodeURIComponent(q)+'&offset='+offset); }
  async entity(id: string) { const item=await this.request<Entity>('/workspace/entities/'+encodeURIComponent(id));return item.kind==='user_page'?(await this.md.decorate([item]))[0]:item; }
  async saveEntity(input: Partial<Entity>, base?: Partial<Entity>): Promise<Entity> {
    if(!input.id||input.revision==null)return this.saveEntityOnce(input);
    try{return await this.saveEntityOnce(input);}catch(e){if(!(e instanceof ApiError)||e.status!==409)throw e;
      // a versao que a tela viu: a que ela passou, ou a copia com essa revisao que veio do servidor (lista, cache)
      const seen=base||this.seenVersion(input.id,input.revision);if(!seen)throw e;
      const current=await this.request<Entity>('/workspace/entities/'+encodeURIComponent(input.id));return await this.saveEntityOnce(mergeOnConflict(input,seen,current));} }
  private seen=new Map<string,Entity>();
  private noteSeen(data:any){try{const add=(x:any)=>{if(x&&typeof x==='object'&&typeof x.id==='string'&&typeof x.revision==='number'&&x.data&&typeof x.data==='object'){const k=x.id+'@'+x.revision;if(!this.seen.has(k)){this.seen.set(k,JSON.parse(JSON.stringify(x)));if(this.seen.size>4000)this.seen.delete(this.seen.keys().next().value as string);}}};
    add(data);for(const v of Object.values(data||{}))if(Array.isArray(v))for(const x of v.slice(0,2000))add(x);else if(v&&typeof v==='object')add(v);}catch{/* so memoria de apoio */}}
  private seenVersion(id:string,revision:number):Entity|undefined{const k=id+'@'+revision;if(this.seen.has(k))return this.seen.get(k);
    for(const [,v] of this.snapshots.all()){this.noteSeen(v);if(this.seen.has(k))return this.seen.get(k);}return undefined;}
  private async saveEntityOnce(input: Partial<Entity>) { let body=input.data?await this.md.clean(input):input;let saved: Entity;
    // 0.3.227: se o servidor ainda nao conhece um campo novo (app atualizado antes do servidor), salva sem ele em vez de dar erro
    for(let attempt=0;;attempt++){try{saved=await this.request<Entity>('/workspace/entities'+(input.id?'/'+encodeURIComponent(input.id):''),body,input.id?'PATCH':'POST');break;}
      catch(e){const m=/Campo não previsto: ([a-z_]+)/.exec(String((e as Error)?.message||''));const data=(body as {data?: Record<string, unknown>}).data;if(!m||attempt>=6||!data||!(m[1] in data))throw e;const next={...data};delete next[m[1]];body={...(body as object),data:next} as typeof body;}}if(['commitment','reminder'].includes(saved.kind))agendaChanged(this);systemChanged(this);return saved.kind==='user_page'?(await this.md.decorate([saved]))[0]:saved; }
  async deleteEntity(id: string) { const result=await this.request<{ok: boolean}>('/workspace/entities/' + encodeURIComponent(id), undefined, 'DELETE');recordRemoved(this,id);agendaChanged(this);systemChanged(this);return result; }
  uploadAttachment(id:string,input:{name:string;mime:string;base64:string}) { return this.request<{id:string}>('/workspace/entities/'+encodeURIComponent(id)+'/attachments',input,'POST',60000); }
  /** 0.3.199: miniatura minuscula da foto (o chat mostra desfocada sem baixar o original do Drive). */
  attachmentThumb(id:string) { if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('Imagem inválida.');return {uri:SITE+'/api/mobile/workspace/attachments/'+encodeURIComponent(id)+'?thumb=1',headers:{Authorization:'Bearer '+this.token}}; }
  attachmentSource(id:string) { if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('Imagem inválida.');return {uri:SITE+'/api/mobile/workspace/attachments/'+encodeURIComponent(id)+'?inline=1',headers:{Authorization:'Bearer '+this.token}}; }
  entityAction(id: string, input: object) { return this.request<any>('/workspace/entities/' + encodeURIComponent(id) + '/action', input); }
  async libraryOrganization(){const items:Entity[]=[];for(let offset=0;;offset+=100){const page=await this.request<{items:Entity[]}>('/workspace/entities?group=library&limit=100&offset='+offset);items.push(...page.items);if(page.items.length<100)return {items};}}
  financeImportPreview(text: string, target: 'account' | 'card', targetId: string) { return this.request<{format: string; items: ImportItem[]; total: number; duplicates: number}>('/md/finance/import', {text, target, target_id: targetId}, 'POST', 60000); }
  /** 0.3.213: guarda o extrato a parte (nao vira lancamento) e devolve a conciliacao. */
  financeStatement(text: string, targetId: string) { return this.request<{statement: Entity; items: ImportItem[]; matched: number; before: number; start: string; closing_balance: number | null; closing_at: string}>('/md/finance/statement', {text, target_id: targetId}, 'POST', 120000); }
  /** 0.3.219: apaga o extrato e o que tenha sido lancado a partir dele. */
  financeStatementDelete(id: string) { return this.request<{ok: boolean; removed: number}>('/md/finance/statement/delete', {id}, 'POST', 60000); }
  /** 0.3.212: zera Financas (apaga tudo do modulo) para comecar do zero. */
  financeReset() { return this.request<{ok: boolean; removed: number}>('/md/finance/reset', {confirm: 'ZERAR'}, 'POST', 60000); }
  /** 0.3.211: desfaz a importacao - tira tudo o que veio de extratos da conta/cartao (o lancado a mao fica). */
  financeImportUndo(targetId: string) { return this.request<{removed: number; amount: number}>('/md/finance/import/undo', {target_id: targetId}, 'POST', 60000); }
  financeImportCommit(items: ImportItem[], target: 'account' | 'card', targetId: string) { return this.request<{created: number; skipped: number}>('/md/finance/import/commit', {items, target, target_id: targetId}, 'POST', 60000); }
  financeBundle(window?: {from: string; to: string}) { return this.request<{items: Record<string, Entity[]>; carry?: Record<string, number>; window?: {from: string; to: string} | null; at: string}>('/md/finance' + (window ? '?from=' + window.from + '&to=' + window.to : ''), undefined, 'GET', 30000); }
  // POST read bypasses the write cache invalidation path. No token goes to the store.
  async readMercadoLivre(link:string,options:MercadoLivreOptions={}):Promise<MercadoLivreResponse> {
    const {signal,fetchUrl,...params}=options;
    // O Mercado Livre recusa a Railway (data center) e manda para login. O celular baixa a
    // pagina como TEXTO e o servidor so faz a extracao estrita. Se o celular nao conseguir,
    // cai no caminho antigo (servidor busca sozinho) — nunca WebView.
    // Conta do Mercado Livre conectada: o servidor le pela API oficial e ignora a pagina.
    // Ai o celular nem abre o navegador invisivel (que e o que demora e pede verificacao).
    const connected=await this.mlAccountConnected();
    const page=connected?{ok:false as const,code:'API'}:await readMercadoLivrePageOnDevice(fetchUrl||canonicalMercadoLivreUrl(link),signal);
    // 0.3.237: com a conta conectada, link sem catalogo -> o celular segue o redirecionamento e manda o endereco /p/MLB...
    // 0.3.238: se a consulta simples nao achar, o navegador invisivel executa a pagina e devolve o endereco /p/MLB...
    // 0.3.239: busca o catalogo SEMPRE pelo link LIMPO (sem matt_tool/ua/#origin=share, que levam a tela "Abra o app"),
    // como a leitura da pagina ja fazia. A 0.3.237/0.3.238 usavam o link cru e nunca chegavam ao /p/.
    const cleanUrl=canonicalMercadoLivreUrl(fetchUrl||link);
    resetCatalogTrace();
    const catalogUrl=connected&&!/\/p\/MLB\d/i.test(link)?(await resolveMercadoLivreCatalogUrl(cleanUrl,{signal}))||(await resolveCatalogViaBrowser(cleanUrl,signal)):null;
    if(!page.ok&&page.code==='CANCELLED')return {ok:false,code:'CANCELLED',message:'Leitura cancelada.',keepLastPrice:true as const};
    const body=page.ok?{link,...params,html:page.html,finalUrl:page.finalUrl}:{link,...params,...(catalogUrl?{finalUrl:catalogUrl}:{})};
    const r=await this.fetchRequest<MercadoLivreResponse>('/price-tracker/mercadolivre/read',body,'POST',40000,signal);
    // Diagnostico: se o celular tambem falhou, o motivo dele vai junto (sem conteudo da pagina).
    if(!r.ok&&r.code==='ML_NEEDS_CATALOG_LINK'&&lastCatalogTrace)return {...r,message:r.message+' [diagnóstico — '+lastCatalogTrace+']'};
    return !r.ok&&!page.ok&&page.code!=='API'?{...r,message:r.message+' (celular: '+page.code+')'}:r;
  }
  monitorObservations() { return this.request<{items: Record<string, any[]>}>('/md/monitors/observations'); }
  observations(id: string) { return this.request<{items: any[];status?:{last_at:string|null;last_error:string|null;next_at:string|null}}>('/workspace/entities/' + encodeURIComponent(id) + '/observations'); }
  mailSecret(id: string, password: string) { return this.request<{ok: boolean; messages: number}>('/mail/accounts/' + encodeURIComponent(id) + '/secret', {password}, 'POST', 45000); }
  /** 0.3.257: Entrar com Google numa conta de e-mail (le a propria caixa, separada da Conta Google do Perfil) */
  mailGoogleStatus(id: string) { return this.request<{linked: boolean; email: string}>('/mail/accounts/' + encodeURIComponent(id) + '/google/status'); }
  mailGoogleConnect(id: string, app = true) { return this.request<{url: string}>('/mail/accounts/' + encodeURIComponent(id) + '/google/connect', {app}, 'POST'); }
  mailGoogleDisconnect(id: string) { return this.request<{ok: boolean}>('/mail/accounts/' + encodeURIComponent(id) + '/google/disconnect', {}, 'POST'); }
  mailForget(id: string) { return this.request<{ok: boolean}>('/mail/accounts/' + encodeURIComponent(id) + '/forget', {}); }
  /** rescanDays > 0 reavalia os ultimos dias (regra nova/editada) sem mexer no ponto de leitura. */
  mailCheck(accountId = '', rescanDays = 0) { return this.request<{accounts: number; scanned: number; hits: number; errors: {account: string; error: string}[]; skipped?: boolean}>('/mail/check', {account_id: accountId, rescan_days: rescanDays}, 'POST', 120000); }
  observe(id: string, input: object) { return this.request<any>('/workspace/entities/' + encodeURIComponent(id) + '/observations', input); }
  integrations() { return this.request<{items: {name:string;key:string;status:string;description:string;connect_url?:string}[]}>('/workspace/integrations'); }
  audioSource(path: string) {
    if (!/^\/api\/mobile\/messages\/[A-Za-z0-9_-]+\/audio$/.test(path)) throw new Error('Endereço de áudio inválido.');
    return { uri: SITE + path, headers: { Authorization: 'Bearer ' + this.token } };
  }
}
