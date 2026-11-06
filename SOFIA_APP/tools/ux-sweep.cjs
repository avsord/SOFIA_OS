#!/usr/bin/env node
'use strict';
/*
 * Varredura de coerencia do site (06/11/2026, pedido do Pedro: "voce nao consegue voce mesmo identificar e arrumar?
 * no site todo ainda tem varias incoerencias"). Percorre cada tela do site no computador e testa convencoes que
 * qualquer site bem feito segue, sem depender de alguem apontar item por item:
 *   - erros no console / na pagina;
 *   - coisas que pulam depois de aparecer (layout shift sem o usuario ter feito nada);
 *   - rolagem lateral da pagina inteira (algo mais largo que a janela);
 *   - botoes sem nome (leitor de tela e dica do mouse);
 *   - todo menu, janela ou balao que abre: fecha com Esc? fecha clicando fora?
 * Roda contra um servidor de TESTE (dados descartaveis): clica em botoes. Nunca aponte para o site de producao.
 *
 * Uso: node tools/ux-sweep.cjs http://127.0.0.1:4556 email senha [--only=/inicio,/agenda] [--json=saida.json]
 */
const {chromium} = require('playwright');
const [base, email, password] = process.argv.slice(2);
const opt = Object.fromEntries(process.argv.slice(5).filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
if (!base || !email || !password) { console.error('uso: node tools/ux-sweep.cjs <url-de-teste> <email> <senha>'); process.exit(2); }
if (/railway\.app|sofiaos\./.test(base) && !opt.force) { console.error('recusado: a varredura clica em botoes; use um servidor de teste'); process.exit(2); }

const ROUTES = ['/inicio', '/conversa', '/paginas', '/agenda', '/avisos', '/perfil', '/apps',
  '/apps/tarefas', '/apps/financas', '/apps/price-tracker', '/apps/emails', '/apps/rotina', '/apps/lembretes',
  '/apps/encomendas', '/apps/listas', '/apps/biblioteca', '/apps/notas'];
// nunca clicar: acoes que apagam, saem, enviam ou mudam dados de verdade
const DANGER = /apagar|excluir|remover|limpar|sair|desconectar|encerrar|enviar|salvar|concluir|tomei|pagar|paguei|recebi|arquivar|descartar|confirmar|trancar|redefinir|desfazer|marcar tudo|ler todas|restaurar|importar|conectar|instalar|atualizar o app|adiar|criar|lançar|gravar|novo|nova|adicionar|duplicar|mover|copiar|compartilhar|publicar|exportar|baixar|abrir no|ir para|ver todas|continuar|tentar/i;
// candidatos a abrir menus/janelas/baloes
const OPENER = /mais|menu|op(ç|c)(õ|o)es|⋯|…|filtr|ordenar|notifica|perfil|conta|buscar|escolher|selecionar|tema|cor|ícone|icone|capa|visualiza|configura|engrenagem|ajustes|tipo|prioridade|data|hora|tag|etiqueta|pasta|área|area/i;

const findings = [];
const SEEN = new Set();
const add = (route, kind, detail) => { findings.push({route, kind, detail}); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({viewport: {width: 1762, height: 832}, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR'});
  const page = await ctx.newPage();
  let route = '';
  page.on('console', m => { if (m.type() === 'error' && !/favicon|cdp\.expo\.dev|ERR_CONNECTION|net::ERR/.test(m.text())) add(route, 'erro-console', m.text().slice(0, 200)); });
  page.on('pageerror', e => add(route, 'erro-pagina', String(e.message || e).slice(0, 200)));

  // login pelo formulario, como uma pessoa
  await page.goto(base + '/inicio'); await page.waitForTimeout(2500);
  if (await page.getByPlaceholder('Seu e-mail cadastrado').count()) {
    await page.getByPlaceholder('Seu e-mail cadastrado').fill(email); await page.getByPlaceholder('Senha da sua conta').fill(password);
    await page.getByText('Entrar', {exact: true}).last().click(); await page.waitForTimeout(5000);
  }
  await page.addInitScript(() => {
    window.__shifts = [];
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput && e.value > 0.002) window.__shifts.push({t: Math.round(e.startTime), v: e.value, src: (e.sources || []).slice(0, 2).map(s => { const n = s.node && (s.node.nodeType === 1 ? s.node : s.node.parentElement); let id = ''; for (let x = n, i = 0; x && i < 6; x = x.parentElement, i++) { const t = x.getAttribute && x.getAttribute('data-testid'); if (t) { id = t; break; } } return (id || (n && n.tagName) || '?') + ' ' + Math.round(s.previousRect.y) + '→' + Math.round(s.currentRect.y) + 'px'; })}); }).observe({type: 'layout-shift', buffered: true}); } catch (e) {}
  });

  const only = opt.only ? opt.only.split(',') : null;
  for (const r of ROUTES) {
    if (only && !only.includes(r)) continue;
    route = r;
    await page.goto(base + r); await page.waitForTimeout(3500);
    if (!/\/(inicio|conversa|paginas|agenda|avisos|perfil|apps)/.test(new URL(page.url()).pathname)) { add(r, 'rota', 'abriu ' + page.url()); continue; }
    // 1) saltos: depois de 1,2 s nada deveria pular sozinho (o 1o segundo e a abertura)
    const shifts = await page.evaluate(() => window.__shifts || []);
    for (const s of shifts.filter(x => x.t > 1200)) add(r, 'pulo', `${Math.round(s.v * 1000) / 1000} aos ${s.t} ms: ${s.src.join('; ')}`);
    // 2) rolagem lateral da pagina
    const wide = await page.evaluate(() => { const d = document.scrollingElement; if (d.scrollWidth <= innerWidth + 1) return null; const out = [...document.querySelectorAll('body *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.right > innerWidth + 2 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 3).map(e => (e.getAttribute('data-testid') || e.tagName) + ' ate ' + Math.round(e.getBoundingClientRect().right) + 'px'); return d.scrollWidth + 'px > ' + innerWidth + 'px: ' + out.join(', '); });
    if (wide) add(r, 'rolagem-lateral', wide);
    // 3) botoes sem nome
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('[role=button],button')].filter(e => { const b = e.getBoundingClientRect(); if (!b.width || !b.height || getComputedStyle(e).visibility === 'hidden') return false; const name = (e.getAttribute('aria-label') || e.textContent || e.getAttribute('title') || '').trim(); return !name; }).slice(0, 8).map(e => { const b = e.getBoundingClientRect(); let id = ''; for (let x = e, i = 0; x && i < 5; x = x.parentElement, i++) { const t = x.getAttribute('data-testid'); if (t) { id = t; break; } } return (id || '?') + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) + '@' + Math.round(b.x) + ',' + Math.round(b.y); }));
    for (const u of unnamed) add(r, 'botao-sem-nome', u);
    // 4) menus/janelas/baloes: Esc e clique fora
    await page.evaluate(seen => { window.__seen = new Set(seen); }, [...SEEN]);
    const openers = await page.evaluate(OPENER_SRC => { const re = new RegExp(OPENER_SRC, 'i'); return [...document.querySelectorAll('[role=button],button,[aria-haspopup],[aria-expanded]')].filter(e => { const b = e.getBoundingClientRect(); if (!b.width || !b.height || b.bottom < 0 || b.top > innerHeight) return false; const name = (e.getAttribute('aria-label') || e.textContent || '').trim(); return !!name && name.length < 80; }).filter((e, i, all) => { const k = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\d+([:,.]\d+)*/g, '#').split(' ').slice(0, 2).join(' '); window.__seen = window.__seen || new Set(); if (window.__seen.has(k)) return false; window.__seen.add(k); return true; }).slice(0, 45).map(e => { const b = e.getBoundingClientRect(); return {name: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 50), x: b.x + b.width / 2, y: b.y + b.height / 2}; }); }, OPENER.source);
    for (const o of openers) SEEN.add(o.name.replace(/\d+([:,.]\d+)*/g, '#').split(' ').slice(0, 2).join(' '));
    for (const o of openers) {
      if (!o.name || DANGER.test(o.name)) continue;
      const result = await probeOverlay(page, base + r, o);
      if (opt.v) console.log('  ' + r + ' | ' + o.name + ' -> ' + (result ? result.kind : (probeOverlay.last || 'ok')));
      if (result) add(r, result.kind, `"${o.name}": ${result.detail}`);
    }
  }
  await browser.close();
  // relatorio
  const byKind = {};
  for (const f of findings) (byKind[f.kind] = byKind[f.kind] || []).push(f);
  for (const [k, list] of Object.entries(byKind)) { console.log(`\n## ${k} (${list.length})`); for (const f of list) console.log(`- ${f.route}: ${f.detail}`); }
  console.log(`\nTotal: ${findings.length} achado(s) em ${only ? only.length : ROUTES.length} tela(s).`);
  if (opt.json) require('fs').writeFileSync(opt.json, JSON.stringify(findings, null, 1));
  process.exitCode = findings.length ? 1 : 0;
})();

