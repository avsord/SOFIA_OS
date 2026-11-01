// 0.3.269: pecas comuns dos apps redesenhados em 31/10 (Listas, Notas, Biblioteca, Encomendas, Financas no site).
// Mesma estrutura nos dois tamanhos: no computador lateral fixa + conteudo + painel por cima escurecendo o fundo;
// no celular a lateral vira abas/etiquetas no topo e o painel vira tela cheia. Aviso com "Desfazer" no rodape.
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Animated, Easing, Platform, Pressable, ScrollView, Share, Text, TextInput, View} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {useTheme} from '../lib/theme';
import {useDesktop} from '../lib/desktop';
import {Icon, type IconName} from './Icon';
import {MotionModal} from './MotionModal';
import {LoadingLines, useSkeletonDelay} from './Loading';
import {openContextMenu, type MenuItem} from './ContextMenu';
import {appAlert} from '../lib/app-alert';

export const brl = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? '' : 'R$ ' + v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
/** "24,90", "1.234,5", "R$ 10" -> numero; vazio -> null */
export function parseMoney(raw: string): number | null {
  const s = String(raw || '').replace(/r\$\s*/i, '').trim(); if (!s) return null;
  const clean = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(clean); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
export const moneyInput = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? '' : v.toFixed(2).replace('.', ',');
export const fold = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
export const numText = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/* ---------- aviso no rodape (com Desfazer) ---------- */
export type ToastAction = {label: string; run: () => void};
export function useToast() {
  const [t, setT] = useState<{id: number; text: string; actions: ToastAction[]} | null>(null), timer = useRef<any>(null);
  const toast = useCallback((text: string, actions: ToastAction[] = []) => { clearTimeout(timer.current); const id = Date.now(); setT({id, text, actions}); timer.current = setTimeout(() => setT(x => x && x.id === id ? null : x), 6000); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {toast, toastNode: <ToastView toast={t} onClose={() => setT(null)} />};
}
function ToastView({toast, onClose}: {toast: {id: number; text: string; actions: ToastAction[]} | null; onClose: () => void}) {
  const c = useTheme(), a = useRef(new Animated.Value(0)).current, last = useRef(toast), [gone, setGone] = useState(true);
  if (toast) last.current = toast;
  useEffect(() => {
    if (toast) { setGone(false); Animated.timing(a, {toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true}).start(); return; }
    Animated.timing(a, {toValue: 0, duration: 150, useNativeDriver: true}).start(({finished}) => { if (finished) setGone(true); });
  }, [toast, a]);
  const shown = toast || (gone ? null : last.current);
  if (!shown) return null;
  return <View pointerEvents="box-none" style={{position: 'absolute', left: 0, right: 0, bottom: 84, alignItems: 'center', zIndex: 50}}>
    <Animated.View testID="app-toast" accessibilityRole="alert" style={{opacity: a, transform: [{translateY: a.interpolate({inputRange: [0, 1], outputRange: [12, 0]})}], flexDirection: 'row', alignItems: 'center', gap: 14, maxWidth: '92%', paddingVertical: 10, paddingLeft: 16, paddingRight: 8, borderRadius: 12, backgroundColor: c.text}}>
      <Text style={{color: c.bg, fontSize: 13, flexShrink: 1}}>{shown.text}</Text>
      {shown.actions.map(x => <Pressable key={x.label} accessibilityRole="button" onPress={() => { onClose(); x.run(); }} style={{paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8}}><Text style={{color: c.accentSoft, fontWeight: '700', fontSize: 13}}>{x.label}</Text></Pressable>)}
    </Animated.View>
  </View>;
}

/* ---------- moldura: lateral + conteudo ---------- */
export function AppFrame({sidebar, mobileNav, children, footer}: {sidebar: React.ReactNode; mobileNav?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode}) {
  const c = useTheme(), desktop = useDesktop();
  if (!desktop) return <View style={{flex: 1, backgroundColor: c.bg}}>{mobileNav}<View style={{flex: 1}}>{children}</View>{footer}</View>;
  return <View style={{flex: 1, flexDirection: 'row', backgroundColor: c.bg}}>
    <View testID="app-sidebar" style={{width: 248, borderRightWidth: 1, borderColor: c.line, backgroundColor: c.surface}}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingVertical: 14, paddingHorizontal: 10, gap: 2}}>{sidebar}</ScrollView></View>
    <View style={{flex: 1, minWidth: 0}}>{children}{footer}</View>
  </View>;
}
export function SideLabel({children}: {children: string}) { const c = useTheme(); return <Text style={{color: c.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6}}>{children.toUpperCase()}</Text>; }
export function SideItem({icon, label, count, selected, onPress, sub, dot, leading, trailing, faded, testID, onContextMenu}: {icon?: IconName; label: string; count?: number | string; selected?: boolean; onPress: () => void; sub?: boolean; dot?: string; leading?: React.ReactNode; trailing?: React.ReactNode; faded?: boolean; testID?: string; onContextMenu?: any}) {
  const c = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{selected: !!selected}} accessibilityLabel={label} onPress={onPress} {...(onContextMenu || {})}
    style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: sub ? 32 : 36, paddingLeft: sub ? 30 : 10, paddingRight: 8, borderRadius: 9, opacity: faded ? 0.5 : 1, backgroundColor: selected ? c.accentSoft : hovered ? c.line + '80' : 'transparent'})}>
    {leading}{dot ? <View style={{width: 8, height: 8, borderRadius: 3, backgroundColor: dot}} /> : icon ? <Icon name={icon} size={sub ? 15 : 18} color={selected ? c.accent : c.muted} active={!!selected} /> : null}
    <Text numberOfLines={1} style={{flex: 1, color: selected ? c.accent : c.text, fontSize: sub ? 13 : 14, fontWeight: selected ? '600' : '400'}}>{label}</Text>
    {trailing}{count != null && count !== '' && count !== 0 ? <Text style={{color: selected ? c.accent : c.muted, fontSize: 11, fontWeight: '600', minWidth: 18, textAlign: 'center', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 99, backgroundColor: selected ? c.surface : c.input}}>{count}</Text> : null}
  </Pressable>;
}

