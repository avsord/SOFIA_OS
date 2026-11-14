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
