#!/usr/bin/env node
'use strict';
/*
 * Portao de qualidade antes de publicar (07/11/2026, Pedro: "toda vez que a gente avanca um passo a gente regride 10;
 * cria uma forma profissional"). Regra no MASTER (secao 8): nenhuma publicacao em sofia-app-android sem este verificador
 * verde. Ele sobe um servidor LOCAL de teste com dados de exemplo (nunca toca o site no ar) e confere, como uma pessoa veria:
 *   1. o Inicio nos tres tamanhos de tela reais do Pedro: saudacao, linha do tempo e blocos VISIVEIS em ate 6 s, nada pulando
 *      depois de aberto, nenhum erro na pagina;
 *   2. login e "Esqueceu a senha?" respondendo;
 *   3. a varredura de coerencia (tools/ux-sweep.cjs) nas telas principais.
 *   4. o Drive no laboratorio (tools/drive-lab: Google Drive fiel, sondas do servidor e robo na tela).
 *   5. as Paginas no laboratorio: robo do Quadro (30 verificacoes), versoes das paginas e pagina trancada (08/11/2026),
 *      colar com links/grifo e o movimento do Quadro (08/11/2026).
 * Uso (na pasta SOFIA_APP, depois de npm run build:web):  node tools/release-check.cjs [--sem-varredura] [--sem-drive]
 */
const path = require('node:path'), fs = require('node:fs'), os = require('node:os'), {spawn, spawnSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '..', '..'), APP = path.resolve(__dirname, '..');
const PORT = 4700 + Math.floor(Math.random() * 200), BASE = 'http://127.0.0.1:' + PORT;
const EMAIL = 'portao@sofia.local', PASS = 'senha-portao-123456';
const SCREENS = [{nome: 'notebook 1366x768', w: 1366, h: 768, d: 1}, {nome: 'tela do Pedro 1762x832 (zoom 109%)', w: 1762, h: 832, d: 1.09}, {nome: 'monitor 4K 2349x1163', w: 2349, h: 1163, d: 1.635}];
const fails = [], ok = [];
const fail = (m) => { fails.push(m); console.log('  ✗ ' + m); }, pass = (m) => { ok.push(m); console.log('  ✓ ' + m); };

