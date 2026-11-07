// 07/11/2026 (Pedro: "integracao com as paginas: poder copiar e colar la qualquer tipo de item"): area de transferencia da
// Sofia entre o Drive e as Paginas. Fica na memoria desta aba e tambem vai como texto marcado para a area de transferencia
// do computador (assim colar em outra aba da Sofia funciona). Nada de arquivo passa pelo navegador: o servidor copia.
export type ClipDrive = {sofia: 'drive-items'; ids: string[]; names: string[]};
export type ClipPage = {sofia: 'page-files'; items: {attachment_id: string; name: string; mime: string}[]};
export type SofiaClip = ClipDrive | ClipPage;
const MARK = 'sofia-clip:';
let mem: {clip: SofiaClip; text: string} | null = null;

export function setSofiaClip(clip: SofiaClip) {
  const text = MARK + JSON.stringify(clip); mem = {clip, text};
  try { void (navigator as any).clipboard?.writeText?.(text)?.catch?.(() => {}); } catch {}
}
/** Le o texto colado (evento paste) e devolve o item da Sofia, se for um. Sem texto: o que foi copiado nesta aba. */
export function parseSofiaClip(text: string | null | undefined): SofiaClip | null {
  const t = String(text || '').trim();
  if (t.startsWith(MARK)) { try { const c = JSON.parse(t.slice(MARK.length)); if (c && (c.sofia === 'drive-items' && Array.isArray(c.ids) || c.sofia === 'page-files' && Array.isArray(c.items))) return c; } catch {} return null; }
  return null;
}
/** Colar: o texto do evento manda (o que o computador tem agora); se nao houver texto e nem arquivos, vale o desta aba. */
export function clipFromPaste(e: ClipboardEvent | {clipboardData?: DataTransfer | null}): SofiaClip | null {
  const dt = (e as any).clipboardData as DataTransfer | null | undefined; const text = dt?.getData?.('text/plain') || '';
  const c = parseSofiaClip(text); if (c) return c;
  if (!text && !(dt?.files && dt.files.length) && mem) return mem.clip;
  return null;
}
export function peekSofiaClip() { return mem?.clip || null; }
