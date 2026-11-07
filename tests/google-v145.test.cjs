'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {GoogleService}=require('../src/services/google');
const {BackupService}=require('../src/services/backup');
const ENV={GOOGLE_CALENDAR_CLIENT_ID:'cid',GOOGLE_CALENDAR_CLIENT_SECRET:'csecret',SOFIA_CALENDAR_TOKEN_KEY:'chave-de-teste'};

// Google falso: guarda eventos por calendário, pagina de 2 em 2, exige a janela de datas e devolve só o alterado com updatedMin.
function fakeGoogle(){
 const g={calendars:[{id:'primary',summary:'Pedro',accessRole:'owner',primary:true},{id:'feriados',summary:'Feriados',accessRole:'reader',selected:true},{id:'oculto',summary:'Oculto',accessRole:'reader',selected:false}],
  events:{primary:[],feriados:[],oculto:[]},changes:{primary:[],feriados:[]},expired:new Set(),calls:[],uploads:[],driveFiles:[],seq:1};
 const res=(status,body)=>({ok:status<300,status,json:async()=>body});
 g.fetch=async(url,opts={})=>{const u=new URL(url),m=opts.method||'GET';g.calls.push(m+' '+u.pathname+u.search);
  if(g.fail){const f=g.fail(m,u.pathname+u.search);if(f)return res(f.status,{error:{message:f.message}});}
  if(u.href.startsWith('https://oauth2.googleapis.com/token')){const b=new URLSearchParams(opts.body);if(b.get('grant_type')==='authorization_code')return res(200,{access_token:'at1',refresh_token:'rt-secreto',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file',id_token:'x.'+Buffer.from(JSON.stringify({email:'pedro@gmail.com'})).toString('base64url')+'.y'});return res(200,{access_token:'at2',expires_in:3600});}
  if(u.pathname==='/calendar/v3/users/me/calendarList')return res(200,{items:g.calendars});
  let mm=u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
  if(mm){const cal=decodeURIComponent(mm[1]),evId=mm[2]&&decodeURIComponent(mm[2]);
   if(m==='GET'){if(!u.searchParams.get('timeMin')||!u.searchParams.get('timeMax'))return res(400,{error:{message:'janela obrigatória'}});
    const inc=u.searchParams.get('updatedMin');const list=inc?g.changes[cal]:g.events[cal];const size=Math.max(2,Math.ceil(list.length/10)),start=Number(u.searchParams.get('pageToken')||0),page=list.slice(start,start+size);
    return res(200,{items:page,...(start+size<list.length?{nextPageToken:String(start+size)}:{})});}
   const body=opts.body?JSON.parse(opts.body):null;
   if(m==='POST'){const ev={id:'new'+(g.seq++),etag:'"e1"',...body};g.events[cal].push(ev);return res(200,ev);}
   if(m==='PATCH'){const ev=g.events[cal].find(e=>e.id===evId);
    // Como o Google de verdade: PATCH mescla objetos (reminders) e recusa useDefault junto com overrides.
    const merged={...ev,...body};if(body.reminders)merged.reminders={...(ev.reminders||{}),...body.reminders};
    if(merged.reminders&&merged.reminders.useDefault&&(merged.reminders.overrides||[]).length)return res(400,{error:{message:'Cannot specify both default reminders and overrides at the same time.'}});
    Object.assign(ev,merged,{etag:'"e'+(g.seq++)+'"'});return res(200,ev);}
   if(m==='DELETE'){g.events[cal]=g.events[cal].filter(e=>e.id!==evId);return {ok:true,status:204,json:async()=>({})};}}
  if(u.pathname==='/drive/v3/files'&&m==='GET'){
   const q=u.searchParams.get('q')||'';
   const parentM=/'([^']+)' in parents/.exec(q);
   if(q.includes('folder')){let list=g.driveFiles.filter(f=>f.folder&&q.includes("name='"+f.name+"'"));if(parentM)list=list.filter(f=>(f.parents||[]).includes(parentM[1]));return res(200,{files:list.map(f=>({id:f.id,name:f.name,createdTime:f.createdTime}))});}
   if(parentM)return res(200,{files:g.driveFiles.filter(f=>(f.parents||[]).includes(parentM[1])).map(f=>({id:f.id,parents:f.parents||[]}))});
   return res(200,{files:g.driveFiles.filter(f=>!f.folder).reverse()});
  }
  if(u.pathname==='/drive/v3/files'&&m==='POST'){const b=JSON.parse(opts.body);const f={id:'f'+(g.seq++),name:b.name,folder:true,parents:b.parents||[],createdTime:new Date(Date.now()+(g.seq)).toISOString()};g.driveFiles.push(f);return res(200,{id:f.id});}
  if(u.pathname==='/upload/drive/v3/files'){g.uploads.push({type:opts.headers['Content-Type'],size:opts.body.length,text:opts.body.toString('latin1')});const text=opts.body.toString('latin1');const boundary=/boundary=([^;\s]+)/.exec(opts.headers['Content-Type'])[1];const parts=text.split('--'+boundary);const metaPart=parts[1]||'',filePart=parts[2]||'';const meta=(()=>{try{return JSON.parse(metaPart.slice(metaPart.indexOf('\r\n\r\n')+4).trim());}catch{return {};}})();const payload=filePart.includes('\r\n\r\n')?filePart.slice(filePart.indexOf('\r\n\r\n')+4).replace(/\r\n$/,''):'';const f={id:'b'+(g.seq++),name:meta.name||'backup'+g.seq,parents:meta.parents||[],bytes:[...Buffer.from(payload,'latin1')],meta};g.driveFiles.push(f);return res(200,{id:f.id});}
  if(u.pathname.startsWith('/upload/drive/v3/files/')&&m==='PATCH'){const fid=u.pathname.split('/').pop();const f=g.driveFiles.find(x=>x.id===fid);if(!f)return res(404,{error:{message:'nao achei'}});g.uploads.push({type:opts.headers['Content-Type'],size:opts.body.length});const text=opts.body.toString('latin1');const boundary=/boundary=([^;\s]+)/.exec(opts.headers['Content-Type'])[1];const filePart=(text.split('--'+boundary)[2]||'');const payload=filePart.includes('\r\n\r\n')?filePart.slice(filePart.indexOf('\r\n\r\n')+4).replace(/\r\n$/,''):'';f.bytes=[...Buffer.from(payload,'latin1')];return res(200,{id:f.id});}
  if(u.pathname.startsWith('/drive/v3/files/')&&m==='PATCH'&&(u.searchParams.get('addParents')||u.searchParams.get('removeParents'))){const fid=u.pathname.split('/').pop();const f=g.driveFiles.find(x=>x.id===fid);if(!f)return res(404,{error:{message:'nao achei'}});const add=u.searchParams.get('addParents'),rm=u.searchParams.get('removeParents');f.parents=(f.parents||[]).filter(p=>p!==rm);if(add&&!f.parents.includes(add))f.parents.push(add);return res(200,{id:fid});}
  if(u.pathname.startsWith('/drive/v3/files/')&&m==='PATCH'){const fid=u.pathname.split('/').pop();const b=JSON.parse(opts.body||'{}');if(b.trashed)g.driveFiles=g.driveFiles.filter(x=>x.id!==fid);return res(200,{id:fid});}
  if(u.pathname.startsWith('/drive/v3/files/')&&u.searchParams.get('alt')==='media'){const f=g.driveFiles.find(f=>'/drive/v3/files/'+f.id===u.pathname);if(!f)return res(404,{error:{message:'nao achei'}});return {ok:true,status:200,json:async()=>({}),arrayBuffer:async()=>Uint8Array.from(f.bytes||[]).buffer};}
  if(u.pathname.startsWith('/drive/v3/files/')&&m==='DELETE'){g.driveFiles=g.driveFiles.filter(f=>'/drive/v3/files/'+f.id!==u.pathname);return {ok:true,status:204,json:async()=>({})};}
  throw new Error('rota inesperada '+m+' '+url);};
 return g;
}
async function connected(t,g=fakeGoogle()){
 const f=fixture(t);f.config.publicBaseUrl='https://sofia.example';
 const backups=new BackupService(f.store,path.join(f.dir,'bk'));
 const svc=new GoogleService(f.store,f.core.workspace,f.config,{fetchImpl:g.fetch,env:ENV,backups});
 const {url}=svc.connectUrl();const u=new URL(url);
 assert.equal(u.searchParams.get('redirect_uri'),'https://sofia.example/google/oauth/callback');assert.match(u.searchParams.get('scope'),/calendar.*drive\.file/);assert.equal(u.searchParams.get('access_type'),'offline');
 svc.sync=svc.sync.bind(svc);const realSync=svc.sync;svc.sync=async()=>({skipped:true});const realBk=svc.backupToDrive.bind(svc);svc.backupToDrive=async()=>({skipped:true});
 const r=await svc.callback(new URLSearchParams({code:'abc',state:u.searchParams.get('state')}));assert.equal(r.ok,true);
 svc.sync=realSync;svc.backupToDrive=realBk;
 return {...f,svc,g,backups};
}
const ev=(id,summary,start,end,extra={})=>({id,etag:'"'+id+'"',status:'confirmed',summary,start:start.length===10?{date:start}:{dateTime:start},end:end.length===10?{date:end}:{dateTime:end},...extra});
const google=w=>w.list({kind:'commitment',limit:500}).filter(e=>e.data.calendar_provider==='google');

test('OAuth: estado de uso único, token guardado criptografado, link vencido recusado',async t=>{
 const {svc,store}=await connected(t);
 const raw=store.db.prepare("SELECT data FROM google_link").get().data;assert.ok(!raw.includes('rt-secreto'),'refresh token não fica em texto');
 assert.equal(svc.open(JSON.parse(raw).refresh),'rt-secreto');
 const again=await svc.callback(new URLSearchParams({code:'abc',state:'qualquer'}));assert.equal(again.ok,false);
 const s=await svc.status();assert.equal(s.connected,true);assert.equal(s.email,'pedro@gmail.com');assert.equal(s.drive.connected,true);
});

test('importa tudo, paginado: principal (2 sentidos) + outros visíveis (só leitura), dia inteiro, fuso, cancelado e recusado',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;
 g.events.primary=[ev('a','Reunião','2026-10-12T10:00:00-03:00','2026-10-12T11:00:00-03:00'),ev('b','Aniversário','2026-10-15','2026-10-16'),ev('c','Cancelado','2026-10-13T09:00:00-03:00','2026-10-13T10:00:00-03:00',{status:'cancelled'}),
  ev('d','Recusei','2026-10-14T09:00:00-03:00','2026-10-14T10:00:00-03:00',{attendees:[{self:true,responseStatus:'declined'}]}),ev('e','Viagem','2026-10-20','2026-10-23'),ev('f','Série 1','2026-10-21T08:00:00-03:00','2026-10-21T08:30:00-03:00',{recurringEventId:'serie'})];
 g.events.feriados=[ev('h1','Finados','2026-11-02','2026-11-03')];g.events.oculto=[ev('o1','Não deve vir','2026-11-05','2026-11-06')];
 const r=await svc.sync();assert.equal(r.imported,7);assert.equal(r.created,5);assert.equal(r.calendars,2);
 const all=google(w);assert.equal(all.length,5);
 const reuniao=all.find(e=>e.title==='Reunião');assert.equal(reuniao.data.start_at,'2026-10-12T13:00:00.000Z');assert.equal(reuniao.data.google_readonly,false);
 const viagem=all.find(e=>e.title==='Viagem');assert.equal(viagem.data.calendar_all_day,true);assert.equal(viagem.data.calendar_date_start,'2026-10-20');assert.equal(viagem.data.calendar_date_end,'2026-10-23');
 assert.equal(all.find(e=>e.title==='Finados').data.google_readonly,true);assert.ok(!all.some(e=>e.title==='Não deve vir'));
 assert.equal(all.find(e=>e.title==='Série 1').data.google_recurring_id,'serie');
 assert.ok(g.calls.some(c=>c.includes('pageToken=2')),'paginou');
 const st=await svc.status();assert.match(st.warnings[0],/7 recebidos do Google, 5 novos/);
});

