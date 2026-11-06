// 06/11/2026 (Pedro: imagem colada na Conversa dava "Failed to fetch"): a regra de seguranca do site (connect-src 'self')
// proibe ler um endereco blob: com fetch, entao o anexo nunca saia do computador. Aqui, todo endereco blob: criado no site
// guarda o proprio arquivo; quem precisa dos bytes le daqui (sem fetch). No celular nao faz nada.
const files = new Map<string, Blob>();
let installed = false;
export function installBlobRegistry() {
  const U: any = (globalThis as any).URL;
  if (installed || !U || typeof U.createObjectURL !== 'function') return;
  installed = true;
  const create = U.createObjectURL.bind(U), revoke = typeof U.revokeObjectURL === 'function' ? U.revokeObjectURL.bind(U) : null;
  U.createObjectURL = (obj: any) => {const url = create(obj); try {if (obj && typeof obj.size === 'number' && typeof obj.slice === 'function') files.set(url, obj);} catch {/* nada */} return url;};
  if (revoke) U.revokeObjectURL = (url: string) => {files.delete(url); return revoke(url);};
}
installBlobRegistry();
/** Arquivo de um endereco blob: criado neste site (ou null). */
export function blobFromUrl(url: string): Blob | null {return files.get(url) || null;}
/** Bytes de um endereco local: primeiro o arquivo guardado; so tenta fetch se nao houver (data: e endereco do proprio site). */
export async function readLocalBlob(url: string): Promise<Blob> {
  const b = blobFromUrl(url); if (b) return b;
  const r = await fetch(url); if (!r.ok) throw Error('O arquivo não está mais disponível. Selecione-o novamente.'); return await r.blob();
}
