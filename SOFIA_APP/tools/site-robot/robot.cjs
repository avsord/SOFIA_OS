#!/usr/bin/env node
'use strict';
/*
 * Robo do site todo (07/11/2026, Pedro: "faca um robo pra o site todo... bug, estetica nao batendo, coisas desalinhadas,
 * diagramacao, janelas, tamanhos exagerados, posicoes"). Num servidor de TESTE com dados de exemplo (seed.cjs), percorre
 * cada tela em 3 tamanhos (notebook, tela do Pedro, celular), abre cada botao que abre janela/painel/menu/tela (nunca os que
 * apagam, enviam ou salvam) e mede, em cada estado, o que uma pessoa exigente veria:
 *   erros e pedidos recusados; coisa fora da tela ou rolagem lateral; texto cortado sem reticencias; textos encavalados;
 *   janela grande demais para o conteudo, maior que a tela ou fora do centro; janela que nao fecha (Esc / clique fora);
 *   desalinhamento de 1-5 px entre itens de uma mesma coluna; botao pequeno demais (dedo/mouse); contraste fraco;
 *   imagem quebrada; muitas fontes/cores diferentes numa tela; coisa que pula depois de aberta.
 * Cada estado vira um print (para a revisao visual). Saida: <pasta>/relatorio.md, achados.json e prints.
 * Uso: node tools/site-robot/robot.cjs <url-de-teste> <email> <senha> <pasta> [--only=/inicio,/agenda] [--telas=notebook,celular]
 */
