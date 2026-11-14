import {useSyncExternalStore} from 'react';
import type {Entity} from './types';

/** 14/11/2026 (Pedro): "atalhos para as notas ou pastas... so aparece o atalho se a pessoa ativar a nota ou a pasta como
 * atalho". O atalho NAO move nem copia nada: a nota/pasta continua no bloco de Notas. Ele fica guardado no proprio bloco
 * (data.shortcuts = [{kind,id}]) e aparece como subpagina da pagina na barra lateral e no topo da pagina; clicar abre a
 * pagina ja com aquela nota/pasta aberta. Por padrao a lista e vazia (nada aparece). */
export type ShortcutRef={kind:'note'|'folder';id:string};
export type NoteShortcut=ShortcutRef&{label:string;emoji:string};

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
