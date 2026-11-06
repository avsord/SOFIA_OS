// 06/11/2026 (Pedro: "paginas com senha, e tudo que esta la dentro fica criptografado"; desenho aprovado com 2 niveis):
// o conteudo (blocos) da pagina e das subpaginas e cifrado AQUI, no navegador, com uma chave aleatoria da pagina (AES-GCM).
// Essa chave fica guardada embrulhada pela senha da pagina (PBKDF2-SHA256, 310 mil voltas). O servidor so recebe texto
// cifrado. Nivel Maxima: tranca ao sair da pagina; esqueceu a senha = perdeu. Nivel Media: fica aberta 5 min depois de sair
// e a chave tambem vai para o servidor guardar (recupera confirmando a senha da conta).
// O titulo continua visivel (barra lateral, busca); a Sofia (IA), a busca de conteudo e o link publico nao leem o conteudo.
export const LOCK_TAG = 'sofia-lock-v1';
export type LockLevel = 'max' | 'medium';
/** Cabecalho guardado em data.lock_json de cada pagina trancada (a mesma chave para a pagina e as subpaginas). */
export type LockHeader = {v: 1; kid: string; level: LockLevel; salt: string; iter: number; wiv: string; wk: string; iv: string; ct: string};
type Open = {key: CryptoKey; raw: Uint8Array; level: LockLevel; leftAt: number | null};

export const MEDIUM_OPEN_MS = 5 * 60000;
const ITER = 310000;
const OPEN = new Map<string, Open>();
/** Texto aberto por pagina (so enquanto destrancada), para a tela mostrar sem esperar. */
const PLAIN = new Map<string, {kid: string; blocks: string; ct: string}>();
const HEADERS = new Map<string, Omit<LockHeader, 'iv' | 'ct'>>();
const listeners = new Set<() => void>();
export function onLockChange(fn: () => void) {listeners.add(fn); return () => {listeners.delete(fn);};}
const changed = () => listeners.forEach(fn => {try {fn();} catch {/* tela fechada */}});

const subtle = (): any => {const s = (globalThis as any).crypto?.subtle; if (!s) throw Error('Este navegador não consegue trancar páginas.'); return s;};
const rand = (n: number) => {const a = new Uint8Array(n); (globalThis as any).crypto.getRandomValues(a); return a;};
export const b64 = (u: Uint8Array | ArrayBuffer) => {const a = u instanceof Uint8Array ? u : new Uint8Array(u); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s);};
export const unb64 = (s: string) => {const t = atob(s), a = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i); return a;};
const enc = new TextEncoder(), dec = new TextDecoder();

export function isLocked(e: {tags?: string[] | null} | null | undefined) {return !!e && (e.tags || []).includes(LOCK_TAG);}
export function lockHeader(e: {data?: any} | null | undefined): LockHeader | null {
  try {const h = JSON.parse(String(e?.data?.lock_json || '')); return h && h.v === 1 && typeof h.kid === 'string' && typeof h.wk === 'string' && typeof h.ct === 'string' ? h : null;} catch {return null;}
}
/** Chave da pagina aberta agora? (Media: ate 5 min depois de sair; Maxima: so enquanto esta na pagina.) */
export function isOpen(kid: string, now = Date.now()) {
  const o = OPEN.get(kid); if (!o) return false;
  if (o.leftAt != null && (o.level === 'max' || now - o.leftAt > MEDIUM_OPEN_MS)) {forget(kid); return false;}
  return true;
}
export function forget(kid: string) {if (!OPEN.delete(kid)) return; for (const [id, p] of PLAIN) if (p.kid === kid) PLAIN.delete(id); changed();}
/** Entrou numa pagina desta chave: nao conta mais o tempo de saida. */
export function entered(kid: string) {const o = OPEN.get(kid); if (o) o.leftAt = null;}
/** Saiu da pagina: Maxima tranca na hora; Media comeca a contar 5 minutos. */
export function left(kid: string, now = Date.now()) {const o = OPEN.get(kid); if (!o) return; if (o.level === 'max') forget(kid); else {o.leftAt = now; const t: any = setTimeout(() => isOpen(kid), MEDIUM_OPEN_MS + 1000); t?.unref?.();}}
export function plainOf(id: string, h: {kid: string; ct: string}) {const p = PLAIN.get(id); return p && p.kid === h.kid && p.ct === h.ct && isOpen(h.kid) ? p.blocks : null;}
export function headerFor(kid: string) {return HEADERS.get(kid) || null;}

async function kek(password: string, salt: Uint8Array, iter: number) {
  const base = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter}, base, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}
