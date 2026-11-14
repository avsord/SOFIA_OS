import {EMBED} from '../lib/embed'; // 08/11/2026: pagina dentro do Quadro (sem barra lateral nem barra de cima)
import {DRIVE_APP} from '../lib/features';
import {DriveWindowHost,openDriveWindow,closeDriveWindow,useDriveWindowOpen} from '../components/DriveWindow';
import {uiScale} from '../web/desktop-scale';
import {LoadingLines} from '../components/Loading';
// 0.3.250: moldura do app no computador (estilo Notion). So e usada no navegador com tela larga
import {PALETTE} from '../lib/palette';
import type {Task} from '../lib/types';
// (ver lib/desktop.ts). Barra lateral fixa e recolhivel, barra de cima com caminho, busca e avisos,
// busca global (Ctrl+K) e atalhos de teclado. As telas sao as mesmas do celular.
import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Modal,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {Icon,type IconName} from '../components/Icon';
import {NotificationBell} from '../components/NotificationCenter';
import {ProfileAvatar} from '../components/ProfileAvatar';
import {fuzzyFilter} from '../lib/fuzzy';
import {comparePageOrder} from '../lib/page-order';
import {clonePageTree,cloneOrder,type CloneMode} from '../lib/page-clone';
import {pageUndo,pageSpot,type PageSpot} from '../lib/page-undo'; // 13/11/2026: Ctrl+Z na barra das Paginas
import {trashPageTree,restorePageTree,staleTrash} from '../lib/page-trash';
import {moveNoteToPage} from '../lib/notes-move';
import {DEFAULT_SHORTCUT_COLOR,SHORTCUT_COLORS,pageShortcuts,requestOpenShortcut,requestShortcutColor,shortcutsFor,useLiveShortcuts} from '../lib/note-shortcuts'; // 14/11/2026: atalhos de nota/pasta // 13/11/2026: nota arrastada para uma pagina da barra
import {useToast} from '../components/AppKit';
import {openContextMenu,contextMenu} from '../components/ContextMenu';
import type {MenuItem} from '../components/ContextMenu';
import {appAlert} from '../lib/app-alert';
import {systemChanged,subscribeSystemChanged} from '../lib/system-events';
import {useHoverHold} from '../lib/hover-hold';
import {agendaPriority} from '../lib/agenda-priority';
import {prefetchAllCovers,prefetchPageCover} from '../lib/page-cover-prefetch';
import {refreshSharedPages} from '../components/PageSharePanel';
import {eventStart,expandForHome} from '../lib/agenda-recurrence';
import {TAB_ORDER} from '../lib/tab-navigation';
import type {SofiaApi} from '../lib/api';
import type {Entity,Tab} from '../lib/types';
import {APP_SHORTCUTS,SIDEBAR_COLLAPSED,SIDEBAR_WIDTH,useSidebarWidth,appModuleTitle,createdPage,favoritePages,sharedPages,pagePath,pagesDirectory,samePages,useDesktopCss,useDesktopKeys,useSidebarCollapsed,useStore} from '../lib/desktop';

export const TAB_LABELS:Record<string,{label:string;icon:IconName}>={home:{label:'Início',icon:'home'},chat:{label:'Conversa',icon:'sofia'},pages:{label:'Páginas',icon:'book'},agenda:{label:'Agenda',icon:'calendar'},apps:{label:'Apps',icon:'grid'},profile:{label:'Perfil',icon:'user'},notifications:{label:'Notificações',icon:'bell'}};
const isEmoji=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=8&&!/^[a-z0-9_-]+$/i.test(v);

type Props={
 api:SofiaApi;tab:Tab;locked:boolean;profile:{name:string;email:string};
 onNavigate:(tab:Tab)=>void;onOpenModule:(id:string)=>void;onOpenPage:(id:string)=>void;onCreatePage:()=>void;
 children:React.ReactNode;
};

/** Le as paginas para a arvore da barra lateral sem esperar a aba Paginas abrir. */
const SIDE_FADE=StyleSheet.create({in:{animationKeyframes:{'0%':{opacity:0},'100%':{opacity:1}},animationDuration:'260ms',animationTimingFunction:'ease-out',animationFillMode:'both'} as any});
let trashSwept=false;
function usePageDirectory(api:SofiaApi){
 const all=useStore(pagesDirectory);
 // 08/11/2026 (Pedro: "se adiciono uma pagina pra dentro [do Quadro] nao duplica ali nas abas"): copia de Quadro fica so no Quadro
 const pages=useMemo(()=>all?all.filter(p=>!(p.tags||[]).includes('board-copy')):all,[all]);
 // layout effect: o pedido das Paginas sai ANTES dos pedidos do Inicio (efeitos comuns dos filhos rodam primeiro)
 useLayoutEffect(()=>{
  let live=true;
  async function load(){
   try{
    const items:Entity[]=[],seen:Entity[]=[];let complete=false;
    for(let offset=0;offset<3000;offset+=100){const r=await api.entities('user_page','',offset);items.push(...r.items.filter(x=>x.state!=='archived'));seen.push(...r.items);if(r.items.length<100){complete=true;break;}}
    const stale=complete?staleTrash(seen):[]; // so com a lista inteira (ver staleTrash)
     if(live&&!trashSwept){trashSwept=true;for(const x of stale.slice(0,5))void api.deleteEntity(x.id).catch(()=>{/* tenta na proxima abertura */});} // lixeira com mais de 30 dias
    if(live&&!samePages(pagesDirectory.get(),items))pagesDirectory.set(items);
    if(live)api.webKeep?.('pages',items.map(x=>({id:x.id,kind:x.kind,title:x.title,state:x.state,tags:(x.tags||[]).filter(t=>t==='board-copy'),data:{icon:x.data?.icon,parent_id:x.data?.parent_id,sort_order:x.data?.sort_order,note_shortcuts:pageShortcuts(x)}})));
   }catch{/* a aba Paginas mostra o erro; a barra lateral so fica com o que ja tem */}
  }
  void load();
  const focus=()=>void load();
  if(typeof window!=='undefined')window.addEventListener('focus',focus);
  return()=>{live=false;if(typeof window!=='undefined')window.removeEventListener('focus',focus);};
 },[api]);
 return pages;
}

