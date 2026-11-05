// Núcleo do app Monitoramento, sem React: tudo aqui é testável em Node.
// Regra de ouro: nenhum preço é inventado. Uma linha só existe onde houve
// leitura real; uma loja que falhou fica marcada, nunca preenchida.
import type {Entity} from './types';

export const PRODUCT_COLORS = ['#a98bff', '#4fa3ff', '#2fc58b', '#ffb547', '#ff6b7a', '#ef7bd0', '#3fd0d4', '#c6d84a'] as const;

export type Store = {url: string; host: string; name: string; primary: boolean};
export type Obs = {id: string; source: string; total: number; at: number};
export type Point = {t: number; v: number};
export type StoreSeries = Store & {points: Point[]; last: Obs | null};
export type ProductSeries = {
  monitor: Entity; color: string; currency: string; stores: StoreSeries[];
  best: Point[]; // melhor preço entre as lojas ao longo do tempo
  now: {price: number; store: Store} | null;
  change: number | null; // variação % da melhor oferta desde a leitura anterior diferente
  low: {price: number; at: number} | null;
  atLow: boolean; lastAt: number | null;
};

const KNOWN: Array<[RegExp, string, string]> = [
  [/(^|\.)kabum\.com\.br$/, 'KaBuM!', 'kabum'],
  [/(^|\.)mercadolivre\.com\.br$|(^|\.)mercadolibre\.com$/, 'Mercado Livre', 'mercadolivre'],
  [/(^|\.)pichau\.com\.br$/, 'Pichau', 'pichau'],
  [/(^|\.)aliexpress\.(com|us)$/, 'AliExpress', 'aliexpress'],
  [/(^|\.)shopee\.com\.br$/, 'Shopee', 'shopee'],
  [/(^|\.)amazon\.com\.br$/, 'Amazon', 'amazon'],
  [/(^|\.)magazineluiza\.com\.br$|(^|\.)magalu\.com$/, 'Magalu', 'magalu'],
  [/(^|\.)terabyteshop\.com\.br$/, 'Terabyte', 'terabyte'],
  [/(^|\.)casasbahia\.com\.br$/, 'Casas Bahia', 'casasbahia'],
];

/** Acha o link num texto de compartilhamento ("Olha isso no Mercado Livre! https://...")
 * e devolve sempre https. Aceita link sem protocolo (mercadolivre.com.br/...). */
