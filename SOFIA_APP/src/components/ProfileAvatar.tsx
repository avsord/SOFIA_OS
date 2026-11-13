import React,{useEffect,useState} from 'react';
import {Image,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {initials} from '../lib/chat-model';
import {readProfilePhoto} from '../lib/profile-photo-cloud';
import {cachedThumb,earlyPhoto,primeProfilePhoto,photoPreview,storeThumb,subscribeProfilePhoto} from '../lib/profile-photo-events';
import {Brand} from './UI';
/** Account-owned photo in the title bar, synced with the Profile editor. */
export function ProfileAvatar({scope,name,size=44}:{scope:string;name:string;size?:number}){
 const c=useTheme(),[uri,setUri]=useState(()=>photoPreview(scope)||earlyPhoto()||cachedThumb(scope)),[known,setKnown]=useState(()=>!!(photoPreview(scope)||earlyPhoto()||cachedThumb(scope)));
 useEffect(()=>{
  let alive=true;
  const first=photoPreview(scope)||earlyPhoto()||cachedThumb(scope);setUri(first);setKnown(!!first);
  // 07/11/2026: a copia pequena guardada aparece no primeiro quadro; quando a foto chega, e a mesma imagem (sem piscar)
  const got=(value:string)=>{if(!alive)return;setKnown(true);setUri(value);storeThumb(scope,value);};
  const stop=subscribeProfilePhoto(scope,got);
  // 13/11/2026 (Pedro: "a foto so aparece depois de recarregar"): leitura que falha nao vira "sem foto"; tenta de novo (2 s, 5 s, 12 s, 30 s
  // e ao voltar para a janela) mantendo a copia pequena na tela. As iniciais so aparecem se nao houver copia nenhuma.
  let tries=0,timer:ReturnType<typeof setTimeout>|undefined;
  const load=()=>{if(timer){clearTimeout(timer);timer=undefined;}void primeProfilePhoto(scope,readProfilePhoto).then(got).catch(()=>{if(!alive)return;setKnown(true);const wait=[2000,5000,12000,30000][tries++];if(wait)timer=setTimeout(load,wait);});};
  load();
  const onFocus=()=>{if(alive&&!photoPreview(scope)&&tries>0)load();};
  const win=typeof window!=='undefined'&&typeof window.addEventListener==='function'?window:null;
  win?.addEventListener('focus',onFocus);
  return()=>{alive=false;stop();if(timer)clearTimeout(timer);win?.removeEventListener('focus',onFocus);};
 },[scope]);
 return <View accessibilityLabel={uri?'Foto do perfil de '+name:'Perfil de '+name} style={{height:size,width:size,borderRadius:size/2,overflow:'hidden',backgroundColor:uri||known?c.accent:c.input}}>
  {uri?<Image source={{uri}} style={{width:size,height:size}} resizeMode="cover"/>:known?<Brand size={size} label={initials(name)}/>:null /* ainda sem saber se ha foto: circulo neutro, sem mostrar as iniciais e trocar */}
 </View>;
}
