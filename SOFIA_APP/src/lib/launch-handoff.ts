import {NativeModules, Platform} from 'react-native';
/** The native layout listener is primary. This idempotent backup runs for each
 * mounted shell; no process-global flag can strand a recreated Activity. */
export function finishLaunchHandoff(){
 const frame=requestAnimationFrame(()=>{
  try{void NativeModules.SofiaLaunch?.hide?.().catch?.(()=>{});}catch{}
 });
 return()=>cancelAnimationFrame(frame);
}

/** 04/11/2026 (Pedro: "quando abre o site, um fade rapido de toda a tela com a cor do site"): no site o veu de
 * public/index.html (cor do fundo) cobre a montagem; com o app pronto, ganha a cor do tema do app e some. Quem depende
 * do momento em que a tela aparece (a abertura do Inicio) escuta isVeilOut/subscribeVeil. */
let veilOut=false;const veilSubs=new Set<()=>void>();
export function isVeilOut(){return Platform.OS!=='web'||veilOut||typeof document==='undefined'||!document.getElementById('sofia-veil');}
export function subscribeVeil(f:()=>void){veilSubs.add(f);return()=>{veilSubs.delete(f);};}
export function revealWebVeil(bg?: string){
 if(Platform.OS!=='web'||typeof document==='undefined'||veilOut)return;
 const veil=document.getElementById('sofia-veil');veilOut=true;veilSubs.forEach(f=>f());if(!veil)return;
 if(bg)veil.style.background=bg;
 requestAnimationFrame(()=>{veil.classList.add('out');setTimeout(()=>veil.remove(),1100);});
}