export function extractProductUrl(text: string): string {
  const t = String(text || '').trim();
  const m = t.match(/https?:\/\/[^\s<>"']+/i) || t.match(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}(?:\/[^\s<>"']*)?/i);
  if (!m) return '';
  let url = m[0].replace(/[),.;!?]+$/, '');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url.replace(/^http:\/\//i, 'https://');
}
/** Endereço que o leitor de preço abre (o link guardado não muda):
 * - Mercado Livre: tira rastreio e o '#origin=share'; se o link aponta um
 *   anúncio (pdp_filters=item_id:MLB...), abre o anúncio direto.
 * - AliExpress e Mercado Livre abrem como computador (ver readerAgent), porque a
 *   versão de celular tenta mandar para o app e não mostra o preço. */
export function readerUrl(url: string): string {
  let u: URL; try { u = new URL(url); } catch { return url; }
  const host = u.hostname.replace(/^www\./, '');
  if (/(^|\.)mercadolivre\.com\.br$|(^|\.)mercadolibre\.com$/.test(host)) {
    const item = /item_id:(MLB)-?(\d{6,})/i.exec(u.searchParams.get('pdp_filters') || '') || /\b(MLB)-?(\d{6,})/i.exec(u.searchParams.get('wid') || u.hash || '');
    if (/^\/p\/MLB\d+/i.test(u.pathname) && item) return 'https://produto.mercadolivre.com.br/MLB-' + item[2];
    u.search = ''; u.hash = '';
    return u.toString();
  }
  if (/(^|\.)aliexpress\.(com|us)$/.test(host)) { u.hash = ''; ['spm', 'scm', 'pdp_npi', 'sourceType', 'aff_fcid', 'aff_fsk', 'aff_platform', 'sk', 'aff_trace_key', 'terminal_id', 'afSmartRedirect'].forEach(k => u.searchParams.delete(k)); return u.toString(); }
  return url;
}
export function readerAgent(url: string): 'desktop' | 'mobile' {
  // O Mercado Livre voltou a mostrar o site de computador aqui, mas agora pedindo login para ver
  // o produto — provavelmente porque "computador sem histórico nenhum" parece mais suspeito para
  // eles do que um celular comum. Volta a se apresentar como celular, igual à leitura das outras lojas.
  return /aliexpress\./i.test(url) ? 'desktop' : 'mobile';
}
export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}
export function storeName(url: string): string {
  const host = hostOf(url);
  for (const [re, name] of KNOWN) if (re.test(host)) return name;
  const base = host.split('.')[0] || host;
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Loja';
}
export function storeKey(url: string): string {
  const host = hostOf(url);
  for (const [re, , key] of KNOWN) if (re.test(host)) return key;
  return host;
}

export function storesOf(monitor: Entity): Store[] {
  const d = monitor.data || {};
  const urls = [String(d.preferred_url || ''), ...String(d.source_urls || '').split('\n')].map(s => s.trim()).filter(Boolean);
  const seen = new Set<string>(), out: Store[] = [];
  urls.forEach((url, i) => {
    if (seen.has(url) || !/^https:\/\//.test(url)) return;
    seen.add(url);
    out.push({url, host: hostOf(url), name: storeName(url), primary: i === 0 && url === String(d.preferred_url || '')});
  });
  return out;
}

export function observationsOf(rows: Record<string, any>[]): Obs[] {
  return rows.map(r => ({id: String(r.id), source: String(r.source || ''), total: Number(r.total_cents) / 100, at: Date.parse(r.observed_at)}))
    .filter(o => Number.isFinite(o.total) && o.total > 0 && Number.isFinite(o.at)).sort((a, b) => a.at - b.at);
}

export function colorOf(monitor: Entity, index = 0): string {
  const c = String(monitor.data?.line_color || '');
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : PRODUCT_COLORS[index % PRODUCT_COLORS.length];
}
export function nextColor(used: string[]): string {
  return PRODUCT_COLORS.find(c => !used.includes(c)) || PRODUCT_COLORS[used.length % PRODUCT_COLORS.length];
}

/** Melhor preço ao longo do tempo: a cada leitura, o menor entre o último
 * preço conhecido de cada loja ainda cadastrada. Loja removida sai da conta. */
export function bestLine(stores: Store[], obs: Obs[]): Point[] {
  const allowed = new Set(stores.map(s => s.url)), latest = new Map<string, number>(), out: Point[] = [];
  for (const o of obs) {
    if (!allowed.has(o.source)) continue;
    latest.set(o.source, o.total);
    const v = Math.min(...latest.values());
    const prev = out.at(-1);
    if (prev && prev.t === o.at) prev.v = v; else out.push({t: o.at, v});
  }
  return out;
}

export function buildProduct(monitor: Entity, rows: Record<string, any>[], index = 0): ProductSeries {
  const stores = storesOf(monitor), obs = observationsOf(rows);
  const storeSeries: StoreSeries[] = stores.map(s => {
    const mine = obs.filter(o => o.source === s.url);
    return {...s, points: mine.map(o => ({t: o.at, v: o.total})), last: mine.at(-1) || null};
  });
  const best = bestLine(stores, obs);
  const priced = storeSeries.filter(s => s.last).sort((a, b) => a.last!.total - b.last!.total);
  const now = priced.length ? {price: priced[0].last!.total, store: priced[0] as Store} : null;
  let change: number | null = null;
  if (now) {
    for (let i = best.length - 2; i >= 0; i--) if (best[i].v !== now.price) { change = (now.price - best[i].v) / best[i].v * 100; break; }
  }
  const lowPoint = best.reduce<Point | null>((m, p) => (!m || p.v < m.v ? p : m), null);
  const low = lowPoint ? {price: lowPoint.v, at: lowPoint.t} : null;
  // "Menor preço já visto" só faz sentido se o preço já foi MAIOR em algum momento.
  // Preço que nunca mudou não é "o menor": é o único.
  const atLow = !!now && !!low && best.some(p => p.v > low.price) && now.price <= low.price;
  const lastAt = obs.length ? obs.at(-1)!.at : null;
  return {monitor, color: colorOf(monitor, index), currency: String(monitor.data?.currency || 'BRL'), stores: storeSeries, best, now, change, low, atLow, lastAt};
}

export function money(value: number, currency = 'BRL'): string {
  try { return value.toLocaleString('pt-BR', {style: 'currency', currency}); } catch { return currency + ' ' + value.toFixed(2); }
}
export function percent(value: number): string {
  const v = Math.abs(value);
  return (value < 0 ? '−' : '+') + (v >= 10 ? v.toFixed(0) : v.toFixed(1)).replace('.', ',') + '%';
}
export function since(at: number | null, now = Date.now()): string {
  if (!at) return 'ainda não lido';
  const m = Math.max(0, Math.round((now - at) / 60000));
  if (m < 1) return 'agora';
  if (m < 60) return 'há ' + m + ' min';
  const h = Math.round(m / 60);
  if (h < 24) return 'há ' + h + ' h';
  const d = Math.round(h / 24);
  return 'há ' + d + (d === 1 ? ' dia' : ' dias');
}

// ---------- Gráfico ----------
export type Window = '7d' | '30d' | '90d' | 'all';
export const WINDOWS: Array<{value: Window; label: string; ms: number}> = [
  {value: '7d', label: '7D', ms: 7 * 864e5}, {value: '30d', label: '30D', ms: 30 * 864e5},
  {value: '90d', label: '90D', ms: 90 * 864e5}, {value: 'all', label: 'Tudo', ms: Infinity},
];
export type ChartLine = {id: string; color: string; points: Point[]};
export type ChartMode = 'price' | 'change';
export type Geometry = {
  width: number; height: number; x0: number; x1: number; y0: number; y1: number; mode: ChartMode;
  lines: Array<{id: string; color: string; path: Array<[number, number]>; last: [number, number] | null}>; refY: number[];
  yTicks: Array<{y: number; value: number}>; xTicks: Array<{x: number; t: number}>;
};

/** Produtos de preços muito diferentes (R$ 80 e R$ 4.000) achatam o gráfico
 * em reais; nesse caso o padrão é a variação %, que deixa todos legíveis. */
export function preferredMode(lines: ChartLine[]): ChartMode {
  const lasts = lines.map(l => l.points.at(-1)?.v).filter((v): v is number => !!v);
  if (lasts.length < 2) return 'price';
  return Math.max(...lasts) / Math.min(...lasts) > 3 ? 'change' : 'price';
}

function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count), mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

export function chartGeometry(input: ChartLine[], opts: {width: number; height: number; window: Window; mode: ChartMode; now?: number; pad?: {l: number; r: number; t: number; b: number}; refs?: number[]}): Geometry | null {
  const now = opts.now ?? Date.now(), win = WINDOWS.find(w => w.value === opts.window)!;
  const from = Number.isFinite(win.ms) ? now - win.ms : -Infinity;
  const pad = opts.pad || {l: 8, r: 8, t: 10, b: 10};
  const lines = input.map(l => {
    // Mantém a última leitura anterior à janela como âncora no início dela,
    // para a linha não "nascer" no meio do gráfico sem motivo.
    const inside = l.points.filter(p => p.t >= from), before = l.points.filter(p => p.t < from).at(-1);
    let pts = before && Number.isFinite(from) ? [{t: from, v: before.v}, ...inside] : inside;
    if (opts.mode === 'change' && pts.length) { const base = pts[0].v; pts = pts.map(p => ({t: p.t, v: (p.v - base) / base * 100})); }
    return {id: l.id, color: l.color, points: pts};
  }).filter(l => l.points.length);
  if (!lines.length) return null;
  const all = lines.flatMap(l => l.points);
  const x0 = Number.isFinite(from) ? Math.min(from, ...all.map(p => p.t)) : Math.min(...all.map(p => p.t));
  const x1 = Math.max(now, ...all.map(p => p.t));
  const refs = opts.mode === 'price' ? (opts.refs || []).filter(Number.isFinite) : [];
  let y0 = Math.min(...all.map(p => p.v), ...refs), y1 = Math.max(...all.map(p => p.v), ...refs);
  if (opts.mode === 'change') { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  const span = y1 - y0 || Math.max(1, Math.abs(y1) * 0.1);
  const step = niceStep(span * 1.2, 3);
  y0 = Math.floor((y0 - span * 0.08) / step) * step; y1 = Math.ceil((y1 + span * 0.08) / step) * step;
  if (opts.mode === 'price') y0 = Math.max(0, y0);
  if (y1 <= y0) y1 = y0 + step;
  const W = opts.width, H = opts.height;
  const X = (t: number) => pad.l + (t - x0) / (x1 - x0 || 1) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const out = lines.map(l => {
    // Degraus: o preço vale até a próxima leitura; a última se estende até agora.
    const path: Array<[number, number]> = [];
    l.points.forEach((p, i) => {
      if (i > 0) path.push([X(p.t), Y(l.points[i - 1].v)]);
      path.push([X(p.t), Y(p.v)]);
    });
    const lastP = l.points.at(-1)!;
    path.push([X(x1), Y(lastP.v)]);
    return {id: l.id, color: l.color, path, last: [X(x1), Y(lastP.v)] as [number, number]};
  });
  const yTicks: Geometry['yTicks'] = [];
  for (let v = y0; v <= y1 + step / 2; v += step) yTicks.push({y: Y(v), value: Math.round(v * 100) / 100});
  const xTicks = [0, 0.5, 1].map(f => ({x: pad.l + f * (W - pad.l - pad.r), t: x0 + f * (x1 - x0)}));
  return {width: W, height: H, x0, x1, y0, y1, mode: opts.mode, lines: out, yTicks, xTicks, refY: refs.map(Y)};
}

export function svgPath(path: Array<[number, number]>): string {
  return path.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
}

// ---------- Alertas ----------
export type AlertSettings = {newLow: boolean; drop: number | null; target: number | null};
export function alertsOf(monitor: Entity): AlertSettings {
  const d = monitor.data || {};
  return {newLow: !!d.new_low, drop: typeof d.drop_percent === 'number' && d.drop_percent > 0 ? d.drop_percent : null,
    target: typeof d.target_price === 'number' && d.target_price > 0 ? d.target_price : null};
}
export function alertSummary(a: AlertSettings, currency = 'BRL'): string {
  const parts: string[] = [];
  if (a.newLow) parts.push('menor preço já visto');
  if (a.drop) parts.push('queda de ' + a.drop + '%');
  if (a.target) parts.push('até ' + money(a.target, currency));
  return parts.length ? 'Avisa: ' + parts.join(' · ') : 'Sem avisos';
}

/** Mesma regra do servidor (workspace.observe), para o aviso no celular sair
 * na hora da leitura. Queda compara com a leitura anterior DA MESMA loja. */
export function alertReasons(monitor: Entity, rows: Record<string, any>[], source: string, total: number): string[] {
  const a = alertsOf(monitor), obs = observationsOf(rows), reasons: string[] = [];
  const sameStore = obs.filter(o => o.source === source).at(-1);
  const min = obs.length ? Math.min(...obs.map(o => o.total)) : null;
  if (a.target !== null && total <= a.target) reasons.push('chegou no seu preço (' + money(a.target, String(monitor.data?.currency || 'BRL')) + ')');
  if (a.drop !== null && sameStore && total < sameStore.total && (sameStore.total - total) / sameStore.total * 100 >= a.drop) reasons.push('caiu ' + percent((total - sameStore.total) / sameStore.total * 100).replace('−', ''));
  if (a.newLow && min !== null && total < min) reasons.push('menor preço já visto');
  if (sameStore && sameStore.total === total) return [];
  return reasons;
}

export const DROP_CHOICES = [5, 10, 15, 20, 30];
export const INTERVALS: Array<{value: number; label: string}> = [
  {value: 60, label: '1 h'}, {value: 180, label: '3 h'}, {value: 360, label: '6 h'}, {value: 720, label: '12 h'}, {value: 1440, label: '24 h'},
];

// ---------- Coleta ----------
export function storesDue(product: ProductSeries, now = Date.now(), force = false): Store[] {
  if (product.monitor.state !== 'active') return [];
  const minutes = Number(product.monitor.data?.interval_minutes) || 360;
  return product.stores.filter(s => force || !s.last || now - s.last.at >= minutes * 60000);
}

/** Lembra, por loja, de onde na página veio o preço que o usuário confirmou.
 * Assim uma leitura ambígua depois pode ser resolvida sem chute. */
export function readMemory(monitor: Entity): Record<string, string[]> {
  try { const m = JSON.parse(String(monitor.data?.reader_memory || '{}')); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch { return {}; }
}
export function withMemory(monitor: Entity, url: string, origins: string[]): string {
  const m = readMemory(monitor); m[url] = origins.slice(0, 4);
  return JSON.stringify(m);
}

export type Candidate = {amount: number; currency: string | null; origins: string[]; confidence: number};
/** Decide se uma leitura pode ser gravada sozinha. Só grava quando a página é
 * inequívoca OU quando bate com a origem que o usuário já confirmou. */
export function pickAutomatic(result: {needsConfirmation: boolean; best: Candidate | null; candidates: Candidate[]}, remembered: string[] | undefined): Candidate | null {
  if (result.best && !result.needsConfirmation) return result.best;
  if (remembered && remembered.length) {
    const hit = result.candidates.find(c => c.origins.some(o => remembered.includes(o)));
    if (hit) return hit;
  }
  return null;
}

// ---------- Outras lojas ----------
export type SearchTarget = {key: string; name: string; host: string; url: (q: string) => string};
const slug = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const query = (t: string) => encodeURIComponent(t.replace(/\s+/g, ' ').trim());
export const SEARCH_TARGETS: SearchTarget[] = [
  {key: 'kabum', name: 'KaBuM!', host: 'kabum.com.br', url: q => 'https://www.kabum.com.br/busca/' + slug(q)},
  {key: 'mercadolivre', name: 'Mercado Livre', host: 'mercadolivre.com.br', url: q => 'https://lista.mercadolivre.com.br/' + slug(q)},
  {key: 'pichau', name: 'Pichau', host: 'pichau.com.br', url: q => 'https://www.pichau.com.br/search?q=' + query(q)},
  {key: 'amazon', name: 'Amazon', host: 'amazon.com.br', url: q => 'https://www.amazon.com.br/s?k=' + query(q)},
  {key: 'magalu', name: 'Magalu', host: 'magazineluiza.com.br', url: q => 'https://www.magazineluiza.com.br/busca/' + slug(q) + '/'},
];
/** Título curto de busca: sem ruído de anúncio, até 8 palavras. */
export function searchTerms(title: string): string {
  return title.replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\b(frete gr[aá]tis|oferta|promo[cç][aã]o|lan[cç]amento|original|novo)\b/gi, ' ')
    .replace(/[|,–—\-]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 8).join(' ');
}
export function searchTargetsFor(stores: Store[]): SearchTarget[] {
  const have = new Set(stores.map(s => storeKey(s.url)));
  return SEARCH_TARGETS.filter(t => !have.has(t.key));
}
export function addSource(monitor: Entity, url: string): string {
  const current = String(monitor.data?.source_urls || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (url === monitor.data?.preferred_url || current.includes(url)) return current.join('\n');
  return [...current, url].slice(0, 10).join('\n');
}
export function removeSource(monitor: Entity, url: string): {preferred_url: string; source_urls: string} {
  const list = storesOf(monitor).map(s => s.url).filter(u => u !== url);
  return {preferred_url: list[0] || '', source_urls: list.slice(1).join('\n')};
}
/** Troca o link de uma loja mantendo a ordem (a principal continua principal). */
export function replaceSource(monitor: Entity, oldUrl: string, newUrl: string): {preferred_url: string; source_urls: string} {
  const list = storesOf(monitor).map(s => s.url).map(u => u === oldUrl ? newUrl : u).filter((u, i, all) => all.indexOf(u) === i);
  return {preferred_url: list[0] || '', source_urls: list.slice(1).join('\n')};
}
export function makePrimary(monitor: Entity, url: string): {preferred_url: string; source_urls: string} {
  const list = storesOf(monitor).map(s => s.url).filter(u => u !== url);
  return {preferred_url: url, source_urls: list.join('\n')};
}

// ---------- Análise do produto ----------
export type Change = {t: number; store: string; url: string; from: number; to: number; pct: number};
export type StoreStats = {url: string; name: string; primary: boolean; now: number | null; min: number | null; max: number | null; avg: number | null; changes: number; cheapestShare: number | null; lastChange: number | null; readings: number};
export type Verdict = {kind: 'great' | 'good' | 'normal' | 'high' | 'unknown'; title: string; text: string};
export type Analysis = {
  from: number; to: number; readings: number; days: number;
  min: {v: number; t: number} | null; max: {v: number; t: number} | null; avg: number | null; median: number | null;
  vsAvg: number | null; position: number | null; // 0 = menor do período, 1 = maior
  flat: boolean; // menor e maior do período são o mesmo valor (preço não variou)
  spread: {cheap: string; expensive: string; diff: number} | null;
  saving: number | null; // quanto o melhor preço de agora economiza vs o maior do período
  verdict: Verdict; changes: Change[]; stores: StoreStats[];
};

/** Média ponderada pelo TEMPO em que cada preço valeu (degrau), não pela
 * quantidade de leituras: ler 10 vezes o mesmo preço não pesa 10 vezes. */
export function timeWeightedAverage(points: Point[], from: number, to: number): number | null {
  const pts = points.filter(p => p.t <= to);
  if (!pts.length) return null;
  let total = 0, span = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = Math.max(pts[i].t, from), b = Math.min(i + 1 < pts.length ? pts[i + 1].t : to, to);
    if (b > a) { total += pts[i].v * (b - a); span += b - a; }
  }
  return span ? total / span : pts.at(-1)!.v;
}

export function analyzeProduct(p: ProductSeries, window: Window, now = Date.now()): Analysis {
  const win = WINDOWS.find(w => w.value === window)!;
  const first = p.best[0]?.t ?? now;
  const from = Number.isFinite(win.ms) ? Math.max(now - win.ms, first) : first;
  const before = p.best.filter(x => x.t < from).at(-1);
  const inWin = [...(before ? [{t: from, v: before.v}] : []), ...p.best.filter(x => x.t >= from)];
  const vals = inWin.map(x => x.v);
  const minP = inWin.reduce<Point | null>((m, x) => (!m || x.v < m.v ? x : m), null);
  const maxP = inWin.reduce<Point | null>((m, x) => (!m || x.v > m.v ? x : m), null);
  const flat = !!minP && !!maxP && maxP.v === minP.v;
  const avg = timeWeightedAverage(inWin, from, now);
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  const cur = p.now?.price ?? null;
  const vsAvg = cur !== null && avg ? (cur - avg) / avg * 100 : null;
  const position = cur !== null && minP && maxP && maxP.v > minP.v ? (cur - minP.v) / (maxP.v - minP.v) : null;

  // Mudanças de preço por loja (só quando o valor muda de fato).
  const changes: Change[] = [];
  for (const s of p.stores) {
    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i - 1].v, b = s.points[i].v;
      if (a !== b && s.points[i].t >= from) changes.push({t: s.points[i].t, store: s.name, url: s.url, from: a, to: b, pct: (b - a) / a * 100});
    }
  }
  changes.sort((a, b) => b.t - a.t);

  // Por loja: estatística da janela e fração do tempo em que foi a mais barata.
  const cheapest = new Map<string, number>(); let covered = 0;
  const events = [...new Set(p.stores.flatMap(s => s.points.map(x => x.t)))].sort((a, b) => a - b);
  for (let i = 0; i < events.length; i++) {
    const a = Math.max(events[i], from), b = Math.min(i + 1 < events.length ? events[i + 1] : now, now);
    if (b <= a) continue;
    let best: {url: string; v: number} | null = null;
    for (const s of p.stores) { const v = s.points.filter(x => x.t <= events[i]).at(-1)?.v; if (v !== undefined && (!best || v < best.v)) best = {url: s.url, v}; }
    if (best) { cheapest.set(best.url, (cheapest.get(best.url) || 0) + (b - a)); covered += b - a; }
  }
  const stores: StoreStats[] = p.stores.map(s => {
    const anchor = s.points.filter(x => x.t < from).at(-1);
    const pts = [...(anchor ? [{t: from, v: anchor.v}] : []), ...s.points.filter(x => x.t >= from)];
    const v = pts.map(x => x.v);
    let ch = 0, lastChange: number | null = null;
    for (let i = 1; i < s.points.length; i++) if (s.points[i].v !== s.points[i - 1].v && s.points[i].t >= from) { ch++; lastChange = s.points[i].t; }
    return {url: s.url, name: s.name, primary: s.primary, now: s.last?.total ?? null, min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null,
      avg: timeWeightedAverage(pts, from, now), changes: ch, cheapestShare: covered ? (cheapest.get(s.url) || 0) / covered : null, lastChange,
      readings: s.points.filter(x => x.t >= from).length};
  });
  const priced = stores.filter(s => s.now !== null).sort((a, b) => a.now! - b.now!);
  const spread = priced.length > 1 ? {cheap: priced[0].name, expensive: priced.at(-1)!.name, diff: priced.at(-1)!.now! - priced[0].now!} : null;
  const saving = cur !== null && maxP && maxP.v > cur ? maxP.v - cur : null;
  const readings = p.stores.reduce((n, s) => n + s.points.filter(x => x.t >= from).length, 0);
  const days = Math.max(0, (now - from) / 864e5);

  let verdict: Verdict;
  if (cur === null) verdict = {kind: 'unknown', title: 'Sem leitura ainda', text: 'Assim que a Sofia ler o preço, a análise começa.'};
  else if (p.best.length < 3 || days < 2) verdict = {kind: 'unknown', title: 'Ainda conhecendo o preço', text: 'Com mais alguns dias de leituras dá pra dizer se o preço está bom.'};
  else if (flat) verdict = {kind: 'normal', title: 'Preço estável', text: 'O preço não mudou no período, então ainda não dá pra dizer se está baixo ou alto.'};
  else if (p.atLow) verdict = {kind: 'great', title: 'Melhor momento até agora', text: 'É o menor preço desde que você começou a acompanhar.'};
  else if (position !== null && position <= 0.25) verdict = {kind: 'good', title: 'Bom preço', text: 'Está entre os mais baixos do período' + (vsAvg !== null ? ', ' + percent(vsAvg).replace('−', '') + ' abaixo da média.' : '.')};
  else if (position !== null && position >= 0.75) verdict = {kind: 'high', title: 'Caro agora', text: 'Está perto do maior preço do período. Se puder, espere.'};
  else verdict = {kind: 'normal', title: 'Preço dentro do normal', text: vsAvg === null ? 'Sem variação relevante no período.' : (vsAvg < 0 ? percent(vsAvg).replace('−', '') + ' abaixo' : percent(vsAvg).replace('+', '') + ' acima') + ' da média do período.'};

  return {from, to: now, readings, days, min: minP ? {v: minP.v, t: minP.t} : null, max: maxP ? {v: maxP.v, t: maxP.t} : null, avg, median, vsAvg, position, flat, spread, saving, verdict, changes, stores};
}

