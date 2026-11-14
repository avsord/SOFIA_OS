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

// 14/11/2026 (Pedro: "botões de escalar só aparecem se clicar"; "clicar e apertar Delete apaga a imagem")
test('cantos da imagem aparecem com o mouse por CSS e Delete apaga a imagem selecionada',()=>{
 const s=read('src/components/PageFiles.tsx');
 assert.ok(s.includes('.sofia-file-hover:hover .sofia-file-corner{opacity:1!important}')&&s.includes("className: 'sofia-file-corner'")&&s.includes("className: 'sofia-file-hover'"));
 assert.ok(s.includes("e.key !== 'Delete' && e.key !== 'Backspace'")&&s.includes('latest.current.onRemove()')&&s.includes('a.isContentEditable'));
});

// 14/11/2026 (Pedro: "em todos os lugares do site a correção tem que ser o layout da Sofia - generalizar"; "bolinhas achatadas")
test('correção no menu da Sofia em todo campo de texto do site e bolinha redonda na barra lateral',()=>{
 const {wordAt,cleanWord,isWord}=require('../src/lib/web-spell-word.ts');
 const v='os pedaços estilhassados, pelo';assert.deepEqual(wordAt(v,15),[11,24]);assert.equal(cleanWord('casa,'),'casa');assert.equal(isWord('duas palavras'),false);
 const app=read('App.tsx');assert.ok(app.includes('installSpellMenu(api)'));
 const s=read('src/lib/web-spell-menu.ts');assert.ok(s.includes("closest('textarea,input')")&&s.includes("execCommand('insertText',false,s)")&&s.includes('[data-testid^="page-rich-"]'));
 assert.ok(read('src/desktop/DesktopShell.tsx').includes('aspectRatio:1,borderRadius:999,backgroundColor:dot'));
});
