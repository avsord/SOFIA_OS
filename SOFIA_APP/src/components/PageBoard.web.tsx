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
import {appAlert} from '../lib/app-alert';
import {Icon, type IconName} from './Icon';
import {FileBody, InlineMedia, fileKind, editKind, openFileWindow, downloadPageFile, sizeLabel, defaultView} from './PageFiles';
import {KIND} from './DrivePreview';
import {sanitizeRich, pasteHtml, pasteContext, escapeHtml} from './PageRichInput';
import {findLinks} from '../lib/leaf-document';
import {parseSofiaClip, clipFromPaste, type SofiaClip} from '../lib/sofia-clipboard';
import {boardDiagInit, note as diag, track} from '../lib/board-diag';
import {LiveCard, LivePicker, askSofiaAbout, mdToHtml, liveText, liveTitleNow, bustLive, type LiveItem, type LiveKind} from './BoardLive.web';

export const BOARD_SUPPORTED = true;
const h = React.createElement as any;
type Link = string | {to: string; label?: string; arrow?: boolean; dash?: boolean};
type Mention = {kind: string; id: string; title: string};
type Geo = {x: number; y: number; w: number; h: number; z?: number; links?: Link[]; color?: string; caption?: string; mentions?: Mention[]};
const linkTo = (l: Link) => typeof l === 'string' ? l : l.to;
const linkObj = (l: Link): {to: string; label?: string; arrow?: boolean; dash?: boolean} => typeof l === 'string' ? {to: l} : l;
/** ponto onde a linha do centro de a ate o centro de b sai do retangulo b (a seta encosta na borda) */
function edgePoint(a: {x: number; y: number}, r: Geo) {const cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = a.x - cx, dy = a.y - cy; if (!dx && !dy) return {x: cx, y: cy}; const k = Math.min(Math.abs((r.w / 2 + 6) / (dx || 1e-9)), Math.abs((r.h / 2 + 6) / (dy || 1e-9))); return {x: cx + dx * Math.min(1, k), y: cy + dy * Math.min(1, k)};}
type View = {x: number; y: number; z: number};
type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'row' | 'col';
// 08/11/2026 (referencia Weje: afasta ate ~1%): o quadro afasta ate 5% para ver mapas grandes inteiros
const MIN_Z = 0.05, MAX_Z = 4;
// 08/11/2026 (Pedro: "imita o quadrado deles, o nosso ficou muito sujo, poluido"): grade de quadrados bem discreta - linha fina a
// cada 24 px e uma um pouco mais marcada a cada 5 quadrados; afastado, so as linhas grandes (sem chuvisco).
function gridBg(v: View, bg: string): any {
  // 08/11/2026 (Pedro: "exatamente essa cor de fundo e exatamente as linhas iguais"): no escuro, as cores medidas na referencia -
  // fundo #252525, linha fina #2A2A2A a cada 22 px (no 100%) e linha marcada #363636 a cada 4 quadrados
  const m = /^#?([0-9a-f]{6})$/i.exec(String(bg || '')), n = m ? parseInt(m[1], 16) : 0, dark = !m || ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) < 128;
  const minor = dark ? '#2a2a2a' : 'rgba(0,0,0,0.05)', major = dark ? '#363636' : 'rgba(0,0,0,0.09)';
  // 08/11/2026 (referencia Weje, grade em niveis): afastando, o quadrado cresce 4x quando ficaria menor que 8 px na tela - a grade
  // nunca vira chuvisco e continua com a mesma cara em qualquer zoom (cores e espessuras da Sofia nao mudam)
  let cell = 22; while (cell * v.z < 8) cell *= 4;
  const S = cell * v.z, B = S * 4, pos = v.x + 'px ' + v.y + 'px', showMinor = S >= 8;
  const layers = ['linear-gradient(to right, ' + major + ' 1px, transparent 1px)', 'linear-gradient(to bottom, ' + major + ' 1px, transparent 1px)'], sizes = [B + 'px ' + B + 'px', B + 'px ' + B + 'px'];
  if (showMinor) {layers.push('linear-gradient(to right, ' + minor + ' 1px, transparent 1px)', 'linear-gradient(to bottom, ' + minor + ' 1px, transparent 1px)'); sizes.push(S + 'px ' + S + 'px', S + 'px ' + S + 'px');}
  return {backgroundColor: dark ? '#252525' : bg, backgroundImage: layers.join(','), backgroundSize: sizes.join(','), backgroundPosition: layers.map(() => pos).join(',')};
}
const NOTE_COLORS = ['#2A2636', '#3A2C1A', '#1D3329', '#1E2A44', '#3B2330'];
// 08/11/2026: arquivo editavel que e "janela" do quadro (aberto da pagina de um cartao, ou grande): o editor fica sempre a mostra.
// Pronto grava window:false e encolhe para anexo.
const isWin = (b: PageBlock) => b.type === 'file' && !!editKind(b.data?.mime, b.data?.name) && b.data?.window !== false && (!!b.data?.window || !!b.data?.from_page || ((b.data?.board?.w || 0) >= 500 && (b.data?.board?.h || 0) >= 500));
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
  if (b.type === 'page_link') return b.data?.view === 'attach' ? {w: 300, h: 64} : b.data?.view === 'list' ? {w: 360, h: 420} : {w: 640, h: 520}; // 08/11: Anexo (linha) ou Visualização (a página) // 08/11/2026: resumo adaptado (ou a pagina inteira)
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
  pages: Entity[]; onOpenPage: (p: Entity) => void; copyPage: (src: Entity) => Promise<Entity>; copyInto: (copy: Entity, src: Entity) => Promise<void>; pushToOriginal?: (copy: Entity, src: Entity) => Promise<void>;
  title: string; onTitle: (v: string) => void; onPageChanged?: (id: string) => void;
  patchPageBlock?: (pageId: string, blockId: string, f: (b: PageBlock) => PageBlock) => Promise<void>;
  pickFiles: () => void; createDoc: () => void; dropFiles: (files: File[]) => void; pasteClip: (clip: SofiaClip) => void; onError: (m: string) => void;
};

