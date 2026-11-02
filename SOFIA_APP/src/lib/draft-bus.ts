import {useEffect} from 'react';
/** 0.3.331 (Pedro): o Inicio manda um rascunho ja preenchido (ex.: o horario clicado na linha do tempo) para o editor de
 * outra funcao (Tarefas, Lembretes, Rotina) e abre essa funcao; a tela pega o rascunho quando fica ativa e abre o editor. */
export type DraftChannel='task'|'reminder'|'capsule';
const pending=new Map<DraftChannel,unknown>(),subs=new Map<DraftChannel,Set<()=>void>>();
export function sendDraft(ch:DraftChannel,draft:unknown){pending.set(ch,draft);subs.get(ch)?.forEach(f=>f());}
export function useDraft<T>(ch:DraftChannel,active:boolean,open:(draft:T)=>void){
 useEffect(()=>{const check=()=>{if(!active||!pending.has(ch))return;const d=pending.get(ch) as T;pending.delete(ch);open(d);};
  check();const set=subs.get(ch)||new Set<()=>void>();subs.set(ch,set);set.add(check);return()=>{set.delete(check);};},[active]);
}
