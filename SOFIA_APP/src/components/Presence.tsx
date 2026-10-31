import React,{useEffect,useRef,useState} from 'react';
/** 0.3.268: janelas que eram montadas so quando abertas ({x ? <Janela/> : null}) sumiam num corte seco ao fechar.
 * <Presence> segura o ultimo conteudo por um instante e avisa as janelas (Sheet/MotionModal) que estao fechando:
 * elas fazem a mesma animacao da abertura, ao contrario, e so depois saem da tela. */
export const PresenceClosing=React.createContext(false);
const EXIT_MS=420;
export function Presence({children}:{children:React.ReactNode}){
 const open=children!==null&&children!==undefined&&children!==false;
 const last=useRef<React.ReactNode>(null),[,force]=useState(0);
 if(open)last.current=children;
 useEffect(()=>{
  if(open||!last.current)return;
  const t=setTimeout(()=>{last.current=null;force(n=>n+1);},EXIT_MS);
  return()=>clearTimeout(t);
 },[open]);
 if(open)return <>{children}</>;
 if(!last.current)return null;
 return <PresenceClosing.Provider value={true}>{last.current}</PresenceClosing.Provider>;
}
