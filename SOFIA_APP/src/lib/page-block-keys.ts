// 0.3.267: teclado do editor de Páginas no estilo Notion (Enter divide o bloco, Backspace junta, menu "/",
// atalhos markdown e colar várias linhas). Funções puras: o Pages.tsx só aplica o resultado e move o foco.
import {newBlock} from './page-editor';
import type {PageBlock} from './page-editor';

/** Blocos com texto editável numa linha do editor (os demais são preservados como estão). */
export const TEXT_BLOCKS=new Set(['text','heading1','heading2','heading3','bullet','number','todo','quote','code','callout']);
const LIST_BLOCKS=new Set(['bullet','number','todo']);

export type Caret={blocks:PageBlock[];focus:string;caret:number};

const plain=(b:PageBlock)=>String(b.text||'');

/** Enter: divide o bloco no cursor. Lista vazia vira texto; lista continua lista; título continua em texto. */
export function splitBlock(blocks:PageBlock[],id:string,start:number,end=start):Caret|null{
 const i=blocks.findIndex(b=>b.id===id);if(i<0)return null;const b=blocks[i],text=plain(b);
 if(LIST_BLOCKS.has(b.type)&&!text.trim()){const next=blocks.slice();next[i]={...b,type:'text',text:'',html:'',checked:false};return {blocks:next,focus:b.id,caret:0};}
 const a=Math.max(0,Math.min(start,text.length)),z=Math.max(a,Math.min(end,text.length));
 const type=LIST_BLOCKS.has(b.type)?b.type:'text',created={...newBlock(type),text:text.slice(z)};
 const next=blocks.slice();
 if(a===0&&z===0&&text){next.splice(i,0,{...newBlock(type)});return {blocks:next,focus:b.id,caret:0};}
 next[i]={...b,text:text.slice(0,a),html:''};next.splice(i+1,0,created);return {blocks:next,focus:created.id,caret:0};
}

/** Backspace no início: primeiro vira texto; texto junta com o bloco de texto anterior; divisor anterior some. */
export function backspaceAtStart(blocks:PageBlock[],id:string):Caret|null{
 const i=blocks.findIndex(b=>b.id===id);if(i<0)return null;const b=blocks[i];
 if(b.type!=='text'){const next=blocks.slice();next[i]={...b,type:'text',checked:false};return {blocks:next,focus:b.id,caret:0};}
 if(i===0)return null;const prev=blocks[i-1];
 if(prev.type==='divider'){const next=blocks.slice();next.splice(i-1,1);return {blocks:next,focus:b.id,caret:0};}
 if(!TEXT_BLOCKS.has(prev.type)){if(plain(b))return null;const next=blocks.slice();next.splice(i,1);return {blocks:next.length?next:[newBlock()],focus:prev.id,caret:0};}
 const join=plain(prev).length,next=blocks.slice();next[i-1]={...prev,text:plain(prev)+plain(b),html:''};next.splice(i,1);
 return {blocks:next,focus:prev.id,caret:join};
}

/** Delete no fim: puxa o próximo bloco de texto para dentro deste. */
export function deleteAtEnd(blocks:PageBlock[],id:string):Caret|null{
 const i=blocks.findIndex(b=>b.id===id),next=blocks[i+1];if(i<0||!next||!TEXT_BLOCKS.has(next.type))return null;
 const b=blocks[i],join=plain(b).length,out=blocks.slice();out[i]={...b,text:plain(b)+plain(next),html:''};out.splice(i+1,1);
 return {blocks:out,focus:b.id,caret:join};
}

const MARKDOWN:Record<string,string>={'#':'heading1','##':'heading2','###':'heading3','-':'bullet','*':'bullet','+':'bullet','1.':'number','[]':'todo','[ ]':'todo','"':'quote','>':'quote','```':'code'};
/** Atalho markdown: "# " no começo de um bloco de texto vira título etc. Retorna o tipo e o texto sem o prefixo. */
export function markdownShortcut(type:string,before:string,after:string):{type:string;text:string}|null{
 if(type!=='text'&&!LIST_BLOCKS.has(type)||after.length!==before.length+1)return null;
 if(after==='---'&&type==='text')return {type:'divider',text:''};
 const m=after.match(/^(\[ \]|\S{1,3}) /);if(!m)return null;const t=MARKDOWN[m[1]];
 if(!t||!before.startsWith(m[1])||before.charAt(m[1].length)===' ')return null;
 return {type:t,text:after.slice(m[0].length)};
}

