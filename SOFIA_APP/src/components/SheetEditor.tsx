// 07/11/2026 (Pedro: "quero que faca o mesmo para PowerPoint e Excel"): editor de planilha PROPRIO da Sofia.
// - Abre o .xlsx do bloco (ExcelJS, carregado so quando abre uma planilha) e mostra a grade como no Excel: abas das planilhas
//   (trocar, nova, renomear com clique duplo), letras das colunas, numeros das linhas, barra de formula.
// - Clicar/setas/Tab/Enter navegam; digitar edita; F2 ou clique duplo edita o que ja tem; Delete limpa; Ctrl+C/Ctrl+V com
//   o Excel/Sheets (texto separado por tabulacao); Shift+setas ou arrastar seleciona varias celulas.
// - Barra: negrito, italico, sublinhado, cor da letra, marca-texto (preenchimento), alinhamento, formato de numero (geral,
//   2 casas, R$, %, data), inserir/apagar linha e coluna; largura da coluna arrastando a borda do cabecalho; tema claro/escuro.
// - Formula comeca com "=": guardada como formula (o Excel recalcula ao abrir); aqui a Sofia calcula SOMA/MEDIA/MIN/MAX/
//   CONT.NUM de intervalos e + - * / entre celulas para mostrar o resultado.
// - Salva sozinho 2 s depois de parar (e no botao Salvar): o arquivo inteiro (estilos, mesclagens e outras planilhas
//   preservados) vira um anexo novo e passa a ser o arquivo do bloco.
import React, {useEffect, useMemo, useRef, useState} from 'react';
import type {SofiaApi} from '../lib/api';
import {errorText} from '../lib/chat-model';
import {uploadOfficeBytes} from '../lib/office-save';
import {useEditorColors, ThemeToggle, useEditorZoom, useWheelZoom, ZoomControl} from './EditorChrome';

export type OfficeSaved = {id: string; name: string; mime: string; bytes: number};
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const h = React.createElement as any;
async function loadExcel(): Promise<any> {const m: any = await import('exceljs/dist/exceljs.min.js' as any); return m.default || m;}

/** Planilha nova (uma aba "Planilha1") para o "/planilha". */
export async function blankXlsx(): Promise<Uint8Array> {
  const X = await loadExcel(), wb = new X.Workbook(); wb.creator = 'Sofia'; wb.addWorksheet('Planilha1');
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// ---------- endereços ----------
export const colName = (n: number) => {let s = ''; while (n > 0) {const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26);} return s;};
const colNum = (s: string) => {let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n;};
const parseRef = (r: string) => {const m = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(r.trim()); return m ? {c: colNum(m[1]), r: Number(m[2])} : null;};

