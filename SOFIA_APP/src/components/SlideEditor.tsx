// 07/11/2026 (Pedro: "quero que faca o mesmo para PowerPoint e Excel"): editor de PowerPoint da Sofia.
// Edita o PROPRIO .pptx (o XML de dentro do arquivo): o que nao foi mexido fica exatamente como estava (temas, imagens,
// animacoes, anotacoes). Mostra os slides com as caixas no lugar; texto editavel direto no slide; negrito, italico,
// sublinhado, tachado, tamanho, cor, marca-texto e alinhamento; caixa de texto nova (move e muda de tamanho); slide novo,
// duplicar e excluir. Salva sozinho 2 s depois de parar (e no botao Salvar) como anexo novo da pagina.
import React, {useEffect, useRef, useState} from 'react';
import type {SofiaApi} from '../lib/api';
import type {OfficeSaved} from './SheetEditor';
import {useEditorColors, ThemeToggle, useEditorZoom, useWheelZoom, ZoomControl} from './EditorChrome';
import {saveOfficeTo, type SaveTarget} from '../lib/office-save';
import {errorText} from '../lib/chat-model';
import {ensureDocFonts} from '../lib/doc-fonts';

const h = React.createElement as any;
export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main', p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
};
const SLIDE_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const SLIDE_CT = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';
const HIGHLIGHTS: [string, string][] = [['Amarelo', '#ffff00'], ['Verde', '#00ff00'], ['Azul', '#00ffff'], ['Rosa', '#ff00ff'], ['Laranja', '#ffa500']];
const COLORS: [string, string][] = [['Preto', '#000000'], ['Branco', '#ffffff'], ['Vermelho', '#d32f2f'], ['Azul', '#1565c0'], ['Verde', '#2e7d32'], ['Roxo', '#6a1b9a']];
const BASE = 960;
const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 54, 60, 72];
const RPR_ORDER = ['ln', 'noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill', 'effectLst', 'effectDag', 'highlight', 'uLnTx', 'uLn', 'uFillTx', 'uFill', 'latin', 'ea', 'cs', 'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst'];

/** Apresentacao nova: um slide de titulo 16:9. */
export async function blankPptx(): Promise<Uint8Array> {
  const mod: any = await import('pptxgenjs'); const P = mod.default || mod; const pres = new P(); pres.layout = 'LAYOUT_16x9';
  const s = pres.addSlide(); s.addText('Título da apresentação', {x: 0.6, y: 1.9, w: 8.8, h: 1.1, fontSize: 40, bold: true, align: 'center', color: '1F1F24'});
  s.addText('Subtítulo', {x: 0.6, y: 3.0, w: 8.8, h: 0.7, fontSize: 20, align: 'center', color: '5F5F6B'});
  const out = await pres.write({outputType: 'uint8array'}); return out instanceof Uint8Array ? out : new Uint8Array(out);
}

type Box = {kind: 'text' | 'pic' | 'other'; el: Element; x: number; y: number; w: number; hgt: number; fill: string; html: string; src?: string; title: boolean; key: string};
type Slide = {path: string; relsPath: string; doc: Document; rels: Document | null; bg: string; boxes: Box[]};
const kids = (el: Element | null | undefined, ns: string, name: string) => el ? Array.from(el.childNodes).filter(n => n.nodeType === 1 && (n as Element).localName === name && (n as Element).namespaceURI === ns) as Element[] : [];
const kid = (el: Element | null | undefined, ns: string, name: string) => kids(el, ns, name)[0] || null;
const deep = (el: Element | Document | null | undefined, ns: string, name: string) => el ? Array.from(el.getElementsByTagNameNS(ns, name)) : [];
const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);
const relsOf = (path: string) => dirOf(path) + '_rels/' + path.slice(path.lastIndexOf('/') + 1) + '.rels';
function resolve(base: string, target: string) {if (target.startsWith('/')) return target.slice(1); const parts = (dirOf(base) + target).split('/'), out: string[] = []; for (const p of parts) {if (p === '..') out.pop(); else if (p !== '.') out.push(p);} return out.join('/');}
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]!));
function srgb(el: Element | null): string {const s = el && kid(el, NS.a, 'srgbClr'); if (s) return '#' + (s.getAttribute('val') || '000000'); const sc = el && kid(el, NS.a, 'schemeClr'); if (sc) {const v = sc.getAttribute('val'); return v === 'bg1' || v === 'lt1' ? '#ffffff' : v === 'tx1' || v === 'dk1' ? '#000000' : '';} return '';}
function xfrmOf(sp: Element) {const pr = kid(sp, NS.p, 'spPr') || kid(sp, NS.p, 'grpSpPr'); const x = pr && kid(pr, NS.a, 'xfrm'); const off = x && kid(x, NS.a, 'off'), ext = x && kid(x, NS.a, 'ext');
  return off && ext ? {x: Number(off.getAttribute('x')), y: Number(off.getAttribute('y')), w: Number(ext.getAttribute('cx')), hgt: Number(ext.getAttribute('cy'))} : null;}
