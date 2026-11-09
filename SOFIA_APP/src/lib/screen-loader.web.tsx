import {perfSync} from './fluency-metrics';
import React from 'react';
import {ScreenBoundary} from '../components/ScreenBoundary';
import {ScreenSkeleton} from '../components/ScreenSkeleton';

type Screen=React.ComponentType<any>;
const cache=new Map<string,Screen>();
function once(name:string,load:()=>Screen):Screen{
 const existing=cache.get(name);if(existing)return existing;
 const Loaded=perfSync('module:'+name,load);
 const Bounded=(props:any)=><ScreenBoundary name={name}><Loaded {...props}/></ScreenBoundary>;
 const component=React.memo(Bounded) as unknown as Screen;cache.set(name,component);return component;
}
/** 0.3.263 (fase 4 — velocidade): versao do SITE (Metro escolhe este arquivo no web). As telas que nao sao a primeira
 * viram arquivos separados (import() dinamico) e so baixam quando abertas: o arquivo principal fica menor. O app do
 * celular usa screen-loader.tsx (require de sempre: tudo ja esta no aparelho). */
/** 07/11/2026: enquanto o arquivo da tela baixa, mostra o esqueleto (antes era so o fundo vazio). */
const SKELETON_TABS=new Set(['chat','pages','agenda','apps','profile']);
const webLazy=new Map<string,Screen>();
function lazyScreen(name:string,load:()=>Promise<Screen>):Screen{
 const existing=webLazy.get(name);if(existing)return existing;
 const Lazy=React.lazy(()=>load().then(component=>({default:component})));
 const Wrapped=(props:any)=><ScreenBoundary name={name}><React.Suspense fallback={SKELETON_TABS.has(name)?<ScreenSkeleton tab={name} pageId={name==='pages'?String(props?.openPageId||''):undefined}/>:null}><Lazy {...props}/></React.Suspense></ScreenBoundary>;
 const component=React.memo(Wrapped) as unknown as Screen;webLazy.set(name,component);return component;
}
/** Literal requires stay inside loaders so Metro/Hermes does not execute the
 * heavy screen module before that screen is warmed or selected.
 */
export const loadHomeCommitmentEditor=()=>once('home-commitment-editor',()=>require('../components/HomeCommitmentEditor').HomeCommitmentEditor);
export const loadHomeTaskDetails=()=>once('home-task-details',()=>require('../components/HomeTaskDetails').HomeTaskDetails);
export const loadHome=()=>once('home',()=>require('../screens/Home').Home);
export const loadChat=()=>lazyScreen('chat',()=>import('../screens/Chat').then(m=>m.Chat));
export const loadPages=()=>lazyScreen('pages',()=>import('../screens/Pages').then(m=>m.Pages));
export const loadAgenda=()=>lazyScreen('agenda',()=>import('../screens/Agenda').then(m=>m.Agenda));
export const loadWorkspace=()=>lazyScreen('apps',()=>import('../screens/Workspace').then(m=>m.Workspace));
export const loadEntityEditor=()=>lazyScreen('entity-editor',()=>import('../screens/Workspace').then(m=>m.EntityEditor));
export const loadProfile=()=>lazyScreen('profile',()=>import('../screens/Profile').then(m=>m.Profile));
export const loadNotifications=()=>lazyScreen('notifications',()=>import('../screens/Notifications').then(m=>m.Notifications));
export const loadSofiaFiles=()=>lazyScreen('sofia-files',()=>import('../components/SofiaFiles').then(m=>m.SofiaFiles));
export const loadBackgroundServices=()=>once('background-services',()=>require('../components/BackgroundServices').BackgroundServices);

// Prepare lazy module definitions, without mounting hidden screens or fetching data.
export const MENU_PRELOADERS=[loadChat,loadAgenda,loadPages,loadWorkspace,loadProfile] as const;
/** 0.3.268 (site): depois de entrar, baixa em segundo plano os arquivos de todas as telas, para a troca de menu
 * nao esperar download (era o que fazia o esqueleto piscar no canto). So baixa: nao monta nada escondido. */
let prefetched=false;
export function prefetchWebScreens(){
 if(prefetched)return;prefetched=true;
 const idle=(fn:()=>void)=>{const w=globalThis as any;if(typeof w.requestIdleCallback==='function')w.requestIdleCallback(fn,{timeout:2500});else setTimeout(fn,600);};
 idle(()=>{void Promise.all([import('../screens/Chat'),import('../screens/Agenda'),import('../screens/Pages'),import('../screens/Workspace'),import('../screens/Profile'),import('../screens/Notifications')]).catch(()=>{prefetched=false;});});
}

/** Skip unchanged hidden screens when the active tab changes.
 * Creating new JSX/props objects must not rerender chat history, workspaces,
 * calendar grids, or Page trees on each bottom-menu press. */
function DeferredBody({load,screenProps}:{load:()=>Screen;screenProps:Record<string,unknown>}){
 // load() evaluates the screen module during render; an error there used to skip
 // every screen boundary and reach the global one.
 const Component=load();
 // Toque no menu: a troca de aba (o salto do paginador) precisa só de um
 // commit leve. A tela inteira que entra/sai redesenhar com o novo `active`
 // custava 100–230 ms ANTES do salto. Com o valor adiado, o primeiro commit
 // reaproveita a tela memorizada (mesmas props) e o redesenho com o `active`
 // novo vem logo depois, em prioridade baixa, sem segurar o toque.
 const active=screenProps.active;
 const deferredActive=React.useDeferredValue(active);
 // Só a tela que SAI (active=false) fica com o valor adiado. A que ENTRA desenha
 // já ativa: desenhar um quadro com o 'active' antigo e depois o novo causava a
 // piscada ao sair do Price Tracker para a Agenda.
 const props=active!==false||Object.is(deferredActive,active)?screenProps:{...screenProps,active:deferredActive};
 return <Component {...props}/>;
}
export const DeferredScreen=React.memo(function DeferredScreen({load,screenProps}:{load:()=>Screen;screenProps:Record<string,unknown>}){
 return <ScreenBoundary name="deferred"><DeferredBody load={load} screenProps={screenProps}/></ScreenBoundary>;
},(a,b)=>{
 if(a.load!==b.load)return false;
 const left=a.screenProps,right=b.screenProps;
 const keys=Object.keys(left);
 return keys.length===Object.keys(right).length&&keys.every(key=>Object.is(left[key],right[key]));
});
