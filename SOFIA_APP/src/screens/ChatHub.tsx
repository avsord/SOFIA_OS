// 15/11/2026 (Pedro: "um template fixo igual o WhatsApp, ligado nas paginas; a Sofia e um contato"): a aba Conversa no
// computador vira uma lista de conversas. A primeira e a Sofia (o chat de sempre); as outras sao as paginas, lidas em
// baloes. Escrever, gravar audio ou anexar grava na pagina de verdade. So no site largo; no resto abre o chat da Sofia.
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import type {SofiaApi} from '../lib/api';
import type {AttachmentDraft,Entity,VoiceDraft} from '../lib/types';
import {useTheme} from '../lib/theme';
import {useDesktop} from '../lib/desktop';
import {Icon} from '../components/Icon';
import {Composer} from '../components/Composer';
import {Chat} from './Chat';
import {pageDraft,pagePatch,type PageBlock} from '../lib/page-editor';
import {pageParentId} from '../lib/page-hierarchy';
import {isLocked} from '../lib/page-lock';
import {subscribeSystemChanged,systemChanged} from '../lib/system-events';
import {attachmentBase64,attachmentSize} from '../lib/attachment-read';
import {LinkBubbleCard,LinkDraftCard} from '../components/LinkCard';
import {firstUrl} from '../lib/link-info';
import {FileWindowHost,InlineMedia,defaultView,fileKind,openFileWindow} from '../components/PageFiles';
import {changeNoteBlocks,noteChats,parseNoteChatId,setNoteMain} from '../lib/note-chat';
import {requestOpenNote} from '../lib/notes-move';
import {appendBlocks,bubblesOf,chatFileBlock,chatLists,chatTextBlocks,editBubble,inMain,lastLine,listTime,pageBlocks,removeBubble,toggleTodo,type Bubble} from '../lib/page-chat';

type ChatProps=React.ComponentProps<typeof Chat>;
type Props=ChatProps&{onOpenPage?:(id:string)=>void};
const SEL_KEY='sofia.chat.conversa';
const readSel=()=>{try{return localStorage.getItem(SEL_KEY)||'sofia';}catch{return 'sofia';}};
const AUDIO_EXT:Record<string,string>={'audio/webm':'webm','audio/mp4':'m4a','audio/ogg':'ogg','audio/mpeg':'mp3','audio/wav':'wav'};

export function ChatHub(props:Props){
 const desktop=useDesktop();
 return desktop?<Hub {...props}/>:<Chat {...props}/>;
}

