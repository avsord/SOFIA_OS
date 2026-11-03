import React, {useState} from 'react';
import {Pressable, type PressableProps} from 'react-native';
/** 0.3.351 (Pedro: "quando vou clicar no X, o X sai ou ticado"): no site, o Pressable perde o "hovered" assim que o mouse
 * entra num botao de dentro dele (o react-native-web encerra o hover do pai). Botoes que so aparecem ao passar o mouse
 * sumiam bem na hora do clique e o clique caia na linha. Aqui o hover vem do mouseenter/mouseleave da propria linha, que
 * nao dispara ao entrar num filho: os botoes ficam parados ate o mouse sair de verdade. */
export function HoverPressable({style, children, ...rest}: PressableProps) {
  const [hover, setHover] = useState(false);
  const st: any = typeof style === 'function' ? (s: any) => (style as any)({...s, hovered: hover}) : style;
  const ch: any = typeof children === 'function' ? (s: any) => (children as any)({...s, hovered: hover}) : children;
  return <Pressable {...rest} {...({onMouseEnter: () => setHover(true), onMouseOver: () => { if (!hover) setHover(true); }, onMouseMove: () => { if (!hover) setHover(true); }, onMouseLeave: () => setHover(false)} as any)} style={st}>{ch}</Pressable>;
}
