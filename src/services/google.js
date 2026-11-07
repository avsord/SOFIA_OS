'use strict';
// Conta Google da Sofia: UMA conexão OAuth dá acesso à Agenda e ao Drive.
// Agenda: importação completa e incremental (events.list paginado, syncToken,
// HTTP 410), todos os calendários visíveis (o escolhido nos dois sentidos, os
// outros somente leitura), dia inteiro, fuso, recorrências expandidas,
// cancelados, recusados, conflitos sem sobrescrever nada.
// Drive (drive.appdata + drive.file: a Sofia só enxerga o que ela mesma criou): tudo dela fica na
// área oculta do app no Drive (backups, anexos, áudios, páginas); a pasta visível só aparece quando a
// pessoa pede uma cópia em "Arquivos da Sofia" → Exportar.
// Tokens ficam criptografados (AES-256-GCM) com SOFIA_CALENDAR_TOKEN_KEY.
const crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
const {makeThumb} = require('./thumb');
function ensureThumbColumn(db) { try { db.prepare('ALTER TABLE attachments ADD COLUMN thumb BLOB').run(); } catch { /* ja existe */ } }
const {AppError, now, id} = require('../core/util');
const {CATALOG} = require('../core/catalog');
// Antes de regravar a entidade depois de enviar ao Google, descarta qualquer chave que não é
// um campo de verdade daquele tipo (pode ter sobrado de uma versão antiga do app ou de um bug
// já corrigido). Sem isso, UM registro com uma chave estranha travava o envio dele para sempre:
// toda sincronização tentava de novo, falhava do mesmo jeito, e nunca marcava como enviado.
function cleanData(kind, data) {
  const allowed = new Set((CATALOG[kind]?.fields || []).map(f => f.key));
  const out = {};
  for (const k of Object.keys(data || {})) if (allowed.has(k)) out[k] = data[k];
  return out;
}

const MAIL_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly'];
// 06/11/2026 (Pedro: "EMAIL DA SOFIA ENVIA PARA O USUARIO, NAO O MEU EMAIL"): os e-mails da propria Sofia (redefinir senha,
// codigo do login) saem do E-MAIL DA SOFIA por uma ligacao so de envio, separada da conta Google pessoal (que nao muda).
// O Railway bloqueia SMTP; pela API do Gmail (HTTPS) passa. SEND_SCOPES = so enviar, nao le nada.
const SEND_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'];
// 07/11/2026 (Pedro): app Drive da Sofia = o Google Drive INTEIRO do usuario (permissao drive); a area da Sofia (appDataFolder,
// oculta) nunca aparece nem pode ser mexida.
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.appdata', 'https://www.googleapis.com/auth/gmail.readonly' /* 07/11/2026: sem 'drive' (Drive inteiro): o app Drive foi desligado pelo Pedro; ao reativar, volta aqui */];
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth', TOKEN = 'https://oauth2.googleapis.com/token', REVOKE = 'https://oauth2.googleapis.com/revoke';
const CAL = 'https://www.googleapis.com/calendar/v3', DRIVE = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const TZ = 'America/Sao_Paulo', MAX_PAGES = 20, KEEP_BACKUPS = 14, CALLBACK = '/google/oauth/callback';
// Janela fixa e leitura em lotes: a primeira versão pedia TODOS os eventos
// (recorrências expandidas sem fim) e gravava milhares de uma vez, travando o
// servidor inteiro enquanto isso. Agora: 60 dias para trás, 1 ano para frente,
// no máximo 3000 eventos por rodada, e uma pausa a cada 20 para o servidor
// continuar respondendo o app.
const PAST_DAYS = 60, FUTURE_DAYS = 365, MAX_EVENTS_PER_RUN = 3000, YIELD_EVERY = 20, FULL_EVERY_MS = 24 * 3600000;
const breathe = () => new Promise(r => setImmediate(r));

