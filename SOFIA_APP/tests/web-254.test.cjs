'use strict';
// 0.3.254: proporcao em monitores grandes - Inicio, Agenda e Apps com largura maxima; busca/filtros alinhados; hierarquia da descricao.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('larguras maximas por regiao (nada esticado de ponta a ponta em 2560)',()=>{
  const d=read('src/lib/desktop.ts');for(const x of ["if(tab==='home')return WIDE_COLUMN;","if(tab==='agenda')return WIDE_COLUMN;","if(tab==='apps')return WIDE_COLUMN;","if(tab==='chat')return 860;"])assert.ok(d.includes(x),x);
});
test('Agenda: painel do dia com largura fixa; Apps: busca e filtros alinhados a coluna',()=>{
  assert.ok(read('src/screens/Agenda.tsx').includes('{width:440,paddingTop:0,gap:13}')); // 0.3.280: a margem da direita vem da coluna (dpx(40))
  const w=read('src/screens/Workspace.tsx');assert.ok(w.includes('paddingBottom:12,...pad(22)}}')&&w.includes('paddingBottom:10,...pad(22)}}'));
});
test('descricao da tarefa na lista fica abaixo do titulo na hierarquia (so no computador)',()=>{
  assert.ok(read('src/components/TaskDescription.tsx').includes('preview=useDesktop()&&!!lines'));
});
