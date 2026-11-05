import React,{useEffect,useRef,useState} from 'react';
import {PALETTE} from '../lib/palette';
import {tap} from '../lib/desktop';
import {View,Text,Pressable,ScrollView,TextInput,Image,StyleSheet,ActivityIndicator,PanResponder,Platform} from 'react-native';
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
import {DECODED,IMAGE_SIZES,peekCover,prefetchPageCover} from '../lib/page-cover-prefetch';
export {prefetchPageCover};
import {MotionModal} from './MotionModal';
import {useDesktop} from '../lib/desktop';
export const PAGE_COVERS=[
 ['Lavanda','linear-gradient(135deg,#d9d2ff,#b8aaff)'],['Areia','linear-gradient(135deg,#efe9df,#d8cfc2)'],
 ['Azul','linear-gradient(135deg,#b9d7ff,#7da8ea)'],['Verde','linear-gradient(135deg,#cde8d8,#8fc9aa)'],
 ['Pêssego','linear-gradient(135deg,#f4d5c3,#e7ad8b)'],['Grafite','linear-gradient(135deg,#6d6c69,#3f3f3c)'],
 ['Aurora','linear-gradient(135deg,#cebaf7 0%,#9ed5e8 48%,#f1c5d9 100%)'],['Noite','linear-gradient(135deg,#1f2a44,#394c77)']
];
const EMOJIS='😀 😊 😎 🤔 🤖 ❤️ 💜 💙 💚 💡 🔥 ✨ ⭐ 🌙 🌈 🌱 🌿 🌊 🧪 🧠 🎯 🧭 🚀 🚲 🏠 💼 🛠️ ⚙️ 💻 📱 📷 🎥 🎬 🎨 ✏️ 📝 📌 📅 ⏰ 📚 📖 📁 📂 📦 📊 💰 🛒 🎁 💊 ☕ 🎵 🎧 🎮 🏋️ 🧘 🏆 🎓 🔗 🔎 🔐 ✅ ⚠️ 💬 🧩 💎'.split(' ');
const SYMBOLS='♡ ♥ ☆ ★ ○ ● ◉ ◇ ◆ □ ■ △ ▲ ✓ ✔ ✕ × + − ≡ ∞ ⌂ ⌘ ⏱ ⚑ ⚙ ⚡ ☀ ☾ ☁ ☰ ▦ ⊞ ⊕ ↖ ↑ ↗ ← → ↙ ↓ ↘ ↔ ↕ ↳ ↪ ⇄ ✎ ✦ ✧ ❖ ☑ ☐ ♫ ♪ ✉ ☎ ⌚ ⚖ ◐ ◑'.split(' ');
// 0.3.267 (computador): emojis com palavras para a busca do seletor de ícone, como no Notion
const EMOJI_WORDS:[string,string][]=[
 ['😀','sorriso feliz rosto'],['😊','feliz sorriso'],['😂','rir risada'],['😍','amor apaixonado'],['😎','legal oculos'],['🤔','pensar duvida'],['😴','sono dormir'],['🥳','festa comemorar'],['🤖','robo ia'],['👻','fantasma'],
 ['❤️','coracao amor vermelho'],['🧡','coracao laranja'],['💛','coracao amarelo'],['💚','coracao verde'],['💙','coracao azul'],['💜','coracao roxo'],['🖤','coracao preto'],['🤍','coracao branco'],
 ['💡','ideia lampada'],['🔥','fogo'],['✨','brilho estrelas'],['⭐','estrela'],['🌟','estrela brilho'],['⚡','raio energia'],['☀️','sol'],['🌙','lua noite'],['☁️','nuvem'],['🌈','arco iris'],['🌱','planta broto'],['🌿','folha planta'],['🌵','cacto'],['🌲','arvore'],['🌊','mar onda'],['🌸','flor'],
 ['🧪','teste ciencia'],['🧠','cerebro mente estudo'],['🎯','alvo meta objetivo'],['🧭','bussola direcao'],['🗺️','mapa viagem'],['🚀','foguete lancamento projeto'],['✈️','aviao viagem'],['🚗','carro'],['🚲','bicicleta bike'],['🏠','casa lar'],['🏢','empresa predio trabalho'],
 ['💼','trabalho maleta'],['🧰','ferramentas caixa'],['🛠️','ferramentas'],['⚙️','configuracao engrenagem'],['💻','computador notebook'],['📱','celular'],['📷','camera foto'],['🎥','video filmar'],['🎬','filme cinema roteiro'],['🎞️','filme'],['🎨','arte pintura design'],['✏️','lapis escrever'],['📝','nota anotar'],['📌','fixar alfinete'],['📍','local'],
 ['📅','calendario agenda'],['🗓️','calendario'],['⏰','alarme hora'],['⌛','tempo ampulheta'],['📚','livros estudo'],['📖','livro leitura'],['🔖','marcador'],['📁','pasta'],['📂','pasta aberta'],['🗂️','arquivos'],['📦','caixa pacote encomenda'],['🧾','recibo nota'],['📊','grafico'],['📈','crescimento grafico'],['📉','queda grafico'],
 ['💰','dinheiro'],['💳','cartao'],['🛒','carrinho compras mercado'],['🛍️','compras sacola'],['🎁','presente'],['💊','remedio farmacia'],['🩺','saude medico'],['🥗','salada comida receita'],['🍳','cozinhar receita'],['☕','cafe'],['🍎','maca fruta'],
 ['🎵','musica nota'],['🎶','musica trilha'],['🎧','fone musica'],['🎤','microfone'],['🎸','guitarra'],['🎮','jogo game'],['🏋️','academia treino'],['🧘','meditar yoga'],['⚽','futebol'],['🏆','trofeu vitoria'],['🎓','formatura estudo curso'],['👶','bebe'],['🐶','cachorro'],['🐱','gato'],
 ['🔗','link'],['🔎','busca lupa'],['🔐','cadeado senha'],['🔒','cadeado'],['✅','feito check'],['☑️','checkbox'],['❌','erro x'],['⚠️','aviso'],['❓','pergunta'],['💬','conversa chat'],['📣','anuncio'],['🧩','quebra cabeca'],['🎲','dado'],['💎','diamante'],['🪄','magica'],['🥷','ninja'],['🧏','pessoa'],['👤','pessoa perfil'],['👥','pessoas equipe'],['🏷️','etiqueta preco'],['🎉','festa'],['🌍','mundo terra']];