export function allReadings(p: ProductSeries): Array<{t: number; store: string; v: number}> {
  return p.stores.flatMap(s => s.points.map(x => ({t: x.t, store: s.name, v: x.v}))).sort((a, b) => b.t - a.t);
}

// ---------- Widget da Início ----------
/** Só o que o widget desenha: pequeno o bastante para ficar no cache de abertura
 * e aparecer no primeiro quadro, antes de qualquer consulta à rede. */
export type MonitorWidgetRow = {id: string; title: string; color: string; currency: string; atLow: boolean; lastAt: number | null;
  price: number | null; store: string | null; change: number | null};
/** 0.3.146: o Inicio mostra a OFERTA PRINCIPAL que a pessoa escolheu (loja principal), nao a mais
 * barata do momento. As outras lojas continuam acompanhadas, so nao aparecem no widget. Se a
 * principal ainda nao tem nenhuma leitura, mostra a melhor oferta com a loja indicada. */
export function primaryNow(p: ProductSeries): {price: number; store: Store; change: number | null} | null {
  // 05/11/2026 (Pedro: "o menor preco nos dois lugares, tem que ser o que e real do site da loja"): o preco mostrado em todo lugar
  // (Inicio, lista e detalhe) e a oferta atual mais barata entre as lojas; a loja principal so vale se nenhuma tiver leitura
  if (p.now) return {price: p.now.price, store: p.now.store, change: p.change};
  const primary = p.stores.find(s => s.primary);
  const pts = primary ? primary.points : [];
  if (primary && pts.length) {
    const last = pts[pts.length - 1].v; let prev: number | null = null;
    for (let i = pts.length - 2; i >= 0; i--) if (pts[i].v !== last) { prev = pts[i].v; break; }
    return {price: last, store: primary, change: prev ? (last - prev) / prev * 100 : null};
  }
  return null;
}
export function widgetRows(list: ProductSeries[]): MonitorWidgetRow[] {
  return [...list].sort((a, b) => Number(b.atLow) - Number(a.atLow) || (b.lastAt ?? 0) - (a.lastAt ?? 0)).map(p => { const n = primaryNow(p); return {
    id: p.monitor.id, title: String(p.monitor.title || ''), color: p.color, currency: p.currency, atLow: p.atLow && !!n && !!p.low && n.price <= p.low.price /* 04/11/2026 (Pedro: valor do Inicio diferente do app): "menor preco" so se o preco MOSTRADO e o menor */, lastAt: p.lastAt,
    price: n ? n.price : null, store: n ? n.store.name : null, change: n ? n.change : null}; });
}
/** Aceita só o formato atual (cache de versão antiga ou corrompido vira "sem cache"). */
export function validWidgetRows(v: unknown): MonitorWidgetRow[] | null {
  if (!Array.isArray(v)) return null;
  return v.every(r => r && typeof r.id === 'string' && typeof r.title === 'string' && typeof r.color === 'string' && typeof r.atLow === 'boolean') ? v as MonitorWidgetRow[] : null;
}
