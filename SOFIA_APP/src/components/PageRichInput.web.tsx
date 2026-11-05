// 0.3.267 (site, computador): linha de texto rico das Páginas, como no Notion — negrito, itálico, sublinhado, tachado,
// código, link e cor dentro do texto. É um contentEditable que se apresenta para o Pages.tsx como se fosse o <textarea>
// de antes (value, selectionStart/End, setSelectionRange, focus), para o teclado (Enter, Backspace, setas, "/")
// continuar igual. O HTML guardado passa sempre por uma lista fechada de marcas permitidas.
import React,{useImperativeHandle,useLayoutEffect,useRef} from 'react';
import {StyleSheet} from 'react-native';
import {scaleStyle} from '../web/desktop-scale';

type Props={value:string;html?:string;placeholder?:string;placeholderColor?:string;style?:any;editable?:boolean;accessibilityLabel?:string;testID?:string;
 onChange:(text:string,html:string)=>void;onKeyPress?:(e:any)=>void;onFocus?:()=>void;onBlur?:()=>void;onPasteText?:(text:string,start:number,end:number)=>boolean;onPasteImage?:(image:Blob)=>void};

const ALLOWED=new Set(['B','STRONG','I','EM','U','S','STRIKE','DEL','CODE','A','SPAN','MARK','BR']);
const SAFE_COLOR=/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent)$/i;
export function escapeHtml(v:string){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
export function textToHtml(v:string){return escapeHtml(v).replace(/\n/g,'<br>');}
/** Só marcas de texto conhecidas; links http/https/mailto; cor/fundo como cor simples. Div/p viram quebra de linha. */
export function sanitizeRich(html:string):string{
 if(typeof document==='undefined')return escapeHtml(html.replace(/<[^>]*>/g,''));
 const src=document.createElement('template');src.innerHTML=String(html||'');
 const build=(node:Node,first:boolean):Node=>{
  if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent||'');
  const frag=document.createDocumentFragment();
  if(node.nodeType!==Node.ELEMENT_NODE){node.childNodes.forEach(c=>frag.append(build(c,false)));return frag;}
  const el=node as HTMLElement,tag=el.tagName;
  if(tag==='DIV'||tag==='P'){if(!first)frag.append(document.createElement('br'));el.childNodes.forEach((c,i)=>frag.append(build(c,i===0)));return frag;}
  if(!ALLOWED.has(tag)){el.childNodes.forEach((c,i)=>frag.append(build(c,first&&i===0)));return frag;}
  const out=document.createElement(tag==='STRONG'?'b':tag==='EM'?'i':tag==='STRIKE'||tag==='DEL'?'s':tag.toLowerCase());
  if(tag==='A'){const href=String(el.getAttribute('href')||'');if(/^(https?:|mailto:)/i.test(href)){out.setAttribute('href',href);out.setAttribute('target','_blank');out.setAttribute('rel','noopener noreferrer');}}
  if(tag!=='BR'){const color=el.style.color,bg=el.style.backgroundColor;if(color&&SAFE_COLOR.test(color.trim()))(out as HTMLElement).style.color=color;if(bg&&SAFE_COLOR.test(bg.trim()))(out as HTMLElement).style.backgroundColor=bg;}
  el.childNodes.forEach(c=>out.append(build(c,false)));return out;
 };
 const target=document.createElement('div');src.content.childNodes.forEach((c,i)=>target.append(build(c,i===0)));
 // marcas vazias não ficam guardadas
 target.querySelectorAll('b,i,u,s,code,span,mark,a').forEach(n=>{if(!n.textContent&&!n.querySelector('br'))n.remove();});
 return target.innerHTML;
}
/** Texto de um trecho do editor: <br> conta como "\n" (igual ao texto guardado). */
function textOf(node:Node):string{let out='';const walk=(n:Node)=>{if(n.nodeType===Node.TEXT_NODE){out+=n.textContent||'';return;}if(n.nodeName==='BR'){out+='\n';return;}n.childNodes.forEach(walk);};walk(node);return out;}
function offsetOf(root:HTMLElement,container:Node,offset:number):number{try{const r=document.createRange();r.selectNodeContents(root);r.setEnd(container,offset);return textOf(r.cloneContents()).length;}catch{return textOf(root).length;}}
function pointAt(root:HTMLElement,target:number):[Node,number]{
 let pos=0;let found:[Node,number]|null=null;
 const walk=(n:Node)=>{if(found)return;if(n.nodeType===Node.TEXT_NODE){const len=(n.textContent||'').length;if(target<=pos+len){found=[n,target-pos];return;}pos+=len;return;}
  if(n.nodeName==='BR'){if(target<=pos){found=[n.parentNode!,Array.prototype.indexOf.call(n.parentNode!.childNodes,n)];return;}pos+=1;if(target===pos){found=[n.parentNode!,Array.prototype.indexOf.call(n.parentNode!.childNodes,n)+1];}return;}
  n.childNodes.forEach(walk);};
 walk(root);return found||[root,root.childNodes.length];
}
let styleReady=false;
function ensureStyle(){if(styleReady||typeof document==='undefined')return;styleReady=true;const s=document.createElement('style');s.textContent=[
 '[data-rich-block]{outline:none;white-space:pre-wrap;word-break:break-word;cursor:text}',
 '[data-rich-block]:empty:before{content:attr(data-placeholder);color:var(--rich-ph,#8888);pointer-events:none}',
 '[data-rich-block] code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:85%;padding:1px 5px;border-radius:4px;background:rgba(135,131,120,.18);color:#EB5757}',
 '[data-rich-block] a{color:inherit;text-decoration:underline;text-decoration-color:rgba(160,160,160,.6);text-underline-offset:2px}',
 '[data-rich-block] b{font-weight:700}'].join('\n');document.head.appendChild(s);}
