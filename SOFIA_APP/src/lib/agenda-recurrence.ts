import type {AgendaItem} from './types';
// 0.3.317: mesma leitura de lib/timeline-move.ts (copiada aqui: este arquivo nao depende de outro, os testes o rodam sozinho)
function readMoves(tags?:string[]|null){const out=new Map<string,string>();for(const t of tags||[]){if(typeof t!=='string'||!t.startsWith('sofia-move-v1:'))continue;const [f,to]=t.slice(14).split('>');if(f&&to&&Number.isFinite(Date.parse(f))&&Number.isFinite(Date.parse(to)))out.set(f,to);}return out;}
export const REPEATS=[{value:'none',label:'Não repetir'},{value:'weekly',label:'Toda semana'},{value:'monthly',label:'Todo mês'},{value:'yearly',label:'Todo ano'}] as const;
export type Repeat=typeof REPEATS[number]['value'];
const prefix='sofia-repeat-v1:';
export const isAgendaMeta=(tag:string)=>tag.startsWith(prefix)||tag==='sofia-notify-v1:off';
// A Google import can contain hundreds of ordinary events. Resolve the device
// zone once and validate each distinct recurrence tag once, rather than create
// two Intl formatters per event on every render and notification refresh.
const deviceTimeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
const repeatRules=new Map<string,{frequency:Repeat;timeZone:string}>();
export function readRepeat(item:{tags?:string[]}){
 const tag=item.tags?.find(t=>t.startsWith(prefix))||'',cached=repeatRules.get(tag);if(cached)return cached;
 const [frequency,zone]=tag.slice(prefix.length).split(':');let timeZone=zone||deviceTimeZone;
 if(zone)try{new Intl.DateTimeFormat('en',{timeZone});}catch{timeZone='UTC';}
 const rule={frequency:(REPEATS.some(p=>p.value===frequency)?frequency:'none') as Repeat,timeZone};
 if(repeatRules.size>=64)repeatRules.delete(repeatRules.keys().next().value!);repeatRules.set(tag,rule);return rule;
}
export function agendaTags(tags:string[],frequency:Repeat,timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,notify=true){return [...tags.filter(t=>!isAgendaMeta(t)),...(frequency==='none'?[]:[prefix+frequency+':'+timeZone]),...(notify?[]:['sofia-notify-v1:off'])];}
export function eventStart(item:AgendaItem){return item.data.calendar_all_day?item.data.calendar_date_start||'':item.data.start_at||item.data.remind_at||item.data.due_at||'';}
const formatters=new Map<string,Intl.DateTimeFormat>();
// Both conversions below are pure functions of (zone, instant). The 0.3.114 on-device report showed ~154 ms of Agenda JS before the
// calendar was reached; on a 150-event calendar this module made ~1900 Intl.formatToParts calls per expansion, and the same expansion
// is repeated for Home and Agenda. Memoising changes no result, only how often Intl is asked. Bounded, cleared when full.
type Parts={y:number;m:number;d:number;h:number;i:number;s:number};
const MEMO_LIMIT=8192;
const partsMemo=new Map<string,Parts>(),zonedMemo=new Map<string,number>();
function parts(stamp:Date,zone:string):Parts{
 const key=zone+'|'+stamp.getTime(),hit=partsMemo.get(key);if(hit)return hit;
 const value=partsUncached(stamp,zone);
 if(partsMemo.size>=MEMO_LIMIT)partsMemo.clear();partsMemo.set(key,value);return value;
}
function partsUncached(stamp:Date,zone:string):Parts{let formatter=formatters.get(zone);if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});formatters.set(zone,formatter);}const p=formatter.formatToParts(stamp);const get=(key:string)=>Number(p.find(x=>x.type===key)?.value||0);return {y:get('year'),m:get('month'),d:get('day'),h:get('hour'),i:get('minute'),s:get('second')};}
function zoned(y:number,m:number,d:number,h:number,i:number,s:number,zone:string){
 const wall=Date.UTC(y,m-1,d,h,i,s),key=zone+'|'+wall,hit=zonedMemo.get(key);if(hit!==undefined)return new Date(hit);
 let stamp=wall;for(let n=0;n<3;n++){const p=parts(new Date(stamp),zone),delta=wall-Date.UTC(p.y,p.m-1,p.d,p.h,p.i,p.s);stamp+=delta;if(!delta)break;}
 if(zonedMemo.size>=MEMO_LIMIT)zonedMemo.clear();zonedMemo.set(key,stamp);return new Date(stamp);
}
/** Recurrence stays on one server record. Versioned tags are supported by the existing API. */
export function occurrences(item:AgendaItem,from:Date,to:Date):AgendaItem[]{
 // 0.3.255: tarefa concluida continua no dia dela, riscada (as outras concluidas saem da agenda)
 if(['done','cancelled','completed','archived'].includes(item.state)&&!(item.kind==='task'&&item.state==='done'))return [];
 const start=eventStart(item),base=new Date(start.length===10?start+'T09:00:00':start);if(!start||!Number.isFinite(base.getTime()))return [];
 // 0.3.317: ocorrencia arrastada na linha do tempo (so aquela vez) aparece no horario novo; data.sofia_moved_from guarda
 // o inicio original. A busca olha 3 dias a mais para cada lado, para pegar o que foi levado de um dia para outro.
 const moves=item.data.calendar_all_day?new Map<string,string>():readMoves(item.tags);
 const moved=(occ:AgendaItem,date:Date):AgendaItem|null=>{const to=moves.get(date.toISOString());if(!to)return occ;const nd=new Date(to),data={...occ.data,sofia_moved_from:date.toISOString()} as any;
  if(data.start_at)data.start_at=nd.toISOString();else if(data.remind_at)data.remind_at=nd.toISOString();else data.due_at=nd.toISOString();
  if(occ.data.end_at)data.end_at=new Date(nd.getTime()+Date.parse(occ.data.end_at)-date.getTime()).toISOString();return {...occ,data};};
 const inRange=(occ:AgendaItem)=>{const s=eventStart(occ),d=new Date(s.length===10?s+'T09:00:00':s);return d>=from&&d<to;};
 const rule=readRepeat(item);if(rule.frequency==='none'){const one=moves.size?moved(item,base):item;return one&&inRange(one)?[one]:[];}
 const a=item.data.calendar_all_day?{y:Number(start.slice(0,4)),m:Number(start.slice(5,7)),d:Number(start.slice(8,10)),h:9,i:0,s:0}:parts(base,rule.timeZone);
 const pad=moves.size?3*86400000:0,lo=parts(new Date(from.getTime()-pad),rule.timeZone),hi=parts(new Date(to.getTime()+pad),rule.timeZone),anchor=Date.UTC(a.y,a.m-1,a.d),first=Date.UTC(lo.y,lo.m-1,lo.d)-86400000,last=Date.UTC(hi.y,hi.m-1,hi.d)+86400000,out:AgendaItem[]=[];
 for(let stamp=Math.max(anchor,first);stamp<=last;stamp+=86400000){const d=new Date(stamp),y=d.getUTCFullYear(),m=d.getUTCMonth()+1,day=d.getUTCDate(),elapsed=Math.round((stamp-anchor)/86400000);const match=rule.frequency==='weekly'?elapsed%7===0:rule.frequency==='monthly'?day===a.d:m===a.m&&day===a.d;if(!match)continue;
  const date=zoned(y,m,day,a.h,a.i,a.s,rule.timeZone);if(date<base||(!pad&&(date<from||date>=to)))continue;const iso=date.toISOString(),key=`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`,data={...item.data};
  if(data.calendar_all_day){const duration=Math.max(1,Math.round((Date.parse(data.calendar_date_end||start)-Date.parse(start))/86400000));data.calendar_date_start=key;data.calendar_date_end=new Date(Date.parse(key+'T12:00:00Z')+duration*86400000).toISOString().slice(0,10);}else {if(data.start_at)data.start_at=iso;else if(data.remind_at)data.remind_at=iso;else data.due_at=iso;if(data.end_at)data.end_at=new Date(date.getTime()+Date.parse(item.data.end_at!)-base.getTime()).toISOString();}
  const occ=moved({...item,data},date);if(occ&&(!pad||inRange(occ)))out.push(occ);
 }return out;
}
export function expandAgenda(items:AgendaItem[],month:Date){const from=new Date(month.getFullYear(),month.getMonth(),1),to=new Date(month.getFullYear(),month.getMonth()+1,1);return items.flatMap(i=>occurrences(i,from,to));}
/** 0.3.317: o Inicio abre as repeticoes (compromisso/lembrete que se repete aparece em cada dia; antes so no primeiro) e
 * mostra a vez arrastada na linha do tempo no horario novo. Tarefas e dia inteiro passam como estao. */
export function expandForHome(items:AgendaItem[],now=new Date()):AgendaItem[]{const from=new Date(now.getTime()-62*864e5),to=new Date(now.getTime()+400*864e5);return items.flatMap(e=>e.kind==='task'||e.data?.calendar_all_day?[e]:occurrences(e,from,to));}