function Row({dot,onDot,small,onAuxOpen,icon,emoji,label,selected,onPress,depth=0,collapsed,trailing,onToggle,expanded,hasChildren,hint,testID,menu,onAdd,drop,dragRef,dimmed,onHover}:{dot?:string;onDot?:(e:any)=>void;small?:boolean;onAuxOpen?:()=>void;icon?:IconName;emoji?:string;label:string;selected?:boolean;onPress:(e?:any)=>void;depth?:number;collapsed?:boolean;trailing?:string;onToggle?:()=>void;expanded?:boolean;hasChildren?:boolean;hint?:string;testID?:string;menu?:()=>MenuItem[];onAdd?:()=>void;drop?:'before'|'after'|'inside'|null;dragRef?:(node:any)=>void;dimmed?:boolean;onHover?:()=>void}){
 const c=useTheme(),hold=useHoverHold(),hover=hold.on;
 return <Pressable ref={dragRef as any} testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:!!selected}} onPress={onPress} {...(onAuxOpen?{onAuxClick:(e:any)=>{if(e?.button===1||e?.nativeEvent?.button===1){e.preventDefault?.();onAuxOpen();}},onMouseDown:(e:any)=>{if(e?.button===1)e.preventDefault?.();}}:{})} onHoverIn={()=>{hold.enter();onHover?.();}} onHoverOut={hold.leave} {...(menu?contextMenu(menu):{})}
  style={({hovered}:any)=>({flexDirection:'row',alignItems:'center',gap:8,minHeight:small?26:32,paddingLeft:collapsed?0:8+depth*14,paddingRight:8,justifyContent:collapsed?'center':'flex-start',marginHorizontal:8,borderRadius:8,backgroundColor:drop==='inside'?c.accent+'40':selected?c.accentSoft:hovered?c.line+'80':'transparent',opacity:dimmed?0.45:1,position:'relative'})}>
  {drop==='before'||drop==='after'?<View pointerEvents="none" testID="sidebar-drop-line" style={{position:'absolute',left:8+depth*14,right:4,height:3,borderRadius:2,backgroundColor:c.accent,...(drop==='before'?{top:-2}:{bottom:-2})}}><View style={{position:'absolute',left:-4,top:-3,width:9,height:9,borderRadius:5,borderWidth:2,borderColor:c.accent,backgroundColor:c.bg}}/></View>:null}
  {/* 06/11/2026 (Pedro: "se nao tem subpagina nao tem porque ter esse pra abrir"): sem subpaginas a seta some (fica so o espaco, para alinhar) */}
  {onToggle&&!hasChildren?<View style={{width:16,height:16}}/>:null}
  {onToggle&&hasChildren?<Pressable accessibilityRole="button" accessibilityLabel={(expanded?'Recolher ':'Abrir ')+label} onPress={onToggle} hitSlop={6} style={{width:16,height:16,alignItems:'center',justifyContent:'center',opacity:hasChildren?1:0.35}}><View style={{...({transitionProperty:'transform',transitionDuration:'160ms',transitionTimingFunction:'ease-out'} as any),transform:[{rotate:expanded?'90deg':'0deg'}]}}><Icon name="chevron" size={13} color={c.muted}/></View></Pressable>:null}
  {dot?<Pressable testID={testID?testID+'-cor':undefined} accessibilityRole="button" accessibilityLabel={'Cor do atalho '+label} onPress={onDot} hitSlop={6} style={{width:20,height:20,alignItems:'center',justifyContent:'center'}}>{({hovered:h}:any)=><View style={{width:h?10:8,height:h?10:8,borderRadius:5,backgroundColor:dot}}/>}</Pressable>:emoji?<Text style={{fontSize:16,width:20,textAlign:'center'}}>{emoji}</Text>:icon?<Icon name={icon} size={18} color={selected?c.accent:c.muted} active={!!selected}/>:null}
  {collapsed?null:<Text numberOfLines={1} style={{flex:1,color:selected?c.accent:small?c.muted:c.text,fontSize:small?12.5:14,fontWeight:selected?'600':'400'}}>{label}</Text>}
  {!collapsed&&hint?<Text style={{color:c.muted,fontSize:11}}>{hint}</Text>:null}
  {!collapsed&&trailing?<Text style={{color:c.muted,fontSize:11}}>{trailing}</Text>:null}
  {/* 0.3.267: como no Notion, ⋯ e + aparecem ao passar o mouse na página da barra lateral */}
  {!collapsed&&(menu||onAdd)?<View style={{flexDirection:'row',gap:2,opacity:hover?1:0}}>
   {menu?<Pressable testID={testID?testID+'-more':undefined} accessibilityRole="button" accessibilityLabel={'Mais ações para '+label} onHoverIn={hold.enter} onHoverOut={hold.leave} onPress={(e:any)=>{const r=e?.currentTarget?.getBoundingClientRect?.();openContextMenu(r?r.left:(e?.nativeEvent?.pageX??0),r?r.bottom+4:(e?.nativeEvent?.pageY??0),menu());}} style={({hovered:h}:any)=>({width:22,height:22,borderRadius:5,alignItems:'center',justifyContent:'center',backgroundColor:h?c.line:'transparent'})}><Icon name="more" size={15} color={c.muted}/></Pressable>:null}
   {onAdd?<Pressable testID={testID?testID+'-add':undefined} accessibilityRole="button" accessibilityLabel={'Nova subpágina em '+label} onHoverIn={hold.enter} onHoverOut={hold.leave} onPress={onAdd} style={({hovered:h}:any)=>({width:22,height:22,borderRadius:5,alignItems:'center',justifyContent:'center',backgroundColor:h?c.line:'transparent'})}><Icon name="plus" size={15} color={c.muted}/></Pressable>:null}
  </View>:null}
 </Pressable>;
}

function Section({title,children,action,onTitle}:{title:string;children:React.ReactNode;action?:React.ReactNode;onTitle?:()=>void}){
 const c=useTheme(),label=title.charAt(0)+title.slice(1).toLowerCase();
 // 13/11/2026 (Pedro: "Paginas ter um link proprio, clicar e la ter os itens"): o titulo da secao vira link (abre /paginas)
 return <View style={{marginTop:18}}>
  <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,marginBottom:4}}>{onTitle?<Pressable accessibilityRole="link" accessibilityLabel={'Abrir '+label} testID={'sidebar-section-'+label} onPress={onTitle} style={({hovered}:any)=>({flex:1,alignSelf:'flex-start',flexDirection:'row'})}>{({hovered}:any)=><Text style={{color:hovered?c.text:c.muted,fontSize:12,fontWeight:'600',textDecorationLine:hovered?'underline':'none'}}>{label}</Text>}</Pressable>:<Text style={{flex:1,color:c.muted,fontSize:12,fontWeight:'600'}}>{label}</Text>}{action}</View>
  {children}
 </View>;
}

const EXPANDED_KEY='sofia.desktop.tree.expanded';
function readExpanded():Set<string>{try{return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY)||'[]'));}catch{return new Set();}}

