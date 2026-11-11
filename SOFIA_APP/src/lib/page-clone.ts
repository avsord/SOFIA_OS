import type {Entity} from './types';
import {comparePageOrder} from './page-order';
import {pageParentId} from './page-hierarchy';

/** 11/11/2026 (Pedro: "quando duplicar tem que aparecer a opção clonar idêntica igual do notion"):
 * duplicar a página da barra lateral agora pergunta como:
 * - 'identical': a página e TODAS as subpáginas, com todo o conteúdo (texto, notas, arquivos), como no Notion;
 * - 'structure': as mesmas páginas e subpáginas (nome, ícone, capa, layout), mas vazias.
 * Antes só a página de cima era copiada e as subpáginas ficavam de fora. */
export type CloneMode='identical'|'structure';

/** A página e as subpáginas, sempre o pai antes dos filhos (o filho precisa do id novo do pai). */
export function cloneOrder(pages:readonly Entity[],rootId:string):Entity[]{
 const byParent=new Map<string,Entity[]>();
 for(const p of pages){const parent=pageParentId(p);if(!byParent.has(parent))byParent.set(parent,[]);byParent.get(parent)!.push(p);}
 const root=pages.find(p=>p.id===rootId);if(!root)return [];
 const out:Entity[]=[],seen=new Set<string>();const queue=[root];
 while(queue.length&&out.length<500){const cur=queue.shift()!;if(seen.has(cur.id))continue;seen.add(cur.id);out.push(cur);
  for(const child of [...(byParent.get(cur.id)||[])].sort(comparePageOrder))if(!seen.has(child.id))queue.push(child);}
 return out;
}

/** Os links de subpágina dentro da cópia passam a apontar para as subpáginas copiadas (não para as originais). */
export function remapBlocksJson(json:unknown,ids:ReadonlyMap<string,string>):string{
 const raw=typeof json==='string'?json:'[]';let blocks:unknown;
 try{blocks=JSON.parse(raw);}catch{return raw;}
 if(!Array.isArray(blocks))return raw;
 let changed=false;
 const walk=(v:any):any=>{if(Array.isArray(v))return v.map(walk);if(!v||typeof v!=='object')return v;
  const next:any={};for(const [k,val] of Object.entries(v)){if(k==='page_id'&&typeof val==='string'&&ids.has(val)){next[k]=ids.get(val);changed=true;}else next[k]=walk(val);}return next;};
 const out=walk(blocks);return changed?JSON.stringify(out):raw;
}

/** O que se grava para a cópia de uma página (sem id: nasce uma página nova). */
export function cloneInput(src:Entity,opts:{parentId:string;isRoot:boolean;mode:CloneMode;ids?:ReadonlyMap<string,string>}):Partial<Entity>{
 const data:Record<string,unknown>={...(src.data||{}),parent_id:opts.parentId};
 if(opts.mode==='structure')data.blocks_json='[]';
 else if(opts.ids)data.blocks_json=remapBlocksJson(data.blocks_json,opts.ids);
 return {kind:'user_page',title:(opts.isRoot?(src.title||'Sem título')+' (cópia)':(src.title||'Sem título')).slice(0,240),
  content:opts.mode==='structure'?'':src.content||'',area:src.area||'Pessoal',privacy:src.privacy||'private',state:'active',
  tags:(src.tags||[]).filter(t=>t!=='board-copy'),data:data as Entity['data']};
}

/** Grava a cópia (página + subpáginas). Devolve a página de cima copiada. */
export async function clonePageTree(api:{saveEntity:(input:Partial<Entity>)=>Promise<Entity>},pages:readonly Entity[],rootId:string,mode:CloneMode):Promise<Entity|null>{
 const list=cloneOrder(pages,rootId);if(!list.length)return null;
 const ids=new Map<string,string>(),saved:{src:Entity;copy:Entity}[]=[];
 for(const [i,src] of list.entries()){
  const parentId=i===0?pageParentId(src):ids.get(pageParentId(src))||'';
  const copy=await api.saveEntity(cloneInput(src,{parentId,isRoot:i===0,mode}));
  ids.set(src.id,copy.id);saved.push({src,copy});
 }
 // segunda passada: só as páginas que têm link para subpágina copiada
 if(mode==='identical')for(const {src,copy} of saved){
  const before=typeof src.data?.blocks_json==='string'?src.data.blocks_json:'[]',after=remapBlocksJson(before,ids);
  if(after!==before)await api.saveEntity({...copy,data:{...(copy.data||{}),blocks_json:after} as Entity['data']});
 }
 return saved[0].copy;
}