export type SlashItem={type:string;label:string;hint:string;icon:string;keys:string};
export const SLASH_ITEMS:SlashItem[]=[
 {type:'text',label:'Texto',hint:'Escreva normalmente',icon:'Aa',keys:'texto paragrafo normal'},
 {type:'heading1',label:'Título 1',hint:'Título grande',icon:'H1',keys:'h1 titulo cabecalho heading'},
 {type:'heading2',label:'Título 2',hint:'Título médio',icon:'H2',keys:'h2 titulo cabecalho heading'},
 {type:'heading3',label:'Título 3',hint:'Título pequeno',icon:'H3',keys:'h3 titulo cabecalho heading'},
 {type:'bullet',label:'Lista com marcadores',hint:'Lista simples',icon:'•',keys:'lista marcador topico bullet ul'},
 {type:'number',label:'Lista numerada',hint:'Lista com números',icon:'1.',keys:'lista numerada numero ol'},
 {type:'todo',label:'Lista de tarefas',hint:'Itens para marcar',icon:'☐',keys:'tarefa checkbox todo check'},
 {type:'quote',label:'Citação',hint:'Trecho destacado',icon:'❝',keys:'citacao quote'},
 {type:'callout',label:'Destaque',hint:'Caixa com ícone',icon:'💡',keys:'destaque callout aviso'},
 {type:'code',label:'Código',hint:'Texto monoespaçado',icon:'</>',keys:'codigo code'},
 {type:'divider',label:'Divisor',hint:'Linha de separação',icon:'—',keys:'divisor linha separador hr'},
 {type:'subpage',label:'Subpágina',hint:'Nova página dentro desta',icon:'▤',keys:'pagina subpagina nova page'},
];
const fold=(v:string)=>v.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g,'');
/** Busca do menu "/" sem acento: "tit" acha os Títulos; quem começa com a busca vem primeiro. */
export function slashMatches(query:string):SlashItem[]{
 const q=fold(query).trim();if(!q)return SLASH_ITEMS;const words=q.split(/\s+/);
 return SLASH_ITEMS.map(item=>({item,label:fold(item.label),hay:fold(item.label+' '+item.hint)+' '+item.keys}))
  .filter(x=>words.every(w=>x.hay.includes(w)))
  .sort((a,b)=>(a.label.startsWith(q)?0:1)-(b.label.startsWith(q)?0:1)).map(x=>x.item);
}
/** Início do comando "/" que o cursor está digitando, ou -1 (só no começo do bloco ou depois de espaço). */
export function slashStart(text:string,caret:number):number{
 const at=text.lastIndexOf('/',caret-1);if(at<0)return -1;if(at>0&&!/\s/.test(text.charAt(at-1)))return -1;
 const query=text.slice(at+1,caret);if(query.length>30||/^\s|\n/.test(query))return -1;return at;
}
/** Escolha no menu "/": tira "/busca" do texto; bloco vazio muda de tipo, bloco com texto ganha um novo abaixo. */
export function applySlash(blocks:PageBlock[],id:string,start:number,caret:number,type:string):Caret|null{
 const i=blocks.findIndex(b=>b.id===id);if(i<0)return null;const b=blocks[i],text=plain(b),rest=text.slice(0,start)+text.slice(caret);
 const next=blocks.slice();
 if(!rest.trim()){const changed:PageBlock={...b,type,text:'',html:''};if(type==='divider'){const after=newBlock();next.splice(i,1,changed,after);return {blocks:next,focus:after.id,caret:0};}next[i]=changed;return {blocks:next,focus:b.id,caret:0};}
 next[i]={...b,text:rest,html:''};const created=newBlock(type);next.splice(i+1,0,created);
 if(type==='divider'){const after=newBlock();next.splice(i+2,0,after);return {blocks:next,focus:after.id,caret:0};}
 return {blocks:next,focus:created.id,caret:0};
}

