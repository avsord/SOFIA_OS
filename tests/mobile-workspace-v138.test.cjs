'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),crypto=require('node:crypto');
const {fixture}=require('./helpers.cjs');
const {createRuntime}=require('../src/core/runtime');
const {totp}=require('../src/services/vault');
const PASSWORD='development-fixture-only-138';
async function setup(t){
 const f=fixture(t);f.config.loginPassword=PASSWORD;f.config.loginEmail='mobile-owner@example.com';
 const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
 const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 async function request(p,body,m=body===undefined?'GET':'POST',token='',headers={}){const r=await fetch(base+'/api/mobile'+p,{method:m,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 async function login(){const r=await request('/auth/login',{email:'mobile-owner@example.com',password:PASSWORD});assert.equal(r.status,200,JSON.stringify(r.body));return r.body.token;}
 return {...f,...runtime,base,request,login};
}
test('native workspace: bearer required and secret/config/admin endpoints are not bridged',async t=>{
 const f=await setup(t);assert.equal((await f.request('/workspace/catalog')).status,401);const token=await f.login();
 const r=await f.request('/workspace/catalog',undefined,'GET',token);assert.equal(r.status,200);assert.ok(r.body.catalog.user_page);assert.ok(r.body.catalog.course);assert.ok(r.body.catalog.monitor);
 for(const p of ['/workspace/credentials','/workspace/jobs/tick','/workspace/backups/restore'])assert.equal((await f.request(p,{},'POST',token)).status,404);
});
test('native workspace: page create/edit/delete uses same records as web and revision conflicts stay protected',async t=>{
 const f=await setup(t),token=await f.login();const r=await f.request('/workspace/entities',{kind:'user_page',title:'Celular e site',area:'Pessoal',privacy:'private',data:{blocks_json:JSON.stringify([{id:'b1',type:'text',text:'Mesmo conteúdo'}])}},'POST',token);
 assert.equal(r.status,201,JSON.stringify(r.body));const id=r.body.id;assert.equal(f.workspace.get(id).title,'Celular e site');
 const web=await fetch(f.base+'/api/entities/'+id).then(x=>x.json());assert.equal(web.title,r.body.title);
 const changed=await f.request('/workspace/entities/'+id,{...r.body,title:'Editado no celular'},'PATCH',token);assert.equal(changed.status,200,JSON.stringify(changed.body));
 assert.equal((await f.request('/workspace/entities/'+id,{...r.body,title:'Versão velha'},'PATCH',token)).status,409);
 assert.equal((await f.request('/workspace/entities/'+id,undefined,'DELETE',token)).status,200);
 assert.equal((await f.request('/workspace/entities/'+id,undefined,'GET',token)).status,404);
});
test('native workspace: task CRUD retains revision checks and reflects immediately in shared store',async t=>{
 const f=await setup(t),token=await f.login();const r=await f.request('/tasks',{title:'Tarefa do celular',area:'Pessoal',priority_level:'important'},'POST',token);
 assert.equal(r.status,200,JSON.stringify(r.body));const task=r.body.item;assert.equal(task.priority_level,'important');
 const updated=await f.request('/tasks/'+task.id,{title:'Concluída no app',state:'done',revision:task.revision},'PATCH',token);assert.equal(updated.status,200);assert.equal(f.store.task(task.id).title,'Concluída no app');
 assert.equal((await f.request('/tasks/'+task.id,{state:'todo',revision:task.revision},'PATCH',token)).status,409);
 assert.equal((await f.request('/tasks/'+task.id,undefined,'DELETE',token)).status,200);
});
test('native workspace: private diary still requires Authenticator grant and does not become normal chat context',async t=>{
 const f=await setup(t),token=await f.login();assert.equal((await f.request('/workspace/vault/entries',undefined,'GET',token)).status,403);
 const s=await f.request('/workspace/vault/setup',{},'POST',token);assert.equal(s.status,200);
 const code=totp(s.body.secret,Math.floor(Date.now()/30000));const c=await f.request('/workspace/vault/confirm',{code},'POST',token);assert.equal(c.status,200);const headers={'X-Sofia-Vault':c.body.grant};
 assert.equal((await f.request('/workspace/vault/entries',{title:'Privado',content:'EntradaConfidencial138'},'POST',token)).status,403);
 const a=await f.request('/workspace/vault/entries',{title:'Privado',content:'EntradaConfidencial138'},'POST',token,headers);assert.equal(a.status,201,JSON.stringify(a.body));
 const list=await f.request('/workspace/vault/entries',undefined,'GET',token,headers);assert.equal(list.body.items[0].content,'EntradaConfidencial138');
 const raw=f.store.db.prepare('SELECT ciphertext FROM vault_entries').get();assert.equal(raw.ciphertext.includes('EntradaConfidencial138'),false);
 assert.equal(f.store.db.prepare("SELECT count(*) n FROM messages WHERE content LIKE '%EntradaConfidencial138%'").get().n,0);
 await f.request('/workspace/vault/lock',{},'POST',token,headers);assert.equal((await f.request('/workspace/vault/entries',undefined,'GET',token,headers)).status,403);
});
test('native sessions: logout-all revokes both tokens; change-password invalidates older credentials',async t=>{
 const f=await setup(t),a=await f.login(),b=await f.login();assert.equal((await f.request('/auth/logout-all',{},'POST',a)).status,200);
 for(const token of [a,b])assert.equal((await f.request('/bootstrap',undefined,'GET',token)).status,401);
 const c=await f.login();const r=await f.request('/auth/change-password',{currentPassword:PASSWORD,newPassword:'another-fixture-password-138',confirmPassword:'another-fixture-password-138'},'POST',c);assert.equal(r.status,200);
 assert.equal((await f.request('/bootstrap',undefined,'GET',c)).status,401);assert.equal((await f.request('/auth/login',{email:'mobile-owner@example.com',password:PASSWORD})).status,401);
});
test('native conversation: same owner web conversation is visible and continues in same history',async t=>{
 const f=await setup(t),token=await f.login(),c=f.store.createConversation('Conversa iniciada no site','web');
 const r=await f.request('/messages',{conversation_id:c.id,client_message_id:crypto.randomUUID(),message:'Olá Sofia'},'POST',token);assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.conversation_id,c.id);assert.equal(f.store.messages(c.id).length,2);
 const list=await f.request('/conversations',undefined,'GET',token);assert.ok(list.body.items.some(i=>i.id===c.id));
});
test('barra lateral igual em todo navegador: subatalho e cores dos pontos ficam na conta',async t=>{
 const f=await setup(t),token=await f.login();const r=await f.request('/workspace/entities',{kind:'user_page',title:'Pai',area:'Pessoal',privacy:'private',data:{}},'POST',token);
 assert.equal(r.status,201,JSON.stringify(r.body));const id=r.body.id;
 assert.equal(f.workspace.get(id).data.sidebar_sub,undefined,'sem escolha, o campo não existe (o site sobe o que estava só no navegador)');
 const p=await f.request('/workspace/entities/'+id,{revision:r.body.revision,data:{...r.body.data,sidebar_sub:true,sidebar_color:'#87d900',sidebar_colors:{nota1:'#005ed9'}}},'PATCH',token);
 assert.equal(p.status,200,JSON.stringify(p.body));const d=f.workspace.get(id).data;
 assert.equal(d.sidebar_sub,true);assert.equal(d.sidebar_color,'#87d900');assert.deepEqual(d.sidebar_colors,{nota1:'#005ed9'});
 const bad=await f.request('/workspace/entities/'+id,{revision:p.body.revision,data:{...d,sidebar_colors:{x:'url(javascript:1)'}}},'PATCH',token);
 assert.equal(bad.status,400);
});
