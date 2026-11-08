'use strict';
// 08/11/2026 (Pedro: "nao foi possivel excluir... isso nao tem nada a ver"): pagina citada so dentro do conteudo de outra
// (cartao do Quadro, link, mencao) pode ser apagada; o cartao sai do quadro. Original apagada: o cartao da copia fica.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
test('apagar a copia tira o cartao do quadro; apagar a original deixa a copia sem sincronizar', t=>{
 const {core}=fixture(t);const w=core.workspace;
 const orig=w.save({kind:'user_page',title:'Original',data:{blocks_json:'[]'}});
 const board=w.save({kind:'user_page',title:'Mapa',data:{layout:'board',blocks_json:'[]'}});
 const copy=w.save({kind:'user_page',title:'Original (cópia)',tags:['board-copy'],data:{parent_id:board.id,blocks_json:'[]'}});
 const copy2=w.save({kind:'user_page',title:'Outra (cópia)',tags:['board-copy'],data:{parent_id:board.id,blocks_json:'[]'}});
 const cards=[{id:'c1',type:'page_link',data:{page_id:copy.id,copy_id:copy.id,source_id:orig.id,synced:false,board:{x:0,y:0,w:300,h:200}}},
  {id:'c2',type:'page_link',data:{page_id:orig.id,copy_id:copy2.id,source_id:orig.id,synced:true,board:{x:400,y:0,w:300,h:200}}},
  {id:'n1',type:'callout',text:'nota',data:{board:{x:0,y:300,w:200,h:100,mentions:[{kind:'page',id:copy.id,title:'x'}]}}}];
 w.save({...w.get(board.id),data:{...w.get(board.id).data,blocks_json:JSON.stringify(cards)}},board.id);
 w.deleteEntity(copy.id);
 let bs=JSON.parse(w.get(board.id).data.blocks_json);
 assert.deepEqual(bs.map(b=>b.id),['c2','n1'],'cartao da copia apagada saiu');
 assert.equal(bs[1].data.board.mentions.length,0,'mencao saiu');
 w.deleteEntity(orig.id);
 bs=JSON.parse(w.get(board.id).data.blocks_json);
 const c2=bs.find(b=>b.id==='c2');assert.ok(c2,'cartao sincronizado com a original apagada fica (mostra a copia)');
 assert.equal(c2.data.page_id,copy2.id);assert.equal(c2.data.synced,false);assert.equal(c2.data.source_id,'');
});
