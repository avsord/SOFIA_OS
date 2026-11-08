'use strict';
// 08/11/2026 (Pedro: Pagina Quadro, "compartilhado: quem recebe so olha, com zoom e mover"): o link de um quadro mostra o
// quadro so leitura (itens no lugar, ligacoes, desenho), com script liberado so por nonce e todo texto escapado.
const test=require('node:test'),assert=require('node:assert/strict');
const {httpFixture}=require('./helpers.cjs');
const {boardHtml}=require('../src/core/page-share');

test('quadro compartilhado: itens no lugar, ligacao, desenho, lista, texto escapado e script so com nonce',async t=>{
 const f=await httpFixture(t);
 const mk=async(title,parent,blocks,layout='notes')=>(await f.request('/api/entities',{kind:'user_page',title,content:'',area:'Pessoal',privacy:'private',state:'active',tags:[],data:{icon:'',icon_mode:'default',cover_type:'',cover_value:'',cover_attachment_id:'',purpose:'',layout,suggested:false,parent_id:parent,node_type:parent?'page':'space',blocks_json:JSON.stringify(blocks)}})).body;
 const blocks=[
  {id:'n1',type:'callout',text:'ideia <script>alert(1)</script>',data:{board:{x:100,y:200,w:240,h:150,z:2,color:'#3A2C1A',links:['l1']}}},
  {id:'l1',type:'todo',text:'luz',data:{items:[{id:'a',text:'alugar luz',done:true},{id:'b',text:'roteiro',done:false}],board:{x:500,y:220,w:260,h:180,z:3}}},
  {id:'d1',type:'image',text:'',data:{drawing:{d:'M0 0 L10 20 L30 5',w:30,h:20,color:'#B5A2FF',width:3},board:{x:50,y:600,w:30,h:20,z:4}}},
  {id:'s1',type:'text',text:'sem lugar'},
  {id:'x1',type:'text',text:''}];
 const B=await mk('Quadro',' '.trim(),blocks,'board');
 const C=await mk('Copia',B.id,[{id:'c1',type:'text',text:'linha da copia'}]);
 const all=JSON.parse(B.data.blocks_json);all.push({id:'p1',type:'page_link',text:'',data:{page_id:C.id,board:{x:900,y:100,w:300,h:220,z:1}}});
 await f.request('/api/entities/'+B.id,{revision:B.revision,data:{...B.data,blocks_json:JSON.stringify(all)}},'PATCH');
 const tok=(await f.request('/api/pages/'+B.id+'/share',{on:true})).body.token;
 const r=await fetch(f.base+'/p/'+tok),html=await r.text(),csp=r.headers.get('content-security-policy');
 assert.equal(r.status,200);
 const nonce=/script-src 'nonce-([^']+)'/.exec(csp);assert.ok(nonce,'CSP libera script so por nonce: '+csp);assert.match(csp,/default-src 'none'/);
 assert.ok(html.includes('<script nonce="'+nonce[1]+'">'),'o unico script leva o nonce');
 assert.equal((html.match(/<script/g)||[]).length,1,'so um script na pagina');
 assert.ok(html.includes('id="board"')&&html.includes('id="zfit"')&&html.includes('Ver tudo'),'quadro com zoom e Ver tudo');
 assert.ok(html.includes('left:100px;top:200px;width:240px;height:150px'),'nota no lugar guardado');
 assert.ok(html.includes('background:#3A2C1A'),'cor da nota');
 assert.ok(!html.includes('<script>alert(1)')&&html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),'texto escapado');
 assert.ok(/<line x1="220" y1="275" x2="630" y2="310"\/>/.test(html),'ligacao entre os centros');
 assert.ok(html.includes('<path d="M0 0 L10 20 L30 5"'),'desenho');
 assert.ok(html.includes('alugar luz')&&html.includes('class="box on"'),'lista com caixinha marcada');
 assert.ok(html.includes('left:-360px;top:0px')&&html.includes('sem lugar'),'bloco sem lugar vai para a coluna da esquerda');
 assert.ok(html.includes('linha da copia')&&html.includes('/p/'+tok+'/'+C.id),'cartao da pagina com as primeiras linhas e link');
 // pagina normal continua sem script
 const N=await mk('Normal','',[{id:'1',type:'text',text:'oi'}]);const tn=(await f.request('/api/pages/'+N.id+'/share',{on:true})).body.token;
 const hn=await (await fetch(f.base+'/p/'+tn)).text();assert.ok(!/<script/.test(hn)&&hn.includes('oi'),'pagina normal sem script');
});

test('quadro compartilhado: desenho com caminho estranho e cor invalida nao entram',()=>{
 const ctx={imgUrl:x=>'/i/'+x,fileUrl:x=>'/f/'+x,linkable:()=>null,pageLines:()=>[]};
 const out=boardHtml([{id:'a',type:'image',data:{drawing:{d:'M0 0"/><script>x()</script>',w:10,h:10},board:{x:0,y:0,w:10,h:10}}},
  {id:'b',type:'callout',text:'c',data:{board:{x:0,y:0,w:10,h:10,color:'red;position:fixed'}}},{id:'c',type:'page_link',data:{page_id:'fora',board:{x:0,y:0,w:10,h:10}}}],ctx);
 assert.ok(!/script|position:fixed/i.test(out),out);
 assert.ok(!out.includes('data-type="page_link"'),'pagina fora do compartilhado nao aparece');
});
