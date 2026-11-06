import {newFluency,queueOptional} from '../lib/fluency';
import {useRenderCost} from '../lib/render-cost';
import React,{useEffect,useRef} from 'react';
import {AppState,Platform} from 'react-native';
import {PriceReaderHost,previewToReader,setWebPriceSource} from '../lib/price-reader';
import {runCollection,cancelCollection} from '../lib/monitor-collector';
import {registerBackgroundNotices} from '../lib/background-notify';
import {scheduleIdleTask} from '../lib/idle-task';
import type {SofiaApi} from '../lib/api';
import {preloadAgenda} from '../lib/use-agenda-month';
import {useCapsuleNotifications} from '../lib/capsule-notifications';
import {useAgendaNotifications} from '../lib/agenda-notifications';
export function BackgroundServices({api,scope,enabled,preloadWhenIdle=true,onCapsules,onAgenda}:{api:SofiaApi;scope:string;enabled:boolean|null;preloadWhenIdle?:boolean;onCapsules:()=>void;onAgenda:(date:string,id?:string,create?:boolean)=>void}){useRenderCost('background-services');
 const started=useRef<SofiaApi|null>(null);
 // Large background catalog/chat/network refreshes used to race the first
 // menu taps. Leave Home instantly usable from saved data; begin optional
 // read-ahead only after Home remains active and the JS thread is idle.
 useEffect(()=>{
 // 06/11/2026: no site, o preco das lojas e lido pelo servidor (nao ha navegador invisivel)
 React.useEffect(()=>{if(Platform.OS!=='web')return;setWebPriceSource(url=>api.linkPreview(url).then(previewToReader));return()=>setWebPriceSource(null);},[api]);
  if(!enabled||!preloadWhenIdle||started.current===api)return;
  if(newFluency()){
   if(started.current===api)return;
   const paths=['/workspace/catalog','/workspace/entities?limit=100&kind=user_page&q=&offset=0','/conversations?offset=0','/md/dashboard'];
   const cancellations=paths.map((path,i)=>queueOptional('prefetch:'+['apps','pages','chat','home'][i],()=>{void api.prefetchCache(path).catch(()=>{});},6));
   started.current=api;
   return()=>{cancellations.forEach(cancel=>cancel());started.current=null;};
  }
  let cancel=()=>{};
  const timer=setTimeout(()=>{cancel=scheduleIdleTask(()=>{
   if(started.current===api)return;
   started.current=api;
   void api.preload(()=>preloadAgenda(api)).catch(()=>{});
  });},3400);
  return()=>{clearTimeout(timer);cancel();};
 },[api,enabled,preloadWhenIdle]);
 useCapsuleNotifications(api,scope,enabled,onCapsules);
 useAgendaNotifications(api,scope,enabled,onAgenda);
 // Monitoramento: a primeira coleta espera a abertura terminar (45 s) e as
 // seguintes só leem o que venceu o intervalo de cada produto. Uma página
 // por vez; Mercado Livre no servidor, outras lojas na WebView. Nada na primeira tela.
 useEffect(()=>{if(!enabled)return;const tick=()=>{if(AppState.currentState==='active')void runCollection(api,{scope});};const first=setTimeout(tick,45000),every=setInterval(tick,15*60000);return()=>{clearTimeout(first);clearInterval(every);cancelCollection(api);};},[api,scope,enabled]);
 useEffect(()=>{if(!enabled)return;const t=setTimeout(()=>{void registerBackgroundNotices();},60000);return()=>clearTimeout(t);},[enabled]);
 return enabled?<PriceReaderHost/>:null;
}
