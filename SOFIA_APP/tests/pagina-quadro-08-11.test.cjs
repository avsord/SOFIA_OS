// 08/11/2026 (Pedro: Pagina Quadro): o quadro e a propria pagina (layout 'board'), so no site; no app vira lista de blocos.
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test('quadro: layout guardado na pagina e duplicacao independente', () => {
  assert.ok(read('src/lib/page-editor.ts').includes("'cover_position','layout'"), 'layout faz parte da aparencia salva');
  const b = read('src/components/PageBoard.web.tsx'), p = read('src/screens/Pages.tsx');
  assert.ok(b.includes("synced: false") && b.includes('copyPage'), 'pagina trazida entra como copia, sincronizar so ao clicar');
  assert.ok(b.includes("addEventListener('wheel'") && b.includes('MAX_Z = 4') && b.includes('MIN_Z = 0.05'), 'rodinha = zoom de 5% a 400%');
  assert.ok(b.includes("'data-board-editing'") && b.includes('<FileBody'), 'Word/Excel/PowerPoint editam no lugar');
  assert.ok(p.includes("isBoard?boardView:documentContent(selected,draft)") && p.includes("label:'Ver como página'"), 'pagina vira quadro e volta');
  assert.ok(read('src/components/PageBoard.tsx').includes('BOARD_SUPPORTED = false'), 'no app (Android) nao ha quadro');
  const l = read('src/components/BoardLive.web.tsx');
  for (const k of ['event', 'task', 'note', 'reminder', 'list', 'monitor', 'mail', 'library']) assert.ok(l.includes("id: '" + k + "'"), 'fonte viva: ' + k);
  assert.ok(b.includes("'data-testid': 'board-guide'") && b.includes('caption') && b.includes('mentions') && b.includes("marker") && b.includes('linkPreview(') && b.includes("pointerType !== 'touch'") && b.includes('mailAttachmentToPage('), 'linhas-guia, legenda, mencionar, seta/texto, link com previa, pinca, anexo de e-mail');
  assert.ok(l.includes('api.taskState(') && b.includes("data-testid': 'board-find'") && b.includes('askSofiaAbout('), 'tarefa marca no app, busca e pedir a Sofia');
});
// 09/11/2026 (Pedro: "o movimento deles acho bem melhor" - referencia Weje; visual continua o da Sofia)
test('quadro: movimento da referencia (desliza, degraus, teclado, alinhar, ligacao)', () => {
  const b = read('src/components/PageBoard.web.tsx');
  assert.ok(b.includes('const glide = (to: View, ms = 300)') && b.includes('prefers-reduced-motion') && b.includes('1 - Math.pow(1 - t, 3)'), 'camera desliza 0,3 s e respeita reduzir movimento');
  assert.ok(/const fitAll = [\s\S]{0,400}glide\(\{z,/.test(b) && /const focusOn = [\s\S]{0,200}glide\(\{z,/.test(b), 'Ver tudo e ir ate um item deslizam');
  assert.ok(b.includes('Math.pow(1.2, n)') && b.includes("(glideTo.current || viewRef.current).z"), 'zoom em degraus de 20%, apertar seguido soma degraus');
  assert.ok(b.includes("k === '=' || k === '+'") && b.includes("k === '0'") && b.includes("'wasd'.includes(k)"), 'Ctrl+/-/0 e WASD');
  assert.ok(b.includes("if (k === 'c')") && b.includes("k === 'l'") && b.includes("k === 'u'") && b.includes("k === 'Enter' && mod"), 'C/L/T/U e Ctrl+Enter');
  assert.ok(b.includes("'board-align-' + kind") && b.includes("kind === 'row'") && b.includes("kind === 'col'"), 'alinhar e organizar');
  assert.ok(b.includes("'board-link-dash'") && b.includes('strokeDasharray: l.dash') && b.includes('onDoubleClick: (e: any) => {e.stopPropagation(); const mid = center()'), 'ligacao tracejada e duplo clique vai ate a outra ponta');
  assert.ok(b.includes('if (editing && editing !== b.id) {setEditing(null); p.flush();}'), 'clicar em outro item encerra a edicao');
  assert.ok(b.includes('while (cell * v.z < 8) cell *= 4;'), 'grade em niveis');
});
test('colar: links e grifo de qualquer origem (09/11/2026)', () => {
  const r = read('src/components/PageRichInput.web.tsx'), p = read('src/screens/Pages.tsx'), b = read('src/components/PageBoard.web.tsx');
  assert.ok(r.includes('[a-z]{3,24})$/i') && r.includes("n.data.replace(/[ \\t]*[\\r\\n]+[ \\t]*/g,' ')") && r.includes('same(st.backgroundColor,ctx.bg)'), 'Word (nome de cor, quebra no codigo) e fundo/cor da pagina de origem');
  assert.ok(p.includes('const linkify=') && p.includes('text.includes(l.raw)') && p.includes("norm=(v:string)=>String(v||'').replace(/\\s+/g,' ').trim()"), 'URL vira link, colar apos texto, espacos normalizados');
  assert.ok(b.includes('pasteHtml(raw, pasteContext(ref.current))'), 'nota do quadro usa a mesma limpeza');
});
