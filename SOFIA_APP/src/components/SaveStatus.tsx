import React,{useEffect,useRef,useState} from 'react';

/** 13/11/2026 (Pedro: "o salvando/sincronizando fica histérico a cada tecla"): antes o texto pulava entre
 * Particular -> Sincronizando… -> Salvando… -> Particular a cada pausa. Agora é um aviso calmo: "Salvando…" enquanto
 * houver algo para salvar (fica pelo menos 0,6 s, sem piscar) e depois "Salvo" parado. Erro/conflito usam o texto de
 * sempre (fallback). Vai dentro de um <Text> (devolve só o texto, sem mudar o tamanho da faixa). */
export type SaveLabelState='saved'|'pending'|'saving'|'error'|'conflict'|'secret'|string;
export function nextSaveLabel(prev:'idle'|'busy'|'done',state:SaveLabelState):'idle'|'busy'|'done'|'wait'{
 if(state==='pending'||state==='saving')return 'busy';
 if(state==='saved')return prev==='busy'?'wait':prev;
 return 'idle';
}
export function SaveStatus({state,fallback}:{state:SaveLabelState;fallback:string}){
 const [shown,setShown]=useState<'idle'|'busy'|'done'>(state==='pending'||state==='saving'?'busy':'idle'),since=useRef(Date.now());
 useEffect(()=>{const next=nextSaveLabel(shown,state);
  if(next==='busy'){if(shown!=='busy'){since.current=Date.now();setShown('busy');}return;}
  if(next==='wait'){const t=setTimeout(()=>setShown('done'),Math.max(0,600-(Date.now()-since.current)));return()=>clearTimeout(t);}
  if(next!==shown)setShown(next);
 },[state,shown]);
 const text=state==='error'||state==='conflict'||state==='secret'?fallback:shown==='busy'?'Salvando…':shown==='done'?'Salvo':fallback;
 return <>{text}</>;
}
