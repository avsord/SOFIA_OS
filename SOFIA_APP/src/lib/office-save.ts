// 07/11/2026: arquivo do Office editado na Sofia (Excel/PowerPoint) -> anexo novo da pagina (o anterior fica guardado).
import type {SofiaApi} from './api';
export async function uploadOfficeBytes(api: SofiaApi, pageId: string, bytes: Uint8Array, name: string, mime: string) {
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const a: any = await api.uploadAttachment(pageId, {name, mime, base64: btoa(bin)});
  return {id: String(a.id), name: String(a.name || name), mime: String(a.mime || mime), bytes: Number(a.bytes || bytes.length)};
}
// 07/11/2026 (Pedro: "posso alterar os itens dentro do drive tambem"): onde o editor salva. Pagina: anexo novo (o anterior
// fica em Versoes). Drive: o PROPRIO arquivo do Drive (nova revisao; o Google guarda as anteriores). `base` e a data de
// modificacao de quando abriu: se outra pessoa salvou no meio, o servidor recusa em vez de apagar a alteracao dela.
export type SaveTarget = {kind: 'page'; pageId: string} | {kind: 'drive'; fileId: string; base?: string};
export type OfficeSaved = {id: string; name: string; mime: string; bytes: number};
export async function saveOfficeTo(api: SofiaApi, t: SaveTarget, bytes: Uint8Array, name: string, mime: string): Promise<OfficeSaved> {
  if (t.kind === 'page') return uploadOfficeBytes(api, t.pageId, bytes, name, mime);
  const r = await api.sdWriteBytes(t.fileId, bytes, mime, t.base || ''); t.base = r.item.modified || t.base;
  return {id: r.item.id, name: r.item.name, mime: r.item.mime || mime, bytes: Number(r.item.size || bytes.length)};
}
