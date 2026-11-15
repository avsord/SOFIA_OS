'use strict';
// 15/11/2026 (Pedro): a aba Conversa no site lista as páginas como conversas; cada bloco é um balão e o que se escreve entra na página.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
const tpl=load('src/lib/page-templates.ts'),ed=load('src/lib/page-editor.ts'),keys=load('src/lib/page-block-keys.ts',{'./page-editor':ed});
const {bubblesOf,chatTextBlocks,appendBlocks,editBubble,removeBubble,chatLists,lastLine,chatFileBlock}=load('src/lib/page-chat.ts',{'./page-editor':ed,'./page-block-keys':keys,'./page-templates':tpl});
const {diaryDayTitle,diaryEntryBlock}=tpl;
const now=new Date(2026,10,15,17,30);
test('blocos da página viram balões; linha vazia some; tabela vira cartão',()=>{
 const b=bubblesOf([{id:'a',type:'text',text:'Pagar contas'},{id:'b',type:'text',text:'  '},{id:'c',type:'table'},{id:'d',type:'file',data:{attachment_id:'x1',name:'foto.png',mime:'image/png'}}],now);
 assert.equal(b.map(x=>x.kind+':'+x.id).join('|'),'text:a|card:c|file:d');assert.equal(b[1].label,'Tabela');
});
test('escrever no chat acrescenta um bloco de texto com hora no fim, tirando a linha vazia do fim',()=>{
 const before=[{id:'a',type:'text',text:'oi'},{id:'z',type:'text',text:''}],after=appendBlocks(before,chatTextBlocks(before,' Fazer 3D ',now));
 assert.equal(after.length,2);assert.equal(after[1].text,'Fazer 3D');assert.equal(after[1].type,'text');
 const bub=bubblesOf(after,now);assert.equal(bub.map(x=>x.kind).join('|'),'text|day|text');assert.equal(bub[1].label,'Hoje');assert.equal(bub[2].time,'17:30');
});
test('em página Diário o chat grava como registro com hora e cria o dia que falta',()=>{
 const y=new Date(2026,10,14,9,0),before=[{id:'h',type:'heading3',text:diaryDayTitle(y)},{...diaryEntryBlock('09:00','ontem'),id:'e'}];
 const made=chatTextBlocks(before,'hoje',now);assert.equal(made.length,2);assert.equal(made[0].type,'heading3');assert.equal(made[1].text,'17:30  hoje');
 const bub=bubblesOf(appendBlocks(before,made),now);assert.equal(bub.map(x=>x.kind==='day'?x.label:x.time+' '+x.text).join('|'),'Ontem|09:00 ontem|Hoje|17:30 hoje');
 assert.equal(chatTextBlocks(appendBlocks(before,made),'de novo',now).length,1);
});
test('editar e apagar o balão mudam o bloco da página',()=>{
 const blocks=[{id:'a',type:'todo',text:'velho',html:'<b>velho</b>',checked:true},{id:'b',type:'text',text:'fica'}];
 const e=editBubble(blocks,'a','novo',now);assert.equal(e[0].text,'novo');assert.equal(e[0].type,'todo');assert.equal(e[0].html,undefined);assert.equal(e[0].checked,true);
 assert.equal(removeBubble(blocks,'a').map(x=>x.id).join(),'b');
});
test('principal só tem as páginas puxadas; o resto fica em Arquivadas; anexo guarda os dados do arquivo',()=>{
 const pages=[{id:'1',title:'Reunião',data:{chat_main:true},updated_at:'2026-11-15'},{id:'2',title:'Sofia-alterações',data:{},updated_at:'2026-11-14'}];
 const l=chatLists(pages);assert.equal(l.main.map(p=>p.id).join(),'1');assert.equal(l.archived.map(p=>p.id).join(),'2');
 assert.equal(chatLists(pages,'sofia').archived.length,1);assert.equal(lastLine([{id:'a',type:'text',text:'x  y'}]),'x y');
 assert.equal(chatFileBlock({attachment_id:'k',name:'a.webm',mime:'audio/webm',size:3,view:'preview'},now).data.attachment_id,'k');
});
test('no site a aba Conversa abre a lista de conversas e a caixa tem texto, áudio e anexo',()=>{
 const hub=fs.readFileSync('src/screens/ChatHub.tsx','utf8');
 assert.match(fs.readFileSync('src/lib/screen-loader.web.tsx','utf8'),/screens\/ChatHub/);
 assert.match(hub,/<Composer[^>]*onText=\{sendOnce\}[^>]*onVoice=\{onVoice\}[^>]*onAttachments=\{onAttachments\}/);
 assert.match(hub,/<Chat \{\.\.\.props\}/);assert.match(hub,/isLocked\(p\)/);
});
