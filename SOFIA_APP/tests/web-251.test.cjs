'use strict';
// 0.3.251: o site deixa de ter cara de app no computador - base compartilhada adaptada; celular sem mudanca.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('textos de toque viram textos de mouse so no computador',()=>{
  const d=read('src/lib/desktop.ts');assert.ok(d.includes('export function tap(text:string):string{')&&d.includes("if(!isDesktopWidth(w))return text;"));
  for(const f of ['src/screens/Finance.tsx','src/screens/Monitoring.tsx','src/screens/Agenda.tsx','src/components/NotebookBlock.tsx'])assert.ok(read(f).includes('tap('),f);
});
test('telas cheias viram painel lateral; janelas mantem botoes na largura; fora delas botao do tamanho do texto',()=>{
  const m=read('src/components/MotionModal.tsx');assert.ok(m.includes('if(!transparent&&desktop)return <SidePeek')&&m.includes('testID="side-peek-panel"'));
  assert.ok(read('src/components/Sheet.tsx').includes('<DialogContext.Provider value={true}>'));
  const u=read('src/components/UI.tsx');assert.ok(u.includes("alignSelf:desktop&&!inDialog?'flex-start':undefined"));
  assert.ok(read('src/screens/Workspace.tsx').includes('editing?<MotionModal visible animationType="none"'));
});
test('Paginas: capa e barra largas, texto em coluna de leitura; pastas em cartoes fixos',()=>{
  const p=read('src/screens/Pages.tsx');assert.ok(p.includes("maxWidth:960,alignSelf:'center'")&&p.includes("hasCover&&desktop?{width:'100%',aspectRatio:6,minHeight:200,maxHeight:460}:{height:hasCover?190:28}") /* 09/11: capa larga pela proporcao */);
  // 14/11/2026 (Pedro: "arrumar diagramacao das pastas"): cartoes de mesma largura dividindo a linha em fileiras equilibradas (190-320 px)
  {const n=read('src/components/NotebookBlock.tsx');assert.ok(n.includes("width:desktop?tileW:'48%'")&&n.includes('Math.min(320,')&&n.includes('Math.ceil(n/rows)'));}
  assert.ok(!read('src/lib/desktop.ts').includes("if(tab==='pages')return 980;"));
});
