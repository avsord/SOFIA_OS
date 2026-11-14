// 14/11/2026 (Pedro: "modelo Diário também nas Notas"): o mesmo Diário das Páginas, em blocos de nota (texto + marcas).
// Registro = "HH:MM  texto" com a hora em roxo e negrito; dia = título 3 "dd/mm/aaaa · dia"; divisor entre os dias.
import {DIARY_TIME_COLOR,diaryDayKey,diaryDayTitle,isDiaryEntry} from './page-templates';
import {leafId} from './leaf-document';
import type {Leaf,LeafBlock} from './leaf-document';
const pad=(n:number)=>String(n).padStart(2,'0');
export const hhmm=(d:Date)=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
const keyOf=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
export function leafEntry(time:string,text:string,created_at?:string):LeafBlock{
 const t=time.trim(),body=text.trim();
 return {id:leafId(),type:'text',text:`${t}  ${body}`,marks:[{start:0,end:t.length,bold:true,color:DIARY_TIME_COLOR}],...(created_at?{created_at}:{})} as LeafBlock;
}
export const leafDay=(d:Date):LeafBlock=>({id:leafId(),type:'heading3',text:diaryDayTitle(d),marks:[]});
const divider=():LeafBlock=>({id:leafId(),type:'divider',text:'',marks:[]});
/** Linha da nota sem o marcador de lista ("- ", "• ", "* "). */
export const lineKey=(s:string)=>s.replace(/ /g,' ').trim().replace(/^[-•*–]\s+/,'').trim();
const TEXTY=new Set(['text','heading1','heading2','heading3','quote','callout','bullet','number','todo']);
/** Converte o que já está escrito: linha só com data = dia; linha com hora = registro com essa hora; as demais viram
 * registro com a hora em que foram escritas (timeOf). Arquivos e imagens ficam onde estavam. */
export function leafDiaryConvert(blocks:readonly LeafBlock[],timeOf:(line:string,block:LeafBlock)=>Date):LeafBlock[]{
 type Item={day:Date;block:LeafBlock};const items:Item[]=[];let ctx:Date|null=null,last=new Date();
 for(const b of blocks){
  if(b.type==='divider')continue;
  if(diaryDayKey(b as any)){const [y,m,d]=diaryDayKey(b as any).split('-');ctx=new Date(+y,+m-1,+d);continue;}
  if(isDiaryEntry(b as any)){items.push({day:ctx||last,block:b});continue;}
  if(!TEXTY.has(b.type)){items.push({day:ctx||last,block:b});continue;}
  for(const raw of String(b.text||'').split(/\r?\n/)){
   const line=lineKey(raw);if(!line)continue;
   const d=/^(\d{1,2})\/(\d{1,2})\/(\d{4})(\s*·\s*\S+)?$/.exec(line);
   if(d){ctx=new Date(+d[3],+d[2]-1,+d[1]);continue;}
   const t=/^(\d{1,2})[:h](\d{2})\s*(?:[-–—:]\s*)?([\s\S]*)$/.exec(line);
   if(t&&+t[1]<24&&+t[2]<60){items.push({day:ctx||last,block:leafEntry(`${pad(+t[1])}:${t[2]}`,t[3]||'')});continue;}
   const when=timeOf(line,b);last=when;items.push({day:ctx||when,block:leafEntry(hhmm(when),line,when.toISOString())});
  }
 }
 const out:LeafBlock[]=[];let cur='';
 for(const it of items){const k=keyOf(it.day);if(k!==cur){if(cur)out.push(divider());out.push(leafDay(it.day));cur=k;}out.push(it.block);}
 return out.length?out:[leafDay(new Date()),leafEntry(hhmm(new Date()),'')];
}
/** Enter no fim de um registro com texto: registro novo com a hora de agora (e o dia novo, se virou o dia). */
export function leafDiaryEnter(blocks:readonly LeafBlock[],id:string,now=new Date()):{blocks:LeafBlock[];focus:string}|null{
 const i=blocks.findIndex(b=>b.id===id),b=blocks[i];
 if(i<0||!isDiaryEntry(b as any)||!String(b.text||'').replace(/^\d{2}:\d{2}\s\s/,'').trim())return null;
 const entry=leafEntry(hhmm(now),''),next=blocks.slice();let lastDay='';for(const x of blocks){const k=diaryDayKey(x as any);if(k)lastDay=k;}
 if(lastDay!==keyOf(now))next.push(divider(),leafDay(now),entry);else next.splice(i+1,0,entry);
 return {blocks:next,focus:entry.id};
}
/** Hora real de cada linha pelas versões da página (ordem crescente): 1ª versão em que a linha (ou o começo dela, com 4+
 * letras) aparece nesta nota. A versão mais antiga guardada, se o histórico já foi podado, não vale como data. */
export function lineTimesFromVersions(versions:readonly {revision:number;created_at:string;snapshot:any}[],leafIdWanted:string):Map<string,string>{
 const seen:{line:string;at:string}[]=[];const sorted=[...versions].sort((a,b)=>a.revision-b.revision);
 sorted.forEach((v,i)=>{if(i===0&&v.revision>1)return;let bs:any[]=[];try{bs=JSON.parse(String(v.snapshot?.data?.blocks_json||'[]'));}catch{return;}
  for(const pb of Array.isArray(bs)?bs:[])for(const book of pb?.data?.notebooks||[])for(const leaf of book?.pages||[])if(leaf?.id===leafIdWanted)
   for(const lb of leaf.blocks||[])for(const raw of String(lb?.text||'').split(/\r?\n/)){const l=lineKey(raw);if(l&&!seen.some(s=>s.line===l))seen.push({line:l,at:v.created_at});}});
 const out=new Map<string,string>();for(const s of seen)out.set(s.line,s.at);return out;
}
export function findLineTime(times:Map<string,string>,line:string):string{
 const exact=times.get(line);if(exact)return exact;
 for(const [l,at] of times)if(l.length>=4&&line.startsWith(l))return at;return '';
}
export type DiarySources={versions:number;block:number;note:number};
/** Conversão completa da nota, dizendo de onde veio a hora de cada linha. */
export function leafToDiary(leaf:Leaf,blocks:readonly LeafBlock[],times:Map<string,string>):{blocks:LeafBlock[];sources:DiarySources}{
 const sources={versions:0,block:0,note:0};
 const next=leafDiaryConvert(blocks,(line,b)=>{const v=findLineTime(times,line);if(v){sources.versions++;return new Date(v);}
  const bc=(b as any).created_at;if(bc){sources.block++;return new Date(bc);}sources.note++;return leaf.created_at?new Date(leaf.created_at):new Date();});
 return {blocks:next,sources};
}
