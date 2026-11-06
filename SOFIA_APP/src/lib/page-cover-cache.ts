import {File,Paths} from 'expo-file-system';

type Source={uri:string;headers?:Record<string,string>};
const safe=(id:string)=>id.replace(/[^A-Za-z0-9_-]/g,'');
/** So o site guarda o arquivo da capa (ver page-cover-cache.web.ts). */
export function coverBlob(_url:string):Blob|null{return null;}
export function pageCoverDestination(id:string){return new File(Paths.cache,'sofia-page-cover-'+safe(id)+'.img');}
export async function cachedPageCover(source:Source,id:string,force=false,attempt=0){
 const destination=pageCoverDestination(id);
 if(force&&destination.exists){try{destination.delete();}catch{}}
 if(!destination.exists||destination.size<1){
  const separator=source.uri.includes('?')?'&':'?';
  await File.downloadFileAsync(source.uri+separator+'cover_download='+attempt,destination,{headers:source.headers,idempotent:true});
 }
 if(!destination.exists||destination.size<1)throw new Error('A capa foi enviada, mas o arquivo não pôde ser aberto.');
 return destination.uri;
}
