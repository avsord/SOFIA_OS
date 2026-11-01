import React, {useState} from 'react';
import {Platform, Pressable, ScrollView, Text, View} from 'react-native';
import {appAlert} from '../lib/app-alert';
import {useTheme} from '../lib/theme';
import {PALETTE} from '../lib/palette';
import {Icon} from './Icon';
import {contextMenu} from './ContextMenu';
import type {BoardData, BoardTopic} from '../lib/api';
/** 0.3.265 (Conversa aprovada): o Quadro da conversa. O assunto atual fica aberto ("Agora"); os anteriores viram
 * etiquetas com data e hora e abrem com um clique. Cada assunto tem o "⋯" com Guardar em Paginas e Copiar resumo. */
export function when(iso: string | null, now = new Date()): string {
  if (!iso) return ''; const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), diff = Math.round((day(now) - day(d)) / 864e5);
  const dm = d.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}), hm = d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
  const name = diff === 0 ? 'Hoje' : diff === 1 ? 'Ontem' : (s => s.charAt(0).toUpperCase() + s.slice(1, 3))(d.toLocaleDateString('pt-BR', {weekday: 'short'}));
  return name + ', ' + dm + ' · ' + hm;
}
export function topicSummary(t: BoardTopic): string {
  const lines = ['*' + t.title + '*'];
  const block = (title: string, items: string[]) => { if (items.length) lines.push('', title, ...items.map(i => '• ' + i)); };
  block('Decidido', t.decided); block('A fazer', t.todo); block('Em aberto', t.open.map(o => o.title + (o.detail ? ' — ' + o.detail : ''))); block('Números', t.numbers.map(n => n.label + ': ' + n.value)); block('Referências', t.refs);
  return lines.join('\n');
}
function counts(t: BoardTopic) { const parts: string[] = []; if (t.decided.length) parts.push(t.decided.length + (t.decided.length === 1 ? ' decidido' : ' decididos')); if (t.todo.length) parts.push(t.todo.length + ' a fazer'); if (t.open.length) parts.push(t.open.length + ' em aberto'); return parts.join(' · '); }
function Section({color, title, children}: {color: string; title: string; children: React.ReactNode}) {
  return <View style={{gap: 6}}><View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: color}} /><Text style={{color, fontSize: 12, fontWeight: '600'}}>{title.charAt(0)+title.slice(1).toLowerCase()}</Text></View>{children}</View>;
}
function Item({children, warn}: {children: React.ReactNode; warn?: string}) { const c = useTheme(); return <View style={{padding: 10, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: warn ? warn + '66' : c.line, gap: 2}}>{children}</View>; }
function TopicBody({t}: {t: BoardTopic}) {
  const c = useTheme();
  return <View style={{gap: 12}}>
    {t.decided.length ? <Section color={c.good} title="DECIDIDO">{t.decided.map((x, i) => <Item key={i}><Text style={{color: c.text, fontSize: 13, lineHeight: 18}}>{x}</Text></Item>)}</Section> : null}
    {t.todo.length ? <Section color={c.accent} title="A FAZER">{t.todo.map((x, i) => <Item key={i}><View style={{flexDirection: 'row', gap: 10, alignItems: 'flex-start'}}><View style={{width: 15, height: 15, borderRadius: 5, borderWidth: 1.5, borderColor: c.muted, marginTop: 2}} /><Text style={{flex: 1, color: c.text, fontSize: 13, lineHeight: 18}}>{x}</Text></View></Item>)}</Section> : null}
    {t.open.length ? <Section color={c.warn} title="EM ABERTO">{t.open.map((o, i) => <Item key={i} warn={c.warn}><Text style={{color: c.text, fontSize: 13, lineHeight: 18}}>{o.title}</Text>{o.detail ? <Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>{o.detail}</Text> : null}</Item>)}</Section> : null}
    {t.numbers.length ? <Section color={c.info} title="NÚMEROS">{t.numbers.map((n, i) => <Item key={i}><View style={{flexDirection: 'row', gap: 10}}><Text style={{flex: 1, color: c.text, fontSize: 13}}>{n.label}</Text><Text style={{color: c.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums']}}>{n.value}</Text></View></Item>)}</Section> : null}
    {t.refs.length ? <Section color={c.info} title="REFERÊNCIAS">{t.refs.map((x, i) => <Item key={i}><Text style={{color: c.text, fontSize: 13}}>{x}</Text></Item>)}</Section> : null}
    {!t.decided.length && !t.todo.length && !t.open.length && !t.numbers.length && !t.refs.length ? <Text style={{color: c.muted, fontSize: 12}}>Ainda nada para organizar neste assunto.</Text> : null}
  </View>;
}
export function ConversationBoard({board, loading, onSave, onCopy, compact}: {board: BoardData | null; loading?: boolean; onSave: (t: BoardTopic) => void; onCopy: (t: BoardTopic) => void; compact?: boolean}) {
  const c = useTheme(), topics = board?.topics || [], current = topics[topics.length - 1], previous = topics.slice(0, -1).reverse(), [openKey, setOpenKey] = useState<string>('');
  const menu = (t: BoardTopic) => contextMenu(() => [{label: 'Guardar em Páginas', icon: 'note', run: () => onSave(t)}, {label: 'Copiar resumo', icon: 'copy', run: () => onCopy(t)}]);
  const more = (t: BoardTopic) => <Pressable accessibilityRole="button" accessibilityLabel={'Opções do assunto ' + t.title} {...menu(t)} onPress={(e: any) => { if (Platform.OS === 'web') (menu(t) as any).onContextMenu?.(e); else appAlert(t.title, 'O que fazer com este assunto?', [{text: 'Guardar em Páginas', onPress: () => onSave(t)}, {text: 'Copiar resumo', onPress: () => onCopy(t)}, {text: 'Cancelar', style: 'cancel'}]); }} style={{width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft}}><Icon name="more" size={16} color={c.accent} /></Pressable>;
  return <ScrollView testID="conversation-board" keyboardShouldPersistTaps="handled" style={{flex: 1}} contentContainerStyle={{padding: compact ? 4 : 20, gap: 12}} showsVerticalScrollIndicator={false}>
    {compact ? null : <View style={{gap: 3}}><Text style={{color: c.text, fontSize: 18, fontWeight: '600'}}>Quadro da conversa</Text><View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}><View style={{width: 7, height: 7, borderRadius: 4, backgroundColor: c.good}} /><Text style={{color: c.muted, fontSize: 12}}>{loading ? 'A Sofia está organizando…' : 'A Sofia vai organizando enquanto vocês falam'}</Text></View></View>}
    {!topics.length ? <Text style={{color: c.muted, fontSize: 13, lineHeight: 20, marginTop: 6}}>Converse com a Sofia e ela vai separando aqui o que ficou decidido, o que falta fazer e o que ficou em aberto.</Text> : null}
    {previous.length ? <Text style={{color: c.muted, fontSize: 12, fontWeight: '600', marginTop: 4}}>Assuntos anteriores</Text> : null}
    {previous.map(t => { const key = (t.message_id || t.title), on = openKey === key, dot = t.open.length ? c.warn : c.good; return <View key={key} style={{borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: 'hidden'}}>
      <Pressable accessibilityRole="button" accessibilityState={{expanded: on}} accessibilityLabel={(on ? 'Fechar ' : 'Abrir ') + t.title} onPress={() => setOpenKey(on ? '' : key)} {...menu(t)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12}}>
        <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: dot}} />
        <View style={{flex: 1, minWidth: 0}}><Text numberOfLines={1} style={{color: c.text, fontSize: 13, fontWeight: '600'}}>{t.title}</Text><Text numberOfLines={1} style={{color: c.muted, fontSize: 11, marginTop: 2}}>{[when(t.started_at), counts(t)].filter(Boolean).join(' · ')}</Text></View>
        {t.open.length ? <View style={{paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, backgroundColor: c.warn + '22'}}><Text style={{color: c.warn, fontSize: 10}}>em aberto</Text></View> : null}
        <Icon name="chevron" size={14} color={c.muted} />
      </Pressable>
      {on ? <View style={{padding: 12, paddingTop: 0, gap: 10}}><View style={{flexDirection: 'row', justifyContent: 'flex-end'}}>{more(t)}</View><TopicBody t={t} /></View> : null}
    </View>; })}
    {current ? <>
      <Text style={{color: c.muted, fontSize: 12, fontWeight: '600', marginTop: 6}}>Agora</Text>
      <View testID="board-current" style={{borderRadius: 14, borderWidth: 1, borderColor: c.accent + '55', backgroundColor: c.bg, padding: 14, gap: 12}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent}} /><View style={{flex: 1}}><Text style={{color: c.text, fontSize: 16, fontWeight: '600'}}>{current.title}</Text><Text style={{color: c.muted, fontSize: 11, marginTop: 2}}>{current.started_at ? when(current.started_at).replace(' · ', ' · desde ') : ''}</Text></View>{more(current)}</View>
        <TopicBody t={current} />
      </View>
    </> : null}
    <View style={{height: 10, backgroundColor: PALETTE.black + '00'}} />
  </ScrollView>;
}
