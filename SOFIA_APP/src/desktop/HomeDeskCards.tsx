import {dpx} from '../lib/content-width';
import {LoadingLines, ShimmerBlock, ShimmerGroup} from '../components/Loading';
import React, {useState} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import {useTheme} from '../lib/theme';
import {Icon, type IconName} from '../components/Icon';
import {TaskPriority} from '../components/TaskPriority';
import {AREA_STYLE, noticeArea} from '../components/NotificationCenter';
import {useCapsules} from '../lib/capsule-store';
import {capsuleDoses} from '../lib/capsule-model';
import {PALETTE} from '../lib/palette';
import type {SofiaApi} from '../lib/api';
import type {Notice, Task} from '../lib/types';
/** 0.3.265 (Inicio no computador, desenho aprovado): cartoes do Resumo do dia, Tarefas backlog que estica ate a altura da
 * coluna ao lado e Capsulas com barra de cor e caixinha de marcar. */
const card = (c: ReturnType<typeof useTheme>) => ({backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 16, padding: 18, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'} as any);
const hhmm = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}); };
const sameDay = (iso: string | null | undefined, ref = new Date()) => { if (!iso) return false; const d = new Date(iso); return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate(); };

export type DayItem = {title: string; date: string};
/** Frase curta que nasce do dia de verdade (usada embaixo da saudacao). */
export function daySentence(items: DayItem[], todo: Task[], now = new Date()): string {
  const h = now.getHours(), important = todo.filter(t => t.priority_level === 'important' && sameDay(t.due_at, now)).length;
  if (h >= 19) return 'Como foi o dia? Quer deixar algo anotado para amanhã?';
  if (important >= 2) return important + ' tarefas importantes vencem hoje. Começamos por elas?';
  if (items.length) return 'Você tem ' + items.length + (items.length === 1 ? ' compromisso' : ' compromissos') + ' hoje. Por onde a gente começa?';
  return 'Dia livre na agenda. Quer adiantar alguma coisa do backlog?';
}

