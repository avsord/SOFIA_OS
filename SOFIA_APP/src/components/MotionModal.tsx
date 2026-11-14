import {uiScale} from '../web/desktop-scale';
import React,{useContext,useLayoutEffect,useRef,useState} from 'react';
import {PresenceClosing} from './Presence';
import {useWebBackClose} from '../lib/web-panels';
import {PALETTE} from '../lib/palette';
import {Animated,Modal,Platform,Pressable,View} from 'react-native';
import {DialogContext,useDesktop,contentArea} from '../lib/desktop';
import type {ModalProps} from 'react-native';
import {useMotionPresence} from '../lib/motion';
import {useTheme} from '../lib/theme';
export function MotionModal({visible:visibleProp=true,children,transparent=false,peekWidth,peekDim,...props}:ModalProps&{peekWidth?:number;peekDim?:string}){
 const desktop=useDesktop(),visible=visibleProp&&!useContext(PresenceClosing);
 // 0.3.251 (computador): tela cheia do celular vira painel lateral (side peek, como no Notion): a tela de
 // tras continua visivel; clicar fora ou Esc fecha pelo mesmo caminho do voltar do Android.
 if(!transparent&&desktop)return <SidePeek {...props} peekWidth={peekWidth} peekDim={peekDim} visible={visible}>{children}</SidePeek>;
 if(!transparent)return <Modal {...props} visible={visible} animationType="none">{children}</Modal>;
 return <AnimatedTransparentModal {...props} visible={visible}>{children}</AnimatedTransparentModal>;
}
function AnimatedTransparentModal({visible=true,children,animationType:_animationType,...props}:ModalProps){
 const c=useTheme(),{mounted,progress,reduced}=useMotionPresence(!!visible),last=useRef(children);
 if(visible)last.current=children;
 return <Modal {...props} visible={mounted} transparent animationType="none"><Animated.View pointerEvents={visible?'auto':'none'} style={{flex:1,backgroundColor:'transparent',opacity:progress}}>{visible?children:last.current}</Animated.View></Modal>;
}

/** 04/11/2026 (print do Pedro: "Editar tarefa" passando da borda da tela): a largura em pixels era multiplicada pela escala do
 * site duas vezes (aqui e pela camada do computador). Agora vira porcentagem da janela, que a camada nao altera, e nunca passa
 * da area de conteudo; o painel corta o que sobrar. */