const {chromium} = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const [base, email, password, outDir] = process.argv.slice(2);
const opt = Object.fromEntries(process.argv.slice(6).filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
if (!base || !outDir) { console.error('uso: robot.cjs <url-de-teste> <email> <senha> <pasta>'); process.exit(2); }
if (/railway\.app|sofiaos\./.test(base)) { console.error('recusado: o robo clica em botoes; use um servidor de teste'); process.exit(2); }
fs.mkdirSync(path.join(outDir, 'prints'), {recursive: true});

const ROUTES = (opt.only ? opt.only.split(',') : ['/inicio', '/conversa', '/paginas', '/agenda', '/avisos', '/perfil', '/apps', '/apps/tarefas', '/apps/financas', '/apps/price-tracker', '/apps/emails', '/apps/rotina', '/apps/lembretes', '/apps/encomendas', '/apps/listas', '/apps/biblioteca', '/apps/notas']);
const SCREENS = [{id: 'notebook', w: 1366, h: 768, d: 1}, {id: 'pedro', w: 1762, h: 832, d: 1.09}, {id: 'celular', w: 390, h: 844, mobile: true}].filter(s => !opt.telas || opt.telas.split(',').includes(s.id));
// nunca clicar: acoes que apagam, saem, enviam, salvam ou mudam dados
const DANGER = /apagar|excluir|remover|limpar|sair|desconectar|encerrar|enviar|salvar|concluir|tomei|pagar|paguei|recebi|arquivar|descartar|confirmar|trancar|redefinir|desfazer|marcar|ler todas|restaurar|importar|conectar|reconectar|exportar|copiar|duplicar|mover|lixeira|resetar|recome|atualizar agora|sincronizar|publicar|compartilhar|gravar|microfone|logout|trocar senha|alterar senha|instalar|baixar|download|ligar|desligar|permitir|bloquear|aprovar/i;
const SKIP = /^(início|conversa|páginas|agenda|apps|perfil|buscar|tarefas|finanças|price tracker|e-mails|rotina|lembretes|encomendas|listas|biblioteca|notas|sofia os|voltar|fechar|notificações)$/i;
const findings = []; let shots = 0;
const add = (f) => { const key = [f.screen, f.route, f.kind, f.where].join('|'); if (!findings.some(x => [x.screen, x.route, x.kind, x.where].join('|') === key)) findings.push(f); };

// ---------- medidas dentro da pagina ----------
function audit(scopeSel) {
  /* eslint-disable */
  const out = [], W = innerWidth, H = innerHeight;
  const vis = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; let o = 1; for (let x = el; x; x = x.parentElement) { o *= +getComputedStyle(x).opacity; if (o < 0.05) return false; } return r.bottom > 0 && r.top < H && r.right > 0 && r.left < W; };
  const desc = el => { const t = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40); let id = ''; for (let x = el, i = 0; x && i < 6; x = x.parentElement, i++) { const d = x.getAttribute && x.getAttribute('data-testid'); if (d) { id = d.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, 'ID').slice(0, 40); break; } } const r = el.getBoundingClientRect(); return (id ? '[' + id + '] ' : '') + '"' + t + '" ' + Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top); };
  const scope = scopeSel ? document.querySelector(scopeSel) : document.body; if (!scope) return out;
  const all = Array.from(scope.querySelectorAll('*'));
  const leaves = all.filter(el => el.childElementCount === 0 && (el.textContent || '').trim() && vis(el));
  const clipRect = el => { let r = el.getBoundingClientRect(), x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom; for (let x = el.parentElement; x && x !== document.documentElement; x = x.parentElement) { const s = getComputedStyle(x); if (/(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY)) { const b = x.getBoundingClientRect(); x1 = Math.max(x1, b.left); y1 = Math.max(y1, b.top); x2 = Math.min(x2, b.right); y2 = Math.min(y2, b.bottom); } } return {left: x1, top: y1, right: x2, bottom: y2, width: x2 - x1, height: y2 - y1}; };
  const layer = el => { for (let x = el; x && x !== document.body; x = x.parentElement) { const s = getComputedStyle(x); if ((s.position === 'fixed' || (s.position === 'absolute' && +s.zIndex >= 10)) || x.getAttribute('role') === 'dialog' || x.getAttribute('role') === 'menu') return x; } return document.body; };
  const onTop = (el, x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h) || h.contains(el)); };
  const clipAncestor = el => { for (let x = el.parentElement; x && x !== document.body; x = x.parentElement) { const s = getComputedStyle(x); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return x; } return null; };
  // 1) fora da tela
  if (document.documentElement.scrollWidth > W + 1) out.push({kind: 'rolagem-lateral', where: 'pagina ' + document.documentElement.scrollWidth + 'px > ' + W + 'px'});
  for (const el of leaves) { const r = el.getBoundingClientRect(); if ((r.right > W + 2 || r.left < -2) && !clipAncestor(el)) out.push({kind: 'fora-da-tela', where: desc(el)}); }
  // 2) texto cortado sem reticencias (corte seco)
  for (const el of leaves) { const s = getComputedStyle(el); if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none' && s.webkitLineClamp) continue;
    if (/(hidden|clip)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 2) out.push({kind: 'texto-cortado', where: desc(el)});
    else if (/(hidden|clip)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 3 && el.clientHeight > 0) out.push({kind: 'texto-cortado', where: desc(el)}); }
  // texto encurtado com reticencias em titulo curto demais (cabe muito pouco)
  for (const el of leaves) { const s = getComputedStyle(el); if ((s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none')) && el.scrollWidth > el.clientWidth + 2 && el.clientWidth < 70 && (el.textContent || '').trim().length > 6) out.push({kind: 'texto-espremido', where: desc(el)}); }
  // 3) textos encavalados
  const boxes = leaves.slice(0, 500).map(el => ({el, r: clipRect(el), L: layer(el)})).filter(b => b.r.width > 2 && b.r.height > 2);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (ix > 4 && iy > 4 && ix * iy > 30) { if (a.L !== b.L) continue; const ta = getComputedStyle(a.el).color, tb = getComputedStyle(b.el).color; if (/, 0\)$/.test(ta) || /, 0\)$/.test(tb)) continue;
      const cx = Math.max(a.r.left, b.r.left) + ix / 2, cy = Math.max(a.r.top, b.r.top) + iy / 2; if (!(onTop(a.el, cx, cy) || onTop(b.el, cx, cy))) continue; // os dois por baixo de outra coisa
      // um balao/painel com fundo proprio tampando o outro de proposito nao e encavalar
      const top = onTop(a.el, cx, cy) ? a.el : b.el, other = top === a.el ? b.el : a.el; let covers = false;
      for (let x = top.parentElement; x && !x.contains(other); x = x.parentElement) { const bg = getComputedStyle(x).backgroundColor, m = bg.match(/[\d.]+/g); if (m && (m.length < 4 || +m[3] > 0.85)) { covers = true; break; } }
      if (covers) continue;
      out.push({kind: 'texto-sobreposto', where: desc(a.el) + ' x ' + desc(b.el)}); } }
  // 4) botao pequeno demais
  const touch = matchMedia('(pointer: coarse)').matches, min = touch ? 32 : 20;
  for (const el of all.filter(e => (e.getAttribute('role') === 'button' || e.tagName === 'BUTTON' || e.getAttribute('role') === 'checkbox' || e.getAttribute('role') === 'link') && vis(e))) { const r = el.getBoundingClientRect(); if ((r.width < min || r.height < min) && !(el.innerText || '').trim().length > 12) out.push({kind: 'botao-pequeno', where: desc(el) + ' (min ' + min + ')'}); }
  // 5) janelas: tamanho, centro, conteudo
  const overlays = all.filter(el => { if (!vis(el)) return false; const s = getComputedStyle(el), r = el.getBoundingClientRect(); const role = el.getAttribute('role'); return role === 'dialog' || el.getAttribute('aria-modal') === 'true' || role === 'menu' || ((s.position === 'fixed' || s.position === 'absolute') && +s.zIndex >= 10 && r.width * r.height > W * H * 0.08 && r.width < W - 2 && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && !/rgba\(0, 0, 0, 0\.[0-9]/.test(s.backgroundColor)); });
  for (const ov of overlays) { const r = ov.getBoundingClientRect(); if (r.width >= W * 0.97 && r.height >= H * 0.97 && !touch) continue; // fundo da janela (camada da tela toda), nao a janela
    if (r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1) out.push({kind: 'janela-fora-da-tela', where: desc(ov)});
    const content = Array.from(ov.querySelectorAll('*')).filter(e => vis(e) && ((e.childElementCount === 0 && (e.textContent || '').trim()) || /^(INPUT|TEXTAREA|IMG|SVG|BUTTON|VIDEO|IFRAME|CANVAS)$/i.test(e.tagName)));
    if (content.length) { let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9; for (const e of content) { const b = e.getBoundingClientRect(); x1 = Math.min(x1, b.left); y1 = Math.min(y1, b.top); x2 = Math.max(x2, b.right); y2 = Math.max(y2, b.bottom); }
      const used = Math.max(0, x2 - x1) * Math.max(0, y2 - y1) / (r.width * r.height);
      if (used < 0.42 && r.width > 360 && r.height > 200) out.push({kind: 'janela-grande-demais', where: desc(ov) + ' usa ' + Math.round(used * 100) + '% da area'}); }
    const side = r.left < 4 || r.right > W - 4; const role = ov.getAttribute('role');
    if (!side && role !== 'menu' && r.width > 300 && Math.abs((r.left + r.right) / 2 - W / 2) > 40 && r.width < W * 0.9) out.push({kind: 'janela-fora-do-centro', where: desc(ov) + ' centro ' + Math.round((r.left + r.right) / 2) + ' (tela ' + Math.round(W / 2) + ')'});
    if (!touch && r.width > W * 0.85 && r.height > H * 0.85 && content.length < 25 && role !== 'menu') out.push({kind: 'janela-ocupa-a-tela-toda', where: desc(ov) + ' com pouco conteudo (' + content.length + ' partes)'}); }
  // 6) desalinhamento de 1-5 px numa mesma coluna
  for (const p of all.filter(e => e.childElementCount >= 3 && vis(e))) { const kids = Array.from(p.children).filter(vis); if (kids.length < 3) continue; const rs = kids.map(k => k.getBoundingClientRect());
    const vertical = rs.every((r, i) => i === 0 || r.top >= rs[i - 1].bottom - 2); if (!vertical) continue;
    const startOf = k => { const leaf = Array.from(k.querySelectorAll('*')).concat([k]).filter(e => vis(e) && ((e.childElementCount === 0 && (e.textContent || '').trim()) || /^(svg|img|input)$/i.test(e.tagName))); return leaf.length ? Math.min(...leaf.map(e => e.getBoundingClientRect().left)) : k.getBoundingClientRect().left; };
    const starts = kids.map(startOf); rs.forEach((r, i) => { r.__s = starts[i]; });
    const ls = starts.map(v => Math.round(v)), mode = ls.sort((a, b) => ls.filter(v => v === b).length - ls.filter(v => v === a).length)[0];
    const off = kids.filter((k, i) => { const d = Math.abs(Math.round(starts[i]) - mode); return d >= 1 && d <= 5 && Math.abs(rs[i].width - rs[0].width) < 40; });
    for (const k of off.slice(0, 2)) out.push({kind: 'desalinhado', where: desc(k) + ' (coluna em x=' + mode + ')'}); }
  // 7) contraste fraco
  const lum = c => { const m = c.match(/\d+(\.\d+)?/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(v => { v = +v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const bgOf = el => { for (let x = el; x; x = x.parentElement) { const b = getComputedStyle(x).backgroundColor; const m = b.match(/[\d.]+/g); if (m && (m.length < 4 || +m[3] > 0.9)) return b; } return getComputedStyle(document.body).backgroundColor; };
  for (const el of leaves.slice(0, 600)) { const s = getComputedStyle(el); if (parseFloat(s.fontSize) < 10) continue; const a = lum(s.color), b = lum(bgOf(el)); if (a == null || b == null) continue; const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const alpha = (s.color.match(/[\d.]+/g) || [])[3]; if (alpha !== undefined && +alpha < 0.5) continue; if (ratio < 2.6) out.push({kind: 'contraste-fraco', where: desc(el) + ' ' + ratio.toFixed(1) + ':1'}); }
  // 8) imagem quebrada; 9) variedade de fontes e cores
  for (const img of all.filter(e => e.tagName === 'IMG' && vis(e))) if (img.complete && img.naturalWidth === 0) out.push({kind: 'imagem-quebrada', where: desc(img)});
  const sizes = new Set(leaves.map(el => getComputedStyle(el).fontSize)), fams = new Set(leaves.map(el => getComputedStyle(el).fontFamily.split(',')[0]));
  if (sizes.size > 13) out.push({kind: 'muitos-tamanhos-de-fonte', where: sizes.size + ' tamanhos: ' + [...sizes].sort((a, b) => parseFloat(a) - parseFloat(b)).join(' ')});
  if (fams.size > 3) out.push({kind: 'muitas-fontes', where: [...fams].join(', ')});
  return out;
  /* eslint-enable */
}

(async () => {
  const browser = await chromium.launch();
  for (const sc of SCREENS) {
    const ctx = await browser.newContext({viewport: {width: sc.w, height: sc.h}, deviceScaleFactor: sc.d || 2, isMobile: !!sc.mobile, hasTouch: !!sc.mobile, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR'});
    const page = await ctx.newPage(); page.setDefaultTimeout(5000); let route = '';
    page.on('pageerror', e => add({screen: sc.id, route, kind: 'erro-na-pagina', where: String(e.message).slice(0, 160)}));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|expo\.dev|Filtro Privado|Failed to load resource/.test(m.text())) add({screen: sc.id, route, kind: 'erro-no-console', where: m.text().slice(0, 160)}); });
    page.on('response', r => { const u = r.url(); if (u.includes('/api/') && r.status() >= 400 && r.status() !== 401) add({screen: sc.id, route, kind: 'pedido-recusado', where: r.status() + ' ' + r.request().method() + ' ' + u.replace(base, '').slice(0, 90)}); });
    await page.goto(base + '/inicio'); await page.waitForTimeout(1500);
    if (await page.getByPlaceholder('Seu e-mail cadastrado').count()) { await page.getByPlaceholder('Seu e-mail cadastrado').fill(email); await page.getByPlaceholder('Senha da sua conta').fill(password); await page.getByText('Entrar', {exact: true}).last().click(); await page.waitForTimeout(3500); }
    const snap = async (name) => { const f = String(++shots).padStart(3, '0') + '-' + sc.id + '-' + name.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60) + '.png'; await page.screenshot({path: path.join(outDir, 'prints', f)}).catch(() => {}); return f; };
    const measure = async (label, scope) => { const list = await page.evaluate(audit, scope || null).catch(e => [{kind: 'robo', where: String(e.message).slice(0, 120)}]); const shot = await snap(route + '-' + label); for (const f of list) add({screen: sc.id, route, state: label, shot, ...f}); return shot; };
    for (const r of ROUTES) {
      route = r; await page.goto(base + r); await page.waitForTimeout(2200);
      await page.evaluate(() => { window.__ls = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__ls += e.value; }).observe({type: 'layout-shift', buffered: false}); } catch (e) {} });
      await page.waitForTimeout(1500); const ls = await page.evaluate(() => window.__ls || 0); if (ls > 0.02) add({screen: sc.id, route, kind: 'tela-pulando', where: 'soma ' + ls.toFixed(3) + ' depois de aberta'});
      await measure('tela');
      // tudo o que abre algo: botoes com nome, dentro do conteudo (nao o menu lateral), sem acoes perigosas
      const cands = await page.evaluate(({DANGER, SKIP}) => { const dz = new RegExp(DANGER, 'i'), sk = new RegExp(SKIP, 'i'); const W = innerWidth;
        return Array.from(document.querySelectorAll('[role=button],button,[role=tab],[role=link]')).map((el, i) => { const r = el.getBoundingClientRect(); const name = (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50); return {i, name, x: r.left + r.width / 2, y: r.top + r.height / 2, ok: r.width > 4 && r.height > 4 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= W && !!name && !dz.test(name) && !sk.test(name) && !(W > 900 && r.left < 250)}; }).filter(c => c.ok);
      }, {DANGER: DANGER.source, SKIP: SKIP.source});
      const seen = new Set(); let n = 0;
      // 07/11/2026: a posicao de cada botao e procurada DE NOVO antes de cada clique (com a tela mudando, a posicao antiga
      // caia num item da lista e o print saia com o nome de outro botao)
      const findNow = async (name) => (await page.evaluate(({DANGER, SKIP, name}) => { const W = innerWidth; for (const el of document.querySelectorAll('[role=button],button,[role=tab],[role=link]')) { const r = el.getBoundingClientRect(); const nm = (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50); if (nm === name && r.width > 4 && r.height > 4 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= W) return {x: r.left + r.width / 2, y: r.top + r.height / 2}; } return null; }, {DANGER: DANGER.source, SKIP: SKIP.source, name}));
      for (const c0 of cands) { if (n >= Number(opt.max || 18)) break; const key = c0.name.toLowerCase().replace(/\d+/g, '#'); if (seen.has(key)) continue; seen.add(key);
        const pos = await findNow(c0.name); if (!pos) continue; const c = {...c0, ...pos}; n++;
        const before = page.url();
        await page.evaluate(() => { window.__before = new Set(Array.from(document.querySelectorAll('*'))); });
        try { await page.mouse.click(c.x, c.y); } catch { continue; } await page.waitForTimeout(700);
        if (page.url() !== before) { await measure('abriu ' + c.name); await page.goto(before); await page.waitForTimeout(1500); continue; }
        const opened = await page.evaluate(() => { const W = innerWidth, H = innerHeight; const fresh = Array.from(document.querySelectorAll('*')).filter(e => !window.__before.has(e)); const big = fresh.filter(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width * r.height > 20000 && (s.position === 'fixed' || s.position === 'absolute' || e.getAttribute('role') === 'dialog' || e.getAttribute('role') === 'menu'); }); return big.length ? big.length : 0; });
        if (!opened) continue;
        await measure('janela ' + c.name);
        // fecha com Esc; senao clicando fora; senao avisa
        await page.keyboard.press('Escape'); await page.waitForTimeout(450);
        let still = await page.evaluate(() => Array.from(document.querySelectorAll('[role=dialog],[aria-modal=true],[role=menu],[data-testid=context-menu]')).some(e => e.getBoundingClientRect().width > 0));
        if (still) { await page.mouse.click(8, sc.h - 8); await page.waitForTimeout(450); still = await page.evaluate(() => Array.from(document.querySelectorAll('[role=dialog],[aria-modal=true],[role=menu],[data-testid=context-menu]')).some(e => e.getBoundingClientRect().width > 0)); if (still) { add({screen: sc.id, route, kind: 'janela-nao-fecha', where: '"' + c.name + '" nao fecha com Esc nem clicando fora'}); await page.goto(base + r); await page.waitForTimeout(1500); } }
      }
      console.log(sc.id + ' ' + r + ': ' + findings.filter(f => f.screen === sc.id && f.route === r).length + ' achado(s)');
    }
    await ctx.close();
  }
  await browser.close();
  const byKind = {}; for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  fs.writeFileSync(path.join(outDir, 'achados.json'), JSON.stringify(findings, null, 1));
  const md = ['# Robo do site — ' + new Date().toISOString(), '', '| Tipo | Quantos |', '|---|---|', ...Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => '| ' + k + ' | ' + v + ' |'), '', ...findings.map(f => '- **' + f.kind + '** [' + f.screen + ' ' + f.route + (f.state ? ' · ' + f.state : '') + '] ' + f.where + (f.shot ? ' — ' + f.shot : ''))];
  fs.writeFileSync(path.join(outDir, 'relatorio.md'), md.join('\n'));
  console.log('\nTotal: ' + findings.length + ' achado(s) ' + JSON.stringify(byKind) + '\nRelatorio: ' + path.join(outDir, 'relatorio.md'));
})().catch(e => { console.error('robo quebrou:', e); process.exitCode = 1; });
