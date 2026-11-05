'use strict';
// Editor de Páginas no estilo Notion (computador): Enter divide, Backspace junta, menu "/", atalhos e colar várias linhas.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
let n=0;const K=load('src/lib/page-block-keys.ts',{'./page-editor':{newBlock:(type='text')=>({id:'new'+(++n),type,text:''})}});
const B=(id,type,text,extra={})=>({id,type,text,...extra});
const J=x=>JSON.parse(JSON.stringify(x));
const shape=r=>r.blocks.map(b=>b.type+':'+b.text);

test('Enter divide o bloco no cursor e o foco vai para o começo do novo',()=>{
 const r=K.splitBlock([B('a','text','Primeira linha')],'a',9);
 assert.deepEqual(shape(r),['text:Primeira ','text:linha']);assert.equal(r.caret,0);assert.notEqual(r.focus,'a');
});
test('Enter em lista continua a lista; lista vazia volta a ser texto; título continua em texto',()=>{
 assert.deepEqual(shape(K.splitBlock([B('a','bullet','item')],'a',4)),['bullet:item','bullet:']);
 assert.deepEqual(shape(K.splitBlock([B('a','todo','')],'a',0)),['text:']);
 assert.deepEqual(shape(K.splitBlock([B('a','heading1','Seção')],'a',5)),['heading1:Seção','text:']);
});
test('Enter no começo de um bloco com texto cria uma linha vazia acima',()=>{
 const r=K.splitBlock([B('a','heading2','Seção')],'a',0);assert.deepEqual(shape(r),['text:','heading2:Seção']);assert.equal(r.focus,'a');
});
test('Backspace no início: primeiro vira texto, depois junta com o anterior no ponto da emenda',()=>{
 const one=K.backspaceAtStart([B('a','text','abc'),B('b','bullet','def')],'b');assert.deepEqual(shape(one),['text:abc','text:def']);
 const two=K.backspaceAtStart(one.blocks,'b');assert.deepEqual(shape(two),['text:abcdef']);assert.equal(two.focus,'a');assert.equal(two.caret,3);
 assert.equal(K.backspaceAtStart([B('a','text','abc')],'a'),null);
 assert.deepEqual(shape(K.backspaceAtStart([B('a','divider',''),B('b','text','x')],'b')),['text:x']);
});
test('Delete no fim puxa o próximo bloco de texto',()=>{
 const r=K.deleteAtEnd([B('a','text','ab'),B('b','text','cd')],'a');assert.deepEqual(shape(r),['text:abcd']);assert.equal(r.caret,2);
 assert.equal(K.deleteAtEnd([B('a','text','ab'),B('b','collection','')],'a'),null);
});
test('Atalhos markdown no começo do bloco',()=>{
 assert.deepEqual(J(K.markdownShortcut('text','#','# ')),{type:'heading1',text:''});
 assert.deepEqual(J(K.markdownShortcut('text','##Seção','## Seção')),{type:'heading2',text:'Seção'});
 assert.deepEqual(J(K.markdownShortcut('text','-','- ')),{type:'bullet',text:''});
 assert.deepEqual(J(K.markdownShortcut('text','[]','[] ')),{type:'todo',text:''});
 assert.deepEqual(J(K.markdownShortcut('text','[ ]','[ ] ')),{type:'todo',text:''});
 assert.deepEqual(J(K.markdownShortcut('todo','1.','1. ')),{type:'number',text:''});
 assert.deepEqual(J(K.markdownShortcut('text','--','---')),{type:'divider',text:''});
 assert.equal(K.markdownShortcut('text','oi','oi '),null);assert.equal(K.markdownShortcut('heading1','#','# '),null);
});
test('Menu "/" busca sem acento, prioriza quem começa com a busca e só abre no começo ou depois de espaço',()=>{
 assert.deepEqual(J(K.slashMatches('tit').map(x=>x.type)),['heading1','heading2','heading3']);
 assert.equal(K.slashMatches('lista')[0].type,'bullet');assert.equal(K.slashMatches('xyzzy').length,0);
 assert.equal(K.slashStart('/ti',3),0);assert.equal(K.slashStart('oi /ti',6),3);assert.equal(K.slashStart('a/b',3),-1);assert.equal(K.slashStart('oi / ti',7),-1);
});
test('Escolher no menu "/": bloco vazio muda de tipo; com texto ganha bloco novo abaixo; divisor deixa uma linha para continuar',()=>{
 assert.deepEqual(shape(K.applySlash([B('a','text','/tit')],'a',0,4,'heading1')),['heading1:']);
 assert.deepEqual(shape(K.applySlash([B('a','text','oi /lis')],'a',3,7,'bullet')),['text:oi ','bullet:']);
 assert.deepEqual(shape(K.applySlash([B('a','text','/div')],'a',0,4,'divider')),['divider:','text:']);
});
test('Colar várias linhas vira vários blocos e reconhece título, lista e tarefa',()=>{
 const r=K.pastedLines([B('a','text','')],'a','','# Título\n- um\n[x] feito\nfim');
 assert.deepEqual(shape(r),['heading1:Título','bullet:um','todo:feito','text:fim']);assert.equal(r.blocks[2].checked,true);
 const mid=K.pastedLines([B('a','text','AB')],'a','AB','Ax\nyB');assert.deepEqual(shape(mid),['text:Ax','text:yB']);assert.equal(mid.caret,1);
 assert.equal(K.pastedLines([B('a','text','A')],'a','A','A\n'),null);
});
test('Numeração recomeça a cada lista',()=>{
 const blocks=[B('a','number','1'),B('b','number','2'),B('c','text',''),B('d','number','1')];
 assert.deepEqual([0,1,3].map(i=>K.listNumber(blocks,i)),[1,2,1]);
});
test('A tela de Páginas usa o teclado novo só no computador e foca o bloco novo na hora',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','src/screens/Pages.tsx'),'utf8');
 assert.ok(src.includes("const webKeys=Platform.OS==='web';"));
 assert.ok(src.includes('onKeyPress={preview?undefined:e=>onBlockKey(e,b)}'));
 assert.ok(src.includes('flushNow(()=>{edit(d=>({...d,blocks}));'),'foco no bloco novo antes da próxima tecla');
 assert.ok(src.includes("testID=\"page-slash-menu\""));
 assert.ok(fs.readFileSync(path.join(__dirname,'..','src/lib/flush-sync.ts'),'utf8').includes('fn();'),'celular não usa react-dom');
});
