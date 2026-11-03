'use strict';
// 0.3.353: o Quadro da conversa nao repete chamada que falhou e continua atualizando depois de 80 mensagens.
const test=require('node:test'),assert=require('node:assert');
const {DatabaseSync}=require('node:sqlite');
const {createConversationBoard}=require('../src/services/conversation-board');
const {OWNER}=require('../src/memory/store');
function fakeStore(n){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE conversations(id TEXT,owner TEXT,title TEXT)');db.prepare('INSERT INTO conversations VALUES(?,?,?)').run('c1',OWNER,'Conversa com a Sofia');
 const msgs=[];const add=k=>{for(let i=0;i<k;i++){const s=msgs.length+1;msgs.push({sequence:s,id:'m'+s,role:s%2?'user':'assistant',content:'mensagem '+s,status:'ok',created_at:new Date().toISOString()});}};add(n);
 return {db,add,messages:(id,limit)=>msgs.slice(-limit)};}
test('falha nao se repete para as mesmas mensagens',async()=>{const store=fakeStore(4);let calls=0;
 const board=createConversationBoard({store,provider:{structured:async()=>{calls++;throw new Error('incompleto');}}});
 await assert.rejects(board.update('c1'));await board.update('c1');await board.update('c1');
 assert.strictEqual(calls,1,'so uma chamada para as mesmas mensagens depois da falha');
 store.add(2);await assert.rejects(board.update('c1'));assert.strictEqual(calls,2,'mensagem nova tenta de novo');});
test('conversa com mais de 80 mensagens continua atualizando',async()=>{const store=fakeStore(90);let calls=0;
 const board=createConversationBoard({store,provider:{structured:async()=>{calls++;return {topics:[{title:'Assunto',start:0,decided:[],todo:[],open:[],numbers:[],refs:[]}]};}}});
 await board.update('c1');await board.update('c1');assert.strictEqual(calls,1,'sem mensagem nova nao chama de novo');
 store.add(1);await board.update('c1');assert.strictEqual(calls,2,'mensagem 91 atualiza o quadro');});