/* ---------- etiquetas e botoes ---------- */
export function Chip({label, selected, onPress, icon, count, dot, dashed, testID}: {label: string; selected?: boolean; onPress?: () => void; icon?: IconName; count?: number; dot?: string; dashed?: boolean; testID?: string}) {
  const c = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{selected: !!selected}} accessibilityLabel={label} disabled={!onPress} onPress={onPress}
    style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderStyle: dashed ? 'dashed' : 'solid', borderColor: selected ? c.accent : c.line, backgroundColor: selected ? c.accentSoft : c.surface}}>
    {dot ? <View style={{width: 7, height: 7, borderRadius: 3, backgroundColor: dot}} /> : null}{icon ? <Icon name={icon} size={14} color={selected ? c.accent : c.muted} /> : null}
    <Text style={{color: selected ? c.accent : c.text, fontSize: 13, fontWeight: selected ? '600' : '400'}}>{label}</Text>
    {count != null ? <Text style={{color: c.muted, fontSize: 12}}>{count}</Text> : null}
  </Pressable>;
}
export function GhostButton({icon, label, onPress, on, testID}: {icon?: IconName; label?: string; onPress: (e?: any) => void; on?: boolean; testID?: string}) {
  const c = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label || 'Mais opções'} onPress={onPress}
    style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingHorizontal: label ? 12 : 10, borderRadius: 10, borderWidth: 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : hovered ? c.input : c.surface})}>
    {icon ? <Icon name={icon} size={16} color={on ? c.accent : c.text} /> : null}{label ? <Text style={{color: on ? c.accent : c.text, fontSize: 13, fontWeight: '500'}}>{label}</Text> : null}
  </Pressable>;
}
export function PrimaryButton({icon, label, onPress, disabled, danger, testID}: {icon?: IconName; label: string; onPress: () => void; disabled?: boolean; danger?: boolean; testID?: string}) {
  const c = useTheme(), bg = danger ? c.danger : c.accent;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled: !!disabled}} disabled={disabled} onPress={onPress}
    style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, paddingHorizontal: 18, borderRadius: 11, backgroundColor: bg, opacity: disabled ? 0.45 : 1}}>
    {icon ? <Icon name={icon} size={16} color={c.onAccent} /> : null}<Text style={{color: c.onAccent, fontWeight: '600', fontSize: 14}}>{label}</Text>
  </Pressable>;
}

