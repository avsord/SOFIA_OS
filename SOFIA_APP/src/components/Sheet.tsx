import {useMotionPresence} from '../lib/motion';
import {PALETTE} from '../lib/palette';
import React,{useContext,useEffect,useRef,useState} from 'react';
import {PresenceClosing} from './Presence';
import {useWebBackClose} from '../lib/web-panels';
import {Animated,Keyboard,KeyboardAvoidingView,LayoutAnimation,Modal,Platform,Pressable,StyleSheet,useWindowDimensions,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../lib/theme';
import {DialogContext,isDesktopWidth,contentArea} from '../lib/desktop';
// 0.3.250: no computador a folha de baixo vira uma janela no centro (dialogo), como no Notion.
// 0.3.227: troca de janela sem piscar. Quando uma janela fecha para abrir outra (menu -> "Editar aportes"), a de
// baixo segura o fundo escuro ate a nova aparecer por cima, e a nova entra com o fundo ja escuro. Antes o fundo
// clareava e escurecia de novo entre as duas (o "pisca") e havia uma pausa de 230 ms.
let handoffUntil=0;const holders=new Set<()=>void>();
export function markSheetHandoff(ms=800){handoffUntil=Date.now()+ms;}
function releaseHolders(){const fns=[...holders];holders.clear();fns.forEach(f=>f());}
export function Sheet({visible:visibleProp,onClose,children,label='Fechar painel'}:{visible:boolean;onClose:()=>void;children:React.ReactNode;label?:string}){
 const visible=visibleProp&&!useContext(PresenceClosing);
 useWebBackClose(visible&&Platform.OS==='web'&&typeof window!=='undefined'&&window.innerWidth>=900,onClose);
 const c=useTheme(),insets=useSafeAreaInsets(),{height:windowHeight,width:windowWidth}=useWindowDimensions(),desktop=isDesktopWidth(windowWidth),[shown,setShown]=useState(false),[height,setHeight]=useState(0);
 // 0.3.167: no Android o teclado cobria os campos das folhas (o Modal translucido nao redimensiona
 // a janela, entao o KeyboardAvoidingView nao tinha efeito). Medimos o teclado e afastamos o painel.
 // 0.3.187: alguns aparelhos ja encolhem a janela quando o teclado abre, outros nao. Em vez de
 // empurrar sempre a altura inteira do teclado (o que deixava a folha cortada e flutuando com um vao),
 // medimos quanto o teclado REALMENTE cobre a area da folha e afastamos so isso.
 const rootRef=useRef<View>(null),kbTop=useRef(0);
 const [keyboard,setKeyboard]=useState(0),[kbOpen,setKbOpen]=useState(false),[rootH,setRootH]=useState(0);
 const smooth=()=>{try{LayoutAnimation.configureNext(LayoutAnimation.create(180,LayoutAnimation.Types.easeInEaseOut,LayoutAnimation.Properties.opacity));}catch{/* sem animacao neste aparelho */}};
 const measure=()=>{if(!kbTop.current){smooth();setKeyboard(0);return;}rootRef.current?.measureInWindow((_x,y,_w,h)=>{smooth();setKeyboard(Math.max(0,Math.round(y+h-kbTop.current)));});};
 useEffect(()=>{
  if(Platform.OS==='ios')return;
  const show=Keyboard.addListener('keyboardDidShow',e=>{kbTop.current=e.endCoordinates?.screenY||0;setKbOpen(true);measure();});
  const hide=Keyboard.addListener('keyboardDidHide',()=>{kbTop.current=0;smooth();setKbOpen(false);setKeyboard(0);});
  return()=>{show.remove();hide.remove();};
 },[]);
 const {mounted,progress,reduced}=useMotionPresence(visible,{enterReady:shown&&height>0,enterDuration:220,exitDuration:180}),last=useRef(children);
 const [hold,setHold]=useState(false),[darkFromStart,setDarkFromStart]=useState(false),wasVisible=useRef(visible);
 useEffect(()=>{
  const was=wasVisible.current;wasVisible.current=visible;
  if(was&&!visible&&Date.now()<handoffUntil){
   setHold(true);const release=()=>setHold(false);holders.add(release);
   const safety=setTimeout(()=>{holders.delete(release);setHold(false);},500);
   return()=>clearTimeout(safety);
  }
  if(!was&&visible&&Date.now()<handoffUntil){setDarkFromStart(true);return;}
  if(!visible)setDarkFromStart(false);
 },[visible]);
 useEffect(()=>{if(!mounted){setShown(false);setHeight(0);setAnchor(null);}},[mounted]);
 if(visible)last.current=children;
 // 0.3.263 (computador): a folha abre como janela flutuante PERTO de onde se clicou (menu), nao no centro da tela;
 // sem clique recente (atalho de teclado), continua no centro. No celular nada muda.
 const [anchor,setAnchor]=useState<{x:number;y:number}|null>(null);
 // 0.3.267: a posicao so e esquecida depois que a janela termina de sair (antes ela pulava para o centro ao fechar = piscada)
 useEffect(()=>{if(!visible)return;if(!desktop)return;const p=(globalThis as any).__sofiaPointer;setAnchor(p&&Date.now()-p.t<900?{x:p.x,y:p.y}:null);},[visible,desktop]);
 const PW=480,vw=windowWidth,vh=rootH||windowHeight,ph=Math.min(height||320,vh-32);
 // 0.3.328: a janela fica dentro da area do conteudo (nunca por cima da barra lateral); so quando foi aberta pela propria
 // barra lateral pode ficar sobre ela. Se nao couber ao lado do clique, centraliza no conteudo.
 const area=desktop?contentArea():null,inside=!!area&&!!anchor&&anchor.x>=area.left;
 const minL=inside?area!.left+16:16,maxL=inside?area!.right-PW-16:vw-PW-16;
 const anchoredLeft=anchor?(maxL<minL?(inside?area!.left+Math.max(0,(area!.right-area!.left-PW)/2):16):Math.max(minL,Math.min(anchor.x-PW/2,maxL))):0;
 const anchored=desktop&&anchor?{position:'absolute' as const,width:PW,left:anchoredLeft,top:anchor.y+12+ph<vh-16?anchor.y+12:Math.max(16,anchor.y-ph-12)}:null;
 return <Modal visible={mounted||hold} onShow={()=>{setShown(true);if(darkFromStart){handoffUntil=0;setTimeout(releaseHolders,40);}}} transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={()=>{if(visible)onClose();}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
 <Animated.View testID="sheet-backdrop" style={[StyleSheet.absoluteFill,{backgroundColor:anchor&&desktop?PALETTE.black+'22':PALETTE.black+'66',opacity:hold||darkFromStart?1:progress}]}><Pressable accessibilityLabel={label} style={{flex:1}} onPress={onClose}/></Animated.View>
 <View ref={rootRef} onLayout={e=>{setRootH(e.nativeEvent.layout.height);if(kbTop.current)measure();}} pointerEvents={visible?'box-none':'none'} style={desktop?(anchored?{flex:1}:{flex:1,justifyContent:'center',alignItems:'center',padding:32,...(area?{paddingLeft:area.left+32}:null)}):{flex:1,justifyContent:'flex-end',paddingTop:insets.top+16}}><Animated.View testID="sheet-panel" onLayout={event=>setHeight(event.nativeEvent.layout.height)} accessibilityViewIsModal style={desktop?{...(anchored||{width:'100%',maxWidth:560}),maxHeight:Math.round((rootH||windowHeight)*0.86),backgroundColor:c.surface,borderRadius:16,borderWidth:1,borderColor:c.line,padding:24,overflow:'scroll' as any,opacity:progress,transform:[{scale:progress.interpolate({inputRange:[0,1],outputRange:[reduced?1:0.97,1]})}],shadowColor:PALETTE.black,shadowOpacity:0.3,shadowRadius:28,shadowOffset:{width:0,height:10}}:{maxHeight:Math.max(220,(rootH||windowHeight)-keyboard-insets.top-24),backgroundColor:c.surface,borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,marginBottom:keyboard,paddingBottom:kbOpen?16:Math.max(28,insets.bottom+24),opacity:progress,transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[reduced?0:height+insets.bottom,0]})}]}}><DialogContext.Provider value={true}>{visible?children:last.current}</DialogContext.Provider></Animated.View></View>
 </KeyboardAvoidingView></Modal>;
}
