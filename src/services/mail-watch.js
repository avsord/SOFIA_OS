'use strict';
// Vigia de e-mails: a Sofia lê só os CABEÇALHOS e um trecho curto das
// mensagens novas da Caixa de Entrada, confere as regras da pessoa
// (remetente, assunto, texto) e cria um aviso quando algo bate.
// Conexão por IMAP com "senha de app" — sem registrar aplicativo no Google.
// A senha fica criptografada (AES-256-GCM) num arquivo do servidor e nunca
// volta para o app nem entra no banco de registros.
const crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
const {AppError, atomicWrite, now} = require('../core/util');

const PROVIDERS = {
  gmail: {host: 'imap.gmail.com', port: 993, label: 'Gmail'},
  outlook: {host: 'outlook.office365.com', port: 993, label: 'Outlook / Hotmail'},
  yahoo: {host: 'imap.mail.yahoo.com', port: 993, label: 'Yahoo'},
  icloud: {host: 'imap.mail.me.com', port: 993, label: 'iCloud'},
  imap: {host: '', port: 993, label: 'Outro (IMAP)'},
  gmail_google: {host: '', port: 0, label: 'Gmail (pela Conta Google)'},
};
const FIRST_LOOKBACK_DAYS = 2, MAX_PER_CHECK = 80, SNIPPET = 240;

/** Quantas mensagens do Gmail buscar ao mesmo tempo (a cota do Gmail aguenta com folga; 6 em paralelo ~ 130 de 250 unidades/s). */
const GMAIL_PARALLEL = 6;
function norm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function clean(t, max) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, max); }

/** Uma regra bate quando o texto procurado aparece no campo escolhido.
 * Vários termos separados por vírgula: basta um aparecer. */
function ruleMatches(rule, mail) {
  const d = rule.data || {}, terms = String(d.contains || '').split(',').map(norm).map(s => s.trim()).filter(Boolean);
  if (!terms.length) return false;
  if (d.account_id && d.account_id !== mail.accountId) return false;
  const from = norm(mail.fromName + ' ' + mail.fromAddr), subject = norm(mail.subject), body = norm(mail.text);
  const hay = d.field === 'from' ? from : d.field === 'subject' ? subject : d.field === 'body' ? body : from + ' ' + subject + ' ' + body;
  return terms.some(t => hay.includes(t));
}

function safeText(text, rejectSecrets) {
  try { rejectSecrets(text); return text; } catch { return '(trecho escondido: parece conter uma senha ou código)'; }
}

/** Texto simples de uma mensagem a partir do código-fonte, sem lib extra:
 * pega a primeira parte text/plain (ou tira as tags do HTML). */
function plainText(source) {
  const raw = String(source || '');
  const decodeQP = s => s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const parts = raw.split(/\r?\n--[^\r\n]+\r?\n/);
  let best = '';
  for (const part of parts) {
    const head = part.slice(0, part.search(/\r?\n\r?\n/) + 1), body = part.slice(head.length).replace(/^\r?\n/, '');
    const type = /content-type:\s*([^;\r\n]+)/i.exec(head)?.[1]?.toLowerCase() || '';
    const enc = /content-transfer-encoding:\s*([^\s;]+)/i.exec(head)?.[1]?.toLowerCase() || '';
    let txt = enc === 'base64' ? Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8') : enc === 'quoted-printable' ? Buffer.from(decodeQP(body), 'latin1').toString('utf8') : body;
    if (type.includes('text/plain')) { best = txt; break; }
    if (type.includes('text/html') && !best) best = txt.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  }
  return clean(best || raw.slice(raw.search(/\r?\n\r?\n/)), 4000);
}

