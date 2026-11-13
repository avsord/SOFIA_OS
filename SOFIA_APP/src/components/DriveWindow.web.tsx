// 07/11/2026 (Pedro: "opcao de tornar o drive tela flutuante, responsivo e funcional, para estar nas Paginas com acesso ao
// Drive"): o Drive inteiro numa janela que se move (barra de cima), muda de tamanho pelos 4 cantos e 4 lados, maximiza
// (duplo clique na barra) e lembra lugar e tamanho. O conteudo se ajusta a largura da janela (lista estreita, Drive
// completo com a lateral a partir de 900 px). Copiar/colar entre o Drive e a pagina funciona com ela aberta.
// Fica abaixo das caixas de dialogo do Drive (z 900 < 9999) e acima da pagina.
import React, {Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {Pressable, Text, View} from 'react-native';
import type {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {Icon} from './Icon';
// o Drive so baixa quando a janela abre (nao pesa na abertura do site)
const Drive = lazy(() => import('../screens/Drive').then(m => ({default: m.Drive})));

const h = React.createElement as any;
const KEY = 'sofia.drive.float';
type Geo = {x: number; y: number; w: number; h: number; max?: boolean};
let open = false; const subs = new Set<() => void>(); const emit = () => subs.forEach(f => f());
export function openDriveWindow() { open = true; emit(); }
export function closeDriveWindow() { open = false; emit(); }
export function useDriveWindowOpen() { return useSyncExternalStore(f => {subs.add(f); return () => {subs.delete(f);};}, () => open, () => false); }

function fit(g: Geo): Geo {
  const W = window.innerWidth, H = window.innerHeight, w = Math.max(320, Math.min(g.w, W - 16)), hh = Math.max(260, Math.min(g.h, H - 16));
  return {...g, w, h: hh, x: Math.min(Math.max(-w + 120, g.x), W - 80), y: Math.min(Math.max(0, g.y), H - 60)};
}
function initial(): Geo {
  try { const g = JSON.parse(localStorage.getItem(KEY) || 'null'); if (g && g.w > 0) return fit(g); } catch { /* sem memoria */ }
  const W = window.innerWidth, H = window.innerHeight, w = Math.min(560, W - 32), hh = Math.min(640, H - 120);
  return {x: W - w - 24, y: Math.max(16, Math.round((H - hh) / 2)), w, h: hh};
}
const HANDLES: [string, any, string][] = [
  ['nw', {left: -6, top: -6, width: 20, height: 20}, 'nwse-resize'], ['ne', {right: -6, top: -6, width: 20, height: 20}, 'nesw-resize'],
  ['sw', {left: -6, bottom: -6, width: 20, height: 20}, 'nesw-resize'], ['se', {right: -6, bottom: -6, width: 22, height: 22}, 'nwse-resize'],
  ['n', {left: 14, right: 14, top: -5, height: 9}, 'ns-resize'], ['s', {left: 14, right: 16, bottom: -5, height: 9}, 'ns-resize'],
  ['w', {left: -5, top: 14, bottom: 14, width: 9}, 'ew-resize'], ['e', {right: -5, top: 14, bottom: 16, width: 9}, 'ew-resize']];

export function DriveWindowHost({api}: {api: SofiaApi}) {
  const isOpen = useDriveWindowOpen();
  if (!isOpen || typeof document === 'undefined') return null;
  return createPortal(<DriveWindow api={api} />, document.body);
}

function DriveWindow({api}: {api: SofiaApi}) {
  const rootRef = useRef<HTMLElement | null>(null);
  useEffect(() => { rootRef.current?.focus({preventScroll: true}); }, []); // abriu: Esc ja fecha, atalhos vao para o Drive
  const c = useTheme(), [g, setG] = useState<Geo>(initial), [moving, setMoving] = useState(false), gRef = useRef(g); gRef.current = g;
  const save = (v: Geo) => { try { localStorage.setItem(KEY, JSON.stringify({x: Math.round(v.x), y: Math.round(v.y), w: Math.round(v.w), h: Math.round(v.h), max: !!v.max})); } catch { /* sem memoria */ } };
  useEffect(() => { const on = () => setG(v => fit(v)); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  useEffect(() => { const on = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; const t = e.target as HTMLElement | null; if (!t?.closest?.('[data-drive-float]') || (t.closest('input,textarea,[contenteditable="true"]') && !t.closest('[data-testid=drive-locked],[data-testid=drive-lock-check]'))) return; if (document.querySelector('[data-drive-float] [aria-selected="true"], [data-testid=drive-preview]')) return; /* Esc primeiro desmarca / fecha a previa */ e.preventDefault(); closeDriveWindow(); };
    window.addEventListener('keydown', on, true); return () => window.removeEventListener('keydown', on, true); }, []); // antes dos outros atalhos da tela
  const drag = (mode: string) => (e: any) => {
    if (e.button != null && e.button !== 0) return; if (mode === 'move' && (e.target as HTMLElement)?.closest?.('[data-win-btn]')) return;
    e.preventDefault(); const sx = e.clientX, sy = e.clientY, o = {...gRef.current}, bs = document.body.style, old = bs.userSelect; bs.userSelect = 'none'; setMoving(true);
    const mv = (ev: PointerEvent) => { const dx = ev.clientX - sx, dy = ev.clientY - sy, W = window.innerWidth, H = window.innerHeight;
      if (mode === 'move') { setG({...o, max: false, x: Math.min(W - 80, Math.max(-o.w + 120, o.x + dx)), y: Math.min(H - 60, Math.max(0, o.y + dy))}); return; }
      let x = o.x, y = o.y, w = o.w, hh = o.h;
      if (mode.includes('e')) w = Math.min(W - o.x - 4, o.w + dx);
      if (mode.includes('s')) hh = Math.min(H - o.y - 4, o.h + dy);
      if (mode.includes('w')) { const nx = Math.max(0, Math.min(o.x + o.w - 320, o.x + dx)); w = o.w + (o.x - nx); x = nx; }
      if (mode.includes('n')) { const ny = Math.max(0, Math.min(o.y + o.h - 260, o.y + dy)); hh = o.h + (o.y - ny); y = ny; }
      setG({...o, max: false, x, y, w: Math.max(320, w), h: Math.max(260, hh)}); };
    const up = () => { bs.userSelect = old; setMoving(false); save(gRef.current); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const toggleMax = () => setG(v => { const n = {...v, max: !v.max}; save(n); return n; });
  const box = g.max ? {left: 12, top: 12, width: window.innerWidth - 24, height: window.innerHeight - 24} : {left: g.x, top: g.y, width: g.w, height: g.h};
  const btn = (icon: any, label: string, run: () => void) => <Pressable key={label} {...({dataSet: {winBtn: '1'}} as any)} accessibilityLabel={label} onPress={run} style={({hovered}: any) => ({width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.line : 'transparent'})}><Icon name={icon} size={15} color={c.muted} /></Pressable>;
  // clicar num lugar vazio da janela poe o foco nela: Ctrl+C/Ctrl+V/Delete vao para o Drive, nao para a pagina por baixo
  const focusIn = (e: any) => { const t = e.target as HTMLElement; if (!t.closest('input,textarea,button,[tabindex],[contenteditable="true"],a')) (e.currentTarget as HTMLElement).focus({preventScroll: true}); };
  return h('div', {ref: rootRef, 'data-drive-float': '1', 'data-tool-window': '1', 'data-testid': 'drive-float', role: 'region', 'aria-label': 'Drive flutuante', tabIndex: -1, onPointerDownCapture: focusIn,
    style: {position: 'fixed', ...box, zIndex: 900, borderRadius: 12, outline: 'none', boxShadow: '0 18px 50px rgba(0,0,0,.30), 0 2px 6px rgba(0,0,0,.14)'}},
    h('div', {style: {position: 'absolute', inset: 0, background: c.bg, borderRadius: 12, border: '1px solid ' + c.line, overflow: 'hidden', display: 'flex', flexDirection: 'column'}},
      h('div', {'data-testid': 'drive-float-bar', onPointerDown: drag('move'), onDoubleClick: toggleMax, title: 'Arraste para mover · duplo clique para maximizar',
        style: {height: 40, paddingTop: 3, position: 'relative', flexShrink: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 6, background: c.surface, borderBottom: '1px solid ' + c.line, cursor: moving ? 'grabbing' : 'grab', touchAction: 'none'}},
        <>{h('div', {style: {position: 'absolute', left: '50%', top: 4, width: 38, height: 4, marginLeft: -19, borderRadius: 2, background: c.line}})}
          <Icon name="drive" size={16} color={c.accent} /><Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 13, fontWeight: '600'}}>Drive</Text>
          {btn(g.max ? 'collapse' : 'expand', g.max ? 'Restaurar tamanho' : 'Maximizar', toggleMax)}
          {btn('close', 'Fechar o Drive flutuante', closeDriveWindow)}</>),
      h('div', {style: {flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column'}},
        <Suspense fallback={null}><Drive api={api} active frame={{width: g.max ? window.innerWidth - 24 : g.w}} /></Suspense>,
        moving ? h('div', {style: {position: 'absolute', inset: 0}}) : null)),
    g.max ? null : HANDLES.map(([mode, css, cursor]) => h('div', {key: mode, onPointerDown: drag(mode), 'aria-label': 'Mudar o tamanho do Drive', style: {position: 'absolute', zIndex: 3, cursor, ...css}},
      mode === 'se' ? h('div', {style: {position: 'absolute', right: 10, bottom: 10, width: 8, height: 8, borderRight: '2px solid ' + c.muted, borderBottom: '2px solid ' + c.muted, opacity: 0.6}}) : null)));
}
