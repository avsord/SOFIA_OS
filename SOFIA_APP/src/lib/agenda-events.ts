const listeners=new Set<(owner:object)=>void>();
export function agendaChanged(owner:object){listeners.forEach(f=>f(owner));}
export function subscribeAgenda(f:(owner:object)=>void){listeners.add(f);return()=>{listeners.delete(f);};}
/** 0.3.351: aviso pontual de registro apagado (tarefa ou compromisso) - o Inicio tira da linha do tempo na mesma hora,
 * sem esperar a releitura do servidor, que so confirma depois. */
const removed=new Set<(owner:object,id:string)=>void>();
export function recordRemoved(owner:object,id:string){removed.forEach(f=>f(owner,id));}
export function subscribeRecordRemoved(f:(owner:object,id:string)=>void){removed.add(f);return()=>{removed.delete(f);};}