const NOTE_MIME='application/x-sofia-note';
function PageTree({pages,openId,onOpen,api,toast,undoNow}:{pages:Entity[];openId:string;onOpen:(id:string)=>void;api:SofiaApi;toast:(text:string,actions?:{label:string;run:()=>void}[])=>void;undoNow:()=>void}){
 // 06/11/2026: paginas publicadas na web ganham um 🌐 na lateral (nada fica publico sem a pessoa ver)
 const shared=useStore(sharedPages);useEffect(()=>{refreshSharedPages(api);},[api]);
 // 0.3.267: ⋯ / botão direito e + na página da barra lateral, como no Notion
 const newChild=async(parent:Entity)=>{try{const saved=await api.saveEntity({kind:'user_page',title:'Sem título',content:'',area:parent.area||'Pessoal',privacy:'private',state:'active',tags:[],data:{icon:'',icon_mode:'default',cover_type:'',cover_value:'',cover_attachment_id:'',purpose:'',layout:'notes',suggested:false,parent_id:parent.id,node_type:'page',blocks_json:'[]'}});
  setExpanded(prev=>{const n=new Set(prev);n.add(parent.id);try{localStorage.setItem(EXPANDED_KEY,JSON.stringify([...n]));}catch{/* modo privado */}return n;});createdPage.set(saved);onOpen(saved.id);}catch(e){appAlert('Não foi possível criar a subpágina',e instanceof Error?e.message:String(e));}};
 // 11/11/2026 (Pedro: "quando duplicar tem que aparecer a opção clonar idêntica igual do notion"): pergunta como duplicar
 const runClone=async(p:Entity,mode:CloneMode)=>{try{const copy=await clonePageTree(api,pages,p.id,mode);if(copy)onOpen(copy.id);}catch(e){appAlert('Não foi possível duplicar',e instanceof Error?e.message:String(e));}};
 const duplicate=(p:Entity)=>{const subs=cloneOrder(pages,p.id).length-1;
  appAlert('Duplicar “'+(p.title||'Sem título')+'”','Clonar idêntica: copia tudo igual (texto, notas, arquivos'+(subs>0?' e '+(subs===1?'a subpágina':'as '+subs+' subpáginas'):'')+').\nSó a estrutura: as mesmas páginas, com nome, ícone e capa, mas vazias.',[{text:'Cancelar',style:'cancel'},
   {text:'Clonar idêntica',onPress:()=>void runClone(p,'identical')},
   {text:'Só a estrutura (vazia)',onPress:()=>void runClone(p,'structure')}]);};
 const remove=(p:Entity)=>appAlert('Excluir página?','Excluir “'+(p.title||'Sem título')+'” e suas subpáginas também?',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{void trashTree(p);}}]);
 // 13/11/2026 (Pedro: Ctrl+Z traz de volta): excluir arquiva a arvore (lib/page-trash); desfazer volta tudo no mesmo lugar
 const setDir=(fn:(list:Entity[])=>Entity[])=>{const now=pagesDirectory.get();if(now)pagesDirectory.set(fn(now));};
 const trashTree=async(p:Entity)=>{const name=p.title||'Sem título',ids=new Set(cloneOrder([...byIdRef.current.values()],p.id).map(x=>x.id));
  try{let current=await trashPageTree(api,[...byIdRef.current.values()],p.id);setDir(list=>list.filter(x=>!ids.has(x.id)));systemChanged(api);
   pageUndo.push({label:'Excluir “'+name+'”',undoText:'Página “'+name+'” restaurada',redoText:'Página “'+name+'” excluída',
    undo:async()=>{current=await restorePageTree(api,current);const back=current;setDir(list=>[...list.filter(x=>!ids.has(x.id)),...back]);systemChanged(api);},
    redo:async()=>{current=await trashPageTree(api,current,p.id);setDir(list=>list.filter(x=>!ids.has(x.id)));systemChanged(api);}});
   toast('Página “'+name+'” excluída',[{label:'Desfazer',run:undoNow}]);
  }catch(e){appAlert('Não foi possível excluir',e instanceof Error?e.message:String(e));}};
 const movePageTo=(id:string,spot:PageSpot)=>{const cur=byIdRef.current.get(id)||pagesDirectory.get()?.find(x=>x.id===id);if(!cur)return Promise.reject(Error('A página não está mais na lista.'));
  setDir(list=>list.map(x=>x.id===id?{...x,data:{...x.data,parent_id:spot.parentId,node_type:spot.parentId?'page':'space'}}:x));
  return api.movePage({id,revision:cur.revision,parentId:spot.parentId,kind:spot.kind,anchorId:spot.anchorId}).then(r=>{const items=r?.items||[];if(items.length)setDir(list=>list.map(x=>items.find(y=>y.id===x.id)||x));systemChanged(api);});};
 // arrastar página na barra: meio da linha = dentro; borda de cima/baixo = antes/depois (como no Notion)
 const [drag,setDrag]=useState<{id:string;x:number;y:number;title:string;emoji?:string}|null>(null),[target,setTarget]=useState<{id:string;kind:'before'|'after'|'inside'}|null>(null);
 const justDragged=useRef(false),byIdRef=useRef(new Map<string,Entity>());byIdRef.current=new Map(pages.map(p=>[p.id,p]));
 const isInside=(id:string,ancestor:string)=>{let cur=byIdRef.current.get(id),n=0;while(cur&&n++<60){const parent=String(cur.data?.parent_id||'');if(!parent)return false;if(parent===ancestor)return true;cur=byIdRef.current.get(parent);}return false;};
 const bindDrag=(p:Entity)=>(node:any)=>{if(!node||typeof node.addEventListener!=='function'||node.__sofiaDrag===p.id)return;node.__sofiaDrag=p.id;
  node.addEventListener('mousedown',(ev:MouseEvent)=>{if(ev.button!==0)return;const d=document,sx=ev.clientX,sy=ev.clientY;let on=false,last:{id:string;kind:'before'|'after'|'inside'}|null=null;
   const move=(e:MouseEvent)=>{if(!on&&Math.hypot(e.clientX-sx,e.clientY-sy)<5)return;on=true;e.preventDefault();d.getSelection?.()?.removeAllRanges?.();
    const box=(d.querySelector('[data-testid="sidebar-page-tree"]') as HTMLElement|null)?.getBoundingClientRect();
    setDrag({id:p.id,x:e.clientX-(box?.left||0),y:e.clientY-(box?.top||0),title:p.title||'Sem título',emoji:isEmoji(p.data?.icon)?String(p.data?.icon):undefined});
    const el=(d.elementFromPoint(e.clientX,e.clientY) as HTMLElement|null)?.closest?.('[data-testid^="sidebar-page-"]') as HTMLElement|null;const id=el?.getAttribute('data-testid')?.replace(/^sidebar-page-/,'').replace(/-(more|add)$/,'')||'';
    if(!el||!id||id===p.id||isInside(id,p.id)){last=null;setTarget(null);return;}const r=el.getBoundingClientRect(),f=(e.clientY-r.top)/r.height;last={id,kind:f<0.34?'before':f>0.66?'after':'inside'};setTarget(last);};
   const up=()=>{d.removeEventListener('mousemove',move);d.removeEventListener('mouseup',up);if(!on)return;justDragged.current=true;setTimeout(()=>{justDragged.current=false;},60);setDrag(null);setTarget(null);
    if(!last)return;const anchor=byIdRef.current.get(last.id);if(!anchor)return;const parentId=last.kind==='inside'?anchor.id:String(anchor.data?.parent_id||'');
    if(last.kind==='inside')setExpanded(prev=>{const n=new Set(prev);n.add(anchor.id);try{localStorage.setItem(EXPANDED_KEY,JSON.stringify([...n]));}catch{/* modo privado */}return n;});
    const from=pageSpot([...byIdRef.current.values()],p.id),to:PageSpot={parentId,kind:last.kind,anchorId:anchor.id},name=byIdRef.current.get(p.id)?.title||p.title||'Sem título';
    void movePageTo(p.id,to).then(()=>{if(from&&!(from.parentId===to.parentId&&from.kind===to.kind&&from.anchorId===to.anchorId))pageUndo.push({label:'Mover “'+name+'”',undoText:'Página “'+name+'” voltou para o lugar',redoText:'Página “'+name+'” movida de novo',undo:()=>movePageTo(p.id,from),redo:()=>movePageTo(p.id,to)});}).catch(e=>appAlert('Não foi possível mover a página',e instanceof Error?e.message:String(e)));};
   d.addEventListener('mousemove',move);d.addEventListener('mouseup',up);});};
 // 09/11/2026 (Pedro: "nao tem opcao quando clico no menu na barra lateral para abrir em uma nova guia"): Abrir em nova guia; Ctrl/Cmd+clique
 // e o botao do meio do mouse na pagina tambem abrem em outra guia, como num link do navegador
 const newTab=(p:Entity)=>{try{window.open('/paginas/'+encodeURIComponent(p.id),'_blank','noopener');}catch{/* bloqueado pelo navegador */}};
 const menuFor=(p:Entity)=>():MenuItem[]=>[{label:'Abrir',icon:'arrowRight',run:()=>onOpen(p.id)},{label:'Abrir em nova guia',icon:'external',run:()=>newTab(p)},{label:'Nova subpágina',icon:'plus',run:()=>void newChild(p)},{label:'Duplicar',icon:'copy',run:()=>duplicate(p)},{label:'Excluir',icon:'trash',danger:true,run:()=>remove(p)}];
 const [expanded,setExpanded]=useState<Set<string>>(readExpanded);
 // 13/11/2026 (Pedro: arrastar a nota para outra pagina pela barra): a linha acende; parada ~0,7 s em cima de uma pagina
 // fechada abre as subpaginas; soltar move a nota (lib/notes-move) e Ctrl+Z devolve
 const [noteOver,setNoteOver]=useState<string|null>(null),treeRef=useRef<any>(null),expandedRef=useRef(expanded);expandedRef.current=expanded;
 const kidsRef=useRef(new Map<string,number>());kidsRef.current=new Map();for(const x of pages){const parent=String(x.data?.parent_id||'');if(parent)kidsRef.current.set(parent,(kidsRef.current.get(parent)||0)+1);}
 useEffect(()=>{const node=treeRef.current;if(!node||typeof node.addEventListener!=='function')return;let hover:{id:string;timer:ReturnType<typeof setTimeout>}|null=null;
  const clear=()=>{if(hover){clearTimeout(hover.timer);hover=null;}};
  const isNote=(e:DragEvent)=>Array.from(e.dataTransfer?.types||[]).includes(NOTE_MIME);
  const rowOf=(e:DragEvent)=>{const el=(e.target as HTMLElement|null)?.closest?.('[data-testid^="sidebar-page-"]') as HTMLElement|null;const id=el?.getAttribute('data-testid')?.replace(/^sidebar-page-/,'').replace(/-(more|add)$/,'')||'';return id&&byIdRef.current.has(id)?id:'';};
  const over=(e:DragEvent)=>{if(!isNote(e))return;const id=rowOf(e);if(!id){setNoteOver(null);clear();return;}e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';setNoteOver(prev=>prev===id?prev:id);
   if(hover?.id!==id){clear();if(kidsRef.current.get(id)&&!expandedRef.current.has(id))hover={id,timer:setTimeout(()=>{hover=null;setExpanded(prev=>{const n=new Set(prev);n.add(id);try{localStorage.setItem(EXPANDED_KEY,JSON.stringify([...n]));}catch{/* modo privado */}return n;});},700)};}};
  const leave=(e:DragEvent)=>{const to=e.relatedTarget as Node|null;if(to&&node.contains(to))return;setNoteOver(null);clear();};
  const drop=(e:DragEvent)=>{if(!isNote(e))return;const id=rowOf(e);setNoteOver(null);clear();if(!id)return;e.preventDefault();let info:any={};try{info=JSON.parse(e.dataTransfer?.getData(NOTE_MIME)||'{}');}catch{return;}
   const noteId=String(info?.noteId||''),from=String(info?.fromPageId||''),title=String(info?.title||'Nota');if(!noteId||!from||from===id)return;
   const name=byIdRef.current.get(id)?.title||'Sem título',fromName=byIdRef.current.get(from)?.title||'a página de antes';
   // 13/11/2026 (Mimic Kaizen achou "Nao foi possivel mover a nota · Sem conexao"): sem a API, a pagina de destino FECHADA
   // nao tinha como ser lida e gravada; agora vai junto
   void moveNoteToPage(noteId,from,id,api).then(()=>{systemChanged(api);toast('Nota movida para '+name,[{label:'Desfazer',run:undoNow}]);
    pageUndo.push({label:'Mover nota “'+title+'”',undoText:'Nota “'+title+'” voltou para '+fromName,redoText:'Nota movida para '+name,undo:()=>moveNoteToPage(noteId,id,from,api).then(()=>systemChanged(api)),redo:()=>moveNoteToPage(noteId,from,id,api).then(()=>systemChanged(api))});})
    .catch(err=>appAlert('Não foi possível mover a nota',err instanceof Error?err.message:String(err)));};
  node.addEventListener('dragover',over);node.addEventListener('dragleave',leave);node.addEventListener('drop',drop);
  return()=>{clear();node.removeEventListener('dragover',over);node.removeEventListener('dragleave',leave);node.removeEventListener('drop',drop);};
 },[api,toast,undoNow]);
 const children=useMemo(()=>{const m=new Map<string,Entity[]>();for(const p of pages){const parent=String(p.data?.parent_id||'');if(!m.has(parent))m.set(parent,[]);m.get(parent)!.push(p);}for(const l of m.values())l.sort(comparePageOrder);return m;},[pages]);
 const ids=useMemo(()=>new Set(pages.map(p=>p.id)),[pages]);
 const toggle=(id:string)=>setExpanded(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);try{localStorage.setItem(EXPANDED_KEY,JSON.stringify([...n]));}catch{/* modo privado */}return n;});
 const liveSc=useLiveShortcuts();
 const rows:React.ReactNode[]=[];
 const walk=(parent:string,depth:number)=>{for(const p of children.get(parent)||[]){const kids=children.get(p.id)||[],open=expanded.has(p.id),sc=shortcutsFor(p,liveSc);
  rows.push(<Row key={p.id} trailing={(p.tags||[]).includes('sofia-lock-v1')?'🔒':shared.includes(p.id)?'🌐':undefined} /* 06/11/2026: pagina com senha ganha 🔒 */ testID={'sidebar-page-'+p.id} depth={depth} emoji={isEmoji(p.data?.icon)?String(p.data?.icon):undefined} icon={isEmoji(p.data?.icon)?undefined:'book'} label={p.title||'Sem título'} selected={openId===p.id} onPress={(e:any)=>{if(justDragged.current)return;const ne=e?.nativeEvent||e;if(ne?.ctrlKey||ne?.metaKey){newTab(p);return;}onOpen(p.id);}} onAuxOpen={()=>newTab(p)} onHover={()=>prefetchPageCover(api,p.data)} onToggle={()=>toggle(p.id)} expanded={open} hasChildren={kids.length>0||sc.length>0} menu={menuFor(p)} onAdd={()=>void newChild(p)} dragRef={bindDrag(p)} drop={target?.id===p.id?target.kind:noteOver===p.id?'inside':null} dimmed={drag?.id===p.id}/>);
  // 14/11/2026 (Pedro): atalho de nota/pasta ligado no menu dela aparece como subpagina; clicar abre a pagina com ela aberta
  if(open)for(const s of sc){const colors=():MenuItem[]=>SHORTCUT_COLORS.map(k=>({label:k.name,swatch:k.hex,run:()=>{void requestShortcutColor(p.id,{kind:s.kind,id:s.id},k.hex,api).then(saved=>{if(saved)setDir(list=>list.map(x=>x.id===saved.id?saved:x));systemChanged(api);}).catch(e=>appAlert('Não foi possível trocar a cor',e instanceof Error?e.message:String(e)));}}));
   rows.push(<Row key={'sc-'+p.id+'-'+s.kind+'-'+s.id} testID={'sidebar-shortcut-'+s.kind+'-'+s.id} depth={depth+1} small dot={s.color||DEFAULT_SHORTCUT_COLOR} onDot={(e:any)=>{const r=e?.currentTarget?.getBoundingClientRect?.();openContextMenu(r?r.left:(e?.nativeEvent?.pageX??0),r?r.bottom+4:(e?.nativeEvent?.pageY??0),colors());}} menu={colors} label={s.label} selected={false} onPress={()=>{requestOpenShortcut(p.id,{kind:s.kind,id:s.id});onOpen(p.id);}}/>);}
  if(open&&depth<12)walk(p.id,depth+1);}};
 // paginas cujo pai sumiu aparecem na raiz, para nao ficarem escondidas
 walk('',0);for(const [parent,list] of children)if(parent&&!ids.has(parent))for(const p of list)rows.push(<Row key={p.id} depth={0} icon="book" label={p.title||'Sem título'} selected={openId===p.id} onPress={()=>onOpen(p.id)}/>);
 const c=useTheme();
 return <View ref={treeRef} testID="sidebar-page-tree" style={{position:'relative'}}>{rows}{drag?<View pointerEvents="none" testID="sidebar-drag-ghost" style={{position:'absolute',left:drag.x+12,top:drag.y-14,zIndex:9999,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:10,paddingVertical:6,borderRadius:8,backgroundColor:c.surface,borderWidth:1,borderColor:c.line,opacity:0.92,shadowColor:'#000',shadowOpacity:0.3,shadowRadius:12}}>
  {drag.emoji?<Text style={{fontSize:14}}>{drag.emoji}</Text>:<Icon name="book" size={14} color={c.muted}/>}<Text style={{color:c.text,fontSize:13}}>{drag.title}</Text></View>:null}</View>;
}