class MailWatcher {
  constructor(workspace, config, options = {}) {
    this.w = workspace; this.config = config; this.busy = false; this.timer = null; this.env = options.env || process.env;
    this.client = options.client || (opts => { const {ImapFlow} = require('imapflow'); return new ImapFlow(opts); });
    const dir = config.dataDir || path.join(config.root || '.', 'data');
    this.keyFile = path.join(dir, 'mail-key'); this.secretFile = path.join(dir, 'mail-secrets.json');
  }
  envKey() { const k = (this.env || process.env).SOFIA_MAIL_KEY; return k && /^[0-9a-f]{64}$/i.test(k) ? Buffer.from(k, 'hex') : null; }
  fileKey() { return fs.existsSync(this.keyFile) ? Buffer.from(fs.readFileSync(this.keyFile, 'utf8').trim(), 'hex') : null; }
  key() {
    const env = this.envKey(); if (env) return env;
    if (!fs.existsSync(this.keyFile)) { fs.mkdirSync(path.dirname(this.keyFile), {recursive: true, mode: 0o700}); fs.writeFileSync(this.keyFile, crypto.randomBytes(32).toString('hex'), {mode: 0o600}); }
    return Buffer.from(fs.readFileSync(this.keyFile, 'utf8').trim(), 'hex');
  }
  secrets() { try { return JSON.parse(fs.readFileSync(this.secretFile, 'utf8')); } catch { return {}; } }
  setSecret(accountId, password) {
    const pass = String(password || '');
    if (!pass || pass.length > 300) throw new AppError('BAD_PASSWORD', 'Cole a senha de app (até 300 caracteres).');
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([c.update(pass, 'utf8'), c.final()]);
    const all = this.secrets(); all[accountId] = {iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64')};
    atomicWrite(this.secretFile, Buffer.from(JSON.stringify(all)));
  }
  secret(accountId) {
    const s = this.secrets()[accountId]; if (!s) return null;
    const tryKey = key => { try { const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(s.iv, 'base64')); d.setAuthTag(Buffer.from(s.tag, 'base64')); return Buffer.concat([d.update(Buffer.from(s.data, 'base64')), d.final()]).toString('utf8'); } catch { return null; } };
    const current = tryKey(this.key()); if (current !== null) return current;
    // Chave nova (SOFIA_MAIL_KEY) configurada depois: abre com a antiga do disco e regrava com a nova.
    const old = this.envKey() && this.fileKey() ? tryKey(this.fileKey()) : null;
    if (old !== null) { this.setSecret(accountId, old); return old; }
    return null;
  }
  dropSecret(accountId) { const all = this.secrets(); delete all[accountId]; atomicWrite(this.secretFile, Buffer.from(JSON.stringify(all))); }

  server(account) {
    const d = account.data || {}, p = PROVIDERS[d.provider] || PROVIDERS.imap;
    const host = String(d.host || p.host || ''), port = Number(d.port) || p.port;
    if (!host) throw new AppError('MAIL_HOST', 'Informe o servidor IMAP.');
    return {host, port, secure: port === 993, auth: {user: String(d.address || ''), pass: ''}, logger: false, socketTimeout: 30000, greetingTimeout: 15000};
  }
  async connect(opts) {
    const client = this.client(opts);
    try { await client.connect(); return client; }
    catch (e) {
      const msg = String(e?.responseText || e?.message || e);
      if (/auth|login|credential|invalid|password/i.test(msg)) throw new AppError('MAIL_AUTH', 'O provedor recusou o login. Para Gmail use uma "senha de app" (com verificação em duas etapas ligada), não a senha normal.', 400);
      throw new AppError('MAIL_CONNECT', 'Não consegui conectar ao servidor de e-mail: ' + msg.slice(0, 120), 502);
    }
  }
  async test(accountId, password) {
    const account = this.w.get(accountId);
    if (account.kind !== 'mail_account') throw new AppError('BAD_KIND', 'Não é uma conta de e-mail.');
    const opts = this.server(account); opts.auth.pass = String(password || this.secret(accountId) || '');
    if (!opts.auth.pass) throw new AppError('MAIL_SECRET', 'Cole a senha de app desta conta.');
    const client = await this.connect(opts);
    try { const box = await client.mailboxOpen('INBOX', {readOnly: true}); return {ok: true, messages: box.exists || 0}; }
    finally { await client.logout().catch(() => {}); }
  }
  async saveSecretAndTest(accountId, password) {
    const r = await this.test(accountId, password);
    this.setSecret(accountId, password);
    const a = this.w.get(accountId);
    this.w.save({revision: a.revision, data: {...a.data, secret_set: true, last_error: ''}}, accountId);
    return r;
  }