test('janela fixa, incremental por data de alteração, não regrava o que não mudou; cancelado vira cancelado',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;
 g.events.primary=[ev('a','Reunião','2026-10-12T10:00:00-03:00','2026-10-12T11:00:00-03:00')];await svc.sync();
 const call=g.calls.find(c=>c.includes('/calendars/primary/events'));assert.match(call,/timeMin=/);assert.match(call,/timeMax=/);assert.ok(!/updatedMin/.test(call),'primeira vez: completa');
 const rev=google(w)[0].revision;
 g.changes.primary=[];await svc.sync();assert.ok(g.calls.some(c=>c.includes('updatedMin=')),'depois: só o que mudou');
 assert.equal(google(w)[0].revision,rev,'nada mudou: não regravou');
 g.changes.primary=[{...g.events.primary[0],summary:'Reunião (sala 2)',etag:'"a2"'}];await svc.sync();assert.equal(google(w)[0].title,'Reunião (sala 2)');
 g.changes.primary=[{id:'a',status:'cancelled',etag:'"a3"'}];await svc.sync();assert.equal(google(w)[0].state,'cancelled');
 g.changes.primary=[{id:'nunca',status:'cancelled',etag:'"x"'}];await svc.sync();assert.equal(google(w).length,1,'cancelado que nunca existiu não vira registro');
});

