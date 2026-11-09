import type {SnapshotStorage} from './startup-snapshot';
/** 04/11/2026 (Pedro: "os blocos ja tem que aparecer logo de primeira"): no site, o mesmo armazenamento criptografado do
 * Android (que guarda a copia do Inicio para abrir na hora e atualizar por tras). AES-GCM do proprio navegador com chave
 * NAO exportavel guardada no IndexedDB deste site: o conteudo em disco e sempre cifrado e a chave nao sai do navegador.
 * Sem IndexedDB/WebCrypto (modo privado restrito, navegador antigo), le null e nao grava: o site so busca da rede. */
const DB = 'sofia-secure', STORE = 'kv', KEY_ID = '__key__';
let dbp: Promise<IDBDatabase | null> | null = null, keyp: Promise<CryptoKey | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (!dbp) dbp = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle) {resolve(null); return;}
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {req.result.createObjectStore(STORE);};
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {resolve(null);}
  });
  return dbp;
}
function op<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return db().then(d => d ? new Promise<T | null>(resolve => {
    try {const r = run(d.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => resolve((r.result as T) ?? null); r.onerror = () => resolve(null);}
    catch {resolve(null);}
  }) : null);
}
function key(): Promise<CryptoKey | null> {
  if (!keyp) keyp = (async () => {
    const saved = await op<CryptoKey>('readonly', s => s.get(KEY_ID));
    if (saved) return saved;
    try {
      const k = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
      await op('readwrite', s => s.put(k, KEY_ID));
      return (await op<CryptoKey>('readonly', s => s.get(KEY_ID))) || k;
    } catch {return null;}
  })();
  return keyp;
}
export const encryptedStorage: SnapshotStorage = {
  read: async scope => {
    const [k, rec] = await Promise.all([key(), op<{iv: Uint8Array; data: ArrayBuffer}>('readonly', s => s.get('v1|' + scope))]);
    if (!k || !rec?.iv || !rec.data) return null;
    try {return new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: rec.iv as BufferSource}, k, rec.data));}
    catch {return null;}
  },
  write: async (scope, value) => {
    const k = await key(); if (!k) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, k, new TextEncoder().encode(value));
    await op('readwrite', s => s.put({iv, data}, 'v1|' + scope));
  },
  remove: async scope => {await op('readwrite', s => s.delete('v1|' + scope));},
};
/** 06/11/2026 (Pedro: capa piscando na primeira carga): imagens das capas guardadas cifradas no mesmo banco (somem ao sair da conta). */
export async function readSecureBytes(scope: string): Promise<ArrayBuffer | null> {
  const [k, rec] = await Promise.all([key(), op<{iv: Uint8Array; data: ArrayBuffer}>('readonly', s => s.get('b1|' + scope))]);
  if (!k || !rec?.iv || !rec.data) return null;
  try {return await crypto.subtle.decrypt({name: 'AES-GCM', iv: rec.iv as BufferSource}, k, rec.data);} catch {return null;}
}
export async function writeSecureBytes(scope: string, bytes: ArrayBuffer) {
  const k = await key(); if (!k) return;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, k, bytes);
  await op('readwrite', s => s.put({iv, data}, 'b1|' + scope));
}
/** Ao sair da conta no site: apaga tudo que este site guardou cifrado neste navegador, inclusive a chave. */
export async function wipeEncryptedStorage() {
  try {const d = await db(); d?.close();} catch { /* ignore */ }
  dbp = null; keyp = null;
  await new Promise<void>(resolve => {try {const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => resolve();} catch {resolve();}});
  // 09/11/2026: a lista de ENDERECOS do Inicio (sem nenhum dado) fica: e ela que faz o 1o Inicio depois do login entrar de uma vez
}
