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

/** 13/11/2026 (Pedro: "só a estrutura tem que vir só o modelo, vazio"): antes a cópia "Só a estrutura" saía sem NENHUM
 * bloco (blocks_json '[]'), perdendo o modelo. Agora fica o esqueleto: blocos, seções, tabelas com o cabeçalho, coleções
 * com propriedades/visões/colunas do Kanban, pastas de notas - e sai o conteúdo: texto, notas, linhas/cartões,
 * imagens, arquivos, desenhos, links e blocos espelhados de outras páginas. */
const CONTENT_BLOCKS=new Set(['image','file','attachment','video','audio','embed','bookmark','drawing']);
const CONTENT_KEYS=['content','value','values','page_content','caption','url','src','name','size','mime','attachment_id','drawing','link','live','synced','source_id','copy_id','uploading'];
export function structureBlock(b:any,ids?:ReadonlyMap<string,string>):any|null{
 if(!b||typeof b!=='object')return null;const d=b.data&&typeof b.data==='object'?b.data:{};
 if(CONTENT_BLOCKS.has(String(b.type))||d.attachment_id||d.drawing||d.live||d.synced||d.source_id||d.copy_id)return null;
 // link/janela para outra página: só fica se aponta para uma subpágina que também foi copiada
 if(typeof d.page_id==='string'&&!(ids&&ids.has(d.page_id)))return null;
 const out:any={...b};
 // 13/11/2026 (Mimic Kaizen: a copia vinha sem 4 de 6 partes do modelo, ex. "Opções"): titulos de secao SAO o modelo e ficam;
 // o resto do texto sai
 const keepText=/^heading/.test(String(b.type||''));
 if('text' in out&&!keepText)out.text='';if('html' in out&&!keepText)out.html='';if('checked' in out)out.checked=false;
 const data:any={...d};for(const k of CONTENT_KEYS)delete data[k];
 if(typeof d.page_id==='string'&&ids)data.page_id=ids.get(d.page_id);
 if(Array.isArray(d.rows))data.rows=b.type==='table'&&Array.isArray(d.rows[0])?[d.rows[0].map((cell:unknown)=>typeof cell==='string'?cell:'')]:[];
 for(const k of ['items','records','entries','cards'])if(Array.isArray(d[k]))data[k]=[];
 for(const k of ['notebooks','books'])if(Array.isArray(d[k]))data[k]=d[k].map((book:any)=>book&&typeof book==='object'?{...book,expanded:false,pages:[]}:book);
 for(const k of ['blocks','children'])if(Array.isArray(d[k]))data[k]=d[k].map((x:any)=>structureBlock(x,ids)).filter((x:any)=>x!==null);
 if(Array.isArray(b.children))out.children=b.children.map((x:any)=>structureBlock(x,ids)).filter((x:any)=>x!==null);
 if(b.data)out.data=data;
 return out;
}
export function structureBlocksJson(json:unknown,ids?:ReadonlyMap<string,string>):string{
 let blocks:unknown;try{blocks=JSON.parse(typeof json==='string'?json:'[]');}catch{return '[]';}
 if(!Array.isArray(blocks))return '[]';
 return JSON.stringify(blocks.map(b=>structureBlock(b,ids)).filter(b=>b!==null));
}

/** O que se grava para a cópia de uma página (sem id: nasce uma página nova). */
export function cloneInput(src:Entity,opts:{parentId:string;isRoot:boolean;mode:CloneMode;ids?:ReadonlyMap<string,string>}):Partial<Entity>{
 const data:Record<string,unknown>={...(src.data||{}),parent_id:opts.parentId};
 if(opts.mode==='structure'){data.blocks_json=structureBlocksJson(data.blocks_json,opts.ids);if('lock_json' in data)data.lock_json='';}
 else if(opts.ids)data.blocks_json=remapBlocksJson(data.blocks_json,opts.ids);
 return {kind:'user_page',title:(opts.isRoot?(src.title||'Sem título')+' (cópia)':(src.title||'Sem título')).slice(0,240),
  content:opts.mode==='structure'?'':src.content||'',area:src.area||'Pessoal',privacy:src.privacy||'private',state:'active',
  tags:(src.tags||[]).filter(t=>t!=='board-copy'&&!(opts.mode==='structure'&&/^sofia-(lock|secret-ok)-v1$/.test(t))),data:data as Entity['data']};
}

/** Grava a cópia (página + subpáginas). Devolve a página de cima copiada. */
export async function clonePageTree(api:{saveEntity:(input:Partial<Entity>)=>Promise<Entity>;entityFresh?:(id:string)=>Promise<Entity>},pages:readonly Entity[],rootId:string,mode:CloneMode):Promise<Entity|null>{
 const list=cloneOrder(pages,rootId);if(!list.length)return null;
 const ids=new Map<string,string>(),saved:{src:Entity;copy:Entity}[]=[];
 // 13/11/2026 (Mimic Kaizen: "Só a estrutura" saía em branco, sem o bloco de Notas): a lista da barra lateral pode ser a cópia
 // curta guardada na abertura (sem o conteúdo das páginas). Cada página é lida inteira do servidor antes de copiar.
 for(const [i,listed] of list.entries()){
  let src=listed;if(api.entityFresh){try{src=await api.entityFresh(listed.id);}catch{src=listed;}list[i]=src;}
  const parentId=i===0?pageParentId(src):ids.get(pageParentId(src))||'';
  const copy=await api.saveEntity(cloneInput(src,{parentId,isRoot:i===0,mode,ids}));
  ids.set(src.id,copy.id);saved.push({src,copy});
 }
 // segunda passada: só as páginas que têm link para subpágina copiada
 for(const {src,copy} of saved){
  const before=typeof src.data?.blocks_json==='string'?src.data.blocks_json:'[]';
  if(mode==='identical'){const after=remapBlocksJson(before,ids);if(after!==before)await api.saveEntity({...copy,data:{...(copy.data||{}),blocks_json:after} as Entity['data']});}
  else{const after=structureBlocksJson(before,ids);if(after!==copy.data?.blocks_json)await api.saveEntity({...copy,data:{...(copy.data||{}),blocks_json:after} as Entity['data']});}
 }
 return saved[0].copy;
}
