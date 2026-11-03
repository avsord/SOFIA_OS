'use strict';
// 0.3.203: a Sofia dizia "nao consegui ler a imagem" - a foto so chegava ao planejador, nao a quem responde.
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),crypto=require('node:crypto');
const {fixture}=require('./helpers.cjs');const {createRuntime}=require('../src/core/runtime');
const PASSWORD='development-fixture-only-203';
// 03/11/2026: o Quadro da conversa roda em segundo plano 50 ms depois de cada mensagem e troca fotos por [imagem] de
// proposito; num CI lento a chamada dele caia na janela da mensagem seguinte e o teste falhava sem o app ter mudado.
test('foto do cupom chega a quem responde; "ta na imagem" logo depois tambem leva a foto',async t=>{
 const f=fixture(t);f.config.loginPassword=PASSWORD;f.config.loginEmail='owner@example.com';
 const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
 const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const H=tok=>({'Content-Type':'application/json',Authorization:'Bearer '+tok});
 const token=(await (await fetch(base+'/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:PASSWORD})})).json()).token;
 const w=runtime.core.workspace;const e=w.save({kind:'file',title:'cupom.png',area:'Pessoal',state:'saved',tags:['chat-attachment'],data:{provider:'local',logical_path:'conversations/x',description:'Arquivo enviado na conversa com a Sofia'}});
 const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(3000,9)]);
 const att=await (await fetch(base+'/api/mobile/workspace/entities/'+e.id+'/attachments',{method:'POST',headers:H(token),body:JSON.stringify({name:'cupom.png',mime:'image/png',base64:png.toString('base64')})})).json();
 const conv=(await (await fetch(base+'/api/mobile/conversations',{method:'POST',headers:H(token),body:'{}'})).json()).conversation;
 const send=async message=>{const n=f.calls.length;const r=await fetch(base+'/api/mobile/messages',{method:'POST',headers:H(token),body:JSON.stringify({message,client_message_id:crypto.randomUUID(),conversation_id:conv.id})});assert.equal(r.status,200);return f.calls.slice(n).filter(c=>c.name!=='conversation_board');};
 const withImage=c=>JSON.stringify(c.input||'').includes('data:image/png;base64,'+png.toString('base64'));
 const first=await send('![cupom.png]('+base.replace('http://','https://')+'/api/attachments/'+att.id+'?inline=1)\nRegistra esse valor e o item');
 assert.ok(first.length>=2);assert.ok(first.every(withImage),'planejador e resposta veem a foto');
 const second=await send('Ta na imagem');
 assert.ok(second.length>=1&&second.every(withImage),'a foto da mensagem anterior vai junto');
});

test('0.3.206: foto nova que nao carrega NAO reaproveita a anterior (a Sofia pede para reenviar); trava de compra repetida',async t=>{
 const f=fixture(t);f.config.loginPassword=PASSWORD;f.config.loginEmail='owner@example.com';
 const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
 const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const H=tok=>({'Content-Type':'application/json',Authorization:'Bearer '+tok});
 const token=(await (await fetch(base+'/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:PASSWORD})})).json()).token;
 const w=runtime.core.workspace;const e=w.save({kind:'file',title:'a.png',area:'Pessoal',state:'saved',tags:['chat-attachment'],data:{provider:'local',logical_path:'conversations/x',description:'x'}});
 const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(2000,5)]);
 const att=await (await fetch(base+'/api/mobile/workspace/entities/'+e.id+'/attachments',{method:'POST',headers:H(token),body:JSON.stringify({name:'a.png',mime:'image/png',base64:png.toString('base64')})})).json();
 const conv=(await (await fetch(base+'/api/mobile/conversations',{method:'POST',headers:H(token),body:'{}'})).json()).conversation;
 const send=async message=>{const n=f.calls.length;const r=await fetch(base+'/api/mobile/messages',{method:'POST',headers:H(token),body:JSON.stringify({message,client_message_id:crypto.randomUUID(),conversation_id:conv.id})});assert.equal(r.status,200);return f.calls.slice(n).filter(c=>c.name!=='conversation_board');};
 const site=base.replace('http://','https://');
 await send('!['+'a.png]('+site+'/api/attachments/'+att.id+'?inline=1)');
 const broken=await send('!['+'b.png]('+site+'/api/attachments/naoexiste123?inline=1)');
 assert.ok(broken.length>=1);assert.ok(broken.every(c=>!JSON.stringify(c.input||'').includes('input_image')),'nao usa a foto anterior');
 assert.ok(broken.some(c=>JSON.stringify(c.input||'').includes('não pôde ser carregada')),'a Sofia sabe que a foto nova falhou');
 const core=require('node:fs').readFileSync(path.join(__dirname,'..','src/core/sofia-core.js'),'utf8');
 assert.ok(core.includes('Essa compra já está registrada:')&&core.includes('Date.parse(x.created_at)>since'),'trava de compra repetida em 30 min');
 assert.ok(core.includes("(de novo|outra (igual|vez|compra igual)|mais uma|duas vezes)"),'"registra de novo" passa');
});