function Hub(props:Props){
 const {api,onOpenPage,enterToSend,autoSendVoice,active}=props,c=useTheme();
 const [pages,setPages]=useState<Entity[]>([]),[sel,setSelRaw]=useState(readSel),[q,setQ]=useState(''),[showArchived,setShowArchived]=useState(false);
 const [error,setError]=useState(''),[naming,setNaming]=useState<null|{parent:string}>(null),[name,setName]=useState('');
 const pending=useRef(0),queue=useRef<Promise<void>>(Promise.resolve()),alive=useRef(true);
 useEffect(()=>()=>{alive.current=false;},[]);
 const setSel=useCallback((id:string)=>{setSelRaw(id);setNaming(null);try{localStorage.setItem(SEL_KEY,id);}catch{}},[]);
 const load=useCallback(async()=>{
  if(pending.current)return;
  try{const items:Entity[]=[];for(let offset=0;offset<10000;offset+=100){const r=await api.entities('user_page','',offset);items.push(...r.items);if(r.items.length<100)break;}
   if(alive.current&&!pending.current)setPages(items.filter(p=>p.state!=='archived'&&!isLocked(p)));}
  catch(e:any){if(alive.current)setError(String(e?.message||'Não deu para carregar as páginas.'));}
 },[api]);
 useEffect(()=>{if(active)void load();},[active,load]);
 useEffect(()=>subscribeSystemChanged(owner=>{if(owner===api)void load();}),[api,load]);

 const notes=useMemo(()=>noteChats(pages),[pages]),all=useMemo(()=>[...pages,...notes],[pages,notes]);
 const byId=useMemo(()=>new Map(all.map(p=>[p.id,p])),[all]);
 const page=sel==='sofia'?undefined:byId.get(sel);
 const lists=useMemo(()=>chatLists(all,q),[all,q]);
 const kids=useMemo(()=>page?pages.filter(p=>pageParentId(p)===page.id):[],[pages,page]);

 /** Grava na página: mostra na hora e salva em fila, sempre em cima da versão mais nova do servidor. */
 const mutatePage=useCallback((id:string,change:(blocks:PageBlock[])=>PageBlock[])=>{
  pending.current++;setError('');
  setPages(old=>old.map(p=>p.id===id?{...p,updated_at:new Date().toISOString(),data:{...p.data,blocks_json:JSON.stringify(change(pageBlocks(p)))}}:p));
  queue.current=queue.current.then(async()=>{
   try{const base=await api.entityFresh(id),before=pageDraft(base),after={...before,blocks:change(before.blocks)};
    const saved=await api.saveEntity(pagePatch(base,before,after),base);
    if(alive.current)setPages(old=>old.map(p=>p.id===id?{...saved,data:{...saved.data,blocks_json:pending.current>1?p.data?.blocks_json:saved.data?.blocks_json}}:p));}
   catch(e:any){if(alive.current)setError('Não salvou na página: '+String(e?.message||'erro')+'.');}
   finally{pending.current--;if(!pending.current){systemChanged(api);}}
  });
 },[api]);
 // nota da pagina: a conversa grava dentro da nota, na pagina dona
 const mutate=useCallback((id:string,change:(blocks:PageBlock[])=>PageBlock[])=>{const n=parseNoteChatId(id);if(n)mutatePage(n.pageId,b=>changeNoteBlocks(b,n.leafId,change));else mutatePage(id,change);},[mutatePage]);
 const setMain=useCallback(async(p:Entity,on:boolean)=>{
  {const n=parseNoteChatId(p.id);if(n){mutatePage(n.pageId,b=>setNoteMain(b,n.leafId,on));return;}}
  setPages(old=>old.map(x=>x.id===p.id?{...x,data:{...x.data,chat_main:on}}:x));
  try{const base=await api.entityFresh(p.id);const saved=await api.saveEntity({id:base.id,revision:base.revision,data:{...base.data,chat_main:on}},base);
   if(alive.current)setPages(old=>old.map(x=>x.id===p.id?saved:x));}
  catch(e:any){if(alive.current){setError('Não deu para mover a conversa.');void load();}}
 },[api,load,mutatePage]);
 const create=useCallback(async()=>{
  const title=name.trim();if(!title||!naming)return;const parent=naming.parent?byId.get(naming.parent):undefined;setNaming(null);setName('');
  try{const saved=await api.saveEntity({kind:'user_page',title,content:'',area:parent?.area||'Pessoal',privacy:'private',state:'active',tags:[],data:{
    icon:'',icon_mode:'default',cover_type:'',cover_value:'',cover_attachment_id:'',purpose:'',layout:'notes',suggested:false,
    parent_id:parent?.id||'',node_type:parent?'page':'space',blocks_json:'[]',chat_main:true}});
   if(!alive.current)return;setPages(old=>[...old,saved]);setSel(saved.id);systemChanged(api);}
  catch(e:any){if(alive.current)setError('Não deu para criar a página: '+String(e?.message||'erro')+'.');}
 },[api,byId,name,naming,setSel]);

 const row=(id:string,title:string,sub:string,time:string,icon:'sofia'|'note',onSide?:()=>void,sideIcon?:'box'|'pin')=>
  <Pressable key={id} accessibilityRole="button" accessibilityLabel={'Conversa '+title} onPress={()=>setSel(id)}
   style={(s:any)=>({flexDirection:'row',alignItems:'center',gap:10,paddingVertical:9,paddingHorizontal:12,backgroundColor:sel===id?c.accentSoft:s.hovered?c.input:'transparent'})}>
   <View style={{width:38,height:38,borderRadius:19,backgroundColor:icon==='sofia'?c.accent:c.card,alignItems:'center',justifyContent:'center'}}><Icon name={icon} size={19} color={icon==='sofia'?c.onAccent:c.accent}/></View>
   <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={{color:c.text,fontSize:14.5,fontWeight:'600'}}>{title||'Sem título'}</Text>
    <Text numberOfLines={1} style={{color:c.muted,fontSize:12.5,marginTop:1}}>{sub||' '}</Text></View>
   <View style={{alignItems:'flex-end',gap:3}}><Text style={{color:c.muted,fontSize:11}}>{time}</Text>
    {onSide&&sideIcon?<Pressable accessibilityRole="button" accessibilityLabel={sideIcon==='box'?'Arquivar conversa':'Trazer para a principal'} onPress={(e:any)=>{e.stopPropagation?.();onSide();}} hitSlop={6}><Icon name={sideIcon} size={15} color={c.muted}/></Pressable>:null}</View>
  </Pressable>;
 const pageRow=(p:Entity)=>{const par=byId.get(pageParentId(p));
  return row(p.id,p.title,lastLine(pageBlocks(p))||(par?'em '+par.title:''),listTime(p.updated_at),'note',()=>void setMain(p,!inMain(p)),inMain(p)?'box':'pin');};

 return <View style={{flex:1,flexDirection:'row',backgroundColor:c.bg,minHeight:0}}>
  <View style={{width:320,borderRightWidth:1,borderRightColor:c.line,backgroundColor:c.surface}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:8,padding:12}}>
    <View style={{flex:1,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:c.input,borderRadius:18,paddingHorizontal:12,height:36}}><Icon name="search" size={16} color={c.muted}/>
     <TextInput accessibilityLabel="Pesquisar conversas" value={q} onChangeText={setQ} placeholder="Pesquisar páginas" placeholderTextColor={c.muted} style={{flex:1,color:c.text,fontSize:14,outlineStyle:'none'} as any}/></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Nova página" onPress={()=>{setName('');setNaming({parent:''});}} style={{width:36,height:36,borderRadius:18,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name="plus" size={18} color={c.accent}/></Pressable>
   </View>
   {naming&&!naming.parent?<NameBox value={name} onChange={setName} onOk={()=>void create()} onCancel={()=>setNaming(null)} label="Nome da página nova"/>:null}
   <ScrollView style={{flex:1}}>
    {!q?<Pressable accessibilityRole="button" accessibilityLabel="Arquivadas" onPress={()=>setShowArchived(v=>!v)} style={(s:any)=>({flexDirection:'row',alignItems:'center',gap:10,paddingVertical:9,paddingHorizontal:12,backgroundColor:s.hovered?c.input:'transparent'})}>
     <View style={{width:38,alignItems:'center'}}><Icon name="box" size={18} color={c.muted}/></View><Text style={{flex:1,color:c.text,fontSize:14.5}}>Arquivadas</Text>
     <Text style={{color:c.muted,fontSize:12}}>{lists.archived.length}</Text><Icon name="chevron" size={14} color={c.muted}/></Pressable>:null}
    {showArchived||q?lists.archived.map(pageRow):null}
    {showArchived&&!q?<View style={{height:1,backgroundColor:c.line,marginVertical:4}}/>:null}
    {!q||'sofia'.includes(q.trim().toLowerCase())?row('sofia','Sofia','Falar com a Sofia','','sofia'):null}
    {lists.main.map(pageRow)}
    {!lists.main.length&&!q?<Text style={{color:c.muted,fontSize:13,padding:16,lineHeight:19}}>Abra Arquivadas e toque no alfinete da página que você quer deixar aqui.</Text>:null}
   </ScrollView>
  </View>
  <View style={{flex:1,minWidth:0}}>
   {error?<Pressable onPress={()=>setError('')} style={{backgroundColor:c.dangerBg,paddingVertical:8,paddingHorizontal:16}}><Text style={{color:c.danger,fontSize:13}}>{error}</Text></Pressable>:null}
   <View style={{flex:1,display:page?'none':'flex'} as any}><Chat {...props} active={active&&!page}/></View>
   {page?<PageTalk key={page.id} api={api} page={page} kids={kids} enterToSend={enterToSend} autoSendVoice={autoSendVoice} mutate={mutate} onOpenPage={onOpenPage} onSelect={setSel}
     onFail={setError} onToggleMain={()=>void setMain(page,!inMain(page))} naming={!!naming?.parent} name={name} onName={setName}
     onStartSub={()=>{setName('');setNaming({parent:page.id});}} onCancelSub={()=>setNaming(null)} onCreateSub={()=>void create()} parent={byId.get(pageParentId(page))}/>:null}
  </View>
  <FileWindowHost/>
 </View>;
}

