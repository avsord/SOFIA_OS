import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {useTheme} from '../lib/theme';
import {PALETTE} from '../lib/palette';
import {Icon, type IconName} from './Icon';

/** 03/11/2026 (Pedro, aprovado no quadro): Biblioteca e Notas com o titulo sempre igual ao nome do app e, logo abaixo,
 * uma barra com botoes [Area ⌄] [Filtros ⌄]. Cada botao abre uma lista vertical PARA BAIXO, colada embaixo da barra
 * (nada abre de baixo da tela, nada de fileira solta de etiquetas). Pecas reaproveitadas pelas duas telas. */
export function BarPill({label, open, onPress, dot, count, testID}: {label: string; open: boolean; onPress: () => void; dot?: string; count?: number; testID?: string}) {
  const c = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{expanded: open}} onPress={onPress} style={({pressed}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 7, height: 38, paddingLeft: 14, paddingRight: 12, borderRadius: 12, borderWidth: open ? 0 : 1, borderColor: c.line, backgroundColor: open ? c.accentSoft : c.surface, transform: [{scale: pressed ? 0.97 : 1}]})}>
    {dot ? <View style={{width: 7, height: 7, borderRadius: 4, backgroundColor: dot}} /> : null}
    <Text numberOfLines={1} style={{color: c.text, fontSize: 14, fontWeight: '600', maxWidth: 160}}>{label}</Text>
    {count ? <View style={{minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center'}}><Text style={{color: c.onAccent, fontSize: 11, fontWeight: '700'}}>{count}</Text></View> : null}
    <View style={{transform: [{rotate: open ? '-90deg' : '90deg'}]}}><Icon name="chevron" size={14} color={open ? c.accent : c.muted} /></View>
  </Pressable>;
}
/** Lista que desce logo abaixo da barra, por cima do conteudo. */
export function DropPanel({title, action, children, footer}: {title: string; action?: {label: string; onPress: () => void}; children: React.ReactNode; footer?: React.ReactNode}) {
  const c = useTheme();
  return <View accessibilityRole="menu" style={{marginTop: -4, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, boxShadow: '0 18px 40px rgba(0,0,0,0.35)'} as any}>
    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44}}>
      <Text style={{color: c.text, fontSize: 16, fontWeight: '700'}}>{title}</Text>
      {action ? <Pressable accessibilityRole="button" hitSlop={8} onPress={action.onPress}><Text style={{color: c.accent, fontSize: 14, fontWeight: '600'}}>{action.label}</Text></Pressable> : null}
    </View>
    {children}
    {footer}
  </View>;
}
/** Linha da lista: marcador (radio para escolher um, caixa para marcar), nome e contagem. */
export function PanelRow({label, count, on, kind = 'radio', icon, dot, onPress}: {label: string; count?: number; on: boolean; kind?: 'radio' | 'check' | 'plain'; icon?: IconName; dot?: string; onPress: () => void}) {
  const c = useTheme();
  const mark = kind === 'plain' ? (icon ? <Icon name={icon} size={16} color={c.text} /> : null) : kind === 'radio'
    ? <View style={{width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? c.accent : c.line, alignItems: 'center', justifyContent: 'center'}}>{on ? <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent}} /> : null}</View>
    : <View style={{width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>{on ? <Icon name="check" size={12} color={c.onAccent} /> : null}</View>;
  return <Pressable accessibilityRole={kind === 'check' ? 'checkbox' : 'button'} accessibilityState={{checked: on, selected: on}} onPress={onPress} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 12, height: 46, borderTopWidth: 1, borderColor: c.line, backgroundColor: hovered ? c.input : 'transparent'})}>
    {mark}{dot ? <View style={{width: 7, height: 7, borderRadius: 4, backgroundColor: dot}} /> : null}
    <Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 14, fontWeight: on ? '600' : '400'}}>{label}</Text>
    {count != null ? <Text style={{color: c.muted, fontSize: 13, fontVariant: ['tabular-nums']}}>{count}</Text> : null}
  </Pressable>;
}
/** Linha "Nota" com as 5 estrelas pequenas: tocar escolhe a nota minima; tocar de novo na mesma tira. */
export function StarRow({value, onChange}: {value: number; onChange: (v: number) => void}) {
  const c = useTheme();
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, height: 46, borderTopWidth: 1, borderColor: c.line}}>
    <Text style={{flex: 1, color: c.text, fontSize: 14}}>Nota</Text>
    <View accessibilityRole="radiogroup" style={{flexDirection: 'row'}}>{[1, 2, 3, 4, 5].map(n => <Pressable key={n} accessibilityRole="radio" accessibilityState={{checked: value === n}} accessibilityLabel={n + (n === 1 ? ' estrela ou mais' : ' estrelas ou mais')} hitSlop={4} onPress={() => onChange(value === n ? 0 : n)} style={{width: 26, height: 32, alignItems: 'center', justifyContent: 'center'}}>
      <Text style={{fontSize: 18, color: n <= value ? PALETTE.amber : c.line}}>★</Text></Pressable>)}</View>
  </View>;
}
/** Linha de resultado: o que esta aplicado, Limpar e (opcional) a ordem. */
export function ResultLine({text, onClear, right}: {text: string; onClear?: () => void; right?: React.ReactNode}) {
  const c = useTheme();
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
    <Text numberOfLines={1} style={{flex: 1, color: c.muted, fontSize: 13}}>{text}</Text>
    {onClear ? <Pressable accessibilityRole="button" hitSlop={8} onPress={onClear}><Text style={{color: c.accent, fontSize: 13, fontWeight: '600'}}>Limpar</Text></Pressable> : null}
    {right}
  </View>;
}
