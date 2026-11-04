import {uiScale} from '../web/desktop-scale';
import React,{useContext,useRef} from 'react';
import {PresenceClosing} from './Presence';
import {useWebBackClose} from '../lib/web-panels';
import {PALETTE} from '../lib/palette';
import {Animated,Modal,Pressable,View} from 'react-native';
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
 return <Modal visible={mounted} transparent animationType="none" onRequestClose={onRequestClose}>
  <View testID="side-peek" style={{flex:1,flexDirection:'row'}} pointerEvents={visible?'auto':'none'}>
   <Animated.View style={{flex:1,opacity:progress}}><Pressable accessibilityLabel="Fechar painel" onPress={()=>onRequestClose?.({} as any)} style={{flex:1,backgroundColor:PALETTE.black+(peekDim||'59')}}/></Animated.View>
   <Animated.View testID="side-peek-panel" style={{...peekSize(peekWidth),height:'100%',backgroundColor:c.bg,borderLeftWidth:1,borderColor:c.line,shadowColor:PALETTE.black,shadowOpacity:0.35,shadowRadius:30,shadowOffset:{width:-8,height:0},opacity:progress,transform:[{translateX:progress.interpolate({inputRange:[0,1],outputRange:[40,0]})}]}}>
    <DialogContext.Provider value={true}>{visible?children:last.current}</DialogContext.Provider>
   </Animated.View>
  </View>
 </Modal>;
}
