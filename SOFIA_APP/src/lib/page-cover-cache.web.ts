/** 0.3.268 (site): a capa e baixada com a sessao e mostrada direto (o site nao tem a pasta de arquivos do celular;
 * antes falhava e mostrava "Nao foi possivel abrir esta capa"). */
import {readSecureBytes,writeSecureBytes} from './encrypted-storage.web';
type Source={uri:string;headers?:Record<string,string>};
const cache=new Map<string,string>();
// 06/11/2026 (Pedro: "o boa noite ta pulando e o fade pisca no final"): o arquivo da capa fica guardado para a imagem
// pronta (ImageBitmap) ser feita direto dele, fora da linha que desenha a tela (a partir do <img> o navegador decodifica nela)
const blobs=new Map<string,Blob>();
export function coverBlob(url:string):Blob|null{return blobs.get(url)||null;}
export async function cachedPageCover(source:Source,id:string,force=false,attempt=0){
 if(!force&&cache.has(id))return cache.get(id)!;
 // 06/11/2026: a capa (id imutavel: trocar a capa gera outro id) fica guardada cifrada no navegador; ao recarregar o site
 // ela vem do disco em milissegundos em vez de baixar de novo.
 if(!force){try{const saved=await readSecureBytes('cover|'+id);if(saved&&saved.byteLength){if(cache.has(id))return cache.get(id)!;const bl=new Blob([saved]),url=URL.createObjectURL(bl);blobs.set(url,bl);cache.set(id,url);return url;}}catch{/* baixa */}}
 const separator=source.uri.includes('?')?'&':'?';
 const r=await fetch(source.uri+separator+'cover_download='+attempt,{headers:source.headers});
 if(!r.ok)throw new Error('A capa não pôde ser aberta ('+r.status+').');
 const blob=await r.blob();if(!blob.size)throw new Error('A capa não pôde ser aberta.');
 const old=cache.get(id);if(old)try{URL.revokeObjectURL(old);}catch{/* ja liberada */}
 const url=URL.createObjectURL(blob);blobs.set(url,blob);cache.set(id,url);
 if(blob.size<6_000_000)void blob.arrayBuffer().then(b=>writeSecureBytes('cover|'+id,b)).catch(()=>{});
 return url;
}
export function pageCoverDestination(id:string){return {uri:cache.get(id)||'',exists:cache.has(id),size:cache.has(id)?1:0,delete(){cache.delete(id);}};}
