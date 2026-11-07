// 07/11/2026 (Pedro: "ele ta alterando a fonte"): o documento pede uma fonte que o computador nao tem (ex.: "Montserrat
// ExtraBold") e o navegador caia em letra serifada. Agora: (1) sem a fonte, cai numa sem serifa parecida (Calibri/Arial);
// (2) se for fonte aberta do Google Fonts, a Sofia busca pelo proprio site e mostra a fonte certa.
import {SITE} from './api';
const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit|initial|calibri|carlito|arial|helvetica|times new roman|segoe ui|-apple-system)$/i;
const asked = new WeakMap<Document, Set<string>>();
const FALLBACK = ', Calibri, Carlito, Arial, sans-serif';
/** Acrescenta a reserva sem serifa nas regras e estilos que so tem o nome da fonte do documento. */
export function addSansFallback(...roots: (Element | null | undefined)[]) {
  for (const root of roots) {if (!root) continue;
    for (const st of Array.from(root.querySelectorAll('style'))) st.textContent = (st.textContent || '').replace(/font-family:\s*([^;}]+)/g, (m, v) => /sans-serif|serif|monospace/i.test(v) ? m : 'font-family: ' + v.trim() + FALLBACK);
    for (const el of [root, ...Array.from(root.querySelectorAll('[style*="font-family"]'))] as HTMLElement[]) {const f = el.style?.fontFamily; if (f && !/sans-serif|serif|monospace/i.test(f)) el.style.fontFamily = f + FALLBACK;}
  }
}
function installed(doc: Document, name: string) {
  try {const c = doc.createElement('canvas').getContext('2d'); if (!c) return true; const probe = 'mmmmmmmmmmlliWWQ@#';
    const w = (f: string) => {c.font = '72px ' + f; return c.measureText(probe).width;};
    return w('"' + name + '", monospace') !== w('monospace') || w('"' + name + '", serif') !== w('serif');} catch {return true;}
}
/** Fontes usadas no trecho que nao estao no computador: pede ao site (Google Fonts). Nao trava a tela. */
export function ensureDocFonts(root: Element | null | undefined, extra: string[] = []) {
  if (!root) return; const doc = root.ownerDocument, win = doc.defaultView; if (!win) return;
  const names = new Set(extra.filter(Boolean));
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))].slice(0, 6000)) {const f = win.getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim(); if (f) names.add(f);}
  let done = asked.get(doc); if (!done) {done = new Set(); asked.set(doc, done);}
  for (const n of names) {if (GENERIC.test(n) || done.has(n) || n.startsWith('+') || installed(doc, n)) continue; done.add(n);
    const link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = SITE + '/api/mobile/fonts.css?f=' + encodeURIComponent(n); doc.head.appendChild(link);}
}
