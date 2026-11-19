'use strict';
// 19/11/2026 (Pedro): tamanho só no trecho selecionado (a hora do Diário fica padrão), marcador com cores cheias, Ctrl+Z na nota.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),load=require('./load-ts.cjs');
const doc=load('src/lib/leaf-document.ts'),{leafToHtml,htmlToLeaf}=load('src/lib/leaf-rich.ts',{'./leaf-document':doc});
const editor=fs.readFileSync('src/components/LeafEditor.tsx','utf8'),bar=fs.readFileSync('src/components/NoteFormatBar.tsx','utf8');
test('tamanho do trecho vai e volta pelo campo rico',()=>{
 const b={id:'a',type:'text',text:'05:24  /advisor escolhe',marks:[{start:7,end:15,size:1.4}]};
 const html=leafToHtml(b);assert.match(html,/font-size:1\.4em/);
 const back=htmlToLeaf(html,b);assert.equal(back.text,b.text);assert.equal(JSON.stringify(back.marks.filter(m=>m.size).map(m=>[m.start,m.end,m.size])),"[[7,15,1.4]]");
});
test('T1/T2/T3 com seleção mudam só o trecho; no Diário nunca a hora',()=>{
 assert.match(editor,/onType=\{typeOrSize\}/);assert.match(editor,/s=Math\.max\(s,p\)/);
 assert.match(editor,/function diaryFix/);assert.match(editor,/blocks=diaryFix\(leafBlocks\(leaf\)/);
});
test('marcador com cores cheias (nada de .38 apagado) e Ctrl+Z fora do campo desfaz na nota',()=>{
 const marks=bar.match(/const NOTE_MARKS[^\n]*/)[0];assert.doesNotMatch(marks,/\.38\)/);assert.match(marks,/#2F6FD6/);
 assert.match(editor,/stopImmediatePropagation\?\.\(\);undoRef\.current\(redo\)/);
});
test('ocultar página: sai da barra lateral, volta pelo grupo "Ocultas"; o chat continua vendo',()=>{
 const shell=fs.readFileSync('src/desktop/DesktopShell.tsx','utf8');
 assert.match(shell,/label:'Ocultar da barra lateral'/);assert.match(shell,/if\(p\.data\?\.sidebar_hidden===true\)continue;/);
 assert.match(shell,/label:'Mostrar na barra lateral'/);assert.match(shell,/sidebar_hidden:x\.data\?\.sidebar_hidden/);
});
