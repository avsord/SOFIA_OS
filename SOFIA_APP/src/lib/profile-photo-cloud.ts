import AsyncStorage from '@react-native-async-storage/async-storage';
import {File,Paths} from 'expo-file-system';
import {currentApi} from './api';
import {photoChanged} from './profile-photo-events';
import * as local from './profile-photo';
/** 0.3.268: a foto do perfil tambem fica no servidor, para o site e outros aparelhos mostrarem a mesma (antes ficava so
 * no celular e o site nunca via). O arquivo do aparelho continua sendo a fonte rapida (profile-photo.ts); esta camada
 * envia a foto trocada e, se o servidor tiver uma mais nova (trocada no site), baixa e troca sem travar a tela. */
const STAMP='sofia.native.profile-photo.cloud:';
const scopeKey=(scope:string)=>STAMP+scope.trim().toLowerCase();
const extOf=(mime:string)=>mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
const mimeOf=(uri:string,mime?:string|null)=>mime||(/\.png$/i.test(uri)?'image/png':/\.webp$/i.test(uri)?'image/webp':'image/jpeg');
let syncing=false;
async function upload(scope:string,uri:string,mime?:string|null){
 const api=currentApi();if(!api)return;
 try{const data=await (new File(uri) as any).base64();const r=await api.saveProfilePhoto(mimeOf(uri,mime),String(data));await AsyncStorage.setItem(scopeKey(scope),r.updated_at);}
 catch{await AsyncStorage.setItem(scopeKey(scope),'pending').catch(()=>{});}
}
export async function syncProfilePhoto(scope:string){
 const api=currentApi();if(!api||syncing)return;syncing=true;
 try{
  const [r,stamp,mine]=await Promise.all([api.profilePhoto(),AsyncStorage.getItem(scopeKey(scope)),local.readProfilePhoto(scope)]);
  if(stamp==='pending'&&mine){await upload(scope,mine);return;}
  if(!r.photo){if(stamp&&mine){await local.removeProfilePhoto(scope);await AsyncStorage.removeItem(scopeKey(scope));photoChanged(scope,'');}else if(mine&&!stamp)await upload(scope,mine);return;}
  if(stamp===r.photo.updated_at)return;
  // o servidor tem uma foto diferente da ultima que este aparelho conhece: ela vence
  const tmp=new File(Paths.cache,'sofia-profile-download-'+Date.now().toString(36)+'.'+extOf(r.photo.mime));
  (tmp as any).write(r.photo.base64,{encoding:'base64'});
  const saved=await local.saveProfilePhoto(scope,tmp.uri,r.photo.mime);
  try{(tmp as any).delete();}catch{/* arquivo temporario */}
  await AsyncStorage.setItem(scopeKey(scope),r.photo.updated_at);photoChanged(scope,saved);
 }catch{/* sem rede: fica a foto do aparelho */}
 finally{syncing=false;}
}
export async function readProfilePhoto(scope:string){setTimeout(()=>void syncProfilePhoto(scope),1500);return local.readProfilePhoto(scope);}
export async function saveProfilePhoto(scope:string,sourceUri:string,mime?:string|null){const uri=await local.saveProfilePhoto(scope,sourceUri,mime);void upload(scope,uri,mime);return uri;}
export async function removeProfilePhoto(scope:string){await local.removeProfilePhoto(scope);await AsyncStorage.removeItem(scopeKey(scope)).catch(()=>{});await currentApi()?.deleteProfilePhoto().catch(()=>{});}
