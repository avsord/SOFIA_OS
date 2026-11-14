// 14/11/2026 (Pedro: "em todos os lugares do site a correção de texto tem que ser o layout da Sofia - generalizar"):
// clique direito em qualquer campo de texto (Notas, Quadro, buscas, formulários) abre o menu da Sofia com a correção da
// palavra no topo e Recortar/Copiar/Colar; o menu do navegador não aparece (Shift + clique direito ainda abre o dele).
// As Páginas têm o mesmo recurso na barra de formatação delas (Pages.tsx), por isso ficam de fora daqui.
import {openContextMenu,type MenuItem} from '../components/ContextMenu';
import {TRAIL,TEXT_INPUT,cleanWord,isWord,wordAt} from './web-spell-word';
type Spell={spell:(w:string,ctx:string)=>Promise<{suggestions:string[]}>};
export function installSpellMenu(api:Spell,doc:any=typeof document!=='undefined'?document:undefined):()=>void{
 if(!doc)return()=>{};
 const on=(e:any)=>{
  if(e.defaultPrevented||e.shiftKey)return;const t:any=e.target;if(!t?.closest)return;
  if(t.closest('[data-testid^="page-rich-"]'))return;
  const field:any=t.closest('textarea,input')||t.closest('[contenteditable="true"],[contenteditable=""]');if(!field)return;
  const plain=field.tagName==='TEXTAREA'||field.tagName==='INPUT';
  if(field.tagName==='INPUT'&&!TEXT_INPUT.test(String(field.type||'').toLowerCase()))return;
  if(field.readOnly||field.disabled)return;
  e.preventDefault();field.focus?.();
  let word='',context='',restore:()=>void;
  if(plain){
   const v=String(field.value||''),s0=field.selectionStart??0,s1=field.selectionEnd??s0;
   let a=s0,z=s1;if(a===z)[a,z]=wordAt(v,a);
   const raw=v.slice(a,z);word=cleanWord(raw);z=a+raw.length-(raw.length-raw.trimEnd().replace(TRAIL,'').length);
   try{field.setSelectionRange(a,z);}catch{}
   context=v.slice(Math.max(0,a-150),z+150);
   restore=()=>{field.focus();try{field.setSelectionRange(a,z);}catch{}};
  }else{
   const sel=doc.getSelection?.();if(!sel)return;
   if(sel.isCollapsed||!sel.rangeCount||!field.contains(sel.anchorNode)){
    const pos=doc.caretRangeFromPoint?.(e.clientX,e.clientY);if(pos){sel.removeAllRanges();sel.addRange(pos);}
    sel.modify?.('move','backward','word');sel.modify?.('extend','forward','word');}
   const raw=sel.toString();word=cleanWord(raw);
   if(sel.rangeCount&&raw.length!==raw.trimEnd().replace(TRAIL,'').length){const r=sel.getRangeAt(0);const cut=raw.length-raw.trimEnd().replace(TRAIL,'').length;
    try{r.setEnd(r.endContainer,Math.max(r.startOffset,r.endOffset-cut));sel.removeAllRanges();sel.addRange(r);}catch{}}
   const saved=sel.rangeCount?sel.getRangeAt(0).cloneRange():null;context=String(field.textContent||'').slice(0,300);
   restore=()=>{field.focus();if(saved){const s=doc.getSelection();s.removeAllRanges();s.addRange(saved);}};
  }
  const x=e.clientX,y=e.clientY,run=(f:()=>void)=>()=>{restore();f();};
  const edit:MenuItem[]=[{label:'Recortar',icon:'edit',run:run(()=>doc.execCommand('cut'))},{label:'Copiar',icon:'copy',run:run(()=>doc.execCommand('copy'))},
   {label:'Colar',icon:'note',run:run(()=>{void navigator.clipboard?.readText?.().then(txt=>{restore();if(txt)doc.execCommand('insertText',false,txt);}).catch(()=>{});})}];
  if(!isWord(word)){openContextMenu(x,y,edit);return;}
  openContextMenu(x,y,[{label:'Procurando correção…',icon:'search',run:()=>{}},...edit]);
  const mine=++seq;
  api.spell(word,context).then(r=>{if(mine!==seq)return;const list=(r?.suggestions||[]).slice(0,4);
   openContextMenu(x,y,[...(list.length?list.map((s):MenuItem=>({label:s,icon:'check',run:run(()=>doc.execCommand('insertText',false,s))})):[{label:'Escrita certa',icon:'check',run:()=>{}} as MenuItem]),...edit]);})
   .catch(()=>{});
 };
 let seq=0;doc.addEventListener('contextmenu',on);return()=>doc.removeEventListener('contextmenu',on);
}
