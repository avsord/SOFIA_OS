// 0.3.292 (Inicio novo do site, prototipo aprovado): embaixo da saudacao, o cartao "Seu dia" (frase da Sofia,
// atalhos e a linha do tempo do dia) e o resumo de tudo em blocos do mesmo tamanho. So o Price Tracker passa
// sozinho pelos produtos; o resto fica parado no item mais importante (decisao do Pedro: menos movimento).
// Medidas em px de computador (metro: FLUID - so o fator da tela).
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, Pressable, Text, View} from 'react-native';
import {useTheme} from '../lib/theme';
import type {Task} from '../lib/types';
import type {DayRecord} from '../lib/dashboard';
import type {MonitorWidgetRow} from '../lib/monitoring';
import type {HomeBriefData} from '../lib/home-brief';
import {capsuleDoses} from '../lib/capsule-model';
import {agendaPriority, isHoliday, HOLIDAY_COLOR} from '../lib/agenda-priority';
import {useReducedMotion} from '../lib/motion';
import {Icon, type IconName} from '../components/Icon';

const hhmm = (d: Date) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const brl = (v: number) => v.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL', maximumFractionDigits: v >= 1000 ? 0 : 2});
const tint = (hex: string, a: number) => {const h = hex.replace('#', ''); if (h.length !== 6) return hex; const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;};
const isImportant = (t: Task) => t.priority_level === 'important';
/** saiu para entrega (a etapa 2 sem ser retirada) */
const isOut = (x: {step: number; needs: string; delivered: boolean}) => !x.delivered && x.step === 2 && x.needs !== 'pickup';
/** cor do item na Agenda (tarefa usa a prioridade da tarefa; compromisso a do evento; feriado verde) */
const colorOf = (r: DayRecord, accent: string) => {const o: any = r.original || {}; return agendaPriority({data: {priority_level: o.data?.priority_level ?? o.priority_level, calendar_id: o.data?.calendar_id}} as any).color || accent;};
/** hora (hoje) ou dia e hora (outros dias) */
const whenLabel = (r: DayRecord) => {const d = new Date(r.date), n = new Date(), tm = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1); const t = timed(r) ? hhmm(d) : ''; if (d.toDateString() === n.toDateString()) return t || 'hoje'; if (d.toDateString() === tm.toDateString()) return 'amanhã' + (t ? ' ' + t : ''); return d.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}) + (t ? ' ' + t : '');};
const timed = (r: DayRecord) => !/^\d{4}-\d{2}-\d{2}$/.test(r.date) && !(r.original as any)?.data?.calendar_all_day;

export type HomeBriefProps = {
  data: HomeBriefData; today: DayRecord[]; all: DayRecord[]; tasks: Task[]; series: MonitorWidgetRow[] | null;
  onOpenItem: (r: DayRecord) => void; onOpenTasks: () => void; onToggleTask: (t: Task) => void;
  onOpenModule: (id: string) => void; onOpenMonitoring: () => void; onOpenAgenda: () => void;
};