  /** 0.3.146: rescanDays > 0 reavalia os ultimos N dias (regra nova ou editada), sem mexer no
   * marcador de leitura; as mensagens ja registradas so ganham as regras novas, sem duplicar. */
  assignOrphanRules() {
    const all = this.w.list({kind: 'mail_account', limit: 50});
    if (!all.length) return 0;
    // 0.3.255: empate no horario de criacao (contas criadas no mesmo milissegundo) era decidido ao acaso e o teste do
    // CI falhava metade das vezes (a regra ia para a outra conta). A lista vem da mais nova para a mais antiga
    // (updated_at DESC, rowid DESC), entao no empate vale a que aparece mais para o fim: a criada primeiro.
    const oldest = all.map((a, i) => ({a, i})).sort((x, y) => String(x.a.created_at || '').localeCompare(String(y.a.created_at || '')) || y.i - x.i)[0].a;
    let n = 0;
    for (const r of this.w.list({kind: 'mail_rule', limit: 200})) {
      if (r.data && r.data.account_id && all.some(a => a.id === r.data.account_id)) continue;
      try { this.w.save({...r, data: {...r.data, account_id: oldest.id}}, r.id); n++; } catch { /* segue */ }
    }
    return n;
  }
  async checkAll(only, rescanDays = 0) {
    if (this.busy) return {skipped: true};
    this.busy = true;
    const report = {accounts: 0, scanned: 0, hits: 0, errors: []};
    try {
      // 0.3.249: cada regra e de UMA conta. Regras antigas "em todas as contas" passam a ser da conta mais antiga
      // (foram criadas antes de existir a segunda); a pessoa pode trocar a conta na propria regra.
      this.assignOrphanRules();
      const accounts = this.w.list({kind: 'mail_account', limit: 50}).filter(a => a.state === 'active' && (!only || a.id === only));
      const rules = this.w.list({kind: 'mail_rule', limit: 200}).filter(r => r.state === 'active');
      for (const account of accounts) {
        report.accounts++;
        try { const r = await this.checkAccount(account, rules, rescanDays); report.scanned += r.scanned; report.hits += r.hits; }
        catch (e) {
          report.errors.push({account: account.id, error: String(e.message).slice(0, 300)}); // 0.3.257: antes 160 cortava a mensagem no meio
          try { const a = this.w.get(account.id); this.w.save({revision: a.revision, data: {...a.data, last_error: String(e.message).slice(0, 300), last_check: now()}}, a.id); } catch { /* conta removida no meio */ }
        }
      }
    } finally { this.busy = false; }
    return report;
  }

  /** Gmail pela conexão Google que já existe (OAuth, escopo gmail.readonly):
   * nenhuma senha de app. Lê só remetente, assunto e o trecho que o próprio
   * Gmail fornece (snippet) das mensagens novas da Caixa de Entrada. */
  async checkGmailApi(account, rules, rescanDays = 0) {
    const g = this.google;
    // 0.3.257: conta com login Google proprio (Entrar com Google nesta conta) le a PROPRIA caixa, independente do Perfil
    const ownLink = g && g.mailLink && g.mailLink(account.id);
    if (ownLink && ownLink.refresh) return this.readGmail(account, rules, rescanDays, (method, url) => g.mailCall(account.id, method, url));
    const link = g && g.link && g.link();
    if (!link || !link.refresh) throw new AppError('GOOGLE_NOT_CONNECTED', 'Toque em Entrar com Google nesta conta (ou conecte a Conta Google em Perfil → Conta Google).');
    if (!/gmail\.readonly/.test(link.scopes || '')) throw new AppError('GMAIL_SCOPE', 'Desconecte e conecte a Conta Google de novo para liberar a leitura do Gmail.');
    // 0.3.248: o modo "Conta Google" le a caixa da UNICA Conta Google conectada no Perfil. Uma conta com outro e-mail
    // lia essa mesma caixa (e-mails da outra conta, testes enviados ao endereco certo nunca apareciam). Agora recusa,
    // diz por que, e tira os encontrados que entraram por engano (vinham da outra caixa).
    const linked = String(link.email || '').trim().toLowerCase(), own = String(account.data.address || '').trim().toLowerCase();
    if (linked && own && linked !== own) {
      for (const h of this.w.list({kind: 'mail_hit', limit: 500}).filter(x => x.data && x.data.account_id === account.id)) { try { this.w.deleteEntity(h.id); } catch { /* segue */ } }
      throw new AppError('GMAIL_OTHER_ACCOUNT', 'A Conta Google do Perfil (' + linked + ') só lê a própria caixa. Para ' + own + ': Entrar com Google nesta conta, ou senha de app.');
    }
    return this.readGmail(account, rules, rescanDays, (method, url) => g.call(method, url));
  }