const iso = v => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : ''; };
const plusDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** 0.3.201: lista de avisos de um compromisso (minutos antes), sem repetidos, ate 5 (limite do Google). */
function reminderList(d) {
  let list = []; try { list = JSON.parse(String(d.reminders_json || '[]')); } catch { list = []; }
  return [...new Set((Array.isArray(list) ? list : []).map(Number).filter(n => Number.isFinite(n) && n >= 0).map(n => Math.min(40320, Math.round(n))))].sort((a, b) => a - b).slice(0, 5);
}
class GoogleService {
  constructor(store, workspace, config, options = {}) {
    this.s = store; this.db = store.db; this.w = workspace; this.config = config;
    this.fetch = options.fetchImpl || global.fetch; this.backups = options.backups || null;
    this.env = options.env || process.env; this.busy = false; this.access = null; this.timer = null;
    this.db.exec(`CREATE TABLE IF NOT EXISTS google_link(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS google_oauth_state(state TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS google_tombstones(calendar_id TEXT NOT NULL, event_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(calendar_id, event_id));
      CREATE TABLE IF NOT EXISTS md_kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS google_mail_link(account_id TEXT PRIMARY KEY, data TEXT NOT NULL);`);
    this.mailAccess = new Map();
    // Anexos (capas, fotos, arquivos) podem morar no Drive da pessoa: aqui fica só a referência.
    try { if (!this.db.prepare('PRAGMA table_info(attachments)').all().some(c => c.name === 'drive_id')) this.db.exec('ALTER TABLE attachments ADD COLUMN drive_id TEXT'); } catch { /* sem tabela de anexos */ }
    // Mensagens de voz (as maiores: até dezenas de MB cada) também podem morar no Drive.
    // sha256 guarda a impressão do áudio original para o reenvio idempotente continuar seguro sem o blob aqui.
    try { const cols = this.db.prepare('PRAGMA table_info(voice_messages)').all().map(c => c.name); if (!cols.includes('drive_id')) this.db.exec('ALTER TABLE voice_messages ADD COLUMN drive_id TEXT'); if (!cols.includes('sha256')) this.db.exec('ALTER TABLE voice_messages ADD COLUMN sha256 TEXT'); } catch { /* sem tabela de voz */ }
    // 0.3.244: arquivo apagado em "Arquivos da Sofia" (à mão ou na limpeza semanal dos comprovantes): a linha
    // fica (com a miniatura, se houver) e removed_at diz que o conteúdo não existe mais, para a tela explicar.
    for (const table of ['attachments', 'voice_messages']) { try { if (!this.db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === 'removed_at')) this.db.exec(`ALTER TABLE ${table} ADD COLUMN removed_at TEXT`); } catch { /* sem tabela */ } }
    this.blobCache = new Map(); this.blobCacheBytes = 0; this.offloading = false;
    // 0.3.200: capa antiga apagada na Sofia tambem sai do Drive
    if (typeof workspace.dropAttachment === 'function') {
      const dropOriginal = workspace.dropAttachment.bind(workspace);
      workspace.dropAttachment = (attId) => { const a = dropOriginal(attId); if (a && a.drive_id) this.call('DELETE', DRIVE + '/files/' + a.drive_id).catch(() => {}); return a; };
    }
    // 0.3.201: registra na agenda da Sofia e espelha no Google Agenda: com a conta conectada, compromisso
    // novo sem agenda escolhida vai para o Google (quem quiser so na Sofia escolhe "local" de proposito).
    const saveOriginal = workspace.save.bind(workspace);
    workspace.save = (input, entityId) => {
      if (!entityId && input && input.kind === 'commitment' && input.data && !input.data.calendar_provider) {
        const l = this.link(); if (l?.refresh && /calendar/.test(l.scopes || '')) input = {...input, data: {...input.data, calendar_provider: 'google'}};
      }
      return saveOriginal(input, entityId);
    };
    if (store && typeof store.deleteTask === 'function') {
      const deleteTaskOriginal = store.deleteTask.bind(store);
      store.deleteTask = (taskId) => {
        let ext = null; try { ext = this.db.prepare("SELECT external_calendar_id AS cal, external_event_id AS ev FROM task_details WHERE task_id=? AND COALESCE(external_event_id,'')!=''").get(taskId); } catch { /* sem detalhes */ }
        const result = deleteTaskOriginal(taskId);
        if (ext) try { this.db.prepare('INSERT OR IGNORE INTO google_tombstones VALUES(?,?,?)').run(ext.cal || 'primary', ext.ev, now()); } catch { /* sem tabela */ }
        return result;
      };
    }
    // Apagar na Sofia um evento ligado ao Google também apaga lá na próxima sincronização.
    const original = workspace.deleteEntity.bind(workspace);
    workspace.deleteEntity = (entityId) => {
      let e = null; try { e = workspace.get(entityId); } catch { /* deixa o original reclamar */ }
      let driveIds = []; try { driveIds = this.db.prepare('SELECT drive_id FROM attachments WHERE entity_id=? AND drive_id IS NOT NULL').all(entityId).map(r => r.drive_id); } catch { /* sem coluna */ }
      const result = original(entityId);
      for (const did of driveIds) this.call('DELETE', DRIVE + '/files/' + did).catch(() => {});
      if (e && e.kind === 'commitment' && e.data.calendar_provider === 'google' && e.data.external_event_id && !e.data.google_readonly)
        this.db.prepare('INSERT OR IGNORE INTO google_tombstones VALUES(?,?,?)').run(e.data.calendar_id || 'primary', e.data.external_event_id, now());
      return result;
    };
  }
  // ---------- armazenamento ----------
  kvGet(key) { const r = this.db.prepare('SELECT value FROM md_kv WHERE key=?').get(key); return r ? JSON.parse(r.value) : null; }
  kvSet(key, value) { this.db.prepare('INSERT INTO md_kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  link() { const r = this.db.prepare("SELECT data FROM google_link WHERE id='owner'").get(); return r ? JSON.parse(r.data) : null; }
  saveLink(d) { this.db.prepare("INSERT INTO google_link VALUES('owner',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(JSON.stringify(d)); }
  key() { return crypto.createHash('sha256').update(String(this.env.SOFIA_CALENDAR_TOKEN_KEY || '')).digest(); }
  seal(text) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', this.key(), iv); const d = Buffer.concat([c.update(text, 'utf8'), c.final()]); return [iv, c.getAuthTag(), d].map(b => b.toString('base64')).join('.'); }
  open(sealed) { const [iv, tag, d] = String(sealed).split('.').map(s => Buffer.from(s, 'base64')); const x = crypto.createDecipheriv('aes-256-gcm', this.key(), iv); x.setAuthTag(tag); return Buffer.concat([x.update(d), x.final()]).toString('utf8'); }
  configured() { return !!(this.env.GOOGLE_CALENDAR_CLIENT_ID && this.env.GOOGLE_CALENDAR_CLIENT_SECRET && this.env.SOFIA_CALENDAR_TOKEN_KEY); }
  redirectUri() { return String(this.config.publicBaseUrl || '').replace(/\/$/, '') + CALLBACK; }

  // ---------- 0.3.257: Gmail por conta de e-mail ----------
  // Cada conta do app E-mails pode entrar com a PROPRIA Conta Google (so leitura do Gmail), separada da Conta Google do
  // Perfil (Agenda/Drive). Ex.: silva.pedro@jota.ag lendo a propria caixa, com o Perfil em 01.pedrohenriquesilva@gmail.com.
  /** 0.3.258 "tomada pronta" para abrir ao publico: o Gmail pode usar outro projeto Google (ja verificado) so trocando
   * GOOGLE_MAIL_CLIENT_ID/GOOGLE_MAIL_CLIENT_SECRET no servidor; sem eles, usa o mesmo da Agenda/Drive (como hoje). */
  mailClient() { return {id: this.env.GOOGLE_MAIL_CLIENT_ID || this.env.GOOGLE_CALENDAR_CLIENT_ID, secret: this.env.GOOGLE_MAIL_CLIENT_SECRET || this.env.GOOGLE_CALENDAR_CLIENT_SECRET}; }
  mailLink(accountId) { const r = this.db.prepare('SELECT data FROM google_mail_link WHERE account_id=?').get(String(accountId || '')); return r ? JSON.parse(r.data) : null; }
  saveMailLink(accountId, d) { this.db.prepare('INSERT INTO google_mail_link VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET data=excluded.data').run(String(accountId), JSON.stringify(d)); }
  async dropMailLink(accountId) {
    const l = this.mailLink(accountId);
    if (l?.refresh) { try { await this.fetch(REVOKE + '?token=' + encodeURIComponent(this.open(l.refresh)), {method: 'POST'}); } catch { /* revogar e cortesia */ } }
    this.db.prepare('DELETE FROM google_mail_link WHERE account_id=?').run(String(accountId)); this.mailAccess.delete(String(accountId));
    return {ok: true};
  }
  mailConnectUrl(accountId, address, options = {}) {
    if (!this.configured()) throw new AppError('GOOGLE_NOT_CONFIGURED', 'A conexão Google ainda não foi configurada no servidor.', 503);
    if (!/^[\w-]{1,80}$/.test(String(accountId || ''))) throw new AppError('BAD_ACCOUNT', 'Conta de e-mail inválida.');
    const state = (options.app ? 'a.' : '') + 'm~' + accountId + '~' + crypto.randomBytes(24).toString('base64url');
    this.db.prepare('DELETE FROM google_oauth_state WHERE created_at<?').run(new Date(Date.now() - 15 * 60000).toISOString());
    this.db.prepare('INSERT INTO google_oauth_state VALUES(?,?)').run(state, now());
    const q = new URLSearchParams({client_id: this.mailClient().id, redirect_uri: this.redirectUri(), response_type: 'code', scope: MAIL_SCOPES.join(' '), access_type: 'offline', prompt: 'consent select_account', state});
    if (address) q.set('login_hint', String(address).slice(0, 200));
    return {url: AUTH + '?' + q.toString()};
  }
  async mailCallback(state, code) {
    const accountId = state.replace(/^a\./, '').split('~')[1] || '';
    let account = null; try { account = this.w.get(accountId); } catch { /* removida */ }
    if (!account || account.kind !== 'mail_account') return {ok: false, message: 'Essa conta de e-mail não existe mais no app. Nada foi conectado.'};
    const tokens = await this.tokenRequest({code, grant_type: 'authorization_code', redirect_uri: this.redirectUri()}, {mail: true});
    if (!tokens.refresh_token) return {ok: false, message: 'O Google não devolveu a permissão permanente. Remova a Sofia em myaccount.google.com/permissions e conecte de novo.'};
    let email = '';
    try { email = JSON.parse(Buffer.from(String(tokens.id_token || '').split('.')[1] || '', 'base64url').toString('utf8')).email || ''; } catch { /* sem e-mail */ }
    const own = String(account.data.address || '').trim().toLowerCase(), got = String(email).trim().toLowerCase();
    if (own && got && own !== got) {
      try { await this.fetch(REVOKE + '?token=' + encodeURIComponent(tokens.refresh_token), {method: 'POST'}); } catch { /* cortesia */ }
      return {ok: false, message: 'Você entrou com ' + got + ', mas esta conta é ' + own + '. Toque em Entrar com Google de novo e escolha ' + own + '.'};
    }
    if (!/gmail\.readonly/.test(String(tokens.scope || ''))) return {ok: false, message: 'O Google não liberou a leitura do Gmail. Toque em Entrar com Google de novo e marque a permissão de ler e-mails.'};
    this.saveMailLink(accountId, {refresh: this.seal(tokens.refresh_token), email: got || own, scopes: String(tokens.scope || ''), connected_at: now()});
    this.mailAccess.set(accountId, {token: tokens.access_token, exp: Date.now() + (Number(tokens.expires_in) || 3000) * 1000 - 60000});
    try { const a = this.w.get(accountId); this.w.save({revision: a.revision, data: {...a.data, provider: 'gmail_google', secret_set: true, last_error: ''}}, accountId); } catch { /* segue */ }
    return {ok: true, mail: true, message: 'Gmail de ' + (got || own) + ' conectado. Pode voltar para a Sofia.'};
  }
  async mailToken(accountId) {
    const cur = this.mailAccess.get(accountId); if (cur && cur.exp > Date.now()) return cur.token;
    const l = this.mailLink(accountId); if (!l?.refresh) throw new AppError('GMAIL_NOT_LINKED', 'Entre com Google nesta conta de e-mail.', 409);
    const t = await this.tokenRequest({grant_type: 'refresh_token', refresh_token: this.open(l.refresh)}, {mailAccount: accountId});
    this.mailAccess.set(accountId, {token: t.access_token, exp: Date.now() + (Number(t.expires_in) || 3000) * 1000 - 60000});
    return t.access_token;
  }
  /** Chamada ao Gmail com a Conta Google da propria conta de e-mail. */
  async mailCall(accountId, method, url) {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetch(url, {method, headers: {Authorization: 'Bearer ' + await this.mailToken(accountId)}});
      if (res.status === 401 && attempt === 0) { this.mailAccess.delete(accountId); continue; }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) { await new Promise(r => setTimeout(r, 400 * 2 ** attempt)); continue; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new AppError('GOOGLE_API', 'Gmail: ' + (data.error?.message || res.status), 502);
      return data;
    }
  }

  // ---------- OAuth ----------
  connectUrl(options = {}) {
    if (!this.configured()) throw new AppError('GOOGLE_NOT_CONFIGURED', 'A conexão Google ainda não foi configurada no servidor.', 503);
    // 'a.' no começo marca que o pedido veio do app: no fim, volta direto para ele.
    const state = (options.app ? 'a.' : '') + crypto.randomBytes(24).toString('base64url');
    this.db.prepare('DELETE FROM google_oauth_state WHERE created_at<?').run(new Date(Date.now() - 15 * 60000).toISOString());
    this.db.prepare('INSERT INTO google_oauth_state VALUES(?,?)').run(state, now());
    const q = new URLSearchParams({client_id: this.env.GOOGLE_CALENDAR_CLIENT_ID, redirect_uri: this.redirectUri(), response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state});
    return {url: AUTH + '?' + q.toString()};
  }
  async callback(params) {
    const state = String(params.get('state') || ''), code = String(params.get('code') || '');
    if (params.get('error')) return {ok: false, message: 'A autorização foi cancelada no Google. Nada foi conectado.'};
    const row = state && this.db.prepare('SELECT * FROM google_oauth_state WHERE state=?').get(state);
    if (!row || Date.now() - Date.parse(row.created_at) > 15 * 60000) return {ok: false, message: 'Este link de autorização expirou. Volte ao app e toque em Conectar de novo.'};
    this.db.prepare('DELETE FROM google_oauth_state WHERE state=?').run(state);
    if (state.replace(/^a\./, '').startsWith('m~')) return this.mailCallback(state, code);
    if (state.replace(/^a\./, '').startsWith('S~')) return this.senderCallback(code);
    const tokens = await this.tokenRequest({code, grant_type: 'authorization_code', redirect_uri: this.redirectUri()});
    if (!tokens.refresh_token) return {ok: false, message: 'O Google não devolveu a permissão permanente. Remova a Sofia em myaccount.google.com/permissions e conecte de novo.'};
    let email = '';
    try { email = JSON.parse(Buffer.from(String(tokens.id_token || '').split('.')[1] || '', 'base64url').toString('utf8')).email || ''; } catch { /* sem e-mail */ }
    const old = this.link() || {};
    this.saveLink({...old, refresh: this.seal(tokens.refresh_token), email, scopes: String(tokens.scope || ''), connected_at: now(), calendar_id: old.calendar_id || 'primary', sync: {}, last_error: '', conflicts: []});
    this.access = {token: tokens.access_token, exp: Date.now() + (Number(tokens.expires_in) || 3000) * 1000 - 60000};
    setTimeout(() => { this.ensureFolders().catch(() => {}).then(() => { this.sync().catch(() => {}); this.backupToDrive().catch(() => {}); this.offloadAttachments().catch(() => {}); this.offloadVoices().catch(() => {}); this.exportPages().catch(() => {}); try { this.kickMigration(); } catch { /* segue na próxima rodada */ } }); }, 50).unref?.();
    return {ok: true, message: 'Conta Google conectada' + (email ? ' (' + email + ')' : '') + '. Pode voltar para a Sofia.'};
  }
  /** Do app (janela do Google aberta pela própria Sofia): devolve um redirecionamento
   * para sofiaapp://google, que fecha a janela e volta ao app sozinho. */
  async callbackResponse(params) {
    const fromApp = String(params.get('state') || '').startsWith('a.');
    let r; try { r = await this.callback(params); } catch (e) { r = {ok: false, message: 'Não consegui concluir: ' + String(e.message || e).slice(0, 160)}; }
    if (fromApp) return {redirect: 'sofiaapp://google?ok=' + (r.ok ? '1' : '0') + (String(params.get('state') || '').includes('m~') ? '&mail=1' : '') + '&message=' + encodeURIComponent(r.message)};
    return {html: this.page(r)};
  }
  async callbackPage(params) {
    let r; try { r = await this.callback(params); } catch (e) { r = {ok: false, message: 'Não consegui concluir: ' + String(e.message || e).slice(0, 160)}; }
    return this.page(r);
  }
  page(r) {
    const color = r.ok ? '#2fc58b' : '#ff6b7a';
    return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sofia OS · Google</title><body style="font-family:system-ui;background:#17151e;color:#f5f0ff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="max-width:420px;padding:28px;text-align:center"><div style="font-size:48px">${r.ok ? '✅' : '⚠️'}</div><h2 style="color:${color}">${r.ok ? 'Pronto!' : 'Não deu certo'}</h2><p style="line-height:1.5">${r.message.replace(/[<>&]/g, '')}</p><p style="opacity:.7;font-size:13px">Pode fechar esta aba.</p></div></body></html>`;
  }
  async tokenRequest(extra, scope = {}) {
    const client = scope.mail || scope.mailAccount ? this.mailClient() : {id: this.env.GOOGLE_CALENDAR_CLIENT_ID, secret: this.env.GOOGLE_CALENDAR_CLIENT_SECRET};
    const body = new URLSearchParams({client_id: client.id, client_secret: client.secret, ...extra});
    const res = await this.fetch(TOKEN, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: body.toString()});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.error === 'invalid_grant' && scope.mailAccount) { this.db.prepare('DELETE FROM google_mail_link WHERE account_id=?').run(scope.mailAccount); throw new AppError('GMAIL_NOT_LINKED', 'O Google revogou o acesso desta caixa. Toque em Entrar com Google de novo.', 409); }
      if (data.error === 'invalid_grant' && !scope.mail && !scope.sender) { const l = this.link(); if (l) this.saveLink({...l, refresh: '', last_error: 'O Google revogou o acesso. Conecte de novo.'}); }
      throw new AppError('GOOGLE_TOKEN', 'O Google recusou a autorização (' + (data.error || res.status) + ').', 502);
    }
    return data;
  }
  async token() {
    if (this.access && this.access.exp > Date.now()) return this.access.token;
    if (this.tokenBusy) return this.tokenBusy; // 07/11/2026: varias miniaturas ao mesmo tempo pedem UMA renovacao, nao dezenas
    this.tokenBusy = this.tokenFresh().finally(() => { this.tokenBusy = null; }); return this.tokenBusy;
  }
  async tokenFresh() {
    const l = this.link(); if (!l || !l.refresh) throw new AppError('GOOGLE_NOT_CONNECTED', 'Conta Google não conectada.', 409);
    const t = await this.tokenRequest({grant_type: 'refresh_token', refresh_token: this.open(l.refresh)});
    this.access = {token: t.access_token, exp: Date.now() + (Number(t.expires_in) || 3000) * 1000 - 60000};
    return this.access.token;
  }
  async call(method, url, body, headers = {}) {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetch(url, {method, headers: {Authorization: 'Bearer ' + await this.token(), ...(body && !(body instanceof Buffer) && typeof body !== 'string' ? {'Content-Type': 'application/json'} : {}), ...headers}, body: body ? (body instanceof Buffer || typeof body === 'string' ? body : JSON.stringify(body)) : undefined});
      if (res.status === 401 && attempt === 0) { this.access = null; continue; }
      if ((res.status === 429 || res.status >= 500 || (res.status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(await res.clone().text().catch(() => '')))) && attempt < 3) { await new Promise(r => setTimeout(r, 400 * 2 ** attempt)); continue; }
      if (res.status === 204) return {};
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { const why = data.error?.errors?.[0], detail = why && why.message && why.message !== data.error?.message ? why.message : why?.reason || ''; const e = new AppError('GOOGLE_API', 'Google: ' + (data.error?.message || res.status) + (detail ? ' (' + detail + ')' : ''), res.status === 410 ? 410 : 502); e.googleStatus = res.status; e.googleReason = why?.reason || ''; throw e; }
      return data;
    }
  }
  async disconnect() {
    const l = this.link();
    if (l?.refresh) { try { await this.fetch(REVOKE + '?token=' + encodeURIComponent(this.open(l.refresh)), {method: 'POST'}); } catch { /* revogar é cortesia */ } }
    this.db.prepare("DELETE FROM google_link WHERE id='owner'").run(); this.access = null;
    return {ok: true};
  }

  // ---------- Agenda ----------
  async calendars() {
    const out = []; let pageToken = '';
    for (let i = 0; i < 10; i++) {
      const r = await this.call('GET', CAL + '/users/me/calendarList?maxResults=250&showHidden=false' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
      out.push(...(r.items || []).map(c => ({id: c.id, summary: c.summaryOverride || c.summary || c.id, accessRole: c.accessRole, selected: c.selected !== false, primary: !!c.primary})));
      if (!r.nextPageToken) break; pageToken = r.nextPageToken;
    }
    return out;
  }
  // ---------- remetente da Sofia (so envio) ----------
  /** Endereco que a Sofia usa para mandar e-mails (o mesmo do SMTP configurado no servidor). */
  // 07/11/2026: o remetente e SEMPRE o e-mail corporativo da Sofia. Nao usa SOFIA_SMTP_USER: no servidor ele estava com o
  // e-mail pessoal do usuario (a mistura que o Pedro apontou) e a trava recusava a conta certa da Sofia.
  senderAddress() { return String(this.config?.sofiaEmail || 'sofiaos.core@gmail.com').trim().toLowerCase(); }
  senderLink() { return this.kvGet('google.sender.v1'); }
  senderConnectUrl(options = {}) {
    if (!this.configured()) throw new AppError('GOOGLE_NOT_CONFIGURED', 'A conexão Google ainda não foi configurada no servidor.', 503);
    const state = (options.app ? 'a.' : '') + 'S~' + crypto.randomBytes(24).toString('base64url');
    this.db.prepare('DELETE FROM google_oauth_state WHERE created_at<?').run(new Date(Date.now() - 15 * 60000).toISOString());
    this.db.prepare('INSERT INTO google_oauth_state VALUES(?,?)').run(state, now());
    const q = new URLSearchParams({client_id: this.env.GOOGLE_CALENDAR_CLIENT_ID, redirect_uri: this.redirectUri(), response_type: 'code', scope: SEND_SCOPES.join(' '), access_type: 'offline', prompt: 'consent select_account', state});
    const want = this.senderAddress(); if (want) q.set('login_hint', want);
    return {url: AUTH + '?' + q.toString(), address: want};
  }
  async senderCallback(code) {
    const tokens = await this.tokenRequest({code, grant_type: 'authorization_code', redirect_uri: this.redirectUri()}, {sender: true});
    const revoke = async () => { try { await this.fetch(REVOKE + '?token=' + encodeURIComponent(tokens.refresh_token || tokens.access_token || ''), {method: 'POST'}); } catch { /* cortesia */ } };
    if (!tokens.refresh_token) return {ok: false, message: 'O Google não devolveu a permissão permanente. Tente de novo.'};
    let got = ''; try { got = String(JSON.parse(Buffer.from(String(tokens.id_token || '').split('.')[1] || '', 'base64url').toString('utf8')).email || '').toLowerCase(); } catch { /* sem e-mail */ }
    const want = this.senderAddress();
    if (want && got !== want) { await revoke(); return {ok: false, message: 'Você entrou com ' + (got || 'outra conta') + '. Para a Sofia mandar e-mails, entre com o e-mail da Sofia: ' + want + '.'}; }
    if (!/gmail\.send/.test(String(tokens.scope || ''))) { await revoke(); return {ok: false, message: 'O Google não liberou o envio de e-mails. Tente de novo e clique em Permitir.'}; }
    this.kvSet('google.sender.v1', {refresh: this.seal(tokens.refresh_token), email: got, connected_at: now()});
    this.senderAccess = {token: tokens.access_token, exp: Date.now() + (Number(tokens.expires_in) || 3000) * 1000 - 60000};
    return {ok: true, message: 'Pronto: a Sofia agora manda e-mails de ' + got + '. Pode voltar para a Sofia.'};
  }
  /** Pode enviar e-mail pelo remetente da Sofia. */
  canSendMail() { const l = this.senderLink(); return !!(l && l.refresh); }
  senderEmail() { return this.senderLink()?.email || this.senderAddress(); }
  async senderToken(force = false) {
    if (!force && this.senderAccess && this.senderAccess.exp > Date.now()) return this.senderAccess.token;
    const l = this.senderLink(); if (!l || !l.refresh) throw new AppError('SENDER_NOT_CONNECTED', 'O e-mail da Sofia ainda não foi ligado para envio.', 409);
    const body = new URLSearchParams({client_id: this.env.GOOGLE_CALENDAR_CLIENT_ID, client_secret: this.env.GOOGLE_CALENDAR_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: this.open(l.refresh)});
    const res = await this.fetch(TOKEN, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: body.toString()});
    const t = await res.json().catch(() => ({}));
    if (!res.ok) { if (t.error === 'invalid_grant') this.kvSet('google.sender.v1', null); throw new AppError('SENDER_TOKEN', 'O Google recusou o envio pelo e-mail da Sofia (' + (t.error || res.status) + ').', 502); }
    this.senderAccess = {token: t.access_token, exp: Date.now() + (Number(t.expires_in) || 3000) * 1000 - 60000};
    return this.senderAccess.token;
  }
  /** Envia uma mensagem pronta (cabecalhos + corpo) pelo e-mail da Sofia. */
  async sendRawMail(message) {
    const raw = Buffer.from(message, 'utf8').toString('base64url');
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {method: 'POST', headers: {Authorization: 'Bearer ' + await this.senderToken(attempt > 0), 'Content-Type': 'application/json'}, body: JSON.stringify({raw})});
      if (res.status === 401 && attempt === 0) continue;
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new AppError('SENDER_SEND', 'Gmail não enviou (' + (d.error?.message || res.status) + ').', 502); }
      return {from: this.senderEmail()};
    }
  }
  async status() {
    const l = this.link(), base = {configured: this.configured(), connected: !!(l && l.refresh)};
    if (!base.connected) return {...base, error: l?.last_error || undefined, redirect_uri: this.configured() ? this.redirectUri() : undefined};
    let calendars = l.calendars || [];
    try { calendars = await this.calendars(); this.saveLink({...this.link(), calendars}); } catch { /* usa a última lista conhecida */ }
    const cal = calendars.find(c => c.id === l.calendar_id) || calendars.find(c => c.primary);
    const last = (l.history || [])[0];
    const warnings = [];
    if (last) warnings.push(`Última sincronização: ${last.imported} recebidos do Google, ${last.created} novos, ${last.updated} atualizados, ${last.sent} enviados, ${last.removed} removidos${last.skipped ? ', ' + last.skipped + ' ignorados' : ''}.`);
    if (calendars.some(c => c.id !== (cal?.id) && c.selected)) warnings.push('Os outros calendários visíveis no seu Google também aparecem na Sofia, somente para leitura.');
    return {...base, syncing: this.busy, email: l.email, last_sync: l.last_sync, error: l.last_error || undefined, calendar_id: cal?.id || 'primary', calendar_name: cal?.summary || 'Principal',
      calendars, warnings, conflicts: l.conflicts || [], item_errors: l.item_errors || [], history: (l.history || []).slice(0, 10),
      gmail: {connected: /gmail\.readonly/.test(l.scopes || '')},
      drive: {...this.driveState(l), portable: {configured: String(process.env.SOFIA_BACKUP_PASSPHRASE || '').length >= 12, at: l.drive?.portable_at || '', error: l.drive?.portable_error || ''}, last_backup: l.drive?.last_backup, last_backup_error: l.drive?.last_error, backups: l.drive?.count || 0, folder: this.hiddenOn(l) ? 'área oculta da Sofia no seu Drive' : 'Sofia OS/Backups', folders: l.drive?.folders ? Object.keys(l.drive.folders) : [], attachments: this.attachmentStats(), voices: this.voiceStats(), pages: l.drive?.pages_exported || 0}};
  }
  select(calendarId) {
    const l = this.link(); if (!l?.refresh) throw new AppError('GOOGLE_NOT_CONNECTED', 'Conta Google não conectada.', 409);
    const cal = (l.calendars || []).find(c => c.id === calendarId);
    if (cal && !['owner', 'writer'].includes(cal.accessRole)) throw new AppError('GOOGLE_READONLY', 'Esse calendário é somente leitura no Google.');
    this.saveLink({...l, calendar_id: String(calendarId || 'primary'), sync: {}});
    setTimeout(() => this.sync().catch(() => {}), 50).unref?.();
    return {ok: true};
  }
  googleEntities() {
    const map = new Map();
    for (let offset = 0; ; offset += 500) {
      const page = this.w.list({kind: 'commitment', limit: 500, offset});
      for (const e of page) if (e.data.calendar_provider === 'google' && e.data.external_event_id) map.set((e.data.calendar_id || 'primary') + '|' + e.data.external_event_id, e);
      if (page.length < 500) break;
    }
    return map;
  }
  toData(ev, calId, readonly) {
    const allDay = !!ev.start?.date;
    let start = allDay ? new Date(ev.start.date + 'T03:00:00Z').toISOString() : iso(ev.start?.dateTime);
    let end = allDay ? new Date((ev.end?.date || plusDays(ev.start.date, 1)) + 'T03:00:00Z').toISOString() : iso(ev.end?.dateTime);
    if (end && start && end <= start) end = '';
    const popup = (ev.reminders?.overrides || []).find(r => r.method === 'popup');
    return {start_at: start, end_at: end, location: String(ev.location || '').slice(0, 900), remind_minutes: popup ? popup.minutes : '', reminders_json: JSON.stringify([...new Set((ev.reminders?.overrides || []).filter(r => r.method === 'popup').map(r => Number(r.minutes)).filter(n => Number.isFinite(n) && n >= 0))].sort((a, b) => a - b).slice(0, 5)), calendar_provider: 'google', calendar_id: calId,
      external_event_id: ev.id, sync_state: readonly ? 'readonly' : 'synced', calendar_all_day: allDay, calendar_date_start: allDay ? ev.start.date : '', calendar_date_end: allDay ? (ev.end?.date || plusDays(ev.start.date, 1)) : '',
      // Aniversário e outros tipos especiais do Google (local de trabalho, foco, fora do
      // escritório, criado a partir de e-mail) têm edição restrita na própria API do Google,
      // mesmo vindos do calendário principal — nunca tenta reenviar mudança para eles.
      google_etag: String(ev.etag || ''), google_recurring_id: String(ev.recurringEventId || ''), google_readonly: !!readonly || (!!ev.eventType && ev.eventType !== 'default')};
  }
  saveFromGoogle(ev, calId, readonly, existing, report) {
    const declined = (ev.attendees || []).some(a => a.self && a.responseStatus === 'declined');
    const cancelled = ev.status === 'cancelled' || declined;
    if (cancelled) {
      if (existing && existing.state !== 'cancelled') { report.removed++; try { return this.w.save({revision: existing.revision, state: 'cancelled', data: {...cleanData('commitment', existing.data), google_rev: existing.revision + 1}}, existing.id); } catch (e) { report.errors.push(String(e.message).slice(0, 120)); return existing; } }
      return existing;
    }
    if (!ev.start || (!ev.start.date && !ev.start.dateTime)) { report.skipped++; return null; }
    const data = this.toData(ev, calId, readonly);
    // 0.3.346 (Pedro: "evento criado pela Sofia so tem inicio; o fim nao existe se a pessoa nao colocar"): o Google exige um
    // fim, entao ao enviar um compromisso sem fim mandamos inicio + 1 h (eventBody). Na volta, se o compromisso daqui nao
    // tinha fim e o do Google e exatamente esse +1 h, continua SEM fim (fica so o ponto na linha do tempo). Se a pessoa
    // mudar o fim no Google para outro horario, vale o que ela pos.
    if (existing && !String(existing.data?.end_at || '') && data.start_at && data.end_at && !data.calendar_all_day
      && Date.parse(data.end_at) - Date.parse(data.start_at) === 3600000) data.end_at = '';
    let title = String(ev.summary || '(sem título)').slice(0, 240), content = String(ev.description || '').replace(/<[^>]+>/g, ' ').slice(0, 15000);
    const state = ev.status === 'tentative' ? 'pending' : 'confirmed';
    const attempt = (t, c) => existing
      ? this.w.save({revision: existing.revision, title: t, content: c, state: existing.state === 'done' ? 'done' : state, data: {...cleanData('commitment', existing.data), ...data, google_rev: existing.revision + 1}}, existing.id)
      : this.w.save({kind: 'commitment', title: t, content: c, area: 'Pessoal', privacy: 'private', state, data: {...data, google_rev: 1}});
    let saved;
    try { saved = attempt(title, content); }
    catch (e) {
      if (e.code === 'POSSIBLE_SECRET') { try { saved = attempt('(evento com dado sensível)', ''); } catch { report.skipped++; return null; } }
      else { report.skipped++; report.errors.push(String(e.message).slice(0, 120)); return null; }
    }
    if (existing) report.updated++; else report.created++;
    return saved;
  }
  async importCalendar(cal, readonly, map, report, link) {
    const state = (link.sync || {})[cal.id] || {};
    const full = !state.at || !state.full_at || Date.now() - Date.parse(state.full_at) > FULL_EVERY_MS;
    const started = new Date().toISOString();
    let pageToken = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams({maxResults: '250', singleEvents: 'true', showDeleted: 'true',
        timeMin: new Date(Date.now() - PAST_DAYS * 864e5).toISOString(), timeMax: new Date(Date.now() + FUTURE_DAYS * 864e5).toISOString()});
      if (!full) q.set('updatedMin', new Date(Date.parse(state.at) - 120000).toISOString());
      if (pageToken) q.set('pageToken', pageToken);
      const r = await this.call('GET', CAL + '/calendars/' + encodeURIComponent(cal.id) + '/events?' + q.toString());
      for (const ev of r.items || []) {
        report.imported++;
        if (ev.extendedProperties?.private?.sofia_task) continue; // 0.3.201: espelho de uma tarefa da Sofia
        if (report.imported % YIELD_EVERY === 0) await breathe();
        const key = cal.id + '|' + ev.id, existing = map.get(key);
        // Nada mudou no Google e nada mudou na Sofia: não regrava.
        if (existing && ev.etag && ev.etag === existing.data.google_etag && existing.revision <= (Number(existing.data.google_rev) || 0)) continue;
        if (existing && !readonly) {
          const localChanged = existing.revision > (Number(existing.data.google_rev) || 0);
          if (localChanged && ev.etag && ev.etag !== existing.data.google_etag) { report.conflicts.push({id: existing.id, reason: 'Alterado no Google e na Sofia: "' + existing.title.slice(0, 60) + '"'}); continue; }
          if (localChanged) continue;
        }
        if (!existing && (ev.status === 'cancelled')) continue; // cancelado que a Sofia nunca teve: nada a fazer
        const saved = this.saveFromGoogle(ev, cal.id, readonly, existing, report);
        if (saved) map.set(key, saved);
        if (report.imported >= MAX_EVENTS_PER_RUN) { report.partial = true; break; }
      }
      if (report.partial || !r.nextPageToken) break;
      pageToken = r.nextPageToken;
    }
    report.full = report.full || full;
    const next = {...(link.sync || {})};
    if (!report.partial) next[cal.id] = {at: started, full_at: full ? started : state.full_at};
    return next;
  }
  eventBody(e) {
    // 0.3.148: o Google responde "Bad Request" se o fim nao vier DEPOIS do inicio (dia inteiro: o fim
    // e exclusivo), se o lembrete nao for numero entre 0 e 40320, ou com data/hora invalida.
    const d = e.data, allDay = !!d.calendar_all_day && /^\d{4}-\d{2}-\d{2}$/.test(String(d.calendar_date_start || ''));
    const startMs = Date.parse(d.start_at || ''), endMs = Date.parse(d.end_at || '');
    const startDate = allDay ? String(d.calendar_date_start) : '';
    const endDate = allDay ? (/^\d{4}-\d{2}-\d{2}$/.test(String(d.calendar_date_end || '')) && String(d.calendar_date_end) > startDate ? String(d.calendar_date_end) : plusDays(startDate, 1)) : '';
    if (!allDay && !Number.isFinite(startMs)) throw Object.assign(new AppError('GOOGLE_BAD_EVENT', 'compromisso sem data e hora válidas', 422), {skipEvent: true});
    const start = allDay ? {date: startDate} : {dateTime: new Date(startMs).toISOString(), timeZone: TZ};
    const end = allDay ? {date: endDate} : {dateTime: new Date(Number.isFinite(endMs) && endMs > startMs ? endMs : startMs + 3600000).toISOString(), timeZone: TZ};
    const minutes = Number(d.remind_minutes), hasReminder = d.remind_minutes !== '' && d.remind_minutes != null && Number.isFinite(minutes) && minutes >= 0;
    return {summary: String(e.title || 'Compromisso').slice(0, 1000), description: e.content ? String(e.content).slice(0, 8000) : undefined, location: d.location ? String(d.location).slice(0, 1000) : undefined, start, end,
      // 0.3.201: varios avisos (como no Google Agenda): reminders_json manda; remind_minutes e o legado
      reminders: (list => list.length ? {useDefault: false, overrides: list.map(m => ({method: 'popup', minutes: m}))} : null)(reminderList(d)) || (hasReminder ? {useDefault: false, overrides: [{method: 'popup', minutes: Math.min(40320, Math.round(minutes))}]}
        // PATCH mescla objetos: mandar só {useDefault:true} num evento que JÁ tem lembretes próprios
        // vira "useDefault + overrides" e o Google recusa ("Cannot specify both default reminders and
        // overrides"). Mandar overrides vazio limpa os próprios e deixa só o padrão.
        : {useDefault: true, overrides: []})};
  }
  /** 0.3.201: tarefa programada (com data) da Sofia vira evento no Google Agenda, com os lembretes dela.
   * Concluida, cancelada, sem data ou apagada: sai do Google. A Sofia continua sendo a dona da tarefa. */
  async pushTasks(calId, report) {
    let rows = [];
    try { rows = this.db.prepare("SELECT t.id, t.title, t.state, t.due_at, t.revision, COALESCE(d.description,'') AS description, COALESCE(d.location,'') AS location, COALESCE(d.notifications_json,'[]') AS notifications_json, COALESCE(d.external_calendar_id,'') AS cal, COALESCE(d.external_event_id,'') AS ev, COALESCE(d.sync_state,'') AS sync_state FROM tasks t LEFT JOIN task_details d ON d.task_id=t.id").all(); } catch { return; }
    const mark = (id, provider, cal, ev, state) => this.db.prepare("INSERT INTO task_details(task_id,calendar_provider,external_calendar_id,external_event_id,sync_state) VALUES(?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET calendar_provider=excluded.calendar_provider,external_calendar_id=excluded.external_calendar_id,external_event_id=excluded.external_event_id,sync_state=excluded.sync_state").run(id, provider, cal, ev, state);
    for (const t of rows) {
      const wanted = !!t.due_at && !['done', 'cancelled'].includes(t.state), done = 'synced:' + t.revision;
      try {
        if (!wanted) {
          if (t.ev) { await this.call('DELETE', CAL + '/calendars/' + encodeURIComponent(t.cal || calId) + '/events/' + encodeURIComponent(t.ev)).catch(e => { if (![404, 410].includes(e.googleStatus)) throw e; }); mark(t.id, 'local', '', '', 'local'); report.removed++; }
          continue;
        }
        if (t.ev && t.sync_state === done) continue;
        await breathe();
        let mins = []; try { mins = JSON.parse(t.notifications_json).map(Number).filter(n => Number.isFinite(n) && n >= 0); } catch { mins = []; }
        const start = new Date(t.due_at), end = new Date(start.getTime() + 30 * 60000), target = t.cal || calId;
        const body = {summary: String(t.title).slice(0, 1000), description: ((t.description ? t.description + '\n\n' : '') + 'Tarefa da Sofia OS').slice(0, 8000), location: t.location || undefined,
          start: {dateTime: start.toISOString(), timeZone: 'America/Sao_Paulo'}, end: {dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo'},
          reminders: {useDefault: false, overrides: [...new Set(mins)].slice(0, 5).map(m => ({method: 'popup', minutes: Math.min(40320, Math.round(m))}))},
          extendedProperties: {private: {sofia_task: t.id}}};
        let ev;
        try { ev = await this.call(t.ev ? 'PATCH' : 'POST', CAL + '/calendars/' + encodeURIComponent(target) + '/events' + (t.ev ? '/' + encodeURIComponent(t.ev) : ''), body); }
        catch (e) { if (t.ev && [404, 410].includes(e.googleStatus)) ev = await this.call('POST', CAL + '/calendars/' + encodeURIComponent(target) + '/events', body); else throw e; }
        mark(t.id, 'google', target, ev.id, done); report.sent++;
      } catch (err) { report.errors.push('Enviar a tarefa "' + String(t.title).slice(0, 40) + '": ' + String(err.message).slice(0, 80)); }
    }
  }
  async pushLocal(calId, report) {
    for (const t of this.db.prepare('SELECT * FROM google_tombstones').all()) {
      try { await this.call('DELETE', CAL + '/calendars/' + encodeURIComponent(t.calendar_id) + '/events/' + encodeURIComponent(t.event_id)); report.removed++; }
      catch (e) { if (![404, 410].includes(e.googleStatus)) { report.errors.push('Remover no Google: ' + String(e.message).slice(0, 80)); continue; } }
      this.db.prepare('DELETE FROM google_tombstones WHERE calendar_id=? AND event_id=?').run(t.calendar_id, t.event_id);
    }
    for (let offset = 0; ; offset += 500) {
      const page = this.w.list({kind: 'commitment', limit: 500, offset});
      for (const e of page) {
        const d = e.data;
        if (d.calendar_provider !== 'google' || d.google_readonly || (!d.start_at && !d.calendar_date_start) || e.state === 'cancelled') continue;
        const target = d.calendar_id || calId, isNew = !d.external_event_id;
        // Ja enviado (ou recusado pelo Google) nesta versao: nao reenvia; editar o compromisso tenta de novo.
        if ((!isNew || d.sync_state === 'error') && e.revision <= (Number(d.google_rev) || 0)) continue;
        await breathe();
        try {
          const url = CAL + '/calendars/' + encodeURIComponent(target) + '/events' + (isNew ? '' : '/' + encodeURIComponent(d.external_event_id));
          let ev;
          try { ev = await this.call(isNew ? 'POST' : 'PATCH', url, this.eventBody(e)); }
          catch (err) {
            // Rede de segurança: se o Google ainda reclamar de lembretes, reenvia sem mexer neles
            // (o horário/título/descrição é o que importa; lembrete não pode travar o resto).
            if (/default reminders and overrides|reminders/i.test(String(err.message))) { const {reminders, ...semLembretes} = this.eventBody(e); ev = await this.call(isNew ? 'POST' : 'PATCH', url, semLembretes); }
            else if (err.googleStatus === 400) { const b = this.eventBody(e); ev = await this.call(isNew ? 'POST' : 'PATCH', url, {summary: b.summary, start: b.start, end: b.end}); }
            else throw err;
          }
          this.w.save({revision: e.revision, data: {...cleanData(e.kind, d), calendar_id: target, external_event_id: ev.id, google_etag: ev.etag || '', sync_state: 'synced', google_rev: e.revision + 1}}, e.id);
          report.sent++;
        } catch (err) {
          // Aniversário e outros tipos especiais: o Google recusa a edição pela API mesmo
          // vindos do calendário principal. Em vez de tentar de novo para sempre, marca como
          // só-leitura agora mesmo — resolve sozinho, sem esperar a próxima sincronização completa.
          if (/not valid for t|cannot be (updated|modified)|read-?only/i.test(String(err.message))) { try { this.w.save({revision: e.revision, data: {...cleanData(e.kind, d), google_readonly: true, google_rev: e.revision + 1}}, e.id); } catch { /* tenta de novo na próxima */ } }
          else if (err.googleStatus === 400 || err.skipEvent) {
            // Problema DESTE compromisso (nao da conta): guarda o motivo nele e para de reenviar a mesma versao.
            const why = String(err.message).replace(/^Google: /, '').slice(0, 160);
            try { this.w.save({revision: e.revision, data: {...cleanData(e.kind, d), sync_state: 'error', google_rev: e.revision + 1}}, e.id); } catch { /* tenta na proxima */ }
            report.itemErrors.push({id: e.id, title: e.title.slice(0, 60), reason: why});
          }
          else report.errors.push('Enviar "' + e.title.slice(0, 40) + '": ' + String(err.message).slice(0, 80));
        }
      }
      if (page.length < 500) break;
    }
  }
  async sync() {
    if (this.busy) return {ok: true, skipped: true};
    const l = this.link(); if (!l?.refresh) throw new AppError('GOOGLE_NOT_CONNECTED', 'Conta Google não conectada.', 409);
    this.busy = true;
    const report = {at: now(), imported: 0, created: 0, updated: 0, sent: 0, removed: 0, skipped: 0, conflicts: [], errors: [], itemErrors: [], full: false, calendars: 0, ms: 0};
    const t0 = Date.now();
    try {
      const calendars = await this.calendars();
      const main = calendars.find(c => c.id === l.calendar_id) || calendars.find(c => c.primary) || {id: 'primary', accessRole: 'owner'};
      const map = this.googleEntities();
      let link = {...this.link(), calendars};
      for (const cal of calendars.filter(c => c.id === main.id || c.selected)) {
        report.calendars++;
        link.sync = await this.importCalendar(cal, cal.id !== main.id || !['owner', 'writer'].includes(cal.accessRole), map, report, link);
      }
      await this.pushLocal(main.id, report);
      await this.pushTasks(main.id, report);
      report.ms = Date.now() - t0;
      link = {...this.link(), sync: link.sync, calendars, last_sync: now(), last_error: report.errors.length ? report.errors[0] : '', item_errors: report.itemErrors.slice(0, 20), conflicts: report.conflicts.slice(0, 50),
        history: [{...report, conflicts: report.conflicts.length, errors: report.errors.slice(0, 5)}, ...((this.link() || {}).history || [])].slice(0, 20)};
      this.saveLink(link);
      return {ok: true, ...report, conflicts: report.conflicts.length};
    } catch (e) {
      const cur = this.link(); if (cur) this.saveLink({...cur, last_error: String(e.message).slice(0, 200)});
      throw e;
    } finally { this.busy = false; }
  }

  // ---------- Drive ----------
  // 0.3.244: os arquivos da Sofia moram na ÁREA OCULTA do app no Drive (appDataFolder, escopo drive.appdata).
  // Ela não aparece no Drive (site, celular, computador), então ninguém apaga sem querer; só "Excluir dados
  // ocultos do app" nas configurações do Drive remove, e isso é de propósito. A pessoa vê, abre e copia tudo
  // pela tela "Arquivos da Sofia" (app e site) e pode exportar uma cópia visível quando quiser.
  // Conta conectada antes disso (só drive.file) continua na pasta visível "Sofia OS" até reconectar; depois
  // a migração copia cada arquivo para a área oculta, confere o tamanho, repõe a referência e só então
  // manda o original para a lixeira.
  driveOn(l = this.link()) { return !!(l?.refresh && /drive\.(file|appdata)/.test(l.scopes || '')); }
  hiddenOn(l = this.link()) { return !!(l?.refresh && /drive\.appdata/.test(l.scopes || '')); }
  visibleOn(l = this.link()) { return !!(l?.refresh && /drive\.file/.test(l.scopes || '')); }
  /** Ainda há (ou pode haver) arquivos na pasta visível antiga para levar à área oculta. */
  legacyPending(l = this.link()) { return this.visibleOn(l) && (!this.hiddenOn(l) || l.drive?.migration?.state !== 'done'); }
  /** Grava só o que mudou no estado do Drive, sem apagar o resto (antes o backup apagava a lista de pastas). */
  saveDrive(patch) { const cur = this.link(); if (cur) this.saveLink({...cur, drive: {...(cur.drive || {}), ...patch}}); }
  static q(v) { return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  static multipart(meta, mime, bytes) {
    const boundary = 'sofia' + id(), type = mime || 'application/octet-stream';
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--`)]);
    return {body, type: 'multipart/related; boundary=' + boundary};
  }
  static CATS = [
    {key: 'Páginas', label: 'Páginas', hint: 'Cada página sua em texto (.md), atualizada quando muda.'},
    {key: 'Anexos', label: 'Anexos', hint: 'Capas, fotos e arquivos das páginas e registros.'},
    {key: 'Comprovantes', label: 'Comprovantes', hint: 'Fotos enviadas na conversa (cupons e notas para Finanças).'},
    {key: 'Áudios', label: 'Áudios', hint: 'Mensagens de voz da conversa (a transcrição fica na conversa).'},
    {key: 'Backup com senha', label: 'Backup com senha', hint: 'Abre sem o servidor, com a senha de backup (veja COMO-RESTAURAR.md).'},
    {key: 'Backups', label: 'Backups diários', hint: 'Cópias criptografadas do banco; só abrem com a chave do servidor.'},
  ];
  /** Onde um arquivo novo daquela categoria vai morar: área oculta, ou a pasta visível antiga se ainda não reconectou. */
  async target(cat) {
    const l = this.link(); if (!this.driveOn(l)) return null;
    if (this.hiddenOn(l)) return {parents: ['appDataFolder'], appProperties: {sofia_cat: cat}};
    const dir = await this.folderId(cat); return dir ? {parents: [dir], appProperties: {sofia_cat: cat}} : null;
  }
  async upload({name, mime, bytes, cat, description, props, extra}) {
    const t = await this.target(cat); if (!t) return null;
    const meta = {name, parents: t.parents, mimeType: mime || 'application/octet-stream', ...(description ? {description} : {}), appProperties: {...(props || {}), ...t.appProperties}, ...(extra || {})};
    const {body, type} = GoogleService.multipart(meta, mime, bytes);
    return this.call('POST', UPLOAD + '/files?uploadType=multipart&fields=id,size', body, {'Content-Type': type});
  }
  /** Lista os arquivos de uma categoria, na área oculta ou na pasta visível (conforme a conexão). */
  async listCat(cat, {orderBy = 'createdTime desc', pageSize = 100, fields = 'files(id,name)', pageToken = ''} = {}) {
    const l = this.link(); if (!this.driveOn(l)) return {files: []};
    const params = new URLSearchParams({orderBy, pageSize: String(pageSize), fields: /nextPageToken/.test(fields) ? fields : 'nextPageToken,' + fields});
    if (pageToken) params.set('pageToken', pageToken);
    if (this.hiddenOn(l)) { params.set('spaces', 'appDataFolder'); params.set('q', `appProperties has { key='sofia_cat' and value='${GoogleService.q(cat)}' } and trashed=false`); }
    else { const dir = await this.folderId(cat); if (!dir) return {files: []}; params.set('q', `'${dir}' in parents and trashed=false`); }
    return this.call('GET', DRIVE + '/files?' + params.toString());
  }
  async folder(name, parent) {
    const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false` + (parent ? ` and '${parent}' in parents` : '');
    const found = await this.call('GET', DRIVE + '/files?fields=files(id,name)&q=' + encodeURIComponent(q));
    if (found.files?.length) return found.files[0].id;
    return (await this.call('POST', DRIVE + '/files?fields=id', {name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? {parents: [parent]} : {})})).id;
  }
  // ---------- Pasta visível antiga (só para quem ainda não reconectou) ----------
  //   Sofia OS/Backups, Backup com senha, Anexos, Comprovantes, Áudios e Páginas.
  // Os ids ficam guardados no link; nunca se cria pasta repetida (folder() reaproveita).
  static FOLDERS = ['Backups', 'Anexos', 'Áudios', 'Páginas', 'Comprovantes', 'Backup com senha'];
  // offloadAttachments/offloadVoices/exportPages rodam juntos, sem esperar um pelo outro: se
  // cada um corresse ensureFolders() por conta própria, cada um buscaria "ainda não existe" ao
  // mesmo tempo e cada um criaria a própria pasta "Sofia OS" — foi assim que apareceram pastas
  // repetidas. Uma chamada em andamento é compartilhada por todo mundo que pedir enquanto isso.
  ensureFolders() {
    if (!this.ensureFoldersPromise) this.ensureFoldersPromise = this.ensureFoldersOnce().finally(() => { this.ensureFoldersPromise = null; });
    return this.ensureFoldersPromise;
  }
  async ensureFoldersOnce() {
    const l = this.link(); if (!this.visibleOn(l) || this.hiddenOn(l)) return null; // área oculta: nenhuma pasta visível é criada
    // 0.3.244: a pasta foi para a lixeira (sem querer)? Tira de lá antes de qualquer coisa, para nada se perder.
    const cachedRoot = l.drive?.folders?.root;
    if (cachedRoot) {
      try {
        const meta = await this.call('GET', DRIVE + '/files/' + cachedRoot + '?fields=id,trashed');
        if (meta && meta.trashed === true) {
          await this.call('PATCH', DRIVE + '/files/' + cachedRoot, {trashed: false});
          this.w.notify('drive', 'Pasta da Sofia restaurada', 'A pasta "Sofia OS" do seu Google Drive tinha ido para a lixeira e a Sofia a tirou de lá. Para ela sair do Drive sem risco, abra Perfil → Conta Google e toque em Reconectar: os arquivos passam para uma área oculta que só a Sofia acessa.', null, 'info', 'drive-restored-' + now().slice(0, 10));
        }
      } catch { /* a conferência é cortesia: se falhar, segue como antes */ }
    }
    const root = await this.dedupedFolder('Sofia OS'); const folders = {root};
    for (const name of GoogleService.FOLDERS) folders[name] = await this.dedupedFolder(name, root);
    this.saveDrive({folders});
    return folders;
  }
  /** Como folder(), mas se achar MAIS de uma pasta com o mesmo nome (de uma corrida antiga, antes
   * desta correção), mantém a mais velha, move o conteúdo das outras para dentro dela e manda as
   * outras para a lixeira — assim uma bagunça já feita se desfaz sozinha, sem mexer no Drive à mão. */
  async dedupedFolder(name, parent) {
    const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false` + (parent ? ` and '${parent}' in parents` : '');
    const found = await this.call('GET', DRIVE + '/files?fields=files(id,name,createdTime)&orderBy=createdTime&q=' + encodeURIComponent(q));
    const files = found.files || [];
    if (!files.length) return (await this.call('POST', DRIVE + '/files?fields=id', {name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? {parents: [parent]} : {})})).id;
    const [keep, ...extra] = files;
    for (const dup of extra) {
      const inside = await this.call('GET', DRIVE + '/files?fields=files(id,parents)&q=' + encodeURIComponent(`'${dup.id}' in parents and trashed=false`));
      for (const item of inside.files || []) await this.call('PATCH', DRIVE + '/files/' + item.id + '?addParents=' + keep.id + '&removeParents=' + dup.id, {}).catch(() => {});
      await this.call('PATCH', DRIVE + '/files/' + dup.id, {trashed: true}).catch(() => {});
    }
    return keep.id;
  }
  // Antes, a arrumação de pastas repetidas só rodava ao CONECTAR a conta: quem já tinha os IDs
  // guardados de antes nunca via as duplicatas sumirem. Agora, mesmo com IDs guardados, confere
  // uma vez por início do servidor e depois a cada 6 h (é só uma listagem; junta se precisar).
  static FOLDER_RECHECK_MS = 6 * 3600 * 1000;
  async folderId(name) {
    const l = this.link(), cached = l?.drive?.folders?.[name];
    const stale = !this.foldersCheckedAt || Date.now() - this.foldersCheckedAt > GoogleService.FOLDER_RECHECK_MS;
    if (cached && !stale) return cached;
    try {
      const f = await this.ensureFolders();
      if (f) { this.foldersCheckedAt = Date.now(); return f[name]; }
    } catch (e) { if (!cached) throw e; this.foldersCheckedAt = Date.now(); }
    return cached || null;
  }

  // ---------- Migração: pasta visível → área oculta ----------
  /** As pastas "Sofia OS" visíveis que a Sofia criou (pode haver mais de uma, de versões antigas) e as subpastas. Só procura, nunca cria. */
  async legacyTree() {
    const l = this.link(); if (!this.visibleOn(l)) return [];
    const roots = new Set(); if (l.drive?.folders?.root) roots.add(l.drive.folders.root);
    const found = await this.call('GET', DRIVE + '/files?fields=files(id)&q=' + encodeURIComponent("mimeType='application/vnd.google-apps.folder' and name='Sofia OS' and trashed=false"));
    for (const f of found.files || []) roots.add(f.id);
    const out = [];
    for (const root of roots) {
      out.push({id: root, cat: 'Anexos', root: true});
      const subs = await this.call('GET', DRIVE + '/files?fields=files(id,name)&q=' + encodeURIComponent(`'${root}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`));
      for (const s of subs.files || []) out.push({id: s.id, cat: GoogleService.FOLDERS.includes(s.name) ? s.name : 'Anexos', parent: root});
    }
    return out;
  }
  async legacyFiles(node, pageSize = 100) {
    const r = await this.call('GET', DRIVE + '/files?' + new URLSearchParams({pageSize: String(pageSize), fields: 'files(id,name,mimeType,size,modifiedTime,appProperties)', q: `'${node.id}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`}).toString());
    return (r.files || []).filter(f => !String(f.mimeType || '').startsWith('application/vnd.google-apps.'));
  }
  /** Troca, no banco, a referência do arquivo antigo pela cópia nova (anexos, áudios e páginas). */
  repoint(oldId, newId) {
    try { this.db.prepare('UPDATE attachments SET drive_id=? WHERE drive_id=?').run(newId, oldId); } catch { /* sem tabela */ }
    try { this.db.prepare('UPDATE voice_messages SET drive_id=? WHERE drive_id=?').run(newId, oldId); } catch { /* sem tabela */ }
    const map = this.kvGet('drive_pages');
    if (map) { let changed = false; for (const k of Object.keys(map)) if (map[k] && map[k].file === oldId) { map[k] = {...map[k], file: newId}; changed = true; } if (changed) this.kvSet('drive_pages', map); }
  }
  /** Copia um arquivo da pasta visível para a área oculta. Ordem segura: lê, envia, confere o tamanho,
   * repõe a referência e só então manda o original para a lixeira (fica lá 30 dias). Se uma rodada
   * anterior já tinha copiado (e caiu antes de jogar o original fora), reaproveita a cópia. */
  async copyToHidden(f) {
    const meta = await this.call('GET', DRIVE + '/files/' + f.id + '?fields=id,name,mimeType,description,appProperties,size,createdTime,modifiedTime');
    const already = await this.call('GET', DRIVE + '/files?' + new URLSearchParams({spaces: 'appDataFolder', pageSize: '1', fields: 'files(id,size)', q: `appProperties has { key='sofia_from' and value='${GoogleService.q(f.id)}' } and trashed=false`}).toString());
    let copy = (already.files || [])[0];
    if (!copy) {
      const res = await this.fetch(DRIVE + '/files/' + f.id + '?alt=media', {headers: {Authorization: 'Bearer ' + await this.token()}});
      if (!res.ok) throw new AppError('GOOGLE_API', 'Não consegui ler "' + meta.name + '" no Drive (' + res.status + ').', 502);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (meta.size != null && Number(meta.size) !== bytes.length) throw new AppError('GOOGLE_API', 'Leitura incompleta de "' + meta.name + '".', 502);
      const times = {...(meta.createdTime ? {createdTime: meta.createdTime} : {}), ...(meta.modifiedTime ? {modifiedTime: meta.modifiedTime} : {})};
      copy = await this.upload({name: meta.name, mime: meta.mimeType, bytes, cat: f.cat, description: meta.description, props: {...(meta.appProperties || {}), sofia_from: f.id}, extra: times});
      if (!copy?.id) throw new AppError('GOOGLE_API', 'O Drive não confirmou a cópia de "' + meta.name + '".', 502);
      if (copy.size != null && Number(copy.size) !== bytes.length) { await this.call('DELETE', DRIVE + '/files/' + copy.id).catch(() => {}); throw new AppError('GOOGLE_API', 'A cópia de "' + meta.name + '" chegou com tamanho diferente.', 502); }
    }
    this.repoint(f.id, copy.id);
    await this.call('PATCH', DRIVE + '/files/' + f.id, {trashed: true});
    return copy.id;
  }
  /** Uma rodada da migração (até `batch` arquivos). Um arquivo que falha 3 vezes fica onde está e é contado. */
  async migrateToHidden(batch = 6) {
    const l = this.link();
    if (!this.hiddenOn(l) || !this.visibleOn(l) || l.drive?.migration?.state === 'done') return {done: true, moved: 0};
    if (this.migrating || this.exportingPages || this.shrinking) return {busy: true, moved: 0};
    this.migrating = true; let moved = 0;
    try {
      const prev = l.drive?.migration || {};
      const mig = {moved: 0, failed: 0, skipped: [], started_at: now(), ...prev, state: 'running'};
      const skip = new Set(mig.skipped || []), tree = await this.legacyTree(), files = [];
      for (const node of tree) {
        if (files.length >= batch) break;
        for (const f of await this.legacyFiles(node)) if (files.length < batch && !skip.has(f.id)) files.push({...f, cat: node.cat});
      }
      this.migrationTries = this.migrationTries || new Map();
      for (const f of files) {
        try { await this.copyToHidden(f); moved++; mig.error = ''; }
        catch (e) {
          if (e.code === 'GOOGLE_TOKEN' || e.code === 'GOOGLE_NOT_CONNECTED') throw e;
          const n = (this.migrationTries.get(f.id) || 0) + 1; this.migrationTries.set(f.id, n);
          mig.error = String(e.message).slice(0, 200);
          if (n >= 3) { skip.add(f.id); mig.failed = (mig.failed || 0) + 1; }
        }
      }
      mig.moved = (mig.moved || 0) + moved; mig.skipped = [...skip];
      if (files.length) { this.saveDrive({migration: mig}); return {done: false, moved}; }
      // Acabou: sem nada pendurado, a pasta visível antiga vai para a lixeira (fica 30 dias no Drive).
      const roots = tree.filter(n => n.root), left = mig.skipped.length;
      if (!left) for (const r of roots) await this.call('PATCH', DRIVE + '/files/' + r.id, {trashed: true}).catch(() => {});
      const cur = this.link(), drive = {...(cur.drive || {}), migration: {...mig, state: 'done', finished_at: now(), left, error: ''}};
      delete drive.folders; this.saveLink({...cur, drive});
      if (roots.length) this.w.notify('drive', 'Arquivos da Sofia protegidos',
        'Seus arquivos agora ficam numa área oculta do seu Google Drive, que só a Sofia acessa: ninguém apaga sem querer. Veja e abra tudo em Perfil → Conta Google → Arquivos da Sofia. '
        + (left ? left + (left === 1 ? ' arquivo não pôde ser copiado e continua' : ' arquivos não puderam ser copiados e continuam') + ' na pasta "Sofia OS", que por isso não foi apagada.' : 'A pasta antiga "Sofia OS" foi para a lixeira do Drive (fica lá 30 dias).'),
        null, 'info', 'drive-migrated');
      return {done: true, moved};
    } finally { this.migrating = false; }
  }
  /** Roda a migração até o fim, em rodadas curtas (o servidor segue respondendo entre elas). */
  kickMigration() {
    const l = this.link();
    if (this.migrationChain || !this.hiddenOn(l) || !this.visibleOn(l) || l.drive?.migration?.state === 'done') return this.migrationChain || null;
    const pause = ms => new Promise(r => setTimeout(r, this.migrationPauseMs ?? ms));
    this.migrationChain = (async () => {
      try { for (let i = 0; i < 5000; i++) { const r = await this.migrateToHidden(); if (r.done) break; await pause(r.busy ? 3000 : 300); } }
      catch (e) { const cur = this.link(); if (cur) this.saveDrive({migration: {...(cur.drive?.migration || {}), error: String(e.message).slice(0, 200)}}); }
      finally { this.migrationChain = null; }
    })();
    return this.migrationChain;
  }
  /** Área oculta apagada de propósito (Drive → Gerenciar apps → Excluir dados ocultos)? A Sofia percebe,
   * reenvia as páginas e um backup novo e conta com clareza o que não volta sozinho. A cada 6 h. */
  async checkHidden(force = false) {
    const l = this.link();
    if (!this.hiddenOn(l) || this.migrating || this.migrationChain || (this.visibleOn(l) && l.drive?.migration?.state !== 'done')) return {skipped: true};
    if (!force && this.hiddenCheckedAt && Date.now() - this.hiddenCheckedAt < GoogleService.FOLDER_RECHECK_MS) return {skipped: true};
    this.hiddenCheckedAt = Date.now();
    let inDrive = 0; try { inDrive = this.db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE drive_id IS NOT NULL').get().n; } catch { /* sem tabela */ }
    let voices = 0; try { voices = this.db.prepare('SELECT COUNT(*) AS n FROM voice_messages WHERE drive_id IS NOT NULL').get().n; } catch { /* sem tabela */ }
    const pages = Object.keys(this.kvGet('drive_pages') || {}).length;
    if (!inDrive && !voices && !pages && !l.drive?.last_backup) return {ok: true};
    const r = await this.call('GET', DRIVE + '/files?' + new URLSearchParams({spaces: 'appDataFolder', pageSize: '1', fields: 'files(id)', q: 'trashed=false'}).toString());
    if ((r.files || []).length) return {ok: true};
    this.kvSet('drive_pages', {});
    const lost = inDrive + voices;
    this.w.notify('drive', 'Os dados ocultos da Sofia no Drive foram apagados',
      'Alguém usou "Excluir dados ocultos do app" nas configurações do Google Drive. A Sofia já está enviando de novo as páginas e um backup novo.'
      + (lost ? ' ' + lost + (lost === 1 ? ' anexo ou áudio antigo estava' : ' anexos e áudios antigos estavam') + ' só lá e não voltam sozinhos; dá para recuperar restaurando um backup.' : ''),
      null, 'info', 'drive-wiped-' + now().slice(0, 10));
    this.saveDrive({wiped_at: now()});
    this.backupToDrive(true).catch(() => {}); this.exportPages().catch(() => {});
    return {wiped: true, lost};
  }

  // ---------- Arquivos da Sofia (tela no app e no site) ----------
  notConnected() { return new AppError('GOOGLE_NOT_CONNECTED', 'Conecte a Conta Google em Perfil → Conta Google para ver os arquivos da Sofia.', 409); }
  driveState(l = this.link()) {
    const d = l?.drive || {}, e = d.export;
    return {connected: this.driveOn(l), mode: this.hiddenOn(l) ? 'hidden' : 'folder', needs_reconnect: this.driveOn(l) && !this.hiddenOn(l),
      migration: d.migration ? {state: d.migration.state, moved: d.migration.moved || 0, left: d.migration.left || 0, error: d.migration.error || '', finished_at: d.migration.finished_at || ''} : {state: this.hiddenOn(l) ? 'running' : 'none', moved: 0, left: 0, error: '', finished_at: ''},
      export: e ? {state: e.state, folder_name: e.folder_name, link: e.link || '', total: e.total || 0, done: e.done || 0, failed: e.failed || 0, bytes: e.bytes || 0, started_at: e.started_at || '', finished_at: e.finished_at || '', error: e.error || ''} : null,
      wiped_at: d.wiped_at || ''};
  }
  describe(f) {
    const p = f.appProperties || {};
    const title = entityId => { try { const e = this.w.get(entityId); return e && e.title ? String(e.title) : ''; } catch { return ''; } };
    let origin = '';
    if (p.sofia_page) { const t = title(p.sofia_page); origin = t ? 'Página “' + t + '”' : 'Página apagada na Sofia'; }
    else if (p.sofia_entity) { const t = title(p.sofia_entity); origin = t ? 'De “' + t + '”' : ''; }
    else if (p.sofia_voice) origin = 'Mensagem de voz da conversa';
    return {id: f.id, name: f.name || 'arquivo', mime: f.mimeType || '', size: Number(f.size) || 0, modified: f.modifiedTime || '', origin, deletable: GoogleService.deletable(p.sofia_cat || f.cat, p)};
  }
  /** Resumo: quantos arquivos e quanto espaço por categoria, e o espaço do Drive. */
  async driveSummary() {
    const l = this.link(); if (!this.driveOn(l)) throw this.notConnected();
    const counts = Object.fromEntries(GoogleService.CATS.map(c => [c.key, {count: 0, bytes: 0}]));
    const add = (cat, size) => { const k = counts[cat] ? cat : 'Anexos'; counts[k].count++; counts[k].bytes += Number(size) || 0; };
    if (this.hiddenOn(l)) {
      let token = '';
      for (let i = 0; i < 30; i++) {
        const r = await this.call('GET', DRIVE + '/files?' + new URLSearchParams({spaces: 'appDataFolder', pageSize: '1000', fields: 'nextPageToken,files(size,appProperties)', q: 'trashed=false', ...(token ? {pageToken: token} : {})}).toString());
        for (const f of r.files || []) add(f.appProperties?.sofia_cat || 'Anexos', f.size);
        if (!r.nextPageToken) break; token = r.nextPageToken;
      }
    }
    if (this.legacyPending(l)) for (const node of await this.legacyTree()) for (const f of await this.legacyFiles(node, 1000)) add(node.cat, f.size);
    let quota = null;
    quota = await this.driveQuota();
    const out = {...this.driveState(this.link()), categories: GoogleService.CATS.map(c => ({...c, ...counts[c.key], deletable: GoogleService.deletable(c.key)})), quota, receipts_cleanup: this.receiptsCleanup(), voices_cleanup: this.voicesCleanup()};
    this.summaryCache = {at: Date.now(), value: out};
    return out;
  }
  /** Espaço da conta Google como o Drive mostra: total, usado (no Drive, na lixeira do Drive, e o resto em
   * Gmail e Fotos) e livre. Plano sem limite vem com limit 0. */
  async driveQuota() {
    try {
      const a = await this.call('GET', DRIVE + '/about?fields=storageQuota'), q = a.storageQuota || {};
      return {limit: Number(q.limit) || 0, usage: Number(q.usage) || 0, usage_in_drive: Number(q.usageInDrive) || 0, usage_in_trash: Number(q.usageInDriveTrash) || 0};
    } catch { return null; }
  }
  /** Para o cartão "Armazenamento" das configurações: cota ao vivo (uma chamada leve) e o espaço da Sofia
   * por tipo, reaproveitando o último resumo por até 10 min (contar os arquivos é a parte cara). */
  async driveStorage() {
    const l = this.link(); if (!this.driveOn(l)) throw this.notConnected();
    const cached = this.summaryCache && Date.now() - this.summaryCache.at < 10 * 60000 ? this.summaryCache.value : null;
    if (!cached) { const s = await this.driveSummary(); return {quota: s.quota, categories: s.categories.map(c => ({key: c.key, label: c.label, count: c.count, bytes: c.bytes})), sofia_bytes: s.categories.reduce((n, c) => n + c.bytes, 0), mode: s.mode}; }
    const quota = await this.driveQuota();
    return {quota, categories: cached.categories.map(c => ({key: c.key, label: c.label, count: c.count, bytes: c.bytes})), sofia_bytes: cached.categories.reduce((n, c) => n + c.bytes, 0), mode: cached.mode};
  }
  /** Arquivos de uma categoria, do mais novo para o mais antigo (100 por página). */
  async driveList(cat, pageToken = '') {
    if (!GoogleService.CATS.some(c => c.key === cat)) throw new AppError('BAD_CATEGORY', 'Categoria de arquivos desconhecida.', 400);
    const l = this.link(); if (!this.driveOn(l)) throw this.notConnected();
    const items = []; let next = '';
    if (this.hiddenOn(l)) {
      const r = await this.call('GET', DRIVE + '/files?' + new URLSearchParams({spaces: 'appDataFolder', pageSize: '100', orderBy: 'modifiedTime desc', fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,appProperties)', q: `appProperties has { key='sofia_cat' and value='${GoogleService.q(cat)}' } and trashed=false`, ...(pageToken ? {pageToken} : {})}).toString());
      items.push(...(r.files || [])); next = r.nextPageToken || '';
    }
    if (!pageToken && this.legacyPending(l)) for (const node of (await this.legacyTree()).filter(n => n.cat === cat && !n.root)) items.push(...(await this.legacyFiles(node, 1000)).map(f => ({...f, cat})));
    items.sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
    return {cat, items: items.map(f => this.describe(f)), next_page: next};
  }
  /** Conteúdo de um arquivo da Sofia (o escopo só deixa o servidor ler o que a própria Sofia criou). */
  async driveContent(fileId) {
    if (!/^[A-Za-z0-9_-]{6,200}$/.test(String(fileId || ''))) throw new AppError('BAD_FILE', 'Arquivo inválido.', 400);
    const l = this.link(); if (!this.driveOn(l)) throw this.notConnected();
    const meta = await this.call('GET', DRIVE + '/files/' + fileId + '?fields=id,name,mimeType,size');
    if (String(meta.mimeType || '').startsWith('application/vnd.google-apps.')) throw new AppError('BAD_FILE', 'Esse item não é um arquivo.', 400);
    const res = await this.fetch(DRIVE + '/files/' + fileId + '?alt=media', {headers: {Authorization: 'Bearer ' + await this.token()}});
    if (!res.ok) throw new AppError('GOOGLE_API', 'Não consegui baixar o arquivo do Drive (' + res.status + ').', 502);
    return {meta, res};
  }
  /** Envia o arquivo para quem pediu (app ou site). Só imagem, PDF, áudio e vídeo abrem no navegador; o resto baixa. */
  static async sendFile(res, out, {inline = false} = {}) {
    const {meta, res: r} = out, name = String(meta.name || 'arquivo'), mime = String(meta.mimeType || 'application/octet-stream');
    const safeInline = inline && /^(image\/(png|jpeg|webp|gif)|application\/pdf|audio\/[\w.+-]+|video\/(mp4|webm))$/.test(mime);
    const ascii = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.statusCode = 200;
    res.setHeader('Content-Type', safeInline || !/^text\//.test(mime) ? mime : 'application/octet-stream');
    res.setHeader('Content-Disposition', (safeInline ? 'inline' : 'attachment') + '; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(name));
    if (meta.size != null && Number.isFinite(Number(meta.size))) res.setHeader('Content-Length', String(Number(meta.size)));
    if (r.body && typeof r.body.getReader === 'function') {
      const {Readable} = require('node:stream');
      await new Promise((ok, bad) => { const s = Readable.fromWeb(r.body); s.once('error', bad); res.once('finish', ok); res.once('close', ok); s.pipe(res); });
    } else {
      const buf = Buffer.from(await r.arrayBuffer());
      if (!res.getHeader('Content-Length')) res.setHeader('Content-Length', String(buf.length));
      res.end(buf);
    }
  }
  /** "Exportar tudo": cria uma pasta VISÍVEL no Drive com uma cópia (aparece também nos computadores com o
   * Drive instalado). Os originais continuam onde estão. Roda em segundo plano, com o progresso no status. */
  async startExport(cats) {
    const l = this.link(); if (!this.driveOn(l)) throw this.notConnected();
    if (!this.visibleOn(l)) throw new AppError('GOOGLE_RECONNECT', 'Para exportar, reconecte a Conta Google em Perfil → Conta Google.', 409);
    const cur = l.drive?.export; if (cur?.state === 'running') return this.driveState(l).export;
    const keys = (Array.isArray(cats) && cats.length ? cats : GoogleService.CATS.map(c => c.key)).filter(k => GoogleService.CATS.some(c => c.key === k));
    if (!keys.length) throw new AppError('BAD_EXPORT', 'Escolha pelo menos um tipo de arquivo.', 400);
    const queue = [];
    for (const k of keys) { let page = ''; for (let i = 0; i < 100; i++) { const r = await this.driveList(k, page); queue.push(...r.items.map(f => ({id: f.id, cat: k}))); if (!r.next_page) break; page = r.next_page; } }
    const stamp = new Date().toLocaleString('pt-BR', {timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}).replace(/\//g, '-').replace(',', '').replace(':', 'h');
    const name = 'Sofia OS — cópia de ' + stamp;
    const folder = await this.call('POST', DRIVE + '/files?fields=id,webViewLink', {name, mimeType: 'application/vnd.google-apps.folder', description: 'Cópia dos arquivos da Sofia OS feita a seu pedido. Pode mover, renomear ou apagar: os originais continuam guardados pela Sofia.'});
    this.kvSet('drive_export_queue', queue);
    const exp = {state: queue.length ? 'running' : 'done', folder_id: folder.id, folder_name: name, link: folder.webViewLink || '', total: queue.length, done: 0, failed: 0, bytes: 0, subfolders: {}, started_at: now(), finished_at: queue.length ? '' : now(), error: ''};
    this.saveDrive({export: exp});
    if (queue.length) this.kickExport();
    return this.driveState(this.link()).export;
  }
  async exportBatch(batch = 5) {
    const l = this.link(), exp = l?.drive?.export;
    if (!exp || exp.state !== 'running') return {done: true};
    if (this.exporting) return {busy: true};
    this.exporting = true;
    try {
      const queue = this.kvGet('drive_export_queue') || [], part = queue.slice(0, batch), subfolders = {...(exp.subfolders || {})};
      let {done = 0, failed = 0, bytes = 0} = exp;
      for (const item of part) {
        try {
          if (!subfolders[item.cat]) { const label = (GoogleService.CATS.find(c => c.key === item.cat) || {}).label || item.cat; subfolders[item.cat] = (await this.call('POST', DRIVE + '/files?fields=id', {name: label, mimeType: 'application/vnd.google-apps.folder', parents: [exp.folder_id]})).id; }
          const got = await this.driveContent(item.id), buf = Buffer.from(await got.res.arrayBuffer());
          const {body, type} = GoogleService.multipart({name: got.meta.name, parents: [subfolders[item.cat]], mimeType: got.meta.mimeType || 'application/octet-stream'}, got.meta.mimeType, buf);
          await this.call('POST', UPLOAD + '/files?uploadType=multipart&fields=id', body, {'Content-Type': type});
          done++; bytes += buf.length;
        } catch (e) { if (e.code === 'GOOGLE_TOKEN' || e.code === 'GOOGLE_NOT_CONNECTED') throw e; failed++; }
      }
      this.kvSet('drive_export_queue', queue.slice(part.length));
      const finished = queue.length <= part.length;
      this.saveDrive({export: {...exp, done, failed, bytes, subfolders, ...(finished ? {state: 'done', finished_at: now()} : {})}});
      if (finished) this.w.notify('drive', 'Cópia dos arquivos pronta', 'A pasta "' + exp.folder_name + '" está no seu Google Drive com ' + done + (done === 1 ? ' arquivo' : ' arquivos') + (failed ? '; ' + failed + (failed === 1 ? ' não pôde ser copiado' : ' não puderam ser copiados') : '') + '. Ela aparece também nos computadores com o Google Drive instalado.', null, 'info', 'drive-export-' + exp.started_at);
      return {done: finished};
    } catch (e) {
      this.saveDrive({export: {...exp, state: 'error', error: String(e.message).slice(0, 200), finished_at: now()}});
      return {done: true, error: e.message};
    } finally { this.exporting = false; }
  }
  kickExport() {
    if (this.exportChain || this.link()?.drive?.export?.state !== 'running') return this.exportChain || null;
    const pause = ms => new Promise(r => setTimeout(r, this.migrationPauseMs ?? ms));
    this.exportChain = (async () => {
      try { for (let i = 0; i < 20000; i++) { const r = await this.exportBatch(); if (r.done) break; await pause(r.busy ? 2000 : 200); } }
      finally { this.exportChain = null; }
    })();
    return this.exportChain;
  }

  // ---------- Apagar e limpeza semanal dos comprovantes ----------
  /** O que referenciava aquele arquivo passa a saber que ele foi apagado (a linha e a miniatura ficam). */
  forgetDriveFile(fileId, when = now()) {
    let atts = []; try { atts = this.db.prepare('SELECT id FROM attachments WHERE drive_id=?').all(fileId).map(r => r.id); } catch { /* sem tabela */ }
    try { this.db.prepare('UPDATE attachments SET drive_id=NULL, blob=?, removed_at=? WHERE drive_id=?').run(Buffer.alloc(0), when, fileId); } catch { /* sem tabela */ }
    try { this.db.prepare('UPDATE voice_messages SET drive_id=NULL, blob=?, removed_at=? WHERE drive_id=?').run(Buffer.alloc(0), when, fileId); } catch { /* sem tabela */ }
    for (const a of atts) { const hit = this.blobCache.get(a); if (hit) { this.blobCacheBytes -= hit.buf.length; this.blobCache.delete(a); } }
    return atts.length;
  }
  static deletable(cat, props = {}) { return cat !== 'Páginas' && !props.sofia_page; }
  /** Apaga um arquivo da Sofia no Drive (de vez: a área oculta não tem lixeira). As cópias .md das páginas
   * não se apagam aqui: elas acompanham a página e voltariam sozinhas. */
  async driveDelete(fileId) {
    if (!/^[A-Za-z0-9_-]{6,200}$/.test(String(fileId || ''))) throw new AppError('BAD_FILE', 'Arquivo inválido.', 400);
    const l = this.link(); if (!this.driveOn(l)) throw this.notConnected();
    const meta = await this.call('GET', DRIVE + '/files/' + fileId + '?fields=id,name,mimeType,appProperties');
    if (meta.mimeType === 'application/vnd.google-apps.folder') throw new AppError('BAD_FILE', 'Pastas não se apagam por aqui.', 400);
    const props = meta.appProperties || {};
    if (!GoogleService.deletable(props.sofia_cat, props)) throw new AppError('PAGE_COPY', 'Essa é a cópia em texto de uma página e volta sozinha enquanto a página existir. Para apagar, apague a página em Páginas.', 409);
    await this.call('DELETE', DRIVE + '/files/' + fileId).catch(e => { if (e.googleStatus !== 404) throw e; });
    this.forgetDriveFile(fileId); this.summaryCache = null;
    return {ok: true, name: meta.name || ''};
  }
  static RECEIPT_DAYS = 7;
  // Limpeza automática (pedidos do dono, 26/10/2026): comprovantes (fotos da conversa para Finanças) e áudios
  // da conversa saem com mais de 7 dias. A despesa lançada, a miniatura e a transcrição continuam.
  static CLEANUPS = {
    'Comprovantes': {kv: 'drive_receipts_cleanup', what: 'comprovantes'},
    'Áudios': {kv: 'drive_voices_cleanup', what: 'áudios'},
  };
  cleanupState(cat) { const c = GoogleService.CLEANUPS[cat]; const v = this.kvGet(c.kv) || {}; return {enabled: v.enabled !== false, days: GoogleService.RECEIPT_DAYS, last_at: v.last_at || '', last_removed: v.last_removed || 0}; }
  receiptsCleanup() { return this.cleanupState('Comprovantes'); }
  voicesCleanup() { return this.cleanupState('Áudios'); }
  setCleanup(cat, enabled) {
    const c = GoogleService.CLEANUPS[cat]; if (!c) throw new AppError('BAD_CATEGORY', 'Essa categoria não tem limpeza automática.', 400);
    const cur = this.kvGet(c.kv) || {}; this.kvSet(c.kv, {...cur, enabled: !!enabled});
    if (enabled) this.cleanCategory(cat, true).catch(() => {});
    return this.cleanupState(cat);
  }
  setReceiptsCleanup(enabled) { return this.setCleanup('Comprovantes', enabled); }
  cleanReceipts(force = false) { return this.cleanCategory('Comprovantes', force); }
  cleanVoices(force = false) { return this.cleanCategory('Áudios', force); }
  /** Apaga do Drive e do servidor o que tem mais de 7 dias na categoria (contados de quando foi enviado).
   * Roda no máximo a cada 6 h por categoria. */
  async cleanCategory(cat, force = false) {
    const c = GoogleService.CLEANUPS[cat], l = this.link(), cfg = this.cleanupState(cat);
    this.cleaning = this.cleaning || new Set();
    if (!c || !this.driveOn(l) || !cfg.enabled || this.cleaning.has(cat)) return {skipped: true};
    if (!force && cfg.last_at && Date.now() - Date.parse(cfg.last_at) < GoogleService.FOLDER_RECHECK_MS) return {skipped: true};
    this.cleaning.add(cat); let removed = 0;
    try {
      const cutoff = new Date(Date.now() - GoogleService.RECEIPT_DAYS * 864e5).toISOString(), when = now();
      const drop = async driveId => { try { await this.call('DELETE', DRIVE + '/files/' + driveId); } catch (e) { if (e.googleStatus !== 404) return false; } this.forgetDriveFile(driveId, when); return true; };
      if (cat === 'Comprovantes') {
        ensureThumbColumn(this.db);
        let rows = [];
        try { rows = this.db.prepare("SELECT a.id, a.mime, a.blob, a.thumb, a.drive_id FROM attachments a JOIN entities e ON e.id=a.entity_id WHERE COALESCE(e.tags,'') LIKE '%chat-attachment%' AND a.mime LIKE 'image/%' AND a.created_at < ? AND a.removed_at IS NULL LIMIT 200").all(cutoff); } catch { rows = []; }
        for (const a of rows) {
          if ((!a.thumb || !a.thumb.length) && a.blob && a.blob.length) { const t = makeThumb(Buffer.from(a.blob), a.mime); if (t) this.db.prepare('UPDATE attachments SET thumb=? WHERE id=?').run(t, a.id); }
          if (a.drive_id) { if (!(await drop(a.drive_id))) continue; }
          else this.db.prepare('UPDATE attachments SET blob=?, removed_at=? WHERE id=?').run(Buffer.alloc(0), when, a.id);
          removed++;
        }
      } else {
        let rows = [];
        try { rows = this.db.prepare('SELECT message_id, drive_id FROM voice_messages WHERE created_at < ? AND removed_at IS NULL AND (drive_id IS NOT NULL OR length(blob) > 0) LIMIT 300').all(cutoff); } catch { rows = []; }
        for (const v of rows) {
          if (v.drive_id) { if (!(await drop(v.drive_id))) continue; }
          else this.db.prepare('UPDATE voice_messages SET blob=?, removed_at=? WHERE message_id=?').run(Buffer.alloc(0), when, v.message_id);
          removed++;
        }
      }
      // o que sobrou na categoria (ex.: de antes desta versão, sem linha aqui) também sai depois de 7 dias
      const list = await this.listCat(cat, {orderBy: 'createdTime', pageSize: 200, fields: 'files(id,createdTime)'});
      for (const f of (list.files || []).filter(f => f.createdTime && f.createdTime < cutoff)) if (await drop(f.id)) removed++;
      const cur = this.kvGet(c.kv) || {}; this.kvSet(c.kv, {...cur, last_at: when, last_removed: removed});
      if (removed) this.summaryCache = null;
      return {removed};
    } finally { this.cleaning.delete(cat); }
  }

  // ---------- Anexos no Drive ----------
  voiceStats() {
    try { const r = this.db.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN drive_id IS NOT NULL THEN 1 ELSE 0 END) AS in_drive, SUM(CASE WHEN drive_id IS NULL THEN length(blob) ELSE 0 END) AS local_bytes FROM voice_messages').get(); return {total: r.total || 0, in_drive: r.in_drive || 0, local_mb: Math.round((r.local_bytes || 0) / 1048576 * 10) / 10}; } catch { return {total: 0, in_drive: 0, local_mb: 0}; }
  }
  /** Leva para o Drive as mensagens de voz com mais de 1 dia (as recentes ficam aqui: tocam na hora
   * e ainda podem ser reenviadas). Só depois de o Drive confirmar, o blob sai daqui. */
  async offloadVoices(limit = 5) {
    const l = this.link(); if (!this.driveOn(l) || this.offloadingVoice) return {moved: 0};
    this.offloadingVoice = true; let moved = 0;
    try {
      if (!(await this.target('Áudios'))) return {moved: 0};
      const cutoff = new Date(Date.now() - 2 * 60000).toISOString(); // 07/11/2026: audio vai para o Drive 2 min depois (tempo da transcricao), nao 24 h
      const rows = this.db.prepare('SELECT message_id, mime, blob, created_at FROM voice_messages WHERE drive_id IS NULL AND length(blob) > 0 AND created_at < ? ORDER BY created_at LIMIT ?').all(cutoff, limit);
      for (const v of rows) {
        const buf = Buffer.from(v.blob), sha = crypto.createHash('sha256').update(buf).digest('hex');
        const ext = /mp4|m4a|aac/.test(v.mime) ? '.m4a' : /ogg/.test(v.mime) ? '.ogg' : /mpeg|mp3/.test(v.mime) ? '.mp3' : /wav/.test(v.mime) ? '.wav' : '.webm';
        const name = 'voz-' + String(v.created_at).slice(0, 19).replace(/[:T]/g, '-') + ext;
        const up = await this.upload({name, mime: v.mime || 'application/octet-stream', bytes: buf, cat: 'Áudios', description: 'Mensagem de voz da Sofia OS', props: {sofia_voice: v.message_id}});
        if (!up?.id) continue;
        this.db.prepare('UPDATE voice_messages SET drive_id=?, sha256=?, blob=? WHERE message_id=?').run(up.id, sha, Buffer.alloc(0), v.message_id);
        moved++;
      }
      return {moved};
    } finally { this.offloadingVoice = false; }
  }
  /** Bytes de uma mensagem de voz: daqui se ainda estiver; senão do Drive (mesmo cache dos anexos). */
  async voiceBytes(v) {
    if (v.blob && v.blob.length) return Buffer.from(v.blob);
    if (v.removed_at) throw new AppError('FILE_REMOVED', 'Este áudio foi apagado em Arquivos da Sofia. A transcrição continua na conversa.', 410);
    if (!v.drive_id) return Buffer.alloc(0);
    return this.attachmentBytes({id: 'voice:' + v.message_id, blob: null, drive_id: v.drive_id});
  }
  /** Página → Markdown legível (abre em qualquer editor ou no próprio Drive). */
  static pageMarkdown(page) {
    let blocks = []; try { blocks = JSON.parse(page.data?.blocks_json || '[]'); } catch { blocks = []; }
    const out = ['# ' + (page.data?.icon ? page.data.icon + ' ' : '') + page.title, ''];
    if (page.data?.purpose) out.push('> ' + String(page.data.purpose).replace(/\n/g, '\n> '), '');
    let n = 0;
    for (const b of Array.isArray(blocks) ? blocks : []) {
      const t = String(b.text || '').trim(), type = String(b.type || 'text');
      if (type !== 'number') n = 0;
      if (type === 'divider') { out.push('---'); continue; }
      if (!t && type !== 'todo') { out.push(''); continue; }
      if (type === 'heading1') out.push('# ' + t);
      else if (type === 'heading2') out.push('## ' + t);
      else if (type === 'heading3' || type === 'heading4') out.push('### ' + t);
      else if (type === 'bullet' || type === 'toggle') out.push('- ' + t);
      else if (type === 'number') out.push((++n) + '. ' + t);
      else if (type === 'todo') out.push('- [' + (b.checked ? 'x' : ' ') + '] ' + t);
      else if (type === 'quote' || type === 'callout') out.push('> ' + t);
      else if (type === 'code') out.push('```', t, '```');
      else out.push(t);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  /** Cada página vira um .md em Sofia OS/Páginas e é atualizada quando muda (pela revisão).
   * Apagou a página na Sofia: o arquivo vai para a lixeira do Drive. Até `limit` por rodada. */
  async exportPages(limit = 20) {
    const l = this.link(); if (!this.driveOn(l) || this.exportingPages || this.migrating) return {exported: 0};
    this.exportingPages = true; let exported = 0, removed = 0;
    try {
      if (!(await this.target('Páginas'))) return {exported: 0};
      const map = this.kvGet('drive_pages') || {};
      const pages = []; for (let offset = 0; offset < 20000; offset += 500) { const page = this.w.list({kind: 'user_page', limit: 500, offset}); pages.push(...page); if (page.length < 500) break; }
      const alive = new Set(pages.filter(p => p.state !== 'archived').map(p => p.id));
      for (const pageId of Object.keys(map)) if (!alive.has(pageId)) { await this.call('PATCH', DRIVE + '/files/' + map[pageId].file, {trashed: true}).catch(() => {}); delete map[pageId]; removed++; }
      for (const page of pages.filter(p => p.state !== 'archived')) {
        if (exported >= limit) break;
        const known = map[page.id]; if (known && known.rev === page.revision) continue;
        const md = Buffer.from(GoogleService.pageMarkdown(page), 'utf8');
        const name = (String(page.title || 'Sem título').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 100) || 'Sem título') + '.md';
        let res;
        if (known) {
          const {body, type} = GoogleService.multipart({name}, 'text/markdown; charset=UTF-8', md);
          res = await this.call('PATCH', UPLOAD + '/files/' + known.file + '?uploadType=multipart&fields=id', body, {'Content-Type': type}).catch(e => (e.googleStatus === 404 ? null : Promise.reject(e)));
        } else res = await this.upload({name, mime: 'text/markdown', bytes: md, cat: 'Páginas', description: 'Página da Sofia OS', props: {sofia_page: page.id}});
        if (!res) { delete map[page.id]; continue; } // arquivo apagado à mão no Drive: recria na próxima rodada
        map[page.id] = {file: res.id || known.file, rev: page.revision};
        exported++;
      }
      this.kvSet('drive_pages', map);
      this.saveDrive({pages_exported: Object.keys(map).length});
      return {exported, removed};
    } finally { this.exportingPages = false; }
  }
  attachmentStats() {
    try { const r = this.db.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN drive_id IS NOT NULL THEN 1 ELSE 0 END) AS in_drive, SUM(CASE WHEN drive_id IS NULL THEN bytes ELSE 0 END) AS local_bytes FROM attachments').get(); return {total: r.total || 0, in_drive: r.in_drive || 0, local_mb: Math.round((r.local_bytes || 0) / 1048576 * 10) / 10}; } catch { return {total: 0, in_drive: 0, local_mb: 0}; }
  }
  /** Leva para o Drive os anexos que ainda estão só no servidor (até `limit` por rodada), e aqui fica só a referência. */
  /** 07/11/2026 (Pedro: "nada de imagem, video ou documento salvo no servidor: vai para o Drive conectado, na pasta oculta"):
   * arquivo da Pagina vai para o Drive NA HORA (antes esperava a rodada de 15 min). Sem Drive conectado: recusa. */
  async attachmentToDrive(id) {
    if (process.env.SOFIA_TEST_LOCAL_FILES === '1') return; // so no servidor de teste local (sem Google); nunca definido no Railway
    const noDrive = () => new AppError('NO_DRIVE', 'Para guardar arquivos, conecte o Google Drive em Perfil › Conexões. Eles ficam na área oculta do seu Drive, nunca no servidor.', 409);
    if (!this.driveOn(this.link()) || !(await this.target('Anexos'))) throw noDrive();
    const a = this.db.prepare('SELECT a.id, a.entity_id, a.name, a.mime, a.blob, a.drive_id, e.tags AS tags FROM attachments a LEFT JOIN entities e ON e.id=a.entity_id WHERE a.id=?').get(id); if (!a || a.drive_id) return;
    // foto da Conversa (ex.: cupom): miniatura fica aqui para a lista abrir rapido; o original vai para Comprovantes
    const fromChat = String(a.tags || '').includes('chat-attachment') && /^image\//.test(String(a.mime || ''));
    if (fromChat) { ensureThumbColumn(this.db); const t = makeThumb(Buffer.from(a.blob || []), a.mime); if (t) this.db.prepare('UPDATE attachments SET thumb=? WHERE id=?').run(t, a.id); }
    const up = await this.upload({name: a.name, mime: a.mime || 'application/octet-stream', bytes: Buffer.from(a.blob || []), cat: fromChat ? 'Comprovantes' : 'Anexos', description: 'Anexo da Sofia OS (' + a.entity_id + ')', props: {sofia_attachment: a.id, sofia_entity: a.entity_id}});
    if (!up?.id) throw new AppError('DRIVE_UPLOAD', 'Não consegui guardar o arquivo no Google Drive. Tente de novo.', 502);
    this.db.prepare('UPDATE attachments SET drive_id=?, blob=? WHERE id=?').run(up.id, Buffer.alloc(0), a.id);
  }
  async offloadAttachments(limit = 10) {
    const l = this.link(); if (!this.driveOn(l) || this.offloading) return {moved: 0};
    this.offloading = true; let moved = 0;
    try {
      if (!(await this.target('Anexos'))) return {moved: 0};
      ensureThumbColumn(this.db);
      // 0.3.206: foto da conversa fica 24 h aqui (a Sofia le e voce abre na hora, sem depender do Drive); depois vai
      const chatCutoff = new Date(Date.now() + 60000).toISOString(); // 07/11/2026 (Pedro: tudo no Drive): sem as 24 h no servidor
      const rows = this.db.prepare("SELECT a.id, a.entity_id, a.name, a.mime, a.bytes, a.blob, e.tags AS tags FROM attachments a LEFT JOIN entities e ON e.id=a.entity_id WHERE a.drive_id IS NULL AND length(a.blob) > 0 AND (COALESCE(e.tags,'') NOT LIKE '%chat-attachment%' OR a.created_at < ?) ORDER BY a.created_at LIMIT ?").all(chatCutoff, limit);
      for (const a of rows) {
        // 0.3.199: foto enviada na conversa (ex.: cupom) vai para "Sofia OS/Comprovantes"; a miniatura fica aqui
        const fromChat = String(a.tags || '').includes('chat-attachment') && /^image\//.test(String(a.mime || ''));
        if (fromChat) { const t = makeThumb(Buffer.from(a.blob), a.mime); if (t) this.db.prepare('UPDATE attachments SET thumb=? WHERE id=?').run(t, a.id); }
        const up = await this.upload({name: a.name, mime: a.mime || 'application/octet-stream', bytes: Buffer.from(a.blob), cat: fromChat ? 'Comprovantes' : 'Anexos', description: 'Anexo da Sofia OS (' + a.entity_id + ')', props: {sofia_attachment: a.id, sofia_entity: a.entity_id}});
        if (!up?.id) continue;
        // Só depois de o Drive confirmar: aqui fica a referência e um blob vazio (o tamanho original segue em bytes).
        this.db.prepare('UPDATE attachments SET drive_id=?, blob=? WHERE id=?').run(up.id, Buffer.alloc(0), a.id);
        moved++;
      }
      this.saveDrive({attachments_moved_at: now(), attachments_error: ''});
      return {moved};
    } catch (e) {
      this.saveDrive({attachments_error: String(e.message).slice(0, 200)});
      throw e;
    } finally { this.offloading = false; }
  }
  /** 0.3.200: reduz as capas JPEG que ja estao no Drive (baixa, reduz para 1600 px e troca o conteudo no mesmo
   * arquivo). Poucas por rodada; cada capa e conferida uma vez por execucao do servidor. */
  async shrinkDriveCovers(limit = 3) {
    const l = this.link(); if (!this.driveOn(l) || this.offloading || this.shrinking || this.migrating) return {shrunk: 0};
    this.shrinking = true; let shrunk = 0; this.coversChecked = this.coversChecked || new Set();
    try {
      const {shrinkJpeg} = require('./thumb');
      const rows = this.db.prepare("SELECT id, name, drive_id FROM attachments WHERE name LIKE 'capa.%' AND mime='image/jpeg' AND drive_id IS NOT NULL AND bytes > ? ORDER BY bytes DESC LIMIT 80").all(350 * 1024)
        .filter(r => !this.coversChecked.has(r.id)).slice(0, limit);
      for (const a of rows) {
        this.coversChecked.add(a.id);
        try {
          const bytes = await this.attachmentBytes({id: a.id, blob: null, drive_id: a.drive_id});
          const small = shrinkJpeg(bytes); if (!small) continue;
          const boundary = 'sofia' + id();
          const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name: a.name})}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`), small, Buffer.from(`\r\n--${boundary}--`)]);
          await this.call('PATCH', UPLOAD + '/files/' + a.drive_id + '?uploadType=multipart&fields=id', body, {'Content-Type': 'multipart/related; boundary=' + boundary});
          this.db.prepare('UPDATE attachments SET bytes=?, sha256=? WHERE id=?').run(small.length, require('node:crypto').createHash('sha256').update(small).digest('hex'), a.id);
          const hit = this.blobCache.get(a.id); if (hit) { this.blobCacheBytes -= hit.buf.length; this.blobCache.delete(a.id); }
          shrunk++;
        } catch { /* uma capa com problema nao impede as outras; ela nao e tentada de novo nesta execucao */ }
      }
    } finally { this.shrinking = false; }
    return {shrunk};
  }
  /** Bytes de um anexo: do servidor se ainda estão aqui; senão do Drive (com cache de até 30 MB em memória). */
  async attachmentBytes(a) {
    if (a.blob && a.blob.length) return Buffer.from(a.blob);
    if (a.removed_at) throw new AppError('FILE_REMOVED', 'Este arquivo foi apagado em Arquivos da Sofia' + (a.thumb && a.thumb.length ? '; ficou só a miniatura.' : '.'), 410);
    if (!a.drive_id) return Buffer.alloc(0);
    const hit = this.blobCache.get(a.id); if (hit) { hit.at = Date.now(); return hit.buf; }
    const l = this.link(); if (!l?.refresh) throw new AppError('GOOGLE_NOT_CONNECTED', 'Este anexo está no seu Google Drive. Conecte a Conta Google em Perfil → Conta Google para abrir.', 503);
    const res = await this.fetch(DRIVE + '/files/' + a.drive_id + '?alt=media', {headers: {Authorization: 'Bearer ' + await this.token()}});
    if (!res.ok) throw new AppError('GOOGLE_API', 'Não consegui baixar o anexo do Drive (' + res.status + ').', 502);
    const buf = Buffer.from(await res.arrayBuffer());
    this.blobCache.set(a.id, {buf, at: Date.now()}); this.blobCacheBytes += buf.length;
    while (this.blobCacheBytes > 30 * 1048576 && this.blobCache.size) { const [oldest] = [...this.blobCache.entries()].sort((x, y) => x[1].at - y[1].at)[0]; this.blobCacheBytes -= this.blobCache.get(oldest).buf.length; this.blobCache.delete(oldest); }
    return buf;
  }

  /** 0.3.201: backup com a senha da variavel SOFIA_BACKUP_PASSPHRASE (12+ caracteres). Abre em qualquer
   * lugar com o repositorio + a senha (scripts/restaurar-backup.cjs). Ficam os 7 mais novos e o guia junto. */
  async uploadPortableBackup() {
    const pass = String(process.env.SOFIA_BACKUP_PASSPHRASE || '');
    if (pass.length < 12) return null;
    if (!(await this.target('Backup com senha'))) return null;
    const bytes = this.backups.portable(pass), name = 'sofia-com-senha-' + now().slice(0, 10) + '.sofia-backup';
    const up = (fileName, mime, content, description) => this.upload({name: fileName, mime, bytes: content, cat: 'Backup com senha', description});
    const list = await this.listCat('Backup com senha');
    const files = list.files || [];
    // o do dia e substituido (um por dia)
    for (const f of files.filter(f => f.name === name)) await this.call('DELETE', DRIVE + '/files/' + f.id).catch(() => {});
    await up(name, 'application/octet-stream', bytes, 'Backup da Sofia OS com senha (abre sem o servidor)');
    if (!files.some(f => f.name === 'COMO-RESTAURAR.md')) {
      let guide = ''; try { guide = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'COMO-RESTAURAR.md')); } catch { guide = Buffer.from('Veja scripts/COMO-RESTAURAR.md no repositorio avsord/sofiaos (branch sofia-app-android).'); }
      await up('COMO-RESTAURAR.md', 'text/markdown', Buffer.isBuffer(guide) ? guide : Buffer.from(guide), 'Como recolocar a Sofia OS no ar com este backup');
    }
    for (const old of files.filter(f => /^sofia-com-senha-/.test(f.name) && f.name !== name).slice(6)) await this.call('DELETE', DRIVE + '/files/' + old.id).catch(() => {});
    return {name, bytes: bytes.length};
  }
  async backupToDrive(force = false) {
    const l = this.link();
    if (!this.driveOn(l) || !this.backups) return {skipped: true};
    if (!force && l.drive?.last_backup && l.drive.last_backup.slice(0, 10) === now().slice(0, 10)) return {skipped: true};
    try {
      const made = this.backups.create('drive');
      const bytes = fs.readFileSync(path.join(this.backups.directory, made.name));
      const sent = await this.upload({name: made.name, mime: 'application/octet-stream', bytes, cat: 'Backups', description: 'Backup criptografado da Sofia OS'});
      if (!sent?.id) throw new AppError('GOOGLE_API', 'O Drive não confirmou o backup.', 502);
      const list = await this.listCat('Backups');
      for (const old of (list.files || []).slice(KEEP_BACKUPS)) await this.call('DELETE', DRIVE + '/files/' + old.id).catch(() => {});
      // No servidor ficam só os 3 mais novos: o Drive guarda o histórico.
      for (const b of this.backups.list().slice(3)) { try { fs.unlinkSync(path.join(this.backups.directory, b.name)); } catch { /* ignore */ } }
      // 0.3.201: tambem o backup COM SENHA, que abre sem este servidor (veja scripts/COMO-RESTAURAR.md)
      let portable = {at: l.drive?.portable_at || '', error: ''};
      try { const p = await this.uploadPortableBackup(); if (p) portable = {at: now(), error: ''}; } catch (e) { portable = {...portable, error: String(e.message).slice(0, 200)}; }
      // 0.3.244: grava só esses campos (antes regravava o estado do Drive inteiro e perdia o resto).
      this.saveDrive({last_backup: now(), last_error: '', count: Math.min(KEEP_BACKUPS, (list.files || []).length), bytes: bytes.length, portable_at: portable.at, portable_error: portable.error});
      return {ok: true, name: made.name, bytes: bytes.length, portable: !!portable.at && !portable.error};
    } catch (e) {
      this.saveDrive({last_error: String(e.message).slice(0, 200)});
      throw e;
    }
  }

  // ================= Sofia Drive (07/11/2026, Pedro) =================
  // ===== App Drive (07/11/2026, Pedro): o Google Drive INTEIRO do usuario dentro da Sofia, como o Google Drive.
  // A area da Sofia (area oculta, marcas sofia_*, pastas "Sofia OS" antigas e tudo dentro delas) NUNCA aparece nem e mexida:
  // toda operacao passa por sdPath, que confere o item e cada pasta acima dele ate a raiz.
  /** Drive inteiro liberado (permissao 'drive', nao so 'drive.file'). */
  fullDriveOn(l = this.link()) { return !!(l?.refresh && /(^|\s)https:\/\/www\.googleapis\.com\/auth\/drive(\s|$)/.test(l.scopes || '')); }
  async sdRoot() {
    const l = this.link();
    if (!l || !l.refresh) throw new AppError('DRIVE_NOT_CONNECTED', 'Ligue sua conta Google para usar o Drive.', 409);
    if (!this.fullDriveOn(l)) throw new AppError('DRIVE_NEEDS_PERMISSION', 'Permita que a Sofia veja o seu Google Drive.', 409);
    if (!this.sdRootId || this.sdRootFor !== l.email) { this.sdRootId = (await this.call('GET', DRIVE + '/files/root?fields=id')).id; this.sdRootFor = l.email; } // trocou de conta Google: outra raiz
    return this.sdRootId;
  }
  static SD_FOLDER = 'application/vnd.google-apps.folder';
  static SD_SHORTCUT = 'application/vnd.google-apps.shortcut';
  static SD_FIELDS = 'id,name,mimeType,size,modifiedTime,parents,trashed,appProperties,spaces,ownedByMe,shortcutDetails,thumbnailLink,starred,webViewLink';
  /** Itens da propria Sofia: area oculta, marcas sofia_* e as pastas "Sofia OS" que ela criou em versoes antigas. */
  sdProtected(f) {
    if (!f) return false; const a = f.appProperties || {};
    if (a.sofia_cat || a.sofia_from || a.sofia_page || a.sofia_kind) return true;
    if ((f.spaces || []).includes('appDataFolder')) return true;
    if (f.mimeType === GoogleService.SD_FOLDER && String(f.name || '').trim().toLowerCase() === 'sofia os' && f.ownedByMe !== false) return true;
    if (!this.sdFoldersMemo || this.sdFoldersMemo.at < Date.now() - 2000) this.sdFoldersMemo = {at: Date.now(), ids: Object.values(this.link()?.drive?.folders || {})};
    return this.sdFoldersMemo.ids.includes(f.id);
  }
  /** Fora das listas, mas acessivel: a pasta do teste automatico. */
  static sdHidden(f) { return !!(f && f.appProperties && f.appProperties.sofia_selftest); }
  static sdId(id) { if (!/^[A-Za-z0-9_-]{6,200}$/.test(String(id || ''))) throw new AppError('BAD_FILE', 'Item inválido.', 400); return String(id); }
  /** Texto dentro de aspas numa consulta do Google (escapa \ e '). */
  static sdQ(s) { return String(s || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  sdItem(f, extra = {}) {
    const sc = f.mimeType === GoogleService.SD_SHORTCUT && f.shortcutDetails ? f.shortcutDetails : null, mime = sc ? String(sc.targetMimeType || '') : f.mimeType;
    return {id: f.id, name: f.name, mime, folder: mime === GoogleService.SD_FOLDER, size: f.size != null ? Number(f.size) : null, modified: f.modifiedTime || '',
      ...(sc ? {shortcut: true} : {}), ...(f.thumbnailLink ? {thumb: true} : {}), ...(f.starred ? {starred: true} : {}), ...(f.ownedByMe === false ? {shared: true} : {}), ...(f.webViewLink && /^https:\/\/(docs|drive)\.google\.com\//.test(f.webViewLink) ? {web: f.webViewLink} : {}), ...extra};
  }
  /** Caminho do item ate a raiz do Meu Drive, conferindo cada pasta. Compartilhado comigo (sem pasta no meu Drive) vale. */
  async sdPath(id, {allowTrashed = false} = {}) {
    const root = await this.sdRoot(); if (!id || id === 'root' || id === root) return {root, path: [], meta: {id: root, name: 'Meu Drive', mimeType: GoogleService.SD_FOLDER}};
    const path = []; let cur = GoogleService.sdId(id), meta = null, child = null;
    for (let i = 0; i < 60; i++) {
      let f; try { f = await this.call('GET', DRIVE + '/files/' + cur + '?fields=' + GoogleService.SD_FIELDS); }
      catch (e) { if (e.googleStatus && ![403, 404].includes(e.googleStatus) || /rateLimit/i.test(e.googleReason || '')) throw new AppError('GOOGLE_BUSY', 'O Google demorou para responder. Tente de novo em instantes.', 503);
        if (child && child.ownedByMe === false) return {root, path, meta, shared: true}; throw new AppError('NOT_FOUND', cur === id ? 'Item não encontrado.' : 'Esse item não está no seu Drive.', 404); }
      if (this.sdProtected(f)) throw new AppError('NOT_FOUND', 'Esse item é da Sofia e não pode ser mexido pelo Drive.', 404);
      if (!meta) meta = f;
      if (f.trashed && !(allowTrashed && f === meta)) throw new AppError('NOT_FOUND', 'Esse item foi para a lixeira.', 404);
      if (cur !== id) path.unshift({id: f.id, name: f.name});
      const up = (f.parents || [])[0];
      if (!up) { if (f.ownedByMe === false || f.id === meta.id) return {root, path, meta, shared: f.ownedByMe === false}; break; }
      if (up === root) return {root, path, meta};
      child = f; cur = up;
    }
    throw new AppError('NOT_FOUND', 'Esse item não está no seu Drive.', 404);
  }
  /** Como sdPath, mas um atalho vira o item de destino (abrir/ver/tocar). Renomear/mover/lixeira agem no proprio atalho. */
  async sdResolve(id) { const at = await this.sdPath(id); if (at.meta.mimeType === GoogleService.SD_SHORTCUT && at.meta.shortcutDetails?.targetId) return this.sdPath(at.meta.shortcutDetails.targetId); return at; }
  async sdPages(q, {orderBy = 'folder,name_natural', max = 10, pageSize = 200} = {}) {
    const out = []; let page = '';
    for (let i = 0; i < max; i++) {
      const r = await this.call('GET', DRIVE + '/files?q=' + encodeURIComponent(q) + '&orderBy=' + encodeURIComponent(orderBy) + '&pageSize=' + pageSize + '&fields=' + encodeURIComponent('nextPageToken,files(' + GoogleService.SD_FIELDS + ')') + (page ? '&pageToken=' + encodeURIComponent(page) : ''));
      out.push(...(r.files || [])); page = r.nextPageToken || ''; if (!page) break;
    }
    return out;
  }
  async sdList(folder = 'root', q = '') {
    const at = await this.sdResolve(folder), id = at.meta.id;
    if (at.meta.mimeType !== GoogleService.SD_FOLDER) throw new AppError('BAD_FILE', 'Isso não é uma pasta.', 400);
    const files = await this.sdPages("'" + GoogleService.sdQ(id) + "' in parents and trashed=false" + (q ? " and name contains '" + GoogleService.sdQ(String(q).slice(0, 100)) + "'" : ''), {max: 25, pageSize: 400});
    return {folder: {id: id === at.root ? 'root' : id, name: at.meta.name}, path: at.path, ...(at.shared ? {shared: true} : {}), items: files.filter(f => !this.sdProtected(f) && !GoogleService.sdHidden(f)).map(f => this.sdItem(f))};
  }
  /** Para listas fora de uma pasta (pesquisa, recentes, com estrela, lixeira, compartilhados): confere a cadeia de pastas de
   * cada item (com memoria) e devolve onde ele esta. Item com qualquer pasta da Sofia acima sai. */
  sdChain(root, {allowTrashed = false} = {}) {
    const memo = new Map([[root, Promise.resolve({ok: true, name: 'Meu Drive'})]]);
    const folderOk = (id, depth = 0) => {
      if (!memo.has(id)) memo.set(id, depth > 60 ? Promise.resolve({ok: false}) : this.call('GET', DRIVE + '/files/' + GoogleService.sdId(id) + '?fields=' + GoogleService.SD_FIELDS)
        .then(async f => { if (this.sdProtected(f) || GoogleService.sdHidden(f) || (f.trashed && !allowTrashed)) return {ok: false}; const up = (f.parents || [])[0]; if (!up) return {ok: true, name: f.name};
          const r = await folderOk(up, depth + 1); return {ok: r.ok, name: f.name}; })
        .catch(() => ({ok: true, name: ''}))); // pasta acima que eu nao enxergo: item compartilhado comigo
      return memo.get(id);
    };
    return async f => { if (this.sdProtected(f) || GoogleService.sdHidden(f)) return null; const up = (f.parents || [])[0]; if (!up) return {where: f.ownedByMe === false ? 'Compartilhado comigo' : ''};
      const r = await folderOk(up); return r.ok ? {where: r.name} : null; };
  }
  async sdFiltered(files, opts) { const root = await this.sdRoot(), chain = this.sdChain(root, opts), out = new Array(files.length); let i = 0;
    await Promise.all(Array.from({length: 8}, async () => { while (i < files.length) { const k = i++, c = await chain(files[k]); if (c) out[k] = this.sdItem(files[k], c); } })); return out.filter(Boolean); }
  /** Pesquisa no Drive inteiro, como no Google Drive (inclui o que foi compartilhado comigo). */
  async sdSearch(q) {
    const text = String(q || '').trim().slice(0, 100); if (!text) return {items: []};
    await this.sdRoot();
    const files = await this.sdPages("name contains '" + GoogleService.sdQ(text) + "' and trashed=false", {orderBy: 'folder,modifiedTime desc', max: 3});
    return {items: await this.sdFiltered(files)};
  }
  /** Listas como as do Google Drive: compartilhados comigo, recentes, com estrela e lixeira. */
  async sdView(view) {
    await this.sdRoot();
    const V = {shared: ['sharedWithMe and trashed=false', 'folder,modifiedTime desc', 2], recent: ["trashed=false and mimeType != '" + GoogleService.SD_FOLDER + "'", 'modifiedTime desc', 1], starred: ['starred and trashed=false', 'folder,name_natural', 2], trash: ["trashed=true and 'me' in owners", 'modifiedTime desc', 2]}[view];
    if (!V) throw new AppError('NOT_FOUND', 'Lista do Drive não existe.', 404);
    const files = await this.sdPages(V[0], {orderBy: V[1], max: V[2], pageSize: view === 'recent' ? 60 : 200});
    return {view, items: await this.sdFiltered(files, {allowTrashed: view === 'trash'})};
  }
  async sdAbout() { await this.sdRoot(); const r = await this.call('GET', DRIVE + '/about?fields=storageQuota'); const q = r.storageQuota || {}; return {used: Number(q.usage || 0), limit: q.limit != null ? Number(q.limit) : null}; }
  async sdParent(parent) { const at = await this.sdResolve(parent); if (at.meta.mimeType !== GoogleService.SD_FOLDER) throw new AppError('BAD_FILE', 'Destino não é uma pasta.', 400); return at.meta.id; }
  static sdName(name) { const n = String(name || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 250); if (!n) throw new AppError('BAD_FIELD', 'Dê um nome.', 400); return n; }
  static sdMime(m) { return /^[\w.+-]+\/[\w.+-]+$/.test(String(m || '')) ? String(m) : 'application/octet-stream'; }
  async sdCreateFolder(parent, name) { const p = await this.sdParent(parent); const f = await this.call('POST', DRIVE + '/files?fields=' + GoogleService.SD_FIELDS, {name: GoogleService.sdName(name), mimeType: GoogleService.SD_FOLDER, parents: [p]}); return this.sdItem(f); }
  /** Envio pequeno de uma vez (ate 5 MB; arquivo vazio vale, como no Google Drive). */
  async sdUpload(parent, name, mime, bytes) {
    bytes = bytes || Buffer.alloc(0); if (bytes.length > 5 * 1024 * 1024) throw new AppError('TOO_LARGE', 'Use o envio por partes para arquivos grandes.', 413);
    const p = await this.sdParent(parent), type = GoogleService.sdMime(mime);
    const {body, type: ct} = GoogleService.multipart({name: GoogleService.sdName(name), parents: [p], mimeType: type}, type, bytes);
    return this.sdItem(await this.call('POST', UPLOAD + '/files?uploadType=multipart&fields=' + GoogleService.SD_FIELDS, body, {'Content-Type': ct}));
  }
  /** Envio grande por partes (como o Google Drive): abre a sessao e devolve um codigo; as partes vem uma a uma. Ate 10 GB. */
  async sdUploadStart(parent, name, mime, size) {
    const total = Number(size); if (!Number.isFinite(total) || total < 0 || total > 10 * 1024 ** 3) throw new AppError('TOO_LARGE', 'Arquivo maior que 10 GB.', 413);
    const p = await this.sdParent(parent), type = GoogleService.sdMime(mime);
    const r = await this.fetch(UPLOAD + '/files?uploadType=resumable&fields=' + encodeURIComponent(GoogleService.SD_FIELDS), {method: 'POST', headers: {Authorization: 'Bearer ' + await this.token(), 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(total)}, body: JSON.stringify({name: GoogleService.sdName(name), parents: [p], mimeType: type})});
    const loc = r.headers.get('location'); if (!r.ok || !loc) throw new AppError('GOOGLE_API', 'O Google não abriu o envio (' + r.status + ').', 502);
    this.sdUploads = this.sdUploads || new Map(); for (const [k, v] of this.sdUploads) if (v.exp < Date.now()) this.sdUploads.delete(k);
    const sid = crypto.randomBytes(18).toString('base64url'); this.sdUploads.set(sid, {loc, total, got: 0, type, exp: Date.now() + 24 * 3600000}); return {upload: sid, total};
  }
  async sdUploadChunk(sid, start, buf) {
    const up = this.sdUploads?.get(String(sid || '')); if (!up) throw new AppError('NOT_FOUND', 'Esse envio expirou. Envie o arquivo de novo.', 404);
    if (Number(start) !== up.got) return {next: up.got};
    const end = up.got + buf.length - 1; if (end + 1 > up.total) throw new AppError('BAD_FILE', 'Parte maior que o arquivo.', 400);
    if (buf.length % (256 * 1024) && end + 1 !== up.total) throw new AppError('BAD_FILE', 'Parte com tamanho inválido.', 400);
    const r = await this.fetch(up.loc, {method: 'PUT', headers: {Authorization: 'Bearer ' + await this.token(), 'Content-Length': String(buf.length), 'Content-Range': buf.length ? 'bytes ' + up.got + '-' + end + '/' + up.total : 'bytes */' + up.total}, body: buf});
    if (r.status === 308) { const m = /bytes=0-(\d+)/.exec(r.headers.get('range') || ''); up.got = m ? Number(m[1]) + 1 : 0; return {next: up.got}; }
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new AppError('GOOGLE_API', 'O Google recusou uma parte do envio (' + r.status + '). ' + t.slice(0, 120), 502); }
    this.sdUploads.delete(sid); return {item: this.sdItem(await r.json())};
  }
  async sdUpdate(id, {name, parent, starred} = {}) {
    const at = await this.sdPath(id); if (at.meta.id === at.root) throw new AppError('BAD_FILE', 'A pasta principal não muda.', 400);
    let url = DRIVE + '/files/' + at.meta.id + '?fields=' + GoogleService.SD_FIELDS;
    if (parent !== undefined) {
      const dest = await this.sdParent(parent);
      if (dest === at.meta.id) throw new AppError('BAD_FILE', 'Uma pasta não entra nela mesma.', 400);
      if (at.meta.mimeType === GoogleService.SD_FOLDER) { const d = await this.sdPath(dest); if (d.path.some(x => x.id === at.meta.id)) throw new AppError('BAD_FILE', 'Uma pasta não entra numa pasta dela.', 400); }
      if (!(at.meta.parents || []).includes(dest)) url += '&addParents=' + dest + ((at.meta.parents || []).length ? '&removeParents=' + (at.meta.parents || []).join(',') : '');
    }
    const body = {}; if (name !== undefined) body.name = GoogleService.sdName(name); if (starred !== undefined) body.starred = !!starred;
    return this.sdItem(await this.call('PATCH', url, body));
  }
  async sdTrash(id) { const at = await this.sdPath(id); if (at.meta.id === at.root) throw new AppError('BAD_FILE', 'A pasta principal não vai para a lixeira.', 400); if (at.meta.ownedByMe === false) throw new AppError('FORBIDDEN', 'Esse item é de outra pessoa: só o dono pode mandar para a lixeira.', 403); await this.call('PATCH', DRIVE + '/files/' + at.meta.id + '?fields=id', {trashed: true}); return {ok: true}; }
  async sdRestore(id) { const at = await this.sdPath(id, {allowTrashed: true}); await this.call('PATCH', DRIVE + '/files/' + at.meta.id + '?fields=id', {trashed: false}); return {ok: true}; }
  static SD_EXPORT = {'application/vnd.google-apps.document': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'], 'application/vnd.google-apps.spreadsheet': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'], 'application/vnd.google-apps.presentation': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx'], 'application/vnd.google-apps.drawing': ['image/png', '.png']};
  async sdExport(meta, mime, ext) {
    const res = await this.fetch(DRIVE + '/files/' + meta.id + '/export?mimeType=' + encodeURIComponent(mime), {headers: {Authorization: 'Bearer ' + await this.token()}});
    if (!res.ok) throw new AppError('GOOGLE_API', res.status === 403 ? 'O Google não deixa baixar esse arquivo (grande demais ou bloqueado pelo dono).' : 'O Google não converteu o arquivo (' + res.status + ').', 502);
    return {meta: {name: String(meta.name || 'arquivo').replace(/\.(docx?|xlsx?|pptx?|pdf|png)$/i, '') + ext, mimeType: mime}, res};
  }
  /** Abrir (ver na Sofia): arquivo nativo do Google vira PDF. */
  async sdContent(id) { const at = await this.sdResolve(id); if (String(at.meta.mimeType).startsWith('application/vnd.google-apps.')) { if (at.meta.mimeType === GoogleService.SD_FOLDER) throw new AppError('BAD_FILE', 'Isso é uma pasta.', 400); return this.sdExport(at.meta, 'application/pdf', '.pdf'); } return this.driveContent(at.meta.id); }
  /** Baixar: Docs/Planilhas/Apresentacoes do Google saem como Word/Excel/PowerPoint, como no Google Drive. */
  async sdDownload(id) { const at = await this.sdResolve(id), mt = String(at.meta.mimeType || '');
    if (mt === GoogleService.SD_FOLDER) throw new AppError('BAD_FILE', 'Para baixar uma pasta, abra-a e baixe os arquivos.', 400);
    if (mt.startsWith('application/vnd.google-apps.')) { const x = GoogleService.SD_EXPORT[mt] || ['application/pdf', '.pdf']; return this.sdExport(at.meta, x[0], x[1]); }
    return this.driveContent(at.meta.id); }
  /** Miniatura que o proprio Google gera (fotos, PDF, video, Docs). */
  async sdThumb(id, size = 400) { const at = await this.sdResolve(id); const link = at.meta.thumbnailLink; if (!link) throw new AppError('NOT_FOUND', 'Sem miniatura.', 404);
    const u = new URL(link); if (!/(^|\.)googleusercontent\.com$|(^|\.)google\.com$/.test(u.hostname)) throw new AppError('NOT_FOUND', 'Sem miniatura.', 404);
    const res = await this.fetch(link.replace(/=s\d+$/, '=s' + Math.max(64, Math.min(1600, Number(size) || 400))), {headers: {Authorization: 'Bearer ' + await this.token()}});
    if (!res.ok) throw new AppError('NOT_FOUND', 'Sem miniatura.', 404);
    return {meta: {name: 'miniatura.jpg', mimeType: /png/.test(res.headers.get('content-type') || '') ? 'image/png' : 'image/jpeg'}, res}; }
  /** Link temporario (2 h): o navegador nao manda o login numa tag <video>, e o celular abre o arquivo no visualizador dele. */
  sdStreamToken(id, ttlMs = 2 * 3600000) { const exp = Date.now() + ttlMs, sig = crypto.createHmac('sha256', this.key()).update('sd:' + id + ':' + exp).digest('base64url'); return {exp, sig}; }
  sdStreamValid(id, exp, sig) { const e = Number(exp); if (!Number.isFinite(e) || e < Date.now()) return false; const want = crypto.createHmac('sha256', this.key()).update('sd:' + id + ':' + e).digest('base64url'); try { return crypto.timingSafeEqual(Buffer.from(String(sig)), Buffer.from(want)); } catch { return false; } }
  /** Repassa o arquivo em pedacos (Range): o video toca e pula sem baixar tudo. So tipos seguros abrem na pagina (nada de
   * HTML/SVG/script vindos do Drive rodando no endereco da Sofia); o resto vai como download. */
  async sdStream(req, res, id, {as = ''} = {}) {
    // cada pedaco do video (cada pulo) conferia o caminho todo no Google: guarda por 2 min
    this.sdStreamMemo = this.sdStreamMemo || new Map(); const hit = this.sdStreamMemo.get(id);
    const at = hit && hit.exp > Date.now() ? hit.at : await this.sdResolve(id); if (!hit || hit.exp <= Date.now()) { this.sdStreamMemo.set(id, {at, exp: Date.now() + 120000}); if (this.sdStreamMemo.size > 300) this.sdStreamMemo.delete(this.sdStreamMemo.keys().next().value); }
    const meta = at.meta, mt = String(meta.mimeType || ''), dl = as === 'download';
    // a propria Sofia mostra o arquivo num quadro (visualizador): permitido so dentro do proprio site
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', (mt === 'application/pdf' || as === 'preview' || mt.startsWith('application/vnd.google-apps.')) ? "frame-ancestors 'self'; object-src 'self'" : "sandbox; default-src 'none'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'unsafe-inline'; frame-ancestors 'self'");
    if (dl) return GoogleService.sendFile(res, await this.sdDownload(meta.id), {inline: false});
    if (as === 'preview' || (mt.startsWith('application/vnd.google-apps.') && mt !== GoogleService.SD_FOLDER)) return GoogleService.sendFile(res, mt.startsWith('application/vnd.google-apps.') ? await this.sdContent(meta.id) : await this.sdPreview(meta.id), {inline: true});
    const safe = /^(image\/(png|jpeg|webp|gif|bmp|avif)|application\/pdf|audio\/[\w.+-]+|video\/[\w.+-]+|text\/plain)$/.test(mt);
    const ascii = String(meta.name || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.setHeader('Content-Type', safe ? (mt === 'text/plain' ? 'text/plain; charset=utf-8' : mt) : 'application/octet-stream'); res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Cache-Control', 'private, max-age=600');
    res.setHeader('Content-Disposition', (safe ? 'inline' : 'attachment') + '; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(String(meta.name || 'arquivo')));
    if (req.method === 'HEAD') { res.statusCode = 200; if (meta.size != null) res.setHeader('Content-Length', String(meta.size)); res.end(); return; }
    const range = /^bytes=\d*-\d*$/.test(String(req.headers.range || '')) ? String(req.headers.range) : '';
    const r = await this.fetch(DRIVE + '/files/' + meta.id + '?alt=media', {headers: {Authorization: 'Bearer ' + await this.token(), ...(range ? {Range: range} : {})}});
    if (r.status === 416) { res.statusCode = 416; const cr = r.headers.get('content-range'); if (cr) res.setHeader('Content-Range', cr); res.end(); return; }
    if (!r.ok && r.status !== 206) throw new AppError('GOOGLE_API', 'Não consegui abrir o arquivo (' + r.status + ').', 502);
    res.statusCode = r.status === 206 ? 206 : 200;
    for (const h of ['content-range', 'content-length']) { const v = r.headers.get(h); if (v) res.setHeader(h, v); }
    if (r.body && typeof r.body.getReader === 'function') {
      const rd = r.body.getReader(); let gone = false; const stop = () => { gone = true; rd.cancel().catch(() => {}); }; res.once('close', stop);
      try { for (;;) { const {done, value} = await rd.read(); if (done || gone) break; if (!res.write(Buffer.from(value))) await new Promise(ok => { res.once('drain', ok); res.once('close', ok); }); if (gone) break; } } finally { res.off('close', stop); if (!gone) res.end(); }
    } else res.end(Buffer.from(await r.arrayBuffer()));
  }
  /** Word/Excel/PowerPoint e afins: o Google converte uma copia temporaria e exporta em PDF para ver na Sofia. */
  /** Visualizacao em PDF guardada (por arquivo e data de modificacao): abrir de novo e na hora, e passar com as setas nao
   * cria uma copia temporaria por arquivo. Ate ~60 MB na memoria. */
  async sdPreview(id) {
    const at0 = await this.sdResolve(id), key = at0.meta.id + '|' + (at0.meta.modifiedTime || '');
    this.sdPrevMemo = this.sdPrevMemo || new Map(); let job = this.sdPrevMemo.get(key);
    if (job) { this.sdPrevMemo.delete(key); this.sdPrevMemo.set(key, job); }
    else { job = this.sdPreviewFresh(id).then(async out => { const buf = Buffer.from(await out.res.arrayBuffer()); return {meta: {...out.meta, size: buf.length}, buf}; });
      this.sdPrevMemo.set(key, job); job.catch(() => this.sdPrevMemo.delete(key)); this.sdPreviewSweep().catch(() => {}); }
    const b = await job;
    let total = 0; for (const [k, v] of [...this.sdPrevMemo].reverse()) { const x = await v.catch(() => null); total += x ? x.buf.length : 0; if (total > 60 * 1024 * 1024) this.sdPrevMemo.delete(k); }
    return {meta: {...b.meta}, res: new Response(b.buf)};
  }
  /** Copias temporarias que sobraram (servidor reiniciou no meio): apaga as com mais de 10 min. */
  async sdPreviewSweep() {
    if (this.sdSweptAt && this.sdSweptAt > Date.now() - 600000) return; this.sdSweptAt = Date.now();
    const r = await this.call('GET', DRIVE + '/files?pageSize=50&fields=files(id,modifiedTime,createdTime)&q=' + encodeURIComponent("appProperties has { key='sofia_cat' and value='preview_tmp' } and trashed=false"));
    for (const f of r.files || []) if (Date.parse(f.createdTime || f.modifiedTime || 0) < Date.now() - 600000) await this.call('DELETE', DRIVE + '/files/' + f.id).catch(() => {});
  }
  async sdPreviewFresh(id) {
    const at = await this.sdResolve(id), mime = String(at.meta.mimeType || ''), name = String(at.meta.name || '');
    const kind = /wordprocessingml|msword|opendocument\.text|rtf|^text\/plain$/.test(mime) || /\.(docx?|odt|rtf)$/i.test(name) ? 'document'
      : /spreadsheetml|ms-excel|opendocument\.spreadsheet|^text\/csv$/.test(mime) || /\.(xlsx?|ods|csv)$/i.test(name) ? 'spreadsheet'
      : /presentationml|ms-powerpoint|opendocument\.presentation/.test(mime) || /\.(pptx?|odp)$/i.test(name) ? 'presentation' : '';
    if (mime.startsWith('application/vnd.google-apps.')) {
      const res = await this.fetch(DRIVE + '/files/' + at.meta.id + '/export?mimeType=application/pdf', {headers: {Authorization: 'Bearer ' + await this.token()}});
      if (!res.ok) throw new AppError('GOOGLE_API', 'O Google não converteu o arquivo (' + res.status + ').', 502);
      return {meta: {name: name + '.pdf', mimeType: 'application/pdf'}, res};
    }
    if (!kind) throw new AppError('BAD_FILE', 'Esse tipo de arquivo não tem visualização; baixe para abrir.', 415);
    const copy = await this.call('POST', DRIVE + '/files/' + at.meta.id + '/copy?fields=id', {name: 'Sofia - visualizacao temporaria (some sozinho)', mimeType: 'application/vnd.google-apps.' + kind, parents: [at.root], appProperties: {sofia_cat: 'preview_tmp'}});
    try {
      const res = await this.fetch(DRIVE + '/files/' + copy.id + '/export?mimeType=application/pdf', {headers: {Authorization: 'Bearer ' + await this.token()}});
      if (!res.ok) throw new AppError('GOOGLE_API', 'O Google não converteu o arquivo (' + res.status + ').', 502);
      const buf = Buffer.from(await res.arrayBuffer());
      return {meta: {name: name.replace(/\.[^.]+$/, '') + '.pdf', mimeType: 'application/pdf', size: buf.length}, res: new Response(buf)};
    } finally { this.call('DELETE', DRIVE + '/files/' + copy.id).catch(() => {}); }
  }

  /** 07/11/2026 (Pedro: arquivos nas Paginas): Word/Excel/PowerPoint anexado a uma pagina -> PDF para ver na janela flutuante.
   * O Google converte uma copia temporaria (apagada logo depois; a varredura apaga sobras). Guarda os ultimos 20. */
  async attachmentPdf(a) {
    const name = String(a.name || ''), mime = String(a.mime || '');
    const kind = /wordprocessingml|msword|opendocument\.text|rtf/.test(mime) || /\.(docx?|odt|rtf)$/i.test(name) ? 'document'
      : /spreadsheetml|ms-excel|opendocument\.spreadsheet|^text\/csv$/.test(mime) || /\.(xlsx?|ods|csv)$/i.test(name) ? 'spreadsheet'
      : /presentationml|ms-powerpoint|opendocument\.presentation/.test(mime) || /\.(pptx?|odp)$/i.test(name) ? 'presentation' : '';
    if (!kind) throw new AppError('BAD_FILE', 'Esse tipo de arquivo não tem visualização; baixe para abrir.', 415);
    if (!this.driveOn()) throw new AppError('NO_DRIVE', 'Para ver Word, Excel e PowerPoint aqui, conecte o Google em Perfil › Conexões.', 409);
    this.attPdfMemo = this.attPdfMemo || new Map(); const hit = this.attPdfMemo.get(a.id); if (hit) return hit;
    const job = (async () => {
      const bytes = await this.attachmentBytes(a);
      const {body, type} = GoogleService.multipart({name: name.replace(/\.[^.]+$/, '') || 'Arquivo' /* 07/11/2026: o titulo do PDF e o nome do arquivo (era 'Sofia - visualizacao temp...') */, mimeType: 'application/vnd.google-apps.' + kind, appProperties: {sofia_cat: 'preview_tmp'}}, mime || 'application/octet-stream', bytes);
      const up = await this.call('POST', UPLOAD + '/files?uploadType=multipart&fields=id', body, {'Content-Type': type});
      try {
        const res = await this.fetch(DRIVE + '/files/' + up.id + '/export?mimeType=application/pdf', {headers: {Authorization: 'Bearer ' + await this.token()}});
        if (!res.ok) throw new AppError('GOOGLE_API', 'O Google não converteu o arquivo (' + res.status + ').', 502);
        return Buffer.from(await res.arrayBuffer());
      } finally { this.call('DELETE', DRIVE + '/files/' + up.id).catch(() => {}); }
    })();
    this.attPdfMemo.set(a.id, job); job.catch(() => this.attPdfMemo.delete(a.id));
    while (this.attPdfMemo.size > 20) this.attPdfMemo.delete(this.attPdfMemo.keys().next().value);
    this.sdPreviewSweep().catch(() => {});
    return job;
  }

  start(intervalMs = 15 * 60000) {
    if (this.timer) return;
    const tick = () => { const l = this.link(); if (!l?.refresh || this.busy) return; this.offloadAttachments().catch(() => {}); this.shrinkDriveCovers(3).catch(() => {}); this.offloadVoices().catch(() => {}); this.exportPages().catch(() => {}); this.sync().catch(() => {}); this.backupToDrive().catch(() => {}); try { this.kickMigration(); this.kickExport(); } catch { /* segue na próxima rodada */ } this.checkHidden().catch(() => {}); this.cleanReceipts().catch(() => {}); this.cleanVoices().catch(() => {}); };
    this.timer = setInterval(tick, intervalMs); this.timer.unref?.();
    // 07/11/2026: o que ainda estiver no servidor (audio recem-transcrito, sobra de envio) vai para o Drive a cada minuto
    this.offTimer = setInterval(() => { const l = this.link(); if (!l?.refresh || !this.driveOn(l)) return; this.offloadAttachments().catch(() => {}); this.offloadVoices().catch(() => {}); }, 60000); this.offTimer.unref?.();
    setTimeout(tick, 30000).unref?.();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; if (this.offTimer) clearInterval(this.offTimer); this.offTimer = null; }
}

module.exports = {ensureThumbColumn, GoogleService, SCOPES, CALLBACK};
