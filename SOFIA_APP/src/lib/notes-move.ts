import type {Leaf} from './leaf-document';
import type {Entity} from './types';

/** 13/11/2026 (Pedro): regras das Notas sem tela (testaveis) - nota solta, arrastar/reordenar, mover para outra pagina.
 * Formato guardado continua o mesmo: data.notebooks = pastas; a pasta escondida ROOT_BOOK guarda as notas soltas.
 * Nada aqui reescreve dados antigos em massa: so a nota/pasta mexida muda de lugar. */
export type NoteBook={id:string;name:string;emoji:string;expanded:boolean;pages:Leaf[];parent?:string;root?:boolean};
export type NoteDragItem={kind:'note'|'folder';id:string;from:string;label:string};
export type NoteRect={id:string;x:number;y:number;w:number;h:number};
export const ROOT_BOOK='__fora_de_pastas__';
export const NOTE_DRAG_TYPE='application/x-sofia-note';
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
const rootBook=():NoteBook=>({id:ROOT_BOOK,name:'Fora de pastas',emoji:'📝',expanded:true,pages:[],root:true});

/** Le os dois formatos: o atual (notebooks) e o antigo (rows com page_content), sem alterar nada. */
export function booksOf(data:Record<string,any>|null|undefined):NoteBook[]{
 const d=data||{};
 return Array.isArray(d.notebooks)?d.notebooks:(d.rows||[]).map((r:any)=>({id:r.id,name:String(r.values?.name||''),emoji:'',expanded:false,pages:r.page_content?[{id:r.id+'-leaf',title:'',content:r.page_content}]:[]}));
}
export function folderParent(all:NoteBook[],b:NoteBook):string{return b.parent&&all.some(x=>x.id===b.parent&&!x.root)?b.parent:'';}
function isInside(all:NoteBook[],id:string,ancestor:string):boolean{let cur=all.find(b=>b.id===id),guard=0;while(cur&&guard++<50){if(cur.id===ancestor)return true;const up=folderParent(all,cur);cur=up?all.find(b=>b.id===up):undefined;}return false;}

/** ＋ Nota: a nota vai solta para a lista atual (pasta aberta ou raiz). Nunca cria a pasta "Geral". */
export function addLooseNote(books:NoteBook[],folderId:string|null|undefined,note:Leaf):{books:NoteBook[];bookId:string}{
 const next=clone(books);let b=folderId?next.find(x=>x.id===folderId):undefined;
 if(!b){b=next.find(x=>x.id===ROOT_BOOK);if(!b){b=rootBook();next.push(b);}}
 b.pages.unshift(note);b.expanded=true;return {books:next,bookId:b.id};
}

/** Qual alvo esta embaixo do ponteiro. Pasta arrastada: bordas esquerda/direita = reordenar, meio = entrar. */
export function hitTarget(rects:NoteRect[],item:NoteDragItem|null,x:number,y:number):string|null{
 for(const r of rects){
  if(!(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h))continue;
  if(r.id==='__up__'||r.id==='__back__')return '__up__';
  if(r.id.startsWith('note:')){if(!item||item.kind!=='note'||r.id.endsWith(':'+item.id))continue;return r.id+(y>r.y+r.h/2?'|after':'|before');}
  if(item&&item.kind==='folder'){if(r.id===item.id)continue;if(x<r.x+r.w*0.25)return 'folder:'+r.id+'|before';if(x>r.x+r.w*0.75)return 'folder:'+r.id+'|after';}
  return r.id;
 }
 return null;
}

