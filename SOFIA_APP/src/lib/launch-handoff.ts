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
/** 07/11/2026 (Pedro: "so o fade, rapido, com uma bola de loading no meio"): abrindo no Inicio, o veu (com a bolinha) espera o
 * Inicio ter os dados (releaseVeil) em vez de sair na montagem; nunca passa de 6 s. */
let held=false,heldBg:string|undefined;
export function holdVeil(maxMs=6000){if(Platform.OS!=='web'||veilOut)return;held=true;setTimeout(releaseVeil,maxMs);}
export function releaseVeil(){if(!held)return;held=false;revealWebVeil(heldBg);}
export function revealWebVeil(bg?: string){
 if(Platform.OS!=='web'||typeof document==='undefined'||veilOut)return;
 if(held){heldBg=bg;return;}
 const veil=document.getElementById('sofia-veil');veilOut=true;veilSubs.forEach(f=>f());if(!veil)return;
 if(bg){veil.style.background=bg;try{localStorage.setItem('sofia.veil.bg',bg);}catch{/* modo privado */}} /* a proxima abertura ja cobre com a cor do tema do app (assets/early.js) */
 requestAnimationFrame(()=>{veil.classList.add('out');setTimeout(()=>veil.remove(),260);}); /* 07/11/2026 (Pedro): fade rapido (0,18 s) na cor do fundo; sem bolinha */
}