/** Próximos eventos (agenda) na barra lateral, como no Notion: título, horário e "Ver todos". */
function UpcomingEvents({api,onOpen}:{api:SofiaApi;onOpen:()=>void}){
 const c=useTheme(),[items,setItems]=useState<{id:string;title:string;when:string;at:number;color?:string}[]|null>(null);
 // 06/11/2026 (relatorio [fluidez] do computador do Pedro, tela 1762x832): a secao chegava ~0,15 s depois de abrir com ate 6
 // linhas e empurrava as Paginas 238 px para baixo (para fora da tela). Guarda so QUANTAS linhas havia (um numero, nenhum
 // titulo) e ja abre com esse espaco reservado.
 const EVENTS_N='sofia.side.events.n',[reserve]=useState(()=>{try{return Math.max(0,Math.min(6,Number(globalThis.localStorage?.getItem(EVENTS_N))||0));}catch{return 0;}});
 useEffect(()=>{let alive=true;const load=async()=>{try{const now=new Date(),month=(d:Date)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),next=new Date(now.getFullYear(),now.getMonth()+1,1);
   const lists=await Promise.all([api.agenda(month(now)),api.agenda(month(next)).catch(()=>({items:[]}))]);const seen=new Set<string>(),out:{id:string;title:string;when:string;at:number;color?:string}[]=[];
   // mesma leitura da Agenda e do Início: repetições expandidas e dia inteiro pela data (sem virar 03:00/21:00 pelo fuso)
   const base=[...new Map(lists.flatMap(l=>l.items||[]).map(i=>[i.id,i])).values()];
   for(const it of expandForHome(base)){const start=eventStart(it),key=it.id+'|'+start;if(!start||seen.has(key)||it.state==='done'||it.state==='archived')continue;seen.add(key);const allDay=!!it.data?.calendar_all_day||/^\d{4}-\d{2}-\d{2}$/.test(start);const t=allDay?new Date(start.slice(0,10)+'T12:00:00'):new Date(start);if(Number.isNaN(t.getTime())||(allDay?t.getTime()+12*3600000<Date.now():t.getTime()<Date.now()-30*60000))continue;
    const hm=(d:Date)=>d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),today=t.toDateString()===now.toDateString();
    const when=allDay?(today?'hoje':t.toLocaleDateString('pt-BR',{weekday:'short'})):today?hm(t) /* 07/11/2026 (revisao): so o inicio; o intervalo cortava o nome do evento */:t.toLocaleDateString('pt-BR',{weekday:'short'})+' '+hm(t);
    out.push({id:key,title:it.title||'Sem título',when,at:allDay?t.getTime()-12*3600000:t.getTime(),color:agendaPriority(it as any).color||''});}
   out.sort((a,b)=>a.at-b.at);if(alive){setItems(out.slice(0,6));try{globalThis.localStorage?.setItem(EVENTS_N,String(Math.min(6,out.length)));}catch{/* sem armazenamento */}}}catch{if(alive)setItems([]);}};
  void load();const off=subscribeSystemChanged(owner=>{if(owner===api)void load();});const timer=setInterval(()=>void load(),5*60000);return()=>{alive=false;off();clearInterval(timer);};},[api]);
 if(items===null&&reserve)return <Section title="Próximos eventos"><View testID="sidebar-events-reserve" style={{height:(reserve+1)*28}}/></Section>;
 if(!items||!items.length)return null;
 return <Section title="Próximos eventos">
  {items.map(it=><Pressable key={it.id} testID={'sidebar-event-'+it.id} accessibilityRole="button" accessibilityLabel={it.title+', '+it.when} onPress={onOpen} style={({hovered}:any)=>({flexDirection:'row',alignItems:'center',gap:8,minHeight:28,paddingHorizontal:8,marginHorizontal:8,borderRadius:8,backgroundColor:hovered?c.line+'80':'transparent'})}>
   {/* 06/11/2026 (Pedro: "tem que respeitar a cor do que e importante"): o quadradinho usa a cor da importancia, como na Agenda */}<View style={{width:8,height:8,borderRadius:2,backgroundColor:(it as any).color||c.accent}}/><Text numberOfLines={1} style={{flex:1,color:c.text,fontSize:13}}>{it.title}</Text><Text style={{color:c.muted,fontSize:11}}>{it.when}</Text>
  </Pressable>)}
  <Pressable accessibilityRole="button" accessibilityLabel="Ver toda a agenda" onPress={onOpen} style={({hovered}:any)=>({flexDirection:'row',alignItems:'center',gap:8,minHeight:28,paddingHorizontal:8,marginHorizontal:8,borderRadius:8,backgroundColor:hovered?c.line+'80':'transparent'})}><Icon name="more" size={14} color={c.muted}/><Text style={{color:c.muted,fontSize:13}}>Ver tudo</Text></Pressable>
 </Section>;
}

