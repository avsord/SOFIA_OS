import type {Entity,Notice} from './types';
import {canReparentPage,pageParentId} from './page-hierarchy';
import {comparePageOrder} from './page-order';
type Disk={getItem:(k:string)=>Promise<string|null>;setItem:(k:string,v:string)=>Promise<unknown>};
type Call=<T>(path:string,body?:unknown,method?:string)=>Promise<T>;
export type MoveInput={id:string;revision:number;parentId:string;kind:string;anchorId:string};
export function legacyMovePlan(pages:Entity[],input:MoveInput){
 const page=pages.find(p=>p.id===input.id),anchor=pages.find(p=>p.id===input.anchorId);
 if(!page||!anchor||page.id===anchor.id)throw Error('Página de origem ou destino indisponível.');
 // 05/11/2026 (Pedro: "Nao foi possivel mover a pagina"): a lista lateral guarda a revisao de quando carregou e cada
 // edicao da pagina sobe a revisao. Mover so troca pai e ordem e o plano ja usa a pagina lida agora do servidor (com a
 // revisao atual), entao uma revisao antiga na lista nao e motivo para recusar.
 if(!['before','after','inside'].includes(input.kind)||!canReparentPage(pages,page.id,input.parentId))throw Error('Destino de página inválido.');
 if((input.kind==='inside'?anchor.id:pageParentId(anchor))!==input.parentId)throw Error('O destino mudou durante o arraste.');
 const siblings=pages.filter(p=>p.id!==page.id&&pageParentId(p)===input.parentId).sort(comparePageOrder);
 let index=siblings.length;if(input.kind!=='inside'){index=siblings.findIndex(p=>p.id===anchor.id);if(index<0)throw Error('Destino indisponível.');if(input.kind==='after')index++;}
 siblings.splice(index,0,page);return {page,siblings};
}
/** v142 compatibility. No server restart, data migration, or extra production entities.
 * Parent/content writes stay revision-protected. Ordering and dismissals are explicitly
 * device-local until the additive MD backend can be deployed without losing server data.
 */
export class LegacyMdAdapter{
 private supported:boolean|null=null;private probedAt=0;private pending:Promise<boolean>|null=null;
 private order:Record<string,number>={};private dismissed=new Set<string>();private loaded=false;private loading:Promise<void>|null=null;private snapshot:Notice[]=[];
 // 10/11/2026 (Pedro: "to mudando o lugar e nao ta mudando"): `fresh` le direto do servidor, sem a copia guardada na
 // abertura do site; mover com a revisao dessa copia velha voltava 409 a partir do 2o movimento.
 constructor(private call:Call,private disk:Disk,private scope:string,private fresh?:<T>(path:string)=>Promise<T>){}
 async supports():Promise<boolean>{
  if(this.supported!==null&&Date.now()-this.probedAt<300000)return this.supported;
  if(this.pending)return this.pending;
  this.pending=(async()=>{try{const d=await this.call<{page_order?:boolean;notifications?:boolean}>('/md/capabilities');this.supported=d.page_order===true;this.noticesNative=d.notifications===true;}
   catch(e){if((e as {status?:number}).status!==404)throw e;this.supported=false;}this.probedAt=Date.now();return this.supported;})();
  try{return await this.pending;}finally{this.pending=null;}
 }
 get localOnly(){return this.supported===false;}
 /** 0.3.256: a ordem guardada no aparelho ja foi lida (so disco, sem rede). Paginas so mostra a lista depois disso. */
 get orderLoaded(){return this.loaded;}
 async loadOrder(){await this.load();}
 decorateNow(items:Entity[]):Entity[]{if(this.supported===true||!this.loaded)return items;return items.map(p=>p.kind==='user_page'&&this.order[p.id]!=null?{...p,data:{...p.data,sort_order:this.order[p.id]}}:p);}
 private key(){return 'sofia.native.md.compat.v1:'+this.scope;}
 private async load(){if(this.loaded)return;if(this.loading)return this.loading;this.loading=(async()=>{const raw=await this.disk.getItem(this.key());if(raw){try{const d=JSON.parse(raw);this.order=Object.fromEntries(Object.entries(d.order||{}).filter(([,v])=>typeof v==='number'&&Number.isFinite(v))) as Record<string,number>;this.dismissed=new Set(Array.isArray(d.dismissed)?d.dismissed.filter((v:unknown)=>typeof v==='string'):[]);}catch{this.order={};this.dismissed=new Set();}}this.loaded=true;})();try{await this.loading;}finally{this.loading=null;}}
 private async persist(){await this.disk.setItem(this.key(),JSON.stringify({order:this.order,dismissed:[...this.dismissed]}));}
 async decorate(items:Entity[]){if(await this.supports())return items;await this.load();return items.map(p=>p.kind==='user_page'&&this.order[p.id]!=null?{...p,data:{...p.data,sort_order:this.order[p.id]}}:p);}
 async clean(input:Partial<Entity>){if(await this.supports()||!input.data)return input;const data={...input.data};delete data.sort_order;delete data.template_id;return {...input,data};}
 async move(input:MoveInput){
  if(await this.supports())return this.call<{items:Entity[]}>('/md/pages/move',input);
  await this.load();const all:Entity[]=[];for(let offset=0;;offset+=100){const listPath='/workspace/entities?limit=100&kind=user_page&offset='+offset,d=await (this.fresh?this.fresh<{items:Entity[]}>(listPath):this.call<{items:Entity[]}>(listPath));all.push(...d.items);if(d.items.length<100)break;if(offset>=99900)throw Error('Árvore muito grande para reorganizar neste servidor.');}
  const plan=legacyMovePlan(await this.decorate(all.filter(p=>p.state!=='archived')),input);let moved=plan.page;
  if(pageParentId(moved)!==input.parentId){const path='/workspace/entities/'+encodeURIComponent(moved.id);
   const patch=async(cur:Entity)=>this.call<Entity>(path,await this.clean({revision:cur.revision,data:{...cur.data,parent_id:input.parentId,node_type:input.parentId?'page':'space'}}),'PATCH');
   try{moved=await patch(moved);}catch(e){if((e as {status?:number}).status!==409)throw e;/* a pagina acabou de ser salva (editor aberto): le de novo e move */moved=await patch(await (this.fresh?this.fresh<Entity>(path):this.call<Entity>(path)));}}
  const old={...this.order};plan.siblings.forEach((p,i)=>{this.order[p.id]=(i+1)*1024;});try{await this.persist();}catch(e){this.order=old;throw e;}
  return {items:plan.siblings.map(p=>{const value=p.id===moved.id?moved:p;return {...value,data:{...value.data,sort_order:this.order[p.id]}};})};
 }
 // 0.3.146: o servidor tem a lista paginada propria (sem os apagados e com o total real de nao lidas).
 noticesNative=false;
 async notices(offset=0){if(await this.supports()||this.noticesNative)return this.call<{items:Notice[];next_offset:number|null;unread:number}>('/md/notifications?offset='+offset);await this.load();if(offset===0)this.snapshot=(await this.call<{items:Notice[]}>('/notifications')).items;const items=this.snapshot.filter(n=>!this.dismissed.has(n.id));return {items:items.slice(offset,offset+100),next_offset:items.length>offset+100?offset+100:null,unread:items.filter(n=>n.state==='unread').length};}
 async clear(id:string){return this.call<{ok:boolean}>('/md/notifications/'+encodeURIComponent(id),{},'DELETE');}
 async readAll(){return this.call<{ok:boolean;updated:number}>('/md/notifications/read-all',{});}
}
