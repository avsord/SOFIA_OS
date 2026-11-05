import {Presence} from '../components/Presence';
import {noteFluencyMovement} from '../lib/fluency';
import {PALETTE} from '../lib/palette';
import {useRenderCost} from '../lib/render-cost';
import {pageStoreSession} from '../lib/page-store-session';
import {afterVisible} from '../lib/fluency';
import {useVisibleLoad} from '../lib/visible-load';
import {KeyboardViewport} from '../components/KeyboardViewport';
import {KeyboardToolbar} from '../components/KeyboardToolbar';
import {useKeyboardVisible} from '../lib/motion';
import {legacyMovePlan} from '../lib/legacy-md';
import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {View,Text,ScrollView,TextInput,Pressable,Switch,Alert,RefreshControl,BackHandler,AppState,Keyboard,Image,Platform,StyleSheet} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SofiaApi,SITE} from '../lib/api';
import type {Entity} from '../lib/types';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {PageEditorStore,newBlock,expandedIds,toggleExpanded} from '../lib/page-editor';
import type {PageBlock,PageDraft} from '../lib/page-editor';
import {pageBodyIsEmpty,pageBlockHint,pageTitleHint} from '../lib/page-hints';
import {TEXT_BLOCKS,splitBlock,backspaceAtStart,deleteAtEnd,markdownShortcut,slashMatches,slashStart,applySlash,pastedLines,listNumber,neighbourText} from '../lib/page-block-keys';
import type {Caret} from '../lib/page-block-keys';
import {flushNow} from '../lib/flush-sync';
import {Button,Empty,ErrorBanner,IconButton,ScreenTitle} from '../components/UI';
import {Sheet} from '../components/Sheet';
import {PageRefreshGuard} from '../lib/page-gesture';
import {mergeRemotePages} from '../lib/page-sync';
import {entryBackTarget} from '../lib/page-navigation';
import {Icon} from '../components/Icon';
import {openContextMenu} from '../components/ContextMenu';
import {PageCover,PageAppearance,PAGE_COVERS,coverPosition} from '../components/PageAppearance';
import {PageTreeList} from '../components/PageTreeList';
import {canReparentPage,reparentPatch,reparentedPage} from '../lib/page-hierarchy';
import {comparePageOrder} from '../lib/page-order';
import type {PageDrop} from '../lib/page-order';
import {PageCreateMenu} from '../components/PageTemplatePicker';
import {NativeCollectionBlock} from '../components/NativeCollectionBlock';
import {freshTemplate,insertTemplateBlocks} from '../lib/page-templates';
import {subscribeSystemChanged} from '../lib/system-events';
import {Spinner,LoadingLines} from '../components/Loading';
import type {PageTemplate} from '../lib/page-templates';
import {appAlert} from '../lib/app-alert';
import {pagePath,pagesDirectory,samePages,tap,useDesktop} from '../lib/desktop';
import {ContentWidth} from '../lib/content-width';
const safeJson=(raw:string|null,fallback:unknown)=>{try{return JSON.parse(raw||'null')??fallback;}catch{return fallback;}};
const PAGE_LIST_KEY='/workspace/entities?limit=100&kind=user_page&q=&offset=0';
const cachedPageRows=(api:SofiaApi)=>api.cached<{items:Entity[]}>(PAGE_LIST_KEY)?.items.filter(item=>item.state!=='archived');

