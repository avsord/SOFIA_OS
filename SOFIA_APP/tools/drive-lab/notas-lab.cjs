// 13/11/2026 (lista do Pedro sobre as Anotações): robô das Notas no site de verdade (servidor do laboratório + Chrome).
// Mede: arrastar nota para dentro/fora de pasta com UM arrasto, lixeira ao arrastar, voltar do navegador por níveis,
// nota longa rolando sem pular, aviso de salvar discreto, Tab na página, colar imagem na nota.
// Uso: SOFIA_CHROME=1 node tools/drive-lab/notas-lab.cjs [pasta-de-saida] [--so=nome,nome]
const {chromium} = require('playwright'); const {spawn} = require('child_process'); const path = require('path'), fs = require('fs'), OS = require('os');
const PORT = 6500 + Math.floor(Math.random() * 200) * 2, B = 'http://127.0.0.1:' + PORT;
const argOut = process.argv.slice(2).find(a => !a.startsWith('--')), O = (argOut || fs.mkdtempSync(path.join(OS.tmpdir(), 'notas-'))) + '/';
const only = (process.argv.find(a => a.startsWith('--so=')) || '').slice(5).split(',').filter(Boolean);
fs.mkdirSync(O, {recursive: true});
const res = []; const ok = (c, m) => {res.push((c ? 'OK   ' : 'FALHA') + ' ' + m); console.log((c ? 'OK   ' : 'FALHA') + ' ' + m);};
const note = (id, title, content) => ({id, title, content: content || '', created_at: '2026-11-10T10:00:00.000Z'});
function notesData() {
  return {title: 'Notas', show_title: true, mode: 'notebooks', properties: [{key: 'name', label: 'Nome', type: 'text'}], views: [{id: 'notebooks', label: 'Notas', type: 'pages'}], active_view: 'notebooks', rows: [],
    notebooks: [
      {id: 'f1', name: 'caderno-01', emoji: '📁', expanded: false, pages: [note('n1', 'Dentro um')]},
      {id: 'f2', name: 'Ideias', emoji: '💡', expanded: false, pages: []},
      {id: 'f3', name: 'Sub', emoji: '📁', expanded: false, parent: 'f1', pages: [note('n5', 'Neta')]},
      {id: '__fora_de_pastas__', name: 'Fora de pastas', emoji: '📝', expanded: true, root: true, pages: [note('n2', 'Solta A'), note('n3', 'Solta B'), note('n4', 'Longa', Array.from({length: 120}, (_, i) => 'Linha ' + (i + 1) + ' do texto comprido da nota.').join('\n'))]},
    ]};
}
(async () => {
  const lab = spawn(process.execPath, [path.join(__dirname, 'lab-server.cjs'), String(PORT), O + 'data'], {stdio: ['ignore', 'pipe', 'pipe']}); let log = ''; lab.stdout.on('data', d => log += d); lab.stderr.on('data', d => log += d);
  for (let i = 0; i < 80 && !/pronto/.test(log); i++) await new Promise(r => setTimeout(r, 250));
  const api = async (p, body, method) => {const r = await fetch(B + '/api/mobile' + p, {method: method || (body ? 'POST' : 'GET'), headers: {'Content-Type': 'application/json', ...(api.t ? {Authorization: 'Bearer ' + api.t} : {})}, body: body ? JSON.stringify(body) : undefined}); const t = await r.text(); try {return JSON.parse(t);} catch {return t;}};
  const br = await chromium.launch(process.env.SOFIA_CHROME ? {channel: 'chrome'} : {}); const ctx = await br.newContext({viewport: {width: 1500, height: 900}}); const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  const want = n => !only.length || only.includes(n);
  try {
    api.t = (await api('/auth/login', {email: 'lab@sofia.local', password: 'senha-do-laboratorio-123', device_name: 'robo'})).token;
    const mk = async (title, blocks) => api('/workspace/entities', {kind: 'user_page', title, content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {icon: '', icon_mode: 'default', cover_type: '', cover_value: '', cover_attachment_id: '', purpose: '', layout: 'notes', suggested: false, parent_id: '', node_type: 'page', blocks_json: JSON.stringify(blocks)}});
    const anot = await mk('Anotações', [{id: 'bnotes', type: 'collection', text: '', data: notesData()}]);
    const sub = await mk('Subpágina filha', [{id: 'bs1', type: 'text', text: 'Conteúdo da filha'}]);
    const outra = await mk('Outra página', [{id: 'bt1', type: 'text', text: 'Primeira linha'}, {id: 'bl1', type: 'page_link', text: '', data: {page_id: sub.id}}, {id: 'bt2', type: 'text', text: 'Segunda linha'}, {id: 'bt3', type: 'text', text: 'Terceira linha'}]);
    await api('/workspace/entities/' + sub.id, {...sub, data: {...sub.data, parent_id: outra.id}}, 'PATCH').catch(() => {});
    await page.goto(B + '/paginas'); await page.waitForTimeout(1500);
    await page.getByPlaceholder('Seu e-mail cadastrado').fill('lab@sofia.local'); await page.getByPlaceholder('Senha da sua conta').fill('senha-do-laboratorio-123'); await page.getByText('Entrar', {exact: true}).last().click(); await page.waitForTimeout(3000);
    const openAnot = async () => {await page.goto(B + '/paginas/' + anot.id); await page.waitForTimeout(3500);};
    const books = async () => {const e = await api('/workspace/entities/' + anot.id); const ent = e.entity || e; const bl = JSON.parse(ent.data.blocks_json); return bl.find(b => b.id === 'bnotes').data.notebooks;};
    const where = async id => {const bs = await books(); const b = bs.find(k => k.pages.some(p => p.id === id)); return b ? b.id : null;};
    const card = t => page.locator('[aria-label="Abrir nota ' + t + '"]').first();
    const folder = t => page.locator('[aria-label="Abrir pasta ' + t + '"]').first();
    // arrastar de verdade com o mouse (eventos do navegador), um passo só
    const drag = async (from, to, opts = {}) => {
      const a = await from.boundingBox(), b = await to.boundingBox(); if (!a || !b) return false;
      await page.mouse.move(a.x + a.width / 2, a.y + 20); await page.mouse.down();
      const tx = b.x + b.width * (opts.fx ?? 0.5), ty = b.y + b.height * (opts.fy ?? 0.5);
      for (let i = 1; i <= 12; i++) {await page.mouse.move(a.x + a.width / 2 + (tx - a.x - a.width / 2) * i / 12, a.y + 20 + (ty - a.y - 20) * i / 12); await page.waitForTimeout(30);}
      if (opts.shot) await page.screenshot({path: O + opts.shot});
      await page.mouse.up(); await page.waitForTimeout(2600); return true;
    };
    if (want('arrastar')) {
      await openAnot(); await page.screenshot({path: O + 'raiz.png'});
      await drag(card('Solta A'), folder('Ideias'), {shot: 'arrastando.png'});
      ok(await where('n2') === 'f2', 'nota solta vai para a pasta com UM arrasto (está em ' + await where('n2') + ')');
      await folder('Ideias').click(); await page.waitForTimeout(800);
      await drag(card('Solta A'), page.getByText('‹ Notas').first());
      ok(await where('n2') === '__fora_de_pastas__', 'nota sai da pasta com UM arrasto pelo ‹ Notas (está em ' + await where('n2') + ')');
    }
    if (want('lixeira')) {
      await openAnot();
      const a = await card('Solta B').boundingBox(); await page.mouse.move(a.x + 40, a.y + 20); await page.mouse.down(); for (let i = 1; i <= 6; i++) {await page.mouse.move(a.x + 40 + i * 10, a.y + 20 + i * 10); await page.waitForTimeout(40);}
      const trash = page.locator('[data-testid="notes-trash"]'); const has = await trash.count() > 0 && await trash.first().isVisible(); ok(has, 'lixeira aparece ao arrastar');
      if (has) {const t = await trash.first().boundingBox(); for (let i = 1; i <= 10; i++) {await page.mouse.move(a.x + 100 + (t.x + t.width / 2 - a.x - 100) * i / 10, a.y + 80 + (t.y + t.height / 2 - a.y - 80) * i / 10); await page.waitForTimeout(30);} await page.screenshot({path: O + 'lixeira.png'}); await page.mouse.up(); await page.waitForTimeout(800);
        const btn = page.getByText('Excluir', {exact: true}).last(); if (await btn.count()) {await btn.click(); await page.waitForTimeout(2600);} ok(await where('n3') === null, 'soltar na lixeira apaga a nota (confirmando)');} else await page.mouse.up();
    }
    if (want('voltar')) {
      await page.goto(B + '/paginas/' + outra.id); await page.waitForTimeout(3000); await page.evaluate(() => {window.__semRecarregar = 1;});
      await page.locator('[data-testid="sidebar-page-' + anot.id + '"]').first().click(); await page.waitForTimeout(2500);
      await folder('caderno-01').click(); await page.waitForTimeout(600); await folder('Sub').click(); await page.waitForTimeout(600);
      const lvl = async () => page.evaluate(() => {const t = [...document.querySelectorAll('[aria-label^="Abrir pasta"],[aria-label^="Abrir nota"]')].map(x => x.getAttribute('aria-label')); return {url: location.pathname, t: t.join('|')};});
      let s0 = await lvl(); await page.goBack(); await page.waitForTimeout(900); let s1 = await lvl();
      ok(s1.url.includes(anot.id) && /Abrir pasta Sub/.test(s1.t), 'voltar do navegador sai da subpasta para a pasta de cima (' + s1.t.slice(0, 80) + ')');
      await page.goBack(); await page.waitForTimeout(900); let s2 = await lvl();
      ok(s2.url.includes(anot.id) && /Abrir pasta caderno-01/.test(s2.t), 'voltar de novo vai para a raiz das notas');
      await page.goBack(); await page.waitForTimeout(1500); ok(page.url().includes(outra.id), 'voltar de novo vai para a página anterior');
      ok(await page.evaluate(() => window.__semRecarregar === 1), 'sem recarregar o site ao voltar');
    }
    if (want('rolar')) {
      await openAnot(); await card('Longa').click(); await page.waitForTimeout(1500); await page.screenshot({path: O + 'nota-longa.png'});
      const m = await page.evaluate(() => {const p = document.querySelector('[data-testid="side-peek-panel"]'); if (!p) return null; const sc = [...p.querySelectorAll('*')].filter(e => {const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 4;}); return {n: sc.length, list: sc.map(e => [e.tagName, e.getAttribute('data-testid'), e.clientHeight, e.scrollHeight])};});
      res.push('rolagem: ' + JSON.stringify(m)); ok(m && m.n === 1, 'nota longa tem UMA rolagem só (' + (m ? m.n : '-') + ')');
      const ed = page.locator('[data-testid="side-peek-panel"] textarea, [data-testid="side-peek-panel"] [contenteditable="true"]').last();
      if (await ed.count()) {await ed.click({position: {x: 30, y: 30}}); await page.keyboard.press('Control+End'); await page.waitForTimeout(300);
        const tops = []; for (let i = 0; i < 8; i++) {await page.keyboard.type('x'); await page.waitForTimeout(120); tops.push(await page.evaluate(() => {const p = document.querySelector('[data-testid="side-peek-panel"]'); const sc = [...p.querySelectorAll('*')].filter(e => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 4); return sc.map(e => e.scrollTop).join(',');}));}
        res.push('scrollTop digitando no fim: ' + tops.join(' ')); ok(new Set(tops).size <= 2, 'digitar no fim da nota longa não faz a rolagem pular');
        await page.screenshot({path: O + 'nota-longa-digitando.png'});}
      await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    }
    if (want('salvar')) {
      await openAnot(); await card('Solta A').click().catch(() => {}); await page.waitForTimeout(1200);
      const seen = []; const t0 = Date.now(); const ed = page.locator('[data-testid="side-peek-panel"] textarea, [data-testid="side-peek-panel"] [contenteditable="true"]').last();
      if (await ed.count()) {await ed.click(); for (let i = 0; i < 25; i++) {await page.keyboard.type('a'); await page.waitForTimeout(90); seen.push(await page.evaluate(() => document.body.innerText.match(/Salvando…|Salvo|Sincronizando/g)?.join('+') || ''));}
        await page.waitForTimeout(2500); seen.push(await page.evaluate(() => document.body.innerText.match(/Salvando…|Salvo|Sincronizando/g)?.join('+') || ''));
        const changes = seen.filter((v, i) => i && v !== seen[i - 1]).length; res.push('aviso de salvar durante a digitação: ' + seen.join(' ')); ok(changes <= 1, 'aviso de salvar não pisca enquanto digita (' + changes + ' trocas)');}
      await page.keyboard.press('Escape');
    }
    if (want('tab')) {
      await page.goto(B + '/paginas/' + outra.id); await page.waitForTimeout(3000);
      const blk = page.locator('[data-testid="page-block-bt2"] [contenteditable="true"]').first(); await blk.click(); await page.keyboard.press('Home');
      const x0 = (await blk.boundingBox()).x; await page.keyboard.press('Tab'); await page.waitForTimeout(500);
      const txt = await blk.innerText(); const x1 = (await page.locator('[data-testid="page-block-bt2"] [contenteditable="true"]').first().boundingBox()).x;
      res.push('tab: x ' + x0 + ' -> ' + x1 + ' texto ' + JSON.stringify(txt));
      ok(!txt.includes('\t'), 'Tab não põe o espaço grande (tabulação) no texto');
      ok(x1 - x0 >= 14 && x1 - x0 <= 40, 'Tab recua o bloco um nível, como no Notion');
      await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(400); const x2 = (await page.locator('[data-testid="page-block-bt2"] [contenteditable="true"]').first().boundingBox()).x; ok(Math.abs(x2 - x0) < 2, 'Shift+Tab volta o recuo');
      await page.screenshot({path: O + 'tab.png'});
    }
    if (want('subpagina')) {
      await page.goto(B + '/paginas/' + outra.id); await page.waitForTimeout(3000);
      const row = page.locator('[data-testid="page-block-bl1"]').first(); await row.hover(); await page.waitForTimeout(300);
      const grip = row.locator('[aria-label="Arraste para mover · clique para opções"]').first(); const g = await grip.boundingBox(); const t3 = await page.locator('[data-testid="page-block-bt3"]').first().boundingBox();
      if (g && t3) {await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await page.mouse.down(); for (let i = 1; i <= 10; i++) {await page.mouse.move(g.x + g.width / 2 + 20, g.y + (t3.y + t3.height - 2 - g.y) * i / 10); await page.waitForTimeout(30);} await page.mouse.up(); await page.waitForTimeout(2600);}
      const e = await api('/workspace/entities/' + outra.id), ent = e.entity || e, order = JSON.parse(ent.data.blocks_json).map(x => x.id).join(',');
      res.push('ordem depois de arrastar a subpágina: ' + order); ok(order.indexOf('bl1') > order.indexOf('bt3'), 'subpágina se move arrastando pelo ⋮⋮, igual texto');
    }
    if (want('imagem')) {
      await openAnot(); await card('Solta A').click().catch(() => {}); await page.waitForTimeout(1300);
      const ed = page.locator('[data-testid="side-peek-panel"] textarea').nth(1); await ed.click();
      await page.evaluate(async () => {const c = document.createElement('canvas'); c.width = 300; c.height = 160; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 300, 160);
        const blob = await new Promise(r => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'image.png', {type: 'image/png'}));
        document.activeElement.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));});
      await page.waitForTimeout(700); await page.screenshot({path: O + 'colar-imagem-pergunta.png'});
      const asked = await page.getByText('Como a imagem deve aparecer na nota?').count(); ok(asked > 0, 'colar imagem na nota pergunta: anexo ou print');
      if (asked) {await page.getByText(/Só o anexo/).first().click(); await page.waitForTimeout(3500); await page.screenshot({path: O + 'colar-imagem-anexo.png'});
        const row = await page.locator('[data-testid="side-peek-panel"] [data-testid="page-file-row"]').count(); ok(row === 1, 'imagem colada aparece como anexo (só o nome)');
        const nm = row ? await page.locator('[data-testid="side-peek-panel"] [data-testid="page-file-row"]').first().innerText() : ''; res.push('anexo: ' + JSON.stringify(nm)); ok(/^print-.*\.png$/.test(nm.trim()), 'o anexo mostra só o nome.png');}
      await page.keyboard.press('Escape'); await page.waitForTimeout(500); await page.keyboard.press('Escape'); await page.waitForTimeout(2500);
      const bs = await books(); const n2 = bs.flatMap(k => k.pages).find(x => x.id === 'n2'); ok(!!n2 && (n2.blocks || []).some(b => b.type === 'file' && b.data && b.data.attachment_id), 'nota guardou o bloco do anexo');
    }
    if (want('paginas')) {
      await openAnot(); const sec = page.locator('[data-testid="sidebar-section-Páginas"]'); ok(await sec.count() > 0, 'título Páginas da barra lateral é um link');
      if (await sec.count()) {await sec.first().click(); await page.waitForTimeout(2500); res.push('url: ' + page.url()); ok(/\/paginas\/?$/.test(new URL(page.url()).pathname), 'clicar em Páginas abre /paginas');
        await page.screenshot({path: O + 'paginas-inicio.png'});
        const rn = page.locator('[data-testid="pages-recent-notes"]'); ok(await rn.count() > 0, 'tela Páginas mostra as notas editadas recentemente');
        if (await rn.count()) {await rn.getByText('Longa').first().click(); await page.waitForTimeout(3500); ok(page.url().includes(anot.id) && await page.locator('[data-testid="side-peek-panel"]').count() > 0, 'clicar na nota recente abre a página com a nota aberta'); await page.keyboard.press('Escape');}}
    }
    if (want('corretor')) {
      await page.goto(B + '/paginas/' + outra.id); await page.waitForTimeout(3000);
      const on = await page.evaluate(() => [...document.querySelectorAll('textarea,[contenteditable="true"],input')].filter(e => e !== document.activeElement && e.offsetParent && /[a-z]{3,}/i.test(e.value ?? e.innerText ?? '') && e.spellcheck).map(e => (e.value ?? e.innerText).slice(0, 30)));
      res.push('corretor ligado fora da edição: ' + JSON.stringify(on)); ok(on.length === 0, 'corretor desligado nos campos fora da edição');
    }
    res.push('erros de JS: ' + JSON.stringify(errs.slice(0, 5)));
  } catch (e) {res.push('FALHA (robô) ' + String(e && e.stack || e).slice(0, 600)); await page.screenshot({path: O + 'erro.png'}).catch(() => {});}
  finally {await br.close(); lab.kill(); fs.writeFileSync(O + 'resultado.txt', res.join('\n')); console.log('---\n' + res.join('\n') + '\nsaída: ' + O);}
})();