async function main() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'sofia-portao-'));
  const server = spawn(process.execPath, ['src/server.js'], {cwd: ROOT, env: {...process.env, PORT: String(PORT), SOFIA_DATA_DIR: path.join(data, 'data'), SOFIA_BACKUP_DIR: path.join(data, 'bk'), SOFIA_LOGIN_EMAIL: EMAIL, SOFIA_LOGIN_PASSWORD: PASS, RAILWAY_ENVIRONMENT: ''}, stdio: ['ignore', 'pipe', 'pipe']});
  let log = ''; server.stdout.on('data', d => log += d); server.stderr.on('data', d => log += d);
  try {
    for (let i = 0; i < 60 && !/online em/.test(log); i++) await new Promise(r => setTimeout(r, 250));
    if (!/online em/.test(log)) throw new Error('servidor de teste nao subiu: ' + log.slice(-400));
    console.log('Servidor de teste em ' + BASE);
    // dados de exemplo parecidos com o uso real
    const login = await (await fetch(BASE + '/api/mobile/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: EMAIL, password: PASS, device_name: 'portao'})})).json();
    const H = {Authorization: 'Bearer ' + login.token, 'Content-Type': 'application/json'};
    const day = new Date(); const iso = (h, m = 0, add = 0) => { const d = new Date(day); d.setDate(d.getDate() + add); d.setHours(h, m, 0, 0); return d.toISOString(); };
    for (const [t, h] of [['Reunião de equipe', 10], ['Dentista', 15], ['Jantar', 20]]) await fetch(BASE + '/api/mobile/workspace/entities', {method: 'POST', headers: H, body: JSON.stringify({kind: 'commitment', title: t, area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {start_at: iso(h)}})});
    for (let i = 1; i <= 6; i++) await fetch(BASE + '/api/mobile/workspace/entities', {method: 'POST', headers: H, body: JSON.stringify({kind: 'commitment', title: 'Evento ' + i, area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {start_at: iso(9 + i, 0, 1)}})});
    for (const [t, h] of [['Pagar conta', 9], ['Ligar para cliente', 14], ['Revisar proposta', 17]]) await fetch(BASE + '/api/mobile/tasks', {method: 'POST', headers: H, body: JSON.stringify({title: t, due_at: iso(h), priority: 'high'})});
    for (const t of ['Viagem', 'Estudos', 'Casa', 'Trabalho', 'Receitas', 'Leituras', 'Ideias', 'Saúde']) await fetch(BASE + '/api/mobile/workspace/entities', {method: 'POST', headers: H, body: JSON.stringify({kind: 'user_page', title: t, content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {}})});

    console.log('\n1) Paginas publicas');
    for (const p of ['/login', '/forgot-password', '/health']) { const r = await fetch(BASE + p); r.status === 200 ? pass(p + ' responde') : fail(p + ' respondeu ' + r.status); }

    console.log('\n2) Inicio nas telas reais');
    const {chromium} = require('playwright');
    const browser = await chromium.launch();
    for (const s of SCREENS) {
      const ctx = await browser.newContext({viewport: {width: s.w, height: s.h}, deviceScaleFactor: s.d, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR'});
      const page = await ctx.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 160)));
      page.on('console', m => { if (m.type() === 'error' && !/favicon|net::ERR|expo\.dev|Filtro Privado/.test(m.text())) errors.push(m.text().slice(0, 160)); });
      await page.goto(BASE + '/inicio'); await page.waitForTimeout(1500);
      if (await page.getByPlaceholder('Seu e-mail cadastrado').count()) { await page.getByPlaceholder('Seu e-mail cadastrado').fill(EMAIL); await page.getByPlaceholder('Senha da sua conta').fill(PASS); await page.getByText('Entrar', {exact: true}).last().click(); await page.waitForTimeout(4000); }
      // abertura de verdade (segunda vez, com a copia guardada), medindo pulos
      await page.addInitScript(() => { window.__shift = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shift.push([Math.round(e.startTime), e.value]); }).observe({type: 'layout-shift', buffered: true}); } catch (e) {} });
      const t0 = Date.now(); await page.reload();
      let state = null;
      for (let i = 0; i < 60; i++) {
        state = await page.evaluate(() => { const vis = el => { if (!el) return false; const b = el.getBoundingClientRect(); return b.width > 50 && b.height > 20 && b.top < innerHeight && b.bottom > 0 && getComputedStyle(el).visibility !== 'hidden'; };
          const greet = [...document.querySelectorAll('[role=heading]')].find(e => /^(Bom|Boa)\b/.test(e.textContent || ''));
          const brief = document.querySelector('[data-testid=home-brief]'); const op = el => { let o = 1; for (let x = el; x; x = x.parentElement) o *= +getComputedStyle(x).opacity; return o; };
          return {greet: vis(greet), brief: vis(brief) && op(brief) > 0.9, timeline: !!document.querySelector('[data-testid=timeline-add-area]'), cards: document.querySelectorAll('[data-testid^=home-desk-]').length}; });
        if (state.greet && state.brief && state.timeline) break; await page.waitForTimeout(100);
      }
      const ms = Date.now() - t0;
      if (state.greet && state.brief && state.timeline) pass(s.nome + ': saudacao, linha do tempo e blocos visiveis em ' + ms + ' ms'); else fail(s.nome + ': Inicio incompleto apos 6 s ' + JSON.stringify(state));
      await page.waitForTimeout(2500);
      const late = (await page.evaluate(() => window.__shift || [])).filter(([t]) => t > 1200).reduce((a, [, v]) => a + v, 0);
      late < 0.02 ? pass(s.nome + ': nada pulou depois de aberto') : fail(s.nome + ': pulos depois de aberto (soma ' + late.toFixed(3) + ')');
      errors.length ? fail(s.nome + ': erros na pagina: ' + errors.slice(0, 3).join(' | ')) : pass(s.nome + ': sem erros na pagina');
      await page.screenshot({path: path.join(data, 'inicio-' + s.w + '.png')});
      await ctx.close();
    }
    await browser.close();

    if (!process.argv.includes('--sem-varredura')) {
      console.log('\n3) Varredura de coerencia (telas principais)');
      const r = spawnSync(process.execPath, [path.join(APP, 'tools/ux-sweep.cjs'), BASE, EMAIL, PASS, '--only=/inicio,/agenda,/paginas,/conversa,/perfil'], {encoding: 'utf8', timeout: 30 * 60000});
      const out = (r.stdout || '') + (r.stderr || ''); const n = (out.match(/Total: (\d+) achado/) || [])[1];
      n === '0' ? pass('varredura sem achados') : fail('varredura: ' + (n || '?') + ' achado(s)\n' + out.split('\n').filter(l => l.startsWith('- ')).slice(0, 10).join('\n'));
    }
    const driveOn = /DRIVE_APP = true/.test(fs.readFileSync(path.join(APP, 'src/lib/features.ts'), 'utf8')); // app Drive desligado: nao roda o laboratorio
    if (driveOn && !process.argv.includes('--sem-drive')) {
      console.log('\n4) Drive no laboratorio (Google Drive fiel: sondas do servidor + robo na tela)');
      const r = spawnSync(process.execPath, [path.join(APP, 'tools/drive-lab/run-all.cjs'), path.join(data, 'drive')], {encoding: 'utf8', timeout: 20 * 60000});
      const out = (r.stdout || '') + (r.stderr || '');
      /DRIVE OK/.test(out) ? pass('Drive: sondas e robo sem falhas') : fail('Drive: ' + out.split('\n').filter(l => /^FALHA|✗/.test(l)).slice(0, 10).join('\n'));
    }
    // 08/11/2026 (Pedro: "faz o mesmo metodo pro quadro"): Paginas no laboratorio - quadro inteiro, versoes e pagina trancada
    if (!process.argv.includes('--sem-quadro')) {
      console.log('\n5) Paginas no laboratorio (servidor de verdade: Quadro, versoes, pagina trancada)');
      for (const [file, okRe, label] of [['pagina-quadro.cjs', /QUADRO OK/, 'Quadro'], ['quadro-anexo-word.cjs', /QUADRO-WORD OK/, 'Quadro: anexo Word'], ['paginas-versoes.cjs', /VERSOES OK/, 'Versões das páginas'], ['pagina-trancada-shift-enter.cjs', /PAGINA TRANCADA OK/, 'Página trancada'], ['quadro-selftest-lab.cjs', /QUADRO-TESTE OK/, 'Teste de produção do Quadro (no laboratório)'], ['paginas-colar.cjs', /COLAR OK/, 'Colar com links e grifo (Docs, Word, Notion, texto, Sofia, nota do Quadro)'], ['quadro-movimento.cjs', /QUADRO-MOVIMENTO OK/, 'Movimento do Quadro (deslize, zoom, WASD, alinhar, ligação)']]) {
        const r = spawnSync(process.execPath, [path.join(APP, 'tools/drive-lab', file)], {encoding: 'utf8', timeout: 12 * 60000});
        const out = (r.stdout || '') + (r.stderr || ''), tail = (out.match(/\(\d+ verificacoes\)/) || [''])[0];
        okRe.test(out) ? pass(label + ' sem falhas ' + tail) : fail(label + ': ' + out.split('\n').filter(l => /^FALHA|✗/.test(l)).slice(0, 10).join('\n'));
      }
    }
    console.log('\nPrints do Inicio: ' + data);
  } finally { server.kill(); }
  console.log('\n' + (fails.length ? '✗ PORTAO FECHADO: ' + fails.length + ' problema(s). Nao publicar.' : '✓ PORTAO ABERTO: ' + ok.length + ' verificacoes ok. Pode publicar.'));
  process.exitCode = fails.length ? 1 : 0;
}
main().catch(e => { console.error('✗ PORTAO FECHADO: ' + (e.stack || e)); process.exitCode = 1; });
