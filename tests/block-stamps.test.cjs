'use strict';
// 14/11/2026: cada bloco (da página e das notas) guarda quando apareceu; nunca apaga nada.
const test=require('node:test'),assert=require('node:assert/strict');
const {stampBlocks}=require('../src/core/block-stamps');
const page=(blocks)=>JSON.stringify(blocks);
const nb=(leafBlocks,leafCreated)=>({id:'nb',type:'collection',data:{mode:'notebooks',notebooks:[{id:'b1',pages:[{id:'n1',title:'ideias',created_at:leafCreated,blocks:leafBlocks}]}]}});
test('bloco novo ganha agora; o resto do conteúdo fica igual',()=>{
 const out=JSON.parse(stampBlocks(page([{id:'a',type:'text',text:'oi',html:'<b>oi</b>'}]),{now:'T1'}));
 assert.deepEqual(out,[{id:'a',type:'text',text:'oi',html:'<b>oi</b>',created_at:'T1'}]);});
test('edição preserva a data mesmo se o site não mandar o campo',()=>{
 const old=page([{id:'a',type:'text',text:'oi',created_at:'T0'}]);
 assert.equal(JSON.parse(stampBlocks(page([{id:'a',type:'text',text:'oi mudou'}]),{oldJson:old,now:'T9'}))[0].created_at,'T0');});
test('bloco antigo sem data usa a 1ª versão em que aparece; histórico podado usa a data da nota',()=>{
 const old=page([nb([{id:'x',text:'- a'},{id:'y',text:'- b'}],'N0')]);
 const v1={revision:3,created_at:'V3',snapshot:{data:{blocks_json:page([nb([{id:'x',text:'- a'}],'N0')])}}};
 const v2={revision:4,created_at:'V4',snapshot:{data:{blocks_json:old}}};
 const out=JSON.parse(stampBlocks(old,{oldJson:old,now:'T9',history:()=>[v1,v2]}));
 const lb=out[0].data.notebooks[0].pages[0].blocks;
 assert.equal(lb[0].created_at,'N0');assert.equal(lb[1].created_at,'V4');assert.equal(out[0].data.notebooks[0].pages[0].title,'ideias');});
test('texto inválido ou grande demais volta igual',()=>{assert.equal(stampBlocks('nao json'),'nao json');});