// ---------- valores ----------
function rawOf(cell: any): string {
  const v = cell?.value; if (v == null) return '';
  if (typeof v === 'object') {
    if ('formula' in v || 'sharedFormula' in v) return '=' + (v.formula || v.sharedFormula || '');
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join('');
    if ('text' in v) return String(v.text);
    if (v instanceof Date) return v.toLocaleDateString('pt-BR');
    if ('error' in v) return String(v.error);
  }
  if (typeof v === 'number') return String(v).replace('.', ',');
  return String(v);
}
/** Numero de uma celula para as contas (formula: resultado guardado ou calculado aqui). */
function numOf(ws: any, r: number, c: number, depth: number): number {
  const v = ws.getCell(r, c).value; if (v == null || v === '') return 0;
  if (typeof v === 'number') return v; if (v instanceof Date) return v.getTime() / 864e5 + 25569;
  if (typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)) {const res = v.result; if (typeof res === 'number') return res; const e = evaluate(String(v.formula || ''), ws, depth + 1); return typeof e === 'number' ? e : 0;}
  const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n;
}
function rangeNums(ws: any, arg: string, depth: number): number[] {
  const out: number[] = [];
  for (const part of arg.split(/[;,]/)) {const p = part.trim(); if (!p) continue;
    const [a, b] = p.split(':'); const ra = parseRef(a), rb = b ? parseRef(b) : ra;
    if (ra && rb) {for (let r = Math.min(ra.r, rb.r); r <= Math.max(ra.r, rb.r); r++) for (let c = Math.min(ra.c, rb.c); c <= Math.max(ra.c, rb.c); c++) {const v = ws.getCell(r, c).value; if (v !== null && v !== undefined && v !== '') out.push(numOf(ws, r, c, depth));}}
    else {const n = Number(p.replace(',', '.')); if (!isNaN(n)) out.push(n);}}
  return out;
}
/** Conta simples para mostrar: funcoes de intervalo e + - * / ( ) entre celulas e numeros. Sem eval (a pagina proibe). */
function evaluate(formula: string, ws: any, depth = 0): number | string {
  if (depth > 20) return '#REF!';
  try {
    let f = formula.trim().replace(/^=/, '');
    const FN = /\b(SUM|SOMA|AVERAGE|MÉDIA|MEDIA|MIN|MAX|COUNT|CONT\.NUM)\(([^()]*)\)/i;
    for (let g = 0; g < 50 && FN.test(f); g++) f = f.replace(FN, (_m, fn, args) => {const xs = rangeNums(ws, args, depth), F = fn.toUpperCase();
      const v = /SUM|SOMA/.test(F) ? xs.reduce((a, b) => a + b, 0) : /AVERAGE|MÉDIA|MEDIA/.test(F) ? (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0) : F === 'MIN' ? (xs.length ? Math.min(...xs) : 0) : F === 'MAX' ? (xs.length ? Math.max(...xs) : 0) : xs.length;
      return '(' + v + ')';});
    f = f.replace(/\$?[A-Z]{1,3}\$?\d+/gi, ref => {const p = parseRef(ref); return p ? '(' + numOf(ws, p.r, p.c, depth) + ')' : ref;}).replace(/(\d),(\d)/g, '$1.$2');
    if (/[^0-9+\-*/().\s eE]/.test(f)) return '#NOME?';
    const v = arith(f); return isFinite(v) ? v : '#DIV/0!';
  } catch {return '#ERRO';}
}
function arith(src: string): number {
  let i = 0; const s = src.replace(/\s+/g, '');
  const num = (): number => {if (s[i] === '(') {i++; const v = expr(); i++; return v;} if (s[i] === '-') {i++; return -num();} if (s[i] === '+') {i++; return num();}
    const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(s.slice(i)); if (!m) throw new Error('x'); i += m[0].length; return Number(m[0]);};
  const term = (): number => {let v = num(); while (s[i] === '*' || s[i] === '/') {const op = s[i++], r = num(); v = op === '*' ? v * r : v / r;} return v;};
  const expr = (): number => {let v = term(); while (s[i] === '+' || s[i] === '-') {const op = s[i++], r = term(); v = op === '+' ? v + r : v - r;} return v;};
  const v = expr(); if (i < s.length) throw new Error('x'); return v;
}
const NUMFMTS: [string, string][] = [['', 'Geral'], ['0.00', 'Número'], ['"R$" #,##0.00', 'Moeda (R$)'], ['0%', 'Porcentagem'], ['dd/mm/yyyy', 'Data']];
function fmt(v: any, numFmt: string | undefined): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) return v.toLocaleDateString('pt-BR');
  if (typeof v === 'number') {
    const f = numFmt || '';
    if (/%/.test(f)) return (v * 100).toLocaleString('pt-BR', {maximumFractionDigits: /0\.0/.test(f) ? 2 : 0}) + '%';
    if (/R\$|\$/.test(f)) return 'R$ ' + v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (/d.*m.*y|y.*m.*d/i.test(f)) return new Date(Math.round((v - 25569) * 864e5)).toLocaleDateString('pt-BR', {timeZone: 'UTC'});
    if (/0\.00/.test(f)) return v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    return Number.isInteger(v) ? String(v) : v.toLocaleString('pt-BR', {maximumFractionDigits: 10});
  }
  return String(v);
}
function shown(ws: any, r: number, c: number): string {
  const cell = ws.getCell(r, c), v = cell.value, nf = cell.numFmt;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('formula' in v || 'sharedFormula' in v) {const res = v.result; const val = res !== undefined && res !== null && typeof res !== 'object' ? res : evaluate(String(v.formula || v.sharedFormula || ''), ws); return fmt(val, nf);}
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join('');
    if ('text' in v) return String(v.text); if ('error' in v) return String(v.error);
  }
  return fmt(v, nf);
}
/** O que a pessoa digitou -> valor da celula. */
function parseInput(text: string): any {
  const t = text.trim(); if (!t) return null;
  if (t.startsWith('=')) return {formula: t.slice(1)};
  const pct = /^(-?[\d.]*,?\d+)\s*%$/.exec(t); if (pct) return Number(pct[1].replace(/\./g, '').replace(',', '.')) / 100;
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$|^-?\d+\.\d+$/.test(t)) {const n = Number(/,/.test(t) || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t); if (!isNaN(n)) return n;}
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t); if (d) return new Date(Date.UTC(Number(d[3]), Number(d[2]) - 1, Number(d[1])));
  return text;
}
const argbToCss = (argb?: string) => {if (!argb || argb.length < 6) return ''; const hex = argb.length === 8 ? argb.slice(2) : argb; return '#' + hex;};
const cssToArgb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase();

