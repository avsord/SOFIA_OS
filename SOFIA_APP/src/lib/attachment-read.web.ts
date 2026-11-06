/** 0.3.329 (site): o anexo da Conversa e lido pelo navegador (arquivo escolhido, colado ou arrastado - endereco blob: ou
 * data:). Antes o site usava o leitor do celular, que nao existe no navegador, e o anexo falhava ao enviar. */
import {readLocalBlob} from './blob-registry';
// 06/11/2026: le o arquivo guardado do endereco blob: (fetch de blob: e bloqueado pela regra de seguranca do site)
const blobOf=readLocalBlob;
export async function attachmentBase64(uri:string):Promise<string>{
 if(uri.startsWith('data:')){const i=uri.indexOf(',');return uri.slice(i+1);}
 const blob=await blobOf(uri);
 const data:string=await new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>bad(r.error||Error('Não deu para ler o arquivo.'));r.readAsDataURL(blob);});
 return data.slice(data.indexOf(',')+1);
}
export async function attachmentSize(uri:string):Promise<number>{try{return (await blobOf(uri)).size;}catch{return 0;}}