const CSS_PX=new Set(['fontSize','lineHeight','paddingTop','paddingBottom','paddingLeft','paddingRight','marginTop','marginBottom','minHeight','borderRadius','borderLeftWidth']);
function toCss(style:any):Record<string,any>{
 const flat:any={...(StyleSheet.flatten(style)||{})};
 if(flat.paddingVertical!=null){flat.paddingTop??=flat.paddingVertical;flat.paddingBottom??=flat.paddingVertical;}
 if(flat.paddingHorizontal!=null){flat.paddingLeft??=flat.paddingHorizontal;flat.paddingRight??=flat.paddingHorizontal;}
 if(flat.marginVertical!=null){flat.marginTop??=flat.marginVertical;flat.marginBottom??=flat.marginVertical;}
 const s:any=scaleStyle(flat)||flat,out:Record<string,any>={flex:'1 1 0%',minWidth:0};
 for(const k of ['fontSize','lineHeight','color','fontWeight','fontFamily','paddingTop','paddingBottom','paddingLeft','paddingRight','marginTop','marginBottom','backgroundColor','borderRadius','borderLeftWidth','borderLeftColor','minHeight','textDecorationLine']){
  const v=s[k];if(v==null||v==='')continue;if(k==='textDecorationLine'){out.textDecoration=v;continue;}out[k]=typeof v==='number'&&CSS_PX.has(k)?v+'px':v;}
 if(out.borderLeftWidth)out.borderLeftStyle='solid';
 return out;
}

