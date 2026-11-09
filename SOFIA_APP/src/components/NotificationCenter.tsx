import {uiScale} from '../web/desktop-scale';
import {HoverPressable} from './HoverPressable';
import {capsuleStore} from '../lib/capsule-store';
import {PALETTE} from '../lib/palette';
import {capsuleDoseOfNotice,capsuleKey} from '../lib/capsule-model';
import {queueOptional} from '../lib/fluency';
import {useBellInbox} from '../lib/use-bell-inbox';
import {mergeBellNotices} from '../lib/bell-inbox';
import {MOTION_EASE,useReducedMotion} from '../lib/motion';
import {dpx} from '../lib/content-width';
import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {AppState,LayoutAnimation,Modal,Platform,Pressable,ScrollView,Text,View,Alert,Animated,PanResponder,useWindowDimensions} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {markNoticesSeen} from '../lib/background-notify';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {notificationPopoverLayout,noticeDateGroup} from '../lib/notification-layout';
import type {BellAnchor} from '../lib/notification-layout';
import type {Notice} from '../lib/types';
import {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {subscribeSystemChanged} from '../lib/system-events';
import {Button,ErrorBanner,IconButton} from './UI';
import {Icon, type IconName} from './Icon';
import {appAlert} from '../lib/app-alert';
export const noticeArea=(n:Notice)=>{const category=String(n.category||'').toLowerCase();if(/capsule|cápsula/.test(category))return 'Cápsulas';if(/routine|rotina/.test(category))return 'Rotinas';if(/course|curso|lesson|aula/.test(category))return 'Cursos';if(/study|estud/.test(category))return 'Estudos';if(/package|encomenda|rastreio/.test(category))return 'Encomendas';if(/price|monitor|preço|compra|purchase/.test(category))return 'Monitoramento de produtos';if(/^email|mail/.test(category))return 'E-mails';if(/fin|fatura|bill|boleto/.test(category))return 'Finanças';if(/task|tarefa/.test(category))return 'Tarefas';if(/agenda|remind|commitment|routine|calendar|lembrete/.test(category))return 'Agenda';if(/^drive$|arquivo/.test(category))return 'Arquivos da Sofia';return 'Outros';};
type State={ready:boolean;localOnly:boolean;items:Notice[];unread:number;loading:boolean;error:string;refresh:()=>Promise<void>;read:(n:Notice)=>Promise<void>;readAll:()=>Promise<void>;clear:(n:Notice)=>Promise<void>;clearAll:()=>Promise<void>;open:(n:Notice)=>void;api:SofiaApi};
const Context=createContext<State|null>(null);
let lastRefreshAt=0;
export function NotificationProvider({api,enabled,children,scope='',onOpen}:{api:SofiaApi;enabled:boolean;children:React.ReactNode;scope?:string;onOpen?:(n:Notice)=>void}){
 const [items,setItems]=useState<Notice[]>([]),[unread,setUnread]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const local=useBellInbox(api,scope,enabled),merged=useMemo(()=>mergeBellNotices(items,local.items),[items,local.items]);
 const totalUnread=merged.filter(n=>n.state==='unread').length;
 const generation=useRef(0),request=useRef(false),queued=useRef(false);
 const [ready,setReady]=useState(false); // 0.3.290: o Inicio espera a primeira lista de avisos antes de mostrar o Resumo
 const refresh=useCallback(async()=>{if(!enabled)return;if(request.current){queued.current=true;return;}request.current=true;const current=generation.current;setLoading(true);try{const all:Notice[]=[];let offset:number|null=0,count=0;const seen=new Set<number>();while(offset!==null){if(seen.has(offset))throw Error('Paginação de notificações inválida.');seen.add(offset);const result=await api.allNotifications(offset);all.push(...result.items);offset=result.next_offset;count=result.unread;}if(current===generation.current){lastRefreshAt=Date.now();const list=[...new Map(all.map(n=>[n.id,n])).values()];setItems(list);setUnread(count);api.webKeep?.('notices',{items:list,unread:count});setError('');void markNoticesSeen(all.filter(n=>n.state==='unread').map(n=>n.id));}}catch(e){if(current===generation.current)setError(errorText(e));}finally{setReady(true);if(current===generation.current){setLoading(false);request.current=false;if(queued.current){queued.current=false;void refresh();}}}},[api,enabled]);
 useEffect(()=>{if(!enabled)return;void loadDigestFromDisk();const first=queueOptional('notifications:digest',()=>{void refreshDigest(api);},7);const every=setInterval(()=>{if(AppState.currentState==='active')void refreshDigest(api);},300000);const sub=AppState.addEventListener('change',st=>{if(st==='active')void refreshDigest(api);});return()=>{first();clearInterval(every);sub.remove();};},[api,enabled]);
 useEffect(()=>{generation.current++;request.current=false;const saved=api.webPeek?.<{items:Notice[];unread:number}>('notices');if(saved&&Array.isArray(saved.items)){setItems(saved.items);setUnread(Number(saved.unread)||0);setReady(true);}else{setItems([]);setUnread(0);}setError('');const cancelInitial=Platform.OS==='web'?(void refresh(),()=>{}):queueOptional('notifications:inventory',()=>{void refresh();},7,8000); /* 0.3.290: no site a lista vem junto com o resto do Inicio */const system=subscribeSystemChanged(owner=>{if(owner===api)void refresh();});const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh();},30000),subscription=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});return()=>{cancelInitial();generation.current++;request.current=false;system();clearInterval(timer);subscription.remove();};},[api,refresh]);
 async function read(n:Notice){if(n.id.startsWith('local:')){local.read(n.id);return;}try{await api.markRead(n.id);setItems(old=>old.map(x=>x.id===n.id?{...x,state:'read'}:x));if(n.state==='unread')setUnread(v=>Math.max(0,v-1));await refresh();}catch(e){setError(errorText(e));}}
 async function readAll(){
  local.readAll();const pending=items.filter(n=>n.state==='unread');
  if(!pending.length&&unread===0){setUnread(0);return;}
  setItems(old=>old.map(n=>n.state==='unread'?{...n,state:'read'}:n));setUnread(0);setError('');
  // 0.3.146: global no servidor; servidor antigo (sem a rota) cai no modo item a item.
  try{try{await api.markAllRead();}catch(e){if((e as {status?:number}).status!==404)throw e;for(let i=0;i<pending.length;i+=8)await Promise.all(pending.slice(i,i+8).map(n=>api.markRead(n.id)));}await refresh();}
  catch(e){setError(errorText(e));await refresh();}
 }
 async function clear(n:Notice){if(n.id.startsWith('local:')){local.dismiss(n.id);return;}try{await api.clearNotification(n.id);setItems(old=>old.filter(x=>x.id!==n.id));if(n.state==='unread')setUnread(v=>Math.max(0,v-1));await refresh();}catch(e){setError(errorText(e));}}
 async function clearAll(){local.clear();try{await api.clearNotification('all');setItems([]);setUnread(0);await refresh();}catch(e){setError(errorText(e));}}
 // Tocar num aviso marca como lido e leva direto ao lugar dele (produto, cápsula, agenda, finanças).
 function open(n:Notice){if(n.state==='unread'&&!n.id.startsWith('digest:'))void read(n);onOpen?.(n);}
 return <Context.Provider value={{ready:ready||!enabled,localOnly:api.mdLocalOnly,items:merged,unread:totalUnread,loading,error,refresh,read,readAll,clear,clearAll,open,api}}>{children}</Context.Provider>;
}
export function useNotifications(){const value=useContext(Context);if(!value)throw Error('Centro de notificações não montado.');return value;}
export const AREA_STYLE:Record<string,{icon:string;color:string;glyph?:string}>={'Agenda':{icon:'📅',glyph:'calendar',color:PALETTE.blue},'Cápsulas':{icon:'💊',glyph:'capsule',color:PALETTE.pink},'Rotinas':{icon:'🔁',glyph:'repeat',color:PALETTE.teal},'Monitoramento de produtos':{icon:'📉',glyph:'trendDown',color:PALETTE.green},'Finanças':{icon:'💳',glyph:'card',color:PALETTE.brand},'E-mails':{icon:'✉️',glyph:'mail',color:PALETTE.sky},'Tarefas':{icon:'✅',glyph:'checkCircle',color:PALETTE.amber},'Cursos':{icon:'🎓',glyph:'graduation',color:PALETTE.lilac},'Estudos':{icon:'📚',glyph:'book',color:PALETTE.lilac},'Outros':{icon:'🔔',glyph:'bell',color:PALETTE.slate}};
const AREA_SHORT:Record<string,string>={'Monitoramento de produtos':'Preços','Cápsulas':'Rotina','Rotinas':'Rotina'};
export function relativeTime(iso:string,now=Date.now()){const t=Date.parse(iso);if(!Number.isFinite(t))return '';const m=Math.round((now-t)/60000);if(m<1)return 'agora';if(m<60)return 'há '+m+' min';const h=Math.round(m/60);if(h<24)return 'há '+h+' h';const d=Math.round(h/24);return d===1?'ontem':d<7?'há '+d+' dias':new Date(t).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','');}
const SWIPE_OUT=90;
/** Arrastar para a esquerda e soltar apaga o aviso (igual à gaveta do Android). Toque continua abrindo.
 * 0.3.146: arrastar para a DIREITA marca como lida (o aviso volta ao lugar; nao apaga). Ja lida: nada muda. */
const SWIPE_READ=80;
function Swipeable({children,onDismiss,onRead,readLabel='✓ Lida',readAction='Marcar como lida',label}:{children:React.ReactNode|((dismiss:()=>void)=>React.ReactNode);onDismiss:()=>void;onRead?:()=>void;readLabel?:string;readAction?:string;label:string}){
 const c=useTheme(),x=useRef(new Animated.Value(0)).current,collapse=useRef(new Animated.Value(1)).current,[gone,setGone]=useState(false),[closing,setClosing]=useState(false),width=useRef(360),height=useRef(0);
 // Sai pela esquerda e DEPOIS a altura fecha suave: os avisos de baixo sobem
 // acompanhando, como no iPhone, em vez de pularem de uma vez (corte seco).
 const dismiss=useCallback(()=>{setClosing(true);Animated.timing(x,{toValue:-width.current,duration:180,easing:MOTION_EASE,useNativeDriver:true}).start(()=>{
  // 0.3.268: no celular a altura nao e mais animada quadro a quadro em JavaScript (useNativeDriver:false travava a lista);
  // o aviso some e os de baixo sobem por animacao de posicao do proprio sistema (LayoutAnimation). No site, onde essa
  // animacao nao existe, a altura fecha suave como antes.
  if(Platform.OS!=='web'){try{LayoutAnimation.configureNext(LayoutAnimation.create(220,LayoutAnimation.Types.easeInEaseOut,LayoutAnimation.Properties.opacity));}catch{/* sem animacao */}setGone(true);onDismiss();return;}
  Animated.timing(collapse,{toValue:0,duration:220,easing:MOTION_EASE,useNativeDriver:false}).start(()=>{setGone(true);onDismiss();});});},[x,collapse,onDismiss]);
 const pan=useMemo(()=>PanResponder.create({
  // Reconhece o arrasto para o lado cedo e, uma vez reconhecido, não solta para a rolagem
  // (antes: arrastar e subir o dedo virava rolagem e o aviso não apagava).
  onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>8&&Math.abs(g.dx)>Math.abs(g.dy)*1.2,
  onMoveShouldSetPanResponderCapture:(_,g)=>Math.abs(g.dx)>10&&Math.abs(g.dx)>Math.abs(g.dy)*1.3,
  onPanResponderTerminationRequest:()=>false,
  onShouldBlockNativeResponder:()=>true,
  onPanResponderMove:(_,g)=>x.setValue(onRead?Math.max(-width.current,Math.min(SWIPE_READ*1.4,g.dx)):Math.min(0,g.dx)),
  onPanResponderRelease:(_,g)=>{if(g.dx<-SWIPE_OUT||g.vx<-0.8)dismiss();else{if(onRead&&g.dx>SWIPE_READ)onRead();Animated.spring(x,{toValue:0,useNativeDriver:true,bounciness:6}).start();}},
  onPanResponderTerminate:()=>Animated.spring(x,{toValue:0,useNativeDriver:true}).start(),
 }),[x,dismiss]);
 if(gone)return null;
 return <Animated.View onLayout={e=>{width.current=e.nativeEvent.layout.width;if(!closing)height.current=e.nativeEvent.layout.height;}}
  style={closing?{height:collapse.interpolate({inputRange:[0,1],outputRange:[0,height.current||64]}),opacity:collapse,marginBottom:collapse.interpolate({inputRange:[0,1],outputRange:[0,4]}),overflow:'hidden'}:{marginBottom:4}}
  accessibilityActions={onRead?[{name:'delete',label:'Apagar '+label},{name:'read',label:readAction}]:[{name:'delete',label:'Apagar '+label}]} onAccessibilityAction={e=>{if(e.nativeEvent.actionName==='delete')dismiss();if(e.nativeEvent.actionName==='read')onRead?.();}}>
  <Animated.View style={{position:'absolute',top:0,bottom:0,left:0,right:0,borderRadius:16,backgroundColor:PALETTE.red,alignItems:'flex-end',justifyContent:'center',paddingRight:18,opacity:x.interpolate({inputRange:[-1,0],outputRange:[1,0],extrapolate:'clamp'})}}><Text style={{color:PALETTE.white,fontWeight:'600',fontSize:12}}>Apagar</Text></Animated.View>
  {onRead?<Animated.View style={{position:'absolute',top:0,bottom:0,left:0,right:0,borderRadius:16,backgroundColor:PALETTE.green,alignItems:'flex-start',justifyContent:'center',paddingLeft:18,opacity:x.interpolate({inputRange:[0,1],outputRange:[0,1],extrapolate:'clamp'})}}><Text style={{color:PALETTE.white,fontWeight:'600',fontSize:12}}>{readLabel}</Text></Animated.View>:null}
  <Animated.View {...pan.panHandlers} style={{transform:[{translateX:x}],backgroundColor:c.bg,borderRadius:16}}>{typeof children==='function'?children(dismiss):children}</Animated.View>
 </Animated.View>;
}
export const NoticeRow=React.memo(function NoticeRow({item}:{item:Notice}){const c=useTheme(),notices=useNotifications(),area=noticeArea(item),st=AREA_STYLE[area]||AREA_STYLE.Outros,unread=item.state==='unread';
// 0.3.154: 1o arrastar para a direita = lida. Em aviso de capsula JA lido, arrastar de novo = "tomei":
 // registra a dose como tomada e tira o aviso.
 const dose=item.category==='capsule'?capsuleDoseOfNotice(item.id):null;
 async function takeDose(){if(!dose)return;await capsuleStore(notices.api).take(dose.planId,dose.day,dose.time,true);const key=capsuleKey(dose.planId,dose.day,dose.time);if(capsuleStore(notices.api).snapshot.history.some(h=>capsuleKey(h.data.capsule_id,h.data.day,h.data.time)===key))await notices.clear(item);}
 return <Swipeable label={item.title} onDismiss={()=>void notices.clear(item)} onRead={unread?()=>void notices.read(item):dose?()=>void takeDose():undefined} readLabel={unread?'✓ Lida':'💊 Tomei'} readAction={unread?'Marcar como lida':'Marcar dose como tomada'}>{dismiss=><Pressable accessibilityRole="button" accessibilityLabel={'Abrir: '+item.title} onPress={()=>notices.open(item)} style={{flexDirection:'row',gap:12,paddingVertical:12,paddingHorizontal:10,borderRadius:16,backgroundColor:unread?st.color+'12':c.bg}}>
  <View style={{width:38,height:38,borderRadius:19,backgroundColor:st.color+'26',alignItems:'center',justifyContent:'center'}}>{(st as {glyph?:string}).glyph?<Icon name={(st as {glyph?:string}).glyph as IconName} size={20} color={st.color} weight="duotone"/>:<Text style={{fontSize:18}}>{st.icon}</Text>}</View>
  <View style={{flex:1,gap:3}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:6}}>{unread?<View style={{width:8,height:8,borderRadius:4,backgroundColor:st.color}}/>:null}<Text numberOfLines={2} style={{flex:1,color:c.text,fontSize:14,fontWeight:unread?'700':'500'}}>{item.title}</Text></View>
   {item.body?<Text numberOfLines={3} style={{color:c.muted,fontSize:12,lineHeight:18}}>{item.body}</Text>:null}
   <Text style={{color:c.muted,fontSize:10}}>{AREA_SHORT[area]||area} · {relativeTime(item.created_at)}</Text>
  </View>
  <View style={{gap:2}}>
   {unread?<Pressable accessibilityLabel={'Marcar como lida: '+item.title} onPress={()=>void notices.read(item)} style={{padding:6}}><Icon name="check" size={16} color={c.muted}/></Pressable>:null}
   <Pressable accessibilityLabel={'Limpar notificação: '+item.title} onPress={dismiss} style={{padding:6}}><Icon name="close" size={16} color={c.muted}/></Pressable>
  </View>
 </Pressable>}</Swipeable>;});
