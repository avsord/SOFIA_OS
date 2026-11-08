'use strict';
// 08/11/2026 (Pedro: "faz o mesmo metodo [do Drive] pro quadro"): teste da Pagina Quadro no SERVIDOR DE VERDADE, sozinho, uma
// vez por versao publicada. Cria um quadro de teste (titulo "Teste automatico do Quadro (some sozinho)"), faz nele o que o
// site faz pelas MESMAS funcoes do servidor - salvar itens com lugar no quadro, mover (nova revisao), versoes guardadas,
// arquivo indo para o Drive do usuario (area oculta) e voltando igual, copia de pagina independente, link compartilhado
// mostrando o quadro (CSP com nonce, textos escapados, desenho, ligacao com seta, arquivo pelo link do compartilhado) - e no
// fim apaga tudo (paginas, anexos e a copia no Drive). Nao toca em nenhuma pagina do usuario.
// Resultado so no registro do servidor: linha "[quadro-teste]".
const fs = require('node:fs'), path = require('node:path');
const TITLE = 'Teste automatico do Quadro (some sozinho)';
const PNG = () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAQUlEQVR4nO3OMQ0AAAjDsM2/aFTwEtRAm+x8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOA4DPgFAAeUhkL4AAAAASUVORK5CYII=', 'base64');
const uid = () => Math.random().toString(36).slice(2, 12);

