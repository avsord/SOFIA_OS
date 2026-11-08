// 08/11/2026 (Pedro: "um tipo de pagina assim... posso dar zoom em um documento e ver direito e tambem zoom out com o scroll,
// e mesmo assim a pagina continua aberta com o mesmo esquema de edicao word"; desenho aprovado no quadro "Sofia - Pagina
// Quadro", com a regra "toda duplicacao e independente; se quiser, clica para sincronizar"):
// a Pagina Quadro e uma pagina normal (mesmos blocos, senha, compartilhar, versoes, busca) com data.layout = 'board'. Cada
// bloco guarda a posicao no quadro em data.board = {x, y, w, h, z}; ligacoes ficam em data.board.links (ids de destino).
// - Rodinha: zoom no ponto do mouse (10% a 400%). Arrastar o fundo: anda. Shift + arrastar no vazio: seleciona varios.
// - Clique seleciona (Shift soma), arrastar move, cantos mudam o tamanho, duplo clique edita no lugar (nota, texto, lista,
//   Word/Excel/PowerPoint com os editores da Sofia) ou abre (foto, video, PDF numa janela; pagina abre).
// - Delete apaga, Ctrl+D duplica, setas empurram, Esc solta; Ctrl+Z/Ctrl+Y sao os da pagina.
// - So desenha o que esta na tela (com folga); afastado, arquivos viram cartao leve (nao carrega video nem PDF).
import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import type {PageBlock} from '../lib/page-editor';
import {useTheme} from '../lib/theme';
import {Icon, type IconName} from './Icon';
import {FileBody, InlineMedia, fileKind, editKind, openFileWindow, downloadPageFile, sizeLabel, defaultView} from './PageFiles';
import {KIND} from './DrivePreview';
import {sanitizeRich} from './PageRichInput';
import {parseSofiaClip, clipFromPaste, type SofiaClip} from '../lib/sofia-clipboard';
import {boardDiagInit, note as diag, track} from '../lib/board-diag';
import {LiveCard, LivePicker, askSofiaAbout, mdToHtml, liveText, liveTitleNow, bustLive, type LiveItem, type LiveKind} from './BoardLive.web';

export const BOARD_SUPPORTED = true;
const h = React.createElement as any;
type Link = string | {to: string; label?: string; arrow?: boolean};
type Mention = {kind: string; id: string; title: string};
type Geo = {x: number; y: number; w: number; h: number; z?: number; links?: Link[]; color?: string; caption?: string; mentions?: Mention[]};
const linkTo = (l: Link) => typeof l === 'string' ? l : l.to;
const linkObj = (l: Link): {to: string; label?: string; arrow?: boolean} => typeof l === 'string' ? {to: l} : l;
/** ponto onde a linha do centro de a ate o centro de b sai do retangulo b (a seta encosta na borda) */
function edgePoint(a: {x: number; y: number}, r: Geo) {const cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = a.x - cx, dy = a.y - cy; if (!dx && !dy) return {x: cx, y: cy}; const k = Math.min(Math.abs((r.w / 2 + 6) / (dx || 1e-9)), Math.abs((r.h / 2 + 6) / (dy || 1e-9))); return {x: cx + dx * Math.min(1, k), y: cy + dy * Math.min(1, k)};}
type View = {x: number; y: number; z: number};
const MIN_Z = 0.1, MAX_Z = 4;
const NOTE_COLORS = ['#2A2636', '#3A2C1A', '#1D3329', '#1E2A44', '#3B2330'];
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Bloco que aparece no quadro: tem lugar guardado, ou tem conteudo (linha de texto vazia que a pagina poe no fim fica de fora). */
export function onBoard(b: PageBlock) {
  if (b.data?.board) return true;
  if (b.type === 'text' || b.type === 'heading1' || b.type === 'heading2' || b.type === 'heading3' || b.type === 'bullet' || b.type === 'number') return !!String(b.text || '').trim();
  if (b.type === 'divider') return false;
  return true;
}
function size(b: PageBlock): {w: number; h: number} {
  const k = fileKind(b.data?.mime, b.data?.name), preview = b.data?.view === 'preview' || (!b.data?.view && defaultView(k) === 'preview');
  if (b.type === 'file') return !preview ? {w: 280, h: 64} : k === 'audio' ? {w: 320, h: 70} : k === 'image' || k === 'video' ? {w: 320, h: 240} : {w: 280, h: 360};
  if (b.type === 'image') return b.data?.drawing ? {w: Math.max(40, b.data.drawing.w || 200), h: Math.max(40, b.data.drawing.h || 120)} : {w: 320, h: 240};
  if (b.type === 'page_link') return {w: 520, h: 420}; // 08/11/2026: a pagina de verdade dentro do cartao
  if (b.type === 'bookmark' && b.data?.link) return b.data.link.image ? {w: 300, h: 240} : {w: 300, h: 110};
  if (b.type === 'bookmark' && b.data?.live) return b.data.live.kind === 'list' || b.data.live.kind === 'mail' ? {w: 300, h: 230} : {w: 280, h: 150};
  if (b.type === 'todo') return {w: 260, h: 180};
  if (b.type === 'callout') return {w: 240, h: 150};
  if (b.type.startsWith('heading')) return {w: 420, h: 60};
  return {w: 300, h: 90};
}
const geoOf = (b: PageBlock): Geo | null => {const g = b.data?.board; return g && typeof g.x === 'number' ? g : null;};
function plainOf(html: string) {const d = document.createElement('div'); d.innerHTML = html; return String(d.innerText || d.textContent || '');}

type Props = {
  api: SofiaApi; pageId: string; blocks: PageBlock[]; locked: boolean;
  edit: (fn: (blocks: PageBlock[]) => PageBlock[], group?: string) => void; flush: () => void;
  pages: Entity[]; onOpenPage: (p: Entity) => void; copyPage: (src: Entity) => Promise<Entity>; copyInto: (copy: Entity, src: Entity) => Promise<void>;
  title: string; onTitle: (v: string) => void; onPageChanged?: (id: string) => void;
  pickFiles: () => void; createDoc: () => void; dropFiles: (files: File[]) => void; pasteClip: (clip: SofiaClip) => void; onError: (m: string) => void;
};