// "Pra agora": o sino olha as outras funções e resume o que pede atenção,
// mesmo que nenhum aviso tenha chegado (contas vencendo, produto no menor preço).
type Digest={id:string;icon:string;glyph?:string;color:string;title:string;text:string;category:string;entity_id?:string};
// O resumo é montado ANTES de abrir o sino: em segundo plano depois da
// abertura do app, a cada 5 min e ao voltar ao app, e fica salvo no aparelho.
// Assim o bloco já está lá quando o sino abre, sem "nascer" na frente da pessoa.
const DIGEST_KEY='sofia.native.bell-digest.v1',DIGEST_HIDDEN_KEY='sofia.native.bell-digest-hidden.v1',DIGEST_FRESH_MS=120000;
const digestStore:{items:Digest[];at:number;hidden:Record<string,string>;loaded:boolean;running:boolean}={items:[],at:0,hidden:{},loaded:false,running:false};
const digestListeners=new Set<()=>void>();
const emitDigest=()=>digestListeners.forEach(l=>l());
async function loadDigestFromDisk(){
 if(digestStore.loaded)return;digestStore.loaded=true;
 try{const [raw,hid]=await Promise.all([AsyncStorage.getItem(DIGEST_KEY),AsyncStorage.getItem(DIGEST_HIDDEN_KEY)]);
  if(hid)digestStore.hidden=JSON.parse(hid)||{};
  const saved=raw?JSON.parse(raw):null;if(saved&&Array.isArray(saved.items)&&!digestStore.at){digestStore.items=saved.items;digestStore.at=Number(saved.at)||0;}
  emitDigest();}catch{/* sem cache: monta na próxima rodada */}
}
async function buildDigest(api:SofiaApi):Promise<Digest[]>{
 const out:Digest[]=[];
 try{
  const fin=require('../lib/finance') as typeof import('../lib/finance');const {money}=require('../lib/monitoring') as typeof import('../lib/monitoring');
  const list=async(kind:string)=>{const all:any[]=[];for(let o=0;;o+=100){const r=await api.entities(kind,'',o);all.push(...r.items);if(r.items.length<100)break;}return all;};
  const [txs,cards]=await Promise.all([list('fin_tx'),list('fin_card')]);
  if(txs.length||cards.length){const dues=fin.upcoming(txs.filter((e:any)=>e.state!=='archived').map(fin.toTx),cards.map(fin.toCard),fin.todayISO(),3);
   const late=dues.filter(d=>d.late&&d.kind!=='receber'),soon=dues.filter(d=>!d.late&&d.kind!=='receber');
   if(late.length)out.push({id:'digest:fin-late',icon:'⚠️',glyph:'warning',color:PALETTE.red,title:late.length===1?late[0].title+' está atrasada':late.length+' contas atrasadas',text:money(late.reduce((s,d)=>s+d.amount,0))+' em aberto',category:'finance'});
   if(soon.length)out.push({id:'digest:fin-soon',icon:'💳',glyph:'card',color:PALETTE.brand,title:soon.length===1?soon[0].title+' vence '+(soon[0].date===fin.todayISO()?'hoje':'em breve'):soon.length+' contas vencem em 3 dias',text:money(soon.reduce((s,d)=>s+d.amount,0))+' no total',category:'finance'});}
 }catch{/* Finanças é opcional no resumo */}
 try{
  const {productsFrom}=require('../lib/monitor-collector') as typeof import('../lib/monitor-collector');const {money}=require('../lib/monitoring') as typeof import('../lib/monitoring');
  const mons:any[]=[];for(let o=0;;o+=100){const r=await api.entities('monitor','',o);mons.push(...r.items);if(r.items.length<100)break;}
  if(mons.length){const low=(await productsFrom(api,mons)).filter(p=>p.atLow&&p.now);
   for(const p of low.slice(0,2))out.push({id:'digest:low-'+p.monitor.id,icon:'🏆',glyph:'star',color:PALETTE.green,title:p.monitor.title,text:'No menor preço já visto: '+money(p.now!.price,p.currency)+' na '+p.now!.store.name,category:'price',entity_id:p.monitor.id});}
 }catch{/* Monitoramento é opcional no resumo */}
 return out;
}
export async function refreshDigest(api:SofiaApi,force=false){
 await loadDigestFromDisk();
 if(digestStore.running||(!force&&Date.now()-digestStore.at<DIGEST_FRESH_MS))return;
 digestStore.running=true;
 try{const items=await buildDigest(api);digestStore.items=items;digestStore.at=Date.now();emitDigest();void AsyncStorage.setItem(DIGEST_KEY,JSON.stringify({items,at:digestStore.at})).catch(()=>{});}
 catch{/* mantém o último resumo */}finally{digestStore.running=false;}
}
// 0.3.141: dispensar vale enquanto o aviso for o mesmo (mesmo título e texto), em qualquer dia.
// Antes valia só pelo "dia" em UTC, e às 21h de Brasília o item voltava sozinho.
export const digestSignature=(d:{title:string;text:string})=>d.title+'|'+d.text;
function hideDigest(id:string){const item=digestStore.items.find(d=>d.id===id);if(!item)return;const keep=new Set(digestStore.items.map(d=>d.id));digestStore.hidden={...Object.fromEntries(Object.entries(digestStore.hidden).filter(([k])=>keep.has(k))),[id]:digestSignature(item)};emitDigest();void AsyncStorage.setItem(DIGEST_HIDDEN_KEY,JSON.stringify(digestStore.hidden)).catch(()=>{});}
function useDigest(){const [,tick]=useState(0);useEffect(()=>{const l=()=>tick(v=>v+1);digestListeners.add(l);return()=>{digestListeners.delete(l);};},[]);return digestStore.items.filter(d=>digestStore.hidden[d.id]!==digestSignature(d));}
/** Entrada suave: cresce de 0,94 para 1 e aparece, em vez de surgir seco. Só
 * anima o que chegou DEPOIS de o sino abrir; o que já estava pronto aparece junto com o painel. */
