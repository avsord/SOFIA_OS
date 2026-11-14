import React,{useEffect,useRef,useState} from 'react';

/** 13/11/2026 (Pedro: "o salvando/sincronizando fica histérico a cada tecla"): antes o texto pulava entre
 * Particular -> Sincronizando… -> Salvando… -> Particular a cada pausa.
 * 13/11/2026 noite (Pedro: "fica salvando de forma desenfreada, aparecendo lá em cima; salva mais parecido com o Notion"):
 * o Notion salva calado — nada aparece enquanto se digita, e "Salvando…" só surge se a gravação demora (rede lenta ou sem
 * internet). Aqui igual: o topo continua mostrando o de sempre (fallback); "Salvando…" só depois de SLOW_SAVE_MS seguidos
 * gravando no servidor, e some assim que salvar (sem "Salvo"). Erro/conflito usam o texto de sempre (fallback).
 * Vai dentro de um <Text> (devolve só o texto, sem mudar o tamanho da faixa). */
export type SaveLabelState='saved'|'pending'|'saving'|'error'|'conflict'|'secret'|string;
export const SLOW_SAVE_MS=2500;
/** busyMs = há quanto tempo há algo por salvar sem parar (null = nada por salvar). */
export function saveLabelFor(state:SaveLabelState,busyMs:number|null):'quiet'|'slow'{
 return state==='saving'&&busyMs!=null&&busyMs>=SLOW_SAVE_MS?'slow':'quiet';
}
/** Mantido para quem ainda importa (testes antigos): estado do aviso antigo. */
export function nextSaveLabel(prev:'idle'|'busy'|'done',state:SaveLabelState):'idle'|'busy'|'done'|'wait'{
 if(state==='pending'||state==='saving')return 'busy';
 if(state==='saved')return prev==='busy'?'wait':prev;
 return 'idle';
}
export function SaveStatus({state,fallback}:{state:SaveLabelState;fallback:string}){
 // 'pending' = esperando parar de digitar (normal, nunca aparece); conta so o tempo GRAVANDO de fato
 const busy=state==='saving',since=useRef<number|null>(busy?Date.now():null),[slow,setSlow]=useState(false);
 useEffect(()=>{
  if(!busy){since.current=null;if(slow)setSlow(false);return;}
  if(since.current==null)since.current=Date.now();
  const left=SLOW_SAVE_MS-(Date.now()-since.current);if(left<=0){if(!slow)setSlow(true);return;}
  const t=setTimeout(()=>setSlow(true),left);return()=>clearTimeout(t);
 },[busy,slow]);
 const text=state==='error'||state==='conflict'||state==='secret'?fallback:busy&&slow?'Salvando…':fallback;
 return <>{text}</>;
}