function phOf(sp: Element) {const nv = kid(sp, NS.p, 'nvSpPr') || kid(sp, NS.p, 'nvPicPr'); const pr = nv && kid(nv, NS.p, 'nvPr'); const ph = pr && kid(pr, NS.p, 'ph'); return ph ? {type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') || ''} : null;}

/** Paragrafos do XML -> HTML editavel; cada pedaco guarda o formato original (para so mudar o que a pessoa mexeu). */
function bodyHtml(sp: Element, title: boolean, scale: number) {
  const tx = kid(sp, NS.p, 'txBody'); if (!tx) return '';
  return kids(tx, NS.a, 'p').map((p, pi) => {
    const pPr = kid(p, NS.a, 'pPr'), algn = pPr?.getAttribute('algn'); const ta = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' ? 'justify' : 'left';
    let inner = ''; let ri = 0;
    for (const n of Array.from(p.childNodes)) {const e = n as Element; if (n.nodeType !== 1) continue;
      if (e.localName === 'br') {inner += '<br>'; continue;}
      if (e.localName !== 'r' && e.localName !== 'fld') continue;
      const rPr = kid(e, NS.a, 'rPr'), t = kid(e, NS.a, 't')?.textContent || '';
      const sz = Number(rPr?.getAttribute('sz') || 0) / 100 || (title ? 40 : 18), b = rPr?.getAttribute('b') === '1', i = rPr?.getAttribute('i') === '1', u = !!rPr?.getAttribute('u') && rPr?.getAttribute('u') !== 'none', st = !!rPr?.getAttribute('strike') && rPr?.getAttribute('strike') !== 'noStrike';
      const col = srgb(rPr && kid(rPr, NS.a, 'solidFill')), hl = srgb(rPr && kid(rPr, NS.a, 'highlight')), face = (rPr && kid(rPr, NS.a, 'latin')?.getAttribute('typeface')) || '';
      const css = 'font-size:' + (sz * 12700 * scale).toFixed(2) + 'px;' + (b ? 'font-weight:700;' : '') + (i ? 'font-style:italic;' : '') + (u || st ? 'text-decoration:' + [u ? 'underline' : '', st ? 'line-through' : ''].join(' ') + ';' : '') + (col ? 'color:' + col + ';' : '') + (hl ? 'background-color:' + hl + ';' : '') + (face && !face.startsWith('+') ? 'font-family:\'' + face.replace(/'/g, '') + '\', Calibri, Arial, sans-serif;' : '');
      inner += '<span data-r="' + pi + ':' + ri + '" data-sz="' + sz + '" data-b="' + (b ? 1 : 0) + '" data-i="' + (i ? 1 : 0) + '" data-u="' + (u ? 1 : 0) + '" data-s="' + (st ? 1 : 0) + '" data-c="' + col + '" data-h="' + hl + '" style="' + css + '">' + esc(t) + '</span>';
      ri++;}
    if (!inner) {const end = kid(p, NS.a, 'endParaRPr'); const sz = Number(end?.getAttribute('sz') || 0) / 100 || (title ? 40 : 18); inner = '<span style="font-size:' + (sz * 12700 * scale).toFixed(2) + 'px"><br></span>';}
    return '<div data-p="' + pi + '" style="text-align:' + ta + '">' + inner + '</div>';
  }).join('');
}

export function SlideEditor({api, name, url, pageId, onSaved, target}: {api: SofiaApi; id: string; name: string; url: string; pageId: string; onSaved: (a: OfficeSaved) => void; target?: SaveTarget}) {
  const [c, toggleTheme] = useEditorColors(), [userZoom, setUserZoom] = useEditorZoom('pptx');
  const zip = useRef<any>(null), pres = useRef<{doc: Document; rels: Document; ct: Document; cx: number; cy: number} | null>(null), slides = useRef<Slide[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading'), [err, setErr] = useState(''), [cur, setCur] = useState(0), [ver, setVer] = useState(0), [status, setStatus] = useState(''), [selBox, setSelBox] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement | null>(null), [stageW, setStageW] = useState(900), stageWRef = useRef(900), flushTextRef = useRef<() => void>(() => {}), dirty = useRef(false), timer = useRef<any>(null), saving = useRef(false), boxDirty = useRef(new Set<string>()), sel = useRef<Range | null>(null);
  const onSavedRef = useRef(onSaved); onSavedRef.current = onSaved; stageWRef.current = stageW;
  const docOf = () => (stage.current?.ownerDocument || document) as Document, winOf = () => (docOf().defaultView || window) as Window;
  const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
  const ser = (d: Document) => new XMLSerializer().serializeToString(d);

  async function loadSlide(path: string): Promise<Slide> {
    const z = zip.current, doc = parse(await z.file(path).async('string')), relsPath = relsOf(path), relsTxt = z.file(relsPath) ? await z.file(relsPath).async('string') : '';
    const rels = relsTxt ? parse(relsTxt) : null, relMap = new Map<string, string>(); for (const r of deep(rels, NS.rel, 'Relationship')) relMap.set(r.getAttribute('Id') || '', r.getAttribute('Target') || '');
    // posicoes herdadas do layout e do mestre (titulo e corpo costumam nao ter posicao no proprio slide)
    const inherit: {type: string; idx: string; x: number; y: number; w: number; hgt: number}[] = []; let bg = '';
    const layoutRel = deep(rels, NS.rel, 'Relationship').find(r => /slideLayout$/.test(r.getAttribute('Type') || ''));
    const collect = async (p: string) => {if (!z.file(p)) return null; const d = parse(await z.file(p).async('string'));
      for (const sp of deep(d, NS.p, 'sp')) {const ph = phOf(sp), xf = xfrmOf(sp); if (ph && xf) inherit.push({...ph, ...xf});}
      if (!bg) bg = srgb(deep(d, NS.p, 'bgPr')[0] ? kid(deep(d, NS.p, 'bgPr')[0], NS.a, 'solidFill') : null); return d;};
    if (layoutRel) {const lp = resolve(path, layoutRel.getAttribute('Target') || ''); await collect(lp);
      const lr = z.file(relsOf(lp)) ? parse(await z.file(relsOf(lp)).async('string')) : null; const mr = deep(lr, NS.rel, 'Relationship').find(r => /slideMaster$/.test(r.getAttribute('Type') || ''));
      if (mr) await collect(resolve(lp, mr.getAttribute('Target') || ''));}
    const own = srgb(deep(doc, NS.p, 'bgPr')[0] ? kid(deep(doc, NS.p, 'bgPr')[0], NS.a, 'solidFill') : null); if (own) bg = own;
    const boxes: Box[] = []; const tree = deep(doc, NS.p, 'spTree')[0];
    const walk = async (parent: Element | null, ox = 0, oy = 0, sx = 1, sy = 1) => {
      for (const el of Array.from(parent?.childNodes || []) as Element[]) {if (el.nodeType !== 1) continue; const ln = el.localName;
        if (ln === 'grpSp') {const pr = kid(el, NS.p, 'grpSpPr'), x = pr && kid(pr, NS.a, 'xfrm'); const off = x && kid(x, NS.a, 'off'), ext = x && kid(x, NS.a, 'ext'), co = x && kid(x, NS.a, 'chOff'), ce = x && kid(x, NS.a, 'chExt');
          if (off && ext && co && ce) {const nsx = Number(ext.getAttribute('cx')) / Math.max(1, Number(ce.getAttribute('cx'))), nsy = Number(ext.getAttribute('cy')) / Math.max(1, Number(ce.getAttribute('cy')));
            await walk(el, ox + sx * (Number(off.getAttribute('x')) - Number(co.getAttribute('x')) * nsx), oy + sy * (Number(off.getAttribute('y')) - Number(co.getAttribute('y')) * nsy), sx * nsx, sy * nsy);} else await walk(el, ox, oy, sx, sy);
          continue;}
        if (ln !== 'sp' && ln !== 'pic' && ln !== 'graphicFrame' && ln !== 'cxnSp') continue;
        let xf = xfrmOf(el); if (!xf && ln === 'graphicFrame') {const x = kid(el, NS.p, 'xfrm'); const off = x && kid(x, NS.a, 'off'), ext = x && kid(x, NS.a, 'ext'); if (off && ext) xf = {x: Number(off.getAttribute('x')), y: Number(off.getAttribute('y')), w: Number(ext.getAttribute('cx')), hgt: Number(ext.getAttribute('cy'))};}
        const ph = phOf(el); if (!xf && ph) {const m = inherit.find(q => q.idx && q.idx === ph.idx) || inherit.find(q => q.type === ph.type || (ph.type === 'ctrTitle' && q.type === 'title') || (ph.type === 'subTitle' && q.type === 'body')); if (m) xf = {x: m.x, y: m.y, w: m.w, hgt: m.hgt};}
        if (!xf) continue; const box = {x: ox + xf.x * sx, y: oy + xf.y * sy, w: xf.w * sx, hgt: xf.hgt * sy};
        const title = !!ph && /title/i.test(ph.type), key = path + '#' + boxes.length;
        if (ln === 'pic') {const blip = deep(el, NS.a, 'blip')[0], rid = blip?.getAttributeNS(NS.r, 'embed') || ''; const tgt = relMap.get(rid); let src = '';
          if (tgt) {const mp = resolve(path, tgt), f = z.file(mp); if (f) {const ext = (mp.split('.').pop() || 'png').toLowerCase(); src = 'data:image/' + (ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext) + ';base64,' + await f.async('base64');}}
          boxes.push({kind: 'pic', el, ...box, fill: '', html: '', src, title: false, key}); continue;}
        const fill = srgb(kid(kid(el, NS.p, 'spPr'), NS.a, 'solidFill'));
        boxes.push({kind: kid(el, NS.p, 'txBody') ? 'text' : 'other', el, ...box, fill, html: '', title, key});}
    };
    await walk(tree);
    return {path, relsPath, doc, rels, bg: bg || '#ffffff', boxes};
  }

  useEffect(() => {let live = true; setState('loading');
    (async () => {
      const bytes = await fetch(url).then(r => {if (!r.ok) throw new Error('Não consegui abrir a apresentação (' + r.status + ').'); return r.arrayBuffer();});
      const JSZip: any = (await import('jszip')).default; const z = await JSZip.loadAsync(bytes); zip.current = z;
      const pdoc = parse(await z.file('ppt/presentation.xml').async('string')), prels = parse(await z.file('ppt/_rels/presentation.xml.rels').async('string')), ct = parse(await z.file('[Content_Types].xml').async('string'));
      const sz = deep(pdoc, NS.p, 'sldSz')[0]; pres.current = {doc: pdoc, rels: prels, ct, cx: Number(sz?.getAttribute('cx') || 12192000), cy: Number(sz?.getAttribute('cy') || 6858000)};
      const relMap = new Map(deep(prels, NS.rel, 'Relationship').map(r => [r.getAttribute('Id') || '', r.getAttribute('Target') || '']));
      const list: Slide[] = []; for (const sid of deep(pdoc, NS.p, 'sldId')) {const t = relMap.get(sid.getAttributeNS(NS.r, 'id') || ''); if (t) list.push(await loadSlide(resolve('ppt/presentation.xml', t)));}
      if (!live) return; slides.current = list; setCur(0); setVer(v => v + 1); setState('ready'); setTimeout(() => ensureDocFonts(stage.current), 300);
    })().catch(e => {if (live) {setErr(errorText(e)); setState('error');}});
    return () => {live = false;};
  }, [url]);
  useEffect(() => {const el = stage.current; if (!el) return; const ro = new ResizeObserver(() => {const w = Math.max(320, el.clientWidth - 48); if (Math.abs(w - stageWRef.current) < 2) return; setStageW(w);}); /* so muda o zoom (transform): o texto nao e redesenhado */ ro.observe(el); return () => ro.disconnect();}, [state]);

  // ---------- salvar: o texto das caixas mexidas volta para o XML ----------
  function writeBox(b: Box, node: HTMLElement) {
    const d = b.el.ownerDocument!, tx = kid(b.el, NS.p, 'txBody'); if (!tx) return; const oldPs = kids(tx, NS.a, 'p'), cs = (e: Element) => (winOf().getComputedStyle(e));
    for (const p of oldPs) tx.removeChild(p);
    const paraNodes = Array.from(node.childNodes).filter(n => n.nodeType === 1 && /^(DIV|P)$/.test((n as Element).tagName)) as HTMLElement[];
    const groups: HTMLElement[] = paraNodes.length ? paraNodes : [node];
    groups.forEach((pn, k) => {
      const src = oldPs[Number(pn.getAttribute('data-p') ?? k)] || oldPs[oldPs.length - 1], p = d.createElementNS(NS.a, 'a:p');
      const pPr0 = src && kid(src, NS.a, 'pPr'), pPr = pPr0 ? pPr0.cloneNode(true) as Element : d.createElementNS(NS.a, 'a:pPr');
      const ta = cs(pn).textAlign; pPr.setAttribute('algn', ta === 'center' ? 'ctr' : ta === 'right' || ta === 'end' ? 'r' : ta === 'justify' ? 'just' : 'l'); p.appendChild(pPr);
      const srcRuns = src ? kids(src, NS.a, 'r') : [], fallback = srcRuns[0] ? kid(srcRuns[0], NS.a, 'rPr') : null;
      let last: {k: string; t: Element} | null = null;
      const walkText = (n: Node) => {
        if (n.nodeType === 3) {const text = n.textContent || ''; if (!text) return; const parent = n.parentElement!, span = parent.closest('[data-r]') as HTMLElement | null, c2 = cs(parent);
          const [pi, ri] = (span?.getAttribute('data-r') || '').split(':').map(Number); const base = span && oldPs[pi] ? kid(kids(oldPs[pi], NS.a, 'r')[ri] || null, NS.a, 'rPr') : fallback;
          const rPr = base ? base.cloneNode(true) as Element : d.createElementNS(NS.a, 'a:rPr'); if (!rPr.getAttribute('lang')) rPr.setAttribute('lang', 'pt-BR');
          const o = {sz: Number(span?.getAttribute('data-sz') || 0), b: span?.getAttribute('data-b') === '1', i: span?.getAttribute('data-i') === '1', u: span?.getAttribute('data-u') === '1', s: span?.getAttribute('data-s') === '1', c: span?.getAttribute('data-c') || '', h: span?.getAttribute('data-h') || ''};
          const nowSz = Math.round(parseFloat(c2.fontSize) / (12700 * scaleNow()) * 2) / 2, nb = Number(c2.fontWeight) >= 600, ni = c2.fontStyle === 'italic', deco = c2.textDecorationLine || '', nu = /underline/.test(deco), ns = /line-through/.test(deco);
          const nc = hex(c2.color), nh = bgOf(parent, node);
          if (!span || Math.abs(nowSz - o.sz) >= 0.5) rPr.setAttribute('sz', String(Math.round(nowSz * 100)));
          if (!span || nb !== o.b) rPr.setAttribute('b', nb ? '1' : '0'); if (!span || ni !== o.i) rPr.setAttribute('i', ni ? '1' : '0');
          if (!span || nu !== o.u) rPr.setAttribute('u', nu ? 'sng' : 'none'); if (!span || ns !== o.s) rPr.setAttribute('strike', ns ? 'sngStrike' : 'noStrike');
          if (span ? nc !== (o.c || nc0(span)) : nc && nc !== '#000000') setChild(rPr, 'solidFill', nc);
          if (nh !== o.h) setChild(rPr, 'highlight', nh);
          const k = new XMLSerializer().serializeToString(rPr);
          if (last && last.k === k) {last.t.textContent += text; return;}
          const r = d.createElementNS(NS.a, 'a:r'), t = d.createElementNS(NS.a, 'a:t'); t.textContent = text; r.appendChild(rPr); r.appendChild(t); p.appendChild(r); last = {k, t}; return;}
        if (n.nodeType === 1 && (n as Element).tagName === 'BR') {if (n.nextSibling || (n.parentElement && n.parentElement !== pn && n.parentElement.nextSibling)) {p.appendChild(d.createElementNS(NS.a, 'a:br')); last = null;} return;}
        n.childNodes.forEach(walkText);
      };
      pn.childNodes.forEach(walkText);
      const end0 = src && kid(src, NS.a, 'endParaRPr'); if (end0) p.appendChild(end0.cloneNode(true));
      tx.appendChild(p);
    });
  }
  function setChild(rPr: Element, local: string, color: string) {
    const old = kid(rPr, NS.a, local); if (old) rPr.removeChild(old); if (!color) return;
    const d = rPr.ownerDocument!, el = d.createElementNS(NS.a, 'a:' + local), clr = d.createElementNS(NS.a, 'a:srgbClr'); clr.setAttribute('val', color.replace('#', '').toUpperCase()); el.appendChild(clr);
    const at = RPR_ORDER.indexOf(local); const next = Array.from(rPr.childNodes).find(n => n.nodeType === 1 && RPR_ORDER.indexOf((n as Element).localName) > at); rPr.insertBefore(el, next || null);
  }
  const hex = (rgb: string) => {const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(rgb); if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return ''; return '#' + [m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('');};
  const bgOf = (el: HTMLElement, stop: HTMLElement) => {let e: HTMLElement | null = el; while (e && e !== stop) {const v = hex(winOf().getComputedStyle(e).backgroundColor); if (v) return v; e = e.parentElement;} return '';};
  const nc0 = (span: HTMLElement) => hex(winOf().getComputedStyle(span).color);
  // o slide e desenhado sempre em BASE px de largura e so ampliado/reduzido na tela: digitar nunca e apagado por redesenho
  const scaleNow = () => BASE / (pres.current?.cx || 12192000);

  async function save() {
    if (saving.current || !dirty.current || !zip.current) return; saving.current = true; dirty.current = false; setStatus('Salvando…');
    try {
      for (const s of slides.current) for (const b of s.boxes) {if (!boxDirty.current.has(b.key)) continue; const node = stage.current?.querySelector('[data-box="' + CSS.escape(b.key) + '"]') as HTMLElement | null; if (node) writeBox(b, node);}
      boxDirty.current.clear();
      const z = zip.current; for (const s of slides.current) {z.file(s.path, ser(s.doc)); if (s.rels) z.file(s.relsPath, ser(s.rels));}
      z.file('ppt/presentation.xml', ser(pres.current!.doc)); z.file('ppt/_rels/presentation.xml.rels', ser(pres.current!.rels)); z.file('[Content_Types].xml', ser(pres.current!.ct));
      const bytes: Uint8Array = await z.generateAsync({type: 'uint8array', compression: 'DEFLATE'});
      const a = await saveOfficeTo(api, target || {kind: 'page', pageId}, bytes, name, PPTX_MIME); onSavedRef.current(a); setStatus(target?.kind === 'drive' ? 'Salvo no Drive' : 'Salvo');
    } catch (e) {const stop = [403, 409].includes(Number((e as any)?.status)); dirty.current = !stop; setStatus('Não salvo: ' + errorText(e));} // 409/403 do Drive: nao tenta de novo sozinho
    finally {saving.current = false; if (dirty.current) schedule();}
  }
  const schedule = () => {clearTimeout(timer.current); timer.current = setTimeout(() => void save(), 2000);};
  useEffect(() => () => {clearTimeout(timer.current); if (dirty.current) void save();}, []);
  const changed = (key?: string) => {if (key) boxDirty.current.add(key); dirty.current = true; setStatus('Editando…'); schedule();};
  /** Antes de mexer na estrutura (slide novo, mover caixa), grava o texto que esta na tela no XML. */
  const flushText = () => {for (const s of slides.current) for (const b of s.boxes) {if (!boxDirty.current.has(b.key)) continue; const node = stage.current?.querySelector('[data-box="' + CSS.escape(b.key) + '"]') as HTMLElement | null; if (node) writeBox(b, node);} boxDirty.current.clear();};

  flushTextRef.current = flushText;
  useWheelZoom(stage, userZoom, setUserZoom, state === 'ready');
  // ---------- slides ----------
  const nextName = (prefix: string, ext: string) => {let n = 1; while (zip.current.file(prefix + n + ext)) n++; return prefix + n + ext;};
  const newRelId = (rels: Document) => {const ids = new Set(deep(rels, NS.rel, 'Relationship').map(r => r.getAttribute('Id'))); let n = 1; while (ids.has('rId' + n)) n++; return 'rId' + n;};
  async function addSlide(copyOf: number) {
    flushText(); const P = pres.current!, src = slides.current[copyOf]; if (!src) return;
    const path = nextName('ppt/slides/slide', '.xml'), doc = parse(ser(src.doc)), rels = src.rels ? parse(ser(src.rels)) : null;
    if (rels) for (const r of deep(rels, NS.rel, 'Relationship')) if (/notesSlide$/.test(r.getAttribute('Type') || '')) r.parentNode!.removeChild(r);
    const rid = newRelId(P.rels), rel = P.rels.createElementNS(NS.rel, 'Relationship'); rel.setAttribute('Id', rid); rel.setAttribute('Type', SLIDE_TYPE); rel.setAttribute('Target', path.replace('ppt/', '')); P.rels.documentElement.appendChild(rel);
    const ov = P.ct.createElementNS(NS.ct, 'Override'); ov.setAttribute('PartName', '/' + path); ov.setAttribute('ContentType', SLIDE_CT); P.ct.documentElement.appendChild(ov);
    const lst = deep(P.doc, NS.p, 'sldIdLst')[0], ids = deep(P.doc, NS.p, 'sldId'), maxId = Math.max(255, ...ids.map(x => Number(x.getAttribute('id') || 0)));
    const sid = P.doc.createElementNS(NS.p, 'p:sldId'); sid.setAttribute('id', String(maxId + 1)); sid.setAttributeNS(NS.r, 'r:id', rid); lst.insertBefore(sid, ids[copyOf]?.nextSibling || null);
    zip.current.file(path, ser(doc)); if (rels) zip.current.file(relsOf(path), ser(rels));
    const s = await loadSlide(path); slides.current.splice(copyOf + 1, 0, s); setCur(copyOf + 1); setVer(v => v + 1); changed();
  }
  async function newBlankSlide() {
    await addSlide(cur); const s = slides.current[cur + 1]; if (!s) return; // copia do atual sem o conteudo
    const tree = deep(s.doc, NS.p, 'spTree')[0]; for (const el of Array.from(tree.childNodes) as Element[]) if (el.nodeType === 1 && /^(sp|pic|graphicFrame|grpSp|cxnSp)$/.test(el.localName) && !phOf(el)) tree.removeChild(el);
    for (const sp of deep(s.doc, NS.p, 'sp')) {const tx = kid(sp, NS.p, 'txBody'); if (!tx) continue; const ps = kids(tx, NS.a, 'p'); ps.forEach((p, i) => {if (i) tx.removeChild(p); else for (const r of [...kids(p, NS.a, 'r'), ...kids(p, NS.a, 'br'), ...kids(p, NS.a, 'fld')]) p.removeChild(r);});}
    slides.current[cur + 1] = await rebuild(s); setVer(v => v + 1); changed();
  }
  async function rebuild(s: Slide) {zip.current.file(s.path, ser(s.doc)); if (s.rels) zip.current.file(s.relsPath, ser(s.rels)); return loadSlide(s.path);}
  function deleteSlide() {
    if (slides.current.length <= 1) return; flushText(); const P = pres.current!, s = slides.current[cur]; const ids = deep(P.doc, NS.p, 'sldId'), sid = ids[cur];
    const rid = sid?.getAttributeNS(NS.r, 'id'); if (sid) sid.parentNode!.removeChild(sid);
    const rel = deep(P.rels, NS.rel, 'Relationship').find(r => r.getAttribute('Id') === rid); if (rel) rel.parentNode!.removeChild(rel);
    const ov = deep(P.ct, NS.ct, 'Override').find(o => o.getAttribute('PartName') === '/' + s.path); if (ov) ov.parentNode!.removeChild(ov);
    zip.current.remove(s.path); zip.current.remove(s.relsPath); slides.current.splice(cur, 1); setCur(Math.max(0, cur - 1)); setVer(v => v + 1); changed();
  }
  async function addTextBox() {
    flushText(); const s = slides.current[cur]; if (!s) return; const P = pres.current!, d = s.doc, tree = deep(d, NS.p, 'spTree')[0];
    const maxId = Math.max(1, ...deep(d, NS.p, 'cNvPr').map(e => Number(e.getAttribute('id') || 0)));
    const w = Math.round(P.cx * 0.5), hh = Math.round(P.cy * 0.12), x = Math.round((P.cx - w) / 2), y = Math.round((P.cy - hh) / 2);
    const xml = '<p:sp xmlns:p="' + NS.p + '" xmlns:a="' + NS.a + '"><p:nvSpPr><p:cNvPr id="' + (maxId + 1) + '" name="Caixa de Texto ' + (maxId + 1) + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + w + '" cy="' + hh + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="pt-BR" sz="2400" dirty="0"/><a:t>Texto</a:t></a:r></a:p></p:txBody></p:sp>';
    const node = d.importNode(parse(xml).documentElement, true); tree.appendChild(node);
    slides.current[cur] = await rebuild(s); setVer(v => v + 1); changed();
  }
  function deleteBox() {
    const s = slides.current[cur], b = s?.boxes.find(x => x.key === selBox); if (!s || !b) return; flushText(); b.el.parentNode?.removeChild(b.el); setSelBox(null);
    void rebuild(s).then(n => {slides.current[cur] = n; setVer(v => v + 1); changed();});
  }
  /** Mover/mudar o tamanho de uma caixa: grava a posicao no proprio slide (cria se vinha do layout). */
  function setXfrm(b: Box, x: number, y: number, w: number, hh: number) {
    const d = b.el.ownerDocument!; let pr = kid(b.el, NS.p, 'spPr'); if (!pr) {pr = d.createElementNS(NS.p, 'p:spPr'); b.el.insertBefore(pr, kid(b.el, NS.p, 'txBody'));}
    let xf = kid(pr, NS.a, 'xfrm'); if (!xf) {xf = d.createElementNS(NS.a, 'a:xfrm'); pr.insertBefore(xf, pr.firstChild);}
    let off = kid(xf, NS.a, 'off'), ext = kid(xf, NS.a, 'ext'); if (!off) {off = d.createElementNS(NS.a, 'a:off'); xf.insertBefore(off, xf.firstChild);} if (!ext) {ext = d.createElementNS(NS.a, 'a:ext'); xf.appendChild(ext);}
    off.setAttribute('x', String(Math.round(x))); off.setAttribute('y', String(Math.round(y))); ext.setAttribute('cx', String(Math.round(w))); ext.setAttribute('cy', String(Math.round(hh)));
    b.x = x; b.y = y; b.w = w; b.hgt = hh;
  }
  const dragBox = (b: Box, mode: 'move' | 'size') => (e: any) => {
    e.preventDefault(); e.stopPropagation(); const s = scaleNow(), f = stageW / BASE * userZoom, sx = e.clientX, sy = e.clientY, o = {x: b.x, y: b.y, w: b.w, hgt: b.hgt}, el = stage.current?.querySelector('[data-wrap="' + CSS.escape(b.key) + '"]') as HTMLElement | null, w = winOf();
    const mv = (ev: PointerEvent) => {const dx = (ev.clientX - sx) / (s * f), dy = (ev.clientY - sy) / (s * f);
      if (mode === 'move') {b.x = o.x + dx; b.y = o.y + dy;} else {b.w = Math.max(200000, o.w + dx); b.hgt = Math.max(150000, o.hgt + dy);}
      if (el) {el.style.left = b.x * s + 'px'; el.style.top = b.y * s + 'px'; el.style.width = b.w * s + 'px'; el.style.height = b.hgt * s + 'px';}};
    const up = () => {w.removeEventListener('pointermove', mv); w.removeEventListener('pointerup', up); setXfrm(b, b.x, b.y, b.w, b.hgt); changed();};
    w.addEventListener('pointermove', mv); w.addEventListener('pointerup', up);
  };

  // ---------- formatacao do texto selecionado ----------
  const keep = () => {const s = winOf().getSelection(); if (s && s.rangeCount && stage.current?.contains(s.anchorNode)) sel.current = s.getRangeAt(0).cloneRange();};
  const restore = () => {const s = winOf().getSelection(); if (sel.current && s) {s.removeAllRanges(); s.addRange(sel.current);}};
  const boxKeyAtSel = () => {const n = sel.current?.startContainer; const el = (n && (n.nodeType === 1 ? n as Element : n.parentElement))?.closest?.('[data-box]'); return el?.getAttribute('data-box') || undefined;};
  const exec = (cmd: string, value?: string) => {restore(); const d = docOf(); try {d.execCommand('styleWithCSS', false, 'true');} catch {} d.execCommand(cmd, false, value); keep(); changed(boxKeyAtSel());};
  const fontSize = (pt: number) => {restore(); const d = docOf(), s = winOf().getSelection(); if (!s || !s.rangeCount || s.isCollapsed) return;
    d.execCommand('styleWithCSS', false, 'false'); d.execCommand('fontSize', false, '7');
    stage.current?.querySelectorAll('font[size="7"]').forEach(f => {const span = d.createElement('span'); span.style.fontSize = (pt * 12700 * scaleNow()).toFixed(2) + 'px'; span.innerHTML = (f as HTMLElement).innerHTML; f.replaceWith(span);});
    keep(); changed(boxKeyAtSel());};

  const B = (label: string, title: string, run: () => void, extra: any = {}) => h('button', {key: title, type: 'button', title, 'aria-label': title, onMouseDown: (e: any) => {e.preventDefault(); run();},
    style: {height: 28, minWidth: 28, padding: '0 6px', border: 0, borderRadius: 6, background: 'transparent', color: c.text, cursor: 'pointer', fontSize: 13, ...extra}}, label);
  const sep = (k: string) => h('span', {key: k, style: {width: 1, height: 18, background: c.line, margin: '0 4px'}});
  const swatch = (k: string, color: string, title: string, run: () => void) => h('button', {key: k, type: 'button', title, 'aria-label': title, onMouseDown: (e: any) => {e.preventDefault(); run();}, style: {width: 18, height: 18, borderRadius: 4, border: '1px solid ' + c.line, background: color, cursor: 'pointer', padding: 0}});
  const bar = h('div', {style: {display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, padding: '6px 8px', borderBottom: '1px solid ' + c.line, background: c.bar, flexShrink: 0}},
    B('↶', 'Desfazer', () => exec('undo')), B('↷', 'Refazer', () => exec('redo')), sep('a'),
    B('+ Slide', 'Slide novo', () => void newBlankSlide(), {fontWeight: 600}), B('⧉', 'Duplicar slide', () => void addSlide(cur)), B('🗑', 'Excluir slide', deleteSlide), sep('b'),
    B('T+', 'Caixa de texto nova', () => void addTextBox(), {fontWeight: 700}), selBox ? B('✕ Caixa', 'Excluir a caixa selecionada', deleteBox) : null, sep('c'),
    h('select', {key: 'size', 'aria-label': 'Tamanho da letra', defaultValue: '', onMouseDown: keep, onChange: (e: any) => {const v = Number(e.target.value); if (v) fontSize(v); e.target.value = '';}, style: {height: 28, borderRadius: 6, border: '1px solid ' + c.line, background: c.field, color: c.text, fontSize: 12}},
      h('option', {value: ''}, 'Tamanho'), ...SIZES.map(n => h('option', {key: n, value: n}, n + ' pt'))),
    B('N', 'Negrito', () => exec('bold'), {fontWeight: 800}), B('I', 'Itálico', () => exec('italic'), {fontStyle: 'italic', fontFamily: 'serif'}), B('S', 'Sublinhado', () => exec('underline'), {textDecoration: 'underline'}), B('ab', 'Tachado', () => exec('strikeThrough'), {textDecoration: 'line-through'}), sep('d'),
    h('span', {key: 'hl', style: {display: 'flex', alignItems: 'center', gap: 3, padding: '0 4px'}}, h('span', {style: {fontSize: 11, color: c.muted, marginRight: 2}}, 'Grifar'), ...HIGHLIGHTS.map(([n, col]) => swatch('h' + n, col, 'Marca-texto ' + n.toLowerCase(), () => exec('hiliteColor', col))), B('⌫', 'Tirar o grifo', () => exec('hiliteColor', 'transparent'))), sep('e'),
    h('span', {key: 'fc', style: {display: 'flex', alignItems: 'center', gap: 3, padding: '0 4px'}}, h('span', {style: {fontSize: 11, color: c.muted, marginRight: 2}}, 'Cor'), ...COLORS.map(([n, col]) => swatch('c' + n, col, 'Cor ' + n.toLowerCase(), () => exec('foreColor', col)))), sep('f'),
    B('⯇≡', 'Alinhar à esquerda', () => exec('justifyLeft'), {fontSize: 11}), B('≡', 'Centralizar', () => exec('justifyCenter')), B('≡⯈', 'Alinhar à direita', () => exec('justifyRight'), {fontSize: 11}),
    h('span', {key: 'sp', style: {flex: 1}}), h(ZoomControl, {key: 'zoom', colors: c, zoom: userZoom, setZoom: setUserZoom}), h('span', {key: 'gz', style: {width: 6}}), h(ThemeToggle, {key: 'theme', colors: c, toggle: toggleTheme}), h('span', {key: 'g', style: {width: 6}}),
    h('span', {key: 'st', style: {fontSize: 11, color: /Não salvo/.test(status) ? c.danger : c.muted, marginRight: 6}}, status),
    B('Salvar', 'Salvar agora', () => {flushText(); dirty.current = true; void save();}, {background: c.accent, color: c.onAccent, fontWeight: 600, padding: '0 10px'}));

  const P = pres.current, s = slides.current[cur], scale = P ? BASE / P.cx : 1, zoom = stageW / BASE * userZoom, H = P ? P.cy * scale : 0;
  const slideView = (sl: Slide, sc: number, editable: boolean, k: string) => h('div', {key: k, style: {position: 'relative', width: P!.cx * sc, height: P!.cy * sc, background: sl.bg, boxShadow: '0 2px 10px rgba(0,0,0,.25)', overflow: 'hidden', fontFamily: 'Calibri, Carlito, Arial, sans-serif', color: '#000', flexShrink: 0, filter: c.pageFilter}},
    sl.boxes.map(b => {const st: any = {position: 'absolute', left: b.x * sc, top: b.y * sc, width: b.w * sc, height: b.hgt * sc, boxSizing: 'border-box', background: b.fill || 'transparent'};
      if (b.kind === 'pic') return h('img', {key: b.key, src: b.src, alt: '', draggable: false, style: {...st, objectFit: 'fill'}});
      if (b.kind !== 'text') return h('div', {key: b.key, style: st});
      if (!editable) return h('div', {key: b.key, style: {...st, overflow: 'hidden', padding: 91440 * sc + 'px ' + 91440 * sc + 'px'}, dangerouslySetInnerHTML: {__html: bodyHtml(b.el, b.title, sc)}});
      const on = selBox === b.key;
      return h('div', {key: b.key + ':' + ver, 'data-wrap': b.key, style: {...st, outline: on ? '2px solid ' + c.accent : '1px dashed transparent', outlineOffset: 2}, onMouseEnter: (e: any) => {if (!on) e.currentTarget.style.outline = '1px dashed rgba(120,120,140,.7)';}, onMouseLeave: (e: any) => {if (!on) e.currentTarget.style.outline = '1px dashed transparent';}},
        h('div', {'data-box': b.key, contentEditable: true, suppressContentEditableWarning: true, spellCheck: true, onFocus: () => setSelBox(b.key), onInput: () => changed(b.key), onKeyUp: keep, onMouseUp: keep,
          // o texto entra uma vez so (React nao mexe mais nele): clicar/selecionar nao redesenha e o cursor nao some
          ref: (el: any) => {if (el && el.__html !== b.key + ':' + ver) {el.innerHTML = bodyHtml(b.el, b.title, sc); el.__html = b.key + ':' + ver;}},
          style: {width: '100%', height: '100%', outline: 'none', overflow: 'visible', padding: 91440 * sc + 'px ' + 91440 * sc + 'px', boxSizing: 'border-box', cursor: 'text', lineHeight: 1.15}}),
        on ? h('div', {title: 'Arraste para mover', onPointerDown: dragBox(b, 'move'), style: {position: 'absolute', left: '50%', top: -16, width: 44, marginLeft: -22, height: 12, borderRadius: 6, background: c.accent, cursor: 'move'}}) : null,
        on ? h('div', {title: 'Arraste para mudar o tamanho', onPointerDown: dragBox(b, 'size'), style: {position: 'absolute', right: -7, bottom: -7, width: 12, height: 12, borderRadius: 3, background: c.accent, cursor: 'nwse-resize'}}) : null);
    }));
  return h('div', {style: {display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0, background: c.bg}},
    bar,
    state !== 'ready' ? h('div', {style: {padding: 40, textAlign: 'center', color: state === 'error' ? c.danger : c.muted, fontSize: 13}}, state === 'error' ? err : 'Abrindo a apresentação…') :
    h('div', {style: {flex: 1, minHeight: 0, display: 'flex'}},
      h('div', {style: {width: 150, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid ' + c.line, background: c.bar, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 10}},
        slides.current.map((sl, i) => h('div', {key: sl.path + ':' + ver, onMouseDown: (e: any) => {e.preventDefault(); flushText(); setCur(i); setSelBox(null);}, style: {display: 'flex', gap: 6, cursor: 'pointer', alignItems: 'flex-start'}},
          h('span', {style: {fontSize: 11, color: c.muted, width: 14, textAlign: 'right'}}, String(i + 1)),
          h('div', {style: {outline: i === cur ? '2px solid ' + c.accent : '1px solid ' + c.line, outlineOffset: 1}}, slideView(sl, 112 / P!.cx, false, 't' + i))))),
      h('div', {ref: stage, onMouseDown: (e: any) => {if (e.target === e.currentTarget) setSelBox(null);}, style: {flex: 1, minWidth: 0, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: userZoom > 1 ? 'flex-start' : 'center', padding: 24}},
        s ? h('div', {style: {width: BASE * zoom, height: H * zoom, flexShrink: 0}}, h('div', {style: {width: BASE, height: H, transform: 'scale(' + zoom + ')', transformOrigin: '0 0'}}, slideView(s, scale, true, 'main:' + cur + ':' + ver))) : null)));
}