test('lote grande não trava: o servidor continua respondendo durante a sincronização',async t=>{
 const {svc,core,g}=await connected(t);
 g.events.primary=Array.from({length:120},(_,i)=>ev('e'+i,'Evento '+i,'2026-11-01T10:00:00-03:00','2026-11-01T11:00:00-03:00'));
 let ticks=0;const timer=setInterval(()=>ticks++,0);
 await svc.sync();clearInterval(timer);
 assert.equal(core.workspace.list({kind:'commitment',limit:500}).length,120);
 assert.ok(ticks>=3,'o event loop rodou outras tarefas no meio ('+ticks+')');
});

test('0.3.201: varios avisos (como no Google Agenda) vao e voltam do Google',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;
 w.save({kind:'commitment',title:'Reunião',area:'Pessoal',data:{start_at:'2026-11-05T13:00:00.000Z',end_at:'2026-11-05T14:00:00.000Z',calendar_provider:'google',remind_minutes:10,reminders_json:'[1440,10,120]'}});
 await svc.sync();
 const ev=g.events.primary.find(e=>e.summary==='Reunião');
 assert.equal(ev.reminders.useDefault,false);assert.equal(ev.reminders.overrides.map(o=>o.minutes).join(','),'10,120,1440');
 // do Google para a Sofia: os avisos do evento viram a lista
 ev.reminders={useDefault:false,overrides:[{method:'popup',minutes:5},{method:'popup',minutes:2880},{method:'email',minutes:60}]};ev.updated=new Date(Date.now()+60000).toISOString();ev.etag='"novo"';
 g.changes=g.changes||{};g.changes.primary=[...(g.changes.primary||[]),ev];
 await svc.sync();
 const back=w.list({kind:'commitment',limit:50}).find(e=>e.title==='Reunião');
 assert.equal(back.data.reminders_json,'[5,2880]','so os avisos de notificacao (popup), em ordem');assert.equal(Number(back.data.remind_minutes),5);
});

test('0.3.201: agenda da Sofia espelhada no Google - compromisso novo ja sincroniza; tarefa programada vira evento e nao volta duplicada',async t=>{
 const {svc,core,g,store}=await connected(t);const w=core.workspace;const st=store||core.store;
 const c=w.save({kind:'commitment',title:'Barbeiro',area:'Pessoal',data:{start_at:'2026-11-06T13:00:00.000Z',end_at:'2026-11-06T14:00:00.000Z'}});
 assert.equal(c.data.calendar_provider,'google','sem escolher, vai para o Google');
 const loc=w.save({kind:'commitment',title:'Só aqui',area:'Pessoal',data:{start_at:'2026-11-06T15:00:00.000Z',calendar_provider:'local'}});assert.equal(loc.data.calendar_provider,'local','quem escolhe local fica local');
 const task=st.saveTask({title:'Tomar duda',area:'Pessoal',state:'todo',due_at:'2026-11-07T12:00:00.000Z',notifications:['10','1440']}).item||st.tasks().find(x=>x.title==='Tomar duda');
 await svc.sync();
 assert.ok(g.events.primary.some(e=>e.summary==='Barbeiro'));assert.ok(!g.events.primary.some(e=>e.summary==='Só aqui'));
 const ev=g.events.primary.find(e=>e.summary==='Tomar duda');assert.ok(ev,'tarefa virou evento');
 assert.equal(ev.extendedProperties.private.sofia_task,task.id);assert.equal(ev.reminders.overrides.map(o=>o.minutes).join(','),'10,1440');
 const sent=g.events.primary.length;await svc.sync();assert.equal(g.events.primary.length,sent,'nao repete');
 assert.ok(!w.list({kind:'commitment',limit:100}).some(e=>e.title==='Tomar duda'),'o evento da tarefa nao volta como compromisso');
 // editar no app (sem mandar os campos do Google) mantem a ligacao: atualiza o mesmo evento
 const cur=st.tasks().find(x=>x.id===task.id);st.saveTask({title:'Tomar duda e água',area:'Pessoal',state:'todo',due_at:'2026-11-08T12:00:00.000Z',revision:cur.revision},task.id);
 await svc.sync();assert.equal(g.events.primary.filter(e=>/Tomar duda/.test(e.summary)).length,1,'mesmo evento');assert.ok(g.events.primary.some(e=>e.summary==='Tomar duda e água'));
 // concluida sai do Google
 const c2=st.tasks().find(x=>x.id===task.id);st.saveTask({title:c2.title,area:'Pessoal',state:'done',due_at:c2.due_at,revision:c2.revision},task.id);
 await svc.sync();assert.ok(!g.events.primary.some(e=>/Tomar duda/.test(e.summary)),'concluida: saiu do Google');
 // apagada tambem sai
 const t2=st.saveTask({title:'Ligar pro banco',area:'Pessoal',state:'todo',due_at:'2026-11-09T12:00:00.000Z'}).item||st.tasks().find(x=>x.title==='Ligar pro banco');
 await svc.sync();assert.ok(g.events.primary.some(e=>e.summary==='Ligar pro banco'));
 st.deleteTask(t2.id);await svc.sync();assert.ok(!g.events.primary.some(e=>e.summary==='Ligar pro banco'),'apagada: saiu do Google');
});

