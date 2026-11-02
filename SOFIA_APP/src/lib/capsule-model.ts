import type {Entity} from './types';
export const capsuleDay=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function capsuleOccurs(data:any,day:string):boolean{
 const start=data.start_date;if(!start||day<start||(data.end_date&&day>data.end_date))return false;
 const date=new Date(day+'T12:00:00Z'),anchor=new Date(start+'T12:00:00Z');if(!Number.isFinite(date.getTime())||!Number.isFinite(anchor.getTime()))return false;
 const mode=data.repeat_type||'daily';
 if(mode==='once')return day===start;
 if(mode==='weekdays'){try{return JSON.parse(data.weekdays_json||'[]').includes(date.getUTCDay());}catch{return false;}}
 if(mode==='interval')return Math.round((date.getTime()-anchor.getTime())/86400000)%Math.max(1,Number(data.interval_days)||1)===0;
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
 if(mode==='monthly')return date.getUTCDate()===Math.min(anchor.getUTCDate(),last);
 if(mode==='yearly')return date.getUTCMonth()===anchor.getUTCMonth()&&date.getUTCDate()===Math.min(anchor.getUTCDate(),last);
 return mode==='daily';
}
// 0.3.154: depois de MISSED_AFTER_MS sem tomar, a dose deixa de ser "Hora de tomar" (vermelha) e vira "Nao tomada" (discreta).
export const MISSED_AFTER_MS=6*3600000;
export type CapsuleDose={key:string;plan:Entity;day:string;time:string;date:Date;taken?:Entity;due:boolean;missed:boolean};
export function capsuleTimes(plan:Entity):string[]{try{const times=JSON.parse(plan.data.times_json);return Array.isArray(times)?[...new Set(times.filter((t:unknown):t is string=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort():[];}catch{return [];}}
export function capsuleKey(id:string,day:string,time:string){return `${id}:${day}:${time}`;}
/** 0.3.313 (Pedro: "mudei o horario de uma capsula e apareceram varias atrasadas"): o registro de "tomei" guarda o
 * horario da epoca. Quando o horario muda, o registro antigo (horario que nao existe mais) continua valendo para o
 * dia: cobre o primeiro horario de hoje que ficou sem registro. Assim mudar o horario nao desfaz o que ja foi tomado. */
export function takenFor(plan:Entity,day:string,times:string[],history:Entity[]):Map<string,Entity>{
 const mine=history.filter(r=>r.data?.capsule_id===plan.id&&r.data?.day===day),out=new Map<string,Entity>();
 for(const t of times){const r=mine.find(x=>x.data.time===t);if(r)out.set(t,r);}
 const orphans=mine.filter(r=>!times.includes(r.data.time)).sort((a,b)=>String(a.data.time).localeCompare(String(b.data.time)));
 for(const t of [...times].sort()){if(!orphans.length)break;if(!out.has(t))out.set(t,orphans.shift()!);}
 return out;
}
/** 0.3.317 (Pedro): dose arrastada na linha do tempo do Inicio muda SO aquele dia - marca no plano
 * "sofia-move-v1:<dia>T<hora>><novo inicio ISO>" (a mesma de lib/timeline-move.ts). Dia/hora da dose (chave do "tomei")
 * continuam os originais; so o horario mostrado e o do aviso mudam. */
export function doseDate(plan:Entity,day:string,time:string):Date{
 const k='sofia-move-v1:'+day+'T'+time+'>';const t=(plan.tags||[]).find(x=>typeof x==='string'&&x.startsWith(k));
 if(t){const d=new Date(t.slice(k.length));if(Number.isFinite(d.getTime()))return d;}
 return new Date(day+'T'+time+':00');
}
export function capsuleDoses(plans:Entity[],history:Entity[],day=capsuleDay(new Date()),now=new Date()):CapsuleDose[]{return plans.filter(p=>p.state==='active'&&capsuleOccurs(p.data,day)).flatMap(plan=>{const times=capsuleTimes(plan),taken=takenFor(plan,day,times,history);return times.map(time=>{const date=doseDate(plan,day,time),key=capsuleKey(plan.id,day,time);return {key,plan,day,time,date,taken:taken.get(time),due:date.getTime()<=now.getTime(),missed:now.getTime()-date.getTime()>MISSED_AFTER_MS};});}).sort((a,b)=>a.date.getTime()-b.date.getTime()||a.plan.title.localeCompare(b.plan.title));}
export function capsuleNotificationPlan(plans:Entity[],history:Entity[],now=new Date(),days=366){const notices:{id:string;title:string;body:string;date:Date;day:string;planId:string;time:string;early:boolean}[]=[];for(let i=0;i<=days;i++){const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()+i,12);for(const dose of capsuleDoses(plans,history,capsuleDay(date),now)){if(dose.taken||!dose.plan.data.notifications)continue;if((dose.plan.tags||[]).includes('sofia-skip-v1:'+dose.day+'T'+dose.time))continue;const ahead=Math.max(0,Math.min(1440,Number(dose.plan.data.remind_minutes)||0));for(const minutes of ahead?[ahead,0]:[0]){const at=new Date(dose.date.getTime()-minutes*60000);if(at<=now)continue;notices.push({id:dose.key+':'+minutes,title:dose.plan.title,body:(()=>{const cap=(dose.plan.data.rotina_type||'capsula')==='capsula',det=dose.plan.data.dose_text?' · '+dose.plan.data.dose_text:'';/* 0.3.316: "dose" so para capsula */return minutes?`${cap?'Dose':'Começa'} às ${dose.time} · aviso ${minutes} min antes${det}`:`${cap?'Está no horário da dose':'Está na hora'}: ${dose.time}${det}`;})(),date:at,day:dose.day,planId:dose.plan.id,time:dose.time,early:minutes>0});}}}return notices.sort((a,b)=>a.date.getTime()-b.date.getTime());}

export function capsuleRepeatLabel(data:any){const mode=data.repeat_type||'daily';if(mode==='once')return 'Uma única vez';if(mode==='weekdays'){let days:number[]=[];try{days=JSON.parse(data.weekdays_json||'[]');}catch{}return days.map(d=>['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d]).join(' · ');}if(mode==='interval')return 'A cada '+data.interval_days+' dias';if(mode==='monthly')return 'Todo mês no dia '+Number(String(data.start_date).slice(8,10));if(mode==='yearly')return 'Todo ano em '+String(data.start_date).slice(5).split('-').reverse().join('/');return 'Todos os dias';}

export function capsuleNotificationLimit<T extends {planId:string;day:string;time:string;early:boolean}>(notices:T[],limit=256):T[]{const chosen=notices.slice(0,limit),due=new Set(chosen.filter(n=>!n.early).map(n=>capsuleKey(n.planId,n.day,n.time)));return chosen.filter(n=>!n.early||due.has(capsuleKey(n.planId,n.day,n.time)));}

/** 0.3.154: o aviso de cápsula guarda a dose no id ('local:capsule:<plano>:<dia>:<hora>[:early]'). */
export function capsuleDoseOfNotice(id:string):{planId:string;day:string;time:string}|null{
 const m=/^local:capsule:(.+):(\d{4}-\d{2}-\d{2}):([01]\d|2[0-3]):([0-5]\d)(?::early)?$/.exec(String(id||''));
 return m?{planId:m[1],day:m[2],time:m[3]+':'+m[4]}:null;
}

/** 0.3.223: dose nao tomada nao some na virada do dia - fica acumulando ate a pessoa marcar que tomou. Devolve as doses dos
 * dias anteriores (ate 30 dias, e nunca antes de `since`, o dia em que esta regra passou a valer no aparelho) sem registro. */
export function capsuleMissed(plans:Entity[],history:Entity[],since:string,today=capsuleDay(new Date())):CapsuleDose[]{
 const done=new Set(history.map(r=>capsuleKey(r.data.capsule_id,r.data.day,r.data.time))),out:CapsuleDose[]=[];
 const t=new Date(today+'T12:00:00'),first=new Date(t.getFullYear(),t.getMonth(),t.getDate()-30),min=capsuleDay(first)>since?capsuleDay(first):since;
 for(let d=new Date(min+'T12:00:00');capsuleDay(d)<today;d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)){const day=capsuleDay(d);
  for(const plan of plans){if(plan.state!=='active'||!capsuleOccurs(plan.data,day))continue;
   // 0.3.313: dia em que ja houve registro com o horario antigo nao vira atrasado depois de mudar o horario;
   // e dias antes da ultima mudanca do item nao contam (o horario novo nao existia)
   const times=capsuleTimes(plan),taken=takenFor(plan,day,times,history),changed=String(plan.data?.times_changed_on||'');
   if(changed&&day<changed)continue;
   for(const time of times){const key=capsuleKey(plan.id,day,time);if(done.has(key)||taken.has(time))continue;out.push({key,plan,day,time,date:new Date(day+'T'+time+':00'),due:true,missed:true});}}}
 return out.sort((a,b)=>a.date.getTime()-b.date.getTime());
}
/** "ontem" ou dd/mm. */
export function capsuleDayLabel(day:string,today=capsuleDay(new Date())):string{const t=new Date(today+'T12:00:00'),y=capsuleDay(new Date(t.getFullYear(),t.getMonth(),t.getDate()-1));return day===y?'ontem':day.slice(8,10)+'/'+day.slice(5,7);}
