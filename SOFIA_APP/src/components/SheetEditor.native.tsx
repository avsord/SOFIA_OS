// 08/11/2026: editor de Excel so no site; no app nao leva o ExcelJS no pacote (abertura mais lenta).
export type OfficeSaved = {id: string; name: string; mime: string; bytes: number};
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export async function blankXlsx(): Promise<Uint8Array> { throw new Error('Planilha nova só no site.'); }
export const colName = (n: number) => {let s = ''; while (n > 0) {const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26);} return s;};
export function SheetEditor(_: any) { return null; }
