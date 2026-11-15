// 15/11/2026 (Pedro: "um template igual o WhatsApp, ligado nas paginas"): a pagina lida como conversa.
// Cada bloco da pagina vira um balao; o que se escreve no chat entra como bloco no fim da pagina. Sem React aqui.
import type {Entity} from './types';
import {newBlock,type PageBlock} from './page-editor';
import {TEXT_BLOCKS} from './page-block-keys';
import {diaryDayKey,diaryDayTitle,diaryEntryBlock,isDiaryEntry,isDiaryPage} from './page-templates';

export type Bubble=
 |{kind:'day';id:string;label:string}
 |{kind:'text';id:string;text:string;time:string;todo?:boolean;checked?:boolean;heading?:boolean}
 |{kind:'file';id:string;attachmentId:string;name:string;mime:string;time:string}
 |{kind:'card';id:string;label:string;time:string};

const pad=(n:number)=>String(n).padStart(2,'0');
export const hhmm=(d:Date)=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
const CARD:Record<string,string>={table:'Tabela',collection:'Base de dados',page_link:'Link de página',divider:'',board:'Quadro',notebook:'Notas',embed:'Link incorporado'};

export function pageBlocks(page:Entity|undefined|null):PageBlock[]{
 try{const v=JSON.parse(String(page?.data?.blocks_json||'[]'));return Array.isArray(v)?v:[];}catch{return [];}
}
/** Rótulo do dia no separador: Hoje, Ontem ou a data. */
export function dayLabel(key:string,now=new Date()):string{
 const k=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,y=new Date(now);y.setDate(y.getDate()-1);
 if(key===k(now))return 'Hoje';if(key===k(y))return 'Ontem';const [a,m,d]=key.split('-');return `${d}/${m}/${a}`;
}
const dateKey=(iso:unknown)=>{const d=typeof iso==='string'?new Date(iso):null;return d&&!isNaN(+d)?`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`:'';};
const timeOf=(iso:unknown)=>{const d=typeof iso==='string'?new Date(iso):null;return d&&!isNaN(+d)?hhmm(d):'';};

/** Blocos da página na ordem, como balões. Linha vazia não aparece; título de dia do Diário vira separador. */
export function bubblesOf(blocks:readonly PageBlock[],now=new Date()):Bubble[]{
 const out:Bubble[]=[];let day='';
 const sep=(key:string,id:string)=>{if(key&&key!==day){day=key;out.push({kind:'day',id:'d-'+id,label:dayLabel(key,now)});}};
 for(const b of blocks){
  if(!b||!b.id)continue;
  const dk=diaryDayKey(b);if(dk){sep(dk,b.id);continue;}
  const made=dateKey(b.created_at);if(made&&!isDiaryEntry(b))sep(made,b.id);
  const att=String(b.data?.attachment_id||'');
  if(att){out.push({kind:'file',id:b.id,attachmentId:att,name:String(b.data?.name||'arquivo'),mime:String(b.data?.mime||''),time:timeOf(b.created_at)});continue;}
  if(TEXT_BLOCKS.has(b.type)){
   const raw=String(b.text||'');if(!raw.trim())continue;
   if(isDiaryEntry(b)){out.push({kind:'text',id:b.id,text:raw.slice(5).trim(),time:raw.slice(0,5)});continue;}
   out.push({kind:'text',id:b.id,text:raw,time:timeOf(b.created_at),todo:b.type==='todo',checked:!!b.checked,heading:/^heading/.test(b.type)});continue;
  }
  const label=CARD[b.type];if(label==='')continue;
  out.push({kind:'card',id:b.id,label:label||'Bloco da página',time:timeOf(b.created_at)});
 }
 return out;
}
/** Última linha escrita, para a lista de conversas. */
export function lastLine(blocks:readonly PageBlock[]):string{
 const all=bubblesOf(blocks);for(let i=all.length-1;i>=0;i--){const b=all[i];if(b.kind==='text')return b.text.replace(/\s+/g,' ');if(b.kind==='file')return b.name;if(b.kind==='card')return b.label;}
 return '';
}
const blank=(b:PageBlock)=>TEXT_BLOCKS.has(b.type)&&!String(b.text||'').trim()&&!b.data?.attachment_id;
/** Tira as linhas vazias do fim (a página nova nasce com uma) antes de acrescentar. */
function trimEnd(blocks:readonly PageBlock[]):PageBlock[]{const out=[...blocks];while(out.length&&blank(out[out.length-1]))out.pop();return out;}

