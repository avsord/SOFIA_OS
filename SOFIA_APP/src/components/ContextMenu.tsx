import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, Pressable, Text, View} from 'react-native';
import {useTheme} from '../lib/theme';
import {Icon, type IconName} from './Icon';
import {OverAll} from '../lib/over-all';
/** 0.3.263 (computador): menu do botao direito (Editar, Duplicar, Apagar...) aberto junto do ponteiro. No celular nao existe:
 * la essas acoes continuam no "segurar" e nos botoes de cada tela. */
export type MenuItem = {label: string; icon?: IconName; danger?: boolean; run: () => void; swatch?: string};
type Open = {x: number; y: number; items: MenuItem[]} | null;
let setter: ((v: Open) => void) | null = null;
export function openContextMenu(x: number, y: number, items: MenuItem[]) { if (setter && items.length) setter({x, y, items}); }
/** Props para pôr num Pressable: clique direito abre o menu com estas acoes (so no site). */
export function contextMenu(items: () => MenuItem[]): Record<string, unknown> {
  if (typeof document === 'undefined') return {};
  return {onContextMenu: (e: any) => { e?.preventDefault?.(); e?.stopPropagation?.(); const ne = e?.nativeEvent || e; openContextMenu(ne.clientX ?? ne.pageX ?? 0, ne.clientY ?? ne.pageY ?? 0, items()); }};
}
export function ContextMenuHost() {
  const c = useTheme(), [open, setOpen] = useState<Open>(null);
  // 0.3.268: o menu entra e sai com uma animacao curta (antes aparecia e sumia num corte seco)
  const anim = useRef(new Animated.Value(0)).current, last = useRef<Open>(null), [leaving, setLeaving] = useState(false);
  if (open) last.current = open;
  useEffect(() => { setter = setOpen; return () => { if (setter === setOpen) setter = null; }; }, []);
  useEffect(() => {
    if (open) { setLeaving(false); anim.setValue(0); Animated.timing(anim, {toValue: 1, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true}).start(); return; }
    if (!last.current) return;
    setLeaving(true);
    Animated.timing(anim, {toValue: 0, duration: 100, easing: Easing.in(Easing.quad), useNativeDriver: true}).start(() => { last.current = null; setLeaving(false); });
  }, [open, anim]);
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(null); } };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [open]);
  const shown = open || (leaving ? last.current : null);
  if (!shown) return null;
  const W = 220, vw = typeof window !== 'undefined' ? window.innerWidth : 1200, vh = typeof window !== 'undefined' ? window.innerHeight : 800, H = shown.items.length * 38 + 12;
  const left = Math.max(8, Math.min(shown.x, vw - W - 8)), top = shown.y + H > vh - 8 ? Math.max(8, shown.y - H) : shown.y;
  return <OverAll><View pointerEvents={open ? 'auto' : 'none'} style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999}}>
    <Pressable accessibilityLabel="Fechar menu" onPress={() => setOpen(null)} {...({onContextMenu: (e: any) => { e.preventDefault(); setOpen(null); }} as any)} style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}} />
    <Animated.View testID={open ? 'context-menu' : 'context-menu-closing'} accessibilityRole="menu" style={{opacity: anim, transform: [{scale: anim.interpolate({inputRange: [0, 1], outputRange: [0.96, 1]})}, {translateY: anim.interpolate({inputRange: [0, 1], outputRange: [-4, 0]})}], position: 'absolute', left, top, width: W, paddingVertical: 6, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, boxShadow: '0 10px 30px rgba(20,14,40,0.18)'} as any}>
      {shown.items.map((it, i) => <Pressable key={i} accessibilityRole="menuitem" onPress={() => { setOpen(null); setTimeout(it.run, 0); }} style={{flexDirection: 'row', alignItems: 'center', gap: 10, height: 38, paddingHorizontal: 12, marginHorizontal: 4, borderRadius: 8}}>
        {it.swatch ? <View style={{width: 16, alignItems: 'center'}}><View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: it.swatch}} /></View> : it.icon ? <Icon name={it.icon} size={16} color={it.danger ? c.danger : c.muted} /> : <View style={{width: 16}} />}
        <Text style={{color: it.danger ? c.danger : c.text, fontSize: 14}}>{it.label}</Text>
      </Pressable>)}
    </Animated.View>
  </View></OverAll>;
}
