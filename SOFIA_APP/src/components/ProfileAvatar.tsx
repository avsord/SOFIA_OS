import React,{useEffect,useState} from 'react';
import {Image,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {initials} from '../lib/chat-model';
import {readProfilePhoto} from '../lib/profile-photo-cloud';
import {earlyPhoto,primeProfilePhoto,photoPreview,subscribeProfilePhoto} from '../lib/profile-photo-events';
import {Brand} from './UI';
/** Account-owned photo in the title bar, synced with the Profile editor. */
export function ProfileAvatar({scope,name,size=44}:{scope:string;name:string;size?:number}){
 const c=useTheme(),[uri,setUri]=useState(()=>photoPreview(scope)||earlyPhoto());
 useEffect(()=>{
  let alive=true;
  setUri(photoPreview(scope)||earlyPhoto());
  const stop=subscribeProfilePhoto(scope,setUri);
  void primeProfilePhoto(scope,readProfilePhoto).then(value=>{if(alive)setUri(value);}).catch(()=>{});
  return()=>{alive=false;stop();};
 },[scope]);
 return <View accessibilityLabel={uri?'Foto do perfil de '+name:'Perfil de '+name} style={{height:size,width:size,borderRadius:size/2,overflow:'hidden',backgroundColor:c.accent}}>
  {uri?<Image source={{uri}} style={{width:size,height:size}} resizeMode="cover"/>:<Brand size={size} label={initials(name)}/>}
 </View>;
}
