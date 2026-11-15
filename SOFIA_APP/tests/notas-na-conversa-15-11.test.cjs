'use strict';
// 15/11/2026 (Pedro: "preciso que apareça aqui"): as notas dos blocos de Notas viram conversas; escrever grava na nota.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
const tpl=load('src/lib/page-templates.ts'),ed=load('src/lib/page-editor.ts'),keys=load('src/lib/page-block-keys.ts',{'./page-editor':ed}),doc=load('src/lib/leaf-document.ts');
const chat=load('src/lib/page-chat.ts',{'./page-editor':ed,'./page-block-keys':keys,'./page-templates':tpl});
const nc=load('src/lib/note-chat.ts',{'./leaf-document':doc,'./page-templates':tpl});
const leaf={id:'L1',title:'sofia-alterações',diary:true,blocks:[{id:'d',type:'heading3',text:'14/11/2026 · sábado',marks:[]},{id:'e',type:'text',text:'07:06  Apagar imagens',marks:[{start:0,end:5,bold:true,color:tpl.DIARY_TIME_COLOR}]}]};
const page={id:'P1',title:'Anotações',updated_at:'2026-11-15T10:00:00Z',data:{blocks_json:JSON.stringify([{id:'n',type:'collection',data:{mode:'notebooks',notebooks:[{id:'b',name:'PROJETOS',pages:[leaf]}]}}])}};
test('cada nota vira conversa "em <página>", fora da principal até puxar',()=>{
 const [n]=nc.noteChats([page]);assert.equal(n.id,'nota:P1:L1');assert.equal(n.title,'sofia-alterações');assert.equal(n.data.parent_id,'P1');assert.equal(n.data.chat_main,false);
 assert.equal(JSON.stringify(nc.parseNoteChatId(n.id)),JSON.stringify({pageId:'P1',leafId:'L1'}));
 const b=chat.bubblesOf(chat.pageBlocks(n),new Date(2026,10,15));assert.equal(b.filter(x=>x.kind==='text').map(x=>x.time+' '+x.text).join('|'),'07:06 Apagar imagens');
});
test('escrever na conversa da nota grava registro do Diário dentro da nota, com só a hora roxa',()=>{
 const now=new Date(2026,10,15,20,30),blocks=JSON.parse(page.data.blocks_json);
 const out=nc.changeNoteBlocks(blocks,'L1',b=>chat.appendBlocks(b,chat.chatTextBlocks(b,'Nova ideia',now)),now);
 const l=out[0].data.notebooks[0].pages[0],last=l.blocks[l.blocks.length-1];
 assert.equal(last.text,'20:30  Nova ideia');assert.equal(JSON.stringify(last.marks),JSON.stringify([{start:0,end:5,bold:true,color:tpl.DIARY_TIME_COLOR}]));assert.equal(last.html,undefined);
 assert.equal(l.blocks.filter(b=>b.type==='heading3').length,2);assert.equal(l.blocks[1].marks.length,1);
 const m=nc.setNoteMain(out,'L1',true);assert.equal(m[0].data.notebooks[0].pages[0].chat_main,true);
});
test('a Conversa usa as notas e grava anexo na página dona',()=>{
 const s=fs.readFileSync('src/screens/ChatHub.tsx','utf8');assert.match(s,/noteChats\(pages\)/);assert.match(s,/uploadAttachment\(home,/);assert.match(s,/changeNoteBlocks\(b,n\.leafId,change\)/);
});
