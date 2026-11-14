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
test('14/11/2026 (Pedro: "tira esses atalhos"): sem a secao Atalhos no topo nem o menu Virar atalho; fica so o subatalho',()=>{
 const sh=fs.readFileSync(__dirname+'/../src/desktop/DesktopShell.tsx','utf8'),nb=fs.readFileSync(__dirname+'/../src/components/NotebookBlock.tsx','utf8');
 assert.ok(!sh.includes('<ShortcutsSection pages='),'secao Atalhos fora');assert.ok(!sh.includes("'Virar atalho'")&&!nb.includes("shortcutItem('note'"),'menus fora');
 assert.ok(sh.includes('Virar subatalho')&&nb.includes('Virar subatalho'),'subatalho continua');
});
