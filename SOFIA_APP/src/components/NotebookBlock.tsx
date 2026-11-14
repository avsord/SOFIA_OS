import {MotionModal} from './MotionModal';
import {tap,useDesktop} from '../lib/desktop';
import {applyLeafPatch} from '../lib/leaf-document';
import {KeyboardViewport} from './KeyboardViewport';
import {LeafEditor} from './LeafEditor';
import type {Leaf} from '../lib/leaf-document';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Animated,PanResponder,Platform,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../lib/theme';
import {Button,IconButton} from './UI';
import {Sheet} from './Sheet';
import {appAlert} from '../lib/app-alert';
import {fuzzyScore} from '../lib/fuzzy';
import {contextMenu,openContextMenu} from './ContextMenu';
import type {MenuItem} from './ContextMenu';
import {Icon} from './Icon';
import {useHoverKey} from '../lib/hover-hold';
import {NOTE_DRAG_TYPE,ROOT_BOOK,addLooseNote,applyDrop,hitTarget,registerLiveNotes,takeOpenNote} from '../lib/notes-move';
import type {NoteBook,NoteDragItem,NoteRect} from '../lib/notes-move';
import {pushEsc,ESC_LEVEL} from '../lib/esc-stack';
import {useWebBackDepth} from '../lib/web-panels';
import {hasShortcut,listenOpenShortcut,listenShortcutColor,publishShortcuts,hasSubShortcut,toggleSubShortcut,resolveShortcuts,setShortcutColor,toggleShortcut} from '../lib/note-shortcuts';

/** 0.3.201: Notas reestruturadas - pastas em cartoes, notas com previa e data, busca que acha com letra
 * errada, e acoes claras. Os dados continuam no mesmo formato (nenhuma nota antiga se perde). */
/** 0.3.228: parent = pasta-mae (pastas dentro de pastas); root = notas fora de pastas (nao aparece como pasta). */
type Book=NoteBook;
type DragItem=NoteDragItem;
type Dated=Leaf&{updated_at?:string};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
/** 13/11/2026 (Pedro: "arrastar nao funciona"): no computador (mouse) o arrastar usa o do navegador - funciona dentro das
 * Notas e leva a nota para outra pagina pela barra lateral (tipo application/x-sofia-note). No toque continua o
 * segurar-e-arrastar (PanResponder). */
type DomH=Partial<Record<'dragstart'|'dragend'|'dragover'|'dragleave'|'drop',(e:any)=>void>>&{draggable?:boolean};
const domH=new WeakMap<any,DomH>();
function bindDom(el:any,h:DomH){
 if(!el||typeof el.addEventListener!=='function'||typeof el.setAttribute!=='function')return;const first=!domH.has(el);domH.set(el,h);
 if(h.draggable!==undefined)el.setAttribute('draggable',h.draggable?'true':'false');
 if(first)for(const ev of ['dragstart','dragend','dragover','dragleave','drop'] as const)el.addEventListener(ev,(e:any)=>domH.get(el)?.[ev]?.(e));
}
/** 13/11/2026 (Pedro: "animacao da nota arrastando com in e out"): a nota/pasta levantada encolhe e esmaece suave, a que
 * caiu no lugar novo entra com um fade curto, a lixeira sobe de baixo. CSS so do site (no celular nada muda). */
if(Platform?.OS==='web'&&typeof document!=='undefined'&&!document.getElementById('sofia-notes-motion')){try{const st=document.createElement('style');st.id='sofia-notes-motion';
 st.textContent='[data-notes-item]{transition:opacity .16s ease,transform .16s ease}[data-notes-lifted="1"]{opacity:.35;transform:scale(.97)}'+
  '[data-notes-landed="1"]{animation:sofiaNoteIn .32s cubic-bezier(.2,0,0,1)}@keyframes sofiaNoteIn{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}'+
  '[data-notes-trash]{animation:sofiaTrashIn .2s cubic-bezier(.2,0,0,1)}@keyframes sofiaTrashIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}'+
  '@media (prefers-reduced-motion:reduce){[data-notes-item],[data-notes-landed="1"],[data-notes-trash]{transition:none;animation:none}}';document.head.appendChild(st);}catch{/* sem animacao */}}
const EMOJIS=['📁','📂','🗂️','📒','📓','📔','📕','📗','📘','📙','📝','✏️','📌','⭐','💼','🏠','💡','🎬','📸','🎨','✈️','💰','❤️','📚','🎵','🧠','🛒','🏋️','🍳','🎯','🚀','🌱'];
export function leafPreview(p:Leaf):string{
 const fromBlocks=(p.blocks||[]).map(b=>(b.checked===true?'✓ ':b.type==='todo'||b.type==='check'?'☐ ':'')+String(b.text||'')).filter(Boolean).join(' · ');
 return (fromBlocks||String(p.content||'')).replace(/\s+/g,' ').trim();
}
export function leafStamp(p:Dated):string{
 const at=p.updated_at||p.created_at;if(!at)return '';
 const d=new Date(at),now=new Date();if(!Number.isFinite(d.getTime()))return '';
 const same=d.toDateString()===now.toDateString(),yest=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1).toDateString()===d.toDateString();
 return same?'hoje, '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):yest?'ontem':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
}
const stampOf=(p:Leaf)=>String((p as Dated).updated_at||p.created_at||'');
const lastEdited=(b:Book)=>[...b.pages].sort((x,y)=>stampOf(y).localeCompare(stampOf(x)))[0];

