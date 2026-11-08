// 08/11/2026 (Pedro: Pagina Quadro): o quadro e a propria pagina (layout 'board'), so no site; no app vira lista de blocos.
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test('quadro: layout guardado na pagina e duplicacao independente', () => {
  assert.ok(read('src/lib/page-editor.ts').includes("'cover_position','layout'"), 'layout faz parte da aparencia salva');
  const b = read('src/components/PageBoard.web.tsx'), p = read('src/screens/Pages.tsx');
  assert.ok(b.includes("synced: false") && b.includes('copyPage'), 'pagina trazida entra como copia, sincronizar so ao clicar');
  assert.ok(b.includes("addEventListener('wheel'") && b.includes('MAX_Z = 4') && b.includes('MIN_Z = 0.1'), 'rodinha = zoom de 10% a 400%');
  assert.ok(b.includes("'data-board-editing'") && b.includes('<FileBody'), 'Word/Excel/PowerPoint editam no lugar');
  assert.ok(p.includes("isBoard?boardView:documentContent(selected,draft)") && p.includes("label:'Ver como página'"), 'pagina vira quadro e volta');
  assert.ok(read('src/components/PageBoard.tsx').includes('BOARD_SUPPORTED = false'), 'no app (Android) nao ha quadro');
  const l = read('src/components/BoardLive.web.tsx');
  for (const k of ['event', 'task', 'note', 'reminder', 'list', 'monitor', 'mail', 'library']) assert.ok(l.includes("id: '" + k + "'"), 'fonte viva: ' + k);
  assert.ok(l.includes('api.taskState(') && b.includes("data-testid': 'board-find'") && b.includes('askSofiaAbout('), 'tarefa marca no app, busca e pedir a Sofia');
});