type Command={id:string;label:string;group:string;icon?:IconName;emoji?:string;hint?:string;run:()=>void};
function CommandPalette({visible,onClose,commands}:{visible:boolean;onClose:()=>void;commands:Command[]}){
 const c=useTheme(),[query,setQuery]=useState(''),[index,setIndex]=useState(0),input=useRef<TextInput>(null);
 useEffect(()=>{if(visible){setQuery('');setIndex(0);setTimeout(()=>input.current?.focus(),30);}},[visible]);
 const results=useMemo(()=>(query.trim()?fuzzyFilter(commands,query,x=>x.label+' '+x.group):commands.filter(x=>x.group!=='Páginas'&&x.group!=='Tarefas').concat(commands.filter(x=>x.group==='Tarefas').slice(0,8),commands.filter(x=>x.group==='Páginas').slice(0,8))).slice(0,40) /* 03/11/2026: sem busca, ate 8 tarefas - antes as tarefas enchiam a lista e as Paginas sumiam */,[commands,query]);
 useEffect(()=>setIndex(0),[query]);
 const run=(cmd?:Command)=>{if(!cmd)return;onClose();setTimeout(cmd.run,10);};
 let lastGroup='';
 return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
  <Pressable accessibilityLabel="Fechar busca" onPress={onClose} style={{flex:1,backgroundColor:PALETTE.black+'7a',alignItems:'center',paddingTop:'12vh' as any}}>
   <Pressable onPress={e=>e.stopPropagation()} style={{width:'92%',maxWidth:640,maxHeight:'70vh' as any,backgroundColor:c.surface,borderRadius:14,borderWidth:1,borderColor:c.line,overflow:'hidden',shadowColor:PALETTE.black,shadowOpacity:0.35,shadowRadius:30,shadowOffset:{width:0,height:12}}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:16,borderBottomWidth:1,borderColor:c.line}}>
     <Icon name="search" size={18} color={c.muted}/>
     <TextInput ref={input} testID="command-palette-input" value={query} onChangeText={setQuery} placeholder="Buscar páginas, apps e menus…" placeholderTextColor={c.muted}
      onKeyPress={(e:any)=>{const k=e.nativeEvent.key;if(k==='ArrowDown'){e.preventDefault?.();setIndex(i=>Math.min(results.length-1,i+1));}else if(k==='ArrowUp'){e.preventDefault?.();setIndex(i=>Math.max(0,i-1));}else if(k==='Escape')onClose();}}
      onSubmitEditing={()=>run(results[index])} style={{flex:1,color:c.text,fontSize:16,paddingVertical:16}}/>
     <Text style={{color:c.muted,fontSize:11,borderWidth:1,borderColor:c.line,borderRadius:5,paddingHorizontal:5,paddingVertical:2}}>Esc</Text>
    </View>
    <ScrollView keyboardShouldPersistTaps="always" style={{maxHeight:480}} contentContainerStyle={{paddingVertical:6}}>
     {results.length?results.map((cmd,i)=>{const head=cmd.group!==lastGroup;lastGroup=cmd.group;return <React.Fragment key={cmd.id}>
      {head?<Text style={{color:c.muted,fontSize:11,fontWeight:'600',paddingHorizontal:16,paddingTop:10,paddingBottom:4}}>{cmd.group}</Text>:null}
      <Pressable accessibilityRole="menuitem" onHoverIn={()=>setIndex(i)} onPress={()=>run(cmd)} style={{flexDirection:'row',alignItems:'center',gap:10,marginHorizontal:6,paddingHorizontal:10,paddingVertical:9,borderRadius:8,backgroundColor:i===index?c.accentSoft:'transparent'}}>
       {cmd.emoji?<Text style={{fontSize:16,width:20,textAlign:'center'}}>{cmd.emoji}</Text>:cmd.icon?<Icon name={cmd.icon} size={18} color={i===index?c.accent:c.muted}/>:null}
       <Text numberOfLines={1} style={{flex:1,color:i===index?c.accent:c.text,fontSize:14}}>{cmd.label}</Text>
       {cmd.hint?<Text style={{color:c.muted,fontSize:11}}>{cmd.hint}</Text>:null}
      </Pressable></React.Fragment>;}):<Text style={{color:c.muted,padding:20,fontSize:14}}>Nada encontrado.</Text>}
    </ScrollView>
    <View style={{flexDirection:'row',gap:16,paddingHorizontal:16,paddingVertical:9,borderTopWidth:1,borderColor:c.line}}>
     <Text style={{color:c.muted,fontSize:11}}>↑↓ navegar</Text><Text style={{color:c.muted,fontSize:11}}>Enter abrir</Text><Text style={{color:c.muted,fontSize:11}}>Ctrl+\ barra lateral</Text><Text style={{color:c.muted,fontSize:11}}>Alt+1…6 menus</Text>
    </View>
   </Pressable>
  </Pressable>
 </Modal>;
}