/** Aplica o soltar. Devolve as pastas novas, nada (sem mudanca) ou um erro para mostrar. A ordem fica no proprio array. */
export function applyDrop(books:NoteBook[],item:NoteDragItem,target:string,openedId:string|null):{books?:NoteBook[];error?:string}{
 const all=books,op=openedId?all.find(b=>b.id===openedId)||null:null;
 if(item.kind==='folder'){
  if(target.startsWith('folder:')){
   const [ref,side]=target.split('|'),destId=ref.slice(7);if(destId===item.id)return {};
   const next=clone(all),dest=next.find(b=>b.id===destId),f=next.find(b=>b.id===item.id);if(!dest||!f)return {};
   const newParent=folderParent(next,dest);
   if(newParent&&(newParent===item.id||isInside(next,newParent,item.id)))return {error:'Uma pasta não pode ir para dentro dela mesma.'};
   next.splice(next.indexOf(f),1);if(newParent)f.parent=newParent;else delete f.parent;
   const at=next.indexOf(dest);next.splice(side==='after'?at+1:at,0,f);return {books:next};
  }
  const newParent=target==='__up__'?(op?folderParent(all,op):''):target;
  if(newParent&&!all.some(b=>b.id===newParent&&!b.root))return {};
  if(newParent&&(newParent===item.id||isInside(all,newParent,item.id)))return {error:'Uma pasta não pode ir para dentro dela mesma.'};
  const next=clone(all),f=next.find(b=>b.id===item.id);if(!f)return {};
  if((f.parent||'')===newParent)return {};
  if(newParent)f.parent=newParent;else delete f.parent;return {books:next};
 }
 if(target.startsWith('note:')){
  const [ref,side]=target.split('|'),[,destBook,destNote]=ref.split(':');if(destNote===item.id)return {};
  const next=clone(all),src=next.find(b=>b.id===item.from),d=next.find(b=>b.id===destBook),p=src?.pages.find(x=>x.id===item.id);if(!src||!d||!p)return {};
  src.pages=src.pages.filter(x=>x.id!==item.id);const at=d.pages.findIndex(x=>x.id===destNote);d.pages.splice(at<0?d.pages.length:side==='after'?at+1:at,0,p);return {books:next};
 }
 if(target.startsWith('folder:'))target=target.slice(7).split('|')[0];
 const dest=target==='__up__'?(op?(folderParent(all,op)||ROOT_BOOK):ROOT_BOOK):target;
 if(dest===item.from)return {};
 const next=clone(all),src=next.find(b=>b.id===item.from),p=src?.pages.find(x=>x.id===item.id);if(!src||!p)return {};
 let d=next.find(b=>b.id===dest);if(!d){if(dest!==ROOT_BOOK)return {};d=rootBook();next.push(d);}
 src.pages=src.pages.filter(x=>x.id!==item.id);d.pages.unshift(p);return {books:next};
}

// ---------- mover nota para OUTRA pagina (arrastar para a barra lateral) ----------
type Block={id:string;type:string;data?:Record<string,any>;[k:string]:any};
const isNotesBlock=(b:Block)=>!!b&&b.type==='collection'&&!!b.data&&(b.data.mode==='notebooks'||(Array.isArray(b.data.views)&&b.data.views.some((v:any)=>v?.id===b.data!.active_view&&v?.type==='pages')));
/** Bloco de Notas novo (igual ao modelo "Anotações") para a pagina que ainda nao tem Notas. */
export function newNotesBlock(note:Leaf):Block{
 return {id:Date.now().toString(36)+Math.random().toString(36).slice(2,9),type:'collection',text:'',data:{title:'Notas',show_title:true,mode:'notebooks',notebooks:[{...rootBook(),pages:[note]}],properties:[{key:'name',label:'Nome',type:'text'}],views:[{id:'notebooks',label:'Notas',type:'pages'}],active_view:'notebooks',rows:[]}};
}
/** Acha a nota em qualquer bloco de Notas da pagina e devolve os blocos sem ela (os outros blocos ficam identicos). */
export function takeNoteFromBlocks(blocks:Block[],noteId:string):{blocks:Block[];note:Leaf|null}{
 for(let i=0;i<blocks.length;i++){
  const b=blocks[i];if(!b||b.type!=='collection'||!b.data)continue;
  const books=booksOf(b.data);const book=books.find(k=>k.pages.some(p=>p.id===noteId));if(!book)continue;
  const nextBooks=clone(books),nb=nextBooks.find(k=>k.id===book.id)!,note=nb.pages.find(p=>p.id===noteId)!;
  nb.pages=nb.pages.filter(p=>p.id!==noteId);
  const out=blocks.slice();out[i]={...b,data:{...b.data,mode:'notebooks',notebooks:nextBooks}};return {blocks:out,note};
 }
 return {blocks,note:null};
}
/** Poe a nota solta no topo do primeiro bloco de Notas; sem bloco de Notas, acrescenta um no fim da pagina. */
export function insertNoteIntoBlocks(blocks:Block[],note:Leaf):Block[]{
 const i=blocks.findIndex(isNotesBlock);
 if(i<0)return [...blocks,newNotesBlock(note)];
 const b=blocks[i],{books}=addLooseNote(booksOf(b.data),null,note),out=blocks.slice();out[i]={...b,data:{...b.data,mode:'notebooks',notebooks:books}};return out;
}

