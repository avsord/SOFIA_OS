// 07/11/2026: arquivo do Office editado na Sofia (Excel/PowerPoint) -> anexo novo da pagina (o anterior fica guardado).
import type {SofiaApi} from './api';
export async function uploadOfficeBytes(api: SofiaApi, pageId: string, bytes: Uint8Array, name: string, mime: string) {
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const a: any = await api.uploadAttachment(pageId, {name, mime, base64: btoa(bin)});
  return {id: String(a.id), name: String(a.name || name), mime: String(a.mime || mime), bytes: Number(a.bytes || bytes.length)};
}
