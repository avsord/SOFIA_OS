import {uiScale} from '../web/desktop-scale';
import {LoadingLines} from '../components/Loading';
// 0.3.250: moldura do app no computador (estilo Notion). So e usada no navegador com tela larga
import {PALETTE} from '../lib/palette';
import type {Task} from '../lib/types';
// (ver lib/desktop.ts). Barra lateral fixa e recolhivel, barra de cima com caminho, busca e avisos,
// busca global (Ctrl+K) e atalhos de teclado. As telas sao as mesmas do celular.
import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {Icon,type IconName} from '../components/Icon';
import {NotificationBell} from '../components/NotificationCenter';
import {ProfileAvatar} from '../components/ProfileAvatar';
import {fuzzyFilter} from '../lib/fuzzy';
import {comparePageOrder} from '../lib/page-order';
import {TAB_ORDER} from '../lib/tab-navigation';
import type {SofiaApi} from '../lib/api';
import type {Entity,Tab} from '../lib/types';
import {APP_SHORTCUTS,SIDEBAR_COLLAPSED,SIDEBAR_WIDTH,appModuleTitle,pagePath,pagesDirectory,samePages,useDesktopCss,useDesktopKeys,useSidebarCollapsed,useStore} from '../lib/desktop';

export const TAB_LABELS:Record<string,{label:string;icon:IconName}>={home:{label:'Início',icon:'home'},chat:{label:'Conversa',icon:'sofia'},pages:{label:'Páginas',icon:'book'},agenda:{label:'Agenda',icon:'calendar'},apps:{label:'Apps',icon:'grid'},profile:{label:'Perfil',icon:'user'},notifications:{label:'Notificações',icon:'bell'}};
const isEmoji=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=8&&!/^[a-z0-9_-]+$/i.test(v);

type Props={
 api:SofiaApi;tab:Tab;locked:boolean;profile:{name:string;email:string};
 onNavigate:(tab:Tab)=>void;onOpenModule:(id:string)=>void;onOpenPage:(id:string)=>void;onCreatePage:()=>void;
 children:React.ReactNode;
};

/** Le as paginas para a arvore da barra lateral sem esperar a aba Paginas abrir. */
const SIDE_FADE=StyleSheet.create({in:{animationKeyframes:{'0%':{opacity:0},'100%':{opacity:1}},animationDuration:'260ms',animationTimingFunction:'ease-out',animationFillMode:'both'} as any});
function usePageDirectory(api:SofiaApi){
 const pages=useStore(pagesDirectory);
 // layout effect: o pedido das Paginas sai ANTES dos pedidos do Inicio (efeitos comuns dos filhos rodam primeiro)
 useLayoutEffect(()=>{
  let live=true;
  async function load(){
   try{
    const items:Entity[]=[];
    for(let offset=0;offset<3000;offset+=100){const r=await api.entities('user_page','',offset);items.push(...r.items.filter(x=>x.state!=='archived'));if(r.items.length<100)break;}
    if(live&&!samePages(pagesDirectory.get(),items))pagesDirectory.set(items);
    if(live)api.webKeep?.('pages',items.map(x=>({id:x.id,kind:x.kind,title:x.title,state:x.state,data:{icon:x.data?.icon,parent_id:x.data?.parent_id,sort_order:x.data?.sort_order}})));
   }catch{/* a aba Paginas mostra o erro; a barra lateral so fica com o que ja tem */}
  }
  void load();
  const focus=()=>void load();
  if(typeof window!=='undefined')window.addEventListener('focus',focus);
  return()=>{live=false;if(typeof window!=='undefined')window.removeEventListener('focus',focus);};
 },[api]);
 return pages;
}

