'use strict';
// Native client API. No Meta dependency, no WebView, no alternate AI brain.
const crypto = require('node:crypto');
const { AppError, validId, cleanText, cleanMessage } = require('../core/util');
const { VERSION } = require('../config/sofia');
const { makeApi45 } = require('../core/api45');
const { GoogleService } = require('../services/google');
const OWNER = 'owner-local';
// Product UI has no text-character or audio-duration ceiling. The transport
// keeps only byte-level safety budgets so one request cannot exhaust server memory.
const MAX_AUDIO = 64 * 1024 * 1024, MAX_MESSAGE_BODY = 8 * 1024 * 1024;
const fail = (code, message, status = 400) => { throw new AppError(code, message, status); };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function checkMobileOrigin(req, config) {
  let host; try { host = new URL('http://' + req.headers.host).host; } catch { fail('HOST_INVALID', 'Host inválido.', 403); }
  const allowed = new URL(config.publicBaseUrl || 'https://sofiaos.up.railway.app');
  const loopback = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const railway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
  if (host !== allowed.host && !(loopback && !railway)) fail('HOST_INVALID', 'Endereço não autorizado.', 403);
  const origin = req.headers.origin;
  if (origin && origin !== allowed.origin && !(loopback && !railway && origin === 'http://' + host)) fail('ORIGIN_INVALID', 'Origem não autorizada.', 403);
  if (req.headers['sec-fetch-site'] === 'cross-site') fail('ORIGIN_INVALID', 'Origem não autorizada.', 403);
}
function makeMobileApi(runtime, deps) {
  const { store, config, core, routing, workspace, audioService } = runtime;
  // 0.3.268: o Quadro da conversa ficava sempre vazio porque runtime.provider so existe nos testes; em producao a IA
  // e chamada pelo roteamento (mesma chave/rota da interpretacao da Sofia).
  const boardProvider = runtime.provider || {structured: req => runtime.routing.respondStructured('private', req).then(r => r && r.data !== undefined ? r.data : r)};
  const board = require('../services/conversation-board').createConversationBoard({store, provider: boardProvider});
  const { bodyJson, json, ownerAuth, mobileSessions, tooManyFailures, registerFailure, clearFailures } = deps;
  // 0.3.258: segundo passo no login do SITE. O navegador (pedido com Origin) que nao tem a marca de confianca recebe
  // um codigo de 6 digitos no e-mail cadastrado; depois de acertar, ganha uma marca de 90 dias e nao pede mais.
  // O app do celular (sem Origin) continua so com e-mail e senha. Sem envio de e-mail configurado, nao trava ninguem.
  const crypto = require('node:crypto');
  const store2fa = runtime.store.db;
  try { store2fa.exec('CREATE TABLE IF NOT EXISTS web_login_trust(hash TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS web_login_codes(id TEXT PRIMARY KEY, code_hash TEXT NOT NULL, tries INTEGER NOT NULL, expires_at TEXT NOT NULL);'); } catch { /* banco de teste */ }
  const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
  const trusted = token => { if (!token) return false; const r = store2fa.prepare('SELECT expires_at FROM web_login_trust WHERE hash=?').get(sha(token)); return !!r && Date.parse(r.expires_at) > Date.now(); };
  const issueTrust = () => { const t = crypto.randomBytes(32).toString('base64url'); store2fa.prepare('DELETE FROM web_login_trust WHERE expires_at<?').run(new Date().toISOString()); store2fa.prepare('INSERT INTO web_login_trust VALUES(?,?,?)').run(sha(t), new Date().toISOString(), new Date(Date.now() + 90 * 864e5).toISOString()); return t; };
  async function webSecondStep(req, b) {
    const mailer = deps.accountMailer;
    if (!req.headers.origin || !mailer || !mailer.configured() || runtime.config.webSecondStep === false) return {ok: true, trust: ''};
    if (trusted(String(b.trust || ''))) return {ok: true, trust: ''};
    const challenge = String(b.challenge || ''), code = String(b.code || '').replace(/\D/g, '');
    if (challenge && code) {
      const row = store2fa.prepare('SELECT * FROM web_login_codes WHERE id=?').get(challenge);
      if (!row || Date.parse(row.expires_at) < Date.now()) { store2fa.prepare('DELETE FROM web_login_codes WHERE id=?').run(challenge); fail('LOGIN_CODE_EXPIRED', 'O código expirou. Entre de novo para receber outro.', 401); }
      if (row.tries >= 5) { store2fa.prepare('DELETE FROM web_login_codes WHERE id=?').run(challenge); fail('LOGIN_CODE_LOCKED', 'Muitas tentativas com esse código. Entre de novo para receber outro.', 401); }
      if (row.code_hash !== sha(challenge + ':' + code)) { store2fa.prepare('UPDATE web_login_codes SET tries=tries+1 WHERE id=?').run(challenge); registerFailure(req); fail('LOGIN_CODE_INVALID', 'Código incorreto. Confira o e-mail e tente de novo.', 401); }
      store2fa.prepare('DELETE FROM web_login_codes WHERE id=?').run(challenge);
      return {ok: true, trust: issueTrust()};
    }
    const id = crypto.randomBytes(18).toString('base64url'), fresh = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    store2fa.prepare('DELETE FROM web_login_codes WHERE expires_at<?').run(new Date().toISOString());
    store2fa.prepare('INSERT INTO web_login_codes VALUES(?,?,0,?)').run(id, sha(id + ':' + fresh), new Date(Date.now() + 10 * 60000).toISOString());
    // Se o e-mail falhar, nao tranca o dono fora do site: entra como antes (so senha) e fica registrado.
    try { await mailer.sendLoginCode({to: ownerAuth.registeredEmail(), code: fresh}); } catch (e) { console.warn('[login] codigo do segundo passo nao enviado:', String(e.message || e).slice(0, 160)); store2fa.prepare('DELETE FROM web_login_codes WHERE id=?').run(id); return {ok: true, trust: ''}; }
    const to = String(ownerAuth.registeredEmail() || ''), masked = to.replace(/^(.)[^@]*(@.*)$/, '$1•••$2');
    return {ok: false, need: {challenge: id, sent_to: masked}};
  }
  const extra = makeApi45(runtime, { bodyJson, json });
  const chatSync = require('../services/chat-sync').makeChatSyncApi(store, { bodyJson, json, client: 'mobile' });
  const inAudio = new Set(), rateBuckets = new Map();
  const mercadoLivre = require('../services/mercado-livre').makeMercadoLivreReader({workspace, stores: runtime.stores, ...runtime.mercadoLivreOptions});

  // Shared SQLite storage for mobile capsule marks. No per-device dose history.
  store.db.exec('CREATE TABLE IF NOT EXISTS mobile_capsule_doses (owner TEXT NOT NULL,capsule_id TEXT NOT NULL,day TEXT NOT NULL,time TEXT NOT NULL,taken_at TEXT NOT NULL,title TEXT NOT NULL,dose_text TEXT NOT NULL,PRIMARY KEY(owner,capsule_id,day,time)) STRICT;');
  const capsuleDayOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const capsuleTimeOK=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const capsuleItem=r=>({id:r.capsule_id+':'+r.day+':'+r.time,kind:'capsule_dose',title:r.title,privacy:'private',state:'done',data:{capsule_id:r.capsule_id,day:r.day,time:r.time,taken_at:r.taken_at,dose_text:r.dose_text}});
  const capsuleGet=store.db.prepare('SELECT * FROM mobile_capsule_doses WHERE owner=? AND capsule_id=? AND day=? AND time=?');
  const capsuleList=store.db.prepare('SELECT * FROM mobile_capsule_doses WHERE owner=? AND day>=? AND day<=? ORDER BY day DESC,time DESC LIMIT 5000');
  const capsuleInsert=store.db.prepare('INSERT INTO mobile_capsule_doses (owner,capsule_id,day,time,taken_at,title,dose_text) VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner,capsule_id,day,time) DO NOTHING');
  const capsuleDelete=store.db.prepare('DELETE FROM mobile_capsule_doses WHERE owner=? AND capsule_id=? AND day=? AND time=?');

  store.db.exec(`CREATE TABLE IF NOT EXISTS mobile_voice_receipts (
    client_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, audio_hash TEXT NOT NULL,
    transcript TEXT NOT NULL, created_ms INTEGER NOT NULL
  ) STRICT;`);
  function rate(session, name, max = 20) {
    const now = Date.now();
    for (const [key, value] of rateBuckets) if (now - value.start > 60000) rateBuckets.delete(key);
    const key = session.token_hash + ':' + name, bucket = rateBuckets.get(key) || { start: now, count: 0 };
    if (++bucket.count > max) fail('RATE_LIMIT', 'Muitas solicitações. Aguarde um minuto.', 429);
    rateBuckets.set(key, bucket);
  }
  function profile() { const s = store.settings(); return { name: s.profileName || 'Proprietário', email: ownerAuth.registeredEmail(), role: 'owner' }; }
  function conversation(id, { history = false } = {}) {
    const c = store.conversation(validId(id));
    if (!['mobile', 'web', 'test'].includes(c.channel) || !(history ? ['active','paused','archived'].includes(c.state) : c.state === 'active')) fail('NOT_FOUND', 'Conversa não disponível neste canal.', 404);
    return c;
  }
  // 0.3.246: áudio apagado (limpeza automática ou à mão em Arquivos da Sofia): o app mostra o aviso no lugar do player.
  let removedStmt = null;
  function voiceRemoved(messageId) { try { removedStmt = removedStmt || store.db.prepare('SELECT removed_at FROM voice_messages WHERE message_id=?'); const r = removedStmt.get(messageId); return !!(r && r.removed_at); } catch { return false; } }
  function messages(id, before = Number.MAX_SAFE_INTEGER) {
    const rows = store.messages(id, 101, before), voices = store.voiceForMessages(rows);
    return { messages: rows.slice(-100).map(m => {
      const voice = voices.get(m.id);
      return { id: m.id, sequence: m.sequence, conversation_id: m.conversation_id, role: m.role, content: m.content,
        client_id: m.client_id, created_at: m.created_at, status: m.status, error_code: m.error_code || null,
        voice: voice ? { mime: voice.mime, duration_ms: voice.duration_ms, audio_url: '/api/mobile/messages/' + m.id + '/audio', ...(voiceRemoved(m.id) ? { removed: true } : {}) } : null };
    }), has_more: rows.length > 100 };
  }
  const IMAGE_LINK = /!\[[^\]\n]*\]\(https?:\/\/[^\s)]*\/api\/attachments\/[A-Za-z0-9_-]+\?inline=1\)/;
  let lastImageError = '';
  async function chatImages(text) {
    const ids = [...text.matchAll(/!\[[^\]\n]*\]\(https?:\/\/[^\s)]*\/api\/attachments\/([A-Za-z0-9_-]+)\?inline=1\)/g)].map(x => x[1]).slice(0, 4);
    const out = []; lastImageError = '';
    for (const id of ids) {
      try {
        const row = workspace.attachment(id);
        if (!/^image\/(png|jpeg|webp|gif)$/.test(String(row.mime || ''))) continue;
        const bytes = runtime.google && runtime.google.attachmentBytes ? await runtime.google.attachmentBytes(row) : Buffer.from(row.blob || []);
        if (bytes.length && bytes.length <= 10 * 1024 * 1024) out.push({mime: row.mime, base64: bytes.toString('base64'), name: row.name});
      } catch (e) { lastImageError = String(e && e.message || e).slice(0, 120); }
    }
    return out;
  }
  function payload(b, text) {
    const c = conversation(b.conversation_id); validId(b.client_message_id);
    return { conversation_id: c.id, client_message_id: b.client_message_id, message: text, route: 'private', retry: b.retry === true,
      ...(b.clarification_id ? { clarification_id: validId(b.clarification_id) } : {}),
      ...(b.clarification_option ? { clarification_option: String(b.clarification_option).slice(0,80) } : {}) };
  }
  async function receive(input) { const result = await core.receive(input, { channel: 'mobile' }); return { ...result, ...messages(result.conversation_id) }; }
  function aiStatus() {
    const s=store.settings(),keyPresent=Boolean(config.privateApiKey||(s.legacyRoute==='private'&&config.apiKey));
    if(keyPresent&&(!s.routingEnabled||!s.privateConfirmed))store.updateSettings({routingEnabled:true,privateConfirmed:true});
    try { routing.profile('private'); return { ready: true, reason: null }; }
    catch (e) {
      const reasons = {
        ROUTE_KEY_MISSING: 'A chave do Filtro Privado não está presente no servidor. Abra a configuração da Sofia web e salve novamente a chave privada uma única vez; depois disso ela ficará sincronizada com o app e persistirá entre redeploys.',
        ROUTING_SETUP: 'O Filtro Privado existe, mas o roteamento ainda não foi ativado no servidor.',
        PROJECT_NOT_CONFIRMED: 'O Filtro Privado existe no servidor, mas a confirmação de projeto ainda não foi aplicada.',
        SAME_PROJECT_KEY: 'Os filtros Privado e Compartilhado estão usando a mesma chave. Eles precisam continuar separados.'
      };
      return { ready: false, reason: reasons[e.code] || 'O Filtro Privado da Sofia online ainda não está pronto para IA e áudio.', code: e.code };
    }
  }
  return async function mobile(req, res, p, m, url) {
    if (!p.startsWith('/api/mobile/')) return false;
    checkMobileOrigin(req, config); res.setHeader('Cache-Control', 'no-store');
    const send = value => { json(res, 200, value); return true; };
    if (p === '/api/mobile/auth/login' && m === 'POST') {
      if (!ownerAuth.passwordConfigured()) fail('LOGIN_NOT_CONFIGURED', 'Configure o acesso da Sofia no servidor.', 503);
      if (tooManyFailures(req)) fail('RATE_LIMIT', 'Muitas tentativas. Aguarde alguns minutos.', 429);
      const b = await bodyJson(req, 4096), email = String(b.email || ''), password = String(b.password || '');
      if (email.length > 160 || password.length > 200 || !ownerAuth.verifyLogin(email, password)) {
        registerFailure(req); fail('LOGIN_INVALID', 'E-mail ou senha incorretos.', 401);
      }
      const step = await webSecondStep(req, b);
      if (!step.ok) return send({ ok: false, need_code: true, ...step.need });
      clearFailures(req); return send({ ok: true, ...mobileSessions.issue(b.device_name), profile: profile(), ...(step.trust ? {trust: step.trust} : {}) });
    }
    const session = mobileSessions.require(req);
    if (p.startsWith('/api/mobile/chat-sync')) {
      if (m !== 'GET') rate(session, 'chat-sync-write', 30);
      if (await chatSync(req, res, p, m, url)) return true;
    }
    if (p === '/api/mobile/auth/logout' && m === 'POST') { mobileSessions.revoke(session); return send({ ok: true }); }
    if (p === '/api/mobile/auth/logout-all' && m === 'POST') {
      await bodyJson(req, 1024); mobileSessions.revokeAll(); deps.revokeWebSessions?.(); return send({ ok: true });
    }
    // 06/11/2026: relatorio do gravador de fluidez do Inicio do site (so posicoes, tempos e nomes de partes; sem conteudo).
    // Nao grava no banco: vai so para o registro do servidor, onde o agente le pelo Railway.
    if (p === '/api/mobile/diag/fluidez' && m === 'POST') {
      rate(session, 'diag-fluidez', 6); const b = await bodyJson(req, 60000);
      console.log('[fluidez] ' + JSON.stringify(b).slice(0, 60000)); return send({ ok: true });
    }
    if (p === '/api/mobile/auth/change-password' && m === 'POST') {
      rate(session, 'password', 5); const b = await bodyJson(req, 4096);
      const current = String(b.currentPassword || ''), next = String(b.newPassword || ''), confirmation = String(b.confirmPassword || '');
      if (current.length > 200 || !ownerAuth.verifyPassword(current)) fail('PASSWORD_INVALID', 'A senha atual está incorreta.', 403);
      if (next.length < 12 || next.length > 200) fail('PASSWORD_WEAK', 'Use de 12 a 200 caracteres.');
      if (next !== confirmation) fail('PASSWORD_MISMATCH', 'As duas senhas precisam ser iguais.');
      ownerAuth.setPassword(next); mobileSessions.revokeAll(); deps.revokeWebSessions?.(); return send({ ok: true });
    }

    // Authenticated read only: no browser, database writes or external app launch.
    if (p === '/api/mobile/price-tracker/mercadolivre/read' && m === 'POST') {
      rate(session, 'mercadolivre', 12);
      // Ate ~4 MB: o celular envia o bloco de dados da pagina do produto (ver mercado-livre-device.ts).
      const b = await bodyJson(req, 4_500_000), controller = new AbortController();
      const cancel = () => controller.abort();
      req.once('aborted', cancel); res.once('close', cancel);
      try {
        const result = await mercadoLivre.read(b, {signal: controller.signal, accountKey: OWNER});
        if (!res.destroyed) return send(result);
        return true;
      } finally { req.off('aborted', cancel); res.off('close', cancel); }
    }
    // Vigia de e-mails: senha de app só entra (nunca sai) e a verificação manual.
    if (p.startsWith('/api/mobile/mail/')) {
      const {PROVIDERS} = require('../services/mail-watch');
      if (p === '/api/mobile/mail/providers' && m === 'GET') return send({providers: PROVIDERS});
      rate(session, 'mail', 20);
      let match = p.match(/^\/api\/mobile\/mail\/accounts\/([\w-]+)\/secret$/);
      if (match && m === 'POST') { const b = await bodyJson(req, 4096); return send(await runtime.mailWatch.saveSecretAndTest(match[1], b.password)); }
      // 0.3.257: Entrar com Google nesta conta de e-mail (le a propria caixa, separada da Conta Google do Perfil)
      match = p.match(/^\/api\/mobile\/mail\/accounts\/([\w-]+)\/google\/(connect|disconnect|status)$/);
      if (match) {
        const account = (() => { try { return runtime.workspace.get(match[1]); } catch { return null; } })();
        if (!account || account.kind !== 'mail_account') fail('NOT_FOUND', 'Conta de e-mail não encontrada.', 404);
        if (match[2] === 'status' && m === 'GET') { const l = runtime.google.mailLink(match[1]); return send({linked: !!(l && l.refresh), email: l?.email || ''}); }
        if (m !== 'POST') fail('NOT_FOUND', 'Operação desconhecida.', 404);
        if (match[2] === 'connect') { const b = await bodyJson(req, 1024).catch(() => ({})); return send(runtime.google.mailConnectUrl(match[1], account.data.address, {app: !!b.app})); }
        return send(await runtime.google.dropMailLink(match[1]));
      }
      match = p.match(/^\/api\/mobile\/mail\/accounts\/([\w-]+)\/forget$/);
      if (match && m === 'POST') { runtime.mailWatch.dropSecret(match[1]); return send({ok: true}); }
      if (p === '/api/mobile/mail/check' && m === 'POST') { const b = await bodyJson(req, 1024); return send(await runtime.mailWatch.checkAll(b.account_id ? String(b.account_id) : undefined, Math.min(60, Math.max(0, Number(b.rescan_days) || 0)))); }
      fail('NOT_FOUND', 'Operação de e-mail desconhecida.', 404);
    }
    // Capacidades e rotas /md que o app já chamava e o servidor não tinha.
    if (p === '/api/mobile/md/capabilities' && m === 'GET') return send({ page_order: false, calendar: runtime.google.configured(), google: runtime.google.configured(), drive_backup: runtime.google.configured(), dashboard_widgets: true, conversation_delete: true, mail_watch: true, mercado_livre_html: true, notifications: true, drive_files: runtime.google.configured() });
    // Desempenho: todas as leituras de preço numa resposta só (antes era um pedido por produto).
    if (p === '/api/mobile/md/monitors/observations' && m === 'GET') {
      const out = {};
      for (let offset = 0; offset < 5000; offset += 500) { const page = workspace.list({ kind: 'monitor', limit: 500, offset }); for (const mon of page) if (mon.state !== 'archived') out[mon.id] = workspace.observations(mon.id); if (page.length < 500) break; }
      return send({ items: out });
    }
    // Finanças: os 5 tipos numa resposta só. Com ?from=AAAA-MM&to=AAAA-MM manda só os
    // lançamentos da janela (+ recorrentes e não pagos, que valem para qualquer mês) e o
    // "saldo acumulado" de cada conta até o início da janela: o app soma esse acumulado ao
    // saldo inicial e todos os cálculos continuam certos sem precisar do histórico inteiro.
    if (p === '/api/mobile/md/finance' && m === 'GET') {
      try { workspace.repairFinanceDuplicates(); } catch { /* reparo e best-effort */ }
      const out = {};
      for (const kind of ['fin_account', 'fin_card', 'fin_tx', 'fin_budget', 'fin_goal', 'fin_reserve_move', 'fin_statement', 'fin_refund']) {
        const list = [];
        for (let offset = 0; offset < 50000; offset += 500) { const page = workspace.list({ kind, limit: 500, offset }); list.push(...page); if (page.length < 500) break; }
        out[kind] = list;
      }
      const from = /^\d{4}-\d{2}$/.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : '', to = /^\d{4}-\d{2}$/.test(url.searchParams.get('to') || '') ? url.searchParams.get('to') : '';
      let carry = {}, window = null;
      if (from && to && from <= to) {
        const start = from + '-01', end = to + '-31';
        const all = out.fin_tx.filter(e => e.state !== 'archived');
        const effect = (t, accountId) => {
          // 0.3.221: mesma regra do app - so conta o que esta marcado como pago
          const d = t.data || {}; if (!d.paid) return 0; const amount = Number(d.amount || 0);
          if (d.kind === 'income' && d.account_id === accountId) return amount;
          if (d.kind === 'expense' && !d.card_id && d.account_id === accountId) return -amount;
          if (d.kind === 'card_payment' && d.account_id === accountId) return -amount;
          if (d.kind === 'transfer') return (d.to_account_id === accountId ? amount : 0) - (d.account_id === accountId ? amount : 0);
          return 0;
        };
        const sent = t => { const d = t.data || {}; const date = String(d.date || ''); return (date >= start && date <= end) || (d.recurrence && d.recurrence !== 'none') || !d.paid || (d.invoice_month && d.invoice_month >= from && d.invoice_month <= to); };
        // 0.3.221: o acumulado leva so o que NAO vai na lista. Antes, um lancamento antigo que tambem ia na lista (fixa/salario
        // que se repete, fatura) contava duas vezes - no acumulado e no app - e o Saldo mudava sozinho conforme o mes aberto.
        for (const a of out.fin_account) carry[a.id] = Math.round(all.filter(t => String(t.data?.date || '') < start && !sent(t)).reduce((s, t) => s + effect(t, a.id), 0) * 100) / 100;
        out.fin_tx = all.filter(sent);
        window = { from, to };
      }
      return send({ items: out, carry, window, at: new Date().toISOString() });
    }
    // Importar extrato (OFX/CSV): prévia e gravação. O arquivo vem como texto (até 5 MB).
    if (p === '/api/mobile/md/finance/import' && m === 'POST') {
      const b = await bodyJson(req, 5 * 1024 * 1024);
      return send(require('../services/bank-import').preview(workspace, { text: String(b.text || ''), target: b.target === 'card' ? 'card' : 'account', target_id: String(b.target_id || '') }));
    }
    // 0.3.212: zerar Financas - apaga TUDO do modulo (contas, cartoes, lancamentos, reserva, metas) para comecar do zero
    if (p === '/api/mobile/md/finance/reset' && m === 'POST') {
      const b = await bodyJson(req, 4096); if (String(b.confirm || '') !== 'ZERAR') fail('CONFIRM', 'Confirme com a palavra ZERAR.', 400);
      let removed = 0; const kinds = ['fin_tx', 'fin_reserve_move', 'fin_budget', 'fin_goal', 'fin_statement', 'fin_refund', 'fin_card', 'fin_account'];
      for (const kind of kinds) for (let round = 0; round < 50; round++) { const page = workspace.list({ kind, limit: 500, offset: 0 }); if (!page.length) break; for (const e of page) { try { workspace.deleteEntity(e.id); removed++; } catch { /* segue */ } } }
      return send({ ok: true, removed });
    }
    // 0.3.213: conciliacao - o extrato fica guardado a parte (fin_statement) e NAO vira lancamento
    if (p === '/api/mobile/md/finance/statement/delete' && m === 'POST') {
      const b = await bodyJson(req, 4096);
      return send(require('../services/bank-import').deleteStatement(workspace, { id: String(b.id || '') }));
    }
    if (p === '/api/mobile/md/finance/statement' && m === 'POST') {
      const b = await bodyJson(req, 5 * 1024 * 1024);
      return send(require('../services/bank-import').saveStatement(workspace, { text: String(b.text || ''), target_id: String(b.target_id || '') }));
    }
    if (p === '/api/mobile/md/finance/import/undo' && m === 'POST') {
      const b = await bodyJson(req, 65536);
      return send(require('../services/bank-import').undo(workspace, { target_id: String(b.target_id || '') }));
    }
    if (p === '/api/mobile/md/finance/import/commit' && m === 'POST') {
      const b = await bodyJson(req, 5 * 1024 * 1024);
      return send(require('../services/bank-import').commit(workspace, { items: b.items, target: b.target === 'card' ? 'card' : 'account', target_id: String(b.target_id || ''), privacy: 'private', source_id: null }));
    }
    if (p === '/api/mobile/md/dashboard') {
      const allowedWidgets = ['goal', 'monitoring', 'tasks', 'capsules', 'reminders', 'packages'];
      if (m === 'GET') { const saved = runtime.google.kvGet('dashboard_widgets'); return send({ widgets: Array.isArray(saved) ? saved : ['monitoring', 'tasks'], saved: Array.isArray(saved) }); }
      // O app salva a ordem com PATCH; antes so POST existia e o PATCH caia em "Esta rota do aplicativo nao existe" (widget de Capsulas sumia).
      if (m === 'POST' || m === 'PATCH') { const b = await bodyJson(req, 4096); const widgets = Array.isArray(b.widgets) ? [...new Set(b.widgets.filter(w => allowedWidgets.includes(w)))] : null; if (!widgets) fail('BAD_WIDGETS', 'Lista de widgets inválida.'); runtime.google.kvSet('dashboard_widgets', widgets); return send({ widgets }); }
    }
    if (p.startsWith('/api/mobile/md/calendar/') || p === '/api/mobile/md/drive/backup') {
      const g = runtime.google, action = p.split('/').pop();
      if (action === 'status' && m === 'GET') return send(await g.status());
      if (m !== 'POST') fail('NOT_FOUND', 'Operação desconhecida.', 404);
      rate(session, 'google', 20);
      if (action === 'connect') { const b = await bodyJson(req, 1024).catch(() => ({})); return send(g.connectUrl({ app: !!b.app })); }
      if (action === 'disconnect') return send(await g.disconnect());
      if (action === 'sync') return send(await g.sync());
      if (action === 'select') { const b = await bodyJson(req, 2048); return send(g.select(String(b.id || ''))); }
      if (action === 'backup') return send(await g.backupToDrive(true));
      fail('NOT_FOUND', 'Operação desconhecida.', 404);
    }
    // 0.3.244: Arquivos da Sofia (área oculta do Drive): resumo, lista por categoria, conteúdo e cópia visível.
    if (p === '/api/mobile/md/drive/files' && m === 'GET') {
      rate(session, 'drive-files', 60); const cat = url.searchParams.get('cat');
      return send(cat ? await runtime.google.driveList(cat, String(url.searchParams.get('page') || '')) : await runtime.google.driveSummary());
    }
    if (p === '/api/mobile/md/drive/storage' && m === 'GET') { rate(session, 'drive-files', 60); return send(await runtime.google.driveStorage()); }
    const driveFile = p.match(/^\/api\/mobile\/md\/drive\/files\/([A-Za-z0-9_-]+)\/content$/);
    if (driveFile && m === 'GET') { rate(session, 'drive-files', 60); await GoogleService.sendFile(res, await runtime.google.driveContent(driveFile[1])); return true; }
    const driveDel = p.match(/^\/api\/mobile\/md\/drive\/files\/([A-Za-z0-9_-]+)$/);
    if (driveDel && m === 'DELETE') { rate(session, 'drive-files', 60); await bodyJson(req, 256).catch(() => ({})); return send(await runtime.google.driveDelete(driveDel[1])); }
    if (p === '/api/mobile/md/drive/receipts-cleanup' && m === 'POST') { rate(session, 'google', 20); const b = await bodyJson(req, 256); return send(runtime.google.setReceiptsCleanup(b.enabled !== false)); }
    if (p === '/api/mobile/md/drive/cleanup' && m === 'POST') { rate(session, 'google', 20); const b = await bodyJson(req, 512); return send(runtime.google.setCleanup(String(b.cat || ''), b.enabled !== false)); }
    if (p === '/api/mobile/md/drive/export' && m === 'POST') {
      rate(session, 'google', 20); const b = await bodyJson(req, 4096).catch(() => ({}));
      return send({ export: await runtime.google.startExport(Array.isArray(b.categories) ? b.categories.map(String).slice(0, 20) : undefined) });
    }
    // Conexoes de lojas (Price Tracker): mesmo formato para todas; login da pessoa so onde a loja exige.
    if (p === '/api/mobile/price-tracker/connections' && m === 'GET') return send(runtime.stores.status());
    if (p.startsWith('/api/mobile/price-tracker/connections/') && m === 'POST') {
      const [, provider, action] = /\/connections\/([a-z]+)\/([a-z]+)$/.exec(p) || [];
      if (!provider || !action) fail('NOT_FOUND', 'Operacao desconhecida.', 404);
      rate(session, 'stores', 20);
      if (action === 'connect') { const b = await bodyJson(req, 1024).catch(() => ({})); return send(runtime.stores.connectUrl(provider, {app: !!b.app})); }
      if (action === 'disconnect') return send(await runtime.stores.disconnect(provider));
      fail('NOT_FOUND', 'Operacao desconhecida.', 404);
    }
    if (p === '/api/mobile/md/capsules/doses') {
      if (m === 'GET') {
        const from=url.searchParams.get('from'),to=url.searchParams.get('to');
        if (!capsuleDayOK(from)||!capsuleDayOK(to)||from>to||Date.parse(to)-Date.parse(from)>61*86400000)
          fail('CAPSULE_RANGE','Período de Cápsulas inválido.');
        return send({items:capsuleList.all(OWNER,from,to).map(capsuleItem)});
      }
      if (m === 'POST') {
        rate(session,'capsule-dose-write',40);
        const b=await bodyJson(req,2048),capsuleId=validId(b.capsule_id);
        if (!capsuleDayOK(b.day)||!capsuleTimeOK(b.time)||typeof b.taken!=='boolean')
          fail('CAPSULE_DOSE_INVALID','Informe data, horário e marcação da dose.');
        const plan=workspace.get(capsuleId);
        if (plan.kind!=='capsule') fail('CAPSULE_NOT_FOUND','Cápsula não encontrada.',404);
        if (b.taken) {
          capsuleInsert.run(OWNER,capsuleId,b.day,b.time,new Date().toISOString(),plan.title,String(plan.data?.dose_text||'').slice(0,1000));
          return send({ok:true,item:capsuleItem(capsuleGet.get(OWNER,capsuleId,b.day,b.time))});
        }
        capsuleDelete.run(OWNER,capsuleId,b.day,b.time);
        return send({ok:true,item:null});
      }
      fail('NOT_FOUND','Operação de Cápsulas não disponível.',404);
    }
    // Reuse web workspace operations only AFTER bearer auth. Never bridge admin/credentials/restore endpoints.
    if (p.startsWith('/api/mobile/workspace/')) {
      const suffix = p.slice('/api/mobile/workspace/'.length);
      const allowed = /^(?:catalog|areas|panorama|pages\/shared|pages\/lock-(?:key|recover)|pages\/[\w-]+\/share|ui\/(?:home|pages)|entities(?:\/[\w-]+(?:\/(?:versions|observations|attachments|calendar|action))?)?|attachments\/[\w-]+|relations|timeline|integrations|vault\/(?:status|setup|confirm|unlock|recover|lock|entries|chat|discuss))$/;
      if (!allowed.test(suffix)) fail('NOT_FOUND', 'Esta operação não está disponível no app.', 404);
      if (m !== 'GET') rate(session, 'workspace-write', 60);
      if (suffix.startsWith('vault/')) {
        if (!['vault/status','vault/setup','vault/confirm','vault/unlock','vault/recover'].includes(suffix)) runtime.vault.require(req.headers['x-sofia-vault']);
      }
      const target = new URL(url.toString()); target.pathname = '/api/' + suffix;
      if (!await extra(req, res, target.pathname, m, target)) fail('NOT_FOUND', 'Operação não encontrada.', 404);
      return true;
    }
    if (p === '/api/mobile/bootstrap' && m === 'GET') return send({ ok: true, version: VERSION, profile: profile(),
      expires_at: new Date(session.expires_ms).toISOString(), ai: aiStatus(),
      limits: { audio_bytes: MAX_AUDIO, audio_seconds: 0, text_chars: 0 },
      capabilities: { text: true, voice_notes: true, notifications_push: false, multi_user: false, e2ee: false, workspace: true, protected_diary: true } });
    if (p === '/api/mobile/conversations' && m === 'GET') {
      const offset = Math.max(0, Math.min(100000, Number(url.searchParams.get('offset')) || 0));
      const rows = store.db.prepare(`SELECT c.*,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.owner=c.owner AND m.status<>'deleted') AS message_count
        FROM conversations c WHERE c.owner=? AND c.state IN ('active','paused','archived')
        AND c.channel IN ('mobile','web','test')
        AND ((SELECT COUNT(*) FROM messages m2 WHERE m2.conversation_id=c.id AND m2.owner=c.owner AND m2.status<>'deleted')>0 OR c.id=(SELECT conversation_id FROM owner_chat_cursor WHERE owner=c.owner))
        ORDER BY c.updated_at DESC,c.rowid DESC LIMIT 51 OFFSET ?`).all(OWNER, Math.trunc(offset));
      return send({ items: rows.slice(0, 50), has_more: rows.length > 50, next_offset: offset + 50 });
    }
    if (p === '/api/mobile/conversations' && m === 'POST') {
      rate(session, 'new', 10); const b = await bodyJson(req, 2048);
      // 0.3.265 (bug das conversas vazias): o "+" reaproveita uma conversa ainda sem mensagens em vez de criar outra
      const empty = store.db.prepare(`SELECT c.id FROM conversations c WHERE c.owner=? AND c.state='active' AND c.channel IN ('mobile','web')
        AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.owner=c.owner AND m.status<>'deleted') ORDER BY c.updated_at DESC,c.rowid DESC LIMIT 1`).get(OWNER);
      if (empty) return send({ conversation: store.conversation(empty.id) });
      return send({ conversation: store.createConversation(cleanText(b.title || 'Conversa com a Sofia', 'Título', 100), 'mobile') });
    }
    // 03/11/2026: apagar varias conversas de uma vez (o app pedia e o servidor nao tinha)
    if (p === '/api/mobile/md/conversations' && m === 'DELETE') { rate(session, 'delete', 10); const b = await bodyJson(req, 16384); if (!Array.isArray(b.ids) || !b.ids.length || b.ids.some(x => typeof x !== 'string' || x.length > 120)) fail('BAD_IDS', 'Lista de conversas inválida.'); return send(store.deleteConversations(b.ids)); }
    if (p === '/api/mobile/chat-history' && m === 'DELETE') { rate(session, 'delete', 10); return send(store.clearChatHistory()); }
    const boardMatch = p.match(/^\/api\/mobile\/conversations\/([\w-]+)\/board$/);
    if (boardMatch && m === 'GET') { const id = validId(boardMatch[1]); conversation(id); board.schedule(id); return send(board.read(id)); } // 0.3.268: abrir uma conversa antiga tambem organiza o quadro (so chama a IA se houver mensagem nova)
    if (boardMatch && m === 'POST') { const id = validId(boardMatch[1]); conversation(id); rate(session, 'board', 20); return send(await board.update(id)); }
    let match = p.match(/^\/api\/mobile\/conversations\/([\w-]+)$/);
    if (match && m === 'GET') {
      const c = conversation(match[1], { history: true }), before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
      return send({ conversation: c, ...messages(c.id, before) });
    }
    if (p === '/api/mobile/messages' && m === 'POST') {
      rate(session, 'message'); const b = await bodyJson(req, MAX_MESSAGE_BODY);
      // 0.3.199: a foto anexada na conversa vai para a Sofia LER (antes ela recebia so o link). Depois de lida,
      // o original sobe para o Drive (Sofia OS/Comprovantes) e sai do servidor.
      const text = String(b.message || ''), hasLink = IMAGE_LINK.test(text);
      let images = await chatImages(text), uiNote = '';
      // 0.3.206: se ESTA mensagem traz foto e ela nao carregou, a Sofia avisa e pede para reenviar (nunca usa a
      // foto de antes - era isso que fazia ela repetir a compra anterior)
      if (hasLink && !images.length) uiNote = 'A foto anexada NESTA mensagem não pôde ser carregada pelo servidor' + (lastImageError ? ' (' + lastImageError + ')' : '') + '. Não use fotos nem compras de mensagens anteriores e não registre nada: diga que não conseguiu abrir a foto e peça para reenviar.';
      // 0.3.203: "ta na imagem" (mensagem SEM foto) logo depois de mandar a foto - a foto anterior (ate 15 min) vai junto
      if (!hasLink && !images.length && b.conversation_id) {
        try {
          const recent = store.messages(validId(b.conversation_id), 6).filter(x => x.role === 'user').reverse();
          const last = recent.find(x => /!\[[^\]\n]*\]\(https?:\/\/[^\s)]*\/api\/attachments\//.test(String(x.content || '')));
          if (last && Date.now() - Date.parse(last.created_at) < 15 * 60000) images = await chatImages(String(last.content));
        } catch { /* sem a foto anterior, segue so com o texto */ }
      }
      const out = await receive({...payload(b, cleanMessage(b.message, 'Mensagem')), ...(images.length ? {images} : {}), ...(uiNote ? {ui_context: uiNote} : {})});
      if (out?.conversation_id) board.schedule(out.conversation_id); // 0.3.265: o Quadro da conversa se reorganiza
      return send(out);
    }
    match = p.match(/^\/api\/mobile\/messages\/([\w-]+)$/);
    if (match && m === 'DELETE') { rate(session, 'delete', 30); const row=store.message(validId(match[1]));conversation(row.conversation_id);return send(store.deleteMessage(row.id)); }
    if (p === '/api/mobile/messages/audio' && m === 'POST') {
      rate(session, 'audio', 12); const b = await bodyJson(req, Math.ceil(MAX_AUDIO * 4 / 3) + 65536), input = payload(b, ''), key = input.client_message_id;
      const raw = String(b.audio_base64 || '');
      if (!raw || raw.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) fail('VOICE_INVALID', 'Áudio inválido. Grave novamente.');
      const bytes = Buffer.from(raw, 'base64');
      if (!bytes.length || bytes.length > MAX_AUDIO) fail('VOICE_SIZE', 'Este arquivo de áudio excede o limite técnico de transporte.', 413);
      const mime = String(b.mime || 'audio/mp4').toLowerCase();
      if (!/^audio\/(mp4|m4a|x-m4a|mpeg|wav|webm|ogg)$/.test(mime)) fail('VOICE_FORMAT', 'Formato de áudio não aceito.', 415);
      const duration = Number(b.duration_ms);
      if (!Number.isSafeInteger(duration) || duration < 1) fail('VOICE_DURATION', 'Duração de áudio inválida.');
      if (inAudio.has(key) || core.busy) fail('IN_PROGRESS', 'A Sofia ainda está processando uma mensagem. Aguarde.', 409);
      const hash = digest(bytes); store.db.prepare('DELETE FROM mobile_voice_receipts WHERE created_ms < ?').run(Date.now() - 86400000);
      let receipt = store.db.prepare('SELECT * FROM mobile_voice_receipts WHERE client_id=?').get(key);
      if (receipt && (receipt.audio_hash !== hash || receipt.conversation_id !== input.conversation_id)) fail('ID_CONFLICT', 'Este identificador já pertence a outro áudio.', 409);
      const old = store.db.prepare('SELECT id,conversation_id,content FROM messages WHERE owner=? AND client_id=?').get(OWNER, key);
      const voice = old ? store.voiceMessage(old.id) : null;
      if (old && (old.conversation_id !== input.conversation_id || (!receipt && !voice) || (voice && (voice.blob && voice.blob.length ? digest(Buffer.from(voice.blob)) : voice.sha256) !== hash))) fail('ID_CONFLICT', 'Este identificador já pertence a outra mensagem.', 409);
      inAudio.add(key); let transcript = receipt?.transcript || (voice ? old.content : '');
      try {
        routing.profile('private');
        if (!transcript) {
          const t = await audioService.transcribe(bytes, { mime, filename: 'sofia-voice.' + (mime.includes('wav') ? 'wav' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.split('/')[1]), route: 'private' });
          transcript = cleanMessage(t.text, 'Transcrição');
          store.db.prepare('INSERT OR REPLACE INTO mobile_voice_receipts VALUES (?,?,?,?,?)').run(key, input.conversation_id, hash, transcript, Date.now());
        }
        let result;
        try { result = await core.receive({ ...input, message: transcript }, { channel: 'mobile' }); }
        finally {
          const row = store.db.prepare('SELECT id FROM messages WHERE owner=? AND client_id=?').get(OWNER, key);
          if (row) store.saveVoiceMessage(row.id, { mime, duration_ms: duration, transcript, bytes });
        }
        if (result?.conversation_id) board.schedule(result.conversation_id);
        return send({ ...result, ...messages(result.conversation_id) });
      } finally { inAudio.delete(key); }
    }
    match = p.match(/^\/api\/mobile\/messages\/([\w-]+)\/audio$/);
    if (match && m === 'GET') {
      const row = store.message(validId(match[1])); conversation(row.conversation_id, { history: true });
      const voice = store.voiceMessage(row.id); if (!voice) fail('NOT_FOUND', 'Áudio não encontrado.', 404);
      // Voz com mais de 1 dia pode estar no Drive: busca lá (com cache) quando o blob não está mais aqui.
      const bytes = runtime.google && runtime.google.voiceBytes ? await runtime.google.voiceBytes(voice) : Buffer.from(voice.blob), range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range || ''));
      res.setHeader('Content-Type', voice.mime); res.setHeader('Accept-Ranges', 'bytes');
      if (range) {
        const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
        if (start > end || start >= bytes.length) { res.statusCode = 416; res.setHeader('Content-Range', 'bytes */' + bytes.length); res.end(); return true; }
        res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
        res.setHeader('Content-Length', String(end - start + 1)); res.end(bytes.subarray(start, end + 1));
      } else { res.setHeader('Content-Length', String(bytes.length)); res.end(bytes); }
      return true;
    }
    if (p === '/api/mobile/home' && m === 'GET') return send({ ...workspace.panorama(), profile: profile() });
    if (p === '/api/mobile/tasks' && m === 'GET') return send({ items: store.tasks() });
    if (p === '/api/mobile/tasks' && m === 'POST') {
      rate(session, 'write', 40); const b = await bodyJson(req, 16384);
      return send({ item: store.saveTask({ ...b, title: cleanText(b.title, 'Título', 300), privacy: 'private' }) });
    }
    match = p.match(/^\/api\/mobile\/tasks\/([\w-]+)$/);
    if (match && m === 'PATCH') {
      rate(session, 'write', 40); const b = await bodyJson(req, 16384), old = store.task(validId(match[1]));
      return send({ item: store.saveTask({ ...old, ...b, revision: b.revision }, old.id) });
    }
    if (match && m === 'DELETE') { rate(session, 'write', 40); return send(store.deleteTask(validId(match[1]))); }
    // Sem teto de 500: com o Google conectado a agenda passa fácil disso.
    if (p === '/api/mobile/agenda' && m === 'GET') { const all = kind => { const out = []; for (let offset = 0; offset < 50000; offset += 500) { const page = workspace.list({ kind, limit: 500, offset }); out.push(...page); if (page.length < 500) break; } return out; }; const from = new Date(Date.now() - 120 * 864e5).toISOString(), to = new Date(Date.now() + 400 * 864e5).toISOString(); const keep = e => e.data?.calendar_provider !== 'google' || (e.state !== 'cancelled' && (!e.data.start_at || (e.data.start_at >= from && e.data.start_at <= to))); // 0.3.201: tarefa programada (com data) aparece na Agenda; avisa so se a pessoa escolheu um lembrete
      const doneFrom = Date.now() - 62 * 864e5; // 0.3.255: tarefa concluida fica no dia dela, riscada (ultimos 2 meses)
      const taskItems = store.tasks().filter(t => t.due_at && t.state !== 'cancelled' && (t.state !== 'done' || Date.parse(t.due_at) >= doneFrom)).map(t => { const n = (Array.isArray(t.notifications) ? t.notifications : []).map(Number).filter(x => Number.isFinite(x) && x >= 0);
        return { id: 'task:' + t.id, kind: 'task', title: t.title, state: t.state, area: t.area, tags: n.length ? [] : ['sofia-notify-v1:off'], revision: t.revision,
          data: { start_at: t.due_at, end_at: t.end_at || '', priority_level: t.priority_level || 'none', reminders_json: JSON.stringify(n), remind_minutes: n.length ? Math.min(...n) : '', task_id: t.id } }; });
      return send({ items: [...all('commitment').filter(keep), ...all('reminder'), ...taskItems], provider: runtime.google?.link()?.refresh ? 'google' : 'sofia' }); }
    if (p === '/api/mobile/agenda' && m === 'POST') {
      rate(session, 'write', 40); const b = await bodyJson(req, 8192);
      if (!b.start_at || !Number.isFinite(Date.parse(b.start_at))) fail('INVALID_DATE', 'Data e hora inválidas.');
      return send({ item: workspace.save({ kind: 'commitment', title: cleanText(b.title, 'Título', 200), area: 'Pessoal', privacy: 'private', data: { start_at: new Date(b.start_at).toISOString(), end_at: '', location: '' } }) });
    }
    // Encomendas: atualizar agora (consulta a transportadora e devolve o registro atualizado).
    // 0.3.269: cota da Ship24 no rodape de Encomendas - rastreios NOVOS cadastrados no mes (atualizar nao gasta)
    if (p === '/api/mobile/packages/quota' && m === 'GET') {
      const month = new Date().toISOString().slice(0, 7);
      const used = workspace.list({kind: 'package', limit: 500}).filter(x => String(x.created_at || '').startsWith(month) && (x.data && (x.data.ship24_tracker_id || x.data.ok_at || x.data.checked_at))).length;
      return send({used, limit: 10, month, configured: !!(runtime.packages && runtime.packages.ship24Configured && runtime.packages.ship24Configured())});
    }
    if (p === '/api/mobile/packages/refresh' && m === 'POST') { const b = await bodyJson(req, 2048); const r = await runtime.packages.refreshOne(String(b.id || '')); return send({ item: r.item, changed: r.changed, error: r.error }); }
    if (p === '/api/mobile/notifications' && m === 'GET') return send({ items: workspace.notifications(), push_enabled: false });
    match = p.match(/^\/api\/mobile\/notifications\/([\w-]+)\/read$/);
    if (match && m === 'POST') { workspace.markRead(validId(match[1])); return send({ ok: true }); }
    // Apagar aviso no servidor (um, ou 'all'): antes o app dizia que isso 'aguardava atualização do servidor'.
    // 0.3.146: lista paginada (sem os apagados) com o total real de nao lidas, e "marcar tudo" global.
    // 0.3.182: recuperar registros de Financas apagados por engano, a partir dos backups diarios do servidor.
    if (p === '/api/mobile/md/finance/recoverable' && m === 'GET') {
      const exists = id => { try { workspace.get(id); return true; } catch { return false; } };
      // Ja restaurado (ou recriado igual)? Nao aparece de novo.
      const sig = e => [e.kind, String(e.title || '').trim().toLowerCase(), Number(e.data && e.data.amount) || 0, String(e.data && e.data.date || '')].join('|');
      const now = new Set(); for (const k of ['fin_tx', 'fin_goal', 'fin_reserve_move', 'fin_account', 'fin_card']) { try { for (const e of workspace.list({kind: k, limit: 500})) now.add(sig(e)); } catch { /* sem registros */ } }
      const items = (runtime.backups && runtime.backups.recoverable ? runtime.backups.recoverable(['fin_tx', 'fin_goal', 'fin_reserve_move', 'fin_account', 'fin_card'], exists) : []).filter(x => !now.has(sig(x)));
      const hidden = [];
      for (const k of ['fin_tx', 'fin_goal', 'fin_account', 'fin_card']) { try { for (const e of workspace.list({kind: k, limit: 500})) if (e.state === 'archived') hidden.push({id: e.id, kind: e.kind, title: e.title, data: e.data, state: 'archived', updated_at: e.updated_at, backup: ''}); } catch { /* sem registros */ } }
      return send({items: [...hidden, ...items.map(x => ({id: x.id, kind: x.kind, title: x.title, data: x.data, state: 'deleted', updated_at: x.updated_at, backup: x.backup}))].slice(0, 300)});
    }
    if (p === '/api/mobile/md/finance/recover' && m === 'POST') {
      const b = await bodyJson(req, 1024);
      // oculta (arquivada): so volta a ficar ativa
      try { const cur = workspace.get(String(b.id || '')); if (cur && cur.state === 'archived') return send(workspace.save({...cur, state: 'active'}, cur.id)); } catch { /* nao existe mais: vem do backup */ }
      const exists = id => { try { workspace.get(id); return true; } catch { return false; } };
      const found = (runtime.backups && runtime.backups.recoverable ? runtime.backups.recoverable(['fin_tx', 'fin_goal', 'fin_reserve_move', 'fin_account', 'fin_card'], exists) : []).find(x => x.id === String(b.id || ''));
      if (!found) fail('NOT_FOUND', 'Esse item não está mais nos backups ou já foi restaurado.', 404);
      const fields = new Set(((require('../core/catalog.js').CATALOG[found.kind] || {}).fields || []).map(f => f.key));
      const data = Object.fromEntries(Object.entries(found.data || {}).filter(([k]) => fields.has(k)));
      const states = (require('../core/catalog.js').CATALOG[found.kind] || {}).states || ['active'];
      return send(workspace.save({kind: found.kind, title: found.title, content: found.content, area: found.area || 'Pessoal', privacy: found.privacy || 'private', state: states.includes(found.state) ? found.state : states[0], tags: found.tags || [], data}));
    }
    if (p === '/api/mobile/md/notifications' && m === 'GET') return send(workspace.noticePage(new URL(req.url, 'http://x').searchParams.get('offset')));
    if (p === '/api/mobile/md/notifications/read-all' && m === 'POST') { await bodyJson(req, 256).catch(() => ({})); return send(workspace.markAllRead()); }
    match = p.match(/^\/api\/mobile\/md\/notifications\/([\w-]+)$/);
    if (match && m === 'DELETE') return send(workspace.clearNotification(match[1] === 'all' ? 'all' : validId(match[1])));
    // 0.3.268: foto do perfil guardada no servidor, para aparecer igual no app e no site (antes ficava so no aparelho)
    if (p === '/api/mobile/profile/photo') {
      try { store.db.exec('CREATE TABLE IF NOT EXISTS profile_photo(owner TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)'); } catch { /* banco de teste */ }
      if (m === 'GET') { const r = store.db.prepare("SELECT mime,data,updated_at FROM profile_photo WHERE owner='owner'").get(); return send(r ? {photo: {mime: r.mime, base64: r.data, updated_at: r.updated_at}} : {photo: null}); }
      if (m === 'POST') {
        rate(session, 'write', 20); const b = await bodyJson(req, 14 * 1024 * 1024); // 0.3.325: foto do celular em tamanho cheio passava de 4 MB e era recusada (o site ficava sem a foto)
        const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(String(b.mime)) ? String(b.mime) : 'image/jpeg', data = String(b.base64 || '').replace(/^data:[^,]*,/, '');
        if (!/^[A-Za-z0-9+/=]{100,}$/.test(data)) fail('BAD_PHOTO', 'Foto inválida.', 400);
        const at = new Date().toISOString(); store.db.prepare("INSERT INTO profile_photo VALUES('owner',?,?,?) ON CONFLICT(owner) DO UPDATE SET mime=excluded.mime,data=excluded.data,updated_at=excluded.updated_at").run(mime, data, at);
        return send({ok: true, updated_at: at});
      }
      if (m === 'DELETE') { rate(session, 'write', 20); store.db.prepare("DELETE FROM profile_photo WHERE owner='owner'").run(); return send({ok: true}); }
    }
    // 0.3.269: ler um link colado (Listas, Biblioteca): titulo, imagem, site e preco
    // 0.3.269: buscar um nome nos catalogos (filmes, series, livros) para criar o item da Biblioteca ja preenchido
    if (p === '/api/mobile/library/search' && m === 'POST') {
      rate(session, 'libsearch', 120); const b = await bodyJson(req, 2048);
      return send({items: await require('../services/library-search').librarySearch(String(b.q || ''), {prefer: String(b.prefer || '')})});
    }
    // 0.3.269 (Financas no site): arrastar/colar a nota no campo de lancar - a Sofia le e devolve para conferir (nada e salvo aqui)
    if (p === '/api/mobile/finance/read-receipt' && m === 'POST') {
      rate(session, 'receipt', 30); const b = await bodyJson(req, 8 * 1024 * 1024);
      const mime = /^image\/(png|jpe?g|webp|gif)$/.test(String(b.mime)) ? String(b.mime) : 'image/jpeg', data = String(b.base64 || '').replace(/^data:[^,]*,/, '');
      if (data.length < 100) fail('BAD_IMAGE', 'Imagem inválida.', 400);
      const schema = {type: 'object', additionalProperties: false, required: ['desc', 'amount', 'date', 'category', 'items'], properties: {desc: {type: 'string'}, amount: {type: 'number'}, date: {type: 'string'}, category: {type: 'string'}, items: {type: 'string'}}};
      const instructions = 'Leia esta foto de compra (cupom, nota fiscal, comprovante, Pix ou pedido) e devolva: desc = loja e item principal (curto), amount = valor TOTAL pago em reais, date = data da compra AAAA-MM-DD (vazio se não aparecer), category = uma de: Alimentação, Mercado, Transporte, Moradia, Contas, Saúde, Educação, Lazer, Compras, Assinaturas, Viagem, Pets, Presentes, Impostos, Trabalho, Outros; items = itens comprados resumidos. Não invente: se não der para ler o valor, amount = 0.';
      const r = await runtime.routing.respondStructured('private', {instructions, input: [{role: 'user', content: [{type: 'input_text', text: 'Foto da compra para lançar em Finanças.'}, {type: 'input_image', image_url: 'data:' + mime + ';base64,' + data}]}], schema, name: 'finance_receipt', maxOutputTokens: 500});
      const out = r && r.data !== undefined ? r.data : r; return send({receipt: out});
    }
    if (p === '/api/mobile/link/preview' && m === 'POST') {
      rate(session, 'link', 60); const b = await bodyJson(req, 4096);
      return send(await require('../services/link-preview').linkPreview(String(b.url || '').slice(0, 2000)));
    }
    // 07/11/2026: aparencia escolhida na Sofia, para a pagina compartilhada ter a mesma cara (nao o tema de quem abre)
    if (p === '/api/mobile/appearance' && m === 'PATCH') {
      rate(session, 'write', 40); const b = await bodyJson(req, 1024); const hm = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined;
      if (!['system', 'light', 'dark', 'schedule'].includes(b.appearance)) fail('BAD_FIELD', 'Aparência inválida.');
      const shares = runtime.pageShares || deps.pageShares; if (shares && shares.setAppearance) shares.setAppearance({appearance: b.appearance, lightAt: hm(b.lightAt), darkAt: hm(b.darkAt)});
      return send({ok: true});
    }
    if (p === '/api/mobile/profile' && m === 'PATCH') {
      rate(session, 'write', 40); const b = await bodyJson(req, 2048);
      store.updateSettings({ profileName: cleanText(b.name, 'Nome', 80) }); return send({ profile: profile() });
    }
    fail('NOT_FOUND', 'Esta rota do aplicativo não existe.', 404);
  };
}
module.exports = { makeMobileApi, checkMobileOrigin };
