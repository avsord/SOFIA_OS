import {useSyncExternalStore} from 'react';
import type {Entity} from './types';

/** 14/11/2026 (Pedro): "atalhos para as notas ou pastas... so aparece o atalho se a pessoa ativar a nota ou a pasta como
 * atalho". O atalho NAO move nem copia nada: a nota/pasta continua no bloco de Notas. Ele fica guardado no proprio bloco
 * (data.shortcuts = [{kind,id}]) e aparece como subpagina da pagina na barra lateral e no topo da pagina; clicar abre a
 * pagina ja com aquela nota/pasta aberta. Por padrao a lista e vazia (nada aparece). */
export type ShortcutRef={kind:'note'|'folder';id:string;color?:string};
export type NoteShortcut=ShortcutRef&{label:string;emoji:string};
/** 14/11/2026 (Pedro: "atalhos viraram sub do sub... um bullet que voce pode mudar a cor e o nome menor"): o atalho aparece
 * na barra como um ponto colorido + nome menor (nao como pagina do mesmo tamanho). A cor fica no proprio atalho. */
export const SHORTCUT_COLORS:{name:string;hex:string}[]=[{name:'Cinza',hex:'#9B9A97'},{name:'Marrom',hex:'#A27763'},{name:'Laranja',hex:'#E0883C'},{name:'Amarelo',hex:'#D9B23A'},{name:'Verde',hex:'#4F9E6B'},{name:'Azul',hex:'#4A88D0'},{name:'Roxo',hex:'#9065C7'},{name:'Rosa',hex:'#D3609B'},{name:'Vermelho',hex:'#D9534F'}];
export const DEFAULT_SHORTCUT_COLOR='#D9534F';
/** Troca a cor de um atalho; devolve os dados novos do bloco (nada mais muda). */
export function setShortcutColor(data:Record<string,any>,kind:ShortcutRef['kind'],id:string,color:string):Record<string,any>{
 return {...data,shortcuts:shortcutRefs(data).map(x=>x.kind===kind&&x.id===id?{...x,color}:x)};
}

export function shortcutRefs(data:Record<string,any>|null|undefined):ShortcutRef[]{
 const s=data?.shortcuts;return Array.isArray(s)?s.filter((x:any)=>x&&(x.kind==='note'||x.kind==='folder')&&typeof x.id==='string'&&x.id):[];
}
export function hasShortcut(data:Record<string,any>|null|undefined,kind:ShortcutRef['kind'],id:string){return shortcutRefs(data).some(x=>x.kind===kind&&x.id===id);}
/** Liga/desliga o atalho; devolve os dados novos do bloco (nada mais muda). */
export function toggleShortcut(data:Record<string,any>,kind:ShortcutRef['kind'],id:string):Record<string,any>{
 const cur=shortcutRefs(data),on=cur.some(x=>x.kind===kind&&x.id===id);
 return {...data,shortcuts:on?cur.filter(x=>!(x.kind===kind&&x.id===id)):[...cur,{kind,id}]};
}
/** Atalhos de um bloco de Notas com nome e icone atuais; atalho de nota/pasta que nao existe mais e ignorado. */
export function resolveShortcuts(data:Record<string,any>|null|undefined):NoteShortcut[]{
 const books:any[]=Array.isArray(data?.notebooks)?data!.notebooks:[];const out:NoteShortcut[]=[];
 for(const r of shortcutRefs(data)){
  if(r.kind==='folder'){const b=books.find(k=>k?.id===r.id&&!k.root);if(b)out.push({...r,label:String(b.name||'Sem título'),emoji:String(b.emoji||'📁')});}
  else for(const b of books){const n=(b?.pages||[]).find((p:any)=>p?.id===r.id);if(n){out.push({...r,label:String(n.title||'Sem título'),emoji:'📝'});break;}}
 }
 return out;
}
/** Todos os atalhos de uma pagina (todos os blocos de Notas dela), lidos do conteudo guardado. */
export function pageShortcuts(p:Entity|null|undefined):NoteShortcut[]{
 const pre=p?.data?.note_shortcuts;if(Array.isArray(pre)&&!p?.data?.blocks_json)return pre as NoteShortcut[];
 let bl:any;try{bl=JSON.parse(String(p?.data?.blocks_json||'[]'));}catch{return [];}
 if(!Array.isArray(bl))return [];const out:NoteShortcut[]=[];
 for(const b of bl)if(b?.type==='collection'&&Array.isArray(b.data?.notebooks))out.push(...resolveShortcuts(b.data));
 return out;
}

