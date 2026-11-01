// 0.3.253: camada de computador do react-native para o site. So no navegador (metro.config.js troca
// 'react-native' por este arquivo nas telas do app). No celular este arquivo nao existe no pacote.
// - Com a tela larga (>= 1024 px), todo estilo passa pela escala de computador (desktop-scale.ts).
// - Listas e areas de rolagem verticais rolam na largura toda e centralizam o conteudo na largura
//   de leitura da regiao (ContentWidth), em vez de a caixa de rolagem ficar presa numa coluna.
// - Com a tela estreita nada muda: os componentes sao os mesmos do react-native-web.
import React,{forwardRef,useContext} from 'react';
// @ts-ignore - o react-native-web nao traz tipos; esta camada so roda no site
import * as RNW from 'react-native-web';
import {scaleStyle} from './desktop-scale';
import {ContentWidth} from '../lib/content-width';

// @ts-ignore - idem
export * from 'react-native-web';

const MIN=1024;
let desktop=false;
try{
 const read=()=>{const w=RNW.Dimensions.get('window').width;desktop=Number.isFinite(w)&&w>=MIN;};
 read();RNW.Dimensions.addEventListener('change',read);
}catch{/* sem janela (testes) */}
export function isDesktopScale(){return desktop;}

const flat=(style:any)=>RNW.StyleSheet.flatten(style);
function scaled(style:any){if(!desktop||!style)return style;return scaleStyle(flat(style));}
function scaledPressable(style:any){return typeof style==='function'?(state:any)=>scaled(style(state)):scaled(style);}

function wrap<P>(Base:any,name:string,extra?:(props:any,max:number|undefined)=>any){
 const W=forwardRef<any,P>(function Desktop(props:any,ref){
  const max=useContext(ContentWidth);
  if(!desktop)return <Base {...props} ref={ref}/>;
  const next:any={...props,ref};
  if('style' in props)next.style=name==='Pressable'||name==='TouchableOpacity'?scaledPressable(props.style):scaled(props.style);
  if(props.contentContainerStyle)next.contentContainerStyle=scaled(props.contentContainerStyle);
  if(props.columnWrapperStyle)next.columnWrapperStyle=scaled(props.columnWrapperStyle);
  if(extra)Object.assign(next,extra(next,max));
  return <Base {...next}/>;
 });
 (W as any).displayName=name;
 for(const k of Object.keys(Base))if(!(k in W))(W as any)[k]=Base[k];
 return W as any;
}
/** Rolagem vertical: conteudo centralizado na largura de leitura (a barra fica na borda da regiao). */
// 0.3.276 (padrao do site): nas telas de app o conteudo fica na largura maxima, mas encostado a esquerda (a mesma linha
// do titulo); centralizado so no Inicio (pedido do Pedro: nao mexer) e na Conversa (coluna estreita de leitura).
const centered=(p:any,max:number|undefined)=>p.horizontal||!max?{}:{contentContainerStyle:[p.contentContainerStyle,{width:'100%',maxWidth:max,alignSelf:'center'}]};

export const View=wrap<any>(RNW.View,'View');
export const Text=wrap<any>(RNW.Text,'Text');
export const TextInput=wrap<any>(RNW.TextInput,'TextInput');
export const Image=wrap<any>(RNW.Image,'Image');
export const Pressable=wrap<any>(RNW.Pressable,'Pressable');
export const TouchableOpacity=wrap<any>(RNW.TouchableOpacity,'TouchableOpacity');
export const KeyboardAvoidingView=wrap<any>(RNW.KeyboardAvoidingView,'KeyboardAvoidingView');
export const SafeAreaView=wrap<any>(RNW.SafeAreaView,'SafeAreaView');
export const ScrollView=wrap<any>(RNW.ScrollView,'ScrollView',centered);
export const FlatList=wrap<any>(RNW.FlatList,'FlatList',centered);
export const SectionList=wrap<any>(RNW.SectionList,'SectionList',centered);
const A=RNW.Animated as any;
// Os componentes animados continuam os do react-native-web (eles cuidam dos valores animados); a camada so
// converte os numeros fixos do estilo antes de entregar (valores animados passam intactos).
export const Animated={...A,View:wrap<any>(A.View,'Animated.View'),Text:wrap<any>(A.Text,'Animated.Text'),Image:wrap<any>(A.Image,'Animated.Image'),ScrollView:wrap<any>(A.ScrollView,'Animated.ScrollView',centered),FlatList:wrap<any>(A.FlatList,'Animated.FlatList',centered)};
