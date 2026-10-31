// 0.3.269 — Notas com etiqueta protegida por senha (pedido do Pedro). A criptografia acontece NO APARELHO:
// AES-256-GCM com chave derivada da senha por PBKDF2-SHA256 (150.000 rodadas, sal de 16 bytes por etiqueta).
// O servidor so recebe o texto cifrado (em hex). A senha nunca sai do aparelho e nao existe "esqueci a senha".
// No navegador usa a criptografia do proprio navegador; no celular, @noble (mesmo algoritmo, mesmas chaves).
import {gcm} from '@noble/ciphers/aes';
import {pbkdf2Async} from '@noble/hashes/pbkdf2';
import {sha256} from '@noble/hashes/sha256';
import {randomBytes} from '@noble/hashes/utils';

export const ROUNDS = 150000;
export type Sealed = {iv: string; ct: string};
export type LockInfo = {v: 1; salt: string; rounds: number; check: Sealed};
const te = new TextEncoder(), td = new TextDecoder();
export const toHex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
export const fromHex = (h: string) => { const s = String(h || ''); if (!/^([0-9a-f]{2})*$/.test(s)) throw new Error('Dado protegido inválido.'); const out = new Uint8Array(s.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16); return out; };
function rand(n: number): Uint8Array { const g: any = globalThis as any; if (g.crypto?.getRandomValues) return g.crypto.getRandomValues(new Uint8Array(n)); return randomBytes(n); }
export async function deriveKey(password: string, saltHex: string, rounds = ROUNDS): Promise<Uint8Array> {
  const salt = fromHex(saltHex), subtle = (globalThis as any).crypto?.subtle;
  if (subtle?.deriveBits) {
    try { const base = await subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']); return new Uint8Array(await subtle.deriveBits({name: 'PBKDF2', salt, iterations: rounds, hash: 'SHA-256'}, base, 256)); }
    catch { /* sem WebCrypto completo: usa a versao em JavaScript */ }
  }
  return pbkdf2Async(sha256, te.encode(password), salt, {c: rounds, dkLen: 32, asyncTick: 20});
}
export function seal(key: Uint8Array, value: unknown): Sealed { const iv = rand(12); return {iv: toHex(iv), ct: toHex(gcm(key, iv).encrypt(te.encode(JSON.stringify(value))))}; }
export function open<T = any>(key: Uint8Array, s: Sealed): T { return JSON.parse(td.decode(gcm(key, fromHex(s.iv)).decrypt(fromHex(s.ct)))); }
/** Cria a protecao de uma etiqueta: sal novo + um "teste" cifrado para conferir a senha depois. */
export async function newLock(password: string): Promise<{lock: LockInfo; key: Uint8Array}> {
  const salt = toHex(rand(16)), key = await deriveKey(password, salt);
  return {lock: {v: 1, salt, rounds: ROUNDS, check: seal(key, {ok: 1})}, key};
}
/** Senha certa devolve a chave; errada devolve null. */
export async function unlock(password: string, lock: LockInfo): Promise<Uint8Array | null> {
  const key = await deriveKey(password, lock.salt, lock.rounds || ROUNDS);
  try { return open<{ok: number}>(key, lock.check)?.ok === 1 ? key : null; } catch { return null; }
}
