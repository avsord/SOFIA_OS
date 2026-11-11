// 11/11/2026 (Pedro: "joguei print e ficou assim bugado"): colar um print (Ctrl+V) no Quadro. Mede a caixa da imagem
// contra a proporcao do print e procura faixa vazia (preta) dentro da caixa.
// Uso: SOFIA_CHROME=1 node tools/drive-lab/quadro-print-colado.cjs [pasta-de-saida]
const {chromium} = require('playwright'); const {spawn} = require('child_process'); const path = require('path'), fs = require('fs'), OS = require('os');
const PORT = 6500 + Math.floor(Math.random() * 200) * 2, B = 'http://127.0.0.1:' + PORT, O = (process.argv[2] || fs.mkdtempSync(path.join(OS.tmpdir(), 'print-'))) + '/';
fs.mkdirSync(O, {recursive: true});
const res = []; const ok = (c, m) => {res.push((c ? 'OK   ' : 'FALHA') + ' ' + m);};
(async () => {
  const lab = spawn(process.execPath, [path.join(__dirname, 'lab-server.cjs'), String(PORT), O + 'data'], {stdio: ['ignore', 'pipe', 'pipe']}); let log = ''; lab.stdout.on('data', d => log += d); lab.stderr.on('data', d => log += d);
  for (let i = 0; i < 80 && !/pronto/.test(log); i++) await new Promise(r => setTimeout(r, 250));
  const api = async (p, body, method) => {const r = await fetch(B + '/api/mobile' + p, {method: method || (body ? 'POST' : 'GET'), headers: {'Content-Type': 'application/json', ...(api.t ? {Authorization: 'Bearer ' + api.t} : {})}, body: body ? JSON.stringify(body) : undefined}); const j = await r.json(); if (!r.ok) throw new Error(p + ' ' + r.status + ' ' + JSON.stringify(j)); return j;};
  const br = await chromium.launch(process.env.SOFIA_CHROME ? {channel: 'chrome'} : {}); const page = await br.newPage({viewport: {width: 1500, height: 900}}); const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  try {
    api.t = (await api('/auth/login', {email: 'lab@sofia.local', password: 'senha-do-laboratorio-123', device_name: 'robo'})).token;
    const mapa = await api('/workspace/entities', {kind: 'user_page', title: 'Mapa', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {icon: '', icon_mode: 'default', cover_type: '', cover_value: '', cover_attachment_id: '', purpose: '', layout: 'board', suggested: false, parent_id: '', node_type: 'space', blocks_json: '[]'}});
    await page.goto(B + '/paginas'); await page.waitForTimeout(1500);
    await page.getByPlaceholder('Seu e-mail cadastrado').fill('lab@sofia.local'); await page.getByPlaceholder('Senha da sua conta').fill('senha-do-laboratorio-123'); await page.getByText('Entrar', {exact: true}).last().click(); await page.waitForTimeout(3000);
    await page.goto(B + '/paginas/' + mapa.id); await page.waitForTimeout(5000);
    await page.mouse.click(700, 500);
    // print 1506x988 (como o do Pedro): fundo escuro, faixa clara no topo, barra azul embaixo
    await page.evaluate(async () => {const c = document.createElement('canvas'); c.width = 1506; c.height = 988; const g = c.getContext('2d'); g.fillStyle = '#2a2a33'; g.fillRect(0, 0, 1506, 988); g.fillStyle = '#ddd'; g.fillRect(0, 0, 1506, 60); g.fillStyle = '#36f'; g.fillRect(0, 928, 1506, 60); g.fillStyle = '#f80'; g.fillRect(600, 400, 300, 200);
      const blob = await new Promise(r => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'image.png', {type: 'image/png'}));
      document.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));});
    const snaps = [];
    for (let i = 0; i < 16; i++) {await page.waitForTimeout(500); snaps.push(await page.evaluate(() => {const it = document.querySelector('[data-board-item][data-type=file]'); if (!it) return null; const r = it.getBoundingClientRect(), img = it.querySelector('img'), ir = img?.getBoundingClientRect();
      return {box: [Math.round(r.width), Math.round(r.height)], img: img ? [img.naturalWidth, img.naturalHeight, Math.round(ir.width), Math.round(ir.height), Math.round(ir.top - r.top), getComputedStyle(img).objectFit] : null};}));}
    fs.writeFileSync(O + 'medidas.json', JSON.stringify(snaps)); await page.screenshot({path: O + 'colado.png'});
    const last = snaps.at(-1); res.push('medidas: ' + JSON.stringify(last));
    ok(!!last?.img, 'print colado virou imagem no quadro');
    if (last?.img) {const boxR = last.box[0] / last.box[1], imgR = 1506 / 988; ok(Math.abs(boxR - imgR) < 0.03, 'caixa na proporção do print (' + boxR.toFixed(3) + ' vs ' + imgR.toFixed(3) + ')');
      ok(Math.abs(last.img[3] - last.box[1]) <= 2 && last.img[4] <= 1, 'imagem ocupa a caixa inteira, sem faixa vazia (imagem ' + last.img[2] + '×' + last.img[3] + ' em ' + last.box.join('×') + ')');}
    // de novo depois de recarregar (imagem ja salva)
    await page.reload(); await page.waitForTimeout(5000);
    const after = await page.evaluate(() => {const it = document.querySelector('[data-board-item][data-type=file]'); if (!it) return null; const r = it.getBoundingClientRect(), img = it.querySelector('img'), ir = img?.getBoundingClientRect(); return {box: [Math.round(r.width), Math.round(r.height)], img: img ? [Math.round(ir.width), Math.round(ir.height)] : null};});
    await page.screenshot({path: O + 'recarregado.png'}); res.push('recarregado: ' + JSON.stringify(after));
    ok(!!after?.img && Math.abs(after.img[1] - after.box[1]) <= 2, 'depois de recarregar continua sem faixa vazia');
    // print que ja estava no quadro antes da correcao: caixa guardada em 4:3, sem ratio
    {const zlib = require('zlib'), W = 300, H = 100, raw = Buffer.alloc((W * 3 + 1) * H, 0x80); for (let y = 0; y < H; y++) raw[y * (W * 3 + 1)] = 0;
      const crcT = []; for (let n = 0; n < 256; n++) {let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0;}
      const crc = b => {let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;};
      const chunk = (t, d) => {const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]);};
      const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
      const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
      const q = await api('/workspace/entities', {kind: 'user_page', title: 'Mapa antigo', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {icon: '', icon_mode: 'default', cover_type: '', cover_value: '', cover_attachment_id: '', purpose: '', layout: 'board', suggested: false, parent_id: '', node_type: 'space', blocks_json: '[]'}});
      const at = await api('/workspace/entities/' + q.id + '/attachments', {name: 'image.png', mime: 'image/png', base64: png.toString('base64')});
      await api('/workspace/entities/' + q.id, {revision: q.revision, data: {...q.data, blocks_json: JSON.stringify([{id: 'i1', type: 'file', text: '', data: {attachment_id: at.id, name: 'image.png', mime: 'image/png', size: png.length, view: 'preview', board: {x: 100, y: 100, w: 320, h: 240, z: 1}}}])}}, 'PATCH');
      await page.goto(B + '/paginas/' + q.id); await page.waitForTimeout(6000);
      const m = await page.evaluate(() => {const it = document.querySelector('[data-board-item][data-type=file]'); const r = it.getBoundingClientRect(), ir = it.querySelector('img')?.getBoundingClientRect(); return {box: [Math.round(r.width), Math.round(r.height)], img: ir ? [Math.round(ir.width), Math.round(ir.height)] : null};});
      await page.screenshot({path: O + 'antigo.png'}); res.push('antigo: ' + JSON.stringify(m));
      ok(!!m.img && Math.abs(m.box[0] / m.box[1] - 3) < 0.05 && Math.abs(m.img[1] - m.box[1]) <= 2, 'print antigo (caixa 4:3 guardada) se ajusta sozinho à proporção da imagem');}
  } catch (e) {res.push('ERRO ' + (e.stack || e).toString().slice(0, 400));}
  finally {await br.close(); lab.kill();}
  console.log(res.join('\n') + (errs.length ? '\nerros JS: ' + errs.join(' | ') : '') + '\nsaída: ' + O); process.exit(res.some(r => r.startsWith('FALHA') || r.startsWith('ERRO')) ? 1 : 0);
})();
