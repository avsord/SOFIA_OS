'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const model=load('src/lib/chat-model.ts'),{reconcileMessages,toggleMessageSelection,retainMessageSelection}=load('src/lib/chat-sync.ts',{'./chat-model':model});
const m=(n,extra={})=>({id:'m'+n,sequence:n,role:'user',content:'message '+n,created_at:'2026-10-02T12:00:00Z',status:'completed',...extra});
test('remote additions and status changes are reflected without duplicates',()=>{const result=reconcileMessages([m(1),m(2,{status:'pending'})],{messages:[m(1),m(2),m(3)],has_more:false});assert.equal(result.length,3);assert.equal(result[1].status,'completed');});
test('deleted messages disappear from the authoritative window and older loaded pages',()=>{const result=reconcileMessages([m(1),m(2),m(100),m(101)],{messages:[m(100),m(102)],has_more:true,deleted_ids:['m1','m101']});assert.deepEqual(Array.from(result,x=>x.id),['m2','m100','m102']);});
test('an unmarked empty remote page keeps persisted messages; confirmed tombstones remove only selected rows',()=>{const draft=m(8,{sequence:undefined,status:'failed'});const saved=[m(1),draft];const transient=reconcileMessages(saved,{messages:[],has_more:false});assert.deepEqual(Array.from(transient,x=>x.id),['m1','m8']);const confirmed=reconcileMessages(saved,{messages:[],has_more:false,deleted_ids:['m1']});assert.deepEqual(Array.from(confirmed,x=>x.id),['m8']);});
test('a persisted acknowledgement replaces its optimistic client ID',()=>{const a=m(8,{sequence:undefined,status:'sending',client_id:'client'}),b=m(9,{client_id:'client'});assert.deepEqual(Array.from(reconcileMessages([a],{messages:[b],has_more:false}),x=>x.id),['m9']);});
test('unchanged snapshots keep their array identity to avoid periodic re-renders',()=>{const old=[m(1)];assert.equal(reconcileMessages(old,{messages:[m(1)],has_more:false}),old);});
test('selection is opt-in, multiple, toggleable and capped at the batch limit',()=>{let selection=new Set();selection=toggleMessageSelection(selection,'m1');selection=toggleMessageSelection(selection,'m2');assert.equal(selection.size,2);selection=toggleMessageSelection(selection,'m1');assert.equal(selection.has('m1'),false);for(let i=0;i<120;i++)selection=toggleMessageSelection(selection,'x'+i);assert.equal(selection.size,100);});
test('remote deletion also removes a selected row',()=>{assert.deepEqual([...retainMessageSelection(new Set(['m1','m2']),[m(2)])],['m2']);});
test('09/11: mensagem ainda saindo fica no fim, mesmo escrita antes de mensagens ja respondidas',()=>{
 const m=(id,role,at,extra={})=>({id,role,content:id,created_at:at,...extra});
 const out=model.mergeMessages([m('a','user','2026-11-09T20:21:00Z'),m('b','assistant','2026-11-09T20:21:05Z')],[m('c','user','2026-11-09T20:18:00Z',{client_id:'x',status:'sending'})]);
 assert.equal(out.map(x=>x.id).join(','),'a,b,c');
 const done=model.mergeMessages(out,[m('srv','user','2026-11-09T20:21:10Z',{client_id:'x',status:'sent'})]);
 assert.equal(done.map(x=>x.id).join(','),'a,b,srv');
});
