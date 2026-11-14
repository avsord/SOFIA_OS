'use strict';
// 14/11/2026: modelo Diário nas Notas (nota "ideias" com itens "- " vira registros com a hora em que foram escritos).
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {leafToDiary,leafDiaryEnter,lineTimesFromVersions}=load('src/lib/leaf-diary.ts',{'./page-templates':load('src/lib/page-templates.ts'),'./leaf-document':load('src/lib/leaf-document.ts')});
const snap=(rev,at,lines)=>({revision:rev,created_at:at,snapshot:{data:{blocks_json:JSON.stringify([{id:'nb',type:'collection',data:{notebooks:[{id:'b',pages:[{id:'n1',blocks:[{id:'x',type:'text',text:lines.join('\n'),marks:[]}]}]}]}}])}}});
test('linhas com "- " viram registros com a hora real, dia por dia, hora roxa em negrito',()=>{
 const times=lineTimesFromVersions([snap(1,'2026-11-12T13:05:00','- ideia a'.split('|')),snap(2,'2026-11-13T22:40:00',['- ideia a','- ideia b longa'])],'n1');
 const leaf={id:'n1',title:'ideias',content:'',created_at:'2026-11-01T10:00:00'};
 const r=leafToDiary(leaf,[{id:'x',type:'text',text:'- ideia a\n- ideia b longa\n- ideia c',marks:[]}],times);
 const t=r.blocks.map(b=>b.type+':'+b.text);
 assert.equal(t[0],'heading3:12/11/2026 · quinta');assert.equal(t[1],'text:13:05  ideia a');
 assert.equal(t[2],'divider:');assert.equal(t[3],'heading3:13/11/2026 · sexta');assert.equal(t[4],'text:22:40  ideia b longa');
 assert.deepEqual({...r.sources},{versions:2,block:0,note:1});
 assert.equal(r.blocks[1].marks[0].bold,true);assert.equal(r.blocks[1].marks[0].color,'#8b67d5');
});
test('Enter no fim de um registro cria outro com a hora de agora',()=>{
 const leaf={id:'n1',title:'',content:''};const now=new Date(2026,10,14,9,7);
 const {blocks}=leafToDiary(leaf,[{id:'x',type:'text',text:'14/11/2026\n08:00 café',marks:[]}],new Map());
 const r=leafDiaryEnter(blocks,blocks[1].id,now);assert.equal(r.blocks[2].text,'09:07  ');assert.equal(r.focus,r.blocks[2].id);
});