function peekSize(peekWidth?: number): any {
 if (typeof window === 'undefined' || !window.innerWidth) return peekWidth ? {width: peekWidth, maxWidth: '92%'} : {width: '60%'};
 const W = window.innerWidth, area = Math.max(320, W - (contentArea()?.left || 0)), s = uiScale();
 const px = peekWidth ? Math.min(peekWidth * s, area, W * 0.92) : Math.min(area, Math.max(Math.min(560 * s, area), Math.min(860 * s, W * 0.6)));
 return {width: (px / W * 100).toFixed(3) + '%', maxWidth: '100%', overflow: 'hidden'};
}
function SidePeek({visible=true,children,onRequestClose,peekWidth,peekDim}:ModalProps&{peekWidth?:number;peekDim?:string}){
 useWebBackClose(!!visible,onRequestClose?()=>onRequestClose({} as any):undefined);
 const c=useTheme(),{mounted,progress}=useMotionPresence(!!visible),last=useRef(children);
 if(visible)last.current=children;
 // 05/11/2026 (Pedro: "a janela entra da direita e sai com corte seco"): varias telas tiram o painel de uma vez ao fechar (sem
 // passar visible=false); no site, antes de sumir, deixamos uma copia dele deslizando para fora, como a entrada
 const rootEl=useRef<any>(null),showing=useRef(false);showing.current=!!visible;
 useLayoutEffect(()=>()=>{if(Platform.OS!=='web'||!showing.current||typeof document==='undefined')return;const el=rootEl.current;if(!el?.cloneNode)return;
  try{const ghost=el.cloneNode(true) as HTMLElement;Object.assign(ghost.style,{position:'fixed',left:'0',top:'0',width:'100vw',height:'100vh',zIndex:'2147483000',pointerEvents:'none'});document.body.appendChild(ghost);
   const panel=ghost.querySelector('[data-testid="side-peek-panel"]') as HTMLElement|null;const dim=ghost.firstElementChild as HTMLElement|null;
   panel?.animate([{transform:'translateX(0px)',opacity:1},{transform:'translateX(40px)',opacity:0}],{duration:240,easing:'cubic-bezier(0.4,0,1,1)',fill:'forwards'});
   if(dim&&dim!==panel)dim.animate([{opacity:1},{opacity:0}],{duration:240,easing:'ease-out',fill:'forwards'});
   setTimeout(()=>ghost.remove(),280);}catch{/* sem animacao */}},[]);
 // 14/11/2026 (Pedro: "a tela lateral nao tem opcao de escalar, abrir mais"): como no Notion, a borda esquerda do painel
 // estica arrastando (360 px ate 96% da janela); a largura fica lembrada neste navegador. Dois cliques na borda voltam ao padrao.
 const wKey='sofia.peek.w.'+(peekWidth||'d');
 const [userW,setUserW]=useState<number|null>(()=>{try{const v=Number((globalThis as any).localStorage?.getItem(wKey));return v>0?v:null;}catch{return null;}});
 const [resizing,setResizing]=useState(false);
 const panelStyle=():any=>{if(!userW||typeof window==='undefined'||!window.innerWidth)return peekSize(peekWidth);const W=window.innerWidth,px=Math.max(Math.min(360,W),Math.min(userW,W*0.96));return {width:(px/W*100).toFixed(3)+'%',maxWidth:'100%',overflow:'hidden'};};
 const startResize=(e:any)=>{if(Platform.OS!=='web')return;e.preventDefault?.();e.stopPropagation?.();setResizing(true);let last=userW;
  const mv=(ev:PointerEvent)=>{const W=window.innerWidth;last=Math.round(Math.max(Math.min(360,W),Math.min(W*0.96,W-ev.clientX)));setUserW(last);};
  const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);setResizing(false);try{if(last)localStorage.setItem(wKey,String(last));}catch{/* sem memoria */}};
  window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);};
 const resetW=()=>{setUserW(null);try{localStorage.removeItem(wKey);}catch{/* sem memoria */}};
 const edge=Platform.OS==='web'?React.createElement('div',{'data-testid':'side-peek-resize',role:'separator','aria-orientation':'vertical','aria-label':'Arraste para mudar a largura do painel',title:'Arraste para mudar a largura · dois cliques volta ao padrão',onPointerDown:startResize,onDoubleClick:resetW,
  style:{position:'absolute',left:0,top:0,bottom:0,width:7,cursor:'ew-resize',zIndex:30,background:resizing?c.accent:'transparent',opacity:resizing?0.6:1,transition:'background .12s'}}):null;
 return <Modal visible={mounted} transparent animationType="none" onRequestClose={onRequestClose}>
  <View ref={rootEl} testID="side-peek" style={{flex:1,flexDirection:'row'}} pointerEvents={visible?'auto':'none'}>
   <Animated.View style={{flex:1,opacity:progress}}><Pressable accessibilityLabel="Fechar painel" onPress={()=>onRequestClose?.({} as any)} style={{flex:1,backgroundColor:PALETTE.black+(peekDim||'59')}}/></Animated.View>
   <Animated.View testID="side-peek-panel" style={{...panelStyle(),height:'100%',backgroundColor:c.bg,borderLeftWidth:1,borderColor:c.line,shadowColor:PALETTE.black,shadowOpacity:0.35,shadowRadius:30,shadowOffset:{width:-8,height:0},opacity:progress,transform:[{translateX:progress.interpolate({inputRange:[0,1],outputRange:[40,0]})}]}}>
    <DialogContext.Provider value={true}>{visible?children:last.current}</DialogContext.Provider>{edge}
   </Animated.View>
  </View>
 </Modal>;
}