export function DaySummaryCard({items, todo, notices, onNotice, onTalk}: {items: DayItem[]; todo: Task[]; notices: Notice[]; onNotice: (n: Notice) => void; onTalk: () => void}) {
  const c = useTheme(), now = new Date();
  const sorted = [...items].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), next = sorted.find(i => Date.parse(i.date) >= now.getTime() - 15 * 60000);
  const important = todo.filter(t => t.priority_level === 'important' && t.state !== 'done' && sameDay(t.due_at, now));
  const highlights: {key: string; icon: IconName; color: string; title: string; text: string; onPress?: () => void}[] = [];
  if (important.length) highlights.push({key: 'tasks', icon: 'warning', color: c.danger, title: important.length + (important.length === 1 ? ' tarefa importante vence hoje' : ' tarefas importantes vencem hoje'), text: important.slice(0, 3).map(t => t.title).join(' · ')});
  for (const n of notices.filter(n => n.state === 'unread').slice(0, 4 - highlights.length)) {
    const st = (AREA_STYLE as Record<string, {color: string; glyph?: string}>)[noticeArea(n)] || {color: c.accent, glyph: 'bell'};
    highlights.push({key: n.id, icon: (st.glyph || 'bell') as IconName, color: st.color, title: n.title, text: n.body, onPress: () => onNotice(n)});
  }
  return <View testID="home-day-summary" style={[card(c), {gap: 12, flex: 1}]}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
      <View style={{width: 26, height: 26, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center'}}><Icon name="sofia" size={15} color={c.onAccent} active /></View>
      <Text style={{flex: 1, color: c.text, fontSize: 16, fontWeight: '600'}}>Resumo do dia</Text><Text style={{color: c.muted, fontSize: 12}}>por Sofia</Text>
    </View>
    <Text style={{color: c.text, fontSize: 14, lineHeight: 21}}>{items.length ? <>{items.length >= 5 ? 'Dia cheio: ' : 'Hoje: '}<Text style={{fontWeight: '600'}}>{items.length} {items.length === 1 ? 'compromisso' : 'compromissos'}</Text>{next ? <>, o próximo é <Text style={{fontWeight: '600'}}>{next.title} às {hhmm(next.date)}</Text></> : ''}.</> : 'Nada marcado na agenda hoje.'}</Text>
    {highlights.map(h => <Pressable key={h.key} disabled={!h.onPress} accessibilityRole={h.onPress ? 'button' : undefined} onPress={h.onPress} style={{flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 11, borderRadius: 12, backgroundColor: c.input}}>
      <View style={{width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: h.color + '22'}}><Icon name={h.icon} size={15} color={h.color} weight="duotone" /></View>
      <View style={{flex: 1, gap: 2}}><Text numberOfLines={1} style={{color: c.text, fontSize: 13, fontWeight: '600'}}>{h.title}</Text>{h.text ? <Text numberOfLines={1} style={{color: c.muted, fontSize: 12}}>{h.text}</Text> : null}</View>
    </Pressable>)}
    {!highlights.length ? <Text style={{color: c.muted, fontSize: 13}}>Sem novidades por enquanto. Quer adiantar algo do backlog?</Text> : null}
    <Pressable accessibilityRole="link" onPress={onTalk} style={{marginTop: 'auto'}}><Text style={{color: c.accent, fontSize: 13}}>Conversar sobre o meu dia →</Text></Pressable>
  </View>;
}

export function DeskTasksCard({todo, ready, areaLabel, priorityLabel, onArea, onPriority, query, onQuery, onToggle, onOpen, onSeeAll, busy}: {todo: Task[]; ready: boolean; areaLabel: string; priorityLabel: string; onArea: () => void; onPriority: () => void; query: string; onQuery: (v: string) => void; onToggle: (t: Task) => void; onOpen: (t: Task) => void; onSeeAll: () => void; busy?: boolean}) {
  const c = useTheme(), [listH, setListH] = useState(0), ROW = 48, fit = Math.max(3, Math.floor(listH / ROW));
  return <View testID="home-desk-tasks" style={[card(c), {flex: 1, gap: 10}]}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
      <Text style={{flex: 1, color: c.text, fontSize: 16, fontWeight: '600'}}>Tarefas</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Filtrar áreas das tarefas do Início" onPress={onArea} style={{paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: c.accentSoft}}><Text numberOfLines={1} style={{fontSize: 11, color: c.accent, maxWidth: 110}}>{areaLabel} ▾</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Filtrar níveis das tarefas do Início" onPress={onPriority} style={{paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: c.accentSoft}}><Text style={{fontSize: 11, color: c.accent}}>{priorityLabel} ▾</Text></Pressable>
      <Text style={{color: c.muted, fontSize: 12, marginLeft: 2}}>{todo.length}</Text>
    </View>
    <TextInput accessibilityLabel="Buscar tarefa no Início" value={query} onChangeText={onQuery} placeholder="Buscar tarefa" placeholderTextColor={c.muted} style={{color: c.text, backgroundColor: c.input, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, outlineStyle: 'none'} as any} />
    <View onLayout={e => {const h = e.nativeEvent.layout.height; if (h > 0) setListH(h);}} style={{flex: 1, minHeight: ROW * 4, overflow: 'hidden'}}>
      <View style={{position: 'absolute', top: 0, left: 0, right: 0}}>
        {!ready ? <Text style={{color: c.muted, fontSize: 13, paddingVertical: 12}}>Sincronizando tarefas…</Text> : !todo.length ? <Text style={{color: c.muted, fontSize: 13, paddingVertical: 12}}>{query ? 'Nenhuma tarefa com essa busca.' : 'Tudo em dia por aqui.'}</Text> : todo.slice(0, fit).map((t, i) => <View key={t.id} style={{flexDirection: 'row', alignItems: 'center', gap: 12, height: ROW, borderTopWidth: i ? 1 : 0, borderColor: c.line}}>
          <Pressable disabled={busy} accessibilityRole="checkbox" accessibilityLabel={'Concluir ' + t.title} accessibilityState={{checked: t.state === 'done'}} onPress={() => onToggle(t)} style={{width: 28, height: 28, alignItems: 'center', justifyContent: 'center'}}><View style={{width: 17, height: 17, borderRadius: 9, borderWidth: 1.5, borderColor: c.muted}} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={'Abrir tarefa ' + t.title} onPress={() => onOpen(t)} style={{flex: 1, gap: 1}}><Text numberOfLines={1} style={{color: c.text, fontSize: 14}}>{t.title}</Text><TaskPriority task={t} /></Pressable>
          {t.area ? <Text numberOfLines={1} style={{color: c.muted, fontSize: 12, maxWidth: 140}}>{t.area}</Text> : null}
        </View>)}
      </View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={'Ver todas as ' + todo.length + ' tarefas'} onPress={onSeeAll} style={{alignItems: 'center', paddingTop: 4}}><Text style={{color: c.accent, fontSize: 13}}>Ver todas</Text></Pressable>
  </View>;
}

const DOSE_COLORS = [PALETTE.green, PALETTE.amber, PALETTE.blue, PALETTE.pink, PALETTE.lilac, PALETTE.teal];
export function DeskCapsulesCard({api, active, onOpen}: {api: SofiaApi; active: boolean; onOpen: () => void}) {
  const c = useTheme(), state = useCapsules(api, active), doses = capsuleDoses(state.plans, state.history), taken = doses.filter(d => d.taken).length;
  const colorOf = (planId: string) => DOSE_COLORS[Math.max(0, state.plans.findIndex(p => p.id === planId)) % DOSE_COLORS.length];
  return <View testID="home-desk-capsules" style={[card(c), {gap: 8}]}>
    <View style={{flexDirection: 'row', alignItems: 'center'}}>
      <Pressable accessibilityRole="link" accessibilityLabel="Abrir app Cápsulas" onPress={onOpen} style={{flex: 1}}><Text style={{color: c.text, fontSize: 16, fontWeight: '600'}}>Rotina</Text></Pressable>
      <Text style={{color: c.muted, fontSize: 12}}>hoje · {taken} de {doses.length}</Text>
    </View>
    {!state.loaded ? <LoadingLines rows={2} /> : !doses.length ? <Text style={{color: c.muted, fontSize: 13}}>Nenhuma dose para hoje.</Text> : doses.map(d => { const color = colorOf(d.plan.id), on = !!d.taken; return <View key={d.key} style={{flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 10, paddingVertical: 6, borderLeftWidth: 3, borderColor: color}}>
      <View style={{flex: 1, gap: 2}}><Text numberOfLines={1} style={{color: on ? c.muted : c.text, fontSize: 14, textDecorationLine: on ? 'line-through' : 'none'}}>{d.plan.title}</Text><Text style={{color: d.due && !on && !d.missed ? c.danger : c.muted, fontSize: 12}}>{[d.plan.data?.dose_text, d.time].filter(Boolean).join(' · ')}{d.missed && !on ? ' · Não tomada' : ''}</Text></View>
      <Pressable testID={'home-capsule-check-' + d.key} accessibilityRole="checkbox" accessibilityLabel={(on ? 'Tomada: ' : 'Marcar como tomada: ') + d.plan.title + ' às ' + d.time} accessibilityState={{checked: on, disabled: on || !!state.saving}} disabled={on || !!state.saving} onPress={() => void state.take(d.plan.id, d.day, d.time).catch(() => {})} style={{width: 32, height: 32, alignItems: 'center', justifyContent: 'center'}}>
        <View style={{width: 20, height: 20, borderRadius: 6, borderWidth: 1.6, borderColor: on ? c.line : c.muted + '77', backgroundColor: on ? c.line : 'transparent', alignItems: 'center', justifyContent: 'center'}}>{on ? <Icon name="check" size={13} color={c.text} weight="bold" /> : null}</View>
      </Pressable>
    </View>; })}
  </View>;
}

/** 0.3.289 (Pedro: "o melhor e ter o esqueleto com shimmer"): enquanto tarefas e agenda chegam, o Inicio do computador
 * mostra os cartoes vazios com brilho, no mesmo lugar e tamanho dos de verdade (a primeira linha com a mesma altura
 * minima da linha real), e troca direto pelos cartoes prontos - sem fade e sem pular. */
export function HomeDeskSkeleton({rowHeight, lowHeight}: {rowHeight: any; lowHeight: any}) {
  const c = useTheme();
  const box = (flex: number, h: any, rows: number, title: number) => <View style={[card(c), {flex, height: h, gap: 14, overflow: 'hidden'}]}>
    <ShimmerBlock width={title} height={16} radius={6} />
    <LoadingLines rows={rows} />
  </View>;
  // mesmos espacos da grade real (18 na escala do celular = 13 no computador, vezes o fator da tela)
  const g = dpx(13) as any;
  return <ShimmerGroup><View testID="home-desk-skeleton" style={{gap: g}}>
    <View style={{flexDirection: 'row', gap: g}}>{box(0.62, rowHeight, 4, 130)}{box(1.38, rowHeight, 6, 90)}</View>
    <View style={{flexDirection: 'row', gap: g}}>{box(1.5, lowHeight, 5, 110)}{box(1, lowHeight, 3, 120)}</View>
  </View></ShimmerGroup>;
}
