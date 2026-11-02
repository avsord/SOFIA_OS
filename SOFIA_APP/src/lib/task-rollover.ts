import type {Task} from './types';
import {localDateKey} from './dashboard';
/** 0.3.255: tarefa que subiu para a agenda (estado "scheduled") e nao foi ticada passa sozinha para o dia seguinte
 * a meia-noite, no mesmo horario. Ticada (concluida) fica riscada no dia dela e nao anda. */
export type Rollover={task:Task;due:string;end:string};
export function overdueScheduled(tasks:Task[],now=new Date()):Rollover[]{
 const today=localDateKey(now),out:Rollover[]=[];
 for(const t of tasks){
  if(t.state!=='scheduled'||!t.due_at)continue;
  const d=new Date(t.due_at);if(!Number.isFinite(d.getTime())||localDateKey(d)>=today)continue;
  // 0.3.317 (Pedro): tarefa arrastada na linha do tempo e nao feita volta para o horario COMBINADO (planned_due_at),
  // nao para onde foi arrastada. A gravacao normal da virada limpa o combinado (o horario dela passa a ser esse).
  const plannedMs=t.planned_due_at&&t.planned_due_at!==t.due_at?Date.parse(t.planned_due_at):NaN,h=Number.isFinite(plannedMs)?new Date(plannedMs):d;
  const next=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h.getHours(),h.getMinutes(),0,0);
  const endMs=t.end_at?Date.parse(t.end_at):NaN,end=Number.isFinite(endMs)&&endMs>d.getTime()?new Date(next.getTime()+(endMs-d.getTime())).toISOString():'';
  out.push({task:t,due:next.toISOString(),end});
 }
 return out;
}
/** Milissegundos ate a proxima meia-noite local (+1 s de folga). */
export function msToMidnight(now=new Date()):number{return new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,1).getTime()-now.getTime();}