function Appear({animate,children}:{animate:boolean;children:React.ReactNode}){
 const reduced=useReducedMotion(),v=useRef(new Animated.Value(animate&&!reduced?0:1)).current;
 useEffect(()=>{if(animate&&!reduced)Animated.spring(v,{toValue:1,useNativeDriver:true,friction:8,tension:90}).start();},[animate,reduced,v]);
 return <Animated.View style={{opacity:v,transform:[{scale:v.interpolate({inputRange:[0,1],outputRange:[.94,1]})},{translateY:v.interpolate({inputRange:[0,1],outputRange:[-6,0]})}]}}>{children}</Animated.View>;
}
function BellDigest(){const c=useTheme(),n=useNotifications(),shown=useDigest(),initial=useRef<Set<string>|null>(null);
 if(initial.current===null)initial.current=new Set(shown.map(d=>d.id));
 if(!shown.length)return null;
 const sectionNew=initial.current.size===0;
 return <View style={{gap:2,marginBottom:6}}><Text style={{fontSize:13,color:c.muted,fontWeight:'600',paddingTop:6,paddingBottom:4}}>Pede atenção agora</Text>
  {shown.map(d=><Swipeable key={d.id} label={d.title} onDismiss={()=>hideDigest(d.id)}>{dismiss=><Pressable accessibilityRole="button" accessibilityLabel={d.title} onPress={()=>n.open({id:d.id,title:d.title,body:d.text,state:'read',created_at:new Date().toISOString(),category:d.category,entity_id:d.entity_id})}
   style={{flexDirection:'row',gap:12,paddingVertical:12,paddingHorizontal:10,borderRadius:16,backgroundColor:d.color+'14',borderWidth:1,borderColor:d.color+'44'}}>
   <View style={{width:38,height:38,borderRadius:19,backgroundColor:d.color+'26',alignItems:'center',justifyContent:'center'}}>{(d as {glyph?:string}).glyph?<Icon name={(d as {glyph?:string}).glyph as IconName} size={20} color={d.color} weight="duotone"/>:<Text style={{fontSize:18}}>{d.icon}</Text>}</View>
   <View style={{flex:1,gap:3}}><Text numberOfLines={2} style={{color:c.text,fontWeight:'600',fontSize:14}}>{d.title}</Text><Text numberOfLines={3} style={{color:c.muted,fontSize:12,lineHeight:18}}>{d.text}</Text></View>
   <Pressable accessibilityLabel={'Dispensar: '+d.title} onPress={dismiss} style={{padding:6,alignSelf:'flex-start'}}><Icon name="close" size={16} color={c.muted}/></Pressable>
  </Pressable>}</Swipeable>)}</View>;}
