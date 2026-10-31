import {currentApi} from './api';
/** 0.3.268 (site): a foto do perfil vem do servidor, a mesma do app do celular (antes o site nunca via a foto). */
export async function readProfilePhoto(_scope:string){
 const api=currentApi();if(!api)return '';
 try{const r=await api.profilePhoto();return r.photo?'data:'+r.photo.mime+';base64,'+r.photo.base64:'';}catch{return '';}
}
async function toBase64(uri:string):Promise<{mime:string;base64:string}>{
 if(uri.startsWith('data:')){const m=/^data:([^;,]+)[^,]*,(.*)$/.exec(uri);if(m)return {mime:m[1],base64:m[2]};}
 const blob=await (await fetch(uri)).blob();
 const data:string=await new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>bad(r.error);r.readAsDataURL(blob);});
 return {mime:blob.type||'image/jpeg',base64:data.slice(data.indexOf(',')+1)};
}
export async function saveProfilePhoto(_scope:string,sourceUri:string,mime?:string|null){
 const api=currentApi();if(!api)throw new Error('Entre de novo para trocar a foto.');
 const file=await toBase64(sourceUri);const type=mime||file.mime;
 await api.saveProfilePhoto(type,file.base64);
 return 'data:'+type+';base64,'+file.base64;
}
export async function removeProfilePhoto(_scope:string){await currentApi()?.deleteProfilePhoto();}