export function DesktopFrame({api,tab,locked,profile,onNavigate,onOpenModule,onOpenPage,onCreatePage,children}:Props){
 const c=useTheme(),[collapsed,setCollapsed]=useSidebarCollapsed(),[sideW,setSideW]=useSidebarWidth(),[palette,setPalette]=useState(false);
 // 0.3.263: tarefas tambem na busca geral (Ctrl+K) e numero de avisos no titulo da aba do navegador
 const [paletteTasks,setPaletteTasks]=useState<Task[]>(()=>((api.cached('/tasks') as {items?:Task[]}|undefined)?.items)||[]);
 useEffect(()=>{if(!palette)return;let live=true;api.tasks().then(r=>{if(live)setPaletteTasks(r.items||[]);}).catch(()=>{});return()=>{live=false;};},[palette,api]);
 if(pagesDirectory.get()===null){const saved=api.webPeek?.<Entity[]>('pages');if(Array.isArray(saved))pagesDirectory.set(saved);} /* abre com a arvore guardada (criptografada) e confere com o servidor */
 const pages=usePageDirectory(api)??null,favorites=useStore(favoritePages); // 08/11/2026 (Pedro: "tem uma subpagina na pagina... porque adicionei uma pagina existente"): a arvore usa a lista SEM as copias de Quadro (antes o filtro existia mas a arvore lia a lista crua)
 useEffect(()=>pages?prefetchAllCovers(api,pages):undefined,[pages,api]);
 const createRootPage=async()=>{try{const saved=await api.saveEntity({kind:'user_page',title:'Sem título',content:'',area:'Pessoal',privacy:'private',state:'active',tags:[],data:{icon:'',icon_mode:'default',cover_type:'',cover_value:'',cover_attachment_id:'',purpose:'',layout:'notes',suggested:false,parent_id:'',node_type:'space',blocks_json:'[]'}});createdPage.set(saved);onOpenPage(saved.id);}catch{onCreatePage();}};const pagesLate=useRef(pages===null);
 const path=useStore(pagePath),moduleTitle=useStore(appModuleTitle);
 const openPageId=tab==='pages'&&path.length?path[path.length-1].id:'';
 useDesktopCss(true,c);
 const keys=useMemo(()=>({palette:()=>setPalette(v=>!v),sidebar:()=>setCollapsed(!collapsed),tab:(i:number)=>{const t=TAB_ORDER[i];if(t)onNavigate(t);},escape:()=>setPalette(false)}),[collapsed,onNavigate]);
 useDesktopKeys(true,keys);
 // 13/11/2026 (Pedro: Ctrl+Z na barra das Paginas): desfaz excluir/mover/reordenar/mover nota; o editor da pagina fica com o
 // Ctrl+Z quando foi ele que mudou por ultimo (pageUndo.markEditor). Digitando num campo, o Ctrl+Z e do campo.
 const {toast,toastNode}=useToast(),tabRef=useRef(tab),inSidebar=useRef(false);tabRef.current=tab;
 const runUndo=useCallback(async(redo:boolean)=>{try{const step=await (redo?pageUndo.redo():pageUndo.undo());if(step)toast((redo?step.redoText:step.undoText)||(redo?'Refeito: ':'Desfeito: ')+step.label);}catch(e){appAlert(redo?'Não foi possível refazer':'Não foi possível desfazer',e instanceof Error?e.message:String(e));}},[toast]);
 const undoNow=useCallback(()=>{void runUndo(false);},[runUndo]);
 useEffect(()=>{if(typeof document==='undefined')return;
  const down=(e:MouseEvent)=>{const t=e.target as HTMLElement|null;if(t?.closest?.('[role="dialog"],[data-testid="context-menu"],[data-testid="app-toast"]'))return;inSidebar.current=!!t?.closest?.('[data-testid="desktop-sidebar"]');};
  const key=(e:KeyboardEvent)=>{const mod=(e.ctrlKey||e.metaKey)&&!e.altKey,k=e.key.toLowerCase();if(!mod||(k!=='z'&&k!=='y'))return;
   const t=e.target as HTMLElement|null;if((t as any)?.isContentEditable||t?.closest?.('textarea,input,select,[contenteditable="true"],[data-drive-float]'))return;
   if(tabRef.current!=='pages'&&!inSidebar.current)return;const redo=k==='y'||e.shiftKey;if(!pageUndo.wants(redo))return;
   e.preventDefault();e.stopImmediatePropagation();void runUndo(redo);};
  document.addEventListener('mousedown',down,true);document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('mousedown',down,true);document.removeEventListener('keydown',key,true);};
 },[runUndo]);
 const commands=useMemo<Command[]>(()=>[
  ...TAB_ORDER.map((t,i)=>({id:'tab:'+t,label:TAB_LABELS[t].label,group:'Menus',icon:TAB_LABELS[t].icon,hint:'Alt+'+(i+1),run:()=>onNavigate(t)})),
  {id:'tab:notifications',label:'Notificações',group:'Menus',icon:'bell',run:()=>onNavigate('notifications')},
  ...APP_SHORTCUTS.map(a=>({id:'app:'+a.id,label:a.title,group:'Apps',icon:a.icon,run:()=>onOpenModule(a.id)})),
  {id:'action:new-page',label:'Nova página',group:'Ações',icon:'plus',run:()=>void createRootPage()},
  // 0.3.269: "adicionar" no Ctrl+K abre a janela de adicionar da Biblioteca
  {id:'action:library-add',label:'Adicionar à Biblioteca',group:'Ações',icon:'book',hint:'N',run:()=>{(globalThis as any).__sofiaLibraryAdd=true;onOpenModule('library');setTimeout(()=>{try{window.dispatchEvent(new CustomEvent('sofia:library-add'));(globalThis as any).__sofiaLibraryAdd=false;}catch{/* navegador antigo */}},350);}},
  {id:'action:sidebar',label:collapsed?'Mostrar barra lateral':'Recolher barra lateral',group:'Ações',icon:'sidebar',hint:'Ctrl+\\',run:()=>setCollapsed(!collapsed)},
  ...paletteTasks.filter(t=>!['done','cancelled'].includes(t.state)).slice(0,300).map(t=>({id:'task:'+t.id,label:t.title,group:'Tarefas',icon:(t.state==='scheduled'?'calendar':'checklist') as IconName,hint:t.state==='scheduled'?'na agenda':undefined,run:()=>{(window as any).__sofiaOpenTask=t.id;onOpenModule('tasks');try{window.dispatchEvent(new CustomEvent('sofia:open-task',{detail:t.id}));}catch{/* navegador antigo */}}})),
  ...(pages||[]).map(p=>({id:'page:'+p.id,label:p.title||'Sem título',group:'Páginas',emoji:isEmoji(p.data?.icon)?String(p.data?.icon):undefined,icon:(isEmoji(p.data?.icon)?undefined:'book') as IconName|undefined,run:()=>onOpenPage(p.id)})),
 ],[pages,paletteTasks,collapsed,onNavigate,onOpenModule,onOpenPage,onCreatePage]);
 const crumbs=[TAB_LABELS[tab]?.label||'Sofia',...(tab==='pages'?path.map(p=>p.title||'Sem título'):tab==='apps'&&moduleTitle?[moduleTitle]:[])];
 const width=Math.round((collapsed?SIDEBAR_COLLAPSED:sideW)*uiScale()); // 0.3.278: lateral na escala da tela
 return <View testID="desktop-shell" style={{flex:1,flexDirection:'row',backgroundColor:c.bg}}>
  <View testID="desktop-sidebar" style={{width,flexShrink:0,backgroundColor:c.surface,borderRightWidth:1,borderColor:c.line,...(EMBED?{display:'none'}:{})}}>
   {collapsed||EMBED?null:<SidebarResizer width={sideW} onChange={setSideW} color={c.accent}/>}
   <View style={{flexDirection:'row',alignItems:'center',gap:10,height:56,paddingHorizontal:collapsed?0:16,justifyContent:collapsed?'center':'flex-start'}}>
    {collapsed?null:<><View style={{width:26,height:26,borderRadius:8,backgroundColor:c.accent,alignItems:'center',justifyContent:'center'}}><Text style={{color:c.onAccent,fontWeight:'700',fontSize:16}}>S</Text></View>
    <Text numberOfLines={1} style={{flex:1,color:c.text,fontWeight:'600',fontSize:16}}>Sofia OS</Text></>}
    <Pressable testID="desktop-sidebar-toggle" accessibilityRole="button" accessibilityLabel={collapsed?'Mostrar barra lateral':'Recolher barra lateral'} onPress={()=>setCollapsed(!collapsed)} style={({hovered}:any)=>({padding:6,borderRadius:7,backgroundColor:hovered?c.line:'transparent'})}><Icon name="sidebar" size={18} color={c.muted}/></Pressable>
   </View>
   <ScrollView testID="desktop-sidebar-scroll" keyboardShouldPersistTaps="handled" style={{flex:1}} contentContainerStyle={{paddingBottom:24}}>
    <Row icon="search" label="Buscar" hint="Ctrl+K" collapsed={collapsed} onPress={()=>setPalette(true)}/>
    <View style={{height:8}}/>
    {/* 0.3.267: Páginas e Apps já aparecem nas seções de baixo e o Perfil abre pela foto no topo */}
    {TAB_ORDER.filter(t=>collapsed||!['pages','apps','profile'].includes(t)).map(t=><Row key={t} testID={'desktop-nav-'+t} icon={TAB_LABELS[t].icon} label={TAB_LABELS[t].label} selected={tab===t} collapsed={collapsed} onPress={()=>onNavigate(t)}/>)}
    {collapsed?null:<>
     <Section title="Apps">{APP_SHORTCUTS.map(a=><Row key={a.id} icon={a.icon} label={a.title} selected={tab==='apps'&&moduleTitle===a.title} onPress={()=>onOpenModule(a.id)}/>)}</Section>
     {/* 0.3.267: como no Notion — próximos eventos da agenda e páginas favoritas na barra lateral */}
     <UpcomingEvents api={api} onOpen={()=>onNavigate('agenda')}/>
     {favorites.length&&pages?<Section title="Favoritos">{favorites.map(id=>pages.find(p=>p.id===id)).filter(Boolean).map(p=><Row key={'fav-'+p!.id} testID={'sidebar-fav-'+p!.id} emoji={isEmoji(p!.data?.icon)?String(p!.data?.icon):undefined} icon={isEmoji(p!.data?.icon)?undefined:'star'} label={p!.title||'Sem título'} selected={openPageId===p!.id} onPress={()=>onOpenPage(p!.id)}/>)}</Section>:null}
     <Section title="Páginas" onTitle={()=>onNavigate('pages')} action={<Pressable accessibilityRole="button" accessibilityLabel="Nova página" onPress={createRootPage} style={({hovered}:any)=>({padding:3,borderRadius:6,backgroundColor:hovered?c.line:'transparent'})}><Icon name="plus" size={15} color={c.muted}/></Pressable>}>
      {pages===null?<View style={{paddingHorizontal:12}}><LoadingLines rows={3}/></View> /* 04/11/2026 (Pedro): esqueleto so se a lista ainda nao chegou; ela e pedida ja no carregamento (assets/early.js) */:pages.length?<View style={pagesLate.current?SIDE_FADE.in:undefined}><PageTree pages={pages} openId={openPageId} onOpen={onOpenPage} api={api} toast={toast} undoNow={undoNow}/></View>:<Text style={{color:c.muted,fontSize:12,paddingHorizontal:16,paddingVertical:6}}>Nenhuma página ainda.</Text>}
     </Section>
    </>}
   </ScrollView>
  </View>
  <View style={{flex:1,minWidth:0}}>
   <View testID="desktop-topbar" style={{...(EMBED?{display:'none'}:{}),height:52,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:20,borderBottomWidth:1,borderColor:c.line,backgroundColor:c.bg}}>
    <View testID="desktop-breadcrumb" style={{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:6}}>
     {crumbs.map((label,i)=><React.Fragment key={i}>{i?<Text style={{color:c.muted,fontSize:13}}>/</Text>:null}<Text numberOfLines={1} onPress={i===0&&crumbs.length>1?()=>onNavigate(tab):undefined} style={{color:i===crumbs.length-1?c.text:c.muted,fontSize:13,fontWeight:i===crumbs.length-1?'600':'400',flexShrink:i===crumbs.length-1?1:0}}>{label}</Text></React.Fragment>)}
     {locked?<Text style={{color:c.muted,fontSize:12,marginLeft:10}}>Conversa em andamento…</Text>:null}
    </View>
    <Pressable testID="desktop-search" accessibilityRole="button" accessibilityLabel="Buscar" onPress={()=>setPalette(true)} style={({hovered}:any)=>({flexDirection:'row',alignItems:'center',gap:8,width:260,paddingHorizontal:12,paddingVertical:7,borderRadius:9,borderWidth:1,borderColor:c.line,backgroundColor:hovered?c.input:c.surface})}>
     <Icon name="search" size={16} color={c.muted}/><Text style={{flex:1,color:c.muted,fontSize:13}}>Buscar</Text><Text style={{color:c.muted,fontSize:11}}>Ctrl+K</Text>
    </Pressable>
    {DRIVE_APP?<DriveFloatButton api={api}/>:null}
    <NotificationBell onViewAll={()=>onNavigate('notifications')}/>
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir perfil e configurações" onPress={()=>onNavigate('profile')}><ProfileAvatar scope={profile.email} name={profile.name} size={34}/></Pressable>
   </View>
   <View style={{flex:1,minHeight:0}}>{children}</View>
  </View>
  <CommandPalette visible={palette} onClose={()=>setPalette(false)} commands={commands}/>{toastNode}
 </View>;
}


