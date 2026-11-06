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
