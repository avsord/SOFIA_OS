// 08/11/2026: editor de PowerPoint so no site; no app nao leva o JSZip no pacote (abertura mais lenta).
export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export async function blankPptx(): Promise<Uint8Array> { throw new Error('Apresentação nova só no site.'); }
export function SlideEditor(_: any) { return null; }