export function Pages({api,active,storageScope,onDepthChange,openPageKey=0,openPageId='',createPageKey=0}:{api:SofiaApi;active:boolean;storageScope:string;onDepthChange?:(open:boolean)=>void;openPageKey?:number;openPageId?:string;createPageKey?:number}){useRenderCost('pages');
 const keyboardVisible=useKeyboardVisible(),scrollPositions=useRef(new Map<string,number>());
 // 0.3.251 (computador): barra e capa na largura toda; o texto fica numa coluna de leitura centralizada
 const desktop=useDesktop();
 const c=useTheme(),[pages,setPages]=useState<Entity[]>(()=>api.pageOrderApply(cachedPageRows(api)||[])||[]),[selectedId,setSelectedId]=useState<string|null>(null),[tick,setTick]=useState(0),[expanded,setExpanded]=useState(new Set<string>()),[pageInteraction,setPageInteraction]=useState(false),[pageDragging,setPageDragging]=useState(false),[pageMenu,setPageMenu]=useState(false);
 const [refreshing,setRefreshing]=useState(false),[ready,setReady]=useState(false),[loaded,setLoaded]=useState(()=>cachedPageRows(api)!==undefined),[error,setError]=useState(''),[focus,setFocus]=useState<string|null>(null),[appearance,setAppearance]=useState<'icon'|'cover'|null>(null),[movingId,setMovingId]=useState<string|null>(null),[createParent,setCreateParent]=useState<Entity|null|undefined>(undefined);
 // 0.3.256: as paginas nunca aparecem fora da ordem escolhida (antes "sambavam" ao abrir): ate a ordem guardada no
 // aparelho ser lida, a lista mostra o esqueleto com shimmer; depois ja aparece no lugar certo
 const [orderReady,setOrderReady]=useState(()=>api.pageOrderReady);
 useEffect(()=>{if(orderReady)return;let alive=true;api.pageOrderLoad().catch(()=>{}).finally(()=>{if(!alive)return;setPages(prev=>api.pageOrderApply(prev));setOrderReady(true);});return()=>{alive=false;};},[api,orderReady]);
 // 0.3.255: reposicionar a capa (arrastar a imagem, como no Notion)
 const [coverMove,setCoverMove]=useState(false),coverLive=useRef(50);
 const refreshFlight=useRef(false),mutationEpoch=useRef(0),moveBusy=useRef(false),pendingPosition=useRef(new Map<string,Record<string,any>>());
 const restoredStore=useRef<PageEditorStore|null>(null);
 const history=useRef<string[]>([]),mounted=useRef(true),expandDisk=useRef(Promise.resolve()),inputRefs=useRef(new Map<string,TextInput>());
 const selectedRef=useRef<string|null>(null),paneWidth=useRef(0),backAction=useRef<()=>void>(()=>{});
 const pageInteractionRef=useRef(false),kanbanInteractionRef=useRef(false),refreshGuard=useRef(new PageRefreshGuard());
 function changePageInteraction(value:boolean){
  pageInteractionRef.current=value;refreshGuard.current.setActive(value);
  // RefreshControl is a composite component: its ref has no setNativeProps.
  // The synchronous guard rejects queued refresh callbacks; enabled controls native UI.
  setPageInteraction(value);onDepthChange?.(!!selectedRef.current||value);
 }
 function changeKanbanInteraction(value:boolean){kanbanInteractionRef.current=value;changePageInteraction(value);}
 function endPageTouch(){if(kanbanInteractionRef.current||!pageInteractionRef.current)return;changePageInteraction(false);setPageDragging(false);}
 function refreshPages(){if(refreshGuard.current.canRefresh()&&!selectedRef.current)void load(true);}
 selectedRef.current=selectedId;
 const key='sofia.native.pages.v1:'+encodeURIComponent(SITE+'|'+storageScope);
 const store=useMemo(()=>new PageEditorStore({save:patch=>api.saveEntity(patch),read:id=>api.entity(id),
  persist:items=>items.length?AsyncStorage.setItem(key+':drafts',JSON.stringify(items)):AsyncStorage.removeItem(key+':drafts'),
  onSaved:saved=>{mutationEpoch.current++;if(mounted.current)setPages(prev=>prev.map(p=>p.id===saved.id?{...saved,data:{...saved.data,...pendingPosition.current.get(saved.id)}}:p));}
 }),[api,key]);
 const storeSession=useMemo(()=>pageStoreSession(store),[store]);
 useEffect(()=>store.subscribe(()=>setTick(v=>v+1)),[store]);
 // A fast tab touch can race Shell's post-reveal archive hydration. Restore the
 // existing page list as soon as that disk read finishes; do not wait for I/O
 // or paint a false empty state. Never overwrite an active local edit.
 useEffect(()=>{
  let live=true;
  void api.hydrate().then(()=>{
   if(!live||!mounted.current)return;
   const local=cachedPageRows(api);
   if(local!==undefined){
    setPages(prev=>prev.length?prev:api.pageOrderApply(local));
    setLoaded(true);
   }
  }).catch(()=>{});
  return()=>{live=false;};
 },[api]);
 useEffect(()=>subscribeSystemChanged(owner=>{if(owner===api)void load();}),[api,store]);
 async function load(manual=false){
  if(refreshFlight.current||moveBusy.current||(!manual&&pageInteractionRef.current))return;
  refreshFlight.current=true;const epoch=mutationEpoch.current;
  if(manual)setRefreshing(true);
  try{
   const items:Entity[]=[];
   for(let offset=0;offset<10000;offset+=100){const r=await api.entities('user_page','',offset);items.push(...r.items.filter(x=>x.state!=='archived'));if(r.items.length<100)break;if(offset===9900)throw Error('Há mais páginas do que esta sincronização consegue carregar. Nenhuma página foi removida.');}
   if(mounted.current&&!moveBusy.current&&epoch===mutationEpoch.current){
    items.forEach(page=>store.open(page));
    setPages(prev=>mergeRemotePages(prev,items.map(p=>{const e=store.get(p.id);return e&&e.base.revision>p.revision?e.base:p;}),id=>{const e=store.get(id);return !!e&&e.state!=='saved';}));setLoaded(true);setError('');
   }
  }catch(e){if(mounted.current)setError(errorText(e));}
  finally{refreshFlight.current=false;if(manual&&mounted.current)setRefreshing(false);}
 }
 const refreshLatest=useRef(load);refreshLatest.current=load;
 useVisibleLoad(()=>{
  if(!active||!ready)return;
  const refresh=()=>{if(AppState.currentState==='active'&&!pageInteractionRef.current)void refreshLatest.current();};
  refresh();const timer=setInterval(refresh,5000),subscription=AppState.addEventListener('change',state=>{if(state==='active')refresh();});
  return()=>{clearInterval(timer);subscription.remove();};
 },[active,ready,store]);
 useEffect(()=>{
  mounted.current=true;let alive=true,cancelLoad=()=>{};const leaveSession=storeSession.enter();
  // Local drafts/expansion are enough to render saved pages. Waiting for a
  // slow server here used to show an empty screen on the first tab press.
  void Promise.all([AsyncStorage.getItem(key+':drafts'),AsyncStorage.getItem(key+':expanded')]).then(([drafts,branches])=>{
   if(!alive)return;
   if(restoredStore.current!==store){store.restore(safeJson(drafts,[]));setExpanded(expandedIds(safeJson(branches,[])));restoredStore.current=store;}
   setReady(true);store.resume();cancelLoad=afterVisible(()=>{void load();});
  }).catch(e=>{if(alive){setError(errorText(e));setReady(true);cancelLoad=afterVisible(()=>{void load();});}});
  const state=AppState.addEventListener('change',()=>{void store.flushAll();});
  const keyboard=Keyboard.addListener('keyboardDidHide',()=>setFocus(null));
  return()=>{alive=false;cancelLoad();mounted.current=false;state.remove();keyboard.remove();leaveSession();};
 },[store,key,storeSession]);
 useEffect(()=>{if(!active){kanbanInteractionRef.current=false;endPageTouch();setFocus(null);void store.flushAll();}},[active,store]);
 useEffect(()=>{onDepthChange?.(!!selectedId||pageInteraction);},[selectedId,pageInteraction,onDepthChange]);
 useEffect(()=>()=>onDepthChange?.(false),[onDepthChange]);
 const displayPages=useMemo(()=>pages.map(p=>{const e=store.get(p.id);return e?{...p,title:e.draft.title.trim()||'Sem título',data:{...p.data,...e.draft.appearance}}:p;}),[pages,store,tick]);
 const byId=useMemo(()=>new Map(displayPages.map(p=>[p.id,p])),[displayPages]);
 const children=useMemo(()=>{const m=new Map<string,Entity[]>();for(const p of displayPages){const parent=String(p.data?.parent_id||'');if(!m.has(parent))m.set(parent,[]);m.get(parent)!.push(p);}for(const list of m.values())list.sort(comparePageOrder);return m;},[displayPages]);
 const entry=selectedId?store.get(selectedId):undefined;
 // 0.3.250 (computador): a barra lateral mostra a arvore destas paginas e abre uma pagina daqui; o caminho
 // da pagina aberta vai para a barra de cima. No celular nada disso roda.
 useEffect(()=>{if(Platform.OS==='web'&&loaded&&!samePages(pagesDirectory.get(),displayPages))pagesDirectory.set(displayPages);},[displayPages,loaded]);
 const handledOpen=useRef(0);
 useEffect(()=>{if(!openPageKey||handledOpen.current===openPageKey||!openPageId)return;const page=byId.get(openPageId);if(!page)return;handledOpen.current=openPageKey;history.current=[];open(page,false);},[openPageKey,openPageId,byId]);
 const handledCreate=useRef(0);
 useEffect(()=>{if(!createPageKey||handledCreate.current===createPageKey||!ready)return;handledCreate.current=createPageKey;if(selectedRef.current){void store.flush(selectedRef.current);history.current=[];setSelectedId(null);}setCreateParent(null);},[createPageKey,ready]);
 useEffect(()=>{if(Platform.OS!=='web')return;const trail:{id:string;title:string}[]=[];let cur=selectedId?byId.get(selectedId):undefined;const seen=new Set<string>();while(cur&&!seen.has(cur.id)&&trail.length<40){seen.add(cur.id);trail.unshift({id:cur.id,title:cur.title||'Sem título'});cur=byId.get(String(cur.data?.parent_id||''));}const prev=pagePath.get();if(prev.length!==trail.length||prev.some((x,i)=>x.id!==trail[i].id||x.title!==trail[i].title))pagePath.set(trail);},[selectedId,byId]);
 useEffect(()=>{if(ready&&selectedId&&!byId.has(selectedId)&&store.get(selectedId)?.state==='saved'){history.current=history.current.filter(id=>byId.has(id));setSelectedId(null);setFocus(null);}},[ready,selectedId,byId,store]);
 const emptyBody=entry?pageBodyIsEmpty(entry.draft.blocks):true;
 const hasSubpageContent=!!(selectedId&&(children.get(selectedId)||[]).length);
 const showBodyGuide=emptyBody&&!hasSubpageContent;
 const placeholderColor=c.muted+'80';
 // 0.3.267: editor no estilo Notion no computador (web): Enter divide, Backspace junta, setas entre blocos, menu "/",
 // atalhos markdown e colar várias linhas. No celular o teclado continua como antes.
 const webKeys=Platform.OS==='web';
 const appearanceAnchor=useRef<{x:number;y:number}|null>(null);
 function openAppearance(kind:'icon'|'cover',e?:any){const ne=e?.nativeEvent,t=e?.currentTarget;let at:{x:number;y:number}|null=null;
  try{const r=t?.getBoundingClientRect?.();if(r)at={x:r.left,y:r.bottom};}catch{}if(!at&&ne&&typeof ne.pageX==='number')at={x:ne.pageX,y:ne.pageY};appearanceAnchor.current=at;setAppearance(kind);}
 const [slash,setSlash]=useState<{id:string;start:number;caret:number;active:number}|null>(null),[blockMenu,setBlockMenu]=useState<string|null>(null),slashScroll=useRef<ScrollView>(null);
 useEffect(()=>{if(slash)slashScroll.current?.scrollTo({y:Math.max(0,slash.active*49-140),animated:false});},[slash?.active]);
 useEffect(()=>{setBlockMenu(null);},[focus,selectedId]);
 // 0.3.267: no computador o campo de cada bloco tem a altura do texto (antes: sempre 2 linhas, sobrando espaço entre
 // blocos e cortando parágrafos maiores). Só recalcula quando o texto ou a largura mudam.
 const [, setResizeTick]=useState(0);
 useEffect(()=>{if(!webKeys)return;const w=globalThis as any;const on=()=>setResizeTick(v=>v+1);w.addEventListener?.('resize',on);return()=>w.removeEventListener?.('resize',on);},[webKeys]);
 useLayoutEffect(()=>{if(!webKeys)return;for(const ref of inputRefs.current.values()){const n=ref as unknown as HTMLTextAreaElement&{__size?:string};if(!n?.style||n.tagName!=='TEXTAREA')continue;
  if(n.dataset?.pageBlock==='collapsed'){n.__size='';n.style.height='0px';continue;}const key=n.value+'|'+n.clientWidth;if(n.__size===key)continue;n.__size=key;n.style.height='0px';n.style.height=n.scrollHeight+'px';}});
 const currentBlocks=()=>(selectedId&&store.get(selectedId)?.draft.blocks)||[];
 const domInput=(id:string)=>inputRefs.current.get(id) as unknown as (HTMLTextAreaElement&{setSelectionRange?:(a:number,b:number)=>void})|undefined;
 function placeCaret(id:string,caret:number|'end'){const run=()=>{const node=domInput(id);if(!node)return false;node.focus?.();const len=String(node.value??'').length;const at=caret==='end'?len:Math.min(caret,len);node.setSelectionRange?.(at,at);return true;};if(!run())requestAnimationFrame(()=>{if(!run())requestAnimationFrame(run);});}
 // a mudança é renderizada na hora (flushNow) para o foco já estar no bloco certo antes da próxima tecla
 function applyCaret(r:Caret|null){if(!r||!selectedId)return false;const blocks=r.blocks;flushNow(()=>{edit(d=>({...d,blocks}));setSlash(null);setFocus(r.focus);});placeCaret(r.focus,r.caret);return true;}
 function chooseSlash(b:PageBlock,type:string){const sl=slash;setSlash(null);if(!sl||sl.id!==b.id||!entry)return;
  if(type==='subpage'){const text=String(b.text||'');updateBlock(b,{text:text.slice(0,sl.start)+text.slice(sl.caret),html:''});void create(entry.base);return;}
  applyCaret(applySlash(currentBlocks(),b.id,sl.start,sl.caret,type));}
 function insertWithSlash(b:PageBlock){const blocks=currentBlocks(),i=blocks.findIndex(x=>x.id===b.id);if(i<0)return;const empty=b.type==='text'&&!String(b.text||'').trim();
  const target=empty?b:{...newBlock(),text:'/'};const next=blocks.slice();if(empty)next[i]={...b,text:'/',html:''};else next.splice(i+1,0,target);
  flushNow(()=>{edit(d=>({...d,blocks:next}));setFocus(target.id);setSlash({id:target.id,start:0,caret:1,active:0});});placeCaret(target.id,1);}
 function moveBlock(id:string,dir:1|-1){edit(d=>{const blocks=d.blocks.slice(),i=blocks.findIndex(x=>x.id===id),j=i+dir;if(i<0||j<0||j>=blocks.length)return d;[blocks[i],blocks[j]]=[blocks[j],blocks[i]];return {...d,blocks};});}
 function duplicateBlock(id:string){edit(d=>{const blocks=d.blocks.slice(),i=blocks.findIndex(x=>x.id===id);if(i<0)return d;blocks.splice(i+1,0,{...JSON.parse(JSON.stringify(blocks[i])),id:newBlock().id});return {...d,blocks};});}
 // 0.3.267 (computador): arrastar blocos pelo ⋮⋮ (linha azul mostra onde cai) e selecionar vários blocos
 const [picked,setPicked]=useState<Set<string>>(()=>new Set()),pickedRef=useRef(picked);pickedRef.current=picked;
 const [drop,setDrop]=useState<{y:number;index:number}|null>(null),[dragging,setDragging]=useState<string|null>(null);
 const pickAnchor=useRef(-1),pickFocus=useRef(-1),dragMoved=useRef(false);
 const blockRows=()=>{const host=(globalThis as any).document?.querySelector?.('[data-testid="page-blocks"]');return host?Array.from(host.children) as HTMLElement[]:[];};
 function pickRange(a:number,z:number){const blocks=currentBlocks();if(!blocks.length)return;const lo=Math.max(0,Math.min(a,z)),hi=Math.min(blocks.length-1,Math.max(a,z));pickAnchor.current=a;pickFocus.current=z;setPicked(new Set(blocks.slice(lo,hi+1).map(x=>x.id)));}
 function enterPick(a:number,z=a){const d=(globalThis as any).document;(d?.activeElement as any)?.blur?.();d?.getSelection?.()?.removeAllRanges?.();setSlash(null);setBlockMenu(null);setFocus(null);pickRange(a,z);}
 function pickedIndexes(){const blocks=currentBlocks();return blocks.map((x,i)=>pickedRef.current.has(x.id)?i:-1).filter(i=>i>=0);}
 function blocksText(idx:number[]){const blocks=currentBlocks();let n=0;return idx.map(i=>{const x=blocks[i],t=String(x.text||'');n=x.type==='number'?n+1:0;const pre=({heading1:'# ',heading2:'## ',heading3:'### ',bullet:'- ',number:n+'. ',todo:x.checked?'[x] ':'[ ] ',quote:'> '} as Record<string,string>)[x.type];return pre!==undefined?pre+t:x.type==='divider'?'---':t;}).join('\n');}
 // o arrasto começa no mousedown do próprio ⋮⋮ (o onPressIn do Pressable chega depois do clique e deixava o arrasto "preso")
 const dragStart=useRef<(b:PageBlock,e:any)=>void>(()=>{});dragStart.current=(b,e)=>startBlockDrag(b,e);
 function bindGrip(node:any,b:PageBlock){if(!webKeys||!node||typeof node.addEventListener!=='function'||node.__sofiaGrip===b.id)return;node.__sofiaGrip=b.id;node.addEventListener('mousedown',(ev:MouseEvent)=>{if(ev.button!==0)return;ev.preventDefault();dragMoved.current=false;dragStart.current(b,ev);});}
 function startBlockDrag(b:PageBlock,e:any){
  if(!webKeys)return;const ne=e?.nativeEvent||e||{},startX=ne.pageX??0,startY=ne.pageY??0,d=(globalThis as any).document;if(!d)return;let moved=false;
  const target=(y:number)=>{const rows=blockRows();if(!rows.length)return null;const host=rows[0].parentElement!.getBoundingClientRect();let index=rows.length,line=rows[rows.length-1].getBoundingClientRect().bottom;
   for(let i=0;i<rows.length;i++){const r=rows[i].getBoundingClientRect();if(y<r.top+r.height/2){index=i;line=r.top;break;}}return {index,y:line-host.top};};
  const move=(ev:MouseEvent)=>{if(!moved&&Math.hypot(ev.pageX-startX,ev.pageY-startY)<4)return;if(!moved){moved=true;setDragging(b.id);setBlockMenu(null);d.getSelection?.()?.removeAllRanges?.();}ev.preventDefault();const t=target(ev.clientY);setDrop(t);};
  const up=(ev:MouseEvent)=>{d.removeEventListener('mousemove',move);d.removeEventListener('mouseup',up);
   dragMoved.current=moved;if(!moved)return;
   const t=target(ev.clientY);setDrop(null);setDragging(null);if(!t)return;
   edit(dr=>{const blocks=dr.blocks.slice(),from=blocks.findIndex(x=>x.id===b.id);if(from<0)return dr;let to=t.index;if(from<to)to--;if(to===from)return dr;const [m]=blocks.splice(from,1);blocks.splice(to,0,m);return {...dr,blocks};});};
  d.addEventListener('mousemove',move);d.addEventListener('mouseup',up);
 }
 useEffect(()=>{if(!webKeys||!active)return;const d=(globalThis as any).document;if(!d)return;
  const key=(e:KeyboardEvent)=>{if(!pickedRef.current.size||!selectedId)return;const t=e.target as HTMLElement;if(t?.closest?.('textarea,input,[contenteditable="true"]'))return;
   const idx=pickedIndexes(),blocks=currentBlocks(),last=blocks.length-1,mod=(e.ctrlKey||e.metaKey)&&!e.altKey,k=e.key.toLowerCase();if(!idx.length)return;
   if(e.key==='Escape'){e.preventDefault();setPicked(new Set());return;}
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const dir=e.key==='ArrowDown'?1:-1;if(e.shiftKey)pickRange(pickAnchor.current<0?idx[0]:pickAnchor.current,Math.max(0,Math.min(last,(pickFocus.current<0?idx[0]:pickFocus.current)+dir)));else{const n=Math.max(0,Math.min(last,(dir>0?idx[idx.length-1]:idx[0])+dir));pickRange(n,n);}return;}
   if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();const gone=new Set(idx.map(i=>blocks[i].id));edit(dr=>{const rest=dr.blocks.filter(x=>!gone.has(x.id));return {...dr,blocks:rest.length?rest:[newBlock()]};});setPicked(new Set());return;}
   if(e.key==='Enter'){e.preventDefault();const first=blocks[idx[0]];setPicked(new Set());if(first&&TEXT_BLOCKS.has(first.type)){setFocus(first.id);placeCaret(first.id,'end');}return;}
   if(mod&&k==='a'){e.preventDefault();pickRange(0,last);return;}
   if(mod&&(k==='c'||k==='x')){e.preventDefault();const text=blocksText(idx);void (globalThis as any).navigator?.clipboard?.writeText?.(text);if(k==='x'){const gone=new Set(idx.map(i=>blocks[i].id));edit(dr=>{const rest=dr.blocks.filter(x=>!gone.has(x.id));return {...dr,blocks:rest.length?rest:[newBlock()]};});setPicked(new Set());}return;}
   if(mod&&k==='d'){e.preventDefault();const copies=idx.map(i=>({...JSON.parse(JSON.stringify(blocks[i])),id:newBlock().id}));const at=idx[idx.length-1]+1;edit(dr=>{const next=dr.blocks.slice();next.splice(at,0,...copies);return {...dr,blocks:next};});setPicked(new Set(copies.map(x=>x.id)));return;}
  };
  // arrastar o mouse de um bloco para outro (ou a partir da margem) seleciona os blocos do caminho
  let press:{start:number;x:number;y:number}|null=null;
  const rowAt=(y:number)=>{const rows=blockRows();for(let i=0;i<rows.length;i++){const r=rows[i].getBoundingClientRect();if(y>=r.top&&y<=r.bottom)return i;}return -1;};
  const down=(e:MouseEvent)=>{const t=e.target as HTMLElement;if(e.button!==0)return;if(!t?.closest?.('[data-testid="page-blocks"]')&&!t?.closest?.('[data-testid^="page-document-"]')){if(pickedRef.current.size)setPicked(new Set());return;}
   if(t?.closest?.('[data-testid^="page-block-gutter"],[data-testid="page-block-menu"],[data-testid="page-slash-menu"]'))return;if(pickedRef.current.size)setPicked(new Set());
   if(t?.closest?.('button,[role="button"],[role="checkbox"]')&&!t?.closest?.('textarea'))return;press={start:rowAt(e.clientY),x:e.clientX,y:e.clientY};};
  const moveSel=(e:MouseEvent)=>{if(!press||!(e.buttons&1))return;const i=rowAt(e.clientY);if(press.start<0){if(Math.hypot(e.clientX-press.x,e.clientY-press.y)<8||i<0)return;press.start=i;}if(i>=0&&i!==press.start){e.preventDefault();if(!pickedRef.current.size)enterPick(press.start,i);else pickRange(press.start,i);}};
  const upSel=()=>{press=null;};
  d.addEventListener('keydown',key);d.addEventListener('mousedown',down,true);d.addEventListener('mousemove',moveSel);d.addEventListener('mouseup',upSel);
  return()=>{d.removeEventListener('keydown',key);d.removeEventListener('mousedown',down,true);d.removeEventListener('mousemove',moveSel);d.removeEventListener('mouseup',upSel);};
 },[webKeys,active,selectedId]);
 useEffect(()=>{setPicked(new Set());},[selectedId]);
 // menu do ⋮⋮ fecha com Esc ou clique fora
 useEffect(()=>{if(!webKeys||!blockMenu)return;const d=(globalThis as any).document;if(!d)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setBlockMenu(null);}};const down=(e:MouseEvent)=>{const t=e.target as HTMLElement;if(!t?.closest?.('[data-testid="page-block-menu"],[data-testid^="page-block-gutter"]'))setBlockMenu(null);};d.addEventListener('keydown',key,true);d.addEventListener('mousedown',down,true);return()=>{d.removeEventListener('keydown',key,true);d.removeEventListener('mousedown',down,true);};},[webKeys,blockMenu]);
 function onBlockKey(e:any,b:PageBlock){
  if(!webKeys)return;const ne=e.nativeEvent||{},key=String(ne.key||''),node=e.target as HTMLTextAreaElement,text=String(node?.value??b.text??''),start=node?.selectionStart??text.length,end=node?.selectionEnd??start;
  if(slash&&slash.id===b.id){const items=slashMatches(text.slice(slash.start+1,start));
   if(key==='ArrowDown'||key==='ArrowUp'){e.preventDefault();const n=Math.max(1,items.length);setSlash({...slash,active:(slash.active+(key==='ArrowDown'?1:-1)+n)%n});return;}
   if((key==='Enter'||key==='Tab')&&items.length){e.preventDefault();chooseSlash(b,items[Math.min(slash.active,items.length-1)].type);return;}
   if(key==='Escape'){e.preventDefault();setSlash(null);return;}}
  if(key==='Escape'){e.preventDefault();const i=currentBlocks().findIndex(x=>x.id===b.id);if(i>=0)enterPick(i);return;}
  if(ne.shiftKey&&!ne.ctrlKey&&!ne.metaKey&&((key==='ArrowUp'&&start===0&&end===0)||(key==='ArrowDown'&&start===text.length&&end===text.length))){const i=currentBlocks().findIndex(x=>x.id===b.id);if(i>=0){e.preventDefault();enterPick(i,Math.max(0,Math.min(currentBlocks().length-1,i+(key==='ArrowDown'?1:-1))));}return;}
  if(key==='Enter'&&!ne.shiftKey&&!ne.ctrlKey&&!ne.metaKey&&b.type!=='code'){e.preventDefault();applyCaret(splitBlock(currentBlocks(),b.id,start,end));return;}
  if(key==='Backspace'&&start===0&&end===0){const r=backspaceAtStart(currentBlocks(),b.id);if(r){e.preventDefault();applyCaret(r);}return;}
  if(key==='Delete'&&start===text.length&&end===text.length){const r=deleteAtEnd(currentBlocks(),b.id);if(r){e.preventDefault();applyCaret(r);}return;}
  if(ne.shiftKey||ne.altKey||ne.ctrlKey||ne.metaKey||start!==end)return;
  const line=parseFloat(String((globalThis as any).getComputedStyle?.(node)?.lineHeight||''))||24,oneLine=!node||node.scrollHeight<=line*1.6;
  const up=key==='ArrowUp'&&(start===0||oneLine&&!text.slice(0,start).includes('\n')),down=key==='ArrowDown'&&(start===text.length||oneLine&&!text.slice(start).includes('\n'));
  const left=key==='ArrowLeft'&&start===0,right=key==='ArrowRight'&&start===text.length;
  if(up||down||left||right){const target=neighbourText(currentBlocks(),b.id,up||left?-1:1);if(!target)return;e.preventDefault();setFocus(target);placeCaret(target,up||left?'end':0);}
 }
 function onBlockText(b:PageBlock,text:string){
  const before=String(b.text||'');
  if(webKeys){const md=markdownShortcut(b.type,before,text);
   if(md){if(md.type==='divider'){const blocks=currentBlocks().slice(),i=blocks.findIndex(x=>x.id===b.id),after=newBlock();if(i>=0){blocks.splice(i,1,{...b,type:'divider',text:'',html:''},after);applyCaret({blocks,focus:after.id,caret:0});}return;}
    applyCaret({blocks:currentBlocks().map(x=>x.id===b.id?{...x,type:md.type,text:md.text,html:''}:x),focus:b.id,caret:0});return;}
   if(applyCaret(pastedLines(currentBlocks(),b.id,before,text)))return;}
  updateBlock(b,{text,html:''},'text:'+b.id);
  if(!webKeys)return;const caret=domInput(b.id)?.selectionStart??text.length;
  if(slash&&slash.id===b.id){const at=slashStart(text,caret);if(at!==slash.start||!slashMatches(text.slice(at+1,caret)).length&&/\s$/.test(text.slice(0,caret)))setSlash(null);else setSlash({...slash,caret,active:0});return;}
  if(text.length===before.length+1&&text.charAt(caret-1)==='/'&&slashStart(text,caret)===caret-1)setSlash({id:b.id,start:caret-1,caret,active:0});
 }
 useEffect(()=>{if(active&&focus&&focus!=='title')inputRefs.current.get(focus)?.focus();},[focus,selectedId,active]);
 function toggle(id:string){setExpanded(old=>{const next=toggleExpanded(old,id),value=JSON.stringify([...next]);expandDisk.current=expandDisk.current.catch(()=>{}).then(()=>AsyncStorage.setItem(key+':expanded',value)).catch(()=>{if(mounted.current)setError('Não foi possível guardar a abertura das subpáginas neste aparelho.');});return next;});}
 function canParent(pageId:string,parentId:string){return canReparentPage(displayPages,pageId,parentId);}
 async function movePage(page:Entity,parentId:string,drop?:PageDrop){
  if(moveBusy.current||(!drop&&String(page.data?.parent_id||'')===parentId))return;
  if(!canParent(page.id,parentId)){setError('Essa página não pode ser colocada dentro dela mesma ou de uma subpágina dela.');return;}
  const before=pages;
  moveBusy.current=true;mutationEpoch.current++;setMovingId(page.id);setError('');
  try{
  const plan=drop?legacyMovePlan(displayPages,{id:page.id,revision:page.revision,parentId,kind:drop.kind,anchorId:drop.anchorId}):null;
  pendingPosition.current=new Map((plan?.siblings||[page]).map((item,i)=>[item.id,{...(item.id===page.id?{parent_id:parentId,node_type:parentId?'page':'space'}:{}),sort_order:(i+1)*1024}]));
  setPages(old=>old.map(item=>{const rank=plan?.siblings.findIndex(p=>p.id===item.id)??-1;const value=item.id===page.id?reparentedPage(item,parentId):item;return rank>=0?{...value,data:{...value.data,sort_order:(rank+1)*1024}}:value;}));
  if(parentId)setExpanded(old=>{const next=new Set(old);next.add(parentId);const value=JSON.stringify([...next]);expandDisk.current=expandDisk.current.catch(()=>{}).then(()=>AsyncStorage.setItem(key+':expanded',value)).catch(()=>{});return next;});
   await store.flush(page.id);
   const base=store.get(page.id)?.base||pages.find(item=>item.id===page.id);
   if(!base)throw new Error('Página não encontrada.');
   const result=await api.movePage({id:base.id,revision:base.revision,parentId,kind:drop?.kind||'inside',anchorId:drop?.anchorId||parentId});
   mutationEpoch.current++;const savedPages=result.items; savedPages.forEach(saved=>store.open(saved));
   if(mounted.current)setPages(old=>old.map(item=>savedPages.find(p=>p.id===item.id)||item));
  }catch(e){if(mounted.current){setPages(before);setError(errorText(e));}}
  finally{pendingPosition.current.clear();moveBusy.current=false;mutationEpoch.current++;if(mounted.current)setMovingId(null);}
 }
 function open(page:Entity,push=true){if(selectedId){void store.flush(selectedId);if(push&&selectedId!==page.id)history.current.push(selectedId);}store.open(pages.find(p=>p.id===page.id)||page);setSelectedId(page.id);setFocus(null);setAppearance(null);setCoverMove(false);setError('');}
 function back(){if(selectedId)void store.flush(selectedId);setFocus(null);setAppearance(null);setCoverMove(false);const parent=entryBackTarget(byId,selectedId,history.current);if(parent)history.current.splice(history.current.lastIndexOf(parent));else history.current=[];if(parent&&parent!==selectedId&&byId.has(parent))open(byId.get(parent)!,false);else setSelectedId(null);} backAction.current=back;
 useEffect(()=>{if(!active)return;const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(pageInteractionRef.current)return true;if(!selectedId)return false;back();return true;});return()=>sub.remove();},[active,selectedId,byId,store]);
 function edit(change:(draft:PageDraft)=>PageDraft,group=''){if(selectedId)store.edit(selectedId,change,group);}
 function startCoverMove(){if(!selectedId)return;coverLive.current=coverPosition(store.get(selectedId)?.draft.appearance||{});setCoverMove(true);}
 function saveCoverMove(){const id=selectedId;setCoverMove(false);if(!id)return;const value=Math.round(coverLive.current*10)/10;store.edit(id,d=>({...d,appearance:{...d.appearance,cover_position:value}}));void store.flush(id);}
 async function create(parent?:Entity,template?:PageTemplate){mutationEpoch.current++;try{
  const preset=template?freshTemplate(template):null;
  const saved=await api.saveEntity({kind:'user_page',title:'Sem título',content:'',area:parent?.area||'Pessoal',privacy:'private',state:'active',tags:[],data:{
   icon:'',icon_mode:'default',cover_type:'preset',cover_value:PAGE_COVERS[0][1],cover_attachment_id:'',
   purpose:'',layout:'notes',suggested:false,parent_id:parent?.id||'',node_type:parent?'page':'space',blocks_json:preset?JSON.stringify(preset.blocks):'[]'
  }});
  if(!mounted.current)return;mutationEpoch.current++;setPages(old=>[...old,saved]);open(saved);
 }catch(e){setError(errorText(e));}}
 function applyTemplate(template:PageTemplate){if(!selectedId)return;const preset=freshTemplate(template);store.edit(selectedId,d=>({...d,blocks:insertTemplateBlocks(d.blocks,preset.blocks)}),'template');setFocus(null);setCreateParent(undefined);void store.flush(selectedId);}
 function updateBlock(block:PageBlock,patch:Partial<PageBlock>,group=''){edit(d=>({...d,blocks:d.blocks.map(b=>b.id===block.id?{...b,...patch}:b)}),group);}
 function confirmRemoveBlock(b:PageBlock){appAlert('Excluir bloco?','Somente este bloco e seu conteúdo serão removidos desta página. O template continua disponível.',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>removeBlock(b.id)}]);}
 function removeBlock(id:string){edit(d=>{const blocks=d.blocks.filter(b=>b.id!==id);return {...d,blocks:blocks.length?blocks:[newBlock()]};});setFocus(null);}
 function addBlock(){const block=newBlock();edit(d=>{const blocks=[...d.blocks],i=blocks.findIndex(b=>b.id===focus);blocks.splice(i>=0?i+1:blocks.length,0,block);return {...d,blocks};});setFocus(block.id);}
 function formatBlock(type:string){if(!entry)return;const id=focus&&focus!=='title'?focus:entry.draft.blocks.at(-1)?.id;if(!id)return;edit(d=>({...d,blocks:d.blocks.map(b=>b.id===id?{...b,type,...(b.text==='/'?{text:'',html:''}:{})}:b)}));}
 function resolveConflict(){if(!selectedId)return;const id=selectedId;appAlert('A página mudou no site','Seu rascunho local foi preservado. Qual versão deve continuar?',[
  {text:'Cancelar',style:'cancel'},{text:'Usar versão do site',onPress:()=>void store.resolve(id,false)},{text:'Manter minhas alterações',onPress:()=>void store.resolve(id,true)}]);}
 function confirmDeletePage(page:Entity){const id=page.id;appAlert('Excluir página?','Excluir “'+page.title+'” e suas subpáginas também do site?',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{void(async()=>{
  const ids=new Set<string>();const collect=(key:string)=>{if(ids.has(key))return;ids.add(key);for(const p of children.get(key)||[])collect(p.id);};collect(id);
  await Promise.all([...ids].map(key=>store.flush(key)));await api.deleteEntity(id);mutationEpoch.current++;for(const key of ids)store.forget(key);
  if(mounted.current){history.current=history.current.filter(key=>!ids.has(key));setPages(old=>old.filter(p=>!ids.has(p.id)));if(ids.has(selectedId||''))setSelectedId(null);setFocus(null);}
 })().catch(e=>setError(errorText(e)));}}]);}
 function removePage(){if(entry)confirmDeletePage(entry.base);}
 function blockView(b:PageBlock,i:number,preview=false,bodyGuide=showBodyGuide,blockFocus=focus){
  if(b.type==='divider')return <Pressable key={b.id} accessibilityLabel="Divisor" onPress={()=>{Keyboard.dismiss();setFocus(b.id);}} style={{paddingVertical:14,borderRadius:6,backgroundColor:focus===b.id?c.accentSoft:'transparent'}}><View style={{height:1,backgroundColor:c.line}}/></Pressable>;
  if(b.type==='image'&&b.data?.attachment_id)return <Pressable key={b.id} accessible={false} onPress={()=>{Keyboard.dismiss();setFocus(b.id);}} style={{marginVertical:8,borderRadius:8,borderWidth:2,borderColor:focus===b.id?c.accent:'transparent'}}><Image source={api.attachmentSource(String(b.data.attachment_id))} style={{width:'100%',height:210,borderRadius:8}} resizeMode="contain"/>{b.data.caption?<Text style={{color:c.muted,fontSize:12}}>{String(b.data.caption)}</Text>:null}</Pressable>;
  if(b.type==='collection')return <NativeCollectionBlock key={b.id} block={b} onChange={(data,group)=>updateBlock(b,{data},group)} onDelete={()=>confirmRemoveBlock(b)} onInteractionChange={changeKanbanInteraction}/>;
  if(['image','file','table','bookmark'].includes(b.type))return <Pressable key={b.id} accessible={false} onPress={()=>{Keyboard.dismiss();setFocus(b.id);}} style={{padding:12,borderRadius:8,backgroundColor:c.input,marginVertical:5,borderWidth:2,borderColor:focus===b.id?c.accent:'transparent'}}><Text style={{color:c.text,fontSize:13}}>{b.text||({table:'Tabela',image:'Imagem',file:'Arquivo',bookmark:'Link'} as Record<string,string>)[b.type]}</Text><Text style={{color:c.muted,fontSize:11,marginTop:4}}>Bloco preservado; edição completa no site.</Text>{(()=>{const link=String((b as any).url||'').trim()||(String(b.text||'').match(/https?:\/\/\S+/)||[''])[0];if(!link)return null;
   // 0.3.269: link numa Pagina vira item da Biblioteca (uma das entradas do fluxo de criar)
   return <Pressable accessibilityRole="button" testID={'page-link-to-library-'+b.id} onPress={()=>{void api.linkPreview(link).catch(()=>null).then(pv=>api.saveEntity({kind:'library_item',title:(pv?.title||String(b.text||'').replace(link,'').trim()||link).slice(0,240),content:'',area:'Biblioteca',privacy:'private',state:'saved',tags:[],data:{type:'reference',status:'0',url:pv?.url||link,site:pv?.site||'',cover_url:pv?.image||''}})).then(()=>appAlert('Biblioteca','Guardado na Biblioteca, em Referências.')).catch(e=>setError(errorText(e)));}} style={{alignSelf:'flex-start',marginTop:6}}><Text style={{color:c.accent,fontSize:12,fontWeight:'600'}}>Guardar na Biblioteca</Text></Pressable>;})()}</Pressable>;
  const heading=b.type==='heading1'?30:b.type==='heading2'?24:b.type==='heading3'?20:16;
  const prefix=b.type==='bullet'?'• ':b.type==='number'?String(listNumber(currentBlocks().length?currentBlocks():[b],currentBlocks().length?i:0)||i+1)+'. ':b.type==='quote'&&!desktop?'│ ':b.type==='callout'?'💡 ':'';
  const slashOpen=webKeys&&!preview&&slash?.id===b.id,menuOpen=desktop&&!preview&&blockMenu===b.id,lineH=heading+9;
  const slashItems=slashOpen&&slash?slashMatches(String(b.text||'').slice(slash.start+1,slash.caret)):[];
  return <Pressable key={b.id} accessible={false} testID={'page-block-'+b.id} style={{flexDirection:'row',alignItems:'flex-start',gap:b.type==='todo'?7:0,position:'relative',zIndex:slashOpen||menuOpen?50:0,...(desktop&&b.type==='callout'?{backgroundColor:c.input,borderRadius:6,paddingHorizontal:14,paddingVertical:10,marginVertical:4,gap:8}:{})}}>{({hovered}:any)=><>
   {desktop&&!preview?<View testID={'page-block-gutter-'+b.id} style={{position:'absolute',left:-48,top:Math.max(0,(lineH-26)/2)+4,flexDirection:'row',opacity:hovered||menuOpen?1:0}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Adicionar bloco abaixo" onPress={()=>insertWithSlash(b)} style={({hovered:h}:any)=>({width:22,height:26,borderRadius:5,alignItems:'center',justifyContent:'center',backgroundColor:h?c.input:'transparent'})}><Icon name="plus" size={15} color={c.muted}/></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Arraste para mover · clique para opções" ref={(n:any)=>bindGrip(n,b)} onPress={()=>{if(!dragMoved.current)setBlockMenu(m=>m===b.id?null:b.id);dragMoved.current=false;}} style={({hovered:h}:any)=>({width:20,height:26,borderRadius:5,alignItems:'center',justifyContent:'center',backgroundColor:h||menuOpen?c.input:'transparent'})}><Text style={{color:c.muted,fontSize:13,letterSpacing:-3,fontWeight:'700'}}>⋮⋮</Text></Pressable>
   </View>:null}
   {b.type==='todo'&&desktop?<Pressable accessibilityRole="checkbox" accessibilityLabel="Concluir tarefa" accessibilityState={{checked:!!b.checked}} onPress={()=>updateBlock(b,{checked:!b.checked})} style={{width:18,height:18,marginTop:(lineH-18)/2+4,borderRadius:4,borderWidth:1.5,borderColor:b.checked?c.accent:c.muted,backgroundColor:b.checked?c.accent:'transparent',alignItems:'center',justifyContent:'center'}}>{b.checked?<Icon name="check" size={12} color={c.onAccent}/>:null}</Pressable>
   :b.type==='todo'?<Switch accessibilityLabel="Concluir tarefa" value={!!b.checked} onValueChange={checked=>updateBlock(b,{checked})}/>:prefix?<Text style={{fontSize:heading,lineHeight:heading+9,color:c.muted,paddingTop:4}}>{prefix}</Text>:null}
   <TextInput scrollEnabled={false} editable={!preview} ref={node=>{if(preview)return;if(node)inputRefs.current.set(b.id,node);else inputRefs.current.delete(b.id);}} accessibilityLabel={'Conteúdo do bloco '+(i+1)} value={b.text||''} onChangeText={text=>onBlockText(b,text)} onKeyPress={preview?undefined:e=>onBlockKey(e,b)} {...(webKeys?({numberOfLines:1,dataSet:{pageBlock:!b.text&&!b.html&&!pageBlockHint(b,i,bodyGuide,blockFocus===b.id)&&blockFocus!==b.id?'collapsed':'open'}} as any):{})}
    onFocus={()=>setFocus(b.id)} onBlur={()=>{if(!preview&&selectedId)void store.flush(selectedId);if(webKeys)setTimeout(()=>setSlash(sl=>sl?.id===b.id&&domInput(b.id)!==(globalThis as any).document?.activeElement?null:sl),180);}} multiline placeholder={pageBlockHint(b,i,bodyGuide,blockFocus===b.id)} placeholderTextColor={placeholderColor}
    style={{flex:1,minHeight:(!b.text&&!b.html&&!pageBlockHint(b,i,bodyGuide,blockFocus===b.id)&&blockFocus!==b.id)?0:42,height:(!b.text&&!b.html&&!pageBlockHint(b,i,bodyGuide,blockFocus===b.id)&&blockFocus!==b.id)?0:undefined,color:c.text,fontSize:heading,lineHeight:heading+9,fontWeight:b.type.startsWith('heading')?'700':'400',paddingVertical:(!b.text&&!b.html&&!pageBlockHint(b,i,bodyGuide,blockFocus===b.id)&&blockFocus!==b.id)?0:4,fontFamily:b.type==='code'?'monospace':undefined,backgroundColor:b.type==='code'?c.input:'transparent',borderRadius:8,paddingHorizontal:b.type==='code'?10:0,...(desktop&&b.type==='quote'?{borderLeftWidth:3,borderLeftColor:c.text,borderRadius:0,paddingLeft:14,marginVertical:4}:{}),...(desktop&&b.type==='code'?{paddingVertical:14,paddingHorizontal:16,borderRadius:6,fontSize:13}:{}),...(b.type==='todo'&&b.checked&&desktop?{textDecorationLine:'line-through' as const,color:c.muted}:{})}}/>
   {slashOpen?<View testID="page-slash-menu" style={{position:'absolute',top:lineH+12,left:prefix||b.type==='todo'?24:0,width:310,maxHeight:360,backgroundColor:c.surface,borderRadius:10,borderWidth:1,borderColor:c.line,padding:6,shadowColor:'#000',shadowOpacity:0.28,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:12}}>
    <ScrollView ref={slashScroll} keyboardShouldPersistTaps="always">
     <Text style={{color:c.muted,fontSize:11,fontWeight:'500',paddingHorizontal:8,paddingTop:4,paddingBottom:6}}>{slash&&slash.caret>slash.start+1?'Resultados':'Blocos'}</Text>
     {slashItems.length?slashItems.map((it,k)=>{const on=k===Math.min(slash?.active||0,slashItems.length-1);return <Pressable key={it.type} accessibilityRole="menuitem" accessibilityLabel={it.label} onPressIn={()=>chooseSlash(b,it.type)} onHoverIn={()=>setSlash(sl=>sl&&sl.active!==k?{...sl,active:k}:sl)} style={{flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:6,paddingVertical:5,borderRadius:6,backgroundColor:on?c.input:'transparent'}}>
      <View style={{width:38,height:38,borderRadius:6,borderWidth:1,borderColor:c.line,backgroundColor:c.bg,alignItems:'center',justifyContent:'center'}}><Text style={{color:c.text,fontSize:13,fontWeight:'600'}}>{it.icon}</Text></View>
      <View style={{flex:1,minWidth:0}}><Text style={{color:c.text,fontSize:14}}>{it.label}</Text><Text numberOfLines={1} style={{color:c.muted,fontSize:12}}>{it.hint}</Text></View>
     </Pressable>;}):<Text style={{color:c.muted,fontSize:13,padding:8}}>Nenhum resultado</Text>}
    </ScrollView>
   </View>:null}
   {menuOpen?<View testID="page-block-menu" style={{position:'absolute',top:lineH+8,left:-48,width:230,maxHeight:380,backgroundColor:c.surface,borderRadius:10,borderWidth:1,borderColor:c.line,padding:6,shadowColor:'#000',shadowOpacity:0.28,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:12}}>
    <ScrollView keyboardShouldPersistTaps="handled">
     {([['Duplicar',()=>duplicateBlock(b.id)],['Mover para cima',()=>moveBlock(b.id,-1)],['Mover para baixo',()=>moveBlock(b.id,1)]] as const).map(([label,fn])=><Pressable key={label} accessibilityRole="menuitem" onPress={()=>{setBlockMenu(null);fn();}} style={({hovered:h}:any)=>({paddingHorizontal:10,paddingVertical:8,borderRadius:6,backgroundColor:h?c.input:'transparent'})}><Text style={{color:c.text,fontSize:13}}>{label}</Text></Pressable>)}
     <Text style={{color:c.muted,fontSize:11,fontWeight:'500',paddingHorizontal:10,paddingTop:8,paddingBottom:4}}>Transformar em</Text>
     {slashMatches('').filter(it=>TEXT_BLOCKS.has(it.type)&&it.type!==b.type).map(it=><Pressable key={it.type} accessibilityRole="menuitem" onPress={()=>{setBlockMenu(null);updateBlock(b,{type:it.type});}} style={({hovered:h}:any)=>({flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:10,paddingVertical:6,borderRadius:6,backgroundColor:h?c.input:'transparent'})}><Text style={{width:22,color:c.muted,fontSize:12,fontWeight:'600'}}>{it.icon}</Text><Text style={{color:c.text,fontSize:13}}>{it.label}</Text></Pressable>)}
     <Pressable accessibilityRole="menuitem" onPress={()=>{setBlockMenu(null);removeBlock(b.id);}} style={({hovered:h}:any)=>({paddingHorizontal:10,paddingVertical:8,borderRadius:6,marginTop:4,backgroundColor:h?c.input:'transparent'})}><Text style={{color:c.danger,fontSize:13}}>Excluir bloco</Text></Pressable>
    </ScrollView>
   </View>:null}
  </>}</Pressable>;
 }
 function documentContent(selected:Entity,draft:PageDraft,preview=false){
  const hasCover=!!draft.appearance.cover_type,subpages=children.get(selected.id)||[];
  const imageCover=draft.appearance.cover_type==='attachment'&&!!draft.appearance.cover_attachment_id;
  const emptyBody=pageBodyIsEmpty(draft.blocks),hasSubpageContent=!!subpages.length;
  const titleInput=<TextInput scrollEnabled={false} editable={!preview} accessibilityLabel="Título da página" {...(Platform.OS==='web'?{numberOfLines:1}:{})} value={draft.title==='Sem título'?'':draft.title} onChangeText={title=>edit(d=>({...d,title}),'title')} onFocus={()=>setFocus('title')} onBlur={()=>{if(!preview)void store.flush(selected.id);}} multiline placeholder={pageTitleHint(emptyBody,hasSubpageContent,!preview&&focus==='title')} placeholderTextColor={placeholderColor} style={{minHeight:60,fontSize:40,lineHeight:48,fontWeight:'700',letterSpacing:-1.2,color:c.text,paddingTop:8,paddingBottom:6}}/>;
  return <PageDocumentScroll key={selected.id} pageId={selected.id} preview={preview} enabled={!pageDragging&&!kanbanInteractionRef.current&&!coverMove} initialY={scrollPositions.current.get(selected.id)||0} onScrollY={y=>scrollPositions.current.set(selected.id,y)}>
   <View style={{height:hasCover?190:28,minHeight:desktop&&hasCover?250:undefined,overflow:'hidden',backgroundColor:hasCover?c.accentSoft:'transparent'}}>
    {!preview&&coverMove&&imageCover?<PageCover data={draft.appearance} api={api} repositioning onPosition={n=>{coverLive.current=n;}}/>
     // 0.3.267 (computador): como no Notion a capa não abre nada ao clicar; "Alterar capa" e "Reposicionar" aparecem no hover
     :desktop?(hasCover?<Pressable accessible={false} style={StyleSheet.absoluteFill}>{({hovered}:any)=><>
      <PageCover data={draft.appearance} api={api}/>
      {!preview&&!coverMove?<View style={{position:'absolute',right:16,bottom:12,flexDirection:'row',borderRadius:6,overflow:'hidden',backgroundColor:c.surface+'ee',opacity:hovered?1:0}}>
       <Pressable testID="page-cover-change" accessibilityRole="button" accessibilityLabel="Alterar capa" onPress={e=>openAppearance('cover',e)} style={({hovered:h}:any)=>({paddingHorizontal:10,paddingVertical:6,backgroundColor:h?c.input:'transparent'})}><Text style={{color:c.text,fontSize:12}}>Alterar capa</Text></Pressable>
       {imageCover?<Pressable testID="page-cover-reposition" accessibilityRole="button" accessibilityLabel="Reposicionar capa" onPress={startCoverMove} style={({hovered:h}:any)=>({paddingHorizontal:10,paddingVertical:6,borderLeftWidth:1,borderColor:c.line,backgroundColor:h?c.input:'transparent'})}><Text style={{color:c.text,fontSize:12}}>Reposicionar</Text></Pressable>:null}
      </View>:null}</>}</Pressable>:null)
     :<Pressable accessibilityRole="button" accessibilityLabel={hasCover?'Alterar capa':'Adicionar capa'} onPress={()=>setAppearance('cover')} style={StyleSheet.absoluteFill}>
     {hasCover?<PageCover data={draft.appearance} api={api}/>:<View style={{alignSelf:'flex-end',padding:12,opacity:.55}}><Icon name="image" size={20} color={c.muted}/></View>}
    </Pressable>}
    {/* 0.3.255: botao de reposicionar a capa */}
    {!preview&&!desktop&&imageCover&&!coverMove?<Pressable testID="page-cover-reposition" accessibilityRole="button" accessibilityLabel="Reposicionar capa" onPress={startCoverMove} style={{position:'absolute',right:12,bottom:12,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:11,paddingVertical:7,borderRadius:10,backgroundColor:PALETTE.black+'7a'}}><Icon name="move" size={14} color={PALETTE.white}/><Text style={{color:PALETTE.white,fontSize:12,fontWeight:'500'}}>Reposicionar</Text></Pressable>:null}
    {!preview&&imageCover&&coverMove?<><View pointerEvents="none" style={{position:'absolute',top:12,left:0,right:0,alignItems:'center'}}><View style={{paddingHorizontal:12,paddingVertical:6,borderRadius:10,backgroundColor:PALETTE.black+'a0'}}><Text style={{color:PALETTE.white,fontSize:12}}>Arraste a imagem para reposicionar</Text></View></View>
     <View style={{position:'absolute',right:12,bottom:12,flexDirection:'row',gap:8}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancelar reposicionamento" onPress={()=>setCoverMove(false)} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:10,backgroundColor:PALETTE.black+'a0'}}><Text style={{color:PALETTE.white,fontSize:12,fontWeight:'500'}}>Cancelar</Text></Pressable>
      <Pressable testID="page-cover-save-position" accessibilityRole="button" accessibilityLabel="Salvar posição da capa" onPress={saveCoverMove} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:10,backgroundColor:c.accent}}><Text style={{color:c.onAccent,fontSize:12,fontWeight:'600'}}>Salvar posição</Text></Pressable>
     </View></>:null}
   </View>
   <View style={desktop?{paddingHorizontal:48,marginTop:hasCover?-44:0,width:'100%',maxWidth:960,alignSelf:'center'}:{paddingHorizontal:30,marginTop:hasCover?-44:0}}>
    {/* 0.3.267 (computador): como no Notion, sem ícone não aparece o 📄; "Adicionar ícone" e "Adicionar capa" surgem ao passar o mouse */}
    {desktop?<Pressable accessible={false} testID="page-header">{({hovered}:any)=><>
     {draft.appearance.icon?<Pressable accessibilityRole="button" accessibilityLabel="Alterar ícone da página" onPress={e=>openAppearance('icon',e)} style={({hovered:h}:any)=>({width:82,height:82,marginLeft:-4,borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:h?c.input:'transparent'})}><Text style={{fontSize:56,lineHeight:78,color:c.text}}>{String(draft.appearance.icon)}</Text></Pressable>:<View style={{height:hasCover?50:24}}/>}
     {!preview?<View style={{flexDirection:'row',gap:2,height:30,marginTop:6,marginLeft:-6,opacity:hovered?1:0}}>
      {!draft.appearance.icon?<Pressable testID="page-add-icon" accessibilityRole="button" accessibilityLabel="Adicionar ícone" onPress={e=>openAppearance('icon',e)} style={({hovered:h}:any)=>({flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:6,borderRadius:6,backgroundColor:h?c.input:'transparent'})}><Text style={{fontSize:13}}>☺</Text><Text style={{color:c.muted,fontSize:13}}>Adicionar ícone</Text></Pressable>:null}
      {!hasCover?<Pressable testID="page-add-cover" accessibilityRole="button" accessibilityLabel="Adicionar capa" onPress={()=>{const pick=PAGE_COVERS[Math.floor(Math.random()*PAGE_COVERS.length)][1];store.edit(selected.id,d=>({...d,appearance:{...d.appearance,cover_type:'preset',cover_value:pick,cover_attachment_id:'',cover_position:''}}));void store.flush(selected.id);}} style={({hovered:h}:any)=>({flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:6,borderRadius:6,backgroundColor:h?c.input:'transparent'})}><Icon name="image" size={14} color={c.muted}/><Text style={{color:c.muted,fontSize:13}}>Adicionar capa</Text></Pressable>:null}
     </View>:null}
     {titleInput}
    </>}</Pressable>:<>
    <Pressable accessibilityRole="button" accessibilityLabel="Alterar ícone da página" onPress={()=>setAppearance('icon')} style={{width:78,height:78,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:56,color:c.text}}>{String(draft.appearance.icon||'📄')}</Text></Pressable>
    {titleInput}
    </>}
    {String(selected.data.purpose||'').trim()?<Text style={{fontSize:13,lineHeight:20,color:c.muted,marginBottom:12}}>{String(selected.data.purpose)}</Text>:null}
    <View testID={preview?undefined:"page-blocks"} style={{gap:2,position:'relative'}}>{draft.blocks.map((block,index)=><View key={block.id} style={{borderRadius:4,backgroundColor:!preview&&picked.has(block.id)?c.accentSoft:'transparent',opacity:dragging===block.id?0.4:1,zIndex:(slash?.id===block.id||blockMenu===block.id)?50:0}}>{blockView(block,index,preview,emptyBody&&!hasSubpageContent,preview?null:focus)}</View>)}
     {!preview&&drop?<View pointerEvents="none" testID="page-drop-line" style={{position:'absolute',left:0,right:0,top:drop.y-2,height:3,borderRadius:2,backgroundColor:c.accent}}/>:null}</View>
    <Pressable accessibilityLabel="Continuar escrevendo" onPress={()=>{const last=draft.blocks.at(-1);if(last&&['text','heading1','heading2','heading3','bullet','todo','number','quote','code','callout'].includes(last.type)){setFocus(last.id);inputRefs.current.get(last.id)?.focus();}else addBlock();}} style={{minHeight:18}}/>
    {subpages.length?<View style={{marginTop:2}}>
      <PageTreeList roots={subpages} children={children} expanded={expanded} toggle={toggle} onOpen={open} onMove={movePage} canParent={canParent} onDelete={confirmDeletePage} onInteractionChange={preview?undefined:changePageInteraction} onDragChange={preview?undefined:setPageDragging} compact/>
    </View>:null}
   </View>
  </PageDocumentScroll>;
 }
  const recentPages=useMemo(()=>[...displayPages].filter(p=>p.kind==='user_page'&&p.state!=='archived').sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||''))).slice(0,6),[displayPages]);
 const listView=<PageTreeList roots={orderReady?children.get('')||[]:[]} children={children} expanded={expanded} toggle={toggle} onOpen={open} onMove={movePage} canParent={canParent} onDelete={confirmDeletePage} onInteractionChange={changePageInteraction} onDragChange={setPageDragging}
  virtualized scrollEnabled={!pageDragging}
  refreshControl={<RefreshControl enabled={!pageInteraction&&!selectedId} refreshing={refreshing} onRefresh={refreshPages} tintColor={c.accent}/>}
  header={<>
  <ScreenTitle title="Páginas" right={<IconButton name="plus" label="Criar página" disabled={!ready} onPress={()=>setCreateParent(null)}/>}/>
  {api.mdLocalOnly?<Text style={{paddingHorizontal:20,paddingBottom:8,color:c.muted,fontSize:10}}>Ordem salva neste aparelho. A hierarquia e o conteúdo continuam sincronizados.</Text>:null}
  {error?<ErrorBanner text={error} onRetry={()=>void load()}/>:null}
  {/* 0.3.262 (fase 3 — Paginas): no computador, as paginas mexidas por ultimo em cartoes no topo (voltar ao que se estava
      fazendo e um clique); a arvore completa continua logo abaixo, com titulo de secao. */}
  {desktop&&orderReady&&recentPages.length?<View testID="pages-recent" style={{paddingHorizontal:20,paddingBottom:18,gap:12}}>
   <Text style={{color:c.muted,fontSize:12,fontWeight:'600'}}>Recentes</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{recentPages.map(p=><Pressable key={p.id} accessibilityRole="button" accessibilityLabel={'Abrir '+p.title} onPress={()=>open(p)} style={({hovered}:any)=>({width:216,minHeight:112,padding:14,borderRadius:14,borderWidth:1,borderColor:hovered?c.accent:c.line,backgroundColor:c.surface,gap:8,justifyContent:'space-between'})}>
    {p.data?.icon&&p.data?.icon_mode!=='image'?<Text style={{fontSize:24}}>{String(p.data.icon)}</Text>:<Icon name="note" size={22} color={c.accent} weight="duotone"/>}
    <View style={{gap:2}}><Text numberOfLines={2} style={{color:c.text,fontWeight:'600',fontSize:14,lineHeight:19}}>{p.title||'Sem título'}</Text><Text style={{color:c.muted,fontSize:11}}>{p.updated_at?'Editada '+new Date(p.updated_at).toLocaleDateString('pt-BR',{day:'numeric',month:'short'}):''}</Text></View>
   </Pressable>)}</View>
   <Text style={{color:c.muted,fontSize:12,fontWeight:'600',marginTop:10}}>Todas as páginas</Text>
  </View>:null}
  {/* 03/11/2026 (desenho 36): no celular, "Recentes" em cartoezinhos que rolam para o lado (dentro do bloco, a tela nao
      rola de lado) e o rotulo "Todas as paginas" em cima da arvore. Recusado: cartao grande "abriu por ultimo". */}
  {!desktop&&orderReady&&recentPages.length>1?<View testID="pages-recent-phone" style={{paddingBottom:6}}>
   <Text style={{paddingHorizontal:16,color:c.muted,fontSize:11,fontWeight:'600',letterSpacing:0.5,paddingBottom:8}}>RECENTES</Text>
   <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:16,gap:10}}>{recentPages.map(p=><Pressable key={p.id} accessibilityRole="button" accessibilityLabel={'Abrir recente '+(p.title||'Sem título')} onPress={()=>open(p)} style={({pressed}:any)=>({width:120,padding:12,borderRadius:14,backgroundColor:c.surface,borderWidth:1,borderColor:c.line,gap:8,opacity:pressed?0.7:1})}>
    {p.data?.icon&&p.data?.icon_mode!=='image'?<Text style={{fontSize:20}}>{String(p.data.icon)}</Text>:<Icon name="note" size={20} color={c.accent} weight="duotone"/>}
    <Text numberOfLines={2} style={{color:c.text,fontWeight:'600',fontSize:13,lineHeight:17}}>{p.title||'Sem título'}</Text>
   </Pressable>)}</ScrollView>
   <Text style={{paddingHorizontal:16,color:c.muted,fontSize:11,fontWeight:'600',letterSpacing:0.5,paddingTop:16,paddingBottom:4}}>TODAS AS PÁGINAS</Text>
  </View>:null}
  </>}
  footer={<>
  {/* Também antes do 'ready' (enquanto as páginas guardadas no aparelho são lidas): antes ficava em branco. */}{((!ready||!loaded)&&!error&&!pages.length)||(!orderReady&&pages.length>0)?<View testID="pages-loading-placeholder" accessibilityLabel="Carregando páginas" style={{minHeight:80,paddingHorizontal:4,gap:4}}><View style={{flexDirection:'row',alignItems:'center',gap:10,paddingTop:6}}><Spinner size={16} stroke={1.8}/><Text style={{color:c.muted,fontSize:13}}>Carregando páginas</Text></View><LoadingLines rows={4}/></View>:null}
  {ready&&loaded&&!pages.length&&!error?<Empty icon="book" title="Sua primeira página" body={tap("Um lugar para ideias, roteiros e anotações. Toque em + para começar.")}/>:null}
  </>}/>;
 const createPicker=<PageCreateMenu visible={createParent!==undefined} parentTitle={createParent?.title} onClose={()=>setCreateParent(undefined)}
  onBlank={()=>void create(createParent||undefined)} onTemplate={template=>selectedId?applyTemplate(template):void create(undefined,template)}/>;
 if(!entry)return <View style={{flex:1}} onTouchEnd={e=>{if(e.nativeEvent.touches.length===0)endPageTouch();}} onTouchCancel={endPageTouch} onLayout={e=>{paneWidth.current=e.nativeEvent.layout.width;}}>{desktop?<ContentWidth.Provider value={980}>{listView}</ContentWidth.Provider>:listView}{createPicker}</View>;
 const draft=entry.draft,selected={...entry.base,data:{...entry.base.data,...draft.appearance}},subpages=children.get(selected.id)||[];
 const path:Entity[]=[];let cur:Entity|undefined=selected;const seen=new Set<string>();while(cur&&!seen.has(cur.id)&&path.length<40){seen.add(cur.id);path.unshift(cur);cur=byId.get(String(cur.data?.parent_id||''));}
 const status=entry.state==='saving'?'Salvando…':entry.state==='pending'?'Sincronizando…':entry.state==='error'?'Não salvo':entry.state==='conflict'?'Conflito':selected.privacy==='private'?'Particular':selected.area;
 const hasCover=!!draft.appearance.cover_type;
 const editor=<View style={{flex:1,backgroundColor:c.bg,overflow:'hidden'}}>
  {/* 0.3.263 (fase 3 — Paginas no computador): o caminho e o titulo ja estao na barra de cima; aqui fica uma faixa fina so com o
      estado (salvo, salvando) e as ferramentas, sem fundo de cartao - o documento ocupa a cena, como no Notion. */}
  <View style={desktop?{zIndex:20,minHeight:40,flexDirection:'row',alignItems:'center',paddingHorizontal:16}:{zIndex:20,elevation:5,minHeight:54,flexDirection:'row',alignItems:'center',paddingHorizontal:4,borderBottomWidth:1,borderColor:c.line,backgroundColor:c.surface}}>
   {desktop?null:<IconButton name="back" label="Voltar" size={34} onPress={back}/>}
   <View style={{flex:1,minWidth:0,paddingHorizontal:5}}>{desktop?null:<Text numberOfLines={1} style={{color:c.text,fontSize:16,fontWeight:'600'}}>{selected.title}</Text>}<Text accessibilityLiveRegion="polite" style={{color:entry.state==='error'||entry.state==='conflict'?c.danger:c.muted,fontSize:desktop?12:10,marginTop:desktop?0:3}}>{status}</Text></View>
   <View testID="page-tools-right" style={{flexDirection:'row',alignItems:'center',flexShrink:0}}>
    <IconButton name="undo" label="Desfazer" size={34} disabled={!entry.past.length} onPress={()=>store.undo(selected.id)}/>
    <IconButton name="redo" label="Refazer" size={34} disabled={!entry.future.length} onPress={()=>store.redo(selected.id)}/>
    <IconButton name="more" label="Opções da página" size={34} onPress={()=>{if(!desktop){setPageMenu(true);return;}
     // 0.3.267 (computador): menu pequeno junto do ⋯, como no Notion (antes: painel de baixo na largura toda)
     const vw=typeof window!=='undefined'?window.innerWidth:1200,imageCoverNow=draft.appearance.cover_type==='attachment'&&!!draft.appearance.cover_attachment_id,blk=focus?draft.blocks.find(x=>x.id===focus):undefined;
     openContextMenu(vw-236,92,[{label:'Nova subpágina ou template',icon:'plus',run:()=>setCreateParent(selected)},{label:draft.appearance.icon?'Alterar ícone':'Adicionar ícone',icon:'sparkle',run:()=>{appearanceAnchor.current={x:vw-460,y:92};setAppearance('icon');}},{label:hasCover?'Alterar capa':'Adicionar capa',icon:'image',run:()=>{appearanceAnchor.current={x:vw-480,y:92};setAppearance('cover');}},
      ...(imageCoverNow?[{label:'Reposicionar capa',icon:'move' as const,run:startCoverMove}]:[]),...(blk?[{label:'Remover bloco selecionado',icon:'trash' as const,run:()=>confirmRemoveBlock(blk)}]:[]),{label:'Excluir página',icon:'trash',danger:true,run:removePage}]);}}/>
   </View>
  </View>
  {/* 0.3.230: opcoes da pagina no ⋯ do topo, como no Notion (antes: icones soltos e "segure para excluir" nos blocos) */}
  <Sheet visible={pageMenu} onClose={()=>setPageMenu(false)} label="Fechar opções da página">
   <Text style={{fontSize:20,fontWeight:'600',color:c.text,marginBottom:12}}>{selected.title||'Página'}</Text>
   <Button title="Nova subpágina ou template" secondary onPress={()=>{setPageMenu(false);setTimeout(()=>setCreateParent(selected),120);}}/><View style={{height:8}}/>
   <Button title="Ícone" secondary onPress={()=>{setPageMenu(false);setTimeout(()=>setAppearance('icon'),120);}}/><View style={{height:8}}/>
   <Button title={hasCover?'Alterar capa':'Adicionar capa'} secondary onPress={()=>{setPageMenu(false);setTimeout(()=>setAppearance('cover'),120);}}/>
   {draft.appearance.cover_type==='attachment'&&draft.appearance.cover_attachment_id?<><View style={{height:8}}/><Button title="Reposicionar capa" secondary onPress={()=>{setPageMenu(false);setTimeout(startCoverMove,120);}}/></>:null}
   {focus&&draft.blocks.some(x=>x.id===focus)?<><View style={{height:8}}/><Button title="Remover bloco selecionado" secondary onPress={()=>{const blk=draft.blocks.find(x=>x.id===focus);setPageMenu(false);if(blk)setTimeout(()=>confirmRemoveBlock(blk),120);}}/></>:null}
   <Pressable accessibilityRole="button" onPress={()=>{setPageMenu(false);setTimeout(removePage,120);}} style={{paddingVertical:18}}><Text style={{color:c.danger,fontWeight:'600'}}>Excluir página</Text></Pressable>
  </Sheet>
  {error?<ErrorBanner text={error}/>:null}{entry.error?<ErrorBanner text={entry.error} onRetry={entry.state==='conflict'?resolveConflict:()=>void store.flush(selected.id)}/>:null}
  {documentContent(selected,draft)}
  <KeyboardToolbar visible={keyboardVisible&&!!focus&&focus!=='title'} testID="page-format-toolbar"><View style={{backgroundColor:c.surface,borderTopWidth:1,borderColor:c.line}}><ScrollView onScroll={noteFluencyMovement} scrollEventThrottle={100} horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false}>    <View style={{flexDirection:'row',alignItems:'center',flexWrap:'nowrap',gap:4,paddingVertical:8}}>
     <IconButton name="plus" label="Adicionar bloco" size={34} onPress={addBlock}/>
     {([['text','Texto'],['heading2','Título'],['bullet','Lista'],['todo','Tarefa'],['divider','Divisor']] as const).map(([type,label])=><Pressable key={type} accessibilityRole="button" onPress={()=>formatBlock(type)} style={{paddingHorizontal:9,paddingVertical:9,borderRadius:8,backgroundColor:c.input}}><Text style={{fontSize:11,color:c.muted}}>{label}</Text></Pressable>)}
     <IconButton name="trash" label="Remover bloco selecionado" size={34} onPress={()=>{const b=entry.draft.blocks.find(b=>b.id===focus);if(b)confirmRemoveBlock(b);}}/>
    </View>
