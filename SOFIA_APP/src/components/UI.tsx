import React,{useContext} from 'react';
import {PALETTE} from '../lib/palette';
import {DialogContext,useDesktop} from '../lib/desktop';
import {ContentWidth,DESK_LEFT} from '../lib/content-width';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { useTheme } from '../lib/theme';
import { Icon, IconName } from './Icon';
export function IconButton({name,label,onPress,disabled=false,filled=false,size=44}:{name:IconName;label:string;onPress:()=>void;disabled?:boolean;filled?:boolean;size?:number}) {
 // 0.3.251 (computador): botao de icone menor, com fundo ao passar o mouse
 const c=useTheme(),desktop=useDesktop(),box=size; return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({pressed,hovered}:any)=>({height:box,width:box,borderRadius:desktop?Math.round(box/4):box/2,alignItems:'center',justifyContent:'center',backgroundColor:filled?c.accent:desktop&&hovered&&!disabled?c.line:'transparent',opacity:disabled?0.35:pressed?0.6:1})}><Icon name={name} size={desktop?19:22} color={filled?(c.accent===PALETTE.brand?PALETTE.white:PALETTE.brandDeep):c.text}/></Pressable>;
}
export function Button({title,onPress,loading=false,disabled=false,secondary=false}:{title:string;onPress:()=>void;loading?:boolean;disabled?:boolean;secondary?:boolean}) {
 // 0.3.251 (computador): altura e cantos de botao de computador; fora de janela, largura do texto
 const c=useTheme(),desktop=useDesktop(),inDialog=useContext(DialogContext); return <Pressable accessibilityRole="button" disabled={disabled||loading} onPress={onPress} {...({dataSet:{primary:secondary?'0':'1'}} as any)} style={({pressed})=>({minHeight:50,borderRadius:16,paddingHorizontal:18,alignItems:'center',justifyContent:'center',alignSelf:desktop&&!inDialog?'flex-start':undefined,minWidth:desktop&&!inDialog?160:undefined,backgroundColor:secondary?c.accentSoft:c.accent,opacity:disabled?0.4:pressed?0.7:1})}>{loading?<ActivityIndicator color={secondary?c.accent:c.onAccent}/>:<Text style={{fontSize:16,fontWeight:'600',color:secondary?c.accent:c.onAccent}}>{title}</Text>}</Pressable>;
}
// 0.3.139: logo oficial da Sofia (esfera). Brand continua para iniciais de perfil.
const SOFIA_LOGO=require('../../assets/sofia-logo-app.png');
export function SofiaLogo({size=44}:{size?:number}) { return <Image source={SOFIA_LOGO} style={{width:size,height:size}} resizeMode="contain" accessibilityLabel="Sofia OS"/>; }
export function Brand({size=44,label='S'}:{size?:number;label?:string}) { const c=useTheme();return <View style={{width:size,height:size,borderRadius:size/2,backgroundColor:c.accent,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:size*.4,fontWeight:'600',color:c.onAccent}}>{label}</Text></View>; }
// 0.3.262 (fase 4 — vazios): icone em dois tons dentro de um halo suave, titulo com peso e texto curto numa coluna
// estreita (nao atravessa a tela no computador). As frases sao escritas na voz da Sofia.
export function Empty({title,body,icon='chat'}:{title:string;body:string;icon?:IconName}) { const c=useTheme();return <View style={{alignItems:'center',paddingVertical:36,paddingHorizontal:24,gap:10}}><View style={{width:72,height:72,borderRadius:36,alignItems:'center',justifyContent:'center',backgroundColor:c.accentSoft,marginBottom:6}}><View style={{width:52,height:52,borderRadius:26,alignItems:'center',justifyContent:'center',backgroundColor:c.surface}}><Icon name={icon} color={c.accent} size={28} weight="duotone"/></View></View><Text style={{fontSize:18,fontWeight:'600',color:c.text,textAlign:'center'}}>{title}</Text><Text style={{fontSize:14,lineHeight:22,color:c.muted,textAlign:'center',maxWidth:380}}>{body}</Text></View>; }
export function ErrorBanner({text,onRetry}:{text:string;onRetry?:()=>void}) {const c=useTheme();return <View accessibilityRole="alert" style={{backgroundColor:c.dangerBg,padding:14,borderRadius:14,margin:12,gap:6}}><Text style={{color:c.danger,fontSize:13,lineHeight:19}}>{text}</Text>{onRetry&&<Pressable onPress={onRetry} accessibilityRole="button" style={{minHeight:36,justifyContent:'center'}}><Text style={{fontWeight:'600',color:c.danger}}>Tentar novamente</Text></Pressable>}</View>;}
export function ScreenTitle({title,eyebrow='',right,tight=false,subtitle}:{title:string;eyebrow?:string;right?:React.ReactNode;tight?:boolean;subtitle?:string}) {const c=useTheme(),desktop=useDesktop(),max=useContext(ContentWidth);return <View style={{...(desktop&&max?{paddingLeft:DESK_LEFT+'px',paddingRight:22,width:'100%',maxWidth:max+DESK_LEFT,alignSelf:'flex-start'} as any:{paddingHorizontal:22}),...(desktop&&max?{paddingTop:'32px',paddingBottom:'16px'}:{paddingTop:20,paddingBottom:tight?6:18}),flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12} as any}><View style={{flex:1}}>{eyebrow?<Text style={{fontSize:12,color:c.muted,marginBottom:4}}>{eyebrow}</Text>:null}<Text style={{fontSize:28,letterSpacing:-1,fontWeight:'600',color:c.text}}>{title}</Text>{subtitle&&desktop?<Text style={{color:c.muted,fontSize:14,marginTop:4}}>{subtitle}</Text>:null}</View>{right}</View>;}
export const forms=StyleSheet.create({input:{minHeight:52,borderWidth:1,borderRadius:14,paddingHorizontal:15,fontSize:16},label:{fontSize:12,fontWeight:'500',marginBottom:8},card:{padding:20,borderRadius:22,gap:14,boxShadow:'0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'},body:{fontSize:14,lineHeight:22}});

