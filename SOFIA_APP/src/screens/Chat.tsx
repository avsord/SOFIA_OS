import {Presence} from '../components/Presence';
import {sendDraft,useDraft} from '../lib/draft-bus';
import {noteFluencyMovement,userIsIdle} from '../lib/fluency';
import {ConversationBoard,topicSummary} from '../components/ConversationBoard';
import type {BoardData,BoardTopic} from '../lib/api';
import {PALETTE} from '../lib/palette';
import {rightClick} from '../lib/web-page';
import {tap,useDesktop} from '../lib/desktop';
import {ContentWidth,edgePadding} from '../lib/content-width';
import {useRenderCost} from '../lib/render-cost';
import {useVisibleLoad} from '../lib/visible-load';
import type {Task,MessagePage} from '../lib/types';
import {recentChatPage,olderChatPage,ChatHistoryGesture} from '../lib/chat-window';
import {hasChatArrival} from '../lib/chat-scroll';
import {newestFirst,useChatTail} from '../lib/chat-tail';
import type {ChatSnapshot} from '../lib/types';
import {attachmentText,parseAttachments} from '../lib/chat-attachments';
import * as Sharing from 'expo-sharing';
import {Paths} from 'expo-file-system';
import type {AttachmentDraft} from '../lib/types';
import {KeyboardViewport} from '../components/KeyboardViewport';
import {Sheet} from '../components/Sheet';
import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, FlatList, Modal, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, AppState, BackHandler, Animated, Easing,useWindowDimensions} from 'react-native';
import * as Crypto from 'expo-crypto';
import * as Clipboard from 'expo-clipboard';
import { File } from 'expo-file-system';
import {attachmentBase64,attachmentSize} from '../lib/attachment-read';
import type { Bootstrap, Conversation, Message, VoiceDraft, ChatResult } from '../lib/types';
import { SITE,SofiaApi } from '../lib/api';
import { dayKey, errorText, mergeMessages, statusLabel } from '../lib/chat-model';
import {reconcileChatWindow,toggleMessageSelection,retainMessageSelection} from '../lib/chat-sync';
import {Icon} from '../components/Icon';
import { useTheme } from '../lib/theme';
import { silenceVoices } from '../lib/audio-focus';
import { Brand, Empty, ErrorBanner, IconButton } from '../components/UI';
import { Composer, deleteVoice } from '../components/Composer';
import { VoicePlayer } from '../components/VoicePlayer';
import {MountTimer} from '../components/MountTimer';
import {appAlert} from '../lib/app-alert';
/** 03/11/2026 (desenho 06): cor de cada tipo no menu de criar manualmente, as mesmas do Inicio */
const CREATE_COLOR:Record<string,string>={event:'#8fb4ff',task:'#F5A0AE',reminder:'#E8B04A',capsule:'#88CFB8',expense:'#b49ae6',income:'#5FD3A2'};
// 0.3.199: a foto da conversa aparece desfocada (miniatura de poucos bytes); o original fica no Drive.
// Tocar abre a foto nitida, com "Salvar no celular"; ao fechar, nada fica guardado no aparelho.
function PhotoThumb({api,id}:{api:SofiaApi;id:string}){
 const c=useTheme(),[failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false);
 // 0.3.266: no SITE a imagem nao manda o cabecalho de login (o navegador ignora "headers" em <img>) e a miniatura voltava
 // vazia. Aqui ela e baixada com o login e mostrada a partir da memoria do navegador.
 const source=api.attachmentThumb(id),[webUri,setWebUri]=useState('');
 useEffect(()=>{if(Platform.OS!=='web')return;let alive=true,url='';fetch(source.uri,{headers:source.headers}).then(r=>{if(!r.ok)throw new Error(String(r.status));return r.blob();}).then(b=>{url=URL.createObjectURL(b);if(alive)setWebUri(url);}).catch(()=>{if(alive)setFailed(true);});return()=>{alive=false;if(url)URL.revokeObjectURL(url);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[id]);
 return <View style={{width:220,height:160,borderRadius:12,overflow:'hidden',marginBottom:6,backgroundColor:c.input,alignItems:'center',justifyContent:'center'}}>
  {/* 0.3.265 (Conversa aprovada): a foto aparece na hora (miniatura nitida), sem o quadrado escuro com "Clique para ver" */}
  {failed||(Platform.OS==='web'&&!webUri)?null:<Image source={Platform.OS==='web'?{uri:webUri}:source} resizeMode="cover" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)} style={{position:'absolute',top:0,left:0,right:0,bottom:0}}/>}
  {/* 0.3.266: enquanto a miniatura nao aparece (ou se ela nao vier), nunca fica um quadrado vazio */}
  {!loaded||failed?<View style={{alignItems:'center',gap:6}}><Icon name="image" size={26} color={c.muted}/><Text style={{color:c.muted,fontSize:12}}>{tap('Toque para abrir a foto')}</Text></View>:null}
 </View>;
}
function PhotoViewer({api,id,name,onSave,onClose}:{api:SofiaApi;id:string;name:string;onSave:()=>void;onClose:()=>void}){
 // 0.3.202: baixa a foto pelo mesmo caminho do "Salvar no celular" (com a autorizacao garantida) e mostra a
 // copia temporaria; ao fechar, ela e apagada. Se falhar, mostra o motivo que o servidor devolveu.
 const c=useTheme(),[uri,setUri]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let alive=true,temp:File|null=null;
  // 0.3.266: no site nao ha arquivo temporario - a foto vem com o login e fica so na memoria do navegador
  if(Platform.OS==='web'){let url='';const source=api.attachmentSource(id);fetch(source.uri,{headers:source.headers}).then(r=>{if(!r.ok)throw new Error('A foto não abriu ('+r.status+').');return r.blob();}).then(b=>{url=URL.createObjectURL(b);if(alive)setUri(url);}).catch(e=>{if(alive)setError(String(e?.message||e));});return()=>{alive=false;if(url)URL.revokeObjectURL(url);};}
  (async()=>{try{const source=api.attachmentSource(id),safe=name.replace(/[^\p{L}\p{N}._-]/gu,'_');
   const target=new File(Paths.cache,'ver-'+id+'-'+safe);try{if(target.exists)target.delete();}catch{/* segue */}
   temp=await File.downloadFileAsync(source.uri,target,{headers:source.headers,idempotent:true});
   if(!alive){try{temp.delete();}catch{/* cache */}return;}
   setUri(temp.uri);
  }catch(e){if(!alive)return;
   let why=errorText(e);try{const r=await fetch(api.attachmentSource(id).uri,{headers:api.attachmentSource(id).headers});if(!r.ok){const b=await r.json().catch(()=>null);why=(b&&b.error)||('Erro '+r.status);}}catch{/* sem rede */}
   setError(why);}})();
  return()=>{alive=false;if(temp){try{temp.delete();}catch{/* o sistema limpa o cache */}}};
 },[api,id,name]);
 return <Sheet visible onClose={onClose} label="Fechar foto">
  <View style={{gap:12}}>
   <Text numberOfLines={1} style={{color:c.text,fontWeight:'700',fontSize:16}}>{name}</Text>
   <View style={{height:420,borderRadius:14,overflow:'hidden',backgroundColor:c.input,alignItems:'center',justifyContent:'center'}}>
    {error?<Text style={{color:c.muted,textAlign:'center',padding:20,lineHeight:20}}>Não consegui abrir a foto: {error}</Text>
     :uri?<Image source={{uri}} resizeMode="contain" onError={()=>setError('o arquivo baixado não é uma imagem válida.')} style={{width:'100%',height:'100%'}}/>
     :<ActivityIndicator color={c.accent}/>}
   </View>
   <Text style={{color:c.muted,fontSize:11,lineHeight:16}}>{tap('A foto original fica guardada no seu Google Drive, em Sofia OS/Comprovantes. Aqui ela só é mostrada; ao fechar, nada fica no celular.')}</Text>
   <View style={{flexDirection:'row',gap:10}}>
    <Pressable accessibilityRole="button" onPress={onSave} style={{flex:1,padding:14,borderRadius:14,backgroundColor:c.accentSoft,alignItems:'center'}}><Text style={{color:c.accent,fontWeight:'700'}}>{tap('Salvar no celular')}</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={onClose} style={{flex:1,padding:14,borderRadius:14,backgroundColor:c.input,alignItems:'center'}}><Text style={{color:c.text,fontWeight:'600'}}>Fechar</Text></Pressable>
   </View>
  </View>
 </Sheet>;
}
/** 03/11/2026 (aprovado no quadro): linhas que comecam com "- ", "• " ou "* " viram lista de verdade (marcador + texto
 * alinhado), em vez de mostrar o traco solto. O resto continua como texto corrido, igual antes. */
