'use strict';
// 0.3.269 — servidor das rodadas 2 a 6: campos novos, leitura de link, cota da Ship24, nota lida pela Sofia, Biblioteca pela Conversa.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),http=require('node:http');
const {fixture}=require('./helpers.cjs');const {createRuntime}=require('../src/core/runtime');
const {priceFrom,slugTitle,siteName,linkPreview}=require('../src/services/link-preview');
async function boot(t,providerFactory){
 const f=fixture(t);f.config.loginPassword='integration-test-password-only';f.config.loginEmail='owner@example.com';
 const r=createRuntime(f.config,{store:f.store,provider:f.provider,providerFactory,secureDir:path.join(f.dir,'secure')});
 const server=http.createServer(r.handler);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const {token}=await (await fetch(base+'/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:f.config.loginPassword})})).json();
 const H={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const call=async(p,method='GET',body)=>{const x=await fetch(base+'/api/mobile'+p,{method,headers:H,body:body?JSON.stringify(body):undefined});return {status:x.status,body:await x.json()};};
 return {f,r,call};
}
test('campos novos de Listas, Notas, Biblioteca e Encomendas sao aceitos',async t=>{
 const {call}=await boot(t);let col='';
 for(const [kind,state,data] of [['shopping_item','needed',{list:'market',quantity:'2',unit:'kg',price:12.9,section:'Hortifruti',in_cart:true}],['purchase','planned',{quantity:1,price:489.9,in_cart:false,unit:''}],['purchase_group','active',{color:'#fff',budget:1500,keywords:'placa',collection_id:''}],['list_collection','active',{system:'market',template:'market',history_json:'[]',remind_at:'2026-11-01T12:00:00.000Z',remind_agenda:true,position:1}],['list_item','needed',{collection_id:'@col',unit:'un',price:3,section:'Outros',in_cart:false,group_id:'',url:'',store:''}],['annotation','saved',{pinned:true,lock_tag:'Meditações',enc_json:'{"iv":"00","ct":"ab"}'}],['note_tag','active',{color:'#b49ae6',lock_json:''}],['library_item','saved',{type:'series',status:'0',year:2017,rating:4,url:'https://example.com',site:'Example',extra_json:'{}',links_json:'{}'}],['library_type','active',{builtin:'film',icon:'film',model:'film',config_json:'{}',position:0,pinned:true,in_more:false}],['film','to_watch',{cover_url:'https://example.com/a.jpg',site:'IMDb',links_json:'{}'}],['package','active',{code:'AA123456785BR',fee_amount:48.9,fee_paid:false,pickup_reminder:'',source_mail:''}]]){
  if(data.collection_id==='@col')data.collection_id=col;
  const r=await call('/workspace/entities','POST',{kind,title:'Teste '+kind,state,data});assert.ok(r.body.id,kind+': '+JSON.stringify(r.body).slice(0,160));if(kind==='list_collection')col=r.body.id;
 }
});
test('leitura de link: preco do JSON-LD, titulo pelo endereco e nome da loja; endereco local e bloqueado',async()=>{
 assert.equal(priceFrom('<script type="application/ld+json">{"@type":"Product","offers":{"price":"489.90"}}</script>'),489.9);
 assert.equal(priceFrom('<meta property="product:price:amount" content="24.90">'),24.9);
 assert.equal(slugTitle('https://www.kabum.com.br/produto/123456/fonte-corsair-750w-80-plus-gold'),'Fonte corsair 750w 80 plus gold');
 assert.equal(siteName('https://www.mercadolivre.com.br/x'),'Mercado Livre');
 const local=await linkPreview('http://127.0.0.1:9/x');assert.equal(local.read,false);assert.equal(local.price,null);
});
test('cota da Ship24 conta so os rastreios novos do mes',async t=>{
 const {call}=await boot(t);
 await call('/workspace/entities','POST',{kind:'package',title:'A',state:'active',data:{code:'AA123456785BR',checked_at:new Date().toISOString()}});
 const q=await call('/packages/quota');assert.equal(q.status,200);assert.equal(q.body.limit,10);assert.equal(q.body.used,1);
});
test('nota da compra lida pela Sofia volta para conferir (nada e salvo)',async t=>{
 const seen=[];const fake={respond:async()=>({reply:'ok',usage:{input_tokens:1,output_tokens:1}}),structured:async req=>{seen.push(req);return {data:{desc:'Mercado Extra',amount:87.5,date:'2026-10-30',category:'Mercado',items:'arroz, feijão'},usage:{input_tokens:1,output_tokens:1}};}};
 const {call,f}=await boot(t,()=>fake);
 const before=f.store.db.prepare("SELECT COUNT(*) n FROM entities WHERE kind='fin_tx'").get().n;
 const r=await call('/finance/read-receipt','POST',{mime:'image/png',base64:Buffer.alloc(200,1).toString('base64')});
 assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.receipt.amount,87.5);assert.equal(r.body.receipt.category,'Mercado');
 assert.ok(JSON.stringify(seen[0].input).includes('input_image'),'a imagem vai para a IA');
 assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM entities WHERE kind='fin_tx'").get().n,before,'nada lancado sem conferir');
 assert.equal((await call('/finance/read-receipt','POST',{mime:'image/png',base64:'x'})).status,400);
});
