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
