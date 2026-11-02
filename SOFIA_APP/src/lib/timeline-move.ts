// 0.3.317 (Pedro): arrastar na linha do tempo do Inicio muda SO aquela vez. A ocorrencia movida fica guardada no
// proprio registro numa marca "sofia-move-v1:<inicio original>><novo inicio>" (as duas em ISO). A repeticao, os
// outros dias e o horario do cadastro nao mudam. Tarefas usam o horario combinado do servidor (planned_due_at)
// em vez desta marca: na virada do dia, a nao feita volta para o horario combinado (lib/task-rollover). Arquivo sem dependencias: o servidor (agendador) tem a mesma regra em JS.
export const MOVE_PREFIX='sofia-move-v1:';
export const isMoveTag=(t:string)=>typeof t==='string'&&t.startsWith(MOVE_PREFIX);
/** Mapa inicio original (ISO) -> novo inicio (ISO). */
export function readMoves(tags?:string[]|null):Map<string,string>{
 const out=new Map<string,string>();
 for(const t of tags||[]){if(!isMoveTag(t))continue;const [from,to]=t.slice(MOVE_PREFIX.length).split('>');if(from&&to&&Number.isFinite(Date.parse(from))&&Number.isFinite(Date.parse(to)))out.set(from,to);}
 return out;
}
/** Marcas com a ocorrencia `from` levada para `to` (sem `to`, ou `to` igual a `from`, desfaz). Marcas de mais de 60 dias saem. */
export function withMove(tags:string[]|undefined|null,from:string,to:string|null,now=Date.now()):string[]{
 const old=now-60*864e5;
 const kept=(tags||[]).filter(t=>{if(!isMoveTag(t))return true;const [f,dest]=t.slice(MOVE_PREFIX.length).split('>');if(f===from)return false;const last=Math.max(Date.parse(f)||0,Date.parse(dest||'')||0);return last>=old;});
 return to&&to!==from?[...kept,MOVE_PREFIX+from+'>'+to]:kept;
}
/** Dose da Rotina: a chave original e "<dia>T<hora>" (ex.: 2026-11-02T16:00). */
export const doseFrom=(day:string,time:string)=>day+'T'+time;
export function readDoseMoves(tags?:string[]|null):Map<string,string>{
 const out=new Map<string,string>();
 for(const t of tags||[]){if(!isMoveTag(t))continue;const [from,to]=t.slice(MOVE_PREFIX.length).split('>');if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(from||'')&&Number.isFinite(Date.parse(to||'')))out.set(from,to);}
 return out;
}