const importKey = (raw: Uint8Array) => subtle().importKey('raw', raw, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
async function wrap(raw: Uint8Array, password: string) {
  const salt = rand(16), wiv = rand(12), k = await kek(password, salt, ITER);
  const wk = await subtle().encrypt({name: 'AES-GCM', iv: wiv}, k, raw);
  return {salt: b64(salt), iter: ITER, wiv: b64(wiv), wk: b64(wk)};
}
function remember(kid: string, raw: Uint8Array, key: CryptoKey, level: LockLevel) {OPEN.set(kid, {key, raw, level, leftAt: null}); changed();}

/** Cria a chave nova de uma pagina (ao trancar). A senha precisa ter 4+ caracteres. */
export async function createLock(password: string, level: LockLevel) {
  if (password.length < 4) throw Error('Use uma senha com pelo menos 4 caracteres.');
  const raw = rand(32), kid = b64(rand(18)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), key = await importKey(raw);
  const w = await wrap(raw, password), head = {v: 1 as const, kid, level, ...w};
  HEADERS.set(kid, head); remember(kid, raw, key, level);
  return {kid, head, raw};
}
/** Abre com a senha da pagina. Erro "Senha incorreta." quando nao confere. */
export async function unlock(h: LockHeader, password: string) {
  let raw: Uint8Array;
  try {raw = new Uint8Array(await subtle().decrypt({name: 'AES-GCM', iv: unb64(h.wiv)}, await kek(password, unb64(h.salt), h.iter), unb64(h.wk)));} catch {throw Error('Senha incorreta.');}
  HEADERS.set(h.kid, {v: 1, kid: h.kid, level: h.level, salt: h.salt, iter: h.iter, wiv: h.wiv, wk: h.wk});
  remember(h.kid, raw, await importKey(raw), h.level);
}
/** "Esqueci a senha" (Media): a chave devolvida pelo servidor e embrulhada pela senha nova. */
export async function recoverWith(h: LockHeader, rawB64: string, newPassword: string) {
  if (newPassword.length < 4) throw Error('Use uma senha com pelo menos 4 caracteres.');
  const raw = unb64(rawB64); if (raw.length !== 32) throw Error('Chave inválida.');
  const key = await importKey(raw);
  try {await subtle().decrypt({name: 'AES-GCM', iv: unb64(h.iv)}, key, unb64(h.ct));} catch {throw Error('A chave guardada não abre esta página.');}
  const head = {v: 1 as const, kid: h.kid, level: h.level, ...(await wrap(raw, newPassword))};
  HEADERS.set(h.kid, head); remember(h.kid, raw, key, h.level);
  return head;
}
/** Trocar senha (pagina aberta): novo embrulho da mesma chave. */
export async function rewrap(kid: string, newPassword: string) {
  const o = OPEN.get(kid), h = HEADERS.get(kid); if (!o || !h) throw Error('Abra a página antes de trocar a senha.');
  if (newPassword.length < 4) throw Error('Use uma senha com pelo menos 4 caracteres.');
  const head = {...h, ...(await wrap(o.raw, newPassword))}; HEADERS.set(kid, head); return head;
}
export function rawKey(kid: string) {const o = OPEN.get(kid); return o ? b64(o.raw) : null;}

/** Cifra os blocos (texto JSON) de uma pagina. */
export async function seal(id: string, kid: string, blocks: string): Promise<string> {
  const o = OPEN.get(kid), h = HEADERS.get(kid); if (!o || !h) throw Error('Página trancada: abra com a senha para salvar.');
  const iv = rand(12), ct = b64(await subtle().encrypt({name: 'AES-GCM', iv}, o.key, enc.encode(blocks)));
  PLAIN.set(id, {kid, blocks, ct});
  return JSON.stringify({...h, iv: b64(iv), ct});
}
/** Decifra os blocos de uma pagina (precisa da chave aberta). */
export async function openBlocks(id: string, h: LockHeader): Promise<string> {
  const o = OPEN.get(h.kid); if (!o) throw Error('Página trancada.');
  const blocks = dec.decode(await subtle().decrypt({name: 'AES-GCM', iv: unb64(h.iv)}, o.key, unb64(h.ct)));
  PLAIN.set(id, {kid: h.kid, blocks, ct: h.ct}); changed(); HEADERS.set(h.kid, HEADERS.get(h.kid) || {v: 1, kid: h.kid, level: h.level, salt: h.salt, iter: h.iter, wiv: h.wiv, wk: h.wk});
  return blocks;
}
/** Pagina como a tela deve ver: trancada e aberta -> com os blocos decifrados; senao igual. */
export function viewOf<T extends {id: string; tags?: string[]; data?: any}>(e: T): T {
  if (!isLocked(e)) return e; const h = lockHeader(e); if (!h) return e;
  const plain = plainOf(e.id, h); return plain == null ? e : {...e, data: {...e.data, blocks_json: plain}};
}
/** Pagina trancada com a chave aberta mas texto ainda nao decifrado (ou desatualizado): decifra em segundo plano. */
export function needsOpen(e: {id: string; tags?: string[]; data?: any}) {if (!isLocked(e)) return false; const h = lockHeader(e); return !!h && isOpen(h.kid) && plainOf(e.id, h) == null;}
/** So para os testes. */
export function _resetLocks() {OPEN.clear(); PLAIN.clear(); HEADERS.clear();}
