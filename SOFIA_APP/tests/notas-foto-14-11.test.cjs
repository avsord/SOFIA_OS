'use strict';
// 14/11/2026 (Pedro, print da nota sofia-alteracoes): mover a foto na nota, digitar depois da foto, cantos de escala como no
// Quadro, painel lateral que estica pela borda e pastas em fileiras equilibradas. O comportamento na tela e conferido pelo
// robo tools/drive-lab/notas-lab.cjs (--so=foto); aqui ficam as amarras do codigo.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');

test('nota: alca para mover qualquer linha e linha de texto depois da foto colada',()=>{
 const s=read('src/components/LeafEditor.tsx');
 assert.ok(s.includes("'data-leaf-block':b.id")&&s.includes("'data-testid':'leaf-grip'")&&s.includes('startMove(b.id)'));
 assert.ok(s.includes('if(!after||!isTextBlock(after))'),'depois da imagem sempre fica uma linha de texto');
 assert.ok(s.includes('testID="leaf-write-below"'),'clicar embaixo da nota escreve no fim');
});
test('foto: quatro cantos que esticam mantendo a proporcao (padrao do Quadro)',()=>{
 const s=read('src/components/PageFiles.tsx');
 for(const c of ['nw','ne','sw','se'])assert.ok(s.includes("corner('"+c+"'"));
 assert.ok(!s.includes("cursor: 'ew-resize'"),'sem a barra antiga de esticar so pela direita');
});
test('painel lateral estica pela borda esquerda e lembra a largura',()=>{
 const s=read('src/components/MotionModal.tsx');
 assert.ok(s.includes("'data-testid':'side-peek-resize'")&&s.includes("sofia.peek.w.")&&s.includes('onDoubleClick:resetW'));
});