export const PageRichInput=React.forwardRef<any,Props>(function PageRichInput(props,ref){
 const el=useRef<HTMLDivElement|null>(null),emitted=useRef<string|null>(null),composing=useRef(false);
 useImperativeHandle(ref,()=>el.current,[]);
 const desired=props.html?sanitizeRich(props.html):textToHtml(props.value||'');
 useLayoutEffect(()=>{ensureStyle();const node=el.current;if(!node)return;if(desired!==emitted.current&&node.innerHTML!==desired){node.innerHTML=desired;}emitted.current=desired;},[desired]);
 const attach=(node:HTMLDivElement|null)=>{el.current=node;if(!node||(node as any).__rich)return;(node as any).__rich=true;
  // o Pages.tsx conversa com o editor como se fosse o <textarea> de antes
  Object.defineProperty(node,'value',{configurable:true,get:()=>textOf(node)});
  Object.defineProperty(node,'selectionStart',{configurable:true,get:()=>{const sel=document.getSelection();if(!sel||!sel.rangeCount||!node.contains(sel.anchorNode))return textOf(node).length;const r=sel.getRangeAt(0);return offsetOf(node,r.startContainer,r.startOffset);}});
  Object.defineProperty(node,'selectionEnd',{configurable:true,get:()=>{const sel=document.getSelection();if(!sel||!sel.rangeCount||!node.contains(sel.anchorNode))return textOf(node).length;const r=sel.getRangeAt(0);return offsetOf(node,r.endContainer,r.endOffset);}});
  (node as any).setSelectionRange=(a:number,b:number)=>{const sel=document.getSelection();if(!sel)return;const r=document.createRange(),[n1,o1]=pointAt(node,a),[n2,o2]=pointAt(node,b);try{r.setStart(n1,o1);r.setEnd(n2,o2);}catch{r.selectNodeContents(node);r.collapse(false);}sel.removeAllRanges();sel.addRange(r);};
  // Enter divide o bloco: devolve o HTML antes e depois do cursor (a formatação vai junto)
  (node as any).__splitHtml=(a:number,b:number)=>{try{const [n1,o1]=pointAt(node,a),[n2,o2]=pointAt(node,b);const before=document.createRange();before.selectNodeContents(node);before.setEnd(n1,o1);const after=document.createRange();after.selectNodeContents(node);after.setStart(n2,o2);
   const wrap=(f:DocumentFragment)=>{const d=document.createElement('div');d.append(f);return sanitizeRich(d.innerHTML);};return [wrap(before.cloneContents()),wrap(after.cloneContents())];}catch{return null;}};
 };
 const emit=()=>{const node=el.current;if(!node)return;const text=textOf(node);let html=text?sanitizeRich(node.innerHTML):'';if(!text&&node.innerHTML)node.innerHTML='';
  // sem formatação nenhuma, guarda só o texto (html vazio, como antes)
  if(html===textToHtml(text))html='';emitted.current=html?html:textToHtml(text);props.onChange(text,html);};
 const css=toCss(props.style);
 return React.createElement('div',{ref:attach,contentEditable:props.editable===false?'false':'true',suppressContentEditableWarning:true,role:'textbox','aria-multiline':'true','aria-label':props.accessibilityLabel,
  'data-testid':props.testID,'data-rich-block':'1','data-placeholder':props.placeholder||'',spellCheck:true,
  style:{...css,'--rich-ph':props.placeholderColor||'#8888'},
  onInput:()=>{if(!composing.current)emit();},
  onCompositionStart:()=>{composing.current=true;},onCompositionEnd:()=>{composing.current=false;emit();},
  onKeyDown:(e:any)=>{if(composing.current||e.nativeEvent?.isComposing)return;
   const key=e.key,mod=(e.ctrlKey||e.metaKey)&&!e.altKey,low=String(key).toLowerCase();
   if(mod&&!e.shiftKey&&low==='e'){e.preventDefault();const sel=document.getSelection();const t=sel?.toString()||'';if(t)document.execCommand('insertHTML',false,'<code>'+escapeHtml(t)+'</code>');return;}
   if(mod&&e.shiftKey&&low==='s'){e.preventDefault();document.execCommand('strikeThrough');return;}
   if(mod&&['b','i','u'].includes(low))return; // negrito, itálico e sublinhado do próprio navegador
   const wrapped={key,nativeEvent:{key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey},target:el.current,preventDefault:()=>e.preventDefault(),isDefaultPrevented:()=>e.defaultPrevented};
   props.onKeyPress?.(wrapped);
   if(!e.defaultPrevented&&key==='Enter'){e.preventDefault();if(e.shiftKey)document.execCommand('insertLineBreak');}},
  onPaste:(e:any)=>{
   // 05/11/2026 (Pedro): imagem copiada colada no texto vira bloco de imagem
   if(props.onPasteImage){const items=[...(e.clipboardData?.items||[])] as any[];const it=items.find(x=>x.kind==='file'&&/^image\//.test(x.type));const f=it?.getAsFile?.();if(f){e.preventDefault();props.onPasteImage(f);return;}}
   const text=e.clipboardData?.getData('text/plain');if(!text){e.preventDefault();return;}e.preventDefault();const node=el.current!;const start=(node as any).selectionStart,end=(node as any).selectionEnd;
   if(props.onPasteText?.(text,start,end))return;
   const sel=document.getSelection();if(sel&&!sel.isCollapsed&&/^https?:\/\/\S+$/i.test(text.trim()))document.execCommand('createLink',false,text.trim());else document.execCommand('insertText',false,text);},
  onDragOver:(e:any)=>{if(props.onPasteImage&&[...(e.dataTransfer?.items||[])].some((x:any)=>x.kind==='file'))e.preventDefault();},
  onDrop:(e:any)=>{const f=[...(e.dataTransfer?.files||[])].find((x:any)=>/^image\//.test(x.type));if(f&&props.onPasteImage){e.preventDefault();props.onPasteImage(f as Blob);}},
  onFocus:props.onFocus,onBlur:props.onBlur,
 });
});
