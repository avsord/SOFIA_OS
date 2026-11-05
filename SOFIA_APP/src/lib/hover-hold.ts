// 05/11/2026 (Pedro: "esses botoes estao bugados, quando vai em cima eles somem"): no site, o "hovered" de um Pressable
// vira falso quando o mouse entra num botao filho dele. Botoes que aparecem no hover usam este estado: o pai e os
// filhos chamam enter/leave, e o sumico espera um instante (passar do pai para o filho nao pisca nem some).
import {useCallback,useEffect,useRef,useState} from 'react';
export function useHoverHold(delay=160){
 const [on,setOn]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const enter=useCallback(()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;setOn(true);},[]);
 const leave=useCallback(()=>{if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setOn(false),delay);},[delay]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 return {on,enter,leave};
}
/** Mesmo comportamento para uma lista (guarda qual item está com o mouse). */
export function useHoverKey(delay=160){
 const [key,setKey]=useState<string|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const enter=useCallback((k:string)=>{if(timer.current)clearTimeout(timer.current);timer.current=null;setKey(k);},[]);
 const leave=useCallback(()=>{if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setKey(null),delay);},[delay]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 return {key,enter,leave};
}