export function NotificationList({grouped=false,firstPaint=false}:{grouped?:boolean;firstPaint?:boolean}){const n=useNotifications(),c=useTheme(),[filter,setFilter]=useState('all'),[limits,setLimits]=useState<Record<string,number>>({});
 const areas=useMemo(()=>{const m=new Map<string,number>();for(const i of n.items){const a=noticeArea(i);m.set(a,(m.get(a)||0)+1);}return [...m.entries()].sort((a,b)=>b[1]-a[1]);},[n.items]);
 const shown=useMemo(()=>n.items.filter(i=>filter==='all'||(filter==='unread'?i.state==='unread':noticeArea(i)===filter)),[n.items,filter]);
 const groups=useMemo(()=>{const result=new Map<string,Notice[]>();for(const item of shown){const key=noticeDateGroup(item.created_at);if(!result.has(key))result.set(key,[]);result.get(key)!.push(item);}return result;},[shown]);
 const chip=(value:string,label:string,count?:number)=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:filter===value}} onPress={()=>setFilter(value)} style={{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:11,paddingVertical:6,borderRadius:99,backgroundColor:filter===value?c.accent:c.input}}><Text style={{color:filter===value?c.onAccent:c.text,fontSize:12,fontWeight:'500'}}>{label}</Text>{count?<Text style={{color:filter===value?PALETTE.white+'cc':c.muted,fontSize:11}}>{count}</Text>:null}</Pressable>;
 return <View style={{gap:10}}>
  <BellDigest/>

  {n.error?<ErrorBanner text={n.error} onRetry={()=>void n.refresh()}/>:null}
  {n.items.length?<ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{chip('all','Todas',n.items.length)}{n.unread?chip('unread','Não lidas',n.unread):null}{areas.map(([a,count])=>chip(a,(AREA_STYLE[a]||AREA_STYLE.Outros).icon+' '+(AREA_SHORT[a]||a),count))}</ScrollView>:null}
  {!shown.length?<View style={{alignItems:'center',paddingVertical:24,gap:6}}><Text style={{fontSize:28}}>{n.loading?'⏳':'✨'}</Text><Text style={{color:c.muted}}>{n.loading?'Carregando…':filter==='all'?'Tudo em dia. Sem notificações.':'Nada aqui neste filtro.'}</Text></View>:null}
  {[...groups].slice(0,firstPaint?1:undefined).map(([group,items])=>{const limit=firstPaint?6:limits[group]||(grouped?20:12);return <View key={group} style={{gap:2}}><Text style={{fontSize:13,color:c.muted,fontWeight:'600',paddingTop:6,paddingBottom:4}}>{group}</Text>{items.slice(0,limit).map(item=><NoticeRow key={item.id} item={item}/>)}{!firstPaint&&items.length>limit?<Button title={'Ver mais ('+(items.length-limit)+')'} secondary onPress={()=>setLimits(old=>({...old,[group]:limit+20}))}/>:null}</View>;})}
 </View>;}
