// 0.3.267 (site, computador): linha de texto rico das Páginas, como no Notion — negrito, itálico, sublinhado, tachado,
// código, link e cor dentro do texto. É um contentEditable que se apresenta para o Pages.tsx como se fosse o <textarea>
// de antes (value, selectionStart/End, setSelectionRange, focus), para o teclado (Enter, Backspace, setas, "/")
// continuar igual. O HTML guardado passa sempre por uma lista fechada de marcas permitidas.
import {findLinks} from '../lib/leaf-document';
import {LinkHoverCard,openUrl} from './LinkHover';
import type {LinkPop} from './LinkHover';
import React,{useImperativeHandle,useLayoutEffect,useRef} from 'react';
import {StyleSheet} from 'react-native';
import {scaleStyle} from '../web/desktop-scale';

type Props={value:string;html?:string;placeholder?:string;placeholderColor?:string;style?:any;editable?:boolean;accessibilityLabel?:string;testID?:string;
 onChange:(text:string,html:string)=>void;onKeyPress?:(e:any)=>void;onFocus?:()=>void;onBlur?:()=>void;onPasteText?:(text:string,start:number,end:number,html?:string)=>boolean;onDropFiles?:(files:File[])=>void;onPasteImage?:(image:Blob)=>void;onUndo?:(redo:boolean)=>void};

const ALLOWED=new Set(['B','STRONG','I','EM','U','S','STRIKE','DEL','CODE','A','SPAN','MARK','BR']);
// 08/11/2026 (Pedro: grifo do Word sumia ao colar): o Word grifa com nome de cor (background:yellow) - nome de cor tambem vale
const SAFE_COLOR=/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent|[a-z]{3,24})$/i;
// 09/11/2026 (Pedro: "editor mais completo, com cor de texto, tamanho"): tamanho do texto so nos 4 tamanhos da barra (em, relativo ao bloco)
export const SAFE_SIZE=/^(0\.85|1\.25|1\.5|2)em$/;
/** Brilho (0 a 1) de uma cor simples (nome basico, #hex ou rgb); -1 se nao der para saber. */
export function colorTone(v:string):number{const t=String(v||'').trim().toLowerCase();if(!t||t==='transparent')return -1;if(t==='black'||t==='windowtext')return 0;if(t==='white'||t==='window')return 1;
 let r=-1,g=0,b=0;const m=t.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+%?))?/),h=t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
 if(m){if(m[4]!==undefined&&parseFloat(m[4])===0)return -1;r=+m[1];g=+m[2];b=+m[3];}else if(h){const x=h[1].length===3?h[1].split('').map(c=>c+c).join(''):h[1];r=parseInt(x.slice(0,2),16);g=parseInt(x.slice(2,4),16);b=parseInt(x.slice(4,6),16);}
 return r<0?-1:(0.299*r+0.587*g+0.114*b)/255;}
