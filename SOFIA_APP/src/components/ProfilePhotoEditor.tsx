import React,{useEffect,useState} from 'react';
import {PALETTE} from '../lib/palette';
import {ActivityIndicator,Alert,Image,Pressable,View} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {Brand} from './UI';
import {Icon} from './Icon';
import {useTheme} from '../lib/theme';
import {errorText,initials} from '../lib/chat-model';
import {readProfilePhoto,removeProfilePhoto,saveProfilePhoto} from '../lib/profile-photo-cloud';
import {photoChanged,photoPreview,primeProfilePhoto,subscribeProfilePhoto} from '../lib/profile-photo-events';
import {appAlert} from '../lib/app-alert';

export function ProfilePhotoEditor({scope,name}:{scope:string;name:string}){
 const c=useTheme(),[uri,setUri]=useState(()=>photoPreview(scope)),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;setUri(photoPreview(scope));const stop=subscribeProfilePhoto(scope,setUri);void primeProfilePhoto(scope,readProfilePhoto).then(value=>{if(alive)setUri(value);}).catch(()=>{});return()=>{alive=false;stop();};},[scope]);
 async function pick(camera=false){
  if(busy)return;setBusy(true);
  try{
   if(camera){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted)throw Error('Permita o uso da câmera para tirar a foto do perfil.');}
   const result=camera?await ImagePicker.launchCameraAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:.8}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:.8});
   if(result.canceled||!result.assets[0])return;
   const saved=await saveProfilePhoto(scope,result.assets[0].uri,result.assets[0].mimeType);setUri(saved);photoChanged(scope,saved);
  }catch(e){appAlert('Foto do perfil',errorText(e));}finally{setBusy(false);}
 }
 function menu(){appAlert('Foto do perfil','Escolha como deseja alterar a foto.',[
  {text:'Escolher da galeria',onPress:()=>void pick(false)},
  {text:'Tirar foto',onPress:()=>void pick(true)},
  ...(uri?[{text:'Remover foto',style:'destructive' as const,onPress:()=>{setBusy(true);void removeProfilePhoto(scope).then(()=>{setUri('');photoChanged(scope,'');}).catch(e=>appAlert('Foto do perfil',errorText(e))).finally(()=>setBusy(false));}}]:[]),
  {text:'Cancelar',style:'cancel'}
 ]);}
 return <View style={{width:94,height:94,overflow:'visible'}}>
  <Pressable accessibilityRole="button" accessibilityLabel="Alterar foto do perfil" accessibilityHint="Escolha uma foto, ajuste o enquadramento e salve" onPress={menu} disabled={busy} style={{width:82,height:82,borderRadius:41,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:c.input,borderWidth:2,borderColor:c.line}}>
   {uri?<Image source={{uri}} style={{width:'100%',height:'100%'}} resizeMode="cover"/>:<Brand size={72} label={initials(name)}/>}
   {busy?<View style={{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:PALETTE.black+'55',alignItems:'center',justifyContent:'center'}}><ActivityIndicator color={PALETTE.white}/></View>:null}
  </Pressable>
  <Pressable testID="profile-camera-button" accessibilityRole="button" accessibilityLabel="Escolher ou tirar foto do perfil" onPress={menu} disabled={busy} hitSlop={5} style={{position:'absolute',right:0,bottom:0,width:34,height:34,borderRadius:17,backgroundColor:c.accent,alignItems:'center',justifyContent:'center',borderWidth:3,borderColor:c.surface,elevation:2}}><Icon name="camera" size={17} color={c.onAccent}/></Pressable>
 </View>;
}