function Row({icon,emoji,label,selected,onPress,depth=0,collapsed,trailing,onToggle,expanded,hasChildren,hint,testID}:{icon?:IconName;emoji?:string;label:string;selected?:boolean;onPress:()=>void;depth?:number;collapsed?:boolean;trailing?:string;onToggle?:()=>void;expanded?:boolean;hasChildren?:boolean;hint?:string;testID?:string}){
 const c=useTheme();
 return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:!!selected}} onPress={onPress}
  style={({hovered}:any)=>({flexDirection:'row',alignItems:'center',gap:8,minHeight:32,paddingLeft:collapsed?0:8+depth*14,paddingRight:8,justifyContent:collapsed?'center':'flex-start',marginHorizontal:8,borderRadius:8,backgroundColor:selected?c.accentSoft:hovered?c.line+'80':'transparent'})}>
  {onToggle?<Pressable accessibilityRole="button" accessibilityLabel={(expanded?'Recolher ':'Abrir ')+label} onPress={onToggle} hitSlop={6} style={{width:16,height:16,alignItems:'center',justifyContent:'center',opacity:hasChildren?1:0.35}}><View style={{...({transitionProperty:'transform',transitionDuration:'160ms',transitionTimingFunction:'ease-out'} as any),transform:[{rotate:expanded?'90deg':'0deg'}]}}><Icon name="chevron" size={13} color={c.muted}/></View></Pressable>:null}
  {emoji?<Text style={{fontSize:16,width:20,textAlign:'center'}}>{emoji}</Text>:icon?<Icon name={icon} size={18} color={selected?c.accent:c.muted} active={!!selected}/>:null}
  {collapsed?null:<Text numberOfLines={1} style={{flex:1,color:selected?c.accent:c.text,fontSize:14,fontWeight:selected?'600':'400'}}>{label}</Text>}
  {!collapsed&&hint?<Text style={{color:c.muted,fontSize:11}}>{hint}</Text>:null}
  {!collapsed&&trailing?<Text style={{color:c.muted,fontSize:11}}>{trailing}</Text>:null}
 </Pressable>;
}

function Section({title,children,action}:{title:string;children:React.ReactNode;action?:React.ReactNode}){
 const c=useTheme();
 return <View style={{marginTop:18}}>
  <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,marginBottom:4}}><Text style={{flex:1,color:c.muted,fontSize:12,fontWeight:'600'}}>{title.charAt(0)+title.slice(1).toLowerCase()}</Text>{action}</View>
  {children}
 </View>;
}

const EXPANDED_KEY='sofia.desktop.tree.expanded';
function readExpanded():Set<string>{try{return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY)||'[]'));}catch{return new Set();}}

