'use strict';
const {now,normalize}=require('../core/util');
const {readFeed,field}=require('./safe-feed');
function localParts(date){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));}
function localISO(date){const p=localParts(date);return p.year+'-'+p.month+'-'+p.day;}
function zoned(date,time){const naive=Date.parse(date+'T'+time+':00Z');let stamp=naive;for(let i=0;i<3;i++){const p=localParts(new Date(stamp));const mapped=Date.parse(p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second+'Z');stamp+=naive-mapped;}return new Date(stamp).toISOString();}
function nextRoutine(e,after=new Date()){
 const d=e.data,base=localISO(after);for(let i=0;i<370;i++){
  const date=new Date(base+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+i);const iso=date.toISOString().slice(0,10);
  if(iso<d.starts_on)continue;if(d.ends_on&&iso>d.ends_on)return null;
  if(d.frequency==='weekly'&&date.getUTCDay()!==d.weekday)continue;
  if(d.frequency==='monthly'&&date.getUTCDate()!==Math.min(d.monthday,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()))continue;
  const at=zoned(iso,d.time);if(Date.parse(at)>after.getTime())return at;
 }return null;
}
/** 0.3.317: horario em que o lembrete toca desta vez (o movido pela linha do tempo, se houver). */
function movedAt(e){const from=new Date(e.data.remind_at).toISOString().slice(0,16)+'Z',t=(e.tags||[]).find(x=>String(x).startsWith('sofia-move-v1:'+from+'>'));const to=t?String(t).split('>')[1]:'';return to&&Number.isFinite(Date.parse(to))?new Date(to).toISOString():e.data.remind_at;}
function nextRepeat(e,stamp){
 const tag=(e.tags||[]).find(t=>String(t).startsWith('sofia-repeat-v1:'));if(!tag)return '';
 const freq=String(tag).split(':')[1];if(!['weekly','monthly','yearly'].includes(freq))return '';
 const base=new Date(e.data.remind_at);if(!Number.isFinite(base.getTime()))return '';
 const day=base.getUTCDate();let n=new Date(base.getTime()),i=0;
 while(n.getTime()<=Date.parse(stamp)&&i++<600){
  if(freq==='weekly')n=new Date(n.getTime()+7*864e5);
  else{const y=n.getUTCFullYear()+(freq==='yearly'?1:0),m=n.getUTCMonth()+(freq==='monthly'?1:0),last=new Date(Date.UTC(y,m+1,0)).getUTCDate();n=new Date(Date.UTC(y,m,Math.min(day,last),base.getUTCHours(),base.getUTCMinutes(),0,0));}
 }
 return n.toISOString();
}
class Scheduler{
 constructor(workspace,{fetcher=readFeed,clock=()=>new Date()}={}){this.w=workspace;this.fetcher=fetcher;this.clock=clock;this.busy=false;this.controller=null;this.stopped=false;}
 async tick(){if(this.busy||this.stopped)return;this.busy=true;this.controller=new AbortController();try{
  const stamp=this.clock().toISOString();const due=this.w.db.prepare("SELECT * FROM jobs WHERE state='active' AND next_at<=? ORDER BY next_at LIMIT 10").all(stamp);
  for(const j of due){if(this.stopped)break;let e;try{e=this.w.get(j.entity_id);}catch(err){ /* 03/11/2026: registro apagado nao trava os outros */ this.w.db.prepare("UPDATE jobs SET state='paused',next_at=NULL,last_error=? WHERE id=?").run(err.code||'MISSING_ENTITY',j.id);continue;}if(e.state!=='active')continue;try{
    if(j.kind==='monitor')await this.monitor(e,j,stamp);else this.routine(e,j,stamp);
  }catch(err){this.w.db.prepare('UPDATE jobs SET last_at=?,last_error=?,next_at=?,run_count=run_count+1 WHERE id=?').run(stamp,err.code||'JOB_ERROR',new Date(Date.parse(stamp)+Math.max(j.interval_minutes,15)*60000).toISOString(),j.id);this.w.notify('automation','Não foi possível consultar '+e.title,'A execução falhou: '+(err.code||'JOB_ERROR')+'. Nenhum resultado externo foi presumido.',e.id,'warning',j.id+':error:'+stamp.slice(0,10));}}
  // 0.3.317: lembrete arrastado na linha do tempo do Inicio (so aquela vez): avisa no horario novo (marca sofia-move-v1)
  // 03/11/2026: so os ativos (com 500 lembretes feitos, um ativo antigo ficava de fora e nunca avisava)
  const reminders=this.w.list({kind:'reminder',state:'active',limit:500}).filter(e=>e.state==='active'&&e.data.remind_at&&Date.parse(movedAt(e))<=Date.parse(stamp));
  for(const e of reminders){try{
    const at=movedAt(e),dedup='reminder:'+e.id+':'+at;
    if(!(e.tags||[]).includes('sofia-skip-v1:'+new Date(at).toISOString())&&!(e.tags||[]).includes('sofia-notify-v1:off'))this.w.notify('reminder',e.title,e.data.message||'Lembrete da Sofia.',e.id,'info',dedup);
    // 0.3.304: lembrete que se repete (marca sofia-repeat-v1:FREQ:FUSO, a mesma da Agenda) nao termina: vai para a
    // proxima vez (semana, mes ou ano seguinte; dia 31 vira o ultimo dia do mes curto)
    // a proxima vez conta a partir do horario original (adiantada nao repete no mesmo dia); a marca usada sai
    const after=new Date(Math.max(Date.parse(stamp),Date.parse(e.data.remind_at))).toISOString(),next=nextRepeat(e,after),tags=(e.tags||[]).filter(t=>!String(t).startsWith('sofia-move-v1:'+new Date(e.data.remind_at).toISOString().slice(0,16)+'Z>')).filter(t=>{const m=/^sofia-skip-v1:(.+)$/.exec(String(t));return !m||!(Date.parse(m[1])<=Date.parse(at));}); /* 03/11/2026: marca "so desta vez" ja usada sai (eram ate 20 marcas e o lembrete deixava de salvar) */
    if(next)this.w.save({...e,tags,revision:e.revision,data:{...e.data,remind_at:next}},e.id);
    else this.w.changeState(e.id,'done',e.revision);
  }catch(err){console.warn('[lembrete] nao reagendado:',e.id,String(err?.code||err?.message||err).slice(0,120));}} /* um lembrete com erro nao impede os outros */
 }finally{this.busy=false;this.controller=null;}}
 async monitor(e,j,stamp){const d=e.data;if(d.method!=='json'||!d.consent)return;const json=await this.fetcher(d.feed_url,{signal:this.controller?.signal});this.w.observe(e.id,{price:field(json,d.price_path),shipping:d.shipping_path?field(json,d.shipping_path):0,variant:field(json,d.variant_path),currency:field(json,d.currency_path),source:d.feed_url,source_key:j.id+':'+stamp,observed_at:stamp});this.w.db.prepare('UPDATE jobs SET last_at=?,last_error=NULL,next_at=?,run_count=run_count+1 WHERE id=?').run(stamp,new Date(Date.parse(stamp)+j.interval_minutes*60000).toISOString(),j.id);}
 routine(e,j,stamp){
  const next=nextRoutine(e,new Date(Date.parse(stamp)-60000));
  // First run schedules ahead, never floods missed historical occurrences.
  if(!j.last_at&&next&&Date.parse(next)>Date.parse(stamp)){this.w.db.prepare('UPDATE jobs SET next_at=?,last_at=? WHERE id=?').run(next,stamp,j.id);return;}
  const occurrence=j.last_at?j.next_at:next;if(!occurrence){this.w.db.prepare("UPDATE jobs SET state='paused',next_at=NULL WHERE id=?").run(j.id);return;}
  if(Date.parse(occurrence)>Date.parse(stamp))return;
  const dedup=e.id+':'+localISO(new Date(occurrence))+':'+e.data.time;
  this.w.s.tx(()=>{
   if(!this.w.db.prepare('SELECT id FROM notifications WHERE dedup=?').get(dedup)){
    if(e.data.delivery==='task')this.w.s.saveTask({title:e.title,area:e.area,state:'scheduled',due_at:occurrence,privacy:e.privacy});
    this.w.notify('routine',e.title,e.data.instruction||'Ocorrência local da rotina. Conclusão ainda não confirmada.',e.id,'info',dedup);
   }
   const following=nextRoutine(e,new Date(stamp));this.w.db.prepare('UPDATE jobs SET last_at=?,last_error=NULL,next_at=?,state=?,run_count=run_count+1 WHERE id=?').run(stamp,following,following?'active':'paused',j.id);
  });
 }
 start(){this.timer=setInterval(()=>this.tick().catch(()=>{}),60000);this.timer.unref();this.tick().catch(()=>{});}
 async stop(){this.stopped=true;clearInterval(this.timer);this.controller?.abort();const end=Date.now()+12000;while(this.busy&&Date.now()<end)await new Promise(r=>setTimeout(r,30));}
}
module.exports={nextRepeat,Scheduler,nextRoutine,localISO,zoned};
