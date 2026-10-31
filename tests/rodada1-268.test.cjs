'use strict';
// 0.3.268 (Rodada 1 de 31/10): Quadro da conversa preenchido em producao, foto do perfil no servidor, um item so com titulo inteiro.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {fixture}=require('./helpers.cjs');const {createRuntime}=require('../src/core/runtime');const {singleItemGuard,cleanTitle}=require('../src/services/intent-engine');
async function boot(t,provider){
 const f=fixture(t);f.config.loginPassword='integration-test-password-only';f.config.loginEmail='owner@example.com';
 const r=createRuntime(f.config,{store:f.store,provider:provider||f.provider,secureDir:path.join(f.dir,'secure')});
 const server=http.createServer(r.handler);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const {token}=await (await fetch(base+'/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:f.config.loginPassword})})).json();
 return {f,r,base,H:{Authorization:'Bearer '+token,'Content-Type':'application/json'}};
}
test('quadro: a IA e chamada pelo roteamento (runtime.provider nao existe em producao) e abrir a conversa monta o quadro',async t=>{
 let calls=0;const fake={respond:async()=>({reply:'ok',usage:{input_tokens:1,output_tokens:1}}),structured:async()=>{calls++;return {data:{topics:[{title:'Lembrete de amanhã',start:0,decided:['Lembrete criado para amanhã'],todo:['Comprar bag e inalador'],open:[],numbers:[],refs:[]}]},usage:{input_tokens:1,output_tokens:1}};}};
 const {f,r,base,H}=await boot(t,fake);
 assert.equal(r.provider,undefined,'o runtime de verdade nao expoe provider');
 const conv=(await (await fetch(base+'/api/mobile/conversations',{method:'POST',headers:H,body:'{}'})).json()).conversation;
 const add=(role,content)=>f.store.db.prepare("INSERT INTO messages(id,owner,conversation_id,role,content,status,created_at) VALUES(?,?,?,?,?,'sent',?)").run(crypto.randomUUID(),'owner-local',conv.id,role,content,new Date().toISOString());
 add('user','cria uma tarefa pra amanhã comprar bag, inalador');add('assistant','Coloquei na agenda de amanhã.');
 const first=await (await fetch(base+'/api/mobile/conversations/'+conv.id+'/board',{headers:H})).json();assert.deepEqual(first.topics,[]);
 await new Promise(ok=>setTimeout(ok,300));
 const later=await (await fetch(base+'/api/mobile/conversations/'+conv.id+'/board',{headers:H})).json();
 assert.equal(later.topics.length,1,'quadro preenchido');assert.deepEqual(later.topics[0].todo,['Comprar bag e inalador']);
 await new Promise(ok=>setTimeout(ok,200));assert.equal(calls,1,'sem mensagem nova a IA nao e chamada de novo');
});
test('foto do perfil: guardada no servidor, mesma no app e no site, e pode ser removida',async t=>{
 const {base,H}=await boot(t);
 const empty=await (await fetch(base+'/api/mobile/profile/photo',{headers:H})).json();assert.equal(empty.photo,null);
 const b64=Buffer.alloc(300,7).toString('base64');
 const put=await (await fetch(base+'/api/mobile/profile/photo',{method:'POST',headers:H,body:JSON.stringify({mime:'image/png',base64:b64})})).json();assert.ok(put.updated_at);
 const got=await (await fetch(base+'/api/mobile/profile/photo',{headers:H})).json();assert.equal(got.photo.mime,'image/png');assert.equal(got.photo.base64,b64);assert.equal(got.photo.updated_at,put.updated_at);
 const bad=await fetch(base+'/api/mobile/profile/photo',{method:'POST',headers:H,body:JSON.stringify({mime:'image/png',base64:'nao e imagem'})});assert.equal(bad.status,400);
 await fetch(base+'/api/mobile/profile/photo',{method:'DELETE',headers:H});
 assert.equal((await (await fetch(base+'/api/mobile/profile/photo',{headers:H})).json()).photo,null);
});
test('um item so com o titulo inteiro: a Sofia nao corta o titulo nem cria pagina que estava dentro dele',()=>{
 const msg='cria uma tarefa na agenda pra amanhã comprar bag, inalador e criar uma página para meditações com senha';
 const plan={intent:'compound',action:{},actions:[{intent:'create_task',action:{title:'Comprar bag, inalador',date:'2026-11-01',time:''}},{intent:'create_user_page',action:{title:'Meditações'}}]};
 const r=singleItemGuard(plan,msg);
 assert.equal(r.intent,'create_task');assert.equal(r.actions.length,0);assert.equal(r.action.date,'2026-11-01');
 assert.equal(r.action.title,'Comprar bag, inalador e criar uma página para meditações com senha');
 // segunda ordem no imperativo continua sendo duas coisas
 assert.equal(singleItemGuard(plan,'cria uma tarefa pra amanhã comprar pão e cria uma página Receitas').intent,'compound');
 // nada muda em conversa comum ou quando o modelo ja acertou
 assert.equal(singleItemGuard({intent:'respond',action:{},actions:[]},'oi Sofia').intent,'respond');
 const ok={intent:'create_reminder',action:{title:'Ligar pro banco'},actions:[]};assert.equal(singleItemGuard(ok,'me lembra amanhã às 9h de ligar pro banco'),ok);
 assert.equal(cleanTitle(' pra sexta às 14h levar o carro'),'Levar o carro');
});
