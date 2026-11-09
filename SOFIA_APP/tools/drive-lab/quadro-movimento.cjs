// 08/11/2026 (Pedro: "o movimento deles acho bem melhor" - referencia Weje): mede o movimento do Quadro no laboratorio.
// Arrastar o fundo, rodinha e zoom: quadros por segundo, quadros lentos (>34 ms) e se a camera anda junto com o mouse.
// Uso: node tools/drive-lab/quadro-movimento.cjs [n-itens]
const {chromium} = require('playwright'); const {spawn} = require('child_process'); const OS = require('os'), fs = require('fs'), P = require('path');
const PORT = 6900 + Math.floor(Math.random() * 200) * 2, B = 'http://127.0.0.1:' + PORT, O = fs.mkdtempSync(P.join(OS.tmpdir(), 'quadro-mov-')) + '/';
const N = Number(process.argv[2] || 40); const res = []; const ok = (c, m) => res.push((c ? 'OK   ' : 'FALHA') + ' ' + m);
(async () => {
  const lab = spawn(process.execPath, [P.join(__dirname, 'lab-server.cjs'), String(PORT), O + 'data'], {stdio: ['ignore', 'pipe', 'pipe']}); let log = ''; lab.stdout.on('data', d => log += d); lab.stderr.on('data', d => log += d);
  for (let i = 0; i < 80 && !/pronto/.test(log); i++) await new Promise(r => setTimeout(r, 250));
  const br = await chromium.launch(); const page = await br.newPage({viewport: {width: 1500, height: 900}});
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  try {
    await page.goto(B + '/paginas'); await page.waitForTimeout(1500);
    await page.getByPlaceholder('Seu e-mail cadastrado').fill('lab@sofia.local'); await page.getByPlaceholder('Senha da sua conta').fill('senha-do-laboratorio-123'); await page.getByText('Entrar', {exact: true}).last().click(); await page.waitForTimeout(3000);
    await page.goto(B + '/paginas'); await page.waitForTimeout(3000);
    await page.getByLabel('Nova página').first().click(); await page.waitForTimeout(2000);
    await page.getByLabel('Quadro', {exact: true}).click(); await page.waitForTimeout(1500);
    const board = page.getByTestId('page-board'), bb = await board.boundingBox();
    // N notas espalhadas (duplo clique no fundo, texto, sair)
    for (let i = 0; i < N; i++) {const x = bb.x + 120 + (i % 8) * 160, y = bb.y + 120 + Math.floor(i / 8) * 130;
      await page.mouse.dblclick(x, y); await page.waitForTimeout(60); await page.keyboard.type('nota ' + i + ' com um texto de exemplo'); await page.keyboard.press('Escape'); await page.mouse.click(bb.x + 5, bb.y + bb.height - 120); await page.waitForTimeout(40);}
    await page.waitForTimeout(800);
    if (process.env.CPU) {const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', {rate: Number(process.env.CPU)});}
    const n = await page.locator('[data-testid=board-item]').count(); ok(n >= N * 0.9, 'itens no quadro: ' + n);
    const meter = () => page.evaluate(() => {const w = window; w.__f = []; let last = performance.now(); const tick = (t) => {w.__f.push(t - last); last = t; if (w.__on) requestAnimationFrame(tick);}; w.__on = true; requestAnimationFrame(tick);});
    const stop = () => page.evaluate(() => {const w = window; w.__on = false; const f = w.__f.slice(2); const tot = f.reduce((a, b) => a + b, 0); return {fps: Math.round(f.length / (tot / 1000)), slow: f.filter(x => x > 34).length, worst: Math.round(Math.max(...f)), frames: f.length};});
    const layer = () => page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=board-layer]')).transform);
    // 1) arrastar o fundo
    await page.mouse.move(bb.x + bb.width - 40, bb.y + 200); await meter(); await page.mouse.down();
    for (let i = 0; i < 90; i++) {await page.mouse.move(bb.x + bb.width - 40 - i * 6, bb.y + 200 + Math.sin(i / 9) * 60);}
    const lagA = await page.evaluate(() => 0); await page.mouse.up(); const pan = await stop(); res.push('INFO arrastar fundo: ' + JSON.stringify(pan));
    // 2) rodinha (andar)
    await meter(); for (let i = 0; i < 40; i++) {await page.mouse.wheel(0, 30); await page.waitForTimeout(8);} await page.waitForTimeout(300); const wh = await stop(); res.push('INFO rodinha: ' + JSON.stringify(wh));
    // 3) Ctrl+rodinha (zoom)
    await page.mouse.move(bb.x + 700, bb.y + 400); await meter(); await page.keyboard.down('Control'); for (let i = 0; i < 20; i++) {await page.mouse.wheel(0, i < 10 ? -100 : 100); await page.waitForTimeout(30);} await page.keyboard.up('Control'); await page.waitForTimeout(700);
    const zm = await stop(); res.push('INFO zoom: ' + JSON.stringify(zm));
    // 4) botao Ver tudo: anda suave (varios quadros intermediarios) ou pula
    const t0 = await layer(); await page.getByTestId('board-zoom').click(); await page.waitForTimeout(500); const seen = new Set();
    await page.evaluate(() => {window.__tr = []; const el = document.querySelector('[data-testid=board-layer]'); const tick = () => {window.__tr.push(el.style.transform); if (window.__tr.length < 40) requestAnimationFrame(tick);}; requestAnimationFrame(tick);});
    await page.getByLabel('Ver tudo').click(); await page.waitForTimeout(900); const tr = await page.evaluate(() => window.__tr); for (const t of tr) seen.add(t);
    res.push('INFO ver tudo: ' + seen.size + ' posicoes diferentes da camera'); void t0; ok(seen.size >= 6, 'Ver tudo desliza (' + seen.size + ' posições da câmera no caminho)');
    if (process.env.CPU) {const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1});}
    const zoom = async () => parseInt(await page.getByTestId('board-zoom').innerText());
    // 100% e degraus de 20% (Ctrl + / Ctrl - / Ctrl 0), com o foco no quadro
    await page.mouse.click(bb.x + bb.width - 30, bb.y + bb.height - 140); await page.waitForTimeout(200);
    await page.keyboard.press('Control+0'); await page.waitForTimeout(600); ok(await zoom() === 100, 'Ctrl+0 volta para 100%');
    await page.keyboard.press('Control+Equal'); await page.waitForTimeout(600); ok(await zoom() === 120, 'Ctrl + aproxima um degrau (120%): ' + await zoom());
    await page.keyboard.press('Control+Minus'); await page.keyboard.press('Control+Minus'); await page.waitForTimeout(700); ok(await zoom() === 83, 'Ctrl - afasta dois degraus (83%): ' + await zoom());
    await page.getByLabel('Aproximar (Ctrl +)').click(); await page.waitForTimeout(600); ok(await zoom() === 100, 'botão + cai no degrau redondo (100%): ' + await zoom());
    ok(await page.evaluate(() => document.documentElement.style.zoom || '') === '' , 'Ctrl + não deu zoom no navegador');
    // W A S D andam o quadro enquanto seguradas
    {const o0 = await page.getByTestId('board-origin').boundingBox(); await page.keyboard.down('d'); await page.waitForTimeout(400); await page.keyboard.up('d'); await page.waitForTimeout(100);
     const o1 = await page.getByTestId('board-origin').boundingBox(); ok(o0.x - o1.x > 150 && Math.abs(o1.y - o0.y) < 2, 'segurar D anda para a direita (' + Math.round(o0.x - o1.x) + ' px)');
     await page.keyboard.down('s'); await page.waitForTimeout(300); await page.keyboard.up('s'); await page.waitForTimeout(100); const o2 = await page.getByTestId('board-origin').boundingBox(); ok(o1.y - o2.y > 100, 'segurar S anda para baixo');}
    // C cria nota, L cria lista (no ponto do mouse)
    {const n0 = await page.locator('[data-testid=board-item]').count(); await page.mouse.move(bb.x + 500, bb.y + 300); await page.keyboard.press('Escape'); await page.keyboard.press('c'); await page.waitForTimeout(400); await page.keyboard.type('nota pelo C');
     await page.mouse.click(bb.x + bb.width - 30, bb.y + bb.height - 140); await page.waitForTimeout(400); await page.keyboard.press('l'); await page.waitForTimeout(400); await page.keyboard.type('item da lista'); await page.mouse.click(bb.x + bb.width - 30, bb.y + bb.height - 140); await page.waitForTimeout(800);
     ok(await page.locator('[data-testid=board-item]').count() === n0 + 2, 'C e L criam nota e lista'); ok(await page.getByText('nota pelo C').count() === 1, 'a nota do C já abre escrevendo');}
    // alinhar: seleciona 3 notas e enfileira em coluna
    await page.getByLabel('Ver tudo').click(); await page.waitForTimeout(600);
    {const ids = await page.evaluate(() => [...document.querySelectorAll('[data-testid=board-item]')].slice(0, 3).map(x => x.getAttribute('data-id')));
     const box = async id => page.locator('[data-testid=board-item][data-id="' + id + '"]').boundingBox();
     for (let i = 0; i < 3; i++) {const b = await box(ids[i]); if (i) await page.keyboard.down('Shift'); await page.mouse.click(b.x + 8, b.y + 8); if (i) await page.keyboard.up('Shift'); await page.waitForTimeout(150);}
     if (process.env.DEBUG) {await page.screenshot({path: '/tmp/claude-0/-home-user/e6d4689f-3d4a-5fe5-a663-eaadd747502e/scratchpad/align.png'}); console.log('SEL', await page.evaluate(() => JSON.stringify({bars: [...document.querySelectorAll('[role=toolbar]')].map(x => x.getAttribute('aria-label') + '@' + x.style.left + ',' + x.style.top), editing: document.querySelectorAll('[data-board-editing]').length, act: document.activeElement?.tagName + '/' + document.activeElement?.getAttribute('data-testid')})));}
     await page.getByTestId('board-align').click({timeout: 5000}); await page.waitForTimeout(200); await page.getByTestId('board-align-col').click(); await page.waitForTimeout(700);
     const bs = await Promise.all(ids.map(box)); const xs = bs.map(b => Math.round(b.x)); const sorted = [...bs].sort((a, b) => a.y - b.y);
     ok(Math.max(...xs) - Math.min(...xs) <= 1, 'Em coluna: mesma esquerda'); ok(sorted.every((b, i) => !i || b.y > sorted[i - 1].y + sorted[i - 1].height), 'Em coluna: um embaixo do outro, sem encostar');
     await page.getByTestId('board-align-left').click(); await page.waitForTimeout(300);
     await page.keyboard.press('Control+z'); await page.waitForTimeout(500);}
    // ligacao tracejada e dois cliques levam ate a outra ponta
    {await page.keyboard.press('Escape'); const ids = await page.evaluate(() => [...document.querySelectorAll('[data-testid=board-item]')].slice(0, 2).map(x => x.getAttribute('data-id')));
     const b0 = await page.locator('[data-testid=board-item][data-id="' + ids[0] + '"]').boundingBox(); await page.mouse.click(b0.x + 8, b0.y + 8); await page.getByLabel('Ligar a outro item (clique no outro item)').click();
     const b1 = await page.locator('[data-testid=board-item][data-id="' + ids[1] + '"]').boundingBox(); await page.mouse.click(b1.x + 8, b1.y + 8); await page.waitForTimeout(400);
     ok(await page.getByTestId('board-link').count() >= 1, 'ligação criada');
     await page.getByTestId('board-link').first().dispatchEvent('pointerdown'); await page.waitForTimeout(300); await page.getByTestId('board-link-dash').click(); await page.waitForTimeout(400);
     ok(await page.evaluate(() => !!document.querySelector('[data-testid=board-layer] svg line[stroke-dasharray]')), 'ligação tracejada');
     await page.keyboard.press('Escape'); await page.getByLabel('Ver tudo').click(); await page.waitForTimeout(600);
     const n0 = await page.locator('[data-testid=board-item]').count(), mid = await page.evaluate(() => {const l = document.querySelector('[data-testid=board-link]'), m = l.getScreenCTM(), P = (x, y) => ({x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f}); const a = P(+l.getAttribute('x1'), +l.getAttribute('y1')), b = P(+l.getAttribute('x2'), +l.getAttribute('y2'));
       for (let i = 1; i < 40; i++) {const t = i / 40, q = {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t}; if (document.elementFromPoint(q.x, q.y) === l) return q;} return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};});
     const z0 = await zoom(); if (process.env.DEBUG) {const hit = await page.evaluate(([x, y]) => {const e = document.elementFromPoint(x, y); return e.tagName + '/' + e.getAttribute('data-testid') + '/' + (e.closest('[data-board-item]')?.getAttribute('data-id') || '');}, [mid.x, mid.y]); console.log('HIT', hit);} await page.mouse.dblclick(mid.x, mid.y); await page.waitForTimeout(800);
     ok(await zoom() !== z0, 'dois cliques na ligação levam até a outra ponta (zoom ' + z0 + ' -> ' + await zoom() + ')'); await page.getByLabel('Ver tudo').click(); await page.waitForTimeout(700);
     const n1 = await page.locator('[data-testid=board-item]').count(); ok(n1 === n0, 'dois cliques na ligação não criam nota (' + n0 + ' -> ' + n1 + ')');}
    ok(!errs.length, 'sem erros de JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } catch (e) {res.push('FALHA execucao: ' + String(e && e.stack || e).slice(0, 400));}
  const bad = res.some(r => r.startsWith('FALHA')); console.log(res.join('\n') + '\n' + (bad ? '✗ COM FALHAS' : 'QUADRO-MOVIMENTO OK (' + res.filter(r => r.startsWith('OK')).length + ' verificacoes)')); await br.close(); lab.kill(); process.exit(res.some(r => r.startsWith('FALHA')) ? 1 : 0);
})();
