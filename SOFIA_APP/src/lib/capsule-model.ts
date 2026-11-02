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
export function capsuleDoses(plans:Entity[],history:Entity[],day=capsuleDay(new Date()),now=new Date()):CapsuleDose[]{const done=new Map(history.map(r=>[capsuleKey(r.data.capsule_id,r.data.day,r.data.time),r]));return plans.filter(p=>p.state==='active'&&capsuleOccurs(p.data,day)).flatMap(plan=>capsuleTimes(plan).map(time=>{const date=new Date(day+'T'+time+':00'),key=capsuleKey(plan.id,day,time);return {key,plan,day,time,date,taken:done.get(key),due:date.getTime()<=now.getTime(),missed:now.getTime()-date.getTime()>MISSED_AFTER_MS};})).sort((a,b)=>a.date.getTime()-b.date.getTime()||a.plan.title.localeCompare(b.plan.title));}
export function capsuleNotificationPlan(plans:Entity[],history:Entity[],now=new Date(),days=366){const notices:{id:string;title:string;body:string;date:Date;day:string;planId:string;time:string;early:boolean}[]=[];for(let i=0;i<=days;i++){const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()+i,12);for(const dose of capsuleDoses(plans,history,capsuleDay(date),now)){if(dose.taken||!dose.plan.data.notifications)continue;if((dose.plan.tags||[]).includes('sofia-skip-v1:'+dose.day+'T'+dose.time))continue;const ahead=Math.max(0,Math.min(1440,Number(dose.plan.data.remind_minutes)||0));for(const minutes of ahead?[ahead,0]:[0]){const at=new Date(dose.date.getTime()-minutes*60000);if(at<=now)continue;notices.push({id:dose.key+':'+minutes,title:dose.plan.title,body:minutes?`Dose às ${dose.time} · aviso ${minutes} min antes${dose.plan.data.dose_text?' · '+dose.plan.data.dose_text:''}`:`Está no horário da dose: ${dose.time}${dose.plan.data.dose_text?' · '+dose.plan.data.dose_text:''}`,date:at,day:dose.day,planId:dose.plan.id,time:dose.time,early:minutes>0});}}}return notices.sort((a,b)=>a.date.getTime()-b.date.getTime());}

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
   for(const time of capsuleTimes(plan)){const key=capsuleKey(plan.id,day,time);if(done.has(key))continue;out.push({key,plan,day,time,date:new Date(day+'T'+time+':00'),due:true,missed:true});}}}
 return out.sort((a,b)=>a.date.getTime()-b.date.getTime());
}
/** "ontem" ou dd/mm. */
export function capsuleDayLabel(day:string,today=capsuleDay(new Date())):string{const t=new Date(today+'T12:00:00'),y=capsuleDay(new Date(t.getFullYear(),t.getMonth(),t.getDate()-1));return day===y?'ontem':day.slice(8,10)+'/'+day.slice(5,7);}