test('Sofia → Google: novo, editado e apagado; conflito não sobrescreve nada',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;
 const novo=w.save({kind:'commitment',title:'Dentista',area:'Pessoal',data:{start_at:'2026-10-30T13:00:00.000Z',end_at:'2026-10-30T14:00:00.000Z',calendar_provider:'google',remind_minutes:30}});
 const dia=w.save({kind:'commitment',title:'Folga',area:'Pessoal',data:{calendar_all_day:true,calendar_date_start:'2026-11-03',calendar_date_end:'2026-11-04',calendar_provider:'google'}});
 const local=w.save({kind:'commitment',title:'Só na Sofia',area:'Pessoal',data:{start_at:'2026-10-30T15:00:00.000Z',calendar_provider:'local'}});
 let r=await svc.sync();assert.equal(r.sent,2);
 const enviado=g.events.primary.find(e=>e.summary==='Dentista');assert.equal(enviado.reminders.overrides[0].minutes,30);assert.equal(enviado.start.timeZone,'America/Sao_Paulo');
 assert.deepEqual(g.events.primary.find(e=>e.summary==='Folga').start,{date:'2026-11-03'});
 assert.ok(!g.events.primary.some(e=>e.summary==='Só na Sofia'));
 const salvo=w.get(novo.id);assert.ok(salvo.data.external_event_id);
 r=await svc.sync();assert.equal(r.sent,0,'nada mudou: não reenvia');
 w.save({revision:salvo.revision,title:'Dentista 14h'},salvo.id);r=await svc.sync();assert.equal(r.sent,1);assert.equal(g.events.primary.find(e=>e.id===salvo.data.external_event_id).summary,'Dentista 14h');
 const dentro=w.get(novo.id);w.save({revision:dentro.revision,title:'Dentista (mudou aqui)'},novo.id);
 g.changes.primary=[{...g.events.primary.find(e=>e.id===dentro.data.external_event_id),summary:'Dentista (mudou lá)',etag:'"outro"'}];
 r=await svc.sync();assert.equal(r.conflicts,1);assert.equal(w.get(novo.id).title,'Dentista (mudou aqui)');
 const fol=w.get(dia.id);w.deleteEntity(fol.id);g.changes.primary=[];await svc.sync();assert.ok(!g.events.primary.some(e=>e.summary==='Folga'),'apagar na Sofia apaga no Google');
 assert.ok(local);
});

