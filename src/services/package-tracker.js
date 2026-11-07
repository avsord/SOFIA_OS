'use strict';
// Encomendas (0.3.142): rastreio inspirado no Muambator. A pessoa cadastra o código e
// dá um nome; o servidor consulta a transportadora de tempos em tempos, guarda a linha
// do tempo e avisa pelo sino/celular quando o status muda. Correios usam o mesmo
// endpoint do app oficial (proxyapp); se a consulta falhar, o registro guarda o motivo
// e o app oferece abrir o rastreio oficial — nunca inventa status.
const CORREIOS = /^[A-Z]{2}\d{9}[A-Z]{2}$/i;
const CARRIERS = [
  { id: 'correios', label: 'Correios', test: c => CORREIOS.test(c) },
  { id: 'jadlog', label: 'Jadlog', test: c => /^\d{14}$/.test(c) },
  { id: 'cainiao', label: 'Cainiao / AliExpress', test: c => /^(LP|CNBR|SYRM|YT|CNB)\w{8,}$/i.test(c) },
  { id: 'shopee', label: 'Shopee (SPX)', test: c => /^BR\d{12,}[A-Z]?$/i.test(c) },
];
function normalizeCode(code) { return String(code || '').replace(/[\s.-]/g, '').toUpperCase(); }
function detectCarrier(code) { const c = normalizeCode(code); return (CARRIERS.find(x => x.test(c)) || { id: 'outro', label: 'Outra transportadora' }).id; }
function carrierLabel(id) { return (CARRIERS.find(x => x.id === id) || { label: 'Outra transportadora' }).label; }
function officialUrl(carrier, code) {
  const c = encodeURIComponent(normalizeCode(code));
  if (carrier === 'correios') return 'https://rastreamento.correios.com.br/app/index.php?objetos=' + c;
  if (carrier === 'jadlog') return 'https://www.jadlog.com.br/siteInstitucional/tracking.jad?cte=' + c;
  if (carrier === 'cainiao') return 'https://global.cainiao.com/newDetail.htm?mailNoList=' + c;
  if (carrier === 'shopee') return 'https://spx.com.br/track?' + c;
  return 'https://www.google.com/search?q=' + c;
}
const DELIVERED = /entregue ao destinat|objeto entregue|entrega efetuada|delivered/i;
/** Lê a resposta do proxyapp dos Correios para uma linha do tempo simples. */
function parseCorreios(payload, code) {
  const obj = (payload && Array.isArray(payload.objetos) ? payload.objetos : []).find(o => normalizeCode(o.codObjeto) === normalizeCode(code)) || (payload && payload.objetos || [])[0];
  if (!obj) throw new Error('Resposta dos Correios sem o objeto.');
  if (obj.mensagem && !(obj.eventos || []).length) return { status: String(obj.mensagem).slice(0, 160), events: [], found: false };
  const events = (obj.eventos || []).map(e => ({
    at: String(e.dtHrCriado || e.dataHora || '').slice(0, 25),
    status: String(e.descricao || e.status || '').trim().slice(0, 160),
    local: [e.unidade && e.unidade.nome, e.unidade && e.unidade.endereco && e.unidade.endereco.cidade, e.unidade && e.unidade.endereco && e.unidade.endereco.uf].filter(Boolean).join(' · ').slice(0, 120),
  })).filter(e => e.status);
  return { status: events[0] ? events[0].status : 'Sem eventos ainda', events, found: true };
}
// 0.3.145: o endpoint do app dos Correios (proxyapp) foi fechado e responde 403 para todos.
// Caminho oficial: API "SRO Rastro" dos Correios (Meu Correios / contrato). Se a Railway tiver
// CORREIOS_API_USER e CORREIOS_API_KEY, a Sofia usa a API oficial; senao, tenta o proxyapp e,
// no 403, explica e espera 24 h antes de tentar de novo (sem martelar os Correios).
const BLOCKED_MSG = 'Os Correios fecharam a consulta automática gratuita. Toque em "Abrir rastreio oficial".';
// 0.3.232: Ship24 (https://docs.ship24.com) rastreia todas as transportadoras (Correios, AliExpress/Cainiao, Shopee...).
// Plano gratis: 10 encomendas NOVAS por mes (renova todo mes). Cadastrar = POST /trackers/track (gasta 1, idempotente);
// atualizar = GET /trackers/{id}/results (NAO gasta cota). Chave na Railway: SHIP24_API_KEY.
const SHIP24 = 'https://api.ship24.com/public/v1';
const MILESTONE_PT = { pending: 'Aguardando a primeira atualização', info_received: 'Postado — informações recebidas', in_transit: 'Em trânsito',
  out_for_delivery: 'Saiu para entrega', failed_attempt: 'Tentativa de entrega sem sucesso', available_for_pickup: 'Disponível para retirada',
  delivered: 'Entregue', exception: 'Problema na entrega' };
