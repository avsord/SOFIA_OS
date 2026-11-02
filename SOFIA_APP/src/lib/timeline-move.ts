// 0.3.317 (Pedro): arrastar na linha do tempo do Inicio muda SO aquela vez. A ocorrencia movida fica guardada no
// proprio registro numa marca "sofia-move-v1:<inicio original>><novo inicio>" (as duas em ISO). A repeticao, os
// outros dias e o horario do cadastro nao mudam. Tarefas usam o horario combinado do servidor (planned_due_at)
// em vez desta marca: na virada do dia, a nao feita volta para o horario combinado (lib/task-rollover). Arquivo sem dependencias: o servidor (agendador) tem a mesma regra em JS.
export const MOVE_PREFIX='sofia-move-v1:';
/** 0.3.323: instante em minutos UTC ("2026-11-02T17:00Z") - a marca inteira cabe no limite de 60 letras do servidor
 * (com segundos e milissegundos dava 63 e o servidor recusava: o item voltava para o lugar). */
export const moveStamp=(iso:string|number|Date)=>{const d=new Date(iso);return Number.isFinite(d.getTime())?d.toISOString().slice(0,16)+'Z':'';};
export const isMoveTag=(t:string)=>typeof t==='string'&&t.startsWith(MOVE_PREFIX);
/** Mapa inicio original (minuto UTC, moveStamp) -> novo inicio (ISO). */
export function readMoves(tags?:string[]|null):Map<string,string>{
 const out=new Map<string,string>();
 for(const t of tags||[]){if(!isMoveTag(t))continue;const [from,to]=t.slice(MOVE_PREFIX.length).split('>');if(from&&to&&Number.isFinite(Date.parse(from))&&Number.isFinite(Date.parse(to)))out.set(moveStamp(from),new Date(to).toISOString());}
 return out;
}
/** Marcas com a ocorrencia `from` levada para `to` (sem `to`, ou `to` igual a `from`, desfaz). Marcas de mais de 60 dias saem. */
export function withMove(tags:string[]|undefined|null,from:string,to:string|null,now=Date.now()):string[]{
 // a origem vem como ISO (compromisso/lembrete) ou "dia T hora" local (dose); o destino sempre vira minuto UTC
 const old=now-60*864e5,isDose=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(from),key=isDose?from:moveStamp(from),dest=to?moveStamp(to):'';
 const same=(f:string)=>isDose?f===key:moveStamp(f)===key;
 let kept=(tags||[]).filter(t=>{if(!isMoveTag(t))return true;const [f,d]=t.slice(MOVE_PREFIX.length).split('>');if(same(f))return false;const last=Math.max(Date.parse(f)||0,Date.parse(d||'')||0);return last>=old;});
 // o servidor aceita ate 20 marcas por registro: guarda no maximo as 8 mudancas mais recentes
 const moves=kept.filter(isMoveTag);if(moves.length>=8){const drop=new Set(moves.slice(0,moves.length-7));kept=kept.filter(t=>!drop.has(t));}
 const unchanged=!dest||(isDose?Math.abs(Date.parse(dest)-new Date(key+':00').getTime())<60000:dest===key);
 return unchanged?kept:[...kept,MOVE_PREFIX+key+'>'+dest];
}
/** Dose da Rotina: a chave original e "<dia>T<hora>" (ex.: 2026-11-02T16:00). */
export const doseFrom=(day:string,time:string)=>day+'T'+time;
export function readDoseMoves(tags?:string[]|null):Map<string,string>{
 const out=new Map<string,string>();
 for(const t of tags||[]){if(!isMoveTag(t))continue;const [from,to]=t.slice(MOVE_PREFIX.length).split('>');if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(from||'')&&Number.isFinite(Date.parse(to||'')))out.set(from,to);}
 return out;
}
