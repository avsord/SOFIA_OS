/** Shared photo changes across screens; image files stay private on-device. */
const photos=new Map<string,string>();
const listeners=new Set<(scope:string,uri:string)=>void>();
const pending=new Map<string,Promise<string>>();
const key=(scope:string)=>scope.trim().toLowerCase();
export function photoPreview(scope:string){return photos.get(key(scope))||'';}
/** 06/11/2026 (site): foto ja baixada pelo early.js junto com a pagina; vazio no celular ou se ainda nao chegou. */
export function earlyPhoto():string{const v=(globalThis as any).__sofiaPhoto;return typeof v==='string'&&v.startsWith('data:image/')?v:'';}
export function photoChanged(scope:string,uri:string){
 const id=key(scope);photos.set(id,uri);
 listeners.forEach(listener=>listener(id,uri));
}
// Share a read without overwriting a newer user edit or removal.
export function primeProfilePhoto(scope:string,reader:(scope:string)=>Promise<string>):Promise<string>{
 const id=key(scope);if(photos.has(id))return Promise.resolve(photoPreview(scope));
 const existing=pending.get(id);if(existing)return existing;
 const work=Promise.resolve().then(()=>reader(scope)).then(uri=>{if(!photos.has(id))photoChanged(scope,uri);return photoPreview(scope);}).finally(()=>{if(pending.get(id)===work)pending.delete(id);});
 pending.set(id,work);return work;
}
export function subscribeProfilePhoto(scope:string,listener:(uri:string)=>void){
 const id=key(scope),handler=(changed:string,uri:string)=>{if(changed===id)listener(uri);};
 listeners.add(handler);return()=>{listeners.delete(handler);};
}
/** 07/11/2026 (Pedro: "minha foto ta bugando quando inicia o site"): com internet lenta apareciam as iniciais por ~1 s e
 * depois a foto entrava de repente (e a foto vinha em tamanho cheio para um circulo de 32 px). No site guarda uma COPIA
 * PEQUENA (96 px) da foto desta conta neste navegador: da proxima vez ela aparece no primeiro quadro, sem esperar a rede. */
const THUMB_KEY='sofia.photo.thumb.v1';
export function cachedThumb(scope:string):string{try{const v=JSON.parse(globalThis.localStorage?.getItem(THUMB_KEY)||'null');return v&&v.scope===key(scope)&&typeof v.data==='string'&&v.data.startsWith('data:image/')?v.data:'';}catch{return '';}}
export function storeThumb(scope:string,uri:string){
 try{
  if(typeof document==='undefined')return;
  if(!uri){globalThis.localStorage?.removeItem(THUMB_KEY);return;}
  const img=new (globalThis as any).Image();img.onload=()=>{try{const s=96,cv=document.createElement('canvas');cv.width=s;cv.height=s;const g=cv.getContext('2d');if(!g)return;const k=Math.max(s/img.naturalWidth,s/img.naturalHeight),w=img.naturalWidth*k,h=img.naturalHeight*k;g.drawImage(img,(s-w)/2,(s-h)/2,w,h);
   globalThis.localStorage?.setItem(THUMB_KEY,JSON.stringify({scope:key(scope),data:cv.toDataURL('image/jpeg',0.85)}));}catch{/* sem espaco ou imagem bloqueada */}};img.src=uri;
 }catch{/* sem armazenamento */}
}