/** Menu "⋯": no computador abre junto do clique; no celular vira a lista de acoes da Sofia. */
export function openMore(e: any, title: string, items: MenuItem[]) {
  if (Platform.OS === 'web') { const n = e?.nativeEvent || {}; openContextMenu(n.pageX ?? n.clientX ?? 400, (n.pageY ?? n.clientY ?? 100) + 8, items); return; }
  appAlert(title, '', [...items.map(i => ({text: i.label, style: i.danger ? 'destructive' as const : 'default' as const, onPress: i.run})), {text: 'Cancelar', style: 'cancel' as const}]);
}

/* ---------- painel por cima (lateral no computador, tela cheia no celular) ---------- */
export function Panel({visible, onClose, title, children, width = 460, testID, footer, roomy, dim}: {visible: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; width?: number; testID?: string; footer?: React.ReactNode; roomy?: boolean; dim?: string}) {
  const c = useTheme();
  return <MotionModal visible={visible} animationType="slide" onRequestClose={onClose} peekWidth={width} peekDim={dim}>
    <View testID={testID} style={{flex: 1, backgroundColor: c.bg}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: roomy ? 28 : 18, paddingTop: Platform.OS === 'web' ? (roomy ? 30 : 16) : 44, paddingBottom: roomy ? 18 : 8, ...(roomy ? {borderBottomWidth: 1, borderColor: c.line, marginBottom: 20} : {})}}>
        <View style={{flex: 1, minWidth: 0}}>{typeof title === 'string' ? <Text numberOfLines={1} style={{color: c.text, fontSize: 18, fontWeight: '600'}}>{title}</Text> : title}</View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={({hovered}: any) => ({width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Icon name="close" size={18} color={c.muted} /></Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal: roomy ? 28 : 18, paddingBottom: 40, gap: roomy ? 16 : 14}}>{children}</ScrollView>
      {footer}
    </View>
  </MotionModal>;
}
/** Janela pequena (criar/confirmar). No computador centralizada, no celular folha de baixo. */
export function Dialog({visible, onClose, title, children, footer}: {visible: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode}) {
  const c = useTheme();
  return <MotionModal visible={visible} transparent onRequestClose={onClose}>
    <Pressable accessibilityLabel="Fechar" onPress={onClose} style={{flex: 1, backgroundColor: '#0008', alignItems: 'center', justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end', padding: Platform.OS === 'web' ? 24 : 0}}>
      <Pressable onPress={() => undefined} style={{width: '100%', maxWidth: 480, backgroundColor: c.surface, borderRadius: 18, borderBottomLeftRadius: Platform.OS === 'web' ? 18 : 0, borderBottomRightRadius: Platform.OS === 'web' ? 18 : 0, padding: 20, paddingBottom: Platform.OS === 'web' ? 18 : 34, gap: 14, borderWidth: 1, borderColor: c.line}}>
        <Text style={{color: c.text, fontSize: 18, fontWeight: '600'}}>{title}</Text>
        {children}
        {footer ? <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4}}>{footer}</View> : null}
      </Pressable>
    </Pressable>
  </MotionModal>;
}
/** Linha de formulario: rotulo a esquerda no computador, em cima no celular. */
export function FieldRow({label, children, top}: {label: string; children: React.ReactNode; top?: boolean}) {
  const c = useTheme(), desktop = useDesktop();
  return <View style={{flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? (top ? 'flex-start' : 'center') : 'stretch', gap: desktop ? 12 : 6}}>
    <Text style={{width: desktop ? 110 : undefined, color: c.muted, fontSize: 13, paddingTop: desktop && top ? 9 : 0}}>{label}</Text>
    <View style={{flex: 1, minWidth: 0}}>{children}</View>
  </View>;
}
export function Input(props: React.ComponentProps<typeof TextInput>) {
  const c = useTheme();
  return <TextInput placeholderTextColor={c.muted} {...props} style={[{minHeight: 40, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, color: c.text, fontSize: 14}, props.style]} />;
}
/** − [quantidade] + com a unidade separada, fora (pedido do Pedro). */
export function Stepper({value, onChange, unit, onUnit}: {value: number; onChange: (v: number) => void; unit: string; onUnit: (u: string) => void}) {
  const c = useTheme(), [txt, setTxt] = useState(numText(value));
  useEffect(() => { setTxt(numText(value)); }, [value]);
  const btn = (label: string, d: number) => <Pressable accessibilityRole="button" accessibilityLabel={d > 0 ? 'Mais' : 'Menos'} onPress={() => onChange(Math.max(d > 0 ? 0 : 1, Math.round((value + d) * 100) / 100))} style={({hovered}: any) => ({width: 36, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Text style={{color: c.text, fontSize: 18}}>{label}</Text></Pressable>;
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
    <View style={{flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.line, borderRadius: 10, overflow: 'hidden', backgroundColor: c.surface}}>
      {btn('−', -1)}
      <TextInput accessibilityLabel="Quantidade" value={txt} onChangeText={setTxt} onBlur={() => { const n = Number(txt.replace(',', '.')); if (Number.isFinite(n) && n > 0) onChange(n); else setTxt(numText(value)); }} keyboardType="decimal-pad" style={{width: 54, textAlign: 'center', color: c.text, fontSize: 14, paddingVertical: 8}} />
      {btn('+', 1)}
    </View>
    <TextInput accessibilityLabel="Unidade" value={unit} onChangeText={onUnit} placeholder="un" placeholderTextColor={c.muted} style={{width: 70, minHeight: 40, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, color: c.text, fontSize: 14}} />
  </View>;
}
/** Compartilhar um texto: menu do sistema no celular; no site, compartilhar do navegador ou copiar. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied'> {
  if (Platform.OS === 'web') {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.share) { try { await nav.share({title, text}); return 'shared'; } catch { /* cancelado: copia */ } }
    await Clipboard.setStringAsync(text); return 'copied';
  }
  await Share.share({title, message: text}); return 'shared';
}
export const ICON_CHOICES: IconName[] = ['cart', 'list', 'checklist', 'box', 'gift', 'heart', 'star', 'home', 'briefcase', 'tshirt', 'coffee', 'forkKnife', 'heartbeat', 'car', 'airplane', 'book', 'music', 'film', 'paw', 'wrench', 'graduation', 'barbell', 'storefront', 'tag'];
export function IconPicker({value, onChange}: {value: string; onChange: (v: IconName) => void}) {
  const c = useTheme();
  return <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{ICON_CHOICES.map(n => <Pressable key={n} accessibilityRole="button" accessibilityLabel={'Ícone ' + n} accessibilityState={{selected: value === n}} onPress={() => onChange(n)} style={{width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: value === n ? c.accent : c.line, backgroundColor: value === n ? c.accentSoft : c.surface}}><Icon name={n} size={18} color={value === n ? c.accent : c.text} /></Pressable>)}</View>;
}

/** 0.3.272: carregamento dos apps novos = esqueleto com brilho no lugar do conteudo (lateral + coluna), nunca texto
 * "Carregando..." no meio da tela. No site so aparece se a espera passar de 300 ms. */
export function AppSkeleton({label, side = true}: {label: string; side?: boolean}) {
  const c = useTheme(), desktop = useDesktop(), show = useSkeletonDelay();
  return <View accessibilityLabel={label} testID="app-skeleton" style={{flex: 1, flexDirection: 'row', backgroundColor: c.bg}}>
    {desktop && side ? <View style={{width: 248, borderRightWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 14}}>{show ? <LoadingLines rows={6} /> : null}</View> : null}
    <View style={{flex: 1, paddingHorizontal: desktop ? 40 : 16, paddingTop: desktop ? 34 : 18, gap: 14}}>{show ? <><View style={{width: 180, height: 22, borderRadius: 8, backgroundColor: c.input}} /><LoadingLines rows={6} /></> : null}</View>
  </View>;
}
