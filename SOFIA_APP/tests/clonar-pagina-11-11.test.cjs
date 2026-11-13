'use strict';
// 11/11/2026 (Pedro: "quando duplicar tem que aparecer a opção clonar idêntica igual do notion")
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
const {cloneOrder,remapBlocksJson,cloneInput,clonePageTree}=load('src/lib/page-clone.ts',{'./page-hierarchy':load('src/lib/page-hierarchy.ts'),'./page-order':load('src/lib/page-order.ts',{'./page-hierarchy':load('src/lib/page-hierarchy.ts')})});
const page=(id,parent='',blocks=[])=>({id,kind:'user_page',title:id,content:'texto '+id,area:'Pessoal',state:'active',privacy:'private',tags:[],revision:1,data:{parent_id:parent,node_type:parent?'page':'space',icon:'📝',blocks_json:JSON.stringify(blocks)}});
const rows=[page('a','',[{id:'l1',type:'page_link',data:{page_id:'b'}},{id:'n',type:'notebook',data:{books:[{id:'g',pages:[{id:'x',title:'nota',content:'oi'}]}]}}]),page('b','a'),page('c','b'),page('d')];

test('a ordem tem o pai antes dos filhos e só a árvore da página',()=>{
 assert.equal(cloneOrder(rows,'a').map(p=>p.id).join(),'a,b,c');
 assert.equal(cloneOrder(rows,'d').map(p=>p.id).join(),'d');
});
test('links de subpágina passam a apontar para a cópia',()=>{
 const out=JSON.parse(remapBlocksJson(rows[0].data.blocks_json,new Map([['b','B2']])));
 assert.equal(out[0].data.page_id,'B2');assert.equal(out[1].data.books[0].pages[0].content,'oi');
});
test('clonar idêntica copia a árvore inteira com conteúdo; estrutura copia vazia',async()=>{
 for(const mode of ['identical','structure']){
  const saved=[];let n=0;
  const api={saveEntity:async input=>{const copy={...input,id:input.id||'novo'+(++n),revision:(input.revision||0)+1};saved.push(copy);return copy;}};
  const top=await clonePageTree(api,rows,'a',mode);
  assert.equal(top.title,'a (cópia)');
  const created=saved.filter((x,i)=>saved.findIndex(y=>y.id===x.id)===i);
  assert.equal(created.length,3);
  const byTitle=Object.fromEntries(saved.map(x=>[x.title,x]));
  assert.equal(byTitle.b.data.parent_id,top.id);assert.equal(byTitle.c.data.parent_id,byTitle.b.id);
  const finalTop=saved.filter(x=>x.id===top.id).at(-1);
  if(mode==='identical'){assert.equal(JSON.parse(finalTop.data.blocks_json)[0].data.page_id,byTitle.b.id);assert.equal(byTitle.b.content,'texto b');}
  else{const fb=JSON.parse(finalTop.data.blocks_json);assert.equal(fb[0].data.page_id,byTitle.b.id);assert.equal(fb[1].data.books[0].pages.length,0); /* 13/11/2026: estrutura mantém o modelo, sem conteúdo */assert.equal(byTitle.b.content,'');assert.equal(byTitle.b.data.icon,'📝');}
 }
});
test('o original não é tocado e a cópia não herda a marca de cópia escondida do Quadro',()=>{
 const src={...page('z'),tags:['board-copy','x']};const before=JSON.stringify(src);
 const input=cloneInput(src,{parentId:'',isRoot:true,mode:'identical'});
 assert.equal(JSON.stringify(src),before);assert.equal(input.tags.join(),'x');assert.equal(input.id,undefined);
});
test('o menu Duplicar da barra lateral pergunta: Clonar idêntica ou Só a estrutura',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../src/desktop/DesktopShell.tsx'),'utf8');
 assert.ok(s.includes("{text:'Clonar idêntica',onPress:()=>void runClone(p,'identical')}"));
 assert.ok(s.includes("{text:'Só a estrutura (vazia)',onPress:()=>void runClone(p,'structure')}"));
 assert.ok(s.includes("run:()=>duplicate(p)}"));
});