/** 0.3.327 (Pedro: "aqui esta tudo meio apertado"): espacos da janela do sino no computador em px reais da escala da tela
 * (a camada do site encolhe paddings/gaps numericos destas telas em ~28%); mais respiro em volta de cada aviso. */
const S=(n:number)=>dpx(n) as any;
/** 0.3.271 (site, aprovado por foto): janela pequena saindo do sino, uma linha por aviso, acoes so ao passar o mouse,
 * filtros com icone de traco (sem emoji), rodape discreto. O celular segue com a janela de antes. */
function DeskRow({item,first=false}:{item:Notice;first?:boolean}){const c=useTheme(),n=useNotifications(),area=noticeArea(item),st=AREA_STYLE[area]||AREA_STYLE.Outros,unread=item.state==='unread',dose=item.category==='capsule'?capsuleDoseOfNotice(item.id):null;
 async function take(){if(!dose)return;await capsuleStore(n.api).take(dose.planId,dose.day,dose.time,true);await n.clear(item);}
 async function snooze(){const at=new Date(Date.now()+30*60e3);try{await n.api.saveEntity({kind:'reminder',title:item.title,content:'',area:'Pessoal',privacy:'private',state:'active',tags:[],data:{remind_at:at.toISOString(),message:item.body||'',location:''}});await n.clear(item);}catch{/* fica como estava */}}
 return <HoverPressable testID={'desk-notice-'+item.id} accessibilityRole="button" accessibilityLabel={'Abrir: '+item.title} onPress={()=>n.open(item)} style={({hovered}:any)=>({flexDirection:'row',gap:S(14),paddingTop:S(14),paddingBottom:S(14),paddingLeft:S(24),paddingRight:S(20),backgroundColor:hovered?c.input:'transparent'})}>{({hovered}:any)=><>
  {/* separador fino entre avisos, alinhado com o texto */}{!first?<View style={{position:'absolute',top:0,right:S(20),left:S(74),height:1,backgroundColor:c.line,opacity:.6}}/>:null}
  {unread?<View style={{position:'absolute',left:S(9),top:S(29),width:7,height:7,borderRadius:4,backgroundColor:c.accent}}/>:null}
  <View style={{width:36,height:36,borderRadius:11,backgroundColor:st.color+'26',alignItems:'center',justifyContent:'center'}}><Icon name={((st as {glyph?:string}).glyph||'bell') as IconName} size={17} color={st.color}/></View>
  <View style={{flex:1,minWidth:0,gap:S(3),justifyContent:'center'}}>
   <Text numberOfLines={1} style={{color:c.text,fontSize:14,fontWeight:unread?'600':'500'}}>{item.title}</Text>
   {item.body?<Text numberOfLines={2} style={{color:c.muted,fontSize:12,lineHeight:18}}>{item.body}</Text>:null}
   {dose&&unread?<View style={{flexDirection:'row',gap:S(8),marginTop:S(10)}}><Pressable accessibilityRole="button" accessibilityLabel={'Tomei '+item.title} onPress={()=>void take()} style={({pressed}:any)=>({paddingHorizontal:S(14),paddingVertical:S(6),borderRadius:9,backgroundColor:c.accent,transform:[{scale:pressed?.97:1}]})}><Text style={{color:c.onAccent,fontSize:12,fontWeight:'600'}}>Tomei</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={'Adiar 30 minutos: '+item.title} onPress={()=>void snooze()} style={({hovered,pressed}:any)=>({paddingHorizontal:S(14),paddingVertical:S(6),borderRadius:9,borderWidth:1,borderColor:c.line,backgroundColor:hovered?c.input:'transparent',transform:[{scale:pressed?.97:1}]})}><Text style={{color:c.text,fontSize:12}}>Adiar 30 min</Text></Pressable></View>:null}
  </View>
  {hovered?<View style={{flexDirection:'row',gap:4,alignSelf:'flex-start'}}>{unread?<Pressable accessibilityLabel={'Marcar como lida: '+item.title} onPress={()=>void n.read(item)} style={{width:26,height:26,borderRadius:7,backgroundColor:c.line,alignItems:'center',justifyContent:'center'}}><Icon name="check" size={13} color={c.muted}/></Pressable>:null}<Pressable accessibilityLabel={'Limpar notificação: '+item.title} onPress={()=>void n.clear(item)} style={{width:26,height:26,borderRadius:7,backgroundColor:c.line,alignItems:'center',justifyContent:'center'}}><Icon name="close" size={13} color={c.muted}/></Pressable></View>
   :<Text style={{color:c.muted,fontSize:12,marginTop:S(2)}}>{relativeTime(item.created_at)}</Text>}
 </>}</HoverPressable>;}
