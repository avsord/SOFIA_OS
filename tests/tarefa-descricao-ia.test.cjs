'use strict';
// 06/11/2026 (Pedro): tarefa criada pela conversa ("Fazer processos Descrição: Suporte Vertical, ...") ficava sem descrição.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,blankAction,base}=require('./helpers.cjs');
const run=(f,user,action)=>f.core.execute({id:null,content:user},base('create_task',{action:{...blankAction(),...action}}),'private');
test('tarefa da conversa grava a descrição (do content da ação ou do "Descrição:" da mensagem)',async t=>{
 const f=fixture(t);
 await run(f,'Fazer processos Descrição: Suporte Vertical, Bobes\n\n(Pedido pela linha do tempo do Início, para hoje às 07:00.)',{title:'Fazer processos'});
 let task=f.store.tasks().find(x=>x.title==='Fazer processos');assert.equal(task.description,'Suporte Vertical, Bobes');
 await run(f,'cria tarefa comprar fita',{title:'Comprar fita',content:'fita dupla face 3M'});
 task=f.store.tasks().find(x=>x.title==='Comprar fita');assert.equal(task.description,'fita dupla face 3M');
 await run(f,'cria tarefa ligar banco',{title:'Ligar banco'});
 task=f.store.tasks().find(x=>x.title==='Ligar banco');assert.equal(task.description||'','');
});
test('tarefa e compromisso "das 6h até 7:30" gravam o fim; numero comum nao vira horario',async t=>{
 const f=fixture(t);
 await run(f,'Trabalhar prioridade média das 6hrs até 7:30',{title:'Trabalhar',date:'2026-11-07',time:'06:00'});
 const task=f.store.tasks().find(x=>x.title==='Trabalhar');assert.ok(task.end_at,'tem fim');assert.equal((Date.parse(task.end_at)-Date.parse(task.due_at))/60000,90);
 await run(f,'comprar 2 a 3 pacotes',{title:'Comprar pacotes',date:'2026-11-07',time:'10:00'});
 assert.equal(f.store.tasks().find(x=>x.title==='Comprar pacotes').end_at||'','');
 // edicao sem end_at mantem o fim
 const kept=f.store.saveTask({...task,title:'Trabalhar 2',end_at:undefined},task.id);assert.equal(kept.end_at||f.store.task(task.id).end_at,task.end_at);
});