// ---------- o bloco aberto avisa a barra lateral na hora (antes de o servidor devolver a pagina gravada) ----------
// cada bloco de Notas aberto publica a sua parte (uma pagina pode ter mais de um bloco de Notas)
let live:Record<string,NoteShortcut[]>={};const parts=new Map<string,Map<object,NoteShortcut[]>>();const subs=new Set<()=>void>();
export function publishShortcuts(pageId:string,owner:object,list:NoteShortcut[]){
 if(!pageId)return;let m=parts.get(pageId);if(!m){m=new Map();parts.set(pageId,m);}m.set(owner,list);
 const all=[...m.values()].flat();const prev=live[pageId];
 if(prev&&JSON.stringify(prev)===JSON.stringify(all))return;
 live={...live,[pageId]:all};subs.forEach(f=>f());
}
export function useLiveShortcuts():Record<string,NoteShortcut[]>{return useSyncExternalStore(f=>{subs.add(f);return ()=>{subs.delete(f);};},()=>live,()=>live);}
export function shortcutsFor(p:Entity,liveMap:Record<string,NoteShortcut[]>):NoteShortcut[]{return liveMap[p.id]??pageShortcuts(p);}

// ---------- abrir a nota/pasta do atalho (pagina fechada: ao abrir; pagina ja aberta: na hora) ----------
const pending=new Map<string,ShortcutRef>(),openers=new Map<string,Set<(r:ShortcutRef)=>void>>();
export function requestOpenShortcut(pageId:string,r:ShortcutRef){
 const now=openers.get(pageId);if(now&&now.size){now.forEach(f=>f(r));return;}
 pending.set(pageId,r);
}
export function listenOpenShortcut(pageId:string|undefined,f:(r:ShortcutRef)=>void):()=>void{
 if(!pageId)return ()=>{};const p=pending.get(pageId);if(p){pending.delete(pageId);f(p);}
 let s=openers.get(pageId);if(!s){s=new Set();openers.set(pageId,s);}s.add(f);
 return ()=>{const t=openers.get(pageId);if(!t)return;t.delete(f);if(!t.size)openers.delete(pageId);};
}

// ---------- trocar a cor do atalho pela barra lateral (pagina aberta: o bloco grava; fechada: grava direto) ----------
const colorers=new Map<string,Set<(r:ShortcutRef,color:string)=>void>>();
export function listenShortcutColor(pageId:string|undefined,f:(r:ShortcutRef,color:string)=>void):()=>void{
 if(!pageId)return ()=>{};let s=colorers.get(pageId);if(!s){s=new Set();colorers.set(pageId,s);}s.add(f);
 return ()=>{const t=colorers.get(pageId);if(!t)return;t.delete(f);if(!t.size)colorers.delete(pageId);};
}
type ColorApi={entityFresh(id:string):Promise<Entity>;saveEntity(input:Partial<Entity>,base?:Partial<Entity>):Promise<Entity>};
export async function requestShortcutColor(pageId:string,r:ShortcutRef,color:string,api?:ColorApi|null):Promise<Entity|null>{
 const now=colorers.get(pageId);if(now&&now.size){now.forEach(f=>f(r,color));return null;}
 if(!api)throw new Error('Sem conexão para trocar a cor.');
 const pg=await api.entityFresh(pageId);if(String(pg.data?.lock_json||''))throw new Error('Página trancada: abra a página para trocar a cor.');
 let bl:any;try{bl=JSON.parse(String(pg.data?.blocks_json||'[]'));}catch{throw new Error('Não deu para ler o conteúdo da página.');}
 if(!Array.isArray(bl))throw new Error('Não deu para ler o conteúdo da página.');
 let hit=false;const next=bl.map((b:any)=>{if(b?.type==='collection'&&hasShortcut(b.data,r.kind,r.id)){hit=true;return {...b,data:setShortcutColor(b.data,r.kind,r.id,color)};}return b;});
 if(!hit)return null;
 return await api.saveEntity({id:pg.id,revision:pg.revision,data:{...(pg.data||{}),blocks_json:JSON.stringify(next)}},pg);
}