function DeskList(){const n=useNotifications(),c=useTheme(),digest=useDigest(),[tab,setTab]=useState<'all'|'unread'>('all'),[area,setArea]=useState('all');
 const areas=useMemo(()=>{const m=new Map<string,number>();for(const i of n.items){const a=noticeArea(i);m.set(a,(m.get(a)||0)+1);}return [...m.entries()].sort((a,b)=>b[1]-a[1]);},[n.items]);
 const shown=n.items.filter(i=>(tab==='all'||i.state==='unread')&&(area==='all'||noticeArea(i)===area));
 const groups=new Map<string,Notice[]>();for(const i of shown){const k=noticeDateGroup(i.created_at);if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(i);}
 return <View>
  <View style={{flexDirection:'row',gap:S(6),paddingHorizontal:S(22)}}>{([['all','Todas',n.items.length],['unread','Não lidas',n.unread]] as const).map(([k,l,cnt])=><Pressable key={k} accessibilityRole="tab" accessibilityState={{selected:tab===k}} onPress={()=>setTab(k)} style={{paddingHorizontal:S(12),paddingVertical:S(7),borderRadius:9,backgroundColor:tab===k?c.accentSoft:'transparent'}}><Text style={{color:tab===k?c.text:c.muted,fontSize:13,fontWeight:tab===k?'600':'400'}}>{l} <Text style={{color:c.muted,fontWeight:'400'}}>{cnt}</Text></Text></Pressable>)}</View>
  {areas.length>1?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:S(8),paddingHorizontal:S(22),paddingTop:S(14),paddingBottom:S(18)}}>
   <Pressable accessibilityRole="button" accessibilityState={{selected:area==='all'}} onPress={()=>setArea('all')} style={{paddingHorizontal:S(13),paddingVertical:S(5),borderRadius:99,justifyContent:'center',borderWidth:1,borderColor:area==='all'?c.accent:c.line,backgroundColor:area==='all'?c.accentSoft:'transparent'}}><Text style={{color:area==='all'?c.accent:c.muted,fontSize:12}}>Tudo</Text></Pressable>
   {areas.map(([a,cnt])=>{const st=AREA_STYLE[a]||AREA_STYLE.Outros;return <Pressable key={a} accessibilityRole="button" accessibilityState={{selected:area===a}} onPress={()=>setArea(a)} style={{flexDirection:'row',alignItems:'center',gap:S(6),paddingLeft:S(5),paddingRight:S(12),paddingVertical:S(4),borderRadius:99,borderWidth:1,borderColor:area===a?c.accent:c.line,backgroundColor:area===a?c.accentSoft:'transparent'}}><View style={{width:20,height:20,borderRadius:6,backgroundColor:st.color+'26',alignItems:'center',justifyContent:'center'}}><Icon name={((st as {glyph?:string}).glyph||'bell') as IconName} size={12} color={st.color}/></View><Text style={{color:area===a?c.accent:c.muted,fontSize:12}}>{AREA_SHORT[a]||a} {cnt}</Text></Pressable>;})}
  </ScrollView>:<View style={{height:S(14)}}/>}
  <View style={{height:1,backgroundColor:c.line}}/>
  {digest.slice(0,1).map(d=><Pressable key={d.id} accessibilityRole="button" accessibilityLabel={d.title} onPress={()=>n.open({id:d.id,title:d.title,body:d.text,state:'read',created_at:new Date().toISOString(),category:d.category,entity_id:d.entity_id})} style={{flexDirection:'row',alignItems:'center',gap:S(12),marginHorizontal:S(18),marginTop:S(16),marginBottom:S(4),paddingHorizontal:S(14),paddingVertical:S(12),borderRadius:14,borderWidth:1,borderColor:d.color+'55',backgroundColor:d.color+'14'}}>
   <View style={{width:30,height:30,borderRadius:9,backgroundColor:d.color+'26',alignItems:'center',justifyContent:'center'}}><Icon name={(((d as {glyph?:string}).glyph)||'star') as IconName} size={15} color={d.color}/></View>
   <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={{color:c.text,fontWeight:'600',fontSize:13}}>{d.title}</Text><Text numberOfLines={1} style={{color:c.muted,fontSize:12}}>{d.text}</Text></View>
   <View style={{paddingHorizontal:S(14),paddingVertical:S(6),borderRadius:9,backgroundColor:c.accent}}><Text style={{color:c.onAccent,fontSize:12,fontWeight:'600'}}>Ver</Text></View>
  </Pressable>)}
  {n.error?<View style={{padding:14}}><ErrorBanner text={n.error} onRetry={()=>void n.refresh()}/></View>:null}
  {!shown.length?<Text style={{color:c.muted,textAlign:'center',paddingVertical:28}}>{n.loading?'Carregando…':tab==='unread'?'Nada sem ler.':'Tudo em dia. Sem notificações.'}</Text>:null}
  {[...groups].map(([g,items])=><View key={g}><Text style={{color:c.muted,fontSize:12,fontWeight:'600',letterSpacing:.3,paddingHorizontal:S(24),paddingTop:S(20),paddingBottom:S(4)}}>{g}</Text>{items.slice(0,30).map((i,k)=><DeskRow key={i.id} item={i} first={k===0}/>)}</View>)}
 </View>;}
/** O número aparece crescendo de 0 a 1 em vez de surgir seco. Depois disso, quando a contagem muda, só o número troca (sem pulo). */
function BellBadge({count,desk=false}:{count:number;desk?:boolean}){const c=useTheme(),reduced=useReducedMotion(),scale=useRef(new Animated.Value(count>0?1:0)).current,last=useRef(count),[shown,setShown]=useState(count);
 useEffect(()=>{const prev=last.current;last.current=count;if(count>0)setShown(count);
  if(reduced){scale.setValue(count>0?1:0);if(!count)setShown(0);return;}
  if(prev===0&&count>0){scale.setValue(0);Animated.spring(scale,{toValue:1,useNativeDriver:true,friction:5,tension:140}).start();}
  else if(count===0&&prev>0)Animated.timing(scale,{toValue:0,duration:160,easing:MOTION_EASE,useNativeDriver:true}).start(()=>setShown(0));
 },[count,reduced,scale]);
 if(!shown&&!count)return null;
 return <Animated.View pointerEvents="none" style={{position:'absolute',right:desk?3:0,top:desk?9:0,minWidth:18,height:18,borderRadius:9,backgroundColor:c.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:3,...(desk?{borderWidth:2,borderColor:c.bg,minWidth:20,height:20,borderRadius:10}:null),transform:[{scale}]}}><Text style={{color:c.onAccent,fontSize:10,fontWeight:'600'}}>{shown>99?'99+':shown}</Text></Animated.View>;}
