/** 0.3.268 (site): a capa e baixada com a sessao e mostrada direto (o site nao tem a pasta de arquivos do celular;
 * antes falhava e mostrava "Nao foi possivel abrir esta capa"). */
type Source={uri:string;headers?:Record<string,string>};
const cache=new Map<string,string>();
export async function cachedPageCover(source:Source,id:string,force=false,attempt=0){
 if(!force&&cache.has(id))return cache.get(id)!;
 const separator=source.uri.includes('?')?'&':'?';
 const r=await fetch(source.uri+separator+'cover_download='+attempt,{headers:source.headers});
 if(!r.ok)throw new Error('A capa não pôde ser aberta ('+r.status+').');
 const blob=await r.blob();if(!blob.size)throw new Error('A capa não pôde ser aberta.');
 const old=cache.get(id);if(old)try{URL.revokeObjectURL(old);}catch{/* ja liberada */}
 const url=URL.createObjectURL(blob);cache.set(id,url);return url;
}
export function pageCoverDestination(id:string){return {uri:cache.get(id)||'',exists:cache.has(id),size:cache.has(id)?1:0,delete(){cache.delete(id);}};}