const fold=(v:string)=>v.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
/** Site: capa grande (fotos de 4000 px, varios MB) vira JPEG de ate 2000 px de largura antes de enviar. GIF fica como esta. */
async function shrinkCover(file:Blob):Promise<Blob>{
 try{const g=globalThis as any;if(!g.createImageBitmap||!g.document||/gif/i.test(file.type))return file;const bmp=await g.createImageBitmap(file);
  const scale=Math.min(1,2000/Math.max(1,bmp.width));if(scale>=1&&file.size<1.5*1024*1024){bmp.close?.();return file;}
  const canvas=g.document.createElement('canvas');canvas.width=Math.round(bmp.width*scale);canvas.height=Math.round(bmp.height*scale);canvas.getContext('2d').drawImage(bmp,0,0,canvas.width,canvas.height);bmp.close?.();
  const out:Blob|null=await new Promise(ok=>canvas.toBlob((b:Blob|null)=>ok(b),'image/jpeg',0.86));return out&&out.size<file.size?out:file;}catch{return file;}
}
/** 05/11/2026 (Pedro: "tem que ter a opcao de colar imagem caso eu tenha copiado uma"): imagem colada/arrastada no site
 * e enviada como anexo da pagina (reduzida a ate 2000 px). Devolve o id do anexo. */
