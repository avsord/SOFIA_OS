import React,{useEffect,useRef,useState} from 'react';
import {PALETTE} from '../lib/palette';
import {tap} from '../lib/desktop';
import {View,Text,Pressable,Modal,ScrollView,TextInput,Image,StyleSheet,ActivityIndicator,PanResponder,Platform} from 'react-native';
import Svg,{Defs,LinearGradient,Stop,Rect} from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {File} from 'expo-file-system';
import {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {Spinner} from './Loading';
import {Button,ErrorBanner,IconButton} from './UI';
import {Icon} from './Icon';
import {coverMime,coverName} from '../lib/page-cover-upload';
import {cachedPageCover} from '../lib/page-cover-cache';
export const PAGE_COVERS=[
 ['Lavanda','linear-gradient(135deg,#d9d2ff,#b8aaff)'],['Areia','linear-gradient(135deg,#efe9df,#d8cfc2)'],
 ['Azul','linear-gradient(135deg,#b9d7ff,#7da8ea)'],['Verde','linear-gradient(135deg,#cde8d8,#8fc9aa)'],
 ['Pêssego','linear-gradient(135deg,#f4d5c3,#e7ad8b)'],['Grafite','linear-gradient(135deg,#6d6c69,#3f3f3c)'],
 ['Aurora','linear-gradient(135deg,#cebaf7 0%,#9ed5e8 48%,#f1c5d9 100%)'],['Noite','linear-gradient(135deg,#1f2a44,#394c77)']
];
const EMOJIS='😀 😊 😎 🤔 🤖 ❤️ 💜 💙 💚 💡 🔥 ✨ ⭐ 🌙 🌈 🌱 🌿 🌊 🧪 🧠 🎯 🧭 🚀 🚲 🏠 💼 🛠️ ⚙️ 💻 📱 📷 🎥 🎬 🎨 ✏️ 📝 📌 📅 ⏰ 📚 📖 📁 📂 📦 📊 💰 🛒 🎁 💊 ☕ 🎵 🎧 🎮 🏋️ 🧘 🏆 🎓 🔗 🔎 🔐 ✅ ⚠️ 💬 🧩 💎'.split(' ');
const SYMBOLS='♡ ♥ ☆ ★ ○ ● ◉ ◇ ◆ □ ■ △ ▲ ✓ ✔ ✕ × + − ≡ ∞ ⌂ ⌘ ⏱ ⚑ ⚙ ⚡ ☀ ☾ ☁ ☰ ▦ ⊞ ⊕ ↖ ↑ ↗ ← → ↙ ↓ ↘ ↔ ↕ ↳ ↪ ⇄ ✎ ✦ ✧ ❖ ☑ ☐ ♫ ♪ ✉ ☎ ⌚ ⚖ ◐ ◑'.split(' ');
const PENDING_COVER_KEY='sofia.native.pending-page-cover.v1';
/** 0.3.255: posicao vertical da capa (0 = topo da imagem, 100 = base). Sem valor = centro, como antes. */
// 0.3.268: a previa local da capa so vale no aparelho que enviou (caminho file:// do celular nao abre no site e vice-versa);
// fora dele a capa vem do servidor, a mesma em todos.
const localPreview=(uri:string)=>Platform.OS==='web'?(/^(data:|blob:|https?:)/.test(uri)?uri:''):(/^(file:|content:)/.test(uri)?uri:'');
export function coverPosition(data:Record<string,any>):number{const raw=data?.cover_position,n=Number(raw);return raw!==''&&raw!=null&&Number.isFinite(n)?Math.max(0,Math.min(100,n)):50;}
/** Desenha a imagem cobrindo a capa e deslocada pela posicao. No modo reposicionar, arrastar move a imagem. */
function CoverImage({uri,position,repositioning=false,onPosition,onError}:{uri:string;position:number;repositioning?:boolean;onPosition?:(n:number)=>void;onError:()=>void}){
 const [box,setBox]=useState({w:0,h:0}),[img,setImg]=useState<{w:number;h:number}|null>(null),[pos,setPos]=useState(position);
 const live=useRef({pos:position,start:position,extra:0,editing:repositioning,onPosition});
 useEffect(()=>{if(!repositioning)setPos(position);live.current.pos=position;},[position,repositioning]);
 useEffect(()=>{let alive=true;setImg(null);Image.getSize(uri,(w,h)=>{if(alive&&w>0&&h>0)setImg({w,h});},()=>{});return()=>{alive=false;};},[uri]);
 const scale=img&&box.w>0&&box.h>0?Math.max(box.w/img.w,box.h/img.h):0;
 const width=img?img.w*scale:0,height=img?img.h*scale:0,extra=Math.max(0,height-box.h);
 live.current.extra=extra;live.current.editing=repositioning;live.current.onPosition=onPosition;
 const pan=useRef(PanResponder.create({
  onStartShouldSetPanResponder:()=>live.current.editing,onStartShouldSetPanResponderCapture:()=>live.current.editing,
  onMoveShouldSetPanResponder:()=>live.current.editing,onMoveShouldSetPanResponderCapture:()=>live.current.editing,
  onPanResponderTerminationRequest:()=>false,
  onPanResponderGrant:()=>{live.current.start=live.current.pos;},
  onPanResponderMove:(_e,g)=>{const e=live.current.extra;if(!e)return;const next=Math.max(0,Math.min(100,live.current.start-g.dy/e*100));live.current.pos=next;setPos(next);},
  onPanResponderRelease:()=>{live.current.onPosition?.(Math.round(live.current.pos*10)/10);},
  onPanResponderTerminate:()=>{live.current.onPosition?.(Math.round(live.current.pos*10)/10);},
 })).current;
 return <View testID="page-cover-image" style={StyleSheet.absoluteFill} {...(repositioning?pan.panHandlers:{})} onLayout={e=>{const {width:w,height:h}=e.nativeEvent.layout;if(Math.abs(w-box.w)>.5||Math.abs(h-box.h)>.5)setBox({w,h});}}>
  {scale?<Image source={{uri}} onError={onError} style={{position:'absolute',width,height,left:-(width-box.w)/2,top:-extra*(repositioning?pos:position)/100}}/>:<Image source={{uri}} resizeMode="cover" style={StyleSheet.absoluteFill} onError={onError}/>}
 </View>;
}
export function PageCover({data,api,repositioning=false,onPosition}:{data:Record<string,any>;api:SofiaApi;repositioning?:boolean;onPosition?:(n:number)=>void}){
 const c=useTheme(),attachment=String(data.cover_attachment_id||''),preview=localPreview(String(data.cover_local_uri||''));
 const [uri,setUri]=useState(preview),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 const retry=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let live=true,count=0;setFailed(false);setAttempt(0);setUri(preview);
  async function load(force=false){
   if(!attachment)return;
   count++;setAttempt(count);
   try{const next=await cachedPageCover(api.attachmentSource(attachment),attachment,force,count);if(live){setUri(next);setFailed(false);}}
   catch{if(live)setFailed(true);}
  }
  retry.current=()=>{setFailed(false);void load(true);};
  if(attachment&&!preview)void load(false);
  return()=>{live=false;retry.current=()=>{};};
 },[attachment,preview,api]);
 if(data.cover_type==='attachment'&&attachment){
  if(failed)return <View style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',backgroundColor:c.input,padding:16}]}><Text style={{fontSize:12,color:c.muted,textAlign:'center'}}>{tap('Não foi possível abrir esta capa. Toque na capa para escolher novamente.')}</Text></View>;
  if(!uri)return <View style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',backgroundColor:c.input}]}><Spinner size={20}/></View>;
  return <CoverImage key={attachment+':'+attempt+':'+uri} uri={uri} position={coverPosition(data)} repositioning={repositioning} onPosition={onPosition} onError={()=>{if(attempt<3){setUri('');retry.current();}else setFailed(true);}}/>;
 }
 const colors=String(data.cover_value||'').match(/#[0-9a-fA-F]{6}\b/g)||[c.accentSoft,c.accentSoft];
 return <Svg width="100%" height="100%"><Defs><LinearGradient id="cover" x1="0" y1="0" x2="1" y2="1">{colors.map((color,i)=><Stop key={i} offset={colors.length===1?0:i/(colors.length-1)} stopColor={color}/>)}</LinearGradient></Defs><Rect width="100%" height="100%" fill="url(#cover)"/></Svg>;
}
export function PageAppearance({kind,pageId,api,onApply,onClose}:{kind:'icon'|'cover';pageId:string;api:SofiaApi;onApply:(patch:Record<string,any>)=>void;onClose:()=>void}){
 const c=useTheme(),[mode,setMode]=useState<'emoji'|'icon'>('emoji'),[custom,setCustom]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),alive=useRef(true),recovering=useRef(false);
 function choose(patch:Record<string,any>){onApply(patch);onClose();}
 async function clearPending(){try{await AsyncStorage.removeItem(PENDING_COVER_KEY);}catch{}}
 async function finishPick(result:any){
  if(!result)return false;
  if(result.code)throw new Error(String(result.message||'O Android não conseguiu devolver a foto selecionada.'));
  if(result.canceled){await clearPending();return false;}
  const asset=result.assets?.[0];
  if(!asset?.uri)throw new Error('Não foi possível preparar a imagem. Escolha outra foto.');
  let base64='';
  if(Platform.OS==='web'){ // 0.3.268: no site a imagem escolhida vem do navegador (sem a pasta de arquivos do celular)
   const blob=await (await fetch(asset.uri)).blob();
   if(blob.size>10*1024*1024)throw new Error('A capa deve ter até 10 MB. Recorte a imagem ou escolha uma menor.');
   const data:string=await new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>bad(r.error);r.readAsDataURL(blob);});
   base64=data.slice(data.indexOf(',')+1);
  }else{
  const file=new File(asset.uri);
  if(!file.exists||file.size<1)throw new Error('A foto selecionada não está mais disponível no aparelho.');
  if(file.size>10*1024*1024)throw new Error('A capa deve ter até 10 MB. Recorte a imagem ou escolha uma menor.');
  base64=await file.base64();
  }
  const mime=coverMime(base64,asset.mimeType);
  const attachment=await api.uploadAttachment(pageId,{name:coverName(mime),mime,base64});
  await clearPending();
  if(alive.current)choose({cover_type:'attachment',cover_value:'',cover_attachment_id:attachment.id,cover_local_uri:asset.uri});
  return true;
 }
 useEffect(()=>{
  alive.current=true;
  if(kind==='cover'&&!recovering.current){recovering.current=true;void(async()=>{try{
   const pendingPage=await AsyncStorage.getItem(PENDING_COVER_KEY);
   if(pendingPage!==pageId||!alive.current)return;
   const pending=await ImagePicker.getPendingResultAsync();
   if(pending&&alive.current){setBusy(true);setError('');await finishPick(pending);}
  }catch(e){await clearPending();if(alive.current)setError(e instanceof Error?e.message:'Não foi possível recuperar a capa escolhida.');}
  finally{recovering.current=false;if(alive.current)setBusy(false);}})();}
  return()=>{alive.current=false;};
 },[]);
 async function upload(){if(busy)return;setBusy(true);setError('');try{
  await AsyncStorage.setItem(PENDING_COVER_KEY,pageId);
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[3,1],quality:0.78});
  if(!alive.current)return;
  await finishPick(result);
 }catch(e){await clearPending();if(alive.current)setError(e instanceof Error?e.message:'Não foi possível trocar a capa.');}finally{if(alive.current)setBusy(false);}}
 return <Modal visible transparent animationType="fade" onRequestClose={()=>{if(!busy)onClose();}}>
  <Pressable onPress={()=>{if(!busy)onClose();}} style={{flex:1,backgroundColor:PALETTE.black+'55',justifyContent:'flex-end'}}>
   <Pressable onPress={()=>{}} style={{maxHeight:'82%',borderTopLeftRadius:24,borderTopRightRadius:24,backgroundColor:c.surface,padding:20,paddingBottom:30}}>
    <View style={{flexDirection:'row',alignItems:'center',marginBottom:14}}><Text style={{flex:1,fontSize:24,fontWeight:'600',color:c.text}}>{kind==='icon'?'Ícone da página':'Capa da página'}</Text><IconButton name="close" label="Fechar" disabled={busy} onPress={onClose}/></View>
    {error?<ErrorBanner text={error}/>:null}
    {kind==='icon'?<>
     <View style={{flexDirection:'row',gap:8,marginBottom:14}}>{(['emoji','icon'] as const).map(value=><Pressable key={value} onPress={()=>setMode(value)} style={{paddingVertical:10,paddingHorizontal:18,borderRadius:12,backgroundColor:mode===value?c.accentSoft:c.input}}><Text style={{color:mode===value?c.accent:c.muted}}>{value==='emoji'?'Emojis':'Símbolos'}</Text></Pressable>)}</View>
     <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:270}}><View style={{flexDirection:'row',flexWrap:'wrap'}}>{(mode==='emoji'?EMOJIS:SYMBOLS).map(icon=><Pressable key={icon} accessibilityLabel={'Usar '+icon} onPress={()=>choose({icon,icon_mode:mode})} style={{width:'14.28%',height:48,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:28,color:c.text}}>{icon}</Text></Pressable>)}</View></ScrollView>
     <View style={{flexDirection:'row',gap:8,alignItems:'center',marginVertical:14}}><TextInput value={custom} onChangeText={setCustom} maxLength={32} placeholder="Outro emoji ou símbolo" placeholderTextColor={c.muted} accessibilityLabel="Emoji personalizado" style={{flex:1,minHeight:46,borderRadius:12,backgroundColor:c.input,color:c.text,paddingHorizontal:12}}/><IconButton name="check" label="Aplicar ícone" filled disabled={!custom.trim()} onPress={()=>choose({icon:custom.trim(),icon_mode:mode})}/></View>
     <Button title="Usar ícone padrão" secondary onPress={()=>choose({icon:'',icon_mode:'default'})}/>
    </>:<>
     <View style={{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:18}}>{PAGE_COVERS.map(([name,value])=><Pressable key={name} disabled={busy} accessibilityLabel={'Capa '+name} onPress={()=>choose({cover_type:'preset',cover_value:value,cover_attachment_id:'',cover_local_uri:''})} style={{width:'47%',height:65,borderRadius:12,overflow:'hidden'}}><PageCover api={api} data={{cover_type:'preset',cover_value:value}}/></Pressable>)}</View>
     {busy?<View style={{padding:18,alignItems:'center',gap:8}}><ActivityIndicator color={c.accent}/><Text style={{color:c.muted}}>Enviando capa…</Text></View>:<View style={{gap:10}}><Button title="Escolher foto do aparelho" onPress={()=>void upload()}/><Button title="Remover capa" secondary onPress={()=>choose({cover_type:'',cover_value:'',cover_attachment_id:'',cover_local_uri:''})}/></View>}
    </>}
   </Pressable>
  </Pressable>
 </Modal>;
}
