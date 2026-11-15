// 15/11/2026 (Pedro: "quando colocar link, aparecer a thumb do youtube e as infos do video de forma minimalista"):
// previa do link na Conversa. Enquanto escreve, um cartao acima do campo (com X para tirar); depois de enviado, o balao
// mostra a capa e o titulo. YouTube: capa pelo id do video e titulo/canal pelo oEmbed publico; outros sites pelo leitor
// de link do servidor (titulo, site e imagem da pagina).
import React,{useEffect,useState} from 'react';
import {Image,Linking,Pressable,Text,View} from 'react-native';
import type {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {Icon} from './Icon';
import {firstUrl,linkHost,youtubeId} from '../lib/link-info';

export type LinkInfo={url:string;title:string;site:string;author:string;image:string;video:boolean};
const cache=new Map<string,Promise<LinkInfo>>();

export function loadLinkInfo(api:SofiaApi,url:string):Promise<LinkInfo>{
 const hit=cache.get(url);if(hit)return hit;
 const yt=youtubeId(url),base:LinkInfo={url,title:'',site:yt?'YouTube':linkHost(url),author:'',image:yt?`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`:'',video:!!yt};
 const p=(yt
  ?fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+yt)).then(r=>r.ok?r.json():null)
    .then((j:any)=>({...base,title:String(j?.title||''),author:String(j?.author_name||'')}))
  :api.linkPreview(url).then(pv=>({...base,title:pv.read?pv.title:'',site:pv.site||base.site,image:pv.image||''})))
  .catch(()=>base);
 cache.set(url,p);return p;
}

function useLinkInfo(api:SofiaApi,url:string){
 const [info,setInfo]=useState<LinkInfo|null>(null);
 useEffect(()=>{let live=true;setInfo(null);if(url)void loadLinkInfo(api,url).then(i=>{if(live)setInfo(i);});return()=>{live=false;};},[api,url]);
 return info;
}

/** Cartao dentro do balao: capa grande (video com botao de play), titulo em ate 2 linhas e "site · canal". */
export function LinkBubbleCard({api,url}:{api:SofiaApi;url:string}){
 const c=useTheme(),info=useLinkInfo(api,url);
 if(!info)return null;
 const sub=[info.site,info.author].filter(Boolean).join(' · ');
 return <Pressable accessibilityRole="link" accessibilityLabel={'Abrir '+(info.title||url)} onPress={()=>void Linking.openURL(url)}
  style={{width:320,maxWidth:'100%',borderRadius:8,overflow:'hidden',backgroundColor:c.card,marginBottom:6}}>
  {info.image?<View style={{width:'100%',aspectRatio:info.video?16/9:1.91}}>
   <Image source={{uri:info.image}} resizeMode="cover" style={{width:'100%',height:'100%'}}/>
   {info.video?<View style={{position:'absolute',left:0,right:0,top:0,bottom:0,alignItems:'center',justifyContent:'center'}}>
    <View style={{width:46,height:46,borderRadius:23,backgroundColor:'rgba(0,0,0,.6)',alignItems:'center',justifyContent:'center'}}><Icon name="play" size={20} color="#fff"/></View></View>:null}
  </View>:null}
  <View style={{paddingHorizontal:10,paddingVertical:8,gap:2}}>
   {info.title?<Text numberOfLines={2} style={{color:c.text,fontSize:13.5,fontWeight:'600',lineHeight:18}}>{info.title}</Text>:null}
   <Text numberOfLines={1} style={{color:c.muted,fontSize:12}}>{sub||linkHost(url)}</Text>
  </View>
 </Pressable>;
}

/** Cartao acima do campo enquanto o link esta sendo escrito (igual ao WhatsApp), com X para tirar a previa. */
export function LinkDraftCard({api,url,onClose}:{api:SofiaApi;url:string;onClose:()=>void}){
 const c=useTheme(),info=useLinkInfo(api,url);
 return <View style={{flexDirection:'row',alignItems:'center',gap:12,marginHorizontal:12,marginTop:6,padding:8,borderRadius:10,backgroundColor:c.card}}>
  {info?.image?<Image source={{uri:info.image}} resizeMode="cover" style={{width:info.video?96:56,height:56,borderRadius:6}}/>
   :<View style={{width:56,height:56,borderRadius:6,alignItems:'center',justifyContent:'center'}}><Icon name="link" size={20} color={c.muted}/></View>}
  <View style={{flex:1,minWidth:0,gap:2}}>
   <Text numberOfLines={1} style={{color:c.text,fontSize:13.5,fontWeight:'600'}}>{info?(info.title||linkHost(url)):'Lendo o link…'}</Text>
   <Text numberOfLines={1} style={{color:c.muted,fontSize:12}}>{info?[info.site,info.author].filter(Boolean).join(' · '):linkHost(url)}</Text>
  </View>
  <Pressable accessibilityRole="button" accessibilityLabel="Tirar prévia do link" onPress={onClose} style={{padding:6}}><Icon name="close" size={18} color={c.muted}/></Pressable>
 </View>;
}

export {firstUrl};
