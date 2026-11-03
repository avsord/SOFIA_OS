import * as ImagePicker from 'expo-image-picker';
import {useDesktop,contentArea} from '../lib/desktop';
import {ContentWidth,edgePadding} from '../lib/content-width';
import {perfSync} from '../lib/fluency-metrics';
/** 0.3.115 on-device report: creating the native AudioRecorder took 148.8 ms (composer:recorder), inside the 224 ms of the Chat
 * composer, so the first open of Chat cost 741 ms. The hooks created it on mount and polled it every 120 ms for as long as the tab
 * existed, even if the user never recorded. Now the native recorder exists only after the first tap on the microphone, is polled
 * only while recording, and has one symmetric lifecycle of its own: expo's hook releases it in an effect cleanup that React also runs
 * when a tab is hidden, which is the failure that crashed VoicePlayer. */
type RecorderStatus={durationMillis:number;metering?:number};
type RecorderLike={prepareToRecordAsync():Promise<void>;record():void;stop():Promise<void>;getStatus():RecorderStatus;readonly uri:string|null;release():void};
let firstRecorderTimed=false;
function timeFirst<T>(name:string,run:()=>T):T{if(firstRecorderTimed)return run();firstRecorderTimed=true;return perfSync(name,run);}
function newRecorder():RecorderLike{
 return timeFirst('composer:recorder',()=>new AudioModule.AudioRecorder(createRecordingOptions({...RecordingPresets.HIGH_QUALITY,numberOfChannels:1,bitRate:64000,isMeteringEnabled:true})) as unknown as RecorderLike);
}
import * as DocumentPicker from 'expo-document-picker';
import {Sheet} from './Sheet';
import {attachmentMime,attachmentTypes} from '../lib/chat-attachments';
import type {AttachmentDraft} from '../lib/types';
import React,{useContext,useEffect,useMemo,useRef,useState} from 'react';
import {Animated,View,Text,TextInput,ActivityIndicator,AppState,Alert,Keyboard,PanResponder,Pressable,ScrollView,Image} from 'react-native';
import {AudioModule,RecordingPresets,setAudioModeAsync} from 'expo-audio';
import {createRecordingOptions} from 'expo-audio/build/utils/options';
import {File} from 'expo-file-system';
import {attachmentSize} from '../lib/attachment-read';
import {useTheme} from '../lib/theme';
import {silenceVoices} from '../lib/audio-focus';
import {durationLabel,errorText} from '../lib/chat-model';
import {VoiceDraft} from '../lib/types';
import {IconButton} from './UI';
import {Icon} from './Icon';
import {VoicePlayer} from './VoicePlayer';
import {appAlert} from '../lib/app-alert';
export function deleteVoice(uri:string){try{const file=new File(uri);if(file.exists)file.delete();}catch{}}
// 0.3.268: no site (navegador) Enter envia e Shift+Enter quebra linha; sem depender de Platform (os testes carregam este arquivo sozinho)
const WEB_KEYS=typeof document!=='undefined'&&typeof window!=='undefined';
export function Composer({disabled,enterToSend,autoSendVoice,onText,onVoice,onAttachments,onActivity,onDraft}:{disabled:boolean;enterToSend:boolean;autoSendVoice:boolean;onText:(text:string)=>void;onAttachments:(files:AttachmentDraft[],text:string)=>void;onVoice:(draft:VoiceDraft)=>void;onActivity:(active:boolean)=>void;onDraft:(active:boolean)=>void}){
 const c=useTheme();
 const [files,setFiles]=useState<AttachmentDraft[]>([]),[attachments,setAttachments]=useState(false);
 const [rs,setRs]=useState<RecorderStatus>({durationMillis:0}),[text,setText]=useState(''),[busy,setBusy]=useState(false),[recording,setRecording]=useState(false),[draft,setDraft]=useState<VoiceDraft|null>(null),[cancelReady,setCancelReady]=useState(false);
 const recorderRef=useRef<RecorderLike|null>(null),recordingRef=useRef(false),busyRef=useRef(false),draftRef=useRef<VoiceDraft|null>(null),mounted=useRef(true),cancelReadyRef=useRef(false);
 const cancelX=useRef(new Animated.Value(0)).current;
 const stopRef=useRef<(discard?:boolean,sendImmediately?:boolean)=>Promise<void>>(async()=>{});
 function resetCancel(animated=true){cancelReadyRef.current=false;setCancelReady(false);if(animated)Animated.spring(cancelX,{toValue:0,useNativeDriver:true,speed:28,bounciness:0}).start();else cancelX.setValue(0);}
 const cancelPan=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponder:(_e,g)=>recordingRef.current&&g.dx<-7&&Math.abs(g.dx)>Math.abs(g.dy)*1.15,
  onMoveShouldSetPanResponderCapture:(_e,g)=>recordingRef.current&&g.dx<-7&&Math.abs(g.dx)>Math.abs(g.dy)*1.15,
  onPanResponderMove:(_e,g)=>{const x=Math.max(-150,Math.min(0,g.dx));cancelX.setValue(x);const armed=x<=-88;if(armed!==cancelReadyRef.current){cancelReadyRef.current=armed;setCancelReady(armed);}},
  onPanResponderRelease:()=>{if(cancelReadyRef.current){resetCancel(false);void stopRef.current(true,false);}else resetCancel();},
  onPanResponderTerminate:()=>resetCancel(),onPanResponderTerminationRequest:()=>false
 }),[cancelX]);
 useEffect(()=>{draftRef.current=draft;},[draft]);
 useEffect(()=>{onActivity(recording||busy);},[recording,busy,onActivity]);
 useEffect(()=>{onDraft(!!draft||text.length>0||files.length>0);},[draft,text,files,onDraft]);
 useEffect(()=>{const sub=AppState.addEventListener('change',s=>{if(s!=='active'&&recordingRef.current)void stopRef.current(false,false);});return()=>sub.remove();},[]);
 useEffect(()=>{
  // Setup also runs again after a tab is hidden and shown: start idle, never reuse a recorder or draft the cleanup disposed.
  mounted.current=true;recordingRef.current=false;setRecording(false);draftRef.current=null;setDraft(null);
  return()=>{
   mounted.current=false;const recorder=recorderRef.current,wasRecording=recordingRef.current;recorderRef.current=null;recordingRef.current=false;
   void (wasRecording&&recorder?Promise.resolve().then(()=>recorder.stop()):Promise.resolve()).catch(()=>{}).finally(()=>{try{recorder?.release();}catch{}});
   if(draftRef.current)deleteVoice(draftRef.current.uri);void setAudioModeAsync({allowsRecording:false}).catch(()=>{});
  };
 },[]);
 // The recorder is polled only while a recording is in progress (the old hook polled it every 120 ms for the life of the tab).
 useEffect(()=>{
  if(!recording)return;setRs({durationMillis:0});
  const id=setInterval(()=>{const recorder=recorderRef.current;if(!recorder)return;try{const next=recorder.getStatus();
   setRs(prev=>{const meteringChanged=(prev.metering===undefined)!==(next.metering===undefined)||(prev.metering!==undefined&&next.metering!==undefined&&Math.abs(prev.metering-next.metering)>0.1);
    return prev.durationMillis===next.durationMillis&&!meteringChanged?prev:{durationMillis:next.durationMillis,metering:next.metering};});}catch{}},120);
  return()=>clearInterval(id);
 },[recording]);
 function ensureRecorder():RecorderLike{if(!recorderRef.current)recorderRef.current=newRecorder();return recorderRef.current;}
 async function start(){
  if(disabled||busyRef.current||recordingRef.current||draft)return;busyRef.current=true;setBusy(true);resetCancel(false);
  try{Keyboard.dismiss();await silenceVoices();const permission=await AudioModule.requestRecordingPermissionsAsync();if(!permission.granted)throw new Error('Permita o microfone nas configurações do celular para gravar áudio.');
   await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,shouldPlayInBackground:false});const recorder=ensureRecorder();await recorder.prepareToRecordAsync();
   if(!mounted.current||AppState.currentState!=='active'){await setAudioModeAsync({allowsRecording:false});return;}
   recorder.record();recordingRef.current=true;setRecording(true);
  }catch(e){if(mounted.current)appAlert('Microfone',errorText(e));}finally{busyRef.current=false;if(mounted.current)setBusy(false);}
 }
 async function stop(discard=false,sendImmediately=autoSendVoice){
  if(!recordingRef.current||busyRef.current)return;const recorder=recorderRef.current;if(!recorder){recordingRef.current=false;setRecording(false);return;}busyRef.current=true;setBusy(true);const duration=recorder.getStatus().durationMillis;resetCancel(false);
  try{await recorder.stop();recordingRef.current=false;if(mounted.current)setRecording(false);await setAudioModeAsync({allowsRecording:false});
   const uri=recorder.uri;if(!uri)throw new Error('O áudio não foi salvo. Grave novamente.');
   if(discard||!mounted.current||duration<350){deleteVoice(uri);return;}
   const next={uri,duration:Math.max(1,Math.round(duration))};if(sendImmediately){draftRef.current=null;setDraft(null);void silenceVoices();onVoice(next);}else{draftRef.current=next;setDraft(next);}
  }catch(e){recordingRef.current=false;if(mounted.current){setRecording(false);appAlert('Gravação',errorText(e));}}
  finally{busyRef.current=false;if(mounted.current)setBusy(false);}
 }
 stopRef.current=stop;
 function discard(){if(draft)deleteVoice(draft.uri);draftRef.current=null;setDraft(null);}
 function sendText(){if(disabled||(!text.trim()&&!files.length)||recording||busy)return;const content=text.trim();setText('');if(files.length){const chosen=files;setFiles([]);onAttachments(chosen,content);}else onText(content);}
 function sendVoice(){if(!draft||disabled||busy)return;const sent=draft;draftRef.current=null;setDraft(null);void silenceVoices();onVoice(sent);}
 // 0.3.329: mesma regra para escolher, colar ou arrastar - ate 3 arquivos por mensagem, cada um com ate 10 MB
 function addFiles(chosen:AttachmentDraft[]){if(files.length+chosen.length>3)throw Error('Envie até 3 arquivos por mensagem.');if(chosen.some(f=>!f.size||f.size>10*1024*1024))throw Error('Cada arquivo deve ter até 10 MB.');setFiles(old=>[...old,...chosen]);}
 // 0.3.329 (Pedro, site): colar (Ctrl+V) ou arrastar uma imagem para a Conversa anexa a imagem, como o botao de anexar.
 // So vale com a Conversa na tela; colar texto continua normal. Imagem colada sem nome vira "Imagem colada HH-MM.png".
 const [dropping,setDropping]=useState(false),filesRef=useRef(files);filesRef.current=files;
 function fromBrowserFiles(list:any[]):AttachmentDraft[]{const now=new Date(),stamp=String(now.getHours()).padStart(2,'0')+'-'+String(now.getMinutes()).padStart(2,'0');
  return list.map((f:any,i:number)=>{const ext=(String(f.type||'').split('/')[1]||'png').replace('jpeg','jpg');const raw=String(f.name||'');const name=!raw||/^image\.(png|jpe?g|gif|webp)$/i.test(raw)?'Imagem colada '+stamp+(list.length>1?' ('+(i+1)+')':'')+'.'+ext:raw;
   return {uri:URL.createObjectURL(f),name,mime:attachmentMime(name,f.type),size:f.size||0};});}
 useEffect(()=>{if(!WEB_KEYS||disabled)return;
  const root=()=>inputRef.current as HTMLElement|null,visible=()=>{const el=root();return !!el&&el.offsetParent!==null;};
  const take=(list:any[])=>{try{if(list.length)addFiles(fromBrowserFiles(list));}catch(e){appAlert('Anexo',errorText(e));}};
  const onPaste=(e:ClipboardEvent)=>{if(!visible())return;const t=e.target as HTMLElement|null;if(t&&t!==root()&&/^(INPUT|TEXTAREA)$/.test(t.tagName))return;
   const list=[...(e.clipboardData?.items||[])].filter(it=>it.kind==='file').map(it=>it.getAsFile()).filter(Boolean) as any[];if(!list.length)return;e.preventDefault();take(list);root()?.focus?.();};
  const hasFiles=(e:DragEvent)=>[...(e.dataTransfer?.types||[])].includes('Files');
  let depth=0;
  const enter=(e:DragEvent)=>{if(!visible()||!hasFiles(e))return;e.preventDefault();depth++;setDropping(true);};
  const over=(e:DragEvent)=>{if(!visible()||!hasFiles(e))return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';};
  const leave=(e:DragEvent)=>{if(!visible()||!hasFiles(e))return;depth=Math.max(0,depth-1);if(!depth)setDropping(false);};
  const drop=(e:DragEvent)=>{if(!visible()||!hasFiles(e))return;e.preventDefault();depth=0;setDropping(false);take([...(e.dataTransfer?.files||[])]);root()?.focus?.();};
  document.addEventListener('paste',onPaste);document.addEventListener('dragenter',enter);document.addEventListener('dragover',over);document.addEventListener('dragleave',leave);document.addEventListener('drop',drop);
  return()=>{document.removeEventListener('paste',onPaste);document.removeEventListener('dragenter',enter);document.removeEventListener('dragover',over);document.removeEventListener('dragleave',leave);document.removeEventListener('drop',drop);};
 },[disabled,files.length]);
 async function pick(kind:'images'|'camera'|'documents'){
  setAttachments(false);Keyboard.dismiss();setBusy(true);
  try{let chosen:AttachmentDraft[]=[];
   if(kind==='documents'){const result=await DocumentPicker.getDocumentAsync({type:attachmentTypes,copyToCacheDirectory:true,multiple:true});if(result.canceled)return;chosen=await Promise.all(result.assets.map(async a=>({uri:a.uri,name:a.name,mime:attachmentMime(a.name,a.mimeType),size:a.size||await attachmentSize(a.uri)})));}
   else{if(kind==='camera'){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted)throw Error('Permita a câmera para tirar uma foto.');}
    const result=kind==='camera'?await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:.85}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:3,quality:.85});if(result.canceled)return;
    chosen=await Promise.all(result.assets.map(async a=>({uri:a.uri,name:a.fileName||'Imagem-'+Date.now()+'.jpg',mime:attachmentMime(a.fileName||'imagem.jpg',a.mimeType),size:a.fileSize||await attachmentSize(a.uri)})));}
   addFiles(chosen);
  }catch(e){appAlert('Anexo',errorText(e));}finally{setBusy(false);}
 }
 // 0.3.253 (computador): caixa de mensagem de ponta a ponta, campo alinhado a coluna da conversa
 const desktopOn=useDesktop(),readingWidth=useContext(ContentWidth),column=desktopOn?readingWidth:undefined,colPad=column?edgePadding():null;
 // 0.3.311 (site): o campo nasce com UMA linha, na altura dos botoes de anexo e camera (o navegador abria com duas e o
 // "Fale com a Sofia" ficava no alto, desalinhado dos icones), e cresce com o texto ate o limite de antes (130 px).
 const inputRef=useRef<any>(null);
 useEffect(()=>{if(!WEB_KEYS)return;const el=inputRef.current;if(!el||el.tagName!=='TEXTAREA')return;el.rows=1;el.style.height='auto';const h=Math.min(el.scrollHeight,130);el.style.height=h+'px';el.style.overflowY=el.scrollHeight>130?'auto':'hidden';},[text,recording,draft]);
 // 0.3.311 (Pedro): caixa larga como antes, com o respiro lateral da barra de cima (antes ia um objeto em paddingLeft,
 // o navegador descartava e a caixa e o microfone encostavam nas bordas)
 return <View testID="chat-composer" style={{padding:12,...(colPad?{paddingLeft:colPad.left,paddingRight:colPad.right}:null),paddingTop:10,borderTopWidth:1,borderColor:c.line,backgroundColor:c.surface,gap:6}}>
  {/* 0.3.329: arrastando um arquivo por cima da Conversa - mostra onde soltar */}
  {dropping?<View pointerEvents="none" style={{position:'fixed',left:(contentArea()?.left||0)+16,top:(contentArea()?.top||0)+16,right:16,bottom:16,zIndex:60,borderRadius:18,borderWidth:2,borderStyle:'dashed',borderColor:c.accent,backgroundColor:c.bg+'d9',alignItems:'center',justifyContent:'center',gap:8} as any}>
   <Icon name="image" size={34} color={c.accent}/>
   <Text style={{color:c.text,fontSize:16,fontWeight:'600'}}>Solte para anexar à conversa</Text>
   <Text style={{color:c.muted,fontSize:13}}>Imagens, PDF, TXT, Markdown, CSV, JSON ou ZIP · até 3 arquivos de 10 MB</Text>
  </View>:null}
  {files.length&&desktopOn?<View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{files.map((f,i)=><View key={f.uri+String(i)} style={{flexDirection:'row',alignItems:'center',gap:10,maxWidth:280,paddingVertical:6,paddingLeft:6,paddingRight:4,backgroundColor:c.input,borderRadius:12}}>
    {/* 0.3.329 (site): anexo como uma pecinha - miniatura, nome, tamanho e o X para tirar */}
    {f.mime.startsWith('image/')?<Image source={{uri:f.uri}} style={{width:40,height:40,borderRadius:8,backgroundColor:c.surface}} resizeMode="cover"/>:<View style={{width:40,height:40,borderRadius:8,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'}}><Icon name="book" size={18} color={c.muted}/></View>}
    <View style={{flexShrink:1,minWidth:0,gap:2}}><Text numberOfLines={1} style={{color:c.text,fontSize:12,fontWeight:'500'}}>{f.name}</Text><Text style={{color:c.muted,fontSize:11}}>{f.size>=1048576?(f.size/1048576).toFixed(1).replace('.',',')+' MB':Math.max(1,Math.round(f.size/1024))+' KB'}</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={'Remover anexo '+f.name} onPress={()=>setFiles(old=>old.filter((_,n)=>n!==i))} hitSlop={6} style={({hovered}:any)=>({width:26,height:26,borderRadius:7,alignItems:'center',justifyContent:'center',backgroundColor:hovered?c.line:'transparent'})}><Icon name="close" size={14} color={c.muted}/></Pressable>
   </View>)}</View>
  :files.length?<ScrollView horizontal keyboardShouldPersistTaps="always" style={{maxHeight:96}}>{files.map((f,i)=><View key={f.uri+String(i)} style={{maxWidth:180,marginRight:8,padding:8,backgroundColor:c.input,borderRadius:12}}>{f.mime.startsWith('image/')?<Image source={{uri:f.uri}} style={{width:60,height:42,borderRadius:6}}/>:null}<Text numberOfLines={1} style={{color:c.text,fontSize:12}}>{f.name}</Text><Pressable accessibilityLabel={'Remover anexo '+f.name} onPress={()=>setFiles(old=>old.filter((_,n)=>n!==i))}><Text style={{color:c.muted,paddingTop:4}}>Remover</Text></Pressable></View>)}</ScrollView>:null}
  {draft?<View style={{flexDirection:'row',alignItems:'center',gap:4}}><IconButton name="trash" label="Descartar áudio" onPress={discard}/><View style={{flex:1}}><VoicePlayer source={{uri:draft.uri}} duration={draft.duration}/></View><IconButton name="send" label="Enviar mensagem de voz" filled disabled={disabled} onPress={sendVoice}/></View>:
  recording?<View {...cancelPan.panHandlers} accessibilityLabel="Gravação de áudio. Deslize para a esquerda para cancelar." style={{flexDirection:'row',alignItems:'center',gap:8,minHeight:56,overflow:'hidden'}}><IconButton name="trash" label="Cancelar gravação" onPress={()=>void stop(true,false)}/><Animated.View style={{flex:1,flexDirection:'row',alignItems:'center',gap:9,transform:[{translateX:cancelX}]}}><View style={{width:8,height:8,borderRadius:4,backgroundColor:c.danger}}/><View style={{flex:1,gap:4}}><Text style={{color:cancelReady?c.danger:c.text,fontWeight:'600'}}>{cancelReady?'Solte para cancelar':'Gravando · '+durationLabel(rs.durationMillis)}</Text><Text style={{color:cancelReady?c.danger:c.muted,fontSize:11}}>{cancelReady?'A gravação será apagada':'‹ Deslize para a esquerda para cancelar'}</Text><View style={{height:3,width:'92%',backgroundColor:c.line}}><View style={{height:3,width:`${Math.max(5,Math.min(100,((rs.metering??-60)+60)/60*100))}%`,backgroundColor:cancelReady?c.danger:c.accent}}/></View></View></Animated.View><IconButton name="stop" label={autoSendVoice?'Parar e enviar':'Parar e ouvir antes de enviar'} filled onPress={()=>void stop(false,autoSendVoice)} disabled={busy}/></View>:
  <View style={{flexDirection:'row',alignItems:'flex-end',gap:9}}><View style={{flex:1,borderRadius:24,paddingLeft:14,paddingRight:4,paddingVertical:5,flexDirection:'row',alignItems:'flex-end',backgroundColor:c.input,minHeight:48,justifyContent:'center'}}>{/* 03/11/2026 (Pedro, print do site): o campo nascia com 1 linha de altura e o respiro de cima empurrava o texto para fora ("Fale com a Sofia" cortado embaixo). minHeight = 1 linha + respiros: o texto cabe e a caixa fica do mesmo tamanho de antes. */}<TextInput ref={inputRef} accessibilityLabel="Mensagem para a Sofia" value={text} onChangeText={setText} editable={!disabled&&!busy} placeholder="Fale com a Sofia…" placeholderTextColor={c.muted} multiline style={{flex:1,color:c.text,paddingTop:8,paddingBottom:8,fontSize:16,lineHeight:22,maxHeight:130,paddingVertical:0,...(WEB_KEYS?{minHeight:40}:null)}} submitBehavior={enterToSend&&!WEB_KEYS?'submit':'newline'} onSubmitEditing={enterToSend&&!WEB_KEYS?sendText:undefined} {...(WEB_KEYS?{onKeyPress:(e:any)=>{const n=e?.nativeEvent||{};if(n.key==='Enter'&&!n.shiftKey&&!n.isComposing){e.preventDefault?.();sendText();}}}:{})}/>{/* 0.3.268: no site Enter envia e Shift+Enter quebra linha; no celular o Enter do teclado quebra linha e o envio e pelo botao */}<IconButton name="clip" label="Anexar arquivo" size={36} disabled={disabled||busy} onPress={()=>{Keyboard.dismiss();setAttachments(true);}}/><IconButton name="camera" label="Tirar foto" size={36} disabled={disabled||busy} onPress={()=>void pick('camera')}/></View>{busy?<View style={{width:48,height:48,justifyContent:'center'}}><ActivityIndicator color={c.accent}/></View>:<IconButton name={text.trim()||files.length?'send':'mic'} label={text.trim()||files.length?'Enviar mensagem':'Gravar mensagem de voz'} filled size={48} disabled={disabled} onPress={text.trim()||files.length?sendText:()=>void start()}/>}</View>}
  {recording||draft?<Text style={{fontSize:11,textAlign:'center',color:c.muted}}>{recording?'Deslize para a esquerda para cancelar. Ao parar, '+(autoSendVoice?'o áudio será enviado.':'você poderá ouvir antes de enviar.'):'Ouça, descarte ou envie o seu áudio.'}</Text>:null}
  <Sheet visible={attachments} onClose={()=>setAttachments(false)}><Text style={{color:c.text,fontWeight:'600',fontSize:24,marginBottom:18}}>Anexar</Text><View style={{flexDirection:'row',justifyContent:'space-around'}}>{[['images','image','Imagens'],['documents','book','Documentos'],['camera','camera','Câmera']].map(([kind,icon,label])=><View key={kind} style={{alignItems:'center',gap:8}}><IconButton name={icon as 'image'|'book'|'camera'} label={label} filled size={52} onPress={()=>void pick(kind as 'images'|'documents'|'camera')}/><Text style={{color:c.text}}>{label}</Text></View>)}</View></Sheet>
 </View>;
}
