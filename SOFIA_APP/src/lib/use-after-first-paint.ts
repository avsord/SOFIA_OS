import {useEffect,useState} from 'react';
import {NativeModules} from 'react-native';
/** Native confirmation owns the post-paint fence, not the React shell's first
 * layout. Optional services must not compete with the first usable Home frame. */
export function useAfterFirstPaint(enabled:boolean){
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  setReady(false);if(!enabled)return;
  let alive=true,first=0,second=0;
  const done=()=>{if(alive)setReady(true);};
  const fallback=()=>{if(alive)first=requestAnimationFrame(()=>{second=requestAnimationFrame(done);});};
  const wait=NativeModules.SofiaLaunch?.whenInteractive;
  if(wait)void wait().then((ok:boolean)=>{if(!alive)return;if(ok)first=requestAnimationFrame(done);else fallback();}).catch(fallback);
  else fallback();
  // 10/11/2026: no site, aba escondida nao desenha quadros; o relogio garante que a abertura continue
  const clock=typeof document!=='undefined'&&typeof setTimeout==='function'?setTimeout(done,1500):null;
  return()=>{alive=false;cancelAnimationFrame(first);cancelAnimationFrame(second);if(clock)clearTimeout(clock);};
 },[enabled]);
 return enabled&&ready;
}
