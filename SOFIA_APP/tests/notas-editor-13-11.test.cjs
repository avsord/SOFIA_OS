'use strict';
// 13/11/2026 22h (Pedro): editor de texto nas Notas do site; Tab escreve o espaco grande; linha do tempo sem piscar no "agora".
// O comportamento na tela e conferido pelo robo tools/drive-lab/notas-lab.cjs (--so=editor) e pela medicao quadro a quadro da
// linha do tempo; aqui ficam as conversoes sem tela e as amarras do codigo.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');
const j=x=>JSON.parse(JSON.stringify(x));
const rich=()=>load('src/lib/leaf-rich.ts',{'./leaf-document':load('src/lib/leaf-document.ts')});

test('nota -> editor rico: negrito, cor e marca-texto viram HTML; endereco vira link',()=>{
 const {leafToHtml}=rich();
 const h=leafToHtml({id:'x',type:'text',text:'Oi forte e azul https://site.com/a',marks:[{start:3,end:8,bold:true},{start:11,end:15,color:'#2E7CD6',highlight:'rgba(250,204,21,.38)'}]});
 assert.ok(h.includes('<b>forte</b>'));
 assert.ok(h.includes('<span style="color:#2E7CD6;background-color:rgba(250,204,21,.38)">azul</span>'));
 assert.ok(h.includes('<a href="https://site.com/a">https://site.com/a</a>'));
});
test('editor rico -> nota: volta o mesmo texto e as mesmas marcas (o celular le igual)',()=>{
 const {leafToHtml,htmlToLeaf}=rich();
 const b={id:'x',type:'text',text:'Oi forte e azul\nfim',marks:[{start:3,end:8,bold:true},{start:11,end:15,color:'#2E7CD6',highlight:'rgba(250,204,21,.38)'}]};
 assert.deepEqual(j(htmlToLeaf(leafToHtml(b),b)),{text:b.text,marks:b.marks});
 assert.deepEqual(j(htmlToLeaf('a<b>b<i>c</i></b>&amp;d<br>e<br data-fill="1">')),{text:'abc&d\ne',marks:[{start:1,end:2,bold:true},{start:2,end:3,bold:true,italic:true}]});
 assert.deepEqual(j(htmlToLeaf('<span style="font-weight: 700; text-decoration-line: underline">x</span>')),{text:'x',marks:[{start:0,end:1,bold:true,underline:true}]});
});
test('Remover link fica guardado; endereco recem digitado continua virando link sozinho',()=>{
 const {leafToHtml,htmlToLeaf}=rich();const b={id:'x',type:'text',text:'ver https://site.com/a fim',marks:[]};
 assert.deepEqual(j(htmlToLeaf(leafToHtml(b).replace(/<a [^>]*>|<\/a>/g,''),b).marks),[{start:4,end:22,nolink:true}]);
 assert.deepEqual(j(htmlToLeaf('novo https://x.com',{id:'',type:'text',text:'novo',marks:[]}).marks),[]);
});
test('no site o texto da nota usa o campo rico e a barra ao selecionar; o celular segue com o campo de sempre',()=>{
 const s=read('src/components/LeafEditor.tsx');
 assert.ok(s.includes("const RICH_WEB=Platform.OS==='web';"));
 assert.ok(s.includes('{richWeb(b,i)||<TextInput scrollEnabled={false}'));
 assert.ok(s.includes('onChange={(text:string,html:string)=>{const cur=latest.current.find(x=>x.id===b.id)||b,r=htmlToLeaf(html,cur)'));
 assert.ok(s.includes('richCache.current.set(b.id,'),'o que o campo mandou volta igual (cursor nao pula)');
 assert.ok(s.includes("execCommand?.('insertLineBreak')"),'Enter quebra a linha no mesmo bloco, como antes');
 assert.ok(s.includes('<NoteFormatBar rootRef={rootRef}'));
 const bar=read('src/components/NoteFormatBar.tsx');
 assert.ok(bar.includes('<OverAll><View ref={barRef} testID="note-format-bar"'),'barra no fim da pagina (nao presa ao painel animado)');
 for(const k of ['Negrito (Ctrl+B)','Itálico (Ctrl+I)','Sublinhado (Ctrl+U)','Tachado (Ctrl+Shift+S)','Código (Ctrl+E)','Limpar formatação'])assert.ok(bar.includes("'"+k+"'"),k);
});
test('Tab: nas notas e no meio do texto da pagina escreve a tabulacao; no comeco da linha da pagina recua o bloco',()=>{
 const le=read('src/components/LeafEditor.tsx');assert.ok((le.match(/execCommand\?\.\('insertText',false,'\\t'\)/g)||[]).length>=2,'campo rico e campo antigo da nota');
 const p=read('src/screens/Pages.tsx');
 assert.ok(p.includes("if(key==='Tab'&&!ne.shiftKey&&!ne.ctrlKey&&!ne.metaKey&&!ne.altKey&&start>0){e.preventDefault();const d:any=(globalThis as any).document;if(!d?.execCommand?.('insertText',false,'\\t'))"));
 assert.ok(p.includes("if(key==='Tab'&&!ne.ctrlKey&&!ne.metaKey&&!ne.altKey){e.preventDefault();const was="),'no comeco (ou Shift+Tab) segue recuando');
});
test('linha do tempo: o "agora" nao faz as bolinhas e os nomes sumirem e voltarem',()=>{
 const s=read('src/desktop/HomeBrief.tsx');
 assert.ok(s.includes('if (raf.current) return; frozen.current = null;'),'cada deslize desenha a camada de novo, com folga dos dois lados');
 assert.ok(!s.includes('(WEB && moving && (p.x < -0.01 || p.x > 1.01)) /* deslizando: nome so de quem ja esta na tela'),'nome de fora da tela vai junto');
 assert.ok(s.includes('left: WEB && moving && (lx < -0.01 || lx > 1.01) ? `calc(${lx * 100}% - ${lw / 2}px)` : clampX(lx, lw / 2, lw, w)'));
 assert.ok(s.includes('if (Math.abs(to - from) > S * 1.05) jump(to + (from > to ? 1 : -1) * S * 0.9);'),'longe: pula para perto e so o fim desliza');
});