function NameBox({value,onChange,onOk,onCancel,label}:{value:string;onChange:(v:string)=>void;onOk:()=>void;onCancel:()=>void;label:string}){
 const c=useTheme();
 return <View style={{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,paddingBottom:10}}>
  <TextInput autoFocus accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={label} placeholderTextColor={c.muted} onSubmitEditing={onOk}
   onKeyPress={(e:any)=>{if(e.nativeEvent.key==='Escape')onCancel();}} style={{flex:1,height:36,borderRadius:10,borderWidth:1,borderColor:c.line,backgroundColor:c.bg,color:c.text,paddingHorizontal:10,fontSize:14,outlineStyle:'none'} as any}/>
  <Pressable accessibilityRole="button" accessibilityLabel="Criar" onPress={onOk} style={{height:36,paddingHorizontal:12,borderRadius:10,backgroundColor:c.accent,alignItems:'center',justifyContent:'center'}}><Text style={{color:c.onAccent,fontWeight:'600',fontSize:13}}>Criar</Text></Pressable>
 </View>;
}

function PageTalk({api,page,kids,parent,enterToSend,autoSendVoice,mutate,onOpenPage,onSelect,onFail,onToggleMain,naming,name,onName,onStartSub,onCancelSub,onCreateSub}:{
 api:SofiaApi;page:Entity;kids:Entity[];parent?:Entity;enterToSend:boolean;autoSendVoice:boolean;mutate:(id:string,change:(b:PageBlock[])=>PageBlock[])=>void;
 onOpenPage?:(id:string)=>void;onSelect:(id:string)=>void;onFail:(m:string)=>void;onToggleMain:()=>void;naming:boolean;name:string;onName:(v:string)=>void;onStartSub:()=>void;onCancelSub:()=>void;onCreateSub:()=>void}){
 const c=useTheme(),scroll=useRef<ScrollView>(null);
 const isNote=!!page.data?.note_of,home=String(page.data?.note_of||page.id),openPage=()=>{if(isNote)requestOpenNote(home,String(page.data?.note_id||''));onOpenPage?.(home);};
 const blocks=useMemo(()=>pageBlocks(page),[page]),bubbles=useMemo(()=>bubblesOf(blocks),[blocks]);
 const [typed,setTyped]=useState(''),[shut,setShut]=useState(''),typedUrl=firstUrl(typed);
 const [picked,setPicked]=useState(''),[editing,setEditing]=useState(''),[draft,setDraft]=useState(''),[sending,setSending]=useState(0);
 useEffect(()=>{const t=setTimeout(()=>scroll.current?.scrollToEnd({animated:false}),30);return()=>clearTimeout(t);},[bubbles.length]);
 // o bloco do texto nasce uma vez so (mesmo id na tela e na gravacao)
 const sendOnce=useCallback((text:string)=>{const t=text.trim();if(!t)return;const now=new Date();let made:PageBlock[]|null=null;
  mutate(page.id,b=>{made=made||chatTextBlocks(b,t,now);return appendBlocks(b,made);});},[mutate,page.id]);
 const sendFile=useCallback(async(uri:string,nameIn:string,mimeIn:string,sizeIn:number)=>{
  const base64=await attachmentBase64(uri),up=await api.uploadAttachment(home,{name:nameIn,mime:mimeIn,base64});
  const blk=chatFileBlock({attachment_id:up.id,name:nameIn,mime:mimeIn,size:sizeIn,view:defaultView(fileKind(mimeIn,nameIn))});
  mutate(page.id,b=>appendBlocks(b,[blk]));
 },[api,mutate,page.id]);
 const onAttachments=useCallback((files:AttachmentDraft[],text:string)=>{setSending(n=>n+1);
  void (async()=>{try{for(const f of files)await sendFile(f.uri,f.name,f.mime,f.size||await attachmentSize(f.uri));if(text.trim())sendOnce(text);}
   catch(e:any){onFail('Não enviou o anexo: '+String(e?.message||'erro')+'.');}finally{setSending(n=>n-1);}})();},[sendFile,sendOnce,onFail]);
 const onVoice=useCallback((v:VoiceDraft)=>{setSending(n=>n+1);
  void (async()=>{try{let mime='audio/webm';try{mime=((await (await fetch(v.uri)).blob()).type||mime).split(';')[0];}catch{}
    const d=new Date(),p=(n:number)=>String(n).padStart(2,'0');
    await sendFile(v.uri,`audio-${p(d.getDate())}-${p(d.getMonth()+1)}-${p(d.getHours())}${p(d.getMinutes())}.${AUDIO_EXT[mime]||'webm'}`,mime,await attachmentSize(v.uri));}
   catch(e:any){onFail('Não enviou o áudio: '+String(e?.message||'erro')+'.');}finally{setSending(n=>n-1);}})();},[sendFile,onFail]);
 const saveEdit=()=>{const id=editing,t=draft.trim();setEditing('');setPicked('');if(!id)return;if(!t)mutate(page.id,b=>removeBubble(b,id));else mutate(page.id,b=>editBubble(b,id,t));};
 const remove=(id:string)=>{setPicked('');if(typeof window!=='undefined'&&!window.confirm('Apagar esta linha da página?'))return;mutate(page.id,b=>removeBubble(b,id));};
 const act=(label:string,onPress:()=>void,danger=false)=><Pressable accessibilityRole="button" onPress={onPress} hitSlop={4}><Text style={{color:danger?c.danger:c.accent,fontSize:12,fontWeight:'600'}}>{label}</Text></Pressable>;
 const head=(label:string,icon:'plus'|'external'|'box'|'pin',onPress:()=>void)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
  style={(s:any)=>({flexDirection:'row',alignItems:'center',gap:6,height:32,paddingHorizontal:10,borderRadius:16,borderWidth:1,borderColor:c.line,backgroundColor:s.hovered?c.input:'transparent'})}>
  <Icon name={icon} size={14} color={c.muted}/><Text style={{color:c.text,fontSize:12.5}}>{label}</Text></Pressable>;

 const bubble=(b:Bubble)=>{
  if(b.kind==='day')return <View key={b.id} style={{alignSelf:'center',backgroundColor:c.card,borderRadius:10,paddingVertical:3,paddingHorizontal:12,marginVertical:8}}><Text style={{color:c.muted,fontSize:11.5}}>{b.label}</Text></View>;
  const on=picked===b.id,time=b.time?<Text style={{color:c.muted,fontSize:10.5,marginLeft:10,alignSelf:'flex-end'}}>{b.time}</Text>:null;
  let body:React.ReactNode;
  if(b.kind==='text')body=editing===b.id
   ?<TextInput autoFocus multiline accessibilityLabel="Editar linha" value={draft} onChangeText={setDraft} onBlur={saveEdit}
     onKeyPress={(e:any)=>{const k=e.nativeEvent.key;if(k==='Escape'){setEditing('');setPicked('');}else if(k==='Enter'&&!e.nativeEvent.shiftKey){e.preventDefault?.();saveEdit();}}}
     style={{minWidth:260,color:c.text,fontSize:14.5,lineHeight:20,outlineStyle:'none'} as any}/>
   :<View>{firstUrl(b.text)?<LinkBubbleCard api={api} url={firstUrl(b.text)}/>:null}<View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'flex-end'}}>
     {b.todo?<Pressable accessibilityRole="checkbox" accessibilityLabel="Marcar tarefa" onPress={()=>mutate(page.id,x=>toggleTodo(x,b.id))} style={{width:16,height:16,borderRadius:4,borderWidth:1.5,borderColor:c.accent,backgroundColor:b.checked?c.accent:'transparent',marginRight:8,marginBottom:2,alignItems:'center',justifyContent:'center'}}>{b.checked?<Icon name="check" size={11} color={c.onAccent}/>:null}</Pressable>:null}
     <Text selectable style={{color:c.text,fontSize:14.5,lineHeight:20,fontWeight:b.heading?'700':'400',textDecorationLine:b.todo&&b.checked?'line-through':'none',flexShrink:1}}>{b.text}</Text>{time}</View></View>;
  else if(b.kind==='file'){const kind=fileKind(b.mime,b.name),media=kind==='image'||kind==='video'||kind==='audio';
   body=<View style={{gap:4}}>{media?<View style={{width:kind==='audio'?300:320,maxWidth:'100%',borderRadius:8,overflow:'hidden'}}><InlineMedia api={api} id={b.attachmentId} kind={kind} name={b.name}/></View>
    :<Pressable accessibilityRole="button" accessibilityLabel={'Abrir '+b.name} onPress={()=>openFileWindow(api,{id:b.attachmentId,name:b.name,mime:b.mime,pageId:home})} style={{flexDirection:'row',alignItems:'center',gap:8}}><Icon name="file" size={18} color={c.accent}/><Text numberOfLines={1} style={{color:c.text,fontSize:14,maxWidth:300}}>{b.name}</Text></Pressable>}
    {time?<View style={{alignSelf:'flex-end'}}>{time}</View>:null}</View>;}
  else body=<Pressable accessibilityRole="button" accessibilityLabel={b.label+': abrir na página'} onPress={openPage} style={{flexDirection:'row',alignItems:'center',gap:8}}><Icon name="external" size={15} color={c.accent}/><Text style={{color:c.text,fontSize:14}}>{b.label}</Text><Text style={{color:c.muted,fontSize:12}}>abrir na página</Text></Pressable>;
  return <View key={b.id} style={{alignSelf:'flex-end',maxWidth:'78%',marginBottom:5,alignItems:'flex-end'}}>
   <Pressable onPress={()=>{if(editing!==b.id)setPicked(on?'':b.id);}} style={{backgroundColor:c.bubble,borderRadius:12,borderTopRightRadius:on?12:4,paddingVertical:7,paddingHorizontal:11,borderWidth:on?1:0,borderColor:c.accent}}>{body}</Pressable>
   {on&&editing!==b.id?<View style={{flexDirection:'row',gap:14,marginTop:3,marginRight:4}}>
    {b.kind==='text'?act('Editar',()=>{setDraft(b.text);setEditing(b.id);}):null}{act('Apagar',()=>remove(b.id),true)}</View>:null}
  </View>;
 };

 return <View style={{flex:1,minHeight:0}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:10,paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:c.line,backgroundColor:c.surface}}>
   <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={{color:c.text,fontSize:16,fontWeight:'700'}}>{page.title||'Sem título'}</Text>
    {parent?<Pressable onPress={()=>onSelect(parent.id)}><Text numberOfLines={1} style={{color:c.muted,fontSize:12}}>em {parent.title}</Text></Pressable>:null}</View>
   {isNote?null:head('Subpágina','plus',onStartSub)}{onOpenPage?head(isNote?'Abrir nota':'Abrir página','external',openPage):null}{head(inMain(page)?'Arquivar':'Trazer para a principal',inMain(page)?'box':'pin',onToggleMain)}
  </View>
  {naming?<View style={{paddingTop:10,backgroundColor:c.surface,borderBottomWidth:1,borderBottomColor:c.line}}><NameBox value={name} onChange={onName} onOk={onCreateSub} onCancel={onCancelSub} label={'Nome da subpágina de '+page.title}/></View>:null}
  <ScrollView ref={scroll} style={{flex:1}} contentContainerStyle={{paddingVertical:12,paddingHorizontal:20}}>
   {kids.map(k=><Pressable key={k.id} accessibilityRole="button" accessibilityLabel={'Subpágina '+k.title} onPress={()=>onSelect(k.id)}
    style={(s:any)=>({flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:c.line,borderRadius:10,paddingVertical:8,paddingHorizontal:12,marginBottom:6,backgroundColor:s.hovered?c.input:c.surface})}>
    <Icon name="note" size={16} color={c.accent}/><Text numberOfLines={1} style={{flex:1,color:c.text,fontSize:14}}>{k.title||'Sem título'}</Text><Text numberOfLines={1} style={{color:c.muted,fontSize:12,maxWidth:260}}>{lastLine(pageBlocks(k))}</Text><Icon name="chevron" size={14} color={c.muted}/></Pressable>)}
   {bubbles.map(bubble)}
   {!bubbles.length&&!kids.length?<Text style={{color:c.muted,fontSize:13.5,textAlign:'center',marginTop:40}}>Página vazia. O que você escrever aqui entra nela.</Text>:null}
   {sending?<Text style={{color:c.muted,fontSize:12,alignSelf:'flex-end',marginTop:4}}>Enviando…</Text>:null}
  </ScrollView>
  {typedUrl&&typedUrl!==shut?<LinkDraftCard api={api} url={typedUrl} onClose={()=>setShut(typedUrl)}/>:null}
  <Composer key={page.id} placeholder="Escrever nesta página" disabled={false} enterToSend={enterToSend} autoSendVoice={autoSendVoice} onText={sendOnce} onVoice={onVoice} onAttachments={onAttachments} onActivity={noop} onDraft={noop} onTextChange={setTyped}/>
 </View>;
}
const noop=()=>{};