/** Elementos "por cima" visiveis (janelas, menus, baloes): fixos ou com z-index alto e tamanho de gente. */
async function overlays(page) {
  return page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; if (!(cs.position === 'fixed' || cs.position === 'absolute')) return false; const b = e.getBoundingClientRect(); return b.width >= 60 && b.height >= 40 && b.bottom > 0 && b.top < innerHeight; }).map(e => { const b = e.getBoundingClientRect(); return Math.round(b.x) + ',' + Math.round(b.y) + ',' + Math.round(b.width) + 'x' + Math.round(b.height); }));
}

/** Das pecas novas, fica com as que nao ocupam a tela inteira (o fundo escurecido acompanha a janela). */
function pick(list) { const full = k => { const [x, y, wh] = k.split(','); const [w, h] = wh.split('x'); return +w >= 1700 && +h >= 800; }; const part = list.filter(k => !full(k)); return part.length ? part : list; }
async function probeOverlay(page, url, o) {
  const before = new Set(await overlays(page));
  const urlBefore = page.url();
  await page.mouse.click(o.x, o.y); await page.waitForTimeout(500);
  if (page.url() !== urlBefore) { probeOverlay.last = 'navegou'; await page.goto(url); await page.waitForTimeout(2500); return null; } // era navegacao
  const opened = pick((await overlays(page)).filter(k => !before.has(k)));
  if (!opened.length) { probeOverlay.last = 'nada abriu'; await page.keyboard.press('Escape'); await page.waitForTimeout(200); return null; }
  probeOverlay.last = 'abriu ' + opened[0] + ', fecha certo';
  // Esc fecha?
  await page.keyboard.press('Escape'); await page.waitForTimeout(450);
  const afterEsc = (await overlays(page)).filter(k => opened.includes(k));
  let problem = null;
  if (afterEsc.length) problem = {kind: 'nao-fecha-com-esc', detail: 'abre ' + opened[0] + ' e continua aberto apos Esc'};
  // reabre e clica fora (num ponto neutro, longe do que abriu)
  await page.goto(url); await page.waitForTimeout(2500);
  const before2 = new Set(await overlays(page));
  await page.mouse.click(o.x, o.y); await page.waitForTimeout(500);
  const opened2 = pick((await overlays(page)).filter(k => !before2.has(k)));
  if (opened2.length) {
    const spot = await page.evaluate(boxes => { const rects = boxes.map(k => { const [x, y, wh] = k.split(','); const [w, h] = wh.split('x'); return {x: +x, y: +y, w: +w, h: +h}; }); const inside = (px, py) => rects.some(r => px >= r.x - 8 && px <= r.x + r.w + 8 && py >= r.y - 8 && py <= r.y + r.h + 8); for (let y = innerHeight - 30; y > 60; y -= 37) for (let x = innerWidth - 30; x > 300; x -= 53) { if (inside(x, y)) continue; const el = document.elementFromPoint(x, y); if (!el || el.closest('button,[role=button],a,input,textarea,[contenteditable=true],[role=link],[tabindex]')) continue; return {x, y}; } return null; }, opened2);
    if (spot) {
      await page.mouse.click(spot.x, spot.y); await page.waitForTimeout(450);
      const stay = (await overlays(page)).filter(k => opened2.includes(k));
      if (stay.length) problem = problem ? {kind: 'nao-fecha-esc-nem-fora', detail: problem.detail + '; e tambem nao fecha clicando fora'} : {kind: 'nao-fecha-clicando-fora', detail: 'abre ' + opened2[0] + ' e continua aberto apos clicar fora'};
    }
  }
  await page.goto(url); await page.waitForTimeout(2500);
  return problem;
}
