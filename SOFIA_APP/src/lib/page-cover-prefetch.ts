// 05/11/2026 (Pedro: "quando saio de uma pagina pra outra a capa da uma flicada e demora pra carregar"): capa ja baixada
// aparece no mesmo quadro, o tamanho da imagem fica guardado e as capas das paginas recentes sao baixadas antes.
// Arquivo leve (a barra lateral usa sem carregar a janela de capa).
import {Image,Platform} from 'react-native';
import type {SofiaApi} from './api';
import {cachedPageCover,pageCoverDestination} from './page-cover-cache';
export const IMAGE_SIZES=new Map<string,{w:number;h:number}>();
export function peekCover(id:string):string{if(!id)return '';try{const d=pageCoverDestination(id) as any;return d?.exists&&d.uri?String(d.uri):'';}catch{return '';}}
const prefetching=new Set<string>();
export function prefetchPageCover(api:SofiaApi,data:Record<string,any>|undefined){const id=String(data?.cover_attachment_id||'');if(data?.cover_type!=='attachment'||!id||prefetching.has(id)||peekCover(id))return;prefetching.add(id);
 void cachedPageCover(api.attachmentSource(id),id,false,0).then(uri=>{if(Platform.OS==='web'&&uri)Image.getSize(uri,(w,h)=>{if(w>0&&h>0)IMAGE_SIZES.set(uri,{w,h});},()=>{});}).catch(()=>{}).finally(()=>prefetching.delete(id));}