</ScrollView></View></KeyboardToolbar>
  <Presence>{appearance?<PageAppearance key={selected.id+appearance} api={api} pageId={selected.id} kind={appearance} anchor={appearanceAnchor.current} current={draft.appearance} onClose={()=>setAppearance(null)} onApply={patch=>{const reset='cover_type' in patch||'cover_attachment_id' in patch?{cover_position:''}:{};store.edit(selected.id,d=>({...d,appearance:{...d.appearance,...reset,...patch}}));void store.flush(selected.id);}}/>:null}</Presence>
 </View>;
 return <View style={{flex:1,backgroundColor:c.bg}} onTouchEnd={e=>{if(e.nativeEvent.touches.length===0)endPageTouch();}} onTouchCancel={endPageTouch} onLayout={e=>{paneWidth.current=e.nativeEvent.layout.width;}}>
  <KeyboardViewport>{editor}</KeyboardViewport>
  {createPicker}
 </View>;
}

/** Preserve each page's viewport, and keep preview/editor native text metrics identical. */
function PageDocumentScroll({pageId,preview,enabled,initialY,onScrollY,children}:{pageId:string;preview:boolean;enabled:boolean;initialY:number;onScrollY:(y:number)=>void;children:React.ReactNode}){
 const initialOffset=useRef({x:0,y:initialY}).current;
 return <ScrollView testID={(preview?'page-preview-':'page-document-')+pageId} scrollEnabled={!preview&&enabled} contentOffset={initialOffset} onScroll={preview?undefined:e=>{noteFluencyMovement();onScrollY(e.nativeEvent.contentOffset.y);}} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:60}}>{children}</ScrollView>;
}