test('0.3.201: backup com senha (abre sem o servidor) vai para Sofia OS/Backup com senha, com o guia de restauracao',async t=>{
 const {openBackup}=require('../src/services/backup');
 const old=process.env.SOFIA_BACKUP_PASSPHRASE;process.env.SOFIA_BACKUP_PASSPHRASE='senha-de-teste-123';t.after(()=>{if(old===undefined)delete process.env.SOFIA_BACKUP_PASSPHRASE;else process.env.SOFIA_BACKUP_PASSPHRASE=old;});
 const {svc,g,core}=await connected(t);core.workspace.save({kind:'user_page',title:'Página que precisa voltar',area:'Pessoal',data:{blocks_json:'[]'}});
 const r=await svc.backupToDrive(true);assert.equal(r.ok,true);assert.equal(r.portable,true);
 const dir=await svc.folderId('Backup com senha');const inDir=g.driveFiles.filter(f=>!f.folder&&(f.parents||[]).includes(dir));
 const bk=inDir.find(f=>/^sofia-com-senha-\d{4}-\d{2}-\d{2}\.sofia-backup$/.test(f.name));assert.ok(bk,'backup do dia');assert.ok(inDir.some(f=>f.name==='COMO-RESTAURAR.md'),'guia junto');
 const up=g.uploads.find(u=>/sofia-com-senha-/.test(u.text||''));assert.ok(up);
 const st=(await svc.status()).drive.portable;assert.equal(st.configured,true);assert.ok(st.at);assert.equal(st.error,'');
 // sem a senha certa nao abre; com ela, abre e tem a pagina
 const raw=Buffer.from(bk.bytes||[]);
 if(raw.length){assert.throws(()=>openBackup(raw,{passphrase:'errada-errada-12'}));const snap=openBackup(raw,{passphrase:'senha-de-teste-123'});assert.ok(JSON.stringify(snap).includes('Página que precisa voltar'));}
});
test('0.3.201: sem a senha configurada (ou curta demais), o backup normal segue e o com senha nao e feito',async t=>{
 const old=process.env.SOFIA_BACKUP_PASSPHRASE;process.env.SOFIA_BACKUP_PASSPHRASE='curta';t.after(()=>{if(old===undefined)delete process.env.SOFIA_BACKUP_PASSPHRASE;else process.env.SOFIA_BACKUP_PASSPHRASE=old;});
 const {svc}=await connected(t);const r=await svc.backupToDrive(true);assert.equal(r.ok,true);assert.equal(r.portable,false);
 assert.equal((await svc.status()).drive.portable.configured,false);
});
test('Drive: backup criptografado na pasta Sofia OS/Backups, guarda 14 e limpa o servidor',async t=>{
 const {svc,g,backups}=await connected(t);
 const dir=await svc.folderId('Backups'); // garante a pasta antes de semear "backups antigos" dentro dela
 for(let i=0;i<16;i++)g.driveFiles.push({id:'old'+i,name:'antigo'+i,parents:[dir]});
 const r=await svc.backupToDrive(true);assert.equal(r.ok,true);
 assert.equal(g.uploads.length,1);assert.match(g.uploads[0].type,/multipart\/related/);assert.match(g.uploads[0].text,/"name":"sofia-/);
 assert.ok(g.driveFiles.some(f=>f.folder&&f.name==='Sofia OS')&&g.driveFiles.some(f=>f.folder&&f.name==='Backups'));
 assert.ok(g.driveFiles.filter(f=>!f.folder&&(f.parents||[]).includes(dir)).length<=14);
 assert.equal((await svc.backupToDrive()).skipped,true,'um por dia');
 assert.ok(backups.list().length<=3);
 assert.equal((await svc.status()).drive.last_backup.slice(0,10),new Date().toISOString().slice(0,10));
});

test('sem configuração não conecta e o desconectar revoga e apaga o token',async t=>{
 const f=fixture(t);const svc=new GoogleService(f.store,f.core.workspace,f.config,{fetchImpl:fakeGoogle().fetch,env:{}});
 assert.throws(()=>svc.connectUrl(),/configurada/);assert.equal((await svc.status()).configured,false);
 const c=await connected(t);await c.svc.disconnect();assert.equal((await c.svc.status()).connected,false);assert.ok(c.g.calls.some(x=>x.startsWith('POST /revoke')));
});

test('conexão pelo app: a janela do Google volta sozinha para o app (sofiaapp://google)',async t=>{
 const g=fakeGoogle();const f=fixture(t);f.config.publicBaseUrl='https://sofia.example';
 const svc=new GoogleService(f.store,f.core.workspace,f.config,{fetchImpl:g.fetch,env:ENV});
 svc.sync=async()=>({});svc.backupToDrive=async()=>({});
 const {url}=svc.connectUrl({app:true});const state=new URL(url).searchParams.get('state');assert.ok(state.startsWith('a.'));
 const r=await svc.callbackResponse(new URLSearchParams({code:'abc',state}));
 assert.match(r.redirect,/^sofiaapp:\/\/google\?ok=1&message=/);
 const web=svc.connectUrl().url;const r2=await svc.callbackResponse(new URLSearchParams({code:'abc',state:new URL(web).searchParams.get('state')}));
 assert.ok(r2.html&&r2.html.includes('Pronto'),'pelo navegador continua mostrando a página');
 const bad=await svc.callbackResponse(new URLSearchParams({state:'a.invalido',code:'x'}));assert.match(bad.redirect,/ok=0/);
});

test('ao conectar, a Sofia cria a casa dela no Drive (Sofia OS/Backups, Anexos, Áudios, Páginas) sem repetir',async t=>{
 const {svc,g}=await connected(t);await new Promise(r=>setTimeout(r,80));
 const folders=g.driveFiles.filter(f=>f.folder).map(f=>f.name).sort();
 assert.deepEqual(folders,['Anexos','Backup com senha','Backups','Comprovantes','Páginas','Sofia OS','Áudios']);
 await svc.ensureFolders();assert.equal(g.driveFiles.filter(f=>f.folder).length,7,'não cria pasta repetida (0.3.199: + Comprovantes; 0.3.201: + Backup com senha)');
 const st=await svc.status();assert.deepEqual(st.drive.folders.sort(),['Anexos','Backup com senha','Backups','Comprovantes','Páginas','root','Áudios']);
});
test('anexos vão para Sofia OS/Anexos: aqui fica só a referência, a leitura busca no Drive (com cache) e apagar o registro apaga lá',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;await new Promise(r=>setTimeout(r,80));
 const page=w.save({kind:'user_page',title:'Capa',area:'Pessoal',data:{}});
 const att=w.attach(page.id,{name:'capa.png',mime:'image/png',base64:Buffer.from('PNGDATA-123').toString('base64')});
 assert.equal(svc.attachmentStats().in_drive,0);
 const r=await svc.offloadAttachments();assert.equal(r.moved,1);
 const row=w.attachment(att.id);assert.ok(row.drive_id);assert.equal(row.blob.length,0,'o blob sai do servidor');assert.equal(row.bytes,11,'o tamanho original fica');
 assert.equal(svc.attachmentStats().in_drive,1);assert.equal(svc.attachmentStats().local_mb,0);
 const up=g.driveFiles.find(f=>f.id===row.drive_id);assert.equal(up.meta.mimeType,'image/png');assert.equal(up.meta.appProperties.sofia_attachment,att.id);
 const bytes=await svc.attachmentBytes(row);assert.equal(bytes.toString(),'PNGDATA-123');
 const again=await svc.attachmentBytes(row);assert.equal(again.toString(),'PNGDATA-123');
 // limite de 50 MB: só conta o que ainda está no servidor
 assert.doesNotThrow(()=>w.attach(page.id,{name:'outra.png',mime:'image/png',base64:Buffer.from('x').toString('base64')}));
 w.deleteEntity(page.id);await new Promise(r=>setTimeout(r,20));
 assert.ok(!g.driveFiles.some(f=>f.id===row.drive_id),'apagou no Drive também');
});

test('0.3.200: trocar a capa apaga a antiga tambem no Drive; a faxina limpa capas antigas que ja estavam la',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;await new Promise(r=>setTimeout(r,80));
 const page=w.save({kind:'user_page',title:'Capa',area:'Pessoal',data:{cover_type:'gradient',cover_value:'',cover_attachment_id:''}});
 const a=w.attach(page.id,{name:'capa.png',mime:'image/png',base64:Buffer.from('CAPA-A').toString('base64')});
 const b=w.attach(page.id,{name:'capa.png',mime:'image/png',base64:Buffer.from('CAPA-B').toString('base64')});
 await svc.offloadAttachments();
 const da=w.attachment(a.id).drive_id,db=w.attachment(b.id).drive_id;assert.ok(da&&db);
 const set=id=>{const cur=w.get(page.id);return w.save({...cur,data:{...cur.data,cover_type:'attachment',cover_attachment_id:id}},page.id);};
 set(a.id);set(b.id);await new Promise(r=>setTimeout(r,20));
 assert.ok(!g.driveFiles.some(f=>f.id===da),'a capa antiga saiu do Drive');assert.ok(g.driveFiles.some(f=>f.id===db),'a atual continua la');
 // capa velha que sobrou de antes desta versao (ja no Drive): a faxina apaga dos dois lados
 const c=w.attach(page.id,{name:'capa.png',mime:'image/png',base64:Buffer.from('CAPA-C').toString('base64')});await svc.offloadAttachments();
 const dc=w.attachment(c.id).drive_id;w.db.prepare('UPDATE attachments SET created_at=? WHERE id=?').run(new Date(Date.now()-5*3600*1000).toISOString(),c.id);
 assert.equal(w.cleanupOrphanCovers().removed,1);await new Promise(r=>setTimeout(r,20));
 assert.ok(!g.driveFiles.some(f=>f.id===dc),'a sobra saiu do Drive');assert.ok(g.driveFiles.some(f=>f.id===db),'a capa atual continua');
});