export function NotebookBlock({data,onChange,onDelete,onInteractionChange,pageId}:{data:Record<string,any>;onChange:(data:Record<string,any>,group?:string)=>void;onDelete?:()=>void;onInteractionChange?:(active:boolean)=>void;pageId?:string}){
 const [gridW,setGridW]=useState(0);
 const leafTitle=useRef<TextInput>(null);
 const c=useTheme(),books:Book[]=Array.isArray(data.notebooks)?data.notebooks:(data.rows||[]).map((r:any)=>({id:r.id,name:String(r.values?.name||''),emoji:'',expanded:false,pages:r.page_content?[{id:r.id+'-leaf',title:'',content:r.page_content}]:[]}));
 const [openBook,setOpenBook]=useState<string|null>(null),[query,setQuery]=useState(''),[title,setTitle]=useState(String(data.title||'Notas'));
 const [editingBook,setEditingBook]=useState<string|null>(null),[bookId,setBookId]=useState<string|null>(null),[leafId,setLeafId]=useState<string|null>(null),[newName,setNewName]=useState(''),[create,setCreate]=useState(false),[emojiBook,setEmojiBook]=useState<string|null>(null),[emoji,setEmoji]=useState(''),[moving,setMoving]=useState(false),[menu,setMenu]=useState(false),[menuNote,setMenuNote]=useState<{book:string;leaf:string}|null>(null),[folderMenu,setFolderMenu]=useState<string|null>(null),[blockMenu,setBlockMenu]=useState(false);
 const book=books.find(b=>b.id===bookId),leaf=book?.pages.find(p=>p.id===leafId),opened=books.find(b=>b.id===openBook)||null;
 const total=books.reduce((s,b)=>s+b.pages.length,0);
 const noteHover=useHoverKey();
 // 0.3.228: pastas dentro de pastas e arrastar notas/pastas para dentro ou para fora
 const exists=(id?:string)=>!!id&&books.some(b=>b.id===id&&!b.root);
 const parentOf=(b:Book)=>exists(b.parent)?b.parent!:'';
 const foldersIn=(pid:string)=>books.filter(b=>!b.root&&parentOf(b)===pid);
 const rootNotes=books.find(b=>b.id===ROOT_BOOK)?.pages||[];
 const booksRef=useRef(books);booksRef.current=books;const openedRef=useRef(opened);openedRef.current=opened;
 // 13/11/2026 (ESC volta um nível): nota aberta -> pasta/lista (item); dentro de pasta -> pasta de cima/raiz das notas (section); na raiz o Esc segue para a página mãe.
 useEffect(()=>leaf?pushEsc(()=>{setLeafId(null);setBookId(null);},ESC_LEVEL.item):undefined,[!!leaf]);
 useEffect(()=>opened?pushEsc(()=>{const o=openedRef.current;if(!o)return false;setOpenBook(!o.root?(parentOf(o)||null):null);},ESC_LEVEL.section):undefined,[!!opened]);
 // 13/11/2026 (Pedro: "quando apertar voltar, nas anotacoes vai voltando"): cada pasta aberta e um passo do voltar do navegador
 const depthOf=(b:Book|null)=>{if(!b)return 0;if(b.root)return 1;let d=1,cur:Book|undefined=b,g=0;while(cur&&g++<50){const up=parentOf(cur);if(!up)break;d++;cur=books.find(x=>x.id===up);}return d;};
 useWebBackDepth(depthOf(opened),()=>{const o=openedRef.current;if(!o)return;setOpenBook(!o.root?(parentOf(o)||null):null);});
 const dataRef=useRef(data);dataRef.current=data;const onChangeRef=useRef(onChange);onChangeRef.current=onChange;
 const desktop=useDesktop(),mouse=desktop&&Platform?.OS==='web',[landed,setLanded]=useState<string|null>(null);
 useEffect(()=>{if(!landed)return;const t=setTimeout(()=>setLanded(null),420);return()=>clearTimeout(t);},[landed]);
 const dragRef=useRef<DragItem|null>(null),[drag,setDrag]=useState<DragItem|null>(null),[hover,setHover]=useState<string|null>(null),hoverRef=useRef<string|null>(null),webDrag=useRef(false);
 const ghost=useRef(new Animated.ValueXY({x:0,y:0})).current,rootRef=useRef<View|null>(null),rootPos=useRef({x:0,y:0}),targets=useRef<Record<string,View|null>>({}),rects=useRef<NoteRect[]>([]),moved=useRef(false),captured=useRef(false),startPt=useRef({x:0,y:0});
 // a regra de qual alvo esta embaixo (r.id.startsWith('note:') = reordenar notas) fica em lib/notes-move.ts (hitTarget)
 function hit(x:number,y:number){return hitTarget(rects.current,dragRef.current,x,y);}
 function startDrag(item:DragItem,e:{nativeEvent:{pageX:number;pageY:number}}){
  dragRef.current=item;moved.current=false;captured.current=false;startPt.current={x:e.nativeEvent.pageX,y:e.nativeEvent.pageY};hoverRef.current=null;setHover(null);setDrag(item);onInteractionChange?.(true);
  rects.current=[];rootRef.current?.measureInWindow((x,y)=>{rootPos.current={x,y};ghost.setValue({x:startPt.current.x-x-60,y:startPt.current.y-y-22});});
 }
 // mede as pastas-alvo DEPOIS que a tela se redesenhou com o item levantado (nao por tempo fixo)
 useEffect(()=>{if(!drag)return;rects.current=[];Object.entries(targets.current).forEach(([id,v])=>v?.measureInWindow((x,y,w,h)=>{rects.current.push({id,x,y,w,h});}));},[drag]);
 function endDrag(drop:boolean){
  const item=dragRef.current,target=hoverRef.current,didMove=moved.current,wasWeb=webDrag.current;dragRef.current=null;hoverRef.current=null;webDrag.current=false;setDrag(null);setHover(null);if(!wasWeb)onInteractionChange?.(false);
  if(drop&&item&&target&&didMove)moveItem(item,target);
 }
 /** Reordenar, entrar na pasta, sair dela: regras em lib/notes-move.ts (applyDrop); a ordem nova fica gravada na pagina. */
 function moveItem(item:DragItem,target:string){
  if(target==='__trash__'){if(item.kind==='note')deleteNote(item.from,item.id);else removeBook(item.id);return;}
  const r=applyDrop(booksRef.current,item,target,openedRef.current?.id||null);
  if(r.error){appAlert('Não dá para mover',r.error);return;}
  if(r.books){commitBooks(r.books,'notebook-move');setLanded(item.id);}
 }
 // ---- arrastar do navegador (mouse): mesmo resultado do arrastar por toque, e a nota pode ir para outra pagina ----
 function htmlStart(item:DragItem,e:any,note?:Leaf){
  e?.stopPropagation?.();const dt=e?.dataTransfer;
  try{if(dt){dt.effectAllowed='move';if(note)dt.setData(NOTE_DRAG_TYPE,JSON.stringify({noteId:note.id,fromPageId:pageId||'',title:note.title||'Sem título'}));else dt.setData('application/x-sofia-notes-folder',item.id);}}catch{/* navegador sem dataTransfer */}
  if(dragRef.current&&!webDrag.current)onInteractionChange?.(false);// o segurar ja tinha comecado: o do navegador assume
  dragRef.current=item;webDrag.current=true;moved.current=true;hoverRef.current=null;
  // redesenhar DENTRO do dragstart cancela o arrastar no Chrome: marca o item levantado logo depois
  setTimeout(()=>{if(dragRef.current===item){setDrag(item);setHover(null);}},0);
 }
 function liveRects():NoteRect[]{const out:NoteRect[]=[];for(const [id,el] of Object.entries(targets.current)){const r=(el as any)?.getBoundingClientRect?.();if(r&&r.width&&r.height)out.push({id,x:r.left,y:r.top,w:r.width,h:r.height});}return out;}
 function htmlOver(e:any){
  const item=dragRef.current;if(!item||!webDrag.current)return;e.preventDefault();e.stopPropagation?.();if(e.dataTransfer)e.dataTransfer.dropEffect='move';
  const t=hitTarget(liveRects(),item,e.clientX,e.clientY);if(t!==hoverRef.current){hoverRef.current=t;setHover(t);}
 }
 function htmlLeave(e:any){const root:any=rootRef.current;if(root?.contains&&e?.relatedTarget&&root.contains(e.relatedTarget))return;if(hoverRef.current){hoverRef.current=null;setHover(null);}}
 function htmlDrop(e:any){const item=dragRef.current;if(!item||!webDrag.current)return;e.preventDefault();e.stopPropagation?.();hoverRef.current=hitTarget(liveRects(),item,e.clientX,e.clientY);endDrag(true);}
 function htmlEnd(){if(webDrag.current)endDrag(false);}
 const dragProps=(item:DragItem,note?:Leaf):DomH=>({draggable:true,dragstart:e=>htmlStart(item,e,note),dragend:htmlEnd});
 // o detector e criado uma vez: chama SEMPRE a versao atual (com as pastas e notas de agora), nunca uma copia antiga
 const endRef=useRef(endDrag);endRef.current=endDrag;
 const pan=useMemo(()=>PanResponder.create({
  onStartShouldSetPanResponder:()=>false,
  onMoveShouldSetPanResponderCapture:()=>{if(dragRef.current){captured.current=true;return true;}return false;},
  onMoveShouldSetPanResponder:()=>!!dragRef.current,
  onPanResponderTerminationRequest:()=>false,
  onPanResponderMove:e=>{const {pageX,pageY}=e.nativeEvent;if(Math.abs(pageX-startPt.current.x)+Math.abs(pageY-startPt.current.y)>8)moved.current=true;
   ghost.setValue({x:pageX-rootPos.current.x-60,y:pageY-rootPos.current.y-22});const t=hit(pageX,pageY);if(t!==hoverRef.current){hoverRef.current=t;setHover(t);}},
  onPanResponderRelease:()=>endRef.current(true),
  // 13/11/2026 (Pedro: "tenho que arrastar duas vezes"): quando o arrastar do navegador assume, o navegador cancela o toque;
  // antes esse cancelamento apagava o arrastar e o 1o soltar nao fazia nada
  onPanResponderTerminate:()=>{if(!webDrag.current)endRef.current(false);},
 }),[]);// eslint-disable-line react-hooks/exhaustive-deps
 /** 0.3.229: soltou sem arrastar -> so cancela (sem menu). Quando o arrastar pega o dedo, o Android avisa o cartao que
  * ele perdeu o toque; antes isso era lido como "soltou" e cancelava o arrastar abrindo Renomear. */
 function pressOut(){if(dragRef.current&&!captured.current&&!moved.current)endDrag(false);}
 function commitBooks(next:Book[],group='notebooks'){onChangeRef.current({...dataRef.current,mode:'notebooks',notebooks:next},group);}
 function update(fn:(next:Book[])=>void,group='notebooks'){const next=clone(booksRef.current);fn(next);commitBooks(next,group);}
 /** 13/11/2026 (Pedro): ＋ Nota cria a nota SOLTA na lista que esta aberta (raiz ou pasta). Antes criava a pasta "Geral". */
 function addLeaf(id?:string){
  const p={id:uid(),title:'',content:'',created_at:new Date().toISOString()};
  const r=addLooseNote(booksRef.current,id||(opened&&!opened.root?opened.id:null),p);commitBooks(r.books);
  setBookId(r.bookId);setLeafId(p.id);
 }
 // a pagina aberta avisa que tem estas Notas: arrastar uma nota para outra pagina pela barra lateral usa o rascunho vivo
 const liveRef=useRef({find:(_id:string):Leaf|null=>null,remove:(_id:string)=>{},addLoose:(_n:Leaf)=>{}});
 liveRef.current={
  find:id=>{for(const b of booksRef.current){const p=b.pages.find(x=>x.id===id);if(p)return clone(p);}return null;},
  remove:id=>{update(next=>{for(const b of next)b.pages=b.pages.filter(x=>x.id!==id);},'notebook-move-out');if(leafId===id){setLeafId(null);setBookId(null);}},
  addLoose:n=>commitBooks(addLooseNote(booksRef.current,null,n).books,'notebook-move-in'),
 };
 // 13/11/2026: "Notas editadas recentemente" (tela Paginas) abre a pagina ja com a nota aberta
 // 14/11/2026 (Pedro): atalho de nota/pasta (subpagina na barra lateral) - publica a lista e abre o que o atalho pede
 const shortcutOwner=useRef({}).current;
 useEffect(()=>{if(pageId)publishShortcuts(pageId,shortcutOwner,resolveShortcuts(data));},[pageId,data,shortcutOwner]);
 useEffect(()=>listenOpenShortcut(pageId,r=>{if(r.kind==='folder'){if(booksRef.current.some(b=>b.id===r.id&&!b.root)){setLeafId(null);setBookId(null);setOpenBook(r.id);}return;}const b=booksRef.current.find(k=>k.pages.some(p=>p.id===r.id));if(b){setBookId(b.id);setLeafId(r.id);}}),[pageId]);
 useEffect(()=>listenShortcutColor(pageId,(r,color)=>onChangeRef.current(setShortcutColor({...dataRef.current,mode:'notebooks',notebooks:booksRef.current},r.kind,r.id,color),'notebook-shortcut')),[pageId]);
 function flipShortcut(kind:'note'|'folder',id:string){onChangeRef.current(toggleShortcut({...dataRef.current,mode:'notebooks',notebooks:booksRef.current},kind,id),'notebook-shortcut');}
 const subItem=(id:string):MenuItem=>({label:hasSubShortcut(data,id)?'Tirar subatalho':'Virar subatalho',icon:'link',run:()=>onChangeRef.current(toggleSubShortcut({...dataRef.current,mode:'notebooks',notebooks:booksRef.current},id),'notebook-shortcut')});
 const shortcutItem=(kind:'note'|'folder',id:string):MenuItem=>hasShortcut(data,kind,id)?{label:'Tirar atalho',icon:'link',run:()=>flipShortcut(kind,id)}:{label:'Virar atalho',icon:'link',run:()=>flipShortcut(kind,id)};
 useEffect(()=>{const n=takeOpenNote(pageId);if(!n)return;const b=booksRef.current.find(k=>k.pages.some(p=>p.id===n));if(b){setBookId(b.id);setLeafId(n);}},[pageId]);
 useEffect(()=>pageId?registerLiveNotes(pageId,{find:id=>liveRef.current.find(id),remove:id=>liveRef.current.remove(id),addLoose:n=>liveRef.current.addLoose(n)}):undefined,[pageId]);
 function changeLeaf(patch:Partial<Leaf>){if(!book||!leaf)return;update(next=>{const p=next.find(b=>b.id===book.id)?.pages.find(p=>p.id===leaf.id);if(p){Object.assign(p,applyLeafPatch(p,patch));(p as Dated).updated_at=new Date().toISOString();}},'leaf:'+leaf.id+':'+Object.keys(patch).join(','));}
 // 05/11/2026 (Pedro): opcoes da nota no "⋯" de cada linha e num menu pequeno (antes: janela grande com botoes roxos)
 function deleteNote(bid:string,pid:string){const b=books.find(x=>x.id===bid),p=b?.pages.find(x=>x.id===pid);if(!b||!p)return;appAlert('Excluir nota?',`“${p.title||'Sem título'}” será removida desta pasta.`,[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{update(next=>{const f=next.find(x=>x.id===bid);if(f)f.pages=f.pages.filter(x=>x.id!==pid);});if(leafId===pid){setLeafId(null);setBookId(null);}setMenu(false);}}]);}
 function duplicateNote(bid:string,pid:string,openIt:boolean){const p=books.find(x=>x.id===bid)?.pages.find(x=>x.id===pid);if(!p)return;const copy={...clone(p),id:uid(),created_at:new Date().toISOString(),title:(p.title||'Sem título')+' cópia'};update(next=>{const f=next.find(x=>x.id===bid);if(!f)return;const at=f.pages.findIndex(x=>x.id===pid);f.pages.splice(at+1,0,copy);});if(openIt){setBookId(bid);setLeafId(copy.id);}}
 function moveNoteTo(bid:string,pid:string,dest:string){if(bid===dest)return;update(next=>{const src=next.find(x=>x.id===bid),p=src?.pages.find(x=>x.id===pid);if(!src||!p)return;src.pages=src.pages.filter(x=>x.id!==pid);let d=next.find(x=>x.id===dest);if(!d){d={id:ROOT_BOOK,name:'Fora de pastas',emoji:'📝',expanded:true,pages:[],root:true};next.push(d);}d.pages.unshift(p);},'notebook-move');if(leafId===pid)setBookId(dest);}
 const moveDests=(bid:string)=>[...books.filter(b=>!b.root&&b.id!==bid).map(b=>({id:b.id,label:(b.emoji||'📁')+' '+(b.name||'Sem título')})),...(bid!==ROOT_BOOK?[{id:ROOT_BOOK,label:'📝 Fora de pastas'}]:[])];
 function noteItems(bid:string,pid:string,where:{x:number;y:number}|null,inEditor:boolean):MenuItem[]{
  return [
   ...(inEditor?[]:[{label:'Abrir',icon:'note' as const,run:()=>{setBookId(bid);setLeafId(pid);}}]),
   {label:'Renomear',icon:'edit',run:()=>{setBookId(bid);setLeafId(pid);setTimeout(()=>leafTitle.current?.focus(),inEditor?60:320);}},
   {label:'Duplicar',icon:'copy',run:()=>duplicateNote(bid,pid,inEditor)},
   shortcutItem('note',pid),
   subItem(pid),
   {label:'Mover para outra pasta',icon:'move',run:()=>{const dests=moveDests(bid);if(where&&dests.length){openContextMenu(where.x,where.y,dests.map(d=>({label:d.label,run:()=>moveNoteTo(bid,pid,d.id)})));return;}setMenuNote({book:bid,leaf:pid});setMoving(true);}},
   {label:'Excluir nota',icon:'trash',danger:true,run:()=>deleteNote(bid,pid)},
  ];
 }
 /** No computador abre o menu pequeno junto do botao; no celular abre a lista compacta embaixo. */
 function openNoteMenu(bid:string,pid:string,e:any,inEditor:boolean){
  const r=e?.currentTarget?.getBoundingClientRect?.(),ne=e?.nativeEvent||{};
  if(desktop){const x=r?r.right-220:ne.pageX||0,y=r?r.bottom+4:ne.pageY||0;openContextMenu(x,y,noteItems(bid,pid,{x,y},inEditor));return;}
  setMenuNote({book:bid,leaf:pid});setMenu(true);
 }
 function removeBook(id:string){const b=books.find(x=>x.id===id);if(!b)return;setFolderMenu(null);
  appAlert('Excluir pasta?',b.pages.length?`“${b.name||'Sem título'}” e as ${b.pages.length} nota(s) dentro dela serão removidas.`:`“${b.name||'Sem título'}” será removida.`,[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{const up=parentOf(b);update(next=>{for(const k of next)if(k.parent===id){if(up)k.parent=up;else delete k.parent;}const i=next.findIndex(x=>x.id===id);if(i>=0)next.splice(i,1);});if(openBook===id)setOpenBook(up||null);}}]);}
 /** 13/11/2026 (Pedro: "poder alterar o icone da pasta de anotacoes"): o mesmo menu no ⋯ da pasta aberta e no botao direito do cartao */
 function folderItems(b:Book,withOpen=false):MenuItem[]{return [
  ...(withOpen?[{label:'Abrir',icon:'note' as const,run:()=>setOpenBook(b.id)}]:[]),
  {label:'Renomear',icon:'edit',run:()=>{setEditingBook(b.id);setNewName(b.name);setCreate(true);}},
  {label:'Trocar ícone',icon:'sparkle',run:()=>{setEmojiBook(b.id);setEmoji(b.emoji||'');}},
  shortcutItem('folder',b.id),
  {label:'Excluir pasta',icon:'trash',danger:true,run:()=>removeBook(b.id)}];}
 const commitTitle=()=>{const t=title.trim()||'Notas';setTitle(t);if(t!==String(data.title||'Notas'))onChange({...data,mode:'notebooks',title:t,notebooks:books},'notebook-title');};
 // 0.3.251 (computador): pastas em cartoes de tamanho fixo, quantos couberem na linha (no celular, 2 por linha)
 const results=useMemo(()=>query.trim()?books.flatMap(b=>b.pages.map(p=>({b,p,score:fuzzyScore((p.title||'')+' '+leafPreview(p),query)}))).filter(x=>x.score>0).sort((a,b)=>b.score-a.score):[],[books,query]);
 const open=(b:Book,p:Leaf)=>{setBookId(b.id);setLeafId(p.id);};

 /** 13/11/2026 (Pedro: "pastas com alturas diferentes"): todo cartao de pasta tem a MESMA altura e as mesmas 4 linhas
  * (pasta vazia mostra "Vazia" no lugar de "Última: ..."). Arrastando uma pasta: bordas = reordenar, meio = entrar. */
 // 14/11/2026 (Pedro: "arrumar diagramacao das pastas"): no computador os cartoes de pasta dividem a linha inteira por igual
  // (antes 224 px fixos: sobrava um vao a direita e a ultima pasta ficava sozinha embaixo de um jeito torto)
  // linhas equilibradas: 4 pastas num espaco de 3 viram 2x2 (nada de uma pasta sozinha na ultima linha); cartao entre 190 e 320 px
  const tileFor=(n:number)=>{if(!(gridW>0)||n<1)return 224;const max=Math.max(1,Math.floor((gridW+10)/(190+10))),rows=Math.ceil(n/max),cols=Math.max(1,Math.ceil(n/rows));return Math.min(320,Math.floor((gridW-10*(cols-1))/cols)-0.5);};
  const tileW=tileFor(opened?foldersIn(opened.id).length:foldersIn('').length);
  const gridLayout=(e:any)=>{const w=Math.round(e?.nativeEvent?.layout?.width||0);if(w&&Math.abs(w-gridW)>1)setGridW(w);};
  const folderTile=(b:Book)=>{const last=lastEdited(b),subs=foldersIn(b.id).length,over=hover===b.id,lifted=drag?.kind==='folder'&&drag.id===b.id,item:DragItem={kind:'folder',id:b.id,from:parentOf(b),label:(b.emoji||'📁')+' '+(b.name||'Sem título')},bar=(side:string)=>hover==='folder:'+b.id+'|'+side?<View pointerEvents="none" style={{position:'absolute',top:6,bottom:6,width:3,borderRadius:2,backgroundColor:c.accent,[side==='before'?'left':'right']:3}}/>:null;
  return <View key={b.id} ref={r=>{targets.current[b.id]=r;bindDom(r,dragProps(item));}} collapsable={false} {...({dataSet:{notesItem:'1',notesLifted:lifted&&mouse?'1':'0',notesLanded:landed===b.id?'1':'0'}} as any)} style={{width:desktop?tileW:'48%',position:'relative'}}>
   <Pressable accessibilityRole="button" accessibilityLabel={'Abrir pasta '+(b.name||'Sem título')} accessibilityHint="Segure e arraste para mover" onPress={()=>{if(!dragRef.current)setOpenBook(b.id);}} delayLongPress={300}
    {...(desktop?contextMenu(()=>folderItems(b,true)):{})}
    onLongPress={mouse?undefined:e=>startDrag(item,e)} onPressOut={mouse?undefined:()=>pressOut()}
    style={({pressed})=>({height:132,overflow:'hidden',backgroundColor:over?c.accentSoft:c.surface,borderRadius:18,borderWidth:over?2:1,borderColor:over?c.accent:c.line,padding:over?13:14,gap:6,opacity:lifted&&!mouse?0.35:pressed?0.75:1})}>
    <Text style={{fontSize:28,lineHeight:34}}>{b.emoji||'📁'}</Text>
    <Text numberOfLines={1} style={{color:c.text,fontSize:16,fontWeight:'600'}}>{b.name||'Sem título'}</Text>
    <Text numberOfLines={1} style={{color:c.muted,fontSize:12}}>{b.pages.length+(b.pages.length===1?' nota':' notas')+(subs?' · '+subs+(subs===1?' pasta':' pastas'):'')}</Text>
    <Text numberOfLines={1} style={{color:c.muted,fontSize:11}}>{last?'Última: '+(last.title||'Sem título'):'Vazia'}</Text>{bar('before')}{bar('after')}
   </Pressable>
  </View>;};
 const noteCard=(b:Book,p:Leaf,showFolder=false)=>{const prev=leafPreview(p),stamp=leafStamp(p as Dated),lifted=drag?.kind==='note'&&drag.id===p.id,tid='note:'+b.id+':'+p.id,line=(side:string)=>hover===tid+'|'+side?<View pointerEvents="none" style={{position:'absolute',left:6,right:6,[side==='before'?'top':'bottom']:-6,height:3,borderRadius:2,backgroundColor:c.accent}}/>:null,hovered=noteHover.key===tid,showDots=!showFolder&&(!desktop||hovered||lifted);const item:DragItem={kind:'note',id:p.id,from:b.id,label:'📝 '+(p.title||'Sem título')};
  return <View key={b.id+':'+p.id} ref={r=>{if(!showFolder)targets.current[tid]=r;bindDom(r,dragProps(item,p));}} collapsable={false} {...({dataSet:{notesItem:'1',notesLifted:lifted&&mouse?'1':'0',notesLanded:landed===p.id?'1':'0'}} as any)} style={{position:'relative'}}>
   <Pressable accessibilityRole="button" accessibilityLabel={'Abrir nota '+(p.title||'Sem título')} onPress={()=>{if(!dragRef.current)open(b,p);}} onHoverIn={()=>noteHover.enter(tid)} onHoverOut={noteHover.leave}
    {...(desktop?contextMenu(()=>noteItems(b.id,p.id,null,false)):{})}
    delayLongPress={300} onLongPress={showFolder||mouse?undefined:e=>startDrag(item,e)} onPressOut={showFolder||mouse?undefined:()=>pressOut()}
    style={({pressed}:any)=>({backgroundColor:hovered&&desktop?c.line+'55':c.surface,borderRadius:16,borderWidth:1,borderColor:c.line,padding:14,gap:5,opacity:lifted&&!mouse?0.35:pressed?0.75:1})}>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
     <Text numberOfLines={1} style={{flex:1,color:c.text,fontSize:16,fontWeight:'600'}}>{p.title||'Sem título'}</Text>
     {stamp?<Text style={{color:c.muted,fontSize:11}}>{stamp}</Text>:null}
     {!showFolder?<Pressable testID="note-row-more" accessibilityRole="button" accessibilityLabel={'Opções da nota '+(p.title||'Sem título')} hitSlop={8} onPress={(e:any)=>{e?.stopPropagation?.();openNoteMenu(b.id,p.id,e,false);}} style={({hovered:h}:any)=>({width:28,height:24,marginVertical:-4,marginRight:-6,borderRadius:6,alignItems:'center',justifyContent:'center',backgroundColor:h?c.line:'transparent',opacity:showDots?1:0})}><Icon name="more" size={16} color={c.muted}/></Pressable>:null}
    </View>
    {prev?<Text numberOfLines={2} style={{color:c.muted,fontSize:13,lineHeight:18}}>{prev}</Text>:<Text style={{color:c.muted,fontSize:12,fontStyle:'italic'}}>Nota vazia</Text>}
    {showFolder?<Text style={{color:c.accent,fontSize:11,fontWeight:'500'}}>{b.root?'📝 Fora de pastas':(b.emoji||'📁')+' '+(b.name||'Sem título')}</Text>:null}
   </Pressable>{line('before')}{line('after')}
  </View>;};

 return <View ref={r=>{rootRef.current=r;bindDom(r,{dragover:htmlOver,dragleave:htmlLeave,drop:htmlDrop});}} collapsable={false} {...pan.panHandlers} style={{gap:12}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
   <View style={{flex:1}}>
    {/* 05/11/2026 (Pedro: "ta desalinhado"): o voltar vira uma linha propria acima do nome da pasta; nome, contagem e busca na mesma margem */}
    {/* 13/11/2026: soltar uma nota ou pasta no "‹ Notas" tira da pasta (igual à faixa de baixo) */}
    {opened?<View ref={r=>{targets.current['__back__']=r;}} collapsable={false} style={{alignSelf:'flex-start',borderRadius:8,backgroundColor:drag&&hover==='__up__'?c.accentSoft:'transparent'}}><Pressable accessibilityRole="button" accessibilityLabel="Voltar às pastas" onPress={()=>setOpenBook(opened&&!opened.root?(parentOf(opened)||null):null)} hitSlop={8} style={({hovered}:any)=>({alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:4,marginBottom:2,opacity:hovered?1:0.8})}><Text style={{color:c.accent,fontSize:13,fontWeight:'600'}}>{'‹ '+(()=>{const up=parentOf(opened);const b=up?books.find(x=>x.id===up):null;return b?(b.emoji||'📁')+' '+(b.name||'Sem título'):(title||'Notas');})()}</Text></Pressable></View>:null}
    {opened?<View style={{flexDirection:'row',alignItems:'center',gap:6}}>{!opened.root?<Pressable accessibilityRole="button" accessibilityLabel="Trocar ícone da pasta" onPress={()=>{setEmojiBook(opened.id);setEmoji(opened.emoji||'');}} hitSlop={6} style={({hovered}:any)=>({borderRadius:8,paddingHorizontal:2,backgroundColor:hovered?c.input:'transparent'})}><Text style={{fontSize:24,lineHeight:32}}>{opened.emoji||'📁'}</Text></Pressable>:<Text style={{fontSize:24,lineHeight:32}}>{opened.emoji||'📝'}</Text>}<Text numberOfLines={1} style={{flex:1,fontSize:24,fontWeight:'700',color:c.text}}>{opened.name||'Sem título'}</Text></View>
     :<TextInput accessibilityLabel="Título do bloco de notas" value={title} onChangeText={setTitle} onEndEditing={commitTitle} onBlur={commitTitle} blurOnSubmit returnKeyType="done" style={{fontSize:24,fontWeight:'700',color:c.text,paddingVertical:0}}/>}
    <Text style={{color:c.muted,fontSize:12}}>{opened?opened.pages.length+(opened.pages.length===1?' nota':' notas'):foldersIn('').length+(foldersIn('').length===1?' pasta':' pastas')+' · '+total+(total===1?' nota':' notas')}</Text>
   </View>
   {!opened&&onDelete?<Pressable accessibilityRole="button" accessibilityLabel="Opções do bloco de notas" onPress={(e:any)=>{if(!desktop){setBlockMenu(true);return;}const r=e?.currentTarget?.getBoundingClientRect?.();openContextMenu(r?r.right-220:0,r?r.bottom+4:0,[{label:'Remover bloco de notas',icon:'trash',danger:true,run:()=>onDelete?.()}]);}} hitSlop={8} style={{paddingHorizontal:10,paddingVertical:6,borderRadius:99,backgroundColor:c.input}}><Text style={{color:c.text,fontWeight:'700',fontSize:16,lineHeight:22}}>⋯</Text></Pressable>:null}
   {opened&&!opened.root?<Pressable accessibilityRole="button" accessibilityLabel="Opções da pasta" onPress={(e:any)=>{if(!desktop){setFolderMenu(opened.id);return;}const r=e?.currentTarget?.getBoundingClientRect?.();openContextMenu(r?r.right-220:0,r?r.bottom+4:0,folderItems(opened));}} hitSlop={8} style={{paddingHorizontal:10,paddingVertical:6,borderRadius:99,backgroundColor:c.input}}><Text style={{color:c.text,fontWeight:'700',fontSize:16,lineHeight:22}}>⋯</Text></Pressable>:null}
   {!opened||!opened.root?<Pressable accessibilityRole="button" accessibilityLabel={opened?'Nova pasta dentro desta':'Nova pasta'} onPress={()=>{setEditingBook(null);setNewName('');setCreate(true);}} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:99,backgroundColor:c.input}}><Text style={{color:c.text,fontWeight:'600',fontSize:12}}>＋ Pasta</Text></Pressable>:null}
   <Pressable accessibilityRole="button" accessibilityLabel="Nova nota" onPress={()=>addLeaf()} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:99,backgroundColor:c.accent}}><Text style={{color:c.onAccent,fontWeight:'600',fontSize:12}}>＋ Nota</Text></Pressable>
  </View>
  {total>0?<TextInput accessibilityLabel="Buscar nas notas" value={query} onChangeText={setQuery} placeholder="🔍 Buscar nas notas" placeholderTextColor={c.muted} returnKeyType="search" style={{color:c.text,backgroundColor:c.input,borderRadius:14,paddingHorizontal:14,paddingVertical:10,fontSize:14}}/>:null}

  {query.trim()?<View style={{gap:10}}>
   {results.length?results.slice(0,30).map(r=>noteCard(r.b,r.p,true)):<Text style={{color:c.muted,fontSize:13,paddingVertical:8}}>Nenhuma nota encontrada para “{query.trim()}”.</Text>}
  </View>:opened?<View style={{gap:10}}>
   {foldersIn(opened.id).length?<View testID="notes-folder-grid" onLayout={gridLayout} style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{foldersIn(opened.id).map(folderTile)}</View>:null}
   {opened.pages.length?opened.pages.map(p=>noteCard(opened,p)):
    <Pressable onPress={()=>addLeaf(opened.id)} style={{borderRadius:16,borderWidth:1,borderStyle:'dashed',borderColor:c.line,padding:22,alignItems:'center',gap:4}}><Text style={{fontSize:24}}>📝</Text><Text style={{color:c.muted,fontSize:13}}>{tap('Pasta vazia. Toque para criar a primeira nota.')}</Text></Pressable>}
   {/* 05/11/2026: a faixa de tirar da pasta fica embaixo; no topo ela empurrava a lista e roubava o soltar para reordenar */}
   {drag?<View ref={r=>{targets.current['__up__']=r;}} collapsable={false} style={{borderRadius:14,borderWidth:2,borderStyle:'dashed',borderColor:hover==='__up__'?c.accent:c.line,backgroundColor:hover==='__up__'?c.accentSoft:'transparent',paddingVertical:14,alignItems:'center'}}>
    <Text style={{color:hover==='__up__'?c.accent:c.muted,fontWeight:'600'}}>{'↑ Tirar desta pasta'+(parentOf(opened)?'':' (fica fora de pastas)')}</Text>
   </View>:null}
  </View>:<View testID="notes-folder-grid" onLayout={gridLayout} style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
   {foldersIn('').map(folderTile)}
   {/* 13/11/2026 (Pedro): na raiz, pastas e notas soltas juntas (a nota solta é um cartão, sem pasta "Geral") */}
   {rootNotes.length?<View style={{width:'100%',gap:10,marginTop:foldersIn('').length?4:0}}>{rootNotes.map(p=>noteCard(books.find(b=>b.id===ROOT_BOOK)!,p))}</View>:null}
   {!foldersIn('').length&&!rootNotes.length?<Pressable onPress={()=>addLeaf()} style={{flex:1,borderRadius:18,borderWidth:1,borderStyle:'dashed',borderColor:c.line,padding:22,alignItems:'center',gap:4}}><Text style={{fontSize:28}}>📝</Text><Text style={{color:c.muted,fontSize:13,textAlign:'center'}}>{tap('Nenhuma nota ainda. Toque para criar a primeira nota (ou use ＋ Pasta).')}</Text></Pressable>:null}
  </View>}
  {total>0&&!query.trim()?<Text style={{color:c.muted,fontSize:11}}>{mouse?'Arraste uma nota ou pasta para mudar a ordem, para dentro de outra pasta, para fora dela ou para a lixeira.':tap('Segure uma nota ou pasta e arraste para mudar a ordem, para dentro de outra pasta, para fora dela ou para a lixeira.')}</Text>:null}
  {drag?<View ref={r=>{targets.current['__trash__']=r;}} testID="notes-trash" collapsable={false} {...({dataSet:{notesTrash:'1'}} as any)} style={{position:'sticky' as any,bottom:16,zIndex:45,alignSelf:'center',flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:20,paddingVertical:12,borderRadius:99,borderWidth:2,borderStyle:'dashed',borderColor:hover==='__trash__'?c.danger:c.line,backgroundColor:hover==='__trash__'?c.danger+'26':c.surface,shadowColor:'#000',shadowOpacity:0.25,shadowRadius:14,shadowOffset:{width:0,height:6}}}>
   <Icon name="trash" size={18} color={hover==='__trash__'?c.danger:c.muted}/><Text style={{color:hover==='__trash__'?c.danger:c.muted,fontWeight:'600'}}>{drag.kind==='folder'?'Solte aqui para excluir a pasta':'Solte aqui para excluir a nota'}</Text>
  </View>:null}
  {drag&&!webDrag.current?<Animated.View pointerEvents="none" style={{position:'absolute',left:0,top:0,zIndex:50,elevation:8,transform:ghost.getTranslateTransform(),backgroundColor:c.surface,borderRadius:14,borderWidth:1,borderColor:c.accent,paddingHorizontal:14,paddingVertical:10,maxWidth:240}}>
   <Text numberOfLines={1} style={{color:c.text,fontWeight:'600'}}>{drag.label}</Text>
  </Animated.View>:null}
  {/* 0.3.230: remover o bloco fica no ⋯ do topo do bloco (antes: segure aqui) */}

  <Sheet visible={create} onClose={()=>setCreate(false)}><Text style={{fontSize:20,fontWeight:'600',color:c.text}}>{editingBook?'Renomear pasta':'Nova pasta'}</Text><TextInput accessibilityLabel="Nome da pasta" autoFocus value={newName} onChangeText={setNewName} placeholder="Ex.: Trabalho, Ideias, Receitas" placeholderTextColor={c.muted} style={{color:c.text,backgroundColor:c.input,borderRadius:10,padding:14,marginVertical:15}}/><Button title={editingBook?'Salvar pasta':'Criar pasta'} disabled={!newName.trim()} onPress={()=>{update(next=>{if(editingBook){next.find(b=>b.id===editingBook)!.name=newName.trim();}else next.push({id:uid(),name:newName.trim(),emoji:'📁',expanded:true,pages:[],...(opened&&!opened.root?{parent:opened.id}:{})});});setCreate(false);}}/></Sheet>
  <Sheet visible={blockMenu} onClose={()=>setBlockMenu(false)}><Text style={{fontSize:20,fontWeight:'600',color:c.text,marginBottom:12}}>{title||'Notas'}</Text>
   <Pressable accessibilityRole="button" onPress={()=>{setBlockMenu(false);setTimeout(()=>onDelete?.(),120);}} style={{paddingVertical:18}}><Text style={{color:c.danger,fontWeight:'600'}}>Remover bloco de notas</Text></Pressable></Sheet>
  <Sheet visible={!!folderMenu} onClose={()=>setFolderMenu(null)}>
   <Text style={{fontSize:20,fontWeight:'600',color:c.text,marginBottom:12}}>{(()=>{const b=books.find(x=>x.id===folderMenu);return b?(b.emoji||'📁')+' '+(b.name||'Sem título'):'Pasta';})()}</Text>
   <Button title="Renomear" secondary onPress={()=>{const b=books.find(x=>x.id===folderMenu);setFolderMenu(null);if(b){setEditingBook(b.id);setNewName(b.name);setCreate(true);}}}/><View style={{height:8}}/>
   <Button title="Trocar ícone" secondary onPress={()=>{const b=books.find(x=>x.id===folderMenu);setFolderMenu(null);if(b){setEmojiBook(b.id);setEmoji(b.emoji||'');}}}/>
   <Pressable onPress={()=>{if(folderMenu)removeBook(folderMenu);}} style={{paddingVertical:20}}><Text style={{color:c.danger}}>Excluir pasta</Text></Pressable>
  </Sheet>
  <Sheet visible={!!emojiBook} onClose={()=>setEmojiBook(null)}><Text style={{fontSize:20,fontWeight:'600',color:c.text}}>Ícone da pasta</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:10,marginVertical:14}}>{EMOJIS.map(e=><Pressable key={e} onPress={()=>setEmoji(e)} style={{padding:10,borderRadius:12,backgroundColor:emoji===e?c.accentSoft:c.input}}><Text style={{fontSize:28}}>{e}</Text></Pressable>)}</View><TextInput accessibilityLabel="Emoji da pasta" value={emoji} onChangeText={setEmoji} maxLength={16} placeholder="Ou digite um emoji" placeholderTextColor={c.muted} style={{color:c.text,padding:12,fontSize:24}}/><Button title="Salvar ícone" onPress={()=>{update(next=>{next.find(b=>b.id===emojiBook)!.emoji=emoji;});setEmojiBook(null);}}/></Sheet>
  <MotionModal visible={!!leaf} animationType="slide" onRequestClose={()=>{setLeafId(null);setBookId(null);}}><SafeAreaView style={{flex:1,backgroundColor:c.bg}}><KeyboardViewport><View testID="notebook-top-bar" style={{zIndex:10,elevation:10,backgroundColor:c.surface,minHeight:56,flexDirection:'row',alignItems:'center',paddingHorizontal:8,borderBottomWidth:1,borderColor:c.line}}><IconButton name="back" label="Voltar às notas" onPress={()=>{setLeafId(null);setBookId(null);}}/><View style={{flex:1}}><Text numberOfLines={1} style={{color:c.text,fontSize:16,fontWeight:'500'}}>{leaf?.title||'Sem título'}</Text>{book?<Text numberOfLines={1} style={{color:c.muted,fontSize:11}}>{(book.emoji||'📁')+' '+(book.name||'Sem título')}</Text>:null}</View><IconButton name="more" label="Ações da nota" onPress={(e?:any)=>{if(book&&leaf)openNoteMenu(book.id,leaf.id,e,true);}}/></View>{leaf?<LeafEditor key={leaf.id} leaf={leaf} onChange={changeLeaf} titleRef={leafTitle} pageId={pageId}/>:null}</KeyboardViewport></SafeAreaView></MotionModal>
  {/* 05/11/2026 (Pedro: "janela mal feita e fora da identidade"): lista compacta com icones, igual ao menu do computador */}
  <Sheet visible={menu} onClose={()=>setMenu(false)}>{(()=>{const t=menuNote,b0=t&&books.find(x=>x.id===t.book),p0=b0&&b0.pages.find(x=>x.id===t.leaf);if(!t||!b0||!p0)return null;const inEditor=leafId===p0.id;return <View testID="note-menu-sheet">
   <Text numberOfLines={1} style={{color:c.muted,fontSize:12,fontWeight:'600',marginBottom:6}}>{p0.title||'Sem título'}</Text>
   {noteItems(b0.id,p0.id,null,inEditor).map(it=><Pressable key={it.label} accessibilityRole="menuitem" onPress={()=>{setMenu(false);setTimeout(it.run,it.label==='Excluir nota'?0:200);}} style={({pressed}:any)=>({flexDirection:'row',alignItems:'center',gap:12,minHeight:46,paddingHorizontal:8,borderRadius:10,backgroundColor:pressed?c.line:'transparent'})}>
    {it.icon?<Icon name={it.icon} size={18} color={it.danger?c.danger:c.muted}/>:null}<Text style={{color:it.danger?c.danger:c.text,fontSize:16}}>{it.label}</Text></Pressable>)}
  </View>;})()}</Sheet>
  <Sheet visible={moving} onClose={()=>setMoving(false)}>{(()=>{const t=menuNote||(bookId&&leafId?{book:bookId,leaf:leafId}:null);const dests=t?moveDests(t.book):[];return <View>
   <Text style={{color:c.text,fontSize:18,fontWeight:'600',marginBottom:8}}>Mover para</Text>
   <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:360}}>{dests.map(d=><Pressable key={d.id} accessibilityRole="menuitem" onPress={()=>{if(t)moveNoteTo(t.book,t.leaf,d.id);setMoving(false);}} style={({pressed}:any)=>({minHeight:46,justifyContent:'center',paddingHorizontal:8,borderRadius:10,backgroundColor:pressed?c.line:'transparent'})}><Text style={{color:c.text,fontSize:16}}>{d.label}</Text></Pressable>)}</ScrollView>
   {!dests.length?<Text style={{color:c.muted,fontSize:13}}>Crie outra pasta para poder mover a nota.</Text>:null}</View>;})()}</Sheet>
 </View>;
}