const ROW_H = 24, HEAD_W = 46, HEAD_H = 24;
const pxOfWidth = (w?: number) => Math.round(((w || 9.14) * 7) + 5);
const HIGHLIGHTS: [string, string][] = [['Amarelo', '#fff176'], ['Verde', '#b9f6ca'], ['Azul', '#b3e5fc'], ['Rosa', '#f8bbd0'], ['Laranja', '#ffcc80']];
const COLORS: [string, string][] = [['Preto', '#000000'], ['Vermelho', '#d32f2f'], ['Azul', '#1565c0'], ['Verde', '#2e7d32'], ['Roxo', '#6a1b9a'], ['Cinza', '#616161']];
type Sel = {r: number; c: number; r2: number; c2: number};

export function SheetEditor({api, name, url, pageId, onSaved}: {api: SofiaApi; id: string; name: string; url: string; pageId: string; onSaved: (a: OfficeSaved) => void}) {
  const [c, toggleTheme] = useEditorColors(), [zoom, setZoom] = useEditorZoom('xlsx');
  const wb = useRef<any>(null), [state, setState] = useState<'loading' | 'ready' | 'error'>('loading'), [err, setErr] = useState(''), [, setTick] = useState(0);
  const [sheet, setSheet] = useState(0), [sel, setSel] = useState<Sel>({r: 1, c: 1, r2: 1, c2: 1}), [editing, setEditing] = useState<{text: string; bar: boolean} | null>(null);
  const [scroll, setScroll] = useState({top: 0, left: 0, height: 600}), [renaming, setRenaming] = useState<number | null>(null), [status, setStatus] = useState('');
  const grid = useRef<any>(null), dirty = useRef(false), timer = useRef<any>(null), saving = useRef(false), dragSel = useRef(false);
  const onSavedRef = useRef(onSaved); onSavedRef.current = onSaved;
  // edicao em andamento tambem num ref: teclas digitadas logo depois do Enter (antes de a tela redesenhar) nao se perdem
  const editRef = useRef<{text: string; bar: boolean} | null>(null); editRef.current = editing;
  const startEdit = (v: {text: string; bar: boolean} | null) => {editRef.current = v; setEditing(v);};
  const selRef = useRef(sel); selRef.current = sel;
  const redraw = () => setTick(t => t + 1);
  useEffect(() => {let live = true; setState('loading');
    (async () => {const buf = await fetch(url).then(r => {if (!r.ok) throw new Error('Não consegui abrir a planilha (' + r.status + ').'); return r.arrayBuffer();});
      const X = await loadExcel(), book = new X.Workbook(); await book.xlsx.load(buf); if (!book.worksheets.length) book.addWorksheet('Planilha1');
      if (!live) return; wb.current = book; setSheet(0); setState('ready'); setTimeout(() => grid.current?.focus?.(), 50);})()
      .catch(e => {if (live) {setErr(errorText(e)); setState('error');}});
    return () => {live = false;};}, [url]);
  const ws = () => wb.current?.worksheets[sheet];
  const save = async () => {if (saving.current || !dirty.current || !wb.current) return; saving.current = true; dirty.current = false; setStatus('Salvando…');
    try {const buf = await wb.current.xlsx.writeBuffer(); const a = await uploadOfficeBytes(api, pageId, new Uint8Array(buf), name, XLSX_MIME); onSavedRef.current(a); setStatus('Salvo');}
    catch (e) {dirty.current = true; setStatus('Não salvo: ' + errorText(e));}
    finally {saving.current = false; if (dirty.current) schedule();}};
  const schedule = () => {clearTimeout(timer.current); timer.current = setTimeout(() => void save(), 2000);};
  useEffect(() => () => {clearTimeout(timer.current); if (dirty.current) void save();}, []);
  const changed = () => {dirty.current = true; setStatus('Editando…'); schedule(); redraw();};

  const s = ws();
  const rows = s ? Math.max(60, s.rowCount + 30) : 60, cols = s ? Math.max(20, s.columnCount + 6) : 20;
  const widths = useMemo(() => Array.from({length: cols + 1}, (_, i) => i === 0 ? HEAD_W : pxOfWidth(s?.getColumn(i).width)), [cols, s, sheet, (s?.columns || []).map((x: any) => x?.width).join(',')]);
  const lefts = useMemo(() => {const a = [0]; for (let i = 1; i <= cols + 1; i++) a[i] = a[i - 1] + widths[i - 1]; return a;}, [widths, cols]);
  const range = {r1: Math.min(sel.r, sel.r2), r2: Math.max(sel.r, sel.r2), c1: Math.min(sel.c, sel.c2), c2: Math.max(sel.c, sel.c2)};
  const each = (fn: (cell: any) => void) => {if (!s) return; for (let r = range.r1; r <= range.r2; r++) for (let cc = range.c1; cc <= range.c2; cc++) fn(s.getCell(r, cc));};

  const commit = (text: string, move: [number, number] | null) => {if (!s || !editRef.current) return; const at = selRef.current, cell = s.getCell(at.r, at.c), before = rawOf(cell);
    startEdit(null);
    if (text !== before) {const v = parseInput(text); cell.value = v; if (typeof v === 'number' && /%\s*$/.test(text.trim())) cell.numFmt = '0%'; if (v instanceof Date && !cell.numFmt) cell.numFmt = 'dd/mm/yyyy'; changed();}
    if (move) go(at.r + move[0], at.c + move[1]); grid.current?.focus?.();};
  const go = (r: number, cc: number, extend = false) => {r = Math.max(1, Math.min(rows, r)); cc = Math.max(1, Math.min(cols, cc));
    const next = extend ? {...selRef.current, r2: r, c2: cc} : {r, c: cc, r2: r, c2: cc}; selRef.current = next; setSel(next); ensureVisible(r, cc);};
  const ensureVisible = (r: number, cc: number) => {const g = grid.current as HTMLElement | null; if (!g) return; const top = (HEAD_H + (r - 1) * ROW_H) * zoom, rh = ROW_H * zoom, hh = HEAD_H * zoom;
    if (top < g.scrollTop + hh) g.scrollTop = top - hh; else if (top + rh > g.scrollTop + g.clientHeight) g.scrollTop = top + rh - g.clientHeight;
    const L = lefts[cc], R = lefts[cc + 1]; if (L < g.scrollLeft + HEAD_W) g.scrollLeft = L - HEAD_W; else if (R > g.scrollLeft + g.clientWidth) g.scrollLeft = R - g.clientWidth;};
  const onKey = (e: any) => {
    if (editRef.current) {if (e.target !== grid.current) return; const ed = editRef.current; // a caixa de edicao ainda nao apareceu
      if (e.key === 'Enter') {e.preventDefault(); commit(ed.text, e.shiftKey ? [-1, 0] : [1, 0]);} else if (e.key === 'Tab') {e.preventDefault(); commit(ed.text, [0, e.shiftKey ? -1 : 1]);}
      else if (e.key === 'Escape') {e.preventDefault(); startEdit(null);} else if (e.key === 'Backspace') {e.preventDefault(); startEdit({...ed, text: ed.text.slice(0, -1)});}
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {e.preventDefault(); startEdit({...ed, text: ed.text + e.key});} return;}
    if (!s || renaming !== null) return; const sel = selRef.current, k = e.key, ctrl = e.ctrlKey || e.metaKey, cur = e.shiftKey ? {r: sel.r2, c: sel.c2} : {r: sel.r, c: sel.c};
    const mv: Record<string, [number, number]> = {ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]};
    if (mv[k]) {e.preventDefault(); go(cur.r + mv[k][0], cur.c + mv[k][1], e.shiftKey); return;}
    if (k === 'Tab') {e.preventDefault(); go(sel.r, sel.c + (e.shiftKey ? -1 : 1)); return;}
    if (k === 'Enter') {e.preventDefault(); if (e.shiftKey) go(sel.r - 1, sel.c); else startEdit({text: rawOf(s.getCell(sel.r, sel.c)), bar: false}); return;}
    if (k === 'F2') {e.preventDefault(); startEdit({text: rawOf(s.getCell(sel.r, sel.c)), bar: false}); return;}
    if (k === 'Delete' || k === 'Backspace') {e.preventDefault(); each(cell => {cell.value = null;}); changed(); return;}
    if (ctrl && /^[biu]$/i.test(k)) {e.preventDefault(); toggleFont(k.toLowerCase() === 'b' ? 'bold' : k.toLowerCase() === 'i' ? 'italic' : 'underline'); return;}
    if (ctrl && (k === 's' || k === 'S')) {e.preventDefault(); dirty.current = true; void save(); return;}
    if (ctrl && (k === 'z' || k === 'y')) return;
    if (!ctrl && !e.altKey && k.length === 1) {e.preventDefault(); startEdit({text: k, bar: false});}
  };
  const onCopy = (e: any) => {if (editing || !s) return; const lines: string[] = []; for (let r = range.r1; r <= range.r2; r++) {const row: string[] = []; for (let cc = range.c1; cc <= range.c2; cc++) row.push(shown(s, r, cc)); lines.push(row.join('\t'));}
    e.clipboardData?.setData('text/plain', lines.join('\n')); e.preventDefault();};
  const onPaste = (e: any) => {if (editing || !s) return; const t = e.clipboardData?.getData('text/plain'); if (!t) return; e.preventDefault();
    t.replace(/\r/g, '').replace(/\n$/, '').split('\n').forEach((line: string, i: number) => line.split('\t').forEach((val, j) => {s.getCell(sel.r + i, sel.c + j).value = parseInput(val);})); changed();};
  const toggleFont = (key: 'bold' | 'italic' | 'underline') => {if (!s) return; const on = !s.getCell(sel.r, sel.c).font?.[key]; each(cell => {cell.font = {...(cell.font || {}), [key]: on};}); changed();};
  const setFontColor = (hex: string) => {each(cell => {cell.font = {...(cell.font || {}), color: {argb: cssToArgb(hex)}};}); changed();};
  const setFill = (hex: string | null) => {each(cell => {cell.fill = hex ? {type: 'pattern', pattern: 'solid', fgColor: {argb: cssToArgb(hex)}} : {type: 'pattern', pattern: 'none'};}); changed();};
  const setAlign = (a: string) => {each(cell => {cell.alignment = {...(cell.alignment || {}), horizontal: a};}); changed();};
  const setNumFmt = (f: string) => {each(cell => {cell.numFmt = f || undefined;}); changed();};
  const rowOp = (del: boolean) => {if (!s) return; if (del) s.spliceRows(range.r1, range.r2 - range.r1 + 1); else s.spliceRows(sel.r, 0, []); changed();};
  const colOp = (del: boolean) => {if (!s) return; if (del) s.spliceColumns(range.c1, range.c2 - range.c1 + 1); else s.spliceColumns(sel.c, 0, []); changed();};
  const colResize = (cc: number) => (e: any) => {e.preventDefault(); e.stopPropagation(); if (!s) return; const sx = e.clientX, w0 = widths[cc];
    const mv = (ev: PointerEvent) => {s.getColumn(cc).width = Math.max(2, (Math.max(20, w0 + (ev.clientX - sx) / zoom) - 5) / 7); redraw();};
    const up = () => {window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); changed();}; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);};
  const addSheet = () => {if (!wb.current) return; let n = wb.current.worksheets.length + 1; while (wb.current.getWorksheet('Planilha' + n)) n++; wb.current.addWorksheet('Planilha' + n); setSheet(wb.current.worksheets.length - 1); setSel({r: 1, c: 1, r2: 1, c2: 1}); changed();};

  // ---------- barra ----------
  const B = (label: string, title: string, run: () => void, extra: any = {}, on = false) => h('button', {key: title, type: 'button', title, 'aria-label': title, onMouseDown: (e: any) => {e.preventDefault(); run();},
    style: {height: 28, minWidth: 28, padding: '0 6px', border: 0, borderRadius: 6, background: on ? c.line : 'transparent', color: c.text, cursor: 'pointer', fontSize: 13, ...extra}}, label);
  const sep = (k: string) => h('span', {key: k, style: {width: 1, height: 18, background: c.line, margin: '0 4px'}});
  const swatch = (k: string, color: string, title: string, run: () => void) => h('button', {key: k, type: 'button', title, 'aria-label': title, onMouseDown: (e: any) => {e.preventDefault(); run();}, style: {width: 18, height: 18, borderRadius: 4, border: '1px solid ' + c.line, background: color, cursor: 'pointer', padding: 0}});
  const cur = s?.getCell(sel.r, sel.c), font = cur?.font || {};
  const selectStyle = {height: 28, borderRadius: 6, border: '1px solid ' + c.line, background: c.field, color: c.text, fontSize: 12, padding: '0 4px'};
  const bar = h('div', {style: {display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, padding: '6px 8px', borderBottom: '1px solid ' + c.line, background: c.bar, flexShrink: 0}},
    B('N', 'Negrito (Ctrl+B)', () => toggleFont('bold'), {fontWeight: 800}, !!font.bold), B('I', 'Itálico (Ctrl+I)', () => toggleFont('italic'), {fontStyle: 'italic', fontFamily: 'serif'}, !!font.italic),
    B('S', 'Sublinhado (Ctrl+U)', () => toggleFont('underline'), {textDecoration: 'underline'}, !!font.underline), sep('s1'),
    h('span', {key: 'fc', style: {display: 'flex', alignItems: 'center', gap: 3, padding: '0 4px'}}, h('span', {style: {fontSize: 11, color: c.muted, marginRight: 2}}, 'Cor'), ...COLORS.map(([n, col]) => swatch('c' + n, col, 'Cor da letra ' + n.toLowerCase(), () => setFontColor(col)))), sep('s2'),
    h('span', {key: 'hl', style: {display: 'flex', alignItems: 'center', gap: 3, padding: '0 4px'}}, h('span', {style: {fontSize: 11, color: c.muted, marginRight: 2}}, 'Preencher'),
      ...HIGHLIGHTS.map(([n, col]) => swatch('h' + n, col, 'Preencher ' + n.toLowerCase(), () => setFill(col))), B('⌫', 'Sem preenchimento', () => setFill(null))), sep('s3'),
    B('⯇≡', 'Alinhar à esquerda', () => setAlign('left'), {fontSize: 11}), B('≡', 'Centralizar', () => setAlign('center')), B('≡⯈', 'Alinhar à direita', () => setAlign('right'), {fontSize: 11}), sep('s4'),
    h('select', {key: 'nf', 'aria-label': 'Formato do número', value: '', onChange: (e: any) => {setNumFmt(e.target.value === 'geral' ? '' : e.target.value); setTimeout(() => grid.current?.focus?.(), 0);}, style: selectStyle},
      h('option', {value: '', disabled: true}, 'Formato'), ...NUMFMTS.map(([f, label]) => h('option', {key: label, value: f || 'geral'}, label))), sep('s5'),
    B('+ Linha', 'Inserir linha acima', () => rowOp(false), {fontSize: 12}), B('− Linha', 'Apagar linha', () => rowOp(true), {fontSize: 12}),
    B('+ Coluna', 'Inserir coluna à esquerda', () => colOp(false), {fontSize: 12}), B('− Coluna', 'Apagar coluna', () => colOp(true), {fontSize: 12}),
    h('span', {key: 'sp', style: {flex: 1}}),
    h(ZoomControl, {key: 'zoom', colors: c, zoom, setZoom}), h('span', {key: 'gz', style: {width: 6}}), h(ThemeToggle, {key: 'theme', colors: c, toggle: toggleTheme}), h('span', {key: 'gap', style: {width: 6}}),
    h('span', {key: 'st', style: {fontSize: 11, color: /Não salvo/.test(status) ? c.danger : c.muted, marginRight: 6}}, status),
    B('Salvar', 'Salvar agora', () => {dirty.current = true; void save();}, {background: c.accent, color: c.onAccent, fontWeight: 600, padding: '0 10px'}));
  const fbar = h('div', {style: {display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderBottom: '1px solid ' + c.line, background: c.bar, flexShrink: 0}},
    h('span', {style: {minWidth: 56, fontSize: 12, color: c.muted, fontFamily: 'ui-monospace,Menlo,Consolas,monospace'}}, colName(sel.c) + sel.r + (range.r1 !== range.r2 || range.c1 !== range.c2 ? ':' + colName(range.c2) + range.r2 : '')),
    h('span', {style: {fontSize: 13, color: c.muted, fontStyle: 'italic'}}, 'fx'),
    h('input', {'aria-label': 'Barra de fórmula', value: editing ? editing.text : (cur ? rawOf(cur) : ''), onFocus: () => {if (!editing && cur) startEdit({text: rawOf(cur), bar: true});},
      onChange: (e: any) => startEdit({text: e.target.value, bar: true}), onKeyDown: (e: any) => {if (e.key === 'Enter') {e.preventDefault(); commit(editing?.text ?? '', [1, 0]);} if (e.key === 'Escape') {startEdit(null); grid.current?.focus?.();}},
      onBlur: () => {if (editing?.bar) commit(editing.text, null);},
      style: {flex: 1, height: 26, border: '1px solid ' + c.line, borderRadius: 6, padding: '0 8px', background: c.field, color: c.text, fontSize: 13, outline: 'none'}}));

  // ---------- grade (so as linhas que aparecem) ----------
  useWheelZoom(grid, zoom, setZoom, state === 'ready');
  const sTop = scroll.top / zoom, sLeft = scroll.left / zoom, first = Math.max(1, Math.floor(sTop / ROW_H) - 5), last = Math.min(rows, first + Math.ceil(scroll.height / zoom / ROW_H) + 12); // zoom do documento: posicoes em px sem zoom
  const gridW = lefts[cols + 1], gridH = HEAD_H + rows * ROW_H, cellBase = {position: 'absolute', height: ROW_H, boxSizing: 'border-box', borderRight: '1px solid #e1e1e6', borderBottom: '1px solid #e1e1e6', padding: '0 5px', fontSize: 13, lineHeight: ROW_H - 1 + 'px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip', color: '#111', fontFamily: 'Calibri, Carlito, Arial, sans-serif'};
  const cells: any[] = [];
  if (s && state === 'ready') {
    for (let r = first; r <= last; r++) {
      const top = HEAD_H + (r - 1) * ROW_H;
      cells.push(h('div', {key: 'rh' + r, style: {...cellBase, left: sLeft, top, width: HEAD_W, background: r >= range.r1 && r <= range.r2 ? '#dfe3ea' : '#f3f3f6', color: '#555', textAlign: 'center', fontSize: 11, zIndex: 2}, onMouseDown: (e: any) => {e.preventDefault(); setSel({r, c: 1, r2: r, c2: cols}); grid.current?.focus?.();}}, r));
      for (let cc = 1; cc <= cols; cc++) {
        const cell = s.getCell(r, cc), f = cell.font || {}, fill = cell.fill, al = cell.alignment?.horizontal, text = shown(s, r, cc), v = cell.value;
        const isNum = typeof v === 'number' || (v && typeof v === 'object' && 'formula' in v && typeof (v.result ?? evaluate(String(v.formula || ''), s)) === 'number');
        const bg = fill && fill.type === 'pattern' && fill.pattern === 'solid' ? argbToCss(fill.fgColor?.argb) : '';
        const inSel = r >= range.r1 && r <= range.r2 && cc >= range.c1 && cc <= range.c2;
        cells.push(h('div', {key: r + ':' + cc, 'data-cell': colName(cc) + r,
          onMouseDown: (e: any) => {if (e.button !== 0) return; e.preventDefault(); if (editing) commit(editing.text, null); if (e.shiftKey) setSel(p => ({...p, r2: r, c2: cc})); else setSel({r, c: cc, r2: r, c2: cc}); dragSel.current = true; grid.current?.focus?.();},
          onMouseEnter: () => {if (dragSel.current) setSel(p => ({...p, r2: r, c2: cc}));},
          onDoubleClick: () => startEdit({text: rawOf(cell), bar: false}),
          style: {...cellBase, left: lefts[cc], top, width: widths[cc], background: bg || '#fff', fontWeight: f.bold ? 700 : 400, fontStyle: f.italic ? 'italic' : 'normal', textDecoration: f.underline ? 'underline' : 'none',
            color: argbToCss(f.color?.argb) || '#111', textAlign: al === 'center' ? 'center' : al === 'right' ? 'right' : al === 'left' ? 'left' : isNum ? 'right' : 'left', boxShadow: inSel ? 'inset 0 0 0 9999px rgba(33,115,70,.10)' : 'none'}}, text));
      }
    }
    // cabecalho das colunas (fica no alto ao rolar)
    for (let cc = 1; cc <= cols; cc++) cells.push(h('div', {key: 'ch' + cc, style: {...cellBase, top: sTop, left: lefts[cc], width: widths[cc], height: HEAD_H, lineHeight: HEAD_H - 1 + 'px', background: cc >= range.c1 && cc <= range.c2 ? '#dfe3ea' : '#f3f3f6', color: '#555', textAlign: 'center', fontSize: 11, zIndex: 3},
      onMouseDown: (e: any) => {e.preventDefault(); setSel({r: 1, c: cc, r2: rows, c2: cc}); grid.current?.focus?.();}}, colName(cc),
      h('div', {onPointerDown: colResize(cc), title: 'Arraste para mudar a largura', style: {position: 'absolute', right: -3, top: 0, width: 6, height: '100%', cursor: 'col-resize', zIndex: 4}})));
    cells.push(h('div', {key: 'corner', style: {...cellBase, top: sTop, left: sLeft, width: HEAD_W, height: HEAD_H, background: '#ebebf0', zIndex: 4}}));
    // cursor da celula ativa
    const top = HEAD_H + (sel.r - 1) * ROW_H;
    cells.push(h('div', {key: 'cursor', style: {position: 'absolute', left: lefts[sel.c] - 1, top: top - 1, width: widths[sel.c] + 1, height: ROW_H + 1, border: '2px solid #217346', boxSizing: 'border-box', pointerEvents: 'none', zIndex: 1}}));
    if (editing && !editing.bar) cells.push(h('input', {key: 'ed', autoFocus: true, 'aria-label': 'Editar célula ' + colName(sel.c) + sel.r, value: editing.text, onChange: (e: any) => startEdit({text: e.target.value, bar: false}),
      onKeyDown: (e: any) => {if (e.key === 'Enter') {e.preventDefault(); commit(editing.text, e.shiftKey ? [-1, 0] : [1, 0]);} else if (e.key === 'Tab') {e.preventDefault(); commit(editing.text, [0, e.shiftKey ? -1 : 1]);} else if (e.key === 'Escape') {e.preventDefault(); startEdit(null); grid.current?.focus?.();}},
      onBlur: () => {if (editing && !editing.bar) commit(editing.text, null);},
      style: {position: 'absolute', left: lefts[sel.c], top, minWidth: widths[sel.c], height: ROW_H, boxSizing: 'border-box', border: '2px solid #217346', padding: '0 4px', fontSize: 13, fontFamily: 'Calibri, Carlito, Arial, sans-serif', outline: 'none', zIndex: 5, background: '#fff', color: '#111'}}));
  }
  const sheets = wb.current?.worksheets || [];
  const tabs = h('div', {style: {display: 'flex', alignItems: 'center', gap: 2, padding: '4px 8px', borderTop: '1px solid ' + c.line, background: c.bar, flexShrink: 0, overflowX: 'auto'}},
    ...sheets.map((w: any, i: number) => renaming === i
      ? h('input', {key: 'rn' + i, autoFocus: true, defaultValue: w.name, 'aria-label': 'Nome da planilha', onKeyDown: (e: any) => {if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') {e.currentTarget.value = w.name; e.currentTarget.blur();}},
          onBlur: (e: any) => {const v = String(e.target.value || '').trim().replace(/[\\/?*[\]:]/g, '').slice(0, 31); if (v && v !== w.name && !sheets.some((o: any) => o !== w && o.name === v)) {w.name = v; changed();} setRenaming(null);},
          style: {height: 26, width: 120, border: '1px solid ' + c.accent, borderRadius: 6, padding: '0 6px', background: c.field, color: c.text, fontSize: 12}})
      : h('button', {key: 'tab' + i, type: 'button', title: 'Clique duplo para renomear', onMouseDown: (e: any) => {e.preventDefault(); if (editing) commit(editing.text, null); setSheet(i); setSel({r: 1, c: 1, r2: 1, c2: 1}); if (grid.current) {grid.current.scrollTop = 0; grid.current.scrollLeft = 0;}}, onDoubleClick: () => setRenaming(i),
          style: {height: 26, padding: '0 12px', border: 0, borderRadius: 6, background: i === sheet ? c.field : 'transparent', color: i === sheet ? '#217346' : c.muted, fontWeight: i === sheet ? 700 : 500, fontSize: 12, cursor: 'pointer', boxShadow: i === sheet ? '0 1px 2px rgba(0,0,0,.15)' : 'none'}}, w.name)),
    h('button', {key: 'add', type: 'button', title: 'Nova planilha', 'aria-label': 'Nova planilha', onMouseDown: (e: any) => {e.preventDefault(); addSheet();}, style: {height: 26, width: 28, border: 0, borderRadius: 6, background: 'transparent', color: c.text, fontSize: 16, cursor: 'pointer'}}, '+'));
  useEffect(() => {const up = () => {dragSel.current = false;}; window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up);}, []);
  return h('div', {style: {display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0, background: c.bg}},
    bar, fbar,
    h('div', {ref: (n: any) => {grid.current = n; if (n && scroll.height !== n.clientHeight) setScroll({top: n.scrollTop, left: n.scrollLeft, height: n.clientHeight});}, tabIndex: 0, 'data-testid': 'sheet-grid', 'aria-label': 'Planilha',
      onKeyDown: onKey, onCopy, onPaste, onScroll: (e: any) => setScroll({top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft, height: e.currentTarget.clientHeight}),
      style: {flex: 1, minHeight: 0, overflow: 'auto', position: 'relative', outline: 'none', background: '#fff', filter: c.pageFilter, userSelect: 'none'}},
      state === 'loading' ? h('div', {style: {padding: 40, textAlign: 'center', color: '#666', fontSize: 13}}, 'Abrindo a planilha…') : null,
      state === 'error' ? h('div', {style: {padding: 40, textAlign: 'center', color: '#a33', fontSize: 13}}, err) : null,
      state === 'ready' ? h('div', {style: {position: 'relative', width: gridW, height: gridH, zoom}}, ...cells) : null),
    tabs);
}
