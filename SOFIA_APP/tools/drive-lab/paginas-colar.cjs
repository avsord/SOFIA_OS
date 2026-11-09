// 08/11/2026 (Pedro: "colei aqui e os links e grifados sairam, passa o robo em todas as paginas"): colar varias linhas com links
// e grifo numa pagina - Google Docs, Word, Notion, texto puro, HTML com quebra no meio da linha, copia da propria Sofia (Ctrl+C/V
// de verdade), pagina dentro do cartao do Quadro (?embed=1) e nota do Quadro. Confere na tela e depois de recarregar.
// Uso: node tools/drive-lab/paginas-colar.cjs
const {chromium} = require('playwright'); const {spawn} = require('child_process'); const OS = require('os'), fs = require('fs'), P = require('path');
const PORT = 7300 + Math.floor(Math.random() * 200) * 2, B = 'http://127.0.0.1:' + PORT, O = fs.mkdtempSync(P.join(OS.tmpdir(), 'colar-')) + '/';
const res = []; const ok = (c, m) => res.push((c ? 'OK   ' : 'FALHA') + ' ' + m);
const U1 = 'https://www.instagram.com/p/DfXxBk1Rhcv/', U2 = 'https://raivcoo.com/collections/pedrosilvaavsord/gwmfreelaoliver', U3 = 'https://drive.google.com/drive/folders/1HLrANXWUDZVjrz45qTn2QVzSS_Z4RUEj?usp=sharing';
const PLAIN = U1 + ' (EDIÇÃO DE VIDEO)\n\n' + U2 + '  (PEDRO)\n\n\n' + U3 + ' (FRED)';
const CASES = [
  {name: 'Google Docs', text: PLAIN, mark: true, html: '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><a href="' + U1 + '" style="text-decoration:none;"><span style="font-size:11pt;color:#1155cc;text-decoration:underline;">' + U1 + '</span></a><span style="font-size:11pt;"> (EDIÇÃO DE VIDEO)</span></p><br><p dir="ltr"><a href="' + U2 + '"><span style="color:#1155cc;text-decoration:underline;">' + U2 + '</span></a><span>  (PEDRO)</span></p><br><br><p dir="ltr"><a href="' + U3 + '"><span style="color:#1155cc;text-decoration:underline;">' + U3 + '</span></a><span> </span><span style="background-color:#ffff00;">(FRED)</span></p></b>'},
  {name: 'Word', text: PLAIN, mark: true, html: '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0}</style></head><body lang=PT-BR><!--StartFragment--><p class=MsoNormal><a href="' + U1 + '"><span style=\'color:#0563C1\'>' + U1 + '</span></a> (EDIÇÃO DE VIDEO)<o:p></o:p></p>\r\n<p class=MsoNormal><o:p>&nbsp;</o:p></p>\r\n<p class=MsoNormal><a\r\nhref="' + U2 + '">' + U2 + '</a>&nbsp;\r\n(PEDRO)<o:p></o:p></p>\r\n<p class=MsoNormal><o:p>&nbsp;</o:p></p>\r\n<p class=MsoNormal><o:p>&nbsp;</o:p></p>\r\n<p class=MsoNormal><a href="' + U3 + '">' + U3 + '</a> <span style=\'background:yellow;mso-highlight:yellow\'>(FRED)</span><o:p></o:p></p><!--EndFragment--></body></html>'},
  {name: 'Notion', text: PLAIN, mark: true, html: '<div>' + '<a href="' + U1 + '">' + U1 + '</a> (EDIÇÃO DE VIDEO)</div><div><br></div><div><a href="' + U2 + '">' + U2 + '</a>  (PEDRO)</div><div><br></div><div><br></div><div><a href="' + U3 + '">' + U3 + '</a> <mark style="background-color: rgb(251, 243, 219);">(FRED)</mark></div>'},
  {name: 'texto puro (sem HTML)', text: PLAIN, mark: false, html: ''},
  {name: 'HTML com quebra no meio da linha', text: PLAIN, mark: true, html: '<p><a href="' + U1 + '">' + U1 + '</a>\n (EDIÇÃO DE VIDEO)</p><p></p><p><a\n href="' + U2 + '">' + U2 + '</a>\n  (PEDRO)</p><p></p><p></p><p><a href="' + U3 + '">' + U3 + '</a>\n<span style="background-color: rgb(255, 230, 0)">(FRED)</span></p>'},
  {name: 'site com URLs sem link (só texto) e grifo', text: PLAIN, mark: true, html: '<p>' + U1 + ' (EDIÇÃO DE VIDEO)</p><p><br></p><p>' + U2 + '  (PEDRO)</p><p><br></p><p><br></p><p>' + U3 + ' <span style="background-color:#ffff00">(FRED)</span></p>'},
];
(async () => {
  const lab = spawn(process.execPath, [P.join(__dirname, 'lab-server.cjs'), String(PORT), O + 'data'], {stdio: ['ignore', 'pipe', 'pipe']}); let log = ''; lab.stdout.on('data', d => log += d); lab.stderr.on('data', d => log += d);
  for (let i = 0; i < 80 && !/pronto/.test(log); i++) await new Promise(r => setTimeout(r, 250));
  const br = await chromium.launch(); const ctx = await br.newContext({viewport: {width: 1500, height: 900}}); await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: B});
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  const paste = (html, text) => page.evaluate(([html, text]) => {const t = document.activeElement; const dt = new DataTransfer(); if (html) dt.setData('text/html', html); dt.setData('text/plain', text); t.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));}, [html, text]);
  // o que a pagina mostra: links (href de cada um) e trechos grifados (fundo colorido) dentro do editor
  const look = (fr) => (fr || page).evaluate(() => {const eds = [...document.querySelectorAll('[contenteditable="true"]')];
    const a = [...new Set(eds.flatMap(e => [...e.querySelectorAll('a[href]')].map(x => x.getAttribute('href'))))];
    const mk = eds.flatMap(e => [...e.querySelectorAll('[style*="background"]')].filter(x => /FRED/.test(x.textContent || '')).map(x => x.textContent));
    const text = eds.map(e => e.innerText).join('\n'); return {a, mk, text};});
  const check = (r, label, mark) => {ok([U1, U2, U3].every(u => r.a.includes(u)), label + ': 3 links (' + r.a.length + ' achados)'); ok(/EDIÇÃO DE VIDEO/.test(r.text) && /PEDRO/.test(r.text) && /FRED/.test(r.text), label + ': texto inteiro');
    if (mark) ok(r.mk.length >= 1, label + ': grifo do (FRED) ficou');};
  const newPage = async () => {await page.getByLabel('Nova página').first().click(); await page.waitForTimeout(1800); await page.locator('[contenteditable="true"]').last().click(); await page.waitForTimeout(200);};
  try {
    await page.goto(B + '/paginas'); await page.waitForTimeout(1500);
    await page.getByPlaceholder('Seu e-mail cadastrado').fill('lab@sofia.local'); await page.getByPlaceholder('Senha da sua conta').fill('senha-do-laboratorio-123'); await page.getByText('Entrar', {exact: true}).last().click(); await page.waitForTimeout(3000);
    await page.goto(B + '/paginas'); await page.waitForTimeout(3000);
    const urls = [];
    for (const cs of CASES) {await newPage(); await paste(cs.html, cs.text); await page.waitForTimeout(900); check(await look(), cs.name, cs.mark); urls.push([cs, page.url()]);}
    // colar no meio de uma linha que ja tem texto
    await newPage(); await page.keyboard.type('Referências: '); await paste(CASES[0].html, CASES[0].text); await page.waitForTimeout(900);
    {const r = await look(); check(r, 'colar depois de um texto já escrito', true); ok(/Referências: /.test(r.text), 'colar depois de um texto: o texto de antes ficou');}
    // copia da propria Sofia: seleciona tudo da pagina do Docs e cola numa nova (Ctrl+C / Ctrl+V de verdade)
    await page.goto(urls[0][1]); await page.waitForTimeout(2500); await page.locator('[contenteditable="true"]').nth(1).click(); await page.keyboard.press('Escape'); await page.waitForTimeout(200); await page.keyboard.press('Control+a'); await page.waitForTimeout(200); await page.keyboard.press('Control+c'); await page.waitForTimeout(400);
    if (process.env.DEBUG) {await page.screenshot({path: '/tmp/claude-0/-home-user/e6d4689f-3d4a-5fe5-a663-eaadd747502e/scratchpad/copy-sel.png'}); console.log('CLIP', JSON.stringify(await page.evaluate(async () => {const it = await navigator.clipboard.read(); const out = {}; for (const i of it) for (const t of i.types) out[t] = (await (await i.getType(t)).text()).slice(0, 900); return out;})));}
    await newPage(); await page.keyboard.press('Control+v'); await page.waitForTimeout(1200); check(await look(), 'copiar de uma página da Sofia e colar em outra', true);
    // trecho de UMA linha copiado de dentro da pagina (selecao do navegador): o link vem, sem grifo falso nem cor de letra fixa
    await page.goto(urls[0][1]); await page.waitForTimeout(2500);
    {const ok1 = await page.evaluate(() => {const a = [...document.querySelectorAll('[contenteditable="true"] a[href]')].find(x => /raivcoo/.test(x.getAttribute('href') || '')); if (!a) return false; const line = a.closest('[contenteditable="true"]'); const r = document.createRange(); r.selectNodeContents(line); const s = getSelection(); s.removeAllRanges(); s.addRange(r); line.focus(); return true;});
     ok(ok1, 'achou a linha para copiar o trecho'); await page.keyboard.press('Control+c'); await page.waitForTimeout(300);
     await newPage(); await page.keyboard.press('Control+v'); await page.waitForTimeout(1200);
     const r = await page.evaluate(() => {const eds = [...document.querySelectorAll('[contenteditable="true"]')]; const ed = eds.find(e => /PEDRO/.test(e.innerText || '')); if (!ed) return null; const base = getComputedStyle(ed).color.replace(/\s/g, ''); const st = [...ed.querySelectorAll('[style]')].map(x => x.getAttribute('style')).filter(x => /background/.test(x || '') || ((x || '').match(/(?:^|;)\s*color:\s*([^;]+)/) || [])[1]?.replace(/\s/g, '') === base); return {a: [...ed.querySelectorAll('a[href]')].map(x => x.getAttribute('href')), st};});
     ok(!!r && r.a.some(u => /raivcoo/.test(u)), 'trecho de uma linha copiado de dentro da página: o link veio');
     ok(!!r && !r.st.some(x => /background|(^|;)\s*color/.test(x || '')), 'trecho de uma linha: sem grifo falso nem cor de letra fixa (' + (r ? r.st.join(' | ').slice(0, 160) : '-') + ')');}
    // depois de recarregar (ficou gravado)
    await page.waitForTimeout(2500);
    for (const [cs, u] of urls) {await page.goto(u); await page.waitForTimeout(2500); check(await look(), cs.name + ' (depois de recarregar)', cs.mark);}
    // a pagina aberta dentro do cartao do Quadro (?embed=1)
    {const u = urls[0][1].split('?')[0] + '?embed=1'; const pg2 = await ctx.newPage(); pg2.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); await pg2.goto(u); await pg2.waitForTimeout(3000);
      await pg2.locator('[contenteditable="true"]').last().click(); await pg2.keyboard.press('End'); await pg2.keyboard.press('Enter'); await pg2.waitForTimeout(300);
      await pg2.evaluate(([html, text]) => {const t = document.activeElement; const dt = new DataTransfer(); dt.setData('text/html', html); dt.setData('text/plain', text); t.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));}, [CASES[1].html, CASES[1].text]);
      await pg2.waitForTimeout(1200); const r = await look(pg2); ok(r.a.length >= 3 && r.text.split('FRED').length >= 3, 'página dentro do cartão do Quadro: colar do Word (' + r.a.length + ' links)'); await pg2.close();}
    // nota do Quadro
    await page.goto(B + '/paginas'); await page.waitForTimeout(2500); await page.getByLabel('Nova página').first().click(); await page.waitForTimeout(1800); await page.getByLabel('Quadro', {exact: true}).click(); await page.waitForTimeout(1500);
    {const bb = await page.getByTestId('page-board').boundingBox(); await page.mouse.dblclick(bb.x + 400, bb.y + 300); await page.waitForTimeout(400);
      // na nota o navegador cola sozinho: area de transferencia de verdade + Ctrl+V
      await page.evaluate(async ([html, text]) => {await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([html], {type: 'text/html'}), 'text/plain': new Blob([text], {type: 'text/plain'})})]);}, [CASES[0].html, CASES[0].text]);
      await page.keyboard.press('Control+v'); await page.waitForTimeout(400);
      await page.mouse.click(bb.x + 1200, bb.y + 700); await page.waitForTimeout(1200); const r = await page.evaluate(() => {const it = document.querySelector('[data-testid=board-item]'); return {a: [...(it?.querySelectorAll('a[href]') || [])].map(x => x.getAttribute('href')), mk: [...(it?.querySelectorAll('[style*="background"]') || [])].filter(x => /FRED/.test(x.textContent || '')).map(x => x.textContent), text: it?.innerText || ''};});
      check(r, 'nota do Quadro', true);}
    ok(!errs.length, 'sem erros de JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } catch (e) {res.push('FALHA execucao: ' + String(e && e.stack || e).slice(0, 500));}
  const bad = res.some(r => r.startsWith('FALHA')); console.log(res.join('\n') + '\n' + (bad ? '✗ COM FALHAS' : 'COLAR OK (' + res.filter(r => r.startsWith('OK')).length + ' verificacoes)')); await br.close(); lab.kill(); process.exit(res.some(r => r.startsWith('FALHA')) ? 1 : 0);
})();