/** 07/11/2026 (Pedro: Drive flutuante para usar junto com as Paginas): botao na barra de cima; a janela fica aberta ao trocar de tela. */
function DriveFloatButton({api}:{api:SofiaApi}){
 const c=useTheme(),on=useDriveWindowOpen();
 return <><Pressable testID="drive-float-toggle" accessibilityRole="button" accessibilityState={{selected:on}} accessibilityLabel={on?'Fechar o Drive flutuante':'Abrir o Drive em janela flutuante'} onPress={()=>on?closeDriveWindow():openDriveWindow()}
  style={({hovered}:any)=>({width:34,height:34,borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:on?c.accentSoft:hovered?c.input:'transparent'})}><Icon name="drive" size={18} color={on?c.accent:c.muted}/></Pressable>
  <DriveWindowHost api={api}/></>;
}

/** 13/11/2026 (Mimic Kaizen, item 11 do Notion "igual"): borda da barra lateral que estica arrastando.
 * Cursor de esticar ao passar; linha acesa só arrastando ou com o mouse em cima; dois cliques voltam ao padrão. */
function SidebarResizer({width,onChange,color}:{width:number;onChange:(v:number,persist?:boolean)=>void;color:string}){
 const [on,setOn]=useState(false),[drag,setDrag]=useState(false);
 const down=(e:any)=>{
  const ne=e?.nativeEvent||e;if(ne?.button!==undefined&&ne.button!==0)return;
  ne?.preventDefault?.();
  if(ne?.detail>=2){onChange(SIDEBAR_WIDTH,true);return;} // dois cliques: volta ao padrão (o react-native-web não repassa onDoubleClick)
  const x0=ne.clientX,w0=width,f=uiScale()||1;let last=w0;setDrag(true);
  const prevSel=document.body.style.userSelect,prevCur=document.body.style.cursor;
  document.body.style.userSelect='none';document.body.style.cursor='col-resize';
  const move=(m:MouseEvent)=>{last=w0+(m.clientX-x0)/f;onChange(last,false);};
  const up=()=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);
   document.body.style.userSelect=prevSel;document.body.style.cursor=prevCur;setDrag(false);onChange(last,true);};
  document.addEventListener('mousemove',move);document.addEventListener('mouseup',up);
 };
 if(Platform.OS!=='web')return null;
 return <View testID="desktop-sidebar-resizer" accessibilityLabel="Arraste para mudar a largura da barra lateral"
  {...({onMouseDown:down,onMouseEnter:()=>setOn(true),onMouseLeave:()=>setOn(false)} as any)}
  style={{position:'absolute',top:0,bottom:0,right:-4,width:8,zIndex:20,cursor:'col-resize',alignItems:'center'} as any}>
  <View style={{width:2,height:'100%',backgroundColor:on||drag?color:'transparent',opacity:drag?0.9:0.5}}/>
 </View>;
}