export function NotificationBell({onViewAll}:{onViewAll:()=>void}){
 const c=useTheme(),n=useNotifications(),screen=useWindowDimensions(),insets=useSafeAreaInsets();
 const [open,setOpen]=useState(false),[anchor,setAnchor]=useState<BellAnchor>({x:screen.width-66,y:insets.top+20,width:44,height:44});
 const reduced=useReducedMotion();
 const bell=useRef<View|null>(null),motion=useRef(new Animated.Value(0)).current,closing=useRef(false),opening=useRef(false),anchorKnown=useRef(false),[settled,setSettled]=useState(false);
 // Posição do sino medida antes (ao desenhar), não no toque: o painel abre no mesmo quadro.
 function measureBell(){bell.current?.measureInWindow((x,y,width,height)=>{if(width>0){setAnchor({x,y,width,height});anchorKnown.current=true;}});}
 const desk=Platform.OS==='web'&&screen.width>=900;
 const layout=desk?(()=>{const top=anchor.y+anchor.height+8,width=Math.round(420*uiScale()) /* 07/11/2026 (revisao): 520 era largo demais para a lista de avisos */;return {left:Math.max(16,anchor.x+anchor.width-width),top,width,maxHeight:Math.max(1,Math.min(640,screen.height-top-24))} as any;})():notificationPopoverLayout(anchor,screen,insets);
 // A busca de avisos novos espera a animação terminar, para não disputar com ela.
 // A lista já vem pronta (atualizada a cada minuto por trás); ao abrir só busca de novo se estiver velha.
 function reveal(){closing.current=false;motion.stopAnimation();motion.setValue(0);setSettled(false);setOpen(true);if(Date.now()-lastRefreshAt>90000)setTimeout(()=>{void n.refresh();},420);}
 function show(){if(opening.current)return;opening.current=true;if(anchorKnown.current||!bell.current)reveal();else bell.current.measureInWindow((x,y,width,height)=>{setAnchor({x,y,width,height});anchorKnown.current=true;reveal();});}
 function close(after?:()=>void){if(closing.current)return;closing.current=true;motion.stopAnimation();Animated.timing(motion,{toValue:0,duration:reduced?0:220,easing:MOTION_EASE,useNativeDriver:true}).start(({finished})=>{if(finished){setOpen(false);closing.current=false;opening.current=false;after?.();}});}
 function animateShown(){if(closing.current)return;Animated.timing(motion,{toValue:1,duration:reduced?0:240,easing:MOTION_EASE,useNativeDriver:true}).start(()=>setSettled(true));}
 useEffect(()=>()=>motion.stopAnimation(),[motion]);
 useEffect(()=>{if(open)bell.current?.measureInWindow((x,y,width,height)=>setAnchor({x,y,width,height}));},[screen.width,screen.height,open]);
 return <><View ref={bell} collapsable={false} onLayout={measureBell}>
  <Pressable testID="notification-bell" accessibilityRole="button" accessibilityLabel={'Notificações: '+n.unread+' não lidas'} onPress={show} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}>{/* 0.3.325 (Pedro: "o sino nao esta na mesma linha"): no computador o numero fica no ombro do sino (antes ficava acima dele e
   o conjunto parecia mais alto que a foto e a busca); o sino fica no centro da barra */}<Icon name="bell" color={c.text}/><BellBadge count={n.unread} desk={desk}/></Pressable>
 </View><Modal visible={open} transparent hardwareAccelerated statusBarTranslucent navigationBarTranslucent animationType="none" onShow={animateShown} onRequestClose={()=>close()}>
  <View style={{flex:1}}>
   {/* Keep one stable dim layer for the whole native window lifetime. Only the card animates. */}
   <Animated.View testID="notification-backdrop" style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:desk?'transparent':PALETTE.black+'44',opacity:motion}}>{/* 0.3.281 (site): sem escurecer o fundo e sem a maozinha fora da janela; o clique fora so fecha */}<Pressable accessibilityLabel="Fechar notificações" onPress={()=>close()} style={{flex:1,...(desk?{cursor:'default'}:null)} as any}/></Animated.View>
   <Animated.View testID="notification-popover" accessibilityViewIsModal style={{position:'absolute',...layout,backgroundColor:c.bg,borderWidth:1,borderColor:c.line,borderRadius:desk?16:20,padding:desk?0:14,gap:desk?0:10,overflow:'hidden',elevation:14,shadowColor:PALETTE.black,shadowOffset:{width:0,height:5},shadowOpacity:.18,shadowRadius:16,opacity:motion,transform:[{translateX:motion.interpolate({inputRange:[0,1],outputRange:[(anchor.x+anchor.width/2-(layout.left+layout.width/2))*.14,0]})},{translateY:motion.interpolate({inputRange:[0,1],outputRange:[-(layout.height/2)*.14,0]})},{scale:motion.interpolate({inputRange:[0,1],outputRange:[.86,1]})}]}}>
    {desk?<>
     <View style={{flexDirection:'row',alignItems:'center',gap:S(8),paddingLeft:S(24),paddingRight:S(16),paddingTop:S(20),paddingBottom:S(14)}}><Text style={{flex:1,fontSize:18,fontWeight:'600',color:c.text}}>Notificações</Text>{/* 09/11/2026 (Pedro: "tirar o marcar tudo como lido e deixar limpar notificacoes") */}{n.items.length>0?<Pressable accessibilityRole="button" accessibilityLabel="Limpar todas as notificações" onPress={()=>appAlert('Limpar notificações?','Somente os avisos serão removidos. Seus eventos e registros permanecem.',[{text:'Cancelar',style:'cancel'},{text:'Limpar',onPress:()=>void n.clearAll()}])} style={({hovered}:any)=>({paddingHorizontal:S(10),paddingVertical:S(6),borderRadius:8,backgroundColor:hovered?c.input:'transparent'})}><Text style={{color:c.accent,fontSize:12}}>Limpar notificações</Text></Pressable>:null}<Pressable accessibilityRole="button" accessibilityLabel="Fechar notificações" onPress={()=>close()} style={({hovered}:any)=>({width:30,height:30,borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:hovered?c.input:'transparent'})}><Icon name="close" size={16} color={c.muted}/></Pressable></View>
     <ScrollView keyboardShouldPersistTaps="handled" style={{flexGrow:0,flexShrink:1}} contentContainerStyle={{paddingBottom:S(10)}}><DeskList/></ScrollView>
     <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:S(24),paddingVertical:S(15),borderTopWidth:1,borderColor:c.line}}>
      <Pressable accessibilityRole="link" onPress={()=>close(onViewAll)}><Text style={{color:c.accent,fontSize:12}}>Ver todas as notificações</Text></Pressable>
      {n.items.some(i=>i.state!=='unread')?<Pressable accessibilityRole="button" onPress={()=>{for(const i of n.items.filter(x=>x.state!=='unread'))void n.clear(i);}}><Text style={{color:c.muted,fontSize:12}}>Limpar as lidas</Text></Pressable>:null}
     </View>
    </>:<>
    <View style={{flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,fontSize:20,fontWeight:'600',color:c.text}}>Notificações</Text><IconButton name="close" label="Fechar notificações" onPress={()=>close()}/></View>
    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled decelerationRate="fast" style={{flex:1}} contentContainerStyle={{paddingBottom:10}}><NotificationList/></ScrollView>
    {n.items.length?<View style={{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:4}}>
     <Pressable accessibilityRole="button" accessibilityLabel="Limpar todas as notificações" onPress={()=>appAlert('Limpar notificações?','Somente os avisos serão removidos. Seus eventos e registros permanecem.',[{text:'Cancelar',style:'cancel'},{text:'Limpar',onPress:()=>void n.clearAll()}])} style={{minHeight:44,justifyContent:'center',flexShrink:0}}><Text numberOfLines={1} style={{color:c.muted,fontSize:12,padding:6}}>Limpar todas</Text></Pressable>
    </View>:null}
    <Button title="Ver todas as notificações" onPress={()=>close(onViewAll)}/>
    </>}
   </Animated.View>
  </View>
 </Modal></>;
}
function DeskFilter({on,label,count,icon,color,onPress}:{on:boolean;label:string;count:number;icon:IconName;color?:string;onPress:()=>void}){const c=useTheme();return <Pressable accessibilityRole="tab" accessibilityState={{selected:on}} onPress={onPress} style={({hovered}:any)=>({flexDirection:'row',alignItems:'center',gap:10,height:36,paddingHorizontal:12,borderRadius:9,backgroundColor:on?c.accentSoft:hovered?c.input:'transparent'})}>
  <Icon name={icon} size={15} color={color||(on?c.accent:c.muted)}/><Text numberOfLines={1} style={{flex:1,fontSize:13,color:on?c.text:c.muted,fontWeight:on?'600':'500'}}>{label}</Text><Text style={{fontSize:12,color:c.muted,fontVariant:['tabular-nums']}}>{count}</Text></Pressable>;}
