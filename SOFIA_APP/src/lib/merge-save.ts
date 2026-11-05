// 05/11/2026 (Pedro: "Este registro mudou em outro aparelho" sem ninguem mais mexer): o editor manda a revisao da copia
// que estava na lista da tela; quando essa copia esta velha (cache da lista, outra edicao segundos antes, item criado
// pela Sofia) o servidor recusava. Agora o salvar busca a versao atual e aplica so o que a pessoa mudou no formulario
// (comparado com o que ela viu ao abrir), mantendo o resto como esta no servidor.
import type {Entity} from './types';
const same=(a:unknown,b:unknown)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const TOP=['title','content','area','state','privacy','tags'] as const;
export function mergeOnConflict(input:Partial<Entity>,base:Partial<Entity>,current:Entity):Partial<Entity>{
 const out:any={...current,revision:current.revision};
 for(const k of TOP)if(k in input&&!same((input as any)[k],(base as any)[k]))out[k]=(input as any)[k];
 const data:Record<string,any>={...(current.data||{})};out.data=data;if(!input.data||typeof input.data!=='object')return out;
 const inData=input.data,baseData=base.data||{};
 for(const k of new Set([...Object.keys(inData),...Object.keys(baseData)])){
  if(same(inData[k],baseData[k]))continue;
  if(k in inData)data[k]=inData[k];else delete data[k];
 }
 return out;
}
