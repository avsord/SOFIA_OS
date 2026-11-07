// 07/11/2026 (Pedro: "no painel de edicao o usuario pode escolher se quer tema escuro ou claro"): cores dos editores de
// Word, Excel e PowerPoint da Sofia. A escolha fica guardada neste navegador; sem escolha, segue o tema do app.
import React, {useEffect, useState} from 'react';
import {useTheme} from '../lib/theme';

const h = React.createElement as any;
const KEY = 'sofia.editor.theme';
export type EditorTheme = 'light' | 'dark';
export type EditorColors = {bar: string; bg: string; text: string; muted: string; line: string; field: string; accent: string; onAccent: string; danger: string; dark: boolean; pageFilter: string};
const subs = new Set<(t: EditorTheme) => void>();
function stored(): EditorTheme | null {try {const v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null;} catch {return null;}}
export function useEditorColors(): [EditorColors, () => void] {
  const c = useTheme(), appDark = isDark(c.bg), [t, setT] = useState<EditorTheme>(() => stored() || (appDark ? 'dark' : 'light'));
  useEffect(() => {subs.add(setT); return () => {subs.delete(setT);};}, []);
  const toggle = () => {const next: EditorTheme = t === 'dark' ? 'light' : 'dark'; try {localStorage.setItem(KEY, next);} catch {} subs.forEach(f => f(next));};
  const dark = t === 'dark';
  return [{dark, bar: dark ? '#1f1f24' : '#ffffff', bg: dark ? '#121215' : '#e9e9ee', text: dark ? '#ececf1' : '#1d1d22', muted: dark ? '#9a9aa6' : '#6b6b76', line: dark ? '#34343c' : '#dcdce3', field: dark ? '#2a2a31' : '#ffffff',
    accent: c.accent, onAccent: c.onAccent, danger: c.danger,
    // folha escura no tema escuro, sem mudar as cores guardadas no arquivo (so a tela inverte)
    pageFilter: dark ? 'invert(0.92) hue-rotate(180deg)' : 'none'}, toggle];
}
function isDark(hex: string) {const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return false; const n = parseInt(m[1], 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) < 128;}
export function ThemeToggle({k, colors, toggle}: {k?: string; colors: EditorColors; toggle: () => void}) {
  return h('button', {key: k || 'theme', type: 'button', title: colors.dark ? 'Tema claro' : 'Tema escuro', 'aria-label': colors.dark ? 'Usar tema claro' : 'Usar tema escuro', onMouseDown: (e: any) => {e.preventDefault(); toggle();},
    style: {height: 28, minWidth: 28, padding: '0 8px', border: '1px solid ' + colors.line, borderRadius: 6, background: colors.field, color: colors.text, cursor: 'pointer', fontSize: 13}}, colors.dark ? '☀ Claro' : '☾ Escuro');
}
