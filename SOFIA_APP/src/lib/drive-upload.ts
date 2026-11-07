// 07/11/2026 (Pedro: "drive 100%"): envio como o do Google Drive. Arquivos de qualquer tamanho (em partes de 8 MB, com
// porcentagem e cancelar), varios ao mesmo tempo, e PASTAS inteiras arrastadas do computador (a estrutura e recriada).
import {Platform} from 'react-native';
import {File} from 'expo-file-system';

export type UploadSource = {name: string; mime: string; size: number; dirs: string[]; read: (start: number, end: number) => Promise<Blob | Uint8Array>};

/** Arquivo do navegador. */
export function fromBrowserFile(f: globalThis.File, dirs: string[] = []): UploadSource {
  return {name: f.name, mime: f.type || 'application/octet-stream', size: f.size, dirs, read: async (s, e) => f.slice(s, e)};
}
/** Arquivo do celular (DocumentPicker): le so o pedaco pedido, sem carregar o arquivo inteiro na memoria. */
export function fromNativeAsset(a: {uri: string; name: string; mimeType?: string | null; size?: number | null}): UploadSource {
  const file = new File(a.uri); let size = Number(a.size ?? 0); try { if (!size) size = Number(file.size || 0); } catch { /* sem tamanho */ }
  return {name: a.name, mime: a.mimeType || 'application/octet-stream', size, dirs: [], read: async (s, e) => {
    const h = file.open(); try { h.offset = s; return h.readBytes(e - s); } finally { h.close(); } }};
}
/** O que foi solto na tela (site): arquivos e pastas, com o caminho de cada arquivo dentro das pastas soltas. */
export async function droppedSources(dt: DataTransfer): Promise<UploadSource[]> {
  if (Platform.OS !== 'web') return [];
  const items = Array.from(dt.items || []).filter(i => i.kind === 'file');
  const entries = items.map(i => (i as any).webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return Array.from(dt.files || []).map(f => fromBrowserFile(f));
  const out: UploadSource[] = [];
  const walk = async (entry: any, dirs: string[]): Promise<void> => {
    if (entry.isFile) { const f: globalThis.File = await new Promise((ok, bad) => entry.file(ok, bad)); out.push(fromBrowserFile(f, dirs)); return; }
    if (entry.isDirectory) { const reader = entry.createReader(); const all: any[] = [];
      for (;;) { const batch: any[] = await new Promise((ok, bad) => reader.readEntries(ok, bad)); if (!batch.length) break; all.push(...batch); }
      if (!all.length) out.push({name: '', mime: '', size: 0, dirs: [...dirs, entry.name], read: async () => new Blob([])}); // pasta vazia: so cria a pasta
      for (const e of all) await walk(e, [...dirs, entry.name]); }
  };
  for (const e of entries) await walk(e, []);
  return out;
}
export const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');
