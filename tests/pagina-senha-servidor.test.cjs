'use strict';
// 06/11/2026 (Pedro: pagina com senha escrita perguntava "quer trancar?"; "nao" salva sem erro; trancada fica so cifrada)
const test=require('node:test'),assert=require('node:assert/strict');
const {httpFixture}=require('./helpers.cjs');
const blocks=t=>JSON.stringify([{id:'1',type:'text',text:t}]);
const mk=(f,title,tags,data)=>f.request('/api/entities',{kind:'user_page',title,content:'',area:'Pessoal',privacy:'private',state:'active',tags,data:{icon:'',icon_mode:'default',cover_type:'',cover_value:'',cover_attachment_id:'',purpose:'',layout:'notes',suggested:false,parent_id:'',node_type:'space',blocks_json:'[]',...data}});
test('pagina com senha escrita: sem resposta recusa; "nao, salvar sem senha" salva e fica fora da IA; trancada nao vai ao link publico',async t=>{
 const f=await httpFixture(t);
 const a=await mk(f,'Infos',[],{blocks_json:blocks('Senha: Jotacom10$')});assert.equal(a.status,400);assert.equal(a.body.code,'POSSIBLE_SECRET');
 const b=await mk(f,'Infos',['sofia-secret-ok-v1'],{blocks_json:blocks('Senha: Jotacom10$')});assert.ok([200,201].includes(b.status),JSON.stringify(b.body));
 const ws=f.core.workspace;assert.ok(!ws.context('Jotacom10 senha infos',8).some(e=>e.id===b.body.id),'a IA nao le a pagina marcada');
 const c=await mk(f,'Cofre',['sofia-lock-v1'],{lock_json:JSON.stringify({v:1,kid:'k'.repeat(20),ct:'xx'})});assert.ok([200,201].includes(c.status));
 const tok=(await f.request('/api/pages/'+c.body.id+'/share',{on:true})).body.token;
 assert.equal((await fetch(f.base+'/p/'+tok)).status,404,'trancada nao abre no link publico');
});
test('chave do nivel Media: guarda, e "esqueci a senha" exige a senha da conta',async t=>{
 const f=await httpFixture(t);const kid='a'.repeat(22),key=Buffer.alloc(32,7).toString('base64');
 assert.equal((await f.request('/api/pages/lock-key',{kid,key})).status,200);
 const wrong=await f.request('/api/pages/lock-recover',{kid,password:'errada'});assert.equal(wrong.status,403);
 assert.equal((await f.request('/api/pages/lock-key',{kid:'curto',key})).status,400);
});