/** Bloco de Notas aberto na tela agora (a pagina aberta): mexe no rascunho vivo, que o editor grava sozinho. */
export type LiveNotes={find(noteId:string):Leaf|null;remove(noteId:string):void;addLoose(note:Leaf):void};
const live=new Map<string,Set<LiveNotes>>();
export function registerLiveNotes(pageId:string,h:LiveNotes):()=>void{
 if(!pageId)return ()=>{};let s=live.get(pageId);if(!s){s=new Set();live.set(pageId,s);}s.add(h);
 return ()=>{const t=live.get(pageId);if(!t)return;t.delete(h);if(!t.size)live.delete(pageId);};
}
export type NotesApi={entityFresh(id:string):Promise<Entity>;saveEntity(input:Partial<Entity>,base?:Partial<Entity>):Promise<Entity>};
function blocksOf(e:Entity):Block[]{
 if(String(e.data?.lock_json||''))throw new Error('Página trancada: abra a página para mover a nota.');
 let parsed:unknown;try{parsed=JSON.parse(String(e.data?.blocks_json||'[]'));}catch{throw new Error('Não deu para ler o conteúdo da página.');}
 if(!Array.isArray(parsed))throw new Error('Não deu para ler o conteúdo da página.');return parsed as Block[];
}
/**
 * Move a nota (titulo, texto, blocos, datas, tudo) da pagina `fromPageId` para `toPageId`.
 * Destino com bloco de Notas: nota solta na raiz dele. Sem bloco de Notas: ganha um bloco "Notas" no fim com a nota.
 * Ordem segura: PRIMEIRO grava no destino, SO DEPOIS tira da origem (se algo falhar, a nota fica duplicada, nunca perdida).
 * Pagina aberta na tela usa o rascunho vivo (o editor grava); fechada usa `api` (obrigatorio nesse caso).
 */
export async function moveNoteToPage(noteId:string,fromPageId:string,toPageId:string,api?:NotesApi|null):Promise<void>{
 if(!noteId||!fromPageId||!toPageId)throw new Error('Nota ou página não informada.');
 if(fromPageId===toPageId)return;
 const srcLive=[...(live.get(fromPageId)||[])].filter(h=>!!h.find(noteId));
 let note:Leaf|null=srcLive[0]?.find(noteId)||null,src:Entity|null=null;
 if(!note){
  if(!api)throw new Error('Sem conexão para mover a nota.');
  src=await api.entityFresh(fromPageId);note=takeNoteFromBlocks(blocksOf(src),noteId).note;
  if(!note)throw new Error('A nota não foi encontrada na página de origem.');
 }
 const copy=clone(note);
 const dstLive=[...(live.get(toPageId)||[])][0];
 if(dstLive)dstLive.addLoose(copy);
 else{
  if(!api)throw new Error('Sem conexão para mover a nota.');
  const dst=await api.entityFresh(toPageId);if(dst.kind&&dst.kind!=='user_page')throw new Error('O destino não é uma página.');
  const blocks=insertNoteIntoBlocks(blocksOf(dst),copy);
  await api.saveEntity({id:dst.id,revision:dst.revision,data:{...(dst.data||{}),blocks_json:JSON.stringify(blocks)}},dst);
 }
 if(srcLive.length){for(const h of srcLive)h.remove(noteId);return;}
 const cur=src!,after=takeNoteFromBlocks(blocksOf(cur),noteId);
 if(after.note)await api!.saveEntity({id:cur.id,revision:cur.revision,data:{...(cur.data||{}),blocks_json:JSON.stringify(after.blocks)}},cur);
}
