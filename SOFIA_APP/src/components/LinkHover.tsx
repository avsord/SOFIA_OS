// 05/11/2026 (Pedro: links como no Notion): ao passar o mouse num link aparece um cartao pequeno com o endereco,
// Copiar e Remover link. So existe no site; no celular o toque no link abre o endereco.
import React from 'react';
import {Pressable,Text,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {Icon} from './Icon';
import {OverAll} from '../lib/over-all';
export type LinkPop={url:string;x:number;y:number}|null;
export function openUrl(url:string){try{if(typeof window!=='undefined')window.open(url,'_blank','noopener,noreferrer');}catch{}}
export function LinkHoverCard({pop,onEnter,onLeave,onRemove,onClose}:{pop:LinkPop;onEnter:()=>void;onLeave:()=>void;onRemove:()=>void;onClose:()=>void}){
 const c=useTheme(),[copied,setCopied]=React.useState(false);
 React.useEffect(()=>setCopied(false),[pop?.url]);
 if(!pop)return null;
 const vw=typeof window!=='undefined'?window.innerWidth:1200,W=360,left=Math.max(8,Math.min(pop.x,vw-W-8));
 const btn=(label:string,icon:any,run:()=>void,danger=false)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={run} style={({hovered}:any)=>({flexDirection:'row',alignItems:'center',gap:6,height:28,paddingHorizontal:8,borderRadius:6,backgroundColor:hovered?c.line:'transparent'})}><Icon name={icon} size={14} color={danger?c.danger:c.muted}/><Text style={{color:danger?c.danger:c.text,fontSize:12}}>{label}</Text></Pressable>;
 return <OverAll><View testID="link-hover-card" {...({onMouseEnter:onEnter,onMouseLeave:onLeave} as any)} style={{position:'absolute',left,top:pop.y+4,maxWidth:W,flexDirection:'row',alignItems:'center',gap:2,padding:4,borderRadius:10,borderWidth:1,borderColor:c.line,backgroundColor:c.surface,pointerEvents:'auto',boxShadow:'0 8px 24px rgba(0,0,0,.28)'} as any}>
  <Pressable accessibilityRole="link" accessibilityLabel={'Abrir '+pop.url} onPress={()=>{openUrl(pop.url);onClose();}} style={({hovered}:any)=>({flexShrink:1,flexDirection:'row',alignItems:'center',gap:6,height:28,paddingHorizontal:8,borderRadius:6,backgroundColor:hovered?c.line:'transparent'})}><Icon name="link" size={14} color={c.muted}/><Text numberOfLines={1} style={{flexShrink:1,color:c.muted,fontSize:12}}>{pop.url.replace(/^https?:\/\//,'')}</Text></Pressable>
  <View style={{width:1,height:18,backgroundColor:c.line,marginHorizontal:2}}/>
  {btn(copied?'Copiado':'Copiar',copied?'check':'copy',()=>{try{(navigator as any).clipboard?.writeText(pop.url);setCopied(true);}catch{}})}
  {btn('Remover link','close',()=>{onRemove();onClose();},true)}
 </View></OverAll>;
}
