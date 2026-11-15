// 15/11/2026 (Pedro: "preciso que apareca aqui", as notas das paginas na Conversa): cada nota de um bloco de Notas vira
// uma conversa da lista, com o mesmo balao das paginas. Escrever, gravar audio ou anexar grava dentro da nota (no Diario,
// como registro com hora roxa). A conversa da nota e uma "pagina de mentira" montada da pagina dona; nada novo no servidor.
import type {Entity} from './types';
import type {PageBlock} from './page-editor';
import type {Leaf,LeafBlock} from './leaf-document';
import {leafBlocks} from './leaf-document';
import {DIARY_TIME_COLOR,isDiaryEntry} from './page-templates';

const PREFIX='nota:';
export const noteChatId=(pageId:string,leafId:string)=>`${PREFIX}${pageId}:${leafId}`;
export function parseNoteChatId(id:string):{pageId:string;leafId:string}|null{
 if(!id.startsWith(PREFIX))return null;const rest=id.slice(PREFIX.length),i=rest.indexOf(':');
 return i>0?{pageId:rest.slice(0,i),leafId:rest.slice(i+1)}:null;
}
const parse=(page:Entity):PageBlock[]=>{try{const v=JSON.parse(String(page.data?.blocks_json||'[]'));return Array.isArray(v)?v:[];}catch{return [];}};
const isNotes=(b:PageBlock)=>b?.type==='collection'&&Array.isArray(b.data?.notebooks);

/** Notas das paginas como conversas: titulo da nota, "em <pagina>" (parent_id = pagina dona), principal pelo chat_main da nota. */
export function noteChats(pages:readonly Entity[]):Entity[]{
 const out:Entity[]=[];
 for(const p of pages)for(const b of parse(p))if(isNotes(b))for(const book of b.data!.notebooks)for(const leaf of (book?.pages||[]) as (Leaf&Record<string,any>)[]){
  if(!leaf?.id)continue;
  out.push({...p,id:noteChatId(p.id,leaf.id),title:String(leaf.title||'').trim()||'Nota sem título',updated_at:String(leaf.updated_at||leaf.created_at||p.updated_at||''),
   data:{...p.data,parent_id:p.id,note_of:p.id,note_id:leaf.id,chat_main:leaf.chat_main===true,blocks_json:JSON.stringify(leafToPage(leaf))}} as Entity);
 }
 return out;
}
/** Blocos da nota lidos como blocos de pagina (a hora do Diario ja vem no texto "HH:MM  ..."). */
export function leafToPage(leaf:Leaf):PageBlock[]{return leafBlocks(leaf).map(b=>({...b}) as unknown as PageBlock);}
/** Volta para bloco de nota: texto que nao mudou guarda a formatacao; registro do Diario novo/editado ganha so a hora roxa. */
export function pageToLeaf(blocks:readonly PageBlock[],before:readonly LeafBlock[]):LeafBlock[]{
 const old=new Map(before.map(b=>[b.id,b]));
 return blocks.map(pb=>{const {html:_h,...rest}=pb as any,prev=old.get(pb.id),text=String(pb.text||'');
  const marks=prev&&prev.text===text?prev.marks||[]:isDiaryEntry(pb)?[{start:0,end:5,bold:true,color:DIARY_TIME_COLOR}]:[];
  return {...rest,text,type:String(pb.type||'text'),marks} as LeafBlock;});
}
/** Muda so a nota (achada em qualquer bloco de Notas da pagina); os outros blocos ficam identicos. */
export function changeNote(blocks:readonly PageBlock[],leafId:string,edit:(leaf:Leaf&Record<string,any>)=>Leaf):PageBlock[]{
 return blocks.map(b=>{if(!isNotes(b)||!b.data!.notebooks.some((k:any)=>(k?.pages||[]).some((l:any)=>l?.id===leafId)))return b;
  return {...b,data:{...b.data,notebooks:b.data!.notebooks.map((k:any)=>({...k,pages:(k?.pages||[]).map((l:any)=>l?.id===leafId?edit(l):l)}))}};});
}
/** O que a conversa faz nos blocos (escrever, apagar, editar), aplicado dentro da nota. */
export function changeNoteBlocks(blocks:readonly PageBlock[],leafId:string,change:(b:PageBlock[])=>PageBlock[],now=new Date()):PageBlock[]{
 return changeNote(blocks,leafId,leaf=>{const before=leafBlocks(leaf),after=pageToLeaf(change(leafToPage(leaf)),before);
  return {...leaf,blocks:after,content:after.map(b=>b.text).join('\n'),updated_at:now.toISOString()} as Leaf;});
}
export const setNoteMain=(blocks:readonly PageBlock[],leafId:string,on:boolean)=>changeNote(blocks,leafId,leaf=>({...leaf,chat_main:on}) as Leaf);