/** Roda o teste. `base` e o endereco do proprio servidor (para abrir o link compartilhado como um navegador). */
async function runBoardSelfTest(rt, {base, log = console.log} = {}) {
  const w = rt.workspace, g = rt.google, shares = rt.pageShares, steps = [], t0 = Date.now(), made = [], driveIds = [];
  const step = async (name, fn) => {const s = Date.now(); try {const note = await fn(); steps.push({step: name, ok: true, ms: Date.now() - s, ...(note ? {note: String(note).slice(0, 120)} : {})}); return true;} catch (e) {steps.push({step: name, ok: false, ms: Date.now() - s, erro: String(e && (e.code || '') + ' ' + (e.message || e)).trim().slice(0, 200)}); return false;}};
  const must = (c, m) => {if (!c) throw new Error(m);};
  const blocksOf = id => JSON.parse(String(w.get(id).data.blocks_json || '[]'));
  let board = null, src = null, copy = null, attId = '';
  try {
    await step('limpar sobra de teste anterior', async () => {let n = 0; for (const e of w.list({kind: 'user_page', limit: 500})) if (e.title === TITLE || String(e.title || '').startsWith(TITLE + ' ·')) {try {w.deleteEntity(e.id); n++;} catch { /* segue */ }} return n + ' sobra(s)';});
    const note = {id: uid(), type: 'callout', text: 'nota <script>x</script>', html: '', data: {board: {x: 0, y: 0, w: 240, h: 150, z: 1, color: '#1D3329', caption: 'legenda', links: []}}};
    const list = {id: uid(), type: 'todo', text: 'a\nb', checked: false, data: {items: [{id: 'i1', text: 'a', done: true}, {id: 'i2', text: 'b', done: false}], board: {x: 320, y: 0, w: 240, h: 180, z: 2}}};
    const draw = {id: uid(), type: 'image', text: '', data: {drawing: {d: 'M0 0 L40 20 L80 0', w: 80, h: 20, color: '#B5A2FF', width: 3}, board: {x: 0, y: 260, w: 80, h: 20, z: 3}}};
    note.data.board.links = [{to: list.id, arrow: true, label: 'depois'}];
    if (!await step('criar quadro', async () => {
      board = w.save({kind: 'user_page', title: TITLE, content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {icon: '', icon_mode: 'default', cover_type: '', cover_value: '', cover_attachment_id: '', purpose: '', layout: 'board', suggested: false, parent_id: '', node_type: 'space', blocks_json: JSON.stringify([note, list, draw])}});
      made.push(board.id); must(board.data.layout === 'board', 'layout nao ficou board'); must(blocksOf(board.id)[0].data.board.links[0].arrow === true, 'ligacao com seta nao ficou');})) return finish();
    await step('mover itens (nova revisao)', async () => {const bs = blocksOf(board.id); bs[0].data.board.x = 77; bs[1].data.board.y = 33; const cur = w.get(board.id);
      board = w.save({id: board.id, revision: cur.revision, data: {...cur.data, blocks_json: JSON.stringify(bs)}}, board.id); const again = blocksOf(board.id); must(again[0].data.board.x === 77 && again[1].data.board.y === 33, 'lugar nao gravou');});
    await step('versoes guardadas', async () => {const v = w.versions(board.id); must(v.length >= 2, 'so ' + v.length + ' versao(oes)'); return v.length + ' versoes';});
    const linked = g && g.link && g.link();
    if (linked && linked.refresh) await step('arquivo vai para o Drive e volta igual', async () => {
      const a = w.attach(board.id, {name: 'teste.png', mime: 'image/png', base64: PNG().toString('base64')}); attId = a.id;
      await g.attachmentToDrive(a.id); const row = w.attachment(a.id); if (row.drive_id) driveIds.push(row.drive_id); must(row.drive_id, 'nao foi para o Drive');
      const back = await g.attachmentBytes(row); must(Buffer.compare(Buffer.from(back), PNG()) === 0, 'voltou diferente (' + back.length + ' bytes)');
      const bs = blocksOf(board.id), cur = w.get(board.id); bs.push({id: uid(), type: 'file', text: '', data: {attachment_id: a.id, name: 'teste.png', mime: 'image/png', size: PNG().length, view: 'preview', board: {x: 320, y: 260, w: 200, h: 150, z: 4}}});
      board = w.save({id: board.id, revision: cur.revision, data: {...cur.data, blocks_json: JSON.stringify(bs)}}, board.id); return 'no Drive';});
    else steps.push({step: 'arquivo vai para o Drive e volta igual', ok: true, ms: 0, note: 'pulado: Google desconectado'});
    await step('copia de pagina independente', async () => {
      src = w.save({kind: 'user_page', title: TITLE + ' · original', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {icon: '', icon_mode: 'default', cover_type: '', cover_value: '', cover_attachment_id: '', purpose: '', layout: 'notes', suggested: false, parent_id: board.id, node_type: 'page', blocks_json: JSON.stringify([{id: uid(), type: 'text', text: 'linha original'}])}}); made.push(src.id);
      copy = w.save({kind: 'user_page', title: TITLE + ' · copia', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {icon: '', icon_mode: 'default', cover_type: '', cover_value: '', cover_attachment_id: '', purpose: '', layout: 'notes', suggested: false, parent_id: board.id, node_type: 'page', blocks_json: src.data.blocks_json}}); made.push(copy.id);
      const cur = w.get(src.id); w.save({id: src.id, revision: cur.revision, data: {...cur.data, blocks_json: JSON.stringify([{id: uid(), type: 'text', text: 'mudou na original'}])}}, src.id);
      must(blocksOf(copy.id)[0].text === 'linha original', 'a copia mudou junto com a original');
      const bs = blocksOf(board.id), cb = w.get(board.id); bs.push({id: uid(), type: 'page_link', text: '', data: {page_id: copy.id, copy_id: copy.id, source_id: src.id, synced: false, board: {x: 640, y: 0, w: 280, h: 200, z: 5}}});
      board = w.save({id: board.id, revision: cb.revision, data: {...cb.data, blocks_json: JSON.stringify(bs)}}, board.id);});
    if (shares && base) await step('link compartilhado mostra o quadro', async () => {
      const {token} = shares.set(board.id, {on: true}); must(token, 'sem link');
      try {
        const r = await fetch(base + '/p/' + token); const html = await r.text(); must(r.status === 200, 'status ' + r.status);
        const csp = r.headers.get('content-security-policy') || ''; must(/script-src 'nonce-/.test(csp), 'CSP sem nonce');
        must(html.includes('id="board"'), 'nao virou quadro'); must(!html.includes('<script>x</script>') && html.includes('&lt;script&gt;'), 'texto sem escape');
        must(html.includes('M0 0 L40 20 L80 0'), 'desenho nao apareceu'); must(/marker-end="url\(#arw\)"/.test(html) && html.includes('depois'), 'ligacao com seta/texto nao apareceu');
        if (attId) {const f = await fetch(base + '/p/' + token + '/file/' + attId, {headers: {Range: 'bytes=0-7'}}); must(f.status === 206 || f.status === 200, 'arquivo pelo compartilhado: status ' + f.status);}
        return html.length + ' bytes';
      } finally {shares.set(board.id, {on: false});}});
  } finally {
    await step('apagar o teste', async () => {
      for (const id of driveIds) {try {await g.call('DELETE', 'https://www.googleapis.com/drive/v3/files/' + id);} catch { /* ja foi */ }}
      for (const id of made.slice().reverse()) {try {w.deleteEntity(id);} catch { /* ja foi */ }}
      const left = w.list({kind: 'user_page', limit: 500}).filter(e => String(e.title || '').startsWith(TITLE)); must(!left.length, left.length + ' pagina(s) de teste sobraram');});
  }
  return finish();
  function finish() {const bad = steps.filter(s => !s.ok); const r = {ok: !bad.length, falhas: bad.length, ms: Date.now() - t0, steps}; log('[quadro-teste] ' + JSON.stringify(r)); return r;}
}

/** Uma vez por versao publicada (commit do Railway), 150 s depois de ligar (depois do teste do Drive). */
function scheduleBoardSelfTest(runtime, {dataDir, port, publicBaseUrl = '', version = process.env.RAILWAY_GIT_COMMIT_SHA || ''} = {}) {
  if (!version || process.env.SOFIA_BOARD_SELFTEST === '0') return;
  const mark = path.join(dataDir, 'board-selftest.json');
  setTimeout(async () => {
    try {
      let last = '', tries = 0; try {const m = JSON.parse(fs.readFileSync(mark, 'utf8')); last = m.version || ''; if (m.pending === version) tries = Number(m.tries || 0);} catch { /* primeira vez */ }
      if (last === version || tries >= 2) return; // ja testada, ou caiu no meio duas vezes
      fs.writeFileSync(mark, JSON.stringify({version: last, pending: version, tries: tries + 1, at: new Date().toISOString()}));
      const r = await runBoardSelfTest(runtime, {base: String(publicBaseUrl || '').replace(/\/$/, '') || 'http://127.0.0.1:' + port});
      fs.writeFileSync(mark, JSON.stringify({version, ok: r.ok, at: new Date().toISOString()}));
    } catch (e) {console.log('[quadro-teste] erro: ' + String(e && e.message || e).slice(0, 200));}
  }, 150000).unref();
}
module.exports = {runBoardSelfTest, scheduleBoardSelfTest, TITLE};