/** Colar várias linhas: cada linha vira um bloco, reconhecendo "# ", "- ", "1. ", "[ ] ", "> ". */
export function pastedLines(blocks:PageBlock[],id:string,before:string,after:string):Caret|null{
 if(after.length-before.length<2||!after.includes('\n'))return null;
 let p=0;while(p<before.length&&before[p]===after[p])p++;let s=0;while(s<before.length-p&&before[before.length-1-s]===after[after.length-1-s])s++;
 const inserted=after.slice(p,after.length-s);if(!inserted.includes('\n'))return null;
 const lines=inserted.replace(/\r\n?/g,'\n').split('\n'),i=blocks.findIndex(b=>b.id===id);if(i<0)return null;
 const head=before.slice(0,p),tail=before.slice(before.length-s),b=blocks[i];
 const emptyBefore=!before.trim();
 const parsed=lines.map((line,n)=>{if(n>0)return parseLine(line);const own=parseLine(line);return emptyBefore&&own.type!=='text'?own:{type:b.type,text:line,checked:!!b.checked};}).filter((x,n)=>n===0||x.text.trim()||x.type!=='text');
 const first=parsed[0],rest=parsed.slice(1).map(x=>({...newBlock(x.type),text:x.text,...(x.checked?{checked:true}:{})}));
 const next=blocks.slice();next[i]={...b,type:first.type,checked:first.checked,text:head+first.text,html:''};
 if(!rest.length){next[i]={...next[i],text:String(next[i].text)+tail};return {blocks:next,focus:b.id,caret:(head+first.text).length};}
 const last=rest[rest.length-1],caret=String(last.text).length;last.text=String(last.text)+tail;next.splice(i+1,0,...rest);
 return {blocks:next,focus:last.id,caret};
}
function parseLine(line:string):{type:string;text:string;checked:boolean}{
 const rules:[RegExp,string][]=[[/^###\s+/,'heading3'],[/^##\s+/,'heading2'],[/^#\s+/,'heading1'],[/^[-*+]\s+\[( |x)\]\s+/i,'todo'],[/^\[( |x)\]\s+/i,'todo'],[/^[-*+•]\s+/,'bullet'],[/^\d+[.)]\s+/,'number'],[/^>\s+/,'quote']];
 for(const [re,type] of rules){const m=line.match(re);if(m)return {type,text:line.slice(m[0].length),checked:type==='todo'&&/x/i.test(m[1]||'')};}
 return {type:'text',text:line,checked:false};
}

/** Número de cada item numerado: recomeça depois de qualquer bloco que não seja lista numerada. */
export function listNumber(blocks:readonly PageBlock[],index:number):number{let n=0;for(let i=index;i>=0&&blocks[i]?.type==='number';i--)n++;return n;}

/** Bloco de texto vizinho para as setas (pula divisores, imagens e coleções). */
export function neighbourText(blocks:readonly PageBlock[],id:string,dir:1|-1):string|null{
 let i=blocks.findIndex(b=>b.id===id)+dir;while(i>=0&&i<blocks.length){if(TEXT_BLOCKS.has(blocks[i].type))return blocks[i].id;i+=dir;}return null;
}

/** Resposta da Sofia (markdown simples) vira blocos da página: "# " títulos, "- " listas, "[ ] " tarefas, "> " citação. */
export function blocksFromMarkdown(text:string):PageBlock[]{
 const out:PageBlock[]=[];let code:string[]|null=null;
 for(const raw of String(text||'').replace(/\r\n?/g,'\n').split('\n')){
  if(/^```/.test(raw.trim())){if(code){out.push({...newBlock('code'),text:code.join('\n')});code=null;}else code=[];continue;}
  if(code){code.push(raw);continue;}
  if(!raw.trim())continue;if(/^-{3,}$/.test(raw.trim())){out.push(newBlock('divider'));continue;}
  const p=parseLine(raw.replace(/\*\*(.+?)\*\*/g,'$1'));out.push({...newBlock(p.type),text:p.text,...(p.checked?{checked:true}:{})});
 }
 if(code)out.push({...newBlock('code'),text:code.join('\n')});
 return out;
}