function ChatText({text,color}:{text:string;color:string}){
 const lines=text.split('\n');if(!lines.some(l=>/^\s*[-•*]\s+\S/.test(l)))return <Text style={{fontSize:16,lineHeight:23,color}}>{text}</Text>;
 const out:React.ReactNode[]=[];let buf:string[]=[];const flush=(k:number)=>{if(buf.length){out.push(<Text key={'t'+k} style={{fontSize:16,lineHeight:23,color}}>{buf.join('\n')}</Text>);buf=[];}};
 lines.forEach((l,k)=>{const m=l.match(/^\s*[-•*]\s+(.*)$/);if(!m){buf.push(l);return;}flush(k);out.push(<View key={'b'+k} style={{flexDirection:'row',gap:8,paddingLeft:2}}><Text style={{fontSize:16,lineHeight:23,color}}>•</Text><Text style={{flex:1,fontSize:16,lineHeight:23,color}}>{m[1]}</Text></View>);});
 flush(lines.length);return <View style={{gap:2}}>{out}</View>;
}
function Bubble({message,previous,api,onRetry,selecting,selected,onSelect,topic}:{message:Message;previous?:Message;api:SofiaApi;onRetry:(m:Message)=>void;selecting:boolean;selected:boolean;onSelect:(m:Message)=>void;topic?:string}) {
 const parsed=parseAttachments(message.content,SITE);
 const [viewing,setViewing]=useState<{id:string;name:string}|null>(null);
 async function openFile(id:string,name:string){try{const source=api.attachmentSource(id),safe=name.replace(/[^\p{L}\p{N}._-]/gu,'_');const file=await File.downloadFileAsync(source.uri,new File(Paths.cache,id+'-'+safe),{headers:source.headers,idempotent:true});await Sharing.shareAsync(file.uri);
 // 0.3.199: depois de salvar/compartilhar, a copia temporaria sai do celular (o original fica no Drive)
 try{file.delete();}catch{/* o sistema limpa o cache depois */}}catch(e){appAlert('Anexo',errorText(e));}}
 const c=useTheme(),mine=message.role==='user',isNewDay=!previous||dayKey(previous.created_at)!==dayKey(message.created_at);
 // 0.3.140: mensagem nova entra deslizando e surgindo (so as recentes; o historico carrega parado)
 const fresh=React.useRef(Date.now()-new Date(message.created_at).getTime()<4000).current;
 const entry=React.useRef(new Animated.Value(fresh?0:1)).current;
 useEffect(()=>{if(fresh)Animated.timing(entry,{toValue:1,duration:220,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();},[fresh,entry]);
 return <Animated.View style={{marginBottom:10,opacity:entry,transform:[{translateY:entry.interpolate({inputRange:[0,1],outputRange:[10,0]})},{scale:entry.interpolate({inputRange:[0,1],outputRange:[0.97,1]})}]}}>{isNewDay?<View style={{alignItems:'center',padding:16}}><Text style={{color:c.muted,fontSize:11,fontWeight:'500'}}>{new Date(message.created_at).toLocaleDateString('pt-BR',{day:'numeric',month:'long'})}</Text></View>:null}{topic?<View testID="chat-topic-divider" style={{alignItems:'center',paddingVertical:10}}><View style={{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:12,paddingVertical:4,borderRadius:99,backgroundColor:c.surface}}><View style={{width:6,height:6,borderRadius:3,backgroundColor:c.accent}}/><Text style={{color:c.muted,fontSize:11}}>Novo assunto · {topic}</Text></View></View>:null}
 <View style={{flexDirection:'row',justifyContent:mine?'flex-end':'flex-start',alignItems:mine?'flex-end':'flex-start',gap:8,paddingVertical:3,borderRadius:10,backgroundColor:selected?c.accentSoft:'transparent'}}>
 {selecting?<View style={{width:24,height:24,borderRadius:12,alignItems:'center',justifyContent:'center',alignSelf:'center',borderWidth:1,borderColor:selected?c.accent:c.line,backgroundColor:selected?c.accent:'transparent'}}>{selected?<Icon name="check" color={PALETTE.white} size={16}/>:null}</View>:!mine?<Brand size={25}/>:null}
 <Pressable onLongPress={()=>onSelect(message)} {...rightClick(()=>onSelect(message))} onPress={()=>{if(selecting)onSelect(message);}} delayLongPress={350}
  accessibilityRole={selecting?'checkbox':'button'} accessibilityState={{checked:selected}} accessibilityLabel={(mine?'Você: ':'Sofia: ')+(message.content||'Mensagem de voz')}
  accessibilityHint={selecting?tap('Toque para alternar a seleção'):tap('Segure para selecionar mensagens')}
  style={{maxWidth:'78%',minWidth:90,backgroundColor:mine?c.bubble:c.surface,borderWidth:mine?0:1,borderColor:selected?c.accent:c.line,borderRadius:18,borderBottomRightRadius:mine?5:18,borderTopLeftRadius:mine?18:5,paddingHorizontal:14,paddingTop:12,paddingBottom:9,gap:8}}>
 <View pointerEvents={selecting?'none':'auto'}>{message.voice&&message.voice.removed?<View accessibilityLabel="Áudio apagado. A transcrição continua na mensagem." style={{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:8,paddingHorizontal:12,borderRadius:14,backgroundColor:c.card,alignSelf:'flex-start'}}><Icon name="mic" size={15} color={c.muted}/><Text style={{color:c.muted,fontSize:12}}>Áudio apagado · a transcrição continua</Text></View>:message.voice?<VoicePlayer source={api.audioSource(message.voice.audio_url)} duration={message.voice.duration_ms}/>:message.localVoice?<VoicePlayer source={{uri:message.localVoice.uri}} duration={message.localVoice.duration}/>:null}</View>
 <Presence>{viewing?<PhotoViewer api={api} id={viewing.id} name={viewing.name} onSave={()=>void openFile(viewing.id,viewing.name)} onClose={()=>setViewing(null)}/>:null}</Presence>{parsed.attachments.map(a=><Pressable key={a.id} accessibilityLabel={'Abrir anexo '+a.name} onPress={()=>{if(selecting)onSelect(message);else if(a.image)setViewing(a);else void openFile(a.id,a.name);}} onLongPress={()=>onSelect(message)} {...rightClick(()=>onSelect(message))}>{a.image?<PhotoThumb api={api} id={a.id}/>:null}{a.image?null:<View style={{flexDirection:'row',alignItems:'center',gap:6}}><Icon name="clip" size={15} color={c.accent}/><Text style={{color:c.accent,fontSize:14}}>{a.name}</Text></View>}</Pressable>)}{message.localAttachments?.length&&!parsed.attachments.length?message.localAttachments.map((a,i)=><View key={i} style={{flexDirection:'row',alignItems:'center',gap:6}}><Icon name="clip" size={14} color={c.muted}/><Text style={{color:c.muted}}>{a.name}</Text></View>):null}
 {parsed.text?<ChatText text={parsed.text} color={c.text}/>:null}{message.error?<Text style={{color:c.danger,fontSize:12,lineHeight:18}}>{message.error}</Text>:null}
 <View style={{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:8}}><Text style={{color:c.muted,fontSize:10}}>{new Date(message.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}{mine&&message.status!=='sent'&&message.status!=='received'&&statusLabel(message.status)!=='Recebida'?' · '+statusLabel(message.status):''}</Text></View></Pressable></View>
 {mine&&message.status==='failed'&&!selecting?<Pressable accessibilityRole="button" onPress={()=>onRetry(message)} style={{alignSelf:'flex-end',padding:10,minHeight:40}}><Text style={{color:c.danger,fontSize:12,fontWeight:'500'}}>Tentar novamente</Text></Pressable>:null}</Animated.View>;
}
export function Chat({api,bootstrap,enterToSend,autoSendVoice,onLock,active,onRefreshBootstrap,taskContext,onClearTaskContext,onGoHome,onOpenModule}:{onGoHome?:()=>void;onOpenModule?:(id:string)=>void;taskContext?:Task|null;onClearTaskContext?:()=>void;api:SofiaApi;bootstrap:Bootstrap;enterToSend:boolean;autoSendVoice:boolean;onLock:(v:boolean)=>void;active:boolean;onRefreshBootstrap:()=>Promise<void>|void}) {useRenderCost('chat');
 const c=useTheme(),list=useRef<FlatList<Message>>(null);
 const {follow:followChat,pause:pauseChat,showJump,resettle,...chatScroll}=useChatTail(list,active);
 const cached=useMemo(()=>{const saved=api.cached<ChatSnapshot>('/chat-sync/current');return saved?recentChatPage(saved):undefined;},[api]);
 const historyGesture=useRef(new ChatHistoryGesture()),olderBusy=useRef(false),historyBuffer=useRef<MessagePage|null>(null);
 const [loadingOlder,setLoadingOlder]=useState(false);
 const [conversation,setConversation]=useState<Conversation|null>(cached?.conversation||null),[messages,setMessages]=useState<Message[]>(cached?.messages||[]),[hasMore,setHasMore]=useState(cached?.has_more||false);
 const reverseMessages=useMemo(()=>newestFirst(messages),[messages]);
 const previousMessages=useRef<Message[]>([]);
 useLayoutEffect(()=>{
  // History prepends and unchanged polling must not move the viewport. New
  // messages and a growing answer resume following even after reading above.
  if(hasChatArrival(previousMessages.current,messages))followChat();
  previousMessages.current=messages;
 },[messages]);
 const [loading,setLoading]=useState(!cached),[sending,setSending]=useState(false),[refreshing,setRefreshing]=useState(false),[dirty,setDirty]=useState(false),[recordingLock,setRecordingLock]=useState(false),[error,setError]=useState('');
 const [history,setHistory]=useState(false),[items,setItems]=useState<Conversation[]>(()=>api.cached<{items:Conversation[]}>('/conversations?offset=0')?.items||[]),[historyMore,setHistoryMore]=useState(false),[query,setQuery]=useState('');
 const [selectedConversations,setSelectedConversations]=useState(new Set<string>());
 const [selectedIds,setSelectedIds]=useState(new Set<string>()),[deleting,setDeleting]=useState(false);
 // 0.3.141 (estilo WhatsApp): responder citando uma mensagem; data flutuante enquanto rola
 const [quote,setQuote]=useState<Message|null>(null),[floatingDay,setFloatingDay]=useState(''),[scrolling,setScrolling]=useState(false),scrollIdle=useRef<ReturnType<typeof setTimeout>|null>(null);
 const viewability=useRef({viewabilityConfig:{itemVisiblePercentThreshold:10},onViewableItemsChanged:({viewableItems}:{viewableItems:{item:Message}[]})=>{const top=viewableItems[viewableItems.length-1]?.item;if(top)setFloatingDay(new Date(top.created_at).toLocaleDateString('pt-BR',{day:'numeric',month:'long'}));}}).current;
 function noteScrolling(){setScrolling(true);if(scrollIdle.current)clearTimeout(scrollIdle.current);scrollIdle.current=setTimeout(()=>setScrolling(false),1400);}
 // 0.3.253 (computador): barra e caixa de mensagem de ponta a ponta, conteudo alinhado a coluna da conversa
 const desktopOn=useDesktop(),readingWidth=useContext(ContentWidth),column=desktopOn?readingWidth:undefined,colPad=column?edgePadding():null,{width:chatWinW}=useWindowDimensions(),wideChat=chatWinW>=1180;
 const quoteSnippet=(m:Message)=>String(m.content||(m.voice||m.localVoice?'Mensagem de voz':'')).replace(/\s+/g,' ').trim().slice(0,160);
 const syncEpoch=useRef(0),syncBusy=useRef(false),latest=useRef({dirty,history,recordingLock,selectedIds,deleting});latest.current={dirty,history,recordingLock,selectedIds,deleting};
 const [clarification,setClarification]=useState<ChatResult['clarification']>(null);
 const mounted=useRef(true),sendLock=useRef(false),voices=useRef(new Set<string>()),currentId=useRef(cached?.conversation?.id||'');
 const inputActivity=useCallback((v:boolean)=>setDirty(v),[]);
 // 0.3.140: so a gravacao e a exclusao travam o menu; esperar a resposta nao trava (como no WhatsApp).
 useEffect(()=>{onLock(recordingLock||deleting);},[recordingLock,deleting,onLock]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;onLock(false);void silenceVoices();voices.current.forEach(deleteVoice);};},[onLock]);
 useEffect(()=>{if(!active){void silenceVoices();setSelectedIds(new Set());return;}followChat();},[active]);
 useEffect(()=>{if(!active||!selectedIds.size)return;const s=BackHandler.addEventListener('hardwareBackPress',()=>{if(!deleting)setSelectedIds(new Set());return true;});return()=>s.remove();},[active,selectedIds.size,deleting]);
 async function select(item:Conversation,publish=true){
  if(sendLock.current||latest.current.deleting)return;const epoch=++syncEpoch.current;setLoading(true);setError('');setHistory(false);setSelectedIds(new Set());setClarification(null);followChat();currentId.current=item.id;
  try{const page=publish&&['web','mobile'].includes(item.channel)&&(!item.state||item.state==='active')?await api.selectChat(item.id):await api.history(item.id);if(!mounted.current||epoch!==syncEpoch.current||currentId.current!==item.id)return;setConversation(item);setMessages(previous=>previous.length&&conversation?.id===item.id?reconcileChatWindow(previous,page):recentChatPage(page).messages);setHasMore(recentChatPage(page).has_more);}catch(e){if(mounted.current&&epoch===syncEpoch.current){const saved=api.cached<{messages:Message[];has_more:boolean}>('/conversations/'+item.id);if(saved){setConversation(item);setMessages(recentChatPage(saved).messages);setHasMore(recentChatPage(saved).has_more);}setError(errorText(e));}}finally{if(mounted.current&&epoch===syncEpoch.current)setLoading(false);}
 }
 async function initialize(){
  const epoch=++syncEpoch.current;setLoading(!api.cached<ChatSnapshot>('/chat-sync/current'));setError('');try{await api.hydrate();const page=await api.ensureChat();if(!mounted.current||epoch!==syncEpoch.current)return;if(!page.conversation){if(cached?.conversation&&cached.messages.length){setConversation(cached.conversation);setMessages(cached.messages);setHasMore(cached.has_more);setError('A conversa salva permanece disponível. Atualize a conexão para sincronizar.');}return;}
   followChat();const before=currentId.current;currentId.current=page.conversation.id;setConversation(page.conversation);setMessages(previous=>before===page.conversation!.id?reconcileChatWindow(previous,page):recentChatPage(page).messages);setHasMore(recentChatPage(page).has_more);setSelectedIds(new Set());
  }catch(e){if(mounted.current)setError(errorText(e));}finally{if(mounted.current&&epoch===syncEpoch.current)setLoading(false);}
 }
 useVisibleLoad(()=>{void initialize();},[api]);
 async function refresh(silent=false){
  if(!conversation||sendLock.current||syncBusy.current||latest.current.deleting)return;const id=conversation.id,epoch=syncEpoch.current;syncBusy.current=true;if(!silent)setRefreshing(true);
  try{const mode=latest.current,personal=['web','mobile'].includes(conversation.channel)&&(!conversation.state||conversation.state==='active'),hold=mode.dirty||mode.recordingLock||mode.history||mode.selectedIds.size>0;
   const page=personal?await api.syncChat(hold?id:undefined):await api.history(id);
   if(!mounted.current||epoch!==syncEpoch.current||currentId.current!==id||sendLock.current)return;
   if('conversation' in page&&!page.conversation){if(!latest.current.dirty){await initialize();}return;}
   if(page.conversation&&page.conversation.id!==id){if(latest.current.dirty||latest.current.recordingLock||latest.current.selectedIds.size)return;++syncEpoch.current;followChat();currentId.current=page.conversation.id;setConversation(page.conversation);setMessages(recentChatPage(page).messages);setHasMore(recentChatPage(page).has_more);setSelectedIds(new Set());setClarification(null);return;}
   setMessages(prev=>reconcileChatWindow(prev,page));
   if('deleted_ids' in page){const removed=new Set(page.deleted_ids as string[]);if(historyBuffer.current)historyBuffer.current={...historyBuffer.current,messages:historyBuffer.current.messages.filter(m=>!removed.has(m.id))};setSelectedIds(prev=>{const next=new Set([...prev].filter(key=>!removed.has(key)));return next.size===prev.size?prev:next;});}
   if(!silent)setError('');
  }catch(e:any){if(e?.status===404&&!latest.current.dirty&&!latest.current.selectedIds.size){await initialize();}else if(!silent&&mounted.current)setError(errorText(e));}
  finally{syncBusy.current=false;if(!silent&&mounted.current)setRefreshing(false);}
 }
 useVisibleLoad(()=>{if(!active||!conversation)return;void refresh(true);const sub=AppState.addEventListener('change',state=>{if(state==='active')void refresh(true);});const timer=setInterval(()=>{if(AppState.currentState==='active'&&userIsIdle())void refresh(true);},2000);return()=>{clearInterval(timer);sub.remove();};},[active,conversation,api]);
 async function older(){
  if(!conversation||!hasMore||olderBusy.current||refreshing||deleting||sending||!messages.length)return;
  const id=conversation.id,epoch=++syncEpoch.current,oldest=messages[0];olderBusy.current=true;setLoadingOlder(true);pauseChat();historyGesture.current.reset();
  try{
   await api.hydrate();
   const saved=api.cached<MessagePage>('/conversations/'+id);
   let page=olderChatPage(historyBuffer.current||undefined,oldest)||olderChatPage(saved,oldest);
   if(!page){
    if(!oldest.sequence)throw new Error('Conecte para carregar as mensagens anteriores.');
    const fetched=await api.history(id,oldest.sequence);page=recentChatPage(fetched);
    if(!mounted.current||currentId.current!==id||syncEpoch.current!==epoch)return;
    historyBuffer.current=fetched;
   }
   if(!mounted.current||currentId.current!==id||syncEpoch.current!==epoch)return;
   setMessages(prev=>mergeMessages(page!.messages,prev));setHasMore(page.has_more);setError('');
  }catch(e){if(mounted.current&&currentId.current===id)setError(errorText(e));}
  finally{olderBusy.current=false;if(mounted.current)setLoadingOlder(false);}
 }
 useEffect(()=>{historyBuffer.current=null;historyGesture.current.reset();},[conversation?.id]);
 async function newChat(){if(dirty||sending)return;followChat();++syncEpoch.current;currentId.current='';setConversation(null);setMessages([]);setHasMore(false);setHistory(false);setSelectedIds(new Set());setClarification(null);setLoading(false);setError('');}
 async function openHistory(){if(dirty||sending)return;const stored=api.cached<{items:Conversation[];has_more:boolean}>('/conversations?offset=0');if(stored){setItems(stored.items);setHistoryMore(stored.has_more);}setHistory(true);setSelectedConversations(new Set());setQuery('');try{const h=await api.conversations();const saved=api.cached<{items:Conversation[]}>('/conversations?offset=0');const rows=h.items.length?h.items:(saved?.items||[]);const all=conversation&&messages.length?[conversation,...rows]:rows;setItems([...new Map(all.map(c=>[c.id,c])).values()]);setHistoryMore(h.has_more);}catch(e){const saved=api.cached<{items:Conversation[];has_more:boolean}>('/conversations?offset=0');if(saved){setItems(saved.items);setHistoryMore(saved.has_more);}setError(errorText(e));}}
 async function moreHistory(){try{const h=await api.conversations(items.length);setItems(prev=>[...prev,...h.items]);setHistoryMore(h.has_more);}catch(e){setError(errorText(e));}}
 // 0.3.154: da para mandar varias mensagens enquanto a Sofia responde. Enquanto uma esta em curso,
 // as seguintes entram na tela na hora (como "enviando") e saem uma a uma, na ordem, quando a anterior termina.
 const sendRef=useRef<(m:Message,r?:boolean)=>Promise<void>>(async()=>{}),sendQueue=useRef<{message:Message;retry:boolean}[]>([]);
 // 03/11/2026 (aprovado no quadro): segurar na linha do tempo do celular traz o horario para ca, como responder uma
 // mensagem no WhatsApp - barrinha "Criar · hoje as 22:00" em cima do campo; a seta abre a criacao manual (minimalista).
 const [createAt,setCreateAt]=useState(''),[createMenu,setCreateMenu]=useState(false);
 useDraft<string>('chatCreate',active,iso=>{setCreateAt(iso);setCreateMenu(false);});
 const createLabel=(iso:string)=>{const d=new Date(iso),t=new Date(),tm=new Date(t.getFullYear(),t.getMonth(),t.getDate()+1),hm=d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  return (d.toDateString()===t.toDateString()?'hoje':d.toDateString()===tm.toDateString()?'amanhã':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}))+' às '+hm;};
 const localDateKeyOf=(iso:string)=>{const d=new Date(iso);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 const manual=(kind:'event'|'task'|'reminder'|'capsule'|'expense'|'income')=>{const at=createAt;setCreateMenu(false);setCreateAt('');
  if(kind==='expense'||kind==='income'){sendDraft('financeNew',{kind,date:localDateKeyOf(at)});onOpenModule?.('finance');return;}
  sendDraft('homeAdd',{kind,at});onGoHome?.();};
 async function send(message:Message,retry=false){
  if(deleting)return;
  if(sendLock.current){if(sendQueue.current.length>=8){setError('Aguarde a Sofia responder antes de enviar mais mensagens.');return;}sendQueue.current.push({message,retry});setMessages(prev=>mergeMessages(prev,[{...message,status:'sending',error:undefined}]));followChat();return;}
  ++syncEpoch.current;sendLock.current=true;setSending(true);setError('');followChat();
  setMessages(prev=>mergeMessages(prev,[{...message,status:'sending',error:undefined}]));
  let targetId=conversation?.id||currentId.current||'';
  const data={selected_task_id:taskContext?.id,conversation_id:targetId,client_message_id:message.client_id,retry,...(clarification?.id?{clarification_id:clarification.id}:{})};
  try{let result:ChatResult;
   if(!targetId){const next=(await api.newConversation()).conversation;targetId=next.id;data.conversation_id=targetId;currentId.current=targetId;setConversation(next);}
   // A send is explicit: preserve a draft in its thread instead of following a
   // remote cursor mid-composition. Publish that thread to the other client.
   if(conversation&&['web','mobile'].includes(conversation.channel)){
    try{await api.selectChat(targetId);}catch(e:any){if(e?.status!==404)throw e;
     const page=await api.ensureChat();if(!page.conversation)throw new Error('Não foi possível reabrir a conversa.');
     targetId=page.conversation.id;data.conversation_id=targetId;currentId.current=targetId;
     if(mounted.current){setConversation(page.conversation);setMessages(mergeMessages(recentChatPage(page).messages,[{...message,conversation_id:targetId,status:'sending'}]));}
    }
   }
   if(message.localVoice){/* 0.3.330: lido pelo leitor do aparelho ou do navegador (o do celular quebrava no site: "this.validatePath is not a function") */const size=await attachmentSize(message.localVoice.uri);if(!size)throw new Error('O áudio não está mais disponível. Grave novamente.');if(size>bootstrap.limits.audio_bytes)throw new Error('O áudio ficou grande demais para uma única mensagem. Grave em partes para concluir o envio.');const base64=await attachmentBase64(message.localVoice.uri);result=await api.audio({...data,audio_base64:base64,mime:'audio/mp4',duration_ms:message.localVoice.duration});refreshBoardSoon(result.conversation_id);}
   else {
    let content=message.content;
    if(message.localAttachments?.length){
     for(const file of message.localAttachments){if(!file.entityId){const entity=await api.saveEntity({kind:'file',title:file.name,state:'saved',privacy:'private',area:'Pessoal',content:'Anexo da conversa '+targetId,tags:['chat-attachment'],data:{provider:'local',logical_path:'conversations/'+targetId,description:'Arquivo enviado na conversa com a Sofia'}});file.entityId=entity.id;}if(!file.attachmentId){const uploaded=await api.uploadAttachment(file.entityId,{name:file.name,mime:file.mime,base64:await attachmentBase64(file.uri)});file.attachmentId=uploaded.id;}}
     content=[content,attachmentText(message.localAttachments,SITE)].filter(Boolean).join('\n\n');
    }
    result=await api.chat({...data,message:content});refreshBoardSoon(result.conversation_id);
   }
   if(!mounted.current)return;setMessages(prev=>reconcileChatWindow(prev,result));setClarification(result.clarification);
   // Reconfere a descida depois do envio: a mensagem de voz entra com o seu tamanho
   // final (a composer já recolheu da gravação) só agora, não quando a bolha local
   // otimista tinha acabado de aparecer.
   resettle();
   if(message.localVoice){deleteVoice(message.localVoice.uri);voices.current.delete(message.localVoice.uri);}
  }catch(e){if(!mounted.current)return;const explanation=errorText(e);setError(explanation);setMessages(prev=>mergeMessages(prev,[{...message,status:'failed',error:explanation}]));try{const page=await api.history(targetId);if(mounted.current&&currentId.current===targetId)setMessages(prev=>reconcileChatWindow(prev,page));}catch{}}
  finally{sendLock.current=false;if(mounted.current)setSending(false);const next=sendQueue.current.shift();if(next&&mounted.current)void sendRef.current(next.message,next.retry);}
 }
 sendRef.current=send;
 function text(content:string){const id=Crypto.randomUUID();if(createAt&&content.trim()){content='(Criar para '+createLabel(createAt)+') '+content;setCreateAt('');setCreateMenu(false);}const quoted=quote?'> '+(quote.role==='user'?'Você':'Sofia')+': '+quoteSnippet(quote)+'\n\n':'';setQuote(null);void send({id,client_id:id,conversation_id:conversation?.id,role:'user',content:quoted+content,created_at:new Date().toISOString(),status:'sending'});}
 function attachments(files:AttachmentDraft[],content:string){const id=Crypto.randomUUID();if(createAt){content='(Criar para '+createLabel(createAt)+') '+content;setCreateAt('');setCreateMenu(false);} /* 03/11/2026: foto pela barrinha de criar tambem leva o horario */void send({id,client_id:id,conversation_id:conversation?.id,role:'user',content,created_at:new Date().toISOString(),status:'sending',localAttachments:files});}
 function audio(draft:VoiceDraft){voices.current.add(draft.uri);const id=Crypto.randomUUID();void send({id,client_id:id,conversation_id:conversation?.id,role:'user',content:'',created_at:new Date().toISOString(),status:'sending',localVoice:draft});}
 function selectMessage(message:Message){if(sending||recordingLock||deleting)return;setSelectedIds(prev=>toggleMessageSelection(prev,message.id));}
 function deleteSelected(){
  if(!conversation||!selectedIds.size||deleting||sending)return;
  const chosen=messages.filter(m=>selectedIds.has(m.id)),id=conversation.id;
  appAlert('Excluir '+chosen.length+' mensagem'+(chosen.length===1?'?':'s?'),'As mensagens selecionadas serão excluídas do histórico do app e do site.',[
   {text:'Cancelar',style:'cancel'},
   {text:'Excluir',style:'destructive',onPress:()=>{void(async()=>{
    ++syncEpoch.current;setDeleting(true);setError('');
    const local=chosen.filter(m=>!m.sequence&&m.status==='failed'),remote=chosen.filter(m=>!local.includes(m));
    let removed=local.map(m=>m.id);
    try{await silenceVoices();if(remote.length){const result=await api.deleteChatMessages(id,remote.map(m=>m.id));removed.push(...result.deleted_ids);if(result.failed.length)setError('Algumas mensagens não foram excluídas. Elas continuam selecionadas para tentar novamente.');}
     const done=new Set(removed);historyBuffer.current=null;local.forEach(m=>{if(m.localVoice){deleteVoice(m.localVoice.uri);voices.current.delete(m.localVoice.uri);}});
     if(mounted.current&&currentId.current===id){setMessages(prev=>prev.filter(m=>!done.has(m.id)));setSelectedIds(prev=>new Set([...prev].filter(key=>!done.has(key))));}
    }catch(e){if(mounted.current)setError(errorText(e));}finally{if(mounted.current)setDeleting(false);}
   })();}}
  ]);
 }
 function deleteConversations(){const ids=[...selectedConversations];if(!ids.length)return;appAlert('Excluir conversas?','Somente as conversas selecionadas serão apagadas no app e no site.',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{void(async()=>{try{setDeleting(true);await api.deleteConversations(ids);setItems(prev=>prev.filter(i=>!ids.includes(i.id)));setSelectedConversations(new Set());if(conversation&&ids.includes(conversation.id))await newChat();}catch(e){setHistory(false);setError(errorText(e));}finally{setDeleting(false);}})();}}]);}
 function copySelected(){const content=messages.filter(m=>selectedIds.has(m.id)).map(m=>m.content).filter(Boolean).join('\n\n');if(content)void Clipboard.setStringAsync(content);}
 // 0.3.263 (fase 3 — Conversa): no computador as conversas ficam numa coluna a esquerda (trocar de conversa sem abrir
 // janela); a leitura continua centralizada na coluna da direita. Com a tela estreita, segue o historico em janela.
 useEffect(()=>{if(!desktopOn||!wideChat)return;let live=true;api.conversations(0).then(h=>{if(!live)return;setItems(h.items);setHistoryMore(h.has_more);}).catch(()=>{});return()=>{live=false;};},[desktopOn,wideChat,api,conversation?.id]);
 // 0.3.265 (Conversa aprovada): a lateral do computador e o Quadro da conversa (a lista de conversas foi para o historico, no topo)
 const [board,setBoard]=useState<BoardData|null>(null),[boardLoading,setBoardLoading]=useState(false),[boardOpen,setBoardOpen]=useState(false);
 const topicStarts=useMemo(()=>{const m=new Map<string,string>();(board?.topics||[]).forEach((t,i)=>{if(i>0&&t.message_id)m.set(t.message_id,t.title);});return m;},[board]);
 const openCount=(board?.topics||[]).reduce((n,t)=>n+(t.open.length?1:0),0);
 const loadBoard=useCallback(async(id?:string)=>{const cid=id||conversation?.id;if(!cid)return;try{setBoard(await api.conversationBoard(cid));}catch{/* quadro e extra: sem ele a conversa segue */}},[api,conversation?.id]);
 useEffect(()=>{setBoard(null);void loadBoard();const later=setTimeout(()=>void loadBoard(),6000);return()=>clearTimeout(later);},[conversation?.id,loadBoard]); // 0.3.268: o quadro de uma conversa antiga e montado ao abrir; busca de novo depois
 const refreshBoardSoon=useCallback((id?:string)=>{setBoardLoading(true);const tries=[2500,7000,15000];tries.forEach((ms,k)=>setTimeout(()=>{void loadBoard(id).finally(()=>{if(k===tries.length-1)setBoardLoading(false);});},ms));},[loadBoard]);
 async function saveTopicAsPage(t:BoardTopic){try{const blocks=[{id:'b1',type:'text',text:topicSummary(t).replace(/^\*[^*]+\*\n?/,'')}];await api.saveEntity({kind:'user_page',title:t.title,state:'active',data:{blocks_json:JSON.stringify(blocks)}} as any);appAlert('Guardado em Páginas','“'+t.title+'” agora é uma página sua.');}catch(e){appAlert('Não foi possível guardar',errorText(e));}}
 async function copyTopic(t:BoardTopic){try{await Clipboard.setStringAsync(topicSummary(t));appAlert('Resumo copiado','Cole no WhatsApp, no e-mail ou onde quiser.');}catch(e){appAlert('Não foi possível copiar',errorText(e));}}
 // 0.3.274: o Pedro pediu para tirar a coluna do Quadro no computador; o Quadro abre pelo mesmo botao do celular
 const sideList=null;
 return <KeyboardViewport><ChatFrame side={sideList}>
 {selectedIds.size>0?<View style={{paddingHorizontal:10,...(colPad?{paddingLeft:colPad.left,paddingRight:colPad.right}:null),paddingVertical:12,flexDirection:'row',alignItems:'center',gap:8,borderBottomWidth:1,borderColor:c.line,backgroundColor:c.surface}}><IconButton name="back" label="Sair da seleção" disabled={deleting} onPress={()=>setSelectedIds(new Set())}/><Text style={{flex:1,color:c.text,fontSize:18,fontWeight:'500'}}>{selectedIds.size} selecionada{selectedIds.size===1?'':'s'}</Text>{selectedIds.size===1?<IconButton name="undo" label="Responder esta mensagem" disabled={deleting} onPress={()=>{const m=messages.find(x=>selectedIds.has(x.id));if(m){setQuote(m);setSelectedIds(new Set());}}}/>:null}<IconButton name="copy" label="Copiar mensagens selecionadas" disabled={deleting} onPress={copySelected}/>{deleting?<ActivityIndicator color={c.accent}/>:<IconButton name="trash" label="Excluir mensagens selecionadas" onPress={deleteSelected}/>}</View>:<View style={{paddingHorizontal:16,...(colPad?{paddingLeft:colPad.left,paddingRight:colPad.right}:null),paddingVertical:12,flexDirection:'row',alignItems:'center',gap:11,borderBottomWidth:1,borderColor:c.line,backgroundColor:c.surface}}><View><Brand/><View style={{position:'absolute',right:-2,bottom:-2,width:11,height:11,borderRadius:6,backgroundColor:c.good,borderWidth:2,borderColor:c.surface}}/></View><View style={{flex:1}}><Text style={{color:c.text,fontSize:18,fontWeight:'600'}}>Sofia</Text><Text numberOfLines={1} style={{color:c.muted,fontSize:11,marginTop:2}}>{desktopOn?'online · lembra de tudo que vocês já conversaram':'online'}</Text></View>{/* 0.3.297: o botao do Quadro da conversa saiu (o Pedro achou inutil) */}<IconButton name="history" label="Histórico de conversas" onPress={()=>void openHistory()} disabled={dirty||sending||recordingLock}/><IconButton name="plus" label="Nova conversa" onPress={()=>void newChat()} disabled={dirty||sending||recordingLock}/></View>}
 {!bootstrap.ai.ready?<ErrorBanner text={bootstrap.ai.reason||'O Filtro Privado está sendo sincronizado com o servidor.'} onRetry={()=>void onRefreshBootstrap()}/>:null}{error?<ErrorBanner text={error} onRetry={()=>void (conversation?refresh():initialize())}/>:null}
 {taskContext?<View style={{paddingHorizontal:16,paddingVertical:8,flexDirection:'row',alignItems:'center',backgroundColor:c.accentSoft}}><View style={{flex:1}}><Text style={{color:c.accent,fontSize:11}}>Tarefa em contexto</Text><Text numberOfLines={1} style={{color:c.text,fontSize:14}}>{taskContext.title}</Text></View><IconButton name="close" label="Remover tarefa da conversa" onPress={()=>onClearTaskContext?.()}/></View>:null}
 {/* 0.3.252: na web, o puxar-para-atualizar do FlatList invertido aplica a inversao duas vezes (o react-native-web copia o estilo para o envoltorio do RefreshControl) e as mensagens apareciam de cabeca para baixo. No navegador nao ha puxar para atualizar. */}
 <View style={{flex:1}}>{loading?<View style={{flex:1,justifyContent:'center'}}><ActivityIndicator color={c.accent}/></View>:<MountTimer tab="chat:list"><FlatList key={conversation?.id||'new-chat'} nativeID="sofia-chat-list" inverted initialNumToRender={12} viewabilityConfig={viewability.viewabilityConfig} onViewableItemsChanged={viewability.onViewableItemsChanged} maxToRenderPerBatch={8} windowSize={7} maintainVisibleContentPosition={{minIndexForVisible:0,autoscrollToTopThreshold:120}} ref={list} data={reverseMessages} extraData={selectedIds} keyExtractor={m=>m.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:22,flexGrow:1}} {...(Platform.OS==='web'?{}:{refreshing,onRefresh:()=>void refresh()})} {...chatScroll} onMomentumScrollBegin={()=>{noteScrolling();chatScroll.onMomentumScrollBegin();}} onScrollBeginDrag={()=>{noteScrolling();chatScroll.onScrollBeginDrag();historyGesture.current.begin();}} onScroll={e=>{noteFluencyMovement();chatScroll.onScroll(e);const n=e.nativeEvent;if(n.contentSize.height-n.layoutMeasurement.height-n.contentOffset.y<Math.max(100,n.layoutMeasurement.height*0.3)&&historyGesture.current.consume())void older();}} onEndReachedThreshold={0.3} onEndReached={()=>{if(historyGesture.current.consume())void older();}} style={{flex:1}} scrollEventThrottle={16}
 ListFooterComponent={loadingOlder?<ActivityIndicator accessibilityLabel="Carregando mensagens anteriores" color={c.accent}/>:hasMore?<Pressable onPress={()=>void older()} style={{alignItems:'center',padding:12,minHeight:44}}><Text style={{color:c.accent,fontSize:12}}>Carregar mensagens anteriores</Text></Pressable>:null}
 ListEmptyComponent={!error?<View style={[{flex:1,justifyContent:'center'},Platform.OS==='web'?{transform:[{scaleY:-1}]}:null]}><Empty title="Vamos conversar?" body="Escreva ou envie uma mensagem de voz. A mesma Sofia, o contexto e a memória da sua conta."/><Text style={{color:c.muted,textAlign:'center',fontSize:11,paddingHorizontal:30,lineHeight:17}}>Suas mensagens são processadas no servidor da Sofia e pelo provedor de IA configurado.</Text></View>:null}
 renderItem={({item,index})=><Bubble topic={topicStarts.get(item.id)} message={item} previous={reverseMessages[index+1]} api={api} onRetry={m=>{if(!sending)void send(m,true);}} selecting={selectedIds.size>0} selected={selectedIds.has(item.id)} onSelect={selectMessage}/>}
 ListHeaderComponent={sending?<View style={{flexDirection:'row',gap:9,alignItems:'center',padding:10}}><ActivityIndicator size="small" color={c.accent}/><Text style={{color:c.muted,fontSize:12}}>Aguardando a Sofia…</Text></View>:null}/></MountTimer>}
 {scrolling&&floatingDay&&!loading?<View pointerEvents="none" style={{position:'absolute',top:8,left:0,right:0,alignItems:'center'}}><View style={{paddingHorizontal:12,paddingVertical:5,borderRadius:12,backgroundColor:c.surface,borderWidth:1,borderColor:c.line,elevation:2}}><Text style={{color:c.muted,fontSize:11,fontWeight:'500'}}>{floatingDay}</Text></View></View>:null}
 {showJump&&!loading?<Pressable accessibilityRole="button" accessibilityLabel="Descer para a última mensagem" onPress={followChat} style={{position:'absolute',right:18,bottom:12,width:44,height:44,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.line,alignItems:'center',justifyContent:'center',elevation:4}}><Text style={{color:c.accent,fontSize:24}}>↓</Text></Pressable>:null}</View>
 {conversation?.state&&conversation.state!=='active'?<Text style={{color:c.muted,padding:12}}>Conversa {conversation.state==='paused'?'pausada':'arquivada'} · histórico preservado para leitura.</Text>:null} {/* 03/11/2026 (desenho 05): a barrinha fica em cima do campo, como "responder" no WhatsApp */}{createAt?<View testID="chat-create-bar" style={{marginHorizontal:12,marginTop:6,marginBottom:2,borderRadius:12,backgroundColor:c.surface,borderLeftWidth:3,borderLeftColor:c.accent,paddingLeft:12,paddingRight:4,paddingVertical:6}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
   <View style={{flex:1,minWidth:0}}><Text style={{color:c.accent,fontSize:12,fontWeight:'700'}}>Criar · {createLabel(createAt)}</Text><Text numberOfLines={1} style={{color:c.muted,fontSize:12}}>Linha do tempo · diga o que é, a Sofia cria</Text></View>
   <Pressable accessibilityRole="button" accessibilityLabel={createMenu?'Fechar criação manual':'Criar manualmente'} accessibilityState={{expanded:createMenu}} onPress={()=>setCreateMenu(v=>!v)} style={{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:createMenu?c.accentSoft:'transparent'}}><View style={{transform:[{rotate:createMenu?'-90deg':'0deg'}]}}><Icon name="chevron" size={15} color={createMenu?c.accent:c.muted}/></View></Pressable>
   <IconButton name="close" label="Cancelar criação" size={34} onPress={()=>{setCreateAt('');setCreateMenu(false);}}/>
  </View>
  {createMenu?<View style={{paddingBottom:4}}>
   {([['AGENDA',[['event','calendar','Compromisso'],['task','checklist','Tarefa'],['reminder','alarm','Lembrete'],['capsule','cycle','Rotina']]],['FINANÇAS',[['expense','trendDown','Despesa'],['income','trendUp','Receita']]]] as [string,[string,string,string][]][]).map(([g,rows])=><View key={g}>
    <Text style={{color:c.muted,fontSize:11,fontWeight:'600',letterSpacing:0.5,paddingTop:8,paddingBottom:2}}>{g}</Text>
    {rows.map(([k,ic,label])=><Pressable key={k} accessibilityRole="button" onPress={()=>manual(k as any)} style={({pressed}:any)=>({flexDirection:'row',alignItems:'center',gap:10,height:36,borderRadius:9,paddingHorizontal:4,backgroundColor:pressed?c.input:'transparent'})}><Icon name={ic as any} size={15} color={CREATE_COLOR[k]||c.muted}/><Text style={{color:c.text,fontSize:13}}>{label}</Text></Pressable>)}
   </View>)}
  </View>:null}
 </View>:null}{quote?<View style={{flexDirection:'row',alignItems:'center',gap:10,marginHorizontal:12,marginTop:6,paddingVertical:8,paddingHorizontal:12,borderRadius:12,backgroundColor:c.surface,borderLeftWidth:3,borderLeftColor:c.accent}}><View style={{flex:1}}><Text style={{color:c.accent,fontSize:12,fontWeight:'600'}}>{quote.role==='user'?'Você':'Sofia'}</Text><Text numberOfLines={2} style={{color:c.muted,fontSize:12}}>{quoteSnippet(quote)}</Text></View><IconButton name="close" label="Cancelar resposta" onPress={()=>setQuote(null)}/></View>:null}{<MountTimer tab="chat:composer"><Composer key={conversation?.id||'draft'} placeholder={createAt?'Ex.: ligar pra oficina':undefined} disabled={loading||deleting||!bootstrap.ai.ready||!!(conversation?.state&&conversation.state!=='active')} enterToSend={enterToSend} autoSendVoice={autoSendVoice} onText={text} onVoice={audio} onAttachments={attachments} onActivity={setRecordingLock} onDraft={inputActivity}/></MountTimer>}
 <Sheet visible={history} onClose={()=>setHistory(false)}>
 <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}}><Text style={{fontSize:24,fontWeight:'600',color:c.text}}>Conversas</Text><IconButton name="close" label="Fechar histórico" onPress={()=>setHistory(false)}/></View><TextInput placeholder="Buscar pelo título" placeholderTextColor={c.muted} value={query} onChangeText={setQuery} style={{backgroundColor:c.input,borderRadius:14,padding:14,color:c.text,marginBottom:14}}/>
 {selectedConversations.size?<View style={{flexDirection:'row',alignItems:'center',marginBottom:10}}><Text style={{flex:1,color:c.text}}>{selectedConversations.size} selecionadas</Text><IconButton name="trash" label="Excluir conversas selecionadas" onPress={deleteConversations} disabled={deleting}/><IconButton name="close" label="Cancelar seleção de conversas" onPress={()=>setSelectedConversations(new Set())} disabled={deleting}/></View>:null}<ScrollView onScroll={noteFluencyMovement} scrollEventThrottle={100} keyboardShouldPersistTaps="handled">{items.filter(i=>i.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item=><Pressable key={item.id} onLongPress={()=>setSelectedConversations(prev=>toggleMessageSelection(prev,item.id))} onPress={()=>selectedConversations.size?setSelectedConversations(prev=>toggleMessageSelection(prev,item.id)):void select(item)} style={{backgroundColor:selectedConversations.has(item.id)?c.accentSoft:'transparent',padding:14,borderBottomWidth:1,borderColor:c.line,gap:5}}><Text numberOfLines={2} style={{color:c.text,fontSize:16,fontWeight:'500'}}>{item.title}{conversation?.id===item.id?' · Atual':''}</Text><Text style={{color:c.muted,fontSize:11}}>{item.channel==='mobile'?'App':item.channel==='whatsapp'?'WhatsApp':'Site'} · {new Date(item.updated_at).toLocaleDateString('pt-BR')}</Text></Pressable>)}{historyMore?<Pressable onPress={()=>void moreHistory()} style={{padding:18}}><Text style={{color:c.accent}}>Carregar mais</Text></Pressable>:null}</ScrollView></Sheet>
 </ChatFrame></KeyboardViewport>;
}
function ChatFrame({side,children}:{side:React.ReactNode;children:React.ReactNode}){return side?<View style={{flex:1,flexDirection:'row'}}>{side}<View style={{flex:1,minWidth:0}}>{children}</View></View>:<>{children}</>;}
