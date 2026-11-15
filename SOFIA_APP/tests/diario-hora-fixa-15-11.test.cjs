'use strict';
// 15/11/2026 (Pedro: "isso é grave"): na nota com Diário, escrever na linha não apaga os minutos nem pinta o texto de roxo.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
const tpl=load('src/lib/page-templates.ts'),doc=load('src/lib/leaf-document.ts');
const {guardLeafEntry,leafEntry}=load('src/lib/leaf-diary.ts',{'./page-templates':tpl,'./leaf-document':doc});
const purple={bold:true,color:tpl.DIARY_TIME_COLOR};
test('texto que comeu os minutos volta para "20:06  texto" com só a hora roxa',()=>{
 const prev=leafEntry('20:06','');const g=guardLeafEntry(prev,{text:'20:Poder editar todas as conversas do chat;',marks:[{start:0,end:43,...purple}]});
 assert.equal(g.text,'20:06  Poder editar todas as conversas do chat;');assert.equal(JSON.stringify(g.marks),JSON.stringify([{start:0,end:5,...purple}]));
});
test('escrever depois da hora não muda nada; marcas do texto ficam; linha vazia pode sumir',()=>{
 const prev=leafEntry('20:06','oi');const ok={text:'20:06  oi tudo',marks:[{start:0,end:5,...purple},{start:10,end:14,italic:true}]};
 assert.equal(JSON.stringify(guardLeafEntry(prev,ok)),JSON.stringify({...ok,shift:0}));
 assert.equal(guardLeafEntry(prev,{text:'20:06  oi tudo',marks:[{start:0,end:14,...purple}]}).marks.length,1);
 assert.equal(guardLeafEntry(prev,{text:'',marks:[]}).text,'');
 assert.equal(guardLeafEntry({id:'x',type:'text',text:'sem hora',marks:[]},{text:'sem hor',marks:[]}).text,'sem hor');
});
test('o editor das notas usa a proteção nos dois campos',()=>{
 const src=fs.readFileSync('src/components/LeafEditor.tsx','utf8');assert.equal((src.match(/guardLeafEntry\(/g)||[]).length,2);
});
