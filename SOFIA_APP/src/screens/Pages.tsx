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
import {Button,Empty,ErrorBanner,IconButton,ScreenTitle} from '../components/UI';
import {Sheet} from '../components/Sheet';
import {PageRefreshGuard} from '../lib/page-gesture';
import {mergeRemotePages} from '../lib/page-sync';
import {entryBackTarget} from '../lib/page-navigation';
import {Icon} from '../components/Icon';
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
  if(['image','file','table','bookmark'].includes(b.type))return <Pressable key={b.id} accessible={false} onPress={()=>{Keyboard.dismiss();setFocus(b.id);}} style={{padding:12,borderRadius:8,backgroundColor:c.input,marginVertical:5,borderWidth:2,borderColor:focus===b.id?c.accent:'transparent'}}><Text style={{color:c.text,fontSize:13}}>{b.text||({table:'Tabela',image:'Imagem',file:'Arquivo',bookmark:'Link'} as Record<string,string>)[b.type]}</Text><Text style={{color:c.muted,fontSize:11,marginTop:4}}>Bloco preservado; edição completa no site.</Text></Pressable>;
  const heading=b.type==='heading1'?30:b.type==='heading2'?24:b.type==='heading3'?20:16;
  const prefix=b.type==='bullet'?'• ':b.type==='number'?String(i+1)+'. ':b.type==='quote'?'│ ':b.type==='callout'?'💡 ':'';
  return <Pressable key={b.id} accessible={false} style={{flexDirection:'row',alignItems:'flex-start',gap:b.type==='todo'?7:0}}>
   {b.type==='todo'?<Switch accessibilityLabel="Concluir tarefa" value={!!b.checked} onValueChange={checked=>updateBlock(b,{checked})}/>:prefix?<Text style={{fontSize:heading,lineHeight:heading+9,color:c.muted,paddingTop:4}}>{prefix}</Text>:null}
   <TextInput scrollEnabled={false} editable={!preview} ref={node=>{if(preview)return;if(node)inputRefs.current.set(b.id,node);else inputRefs.current.delete(b.id);}} accessibilityLabel={'Conteúdo do bloco '+(i+1)} value={b.text||''} onChangeText={text=>updateBlock(b,{text,html:''},'text:'+b.id)}
    onFocus={()=>setFocus(b.id)} onBlur={()=>{if(!preview&&selectedId)void store.flush(selectedId);}} multiline placeholder={pageBlockHint(b,i,bodyGuide,blockFocus===b.id)} placeholderTextColor={placeholderColor}
    style={{flex:1,minHeight:(!b.text&&!b.html&&!pageBlockHint(b,i,bodyGuide,blockFocus===b.id)&&blockFocus!==b.id)?0:42,height:(!b.text&&!b.html&&!pageBlockHint(b,i,bodyGuide,blockFocus===b.id)&&blockFocus!==b.id)?0:undefined,color:c.text,fontSize:heading,lineHeight:heading+9,fontWeight:b.type.startsWith('heading')?'700':'400',paddingVertical:(!b.text&&!b.html&&!pageBlockHint(b,i,bodyGuide,blockFocus===b.id)&&blockFocus!==b.id)?0:4,fontFamily:b.type==='code'?'monospace':undefined,backgroundColor:b.type==='code'?c.input:'transparent',borderRadius:8,paddingHorizontal:b.type==='code'?10:0}}/>
  </Pressable>;
 }
 function documentContent(selected:Entity,draft:PageDraft,preview=false){
  const hasCover=!!draft.appearance.cover_type,subpages=children.get(selected.id)||[];
  const imageCover=draft.appearance.cover_type==='attachment'&&!!draft.appearance.cover_attachment_id;
  const emptyBody=pageBodyIsEmpty(draft.blocks),hasSubpageContent=!!subpages.length;
  return <PageDocumentScroll key={selected.id} pageId={selected.id} preview={preview} enabled={!pageDragging&&!kanbanInteractionRef.current&&!coverMove} initialY={scrollPositions.current.get(selected.id)||0} onScrollY={y=>scrollPositions.current.set(selected.id,y)}>
   <View style={{height:hasCover?190:28,minHeight:desktop&&hasCover?250:undefined,overflow:'hidden',backgroundColor:hasCover?c.accentSoft:'transparent'}}>
    {!preview&&coverMove&&imageCover?<PageCover data={draft.appearance} api={api} repositioning onPosition={n=>{coverLive.current=n;}}/>:<Pressable accessibilityRole="button" accessibilityLabel={hasCover?'Alterar capa':'Adicionar capa'} onPress={()=>setAppearance('cover')} style={StyleSheet.absoluteFill}>
     {hasCover?<PageCover data={draft.appearance} api={api}/>:<View style={{alignSelf:'flex-end',padding:12,opacity:.55}}><Icon name="image" size={20} color={c.muted}/></View>}
    </Pressable>}
    {/* 0.3.255: botao de reposicionar a capa */}
    {!preview&&imageCover&&!coverMove?<Pressable testID="page-cover-reposition" accessibilityRole="button" accessibilityLabel="Reposicionar capa" onPress={startCoverMove} style={{position:'absolute',right:12,bottom:12,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:11,paddingVertical:7,borderRadius:10,backgroundColor:PALETTE.black+'7a'}}><Icon name="move" size={14} color={PALETTE.white}/><Text style={{color:PALETTE.white,fontSize:12,fontWeight:'500'}}>Reposicionar</Text></Pressable>:null}
    {!preview&&imageCover&&coverMove?<><View pointerEvents="none" style={{position:'absolute',top:12,left:0,right:0,alignItems:'center'}}><View style={{paddingHorizontal:12,paddingVertical:6,borderRadius:10,backgroundColor:PALETTE.black+'a0'}}><Text style={{color:PALETTE.white,fontSize:12}}>Arraste a imagem para reposicionar</Text></View></View>
     <View style={{position:'absolute',right:12,bottom:12,flexDirection:'row',gap:8}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancelar reposicionamento" onPress={()=>setCoverMove(false)} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:10,backgroundColor:PALETTE.black+'a0'}}><Text style={{color:PALETTE.white,fontSize:12,fontWeight:'500'}}>Cancelar</Text></Pressable>
      <Pressable testID="page-cover-save-position" accessibilityRole="button" accessibilityLabel="Salvar posição da capa" onPress={saveCoverMove} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:10,backgroundColor:c.accent}}><Text style={{color:c.onAccent,fontSize:12,fontWeight:'600'}}>Salvar posição</Text></Pressable>
     </View></>:null}
   </View>
   <View style={desktop?{paddingHorizontal:48,marginTop:hasCover?-44:0,width:'100%',maxWidth:960,alignSelf:'center'}:{paddingHorizontal:30,marginTop:hasCover?-44:0}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Alterar ícone da página" onPress={()=>setAppearance('icon')} style={{width:78,height:78,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:56,color:c.text}}>{String(draft.appearance.icon||'📄')}</Text></Pressable>
    <TextInput scrollEnabled={false} editable={!preview} accessibilityLabel="Título da página" {...(Platform.OS==='web'?{numberOfLines:1}:{})} value={draft.title==='Sem título'?'':draft.title} onChangeText={title=>edit(d=>({...d,title}),'title')} onFocus={()=>setFocus('title')} onBlur={()=>{if(!preview)void store.flush(selected.id);}} multiline placeholder={pageTitleHint(emptyBody,hasSubpageContent,!preview&&focus==='title')} placeholderTextColor={placeholderColor} style={{minHeight:60,fontSize:40,lineHeight:48,fontWeight:'700',letterSpacing:-1.2,color:c.text,paddingTop:8,paddingBottom:6}}/>
    {String(selected.data.purpose||'').trim()?<Text style={{fontSize:13,lineHeight:20,color:c.muted,marginBottom:12}}>{String(selected.data.purpose)}</Text>:null}
    <View style={{gap:2}}>{draft.blocks.map((block,index)=>blockView(block,index,preview,emptyBody&&!hasSubpageContent,preview?null:focus))}</View>
    <Pressable accessibilityLabel="Continuar escrevendo" onPress={()=>{const last=draft.blocks.at(-1);if(last&&['text','heading1','heading2','heading3','bullet','todo','number','quote','code','callout'].includes(last.type)){setFocus(last.id);inputRefs.current.get(last.id)?.focus();}else addBlock();}} style={{minHeight:18}}/>
    {subpages.length?<View style={{marginTop:2}}>
      <PageTreeList roots={subpages} children={children} expanded={expanded} toggle={toggle} onOpen={open} onMove={movePage} canParent={canParent} onDelete={confirmDeletePage} onInteractionChange={preview?undefined:changePageInteraction} onDragChange={preview?undefined:setPageDragging} compact/>
    </View>:null}
   </View>
  </PageDocumentScroll>;
 }
  const recentPages=useMemo(()=>desktop?[...displayPages].filter(p=>p.kind==='user_page'&&p.state!=='archived').sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||''))).slice(0,6):[],[desktop,displayPages]);
 const listView=<PageTreeList roots={orderReady?children.get('')||[]:[]} children={children} expanded={expanded} toggle={toggle} onOpen={open} onMove={movePage} canParent={canParent} onDelete={confirmDeletePage} onInteractionChange={changePageInteraction} onDragChange={setPageDragging}
  virtualized scrollEnabled={!pageDragging}
  refreshControl={<RefreshControl enabled={!pageInteraction&&!selectedId} refreshing={refreshing} onRefresh={refreshPages} tintColor={c.accent}/>}
  header={<>
  <ScreenTitle title="Páginas" eyebrow="IDEIAS · NOTAS · SEUS ESPAÇOS" right={<IconButton name="plus" label="Criar página" filled disabled={!ready} onPress={()=>setCreateParent(null)}/>}/>
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
    <IconButton name="more" label="Opções da página" size={34} onPress={()=>setPageMenu(true)}/>
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
  <Presence>{appearance?<PageAppearance key={selected.id+appearance} api={api} pageId={selected.id} kind={appearance} onClose={()=>setAppearance(null)} onApply={patch=>{const reset='cover_type' in patch||'cover_attachment_id' in patch?{cover_position:''}:{};store.edit(selected.id,d=>({...d,appearance:{...d.appearance,...reset,...patch}}));void store.flush(selected.id);}}/>:null}</Presence>
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