  /** Leitura do Gmail (remetente, assunto, trecho) com a chamada da conta certa. */
  // 08/11/2026 (Pedro: Quadro - "anexo de um e-mail vira cartao"): os anexos sao buscados SO quando a pessoa pede (nada fica
  // guardado antes): lista os anexos da mensagem e baixa um deles. Gmail pela Conta Google (API) ou IMAP (senha de app).
  gmailCaller(account) {
    const g = this.google, own = g && g.mailLink && g.mailLink(account.id);
    if (own && own.refresh) return (method, url) => g.mailCall(account.id, method, url);
    const link = g && g.link && g.link(); if (!link || !link.refresh) throw new AppError('GOOGLE_NOT_CONNECTED', 'Conecte a Conta Google para ver os anexos.');
    return (method, url) => g.call(method, url);
  }
  mailRef(hitId) {
    const hit = this.w.get(hitId); if (hit.kind !== 'mail_hit') throw new AppError('NOT_FOUND', 'E-mail não encontrado.', 404);
    const account = this.w.get(String(hit.data.account_id || '')), key = String(hit.data.message_key || '');
    if (account.data.provider === 'gmail_google') {const id = key.split(':gmail:')[1]; if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new AppError('MAIL_REF', 'Não achei a mensagem no Gmail.'); return {account, gmail: id};}
    const m = /^[^:]+:([^:]*):(\d+)$/.exec(key); if (!m) throw new AppError('MAIL_REF', 'Não achei a mensagem na caixa.'); return {account, validity: m[1], uid: Number(m[2])};
  }
  async withImap(ref, run) {
    const pass = this.secret(ref.account.id); if (!pass) throw new AppError('MAIL_SECRET', 'Falta a senha de app desta conta.');
    const opts = this.server(ref.account); opts.auth.pass = pass; const client = await this.connect(opts);
    try { const box = await client.mailboxOpen('INBOX', {readOnly: true}); if (String(box.uidValidity || '') !== ref.validity) throw new AppError('MAIL_GONE', 'A caixa mudou desde que o e-mail chegou; a mensagem não está mais lá.'); return await run(client); }
    finally { await client.logout().catch(() => {}); }
  }
  async attachmentsOf(hitId) {
    const ref = this.mailRef(hitId), out = [];
    if (ref.gmail) {
      const msg = await this.gmailCaller(ref.account)('GET', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + ref.gmail + '?format=full');
      const walk = p => { if (!p) return; if (p.filename && p.body && p.body.attachmentId) out.push({part: String(p.body.attachmentId), name: String(p.filename).slice(0, 200), mime: String(p.mimeType || 'application/octet-stream'), bytes: Number(p.body.size) || 0}); for (const c of p.parts || []) walk(c); };
      walk(msg.payload); return out;
    }
    return this.withImap(ref, async client => {
      const msg = await client.fetchOne(String(ref.uid), {bodyStructure: true}, {uid: true}); if (!msg) throw new AppError('MAIL_GONE', 'A mensagem não está mais na caixa.');
      const walk = n => { if (!n) return; const name = (n.dispositionParameters && n.dispositionParameters.filename) || (n.parameters && n.parameters.name); if (name && n.part) out.push({part: String(n.part), name: String(name).slice(0, 200), mime: String(n.type || 'application/octet-stream'), bytes: Number(n.size) || 0}); for (const c of n.childNodes || []) walk(c); };
      walk(msg.bodyStructure); return out;
    });
  }
  async attachmentBytes(hitId, part, max = 25 * 1024 * 1024) {
    const ref = this.mailRef(hitId), list = await this.attachmentsOf(hitId), item = list.find(a => a.part === String(part));
    if (!item) throw new AppError('NOT_FOUND', 'Anexo não encontrado neste e-mail.', 404);
    if (item.bytes > max) throw new AppError('TOO_LARGE', 'Anexo grande demais (máximo 25 MB).', 413);
    if (ref.gmail) {
      const r = await this.gmailCaller(ref.account)('GET', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + ref.gmail + '/attachments/' + encodeURIComponent(item.part));
      return {...item, data: Buffer.from(String(r.data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64')};
    }
    return this.withImap(ref, async client => {
      const {content} = await client.download(String(ref.uid), item.part, {uid: true}); const chunks = []; let n = 0;
      for await (const ch of content) { n += ch.length; if (n > max) throw new AppError('TOO_LARGE', 'Anexo grande demais (máximo 25 MB).', 413); chunks.push(ch); }
      return {...item, data: Buffer.concat(chunks)};
    });
  }

  async readGmail(account, rules, rescanDays, call) {
    const g = {call};
    const API = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
    // last_uid guarda, para o Gmail, o horário (em SEGUNDOS) da última mensagem lida: o limite de número do servidor é 1e10.
    const since = rescanDays ? 0 : (Number(account.data.last_uid) || 0) * 1000;
    const q = rescanDays ? 'in:inbox newer_than:' + Math.min(60, Math.max(1, Math.floor(rescanDays))) + 'd' : since ? 'in:inbox after:' + Math.floor(since / 1000) : 'in:inbox newer_than:2d';
    const list = await g.call('GET', API + '?maxResults=80&q=' + encodeURIComponent(q));
    let scanned = 0, hits = 0, newest = since;
    // 0.3.241: as mensagens eram buscadas UMA POR UMA (ate 80 x ~0,23 s = ~18 s por verificacao). Agora em grupos de
    // GMAIL_PARALLEL em paralelo; o resultado e processado na MESMA ordem de antes, e qualquer falha continua abortando a conta.
    const refs = (list.messages || []).slice(0, 80), fetched = [];
    for (let i = 0; i < refs.length; i += GMAIL_PARALLEL)
      fetched.push(...await Promise.all(refs.slice(i, i + GMAIL_PARALLEL).map(ref => g.call('GET', API + '/' + encodeURIComponent(ref.id) + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject'))));
    for (const m of fetched) {
      const at = Number(m.internalDate) || Date.now();
      if (since && at <= since) continue;
      scanned++; newest = Math.max(newest, at);
      const head = name => ((m.payload && m.payload.headers) || []).find(h => String(h.name).toLowerCase() === name)?.value || '';
      const from = head('from'), match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(from);
      const mail = {accountId: account.id, fromName: clean(match ? match[1] : '', 160), fromAddr: clean(match ? match[2] : from, 200), subject: clean(head('subject') || '(sem assunto)', 300),
        text: clean(String(m.snippet || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'), 4000), date: new Date(at).toISOString(), key: account.id + ':gmail:' + m.id};
      const matched = rules.filter(r => ruleMatches(r, mail));
      if (matched.length) { hits++; this.record(account, mail, matched); }
    }
    const a = this.w.get(account.id);
    const keep = rescanDays ? Number(a.data.last_uid) || Math.floor((newest || Date.now()) / 1000) : Math.floor((newest || Date.now()) / 1000);
    this.w.save({revision: a.revision, data: {...a.data, last_uid: keep, last_check: now(), last_error: '', secret_set: true}}, account.id);
    return {scanned, hits};
  }

  async checkAccount(account, rules, rescanDays = 0) {
    if (account.data.provider === 'gmail_google') return this.checkGmailApi(account, rules, rescanDays);
    const pass = this.secret(account.id);
    if (!pass) throw new AppError('MAIL_SECRET', 'Falta a senha de app desta conta.');
    const opts = this.server(account); opts.auth.pass = pass;
    const client = await this.connect(opts);
    let scanned = 0, hits = 0, maxUid = Number(account.data.last_uid) || 0;
    try {
      const box = await client.mailboxOpen('INBOX', {readOnly: true});
      const validity = String(box.uidValidity || '');
      const keepUid = maxUid;
      const fresh = !!rescanDays || !maxUid || String(account.data.uid_validity || '') !== validity;
      const since = new Date(Date.now() - (rescanDays || FIRST_LOOKBACK_DAYS) * 864e5);
      const uids = (await client.search(fresh ? {since} : {uid: (maxUid + 1) + ':*'}, {uid: true})) || [];
      const pick = uids.filter(u => fresh || u > maxUid).sort((a, b) => a - b).slice(-MAX_PER_CHECK);
      if (pick.length) {
        for await (const msg of client.fetch(pick.join(','), {uid: true, envelope: true, internalDate: true, source: {start: 0, maxLength: 24000}}, {uid: true})) {
          scanned++; maxUid = Math.max(maxUid, msg.uid);
          const env = msg.envelope || {}, from = (env.from && env.from[0]) || {};
          const mail = {accountId: account.id, fromName: clean(from.name, 160), fromAddr: clean(from.address, 200), subject: clean(env.subject || '(sem assunto)', 300),
            text: plainText(msg.source ? msg.source.toString('utf8') : ''), date: (msg.internalDate || env.date || new Date()).toISOString?.() || now(), key: account.id + ':' + validity + ':' + msg.uid};
          const matched = rules.filter(r => ruleMatches(r, mail));
          if (matched.length) { hits++; this.record(account, mail, matched); }
        }
      }
      if (!pick.length && fresh && uids.length) maxUid = Math.max(maxUid, ...uids);
      if (fresh && !uids.length && box.uidNext) maxUid = Math.max(maxUid, Number(box.uidNext) - 1);
      const a = this.w.get(account.id);
      this.w.save({revision: a.revision, data: {...a.data, last_uid: rescanDays && keepUid ? Math.max(keepUid, maxUid) : maxUid, uid_validity: validity, last_check: now(), last_error: ''}}, account.id);
    } finally { await client.logout().catch(() => {}); }
    return {scanned, hits};
  }

  record(account, mail, rules) {
    const {rejectSecrets} = require('../core/util');
    const existing = this.w.list({kind: 'mail_hit', q: mail.key, limit: 5}).find(h => h.data.message_key === mail.key);
    if (existing) {
      const names = String(existing.data.rule_names || '').split(', ').filter(Boolean), add = rules.map(r => r.title).filter(t => !names.includes(t));
      if (add.length) this.w.save({revision: existing.revision, data: {...existing.data, rule_names: names.concat(add).join(', ').slice(0, 300)}}, existing.id);
      return;
    }
    const snippet = safeText(clean(mail.text, SNIPPET), rejectSecrets), subject = safeText(mail.subject, rejectSecrets);
    const important = rules.some(r => r.data.important);
    const hit = this.w.save({kind: 'mail_hit', title: subject.slice(0, 240), area: 'Pessoal', privacy: 'private', state: 'new',
      data: {from_name: mail.fromName, from_addr: mail.fromAddr, snippet, received_at: mail.date, account_id: account.id, rule_id: rules[0].id, rule_names: rules.map(r => r.title).join(', ').slice(0, 300), message_key: mail.key, important, ...(rules.find(r => r.data.important && r.data.emoji) ? {emoji: rules.find(r => r.data.important && r.data.emoji).data.emoji} : {})}});
    if (rules.some(r => r.data.notify !== false)) {
      const who = mail.fromName || mail.fromAddr || 'Remetente desconhecido';
      this.w.notify('email', (important ? '⭐ ' : '') + who + ' — ' + subject.slice(0, 120), 'Regra: ' + rules.map(r => r.title).join(', ') + (snippet ? '. ' + snippet.slice(0, 140) : ''), hit.id, important ? 'opportunity' : 'info', 'mail:' + mail.key);
    }
  }

  start(intervalMs = 5 * 60000) {
    if (this.timer) return;
    this.timer = setInterval(() => this.checkAll().catch(() => {}), intervalMs); this.timer.unref?.();
    setTimeout(() => this.checkAll().catch(() => {}), 20000).unref?.();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

module.exports = {MailWatcher, PROVIDERS, ruleMatches, plainText};
