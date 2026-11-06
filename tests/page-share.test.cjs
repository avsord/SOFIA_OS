'use strict';
// 06/11/2026 (Pedro: "compartilhar link da pagina, tipo Notion; se compartilhar a pagina vai tudo, se for so a subpagina,
// so a subpagina"): link secreto so de leitura; desligar corta; subpagina compartilhada nao abre o pai nem outras paginas.
const test=require('node:test'),assert=require('node:assert/strict');
const {httpFixture}=require('./helpers.cjs');
const {richHtml}=require('../src/core/page-share');

test('compartilhar pagina: link publico so leitura, escopo de subpaginas, desligar e codigo inventado',async t=>{
 const f=await httpFixture(t);
 const mk=async(title,parent,blocks=[])=>(await f.request('/api/entities',{kind:'user_page',title,content:'',area:'Pessoal',privacy:'private',state:'active',tags:[],data:{icon:'',icon_mode:'default',cover_type:'',cover_value:'',cover_attachment_id:'',purpose:'',layout:'notes',suggested:false,parent_id:parent,node_type:parent?'page':'space',blocks_json:JSON.stringify(blocks)}})).body;
 const R=await mk('Raiz','',[{id:'1',type:'text',text:'texto raiz'}]),S=await mk('Sub',R.id,[{id:'1',type:'text',text:'texto sub'}]),G=await mk('Neta',S.id),X=await mk('Privada','',[{id:'1',type:'text',text:'SEGREDO'}]);
 const pub=async path=>{const r=await fetch(f.base+path);return {status:r.status,text:await r.text(),csp:r.headers.get('content-security-policy'),robots:r.headers.get('x-robots-tag')};};
 assert.equal((await f.request('/api/pages/'+S.id+'/share',undefined,'GET')).body.token,null);
 const t1=(await f.request('/api/pages/'+S.id+'/share',{on:true})).body.token;assert.match(t1,/^[A-Za-z0-9_-]{40,}$/);
 const page=await pub('/p/'+t1);assert.equal(page.status,200);assert.ok(page.text.includes('texto sub'));assert.match(page.csp,/default-src 'none'/);assert.match(page.robots,/noindex/);
 assert.equal((await pub('/p/'+t1+'/'+G.id)).status,200,'neta da subpagina abre');
 assert.equal((await pub('/p/'+t1+'/'+R.id)).status,404,'pai nao abre');
 assert.equal((await pub('/p/'+t1+'/'+X.id)).status,404,'outra pagina nao abre');
 assert.equal((await pub('/p/'+'A'.repeat(43))).status,404,'codigo inventado');
 assert.deepEqual((await f.request('/api/pages/shared',undefined,'GET')).body.pages,[S.id]);
 // gerar novo link: o antigo para
 const t2=(await f.request('/api/pages/'+S.id+'/share',{on:true,regenerate:true})).body.token;assert.notEqual(t2,t1);
 assert.equal((await pub('/p/'+t1)).status,404);assert.equal((await pub('/p/'+t2)).status,200);
 // desligar corta na hora
 assert.equal((await f.request('/api/pages/'+S.id+'/share',{on:false})).body.token,null);assert.equal((await pub('/p/'+t2)).status,404);
 // pagina inteira: subpaginas vao junto, a privada nao
 const t3=(await f.request('/api/pages/'+R.id+'/share',{on:true})).body.token;
 assert.equal((await pub('/p/'+t3+'/'+S.id)).status,200);assert.equal((await pub('/p/'+t3+'/'+G.id)).status,200);assert.equal((await pub('/p/'+t3+'/'+X.id)).status,404);
 assert.ok(!(await pub('/p/'+t3)).text.includes('SEGREDO'));
 // anexo de pagina fora do compartilhamento nunca sai
 assert.equal((await pub('/p/'+t3+'/img/nao-existe')).status,404);
});
test('texto rico publico: so as marcas do editor, sem script, evento ou link perigoso',()=>{
 const out=richHtml('<b onclick="x()">a</b><script>alert(1)</script><a href="javascript:alert(1)">j</a><a href="https://ok.com">ok</a><span style="color:red;position:fixed">c</span><img src=x onerror=1>');
 assert.ok(!/script|onclick|onerror|javascript:|position|<img/i.test(out),out);
 assert.ok(out.includes('<b>a</b>'));assert.ok(out.includes('href="https://ok.com"'));assert.ok(out.includes('style="color:red;"'));
});