test('0.3.200: capas largas que ja estao no Drive sao reduzidas no proprio arquivo (sem criar outro)',async t=>{
 const jpeg=require('jpeg-js');
 const {svc,core,g}=await connected(t);const w=core.workspace;await new Promise(r=>setTimeout(r,80));
 const W=3000,H=1000,data=Buffer.alloc(W*H*4);for(let i=0;i<W*H;i++){data[i*4]=(i%W)%256;data[i*4+1]=Math.floor(i/W)%256;data[i*4+2]=(i*7)%256;data[i*4+3]=255;}
 const big=Buffer.from(jpeg.encode({data,width:W,height:H},78).data);
 const page=w.save({kind:'user_page',title:'Capa',area:'Pessoal',data:{}});
 const att=w.attach(page.id,{name:'foto.jpg',mime:'image/jpeg',base64:big.toString('base64')});
 w.db.prepare("UPDATE attachments SET name='capa.jpg' WHERE id=?").run(att.id);
 await svc.offloadAttachments();const row=w.attachment(att.id);assert.ok(row.drive_id);
 const filesBefore=g.driveFiles.length;
 const r=await svc.shrinkDriveCovers();assert.equal(r.shrunk,1);
 assert.equal(g.driveFiles.length,filesBefore,'mesmo arquivo, nada novo no Drive');
 const f=g.driveFiles.find(x=>x.id===row.drive_id),after=Buffer.from(f.bytes);
 assert.equal(jpeg.decode(after).width,1600);assert.ok(after.length<big.length*0.6);
 assert.equal(w.attachment(att.id).bytes,after.length,'tamanho gravado acompanha');
 const again=await svc.attachmentBytes(w.attachment(att.id));assert.equal(again.length,after.length,'a leitura traz a versao reduzida (cache limpo)');
 assert.equal((await svc.shrinkDriveCovers()).shrunk,0,'nao repete');
});

test('0.3.202: foto PNG da conversa vai para Comprovantes e volta inteira do Drive ao abrir',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;await new Promise(r=>setTimeout(r,80));
 const e=w.save({kind:'file',title:'1000281170.png',area:'Pessoal',state:'saved',tags:['chat-attachment'],data:{provider:'local',logical_path:'conversations/x',description:'Arquivo enviado na conversa com a Sofia'}});
 const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(5000,7)]);
 const att=w.attach(e.id,{name:'1000281170.png',mime:'image/png',base64:png.toString('base64')});
 // 07/11/2026 (Pedro: tudo no Drive): nao fica mais 24 h no servidor
 await svc.offloadAttachments();const row=w.attachment(att.id);assert.ok(row.drive_id,'foi para o Drive');assert.equal(row.blob.length,0,'saiu do servidor');
 const dir=await svc.folderId('Comprovantes');assert.ok(g.driveFiles.find(f=>f.id===row.drive_id).parents.includes(dir),'na pasta Comprovantes');
 svc.blobCache.clear();svc.blobCacheBytes=0;
 const back=await svc.attachmentBytes(row);assert.equal(back.length,png.length);assert.ok(back.equals(png),'volta byte a byte');
});

test('mensagens de voz com mais de 1 dia vão para Sofia OS/Áudios; as recentes ficam; leitura volta do Drive',async t=>{
 const {svc,core,g,store}=await connected(t);await new Promise(r=>setTimeout(r,80));
 const st=core.store||store;const conv=st.createConversation('Chat','mobile');
 const old=st.userMessage({conversationId:conv.id,clientId:'v-old',message:'audio antigo',channel:'mobile'});
 const fresh=st.userMessage({conversationId:conv.id,clientId:'v-new',message:'audio novo',channel:'mobile'});
 const oldId=old.message?old.message.id:old.id,freshId=fresh.message?fresh.message.id:fresh.id;
 st.saveVoiceMessage(oldId,{mime:'audio/mp4',duration_ms:2000,transcript:'antigo',bytes:Buffer.from('AUDIO-ANTIGO')});
 st.saveVoiceMessage(freshId,{mime:'audio/mp4',duration_ms:2000,transcript:'novo',bytes:Buffer.from('AUDIO-NOVO')});
 st.db.prepare('UPDATE voice_messages SET created_at=? WHERE message_id=?').run(new Date(Date.now()-3*864e5).toISOString(),oldId);
 assert.ok(g.driveFiles.some(f=>f.folder&&f.name==='Áudios'),'pasta Áudios criada ao conectar');
 const r=await svc.offloadVoices();assert.equal(r.moved,1,'só a de mais de 1 dia');
 const vOld=st.voiceMessage(oldId),vNew=st.voiceMessage(freshId);
 assert.ok(vOld.drive_id);assert.equal(vOld.blob.length,0);assert.equal(vOld.sha256,require('node:crypto').createHash('sha256').update('AUDIO-ANTIGO').digest('hex'),'impressão guardada para o reenvio seguro');
 assert.equal(vNew.drive_id,null);assert.equal(Buffer.from(vNew.blob).toString(),'AUDIO-NOVO','a recente fica aqui');
 assert.equal((await svc.voiceBytes(vOld)).toString(),'AUDIO-ANTIGO','toca de volta, vindo do Drive');
 assert.equal(svc.voiceStats().in_drive,1);
});
test('páginas viram .md legível em Sofia OS/Páginas, atualizam quando mudam e vão para a lixeira quando apagadas',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;await new Promise(r=>setTimeout(r,80));
 const blocks=[{type:'heading1',text:'Ideias'},{type:'bullet',text:'Curta Entregador'},{type:'todo',text:'Revisar roteiro',checked:true},{type:'number',text:'Um'},{type:'number',text:'Dois'}];
 const page=w.save({kind:'user_page',title:'Projetos',area:'Pessoal',data:{icon:'🎬',node_type:'page',blocks_json:JSON.stringify(blocks)}});
 const r1=await svc.exportPages();assert.equal(r1.exported,1);
 const file=g.driveFiles.find(f=>f.meta&&f.meta.appProperties&&f.meta.appProperties.sofia_page===page.id);assert.ok(file,'arquivo criado na pasta Páginas');
 const md=Buffer.from(file.bytes).toString('utf8');
 for(const line of ['# 🎬 Projetos','# Ideias','- Curta Entregador','- [x] Revisar roteiro','1. Um','2. Dois'])assert.ok(md.includes(line),line+' em:\n'+md);
 assert.equal((await svc.exportPages()).exported,0,'sem mudança: não reenvia');
 const cur=w.get(page.id);w.save({...cur,title:'Projetos 2026'},page.id);
 const before=g.uploads.length;assert.equal((await svc.exportPages()).exported,1,'mudou: atualiza o mesmo arquivo');assert.equal(g.uploads.length,before+1);
 w.deleteEntity(page.id);const r3=await svc.exportPages();assert.equal(r3.removed,1,'apagada na Sofia: vai para a lixeira do Drive');
 assert.equal((await svc.status()).drive.pages,0);
});

