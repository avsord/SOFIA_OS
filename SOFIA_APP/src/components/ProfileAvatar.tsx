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
  void primeProfilePhoto(scope,readProfilePhoto).then(got).catch(()=>{if(alive)setKnown(true);});
  return()=>{alive=false;stop();};
 },[scope]);
 return <View accessibilityLabel={uri?'Foto do perfil de '+name:'Perfil de '+name} style={{height:size,width:size,borderRadius:size/2,overflow:'hidden',backgroundColor:uri||known?c.accent:c.input}}>
  {uri?<Image source={{uri}} style={{width:size,height:size}} resizeMode="cover"/>:known?<Brand size={size} label={initials(name)}/>:null /* ainda sem saber se ha foto: circulo neutro, sem mostrar as iniciais e trocar */}
 </View>;
}