/** Bloco de texto que o chat acrescenta. No Diário entra como registro com hora, criando o título do dia se faltar. */
export function chatTextBlocks(blocks:readonly PageBlock[],text:string,now=new Date()):PageBlock[]{
 const iso=now.toISOString();
 if(isDiaryPage(blocks)){
  const made:PageBlock[]=[],today=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;let last='';
  for(const b of blocks){const k=diaryDayKey(b);if(k)last=k;}
  if(last!==today)made.push({...newBlock('heading3'),text:diaryDayTitle(now)});
  made.push({...diaryEntryBlock(hhmm(now),text.replace(/\n+/g,' ')),created_at:iso});return made;
 }
 return [{...newBlock('text'),text:text.trim(),created_at:iso}];
}
export function chatFileBlock(file:{attachment_id:string;name:string;mime:string;size:number;view:'attach'|'preview'},now=new Date()):PageBlock{
 return {...newBlock('file'),text:'',created_at:now.toISOString(),data:{...file}};
}
export const appendBlocks=(blocks:readonly PageBlock[],made:readonly PageBlock[]):PageBlock[]=>[...trimEnd(blocks),...made];
/** Editar o balão muda o texto do bloco (a formatação antiga do trecho sai; o tipo do bloco fica). */
export function editBubble(blocks:readonly PageBlock[],id:string,text:string,now=new Date()):PageBlock[]{
 return blocks.map(b=>{if(b.id!==id)return b;
  if(isDiaryEntry(b))return {...b,...diaryEntryBlock(String(b.text).slice(0,5),text.replace(/\n+/g,' ')),id:b.id,edited_at:now.toISOString()};
  const {html:_html,...rest}=b;return {...rest,text:text.trim(),edited_at:now.toISOString()};});
}
export const removeBubble=(blocks:readonly PageBlock[],id:string):PageBlock[]=>blocks.filter(b=>b.id!==id);
export const toggleTodo=(blocks:readonly PageBlock[],id:string):PageBlock[]=>blocks.map(b=>b.id===id?{...b,checked:!b.checked}:b);

/** Quem fica na lista principal do chat: só as páginas que a pessoa puxou (data.chat_main). O resto fica em Arquivadas. */
export const inMain=(p:Entity)=>p.data?.chat_main===true;
export function chatLists(pages:readonly Entity[],q=''):{main:Entity[];archived:Entity[]}{
 const needle=q.trim().toLowerCase(),hit=(p:Entity)=>!needle||String(p.title||'').toLowerCase().includes(needle);
 const recent=(a:Entity,b:Entity)=>String(b.updated_at||'').localeCompare(String(a.updated_at||''));
 const main=pages.filter(p=>inMain(p)&&hit(p)).sort(recent),archived=pages.filter(p=>!inMain(p)&&hit(p)).sort(recent);
 return {main,archived};
}
/** Hora curta da lista: hora se foi hoje, "Ontem", dia da semana na última semana, senão a data. */
export function listTime(iso:unknown,now=new Date()):string{
 const d=typeof iso==='string'?new Date(iso):null;if(!d||isNaN(+d))return '';
 const key=dateKey(iso as string),label=dayLabel(key,now);if(label==='Hoje')return hhmm(d);if(label==='Ontem')return 'Ontem';
 const days=(+now-+d)/86400000;if(days<7)return ['domingo','segunda','terça','quarta','quinta','sexta','sábado'][d.getDay()];
 return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
}