export function PageBoard(p: Props) {
  const c = useTheme(), host = useRef<HTMLDivElement | null>(null), viewKey = 'sofia.board.view.' + p.pageId;
  // 08/11/2026 (Pedro: "a pagina sempre comeca nesse tamanho mais longe"): abre afastado mostrando tudo (ate 60%), nao no ultimo zoom
  const [view, setView] = useState<View>({x: 400, y: 300, z: 0.6}), opening = useRef(true);
  const viewRef = useRef(view); viewRef.current = view;
  // 08/11/2026 (Pedro: "quando fico dando zoom tudo fica distorcendo ou mudando de forma"): o zoom e SO escala (transform scale),
  // nunca CSS zoom. O CSS zoom redesenhava tudo em cada nivel (texto quebrava diferente, a pagina/Word dentro das janelas mudava de
  // largura e de resolucao) e a troca scale->zoom ao parar dava outro pulo. Com scale a forma e sempre a mesma; o Chrome redesenha
  // nitido sozinho no tamanho novo (sem will-change, que congelaria a resolucao).
  void viewKey;
  const [sel, setSel] = useState<string[]>([]), [editing, setEditing] = useState<string | null>(null), [live, setLive] = useState<Record<string, Geo>>({});
  const liveRef = useRef(live); liveRef.current = live;
  const [box, setBox] = useState<{x: number; y: number; w: number; h: number} | null>(null), [mode, setMode] = useState<'' | 'draw' | 'link' | 'hand'>(''), [ink, setInk] = useState<{x: number; y: number}[] | null>(null);
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
  useLayoutEffect(() => {const el = host.current; if (!el || !opening.current) return; const w = el.clientWidth || 1200, hh = el.clientHeight || 800; opening.current = false;
    const gs = p.blocks.filter(onBoard).map(b => geoOf(b)).filter(Boolean) as Geo[];
    if (!gs.length) {setView({z: 0.6, x: w / 2, y: hh / 2}); return;}
    const x1 = Math.min(...gs.map(g => g.x)), y1 = Math.min(...gs.map(g => g.y)), x2 = Math.max(...gs.map(g => g.x + g.w)), y2 = Math.max(...gs.map(g => g.y + g.h));
    const z = Math.max(MIN_Z, Math.min(0.6, (w - 160) / Math.max(1, x2 - x1), (hh - 200) / Math.max(1, y2 - y1)));
    setView({z, x: (w - (x2 - x1) * z) / 2 - x1 * z, y: (hh - 70 - (y2 - y1) * z) / 2 - y1 * z});}, []); // eslint-disable-line react-hooks/exhaustive-deps
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
    const down = (e: PointerEvent) => {if (e.pointerType !== 'touch') return; pts.set(e.pointerId, {x: e.clientX, y: e.clientY}); if (pts.size === 2) {stopGlide(); pinching.current = true; setLive({}); setGuides({}); start = {...geom(), v: viewRef.current};}};
    const move = (e: PointerEvent) => {if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, {x: e.clientX, y: e.clientY}); if (pts.size < 2 || !start) return; const g = geom(), r = el.getBoundingClientRect(), v = start.v;
      const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * g.d / start.d)), mx = start.cx - r.left, my = start.cy - r.top; setView({z, x: (g.cx - r.left) - (mx - v.x) * (z / v.z), y: (g.cy - r.top) - (my - v.y) * (z / v.z)});};
    const up = (e: PointerEvent) => {if (!pts.delete(e.pointerId)) return; if (pts.size < 2) start = null; if (!pts.size) setTimeout(() => {pinching.current = false;}, 0);};
    el.addEventListener('pointerdown', down, true); window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
    return () => {el.removeEventListener('pointerdown', down, true); window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true);};}, []);
  // 08/11/2026 (Pedro, "igual ao Weje"): rodinha sozinha anda na vertical (Shift: na horizontal); Ctrl+rodinha da zoom SUAVE
  // e progressivo (~10% por dente, animado, no ponto do mouse); segurar a rodinha e arrastar anda pelo quadro em cima de
  // qualquer coisa - ate da pagina aberta num cartao (ela avisa o quadro, ver lib/embed.ts). Em cima de lista/janela, rola ela.
  const zoomAnim = useRef<{z: number; mx: number; my: number} | null>(null);
  const zoomTo = (target: number, mx: number, my: number) => {stopGlide(); const run = !zoomAnim.current; zoomAnim.current = {z: Math.min(MAX_Z, Math.max(MIN_Z, target)), mx, my}; if (!run) return;
    const step = () => {const a = zoomAnim.current; if (!a) return; const v = viewRef.current, near = Math.abs(a.z - v.z) < a.z * 0.003, z = near ? a.z : v.z + (a.z - v.z) * 0.3;
      const nv = {z, x: a.mx - (a.mx - v.x) * (z / v.z), y: a.my - (a.my - v.y) * (z / v.z)}; viewRef.current = nv; setView(nv); if (near) zoomAnim.current = null; else requestAnimationFrame(step);};
    requestAnimationFrame(step);};
  // 08/11/2026 (Pedro: "o movimento deles acho bem melhor" - referencia Weje): a camera DESLIZA (0,3 s, desacelerando no fim) em
  // tudo que move o quadro por botao ou atalho - Ver tudo, centro, zoom dos botoes, 100%, ir ate um item, ligacao, busca. O zoom
  // anda em proporcao (cada passo parece igual) e o ponto do meio da tela segue em linha reta. Mexer o mouse/rodinha corta o
  // deslize na hora. Com "reduzir movimento" no sistema, pula direto.
  const glideRaf = useRef(0), glideTo = useRef<View | null>(null);
  const stopGlide = () => {if (glideRaf.current) cancelAnimationFrame(glideRaf.current); glideRaf.current = 0; glideTo.current = null;};
  const glide = (to: View, ms = 300) => {stopGlide(); zoomAnim.current = null; const from = viewRef.current, el = host.current, W = (el?.clientWidth || size2.w) / 2, H = (el?.clientHeight || size2.h) / 2;
    const tz = Math.min(MAX_Z, Math.max(MIN_Z, to.z)), dest = {...to, z: tz};
    let reduce = false; try {reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;} catch {}
    if (reduce || (Math.abs(from.x - dest.x) < 0.5 && Math.abs(from.y - dest.y) < 0.5 && Math.abs(from.z - dest.z) < 1e-4)) {viewRef.current = dest; setView(dest); return;}
    glideTo.current = dest; const c0 = {x: (W - from.x) / from.z, y: (H - from.y) / from.z}, c1 = {x: (W - dest.x) / dest.z, y: (H - dest.y) / dest.z}, t0 = performance.now();
    const step = (now: number) => {const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
      const nv = t >= 1 ? dest : (() => {const z = from.z * Math.pow(dest.z / from.z, e), cx = c0.x + (c1.x - c0.x) * e, cy = c0.y + (c1.y - c0.y) * e; return {z, x: W - cx * z, y: H - cy * z};})();
      viewRef.current = nv; setView(nv); glideRaf.current = t < 1 ? requestAnimationFrame(step) : 0; if (t >= 1) glideTo.current = null;};
    glideRaf.current = requestAnimationFrame(step);};
  const zoomAround = (z: number, mx: number, my: number) => {const v = glideTo.current || viewRef.current, zz = Math.min(MAX_Z, Math.max(MIN_Z, z)); glide({z: zz, x: mx - (mx - v.x) * (zz / v.z), y: my - (my - v.y) * (zz / v.z)});};
  // zoom em degraus de 20% (como o Weje: 100, 120, 144... / 83, 69, 58...), sempre caindo num degrau redondo
  const zoomStep = (dir: 1 | -1) => {const L = Math.log((glideTo.current || viewRef.current).z) / Math.log(1.2), n = dir > 0 ? Math.floor(L + 1e-3) + 1 : Math.ceil(L - 1e-3) - 1; zoomAround(Math.pow(1.2, n), size2.w / 2, size2.h / 2);};
  const wheelZoom = (dy: number, cx: number, cy: number) => {const r = host.current?.getBoundingClientRect(); if (!r) return; const d = Math.max(-60, Math.min(60, dy)), base = zoomAnim.current?.z ?? viewRef.current.z; zoomTo(base * Math.exp(-d * 0.0018), cx - r.left, cy - r.top);};
  const lastBoardWheel = useRef(0);
  const panFrom = (sx: number, sy: number) => {stopGlide(); const v0 = viewRef.current; zoomAnim.current = null; return (x: number, y: number) => {const nv = {...viewRef.current, x: v0.x + x - sx, y: v0.y + y - sy}; viewRef.current = nv; setView(nv);};};
  useEffect(() => {const el = host.current; if (!el) return;
    // 08/11/2026 (Pedro: "quando eu tiver movendo ainda as vezes confunde o scroll movimentando o conteudo, tem que travar"):
    // arrastando (item, fundo ou rodinha segurada) ou no meio de um giro de rodinha que ja estava andando o quadro, a rodinha
    // continua no quadro mesmo passando por cima de uma janela; o conteudo das janelas so rola num giro que comecou nele.
    // 09/11/2026 (Pedro: "to scrolando nas paginas e nao ta indo" - nas janelas do Word): a trava era 0,7 s depois de CADA dente
    // da rodinha; rolando o quadro, a janela chega embaixo do mouse e a trava nunca soltava. Agora solta com 0,3 s sem girar (entre
    // dentes de um mesmo giro e menos que isso) e, com o texto da janela em uso (clicou nela), a rodinha e sempre da janela.
    const on = (e: WheelEvent) => {const t = e.target as HTMLElement, now = performance.now(), dragging = el.hasAttribute('data-board-drag'), win = t.closest?.('[data-board-editing],[data-board-scroll="on"]') as HTMLElement | null;
      const using = !!win && !!document.activeElement && win.contains(document.activeElement), boardGesture = dragging || (!using && now - lastBoardWheel.current < 300);
      if (!boardGesture && t.closest?.('[data-board-editing],[data-board-ui],[data-board-scroll="on"]') && !(e.ctrlKey || e.metaKey)) return; e.preventDefault(); lastBoardWheel.current = now;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      if (e.ctrlKey || e.metaKey) {e.stopPropagation(); wheelZoom(e.deltaY * unit, e.clientX, e.clientY); return;} // 08/11 (Pedro): Ctrl+rodinha SO da zoom no quadro (nada rola, nem a janela por baixo)
      stopGlide(); const v = viewRef.current, dx = e.shiftKey ? (e.deltaX || e.deltaY) * unit : e.deltaX * unit, dy = e.shiftKey ? 0 : e.deltaY * unit, nv = {...v, x: v.x - dx, y: v.y - dy}; viewRef.current = nv; setView(nv);};
    const noAuto = (e: MouseEvent) => {if (e.button === 1) e.preventDefault();}; // sem o "auto-rolar" do navegador
    const mid = (e: PointerEvent) => {if (e.button !== 1) return; e.preventDefault(); e.stopPropagation(); dragOn(); const go = panFrom(e.screenX, e.screenY);
      const mv = (ev: PointerEvent) => go(ev.screenX, ev.screenY), up = () => {window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('blur', up); dragOff();};
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('blur', up);};
    el.addEventListener('wheel', on, {passive: false, capture: true}); el.addEventListener('mousedown', noAuto, true); el.addEventListener('pointerdown', mid, true);
    return () => {el.removeEventListener('wheel', on, true); el.removeEventListener('mousedown', noAuto, true); el.removeEventListener('pointerdown', mid, true);};}, []);
  // a pagina aberta no cartao (iframe) manda: segurar a rodinha e arrastar / Ctrl+rodinha (o navegador entrega o mouse a ela)
  useEffect(() => {let go: ((x: number, y: number) => void) | null = null;
    const on = (e: MessageEvent) => {const d = e.data; if (e.origin !== location.origin || !d || d.sofia !== 'board-nav') return;
      const fr = Array.from(host.current?.querySelectorAll('iframe[data-testid=board-page-frame]') || []).find(x => (x as HTMLIFrameElement).contentWindow === e.source) as HTMLIFrameElement | undefined; if (!fr) return;
      if (d.kind === 'pan-start') go = panFrom(Number(d.sx), Number(d.sy)); else if (d.kind === 'pan-move') go?.(Number(d.sx), Number(d.sy)); else if (d.kind === 'pan-end') go = null;
      else if (d.kind === 'zoom') {const r = fr.getBoundingClientRect(), iw = fr.contentWindow?.innerWidth || r.width, ih = fr.contentWindow?.innerHeight || r.height; wheelZoom(Number(d.dy) || 0, r.left + Number(d.x) * r.width / iw, r.top + Number(d.y) * r.height / ih);}};
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);}, []); // eslint-disable-line react-hooks/exhaustive-deps
  const zoomBy = (k: number) => zoomAround((glideTo.current || viewRef.current).z * k, size2.w / 2, size2.h / 2);
  const fitAll = () => {if (!shown.length) {glide({x: 80, y: 60, z: 1}); return;} const gs = shown.map(geo), x1 = Math.min(...gs.map(g => g.x)), y1 = Math.min(...gs.map(g => g.y)), x2 = Math.max(...gs.map(g => g.x + g.w)), y2 = Math.max(...gs.map(g => g.y + g.h));
    const z = Math.min(MAX_Z, Math.max(MIN_Z, Math.min((size2.w - 120) / Math.max(1, x2 - x1), (size2.h - 180) / Math.max(1, y2 - y1)))); glide({z, x: (size2.w - (x2 - x1) * z) / 2 - x1 * z, y: (size2.h - 60 - (y2 - y1) * z) / 2 - y1 * z});};

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
    const mv = (ev: PointerEvent) => {if (pinching.current) return; const dx = ev.clientX - sx, dy = ev.clientY - sy; if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return; if (!moved) {stopGlide(); dragOn();} moved = true; setView({...v0, x: v0.x + dx, y: v0.y + dy});};
    const up = () => {if (!moved) {setSel([]); setSelLink(null); if (mode === 'link') setMode('');} dragOff(); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);};
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const onBgDouble = (e: any) => {const t = e.target as HTMLElement; if (t.closest('[data-board-item],[data-board-ui]')) return; const at = toBoard(e.clientX, e.clientY);
    const nb = addBlock({id: uid(), type: 'callout', text: '', html: '', data: {}}, at); setEditing(nb.id);};

  const dragOn = () => host.current?.setAttribute('data-board-drag', '1'), dragOff = () => host.current?.removeAttribute('data-board-drag');
  // 08/11/2026 (Pedro: "os mesmos mecanismos de la"): cartao de pagina com Anexo (linha) ou Visualizacao (a pagina de verdade,
  // editavel ali mesmo - nao abre aba do navegador)
  const setPageView = (b: PageBlock, v: 'attach' | 'page' | 'list') => {const s2 = size({...b, data: {...(b.data || {}), view: v}});
    patchBlock(b.id, x => ({...x, data: {...(x.data || {}), view: v, board: {...geo(x), w: v === 'attach' ? s2.w : Math.max(geo(x).w, s2.w), h: v === 'attach' ? s2.h : Math.max(geo(x).h, s2.h)}}}), 'board-view'); if (v !== 'page') setEditing(null);};
  const usePageHere = (b: PageBlock) => {const t = p.pages.find(x => x.id === String(b.data?.page_id || '')); if (!t) return; if (t.data?.lock_json || p.locked) {p.onOpenPage(t); return;}
    const g = geo(b), s2 = size({...b, data: {...(b.data || {}), view: 'page'}}), g2 = {...g, w: Math.max(g.w, s2.w), h: Math.max(g.h, s2.h)};
    if (pageView(b) !== 'page') setPageView(b, 'page'); setSel([b.id]); focusOn(g2); setEditing(b.id);};
  // 08/11/2026 (Pedro: "a janela fica dentro do template, posso mover, e se mover o espaco ela fica fixa"): arquivo aberto na
  // pagina de um cartao vira uma janela DO QUADRO ao lado do cartao (Word/Excel/PowerPoint ja editando; salvar grava tambem na
  // pagina). Se ja estiver no quadro, so leva ate ela.
  const openFromPage = (cardId: string, d: {id: string; name: string; mime: string; pageId: string}) => {
    const card = byId.get(cardId); if (!card) return;
    const ed = !!editKind(d.mime, d.name) && !p.locked, exist = shown.find(x => x.type === 'file' && String(x.data?.attachment_id || '') === d.id);
    if (exist) {setSel([exist.id]); if (ed) openItem(exist); else focusOn(geo(exist)); return;}
    let fromBlock = ''; try {const bs = JSON.parse(String(p.pages.find(x => x.id === d.pageId)?.data?.blocks_json || '[]')); fromBlock = String((Array.isArray(bs) ? bs : []).find((x: any) => String(x?.data?.attachment_id || '') === d.id)?.id || '');} catch {}
    const data: any = {attachment_id: d.id, name: d.name, mime: d.mime, from_page: d.pageId, from_block: fromBlock, from_card: cardId, orig_attachment: d.id, ...(ed ? {window: true} : {})}; // 08/11 (Pedro): janela ligada ao cartao (sai junto) e o anexo original guardado para sincronizar so quando ele pedir
    const cg = geo(card), s2 = ed ? {w: 680, h: 860} : size({id: '', type: 'file', text: '', data} as PageBlock), g2 = {x: cg.x + cg.w + 40, y: cg.y, w: s2.w, h: s2.h, z: topZ()};
    const nb: PageBlock = {id: uid(), type: 'file', text: '', data: {...data, board: g2}};
    p.edit(bs => [...bs, nb], 'board-file-open'); setSel([nb.id]); focusOn({...cg, w: g2.x + g2.w - cg.x, h: Math.max(cg.h, g2.h)});};
  const openFromPageRef = useRef(openFromPage); openFromPageRef.current = openFromPage;
  useEffect(() => {const on = (e: MessageEvent) => {const d = e.data; if (e.origin !== location.origin || !d || d.sofia !== 'board-open-file' || !d.id) return;
      const fr = Array.from(host.current?.querySelectorAll('iframe[data-testid=board-page-frame]') || []).find(x => (x as HTMLIFrameElement).contentWindow === e.source);
      const cardId = fr?.closest('[data-board-item]')?.getAttribute('data-id'); if (cardId) openFromPageRef.current(cardId, {id: String(d.id), name: String(d.name || 'arquivo'), mime: String(d.mime || ''), pageId: String(d.pageId || '')});};
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);}, []);
  // item: clique seleciona, arrastar move (todos os selecionados), no modo ligar liga
  const onItemDown = (b: PageBlock) => (e: any) => {
    if (e.button !== 0) return; if (editing === b.id && !(e.target as HTMLElement).closest?.('[data-board-handle]')) return; e.stopPropagation(); host.current?.focus({preventScroll: true});
    // 08/11/2026: clicar em OUTRO item encerra a edicao anterior (a lista ficava editando e a barra da selecao nao aparecia)
    if (editing && editing !== b.id) {setEditing(null); p.flush();}
    if (mode === 'link') {const from = sel[0]; if (from && from !== b.id) {patchGeo([from], g => ({...g, links: [...(g.links || []).filter(l => linkTo(l) !== b.id), {to: b.id, arrow: true}]}), 'board-link');} setMode(''); setSel([b.id]); return;}
    // 08/11/2026 (Pedro: "clico nele e ele fica grudado no mouse"): soltar o botao em cima da pagina do cartao (iframe) nao chegava
    // ao quadro e o item seguia o mouse. Durante o arrasto nenhum iframe recebe o mouse, e a pagina so passa a aceitar cliques
    // DEPOIS de soltar (um clique sem mover = usar a pagina aqui). Sair da janela tambem solta.
    const already = sel.includes(b.id), ids = e.shiftKey ? (already ? sel.filter(x => x !== b.id) : [...sel, b.id]) : already ? sel : [b.id]; setSel(ids); if (e.shiftKey) return; dragOn();
    const sx = e.clientX, sy = e.clientY, start = new Map(ids.map(id => [id, geo(byId.get(id)!)])); let moved = false;
    // linhas-guia: a borda ou o meio do que se move encaixa na borda ou no meio de um vizinho (Alt solta o encaixe)
    const gs0 = [...start.values()], bx = Math.min(...gs0.map(g => g.x)), by = Math.min(...gs0.map(g => g.y)), bw = Math.max(...gs0.map(g => g.x + g.w)) - bx, bh = Math.max(...gs0.map(g => g.y + g.h)) - by;
    const others = shown.filter(o => !start.has(o.id)).map(o => geo(o)), ox = others.flatMap(g => [g.x, g.x + g.w / 2, g.x + g.w]), oy = others.flatMap(g => [g.y, g.y + g.h / 2, g.y + g.h]);
    const snap = (v: number, size: number, cands: number[], tol: number) => {let best: {d: number; line: number} | null = null; for (const k of [0, size / 2, size]) for (const c2 of cands) {const d = c2 - (v + k); if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = {d, line: c2};} return best;};
    const mv = (ev: PointerEvent) => {if (pinching.current) return; const z = viewRef.current.z; let dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z; if (!moved && Math.abs(dx) + Math.abs(dy) < 3 / z) return; moved = true;
      let gx: number | undefined, gy: number | undefined; if (!ev.altKey) {const tol = 6 / z, sxp = snap(bx + dx, bw, ox, tol), syp = snap(by + dy, bh, oy, tol); if (sxp) {dx += sxp.d; gx = sxp.line;} if (syp) {dy += syp.d; gy = syp.line;}} setGuides({x: gx, y: gy});
      const next: Record<string, Geo> = {}; start.forEach((g, id) => {next[id] = {...g, x: Math.round(g.x + dx), y: Math.round(g.y + dy)};}); setLive(next);};
    const up = () => {window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('blur', up); dragOff();
      if (!moved && b.type === 'page_link' && pageView(b) === 'page' && !p.locked && ids.length === 1) {const t = p.pages.find(x => x.id === String(b.data?.page_id || '')); if (t && !t.data?.lock_json) setEditing(b.id);}
      setGuides({}); if (moved) {const fin = liveRef.current; p.edit(bs => bs.map(x => fin[x.id] ? {...x, data: {...(x.data || {}), board: {...(geoOf(x) || {}), ...fin[x.id]}}} : x), 'board-move'); setLive({});}};
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('blur', up);
  };
  const onResize = (b: PageBlock, corner: string) => (e: any) => {
    e.stopPropagation(); e.preventDefault(); const sx = e.clientX, sy = e.clientY, g0 = geo(b), ratio = g0.w / Math.max(1, g0.h), keep = (b.type === 'image' || (b.type === 'file' && ['image', 'video'].includes(fileKind(b.data?.mime, b.data?.name)))) && !e.shiftKey;
    const mv = (ev: PointerEvent) => {if (pinching.current) return; const z = viewRef.current.z, dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z; let {x, y, w, h: hh} = g0;
      if (corner.includes('e')) w = g0.w + dx; if (corner.includes('w')) {w = g0.w - dx; x = g0.x + dx;} if (corner.includes('s')) hh = g0.h + dy; if (corner.includes('n')) {hh = g0.h - dy; y = g0.y + dy;}
      w = Math.max(60, w); hh = Math.max(36, hh); if (keep) {hh = w / ratio; if (corner.includes('n')) y = g0.y + g0.h - hh;} if (corner.includes('w')) x = g0.x + g0.w - w;
      setLive({[b.id]: {...g0, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh)}});};
    dragOn();
    const up = () => {window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('blur', up); dragOff(); const g = liveRef.current[b.id]; if (g) patchGeo([b.id], () => g, 'board-size'); setLive({});};
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('blur', up);
  };
  // leva a camera ate o item (cabe na tela, no maximo 100%), como quem aproxima o documento para editar
  const focusOn = (g: Geo) => {const z = Math.min(1, Math.max(MIN_Z, Math.min((size2.w - 80) / g.w, (size2.h - 150) / g.h))); glide({z, x: (size2.w - g.w * z) / 2 - g.x * z, y: Math.max(60, (size2.h - 90 - g.h * z) / 2) - g.y * z});};
  const openItem = (b: PageBlock) => {
    if (b.type === 'callout' || b.type === 'todo' || b.type === 'text' || b.type.startsWith('heading') || b.type === 'bullet' || b.type === 'number' || b.type === 'quote') {setEditing(b.id); return;}
    if (b.type === 'bookmark' && b.data?.live) return;
    if (b.type === 'bookmark' && b.data?.link?.url) {window.open(String(b.data.link.url), '_blank', 'noopener'); return;}
    if (b.type === 'page_link') {usePageHere(b); return;} // entra na pagina dentro do cartao (abrir arquivos, editar), nunca numa aba nova
    const id = String(b.data?.attachment_id || ''); if (!id) return;
    if (b.type === 'file' && editKind(b.data?.mime, b.data?.name) && !p.locked) {const g = geo(b); patchBlock(b.id, x => ({...x, data: {...(x.data || {}), window: true, board: {...geo(x), w: Math.max(geo(x).w, 680), h: Math.max(geo(x).h, 860)}}}), 'board-size'); focusOn({...g, w: Math.max(g.w, 680), h: Math.max(g.h, 860)}); return;} // 08/11: vira janela do quadro (editor sempre visivel, mesmo clicando em outro item) // editar: o cartao vira uma pagina
    openFileWindow(p.api, {id, name: String(b.data?.name || 'arquivo'), mime: String(b.data?.mime || (b.type === 'image' ? 'image/jpeg' : '')), pageId: p.pageId,
      onSaved: a => {patchBlock(b.id, x => ({...x, data: {...(x.data || {}), attachment_id: a.id, name: a.name, mime: a.mime, size: a.bytes}}), 'board-file'); p.flush();}});
  };

  // teclado (com o foco no quadro, fora de edicao)
  // 08/11/2026 (Pedro: "a letra H vira a maozinha pra arrastar o mapa: com ela so arrasta, clicar em qualquer coisa fica bloqueado"):
  // H liga/desliga a maozinha (Esc ou V tambem desligam). Com ela, qualquer clique no quadro so arrasta; nada e clicado nem editado.
  // 08/11/2026 (referencia Weje): Ctrl + / Ctrl - / Ctrl 0 dao zoom no quadro (nao no navegador); W A S D (e as setas, sem nada
  // selecionado) andam pelo quadro enquanto seguradas, liso (Shift = mais rapido); C nota, L lista, T texto, U arquivo.
  const keyNav = useRef<any>(null); keyNav.current = {zoomStep, zoomAround, size2, sel, add: (type: 'callout' | 'todo' | 'text') => {const at = mouseAt.current && Date.now() - mouseAt.current.t < 4000 ? toBoard(mouseAt.current.x, mouseAt.current.y) : undefined;
    const nb = addBlock(type === 'todo' ? {id: uid(), type: 'todo', text: '', data: {items: [{id: uid(), text: '', done: false}]}} : {id: uid(), type, text: '', html: '', data: {}}, at); setEditing(nb.id);}, file: () => {anchor.current = center(); p.pickFiles();}, locked: p.locked};
  const mouseAt = useRef<{x: number; y: number; t: number} | null>(null);
  useEffect(() => {const held = new Set<string>(); let raf = 0, last = 0;
    const loop = (now: number) => {if (!held.size) {raf = 0; return;} const dt = Math.min(50, now - (last || now)); last = now; const sp = (held.has('shift') ? 2200 : 1000) * dt / 1000;
      let dx = 0, dy = 0; if (held.has('a') || held.has('arrowleft')) dx += sp; if (held.has('d') || held.has('arrowright')) dx -= sp; if (held.has('w') || held.has('arrowup')) dy += sp; if (held.has('s') || held.has('arrowdown')) dy -= sp;
      if (dx || dy) {const v = viewRef.current, nv = {...v, x: v.x + dx, y: v.y + dy}; viewRef.current = nv; setView(nv);} raf = requestAnimationFrame(loop);};
    const typing = () => {const a = document.activeElement as HTMLElement | null; return !!a && (a.tagName === 'IFRAME' || !!a.closest('input,textarea,select,[contenteditable="true"],[data-board-editing]'));};
    const onBoardFocus = () => {const a = document.activeElement; return !a || a === document.body || !!host.current?.contains(a);};
    const on = (e: KeyboardEvent) => {if (typing() || !host.current?.isConnected || !host.current.offsetParent) return; const k = e.key.toLowerCase(), n = keyNav.current;
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {const W = n.size2.w / 2, H = n.size2.h / 2;
        if (k === '=' || k === '+') n.zoomStep(1); else if (k === '-' || k === '_') n.zoomStep(-1); else if (k === '0') n.zoomAround(1, W, H); else return; e.preventDefault(); return;}
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (k === 'h') {e.preventDefault(); setMode(m => m === 'hand' ? '' : 'hand'); setEditing(null); return;} if ((k === 'v' || k === 'escape') && modeRef.current === 'hand') {setMode(''); return;}
      if (!onBoardFocus()) return;
      const arrow = k.startsWith('arrow'); if ('wasd'.includes(k) && k.length === 1 || (arrow && !n.sel.length)) {e.preventDefault(); held.add(k); if (e.shiftKey) held.add('shift'); stopGlide(); if (!raf) {last = 0; raf = requestAnimationFrame(loop);} return;}
      if (e.repeat || n.locked) return;
      if (k === 'c') {e.preventDefault(); n.add('callout');} else if (k === 'l') {e.preventDefault(); n.add('todo');} else if (k === 't') {e.preventDefault(); n.add('text');} else if (k === 'u') {e.preventDefault(); n.file();}};
    const off = (e: KeyboardEvent) => {held.delete(e.key.toLowerCase()); if (e.key === 'Shift') held.delete('shift');};
    const clear = () => held.clear();
    const mm = (e: PointerEvent) => {const r = host.current?.getBoundingClientRect(); mouseAt.current = r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom ? {x: e.clientX, y: e.clientY, t: Date.now()} : null;};
    window.addEventListener('keydown', on); window.addEventListener('keyup', off); window.addEventListener('blur', clear); window.addEventListener('pointermove', mm, {passive: true});
    return () => {window.removeEventListener('keydown', on); window.removeEventListener('keyup', off); window.removeEventListener('blur', clear); window.removeEventListener('pointermove', mm); cancelAnimationFrame(raf);};}, []); // eslint-disable-line react-hooks/exhaustive-deps
  const modeRef = useRef(mode); modeRef.current = mode;
  const [grabbing, setGrabbing] = useState(false);
  const handDown = (e: any) => {if (e.button !== 0 && e.button !== 1) return; e.preventDefault(); e.stopPropagation(); try {window.getSelection()?.removeAllRanges();} catch {}
    dragOn(); setGrabbing(true); const go = panFrom(e.screenX, e.screenY), mv = (ev: PointerEvent) => go(ev.screenX, ev.screenY),
      up = () => {window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('blur', up); dragOff(); setGrabbing(false);};
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('blur', up);};
  const onKey = (e: any) => {
    const t = e.target as HTMLElement; if (t.closest('input,textarea,[contenteditable="true"],[data-board-editing]')) {if (e.key === 'Escape') {setEditing(null); setAsk(null); host.current?.focus();} return;}
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey, k = e.key;
    if (mod && k.toLowerCase() === 'f') {e.preventDefault(); setFind({q: '', i: 0}); return;}
    if (k === 'Escape') {if (ask || selLink) {setAsk(null); setSelLink(null); return;} setSel([]); setMode(''); return;}
    if (mod && k.toLowerCase() === 'a') {e.preventDefault(); setSel(shown.map(b => b.id)); return;}
    if (!sel.length) return;
    if (k === 'Delete' || k === 'Backspace') {e.preventDefault(); remove(sel); return;}
    if (mod && k.toLowerCase() === 'd') {e.preventDefault(); void duplicate(sel); return;}
    // 08/11/2026 (referencia Weje): Ctrl+Enter cria uma nota nova ao lado do item selecionado, ja escrevendo
    if (k === 'Enter' && mod && !p.locked) {const b = byId.get(sel[0]); if (b) {e.preventDefault(); const g = geo(b), nb = addBlock({id: uid(), type: 'callout', text: '', html: '', data: {}}, {x: g.x + g.w + 40 + 120, y: g.y + 75}); setEditing(nb.id);} return;}
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
  const patchLink = (from: string, to: string, f: ((l: {to: string; label?: string; arrow?: boolean; dash?: boolean}) => any) | null) => patchGeo([from], g => ({...g, links: (g.links || []).flatMap(l => linkTo(l) !== to ? [l] : f ? [f(linkObj(l))] : [])}), 'board-link');
  const remove = (ids: string[]) => {const set0 = new Set(ids); p.edit(bs => {
      // 08/11 (Pedro: "os anexos flutuantes sao ligacao daquele anexo daquela pagina... se eu tiro eles saem juntos")
      const cards = bs.filter(b => set0.has(b.id) && b.type === 'page_link'), pgs = new Set(cards.flatMap(b => [String(b.data?.page_id || ''), String(b.data?.copy_id || '')]).filter(Boolean)),
        set = new Set([...set0, ...bs.filter(b => b.type === 'file' && (set0.has(String(b.data?.from_card || '')) || (!b.data?.from_card && pgs.has(String(b.data?.from_page || ''))))).map(b => b.id)]);
      const rest = bs.filter(b => !set.has(b.id)).map(b => {const g = geoOf(b); return g?.links?.some(l => set.has(linkTo(l))) ? {...b, data: {...b.data, board: {...g, links: g.links.filter(l => !set.has(linkTo(l)))}}} : b;}); return rest.length ? rest : [{id: uid(), type: 'text', text: ''}];}, 'board-remove'); setSel([]); setEditing(null);};
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
    return shown.filter(b => {if (sel.includes(b.id) || editing === b.id) return true; const g = geo(b); return g.x < x2 && g.x + g.w > x1 && g.y < y2 && g.y + g.h > y1;}); // 08/11 (Pedro: "trazer pra frente mexe no tamanho do texto"): ordem fixa; quem fica por cima e so o zIndex (reordenar recriava o conteudo das janelas)
  }, [shown, view, size2, live, sel, editing]); // eslint-disable-line react-hooks/exhaustive-deps
  // 08/11/2026 (Pedro: "mudando de forma" no zoom): so muito afastado (< 15%) o conteudo vira resumo; antes, abaixo de 45%, a janela
  // do Word virava linha de arquivo e as imagens viravam caixa vazia no meio do zoom
  const light = view.z < 0.15;
  const links = useMemo(() => {const out: {id: string; from: string; to: string; a: Geo; b: Geo; label: string; arrow: boolean; dash: boolean}[] = []; for (const b of shown) {const g = geo(b); for (const raw of g.links || []) {const l = linkObj(raw), t = byId.get(l.to); if (t && onBoard(t)) out.push({id: b.id + '>' + l.to, from: b.id, to: l.to, a: g, b: geo(t), label: String(l.label || ''), arrow: !!l.arrow, dash: !!l.dash});}} return out;}, [shown, live]); // eslint-disable-line react-hooks/exhaustive-deps
  const one = sel.length === 1 ? byId.get(sel[0]) : undefined;
  const [alignOpen, setAlignOpen] = useState(false);
  useEffect(() => {if (sel.length < 2) setAlignOpen(false);}, [sel.length]);
  const alignSel = (kind: AlignKind) => {const list = sel.map(id => byId.get(id)).filter(Boolean).map(b => ({id: b!.id, g: geo(b!)})); if (list.length < 2) return;
    const x1 = Math.min(...list.map(o => o.g.x)), y1 = Math.min(...list.map(o => o.g.y)), x2 = Math.max(...list.map(o => o.g.x + o.g.w)), y2 = Math.max(...list.map(o => o.g.y + o.g.h)), out = new Map<string, {x: number; y: number}>();
    if (kind === 'row') {let x = x1; for (const o of [...list].sort((a, b) => a.g.x - b.g.x)) {out.set(o.id, {x, y: y1}); x += o.g.w + 40;}}
    else if (kind === 'col') {let y = y1; for (const o of [...list].sort((a, b) => a.g.y - b.g.y)) {out.set(o.id, {x: x1, y}); y += o.g.h + 40;}}
    else for (const o of list) out.set(o.id, {x: kind === 'left' ? x1 : kind === 'right' ? x2 - o.g.w : kind === 'hcenter' ? (x1 + x2) / 2 - o.g.w / 2 : o.g.x, y: kind === 'top' ? y1 : kind === 'bottom' ? y2 - o.g.h : kind === 'vcenter' ? (y1 + y2) / 2 - o.g.h / 2 : o.g.y});
    patchGeo([...out.keys()], (g, b) => {const q = out.get(b.id)!; return {...g, x: Math.round(q.x), y: Math.round(q.y)};}, 'board-align'); p.flush();};

  const btn = (icon: IconName | 'T', label: string, run: () => void, on = false, danger = false, testID?: string) => h('button', {key: label, type: 'button', title: label, 'aria-label': label, 'aria-pressed': on || undefined, 'data-testid': testID,
    onPointerDown: (e: any) => e.stopPropagation(), onClick: (e: any) => {e.stopPropagation(); run();},
    style: {width: 40, height: 38, border: 0, borderRadius: 10, cursor: 'pointer', background: on ? c.accentSoft : 'transparent', color: danger ? c.danger : on ? c.accent : c.text, display: 'flex', alignItems: 'center', justifyContent: 'center'}},
    icon === ('@' as any) ? h('span', {style: {fontSize: 18, fontWeight: 700, lineHeight: 1}}, '@') : icon === 'T' ? h('svg', {width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', 'aria-hidden': true}, h('path', {d: 'M5 6V4h14v2M12 4v16M9 20h6'})) : <Icon name={icon} size={19} color={danger ? c.danger : on ? c.accent : c.text} />);
  const bar = (children: any[], style: any, label: string) => h('div', {'data-board-ui': '1', role: 'toolbar', 'aria-label': label, onPointerDown: (e: any) => e.stopPropagation(), style: {position: 'absolute', display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px', background: c.surface, border: '1px solid ' + c.line, borderRadius: 14, boxShadow: '0 10px 24px rgba(0,0,0,.28)', zIndex: 30, ...style}}, ...children);

  const selBar = (one || sel.length > 1) && (!editing || byId.get(editing)?.type === 'page_link') ? (() => {const gs = sel.map(id => byId.get(id)).filter(Boolean).map(b => geo(b!)), x = Math.min(...gs.map(g => g.x)), y2 = Math.max(...gs.map(g => g.y + g.h)), x2 = Math.max(...gs.map(g => g.x + g.w));
    const y1 = Math.min(...gs.map(g => g.y)), left = Math.max(8, Math.min(size2.w - 420, ((x + x2) / 2) * view.z + view.x - 200)), under = Math.max(0, ...sel.map(id => byId.get(id)).filter(Boolean).map(b => {const g = geo(b!); return g.y + g.h >= y2 - 1 ? (g.caption ? 22 : 0) + ((g.mentions || []).length ? 26 : 0) : 0;})), below = y2 * view.z + view.y + 14 + under, top = below + 48 > size2.h - 92 ? Math.max(8, y1 * view.z + view.y - 62) : below; // perto do rodape: a barra sobe para cima do item (nao fica sob a barra de inserir)
    const items: any[] = [];
    if (one?.type === 'file') {const k = fileKind(one.data?.mime, one.data?.name), pv = (one.data?.view || defaultView(k)) === 'preview'; items.push(btn(pv ? 'file' : 'eye', pv ? 'Mostrar como anexo' : 'Abrir no quadro (visualização)', () => {const s = size({...one, data: {...one.data, view: pv ? 'attach' : 'preview'}}); patchBlock(one.id, b => ({...b, data: {...b.data, view: pv ? 'attach' : 'preview', board: {...geo(b), w: s.w, h: s.h}}}), 'board-view');}));}
    if (one?.type === 'page_link') {const synced = !!one.data?.synced, src = one.data?.source_id ? p.pages.find(x => x.id === String(one.data!.source_id)) : null;
      // 08/11/2026 (Pedro: "se ele alterou coisas e quer sincronizar essa copia pode fazer a pagina original sincronizar essas
      // informacoes"): a copia continua escondida (nao e subpagina); Sincronizar leva o que mudou na copia PARA a original.
      // Cartoes antigos ligados direto na original (synced) so ganham o "parar".
      if (src && synced) items.push(btn('refresh', 'Parar de sincronizar com a original', () => patchBlock(one.id, b => ({...b, data: {...b.data, synced: false, page_id: b.data?.copy_id}}), 'board-sync'), true, false, 'board-sync'));
      if (src && !synced && p.pushToOriginal) items.push(btn('refresh', 'Sincronizar: levar as mudanças desta cópia para a página original', () => {const cp = p.pages.find(x => x.id === String(one.data?.copy_id || '')); if (!cp) return;
        appAlert('Sincronizar com a original?', 'O conteúdo desta cópia vai substituir o conteúdo de "' + (src.title || 'Sem título') + '". A versão anterior da original fica em Versões da página.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Sincronizar', onPress: () => void track('sincronizar-original', () => p.pushToOriginal!(cp, src)).catch(e => fail(String(e?.message || e)))}]);}, false, false, 'board-sync'));
      // 08/11 (Pedro: "um botao pra tornar essa copia o conteudo original e ai eles mudam sincronizando e deixa de ser copia")
      if (src && !synced && p.pushToOriginal) items.push(btn('book', 'Tornar a original: o conteúdo desta cópia vira o da original e o cartão passa a ser a própria original (sempre sincronizado)', () => {const cp = p.pages.find(x => x.id === String(one.data?.copy_id || '')); if (!cp) return;
        appAlert('Tornar a original?', 'O conteúdo desta cópia vai substituir o de "' + (src.title || 'Sem título') + '" e o cartão passa a mostrar a própria original: o que mudar aqui muda lá. A versão anterior fica em Versões da página.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Tornar a original', onPress: () => void track('tornar-original', () => p.pushToOriginal!(cp, src)).then(() => patchBlock(one.id, b => ({...b, data: {...b.data, synced: true, page_id: b.data?.source_id}}), 'board-sync')).catch(e => fail(String(e?.message || e)))}]);}, false, false, 'board-make-original'));
      if (src && !synced) items.push(btn('download', 'Trazer para a cópia o que está na original agora', () => {const cp = p.pages.find(x => x.id === String(one.data?.copy_id || '')); if (cp) void track('atualizar-copia', () => p.copyInto(cp, src)).catch(e => fail(String(e?.message || e)));}));
      items.push(btn(one.data?.view === 'list' ? 'book' : 'listView', one.data?.view === 'list' ? 'Mostrar a página de verdade (editar aqui)' : 'Mostrar só o resumo (arquivos em lista)', () => setPageView(one, one.data?.view === 'list' ? 'page' : 'list'), one.data?.view === 'list', false, 'board-page-view'));
      items.push(btn('external', 'Abrir a página inteira', () => {const t = p.pages.find(x => x.id === String(one.data?.page_id || '')); if (t) p.onOpenPage(t);}));}
    if (one?.type === 'callout') items.push(btn('circle', 'Cor da nota', () => {const i = NOTE_COLORS.indexOf(geo(one).color || NOTE_COLORS[0]); patchGeo([one.id], g => ({...g, color: NOTE_COLORS[(i + 1) % NOTE_COLORS.length]}), 'board-color');}));
    items.unshift(btn('sofia', 'Pedir à Sofia sobre ' + (sel.length > 1 ? 'estes itens' : 'este item') + ' (resumir, organizar, virar tarefas…)', () => setAsk({q: '', busy: false, err: ''}), !!ask, false, 'board-ask'));
    if (one?.type === 'bookmark' && one.data?.live?.kind === 'mail') items.push(btn('clip', 'Anexos deste e-mail', () => {const hit = String(one.data!.live.id), card = one.id; setMailAtt({card, hit, items: null, err: '', busy: ''}); track('anexo-email-listar', () => p.api.mailAttachments(hit)).then(r => setMailAtt(m => m && m.card === card ? {...m, items: r.items} : m)).catch(e => setMailAtt(m => m && m.card === card ? {...m, err: String(e?.message || 'Não deu para ler os anexos.')} : m));}, !!mailAtt, false, 'board-mail-att'));
    if (one?.type === 'bookmark' && one.data?.live) items.push(btn('refresh', 'Atualizar com o app agora', () => bustLive(one.data!.live.kind)));
    if (one) items.push(btn('rename', 'Legenda', () => setCapEdit(one.id), capEdit === one.id, false, 'board-caption'));
    if (one) items.push(btn('@' as any, 'Mencionar uma página ou item do app (@)', () => setMention({id: one.id, mode: 'page'}), !!mention, false, 'board-mention'));
    if (one) items.push(btn('link', 'Ligar a outro item (clique no outro item)', () => setMode(mode === 'link' ? '' : 'link'), mode === 'link'));
    if (sel.length > 1 && !p.locked) items.push(btn('gridView', 'Alinhar e organizar', () => setAlignOpen(o => !o), alignOpen, false, 'board-align'));
    items.push(btn('moveTo', 'Trazer para a frente', bringFront));
    if (one && (one.type === 'file' || (one.type === 'image' && one.data?.attachment_id))) items.push(btn('download', 'Baixar', () => void downloadPageFile(p.api, String(one.data?.attachment_id))));
    items.push(btn('copy', 'Duplicar (Ctrl+D) — cópia independente', () => void duplicate(sel)));
    items.push(btn('trash', 'Excluir (Delete)', () => remove(sel), false, true));
    // 08/11/2026 (referencia Weje): com varios itens, a barra troca para as opcoes de alinhar e organizar (enfileirar com 40 de espaco)
    if (alignOpen && sel.length > 1) {const opts: [string, string, AlignKind][] = [['Esquerda', 'Alinhar pela esquerda', 'left'], ['Centro', 'Alinhar pelo centro', 'hcenter'], ['Direita', 'Alinhar pela direita', 'right'], ['Topo', 'Alinhar pelo topo', 'top'], ['Meio', 'Alinhar pelo meio', 'vcenter'], ['Base', 'Alinhar pela base', 'bottom'], ['Lado a lado', 'Enfileirar lado a lado, com o mesmo espaço', 'row'], ['Em coluna', 'Empilhar em coluna, com o mesmo espaço', 'col']];
      return bar([btn('back', 'Voltar', () => setAlignOpen(false)), ...opts.map(([t, label, kind]) => h('button', {key: kind, type: 'button', title: label, 'aria-label': label, 'data-testid': 'board-align-' + kind, onPointerDown: (e: any) => e.stopPropagation(), onClick: (e: any) => {e.stopPropagation(); alignSel(kind);},
        style: {height: 34, padding: '0 9px', border: 0, borderRadius: 9, cursor: 'pointer', background: 'transparent', color: c.text, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap'}}, t))], {left: Math.max(8, Math.min(size2.w - 620, left)), top, height: 48}, 'Alinhar e organizar');}
    return bar(items, {left, top, height: 48}, 'Item selecionado');})() : null;

  return h('div', {ref: host, 'data-testid': 'page-board', tabIndex: 0, onKeyDown: onKey, onPointerDown: onBgDown, onDoubleClick: onBgDouble,
    // 08/11/2026: o navegador rolava o quadro sozinho ao focar algo dentro (as barras subiam para o meio): 'clip' nao rola, e o onScroll desfaz
    onScroll: (e: any) => {const el = e.currentTarget as HTMLElement; if (el.scrollTop || el.scrollLeft) {el.scrollTop = 0; el.scrollLeft = 0;}},
    style: {position: 'relative', flex: 1, minHeight: 0, overflow: 'clip', outline: 'none', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: mode === 'draw' ? 'crosshair' : mode === 'link' ? 'alias' : 'default',
      ...gridBg(view, c.bg)}},
    h('style', null, '[data-board-drag] iframe{pointer-events:none!important}'),
    mode === 'hand' ? h('div', {key: 'hand', 'data-testid': 'board-hand', title: 'Mãozinha (H): arrastar o quadro. Aperte H ou Esc para voltar', onPointerDown: handDown, onDoubleClick: (e: any) => e.stopPropagation(), style: {position: 'absolute', inset: 0, zIndex: 29, cursor: grabbing ? 'grabbing' : 'grab', touchAction: 'none'}}) : null,
    // camada do quadro: anda (translate) e cresce (scale) sem nunca mudar o desenho por dentro (ver comentario do zoom no topo)
    h('div', {'data-testid': 'board-layer', style: {position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.z + ')'} as any},
      h('svg', {style: {position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none'}, width: 1, height: 1, 'aria-hidden': true},
        h('defs', null, h('marker', {id: 'board-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse'}, h('path', {d: 'M0 0 L10 5 L0 10 z', fill: c.muted}))),
        ...links.map(l => {const ca = {x: l.a.x + l.a.w / 2, y: l.a.y + l.a.h / 2}, end = l.arrow ? edgePoint(ca, l.b) : {x: l.b.x + l.b.w / 2, y: l.b.y + l.b.h / 2}, on = selLink?.from === l.from && selLink?.to === l.to, sw = 2 / Math.max(0.5, view.z);
          return h('g', {key: l.id}, h('line', {x1: ca.x, y1: ca.y, x2: end.x, y2: end.y, stroke: on ? c.accent : c.muted, strokeWidth: on ? sw * 1.5 : sw, strokeDasharray: l.dash ? (sw * 4) + ' ' + (sw * 3) : undefined, strokeLinecap: l.dash ? 'round' : undefined, markerEnd: l.arrow ? 'url(#board-arrow)' : undefined}),
            h('line', {'data-board-link': l.id, 'data-testid': 'board-link', x1: ca.x, y1: ca.y, x2: end.x, y2: end.y, stroke: 'transparent', strokeWidth: 14 / Math.max(0.3, view.z), style: {pointerEvents: 'stroke', cursor: 'pointer'},
              onPointerDown: (e: any) => {e.stopPropagation(); setSel([]); setSelLink({from: l.from, to: l.to});},
              // 08/11/2026 (referencia Weje): dois cliques na ligacao levam a camera ate o item da outra ponta (o mais longe do meio da tela)
              onDoubleClick: (e: any) => {e.stopPropagation(); const mid = center(), far = (g: Geo) => Math.hypot(g.x + g.w / 2 - mid.x, g.y + g.h / 2 - mid.y), t = far(l.b) >= far(l.a) ? l.b : l.a, id = t === l.b ? l.to : l.from; setSelLink(null); setSel([id]); focusOn(t);}}),
            l.label ? h('text', {x: (ca.x + end.x) / 2, y: (ca.y + end.y) / 2 - 6 / view.z, fill: c.text, fontSize: 13 / Math.max(0.6, view.z), textAnchor: 'middle', style: {paintOrder: 'stroke', stroke: c.bg, strokeWidth: 4 / Math.max(0.6, view.z)}}, l.label) : null);}),
        ink ? h('path', {d: ink.map((q, i) => (i ? 'L' : 'M') + q.x + ' ' + q.y).join(' '), fill: 'none', stroke: c.accent, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round'}) : null),
      // 08/11/2026 (Pedro: "o ponto central da pagina pra nao se perder no infinito"): eixos discretos e o 0 no centro
      h('div', {key: 'ox', 'aria-hidden': true, style: {position: 'absolute', left: -6 / view.z, top: 0, width: 12 / view.z, height: 1 / view.z, background: c.muted, opacity: 0.5, pointerEvents: 'none'}}),
      h('div', {key: 'oy', 'aria-hidden': true, style: {position: 'absolute', top: -6 / view.z, left: 0, height: 12 / view.z, width: 1 / view.z, background: c.muted, opacity: 0.5, pointerEvents: 'none'}}),
      h('div', {key: 'o0', 'data-testid': 'board-origin', 'aria-hidden': true, style: {position: 'absolute', left: 10 / view.z, top: 8 / view.z, color: c.muted, opacity: 0.7, fontSize: 14 / view.z, fontWeight: 500, pointerEvents: 'none', userSelect: 'none'}}, '0'),
      guides.x != null ? h('div', {'data-testid': 'board-guide', style: {position: 'absolute', left: guides.x, top: -100000, width: 1 / view.z, height: 200000, background: c.accent, pointerEvents: 'none', zIndex: 2000000}}) : null,
      guides.y != null ? h('div', {'data-testid': 'board-guide', style: {position: 'absolute', top: guides.y, left: -100000, height: 1 / view.z, width: 200000, background: c.accent, pointerEvents: 'none', zIndex: 2000000}}) : null,
      ...vis.map(b => <BoardItem key={b.id} b={b} g={geo(b)} api={p.api} pageId={p.pageId} pages={p.pages} selected={sel.includes(b.id)} editing={editing === b.id} light={light} zoom={view.z} locked={p.locked}
        onDown={onItemDown(b)} onOpen={() => openItem(b)} onResize={(corner: string) => onResize(b, corner)} single={sel.length === 1 && sel[0] === b.id} patchPageBlock={p.patchPageBlock} onPageView={(v: any) => setPageView(b, v)} onUseHere={() => usePageHere(b)} onDup={() => void duplicate([b.id])} onRemove={() => remove([b.id])} onMention={(m: Mention) => {if (m.kind === 'page') {const t = p.pages.find(x => x.id === m.id); if (t) p.onOpenPage(t);}}}
        onChange={(f: (x: PageBlock) => PageBlock) => patchBlock(b.id, f, 'board-text-' + b.id)} onDone={() => {setEditing(null); p.flush(); if (b.type === 'page_link' && b.data?.page_id) p.onPageChanged?.(String(b.data.page_id));}} />),
      box ? h('div', {style: {position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, border: '1px solid ' + c.accent, background: c.accent + '22', pointerEvents: 'none'}}) : null),
    !shown.length ? h('div', {'data-board-ui': '1', style: {position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: c.muted, fontSize: 14, lineHeight: 1.6, pointerEvents: 'none'}},
      h('div', {style: {fontSize: 18, fontWeight: 700, color: c.text, marginBottom: 6}}, 'Quadro vazio'), 'Solte fotos e arquivos aqui, cole qualquer coisa (Ctrl+V)', h('br'), 'ou dê dois cliques no fundo para escrever uma nota.') : null,
    selBar,
    h('input', {'data-board-ui': '1', 'data-testid': 'board-title', value: p.title, placeholder: 'Sem título', 'aria-label': 'Título do quadro', onPointerDown: (e: any) => e.stopPropagation(), onChange: (e: any) => {if (/^history/.test(String(e.nativeEvent?.inputType || ''))) {e.target.blur(); return;} p.onTitle(e.target.value);}, // o Ctrl+Z do Chrome pula para este campo e desfaz o titulo: ignora
      onKeyDown: (e: any) => {if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); if ((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key)) {e.preventDefault(); (e.target as HTMLInputElement).blur();} /* 08/11/2026: o desfazer do navegador no titulo voltava o titulo antigo (o desfazer certo e o da pagina) */},
      style: {userSelect: 'text', WebkitUserSelect: 'text', position: 'absolute', left: 16, top: 12, zIndex: 30, width: 'min(420px, 50%)', height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid transparent', background: 'transparent', color: c.text, fontSize: 20, fontWeight: 700, outline: 'none', fontFamily: 'inherit'},
      onFocus: (e: any) => {e.target.style.borderColor = c.accent; e.target.style.background = c.surface;}, onBlur: (e: any) => {e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'; p.flush();}}),
    bar([btn('T', 'Texto', () => {const nb = addBlock({id: uid(), type: 'text', text: '', data: {}}); setEditing(nb.id);}, false, false, 'board-add-text'),
      btn('edit', mode === 'draw' ? 'Parar de desenhar' : 'Desenhar', () => setMode(mode === 'draw' ? '' : 'draw'), mode === 'draw', false, 'board-draw'),
      btn('clip', 'Arquivo (foto, vídeo, PDF, qualquer um)', () => {anchor.current = center(); p.pickFiles();}, false, false, 'board-add-file'),
      btn('note', 'Nota', () => {const nb = addBlock({id: uid(), type: 'callout', text: '', html: '', data: {}}); setEditing(nb.id);}, false, false, 'board-add-note'),
      btn('checkSquare', 'Lista', () => {const nb = addBlock({id: uid(), type: 'todo', text: '', data: {items: [{id: uid(), text: '', done: false}]}}); setEditing(nb.id);}, false, false, 'board-add-list'),
      btn('mic', rec ? 'Parar e guardar o áudio' : 'Gravar áudio', () => void toggleRec(), !!rec, false, 'board-rec'),
      btn('fileDoc', 'Documento Word', () => {anchor.current = center(); p.createDoc();}, false, false, 'board-add-doc'),
      btn('book', 'Página existente (entra como cópia)', () => setPicker(true), picker, false, 'board-add-page'),
      btn('grid', 'Do app: Agenda, Tarefas, Notas, Lembretes, Listas, Price Tracker, E-mails, Biblioteca', () => setLivePick(true), livePick, false, 'board-add-live')], {left: '50%', bottom: 20, transform: 'translateX(-50%)', height: 54}, 'Inserir no quadro'),
    bar([btn('zoomOut', 'Afastar (Ctrl -)', () => zoomStep(-1)), h('button', {key: 'pct', type: 'button', title: 'Voltar para 100% (Ctrl 0)', onClick: () => zoomAround(1, size2.w / 2, size2.h / 2), 'data-testid': 'board-zoom',
      style: {minWidth: 52, height: 34, border: 0, background: 'transparent', color: c.text, fontSize: 13, fontWeight: 600, cursor: 'pointer'}}, Math.round(view.z * 100) + '%'), btn('zoomIn', 'Aproximar (Ctrl +)', () => zoomStep(1)), btn('home', 'Voltar ao centro (0)', () => glide({...viewRef.current, x: size2.w / 2, y: size2.h / 2}), false, false, 'board-center'), btn('expand', 'Ver tudo', fitAll), btn('search', 'Buscar no quadro (Ctrl+F)', () => setFind(f => f ? null : {q: '', i: 0}), !!find, false, 'board-find-open')],
      {left: 16, bottom: 20, height: 46}, 'Zoom do quadro'),
    rec ? h('div', {'data-board-ui': '1', style: {position: 'absolute', left: '50%', bottom: 84, transform: 'translateX(-50%)', padding: '6px 12px', borderRadius: 10, background: c.dangerBg, color: c.danger, fontSize: 12, fontWeight: 600}}, '● Gravando… clique no microfone para parar') : null,
    selLink ? (() => {const l = links.find(x => x.from === selLink.from && x.to === selLink.to); if (!l) return null; const mx = ((l.a.x + l.a.w / 2) + (l.b.x + l.b.w / 2)) / 2 * view.z + view.x, my = ((l.a.y + l.a.h / 2) + (l.b.y + l.b.h / 2)) / 2 * view.z + view.y;
      return h('div', {'data-board-ui': '1', 'data-testid': 'board-link-bar', onPointerDown: (e: any) => e.stopPropagation(), style: {position: 'absolute', left: Math.max(8, Math.min(size2.w - 360, mx - 170)), top: Math.max(8, Math.min(size2.h - 120, my + 14)), zIndex: 40, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 12, background: c.surface, border: '1px solid ' + c.line, boxShadow: '0 10px 24px rgba(0,0,0,.3)'}},
        h('input', {key: l.id, defaultValue: l.label, placeholder: 'Texto na ligação', 'aria-label': 'Texto na ligação', 'data-testid': 'board-link-label', onKeyDown: (e: any) => {if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setSelLink(null);},
          onBlur: (e: any) => {const v = String(e.target.value || '').slice(0, 120); if (v !== l.label) patchLink(l.from, l.to, o => ({...o, label: v || undefined}));}, style: {width: 170, height: 32, borderRadius: 8, border: '1px solid ' + c.line, background: c.input, color: c.text, padding: '0 8px', fontSize: 13, outline: 'none'}}),
        btn('arrowRight', l.arrow ? 'Tirar a seta' : 'Pôr seta', () => patchLink(l.from, l.to, o => ({...o, arrow: !o.arrow})), l.arrow, false, 'board-link-arrow'),
        btn('more', l.dash ? 'Linha contínua' : 'Linha tracejada', () => patchLink(l.from, l.to, o => ({...o, dash: !o.dash || undefined})), l.dash, false, 'board-link-dash'),
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

function BoardItem({b, g, api, pageId, pages, selected, editing, light, zoom, locked, single, onDown, onOpen, onResize, onChange, onDone, onMention, patchPageBlock, onPageView, onUseHere, onDup, onRemove}: any) {
  // 08/11/2026 (Pedro: "eu digito, ele salva e da um pulo nos conteudos"): o salvamento automatico cria um anexo novo e antes o
  // editor recebia esse anexo e recarregava inteiro (pulo). O editor fica com o arquivo de quando abriu e so grava por tras.
  const editBase = useRef(''); if (b.type === 'file' && !editBase.current && b.data?.attachment_id) editBase.current = String(b.data.attachment_id);
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
    else if ((editing || (isWin(b) && !light)) && editKind(b.data?.mime, b.data?.name) && !locked) body = h('div', {'data-board-editing': '1', style: {width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: c.surface, borderRadius: 8, overflow: 'hidden'}, onPointerDown: (e: any) => {if (!(e.target as HTMLElement).closest?.('[data-board-handle]')) e.stopPropagation();}},
      h('div', {'data-board-handle': '1', 'data-testid': 'board-file-head', title: 'Arraste por aqui para mover', style: {display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid ' + c.line, fontSize: 12, color: c.muted, cursor: 'grab'}}, h('span', {style: {flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, 'Editando ' + (b.data?.name || '') + (b.data?.from_page ? ' · da página ' + (pages.find((x: Entity) => x.id === String(b.data.from_page))?.title || '') : '')), (() => {const fp = String(b.data?.from_page || ''), fb = String(b.data?.from_block || ''), cur = String(b.data?.attachment_id || '');
          if (!fp || !fb || !patchPageBlock) return null; // 08/11 (Pedro): anexo aberto da pagina de um cartao: sincroniza com o anexo da pagina so quando ele quiser
          // o original e o anexo que esta AGORA no bloco da pagina (serve tambem para janelas abertas antes desta versao)
          let orig = String(b.data?.orig_attachment || ''); try {const pg = pages.find((x: Entity) => x.id === fp), bs = JSON.parse(String(pg?.data?.blocks_json || '[]')); const blk = (Array.isArray(bs) ? bs : []).find((x: any) => String(x?.id) === fb); if (blk?.data?.attachment_id) orig = String(blk.data.attachment_id);} catch {}
          const same = !!orig && cur === orig;
          return h('button', {type: 'button', 'data-testid': 'board-file-sync', disabled: same, title: same ? 'O anexo da página já está igual a esta janela' : 'Levar estas mudanças para o anexo original da página', onPointerDown: (e: any) => e.stopPropagation(),
            onClick: () => {if (same) return; void patchPageBlock(fp, fb, (x: PageBlock) => ({...x, data: {...(x.data || {}), attachment_id: cur, name: b.data?.name, mime: b.data?.mime, size: b.data?.size}})).then(() => onChange((x: PageBlock) => ({...x, data: {...(x.data || {}), orig_attachment: cur}}))).catch(() => undefined);},
            style: {border: '1px solid ' + (same ? c.line : c.accent), background: 'transparent', color: same ? c.muted : c.accent, borderRadius: 7, padding: '3px 9px', fontWeight: 700, cursor: same ? 'default' : 'pointer', whiteSpace: 'nowrap'}}, same ? 'Sincronizado com o original' : 'Sincronizar com o original');})(),
        h('button', {type: 'button', 'data-testid': 'board-file-done', title: isWin(b) ? 'Fechar a janela (o arquivo fica no quadro como anexo; dois cliques abre de novo)' : undefined, onPointerDown: (e: any) => e.stopPropagation(), onClick: () => {if (isWin(b)) onChange((x: PageBlock) => ({...x, data: {...(x.data || {}), window: false, board: {...(x.data?.board || {}), w: 280, h: 64}}})); onDone();}, style: {border: 0, background: c.accent, color: c.onAccent, borderRadius: 7, padding: '4px 10px', fontWeight: 700, cursor: 'pointer'}}, 'Pronto')),
      h('div', {style: {flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column'}}, <FileBody api={api} id={String(b.data.attachment_id)} firstId={editBase.current || String(b.data.attachment_id)} name={String(b.data?.name || '')} mime={String(b.data?.mime || '')} zoom={0} onZoom={() => {}} pageId={pageId}
        onSaved={(a: any) => onChange((x: PageBlock) => ({...x, data: {...(x.data || {}), attachment_id: a.id, name: a.name, mime: a.mime, size: a.bytes}}))} />)); // 08/11 (Pedro): salvar fica so na janela; o anexo da pagina so muda com Sincronizar
    else if (preview && !light) body = h('div', {style: {width: '100%', height: '100%', overflow: 'hidden', borderRadius: 8, background: k === 'audio' ? c.surface : '#000', display: 'flex', alignItems: 'center'}},
      h('div', {style: {width: '100%', height: k === 'audio' ? 'auto' : '100%', pointerEvents: selected ? 'auto' : 'none'}, className: 'board-media'}, <InlineMedia api={api} id={String(b.data.attachment_id)} kind={k} name={String(b.data?.name || '')} />));
    else {const meta = (KIND as any)[k] || KIND.other; body = h('div', {style: {width: '100%', height: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', boxSizing: 'border-box', background: c.surface, border: '1px solid ' + c.line, borderRadius: 12, overflow: 'hidden'}},
      h('div', {style: {width: 34, height: 34, flexShrink: 0, borderRadius: 8, background: meta.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center'}}, <Icon name={meta.icon} size={18} color={meta.color} />),
      h('div', {style: {minWidth: 0, flex: 1}}, h('div', {style: {color: c.text, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, b.data?.name || 'Arquivo'),
        h('div', {style: {color: c.muted, fontSize: 11}}, [String(b.data?.name || '').split('.').pop()?.toUpperCase(), sizeLabel(b.data?.size), editKind(b.data?.mime, b.data?.name) ? 'editável' : ''].filter(Boolean).join(' · '))));}
  }
  else if (b.type === 'page_link') body = <PageCard b={b} g={g} pages={pages} editing={editing} light={zoom < 0.15} onDone={onDone} api={api} selected={selected} patchPageBlock={patchPageBlock} tools={{onView: onPageView, onUse: onUseHere, onDup, onRemove}} />;
  else if (b.type === 'bookmark' && b.data?.link) {const L = b.data.link; body = h('div', {style: {width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'hidden', borderRadius: 12, background: c.surface, border: '1px solid ' + c.line, display: 'flex', flexDirection: 'column'}},
    L.image && !light ? h('div', {style: {flex: 1, minHeight: 0, backgroundColor: c.input, backgroundImage: 'url("' + String(L.image).replace(/["\\)]/g, '') + '")', backgroundSize: 'cover', backgroundPosition: 'center'}}) : null,
    h('div', {style: {padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 3}}, h('span', {style: {color: c.text, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}, L.title || L.url),
      h('span', {style: {color: c.muted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}, (L.site || (() => {try {return new URL(L.url).hostname;} catch {return '';}})()) + ' · dois cliques abre')));}
  else if (b.type === 'bookmark' && b.data?.live) body = <LiveCard api={api} kind={b.data.live.kind} id={String(b.data.live.id)} text={String(b.text || '')} />;
  else body = h('div', {style: {padding: 12, background: c.surface, border: '1px solid ' + c.line, borderRadius: 12, color: c.muted, fontSize: 12, width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'hidden'}}, String(b.text || b.type));
  const handle = (corner: string, css: any) => h('div', {key: corner, onPointerDown: onResize(corner), 'aria-label': 'Mudar o tamanho', style: {position: 'absolute', width: 14 / zoom, height: 14 / zoom, borderRadius: 4 / zoom, background: c.surface, border: (2 / zoom) + 'px solid ' + c.accent, cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize', zIndex: 3, ...css}});
  const o = -7 / zoom;
  return h('div', {'data-board-item': '1', 'data-id': b.id, 'data-testid': 'board-item', 'data-type': b.type, 'aria-label': String(b.data?.name || b.text || b.type).slice(0, 80), onPointerDown: onDown, onDoubleClick: (e: any) => {e.stopPropagation(); onOpen();},
    style: {position: 'absolute', left: g.x, top: g.y, width: g.w, height: g.h, zIndex: selected || editing ? 1000000 : g.z || 0, outline: selected && b.type !== 'page_link' && !isWin(b) ? (2 / zoom) + 'px solid ' + c.accent : 'none' /* 08/11 (Pedro): cartao de pagina e janela nao ganham contorno (ja tem moldura) */, outlineOffset: 3 / zoom, borderRadius: 10, cursor: editing ? 'auto' : 'grab', userSelect: editing ? 'text' : 'none'}},
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
  if (editing) return h('div', {key: 'edit', ref, 'data-board-editing': '1', contentEditable: true, suppressContentEditableWarning: true, role: 'textbox', 'aria-multiline': true, 'aria-label': note ? 'Nota' : 'Texto', onBlur: () => {save(); onDone();}, onInput: save,
    // 08/11/2026 (Pedro: "colei e os links e grifados sairam"): colar na nota usa a mesma limpeza das paginas - mantem link,
    // negrito e grifo; tira o fundo/cor da pagina de onde veio; URL sem link vira link
    onPaste: (e: any) => {const dt = e.clipboardData; const text = String(dt?.getData('text/plain') || ''), raw = String(dt?.getData('text/html') || ''); if (!text && !raw) return;
      e.preventDefault(); e.stopPropagation(); let html = raw ? pasteHtml(raw, pasteContext(ref.current)) : '';
      if (!html) {let at = 0; for (const l of findLinks(text)) {html += escapeHtml(text.slice(at, l.start)) + '<a href="' + escapeHtml(l.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(l.url) + '</a>'; at = l.end;} html = (html + escapeHtml(text.slice(at))).replace(/\r?\n/g, '<br>');}
      document.execCommand('insertHTML', false, html); save();}, onPointerDown: (e: any) => e.stopPropagation(), style: {...style, userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text', boxShadow: '0 0 0 2px ' + c.accent}});
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
// tenho uma visao ampla de varias coisas" + "os mesmos mecanismos de la, a pagina nao vira aba do navegador, vira o conteudo com
// edicao"): o cartao de pagina tem Anexo (linha, como um arquivo) ou Visualizacao (a PAGINA DE VERDADE: o proprio site em
// /paginas/<id>?embed=1, sem barras, no tamanho do cartao). Um clique (sem arrastar) usa a pagina ali; arrasta pelo titulo.
// Qualidade: a pagina e desenhada no tamanho real do cartao (antes era desenhada a 980 px e encolhida com zoom, e o navegador
// passava a desenhar o conteudo - PDF, fotos - com 35% da resolucao). Muito afastado (zoom < 15%) ou trancada: so o resumo.
export const pageView = (b: PageBlock): 'attach' | 'list' | 'page' => b.data?.view === 'attach' ? 'attach' : b.data?.view === 'list' ? 'list' : 'page';
type PageTools = {onView: (v: 'attach' | 'page') => void; onUse: () => void; onDup: () => void; onRemove: () => void};
type PageCardProps = {b: PageBlock; g: Geo; pages: Entity[]; editing: boolean; light: boolean; onDone: () => void; api: SofiaApi; selected: boolean; patchPageBlock?: (pageId: string, blockId: string, f: (b: PageBlock) => PageBlock) => Promise<void>; tools?: PageTools};
function PageCard(props: PageCardProps) {
  const v = pageView(props.b);
  return v === 'attach' ? <PageAttachCard {...props} /> : v === 'list' ? <PageListCard {...props} /> : <PageFrameCard {...props} />;
}
// a mesma barra do arquivo na pagina: Anexo | Visualizacao, usar aqui (editar), duplicar, remover
function PageHeadTools({view, tools, editing}: {view: 'attach' | 'list' | 'page'; tools?: PageTools; editing: boolean}) {
  const c = useTheme(); if (!tools) return null;
  const stop = (e: any) => e.stopPropagation();
  const seg = (label: string, v: 'attach' | 'page') => {const on = view === v || (v === 'page' && view === 'list');
    return h('button', {key: v, type: 'button', role: 'radio', 'aria-checked': on, 'data-testid': 'page-card-view-' + v, onPointerDown: stop, onClick: (e: any) => {e.stopPropagation(); if (!on) tools.onView(v);},
      style: {height: 24, padding: '0 9px', border: 0, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: on ? 600 : 500, color: on ? c.text : c.muted, background: on ? c.surface : 'transparent', boxShadow: on ? '0 1px 2px rgba(0,0,0,.18)' : 'none'}}, label);};
  const tool = (icon: any, label: string, run: () => void, id: string, danger = false) => h('button', {key: id, type: 'button', 'aria-label': label, title: label, 'data-testid': id, onPointerDown: stop, onClick: (e: any) => {e.stopPropagation(); run();},
    style: {width: 26, height: 26, border: 0, borderRadius: 6, cursor: 'pointer', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center'}}, <Icon name={icon} size={14} color={danger ? c.danger : c.muted} />);
  return h('div', {'data-board-ui': '1', style: {display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0}},
    h('div', {role: 'radiogroup', 'aria-label': 'Como mostrar a página', style: {display: 'flex', padding: 2, borderRadius: 8, background: c.input, marginRight: 2}}, seg('Anexo', 'attach'), seg('Visualização', 'page')),
    editing ? null : tool('external', 'Usar a página aqui (editar no próprio cartão)', tools.onUse, 'page-card-use'),
    tool('copy', 'Duplicar (cópia independente)', tools.onDup, 'page-card-dup'),
    tool('trash', 'Remover do quadro', tools.onRemove, 'page-card-remove', true));
}
// Anexo: a pagina como uma linha (igual ao arquivo anexado); dois cliques ou "usar aqui" abre a pagina no proprio cartao
function PageAttachCard({b, pages, selected, editing, tools}: PageCardProps) {
  const c = useTheme(), t = pages.find(x => x.id === String(b.data?.page_id || '')), synced = !!b.data?.synced, copy = !!b.data?.source_id && !synced;
  return h('div', {style: {width: '100%', height: '100%', boxSizing: 'border-box', position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', background: c.surface, border: '1px solid ' + c.line, borderRadius: 12}},
    h('div', {style: {width: 34, height: 34, flexShrink: 0, borderRadius: 8, background: c.accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center'}}, <Icon name="book" size={17} color={c.accent} />),
    h('div', {style: {flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2}},
      h('span', {style: {color: c.text, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, t ? (t.title || 'Sem título') : 'Página removida'),
      h('span', {style: {color: c.muted, fontSize: 11, whiteSpace: 'nowrap'}}, ['Página', synced ? 'sincronizada' : copy ? 'cópia' : '', 'dois cliques abre aqui'].filter(Boolean).join(' · '))),
    selected ? h('div', {style: {position: 'absolute', right: 0, bottom: '100%', marginBottom: 8, padding: 3, borderRadius: 9, background: c.surface, border: '1px solid ' + c.line, boxShadow: '0 4px 14px rgba(0,0,0,.25)'}}, <PageHeadTools view="attach" tools={tools} editing={editing} />) : null);
}
// 08/11/2026 (Pedro: "versao mais ampla, adaptada, seguindo esse esquema" + "clicar e abrir o docx na janela flutuante, abrir ou
// fechar o anexo e editar como la"): resumo da pagina no esquema do desenho - arquivo = linha com selo colorido, nome e
// "Word · 38 KB · editavel"; clique abre na janela flutuante (Word/Excel/PowerPoint com os editores; salvar volta para o
// bloco da propria pagina); a setinha abre/fecha o anexo ali mesmo (foto, video, audio, PDF). Texto, titulo, tarefa e foto
// aparecem como na pagina. Com o cartao selecionado, a rodinha rola a lista.
const BADGE: Record<string, {t: string; bg: string; fg: string}> = {pdf: {t: 'PDF', bg: '#3B2330', fg: '#F5A0AE'}, doc: {t: 'W', bg: '#1E2A44', fg: '#7DB6FF'}, sheet: {t: 'X', bg: '#1D3329', fg: '#5FD3A2'}, slides: {t: 'P', bg: '#3A2C1A', fg: '#F2B45C'},
  video: {t: '▶', bg: '#2E2644', fg: '#B5A2FF'}, audio: {t: '♪', bg: '#2E2644', fg: '#B5A2FF'}, image: {t: 'IMG', bg: '#24303A', fg: '#9ED0F0'}, text: {t: 'TXT', bg: '#2A2A30', fg: '#C8C8D0'}, zip: {t: 'ZIP', bg: '#2A2A30', fg: '#C8C8D0'}, other: {t: '•••', bg: '#2A2A30', fg: '#C8C8D0'}};
const KIND_LABEL: Record<string, string> = {pdf: 'PDF', doc: 'Word', sheet: 'Excel', slides: 'PowerPoint', video: 'Vídeo', audio: 'Áudio', image: 'Imagem', text: 'Texto', zip: 'Compactado', other: 'Arquivo'};
function PageListCard({b, pages, api, selected, editing, patchPageBlock, tools}: PageCardProps) {
  const c = useTheme(), id = String(b.data?.page_id || ''), t = pages.find(x => x.id === id), synced = !!b.data?.synced, copy = !!b.data?.source_id && !synced, [busy, setBusy] = useState('');
  let blocks: PageBlock[] = []; try {const bs = JSON.parse(String(t?.data?.blocks_json || '[]')); blocks = Array.isArray(bs) ? bs : [];} catch {}
  const lockedPage = !!t?.data?.lock_json;
  const toggle = async (fb: PageBlock) => {if (!patchPageBlock || !t) return; const k = fileKind(fb.data?.mime, fb.data?.name), on = (fb.data?.view || defaultView(k)) === 'preview'; setBusy(fb.id);
    try {await patchPageBlock(t.id, fb.id, x => ({...x, data: {...(x.data || {}), view: on ? 'attach' : 'preview'}}));} catch {} finally {setBusy('');}};
  const open = (fb: PageBlock) => {const aid = String(fb.data?.attachment_id || ''); if (!aid || !t) return;
    openFileWindow(api, {id: aid, name: String(fb.data?.name || 'arquivo'), mime: String(fb.data?.mime || ''), pageId: lockedPage ? undefined : t.id,
      onSaved: a => {void patchPageBlock?.(t.id, fb.id, x => ({...x, data: {...(x.data || {}), attachment_id: a.id, name: a.name, mime: a.mime, size: a.bytes}}));}});};
  const row = (x: PageBlock) => {
    if (x.type === 'file' && x.data?.attachment_id) {const k = fileKind(x.data?.mime, x.data?.name), bd = BADGE[k] || BADGE.other, on = (x.data?.view || defaultView(k)) === 'preview', canOpen = ['image', 'video', 'audio', 'pdf'].includes(k); // Office: so pela janela, no editor da Sofia (o PDF do navegador ficava ruim)
      return h('div', {key: x.id, style: {display: 'flex', flexDirection: 'column', borderRadius: 12, background: c.surface, border: '1px solid ' + c.line, overflow: 'hidden', flexShrink: 0}},
        h('div', {style: {display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px'}},
          h('button', {type: 'button', 'data-testid': 'page-card-file', title: 'Abrir na janela flutuante' + (editKind(x.data?.mime, x.data?.name) ? ' (editar)' : ''), onPointerDown: (e: any) => e.stopPropagation(), onClick: (e: any) => {e.stopPropagation(); open(x);},
              style: {flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, border: 0, padding: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit'}},
            h('span', {style: {width: 34, height: 34, flexShrink: 0, borderRadius: 9, background: bd.bg, color: bd.fg, fontSize: bd.t.length > 2 ? 10 : 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'}}, bd.t),
            h('span', {style: {flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2}}, h('span', {style: {color: c.text, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, x.data?.name || 'Arquivo'),
              h('span', {style: {color: c.muted, fontSize: 11}}, [KIND_LABEL[k] || 'Arquivo', sizeLabel(x.data?.size), editKind(x.data?.mime, x.data?.name) && !lockedPage ? 'editável' : ''].filter(Boolean).join(' · ')))),
          canOpen ? h('button', {type: 'button', 'data-testid': 'page-card-toggle', 'aria-label': on ? 'Fechar o anexo' : 'Abrir o anexo aqui', title: on ? 'Fechar o anexo' : 'Abrir o anexo aqui', disabled: busy === x.id, onPointerDown: (e: any) => e.stopPropagation(), onClick: (e: any) => {e.stopPropagation(); void toggle(x);},
            style: {width: 28, height: 28, flexShrink: 0, border: 0, borderRadius: 7, background: on ? c.accentSoft : 'transparent', color: on ? c.accent : c.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: on ? 'rotate(180deg)' : 'none'}},
            h('svg', {width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, 'aria-hidden': true}, h('path', {d: 'M6 9l6 6 6-6'}))) : null),
        on && canOpen ? h('div', {style: {borderTop: '1px solid ' + c.line, background: k === 'audio' ? c.surface : '#000', maxHeight: k === 'pdf' || OFFICE_K(k) ? 360 : undefined, overflow: 'hidden'}, onPointerDown: (e: any) => e.stopPropagation()},
          <InlineMedia api={api} id={String(x.data.attachment_id)} kind={k} name={String(x.data?.name || '')} />) : null);}
    if (x.type === 'image' && x.data?.attachment_id) return h('div', {key: x.id, style: {borderRadius: 10, overflow: 'hidden', flexShrink: 0}}, <InlineMedia api={api} id={String(x.data.attachment_id)} kind="image" name="imagem" />);
    const txt = String(x.text || '').trim(); if (!txt) return null;
    if (x.type === 'todo') return h('div', {key: x.id, style: {display: 'flex', gap: 8, alignItems: 'flex-start', color: x.checked ? c.muted : c.text, fontSize: 13, textDecoration: x.checked ? 'line-through' : 'none'}}, h('span', {style: {width: 13, height: 13, marginTop: 2, flexShrink: 0, borderRadius: 3, border: '1.5px solid ' + c.muted, background: x.checked ? c.accent : 'transparent'}}), txt);
    const head = /^heading/.test(x.type);
    return h('div', {key: x.id, style: {color: head ? c.text : c.text, fontSize: x.type === 'heading1' ? 18 : head ? 16 : 13, fontWeight: head ? 700 : 400, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: x.type === 'quote' ? 0.8 : 1}}, (x.type === 'bullet' ? '• ' : '') + txt);};
  return h('div', {style: {width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'hidden', borderRadius: 14, background: c.bg, border: '1px solid ' + c.line, display: 'flex', flexDirection: 'column'}},
    h('div', {style: {height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderBottom: '1px solid ' + c.line}}, <Icon name="book" size={15} color={c.accent} />,
      h('span', {style: {flex: 1, minWidth: 0, color: c.text, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, t ? (t.title || 'Sem título') : 'Página removida'),
      synced ? h('span', {style: {fontSize: 11, fontWeight: 700, color: c.good}}, 'Sincronizada') : copy ? h('span', {style: {fontSize: 11, fontWeight: 700, color: c.muted}}, 'Cópia') : null,
      selected ? <PageHeadTools view="list" tools={tools} editing={editing} /> : null),
    h('div', {'data-board-scroll': selected ? 'on' : 'off', style: {flex: 1, minHeight: 0, overflowY: selected ? 'auto' : 'hidden', padding: 12, display: 'flex', flexDirection: 'column', gap: 8}},
      lockedPage ? h('span', {style: {color: c.muted, fontSize: 12}}, 'Página trancada — dois cliques abre com a senha') : !t ? null : blocks.map(row).filter(Boolean).length ? blocks.map(row) : h('span', {style: {color: c.muted, fontSize: 12}}, 'Página vazia')));
}
const OFFICE_K = (k: string) => k === 'doc' || k === 'sheet' || k === 'slides';
function PageFrameCard({b, pages, editing, light, onDone, selected, tools}: PageCardProps) {
  const c = useTheme(), id = String(b.data?.page_id || ''), t = pages.find(x => x.id === id), synced = !!b.data?.synced, copy = !!b.data?.source_id && !synced, [loaded, setLoaded] = useState(false);
  let lines: string[] = [];
  if (t) {try {const bs = JSON.parse(String(t.data?.blocks_json || '[]')); lines = (Array.isArray(bs) ? bs : []).map((x: any) => String(x.text || x.data?.name || '').trim()).filter(Boolean).slice(0, 10);} catch {}}
  const lockedPage = !!t?.data?.lock_json, live = !!t && !lockedPage && (!light || editing), head = 40;
  useEffect(() => {if (!live) setLoaded(false);}, [live]);
  useEffect(() => {if (!editing) return; const on = (e: KeyboardEvent) => {if (e.key === 'Escape') onDone();}; window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);}, [editing, onDone]);
  return h('div', {'data-board-editing': editing ? '1' : undefined, style: {width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'hidden', borderRadius: 12, background: c.bg, border: '1px solid ' + c.line, display: 'flex', flexDirection: 'column', position: 'relative'}},
    h('div', {'data-board-handle': '1', style: {height: head, flexShrink: 0, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 12px', borderBottom: '1px solid ' + c.line, background: c.surface, cursor: 'grab'}}, <Icon name="book" size={15} color={c.accent} />,
      h('span', {style: {flex: 1, minWidth: 0, color: c.text, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, t ? (t.title || 'Sem título') : 'Página removida'),
      synced ? h('span', {style: {fontSize: 11, fontWeight: 700, color: c.good}}, 'Sincronizada') : copy ? h('span', {style: {fontSize: 11, fontWeight: 700, color: c.muted}}, 'Cópia') : null,
      selected || editing ? <PageHeadTools view="page" tools={tools} editing={editing} /> : null,
      editing ? h('button', {type: 'button', 'data-testid': 'board-page-done', onPointerDown: (e: any) => e.stopPropagation(), onClick: (e: any) => {e.stopPropagation(); onDone();}, style: {border: 0, borderRadius: 7, padding: '4px 10px', background: c.accent, color: c.onAccent, fontWeight: 700, fontSize: 12, cursor: 'pointer'}}, 'Pronto') : null),
    h('div', {style: {flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden'}},
      !loaded || !live ? h('div', {style: {position: 'absolute', inset: 0, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden'}},
        lockedPage ? h('span', {style: {color: c.muted, fontSize: 12}}, 'Página trancada — dois cliques abre com a senha') : lines.length ? lines.map((l, i) => h('span', {key: i, style: {color: c.text, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, l)) : h('span', {style: {color: c.muted, fontSize: 12}}, live ? 'Abrindo a página…' : 'Página vazia')) : null,
      live ? h('iframe', {key: id, src: '/paginas/' + encodeURIComponent(id) + '?embed=1', title: 'Página ' + (t?.title || ''), 'data-testid': 'board-page-frame', onLoad: () => setLoaded(true),
        style: {position: 'absolute', left: 0, top: 0, border: 0, width: '100%', height: '100%', opacity: loaded ? 1 : 0, pointerEvents: editing ? 'auto' : 'none', background: c.bg}}) : null),
    !editing && live ? h('div', {style: {position: 'absolute', right: 10, bottom: 8, padding: '2px 8px', borderRadius: 6, background: c.surface + 'e6', color: c.muted, fontSize: 11, pointerEvents: 'none'}}, 'Um clique: usar a página aqui · arraste pelo título') : null);
}

// 08/11/2026 (Pedro: "essa janela esta bem zuada, pode estar mais proxima disso" - a lista de Paginas da barra lateral):
// a mesma arvore (espacos e subpaginas, icone, setinha para abrir/fechar, cadeado nas trancadas); buscando, vira lista com o caminho.
const isEmojiIcon = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 8 && !/^[a-z0-9_-]+$/i.test(v);
function PagePicker({pages, exclude, onPick, onClose, title = 'Trazer página para o quadro', hint = 'Entra como uma cópia independente (mexer nela não muda a original). Se quiser, depois é só clicar em sincronizar.', extra}: {pages: Entity[]; exclude: string; onPick: (p: Entity) => void; onClose: () => void; title?: string; hint?: string; extra?: {label: string; run: () => void}}) {
  const c = useTheme(), [q, setQ] = useState(''), [open, setOpen] = useState<Record<string, boolean>>({}), [hover, setHover] = useState('');
  const live = useMemo(() => pages.filter(x => x.state !== 'archived' && !(x.tags || []).includes('board-copy')), [pages]); // copias de quadro ficam escondidas: nunca aparecem como subpagina
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
