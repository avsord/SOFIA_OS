'use strict';
// 14/11/2026 (Pedro: "quando aparecer uma correção ela aparece no layout da Sofia e não no layout do navegador")
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');

test('clique direito no texto abre o menu da Sofia com a correção, sem o menu do navegador',()=>{
 const s=read('src/screens/Pages.tsx');
 assert.ok(s.includes("d.addEventListener('contextmenu',ctx)")&&s.includes('e.preventDefault()')&&s.includes('api.spell(word,context)'));
 assert.ok(s.includes('testID="page-spell"')&&s.includes('applySpell(s)')&&s.includes("execCommand('insertText',false,fix+end)"));
});

test('servidor devolve as correções da palavra',()=>{
 const s=read('../src/channels/mobile.js');
 assert.ok(s.includes("p === '/api/mobile/spell'")&&s.includes("name: 'spell'"));
 assert.ok(read('src/lib/api.ts').includes("spell(word: string, context: string)"));
});

// 14/11/2026 (Pedro: "sempre que eu atualizo uma nota em horário ou dia diferente isso precisa ser registrado")
test('linha do Diário editada depois mostra "editado" com a hora (e o dia, se for outro)',()=>{
 const {stampBlocks}=require('../../src/core/block-stamps.js');
 const old=JSON.stringify([{id:'a',type:'text',text:'oi',created_at:'2026-11-14T06:00:00.000Z'}]);
 const late=JSON.parse(stampBlocks(JSON.stringify([{id:'a',type:'text',text:'oi!'}]),{oldJson:old,now:'2026-11-15T09:00:00.000Z'}));
 assert.equal(late[0].edited_at,'2026-11-15T09:00:00.000Z');
 const kept=JSON.parse(stampBlocks(JSON.stringify([{id:'a',type:'text',text:'oi!'}]),{oldJson:JSON.stringify(late),now:'2026-11-15T10:00:00.000Z'}));
 assert.equal(kept[0].edited_at,'2026-11-15T09:00:00.000Z');
 const quick=JSON.parse(stampBlocks(JSON.stringify([{id:'a',type:'text',text:'oi?'}]),{oldJson:old,now:'2026-11-14T06:05:00.000Z'}));
 assert.equal(quick[0].edited_at,undefined);
 assert.ok(read('src/screens/Pages.tsx').includes("testID={'page-edited-'+b.id}")&&read('src/components/LeafEditor.tsx').includes("testID={'leaf-edited-'+b.id}"));
 assert.ok(read('src/lib/page-templates.ts').includes("'editado '+(same?h:"));
});