test('item travado para sempre no envio (chave estranha sobrando dos dados dele) se autocorrige e passa a sincronizar',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;
 // Simula o estrago real: um compromisso com uma chave que não existe mais no catálogo
 // (sobra de versão antiga ou de um bug já corrigido) — toda sincronização falhava igual, para sempre.
 const e=w.save({kind:'commitment',title:'Pegar encomenda correio',area:'Geral',data:{start_at:'2026-10-13T10:00:00-03:00',end_at:'2026-10-13T11:00:00-03:00',calendar_provider:'google',calendar_id:'primary',sync_state:'local',external_event_id:'',google_etag:''}});
 w.s.db.prepare("UPDATE entities SET data=json_set(data,'$.campo_de_versao_antiga','x') WHERE id=?").run(e.id);
 assert.ok(JSON.parse(w.s.db.prepare('SELECT data FROM entities WHERE id=?').get(e.id).data).campo_de_versao_antiga,'estrago aplicado de propósito');
 const r1=await svc.sync();
 assert.equal((r1.errors||[]).length,0,'não trava mais o envio: '+JSON.stringify(r1.errors));
 assert.equal(r1.sent,1);
 const after=w.get(e.id);assert.equal(after.data.sync_state,'synced');assert.ok(after.data.external_event_id);assert.ok(!('campo_de_versao_antiga' in after.data),'a chave estranha sumiu sozinha');
 const r2=await svc.sync();assert.equal((r2.errors||[]).length,0);assert.equal(r2.sent,0,'já sincronizado: não tenta de novo');
});

test('compromisso com prioridade é salvo (sem "Campo não previsto") e a prioridade sobrevive ao envio ao Google',async t=>{
 const {svc,core}=await connected(t);const w=core.workspace;
 for(const level of ['none','important','medium','light']){
  const e=w.save({kind:'commitment',title:'Ai '+level,area:'Pessoal',privacy:'private',state:'planned',data:{start_at:'2026-10-16T12:00:00.000Z',priority_level:level,calendar_provider:'google'}});
  assert.equal(e.data.priority_level,level);
 }
 assert.throws(()=>w.save({kind:'commitment',title:'x',data:{start_at:'2026-10-16T12:00:00.000Z',priority_level:'urgentissimo'}}),/opção válida/);
 const r=await svc.sync();assert.equal((r.errors||[]).length,0,JSON.stringify(r.errors));
 const imp=w.list({kind:'commitment'}).find(x=>x.title==='Ai important');
 assert.equal(imp.data.sync_state,'synced');assert.equal(imp.data.priority_level,'important','prioridade não é apagada pela sincronização');
});

test('pastas repetidas de quem JÁ tinha os IDs guardados também se juntam sozinhas (sem reconectar a conta)',async t=>{
 const {svc,g}=await connected(t);
 await svc.ensureFolders();svc.foldersCheckedAt=0; // como um servidor recém-iniciado com IDs antigos guardados
 const cachedRoot=svc.link().drive.folders.root;
 for(let i=0;i<3;i++)g.driveFiles.push({id:'velha'+i,name:'Sofia OS',folder:true,parents:[],createdTime:'2026-10-13T0'+(5+i)+':07:00.000Z'});
 g.driveFiles.push({id:'backup-perdido',name:'backup.json',parents:['velha1']});
 const id=await svc.folderId('Backups');
 assert.ok(id);assert.equal(g.driveFiles.filter(f=>f.folder&&f.name==='Sofia OS'&&!f.trashed).length,1,'só sobrou uma "Sofia OS"');
 assert.equal(svc.link().drive.folders.root,cachedRoot,'mantém a mais antiga');
 assert.ok(g.driveFiles.find(f=>f.id==='backup-perdido').parents.includes(cachedRoot),'conteúdo das repetidas foi movido, não apagado');
 const calls=g.calls?g.calls.length:0;await svc.folderId('Backups');if(g.calls)assert.equal(g.calls.length,calls,'dentro de 6 h usa o ID guardado, sem listar de novo');
});

test('compromisso que tinha lembrete próprio e volta ao padrão não dá "Cannot specify both default reminders and overrides"',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;
 const e=w.save({kind:'commitment',title:'Mais laeser',area:'Pessoal',data:{start_at:'2026-10-16T12:00:00.000Z',remind_minutes:30,calendar_provider:'google'}});
 let r=await svc.sync();assert.equal((r.errors||[]).length,0,JSON.stringify(r.errors));
 const ev=g.events.primary.find(x=>x.summary==='Mais laeser');assert.equal(ev.reminders.overrides[0].minutes,30);
 // dono tira o lembrete próprio -> volta ao padrão do calendário
 const cur=w.get(e.id);w.save({revision:cur.revision,title:'Mais laeser 2',data:{...cur.data,remind_minutes:''}},e.id);
 r=await svc.sync();assert.equal((r.errors||[]).length,0,'não trava: '+JSON.stringify(r.errors));
 const after=g.events.primary.find(x=>x.id===ev.id);assert.equal(after.summary,'Mais laeser 2');assert.equal(after.reminders.useDefault,true);assert.equal((after.reminders.overrides||[]).length,0);
 assert.equal(w.get(e.id).data.sync_state,'synced');
});

