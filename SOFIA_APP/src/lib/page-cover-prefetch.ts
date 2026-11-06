// 05/11/2026 (Pedro: "quando saio de uma pagina pra outra a capa da uma flicada e demora pra carregar"): capa ja baixada
// aparece no mesmo quadro, o tamanho da imagem fica guardado e as capas das paginas recentes sao baixadas antes.
// Arquivo leve (a barra lateral usa sem carregar a janela de capa).
import {Image,Platform} from 'react-native';
import type {SofiaApi} from './api';
import {cachedPageCover,coverBlob,pageCoverDestination} from './page-cover-cache';
export const IMAGE_SIZES=new Map<string,{w:number;h:number}>();
/** Imagem da capa ja decodificada (site): a pagina reaproveita este mesmo elemento e a capa aparece no 1o quadro. */
export const DECODED=new Map<string,any>();
/** 06/11/2026 (Pedro: capa roxa por um instante ao abrir outra pagina): o navegador descarta a foto decodificada de um <img>
 * fora da tela; ao voltar ele decodifica de novo e mostra o fundo por 1-3 quadros. Um ImageBitmap fica pronto na memoria e
 * e pintado num <canvas> antes do primeiro quadro - a capa ja preparada nunca pisca. Reduzido a largura da tela. */
export const BITMAPS=new Map<string,any>();
export async function makeBitmap(uri:string,img:any):Promise<any>{
 const g:any=globalThis;if(BITMAPS.has(uri))return BITMAPS.get(uri);if(typeof g.createImageBitmap!=='function'||!img)return null;
 try{if(!(img.complete&&img.naturalWidth>0))await new Promise<void>((ok,bad)=>{img.addEventListener('load',()=>ok(),{once:true});img.addEventListener('error',()=>bad(new Error('img')),{once:true});});
  const target=Math.round(Math.min(2400,(g.screen?.width||1920)*(g.devicePixelRatio||1))),w=img.naturalWidth,h=img.naturalHeight;
  const src=coverBlob(uri)||img,bmp=w>target?await g.createImageBitmap(src,{resizeWidth:target,resizeHeight:Math.round(h*target/w),resizeQuality:'high'}):await g.createImageBitmap(src);
  BITMAPS.set(uri,bmp);return bmp;}catch{return null;}
}
export function peekCover(id:string):string{if(!id)return '';try{const d=pageCoverDestination(id) as any;return d?.exists&&d.uri?String(d.uri):'';}catch{return '';}}
const prefetching=new Set<string>();
export function prefetchPageCover(api:SofiaApi,data:Record<string,any>|undefined):Promise<void>{const id=String(data?.cover_attachment_id||'');if(data?.cover_type!=='attachment'||!id||prefetching.has(id))return Promise.resolve();{const have=peekCover(id);if(have){if(!BITMAPS.has(have)&&Platform.OS==='web'){try{const pic=new (globalThis as any).Image();pic.src=have;return makeBitmap(have,pic).then(()=>{});}catch{}}return Promise.resolve();}}prefetching.add(id);
 return cachedPageCover(api.attachmentSource(id),id,false,0).then(uri=>{if(Platform.OS==='web'&&uri){try{const pic=new (globalThis as any).Image();pic.decoding='sync';pic.src=uri;void makeBitmap(uri,pic);void (pic.decode?pic.decode():Promise.resolve()).then(()=>{if(!DECODED.has(uri))DECODED.set(uri,pic);}).catch(()=>{});}catch{/* sem decode */}}if(Platform.OS==='web'&&uri)Image.getSize(uri,(w,h)=>{if(w>0&&h>0)IMAGE_SIZES.set(uri,{w,h});},()=>{});}).catch(()=>{}).finally(()=>prefetching.delete(id)) as Promise<void>;}

// 05/11/2026 (Pedro: "quando carregar, todas as paginas ja ficam carregando em segundo plano, ja que o usuario entra no
// Inicio primeiro"): logo depois que o Inicio abre, as capas de TODAS as paginas descem em segundo plano, duas por vez,
// nos momentos livres do navegador. Ao entrar numa pagina a capa ja esta pronta (sem piscar).
let queued=new Set<string>();
// 06/11/2026 (Pedro: "o boa noite ta pulando, o fade pisca no final"): comecava 0,3 s depois de abrir, no meio da abertura,
// duas capas por vez - preparar as fotos roubava quadros da animacao. Agora espera a abertura terminar (4,5 s) e vai uma por vez.
export function prefetchAllCovers(api:SofiaApi,pages:{data?:Record<string,any>}[],delay=4500):()=>void{
 if(Platform.OS!=='web')return ()=>{};
 const todo=pages.map(p=>p.data).filter(d=>d?.cover_type==='attachment'&&d.cover_attachment_id&&!queued.has(String(d.cover_attachment_id))&&!peekCover(String(d.cover_attachment_id)));
 for(const d of todo)queued.add(String(d!.cover_attachment_id));
 let stop=false;const g:any=globalThis;
 const idle=(fn:()=>void)=>g.requestIdleCallback?g.requestIdleCallback(fn,{timeout:2000}):setTimeout(fn,200);
 const worker=async()=>{while(!stop&&todo.length){const d=todo.shift()!;await new Promise<void>(r=>idle(()=>r()));if(stop)break;await prefetchPageCover(api,d).catch(()=>{});}};
 const t=setTimeout(()=>{void worker();},delay);
 return ()=>{stop=true;clearTimeout(t);for(const d of todo)queued.delete(String(d!.cover_attachment_id));};
}