const FEE = /aguardando pagamento|pagamento de taxa|taxa|tribut|imposto|despacho postal/i;
function parseShip24(json) {
  const t = json && json.data && Array.isArray(json.data.trackings) ? json.data.trackings[0] : null;
  if (!t) throw new Error('A Ship24 não devolveu o rastreio desta encomenda.');
  const milestone = String(t.shipment && t.shipment.statusMilestone || 'pending');
  const events = (Array.isArray(t.events) ? t.events : []).map(e => ({ at: String(e.occurrenceDatetime || e.datetime || '').slice(0, 25),
    status: String(e.status || '').trim().slice(0, 160), local: String(e.location || '').trim().slice(0, 120), milestone: String(e.statusMilestone || '') })).filter(e => e.status);
  const top = events[0];
  return { status: top ? top.status : (MILESTONE_PT[milestone] || 'Sem eventos ainda'), milestone, milestoneLabel: MILESTONE_PT[milestone] || '',
    events, found: events.length > 0, delivered: milestone === 'delivered', fee: !!(top && FEE.test(top.status)),
    trackerId: t.tracker && t.tracker.trackerId || '', estimated: t.shipment && t.shipment.delivery && t.shipment.delivery.estimatedDeliveryDate || '' };
}
class PackageTracker {
  /** 07/11/2026 (revisao do site): o usuario via "fetch failed" (erro tecnico, em ingles). Traduz para o que aconteceu. */
  static friendly(e) {
    const m = String(e && e.message || e || '');
    if (/fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|network|socket|aborted|timeout/i.test(m)) return 'Não consegui falar com a transportadora agora. Tento de novo sozinha em alguns minutos.';
    if (/429|rate|limit/i.test(m)) return 'A transportadora pediu um tempo entre as consultas. Tento de novo mais tarde.';
    if (/^[\x00-\x7F]*$/.test(m) && !/[áéíóúãõç]/i.test(m) && /[a-z]{4,} [a-z]{3,}/i.test(m)) return 'Não consegui consultar o rastreio agora. Tento de novo mais tarde.';
    return m.slice(0, 160);
  }