function DeskPageBtn({label,onPress}:{label:string;onPress:()=>void}){const c=useTheme();return <Pressable accessibilityRole="button" onPress={onPress} style={({hovered}:any)=>({height:32,paddingHorizontal:14,borderRadius:9,borderWidth:1,borderColor:c.line,justifyContent:'center',backgroundColor:hovered?c.input:'transparent'})}><Text style={{fontSize:13,color:c.text,fontWeight:'600'}}>{label}</Text></Pressable>;}
/** 03/11/2026 (Pedro: "arrumar a diagramacao da tela de todas as notificacoes... profissional e premium"; desenho aprovado
 * no quadro): no computador a tela inteira tem os filtros numa coluna a esquerda (Todas / Nao lidas e cada area com a
 * contagem) e a lista em cartoes por dia (Hoje, Ontem...). Cada linha e a mesma da janela do sino (DeskRow): acoes ao
 * passar o mouse, Tomei/Em 30 min nas doses. O celular continua com a lista de antes. */
export function DeskNotificationsPage(){const n=useNotifications(),c=useTheme(),[tab,setTab]=useState<'all'|'unread'>('all'),[area,setArea]=useState('all');
 const areas=useMemo(()=>{const m=new Map<string,number>();for(const i of n.items){const a=noticeArea(i);m.set(a,(m.get(a)||0)+1);}return [...m.entries()].sort((a,b)=>b[1]-a[1]);},[n.items]);
 const shown=n.items.filter(i=>(tab==='all'||i.state==='unread')&&(area==='all'||noticeArea(i)===area));
 const groups=new Map<string,Notice[]>();for(const i of shown){const k=noticeDateGroup(i.created_at);if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(i);}
 const read=n.items.filter(i=>i.state!=='unread');
 const card={backgroundColor:c.surface,borderRadius:16,borderWidth:1,borderColor:c.line,overflow:'hidden',boxShadow:'0 1px 2px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.12)'} as any;
 return <View testID="desk-notifications-page" style={{flexDirection:'row',alignItems:'flex-start',gap:28,width:'100%',maxWidth:1100,alignSelf:'center'} as any}>
  <View accessibilityRole="tablist" accessibilityLabel="Filtrar notificações" style={{width:220,gap:2}}>
   <DeskFilter on={tab==='all'&&area==='all'} label="Todas" count={n.items.length} icon="bell" onPress={()=>{setTab('all');setArea('all');}}/>
   <DeskFilter on={tab==='unread'&&area==='all'} label="Não lidas" count={n.unread} icon="check" onPress={()=>{setTab('unread');setArea('all');}}/>
   {areas.length?<View style={{height:1,backgroundColor:c.line,marginVertical:8,marginHorizontal:4}}/>:null}
   {areas.map(([a,cnt])=>{const st=AREA_STYLE[a]||AREA_STYLE.Outros;return <DeskFilter key={a} on={area===a} label={AREA_SHORT[a]||a} count={cnt} icon={((st as {glyph?:string}).glyph||'bell') as IconName} color={st.color} onPress={()=>{setTab('all');setArea(area===a?'all':a);}}/> /* 03/11/2026: a contagem da area e de todas; o filtro Nao lidas nao fica escondido */;})}
  </View>
  <View style={{flex:1,minWidth:0,gap:14}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text style={{flex:1,fontSize:13,color:c.muted}}>{n.unread?(n.unread===1?'1 não lida':n.unread+' não lidas')+' · ':''}{n.items.length===1?'1 no total':n.items.length+' no total'}</Text>{n.items.length?<DeskPageBtn label="Limpar notificações" onPress={()=>appAlert('Limpar notificações?','Somente os avisos serão removidos. Seus eventos e registros permanecem.',[{text:'Cancelar',style:'cancel'},{text:'Limpar',onPress:()=>void n.clearAll()}])}/>:null}</View>
   {n.error?<ErrorBanner text={n.error} onRetry={()=>void n.refresh()}/>:null}
   {!shown.length?<View style={[card,{paddingVertical:40,alignItems:'center',gap:6}]}><Icon name="bell" size={22} color={c.muted}/><Text style={{color:c.text,fontWeight:'600'}}>{n.loading?'Carregando…':tab==='unread'?'Nada sem ler':'Tudo em dia'}</Text>{!n.loading?<Text style={{color:c.muted,fontSize:13}}>{tab==='unread'?'Você já viu tudo o que chegou.':'Sem notificações por aqui.'}</Text>:null}</View>:null}
   {[...groups].map(([g,items])=><View key={g} style={card}><Text style={{color:c.muted,fontSize:12,fontWeight:'600',letterSpacing:.4,paddingHorizontal:18,paddingTop:14,paddingBottom:6}}>{g.toUpperCase()}</Text>{items.map((i,k)=><DeskRow key={i.id} item={i} first={k===0}/>)}</View>)}
  </View>
 </View>;}