export function PageBoard(p: Props) {
  const c = useTheme(), host = useRef<HTMLDivElement | null>(null), viewKey = 'sofia.board.view.' + p.pageId;
  const [view, setView] = useState<View>(() => {try {const v = JSON.parse(localStorage.getItem(viewKey) || 'null'); if (v && v.z > 0) return v;} catch {} return {x: 80, y: 60, z: 0.8};});
  const viewRef = useRef(view); viewRef.current = view;
  useEffect(() => {const t = setTimeout(() => {try {localStorage.setItem(viewKey, JSON.stringify(view));} catch {}}, 400); return () => clearTimeout(t);}, [view, viewKey]);
  const [sel, setSel] = useState<string[]>([]), [editing, setEditing] = useState<string | null>(null), [live, setLive] = useState<Record<string, Geo>>({});
  const liveRef = useRef(live); liveRef.current = live;
  const [box, setBox] = useState<{x: number; y: number; w: number; h: number} | null>(null), [mode, setMode] = useState<'' | 'draw' | 'link'>(''), [ink, setInk] = useState<{x: number; y: number}[] | null>(null);
  const [guides, setGuides] = useState<{x?: number; y?: number}>({}), [selLink, setSelLink] = useState<{from: string; to: string} | null>(null), [capEdit, setCapEdit] = useState<string | null>(null), [mention, setMention] = useState<{id: string; mode: 'page' | 'app'} | null>(null);
  const pinching = useRef(false), [mailAtt, setMailAtt] = useState<{card: string; hit: string; items: {part: string; name: string; mime: string; bytes: number}[] | null; err: string; busy: string} | null>(null);
  const [livePick, setLivePick] = useState(false), [ask, setAsk] = useState<{q: string; busy: boolean; err: string} | null>(null), [find, setFind] = useState<{q: string; i: number} | null>(null);
  useEffect(() => {setAsk(null); setCapEdit(null); setMailAtt(m => m && sel[0] === m.card ? m : null);}, [sel.join(',')]);
  useEffect(() => {if (!ask && !selLink) return; const on = (e: KeyboardEvent) => {if (e.key === 'Escape') {setAsk(null); setSelLink(null);}}; window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);}, [!!ask, !!selLink]); // trocou a selecao: fecha a caixa da Sofia e a da legenda
  const [picker, setPicker] = useState(false), [rec, setRec] = useState<MediaRecorder | null>(null), [size2, setSize2] = useState({w: 1200, h: 800});
  const anchor = useRef<{x: number; y: number} | null>(null);
  // 08/11/2026: registro do Quadro ("[quadro]" no servidor): cada aviso de erro mostrado tambem entra no registro (sem textos do usuario)
  const fail = (m: string) => {diag('aviso', false, {msg: m}); p.onError(m);};
  const opened = useRef(Date.now());
  useEffect(() => boardDiagInit(p.api), [p.api]);
  // copias antigas trazidas para o quadro (de antes da etiqueta) ganham a etiqueta 'board-copy': somem das listas de Paginas
  useEffect(() => {const ids = new Set(p.blocks.filter(b => b.type === 'page_link' && b.data?.copy_id).map(b => String(b.data!.copy_id)));
    for (const pg of p.pages) if (ids.has(pg.id) && !(pg.tags || []).includes('board-copy')) void p.api.saveEntity({id: pg.id, revision: pg.revision, tags: [...(pg.tags || []), 'board-copy']} as any).then(() => p.onPageChanged?.(pg.id)).catch(() => undefined);
  }, [p.pages.length, p.blocks.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {const ms = Date.now() - opened.current; diag('abrir', true, {ms, n: p.blocks.filter(onBoard).length});}, []); // eslint-disable-line react-hooks/exhaustive-deps
  const blocksRef = useRef(p.blocks); blocksRef.current = p.blocks;
  const shown = useMemo(() => p.blocks.filter(onBoard), [p.blocks]);
  const byId = useMemo(() => new Map(p.blocks.map(b => [b.id, b])), [p.blocks]);
  const geo = (b: PageBlock): Geo => live[b.id] || geoOf(b) || {x: 0, y: 0, ...size(b)};
  useLayoutEffect(() => {const el = host.current; if (!el) return; const ro = new ResizeObserver(() => setSize2({w: el.clientWidth, h: el.clientHeight})); ro.observe(el); return () => ro.disconnect();}, []);
  const toBoard = useCallback((cx: number, cy: number) => {const r = host.current!.getBoundingClientRect(), v = viewRef.current; return {x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z};}, []);
  const center = () => {const v = viewRef.current; return {x: (size2.w / 2 - v.x) / v.z, y: (size2.h / 2 - v.y) / v.z};};

  // blocos sem lugar (arquivo solto, colado, criado pela pagina) ganham lugar perto de onde caiu ou do meio da tela
  useEffect(() => {
    const need = p.blocks.filter(b => onBoard(b) && !geoOf(b)); if (!need.length) return;
    const at = anchor.current || center(); anchor.current = null; let n = 0, topZ = Math.max(0, ...p.blocks.map(b => geoOf(b)?.z || 0));
    const place = new Map<string, Geo>(); for (const b of need) {const s = size(b), spot = freeSpot(at.x - s.w / 2 + n * 28, at.y - s.h / 2 + n * 28, s.w, s.h); place.set(b.id, {x: Math.round(spot.x), y: Math.round(spot.y), w: s.w, h: s.h, z: ++topZ}); n++;}
    p.edit(bs => bs.map(b => place.has(b.id) ? {...b, data: {...(b.data || {}), board: place.get(b.id)}} : b), 'board-place');
  }, [p.blocks]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchGeo = (ids: string[], f: (g: Geo, b: PageBlock) => Geo, group = 'board-move') => {const set = new Set(ids);
    p.edit(bs => bs.map(b => set.has(b.id) ? {...b, data: {...(b.data || {}), board: f(geoOf(b) || {x: 0, y: 0, ...size(b)}, b)}} : b), group);};
  const patchBlock = (id: string, f: (b: PageBlock) => PageBlock, group = '') => p.edit(bs => bs.map(b => b.id === id ? f(b) : b), group);
  const topZ = () => Math.max(0, ...blocksRef.current.map(b => geoOf(b)?.z || 0)) + 1;
  // item novo nasce no ponto pedido; se cair em cima de outro, anda para o lado ate achar espaco livre
  const freeSpot = (x: number, y: number, w: number, hh: number, skip = new Set<string>()) => {const gs = blocksRef.current.filter(b => onBoard(b) && geoOf(b) && !skip.has(b.id)).map(b => geoOf(b)!);
    const hit = (px: number, py: number) => gs.some(g => px < g.x + g.w + 16 && px + w + 16 > g.x && py < g.y + g.h + 16 && py + hh + 16 > g.y);
    for (let i = 0; i < 40; i++) {const ring = Math.floor(i / 8) + 1, k = i % 8, dx = [1, 0, -1, 0, 1, -1, 1, -1][k] * ring * (w + 24), dy = [0, 1, 0, -1, 1, 1, -1, -1][k] * ring * (hh + 24); if (i === 0 && !hit(x, y)) return {x, y}; if (!hit(x + dx, y + dy)) return {x: x + dx, y: y + dy};}
    return {x: x + 30, y: y + 30};};
  const addBlock = (b: PageBlock, at?: {x: number; y: number}) => {const s = size(b), pt = at || center(), spot = at ? {x: pt.x - s.w / 2, y: pt.y - s.h / 2} : freeSpot(pt.x - s.w / 2, pt.y - s.h / 2, s.w, s.h); const nb = {...b, data: {...(b.data || {}), board: {x: Math.round(spot.x), y: Math.round(spot.y), w: s.w, h: s.h, z: topZ()}}};
    p.edit(bs => [...bs, nb], 'board-add'); setSel([nb.id]); return nb;};

  // celular/tablet: dois dedos = pinca (zoom) e arrastar; um dedo no fundo anda, num item move
  useEffect(() => {const el = host.current; if (!el) return; const pts = new Map<number, {x: number; y: number}>(); let start: {d: number; cx: number; cy: number; v: View} | null = null;
    const geom = () => {const [a, b] = [...pts.values()]; return {d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2};};
    const down = (e: PointerEvent) => {if (e.pointerType !== 'touch') return; pts.set(e.pointerId, {x: e.clientX, y: e.clientY}); if (pts.size === 2) {pinching.current = true; setLive({}); setGuides({}); start = {...geom(), v: viewRef.current};}};
    const move = (e: PointerEvent) => {if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, {x: e.clientX, y: e.clientY}); if (pts.size < 2 || !start) return; const g = geom(), r = el.getBoundingClientRect(), v = start.v;
      const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * g.d / start.d)), mx = start.cx - r.left, my = start.cy - r.top; setView({z, x: (g.cx - r.left) - (mx - v.x) * (z / v.z), y: (g.cy - r.top) - (my - v.y) * (z / v.z)});};
    const up = (e: PointerEvent) => {if (!pts.delete(e.pointerId)) return; if (pts.size < 2) start = null; if (!pts.size) setTimeout(() => {pinching.current = false;}, 0);};
    el.addEventListener('pointerdown', down, true); window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
    return () => {el.removeEventListener('pointerdown', down, true); window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true);};}, []);
  // zoom pela rodinha (no ponto do mouse); dentro de algo em edicao a rodinha rola o que esta sendo editado
  useEffect(() => {const el = host.current; if (!el) return;
    const on = (e: WheelEvent) => {const t = e.target as HTMLElement; if (t.closest?.('[data-board-editing],[data-board-ui]')) return; e.preventDefault(); // 08/11/2026: rodinha em cima de janela/lista rola a lista, nao da zoom
      const r = el.getBoundingClientRect(), v = viewRef.current, k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * k)), mx = e.clientX - r.left, my = e.clientY - r.top;
      setView({z, x: mx - (mx - v.x) * (z / v.z), y: my - (my - v.y) * (z / v.z)});};
    el.addEventListener('wheel', on, {passive: false}); return () => el.removeEventListener('wheel', on);}, []);
  const zoomBy = (k: number) => {const v = viewRef.current, z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * k)), mx = size2.w / 2, my = size2.h / 2; setView({z, x: mx - (mx - v.x) * (z / v.z), y: my - (my - v.y) * (z / v.z)});};
  const fitAll = () => {if (!shown.length) {setView({x: 80, y: 60, z: 1}); return;} const gs = shown.map(geo), x1 = Math.min(...gs.map(g => g.x)), y1 = Math.min(...gs.map(g => g.y)), x2 = Math.max(...gs.map(g => g.x + g.w)), y2 = Math.max(...gs.map(g => g.y + g.h));
    const z = Math.min(MAX_Z, Math.max(MIN_Z, Math.min((size2.w - 120) / Math.max(1, x2 - x1), (size2.h - 180) / Math.max(1, y2 - y1)))); setView({z, x: (size2.w - (x2 - x1) * z) / 2 - x1 * z, y: (size2.h - 60 - (y2 - y1) * z) / 2 - y1 * z});};

  // fundo: arrastar anda; Shift+arrastar seleciona; no modo desenho, desenha
  const onBgDown = (e: any) => {
    if (e.button !== 0 && e.button !== 1) return; const t = e.target as HTMLElement; if (t.closest('[data-board-item],[data-board-ui]')) return;
    // 08/11/2026 (Pedro: "mexer com o mouse ta selecionando o titulo"): arrastar o fundo nunca seleciona texto
    e.preventDefault(); try {window.getSelection()?.removeAllRanges();} catch {} (document.activeElement as HTMLElement | null)?.blur?.();
    host.current?.focus({preventScroll: true}); setEditing(null);
    const sx = e.clientX, sy = e.clientY, v0 = viewRef.current;
    if (mode === 'draw') {const pts = [toBoard(sx, sy)]; setInk(pts);
      const mv = (ev: PointerEvent) => {pts.push(toBoard(ev.clientX, ev.clientY)); setInk([...pts]);};
      const up = () => {window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); setInk(null); if (pts.length < 2) return;
        const x1 = Math.min(...pts.map(q => q.x)) - 4, y1 = Math.min(...pts.map(q => q.y)) - 4, x2 = Math.max(...pts.map(q => q.x)) + 4, y2 = Math.max(...pts.map(q => q.y)) + 4, w = Math.max(8, x2 - x1), hh = Math.max(8, y2 - y1);
        const d = pts.map((q, i) => (i ? 'L' : 'M') + Math.round((q.x - x1) * 10) / 10 + ' ' + Math.round((q.y - y1) * 10) / 10).join(' ');
        const nb: PageBlock = {id: uid(), type: 'image', text: '', data: {drawing: {d, w, h: hh, color: c.accent, width: 3}, board: {x: Math.round(x1), y: Math.round(y1), w: Math.round(w), h: Math.round(hh), z: topZ()}}};
        p.edit(bs => [...bs, nb], 'board-draw');};
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); return;}
    if (e.shiftKey) {const a = toBoard(sx, sy); const base = new Set(sel);
      const mv = (ev: PointerEvent) => {const b2 = toBoard(ev.clientX, ev.clientY), r = {x: Math.min(a.x, b2.x), y: Math.min(a.y, b2.y), w: Math.abs(b2.x - a.x), h: Math.abs(b2.y - a.y)}; setBox(r);
        setSel([...new Set([...base, ...shown.filter(b => {const g = geo(b); return g.x < r.x + r.w && g.x + g.w > r.x && g.y < r.y + r.h && g.y + g.h > r.y;}).map(b => b.id)])]);};
      const up = () => {setBox(null); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);};
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); return;}
    let moved = false;
    const mv = (ev: PointerEvent) => {if (pinching.current) return; const dx = ev.clientX - sx, dy = ev.clientY - sy; if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return; moved = true; setView({...v0, x: v0.x + dx, y: v0.y + dy});};
    const up = () => {if (!moved) {setSel([]); setSelLink(null); if (mode === 'link') setMode('');} window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);};
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const onBgDouble = (e: any) => {const t = e.target as HTMLElement; if (t.closest('[data-board-item],[data-board-ui]')) return; const at = toBoard(e.clientX, e.clientY);
    const nb = addBlock({id: uid(), type: 'callout', text: '', html: '', data: {}}, at); setEditing(nb.id);};

  // item: clique seleciona, arrastar move (todos os selecionados), no modo ligar liga
  const onItemDown = (b: PageBlock) => (e: any) => {
    if (e.button !== 0) return; if (editing === b.id) return; e.stopPropagation(); host.current?.focus({preventScroll: true});
    if (mode === 'link') {const from = sel[0]; if (from && from !== b.id) {patchGeo([from], g => ({...g, links: [...(g.links || []).filter(l => linkTo(l) !== b.id), {to: b.id, arrow: true}]}), 'board-link');} setMode(''); setSel([b.id]); return;}
    const already = sel.includes(b.id), ids = e.shiftKey ? (already ? sel.filter(x => x !== b.id) : [...sel, b.id]) : already ? sel : [b.id]; setSel(ids); if (e.shiftKey) return;
    const sx = e.clientX, sy = e.clientY, start = new Map(ids.map(id => [id, geo(byId.get(id)!)])); let moved = false;
    // linhas-guia: a borda ou o meio do que se move encaixa na borda ou no meio de um vizinho (Alt solta o encaixe)
    const gs0 = [...start.values()], bx = Math.min(...gs0.map(g => g.x)), by = Math.min(...gs0.map(g => g.y)), bw = Math.max(...gs0.map(g => g.x + g.w)) - bx, bh = Math.max(...gs0.map(g => g.y + g.h)) - by;
    const others = shown.filter(o => !start.has(o.id)).map(o => geo(o)), ox = others.flatMap(g => [g.x, g.x + g.w / 2, g.x + g.w]), oy = others.flatMap(g => [g.y, g.y + g.h / 2, g.y + g.h]);
    const snap = (v: number, size: number, cands: number[], tol: number) => {let best: {d: number; line: number} | null = null; for (const k of [0, size / 2, size]) for (const c2 of cands) {const d = c2 - (v + k); if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = {d, line: c2};} return best;};
    const mv = (ev: PointerEvent) => {if (pinching.current) return; const z = viewRef.current.z; let dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z; if (!moved && Math.abs(dx) + Math.abs(dy) < 3 / z) return; moved = true;
      let gx: number | undefined, gy: number | undefined; if (!ev.altKey) {const tol = 6 / z, sxp = snap(bx + dx, bw, ox, tol), syp = snap(by + dy, bh, oy, tol); if (sxp) {dx += sxp.d; gx = sxp.line;} if (syp) {dy += syp.d; gy = syp.line;}} setGuides({x: gx, y: gy});
      const next: Record<string, Geo> = {}; start.forEach((g, id) => {next[id] = {...g, x: Math.round(g.x + dx), y: Math.round(g.y + dy)};}); setLive(next);};
    const up = () => {window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      setGuides({}); if (moved) {const fin = liveRef.current; p.edit(bs => bs.map(x => fin[x.id] ? {...x, data: {...(x.data || {}), board: {...(geoOf(x) || {}), ...fin[x.id]}}} : x), 'board-move'); setLive({});}};
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const onResize = (b: PageBlock, corner: string) => (e: any) => {
    e.stopPropagation(); e.preventDefault(); const sx = e.clientX, sy = e.clientY, g0 = geo(b), ratio = g0.w / Math.max(1, g0.h), keep = (b.type === 'image' || (b.type === 'file' && ['image', 'video'].includes(fileKind(b.data?.mime, b.data?.name)))) && !e.shiftKey;
    const mv = (ev: PointerEvent) => {if (pinching.current) return; const z = viewRef.current.z, dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z; let {x, y, w, h: hh} = g0;
      if (corner.includes('e')) w = g0.w + dx; if (corner.includes('w')) {w = g0.w - dx; x = g0.x + dx;} if (corner.includes('s')) hh = g0.h + dy; if (corner.includes('n')) {hh = g0.h - dy; y = g0.y + dy;}
      w = Math.max(60, w); hh = Math.max(36, hh); if (keep) {hh = w / ratio; if (corner.includes('n')) y = g0.y + g0.h - hh;} if (corner.includes('w')) x = g0.x + g0.w - w;
      setLive({[b.id]: {...g0, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh)}});};
    const up = () => {window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); const g = liveRef.current[b.id]; if (g) patchGeo([b.id], () => g, 'board-size'); setLive({});};
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  // leva a camera ate o item (cabe na tela, no maximo 100%), como quem aproxima o documento para editar
  const focusOn = (g: Geo) => {const z = Math.min(1, Math.max(MIN_Z, Math.min((size2.w - 80) / g.w, (size2.h - 150) / g.h))); setView({z, x: (size2.w - g.w * z) / 2 - g.x * z, y: Math.max(60, (size2.h - 90 - g.h * z) / 2) - g.y * z});};
  const openItem = (b: PageBlock) => {
    if (b.type === 'callout' || b.type === 'todo' || b.type === 'text' || b.type.startsWith('heading') || b.type === 'bullet' || b.type === 'number' || b.type === 'quote') {setEditing(b.id); return;}
    if (b.type === 'bookmark' && b.data?.live) return;
    if (b.type === 'bookmark' && b.data?.link?.url) {window.open(String(b.data.link.url), '_blank', 'noopener'); return;}
    if (b.type === 'page_link') {const t = p.pages.find(x => x.id === String(b.data?.page_id || '')); if (!t) return; if (t.data?.lock_json) {p.onOpenPage(t); return;} focusOn(geo(b)); setEditing(b.id); return;} // entra na pagina dentro do cartao (abrir arquivos, editar)
    const id = String(b.data?.attachment_id || ''); if (!id) return;
    if (b.type === 'file' && editKind(b.data?.mime, b.data?.name) && !p.locked) {const g = geo(b); if (g.w < 600 || g.h < 700) patchGeo([b.id], g2 => ({...g2, w: Math.max(g2.w, 680), h: Math.max(g2.h, 860)}), 'board-size'); focusOn({...g, w: Math.max(g.w, 680), h: Math.max(g.h, 860)}); setEditing(b.id); return;} // editar: o cartao vira uma pagina
    openFileWindow(p.api, {id, name: String(b.data?.name || 'arquivo'), mime: String(b.data?.mime || (b.type === 'image' ? 'image/jpeg' : '')), pageId: p.pageId,
      onSaved: a => {patchBlock(b.id, x => ({...x, data: {...(x.data || {}), attachment_id: a.id, name: a.name, mime: a.mime, size: a.bytes}}), 'board-file'); p.flush();}});
  };

  // teclado (com o foco no quadro, fora de edicao)
  const onKey = (e: any) => {
    const t = e.target as HTMLElement; if (t.closest('input,textarea,[contenteditable="true"],[data-board-editing]')) {if (e.key === 'Escape') {setEditing(null); setAsk(null); host.current?.focus();} return;}
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey, k = e.key;
    if (mod && k.toLowerCase() === 'f') {e.preventDefault(); setFind({q: '', i: 0}); return;}
    if (k === 'Escape') {if (ask || selLink) {setAsk(null); setSelLink(null); return;} setSel([]); setMode(''); return;}
    if (mod && k.toLowerCase() === 'a') {e.preventDefault(); setSel(shown.map(b => b.id)); return;}
    if (!sel.length) return;
    if (k === 'Delete' || k === 'Backspace') {e.preventDefault(); remove(sel); return;}
    if (mod && k.toLowerCase() === 'd') {e.preventDefault(); void duplicate(sel); return;}
    if (k === 'Enter') {const b = byId.get(sel[0]); if (b) {e.preventDefault(); openItem(b);} return;}
    const step = e.shiftKey ? 20 : 4, d = k === 'ArrowLeft' ? [-step, 0] : k === 'ArrowRight' ? [step, 0] : k === 'ArrowUp' ? [0, -step] : k === 'ArrowDown' ? [0, step] : null;
    if (d) {e.preventDefault(); patchGeo(sel, g => ({...g, x: g.x + d[0], y: g.y + d[1]}), 'board-nudge');}
  };
  const textOf = (b: PageBlock): string => {
    if (b.type === 'bookmark' && b.data?.live) return liveTitleNow(b.data.live.kind, b.data.live.id) || String(b.text || '');
    if (b.type === 'page_link') {const t = p.pages.find(x => x.id === String(b.data?.page_id || '')); if (!t) return ''; let lines = ''; try {lines = (JSON.parse(String(t.data?.blocks_json || '[]')) as any[]).map(x => String(x.text || '')).filter(Boolean).join('\n');} catch {} return 'Página "' + (t.title || 'Sem título') + '":\n' + lines;}
    if (b.type === 'todo' && Array.isArray(b.data?.items)) return b.data.items.map((i: any) => (i.done ? '[x] ' : '[ ] ') + i.text).join('\n');
    if (b.type === 'file' || b.type === 'image') return b.data?.drawing ? '' : 'Arquivo: ' + String(b.data?.name || b.data?.caption || 'imagem');
    return String(b.text || '');};
  const patchLink = (from: string, to: string, f: ((l: {to: string; label?: string; arrow?: boolean}) => any) | null) => patchGeo([from], g => ({...g, links: (g.links || []).flatMap(l => linkTo(l) !== to ? [l] : f ? [f(linkObj(l))] : [])}), 'board-link');
  const remove = (ids: string[]) => {const set = new Set(ids); p.edit(bs => {const rest = bs.filter(b => !set.has(b.id)).map(b => {const g = geoOf(b); return g?.links?.some(l => set.has(linkTo(l))) ? {...b, data: {...b.data, board: {...g, links: g.links.filter(l => !set.has(linkTo(l)))}}} : b;}); return rest.length ? rest : [{id: uid(), type: 'text', text: ''}];}, 'board-remove'); setSel([]); setEditing(null);};
  // toda duplicacao e independente (Pedro, 08/11): pagina duplicada vira uma copia nova; arquivo e nota sao copiados
  const duplicate = async (ids: string[]) => {const made: PageBlock[] = []; let z = topZ();
    for (const id of ids) {const b = byId.get(id); if (!b) continue; const g = geo(b); let data: any = {...JSON.parse(JSON.stringify(b.data || {})), board: {...g, links: [], x: g.x + 30, y: g.y + 30, z: z++}};
      if (b.type === 'page_link') {const src = p.pages.find(x => x.id === String(b.data?.page_id || '')); if (!src) continue; try {const copy = await track('copiar-pagina', () => p.copyPage(src)); data = {...data, page_id: copy.id, copy_id: copy.id, source_id: src.id, synced: false};} catch (e: any) {fail(String(e?.message || 'Não deu para duplicar a página.')); continue;}}
      made.push({...JSON.parse(JSON.stringify(b)), id: uid(), data});}
    if (made.length) {p.edit(bs => [...bs, ...made], 'board-dup'); setSel(made.map(x => x.id));}};
  const bringFront = () => {let z = topZ(); patchGeo(sel, g => ({...g, z: z++}), 'board-z');};

  // colar no quadro: arquivo/imagem vira cartao, item copiado do Drive/pagina vira arquivo, texto vira nota
  useEffect(() => {const el = host.current; if (!el) return;
    const on = (e: ClipboardEvent) => {const t = e.target as HTMLElement; if (t.closest?.('input,textarea,[contenteditable="true"],[data-board-editing]')) return; if (!el.contains(document.activeElement)) return;
      const clip = clipFromPaste(e) || parseSofiaClip(e.clipboardData?.getData('text/plain')); const files = Array.from(e.clipboardData?.files || []);
      anchor.current = center();
      if (clip) {e.preventDefault(); p.pasteClip(clip); return;}
      if (files.length) {e.preventDefault(); if (p.locked) {fail('Arquivos ainda não entram em páginas trancadas.'); return;} p.dropFiles(files); return;}
      const html = e.clipboardData?.getData('text/html') || '', text = e.clipboardData?.getData('text/plain') || ''; if (!text.trim()) return; e.preventDefault();
      if (/^https?:\/\/\S+$/i.test(text.trim())) {const url = text.trim(); const nb = addBlock({id: uid(), type: 'bookmark', text: url, url, data: {link: {url, title: '', site: '', image: ''}}} as any);
        track('previa-link', () => p.api.linkPreview(url)).then(pr => patchBlock(nb.id, x => ({...x, text: (pr.title ? pr.title + ' — ' : '') + url, data: {...(x.data || {}), link: {url, title: pr.title || '', site: pr.site || '', image: pr.image || '', description: String(pr.description || '').slice(0, 300)}, board: {...(geoOf(x) || {x: 0, y: 0, w: 300, h: 110}), h: pr.image ? 240 : 110}}}), 'board-link-preview')).catch(() => {}); return;} // link colado vira cartao com previa
      const rich = html ? sanitizeRich(html) : ''; addBlock({id: uid(), type: 'callout', text: text.slice(0, 12000), html: rich && rich.length < 24000 ? rich : '', data: {}});};
    document.addEventListener('paste', on); return () => document.removeEventListener('paste', on);}, [p.blocks, p.locked]); // eslint-disable-line react-hooks/exhaustive-deps
  // arquivo arrastado: guarda o ponto para o cartao nascer onde caiu (quem recebe o arquivo e a pagina)
  useEffect(() => {const el = host.current; if (!el) return; const on = (e: DragEvent) => {anchor.current = toBoard(e.clientX, e.clientY);}; el.addEventListener('dragover', on); el.addEventListener('drop', on, true); return () => {el.removeEventListener('dragover', on); el.removeEventListener('drop', on, true);};}, [toBoard]);

  // gravar audio (botao do microfone): vira um arquivo de audio no quadro (vai para o Drive como os outros)
  const toggleRec = async () => {
    if (rec) {rec.stop(); return;}
    if (p.locked) {fail('Arquivos ainda não entram em páginas trancadas.'); return;}
    try {const stream = await navigator.mediaDevices.getUserMedia({audio: true}), r = new MediaRecorder(stream), parts: Blob[] = [];
      r.ondataavailable = ev => {if (ev.data.size) parts.push(ev.data);};
      r.onstop = () => {stream.getTracks().forEach(t => t.stop()); setRec(null); const type = r.mimeType || 'audio/webm', ext = /ogg/.test(type) ? 'ogg' : /mp4/.test(type) ? 'm4a' : 'webm', now = new Date();
        const name = 'Áudio ' + now.toLocaleDateString('pt-BR').replace(/\//g, '-') + ' ' + now.toTimeString().slice(0, 5).replace(':', 'h') + '.' + ext;
        anchor.current = center(); p.dropFiles([new File(parts, name, {type})]);};
      r.start(); setRec(r);} catch {fail('Sem acesso ao microfone. Libere o microfone para o site e tente de novo.');}
  };

  // so desenha o que esta na tela (com folga de meia tela)
  const vis = useMemo(() => {const v = view, mx = size2.w / v.z / 2, my = size2.h / v.z / 2, x1 = -v.x / v.z - mx, y1 = -v.y / v.z - my, x2 = (size2.w - v.x) / v.z + mx, y2 = (size2.h - v.y) / v.z + my;
    return shown.filter(b => {if (sel.includes(b.id) || editing === b.id) return true; const g = geo(b); return g.x < x2 && g.x + g.w > x1 && g.y < y2 && g.y + g.h > y1;}).sort((a, b) => (geo(a).z || 0) - (geo(b).z || 0));
  }, [shown, view, size2, live, sel, editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const light = view.z < 0.45;
  const links = useMemo(() => {const out: {id: string; from: string; to: string; a: Geo; b: Geo; label: string; arrow: boolean}[] = []; for (const b of shown) {const g = geo(b); for (const raw of g.links || []) {const l = linkObj(raw), t = byId.get(l.to); if (t && onBoard(t)) out.push({id: b.id + '>' + l.to, from: b.id, to: l.to, a: g, b: geo(t), label: String(l.label || ''), arrow: !!l.arrow});}} return out;}, [shown, live]); // eslint-disable-line react-hooks/exhaustive-deps
  const one = sel.length === 1 ? byId.get(sel[0]) : undefined;

  const btn = (icon: IconName | 'T', label: string, run: () => void, on = false, danger = false, testID?: string) => h('button', {key: label, type: 'button', title: label, 'aria-label': label, 'aria-pressed': on || undefined, 'data-testid': testID,
    onPointerDown: (e: any) => e.stopPropagation(), onClick: (e: any) => {e.stopPropagation(); run();},
    style: {width: 40, height: 38, border: 0, borderRadius: 10, cursor: 'pointer', background: on ? c.accentSoft : 'transparent', color: danger ? c.danger : on ? c.accent : c.text, display: 'flex', alignItems: 'center', justifyContent: 'center'}},
    icon === ('@' as any) ? h('span', {style: {fontSize: 18, fontWeight: 700, lineHeight: 1}}, '@') : icon === 'T' ? h('svg', {width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', 'aria-hidden': true}, h('path', {d: 'M5 6V4h14v2M12 4v16M9 20h6'})) : <Icon name={icon} size={19} color={danger ? c.danger : on ? c.accent : c.text} />);
  const bar = (children: any[], style: any, label: string) => h('div', {'data-board-ui': '1', role: 'toolbar', 'aria-label': label, onPointerDown: (e: any) => e.stopPropagation(), style: {position: 'absolute', display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px', background: c.surface, border: '1px solid ' + c.line, borderRadius: 14, boxShadow: '0 10px 24px rgba(0,0,0,.28)', zIndex: 30, ...style}}, ...children);

  const selBar = (one || sel.length > 1) && !editing ? (() => {const gs = sel.map(id => byId.get(id)).filter(Boolean).map(b => geo(b!)), x = Math.min(...gs.map(g => g.x)), y2 = Math.max(...gs.map(g => g.y + g.h)), x2 = Math.max(...gs.map(g => g.x + g.w));
    const y1 = Math.min(...gs.map(g => g.y)), left = Math.max(8, Math.min(size2.w - 420, ((x + x2) / 2) * view.z + view.x - 200)), under = Math.max(0, ...sel.map(id => byId.get(id)).filter(Boolean).map(b => {const g = geo(b!); return g.y + g.h >= y2 - 1 ? (g.caption ? 22 : 0) + ((g.mentions || []).length ? 26 : 0) : 0;})), below = y2 * view.z + view.y + 14 + under, top = below + 48 > size2.h - 92 ? Math.max(8, y1 * view.z + view.y - 62) : below; // perto do rodape: a barra sobe para cima do item (nao fica sob a barra de inserir)
    const items: any[] = [];
    if (one?.type === 'file') {const k = fileKind(one.data?.mime, one.data?.name), pv = (one.data?.view || defaultView(k)) === 'preview'; items.push(btn(pv ? 'file' : 'eye', pv ? 'Mostrar como anexo' : 'Abrir no quadro (visualização)', () => {const s = size({...one, data: {...one.data, view: pv ? 'attach' : 'preview'}}); patchBlock(one.id, b => ({...b, data: {...b.data, view: pv ? 'attach' : 'preview', board: {...geo(b), w: s.w, h: s.h}}}), 'board-view');}));}
    if (one?.type === 'page_link') {const synced = !!one.data?.synced, src = one.data?.source_id ? p.pages.find(x => x.id === String(one.data!.source_id)) : null;
      if (src) items.push(btn('refresh', synced ? 'Parar de sincronizar com a original' : 'Sincronizar com a página original', () => patchBlock(one.id, b => ({...b, data: {...b.data, synced: !synced, page_id: !synced ? b.data?.source_id : b.data?.copy_id}}), 'board-sync'), synced, false, 'board-sync'));
      if (src && !synced) items.push(btn('download', 'Atualizar a cópia com o que está na original agora', () => {const cp = p.pages.find(x => x.id === String(one.data?.copy_id || '')); if (cp) void track('atualizar-copia', () => p.copyInto(cp, src)).catch(e => fail(String(e?.message || e)));}));
      items.push(btn('edit', 'Usar a página aqui no quadro (dois cliques)', () => openItem(one)));
      items.push(btn('external', 'Abrir a página inteira', () => {const t = p.pages.find(x => x.id === String(one.data?.page_id || '')); if (t) p.onOpenPage(t);}));}
    if (one?.type === 'callout') items.push(btn('circle', 'Cor da nota', () => {const i = NOTE_COLORS.indexOf(geo(one).color || NOTE_COLORS[0]); patchGeo([one.id], g => ({...g, color: NOTE_COLORS[(i + 1) % NOTE_COLORS.length]}), 'board-color');}));
    items.unshift(btn('sofia', 'Pedir à Sofia sobre ' + (sel.length > 1 ? 'estes itens' : 'este item') + ' (resumir, organizar, virar tarefas…)', () => setAsk({q: '', busy: false, err: ''}), !!ask, false, 'board-ask'));
    if (one?.type === 'bookmark' && one.data?.live?.kind === 'mail') items.push(btn('clip', 'Anexos deste e-mail', () => {const hit = String(one.data!.live.id), card = one.id; setMailAtt({card, hit, items: null, err: '', busy: ''}); track('anexo-email-listar', () => p.api.mailAttachments(hit)).then(r => setMailAtt(m => m && m.card === card ? {...m, items: r.items} : m)).catch(e => setMailAtt(m => m && m.card === card ? {...m, err: String(e?.message || 'Não deu para ler os anexos.')} : m));}, !!mailAtt, false, 'board-mail-att'));
    if (one?.type === 'bookmark' && one.data?.live) items.push(btn('refresh', 'Atualizar com o app agora', () => bustLive(one.data!.live.kind)));
    if (one) items.push(btn('rename', 'Legenda', () => setCapEdit(one.id), capEdit === one.id, false, 'board-caption'));
    if (one) items.push(btn('@' as any, 'Mencionar uma página ou item do app (@)', () => setMention({id: one.id, mode: 'page'}), !!mention, false, 'board-mention'));
    if (one) items.push(btn('link', 'Ligar a outro item (clique no outro item)', () => setMode(mode === 'link' ? '' : 'link'), mode === 'link'));
    items.push(btn('moveTo', 'Trazer para a frente', bringFront));
    if (one && (one.type === 'file' || (one.type === 'image' && one.data?.attachment_id))) items.push(btn('download', 'Baixar', () => void downloadPageFile(p.api, String(one.data?.attachment_id))));
    items.push(btn('copy', 'Duplicar (Ctrl+D) — cópia independente', () => void duplicate(sel)));
    items.push(btn('trash', 'Excluir (Delete)', () => remove(sel), false, true));
    return bar(items, {left, top, height: 48}, 'Item selecionado');})() : null;

  return h('div', {ref: host, 'data-testid': 'page-board', tabIndex: 0, onKeyDown: onKey, onPointerDown: onBgDown, onDoubleClick: onBgDouble,
    style: {position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', outline: 'none', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: mode === 'draw' ? 'crosshair' : mode === 'link' ? 'alias' : 'default', backgroundColor: c.bg,
      backgroundImage: 'radial-gradient(' + c.line + ' ' + Math.max(0.8, 1.2 * Math.min(1.4, view.z)) + 'px, transparent ' + Math.max(0.8, 1.2 * Math.min(1.4, view.z)) + 'px)', backgroundSize: 24 * view.z + 'px ' + 24 * view.z + 'px', backgroundPosition: view.x + 'px ' + view.y + 'px'}},
    h('div', {style: {position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.z + ')'}},
      h('svg', {style: {position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none'}, width: 1, height: 1, 'aria-hidden': true},
        h('defs', null, h('marker', {id: 'board-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse'}, h('path', {d: 'M0 0 L10 5 L0 10 z', fill: c.muted}))),
        ...links.map(l => {const ca = {x: l.a.x + l.a.w / 2, y: l.a.y + l.a.h / 2}, end = l.arrow ? edgePoint(ca, l.b) : {x: l.b.x + l.b.w / 2, y: l.b.y + l.b.h / 2}, on = selLink?.from === l.from && selLink?.to === l.to, sw = 2 / Math.max(0.5, view.z);
          return h('g', {key: l.id}, h('line', {x1: ca.x, y1: ca.y, x2: end.x, y2: end.y, stroke: on ? c.accent : c.muted, strokeWidth: on ? sw * 1.5 : sw, markerEnd: l.arrow ? 'url(#board-arrow)' : undefined}),
            h('line', {'data-board-link': l.id, 'data-testid': 'board-link', x1: ca.x, y1: ca.y, x2: end.x, y2: end.y, stroke: 'transparent', strokeWidth: 14 / Math.max(0.3, view.z), style: {pointerEvents: 'stroke', cursor: 'pointer'},
              onPointerDown: (e: any) => {e.stopPropagation(); setSel([]); setSelLink({from: l.from, to: l.to});}}),
            l.label ? h('text', {x: (ca.x + end.x) / 2, y: (ca.y + end.y) / 2 - 6 / view.z, fill: c.text, fontSize: 13 / Math.max(0.6, view.z), textAnchor: 'middle', style: {paintOrder: 'stroke', stroke: c.bg, strokeWidth: 4 / Math.max(0.6, view.z)}}, l.label) : null);}),
        ink ? h('path', {d: ink.map((q, i) => (i ? 'L' : 'M') + q.x + ' ' + q.y).join(' '), fill: 'none', stroke: c.accent, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round'}) : null),
      // 08/11/2026 (Pedro: "o ponto central da pagina pra nao se perder no infinito"): eixos discretos e o 0 no centro
      h('div', {key: 'ox', 'aria-hidden': true, style: {position: 'absolute', left: 0, top: -100000, width: 1 / view.z, height: 200000, background: c.line, opacity: 0.9, pointerEvents: 'none'}}),
      h('div', {key: 'oy', 'aria-hidden': true, style: {position: 'absolute', top: 0, left: -100000, height: 1 / view.z, width: 200000, background: c.line, opacity: 0.9, pointerEvents: 'none'}}),
      h('div', {key: 'o0', 'data-testid': 'board-origin', 'aria-hidden': true, style: {position: 'absolute', left: 8 / view.z, top: 6 / view.z, color: c.muted, fontSize: 18 / view.z, fontWeight: 600, pointerEvents: 'none', userSelect: 'none'}}, '0'),
      guides.x != null ? h('div', {'data-testid': 'board-guide', style: {position: 'absolute', left: guides.x, top: -100000, width: 1 / view.z, height: 200000, background: c.accent, pointerEvents: 'none', zIndex: 2000000}}) : null,
      guides.y != null ? h('div', {'data-testid': 'board-guide', style: {position: 'absolute', top: guides.y, left: -100000, height: 1 / view.z, width: 200000, background: c.accent, pointerEvents: 'none', zIndex: 2000000}}) : null,
      ...vis.map(b => <BoardItem key={b.id} b={b} g={geo(b)} api={p.api} pageId={p.pageId} pages={p.pages} selected={sel.includes(b.id)} editing={editing === b.id} light={light} zoom={view.z} locked={p.locked}
        onDown={onItemDown(b)} onOpen={() => openItem(b)} onResize={(corner: string) => onResize(b, corner)} single={sel.length === 1 && sel[0] === b.id} onMention={(m: Mention) => {if (m.kind === 'page') {const t = p.pages.find(x => x.id === m.id); if (t) p.onOpenPage(t);}}}
        onChange={(f: (x: PageBlock) => PageBlock) => patchBlock(b.id, f, 'board-text-' + b.id)} onDone={() => {setEditing(null); p.flush(); if (b.type === 'page_link' && b.data?.page_id) p.onPageChanged?.(String(b.data.page_id));}} />),
      box ? h('div', {style: {position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, border: '1px solid ' + c.accent, background: c.accent + '22', pointerEvents: 'none'}}) : null),
    !shown.length ? h('div', {'data-board-ui': '1', style: {position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: c.muted, fontSize: 14, lineHeight: 1.6, pointerEvents: 'none'}},
      h('div', {style: {fontSize: 18, fontWeight: 700, color: c.text, marginBottom: 6}}, 'Quadro vazio'), 'Solte fotos e arquivos aqui, cole qualquer coisa (Ctrl+V)', h('br'), 'ou dê dois cliques no fundo para escrever uma nota.') : null,
    selBar,
    h('input', {'data-board-ui': '1', 'data-testid': 'board-title', value: p.title, placeholder: 'Sem título', 'aria-label': 'Título do quadro', onPointerDown: (e: any) => e.stopPropagation(), onChange: (e: any) => p.onTitle(e.target.value),
      onKeyDown: (e: any) => {if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();},
      style: {userSelect: 'text', WebkitUserSelect: 'text', position: 'absolute', left: 16, top: 12, zIndex: 30, width: 'min(420px, 50%)', height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid transparent', background: c.bg + 'cc', color: c.text, fontSize: 20, fontWeight: 700, outline: 'none', fontFamily: 'inherit'},
      onFocus: (e: any) => {e.target.style.borderColor = c.accent;}, onBlur: (e: any) => {e.target.style.borderColor = 'transparent'; p.flush();}}),
    bar([btn('T', 'Texto', () => {const nb = addBlock({id: uid(), type: 'text', text: '', data: {}}); setEditing(nb.id);}, false, false, 'board-add-text'),
      btn('edit', mode === 'draw' ? 'Parar de desenhar' : 'Desenhar', () => setMode(mode === 'draw' ? '' : 'draw'), mode === 'draw', false, 'board-draw'),
      btn('clip', 'Arquivo (foto, vídeo, PDF, qualquer um)', () => {anchor.current = center(); p.pickFiles();}, false, false, 'board-add-file'),
      btn('note', 'Nota', () => {const nb = addBlock({id: uid(), type: 'callout', text: '', html: '', data: {}}); setEditing(nb.id);}, false, false, 'board-add-note'),
      btn('checkSquare', 'Lista', () => {const nb = addBlock({id: uid(), type: 'todo', text: '', data: {items: [{id: uid(), text: '', done: false}]}}); setEditing(nb.id);}, false, false, 'board-add-list'),
      btn('mic', rec ? 'Parar e guardar o áudio' : 'Gravar áudio', () => void toggleRec(), !!rec, false, 'board-rec'),
      btn('fileDoc', 'Documento Word', () => {anchor.current = center(); p.createDoc();}, false, false, 'board-add-doc'),
      btn('book', 'Página existente (entra como cópia)', () => setPicker(true), picker, false, 'board-add-page'),
      btn('grid', 'Do app: Agenda, Tarefas, Notas, Lembretes, Listas, Price Tracker, E-mails, Biblioteca', () => setLivePick(true), livePick, false, 'board-add-live')], {left: '50%', bottom: 20, transform: 'translateX(-50%)', height: 54}, 'Inserir no quadro'),
    bar([btn('zoomOut', 'Afastar', () => zoomBy(1 / 1.25)), h('button', {key: 'pct', type: 'button', title: 'Voltar para 100%', onClick: () => zoomBy(1 / view.z), 'data-testid': 'board-zoom',
      style: {minWidth: 52, height: 34, border: 0, background: 'transparent', color: c.text, fontSize: 13, fontWeight: 600, cursor: 'pointer'}}, Math.round(view.z * 100) + '%'), btn('zoomIn', 'Aproximar', () => zoomBy(1.25)), btn('home', 'Voltar ao centro (0)', () => setView(v => ({...v, x: size2.w / 2, y: size2.h / 2})), false, false, 'board-center'), btn('expand', 'Ver tudo', fitAll), btn('search', 'Buscar no quadro (Ctrl+F)', () => setFind(f => f ? null : {q: '', i: 0}), !!find, false, 'board-find-open')],
      {left: 16, bottom: 20, height: 46}, 'Zoom do quadro'),
    rec ? h('div', {'data-board-ui': '1', style: {position: 'absolute', left: '50%', bottom: 84, transform: 'translateX(-50%)', padding: '6px 12px', borderRadius: 10, background: c.dangerBg, color: c.danger, fontSize: 12, fontWeight: 600}}, '● Gravando… clique no microfone para parar') : null,
    selLink ? (() => {const l = links.find(x => x.from === selLink.from && x.to === selLink.to); if (!l) return null; const mx = ((l.a.x + l.a.w / 2) + (l.b.x + l.b.w / 2)) / 2 * view.z + view.x, my = ((l.a.y + l.a.h / 2) + (l.b.y + l.b.h / 2)) / 2 * view.z + view.y;
      return h('div', {'data-board-ui': '1', 'data-testid': 'board-link-bar', onPointerDown: (e: any) => e.stopPropagation(), style: {position: 'absolute', left: Math.max(8, Math.min(size2.w - 360, mx - 170)), top: Math.max(8, Math.min(size2.h - 120, my + 14)), zIndex: 40, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 12, background: c.surface, border: '1px solid ' + c.line, boxShadow: '0 10px 24px rgba(0,0,0,.3)'}},
        h('input', {key: l.id, defaultValue: l.label, placeholder: 'Texto na ligação', 'aria-label': 'Texto na ligação', 'data-testid': 'board-link-label', onKeyDown: (e: any) => {if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setSelLink(null);},
          onBlur: (e: any) => {const v = String(e.target.value || '').slice(0, 120); if (v !== l.label) patchLink(l.from, l.to, o => ({...o, label: v || undefined}));}, style: {width: 170, height: 32, borderRadius: 8, border: '1px solid ' + c.line, background: c.input, color: c.text, padding: '0 8px', fontSize: 13, outline: 'none'}}),
        btn('arrowRight', l.arrow ? 'Tirar a seta' : 'Pôr seta', () => patchLink(l.from, l.to, o => ({...o, arrow: !o.arrow})), l.arrow, false, 'board-link-arrow'),
        btn('trash', 'Apagar a ligação', () => {patchLink(l.from, l.to, null); setSelLink(null);}, false, true));})() : null,
    capEdit && byId.get(capEdit) ? (() => {const b = byId.get(capEdit)!, g = geo(b); return h('input', {'data-board-ui': '1', 'data-testid': 'board-caption-input', autoFocus: true, defaultValue: g.caption || '', placeholder: 'Legenda', 'aria-label': 'Legenda do item',
      onPointerDown: (e: any) => e.stopPropagation(), onKeyDown: (e: any) => {if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();},
      onBlur: (e: any) => {const v = String(e.target.value || '').trim().slice(0, 300); patchGeo([b.id], x => ({...x, caption: v || undefined}), 'board-caption'); setCapEdit(null); p.flush();},
      style: {position: 'absolute', left: g.x * view.z + view.x, top: (g.y + g.h) * view.z + view.y + 6, width: Math.max(180, g.w * view.z), height: 32, zIndex: 40, borderRadius: 8, border: '1px solid ' + c.accent, background: c.surface, color: c.text, padding: '0 8px', fontSize: 13, outline: 'none'}});})() : null,
    mention && mention.mode === 'page' ? <PagePicker pages={p.pages} exclude={p.pageId} title="Mencionar uma página" hint="A menção fica embaixo do item; clicar nela abre a página." extra={{label: 'Mencionar um item do app em vez disso', run: () => setMention({...mention, mode: 'app'})}}
      onClose={() => setMention(null)} onPick={(pg: Entity) => {const id = mention.id; setMention(null); patchGeo([id], g => ({...g, mentions: [...(g.mentions || []).filter(m => m.id !== pg.id), {kind: 'page', id: pg.id, title: pg.title || 'Sem título'}]}), 'board-mention'); p.flush();}} /> : null,
    mention && mention.mode === 'app' ? <LivePicker api={p.api} onClose={() => setMention(null)} onPick={(x: LiveItem) => {const id = mention.id; setMention(null); patchGeo([id], g => ({...g, mentions: [...(g.mentions || []).filter(m => m.id !== x.id), {kind: x.kind, id: x.id, title: liveText(x).slice(0, 120)}]}), 'board-mention'); p.flush();}} /> : null,
    mailAtt && byId.get(mailAtt.card) ? (() => {const g = geo(byId.get(mailAtt.card)!), left = Math.max(8, Math.min(size2.w - 380, (g.x + g.w) * view.z + view.x + 14)), top = Math.max(8, Math.min(size2.h - 260, g.y * view.z + view.y));
      const take = async (it: {part: string; name: string; mime: string; bytes: number}) => {if (p.locked) {fail('Arquivos ainda não entram em páginas trancadas.'); return;} setMailAtt(m => m ? {...m, busy: it.part, err: ''} : m);
        try {const a = await track('anexo-email-trazer', () => p.api.mailAttachmentToPage(mailAtt.hit, p.pageId, it.part), {file: {name: it.name, size: it.bytes}}); const k = fileKind(a.mime, a.name), nb = addBlock({id: uid(), type: 'file', text: '', data: {attachment_id: a.id, name: a.name, mime: a.mime, size: a.bytes, view: defaultView(k)}}, {x: g.x + g.w + 200, y: g.y + 80});
          patchGeo([mailAtt.card], x => ({...x, links: [...(x.links || []), {to: nb.id, arrow: true}]}), 'board-link'); setMailAtt(m => m ? {...m, busy: ''} : m); p.flush();}
        catch (e: any) {setMailAtt(m => m ? {...m, busy: '', err: String(e?.message || 'Não deu para trazer o anexo.')} : m);}};
      return h('div', {'data-board-ui': '1', 'data-testid': 'board-mail-att-box', onPointerDown: (e: any) => e.stopPropagation(), style: {position: 'absolute', left, top, zIndex: 40, width: 360, maxHeight: 300, overflow: 'auto', padding: 12, borderRadius: 14, background: c.surface, border: '1px solid ' + c.line, boxShadow: '0 16px 40px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', gap: 6}},
        h('div', {style: {display: 'flex', alignItems: 'center'}}, h('span', {style: {flex: 1, color: c.text, fontSize: 13, fontWeight: 700}}, 'Anexos do e-mail'), btn('close', 'Fechar', () => setMailAtt(null))),
        mailAtt.err ? h('span', {style: {color: c.danger, fontSize: 12}}, mailAtt.err) : !mailAtt.items ? h('span', {style: {color: c.muted, fontSize: 12}}, 'Buscando no e-mail…') : !mailAtt.items.length ? h('span', {style: {color: c.muted, fontSize: 12}}, 'Este e-mail não tem anexos.') : null,
        ...(mailAtt.items || []).map(it => h('button', {key: it.part, type: 'button', disabled: !!mailAtt.busy, onClick: () => void take(it), style: {display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '8px 10px', borderRadius: 10, border: '1px solid ' + c.line, background: 'transparent', color: c.text, cursor: 'pointer'}},
          <Icon name={((KIND as any)[fileKind(it.mime, it.name)] || KIND.other).icon} size={16} color={((KIND as any)[fileKind(it.mime, it.name)] || KIND.other).color} />,
          h('span', {style: {flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}, it.name), h('span', {style: {color: c.muted, fontSize: 11}}, mailAtt.busy === it.part ? 'trazendo…' : sizeLabel(it.bytes) + ' · trazer'))));})() : null,
    livePick ? <LivePicker api={p.api} onClose={() => setLivePick(false)} onPick={(x: LiveItem) => {setLivePick(false); addBlock({id: uid(), type: 'bookmark', text: liveText(x).slice(0, 12000), data: {live: {kind: x.kind as LiveKind, id: x.id}}});}} /> : null,
    ask && sel.length ? (() => {const gs = sel.map(id => byId.get(id)).filter(Boolean).map(b => geo(b!)), x2 = Math.max(...gs.map(g => g.x + g.w)), y1 = Math.min(...gs.map(g => g.y));
      const left = Math.max(8, Math.min(size2.w - 440, x2 * view.z + view.x + 16)), top = Math.max(8, Math.min(size2.h - 200, y1 * view.z + view.y));
      const go = async () => {if (!ask.q.trim() || ask.busy) return; setAsk({...ask, busy: true, err: ''}); const chosen = sel.map(id => byId.get(id)).filter(Boolean) as PageBlock[];
        try {const reply = await track('pedir-sofia', () => askSofiaAbout(p.api, p.title, ask.q, chosen.map(textOf).filter(Boolean).join('\n\n').slice(0, 8000)), {n: chosen.length}); const html = mdToHtml(reply);
          addBlock({id: uid(), type: 'callout', text: reply.slice(0, 12000), html: html.length < 24000 ? html : '', data: {}}, {x: x2 + 180, y: y1 + 90}); setAsk(null); p.flush();}
        catch (e: any) {setAsk(a => a ? {...a, busy: false, err: String(e?.message || 'A Sofia não respondeu.')} : a);}};
      return h('div', {'data-board-ui': '1', 'data-testid': 'board-ask-box', onPointerDown: (e: any) => e.stopPropagation(), style: {position: 'absolute', left, top, zIndex: 40, width: 420, padding: 12, borderRadius: 14, background: c.surface, border: '1px solid ' + c.accent, boxShadow: '0 16px 40px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', gap: 8}},
        h('div', {style: {color: c.text, fontSize: 13, fontWeight: 700}}, 'Pedir à Sofia sobre ' + (sel.length > 1 ? sel.length + ' itens' : 'este item')),
        h('input', {autoFocus: true, value: ask.q, disabled: ask.busy, placeholder: 'Ex.: resume, organiza por cena, vira tarefas…', 'aria-label': 'Pedido para a Sofia', onChange: (e: any) => setAsk({...ask, q: e.target.value}), onKeyDown: (e: any) => {if (e.key === 'Enter') void go(); if (e.key === 'Escape') setAsk(null);},
          style: {height: 38, borderRadius: 9, border: '1px solid ' + c.line, background: c.input, color: c.text, padding: '0 10px', fontSize: 14, outline: 'none'}}),
        h('div', {style: {display: 'flex', alignItems: 'center', gap: 8}}, h('span', {style: {flex: 1, color: ask.err ? c.danger : c.muted, fontSize: 12}}, ask.err || (ask.busy ? 'A Sofia está pensando… a resposta entra como nota ao lado.' : 'A resposta entra como uma nota ao lado.')),
          h('button', {type: 'button', onClick: () => setAsk(null), style: {height: 32, padding: '0 10px', border: 0, borderRadius: 8, background: 'transparent', color: c.muted, cursor: 'pointer'}}, 'Cancelar'),
          h('button', {type: 'button', 'data-testid': 'board-ask-go', disabled: ask.busy || !ask.q.trim(), onClick: () => void go(), style: {height: 32, padding: '0 12px', border: 0, borderRadius: 8, background: c.accent, color: c.onAccent, fontWeight: 700, cursor: 'pointer', opacity: ask.busy || !ask.q.trim() ? 0.6 : 1}}, ask.busy ? 'Pedindo…' : 'Pedir')));})() : null,
    find ? (() => {const q = find.q.trim().toLowerCase(), hits = q ? shown.filter(b => (textOf(b) + ' ' + String(b.data?.name || '')).toLowerCase().includes(q)) : [];
      const jump = (i: number) => {const b = hits[(i + hits.length) % hits.length]; if (!b) return; setFind({...find, i: (i + hits.length) % hits.length}); setSel([b.id]); focusOn(geo(b));};
      return h('div', {'data-board-ui': '1', 'data-testid': 'board-find', onPointerDown: (e: any) => e.stopPropagation(), style: {position: 'absolute', right: 16, top: 12, zIndex: 35, display: 'flex', alignItems: 'center', gap: 6, padding: 6, borderRadius: 12, background: c.surface, border: '1px solid ' + c.line, boxShadow: '0 10px 24px rgba(0,0,0,.28)'}},
        h('input', {autoFocus: true, value: find.q, placeholder: 'Buscar no quadro', 'aria-label': 'Buscar no quadro', 'data-testid': 'board-find-input', onChange: (e: any) => setFind({q: e.target.value, i: 0}),
          onKeyDown: (e: any) => {if (e.key === 'Enter') {e.preventDefault(); jump(e.shiftKey ? find.i - 1 : (sel.length && hits[find.i]?.id === sel[0] ? find.i + 1 : find.i));} if (e.key === 'Escape') {setFind(null); host.current?.focus();}},
          style: {width: 220, height: 34, borderRadius: 8, border: '1px solid ' + c.line, background: c.input, color: c.text, padding: '0 10px', fontSize: 13, outline: 'none'}}),
        h('span', {style: {color: c.muted, fontSize: 12, minWidth: 54, textAlign: 'center'}}, q ? (hits.length ? (find.i + 1) + ' de ' + hits.length : 'nada') : ''),
        btn('close', 'Fechar a busca', () => setFind(null)));})() : null,
    picker ? <PagePicker pages={p.pages} exclude={p.pageId} onClose={() => setPicker(false)} onPick={async src => {setPicker(false); try {const copy = await track('copiar-pagina', () => p.copyPage(src)); addBlock({id: uid(), type: 'page_link', text: '', data: {page_id: copy.id, copy_id: copy.id, source_id: src.id, synced: false}});} catch (e: any) {fail(String(e?.message || 'Não deu para trazer a página.'));}}} /> : null);
}

function BoardItem({b, g, api, pageId, pages, selected, editing, light, zoom, locked, single, onDown, onOpen, onResize, onChange, onDone, onMention}: any) {
  const c = useTheme(), k = b.type === 'file' ? fileKind(b.data?.mime, b.data?.name) : b.type === 'image' ? 'image' : 'other';
  const preview = b.type === 'file' && (b.data?.view || defaultView(k)) === 'preview';
  let body: any;
  if (b.type === 'callout' || b.type === 'text' || String(b.type).startsWith('heading') || b.type === 'bullet' || b.type === 'number' || b.type === 'quote' || b.type === 'code')
    body = <TextCard b={b} g={g} editing={editing} onChange={onChange} onDone={onDone} />;
  else if (b.type === 'todo') body = <ListCard b={b} editing={editing} onChange={onChange} />;
  else if (b.type === 'image' && b.data?.drawing) {const d = b.data.drawing; body = h('svg', {width: '100%', height: '100%', viewBox: '0 0 ' + d.w + ' ' + d.h, preserveAspectRatio: 'none', 'aria-label': 'Desenho'}, h('path', {d: d.d, fill: 'none', stroke: d.color || c.accent, strokeWidth: d.width || 3, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke'}));}
  else if (b.type === 'image') body = b.data?.attachment_id ? (light ? h('div', {style: {width: '100%', height: '100%', background: c.input}}) : h('div', {style: {width: '100%', height: '100%', overflow: 'hidden', borderRadius: 6}}, <InlineMedia api={api} id={String(b.data.attachment_id)} kind="image" name={String(b.data?.caption || 'imagem')} />)) : <Loading c={c} label="Enviando…" />;
  else if (b.type === 'file') {
    if (b.data?.uploading || !b.data?.attachment_id) body = <Loading c={c} label={'Enviando ' + (b.data?.name || 'arquivo') + '…'} />;
    else if (editing && editKind(b.data?.mime, b.data?.name) && !locked) body = h('div', {'data-board-editing': '1', style: {width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: c.surface, borderRadius: 8, overflow: 'hidden'}, onPointerDown: (e: any) => e.stopPropagation()},
      h('div', {style: {display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid ' + c.line, fontSize: 12, color: c.muted}}, h('span', {style: {flex: 1}}, 'Editando ' + (b.data?.name || '')), h('button', {type: 'button', onClick: onDone, style: {border: 0, background: c.accent, color: c.onAccent, borderRadius: 7, padding: '4px 10px', fontWeight: 700, cursor: 'pointer'}}, 'Pronto')),
      h('div', {style: {flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column'}}, <FileBody api={api} id={String(b.data.attachment_id)} firstId={String(b.data.attachment_id)} name={String(b.data?.name || '')} mime={String(b.data?.mime || '')} zoom={0} onZoom={() => {}} pageId={pageId}
        onSaved={(a: any) => onChange((x: PageBlock) => ({...x, data: {...(x.data || {}), attachment_id: a.id, name: a.name, mime: a.mime, size: a.bytes}}))} />));
    else if (preview && !light) body = h('div', {style: {width: '100%', height: '100%', overflow: 'hidden', borderRadius: 8, background: k === 'audio' ? c.surface : '#000', display: 'flex', alignItems: 'center'}},
      h('div', {style: {width: '100%', height: k === 'audio' ? 'auto' : '100%', pointerEvents: selected ? 'auto' : 'none'}, className: 'board-media'}, <InlineMedia api={api} id={String(b.data.attachment_id)} kind={k} name={String(b.data?.name || '')} />));
    else {const meta = (KIND as any)[k] || KIND.other; body = h('div', {style: {width: '100%', height: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', boxSizing: 'border-box', background: c.surface, border: '1px solid ' + c.line, borderRadius: 12, overflow: 'hidden'}},
      h('div', {style: {width: 34, height: 34, flexShrink: 0, borderRadius: 8, background: meta.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center'}}, <Icon name={meta.icon} size={18} color={meta.color} />),
      h('div', {style: {minWidth: 0, flex: 1}}, h('div', {style: {color: c.text, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, b.data?.name || 'Arquivo'),
        h('div', {style: {color: c.muted, fontSize: 11}}, [String(b.data?.name || '').split('.').pop()?.toUpperCase(), sizeLabel(b.data?.size), editKind(b.data?.mime, b.data?.name) ? 'editável' : ''].filter(Boolean).join(' · '))));}
  }
  else if (b.type === 'page_link') body = <PageCard b={b} g={g} pages={pages} editing={editing} light={zoom < 0.15} onDone={onDone} />;
  else if (b.type === 'bookmark' && b.data?.link) {const L = b.data.link; body = h('div', {style: {width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'hidden', borderRadius: 12, background: c.surface, border: '1px solid ' + c.line, display: 'flex', flexDirection: 'column'}},
    L.image && !light ? h('div', {style: {flex: 1, minHeight: 0, backgroundColor: c.input, backgroundImage: 'url("' + String(L.image).replace(/["\\)]/g, '') + '")', backgroundSize: 'cover', backgroundPosition: 'center'}}) : null,
    h('div', {style: {padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 3}}, h('span', {style: {color: c.text, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}, L.title || L.url),
      h('span', {style: {color: c.muted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}, (L.site || (() => {try {return new URL(L.url).hostname;} catch {return '';}})()) + ' · dois cliques abre')));}
  else if (b.type === 'bookmark' && b.data?.live) body = <LiveCard api={api} kind={b.data.live.kind} id={String(b.data.live.id)} text={String(b.text || '')} />;
  else body = h('div', {style: {padding: 12, background: c.surface, border: '1px solid ' + c.line, borderRadius: 12, color: c.muted, fontSize: 12, width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'hidden'}}, String(b.text || b.type));
  const handle = (corner: string, css: any) => h('div', {key: corner, onPointerDown: onResize(corner), 'aria-label': 'Mudar o tamanho', style: {position: 'absolute', width: 14 / zoom, height: 14 / zoom, borderRadius: 4 / zoom, background: c.surface, border: (2 / zoom) + 'px solid ' + c.accent, cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize', zIndex: 3, ...css}});
  const o = -7 / zoom;
  return h('div', {'data-board-item': '1', 'data-testid': 'board-item', 'data-type': b.type, 'aria-label': String(b.data?.name || b.text || b.type).slice(0, 80), onPointerDown: onDown, onDoubleClick: (e: any) => {e.stopPropagation(); onOpen();},
    style: {position: 'absolute', left: g.x, top: g.y, width: g.w, height: g.h, zIndex: selected || editing ? 1000000 : g.z || 0, outline: selected ? (2 / zoom) + 'px solid ' + c.accent : 'none', outlineOffset: 3 / zoom, borderRadius: 10, cursor: editing ? 'auto' : 'grab', userSelect: editing ? 'text' : 'none'}},
    body,
    g.caption || (g.mentions || []).length ? h('div', {style: {position: 'absolute', left: 0, top: '100%', marginTop: 6, width: '100%', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', pointerEvents: 'auto'}},
      g.caption ? h('span', {'data-testid': 'board-caption-text', style: {color: c.muted, fontSize: 12, width: '100%', lineHeight: 1.4}}, g.caption) : null,
      ...(g.mentions || []).map((m: Mention) => h('button', {key: m.kind + m.id, type: 'button', 'data-testid': 'board-mention-chip', title: m.kind === 'page' ? 'Abrir a página' : m.title, onPointerDown: (e: any) => e.stopPropagation(), onClick: (e: any) => {e.stopPropagation(); onMention(m);},
        style: {border: 0, borderRadius: 6, padding: '2px 7px', background: c.accentSoft, color: c.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}, '@' + m.title))) : null,
    single && !editing ? [handle('nw', {left: o, top: o}), handle('ne', {right: o, top: o}), handle('sw', {left: o, bottom: o}), handle('se', {right: o, bottom: o})] : null);
}

function Loading({c, label}: any) {return h('div', {style: {width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.input, borderRadius: 10, color: c.muted, fontSize: 12, padding: 8, boxSizing: 'border-box', textAlign: 'center'}}, label);}

function TextCard({b, g, editing, onChange, onDone}: any) {
  const c = useTheme(), ref = useRef<HTMLDivElement | null>(null), note = b.type === 'callout', head = String(b.type).startsWith('heading');
  useEffect(() => {const el = ref.current; if (!el) return; if (editing) {el.innerHTML = b.html || String(b.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>'); el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r);}}, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {const el = ref.current; if (!el) return; const html = sanitizeRich(el.innerHTML), text = plainOf(html).slice(0, 12000); onChange((x: PageBlock) => ({...x, text, html: html.length < 24000 ? html : ''}));};
  const style: any = {width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'auto', padding: note ? 14 : 6, borderRadius: note ? 12 : 6, background: note ? (g.color || NOTE_COLORS[0]) : 'transparent', border: note ? '1px solid ' + c.line : 0,
    color: c.text, fontSize: head ? 28 : note ? 14 : 18, fontWeight: head ? 700 : 400, lineHeight: 1.45, outline: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word'};
  if (editing) return h('div', {key: 'edit', ref, 'data-board-editing': '1', contentEditable: true, suppressContentEditableWarning: true, role: 'textbox', 'aria-multiline': true, 'aria-label': note ? 'Nota' : 'Texto', onBlur: () => {save(); onDone();}, onInput: save, onPointerDown: (e: any) => e.stopPropagation(), style: {...style, userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text', boxShadow: '0 0 0 2px ' + c.accent}});
  const empty = !String(b.text || '').trim();
  return h('div', {key: 'view', style}, empty ? h('span', {style: {color: c.muted}}, note ? 'Nota vazia — dois cliques para escrever' : 'Texto — dois cliques para escrever') : b.html ? h('div', {dangerouslySetInnerHTML: {__html: sanitizeRich(b.html)}}) : String(b.text || ''));
}

function ListCard({b, editing, onChange}: any) {
  const c = useTheme(), items: {id: string; text: string; done: boolean}[] = Array.isArray(b.data?.items) ? b.data.items : [{id: 'a', text: String(b.text || ''), done: !!b.checked}];
  const set = (next: typeof items) => onChange((x: PageBlock) => ({...x, text: next.map(i => i.text).join('\n').slice(0, 12000), checked: next.length > 0 && next.every(i => i.done), data: {...(x.data || {}), items: next}}));
  return h('div', {'data-board-editing': editing ? '1' : undefined, onPointerDown: editing ? (e: any) => e.stopPropagation() : undefined, style: {width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'auto', padding: 12, borderRadius: 12, background: c.surface, border: '1px solid ' + c.line, display: 'flex', flexDirection: 'column', gap: 6}},
    ...items.map((it, i) => h('label', {key: it.id, style: {display: 'flex', alignItems: 'center', gap: 8, color: c.text, fontSize: 14}},
      h('input', {type: 'checkbox', checked: it.done, onPointerDown: (e: any) => e.stopPropagation(), onChange: () => set(items.map(x => x.id === it.id ? {...x, done: !x.done} : x)), style: {width: 16, height: 16, accentColor: c.accent}}),
      editing ? h('input', {value: it.text, autoFocus: i === items.length - 1, placeholder: 'Item', 'aria-label': 'Item da lista', onChange: (e: any) => set(items.map(x => x.id === it.id ? {...x, text: e.target.value} : x)),
        onKeyDown: (e: any) => {if (e.key === 'Enter') {e.preventDefault(); const next = items.slice(); next.splice(i + 1, 0, {id: uid(), text: '', done: false}); set(next);} else if (e.key === 'Backspace' && !it.text && items.length > 1) {e.preventDefault(); set(items.filter(x => x.id !== it.id));}},
        style: {flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: c.text, fontSize: 14, textDecoration: it.done ? 'line-through' : 'none'}})
        : h('span', {style: {flex: 1, textDecoration: it.done ? 'line-through' : 'none', color: it.done ? c.muted : c.text}}, it.text || h('span', {style: {color: c.muted}}, 'Item')))));
}

// 08/11/2026 (Pedro: "como se fosse o iframe dessas paginas: abro os arquivos que tem ali dentro, edito, e com o zoom do quadro
// tenho uma visao ampla de varias coisas"): o cartao mostra a PAGINA DE VERDADE (o proprio site em /paginas/<id>?embed=1, sem
// barras), desenhada como no computador (1100 px de largura) e reduzida ao tamanho do cartao; o zoom do quadro aproxima.
// Parado: so olha (o quadro move e seleciona). Dois cliques: entra na pagina (abrir PDF/Word, editar, tudo da pagina).
// Muito afastado (zoom < 15%) ou pagina trancada: so o resumo em texto (leve).
const PAGE_VIRTUAL_W = 1100;
function PageCard({b, g, pages, editing, light, onDone}: {b: PageBlock; g: Geo; pages: Entity[]; editing: boolean; light: boolean; onDone: () => void}) {
  const c = useTheme(), id = String(b.data?.page_id || ''), t = pages.find(x => x.id === id), synced = !!b.data?.synced, copy = !!b.data?.source_id && !synced, [loaded, setLoaded] = useState(false);
  let lines: string[] = [];
  if (t) {try {const bs = JSON.parse(String(t.data?.blocks_json || '[]')); lines = (Array.isArray(bs) ? bs : []).map((x: any) => String(x.text || x.data?.name || '').trim()).filter(Boolean).slice(0, 10);} catch {}}
  const lockedPage = !!t?.data?.lock_json, live = !!t && !lockedPage && (!light || editing), head = 40, s = Math.max(0.05, g.w / PAGE_VIRTUAL_W);
  useEffect(() => {if (!live) setLoaded(false);}, [live]);
  useEffect(() => {if (!editing) return; const on = (e: KeyboardEvent) => {if (e.key === 'Escape') onDone();}; window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);}, [editing, onDone]);
  return h('div', {'data-board-editing': editing ? '1' : undefined, style: {width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'hidden', borderRadius: 12, background: c.bg, border: '1px solid ' + (editing ? c.accent : c.line), display: 'flex', flexDirection: 'column', position: 'relative'}},
    h('div', {style: {height: head, flexShrink: 0, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderBottom: '1px solid ' + c.line, background: c.surface}}, <Icon name="book" size={15} color={c.accent} />,
      h('span', {style: {flex: 1, minWidth: 0, color: c.text, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, t ? (t.title || 'Sem título') : 'Página removida'),
      synced ? h('span', {style: {fontSize: 11, fontWeight: 700, color: c.good}}, 'Sincronizada') : copy ? h('span', {style: {fontSize: 11, fontWeight: 700, color: c.muted}}, 'Cópia') : null,
      editing ? h('button', {type: 'button', 'data-testid': 'board-page-done', onPointerDown: (e: any) => e.stopPropagation(), onClick: (e: any) => {e.stopPropagation(); onDone();}, style: {border: 0, borderRadius: 7, padding: '4px 10px', background: c.accent, color: c.onAccent, fontWeight: 700, fontSize: 12, cursor: 'pointer'}}, 'Pronto') : null),
    h('div', {style: {flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden'}},
      !loaded || !live ? h('div', {style: {position: 'absolute', inset: 0, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden'}},
        lockedPage ? h('span', {style: {color: c.muted, fontSize: 12}}, 'Página trancada — dois cliques abre com a senha') : lines.length ? lines.map((l, i) => h('span', {key: i, style: {color: c.text, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, l)) : h('span', {style: {color: c.muted, fontSize: 12}}, live ? 'Abrindo a página…' : 'Página vazia')) : null,
      live ? h('iframe', {key: id, src: '/paginas/' + encodeURIComponent(id) + '?embed=1', title: 'Página ' + (t?.title || ''), 'data-testid': 'board-page-frame', onLoad: () => setLoaded(true),
        style: {position: 'absolute', left: 0, top: 0, border: 0, width: PAGE_VIRTUAL_W, height: Math.max(200, (g.h - head) / s), transform: 'scale(' + s + ')', transformOrigin: '0 0', opacity: loaded ? 1 : 0, pointerEvents: editing ? 'auto' : 'none', background: c.bg}}) : null),
    !editing && live ? h('div', {style: {position: 'absolute', right: 10, bottom: 8, padding: '2px 8px', borderRadius: 6, background: c.surface + 'e6', color: c.muted, fontSize: 11, pointerEvents: 'none'}}, 'Dois cliques: usar a página aqui') : null);
}

// 08/11/2026 (Pedro: "essa janela esta bem zuada, pode estar mais proxima disso" - a lista de Paginas da barra lateral):
// a mesma arvore (espacos e subpaginas, icone, setinha para abrir/fechar, cadeado nas trancadas); buscando, vira lista com o caminho.
const isEmojiIcon = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 8 && !/^[a-z0-9_-]+$/i.test(v);
function PagePicker({pages, exclude, onPick, onClose, title = 'Trazer página para o quadro', hint = 'Entra como uma cópia independente (mexer nela não muda a original). Se quiser, depois é só clicar em sincronizar.', extra}: {pages: Entity[]; exclude: string; onPick: (p: Entity) => void; onClose: () => void; title?: string; hint?: string; extra?: {label: string; run: () => void}}) {
  const c = useTheme(), [q, setQ] = useState(''), [open, setOpen] = useState<Record<string, boolean>>({}), [hover, setHover] = useState('');
  const live = useMemo(() => pages.filter(x => x.state !== 'archived'), [pages]);
  const byParent = useMemo(() => {const m = new Map<string, Entity[]>(), ids = new Set(live.map(x => x.id)); for (const x of live) {const par = String(x.data?.parent_id || ''), key = ids.has(par) ? par : ''; if (!m.has(key)) m.set(key, []); m.get(key)!.push(x);}
    for (const l of m.values()) l.sort((a, b) => (Number(a.data?.sort_order) || 0) - (Number(b.data?.sort_order) || 0) || String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR')); return m;}, [live]);
  const pathOf = (x: Entity) => {const out: string[] = []; let cur = live.find(y => y.id === String(x.data?.parent_id || '')), guard = 0; while (cur && guard++ < 20) {out.unshift(cur.title || 'Sem título'); cur = live.find(y => y.id === String(cur!.data?.parent_id || ''));} return out.join(' / ');};
  useEffect(() => {const on = (e: KeyboardEvent) => {if (e.key === 'Escape') onClose();}; window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);}, [onClose]);
  const row = (x: Entity, depth: number, sub = ''): any => {const kids = byParent.get(x.id) || [], isOpen = open[x.id] ?? depth === 0, me = x.id === exclude, ic = x.data?.icon;
    return h('div', {key: x.id}, h('div', {role: 'treeitem', 'aria-expanded': kids.length ? isOpen : undefined, 'data-testid': 'picker-row', onMouseEnter: () => setHover(x.id), onMouseLeave: () => setHover(''),
        style: {display: 'flex', alignItems: 'center', gap: 6, height: 36, paddingLeft: 8 + depth * 18, paddingRight: 10, borderRadius: 9, background: hover === x.id && !me ? c.input : 'transparent', opacity: me ? 0.45 : 1}},
      kids.length && !q ? h('button', {type: 'button', 'aria-label': isOpen ? 'Fechar ' + (x.title || '') : 'Abrir ' + (x.title || ''), onClick: () => setOpen(o => ({...o, [x.id]: !isOpen})), style: {width: 20, height: 20, border: 0, padding: 0, background: 'transparent', color: c.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s'}},
        h('svg', {width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, 'aria-hidden': true}, h('path', {d: 'M9 6l6 6-6 6'}))) : h('span', {style: {width: 20, flexShrink: 0}}),
      h('button', {type: 'button', disabled: me, title: me ? 'É este quadro' : undefined, onClick: () => onPick(x), style: {flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, height: '100%', border: 0, padding: 0, background: 'transparent', color: c.text, cursor: me ? 'default' : 'pointer', fontSize: 14, fontFamily: 'inherit', textAlign: 'left'}},
        isEmojiIcon(ic) ? h('span', {style: {width: 20, textAlign: 'center', fontSize: 16, lineHeight: 1}}, String(ic)) : <Icon name="book" size={17} color={c.muted} />,
        h('span', {style: {flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column'}}, h('span', {style: {whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: depth === 0 ? 600 : 500}}, x.title || 'Sem título'),
          sub ? h('span', {style: {color: c.muted, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, sub) : null),
        x.data?.lock_json ? <Icon name="lock" size={13} color={c.warn} /> : null)),
      kids.length && isOpen && !q ? kids.map(k => row(k, depth + 1)) : null);};
  const found = q.trim() ? live.filter(x => String(x.title || '').toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60) : null;
  return h('div', {'data-board-ui': '1', onPointerDown: (e: any) => {e.stopPropagation(); if (e.target === e.currentTarget) onClose();}, style: {position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60}},
    h('div', {role: 'dialog', 'aria-label': title, 'data-testid': 'board-page-picker', style: {width: 560, maxWidth: 'calc(100% - 32px)', maxHeight: '76%', display: 'flex', flexDirection: 'column', gap: 12, padding: 20, boxSizing: 'border-box', borderRadius: 18, background: c.surface, border: '1px solid ' + c.line, boxShadow: '0 24px 60px rgba(0,0,0,.5)'}},
      h('div', {style: {display: 'flex', alignItems: 'center', gap: 8}}, h('div', {style: {flex: 1, color: c.text, fontSize: 18, fontWeight: 700}}, title),
        h('button', {type: 'button', 'aria-label': 'Fechar', onClick: onClose, style: {width: 32, height: 32, border: 0, borderRadius: 8, background: 'transparent', color: c.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'}}, <Icon name="close" size={16} color={c.muted} />)),
      h('div', {style: {color: c.muted, fontSize: 12, lineHeight: 1.5, marginTop: -6}}, hint),
      extra ? h('button', {type: 'button', onClick: extra.run, style: {alignSelf: 'flex-start', border: 0, background: 'transparent', color: c.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit'}}, extra.label) : null,
      h('label', {style: {display: 'flex', alignItems: 'center', gap: 8, height: 42, boxSizing: 'border-box', padding: '0 12px', borderRadius: 10, border: '1px solid ' + c.line, background: c.input}},
        <Icon name="search" size={16} color={c.muted} />,
        h('input', {autoFocus: true, value: q, onChange: (e: any) => setQ(e.target.value), placeholder: 'Buscar página', 'aria-label': 'Buscar página', style: {flex: 1, minWidth: 0, height: 40, border: 0, outline: 'none', background: 'transparent', color: c.text, fontSize: 14, fontFamily: 'inherit', padding: 0}})),
      h('div', {role: 'tree', style: {flex: 1, minHeight: 120, overflowY: 'auto', overscrollBehavior: 'contain', margin: '0 -6px', padding: '0 6px'}},
        found ? (found.length ? found.map(x => row(x, 0, pathOf(x))) : h('div', {style: {color: c.muted, fontSize: 13, padding: 10}}, 'Nenhuma página com esse nome.')) : (byParent.get('') || []).map(x => row(x, 0)))));
}
