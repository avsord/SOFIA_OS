import {currentApi} from './api';
/** 0.3.268 (site): a foto do perfil vem do servidor, a mesma do app do celular (antes o site nunca via a foto). */
// 05/11/2026 (Pedro: "minha foto de perfil nao aparece"): na abertura do site a foto era pedida antes do login ficar pronto;
// sem conexao com a conta a resposta era "sem foto" e ficava guardada para sempre. Agora espera o login (ate 15 s).
async function waitApi(){for(let i=0;i<75;i++){const a=currentApi();if(a)return a;await new Promise(r=>setTimeout(r,200));}return null;}
export async function readProfilePhoto(_scope:string){
 const api=currentApi()||await waitApi();if(!api)return '';
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
