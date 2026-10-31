import {perfSync} from './fluency-metrics';
import React from 'react';
import {ScreenBoundary} from '../components/ScreenBoundary';

type Screen=React.ComponentType<any>;
const cache=new Map<string,Screen>();
function once(name:string,load:()=>Screen):Screen{
 const existing=cache.get(name);if(existing)return existing;
 const Loaded=perfSync('module:'+name,load);
 const Bounded=(props:any)=><ScreenBoundary name={name}><Loaded {...props}/></ScreenBoundary>;
 const component=React.memo(Bounded) as unknown as Screen;cache.set(name,component);return component;
}
/** Literal requires stay inside loaders so Metro/Hermes does not execute the
 * heavy screen module before that screen is warmed or selected.
 */
export const loadHomeCommitmentEditor=()=>once('home-commitment-editor',()=>require('../components/HomeCommitmentEditor').HomeCommitmentEditor);
export const loadHomeTaskDetails=()=>once('home-task-details',()=>require('../components/HomeTaskDetails').HomeTaskDetails);
export const loadHome=()=>once('home',()=>require('../screens/Home').Home);
export const loadChat=()=>once('chat',()=>require('../screens/Chat').Chat);
export const loadPages=()=>once('pages',()=>require('../screens/Pages').Pages);
export const loadAgenda=()=>once('agenda',()=>require('../screens/Agenda').Agenda);
export const loadWorkspace=()=>once('apps',()=>require('../screens/Workspace').Workspace);
export const loadEntityEditor=()=>once('entity-editor',()=>require('../screens/Workspace').EntityEditor);
export const loadProfile=()=>once('profile',()=>require('../screens/Profile').Profile);
export const loadNotifications=()=>once('notifications',()=>require('../screens/Notifications').Notifications);
export const loadSofiaFiles=()=>once('sofia-files',()=>require('../components/SofiaFiles').SofiaFiles);
export const loadBackgroundServices=()=>once('background-services',()=>require('../components/BackgroundServices').BackgroundServices);

// Prepare lazy module definitions, without mounting hidden screens or fetching data.
export const MENU_PRELOADERS=[loadChat,loadAgenda,loadPages,loadWorkspace,loadProfile] as const;
/** So o site baixa telas em segundo plano (ver screen-loader.web.tsx); no celular tudo ja esta no aparelho. */
export function prefetchWebScreens(){}

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
