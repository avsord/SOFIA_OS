'use strict';
// 03/11/2026: o app ja tinha "apagar conversas selecionadas", mas o servidor nao tinha a rota nem a capacidade
// conversation_delete - a pessoa sempre via "A exclusao de conversas aguarda a atualizacao do servidor".
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path');
const {fixture}=require('./helpers.cjs');const {createRuntime}=require('../src/core/runtime');
test('apaga so as conversas pedidas, do dono, e anuncia a capacidade',async t=>{
 const f=fixture(t);f.config.loginPassword='development-fixture-only-1103';f.config.loginEmail='owner@example.com';
 const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
 const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const token=(await (await fetch(base+'/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:'development-fixture-only-1103'})})).json()).token;
 const H={'Content-Type':'application/json',Authorization:'Bearer '+token};
 const caps=await (await fetch(base+'/api/mobile/md/capabilities',{headers:H})).json();assert.equal(caps.conversation_delete,true);
 const mk=async()=>(await (await fetch(base+'/api/mobile/conversations',{method:'POST',headers:H,body:'{}'})).json()).conversation.id;
 const a=await mk(),b=f.store.createConversation('Outra conversa','mobile').id;assert.notEqual(a,b);
 const r=await fetch(base+'/api/mobile/md/conversations',{method:'DELETE',headers:H,body:JSON.stringify({ids:[a,'nao-existe']})});
 assert.equal(r.status,200);assert.equal((await r.json()).conversations,1);
 assert.equal(f.store.db.prepare('SELECT state FROM conversations WHERE id=?').get(a).state,'deleted');
 assert.notEqual(f.store.db.prepare('SELECT state FROM conversations WHERE id=?').get(b).state,'deleted');
 const bad=await fetch(base+'/api/mobile/md/conversations',{method:'DELETE',headers:H,body:JSON.stringify({ids:[]})});assert.equal(bad.status,400);
});