function PageTree({pages,openId,onOpen}:{pages:Entity[];openId:string;onOpen:(id:string)=>void}){
 const [expanded,setExpanded]=useState<Set<string>>(readExpanded);
 const children=useMemo(()=>{const m=new Map<string,Entity[]>();for(const p of pages){const parent=String(p.data?.parent_id||'');if(!m.has(parent))m.set(parent,[]);m.get(parent)!.push(p);}for(const l of m.values())l.sort(comparePageOrder);return m;},[pages]);
 const ids=useMemo(()=>new Set(pages.map(p=>p.id)),[pages]);
 const toggle=(id:string)=>setExpanded(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);try{localStorage.setItem(EXPANDED_KEY,JSON.stringify([...n]));}catch{/* modo privado */}return n;});
 const rows:React.ReactNode[]=[];
 const walk=(parent:string,depth:number)=>{for(const p of children.get(parent)||[]){const kids=children.get(p.id)||[],open=expanded.has(p.id);
  rows.push(<Row key={p.id} testID={'sidebar-page-'+p.id} depth={depth} emoji={isEmoji(p.data?.icon)?String(p.data?.icon):undefined} icon={isEmoji(p.data?.icon)?undefined:'book'} label={p.title||'Sem título'} selected={openId===p.id} onPress={()=>onOpen(p.id)} onToggle={()=>toggle(p.id)} expanded={open} hasChildren={kids.length>0}/>);
  if(open&&depth<12)walk(p.id,depth+1);}};
 // paginas cujo pai sumiu aparecem na raiz, para nao ficarem escondidas
 walk('',0);for(const [parent,list] of children)if(parent&&!ids.has(parent))for(const p of list)rows.push(<Row key={p.id} depth={0} icon="book" label={p.title||'Sem título'} selected={openId===p.id} onPress={()=>onOpen(p.id)}/>);
 return <>{rows}</>;
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
 const c=useTheme(),[collapsed,setCollapsed]=useSidebarCollapsed(),[palette,setPalette]=useState(false);
 // 0.3.263: tarefas tambem na busca geral (Ctrl+K) e numero de avisos no titulo da aba do navegador
 const [paletteTasks,setPaletteTasks]=useState<Task[]>(()=>((api.cached('/tasks') as {items?:Task[]}|undefined)?.items)||[]);
 useEffect(()=>{if(!palette)return;let live=true;api.tasks().then(r=>{if(live)setPaletteTasks(r.items||[]);}).catch(()=>{});return()=>{live=false;};},[palette,api]);
 if(pagesDirectory.get()===null){const saved=api.webPeek?.<Entity[]>('pages');if(Array.isArray(saved))pagesDirectory.set(saved);} /* abre com a arvore guardada (criptografada) e confere com o servidor */
 const pages=useStore(pagesDirectory)??null;usePageDirectory(api);const pagesLate=useRef(pages===null);
 const path=useStore(pagePath),moduleTitle=useStore(appModuleTitle);
 const openPageId=tab==='pages'&&path.length?path[path.length-1].id:'';
 useDesktopCss(true,c);
 const keys=useMemo(()=>({palette:()=>setPalette(v=>!v),sidebar:()=>setCollapsed(!collapsed),tab:(i:number)=>{const t=TAB_ORDER[i];if(t)onNavigate(t);},escape:()=>setPalette(false)}),[collapsed,onNavigate]);
 useDesktopKeys(true,keys);
 const commands=useMemo<Command[]>(()=>[
  ...TAB_ORDER.map((t,i)=>({id:'tab:'+t,label:TAB_LABELS[t].label,group:'Menus',icon:TAB_LABELS[t].icon,hint:'Alt+'+(i+1),run:()=>onNavigate(t)})),
  {id:'tab:notifications',label:'Notificações',group:'Menus',icon:'bell',run:()=>onNavigate('notifications')},
  ...APP_SHORTCUTS.map(a=>({id:'app:'+a.id,label:a.title,group:'Apps',icon:a.icon,run:()=>onOpenModule(a.id)})),
  {id:'action:new-page',label:'Nova página',group:'Ações',icon:'plus',run:onCreatePage},
  // 0.3.269: "adicionar" no Ctrl+K abre a janela de adicionar da Biblioteca
  {id:'action:library-add',label:'Adicionar à Biblioteca',group:'Ações',icon:'book',hint:'N',run:()=>{(globalThis as any).__sofiaLibraryAdd=true;onOpenModule('library');setTimeout(()=>{try{window.dispatchEvent(new CustomEvent('sofia:library-add'));(globalThis as any).__sofiaLibraryAdd=false;}catch{/* navegador antigo */}},350);}},
  {id:'action:sidebar',label:collapsed?'Mostrar barra lateral':'Recolher barra lateral',group:'Ações',icon:'sidebar',hint:'Ctrl+\\',run:()=>setCollapsed(!collapsed)},
  ...paletteTasks.filter(t=>!['done','cancelled'].includes(t.state)).slice(0,300).map(t=>({id:'task:'+t.id,label:t.title,group:'Tarefas',icon:(t.state==='scheduled'?'calendar':'checklist') as IconName,hint:t.state==='scheduled'?'na agenda':undefined,run:()=>{(window as any).__sofiaOpenTask=t.id;onOpenModule('tasks');try{window.dispatchEvent(new CustomEvent('sofia:open-task',{detail:t.id}));}catch{/* navegador antigo */}}})),
  ...(pages||[]).map(p=>({id:'page:'+p.id,label:p.title||'Sem título',group:'Páginas',emoji:isEmoji(p.data?.icon)?String(p.data?.icon):undefined,icon:(isEmoji(p.data?.icon)?undefined:'book') as IconName|undefined,run:()=>onOpenPage(p.id)})),
 ],[pages,paletteTasks,collapsed,onNavigate,onOpenModule,onOpenPage,onCreatePage]);
 const crumbs=[TAB_LABELS[tab]?.label||'Sofia',...(tab==='pages'?path.map(p=>p.title||'Sem título'):tab==='apps'&&moduleTitle?[moduleTitle]:[])];
 const width=Math.round((collapsed?SIDEBAR_COLLAPSED:SIDEBAR_WIDTH)*uiScale()); // 0.3.278: lateral na escala da tela
 return <View testID="desktop-shell" style={{flex:1,flexDirection:'row',backgroundColor:c.bg}}>
  <View testID="desktop-sidebar" style={{width,flexShrink:0,backgroundColor:c.surface,borderRightWidth:1,borderColor:c.line}}>
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
     <Section title="Páginas" action={<Pressable accessibilityRole="button" accessibilityLabel="Nova página" onPress={onCreatePage} style={({hovered}:any)=>({padding:3,borderRadius:6,backgroundColor:hovered?c.line:'transparent'})}><Icon name="plus" size={15} color={c.muted}/></Pressable>}>
      {pages===null?<View style={{paddingHorizontal:12}}><LoadingLines rows={3}/></View> /* 04/11/2026 (Pedro): esqueleto so se a lista ainda nao chegou; ela e pedida ja no carregamento (assets/early.js) */:pages.length?<View style={pagesLate.current?SIDE_FADE.in:undefined}><PageTree pages={pages} openId={openPageId} onOpen={onOpenPage}/></View>:<Text style={{color:c.muted,fontSize:12,paddingHorizontal:16,paddingVertical:6}}>Nenhuma página ainda.</Text>}
     </Section>
    </>}
   </ScrollView>
  </View>
  <View style={{flex:1,minWidth:0}}>
   <View testID="desktop-topbar" style={{height:52,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:20,borderBottomWidth:1,borderColor:c.line,backgroundColor:c.bg}}>
    <View testID="desktop-breadcrumb" style={{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:6}}>
     {crumbs.map((label,i)=><React.Fragment key={i}>{i?<Text style={{color:c.muted,fontSize:13}}>/</Text>:null}<Text numberOfLines={1} onPress={i===0&&crumbs.length>1?()=>onNavigate(tab):undefined} style={{color:i===crumbs.length-1?c.text:c.muted,fontSize:13,fontWeight:i===crumbs.length-1?'600':'400',flexShrink:i===crumbs.length-1?1:0}}>{label}</Text></React.Fragment>)}
     {locked?<Text style={{color:c.muted,fontSize:12,marginLeft:10}}>Conversa em andamento…</Text>:null}
    </View>
    <Pressable testID="desktop-search" accessibilityRole="button" accessibilityLabel="Buscar" onPress={()=>setPalette(true)} style={({hovered}:any)=>({flexDirection:'row',alignItems:'center',gap:8,width:260,paddingHorizontal:12,paddingVertical:7,borderRadius:9,borderWidth:1,borderColor:c.line,backgroundColor:hovered?c.input:c.surface})}>
     <Icon name="search" size={16} color={c.muted}/><Text style={{flex:1,color:c.muted,fontSize:13}}>Buscar</Text><Text style={{color:c.muted,fontSize:11}}>Ctrl+K</Text>
    </Pressable>
    <NotificationBell onViewAll={()=>onNavigate('notifications')}/>
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir perfil e configurações" onPress={()=>onNavigate('profile')}><ProfileAvatar scope={profile.email} name={profile.name} size={34}/></Pressable>
   </View>
   <View style={{flex:1,minHeight:0}}>{children}</View>
  </View>
  <CommandPalette visible={palette} onClose={()=>setPalette(false)} commands={commands}/>
 </View>;
}