  constructor(workspace, options = {}) { this.w = workspace; this.fetch = options.fetchImpl || global.fetch; this.timer = null; this.timeoutMs = options.timeoutMs || 15000; this.env = options.env || process.env; this.token = null; }
  officialConfigured() { return !!(this.env.CORREIOS_API_USER && this.env.CORREIOS_API_KEY); }
  ship24Configured() { return !!this.env.SHIP24_API_KEY; }
  async ship24(method, path, body) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), Math.max(this.timeoutMs, 70000));
    try {
      const res = await this.fetch(SHIP24 + path, { method, signal: ctrl.signal, headers: { Authorization: 'Bearer ' + this.env.SHIP24_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      let json = null; try { json = await res.json(); } catch { json = null; }
      if (!res.ok) {
        const msg = json && Array.isArray(json.errors) && json.errors[0] ? String(json.errors[0].message || json.errors[0].code || '') : '';
        if (res.status === 401) throw new Error('A chave da Ship24 (SHIP24_API_KEY) foi recusada. Confira na Railway.');
        if (res.status === 403) throw new Error('A Ship24 recusou: ' + (msg || 'limite do plano grátis (10 encomendas novas por mês) ou permissão da chave') + '.');
        if (res.status === 429) throw new Error('Muitas consultas seguidas na Ship24; tento de novo mais tarde.');
        throw new Error('A Ship24 respondeu ' + res.status + (msg ? ': ' + msg : '') + '.');
      }
      return json;
    } finally { clearTimeout(t); }
  }
  /** Ship24: cadastra uma vez (gasta 1 da cota mensal) e depois so le os resultados (gratis). */
  async fetchShip24(code, d) {
    if (d && d.ship24_tracker_id) return parseShip24(await this.ship24('GET', '/trackers/' + encodeURIComponent(d.ship24_tracker_id) + '/results'));
    return parseShip24(await this.ship24('POST', '/trackers/track', { trackingNumber: normalizeCode(code), destinationCountryCode: 'BR' }));
  }
  async officialToken() {
    if (this.token && this.token.until > Date.now() + 60000) return this.token.value;
    const basic = Buffer.from(this.env.CORREIOS_API_USER + ':' + this.env.CORREIOS_API_KEY).toString('base64');
    const res = await this.fetch('https://api.correios.com.br/token/v1/autentica', { method: 'POST', headers: { Authorization: 'Basic ' + basic, Accept: 'application/json' } });
    if (!res.ok) throw new Error('Correios recusaram as credenciais da API (' + res.status + ').');
    const j = await res.json(); const until = Date.parse(j.expiraEm || '') || Date.now() + 30 * 60000;
    this.token = { value: j.token, until }; return j.token;
  }
  async fetchOfficial(code) {
    const token = await this.officialToken();
    const res = await this.fetch('https://api.correios.com.br/srorastro/v1/objetos/' + encodeURIComponent(normalizeCode(code)) + '?resultado=T', { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
    if (!res.ok) throw new Error('API oficial dos Correios respondeu ' + res.status + '.');
    return parseCorreios(await res.json(), code);
  }
  async fetchCorreios(code) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetch('https://proxyapp.correios.com.br/v1/sro-rastro/' + encodeURIComponent(normalizeCode(code)), {
        headers: { 'User-Agent': 'Dart/2.8 (dart:io)', Accept: 'application/json', 'Accept-Language': 'pt-BR' }, signal: ctrl.signal });
      if (res.status === 403 || res.status === 401) throw Object.assign(new Error(BLOCKED_MSG), { blocked: true });
      if (!res.ok) throw new Error('Correios responderam ' + res.status + '.');
      return parseCorreios(await res.json(), code);
    } finally { clearTimeout(t); }
  }
  async lookup(carrier, code, d = {}) {
    if (this.ship24Configured()) return this.fetchShip24(code, d);
    if (carrier === 'correios') return this.officialConfigured() ? this.fetchOfficial(code) : this.fetchCorreios(code);
    return { status: 'Acompanhamento automático só para Correios por enquanto', events: [], found: false, unsupported: true };
  }
  /** Atualiza um registro; devolve {item, changed}. Nunca lança por falha da transportadora. */
  async refresh(item) {
    const d = { ...(item.data || {}) }, code = normalizeCode(d.code), carrier = d.carrier || detectCarrier(code);
    let result, error = '', blocked = false;
    try { result = await this.lookup(carrier, code, d); } catch (e) { error = PackageTracker.friendly(e); blocked = !!(e && e.blocked); }
    const now = new Date().toISOString();
    if (!result) {
      const saved = this.w.save({ ...item, data: { ...d, carrier, checked_at: now, error, blocked_until: blocked ? new Date(Date.now() + 24 * 3600000).toISOString() : '' } }, item.id);
      return { item: saved, changed: false, error };
    }
    const previous = (() => { try { return JSON.parse(d.events || '[]'); } catch { return []; } })();
    const key = e => e.at + '|' + e.status;
    const changed = result.found && result.events.length && (!previous.length || key(result.events[0]) !== key(previous[0]));
    const delivered = !!result.delivered || result.events.some(e => DELIVERED.test(e.status));
    const saved = this.w.save({ ...item, state: delivered ? 'delivered' : item.state === 'archived' ? 'archived' : 'active',
      data: { ...d, carrier, status: result.status, last_event_at: result.events[0] ? result.events[0].at : d.last_event_at || '', events: JSON.stringify(result.events.slice(0, 60)), checked_at: now, ok_at: result.found ? now : d.ok_at || '', error: result.found ? '' : result.status, ...(result.trackerId ? { ship24_tracker_id: result.trackerId } : {}), ...(result.milestone ? { milestone: result.milestone, milestone_label: result.milestoneLabel || '' } : {}), fee: !!result.fee, estimated: result.estimated || d.estimated || '' } }, item.id);
    if (changed) {
      const top = result.events[0];
      this.w.notify('package', (delivered ? '📦 Entregue: ' : result.fee ? '💰 Taxa a pagar: ' : '📦 ') + (item.title || code), top.status + (top.local ? ' · ' + top.local : ''), saved.id, delivered ? 'opportunity' : result.fee ? 'warning' : 'info', 'package:' + saved.id + ':' + key(top));
    }
    return { item: saved, changed: !!changed, error: '' };
  }
  async refreshOne(id) {
    const item = this.w.get(id);
    if (!item || item.kind !== 'package') throw Object.assign(new Error('Encomenda não encontrada.'), { status: 404 });
    return this.refresh(item);
  }
  async checkAll() {
    const now = Date.now();
    const items = this.w.list({ kind: 'package', limit: 500 }).filter(x => x.state === 'active' && !(Date.parse(x.data && x.data.blocked_until || '') > now));
    let changed = 0;
    for (const item of items) { try { if ((await this.refresh(item)).changed) changed++; } catch { /* segue para a próxima */ } }
    return changed;
  }
  start(intervalMs = 2 * 60 * 60000) {
    if (this.timer) return;
    this.timer = setInterval(() => this.checkAll().catch(() => {}), intervalMs); this.timer.unref?.();
    setTimeout(() => this.checkAll().catch(() => {}), 45000).unref?.();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
module.exports = { BLOCKED_MSG, PackageTracker, parseShip24, MILESTONE_PT, detectCarrier, carrierLabel, officialUrl, normalizeCode, parseCorreios, CARRIERS };