/** Cabeçalho dos apps internos (Finanças, Price Tracker, E-mails, Listas, Biblioteca, Estudos):
 * voltar à esquerda, legenda discreta, título e ações à direita. */
export function ModuleHeader({title,caption,onBack,right}:{title:string;caption?:string;onBack:()=>void;right?:React.ReactNode}) {const c=useTheme(),desktop=useDesktop(),max=useContext(ContentWidth);return <View style={{flexDirection:'row',alignItems:'center',...(desktop&&max?{paddingLeft:DESK_LEFT+'px',paddingRight:24,width:'100%',maxWidth:max+DESK_LEFT,alignSelf:'flex-start'} as any:{paddingHorizontal:desktop?24:12}),paddingTop:desktop?32:14,paddingBottom:desktop?16:10,gap:desktop?6:0}}>{desktop?null:<IconButton name="back" label="Voltar aos apps" onPress={onBack}/>}<View style={{flex:1,paddingHorizontal:desktop?0:4}}>{caption?<Text style={{fontSize:13,color:c.muted}}>{caption}</Text>:null}<Text style={{fontSize:desktop?28:24,fontWeight:desktop?'600':'700',letterSpacing:desktop?-0.5:0,color:c.text}} numberOfLines={1}>{title}</Text></View>{right}</View>;}

/** 0.3.273 (padrao aprovado no computador): abas sublinhadas, iguais em todas as telas; no celular quem chama mantem
 * o seletor de antes. */
export function DeskTabs<T extends string>({value,onChange,options,right}:{value:T;onChange:(v:T)=>void;options:{value:T;label:string;count?:number|string}[];right?:React.ReactNode}){
 const c=useTheme();
 return <View accessibilityRole="tablist" style={{flexDirection:'row',alignItems:'flex-end',gap:24,borderBottomWidth:1,borderColor:c.line}}>
  {options.map(o=>{const on=o.value===value;return <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{selected:on}} onPress={()=>onChange(o.value)} style={({hovered}:any)=>({paddingBottom:10,marginBottom:-1,borderBottomWidth:2,borderColor:on?c.accent:hovered?c.line:'transparent'})}><Text style={{color:on?c.text:c.muted,fontSize:14,fontWeight:on?'600':'400'}}>{o.label}{o.count!==undefined&&o.count!==''?<Text style={{color:c.muted,fontWeight:'400',fontSize:13}}>  {o.count}</Text>:null}</Text></Pressable>;})}
  <View style={{flex:1}}/>{right?<View style={{paddingBottom:8}}>{right}</View>:null}
 </View>;
}
