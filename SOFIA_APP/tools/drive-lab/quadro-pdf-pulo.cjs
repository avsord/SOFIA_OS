// 11/11/2026 (Pedro: "quando clico no pdf pra aparecer la no mapa, a tela da um pulo"): no Quadro, clicar no PDF dentro do
// cartao de uma pagina abre o PDF numa janela do quadro. Mede a camera (zoom e posicao) quadro a quadro depois do clique.
// Uso: node tools/drive-lab/quadro-pdf-pulo.cjs [pasta-de-saida]
const {chromium} = require('playwright'); const {spawn} = require('child_process'); const path = require('path'), fs = require('fs'), OS = require('os');
const PORT = 6500 + Math.floor(Math.random() * 200) * 2, B = 'http://127.0.0.1:' + PORT, O = (process.argv[2] || fs.mkdtempSync(path.join(OS.tmpdir(), 'pdfpulo-'))) + '/';
fs.mkdirSync(O, {recursive: true});
const res = []; const ok = (c, m) => {res.push((c ? 'OK   ' : 'FALHA') + ' ' + m);};
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
(async () => {
  const lab = spawn(process.execPath, [path.join(__dirname, 'lab-server.cjs'), String(PORT), O + 'data'], {stdio: ['ignore', 'pipe', 'pipe']}); let log = ''; lab.stdout.on('data', d => log += d); lab.stderr.on('data', d => log += d);
  for (let i = 0; i < 80 && !/pronto/.test(log); i++) await new Promise(r => setTimeout(r, 250));
  const api = async (p, body, method) => {const r = await fetch(B + '/api/mobile' + p, {method: method || (body ? 'POST' : 'GET'), headers: {'Content-Type': 'application/json', ...(api.t ? {Authorization: 'Bearer ' + api.t} : {})}, body: body ? JSON.stringify(body) : undefined}); const j = await r.json(); if (!r.ok) throw new Error(p + ' ' + r.status + ' ' + JSON.stringify(j)); return j;};
  const br = await chromium.launch(process.env.SOFIA_CHROME ? {channel: 'chrome'} : {}); const page = await br.newPage({viewport: {width: 1500, height: 900}}); const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  try {
    api.t = (await api('/auth/login', {email: 'lab@sofia.local', password: 'senha-do-laboratorio-123', device_name: 'robo'})).token;
    const dec = await api('/workspace/entities', {kind: 'user_page', title: 'Decupagem', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {icon: '', icon_mode: 'default', cover_type: '', cover_value: '', cover_attachment_id: '', purpose: '', layout: 'notes', suggested: false, parent_id: '', node_type: 'space', blocks_json: '[]'}});
    const a = await api('/workspace/entities/' + dec.id + '/attachments', {name: 'DECUPAGEM_V4.pdf', mime: 'application/pdf', base64: PDF.toString('base64')});
    const d2 = await api('/workspace/entities/' + dec.id, {revision: dec.revision, data: {...dec.data, blocks_json: JSON.stringify([{id: 't1', type: 'text', text: 'roteiro'}, {id: 'f1', type: 'file', text: '', data: {attachment_id: a.id, name: 'DECUPAGEM_V4.pdf', mime: 'application/pdf', size: PDF.length, view: 'attach'}}])}}, 'PATCH');
    const mapa = await api('/workspace/entities', {kind: 'user_page', title: 'Mapa', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {icon: '', icon_mode: 'default', cover_type: '', cover_value: '', cover_attachment_id: '', purpose: '', layout: 'board', suggested: false, parent_id: '', node_type: 'space',
      blocks_json: JSON.stringify([{id: 'c1', type: 'page_link', text: '', data: {page_id: d2.id, synced: true, board: {x: 120, y: 80, w: 520, h: 560, z: 1}}}])}});
    await page.goto(B + '/paginas'); await page.waitForTimeout(1500);
    await page.getByPlaceholder('Seu e-mail cadastrado').fill('lab@sofia.local'); await page.getByPlaceholder('Senha da sua conta').fill('senha-do-laboratorio-123'); await page.getByText('Entrar', {exact: true}).last().click(); await page.waitForTimeout(3000);
    await page.goto(B + '/paginas/' + mapa.id); await page.waitForTimeout(6000);
    await page.screenshot({path: O + '1-antes.png'});
    const frame = page.frameLocator('iframe[data-testid=board-page-frame]').first();
    // a pagina do cartao so fica ativa depois de um clique no cartao
    const card = page.locator('[data-board-item]').first();
    // 11/11 (Pedro: "ainda esta pulando a tela como se tivesse alinhando"): cartao perto da borda direita - a janela nao cabe a direita dele
    await page.mouse.move(400, 700); await page.keyboard.down('Shift'); for (let i = 0; i < 30 && ((await card.boundingBox()).x + (await card.boundingBox()).width) < 1440; i++) {await page.mouse.wheel(0, -60); await page.waitForTimeout(60);} await page.keyboard.up('Shift'); await page.waitForTimeout(400);
    const cb = await card.boundingBox(); await page.mouse.click(cb.x + cb.width / 2, cb.y + 40); await page.waitForTimeout(800);
    const row = frame.getByTestId('page-file-row').first(); ok(await row.count() === 1, 'PDF aparece na página do cartão');
    const cam = () => page.evaluate(() => {const o = document.querySelector('[data-testid=board-origin]')?.getBoundingClientRect(), z = document.querySelector('[data-testid=board-zoom]')?.textContent; return {x: Math.round(o?.x || 0), y: Math.round(o?.y || 0), z};});
    const c0 = await cam(), track = [c0];
    await row.click(); for (let i = 0; i < 30; i++) {await page.waitForTimeout(50); track.push(await cam());}
    await page.waitForTimeout(1500); track.push(await cam()); await page.screenshot({path: O + '2-depois.png'});
    const moved = track.some(t => Math.abs(t.x - c0.x) > 4 || Math.abs(t.y - c0.y) > 4 || t.z !== c0.z);
    fs.writeFileSync(O + 'camera.json', JSON.stringify(track));
    ok(await page.locator('[data-board-editing]').count() >= 1, 'PDF abriu na janela do editor no quadro');
    {const wb = await page.locator('[data-board-item][data-type=file]:has([data-board-editing])').first().boundingBox(), hb = await page.getByTestId('page-board').boundingBox(); ok(!!wb && wb.x >= hb.x && wb.x + wb.width <= hb.x + hb.width + 1, 'janela do PDF nasce dentro da vista: ' + JSON.stringify(wb && {x: Math.round(wb.x), w: Math.round(wb.width)}) + ' quadro ' + JSON.stringify({x: Math.round(hb.x), w: Math.round(hb.width)}));}
    ok(!moved, 'câmera parada ao abrir o PDF (sem pulo): ' + JSON.stringify(c0) + ' → ' + JSON.stringify(track.at(-1)));
    // 1b) esticar a janela pelos 4 cantos (Pedro 11/11: "precisa ter funcao pra esticar nos quatro cantos")
    {const win = page.locator('[data-board-item][data-type=file]:has([data-board-editing])').first(), hs = win.locator(':scope > [aria-label="Mudar o tamanho"]');
      ok(await hs.count() === 4, 'janela do PDF tem os 4 cantos de esticar (' + await hs.count() + ')');
      const drag = async (i, dx, dy) => {const hb = await hs.nth(i).boundingBox(); await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + hb.width / 2 + dx, hb.y + hb.height / 2 + dy, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(400);};
      const b0 = await win.boundingBox(); await drag(3, 90, 60); const b1 = await win.boundingBox();
      ok(b1.width > b0.width + 60 && b1.height > b0.height + 40 && Math.abs(b1.x - b0.x) < 2, 'canto de baixo à direita estica: ' + Math.round(b0.width) + '×' + Math.round(b0.height) + ' → ' + Math.round(b1.width) + '×' + Math.round(b1.height));
      await drag(0, -70, -50); const b2 = await win.boundingBox();
      ok(b2.x < b1.x - 50 && b2.y < b1.y - 30 && b2.width > b1.width + 50, 'canto de cima à esquerda estica para fora: ' + JSON.stringify({x: Math.round(b2.x - b1.x), y: Math.round(b2.y - b1.y)}));
      await page.screenshot({path: O + '2b-esticou.png'});}
    // 2) adicionar um PDF pelo botao de arquivo do quadro (Pedro: "quando adiciono o pdf ainda esta pulando")
    await page.mouse.click(300, 700); await page.waitForTimeout(400); fs.writeFileSync(O + 'NOVO.pdf', PDF);
    const c1 = await cam(), t2 = [c1]; const fc = page.waitForEvent('filechooser'); await page.getByTestId('board-add-file').click(); await (await fc).setFiles(O + 'NOVO.pdf');
    for (let i = 0; i < 80; i++) {await page.waitForTimeout(50); t2.push(await cam());} await page.screenshot({path: O + '3-adicionou.png'});
    fs.writeFileSync(O + 'camera2.json', JSON.stringify(t2));
    ok(!t2.some(t => Math.abs(t.x - c1.x) > 4 || Math.abs(t.y - c1.y) > 4 || t.z !== c1.z), 'câmera parada ao ADICIONAR um PDF: ' + JSON.stringify(c1) + ' → ' + JSON.stringify(t2.find(t => Math.abs(t.x - c1.x) > 4 || Math.abs(t.y - c1.y) > 4 || t.z !== c1.z) || t2.at(-1)));
  } catch (e) {res.push('ERRO ' + (e.stack || e).toString().slice(0, 400));}
  finally {await br.close(); lab.kill();}
  console.log(res.join('\n') + (errs.length ? '\nerros JS: ' + errs.join(' | ') : '') + '\nsaída: ' + O); process.exit(res.some(r => !r.startsWith('OK')) ? 1 : 0);
})();
