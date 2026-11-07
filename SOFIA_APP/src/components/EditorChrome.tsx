// 07/11/2026 (Pedro: "no painel de edicao o usuario pode escolher se quer tema escuro ou claro"): cores dos editores de
// Word, Excel e PowerPoint da Sofia. A escolha fica guardada neste navegador; sem escolha, segue o tema do app.
import React, {useEffect, useState} from 'react';
import {useTheme} from '../lib/theme';

const h = React.createElement as any;
const KEY = 'sofia.editor.theme';
// 07/11/2026 (Pedro: "coloca tambem a opcao original"): Original = painel escuro com o documento nas cores reais do arquivo.
export type EditorTheme = 'light' | 'dark' | 'original';
export type EditorColors = {bar: string; bg: string; text: string; muted: string; line: string; field: string; accent: string; onAccent: string; danger: string; dark: boolean; pageFilter: string};
const subs = new Set<(t: EditorTheme) => void>();
const LABELS: [EditorTheme, string, string][] = [['light', 'Claro', 'Painel claro, documento como é'], ['dark', 'Escuro', 'Painel escuro e documento escurecido'], ['original', 'Original', 'Painel escuro, documento nas cores reais do arquivo']];
function stored(): EditorTheme | null {try {const v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' || v === 'original' ? v : null;} catch {return null;}}
export function useEditorColors(): [EditorColors, (t?: EditorTheme) => void, EditorTheme] {
  const c = useTheme(), appDark = isDark(c.bg), [t, setT] = useState<EditorTheme>(() => stored() || (appDark ? 'dark' : 'light'));
  useEffect(() => {subs.add(setT); return () => {subs.delete(setT);};}, []);
  const toggle = (want?: EditorTheme) => {const next: EditorTheme = want || (t === 'light' ? 'dark' : 'light'); try {localStorage.setItem(KEY, next);} catch {} subs.forEach(f => f(next));}; // a escolha fica guardada neste navegador
  const dark = t !== 'light';
  return [{dark, bar: dark ? '#1f1f24' : '#ffffff', bg: dark ? '#121215' : '#e9e9ee', text: dark ? '#ececf1' : '#1d1d22', muted: dark ? '#9a9aa6' : '#6b6b76', line: dark ? '#34343c' : '#dcdce3', field: dark ? '#2a2a31' : '#ffffff',
    accent: c.accent, onAccent: c.onAccent, danger: c.danger,
    // folha escura no tema escuro, sem mudar as cores guardadas no arquivo (so a tela inverte)
    pageFilter: t === 'dark' ? 'invert(0.92) hue-rotate(180deg)' : 'none'}, toggle, t];
}
function isDark(hex: string) {const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return false; const n = parseInt(m[1], 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) < 128;}
export function ThemeToggle({k, colors, toggle}: {k?: string; colors: EditorColors; toggle: (t?: EditorTheme) => void}) {
  const cur = stored() || (colors.dark ? (colors.pageFilter === 'none' ? 'original' : 'dark') : 'light');
  return h('span', {key: k || 'theme', role: 'radiogroup', 'aria-label': 'Tema do editor', style: {display: 'inline-flex', padding: 2, gap: 2, borderRadius: 7, border: '1px solid ' + colors.line, background: colors.field}},
    ...LABELS.map(([id, label, tip]) => h('button', {key: id, type: 'button', role: 'radio', 'aria-checked': cur === id, title: tip, 'aria-label': 'Tema ' + label.toLowerCase(),
      onMouseDown: (e: any) => e.preventDefault(), onClick: (e: any) => {e.preventDefault(); e.stopPropagation(); toggle(id);},
      style: {height: 24, padding: '0 8px', border: 0, borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: cur === id ? 700 : 500, background: cur === id ? colors.accent : 'transparent', color: cur === id ? colors.onAccent : colors.text}}, label)));
}

// 07/11/2026 (Pedro: "zoom do proprio projeto igual no Word, sem mudar o zoom do navegador"): zoom so do documento.
// Botoes - 100% + na barra e Ctrl + rodinha dentro do documento. Fica guardado por tipo de editor.
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
export function useEditorZoom(kind: string): [number, (z: number) => void] {
  const [z, setZ] = useState<number>(() => {try {const v = Number(localStorage.getItem('sofia.editor.zoom.' + kind)); return v >= 0.25 && v <= 4 ? v : 1;} catch {return 1;}});
  const set = (v: number) => {const n = Math.round(Math.max(0.25, Math.min(4, v)) * 100) / 100; setZ(n); try {localStorage.setItem('sofia.editor.zoom.' + kind, String(n));} catch {}};
  return [z, set];
}
/** Ctrl/Cmd + rodinha dentro do documento muda o zoom do documento (e nao o da pagina inteira do navegador). */
export function useWheelZoom(el: {current: HTMLElement | null}, zoom: number, setZoom: (z: number) => void, ready = true) {
  const ref = React.useRef({zoom, setZoom}); ref.current = {zoom, setZoom};
  useEffect(() => {const node = el.current; if (!node) return;
    const on = (e: WheelEvent) => {if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); ref.current.setZoom(ref.current.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));};
    node.addEventListener('wheel', on, {passive: false}); return () => node.removeEventListener('wheel', on);}, [el.current, ready]);
}
export function ZoomControl({colors, zoom, setZoom}: {colors: EditorColors; zoom: number; setZoom: (z: number) => void}) {
  const step = (dir: 1 | -1) => {const i = dir > 0 ? ZOOM_STEPS.findIndex(s => s > zoom + 0.001) : ZOOM_STEPS.map(s => s < zoom - 0.001).lastIndexOf(true); if (i >= 0) setZoom(ZOOM_STEPS[i]);};
  const b = (label: string, title: string, run: () => void, extra: any = {}) => h('button', {type: 'button', title, 'aria-label': title, onMouseDown: (e: any) => e.preventDefault(), onClick: (e: any) => {e.preventDefault(); run();},
    style: {height: 24, minWidth: 24, padding: '0 6px', border: 0, borderRadius: 5, background: 'transparent', color: colors.text, cursor: 'pointer', fontSize: 13, ...extra}}, label);
  return h('span', {role: 'group', 'aria-label': 'Zoom do documento', style: {display: 'inline-flex', alignItems: 'center', padding: 2, gap: 1, borderRadius: 7, border: '1px solid ' + colors.line, background: colors.field}},
    b('−', 'Diminuir o zoom do documento', () => step(-1), {fontSize: 16}), b(Math.round(zoom * 100) + '%', 'Voltar o zoom para 100%', () => setZoom(1), {minWidth: 44, fontSize: 12, fontWeight: 600}), b('+', 'Aumentar o zoom do documento', () => step(1), {fontSize: 16}));
}
