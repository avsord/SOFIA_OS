'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const {GoogleService}=require('../src/services/google');
// 0.3.346 (Pedro): compromisso criado sem fim (pela Sofia) continua sem fim depois de ir e voltar do Google,
// que exige um fim e recebe inicio + 1 h; se a pessoa mudar o fim no Google, vale o que ela pos.
test('0.3.346: compromisso sem fim continua sem fim na volta do Google (so muda se a pessoa mudar la)',t=>{
 const f=fixture(t),svc=new GoogleService(f.store,f.core.workspace,f.config,{fetchImpl:async()=>({ok:true,status:200,json:async()=>({})}),env:{}});
 const start='2026-11-04T14:00:00.000Z';
 const local=f.core.workspace.save({kind:'commitment',title:'Acompanhar valor do curso',content:'',area:'Pessoal',privacy:'private',state:'planned',tags:[],data:{start_at:start,end_at:'',calendar_provider:'google',calendar_id:'primary',external_event_id:'ev1'}});
 assert.equal(svc.eventBody(local).end.dateTime,new Date(Date.parse(start)+3600000).toISOString(),'o Google recebe inicio + 1 h');
 const report={created:0,updated:0,removed:0,skipped:0,errors:[]};
 const ev=(endMs)=>({id:'ev1',status:'confirmed',summary:'Acompanhar valor do curso',start:{dateTime:start},end:{dateTime:new Date(Date.parse(start)+endMs).toISOString()}});
 const back=svc.saveFromGoogle(ev(3600000),'primary',false,f.core.workspace.get(local.id),report);
 assert.equal(back.data.end_at,'','continua so com o inicio (um ponto na linha do tempo)');
 const changed=svc.saveFromGoogle(ev(2*3600000),'primary',false,f.core.workspace.get(local.id),report);
 assert.equal(changed.data.end_at,new Date(Date.parse(start)+2*3600000).toISOString(),'fim posto no Google vale');
 const fresh=svc.saveFromGoogle({id:'ev2',status:'confirmed',summary:'Reuniao',start:{dateTime:start},end:{dateTime:new Date(Date.parse(start)+3600000).toISOString()}},'primary',false,null,report);
 assert.ok(fresh.data.end_at,'evento novo vindo do Google mantem o fim dele');
});
