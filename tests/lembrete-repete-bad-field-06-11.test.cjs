'use strict';
// 06/11/2026: log do servidor "[lembrete] nao reagendado: ... BAD_FIELD" a cada minuto. O agendador grava o dia original
// (repeat_day) ao passar um lembrete mensal para a proxima vez, mas o tipo lembrete nao tinha esse campo: a gravacao era
// recusada, o lembrete nao ia para o mes seguinte e o aviso se repetia.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');const {Workspace}=require('../src/core/workspace');const {Scheduler}=require('../src/services/scheduler');
test('lembrete mensal vencido vai para o mes seguinte sem BAD_FIELD',async t=>{
 const f=fixture(t),w=new Workspace(f.store);
 const e=w.save({kind:'reminder',title:'Pagar conta',area:'Pessoal',state:'active',tags:['sofia-repeat-v1:monthly:America/Sao_Paulo'],data:{remind_at:'2026-11-05T12:00:00.000Z',message:'conta'}});
 const warns=[],orig=console.warn;console.warn=(...a)=>warns.push(a.join(' '));
 try{await new Scheduler(w,{clock:()=>new Date('2026-11-06T12:00:00.000Z')}).tick();}finally{console.warn=orig;}
 assert.deepEqual(warns.filter(x=>x.includes('nao reagendado')),[]);
 const after=w.get(e.id);assert.equal(after.state,'active');assert.equal(after.data.remind_at.slice(0,10),'2026-12-05');assert.equal(after.data.repeat_day,5);
});
