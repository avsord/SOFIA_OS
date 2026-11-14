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
 // 14/11/2026 (Pedro: "so fica o simbolo de fim se o usuario pos um horario final; o Google ja da um final automatico")
 assert.equal(fresh.data.end_at,'','evento novo do Google com o fim automatico (duracao padrao, 60 min) fica so com o ponto');
 assert.equal(fresh.data.end_rule_v,1,'a regra fica gravada (nao reprocessa a cada sincronia)');
 const longo=svc.saveFromGoogle({id:'ev3',status:'confirmed',summary:'Aula',start:{dateTime:start},end:{dateTime:new Date(Date.parse(start)+90*60000).toISOString()}},'primary',false,null,report);
 assert.ok(longo.data.end_at,'fim escolhido no Google (diferente do padrao) vale');
 svc.autoEventMinutes=30;
 const meia=svc.saveFromGoogle({id:'ev4',status:'confirmed',summary:'Call',start:{dateTime:start},end:{dateTime:new Date(Date.parse(start)+30*60000).toISOString()}},'primary',false,null,report);
 assert.equal(meia.data.end_at,'','padrao da agenda de 30 min tambem conta como automatico');
 const marcado=svc.saveFromGoogle({id:'ev5',status:'confirmed',summary:'Da Sofia',extendedProperties:{private:{sofia_no_end:'1'}},start:{dateTime:start},end:{dateTime:new Date(Date.parse(start)+3600000).toISOString()}},'primary',false,null,report);
 assert.equal(marcado.data.end_at,'','evento sem fim enviado pela Sofia (marcado) volta sem fim');
 assert.equal(svc.eventBody(local).extendedProperties.private.sofia_no_end,'1');
});