export function HomeBrief(p: HomeBriefProps) {
  const c = useTheme(), now = new Date();
  const open = useMemo(() => p.tasks.filter(t => t.state !== 'done'), [p.tasks]);
  const important = open.filter(isImportant);
  const items = useMemo(() => p.today.filter(r => !isHoliday((r.original || {}) as any)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), [p.today]);
  const upcoming = items.filter(r => timed(r) && Date.parse(r.date) >= now.getTime() - 5 * 60000);
  const next = upcoming[0] || null;
  // proximos: o resto de hoje e, se acabar, os dos dias seguintes (0.3.293: antes ficava vazio a noite)
  const nextItems = useMemo(() => {const t0 = now.getTime() - 5 * 60000, todayKey = now.toDateString(); return p.all.filter(r => !isHoliday((r.original || {}) as any)).filter(r => {const d = new Date(r.date); return timed(r) ? d.getTime() >= t0 : d.toDateString() !== todayKey && d.getTime() > t0;}).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).slice(0, 3);}, [p.all, now.getHours(), now.getMinutes()]);
  const low = (p.series || []).filter(s => s.atLow);
  const outToday = p.data.packs.filter(x => isOut(x) || x.needs === 'pickup');

  // frase da Sofia: o dia em uma linha, com o que mudou de importante nos outros apps
  const parts: React.ReactNode[] = [];
  const strong = (t: string) => <Text style={{fontWeight: '600', color: c.text}}>{t}</Text>;
  if (!items.length && !important.length) parts.push('Dia livre: nada marcado e nenhuma tarefa importante. ');
  else {
    parts.push(items.length > 5 ? 'Dia cheio: ' : 'Hoje: ');
    if (items.length) parts.push(strong(items.length === 1 ? '1 compromisso' : items.length + ' compromissos'));
    if (items.length && important.length) parts.push(' e ');
    if (important.length) parts.push(strong(important.length === 1 ? '1 tarefa importante' : important.length + ' tarefas importantes'));
    parts.push('. ');
  }
  if (next) {parts.push('O próximo é '); parts.push(strong(next.title + ' às ' + hhmm(new Date(next.date)))); parts.push('. ');}
  const extra: string[] = [];
  if (low.length) extra.push((low.length === 1 ? low[0].title + ' chegou ao menor preço' : low.length + ' produtos estão no menor preço'));
  if (outToday.length) extra.push(outToday[0].title + (outToday[0].needs === 'pickup' ? ' está esperando você retirar' : ' sai para entrega hoje'));
  const extraText = extra.length ? extra.join(' e ') + '.' : '';

  const actions: {label: string; primary?: boolean; run: () => void}[] = [];
  if (next) actions.push({label: 'Abrir ' + next.title, primary: true, run: () => p.onOpenItem(next)});
  if (important.length) actions.push({label: important.length === 1 ? 'Ver a tarefa' : 'Ver as ' + important.length + ' tarefas', run: p.onOpenTasks});
  if (low.length) actions.push({label: 'Ver ' + (low.length === 1 ? 'o ' + low[0].title : 'os produtos'), run: p.onOpenMonitoring});

  const card = {backgroundColor: c.surface, borderRadius: 18, padding: 18, boxShadow: '0 0 0 1px rgba(255,255,255,0.045), 0 1px 2px rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.18)'} as any;
  return <View style={{gap: 14}}>
    <View testID="home-brief" style={{...card, borderRadius: 24, padding: 24, paddingBottom: 20, backgroundColor: c.surface}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <View style={{width: 24, height: 24, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center'}}><Text style={{color: c.onAccent, fontWeight: '700', fontSize: 12}}>S</Text></View>
        <Text style={{color: c.text, fontWeight: '600', fontSize: 14}}>Seu dia</Text>
        <View style={{flex: 1}} />
        <Pressable accessibilityRole="link" onPress={p.onOpenAgenda}><Text style={{color: c.muted, fontSize: 12}}>Abrir agenda</Text></Pressable>
      </View>
      <Text style={{marginTop: 12, fontSize: 20, lineHeight: 28, fontWeight: '500', color: c.text, maxWidth: 860, textWrap: 'balance'} as any}>{parts.map((x, i) => <React.Fragment key={i}>{x}</React.Fragment>)}{extraText ? <Text style={{color: c.muted}}>{extraText}</Text> : null}</Text>
      {actions.length ? <View style={{flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap'}}>
        {actions.map(a => <Pressable key={a.label} accessibilityRole="button" onPress={a.run} style={({hovered, pressed}: any) => ({height: 36, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center', backgroundColor: a.primary ? c.accent : hovered ? tint(c.accent, 0.22) : c.accentSoft, transform: [{scale: pressed ? 0.97 : 1}]})}>
          <Text numberOfLines={1} style={{fontSize: 13, fontWeight: '600', color: a.primary ? c.onAccent : c.accent, maxWidth: 260}}>{a.label}</Text>
        </Pressable>)}
      </View> : null}
      <Timeline items={items.filter(timed)} next={next} onOpen={p.onOpenItem} />
    </View>
    <View style={{flexDirection: 'row', gap: 14}}>
      <AgendaTile style={{flex: 2}} card={card} upcoming={nextItems} onOpen={p.onOpenItem} onOpenAgenda={p.onOpenAgenda} />
      <TasksTile style={{flex: 1}} card={card} open={open} onOpen={p.onOpenTasks} onDone={p.onToggleTask} />
      <RotinaTile style={{flex: 1}} card={card} data={p.data} onOpen={() => p.onOpenModule('capsules')} />
    </View>
    <View style={{flexDirection: 'row', gap: 14}}>
      <FinanceTile style={{flex: 1}} card={card} data={p.data} onOpen={() => p.onOpenModule('finance')} />
      <PriceTile style={{flex: 1}} card={card} rows={p.series} onOpen={p.onOpenMonitoring} />
      <PackagesTile style={{flex: 1}} card={card} data={p.data} onOpen={() => p.onOpenModule('packages')} />
      <MailTile style={{flex: 1}} card={card} data={p.data} onOpen={() => p.onOpenModule('mail')} />
    </View>
  </View>;
}

/** Linha do tempo das 7h as 23h (ou mais, se houver algo fora): pontos na cor de cada item, juntando os que
 * ficam colados num numero; so o proximo aparece escrito; a marca de "agora" divide o que ja passou. */
function Timeline({items, next, onOpen}: {items: DayRecord[]; next: DayRecord | null; onOpen: (r: DayRecord) => void}) {
  const c = useTheme(), [w, setW] = useState(0), now = new Date();
  const hours = items.map(r => new Date(r.date).getHours());
  const start = Math.min(7, ...hours), end = Math.max(23, ...hours.map(h => h + 1));
  const pos = (d: Date) => ((d.getHours() + d.getMinutes() / 60) - start) / (end - start);
  const nowX = Math.max(0, Math.min(1, pos(now)));
  const groups: {x: number; list: DayRecord[]}[] = [];
  for (const r of items) {const x = pos(new Date(r.date)); const g = groups[groups.length - 1]; if (g && w && (x - g.x) * w < 22) g.list.push(r); else groups.push({x, list: [r]});}
  const color = (r: DayRecord) => colorOf(r, c.accent);
  return <View style={{marginTop: 26, height: 60}} onLayout={e => setW(e.nativeEvent.layout.width)}>
    <View style={{position: 'absolute', left: 0, right: 0, top: 28, height: 2, borderRadius: 1, backgroundColor: c.line}} />
    <View style={{position: 'absolute', left: 0, width: (nowX * 100 + '%') as any, top: 28, height: 2, borderRadius: 1, backgroundColor: tint(c.accent, 0.45)}} />
    {groups.map((g, i) => {
      const isNext = !!next && g.list.includes(next), many = g.list.length > 1, size = isNext ? 16 : many ? 20 : 12;
      return <Pressable key={i} accessibilityRole="button" accessibilityLabel={g.list.map(r => hhmm(new Date(r.date)) + ' ' + r.title).join(', ')} onPress={() => onOpen(g.list[0])} hitSlop={14}
        style={{position: 'absolute', left: (g.x * 100 + '%') as any, top: 29 - size / 2, width: size, height: size, marginLeft: -size / 2, borderRadius: size / 2, borderWidth: 3, borderColor: c.surface, backgroundColor: color(g.list[0]), alignItems: 'center', justifyContent: 'center'}}>
        {many && !isNext ? <Text style={{fontSize: 10, fontWeight: '700', color: c.onAccent}}>{g.list.length}</Text> : null}
      </Pressable>;
    })}
    {next ? <View pointerEvents="none" style={{position: 'absolute', left: (pos(new Date(next.date)) * 100 + '%') as any, top: 0, transform: [{translateX: -60}], width: 120, alignItems: 'center'}}>
      <Text numberOfLines={1} style={{fontSize: 12, fontWeight: '600', color: c.text, backgroundColor: tint(c.accent, 0.14), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden'}}>{hhmm(new Date(next.date))} {next.title}</Text>
    </View> : null}
    <View pointerEvents="none" style={{position: 'absolute', left: (nowX * 100 + '%') as any, top: 18, width: 2, height: 22, marginLeft: -1, borderRadius: 1, backgroundColor: c.danger}} />
    {[0, 0.25, 0.5, 0.75, 1].map(f => <Text key={f} style={{position: 'absolute', top: 42, left: (f * 100 + '%') as any, transform: [{translateX: f === 0 ? 0 : f === 1 ? -36 : -18}], fontSize: 11, color: c.muted, fontVariant: ['tabular-nums']}}>{String(Math.round(start + f * (end - start))).padStart(2, '0')}:00</Text>)}
  </View>;
}

function TileHead({icon, color, name, onOpen}: {icon: IconName; color: string; name: string; onOpen: () => void}) {
  const c = useTheme();
  return <Pressable accessibilityRole="link" accessibilityLabel={'Abrir ' + name} onPress={onOpen} style={{flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start'}}>
    <View style={{width: 22, height: 22, borderRadius: 7, backgroundColor: tint(color, 0.16), alignItems: 'center', justifyContent: 'center'}}><Icon name={icon} size={13} color={color} /></View>
    <Text style={{fontSize: 12, color: c.muted, fontWeight: '500'}}>{name}</Text>
  </Pressable>;
}
function Big({value, unit}: {value: string; unit?: string}) {
  const c = useTheme();
  return <Text numberOfLines={1} style={{fontSize: 24, fontWeight: '600', letterSpacing: -0.6, color: c.text, fontVariant: ['tabular-nums']}}>{value}{unit ? <Text style={{fontSize: 13, fontWeight: '400', letterSpacing: 0, color: c.muted}}>  {unit}</Text> : null}</Text>;
}
function Line({text}: {text: string}) {const c = useTheme(); return <Text numberOfLines={1} style={{fontSize: 12, color: c.text, opacity: 0.85}}>{text}</Text>;}
function Act({label, onPress}: {label: string; onPress: () => void}) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={({hovered, pressed}: any) => ({alignSelf: 'flex-start', marginTop: 10, height: 30, paddingHorizontal: 11, borderRadius: 9, justifyContent: 'center', backgroundColor: hovered ? tint(c.accent, 0.22) : c.accentSoft, transform: [{scale: pressed ? 0.97 : 1}]})}>
    <Text style={{fontSize: 12, fontWeight: '600', color: c.accent}}>{label}</Text>
  </Pressable>;
}
function Quiet({text, sub}: {text: string; sub: string}) {const c = useTheme(); return <View style={{marginTop: 'auto', gap: 4} as any}><Text style={{fontSize: 14, color: c.muted, fontWeight: '500'}}>{text}</Text><Text numberOfLines={1} style={{fontSize: 12, color: c.muted}}>{sub}</Text></View>;}
const Dot = () => {const c = useTheme(); return <View style={{position: 'absolute', top: 18, right: 18, width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger, boxShadow: '0 0 0 4px ' + tint('#F5A0AE', 0.15)} as any} />;};

function AgendaTile({style, card, upcoming, onOpen, onOpenAgenda}: {style: any; card: any; upcoming: DayRecord[]; onOpen: (r: DayRecord) => void; onOpenAgenda: () => void}) {
  const c = useTheme(), list = upcoming.slice(0, 3);
  return <View style={[card, style, {height: 176, gap: 6, overflow: 'hidden'}]}>
    <TileHead icon="calendar" color="#8fb4ff" name="Agenda · próximos" onOpen={onOpenAgenda} />
    {list.length ? list.map((r, i) => <Pressable key={r.id + i} onPress={() => onOpen(r)} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 10, height: 34, borderTopWidth: i ? 1 : 0, borderColor: c.line, backgroundColor: hovered ? c.input : 'transparent', borderRadius: 6})}>
      <Text numberOfLines={1} style={{width: 92, fontSize: 13, color: c.muted, fontVariant: ['tabular-nums']}}>{whenLabel(r)}</Text>
      <View style={{width: 3, height: 16, borderRadius: 2, backgroundColor: colorOf(r, c.accent)}} />
      <Text numberOfLines={1} style={{flex: 1, fontSize: 13, color: c.text}}>{r.title}</Text>
    </Pressable>) : <Quiet text="Nada marcado" sub="Nenhum compromisso pela frente neste mês." />}
  </View>;
}
function TasksTile({style, card, open, onOpen, onDone}: {style: any; card: any; open: Task[]; onOpen: () => void; onDone: (t: Task) => void}) {
  const imp = open.filter(isImportant), first = imp[0] || open[0];
  return <View style={[card, style, {height: 176, gap: 6, overflow: 'hidden'}]}>
    {imp.length ? <Dot /> : null}
    <TileHead icon="checklist" color="#F5A0AE" name="Tarefas" onOpen={onOpen} />
    {first ? <View style={{marginTop: 'auto', gap: 4} as any}>
      <Big value={String(imp.length || open.length)} unit={imp.length ? (imp.length === 1 ? 'importante' : 'importantes') : 'em aberto'} />
      <Line text={(imp.length ? 'Comece por ' : '') + first.title} />
      <Act label="Concluir" onPress={() => onDone(first)} />
    </View> : <Quiet text="Tudo feito" sub="Nenhuma tarefa em aberto." />}
  </View>;
}
function RotinaTile({style, card, data, onOpen}: {style: any; card: any; data: HomeBriefData; onOpen: () => void}) {
  const s = data.capsules, today = new Date().toDateString();
  const doses = capsuleDoses(s.plans, s.history).filter(d => d.date.toDateString() === today);
  const done = doses.filter(d => d.taken).length, next = doses.find(d => !d.taken);
  const late = !!next && next.date.getTime() < Date.now();
  return <View style={[card, style, {height: 176, gap: 6, overflow: 'hidden'}]}>
    {late ? <Dot /> : null}
    <TileHead icon="cycle" color="#88CFB8" name="Rotina" onOpen={onOpen} />
    {doses.length ? <View style={{marginTop: 'auto', gap: 4} as any}>
      <Big value={String(done)} unit={'de ' + doses.length + ' hoje'} />
      <Line text={next ? (late ? next.plan.title + ' passou da hora (' + hhmm(next.date) + ')' : 'Próximo: ' + next.plan.title + ' às ' + hhmm(next.date)) : 'Tudo feito por hoje.'} />
      {next ? <Act label="Tomei" onPress={() => void s.take(next.plan.id, next.day, next.time).catch(() => undefined)} /> : null}
    </View> : <Quiet text="Nada hoje" sub="Nenhum item da rotina para hoje." />}
  </View>;
}
function FinanceTile({style, card, data, onOpen}: {style: any; card: any; data: HomeBriefData; onOpen: () => void}) {
  const dues = data.dues, first = dues?.[0], today = new Date().toISOString().slice(0, 10);
  const when = (d: string) => d === today ? 'vence hoje' : d < today ? 'venceu ' + d.slice(8, 10) + '/' + d.slice(5, 7) : 'vence ' + d.slice(8, 10) + '/' + d.slice(5, 7);
  return <View style={[card, style, {height: 176, gap: 6, overflow: 'hidden'}]}>
    {first && first.date <= today ? <Dot /> : null}
    <TileHead icon="wallet" color="#b49ae6" name="Finanças" onOpen={onOpen} />
    {dues === null ? <Quiet text="Abra Finanças" sub="Para ver as contas neste computador." /> : first ? <View style={{marginTop: 'auto', gap: 4} as any}>
      <Big value={String(dues.length)} unit={dues.length === 1 ? 'conta na semana' : 'contas na semana'} />
      <Line text={first.title + ' ' + when(first.date) + ' · ' + brl(first.amount)} />
      <Act label="Ver a conta" onPress={onOpen} />
    </View> : <Quiet text="Nenhuma conta" sub="Nada vence nos próximos 7 dias." />}
  </View>;
}
/** Price Tracker: mostra um produto por vez; as setas passam para o proximo (0.3.293: sem trocar sozinho). */
function PriceTile({style, card, rows, onOpen}: {style: any; card: any; rows: MonitorWidgetRow[] | null; onOpen: () => void}) {
  const c = useTheme(), reduced = useReducedMotion();
  const list = useMemo(() => [...(rows || [])].filter(r => r.price != null).sort((a, b) => Number(b.atLow) - Number(a.atLow) || Math.abs(b.change || 0) - Math.abs(a.change || 0)), [rows]);
  const [i, setI] = useState(0), [hover, setHover] = useState(false), fade = useRef(new Animated.Value(1)).current;
  const go = (n: number) => {Animated.timing(fade, {toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false}).start(() => {setI(n); Animated.timing(fade, {toValue: 1, duration: 280, easing: Easing.bezier(0.22, 0.8, 0.24, 1), useNativeDriver: false}).start();});};
  // 0.3.293 (Pedro): parado; troca so quando a pessoa escolhe
  void hover; void reduced;
  const r = list[i % Math.max(1, list.length)];
  return <View style={[card, style, {height: 176, gap: 6, overflow: 'hidden'}]} {...({onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false)} as any)}>
    
    <TileHead icon="tag" color="#88CFB8" name="Price Tracker" onOpen={onOpen} />
    {list.length > 1 ? <View style={{position: 'absolute', top: 14, right: 12, flexDirection: 'row', alignItems: 'center', gap: 2}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Produto anterior" onPress={() => go((i - 1 + list.length) % list.length)} style={({hovered}: any) => ({width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Text style={{color: c.muted, fontSize: 14}}>‹</Text></Pressable>
      <Text style={{fontSize: 11, color: c.muted, fontVariant: ['tabular-nums'], minWidth: 28, textAlign: 'center'}}>{(i % list.length) + 1} de {list.length}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Próximo produto" onPress={() => go((i + 1) % list.length)} style={({hovered}: any) => ({width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Text style={{color: c.muted, fontSize: 14}}>›</Text></Pressable>
    </View> : null}
    {r ? <Animated.View style={{marginTop: 'auto', gap: 4, opacity: fade, transform: [{translateY: fade.interpolate({inputRange: [0, 1], outputRange: [6, 0]})}]} as any}>
      <Big value={brl(r.price || 0)} unit={r.title} />
      <Line text={r.atLow ? 'Menor preço já visto' + (r.store ? ' · ' + r.store : '') : r.change ? (r.change < 0 ? 'Caiu ' : 'Subiu ') + Math.abs(r.change).toFixed(1).replace('.', ',') + '%' + (r.store ? ' · ' + r.store : '') : 'Estável' + (r.store ? ' · ' + r.store : '')} />
      <Act label="Ver o produto" onPress={onOpen} />
    </Animated.View> : <Quiet text="Nenhum produto" sub="Cole o link de um produto no Price Tracker." />}
  </View>;
}
function PackagesTile({style, card, data, onOpen}: {style: any; card: any; data: HomeBriefData; onOpen: () => void}) {
  const list = [...data.packs].sort((a, b) => Number(isOut(b) || !!b.needs) - Number(isOut(a) || !!a.needs)), first = list[0];
  return <View style={[card, style, {height: 176, gap: 6, overflow: 'hidden'}]}>
    {first && (first.needs === 'fee' || first.needs === 'pickup') ? <Dot /> : null}
    <TileHead icon="box" color="#E8B04A" name="Encomendas" onOpen={onOpen} />
    {first ? <View style={{marginTop: 'auto', gap: 4} as any}>
      <Big value={isOut(first) ? 'Hoje' : String(list.length)} unit={isOut(first) ? undefined : 'a caminho'} />
      <Line text={first.title + ': ' + first.status.charAt(0).toLowerCase() + first.status.slice(1)} />
      <Act label="Rastrear" onPress={onOpen} />
    </View> : <Quiet text="Nada a caminho" sub="Tudo o que você pediu já chegou." />}
  </View>;
}
function MailTile({style, card, data, onOpen}: {style: any; card: any; data: HomeBriefData; onOpen: () => void}) {
  const list = data.mailNew, first = list[0];
  return <View style={[card, style, {height: 176, gap: 6, overflow: 'hidden'}]}>
    <TileHead icon="mail" color="#8fb4ff" name="E-mails" onOpen={onOpen} />
    {first ? <View style={{marginTop: 'auto', gap: 4} as any}>
      <Big value={String(list.length)} unit={list.length === 1 ? 'novo' : 'novos'} />
      <Line text={String(first.data?.from_name || first.data?.from_addr || '') + ' · ' + first.title} />
      <Act label="Abrir" onPress={onOpen} />
    </View> : <Quiet text="Nada novo" sub="A Sofia segue de olho nas suas regras." />}
  </View>;
}