/** Letra "neutra" (quase preta ou quase branca): a cor padrao do documento de onde se copiou, nao uma cor escolhida. */
export function neutralInk(v:string){const l=colorTone(v);return l>=0&&(l<0.2||l>0.85);}
export function escapeHtml(v:string){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
export function textToHtml(v:string){return escapeHtml(v).replace(/\n/g,'<br>');}
/** Só marcas de texto conhecidas; links http/https/mailto; cor/fundo como cor simples. Div/p viram quebra de linha. */
export function sanitizeRich(html:string):string{
 if(typeof document==='undefined')return escapeHtml(html.replace(/<[^>]*>/g,''));
 const src=document.createElement('template');src.innerHTML=String(html||'');
 const build=(node:Node,first:boolean):Node=>{
  // quebra de linha dentro do texto ("\n" que o navegador poe com pre-wrap) vira <br>: uma so forma de guardar linha nova
  if(node.nodeType===Node.TEXT_NODE){const parts=String(node.textContent||'').split('\n');if(parts.length===1)return document.createTextNode(parts[0]);const f=document.createDocumentFragment();parts.forEach((t,i)=>{if(i)f.append(document.createElement('br'));if(t)f.append(document.createTextNode(t));});return f;}
  const frag=document.createDocumentFragment();
  if(node.nodeType!==Node.ELEMENT_NODE){node.childNodes.forEach(c=>frag.append(build(c,false)));return frag;}
  const el=node as HTMLElement,tag=el.tagName;
  if(tag==='DIV'||tag==='P'){if(!first)frag.append(document.createElement('br'));el.childNodes.forEach((c,i)=>frag.append(build(c,i===0)));return frag;}
  // 07/11/2026 (Pedro: "copiar o texto em bold tambem vai o bold, italico"): o que vem de outro site (e da propria Sofia)
  // marca negrito/italico/sublinhado no estilo (font-weight etc.). Vira <b>/<i>/<u>/<s>; o <b style="font-weight:normal">
  // que o Google Docs poe em volta de tudo NAO vira negrito.
  {const st=el.style,fw=String(st?.fontWeight||''),heavy=fw==='bold'||fw==='bolder'||(+fw>=600),light=fw==='normal'||fw==='lighter'||(fw!==''&&+fw<600),ital=st?.fontStyle==='italic',deco=String(st?.textDecorationLine||st?.textDecoration||'');
   if((tag==='B'||tag==='STRONG')&&light){const f2=document.createDocumentFragment();el.childNodes.forEach((c,i)=>f2.append(build(c,first&&i===0)));return f2;}
   if(tag!=='BR'&&tag!=='B'&&tag!=='STRONG'&&tag!=='I'&&tag!=='EM'&&(heavy||ital||/underline|line-through/.test(deco))){
    const inner=ALLOWED.has(tag)&&tag!=='SPAN'?null:document.createDocumentFragment();
    let wrap:HTMLElement|null=null,root:HTMLElement|null=null;const add=(t:string)=>{const n=document.createElement(t);if(wrap)wrap.append(n);else root=n;wrap=n;};
    if(heavy)add('b');if(ital)add('i');if(/underline/.test(deco))add('u');if(/line-through/.test(deco))add('s');
    if(inner&&root&&wrap){el.childNodes.forEach(c=>(wrap as HTMLElement).append(build(c,false)));const color=st.color,bg=st.backgroundColor;if((color&&SAFE_COLOR.test(color.trim()))||(bg&&SAFE_COLOR.test(bg.trim()))){const sp=document.createElement('span');if(color&&SAFE_COLOR.test(color.trim()))sp.style.color=color;if(bg&&SAFE_COLOR.test(bg.trim()))sp.style.backgroundColor=bg;sp.append(root);return sp;}return root;}
   }}
  if(!ALLOWED.has(tag)){el.childNodes.forEach((c,i)=>frag.append(build(c,first&&i===0)));return frag;}
  const out=document.createElement(tag==='STRONG'?'b':tag==='EM'?'i':tag==='STRIKE'||tag==='DEL'?'s':tag.toLowerCase());
  if(tag==='A'){const href=String(el.getAttribute('href')||'');if(/^(https?:|mailto:)/i.test(href)){out.setAttribute('href',href);out.setAttribute('target','_blank');out.setAttribute('rel','noopener noreferrer');}}
  if(tag!=='BR'){const color=el.style.color,bg=el.style.backgroundColor;if(color&&SAFE_COLOR.test(color.trim()))(out as HTMLElement).style.color=color;if(bg&&SAFE_COLOR.test(bg.trim()))(out as HTMLElement).style.backgroundColor=bg;}
  if(tag==='SPAN'){const fs=String(el.style.fontSize||'').trim();if(SAFE_SIZE.test(fs))(out as HTMLElement).style.fontSize=fs;}
  el.childNodes.forEach(c=>out.append(build(c,false)));return out;
 };
 const target=document.createElement('div');src.content.childNodes.forEach((c,i)=>target.append(build(c,i===0)));
 // marcas vazias não ficam guardadas
 target.querySelectorAll('b,i,u,s,code,span,mark,a').forEach(n=>{if(!n.textContent&&!n.querySelector('br'))n.remove();});
 return target.innerHTML;
}
/** HTML colado: so o trecho copiado (entre os marcadores do navegador), limpo pela mesma lista de marcas. */
/** Cor de fundo (a primeira nao transparente subindo pela tela) e cor do texto de onde se cola. */
export function pasteContext(el:HTMLElement|null):{bg?:string;color?:string}{
 if(typeof getComputedStyle==='undefined'||!el)return {};let bg='';for(let p:HTMLElement|null=el;p;p=p.parentElement){const b=getComputedStyle(p).backgroundColor;if(b&&b!=='transparent'&&!/rgba\(.*,\s*0\)$/.test(b)){bg=b;break;}}
 if(!bg)bg=getComputedStyle(document.body).backgroundColor;return {bg,color:getComputedStyle(el).color};
}
export function pasteHtml(html:string,ctx?:{bg?:string;color?:string}):string{
 const m=/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/.exec(html);let body=m?m[1]:html.replace(/^[\s\S]*?<body[^>]*>/i,'').replace(/<\/body>[\s\S]*$/i,'');
 body=body.replace(/<(style|script|meta|title|head)[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<meta[^>]*>/gi,'');
 // 08/11/2026 (Pedro: "colei e os links e grifados sairam"): no HTML de outro programa (Word, sites) a quebra de linha DENTRO do
 // codigo e so espaco (o Word quebra o codigo no meio da frase). Ela virava linha nova, a linha deixava de bater com o texto e
 // perdia link e grifo. So texto com white-space:pre (ou <pre>) guarda a quebra.
 if(typeof document!=='undefined'){const t=document.createElement('template');t.innerHTML=body;
  const keep=(n:Node)=>{for(let p=n.parentElement;p;p=p.parentElement){if(p.tagName==='PRE'||/pre/.test(String(p.style?.whiteSpace||'')))return true;}return false;};
  const walk=document.createTreeWalker(t.content,NodeFilter.SHOW_TEXT);const texts:Text[]=[];while(walk.nextNode())texts.push(walk.currentNode as Text);
  for(const n of texts)if(/[\r\n]/.test(n.data)&&!keep(n))n.data=n.data.replace(/[ \t]*[\r\n]+[ \t]*/g,' ');
  // 08/11/2026: copiando de dentro de uma pagina (da Sofia ou de outro site), o navegador grava em cada pedaco a cor de FUNDO da
  // pagina e a cor do TEXTO. Colando, virava um grifo falso e letra de cor fixa (some ao trocar o tema). Iguais as da pagina onde
  // se cola: saem. Grifo de verdade (outra cor de fundo) continua.
  if(ctx){const same=(a:string,b?:string)=>!!b&&a.replace(/\s/g,'')===b.replace(/\s/g,'');
   t.content.querySelectorAll('[style]').forEach(n=>{const st=(n as HTMLElement).style;if(st.backgroundColor&&same(st.backgroundColor,ctx.bg))st.backgroundColor='';if(st.color&&same(st.color,ctx.color))st.color='';});}
  // 09/11/2026 (print do Pedro: trechos colados com fundo branco e letra preta): o "papel" do documento de origem (fundo quase branco,
  // letra quase preta/branca) tambem sai - virava um retangulo branco na pagina escura. Grifo colorido de verdade (amarelo etc.) fica
  t.content.querySelectorAll('[style]').forEach(n=>{const st=(n as HTMLElement).style;if(st.backgroundColor&&colorTone(st.backgroundColor)>0.92)st.backgroundColor='';if(st.color&&neutralInk(st.color))st.color='';});
  body=t.innerHTML;}
 return sanitizeRich(body).replace(/^(<br>)+|(<br>)+$/g,'');
}
/** Linhas do HTML limpo (separadas por <br>), para colar varias linhas mantendo a formatacao de cada uma. */
export function htmlLines(html:string):string[]{return String(html||'').split(/<br\s*\/?>/i);}
/** Texto de um trecho do editor: <br> conta como "\n" (igual ao texto guardado). */
function textOf(node:Node):string{let out='';const walk=(n:Node)=>{if(n.nodeType===Node.TEXT_NODE){out+=n.textContent||'';return;}if(n.nodeName==='BR'){if((n as any).dataset?.fill)return;out+='\n';return;}n.childNodes.forEach(walk);};walk(node);return out;}
// 06/11/2026 (Pedro: "Shift+Enter nao ta quebrando linha"): no fim do texto o navegador so mostra a linha nova se houver
// algo depois do ultimo <br>. Um <br data-fill> extra (fora do texto salvo) segura essa linha vazia na tela.
function ensureFill(node:HTMLElement){node.querySelectorAll('br[data-fill]').forEach(b=>b.remove());if(!textOf(node).endsWith('\n'))return;const f=document.createElement('br');f.setAttribute('data-fill','1');node.appendChild(f);}
const noFill=(html:string)=>html.replace(/<br data-fill="1">/g,'');
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
 '[data-rich-block] b{font-weight:700}',
 // 05/11/2026 (Pedro: imagem de outro site aparecendo por cima do Inicio e da Agenda): conteudo arrastado de outra pagina
 // entrava no texto com o estilo original (posicao fixa, sempre visivel). Nada dentro do texto pode sair do lugar.
 '[data-rich-block] *{position:static!important;visibility:inherit!important;transform:none!important;max-width:100%}',
 '[data-rich-block] img,[data-rich-block] svg,[data-rich-block] video,[data-rich-block] iframe{display:none!important}'].join('\n');document.head.appendChild(s);}
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
 // 05/11/2026 (Pedro: links como no Notion): colar um endereco ja vira link; passar o mouse mostra Copiar / Remover link
 const [pop,setPop]=React.useState<LinkPop>(null),popA=useRef<HTMLAnchorElement|null>(null),popTimer=useRef<any>(null);
 const popKeep=()=>{if(popTimer.current)clearTimeout(popTimer.current);popTimer.current=null;};
 const popLeave=()=>{popKeep();popTimer.current=setTimeout(()=>setPop(null),220);};
 useImperativeHandle(ref,()=>el.current,[]);
 const desired=props.html?sanitizeRich(props.html):textToHtml(props.value||'');
 useLayoutEffect(()=>{ensureStyle();const node=el.current;if(!node)return;if(desired!==emitted.current&&noFill(node.innerHTML)!==desired){node.innerHTML=desired;ensureFill(node);}emitted.current=desired;},[desired]);
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
 const emit=()=>{const node=el.current;if(!node)return;const text=textOf(node);let html=text?sanitizeRich(noFill(node.innerHTML)):'';if(!text&&node.innerHTML)node.innerHTML='';
  // sem formatação nenhuma, guarda só o texto (html vazio, como antes)
  if(html===textToHtml(text))html='';emitted.current=html?html:textToHtml(text);
  if(text&&node.querySelector('img,svg,video,iframe,div,p,[style*="position"],[class]')){const a=(node as any).selectionStart,b=(node as any).selectionEnd;node.innerHTML=emitted.current;try{if(document.activeElement===node)(node as any).setSelectionRange(a,b);}catch{}}
  ensureFill(node);props.onChange(text,html);};
 const css=toCss(props.style);
 const removeLink=()=>{const a=popA.current,node=el.current;if(!a||!node||!node.contains(a))return;const parent=a.parentNode!;while(a.firstChild)parent.insertBefore(a.firstChild,a);parent.removeChild(a);popA.current=null;emit();};
 return React.createElement(React.Fragment,null,React.createElement('div',{ref:attach,contentEditable:props.editable===false?'false':'true',suppressContentEditableWarning:true,role:'textbox','aria-multiline':'true','aria-label':props.accessibilityLabel,
  'data-testid':props.testID,'data-rich-block':'1','data-placeholder':props.placeholder||'',spellCheck:true,
  style:{...css,'--rich-ph':props.placeholderColor||'#8888'},
  onInput:()=>{if(!composing.current)emit();},
  onCompositionStart:()=>{composing.current=true;},onCompositionEnd:()=>{composing.current=false;emit();},
  onKeyDown:(e:any)=>{if(composing.current||e.nativeEvent?.isComposing)return;
   const key=e.key,mod=(e.ctrlKey||e.metaKey)&&!e.altKey,low=String(key).toLowerCase();
   if(mod&&!e.shiftKey&&low==='e'){e.preventDefault();const sel=document.getSelection();const t=sel?.toString()||'';if(t)document.execCommand('insertHTML',false,'<code>'+escapeHtml(t)+'</code>');return;}
   // 06/11/2026 (Pedro: "Ctrl+Z na pagina nao ta indo"): o desfazer do navegador se perde (o editor regrava o texto); usa o desfazer da pagina
   if(mod&&props.onUndo&&(low==='z'||low==='y')){e.preventDefault();props.onUndo(low==='y'||e.shiftKey);return;}
   if(mod&&e.shiftKey&&low==='s'){e.preventDefault();document.execCommand('strikeThrough');return;}
   if(mod&&['b','i','u'].includes(low))return; // negrito, itálico e sublinhado do próprio navegador
   const wrapped={key,nativeEvent:{key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey},target:el.current,preventDefault:()=>e.preventDefault(),isDefaultPrevented:()=>e.defaultPrevented};
   props.onKeyPress?.(wrapped);
   if(!e.defaultPrevented&&key==='Enter'){e.preventDefault();if(e.shiftKey){const node=el.current,sel=document.getSelection();if(node&&sel&&sel.rangeCount){const r=sel.getRangeAt(0);r.deleteContents();const br=document.createElement('br');r.insertNode(br);ensureFill(node);const after=document.createRange();after.setStartAfter(br);after.collapse(true);sel.removeAllRanges();sel.addRange(after);emit();}}}},
  onPaste:(e:any)=>{
   // 05/11/2026 (Pedro): imagem copiada colada no texto vira bloco de imagem
   if(props.onPasteImage){const items=[...(e.clipboardData?.items||[])] as any[];const it=items.find(x=>x.kind==='file'&&/^image\//.test(x.type));const f=it?.getAsFile?.();if(f){e.preventDefault();props.onPasteImage(f);return;}}
   // 07/11/2026 (Pedro: colar qualquer tipo de item): arquivo copiado no computador (PDF, Word...) vira bloco de arquivo
   if(props.onDropFiles){const fl=[...(e.clipboardData?.files||[])] as File[];if(fl.length&&!e.clipboardData?.getData('text/plain')){e.preventDefault();props.onDropFiles(fl);return;}}
   const text=e.clipboardData?.getData('text/plain');if(!text){e.preventDefault();return;}e.preventDefault();const node=el.current!;const start=(node as any).selectionStart,end=(node as any).selectionEnd;
   const rawHtml=e.clipboardData?.getData('text/html')||'',rich=rawHtml?pasteHtml(rawHtml,pasteContext(node as any)):'';
   if(props.onPasteText?.(text,start,end,rich||undefined))return;
   // uma linha com formatacao (negrito, italico, cor, link): entra com a formatacao
   if(rich&&!text.includes('\n')&&/<(b|i|u|s|code|mark|a|span)\b/i.test(rich)){document.execCommand('insertHTML',false,rich);return;}
   const sel=document.getSelection();if(sel&&!sel.isCollapsed&&/^https?:\/\/\S+$/i.test(text.trim())){document.execCommand('createLink',false,text.trim());return;}
   const links=findLinks(text);if(!links.length){document.execCommand('insertText',false,text);return;}
   let html='',at=0;for(const l of links){html+=escapeHtml(text.slice(at,l.start))+'<a href="'+escapeHtml(l.url)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(l.url)+'</a>';at=l.end;}
   html+=escapeHtml(text.slice(at));document.execCommand('insertHTML',false,html.replace(/\n/g,'<br>'));},
  onMouseOver:(e:any)=>{const a=(e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement|null;if(!a||!el.current?.contains(a))return;popKeep();if(popA.current===a&&pop)return;popA.current=a;const r=a.getBoundingClientRect();setPop({url:a.getAttribute('href')||'',x:r.left,y:r.bottom});},
  onMouseOut:(e:any)=>{const a=(e.target as HTMLElement)?.closest?.('a[href]');if(a)popLeave();},
  onClick:(e:any)=>{const a=(e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement|null;if(!a||!el.current?.contains(a))return;const sel=document.getSelection();if(sel&&!sel.isCollapsed)return;e.preventDefault();openUrl(a.getAttribute('href')||'');},
  onDragOver:(e:any)=>{if((props.onPasteImage||props.onDropFiles)&&[...(e.dataTransfer?.items||[])].some((x:any)=>x.kind==='file'))e.preventDefault();},
  onDrop:(e:any)=>{const all=[...(e.dataTransfer?.files||[])] as File[];if(all.length&&props.onDropFiles){e.preventDefault();props.onDropFiles(all);return;} /* 07/11/2026: qualquer arquivo vira bloco de arquivo */
   const f=all.find((x:any)=>/^image\//.test(x.type));if(f&&props.onPasteImage){e.preventDefault();props.onPasteImage(f as Blob);return;}
   // arrastar algo de outro site: entra so o texto (com os links), nunca o HTML com o estilo de la
   const dt=e.dataTransfer;if(!dt||(dt.files&&dt.files.length))return;const text=dt.getData('text/plain')||dt.getData('text/uri-list')||'';e.preventDefault();if(!text.trim())return;
   const d:any=document;const pos=d.caretRangeFromPoint?.(e.clientX,e.clientY);if(pos){const sel=document.getSelection();sel?.removeAllRanges();sel?.addRange(pos);}
   const links=findLinks(text);if(!links.length){document.execCommand('insertText',false,text);return;}let html='',at=0;for(const l of links){html+=escapeHtml(text.slice(at,l.start))+'<a href="'+escapeHtml(l.url)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(l.url)+'</a>';at=l.end;}document.execCommand('insertHTML',false,(html+escapeHtml(text.slice(at))).replace(/\n/g,'<br>'));},
  onFocus:props.onFocus,onBlur:props.onBlur,
 }),React.createElement(LinkHoverCard,{pop,onEnter:popKeep,onLeave:popLeave,onClose:()=>setPop(null),onRemove:removeLink}));
});
