'use strict';
// 14/11/2026 (Pedro): "atalhos para as notas ou pastas... vira apenas um atalho daquela nota. por padrao ali fica sem nada,
// so aparece o atalho se a pessoa ativar a nota ou a pasta como atalho". Comportamento na tela: robo
// tools/drive-lab/notas-lab.cjs --so=atalho; aqui ficam as amarras do codigo.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');

test('atalho e so uma referencia guardada no bloco de Notas (nada e movido nem copiado) e comeca vazio',()=>{
 const s=read('src/lib/note-shortcuts.ts');
 assert.ok(s.includes('shortcuts:on?cur.filter(')&&s.includes('[...cur,{kind,id}]'),'liga/desliga so a lista de atalhos');
 assert.ok(s.includes("const s=data?.shortcuts;return Array.isArray(s)?")&&s.includes(':[];'),'sem lista = nenhum atalho');
 assert.ok(s.includes("if(b)out.push(")&&s.includes("if(n){out.push("),'atalho de nota/pasta apagada some sozinho');
});
test('menu da nota e da pasta tem Virar atalho / Tirar atalho',()=>{
 const s=read('src/components/NotebookBlock.tsx');
 assert.ok(s.includes("label:'Tirar atalho'")&&s.includes("label:'Virar atalho'"));
 assert.ok(s.includes("shortcutItem('note',pid)")&&s.includes("shortcutItem('folder',b.id)"));
 assert.ok(s.includes('listenOpenShortcut(pageId,')&&s.includes('publishShortcuts(pageId,'));
});
test('barra lateral mostra os atalhos como subpaginas da pagina e abre a nota/pasta',()=>{
 const s=read('src/desktop/DesktopShell.tsx');
 assert.ok(s.includes("testID={'sidebar-shortcut-'+s.kind+'-'+s.id}")&&s.includes('requestOpenShortcut(p.id,{kind:s.kind,id:s.id});onOpen(p.id)'));
 assert.ok(s.includes('hasChildren={kids.length>0||sc.length>0}'),'pagina so com atalho ganha a setinha de abrir');
 assert.ok(!s.includes("testID={'sidebar-page-'+s."),'atalho nao entra no arrastar de paginas');
});