export async function uploadPageImage(api:SofiaApi,pageId:string,blob:Blob):Promise<string>{
 if(blob.size>10*1024*1024)throw new Error('A imagem deve ter até 10 MB.');const small=await shrinkCover(blob);
 const data:string=await new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>bad(r.error);r.readAsDataURL(small);});
 const base64=data.slice(data.indexOf(',')+1),mime=coverMime(base64,small.type||'image/png');const a=await api.uploadAttachment(pageId,{name:coverName(mime),mime,base64});return a.id;
}
/** Primeira imagem da area de transferencia (evento de colar ou botao "Colar imagem"). */
export function clipboardImage(e:any):Blob|null{const items=[...(e?.clipboardData?.items||[])] as any[];for(const it of items)if(it.kind==='file'&&/^image\//.test(it.type)){const f=it.getAsFile();if(f)return f;}return null;}
async function readClipboardImage():Promise<Blob|null>{const nav=(globalThis as any).navigator;if(!nav?.clipboard?.read)return null;const list=await nav.clipboard.read();for(const item of list){const type=(item.types||[]).find((t:string)=>/^image\//.test(t));if(type)return await item.getType(type);}return null;}
/** Imagem anexada a pagina (bloco de imagem no site): baixada com a sessao, como a capa. */
export function PageAttachmentImage({api,id,caption}:{api:SofiaApi;id:string;caption?:string}){
 const c=useTheme(),[uri,setUri]=useState(()=>peekCover(id)),[failed,setFailed]=useState(false);
 useEffect(()=>{let live=true;if(peekCover(id)){setUri(peekCover(id));return;}cachedPageCover(api.attachmentSource(id),id,false,0).then(u=>{if(live)setUri(u);}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;};},[id,api]);
 if(failed)return <Text style={{color:c.muted,fontSize:12,padding:12}}>Não foi possível abrir esta imagem.</Text>;
 if(!uri)return <View style={{height:160,alignItems:'center',justifyContent:'center',backgroundColor:c.input,borderRadius:6}}><Spinner size={18}/></View>;
 return <View>{React.createElement('img',{src:uri,alt:caption||'',draggable:false,style:{display:'block',maxWidth:'100%',maxHeight:520,borderRadius:6,objectFit:'contain'}})}{caption?<Text style={{color:c.muted,fontSize:12,marginTop:4}}>{caption}</Text>:null}</View>;
}
const PENDING_COVER_KEY='sofia.native.pending-page-cover.v1';
/** 0.3.255: posicao vertical da capa (0 = topo da imagem, 100 = base). Sem valor = centro, como antes. */
// 0.3.268: a previa local da capa so vale no aparelho que enviou (caminho file:// do celular nao abre no site e vice-versa);
// fora dele a capa vem do servidor, a mesma em todos.
const localPreview=(uri:string)=>Platform.OS==='web'?(/^(data:|blob:|https?:)/.test(uri)?uri:''):(/^(file:|content:)/.test(uri)?uri:'');
export function coverPosition(data:Record<string,any>):number{const raw=data?.cover_position,n=Number(raw);return raw!==''&&raw!=null&&Number.isFinite(n)?Math.max(0,Math.min(100,n)):50;}
// 05/11/2026 (Pedro: "quando saio de uma pagina pra outra a capa da uma flicada e demora pra carregar"): a capa ja
// baixada aparece no mesmo quadro (antes comecava vazia e mostrava o carregando), o tamanho da imagem fica guardado
// (sem redesenhar depois de medir) e as capas das paginas recentes sao baixadas antes de abrir.
/** Desenha a imagem cobrindo a capa e deslocada pela posicao. No modo reposicionar, arrastar move a imagem. */
// 05/11/2026 (Pedro: "capas piscando ao entrar na pagina"): um <img> novo, mesmo com o arquivo ja baixado, levava 1-2
// quadros para ser desenhado. Agora a capa usa o MESMO elemento que foi decodificado em segundo plano (DECODED) e
// e colocada antes do primeiro desenho da pagina; o elemento fica guardado para a proxima visita.
function WebCoverImg({uri,position,onError}:{uri:string;position:number;onError:()=>void}){
 const host=useRef<any>(null),err=useRef(onError);err.current=onError;
 React.useLayoutEffect(()=>{const box=host.current;if(!box||typeof document==='undefined')return;
  let pic:any=DECODED.get(uri);if(!pic||pic.isConnected){pic=document.createElement('img');pic.decoding='sync';pic.src=uri;pic.addEventListener('load',()=>{if(!DECODED.has(uri))DECODED.set(uri,pic);});}
  pic.alt='';pic.draggable=false;pic.onerror=()=>err.current();
  Object.assign(pic.style,{position:'absolute',inset:'0',width:'100%',height:'100%',objectFit:'cover',objectPosition:'50% '+position+'%',display:'block',userSelect:'none',pointerEvents:'none'});
  box.appendChild(pic);return()=>{pic.onerror=null;if(pic.parentNode===box)box.removeChild(pic);};},[uri,position]);
 return React.createElement('div',{ref:host,style:{position:'absolute',inset:0}});
}
function CoverImage({uri,position,repositioning=false,onPosition,onError}:{uri:string;position:number;repositioning?:boolean;onPosition?:(n:number)=>void;onError:()=>void}){
 const [box,setBox]=useState({w:0,h:0}),[img,setImg]=useState<{w:number;h:number}|null>(()=>IMAGE_SIZES.get(uri)||null),[pos,setPos]=useState(position);
 const live=useRef({pos:position,start:position,extra:0,editing:repositioning,onPosition});
 useEffect(()=>{if(!repositioning)setPos(position);live.current.pos=position;},[position,repositioning]);
 useEffect(()=>{let alive=true;const known=IMAGE_SIZES.get(uri);if(known){setImg(known);return;}setImg(null);Image.getSize(uri,(w,h)=>{if(alive&&w>0&&h>0){IMAGE_SIZES.set(uri,{w,h});setImg({w,h});}},()=>{});return()=>{alive=false;};},[uri]);
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
 // 05/11/2026 (Pedro: "ao clicar na pagina a capa flica, aparece uma imagem por tras"): no site a capa era desenhada
 // primeiro centralizada e, depois de medir a imagem, pulava para a posicao escolhida. Fora do reposicionar ela agora e
 // um <img> com object-fit/object-position: ja nasce no lugar certo, sem medir.
 if(Platform.OS==='web'&&!repositioning)return <View testID="page-cover-image" style={StyleSheet.absoluteFill}><WebCoverImg uri={uri} position={position} onError={onError}/></View>;
 return <View testID="page-cover-image" style={StyleSheet.absoluteFill} {...(repositioning?pan.panHandlers:{})} onLayout={e=>{const {width:w,height:h}=e.nativeEvent.layout;if(Math.abs(w-box.w)>.5||Math.abs(h-box.h)>.5)setBox({w,h});}}>
  {scale?<Image source={{uri}} onError={onError} style={{position:'absolute',width,height,left:-(width-box.w)/2,top:-extra*(repositioning?pos:position)/100}}/>:<Image source={{uri}} resizeMode="cover" style={StyleSheet.absoluteFill} onError={onError}/>}
 </View>;
}
export function PageCover({data,api,repositioning=false,onPosition}:{data:Record<string,any>;api:SofiaApi;repositioning?:boolean;onPosition?:(n:number)=>void}){
 const c=useTheme(),attachment=String(data.cover_attachment_id||''),preview=localPreview(String(data.cover_local_uri||'')),gradientId='cover'+React.useId().replace(/[^a-zA-Z0-9]/g,'');
 const [uri,setUri]=useState(()=>preview||peekCover(attachment)),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 const retry=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let live=true,count=0;setFailed(false);setAttempt(0);const ready=preview||peekCover(attachment);setUri(ready);
  async function load(force=false){
   if(!attachment)return;
   count++;setAttempt(count);
   try{const next=await cachedPageCover(api.attachmentSource(attachment),attachment,force,count);if(live){setUri(next);setFailed(false);}}
   catch{if(live)setFailed(true);}
  }
  retry.current=()=>{setFailed(false);void load(true);};
  if(attachment&&!ready)void load(false);
  return()=>{live=false;retry.current=()=>{};};
 },[attachment,preview,api]);
 if(data.cover_type==='attachment'&&attachment){
  if(failed)return <View style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',backgroundColor:c.input,padding:16}]}><Text style={{fontSize:12,color:c.muted,textAlign:'center'}}>{tap('Não foi possível abrir esta capa. Toque na capa para escolher novamente.')}</Text></View>;
  if(!uri)return <View style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',backgroundColor:c.input}]}><Spinner size={20}/></View>;
  return <CoverImage key={attachment+':'+attempt+':'+uri} uri={uri} position={coverPosition(data)} repositioning={repositioning} onPosition={onPosition} onError={()=>{if(attempt<3){setUri('');retry.current();}else setFailed(true);}}/>;
 }
 const colors=String(data.cover_value||'').match(/#[0-9a-fA-F]{6}\b/g)||[c.accentSoft,c.accentSoft];
 // 0.3.267: id único por capa (no site todas as miniaturas usavam o 1º degradê com o mesmo id "cover")
 return <Svg width="100%" height="100%"><Defs><LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">{colors.map((color,i)=><Stop key={i} offset={colors.length===1?0:i/(colors.length-1)} stopColor={color}/>)}</LinearGradient></Defs><Rect width="100%" height="100%" fill={'url(#'+gradientId+')'}/></Svg>;
}
export function PageAppearance({kind,pageId,api,onApply,onClose,anchor,current}:{kind:'icon'|'cover';pageId:string;api:SofiaApi;onApply:(patch:Record<string,any>)=>void;onClose:()=>void;anchor?:{x:number;y:number}|null;current?:Record<string,any>}){
 const desktop=useDesktop(),[tab,setTab]=useState<'gallery'|'upload'>('gallery'),[query,setQuery]=useState('');
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
   // 0.3.267: o arquivo é lido direto (antes fetch do link blob:, que a política de segurança do site bloqueia: "Failed to fetch")
   const file:Blob|undefined=(asset as any).file;
   if(file){if(file.size>10*1024*1024)throw new Error('A capa deve ter até 10 MB. Recorte a imagem ou escolha uma menor.');
    const small=await shrinkCover(file);
    const data:string=await new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>bad(r.error);r.readAsDataURL(small);});base64=data.slice(data.indexOf(',')+1);}
   else throw new Error('Não foi possível ler a imagem escolhida. Tente de novo.');
   if(base64.length*0.75>10*1024*1024)throw new Error('A capa deve ter até 10 MB. Recorte a imagem ou escolha uma menor.');
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
  const result=await ImagePicker.launchImageLibraryAsync(Platform.OS==='web'?{mediaTypes:['images'],allowsEditing:false,quality:0.9}:{mediaTypes:['images'],allowsEditing:true,aspect:[3,1],quality:0.78});
  if(!alive.current)return;
  await finishPick(result);
 }catch(e){await clearPending();if(alive.current)setError(e instanceof Error?e.message:'Não foi possível trocar a capa.');}finally{if(alive.current)setBusy(false);}}
 async function pasteBlob(blob:Blob){if(busy)return;setBusy(true);setError('');try{const id=await uploadPageImage(api,pageId,blob);if(alive.current)choose({cover_type:'attachment',cover_value:'',cover_attachment_id:id,cover_local_uri:''});}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Não foi possível usar a imagem colada.');}finally{if(alive.current)setBusy(false);}}
 useEffect(()=>{if(!desktop||kind!=='cover'||Platform.OS!=='web')return;const d=(globalThis as any).document;const on=(e:any)=>{const img=clipboardImage(e);if(img){e.preventDefault();void pasteBlob(img);}};d?.addEventListener('paste',on);return()=>d?.removeEventListener('paste',on);});
 if(desktop){
  // 0.3.267 (computador): janela pequena presa ao botão, como no Notion (antes: painel de baixo na largura toda)
  const W=kind==='icon'?408:440,vw=typeof window!=='undefined'?window.innerWidth:1200,vh=typeof window!=='undefined'?window.innerHeight:800;
  const left=Math.max(12,Math.min((anchor?.x??vw/2-W/2),vw-W-12)),top=Math.max(12,Math.min((anchor?.y??120)+8,vh-420));
  const tabStyle=(on:boolean)=>({paddingVertical:8,marginRight:14,borderBottomWidth:2,borderColor:on?c.text:'transparent'});
  const tabText=(on:boolean)=>({color:on?c.text:c.muted,fontSize:13,fontWeight:'500' as const});
  const q=fold(query.trim()),emojis=EMOJI_WORDS.filter(([e,w])=>!q||fold(w).includes(q)||e===query.trim()),symbols=q?SYMBOLS.filter(x=>x===query.trim()):SYMBOLS;
  const textAction=(label:string,fn:()=>void,danger=false)=><Pressable accessibilityRole="button" disabled={busy} onPress={fn} style={({hovered}:any)=>({paddingHorizontal:8,paddingVertical:5,borderRadius:6,backgroundColor:hovered?c.input:'transparent'})}><Text style={{color:danger?c.danger:c.muted,fontSize:13}}>{label}</Text></Pressable>;
  return <MotionModal visible transparent onRequestClose={()=>{if(!busy)onClose();}}>
   <Pressable accessibilityLabel="Fechar" onPress={()=>{if(!busy)onClose();}} style={{flex:1}}>
    <Pressable testID={'page-'+kind+'-picker'} onPress={()=>{}} style={{position:'absolute',left,top,width:W,maxHeight:Math.min(460,vh-top-12),borderRadius:10,borderWidth:1,borderColor:c.line,backgroundColor:c.surface,shadowColor:'#000',shadowOpacity:0.3,shadowRadius:24,shadowOffset:{width:0,height:10},elevation:16,overflow:'hidden'}}>
     <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:12,borderBottomWidth:1,borderColor:c.line}}>
      {kind==='icon'?<>{(['emoji','icon'] as const).map(v=><Pressable key={v} onPress={()=>setMode(v)} style={tabStyle(mode===v)}><Text style={tabText(mode===v)}>{v==='emoji'?'Emoji':'Ícones'}</Text></Pressable>)}</>
       :<>{(['gallery','upload'] as const).map(v=><Pressable key={v} onPress={()=>setTab(v)} style={tabStyle(tab===v)}><Text style={tabText(tab===v)}>{v==='gallery'?'Galeria':'Enviar'}</Text></Pressable>)}</>}
      <View style={{flex:1}}/>
      {kind==='icon'?<>{textAction('Aleatório',()=>{const list=mode==='emoji'?EMOJI_WORDS.map(x=>x[0]):SYMBOLS;choose({icon:list[Math.floor(Math.random()*list.length)],icon_mode:mode});})}{current?.icon?textAction('Remover',()=>choose({icon:'',icon_mode:'default'})):null}</>
       :current?.cover_type?textAction('Remover',()=>choose({cover_type:'',cover_value:'',cover_attachment_id:'',cover_local_uri:''})):null}
     </View>
     {error?<View style={{padding:10}}><ErrorBanner text={error}/></View>:null}
     {kind==='icon'?<View style={{padding:10,gap:8}}>
      <TextInput autoFocus value={query} onChangeText={setQuery} placeholder={mode==='emoji'?'Filtrar… (ex.: casa, música, livro)':'Cole um símbolo'} placeholderTextColor={c.muted} accessibilityLabel="Filtrar ícones" onSubmitEditing={()=>{const first=mode==='emoji'?emojis[0]?.[0]:symbols[0];if(first)choose({icon:first,icon_mode:mode});else if(query.trim())choose({icon:query.trim(),icon_mode:mode});}} style={{height:32,borderRadius:6,borderWidth:1,borderColor:c.line,backgroundColor:c.input,color:c.text,paddingHorizontal:10,fontSize:13}}/>
      <ScrollView style={{maxHeight:300}} keyboardShouldPersistTaps="handled"><View style={{flexDirection:'row',flexWrap:'wrap'}}>
       {(mode==='emoji'?emojis.map(x=>x[0]):symbols).map(icon=><Pressable key={icon} accessibilityLabel={'Usar '+icon} onPress={()=>choose({icon,icon_mode:mode})} style={({hovered}:any)=>({width:36,height:36,borderRadius:6,alignItems:'center',justifyContent:'center',backgroundColor:hovered?c.input:'transparent'})}><Text style={{fontSize:24,color:c.text}}>{icon}</Text></Pressable>)}
       {mode==='emoji'&&!emojis.length&&query.trim()?<Pressable onPress={()=>choose({icon:query.trim(),icon_mode:'emoji'})} style={{padding:8}}><Text style={{color:c.muted,fontSize:13}}>Usar “{query.trim()}” como ícone</Text></Pressable>:null}
      </View></ScrollView>
     </View>
     :tab==='gallery'?<ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:380}} contentContainerStyle={{padding:12,gap:8}}>
      <Text style={{color:c.muted,fontSize:12,fontWeight:'500'}}>Cores e degradês</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{PAGE_COVERS.map(([name,value])=><Pressable key={name} disabled={busy} accessibilityLabel={'Capa '+name} onPress={()=>choose({cover_type:'preset',cover_value:value,cover_attachment_id:'',cover_local_uri:''})} style={({hovered}:any)=>({width:(W-24-24)/4,gap:4,opacity:hovered?0.85:1})}><View style={{height:56,borderRadius:6,overflow:'hidden'}}><PageCover api={api} data={{cover_type:'preset',cover_value:value}}/></View><Text numberOfLines={1} style={{color:c.muted,fontSize:11}}>{name}</Text></Pressable>)}</View>
     </ScrollView>
     :<View style={{padding:16,gap:12}}>
      {busy?<View style={{padding:18,alignItems:'center',gap:8}}><ActivityIndicator color={c.accent}/><Text style={{color:c.muted}}>Enviando capa…</Text></View>:<>
       <Pressable accessibilityRole="button" onPress={()=>void upload()} style={({hovered}:any)=>({height:34,borderRadius:6,borderWidth:1,borderColor:c.line,alignItems:'center',justifyContent:'center',backgroundColor:hovered?c.input:'transparent'})}><Text style={{color:c.text,fontSize:13,fontWeight:'500'}}>Enviar arquivo</Text></Pressable>
       <Pressable accessibilityRole="button" onPress={()=>{void readClipboardImage().then(b=>{if(b)void pasteBlob(b);else setError('Nenhuma imagem copiada. Copie uma imagem e tente de novo (ou aperte Ctrl+V).');}).catch(()=>setError('O navegador não deixou ler a imagem copiada. Aperte Ctrl+V com esta janela aberta.'));}} style={({hovered}:any)=>({height:34,borderRadius:6,borderWidth:1,borderColor:c.line,alignItems:'center',justifyContent:'center',backgroundColor:hovered?c.input:'transparent'})}><Text style={{color:c.text,fontSize:13,fontWeight:'500'}}>Colar imagem copiada</Text></Pressable>
       <Text style={{color:c.muted,fontSize:12,textAlign:'center'}}>Ou aperte Ctrl+V com esta janela aberta. Imagens com mais de 1500 pixels de largura ficam melhores; depois dá para reposicionar.</Text>
      </>}
     </View>}
    </Pressable>
   </Pressable>
  </MotionModal>;
 }
 // 0.3.268: entra e sai animada (antes sumia de uma vez ao fechar)
 return <MotionModal visible transparent onRequestClose={()=>{if(!busy)onClose();}}>
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
 </MotionModal>;
}