test('pastas que rodam ao mesmo tempo (envio, anexos, voz, páginas) não criam cada uma a sua própria "Sofia OS"',async t=>{
 const {svc,g}=await connected(t);
 await Promise.all([svc.ensureFolders(),svc.ensureFolders(),svc.ensureFolders()]);
 assert.equal(g.driveFiles.filter(f=>f.folder&&f.name==='Sofia OS').length,1);
 assert.equal(g.driveFiles.filter(f=>f.folder).length,7,'raiz + Backups + Anexos + Áudios + Páginas + Comprovantes + Backup com senha, uma vez cada');
});
test('bagunça já feita (4 pastas "Sofia OS" de antes desta correção) se desfaz sozinha: fica uma, o conteúdo das outras é preservado',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;
 g.driveFiles=g.driveFiles.filter(f=>!(f.folder&&f.name==='Sofia OS'));
 const ids=[];for(let i=0;i<4;i++){const id='dup'+i;g.driveFiles.push({id,name:'Sofia OS',folder:true,parents:[],createdTime:'2026-10-13T0'+i+':07:00.000Z'});ids.push(id);}
 g.driveFiles.push({id:'arquivo-perdido',name:'algo.md',parents:[ids[2]]}); // conteúdo dentro de uma das duplicatas
 const folders=await svc.ensureFolders();
 assert.equal(g.driveFiles.filter(f=>f.folder&&f.name==='Sofia OS').length,1,'só sobrou uma');
 assert.equal(folders.root,ids[0],'a mais velha (02:07 -> 00:07, a de índice 0) venceu');
 const arquivo=g.driveFiles.find(f=>f.id==='arquivo-perdido');assert.deepEqual(arquivo.parents,[ids[0]]),'o conteúdo foi movido para a vencedora, não se perdeu';
});
test('aniversário e outros tipos especiais do Google (foco, fora do escritório...) entram como só-leitura, mesmo vindos do calendário principal',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;
 g.events.primary=[ev('bday1','Feliz aniversário!','2026-10-20','2026-10-21',{eventType:'birthday'}),ev('focus1','Foco','2026-10-13T09:00:00-03:00','2026-10-13T11:00:00-03:00',{eventType:'focusTime'}),ev('normal1','Dentista','2026-10-13T15:00:00-03:00','2026-10-13T16:00:00-03:00')];
 await svc.sync();
 const items=w.list({kind:'commitment',limit:50});
 assert.equal(items.find(x=>x.title==='Feliz aniversário!').data.google_readonly,true);
 assert.equal(items.find(x=>x.title==='Foco').data.google_readonly,true);
 assert.equal(items.find(x=>x.title==='Dentista').data.google_readonly,false);
});
test('compromisso travado para sempre porque o Google recusa editar aquele tipo de evento vira só-leitura sozinho, em vez de repetir o erro pra sempre',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;
 const e=w.save({kind:'commitment',title:'Happy birthday!',area:'Geral',data:{start_at:'2026-10-20T03:00:00.000Z',end_at:'2026-10-21T03:00:00.000Z',calendar_provider:'google',calendar_id:'primary',sync_state:'synced',external_event_id:'bday-ext',google_etag:'"x"',google_rev:1}});
 w.save({revision:e.revision,data:{...e.data}},e.id); // bump revision local sem bater o google_rev
 g.fail=(method,url)=>method==='PATCH'&&url.includes('/events/bday-ext')?{status:400,message:"Google: Attempt made to modify 'birthday' event in a way that is not valid for t"}:null;
 const r=await svc.sync();
 assert.equal((r.errors||[]).length,0,'não aparece mais o erro vermelho para sempre: '+JSON.stringify(r.errors));
 assert.equal(w.get(e.id).data.google_readonly,true);
 g.fail=null;const r2=await svc.sync();assert.equal(r2.sent,0,'agora é só-leitura: nunca mais tenta reenviar');
});

test('0.3.148: "Bad Request" de UM compromisso nao vira erro da conta: corpo valido, nova tentativa simples, motivo guardado e sem insistir',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;
 // dia inteiro com fim igual ao inicio (o Google exige fim exclusivo, depois do inicio): agora sai corrigido
 w.save({kind:'commitment',title:'BK 10 ANOS CASTELOS E RUÍNAS',area:'Pessoal',data:{calendar_all_day:true,calendar_date_start:'2026-11-07',calendar_date_end:'2026-11-07',calendar_provider:'google'}});
 let r=await svc.sync();assert.equal(r.sent,1);
 assert.deepEqual(g.events.primary.find(e=>e.summary==='BK 10 ANOS CASTELOS E RUÍNAS').end,{date:'2026-11-08'});
 // um compromisso que o Google recusa sempre: vai para "item_errors", nao para o erro da conta
 const ruim=w.save({kind:'commitment',title:'Recusado',area:'Pessoal',data:{start_at:'2026-11-10T13:00:00.000Z',calendar_provider:'google',remind_minutes:15}});
 let tries=0;g.fail=(m,p)=>m==='POST'&&/events$/.test(p)?(tries++,{status:400,message:'Bad Request'}):null;
 r=await svc.sync();
 assert.equal(tries,2,'tentou com tudo e depois so com titulo e horario');
 const st=await svc.status();assert.ok(!st.error,'sem banner de erro da conta');assert.equal(st.item_errors[0].title,'Recusado');assert.match(st.item_errors[0].reason,/Bad Request/);
 assert.equal(w.get(ruim.id).data.sync_state,'error');
 tries=0;await svc.sync();assert.equal(tries,0,'nao reenvia a mesma versao a cada sincronizacao');
 g.fail=null;
});
