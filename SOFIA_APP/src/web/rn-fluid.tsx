// 0.3.278: camada da moldura do site (DesktopShell, DesktopPages). Ela ja usa tamanhos de computador; aqui so entra
// o fator que acompanha a tela (desktop-scale.ts), para a lateral e a barra de cima crescerem junto com as telas.
import React,{forwardRef} from 'react';
// @ts-ignore - o react-native-web nao traz tipos; esta camada so roda no site
import * as RNW from 'react-native-web';
import {fluidStyle} from './desktop-scale';
// @ts-ignore - idem
export * from 'react-native-web';
const flat=(style:any)=>RNW.StyleSheet.flatten(style);
// 03/11/2026: igual a rn-desktop - o react-native-web descarta animationKeyframes em estilo solto (inline); a animacao
// vai num StyleSheet.create separado e o resto continua escalado (antes a entrada suave do Inicio nao rodava no site).
const ANIM_KEYS=['animationKeyframes','animationDuration','animationDelay','animationTimingFunction','animationIterationCount','animationFillMode','animationDirection','animationPlayState'];
const animCache=new Map<string,any>();
const fl=(style:any)=>{if(!style)return style;const f=flat(style);if(!f||f.animationKeyframes==null)return fluidStyle(f);
 const rest:any={...f},anim:any={};for(const k of ANIM_KEYS)if(k in rest){anim[k]=rest[k];delete rest[k];}
 const key=JSON.stringify(anim);let a=animCache.get(key);if(!a){a=RNW.StyleSheet.create({a:anim}).a;animCache.set(key,a);}
 return [fluidStyle(rest),a];};
const flPress=(style:any)=>typeof style==='function'?(state:any)=>fl(style(state)):fl(style);
function wrap(Base:any,name:string){
 const W=forwardRef(function Fluid(props:any,ref){
  const next:any={...props,ref};
  if('style' in props)next.style=name==='Pressable'?flPress(props.style):fl(props.style);
  if(props.contentContainerStyle)next.contentContainerStyle=fl(props.contentContainerStyle);
  return <Base {...next}/>;
 });
 (W as any).displayName=name;
 for(const k of Object.keys(Base))if(!(k in W))(W as any)[k]=Base[k];
 return W as any;
}
export const View=wrap(RNW.View,'View');
export const Text=wrap(RNW.Text,'Text');
export const TextInput=wrap(RNW.TextInput,'TextInput');
export const Pressable=wrap(RNW.Pressable,'Pressable');
export const ScrollView=wrap(RNW.ScrollView,'ScrollView');
export const Image=wrap(RNW.Image,'Image');
