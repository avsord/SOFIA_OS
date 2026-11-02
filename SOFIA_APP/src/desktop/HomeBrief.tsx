// 0.3.292 (Inicio novo do site, prototipo aprovado): embaixo da saudacao, o cartao "Seu dia" (frase da Sofia,
// atalhos e a linha do tempo do dia) e o resumo de tudo em blocos do mesmo tamanho. So o Price Tracker passa
// sozinho pelos produtos; o resto fica parado no item mais importante (decisao do Pedro: menos movimento).
// Medidas em px de computador (metro: FLUID - so o fator da tela).
import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, Pressable, ScrollView, Text, View, useWindowDimensions} from 'react-native';
import {ShimmerBlock, ShimmerGroup, LoadingLines} from '../components/Loading';
import {goalStats, type GoalNumbers} from '../components/GoalProgress';
import {useTheme} from '../lib/theme';
import {uiScale, fluidFactor} from '../web/desktop-scale';
import type {Task} from '../lib/types';
import type {DayRecord} from '../lib/dashboard';
import type {MonitorWidgetRow} from '../lib/monitoring';
import type {HomeBriefData} from '../lib/home-brief';
import type {Due} from '../lib/finance';
import {capsuleDoses, capsuleDay} from '../lib/capsule-model';
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
const timed = (r: DayRecord) => {if (/^\d{4}-\d{2}-\d{2}$/.test(r.date) || (r.original as any)?.data?.calendar_all_day) return false; const d = new Date(r.date); return !(d.getHours() === 0 && d.getMinutes() === 0); /* 0.3.295: 00:00 = sem hora (nao estica a linha do tempo) */};

export type HomeBriefProps = {
  data: HomeBriefData; today: DayRecord[]; all: DayRecord[]; tasks: Task[]; series: MonitorWidgetRow[] | null; goal: GoalNumbers | null; masked: boolean; onToggleMask?: () => void;
  onOpenItem: (r: DayRecord) => void; onOpenTasks: () => void; onOpenTask?: (id: string) => void; onToggleTask: (t: Task) => Promise<boolean | void> | void;
  onOpenModule: (id: string) => void; onOpenMonitoring: () => void; onOpenAgenda: () => void;
  onMute?: (t: MuteTarget, scope: 'one' | 'all', on: boolean) => void;
  onMarkAction?: (m: TimeMark) => void;
  onMove?: (moves: Move[]) => void;
};

/** 0.3.295: a frase da Sofia sobe para o topo (embaixo de "Boa noite, Pedro"); o cartao Seu dia fica com atalhos e a
 * linha do tempo. Texto puro, para a saudacao. */
export function briefLine(a: {today: DayRecord[]; tasks: Task[]; series: MonitorWidgetRow[] | null; packs: {title: string; step: number; needs: string; delivered: boolean}[]}): string {
  const now = Date.now(), items = a.today.filter(r => !isHoliday((r.original || {}) as any));
  const important = a.tasks.filter(t => t.state !== 'done' && isImportant(t));
  const next = items.filter(r => timed(r) && Date.parse(r.date) >= now - 5 * 60000).sort((x, y) => Date.parse(x.date) - Date.parse(y.date))[0];
  const n = items.length, k = important.length;
  let out = !n && !k ? 'Dia livre: nada marcado e nenhuma tarefa importante.' : (n > 5 ? 'Dia cheio: ' : 'Hoje: ') + [n ? (n === 1 ? '1 compromisso' : n + ' compromissos') : '', k ? (k === 1 ? '1 tarefa importante' : k + ' tarefas importantes') : ''].filter(Boolean).join(' e ') + '.';
  out += next ? ' O próximo é ' + next.title + ' às ' + hhmm(new Date(next.date)) + '.' : n ? ' Nada mais marcado para hoje.' : '';
  const low = (a.series || []).filter(x => x.atLow), out2 = a.packs.filter(x => isOut(x) || x.needs === 'pickup');
  const extra = [low.length ? (low.length === 1 ? low[0].title + ' chegou ao menor preço' : low.length + ' produtos no menor preço') : '', out2.length ? out2[0].title + (out2[0].needs === 'pickup' ? ' espera você retirar' : ' sai para entrega hoje') : ''].filter(Boolean);
  return out + (extra.length ? ' ' + extra.join(' e ') + '.' : '');
}

/** 0.3.310 (Pedro: em monitor grande o Inicio tem que ficar IGUAL ao do notebook, so maior - texto dos blocos embaixo,
 * mesmas proporcoes). O notebook dele e a referencia (1912 x 904 de janela). Em tela maior, o Inicio inteiro (saudacao,
 * Seu dia e blocos) e ampliado por igual (CSS zoom) ate ocupar a tela como ocupa no notebook. Ate o tamanho do notebook
 * devolve 1 - nada muda. So o Inicio do computador usa (Home.tsx). */
const REF_W = 1912, REF_H = 904;
export function homeZoom(w?: number, h?: number): number {
  if (typeof window === 'undefined') return 1;
  const W = w ?? window.innerWidth, H = h ?? window.innerHeight;
  const target = fluidFactor(REF_W) * Math.min(W / REF_W, H / REF_H);
  return Math.max(1, Math.min(2, Math.round(target / uiScale() * 40) / 40));
}

/** Os blocos crescem ate o fim da tela (com 32 px de respiro), sem passar dela: altura de cada fileira. */
let lastBrief = Math.round(170 * uiScale()); // o esqueleto e o Inicio pronto usam a MESMA medida (a troca nao mexe nada)
/** 0.3.310 (Pedro, com a foto do notebook): altura FIXA das fileiras, a do notebook dele, em que o numero de Financas
 * fica na mesma linha dos numeros de Price Tracker, Encomendas e E-mails (texto dos outros blocos no pe). Antes a
 * altura esticava ate o fim da tela e, em qualquer altura diferente, os numeros desalinhavam. Em tela maior quem
 * aumenta tudo por igual e o homeZoom. 183 = distancia do topo do bloco ao numero de Financas + do numero dos outros
 * ao pe (medido na tela). */
const ROW_H = 183;
function useRowHeight(_root: React.RefObject<View | null>, _briefH: number) {
  useWindowDimensions(); // recalcula quando a janela muda (fator da tela)
  return Math.round(ROW_H * uiScale());
}

/** 0.3.313 (Pedro): engrenagem do Seu dia - o que aparece na linha do tempo (por area e item por item na Rotina e em
 * Financas) e a opacidade das marcas. Guardado neste navegador. */
/** 0.3.318 (Pedro): opacidade por item (e por grupo, para quem nao tem item proprio), nao uma so para tudo. */
type TimelineSettings = {cats: Record<string, boolean>; items: Record<string, boolean>; opacity: number; op: Record<string, number>};
const TL_KEY = 'sofia.timeline.v1';
function useTimelineSettings(): [TimelineSettings, (s: TimelineSettings | ((old: TimelineSettings) => TimelineSettings)) => void] {
  const [s, set] = useState<TimelineSettings>(() => {try {const v = JSON.parse(globalThis.localStorage?.getItem(TL_KEY) || 'null'); if (v && v.cats) return {cats: v.cats || {}, items: v.items || {}, opacity: 1, op: v.op || {}};} catch {} return {cats: {}, items: {}, opacity: 1, op: {}};});
  return [s, (f: TimelineSettings | ((old: TimelineSettings) => TimelineSettings)) => set(old => {const v = typeof f === 'function' ? f(old) : f; try {globalThis.localStorage?.setItem(TL_KEY, JSON.stringify(v));} catch {} return v;})];
}
const TL_CATS: {id: string; label: string; color: string}[] = [{id: 'events', label: 'Compromissos', color: '#8fb4ff'}, {id: 'tasks', label: 'Tarefas', color: '#F5A0AE'}, {id: 'reminders', label: 'Lembretes', color: '#7FD1E8'}, {id: 'bill', label: 'Contas a pagar', color: '#E8B04A'}, {id: 'income', label: 'Receitas', color: '#7ED6A5'}, {id: 'invoice', label: 'Faturas do cartão', color: '#B49AE6'}, {id: 'package', label: 'Encomendas', color: '#F0956A'}, {id: 'routine', label: 'Rotina', color: '#5FD3C6'}];
function Switch({on, onChange, label}: {on: boolean; onChange: (v: boolean) => void; label: string}) {
  const c = useTheme();
  return <Pressable accessibilityRole="switch" accessibilityState={{checked: on}} accessibilityLabel={label} onPress={() => onChange(!on)} hitSlop={6} style={{width: 34, height: 20, borderRadius: 10, padding: 2, backgroundColor: on ? c.accent : c.line, justifyContent: 'center'}}>
    <View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', transform: [{translateX: on ? 14 : 0}]}} />
  </Pressable>;
}
function OpChip({label, v, on, onPress}: {label: string; v: number; on: boolean; onPress: () => void}) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={'Opacidade de ' + label + ': ' + Math.round(v * 100) + '%. Tocar para mudar'} onPress={onPress} disabled={!on}
    style={({hovered}: any) => ({width: 46, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', opacity: on ? 1 : 0.4, backgroundColor: hovered && on ? c.input : 'transparent', borderWidth: 1, borderColor: c.line})}>
    <Text style={{fontSize: 11, color: v < 1 ? c.accent : c.muted, fontVariant: ['tabular-nums'], fontWeight: v < 1 ? '600' : '400'}}>{Math.round(v * 100)}%</Text>
  </Pressable>;
}
function TimelineSettingsPanel({s, set, plans, bills, incomes, onClose}: {s: TimelineSettings; set: (v: TimelineSettings | ((old: TimelineSettings) => TimelineSettings)) => void; plans: {id: string; title: string; type: string; color?: string}[]; bills: string[]; incomes: string[]; onClose: () => void}) {
  const c = useTheme(), [open, setOpen] = useState('');
  const cat = (id: string) => s.cats[id] !== false, item = (k: string) => s.items[k] !== false;
  // opacidade: cada toque passa 100 -> 80 -> 60 -> 40 -> 100
  const setOp = (k: string, base = 1) => set(o => {const cur = o.op[k] ?? base, nx = cur > 0.9 ? 0.8 : cur > 0.7 ? 0.6 : cur > 0.5 ? 0.4 : 1; return {...o, op: {...o.op, [k]: nx}};});
  const setCat = (id: string, v: boolean) => set(o => ({...o, cats: {...o.cats, [id]: v}})), setItem = (k: string, v: boolean) => set(o => ({...o, items: {...o.items, [k]: v}}));
  const sub = (id: string) => id === 'routine' ? plans.map(p => ({k: 'routine:' + p.id, label: p.title, color: p.color || routineColor(p.type)})) : id === 'bill' ? bills.map(t => ({k: 'fin:' + t, label: t, color: '#E8B04A'})) : id === 'income' ? incomes.map(t => ({k: 'fin:' + t, label: t, color: '#7ED6A5'})) : [];
  return <View style={{position: 'absolute', top: 52, right: 16, width: 340, maxHeight: 460, zIndex: 20, backgroundColor: c.bg, borderRadius: 16, boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 18px 44px rgba(0,0,0,0.5)'} as any}>
    <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8}}>
      <Text style={{flex: 1, fontSize: 14, fontWeight: '600', color: c.text}}>Linha do tempo</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} hitSlop={8} style={({hovered}: any) => ({width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Icon name="close" size={15} color={c.muted} /></Pressable>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight: 400}} contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 16, gap: 2}}>
      <Text style={{fontSize: 12, color: c.muted, marginBottom: 6}}>O que aparece na linha do tempo do Início e com que força (toque na porcentagem). Não muda avisos nem os apps.</Text>
      {TL_CATS.map(k => {const items = sub(k.id); return <View key={k.id}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, height: 38}}>
          <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: k.color}} />
          <Pressable disabled={!items.length} onPress={() => setOpen(o => o === k.id ? '' : k.id)} style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <Text style={{fontSize: 13, color: c.text}}>{k.label}</Text>
            {items.length ? <Text style={{fontSize: 12, color: c.muted}}>{open === k.id ? '▴' : '▾'} {items.filter(i => item(i.k)).length}/{items.length}</Text> : null}
          </Pressable>
          <OpChip label={k.label} v={s.op[k.id] ?? 1} on={cat(k.id)} onPress={() => setOp(k.id)} />
          <Switch label={k.label} on={cat(k.id)} onChange={v => setCat(k.id, v)} />
        </View>
        {open === k.id && items.length ? <View style={{marginLeft: 18, paddingLeft: 10, borderLeftWidth: 1, borderColor: c.line, opacity: cat(k.id) ? 1 : 0.45}}>
          {items.map(i => <View key={i.k} style={{flexDirection: 'row', alignItems: 'center', gap: 8, height: 32}}>
            <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: i.color}} />
            <Text numberOfLines={1} style={{flex: 1, fontSize: 12, color: c.text}}>{i.label}</Text>
            <OpChip label={i.label} v={s.op[i.k] ?? s.op[k.id] ?? 1} on={item(i.k) && cat(k.id)} onPress={() => setOp(i.k, s.op[k.id] ?? 1)} />
            <Switch label={i.label} on={item(i.k)} onChange={v => setItem(i.k, v)} />
          </View>)}
        </View> : null}
      </View>;})}
    </ScrollView>
  </View>;
}

export function HomeBrief(p: HomeBriefProps) {
  const c = useTheme(), now = new Date(), root = useRef<View>(null), [briefH, setBriefH] = useState(lastBrief), [tl, setTl] = useTimelineSettings(), [gear, setGear] = useState(false);
  const rowH = useRowHeight(root, briefH);
  const open = useMemo(() => p.tasks.filter(t => t.state !== 'done'), [p.tasks]);
  const important = open.filter(isImportant);
  const items = useMemo(() => p.today.filter(r => !isHoliday((r.original || {}) as any)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), [p.today]);
  const upcoming = items.filter(r => timed(r) && Date.parse(r.date) >= now.getTime() - 5 * 60000);
  const next = upcoming[0] || null;
  // 0.3.311: o que mais aparece na linha do tempo, cada area com a sua marca (Financas, Encomendas e Rotina)
  // 0.3.318 (Pedro): conta, receita, fatura e encomenda tambem arrastam - so mudam de lugar aqui na linha do tempo do Inicio
  // (a data delas vem do banco e do rastreio); fica guardado neste computador e some 2 dias depois
  const MK = 'sofia.timeline.marks.v1';
  const [markMoves, setMarkMoves] = useState<Record<string, string>>(() => {try {const v = JSON.parse(globalThis.localStorage?.getItem(MK) || '{}'), old = Date.now() - 2 * 864e5; return Object.fromEntries(Object.entries(v || {}).filter(([, iso]) => Date.parse(String(iso)) > old)) as Record<string, string>;} catch {return {};}});
  const moveMarks = (list: {id: string; to: Date}[]) => setMarkMoves(o => {const n = {...o}; for (const x of list) n[x.id] = x.to.toISOString(); try {globalThis.localStorage?.setItem(MK, JSON.stringify(n));} catch {} return n;});
  const onMove = (moves: Move[]) => {const marks = moves.filter(x => 'mark' in x.t), rest = moves.filter(x => !('mark' in x.t));
    if (marks.length) moveMarks(marks.map(x => ({id: (x.t as {mark: TimeMark}).mark.id, to: x.to}))); if (rest.length) p.onMove?.(rest);};
  useEffect(() => {if (!gear || typeof window === 'undefined') return; const k = (e: KeyboardEvent) => {if (e.key === 'Escape') setGear(false);}; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);}, [gear]);
  const timeMarks = useMemo(() => {
    const out: TimeMark[] = [], todayKey = new Date().toISOString().slice(0, 10), money = (v: number) => p.masked ? 'R$ •••' : brl(v);
    for (const d of p.data.money || []) out.push({due: d, id: 'f' + d.id + d.date, kind: d.kind === 'receber' ? 'income' : d.kind === 'fatura' ? 'invoice' : 'bill', at: new Date(d.date + 'T09:00:00'), title: d.title, sub: (d.kind === 'receber' ? '+' : '') + money(d.amount), late: d.date < todayKey && d.kind !== 'receber'});
    const from = Date.now() - 2 * 864e5;
    for (const pk of p.data.packs) {
      for (const ev of pk.events || []) {const t = Date.parse(ev.at); if (Number.isFinite(t) && t >= from) out.push({id: 'p' + pk.id + ev.at, kind: 'package', at: new Date(t), title: pk.title, sub: ev.status, done: true});}
      if (pk.estimated && /^\d{4}-\d{2}-\d{2}/.test(pk.estimated)) out.push({id: 'pe' + pk.id, kind: 'package', at: new Date(pk.estimated.slice(0, 10) + 'T12:00:00'), title: pk.title, sub: 'previsão de entrega'});
    }
    for (let k = 0; k < 3; k++) {
      const day = new Date(); day.setDate(day.getDate() + k);
      try {for (const ds of capsuleDoses(p.data.capsules.plans, p.data.capsules.history, capsuleDay(day))) out.push({id: 'r' + ds.plan.id + ds.day + ds.time, kind: 'routine', at: ds.date, title: ds.plan.title, sub: ds.taken ? 'feito' : ds.time, done: !!ds.taken, dose: {planId: ds.plan.id, day: ds.day, time: ds.time, type: String(ds.plan.data?.rotina_type || 'capsula'), color: typeInfo(ds.plan).color, icon: typeInfo(ds.plan).icon, mutedOne: (ds.plan.tags || []).includes('sofia-skip-v1:' + ds.day + 'T' + ds.time), mutedAll: !ds.plan.data?.notifications}});} catch {}
    }
    for (const m of out) {const iso = m.kind !== 'routine' ? markMoves[m.id] : ''; if (iso) {m.at = new Date(iso); m.late = false;}}
    return out.sort((x, y) => x.at.getTime() - y.at.getTime());
  }, [p.data, p.masked, markMoves]);
  const timelineItems = useMemo(() => {const seen = new Set<string>(); return [...p.today, ...p.all].filter(r => timed(r) && !isHoliday((r.original || {}) as any) && !seen.has(r.id + r.date) && (seen.add(r.id + r.date), true)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));}, [p.today, p.all]);
  // proximos: o resto de hoje e, se acabar, os dos dias seguintes (0.3.293: antes ficava vazio a noite)
  const nextItems = useMemo(() => {const t0 = now.getTime() - 5 * 60000, todayKey = now.toDateString(); const seen = new Set<string>(); return [...p.today, ...p.all].filter(r => !isHoliday((r.original || {}) as any)).filter(r => {const k = r.title.trim().toLowerCase() + '|' + r.date; if (seen.has(k)) return false; seen.add(k); return true;}).filter(r => {const d = new Date(r.date); return timed(r) ? d.getTime() >= t0 : d.toDateString() !== todayKey && d.getTime() > t0;}).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).slice(0, 80);}, [p.today, p.all, now.getHours(), now.getMinutes()]);
  const low = (p.series || []).filter(s => s.atLow);

  const actions: {label: string; primary?: boolean; run: () => void}[] = [];
  if (next) actions.push({label: 'Abrir ' + next.title, primary: true, run: () => p.onOpenItem(next)});
  if (important.length) actions.push({label: important.length === 1 ? 'Ver a tarefa' : 'Ver as ' + important.length + ' tarefas', run: p.onOpenTasks});
  if (low.length) actions.push({label: 'Ver ' + (low.length === 1 ? 'o ' + low[0].title : 'os produtos'), run: p.onOpenMonitoring});

  const card = {backgroundColor: c.surface, borderRadius: 18, padding: 18, boxShadow: '0 0 0 1px rgba(255,255,255,0.045), 0 1px 2px rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.18)'} as any;
  return <View ref={root} style={{gap: 12}}>
    <View testID="home-brief" onLayout={e => {const h = Math.round(e.nativeEvent.layout.height); if (h > 0) {lastBrief = h; setBriefH(h);}}} style={{...card, borderRadius: 22, padding: 20, paddingBottom: 14, backgroundColor: c.surface, position: 'relative', zIndex: 5}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <View style={{width: 24, height: 24, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center'}}><Text style={{color: c.onAccent, fontWeight: '700', fontSize: 12}}>S</Text></View>
        <Text style={{color: c.text, fontWeight: '600', fontSize: 14}}>Seu dia</Text>
        <View style={{flex: 1}} />
        <Pressable testID="timeline-gear" accessibilityRole="button" accessibilityLabel="Ajustar a linha do tempo" onPress={() => setGear(v => !v)} hitSlop={8} style={({hovered}: any) => ({width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered || gear ? c.input : 'transparent'})}><Icon name="settings" size={16} color={gear ? c.accent : c.muted} /></Pressable>
      </View>
      {/* 0.3.318 (Pedro): clicar fora (ou Esc) fecha os ajustes */}
      {gear ? <Pressable testID="timeline-gear-backdrop" accessibilityLabel="Fechar ajustes da linha do tempo" onPress={() => setGear(false)} style={{position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 19, cursor: 'default'} as any} /> : null}
      {gear ? <TimelineSettingsPanel s={tl} set={setTl} onClose={() => setGear(false)} plans={p.data.capsules.plans.filter(x => x.state === 'active').map(x => ({id: x.id, title: x.title, type: String(x.data?.rotina_type || 'capsula'), color: typeInfo(x).color}))} bills={[...new Set((p.data.money || []).filter(d => d.kind === 'pagar').map(d => d.title))]} incomes={[...new Set((p.data.money || []).filter(d => d.kind === 'receber').map(d => d.title))]} /> : null}
      <Timeline items={timelineItems.filter(r => tl.cats[r.isTask ? 'tasks' : r.kind === 'reminder' ? 'reminders' : 'events'] !== false)} next={next} op={{rec: r => tl.op[r.isTask ? 'tasks' : r.kind === 'reminder' ? 'reminders' : 'events'] ?? 1, mark: m => (m.kind === 'routine' && m.dose ? tl.op['routine:' + m.dose.planId] : (m.kind === 'bill' || m.kind === 'income' || m.kind === 'invoice') ? tl.op['fin:' + m.title] : undefined) ?? tl.op[m.kind] ?? 1}}
        marks={timeMarks.filter(m => tl.cats[m.kind] !== false && !(m.kind === 'routine' && m.dose && tl.items['routine:' + m.dose.planId] === false) && !((m.kind === 'bill' || m.kind === 'income' || m.kind === 'invoice') && tl.items['fin:' + m.title] === false))}
        actions={{onEdit: r => r.isTask && p.onOpenTask ? p.onOpenTask(String((r.original as any)?.id || r.id.replace(/^task:/, ''))) : p.onOpenItem(r), onToggleTask: r => r.original && p.onToggleTask(r.original as any), onMarkAction: p.onMarkAction, onMarkOpen: m => p.onOpenModule(m.kind === 'package' ? 'packages' : m.kind === 'routine' ? 'capsules' : 'finance'), onMove: p.onMove ? onMove : undefined}} />
    </View>
    <View style={{flexDirection: 'row', gap: 12}}>
      <AgendaTile style={{flex: 2, height: rowH}} card={card} upcoming={nextItems} onOpen={p.onOpenItem} onOpenAgenda={p.onOpenAgenda} />
      <TasksTile style={{flex: 1, height: rowH}} card={card} open={open} onOpen={p.onOpenTasks} onDone={p.onToggleTask} />
      <RotinaTile style={{flex: 1, height: rowH}} card={card} data={p.data} onOpen={() => p.onOpenModule('capsules')} />
    </View>
    <View style={{flexDirection: 'row', gap: 12}}>
      <FinanceTile style={{flex: 2, height: rowH}} card={card} data={p.data} goal={p.data.goal || p.goal} masked={p.masked} onToggleMask={p.onToggleMask} onOpen={() => p.onOpenModule('finance')} />
      <PriceTile style={{flex: 1, height: rowH}} card={card} rows={p.series} onOpen={p.onOpenMonitoring} />
      <PackagesTile style={{flex: 1, height: rowH}} card={card} data={p.data} onOpen={() => p.onOpenModule('packages')} />
      <MailTile style={{flex: 1, height: rowH}} card={card} data={p.data} onOpen={() => p.onOpenModule('mail')} />
    </View>
  </View>;
}

/** Linha do tempo: 16 horas por vez, comecando nas 7h de hoje. A rodinha do mouse em cima dela anda pelas horas e
 * pelos dias seguintes (0.3.299). Pontos na cor de cada item, juntando os que ficam colados; passar o mouse mostra a
 * previa; clicar abre o cartao com titulo, descricao e o lapis para editar. */
const SPAN = 16, REMIND = '#7FD1E8'; // cor dos lembretes na linha do tempo
type BillMark = {id: string; title: string; date: string; amount: number; late: boolean};
/** 0.3.311 (Pedro): cada area na linha do tempo do seu jeito. kind: bill (conta a pagar, losango ambar "$"), income
 * (receita a receber, losango verde "+"), invoice (fatura do cartao, losango lilas), package (status de encomenda,
 * quadrado laranja com caixa), routine (item da rotina, pilula verde-agua). */
export type TimeMark = {id: string; kind: 'bill' | 'income' | 'invoice' | 'package' | 'routine'; at: Date; title: string; sub: string; late?: boolean; done?: boolean;
  dose?: {planId: string; day: string; time: string; type: string; color?: string; icon?: string; mutedOne: boolean; mutedAll: boolean}; more?: TimeMark[]; due?: Due};
/** 0.3.312: desligar o aviso so desta vez ou de todas as vezes (item da Agenda/lembrete ou dose da Rotina). */
export type MuteTarget = {rec: DayRecord} | {dose: NonNullable<TimeMark['dose']>};
import {ROTINA_TYPES, typeInfo} from '../lib/rotina';
const ROUTINE_ICON: Record<string, IconName> = {capsula: 'capsule', cuidado: 'heart', habito: 'repeat', treino: 'barbell'};
const recMute = (r: DayRecord) => {const o: any = r.original || {}, tags: string[] = o.tags || [], iso = new Date(r.date).toISOString(); return {one: tags.includes('sofia-skip-v1:' + iso), all: tags.includes('sofia-notify-v1:off'), repeats: tags.some(t => t.startsWith('sofia-repeat-v1:'))};};
const MARK_COLOR: Record<TimeMark['kind'], string> = {bill: '#E8B04A', income: '#7ED6A5', invoice: '#B49AE6', package: '#F0956A', routine: '#5FD3C6'};
/** 0.3.313 (Pedro): a previa e um cartao de verdade - da para agir nele (concluir tarefa, Paguei, Recebi, Tomei) e editar;
 * fica aberta enquanto o mouse esta nela; clicar na marca fixa o cartao. Rotina na cor do tipo (como em Rotina). */
export type TimelineActions = {onEdit: (r: DayRecord) => void; onToggleTask?: (r: DayRecord) => void; onMarkAction?: (m: TimeMark) => void; onMarkOpen?: (m: TimeMark) => void; onMove?: (moves: Move[]) => void};
/** 0.3.317 (Pedro): arrastar na linha do tempo muda so aquela vez (compromisso, lembrete, tarefa ou dose da Rotina). */
export type MoveTarget = MuteTarget | {mark: TimeMark};
/** 0.3.318: um arrastar pode levar varios itens juntos (bolinha com "2 itens", pilula com varias doses): cada um anda o mesmo tanto. */
export type Move = {t: MoveTarget; to: Date};
const DAY_START = 7; // posicao de inicio do dia na linha do tempo (o botao "agora" volta para ca)
const routineColor = (type?: string) => (ROTINA_TYPES.find(x => x.id === type) || ROTINA_TYPES[0]).color;
const markColor = (m: TimeMark, danger: string) => m.late ? danger : m.kind === 'routine' ? (m.dose?.color || routineColor(m.dose?.type)) : MARK_COLOR[m.kind];
const markAction = (m: TimeMark) => m.done ? '' : m.kind === 'bill' && m.due?.tx ? 'Paguei' : m.kind === 'income' && m.due?.tx ? 'Recebi' : m.kind === 'routine' ? 'Tomei' : '';
type Point = {key: string; x: number; recs: DayRecord[]; marks: TimeMark[]};
function Timeline({items, next, marks = [], op, actions}: {items: DayRecord[]; next: DayRecord | null; marks?: TimeMark[]; op: {rec: (r: DayRecord) => number; mark: (m: TimeMark) => number}; actions: TimelineActions}) {
  const c = useTheme(), [w, setW] = useState(0), [start, setStartRaw] = useState(DAY_START), box = useRef<View>(null), lineBox = useRef<View>(null);
  // 0.3.317 (Pedro): a linha do tempo desliza (roda do mouse, botao "agora", borda ao arrastar) em vez de pular de hora em hora
  const startRef = useRef(DAY_START), target = useRef(DAY_START), raf = useRef<any>(null);
  const clampStart = (v: number) => Math.max(0, Math.min(24 * 3 - SPAN, v));
  // 0.3.319 (Pedro: "o agora da uma bugada quando para"): movimento por tempo (ease-out de 380 ms) em vez de ir chegando aos
  // poucos - termina exatamente no destino, sem os ultimos quadros se arrastando; cada novo pedido continua do ponto atual
  const tween = useRef({from: DAY_START, t0: 0, ms: 380, home: false});
  const glide = (to: number, ms = 380, home = false) => {target.current = clampStart(to); tween.current = {from: startRef.current, t0: Date.now(), ms, home}; if (raf.current) return;
    const step = () => {const {from, t0, ms: dur} = tween.current, t = Math.min(1, (Date.now() - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      const nx = t >= 1 ? target.current : from + (target.current - from) * e; startRef.current = nx; setStartRaw(nx); raf.current = t >= 1 ? null : requestAnimationFrame(step);};
    raf.current = requestAnimationFrame(step);};
  useEffect(() => () => {if (raf.current) cancelAnimationFrame(raf.current);}, []);
  const [hover, setHover] = useState(''), [pin, setPin] = useState(''), hide = useRef<any>(null);
  const day0 = useMemo(() => {const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();}, []);
  const pos = (d: Date) => ((d.getTime() - day0) / 3600000 - start) / SPAN;
  const [, tick] = useState(0);
  useEffect(() => {const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t);}, []);
  const nowX = pos(new Date());
  // pontos: compromissos/tarefas/lembretes colados viram um ponto com numero; rotina colada vira uma pilula so; o resto separado
  const points: Point[] = [];
  const inView = (x: number) => x >= -0.01 && x <= 1.01;
  for (const r of items) {const x = pos(new Date(r.date)); if (!inView(x)) continue; const p = points[points.length - 1]; if (p && p.recs.length && w && (x - p.x) * w < 22) p.recs.push(r); else points.push({key: 'r' + r.id + r.date, x, recs: [r], marks: []});}
  const mpoints: Point[] = [];
  for (const m of marks) {const x = m.late ? 0.025 : pos(m.at); if (!inView(x)) continue; const p = mpoints[mpoints.length - 1]; if (m.kind === 'routine' && p && p.marks[0]?.kind === 'routine' && w && (x - p.x) * w < 22) p.marks.push(m); else mpoints.push({key: 'm' + m.id, x, recs: [], marks: [m]});}
  // marca colada num compromisso (ex.: conta das 9h e tarefa das 9h) anda um pouco para o lado, para as duas poderem ser tocadas
  if (w) for (const mp of mpoints) {let tries = 0; while (tries++ < 4 && [...points, ...mpoints].some(o => o !== mp && Math.abs(o.x - mp.x) * w < 20)) mp.x += 22 / w;}
  const all = [...points, ...mpoints];
  useEffect(() => {
    const el: any = box.current; if (!el || !el.addEventListener) return;
    const onWheel = (e: WheelEvent) => {e.preventDefault(); if (dragRef.current) return; const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; setPin(''); setHover(''); glide(target.current + d / 40);};
    el.addEventListener('wheel', onWheel, {passive: false});
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => {if (typeof window === 'undefined' || !pin) return; const k = (e: KeyboardEvent) => {if (e.key === 'Escape') setPin('');}; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);}, [pin]);
  const enter = (key: string) => {clearTimeout(hide.current); setHover(key);};
  const leave = () => {clearTimeout(hide.current); hide.current = setTimeout(() => setHover(''), 180);};
  // 0.3.317 (Pedro): arrastar para frente ou para tras. A bolinha segue o mouse em tempo real (sem cortes), a hora aparece
  // em cima; ao soltar encaixa de 5 em 5 minutos deslizando ate o lugar. Encostar na borda rola a linha (outro dia).
  type DragItem = {t: MoveTarget; at: Date}; type Drag = {key: string; items: DragItem[]; fx: number; live: boolean; color: string};
  const [drag, setDrag] = useState<Drag | null>(null), dragRef = useRef<Drag | null>(null), justDragged = useRef(false);
  const [settle, setSettle] = useState<Record<string, number>>({});
  useEffect(() => {setSettle({});}, [items, marks]);
  const hourAt = (fx: number) => startRef.current + fx * SPAN;
  const snapDate = (fx: number) => new Date(Math.round((day0 + hourAt(fx) * 3600000) / 300000) * 300000);
  const beginDrag = (e: any, key: string, items: DragItem[], x0: number, color: string) => {
    const el: any = lineBox.current; if (!actions.onMove || !items.length || !el?.getBoundingClientRect || typeof window === 'undefined') return;
    const ne = e?.nativeEvent || {}, sx = Number(ne.pageX ?? ne.clientX), rect = el.getBoundingClientRect(); if (!Number.isFinite(sx) || !rect.width) return;
    const grab = sx - (rect.left + x0 * rect.width); let edge = 0, edgeRaf: any = null, lastX = sx;
    const fxOf = (x: number) => Math.max(0, Math.min(1, (x - grab - rect.left) / rect.width));
    const tickEdge = () => {if (!edge || !dragRef.current) {edgeRaf = null; return;} glide(target.current + edge * 0.08); const d = {...dragRef.current, fx: fxOf(lastX)}; dragRef.current = d; setDrag(d); edgeRaf = requestAnimationFrame(tickEdge);};
    const stop = () => {window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('keydown', esc, true); edge = 0; if (edgeRaf) cancelAnimationFrame(edgeRaf);
      document.body.style.userSelect = ''; document.body.style.cursor = ''; const d = dragRef.current; dragRef.current = null; setDrag(null); return d;};
    const move = (ev: PointerEvent) => {lastX = ev.pageX; const live = dragRef.current?.live || Math.abs(ev.pageX - sx) > 4; if (!live) return;
      if (!dragRef.current?.live) {setPin(''); setHover(''); document.body.style.userSelect = 'none'; document.body.style.cursor = 'grabbing';}
      const d = {key, items, fx: fxOf(ev.pageX), live: true, color}; dragRef.current = d; setDrag(d);
      const px = ev.pageX - rect.left; edge = px < 28 ? -1 : px > rect.width - 28 ? 1 : 0; if (edge && !edgeRaf) edgeRaf = requestAnimationFrame(tickEdge);};
    // 0.3.318 (Pedro): Esc cancela o arrastar - tudo volta para onde estava, nada e gravado
    const esc = (ev: KeyboardEvent) => {if (ev.key !== 'Escape') return; ev.preventDefault(); ev.stopPropagation(); const d = stop(); if (d?.live) {justDragged.current = true; setTimeout(() => {justDragged.current = false;}, 60);}};
    const up = () => {const d = stop(); if (!d?.live) return;
      justDragged.current = true; setTimeout(() => {justDragged.current = false;}, 60);
      // o primeiro item vai para onde a bolinha foi solta; os outros andam o mesmo tanto (de 5 em 5 minutos)
      const to = snapDate(d.fx), delta = to.getTime() - items[0].at.getTime(), fx = ((to.getTime() - day0) / 3600000 - startRef.current) / SPAN;
      setSettle(o => ({...o, [key]: fx})); setTimeout(() => setSettle(o => {const n = {...o}; delete n[key]; return n;}), 8000);
      actions.onMove!(items.map(x => ({t: x.t, to: new Date(x.at.getTime() + delta)})));};
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('keydown', esc, true);
  };
  const dragLabel = (fx: number) => {const d = snapDate(fx), dd = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - day0) / 864e5);
    return (dd === 0 ? '' : dd === 1 ? 'amanhã ' : dd === -1 ? 'ontem ' : d.toLocaleDateString('pt-BR', {weekday: 'short'}).replace('.', '') + ' ') + hhmm(d);};
  const label = (h: number) => {const d = new Date(day0 + h * 3600000), dd = Math.floor(h / 24); return (dd === 0 ? '' : dd === 1 ? 'amanhã ' : d.toLocaleDateString('pt-BR', {weekday: 'short'}).replace('.', '') + ' ') + String(d.getHours()).padStart(2, '0') + ':00';};
  const desc = (r: DayRecord) => {const o: any = r.original || {}; return String(o.description || o.data?.description || o.data?.message || o.content || o.data?.location || '').trim();};
  // rotulos fixos: compromissos e tarefas primeiro, depois dinheiro e encomendas; rotina so na previa
  // 0.3.310 (tela grande): o rotulo cresce com o espaco de cada hora (150 a 230 px), para o nome nao cortar a toa
  const LW = Math.round(Math.max(150, Math.min(230, (w || 0) / SPAN * 1.45))), OFF = 44, rows: number[][] = [[], []], place: Record<string, number> = {};
  const fits = (px: number) => {for (const r of [0, 1]) if (rows[r].every(q => Math.abs(q - px) >= LW + 8)) {rows[r].push(px); return r;} return -1;};
  for (const p of points) {const r = fits(p.x * (w || 1)); if (r >= 0) place[p.key] = r;}
  for (const p of mpoints) if (p.marks[0].kind !== 'routine') {const r = fits(p.x * (w || 1)); if (r >= 0) place[p.key] = r;}
  const shown = all.find(p => p.key === (pin || hover));
  const tagOf = (p: Point): {text: string; more?: number; color: string; strong?: boolean; bg?: string} => {const m = p.marks[0]; if (m) return {text: m.title + ' · ' + m.sub, color: markColor(m, c.danger), strong: true}; const r = p.recs[0], isNext = !!next && p.recs.includes(next);
    // 0.3.321 (revisao - Reconhecer): bolinha com varios itens mostra o primeiro e quantos mais ("09:00 Cafe +3"), nao so "4 itens"
    return {text: hhmm(new Date(r.date)) + ' ' + r.title, more: p.recs.length - 1, color: p.recs.length === 1 && r.kind === 'reminder' ? REMIND : isNext ? c.text : c.muted, strong: isNext, bg: isNext ? tint(c.accent, 0.14) : undefined};};
  // 0.3.318 (Pedro): o "agora" fica na altura da linha, colado na borda para onde ele leva ("‹ agora" na esquerda,
  // "agora ›" na direita); a linha encolhe daquele lado (deslizando) para o botao nao cobrir a marca da ponta
  // 0.3.319: o espaco do botao abre e fecha JUNTO com o movimento da linha (sai da distancia ate 07:00), sem transicao
  // separada - antes o botao sumia no meio do caminho, a linha alargava e os itens voltavam para tras no fim
  // na volta pelo botao, o espaco fecha na mesma proporcao do caminho (cada item anda sempre para o mesmo lado, sem tranco)
  const span0 = tween.current.home ? Math.max(0.75, Math.abs(tween.current.from - DAY_START)) : 0.75;
  const dist = start - DAY_START, ease = Math.min(1, Math.abs(dist) / span0), INSET = 84;
  const side = Math.abs(dist) > 0.02 ? (dist > 0 ? 'left' : 'right') : '', inset = Math.round(INSET * ease * 10) / 10;
  // 0.3.318 (Pedro): o "agora" fica no MEIO do cartao inteiro (Seu dia), nao na altura da linha
  const [btnTop, setBtnTop] = useState<string>('');
  useLayoutEffect(() => {const el: any = box.current, card = el?.closest?.('[data-testid="home-brief"]'); if (!el?.getBoundingClientRect || !card) return;
    const a = el.getBoundingClientRect(), b = card.getBoundingClientRect(), z = homeZoom(), k = uiScale();
    setBtnTop(Math.round(((b.top + b.height / 2) - a.top) / z - 12 * k) + 'px');}, [side, w]);
  return <View ref={box} style={{marginTop: 12, height: 56 + OFF}}>
   <View ref={lineBox} onLayout={e => {const v = e.nativeEvent.layout.width; if (v > 0) setW(v);}} style={{position: 'absolute', top: 0, bottom: 0, left: side === 'left' ? inset : 0, right: side === 'right' ? inset : 0} as any}>
    <View style={{position: 'absolute', left: 0, right: 0, top: 28 + OFF, height: 2, borderRadius: 1, backgroundColor: c.line}} />
    {nowX > 0 ? <View style={{position: 'absolute', left: 0, width: (Math.min(1, nowX) * 100 + '%') as any, top: 28 + OFF, height: 2, borderRadius: 1, backgroundColor: tint(c.accent, 0.45)}} /> : null}
    {[24, 48].map(m => {const x = (m - start) / SPAN; return x > 0 && x < 1 ? <View key={m} style={{position: 'absolute', left: (x * 100 + '%') as any, top: 20 + OFF, width: 1, height: 18, backgroundColor: c.line}} /> : null;})}
    {/* marcas e pontos (com a opacidade escolhida na engrenagem) */}
    <View pointerEvents="box-none" style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0}}>
      {all.map(p => {
        const m = p.marks[0], r = p.recs[0], open = () => {if (justDragged.current) return; setPin(k => k === p.key ? '' : p.key);}, hov = {onHoverIn: () => {if (!dragRef.current) enter(p.key);}, onHoverOut: leave};
        // 0.3.317: da para arrastar a bolinha de um item so (compromisso, lembrete, tarefa) e a dose da Rotina sozinha
        // 0.3.318 (Pedro): tudo o que esta na linha arrasta - bolinha de um item ou de varios (andam juntos), dose ou pilula
        // com varias doses, conta, receita, fatura e encomenda (essas so mudam de lugar aqui no Inicio)
        const tgt: DragItem[] | null = !actions.onMove ? null : m ? p.marks.map(x => ({t: (x.kind === 'routine' && x.dose ? {dose: x.dose} : {mark: x}) as MoveTarget, at: x.at})) : p.recs.map(x => ({t: {rec: x} as MoveTarget, at: new Date(x.date)}));
        const xo = settle[p.key] ?? p.x, ghost = drag?.key === p.key;
        const drg: any = tgt ? {onPressIn: (e: any) => beginDrag(e, p.key, tgt!, p.x, m ? markColor(m, c.danger) : r.kind === 'reminder' ? REMIND : colorOf(r, c.accent))} : {};
        const itemOp = m ? op.mark(m) : op.rec(r), extra: any = {opacity: ghost ? 0.3 * itemOp : itemOp, cursor: tgt ? 'grab' : 'pointer', ...(settle[p.key] != null ? {transitionProperty: 'left', transitionDuration: '260ms', transitionTimingFunction: 'cubic-bezier(.2,.8,.2,1)'} : {})};
        if (m) {
          const col = markColor(m, c.danger), diamond = m.kind === 'bill' || m.kind === 'income' || m.kind === 'invoice';
          const shape = diamond ? {width: 20, height: 20, marginLeft: -10, top: 29 + OFF - 10, borderRadius: 6, transform: [{rotate: '45deg'}]} : m.kind === 'package' ? {width: 22, height: 22, marginLeft: -11, top: 29 + OFF - 11, borderRadius: 6} : {width: 26, height: 16, marginLeft: -13, top: 29 + OFF - 8, borderRadius: 8};
          const glyph = m.kind === 'bill' ? '$' : m.kind === 'income' ? '+' : m.kind === 'invoice' ? '▭' : '';
          return <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={p.marks.map(x => x.title + ' · ' + x.sub).join(', ')} onPress={open} hitSlop={12} {...hov} {...drg} style={({hovered}: any) => ({position: 'absolute', left: (xo * 100 + '%') as any, ...extra, ...shape, backgroundColor: m.done ? c.surface : col, borderWidth: m.done ? 2 : 3, borderColor: m.done ? col : c.surface, alignItems: 'center', justifyContent: 'center', boxShadow: (p.marks.length > 1 ? '3px -3px 0 -1px ' + tint(col, 0.55) + ', ' : '') + '0 0 0 4px ' + tint(col, hovered || pin === p.key ? 0.3 : 0.16), zIndex: 2} as any)}>
            {glyph ? <Text style={{transform: [{rotate: '-45deg'}], fontSize: 10, fontWeight: '700', color: '#17122A'}}>{glyph}</Text> : <Icon name={m.kind === 'package' ? 'box' : ((m.dose?.icon || ROUTINE_ICON[m.dose?.type || 'capsula'] || 'capsule') as IconName)} size={m.kind === 'package' ? 11 : 10} color={m.done ? col : '#17122A'} />}
          </Pressable>;
        }
        const isNext = !!next && p.recs.includes(next), many = p.recs.length > 1;
        if (!many && r.kind === 'reminder') return <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={'Lembrete ' + hhmm(new Date(r.date)) + ' ' + r.title} onPress={open} hitSlop={12} {...hov} {...drg}
          style={({hovered}: any) => ({position: 'absolute', left: (xo * 100 + '%') as any, ...extra, top: 29 + OFF - 11, width: 22, height: 22, marginLeft: -11, borderRadius: 11, borderWidth: 2, borderColor: REMIND, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 4px ' + tint(REMIND, hovered || pin === p.key ? 0.3 : 0.16)} as any)}><Icon name="bell" size={11} color={REMIND} /></Pressable>;
        const size = isNext ? 16 : many ? 20 : 12;
        return <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={p.recs.map(x => hhmm(new Date(x.date)) + ' ' + x.title).join(', ')} onPress={open} hitSlop={14} {...hov} {...drg}
          style={{position: 'absolute', left: (xo * 100 + '%') as any, ...extra, top: 29 + OFF - size / 2, width: size, height: size, marginLeft: -size / 2, borderRadius: size / 2, borderWidth: 3, borderColor: c.surface, backgroundColor: colorOf(r, c.accent), alignItems: 'center', justifyContent: 'center'}}>
          {many && !isNext ? <Text style={{fontSize: 10, fontWeight: '700', color: c.onAccent}}>{p.recs.length}</Text> : null}
        </Pressable>;
      })}
      {all.map(p => place[p.key] == null ? null : (() => {const t = tagOf(p), lx = settle[p.key] ?? p.x; return <View key={'l' + p.key} pointerEvents="none" style={{position: 'absolute', left: Math.max(0, Math.min((w || 1) - LW, lx * (w || 1) - LW / 2)), top: place[p.key] === 0 ? OFF - 2 : OFF - 26, width: LW, alignItems: 'center', opacity: drag?.key === p.key ? 0 : p.marks[0] ? op.mark(p.marks[0]) : op.rec(p.recs[0]), ...(settle[p.key] != null ? {transitionProperty: 'left', transitionDuration: '260ms', transitionTimingFunction: 'cubic-bezier(.2,.8,.2,1)'} : {})} as any}>
        <View style={{flexDirection: 'row', maxWidth: '100%', alignItems: 'center', backgroundColor: t.bg || (p.marks[0] ? tint(t.color, 0.14) : 'transparent'), borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2} as any}><Text numberOfLines={1} style={{flexShrink: 1, fontSize: 12, color: t.color, fontWeight: t.strong ? '600' : '400', overflow: 'hidden', fontVariant: ['tabular-nums']}}>{t.text}</Text>{t.more ? <Text style={{fontSize: 12, fontWeight: '700', color: t.color, fontVariant: ['tabular-nums']}}> +{t.more}</Text> : null}</View>
      </View>;})())}
    </View>
    {/* 0.3.314 (Pedro): o "agora" em destaque - um farol que pulsa na linha, com o horario numa etiqueta; o trecho que ja
        passou fica preenchido. Se a pessoa rolar para longe, aparece um botao para voltar para agora. */}
    {nowX >= 0 && nowX <= 1 ? <NowBeacon x={nowX} w={w} top={29 + OFF} /> : null}
    {/* 0.3.317 (Pedro): o botao "agora" volta para a posicao de inicio do dia (07:00), deslizando; fica no cabecalho do
        cartao, ao lado da engrenagem, para nao cobrir as marcas da ponta da linha */}
    {/* escala: horas cheias de 4 em 4 (07, 11, 15, 19, 23...), andando junto quando a linha desliza */}
    {Array.from({length: 6}, (_, k) => Math.ceil((start - 3) / 4) * 4 + 3 + k * 4).map(h => {const x = (h - start) / SPAN; if (x < -0.001 || x > 1.001 || (nowX >= 0 && nowX <= 1 && w && Math.abs(x - nowX) * w < 46)) return null;
      const end = x > 0.96, beg = x < 0.04; return <Text key={h} style={{position: 'absolute', top: 42 + OFF, left: (x * 100 + '%') as any, transform: [{translateX: beg ? 0 : end ? -96 : -48}], width: 96, textAlign: beg ? 'left' : end ? 'right' : 'center', fontSize: 11, color: c.muted, fontVariant: ['tabular-nums']}}>{label(h)}</Text>;})}
    {/* 0.3.317: o que esta sendo arrastado - bolinha e horario seguindo o mouse */}
    {drag?.live ? <View pointerEvents="none" style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 6}}>
      <View style={{position: 'absolute', left: drag.fx * (w || 1) - 9, top: 29 + OFF - 9, width: 18, height: 18, borderRadius: 9, backgroundColor: drag.color, borderWidth: 3, borderColor: c.surface, boxShadow: '0 0 0 4px ' + tint(drag.color, 0.28) + ', 0 6px 16px rgba(0,0,0,0.45)'} as any} />
      <View style={{position: 'absolute', left: Math.max(0, Math.min((w || 1) - 110, drag.fx * (w || 1) - 55)), top: OFF - 4, width: 110, alignItems: 'center'}}>
        <Text style={{fontSize: 12, fontWeight: '700', color: c.onAccent, backgroundColor: drag.color, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden', fontVariant: ['tabular-nums']}}>{dragLabel(drag.fx)}</Text>
      </View>
    </View> : null}
    {shown && !drag?.live ? <PreviewCard point={shown} width={w} pinned={pin === shown.key} actions={actions} desc={desc} onEnter={() => enter(shown.key)} onLeave={leave} onClose={() => {setPin(''); setHover('');}} onGrab={actions.onMove ? (e, t, color) => beginDrag(e, 'g' + shown.key + ('rec' in t ? t.rec.id + t.rec.date : 'dose' in t ? t.dose.planId + t.dose.time : t.mark.id), [{t, at: 'rec' in t ? new Date(t.rec.date) : 'dose' in t ? (shown.marks.find(x => x.dose === t.dose)?.at || new Date()) : t.mark.at}], shown.x, color) : undefined} /> : null}
   </View>
    {side ? <Pressable testID="timeline-today" accessibilityRole="button" accessibilityLabel="Voltar para o início do dia" onPress={() => {setPin(''); setHover(''); glide(DAY_START, 520, true);}}
      style={({hovered}: any) => ({position: 'absolute', top: btnTop || 29 + OFF - 12, [side]: 0, opacity: ease, pointerEvents: ease > 0.5 ? 'auto' : 'none', height: 24, paddingHorizontal: 11, borderRadius: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: hovered ? c.danger : tint('#F5A0AE', 0.18), zIndex: 3} as any)}>
      {({hovered}: any) => <Text style={{fontSize: 11, fontWeight: '700', color: hovered ? '#fff' : c.danger}}>{side === 'left' ? '‹ agora' : 'agora ›'}</Text>}
    </Pressable> : null}
  </View>;
}

/** Marca de "agora": ponto com aureola que pulsa devagar, linha fina descendo ate a escala e a hora numa etiqueta. */
function NowBeacon({x, w, top}: {x: number; w: number; top: number}) {
  const c = useTheme(), reduced = useReducedMotion(), pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {if (reduced) return; const loop = Animated.loop(Animated.timing(pulse, {toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: false})); loop.start(); return () => loop.stop();}, [reduced]);
  const now = new Date(), label = hhmm(now), left = x * (w || 1), red = '#F57A8C';
  return <View pointerEvents="none" style={{position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 4}}>
    {/* aureola */}
    <Animated.View style={{position: 'absolute', left: left - 14, top: top - 14, width: 28, height: 28, borderRadius: 14, backgroundColor: red, opacity: pulse.interpolate({inputRange: [0, 1], outputRange: [0.35, 0]}), transform: [{scale: pulse.interpolate({inputRange: [0, 1], outputRange: [0.4, 1.4]})}]}} />
    {/* ponto */}
    <View style={{position: 'absolute', left: left - 6, top: top - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: red, borderWidth: 2, borderColor: c.surface, boxShadow: '0 0 0 3px ' + tint(red, 0.25) + ', 0 0 12px ' + tint(red, 0.6)} as any} />
    {/* fio ate a escala */}
    <View style={{position: 'absolute', left: left - 0.5, top: top + 7, width: 1, height: 9, backgroundColor: tint(red, 0.7)}} />
    {/* etiqueta com a hora, na altura da escala */}
    <View style={{position: 'absolute', left: Math.max(0, Math.min((w || 1) - 48, left - 24)), top: top + 13, width: 48, alignItems: 'center'}}>
      <Text style={{fontSize: 11, fontWeight: '700', color: '#fff', backgroundColor: red, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden', fontVariant: ['tabular-nums']}}>{label}</Text>
    </View>
  </View>;
}

/** O cartao da previa: uma linha por item (simbolo na cor, horario, titulo e a acao do item a direita), descricao embaixo. */
function PreviewCard({point, width, pinned, actions, desc, onEnter, onLeave, onClose, onGrab}: {point: Point; width: number; pinned: boolean; actions: TimelineActions; desc: (r: DayRecord) => string; onEnter: () => void; onLeave: () => void; onClose: () => void; onGrab?: (e: any, t: MoveTarget, color: string) => void}) {
  const c = useTheme(), W = 320, x = Math.max(0, Math.min((width || 1) - W, point.x * (width || 1) - W / 2));
  const Row = ({color, icon, time, title, sub, action, onAction, onEdit, done, check, grab}: {color: string; icon?: IconName; time: string; title: string; sub?: string; action?: string; onAction?: () => void; onEdit?: () => void; done?: boolean; check?: () => void; grab?: (e: any) => void}) =>
    <View style={{flexDirection: 'row', gap: 10, paddingVertical: 8}}>
      {check ? <Pressable accessibilityRole="checkbox" accessibilityState={{checked: !!done}} accessibilityLabel={(done ? 'Reabrir ' : 'Concluir ') + title} onPress={check} hitSlop={8} style={({hovered}: any) => ({width: 18, height: 18, marginTop: 1, borderRadius: 9, borderWidth: 2, borderColor: done ? color : hovered ? color : c.muted, backgroundColor: done ? color : 'transparent', alignItems: 'center', justifyContent: 'center'})}>{done ? <Icon name="check" size={11} color={c.surface} /> : null}</Pressable>
        : <View style={{width: 18, height: 18, marginTop: 1, borderRadius: 6, backgroundColor: tint(color, 0.16), alignItems: 'center', justifyContent: 'center'}}>{icon ? <Icon name={icon} size={11} color={color} /> : <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: color}} />}</View>}
      <View style={{flex: 1, minWidth: 0, gap: 2}}>
        <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 6}}>
          {/* 0.3.317: no cartao, o horario e a alca para arrastar o item (util quando varios estao na mesma bolinha) */}
          {grab ? <Pressable accessibilityLabel={'Arrastar ' + title + ' na linha do tempo'} onPressIn={grab} style={({hovered}: any) => ({cursor: 'grab', borderRadius: 5, paddingHorizontal: 3, marginHorizontal: -3, backgroundColor: hovered ? tint(color, 0.18) : 'transparent'} as any)}><Text style={{fontSize: 12, color: c.muted, fontVariant: ['tabular-nums']}}>⠿ {time}</Text></Pressable> : <Text style={{fontSize: 12, color: c.muted, fontVariant: ['tabular-nums']}}>{time}</Text>}
          <Text numberOfLines={2} style={{flex: 1, fontSize: 13, fontWeight: '600', color: done ? c.muted : c.text, textDecorationLine: done ? 'line-through' : 'none'}}>{title}</Text>
        </View>
        {sub ? <Text numberOfLines={3} style={{fontSize: 12, lineHeight: 17, color: c.muted}}>{sub}</Text> : null}
      </View>
      <View style={{flexDirection: 'row', alignItems: 'flex-start', gap: 4}}>
        {action && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={({hovered, pressed}: any) => ({height: 26, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center', backgroundColor: hovered ? tint(color, 0.28) : tint(color, 0.16), transform: [{scale: pressed ? 0.97 : 1}]})}><Text style={{fontSize: 12, fontWeight: '600', color}}>{action}</Text></Pressable> : null}
        {onEdit ? <Pressable accessibilityRole="button" accessibilityLabel={'Editar ' + title} onPress={onEdit} hitSlop={6} style={({hovered}: any) => ({width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Icon name="edit" size={14} color={c.muted} /></Pressable> : null}
      </View>
    </View>;
  const recs = point.recs.slice(0, 5), marks = point.marks.slice(0, 6), extra = point.recs.length - recs.length + point.marks.length - marks.length;
  return <View {...({onMouseEnter: onEnter, onMouseLeave: onLeave} as any)} style={{position: 'absolute', left: x, bottom: 46, width: W, zIndex: 8, backgroundColor: c.bg, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12, boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 14px 36px rgba(0,0,0,0.45)'} as any}>
    {recs.map((r, i) => <View key={r.id + i} style={{borderTopWidth: i ? 1 : 0, borderColor: c.line}}>{Row({color: r.kind === 'reminder' ? REMIND : colorOf(r, c.accent), icon: r.kind === 'reminder' ? 'bell' : undefined, time: hhmm(new Date(r.date)), title: r.title, sub: desc(r) || undefined,
      check: r.isTask && actions.onToggleTask ? () => actions.onToggleTask!(r) : undefined, done: r.isTask ? (r.original as any)?.state === 'done' : false, onEdit: () => {onClose(); actions.onEdit(r);}, grab: onGrab && point.recs.length + point.marks.length > 1 ? (e: any) => onGrab(e, {rec: r}, r.kind === 'reminder' ? REMIND : colorOf(r, c.accent)) : undefined})}</View>)}
    {marks.map((m, i) => <View key={m.id} style={{borderTopWidth: i || recs.length ? 1 : 0, borderColor: c.line}}>{Row({color: markColor(m, c.danger), icon: m.kind === 'package' ? 'box' : m.kind === 'routine' ? ((m.dose?.icon || ROUTINE_ICON[m.dose?.type || 'capsula'] || 'capsule') as IconName) : m.kind === 'income' ? 'plus' : 'wallet',
      time: m.kind === 'routine' || m.kind === 'package' ? hhmm(m.at) : m.at.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}), title: m.title, sub: m.kind === 'routine' ? (m.done ? 'Feito' : '') : m.sub, done: m.done && m.kind === 'routine',
      action: markAction(m), onAction: actions.onMarkAction ? () => actions.onMarkAction!(m) : undefined, onEdit: actions.onMarkOpen ? () => {onClose(); actions.onMarkOpen!(m);} : undefined, grab: onGrab && point.marks.length > 1 ? (e: any) => onGrab(e, m.kind === 'routine' && m.dose ? {dose: m.dose} : {mark: m}, markColor(m, c.danger)) : undefined})}</View>)}
    {extra > 0 ? <Text style={{fontSize: 11, color: c.muted, paddingBottom: 6}}>+{extra} mais</Text> : null}
  </View>;
}

/** 0.3.317 (Pedro): rodinha do mouse em cima do bloco passa os itens (um por passo, sem disparar varios de uma vez). */
function useWheelStep(onStep: (dir: 1 | -1) => void, enabled: boolean) {
  const ref = useRef<View>(null), cb = useRef(onStep); cb.current = onStep;
  useEffect(() => {const el: any = ref.current; if (!el?.addEventListener || !enabled) return; let acc = 0, last = 0;
    const h = (e: WheelEvent) => {e.preventDefault(); const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; acc += d; const now = Date.now();
      if (Math.abs(acc) >= 40 && now - last > 260) {cb.current(acc > 0 ? 1 : -1); acc = 0; last = now;} else if (now - last > 600) acc = Math.sign(acc) * Math.min(Math.abs(acc), 40);};
    el.addEventListener('wheel', h, {passive: false}); return () => el.removeEventListener('wheel', h);}, [enabled]);
  return ref;
}
/** Setas "‹ 1 de N ›" no canto do bloco (Price Tracker, Encomendas). */
function Pager({i, n, onGo, what}: {i: number; n: number; onGo: (k: number) => void; what: string}) {
  const c = useTheme(); if (n < 2) return null;
  const btn = (label: string, k: number, a11y: string) => <Pressable accessibilityRole="button" accessibilityLabel={a11y} hitSlop={7} onPress={() => onGo(k)} style={({hovered}: any) => ({width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Text style={{color: c.muted, fontSize: 14}}>{label}</Text></Pressable>;
  return <View style={{position: 'absolute', top: 14, right: 12, flexDirection: 'row', alignItems: 'center', gap: 2}}>
    {btn('‹', (i - 1 + n) % n, what + ' anterior')}<Text style={{fontSize: 11, color: c.muted, fontVariant: ['tabular-nums'], minWidth: 28, textAlign: 'center'}}>{(i % n) + 1} de {n}</Text>{btn('›', (i + 1) % n, 'Próximo: ' + what.toLowerCase())}
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
/** 0.3.321 (revisao com as skills - Confirmar/Recuperar): Concluir e Tomei mostram que estao gravando, confirmam o que
 * mudou ("Devolver oficial farma concluida") com Desfazer por alguns segundos e, se falhar, dizem e oferecem tentar de novo.
 * Antes o item so sumia e dava lugar ao proximo - sem confirmacao e sem volta pelo Inicio. */
type Confirm = {ok: boolean; text: string; undo?: () => Promise<unknown> | void; retry?: () => void} | null;
function useConfirm(): [Confirm, (v: Confirm) => void, boolean, (v: boolean) => void] {
  const [conf, setConf] = useState<Confirm>(null), [busy, setBusy] = useState(false), t = useRef<any>(null);
  useEffect(() => () => clearTimeout(t.current), []);
  return [conf, (v: Confirm) => {clearTimeout(t.current); setConf(v); if (v) t.current = setTimeout(() => setConf(null), v.ok ? 6000 : 9000);}, busy, setBusy];
}
function ConfirmRow({conf, onClear}: {conf: NonNullable<Confirm>; onClear: () => void}) {
  const c = useTheme(), [undoing, setUndoing] = useState(false);
  const link = (label: string, f: () => void) => <Pressable accessibilityRole="button" disabled={undoing} onPress={f} hitSlop={8} style={({hovered, pressed}: any) => ({height: 26, paddingHorizontal: 9, borderRadius: 8, justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent', transform: [{scale: pressed ? 0.97 : 1}], opacity: undoing ? 0.5 : 1})}><Text style={{fontSize: 12, fontWeight: '600', color: conf.ok ? c.accent : c.danger}}>{label}</Text></Pressable>;
  return <View accessibilityLiveRegion="polite" style={{marginTop: 8, height: 28, flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0}}>
    <Text numberOfLines={1} style={{flexShrink: 1, fontSize: 12, color: conf.ok ? c.muted : c.danger}}>{conf.ok ? '✓ ' : ''}{conf.text}</Text>
    {conf.ok && conf.undo ? link(undoing ? 'Desfazendo…' : 'Desfazer', () => {setUndoing(true); void Promise.resolve(conf.undo!()).finally(() => {setUndoing(false); onClear();});}) : null}
    {!conf.ok && conf.retry ? link('Tentar de novo', () => {onClear(); conf.retry!();}) : null}
  </View>;
}
function Act({label, onPress, busy}: {label: string; onPress: () => void; busy?: boolean}) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{busy: !!busy, disabled: !!busy}} disabled={busy} onPress={onPress} hitSlop={6} style={({hovered, pressed}: any) => ({opacity: busy ? 0.6 : 1, alignSelf: 'flex-start', marginTop: 8, height: 28, paddingHorizontal: 11, borderRadius: 9, justifyContent: 'center', backgroundColor: hovered ? tint(c.accent, 0.22) : c.accentSoft, transform: [{scale: pressed ? 0.97 : 1}]})}>
    <Text style={{fontSize: 12, fontWeight: '600', color: c.accent}}>{label}</Text>
  </Pressable>;
}
function Quiet({text, sub}: {text: string; sub: string}) {const c = useTheme(); return <View style={{marginTop: 'auto', gap: 4} as any}><Text style={{fontSize: 14, color: c.muted, fontWeight: '500'}}>{text}</Text><Text numberOfLines={1} style={{fontSize: 12, color: c.muted}}>{sub}</Text></View>;}
/** 0.3.321 (Pedro): a bolinha vermelha diz o motivo ao passar o mouse (antes aparecia sem explicacao). */
function Dot({reason}: {reason: string}) {
  const c = useTheme(), [on, setOn] = useState(false);
  return <View style={{position: 'absolute', top: 8, right: 8, zIndex: 6}}>
    <Pressable accessibilityRole="text" accessibilityLabel={reason} onHoverIn={() => setOn(true)} onHoverOut={() => setOn(false)} onPress={() => setOn(v => !v)} style={{width: 28, height: 28, alignItems: 'center', justifyContent: 'center', cursor: 'help'} as any}>
      <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger, boxShadow: '0 0 0 4px ' + tint('#F5A0AE', on ? 0.3 : 0.15)} as any} />
    </Pressable>
    {on ? <View pointerEvents="none" style={{position: 'absolute', top: 2, right: 30, maxWidth: 240, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, backgroundColor: c.bg, boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 10px 24px rgba(0,0,0,0.45)'} as any}>
      <Text style={{fontSize: 12, color: c.text, whiteSpace: 'nowrap'} as any}>{reason}</Text>
    </View> : null}
  </View>;
}

/** 0.3.310: a ultima linha da Agenda some aos poucos em vez de aparecer cortada no meio (mostra que tem mais rolando). */
const FADE_END = {maskImage: 'linear-gradient(to bottom, #000 calc(100% - 26px), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, #000 calc(100% - 26px), transparent)'};
function AgendaTile({style, card, upcoming, onOpen, onOpenAgenda}: {style: any; card: any; upcoming: DayRecord[]; onOpen: (r: DayRecord) => void; onOpenAgenda: () => void}) {
  const c = useTheme(), list = upcoming; // 0.3.302: todos (rolagem invisivel)
  return <View style={[card, {gap: 6, overflow: 'hidden', paddingVertical: 16}, style]}>
    <TileHead icon="calendar" color="#8fb4ff" name="Agenda · próximos" onOpen={onOpenAgenda} />
    {list.length ? <ScrollView keyboardShouldPersistTaps="handled" style={{flex: 1, marginTop: 2, ...FADE_END} as any} showsVerticalScrollIndicator={false}>{/* rolagem invisivel para ver os outros (0.3.295) */}{list.map((r, i) => <Pressable key={r.id + i} onPress={() => onOpen(r)} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 10, height: 31, borderTopWidth: i ? 1 : 0, borderColor: c.line, backgroundColor: hovered ? c.input : 'transparent', borderRadius: 6})}>
      <Text numberOfLines={1} style={{width: 92, fontSize: 13, color: c.muted, fontVariant: ['tabular-nums']}}>{whenLabel(r)}</Text>
      <View style={{width: 3, height: 16, borderRadius: 2, backgroundColor: colorOf(r, c.accent)}} />
      <Text numberOfLines={1} style={{flex: 1, fontSize: 13, color: c.text}}>{r.title}</Text>
    </Pressable>)}</ScrollView> : <Quiet text="Nada marcado" sub="Nenhum compromisso pela frente neste mês." />}
  </View>;
}
function TasksTile({style, card, open, onOpen, onDone}: {style: any; card: any; open: Task[]; onOpen: () => void; onDone: (t: Task) => Promise<boolean | void> | void}) {
  const imp = open.filter(isImportant), first = imp[0] || open[0], [conf, setConf, busy, setBusy] = useConfirm();
  const finish = async (t: Task) => {if (busy) return; setBusy(true); setConf(null); let ok: boolean | void = undefined; try {ok = await onDone(t);} catch {ok = false;} setBusy(false);
    if (ok === false) setConf({ok: false, text: 'Não deu para concluir.', retry: () => void finish(t)}); else setConf({ok: true, text: t.title + ' concluída', undo: () => onDone({...t, state: 'done'})});};
  return <View style={[card, {gap: 6, overflow: 'hidden', paddingVertical: 16}, style]}>
    {imp.length ? <Dot reason={imp.length === 1 ? '1 tarefa importante em aberto' : imp.length + ' tarefas importantes em aberto'} /> : null}
    <TileHead icon="checklist" color="#F5A0AE" name="Tarefas" onOpen={onOpen} />
    {first ? <View style={{marginTop: 'auto', gap: 4} as any}>
      <Big value={String(imp.length || open.length)} unit={imp.length ? (imp.length === 1 ? 'importante' : 'importantes') : 'em aberto'} />
      <Line text={(imp.length ? 'Comece por ' : '') + first.title} />
      {conf ? <ConfirmRow conf={conf} onClear={() => setConf(null)} /> : <Act label={busy ? 'Concluindo…' : 'Concluir'} busy={busy} onPress={() => void finish(first)} />}
    </View> : <Quiet text="Tudo feito" sub="Nenhuma tarefa em aberto." />}
  </View>;
}
function RotinaTile({style, card, data, onOpen}: {style: any; card: any; data: HomeBriefData; onOpen: () => void}) {
  const c = useTheme(), s = data.capsules, today = new Date().toDateString();
  const doses = capsuleDoses(s.plans, s.history).filter(d => d.date.toDateString() === today).sort((a, b) => a.date.getTime() - b.date.getTime());
  // 0.3.317 (Pedro): igual ao Price Tracker - cada grupo da Rotina (Capsulas, Cuidados, Habitos, Treino e os tipos criados)
  // num quadro; o seletor no canto escolhe o grupo (clicar abre a lista, as setas passam); a rodinha passa os ITENS do grupo
  const groups = useMemo(() => {const m = new Map<string, {id: string; name: string; color: string; doses: typeof doses}>();
    for (const d of doses) {const t = typeInfo(d.plan); if (!m.has(t.id)) m.set(t.id, {id: t.id, name: t.name, color: t.color, doses: []}); m.get(t.id)!.doses.push(d);}
    const order = (id: string) => {const n = ROTINA_TYPES.findIndex(t => t.id === id); return n < 0 ? 99 : n;};
    return [...m.values()].sort((a, b) => order(a.id) - order(b.id) || a.name.localeCompare(b.name));}, [doses.map(d => d.key + (d.taken ? 1 : 0)).join('|'), s.plans]);
  const [gid, setGid] = useState(''), [k, setK] = useState(-1), [menu, setMenu] = useState(false);
  // abre no primeiro grupo (na ordem da Rotina) que ainda tem algo para fazer hoje
  const auto = Math.max(0, groups.findIndex(x => x.doses.some(d => !d.taken)));
  const gi = gid ? Math.max(0, groups.findIndex(x => x.id === gid)) : auto, g = groups[gi];
  const list = g?.doses || [], firstOpen = Math.max(0, list.findIndex(d => !d.taken)), cur = list[k >= 0 && k < list.length ? k : firstOpen];
  const pickGroup = (n: number) => {const ng = groups[(n + groups.length) % groups.length]; if (ng) {setGid(ng.id); setK(-1);} setMenu(false);};
  const wheel = useWheelStep(d => list.length > 1 && setK(o => ((o >= 0 ? o : firstOpen) + d + list.length) % list.length), list.length > 1);
  const done = list.filter(d => d.taken).length, late = doses.some(d => !d.taken && d.date.getTime() < Date.now());
  const curLate = !!cur && !cur.taken && cur.date.getTime() < Date.now(), [conf, setConf, busy, setBusy] = useConfirm();
  const takeIt = async (d: NonNullable<typeof cur>) => {if (busy) return; setBusy(true); setConf(null);
    try {await s.take(d.plan.id, d.day, d.time); setConf({ok: true, text: d.plan.title + ' feito às ' + hhmm(new Date()), undo: () => s.take(d.plan.id, d.day, d.time, false).catch(() => undefined)});}
    catch {setConf({ok: false, text: 'Não deu para marcar.', retry: () => void takeIt(d)});} finally {setBusy(false);}};
  return <View ref={wheel} style={[card, {gap: 6, overflow: 'visible', paddingVertical: 16, zIndex: menu ? 30 : 0}, style]}>
    {late && groups.length < 2 ? <Dot reason={(() => {const d = doses.find(x => !x.taken && x.date.getTime() < Date.now()); return d ? d.plan.title + ' passou da hora (' + hhmm(d.date) + ')' : 'Algo da rotina passou da hora';})()} /> : null}
    <TileHead icon="cycle" color="#88CFB8" name="Rotina" onOpen={onOpen} />
    {g && groups.length > 1 ? <View style={{position: 'absolute', top: 14, right: 12, flexDirection: 'row', alignItems: 'center', gap: 2, zIndex: 5}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Grupo anterior" hitSlop={7} onPress={() => pickGroup(gi - 1)} style={({hovered}: any) => ({width: 24, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Text style={{color: c.muted, fontSize: 14}}>‹</Text></Pressable>
      <Pressable testID="rotina-group" accessibilityRole="button" accessibilityLabel={'Grupo da Rotina: ' + g.name + '. Escolher outro'} onPress={() => setMenu(v => !v)} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 9, borderRadius: 13, backgroundColor: tint(g.color, hovered || menu ? 0.22 : 0.12)})}>
        <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: g.color}} /><Text numberOfLines={1} style={{fontSize: 12, fontWeight: '600', color: g.color, maxWidth: 110}}>{g.name}</Text><Text style={{fontSize: 10, color: g.color}}>▾</Text>
        {late ? <View accessibilityLabel="Tem item da rotina que passou da hora (veja na lista)" style={{width: 6, height: 6, borderRadius: 3, backgroundColor: c.danger, marginLeft: 1}} /> : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Próximo grupo" hitSlop={7} onPress={() => pickGroup(gi + 1)} style={({hovered}: any) => ({width: 24, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Text style={{color: c.muted, fontSize: 14}}>›</Text></Pressable>
      {menu ? <View style={{position: 'absolute', top: 32, right: 24, minWidth: 180, paddingVertical: 6, borderRadius: 12, backgroundColor: c.bg, boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 14px 32px rgba(0,0,0,0.45)'} as any}>
        {groups.map((x, n) => <Pressable key={x.id} accessibilityRole="button" accessibilityState={{selected: n === gi}} onPress={() => pickGroup(n)} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 9, height: 34, paddingHorizontal: 12, backgroundColor: hovered ? c.input : 'transparent'})}>
          <View style={{width: 7, height: 7, borderRadius: 4, backgroundColor: x.color}} /><Text style={{flex: 1, fontSize: 13, color: c.text, fontWeight: n === gi ? '600' : '400'}}>{x.name}</Text>
          {x.doses.some(d => !d.taken && d.date.getTime() < Date.now()) ? <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: c.danger}} /> : null}
          <Text style={{fontSize: 12, color: c.muted, fontVariant: ['tabular-nums']}}>{x.doses.filter(d => d.taken).length}/{x.doses.length}</Text>
        </Pressable>)}
      </View> : null}
    </View> : null}
    {cur ? <View style={{marginTop: 'auto', gap: 4} as any}>
      <Big value={String(done)} unit={'de ' + list.length + ' hoje'} />
      <Line text={cur.taken ? cur.plan.title + ' · feito às ' + hhmm(cur.date) : curLate ? cur.plan.title + ' passou da hora (' + hhmm(cur.date) + ')' : (k < 0 ? 'Próximo: ' : '') + cur.plan.title + ' às ' + hhmm(cur.date)} />
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
        {conf ? <ConfirmRow conf={conf} onClear={() => setConf(null)} /> : !cur.taken ? <Act label={busy ? 'Marcando…' : 'Tomei'} busy={busy} onPress={() => void takeIt(cur)} /> : <View style={{height: 28, marginTop: 8, justifyContent: 'center'}}><Text style={{fontSize: 12, color: g.color, fontWeight: '600'}}>✓ Feito</Text></View>}
        {list.length > 1 ? <View style={{marginTop: 8, flexDirection: 'row', gap: 4}}>{list.map((d, n) => <View key={d.key} style={{width: d === cur ? 14 : 5, height: 5, borderRadius: 3, backgroundColor: d === cur ? g.color : d.taken ? tint(g.color, 0.5) : c.line}} />)}</View> : null}
      </View>
    </View> : <Quiet text="Nada hoje" sub="Nenhum item da rotina para hoje." />}
  </View>;
}
/** 0.3.307 (Pedro: "o layout ficou ruim"): Financas ocupa duas colunas, com dois numeros lado a lado no mesmo peso -
 * gastos do mes e dinheiro guardado -, cada um com a sua barra; embaixo, numa linha so, a conta que vence primeiro. */
/** Divisoes da barra da meta (como no app): de 10 em 10 mil; metas acima de 100 mil, em 10 partes redondas. */
function goalTicks(target: number): {f: number; label: string}[] {
  if (!(target > 0)) return [];
  let step = 10000; if (target > 100000) {const raw = target / 10, p = Math.pow(10, Math.floor(Math.log10(raw))); step = Math.ceil(raw / p) * p;}
  if (target <= step) return [];
  const out: {f: number; label: string}[] = [];
  for (let v = step; v < target - step * 0.2; v += step) out.push({f: v / target, label: v >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + ' mi' : Math.round(v / 1000) + ' mil'});
  return out;
}
function FinanceTile({style, card, data, goal, masked, onOpen, onToggleMask}: {style: any; card: any; data: HomeBriefData; goal: GoalNumbers | null; masked: boolean; onOpen: () => void; onToggleMask?: () => void}) {
  const c = useTheme(), dues = data.dues, first = dues?.[0], today = new Date().toISOString().slice(0, 10);
  const when = (d: string) => d === today ? 'vence hoje' : d < today ? 'venceu ' + d.slice(8, 10) + '/' + d.slice(5, 7) : 'vence ' + d.slice(8, 10) + '/' + d.slice(5, 7);
  const money = (v: number) => masked ? 'R$ •••••' : brl(v);
  const g = goal && goal.target > 0 ? goalStats(goal) : null, sp = data.spend && data.spend.available > 0 ? data.spend : null, lo = data.loose;
  const spendColor = sp ? (sp.pct > 100 ? c.danger : sp.pct >= 80 ? '#E8B04A' : '#88CFB8') : '#88CFB8';
  const Stat = ({label, value, sub, pct, color, ticks = []}: {label: string; value: string; sub: string; pct: number | null; color: string; ticks?: {f: number; label: string}[]}) => <View style={{flex: 1, minWidth: 0, gap: 6}}>
    <Text numberOfLines={1} style={{fontSize: 12, color: c.muted}}>{label}</Text>
    {/* 0.3.317 (Pedro): na meta, o "45% de R$ 40.000" fica ao lado do valor e as divisoes (10 mil, 20 mil...) descem para
        a linha do "2 lancamentos" do lado, no mesmo tamanho de letra */}
    <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 8, minWidth: 0}}>
      <Text numberOfLines={1} style={{fontSize: 24, fontWeight: '600', letterSpacing: -0.6, color: c.text, fontVariant: ['tabular-nums']}}>{value}</Text>
      {ticks.length ? <Text numberOfLines={1} style={{flexShrink: 1, fontSize: 12, color: c.muted, fontVariant: ['tabular-nums']}}>{sub}</Text> : null}
    </View>
    {/* sem barra quando nao ha limite (despesas): so a linha fina, para os dois lados ficarem alinhados */}
    <View style={{height: 4, borderRadius: 2, backgroundColor: c.line}}>{pct != null ? <View style={{height: 4, borderRadius: 2, width: (Math.min(100, Math.max(1, pct)) + '%') as any, backgroundColor: color}} /> : null}
      {ticks.map(t => <View key={t.f} style={{position: 'absolute', left: (t.f * 100 + '%') as any, top: -2, width: 1.5, height: 8, marginLeft: -0.75, borderRadius: 1, backgroundColor: c.muted, opacity: 0.6}} />)}
    </View>
    {ticks.length ? <View><Text style={{fontSize: 12, color: 'transparent'}}> </Text>{ticks.map(t => <Text key={t.f} numberOfLines={1} style={{position: 'absolute', top: 0, left: (t.f * 100 + '%') as any, transform: [{translateX: -24}], width: 48, textAlign: 'center', fontSize: 12, color: c.muted, fontVariant: ['tabular-nums']}}>{t.label}</Text>)}</View>
      : <Text numberOfLines={1} style={{fontSize: 12, color: c.muted, fontVariant: ['tabular-nums']}}>{sub}</Text>}
  </View>;
  return <View style={[card, {gap: 6, overflow: 'hidden', paddingVertical: 16}, style]}>
    <View style={{flexDirection: 'row', alignItems: 'center'}}>
      <TileHead icon="wallet" color="#b49ae6" name="Finanças" onOpen={onOpen} />
      <View style={{flex: 1}} />
      {/* 0.3.309: a conta que vence primeiro fica no cabecalho, como uma etiqueta (sem ocupar uma linha embaixo) */}
      {first ? <Pressable accessibilityRole="button" accessibilityLabel={'Conta: ' + first.title + ' ' + when(first.date)} onPress={onOpen} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, marginVertical: -3, paddingHorizontal: 9, borderRadius: 13, marginRight: 6, maxWidth: '60%', backgroundColor: tint(first.date <= today ? '#F5A0AE' : '#E8B04A', hovered ? 0.2 : 0.12)} as any)}>
        <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: first.date <= today ? c.danger : '#E8B04A'}} />
        <Text numberOfLines={1} style={{flexShrink: 1, fontSize: 12, color: first.date <= today ? c.danger : '#E8B04A', fontWeight: '500'}}>{first.title} {when(first.date)} · {money(first.amount)}</Text>
      </Pressable> : null}
      {onToggleMask ? <Pressable accessibilityRole="button" accessibilityLabel={masked ? 'Mostrar valores' : 'Esconder valores'} onPress={onToggleMask} hitSlop={8} style={({hovered}: any) => ({width: 28, height: 28, marginVertical: -4, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Icon name={masked ? 'eyeOff' : 'eye'} size={16} color={c.muted} /></Pressable> : null}
    </View>
    {/* 0.3.309 (Pedro): os numeros logo abaixo do titulo (antes ficavam no pe do cartao, com vazio em cima) */}
    {lo || g ? <View style={{flexDirection: 'row', gap: 22, marginTop: 14}}>{/* 0.3.312: logo abaixo do titulo (0.3.309). Com a altura fixa das fileiras (ROW_H) o numero fica na mesma linha do Price Tracker e do E-mails; ancorado embaixo, as divisoes da meta empurravam o numero para baixo e desalinhava */}
      {/* 0.3.308 (Pedro): despesas que ele lancou no mes, fora as contas a pagar e o que se repete */}
      {/* 0.3.310: com teto definido (engrenagem do Controle de gastos), barra e "X% de R$ teto" */}
      {lo ? <Stat label={'Despesas de ' + new Date().toLocaleDateString('pt-BR', {month: 'long'})} value={money(lo.total)} sub={lo.cap > 0 ? Math.round(lo.total / lo.cap * 100) + '% de ' + money(lo.cap) : lo.count ? (lo.count === 1 ? '1 lançamento' : lo.count + ' lançamentos') + (lo.biggest && lo.count > 1 ? ' · maior: ' + lo.biggest.title : '') : 'Nenhuma despesa lançada'} pct={lo.cap > 0 ? lo.total / lo.cap * 100 : null} color={lo.cap > 0 ? (lo.total > lo.cap ? c.danger : lo.total >= lo.cap * 0.8 ? '#E8B04A' : '#88CFB8') : spendColor} /> : null}
      {g && goal ? <Stat label={goal.name || 'Meta'} value={money(goal.saved)} sub={Math.round(g.pct * 100) + '% de ' + money(goal.target)} pct={g.pct * 100} color="#b49ae6" ticks={goalTicks(goal.target)} /> : null}
    </View> : <Quiet text="Abra Finanças" sub="Para ver gastos e meta aqui." />}
  </View>;
}
/** Price Tracker: mostra um produto por vez; as setas passam para o proximo (0.3.293: sem trocar sozinho). */
function PriceTile({style, card, rows, onOpen}: {style: any; card: any; rows: MonitorWidgetRow[] | null; onOpen: () => void}) {
  const c = useTheme(), reduced = useReducedMotion();
  const list = useMemo(() => [...(rows || [])].filter(r => r.price != null).sort((a, b) => Number(b.atLow) - Number(a.atLow) || Math.abs(b.change || 0) - Math.abs(a.change || 0)), [rows]);
  const [i, setI] = useState(0), [hover, setHover] = useState(false), fade = useRef(new Animated.Value(1)).current;
  const go = (n: number) => {Animated.timing(fade, {toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false}).start(() => {setI(n); Animated.timing(fade, {toValue: 1, duration: 280, easing: Easing.bezier(0.22, 0.8, 0.24, 1), useNativeDriver: false}).start();});};
  // 0.3.293 (Pedro): parado; troca so quando a pessoa escolhe (setas ou, 0.3.317, a rodinha do mouse em cima do bloco)
  void hover; void reduced;
  const wheel = useWheelStep(d => list.length > 1 && go((i + d + list.length) % list.length), list.length > 1);
  const r = list[i % Math.max(1, list.length)];
  return <View ref={wheel} style={[card, {gap: 6, overflow: 'hidden', paddingVertical: 16}, style]} {...({onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false)} as any)}>
    
    <TileHead icon="tag" color="#88CFB8" name="Price Tracker" onOpen={onOpen} />
    {list.length > 1 ? <View style={{position: 'absolute', top: 14, right: 12, flexDirection: 'row', alignItems: 'center', gap: 2}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Produto anterior" hitSlop={7} onPress={() => go((i - 1 + list.length) % list.length)} style={({hovered}: any) => ({width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Text style={{color: c.muted, fontSize: 14}}>‹</Text></Pressable>
      <Text style={{fontSize: 11, color: c.muted, fontVariant: ['tabular-nums'], minWidth: 28, textAlign: 'center'}}>{(i % list.length) + 1} de {list.length}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Próximo produto" hitSlop={7} onPress={() => go((i + 1) % list.length)} style={({hovered}: any) => ({width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Text style={{color: c.muted, fontSize: 14}}>›</Text></Pressable>
    </View> : null}
    {r ? <Animated.View style={{marginTop: 'auto', gap: 4, opacity: fade, transform: [{translateY: fade.interpolate({inputRange: [0, 1], outputRange: [6, 0]})}]} as any}>
      <Big value={brl(r.price || 0)} unit={r.title} />
      <Line text={r.atLow ? 'Menor preço já visto' + (r.store ? ' · ' + r.store : '') : r.change ? (r.change < 0 ? 'Caiu ' : 'Subiu ') + Math.abs(r.change).toFixed(1).replace('.', ',') + '%' + (r.store ? ' · ' + r.store : '') : 'Estável' + (r.store ? ' · ' + r.store : '')} />
      <Act label="Ver o produto" onPress={onOpen} />
    </Animated.View> : <Quiet text="Nenhum produto" sub="Cole o link de um produto no Price Tracker." />}
  </View>;
}
function PackagesTile({style, card, data, onOpen}: {style: any; card: any; data: HomeBriefData; onOpen: () => void}) {
  const list = [...data.packs].sort((a, b) => Number(isOut(b) || !!b.needs) - Number(isOut(a) || !!a.needs));
  // 0.3.317 (Pedro): igual ao Price Tracker - uma encomenda por vez, setas "1 de N" e a rodinha do mouse passando
  const [i, setI] = useState(0), fade = useRef(new Animated.Value(1)).current;
  const go = (n: number) => {Animated.timing(fade, {toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: false}).start(() => {setI(n); Animated.timing(fade, {toValue: 1, duration: 260, easing: Easing.bezier(0.22, 0.8, 0.24, 1), useNativeDriver: false}).start();});};
  const wheel = useWheelStep(d => list.length > 1 && go((i + d + list.length) % list.length), list.length > 1);
  const cur = list[i % Math.max(1, list.length)], today = list.filter(isOut).length;
  return <View ref={wheel} style={[card, {gap: 6, overflow: 'hidden', paddingVertical: 16}, style]}>
    {list.some(p => p.needs === 'fee' || p.needs === 'pickup') && list.length < 2 ? <Dot reason={list.find(p => p.needs === 'fee') ? 'Encomenda com taxa para pagar' : 'Encomenda esperando retirada'} /> : null}
    <TileHead icon="box" color="#E8B04A" name="Encomendas" onOpen={onOpen} />
    <Pager i={i} n={list.length} onGo={go} what="Encomenda" />
    {cur ? <Animated.View style={{marginTop: 'auto', gap: 4, opacity: fade, transform: [{translateY: fade.interpolate({inputRange: [0, 1], outputRange: [6, 0]})}]} as any}>
      <Big value={String(list.length)} unit={'a caminho' + (today ? ' · ' + today + (today === 1 ? ' chega hoje' : ' chegam hoje') : '')} />
      <Line text={cur.title + ': ' + cur.status.charAt(0).toLowerCase() + cur.status.slice(1)} />
      <Act label={cur.needs === 'fee' ? 'Pagar taxa' : cur.needs === 'pickup' ? 'Ver retirada' : 'Rastrear'} onPress={onOpen} />
    </Animated.View> : <Quiet text="Nada a caminho" sub="Tudo o que você pediu já chegou." />}
  </View>;
}
function MailTile({style, card, data, onOpen}: {style: any; card: any; data: HomeBriefData; onOpen: () => void}) {
  const list = data.mailNew, first = list[0];
  return <View style={[card, {gap: 6, overflow: 'hidden', paddingVertical: 16}, style]}>
    <TileHead icon="mail" color="#8fb4ff" name="E-mails" onOpen={onOpen} />
    {first ? <View style={{marginTop: 'auto', gap: 4} as any}>
      <Big value={String(list.length)} unit={list.length === 1 ? 'novo' : 'novos'} />
      <Line text={String(first.data?.from_name || first.data?.from_addr || '') + ' · ' + first.title} />
      <Act label="Abrir" onPress={onOpen} />
    </View> : <Quiet text="Nada novo" sub="A Sofia segue de olho nas suas regras." />}
  </View>;
}

/** 0.3.295: esqueleto no MESMO desenho do Inicio novo (cartao Seu dia + duas fileiras de blocos, mesmas alturas):
 * quando os dados chegam, so o conteudo aparece - nada muda de lugar nem de tamanho. */
export function HomeBriefSkeleton() {
  const c = useTheme(), root = useRef<View>(null), [briefH, setBriefH] = useState(lastBrief), rowH = useRowHeight(root, briefH);
  const card = {backgroundColor: c.surface, borderRadius: 18, padding: 18, paddingVertical: 16, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(255,255,255,0.045), 0 1px 2px rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.18)'} as any;
  const tile = (flex: number, wide = false) => <View style={[card, {flex, height: rowH, gap: 10}]}>
    <ShimmerBlock width={110} height={14} radius={6} />
    {wide ? <LoadingLines rows={3} /> : <View style={{marginTop: 'auto', gap: 8} as any}><ShimmerBlock width={70} height={22} radius={6} /><ShimmerBlock width={'80%'} height={11} radius={5} /><ShimmerBlock width={80} height={26} radius={8} /></View>}
  </View>;
  return <ShimmerGroup><View ref={root} testID="home-desk-skeleton" style={{gap: 12}}>
    <View style={{...card, borderRadius: 22, padding: 20, paddingBottom: 14, height: briefH}}>
      <View style={{height: 24, justifyContent: 'center'}}><ShimmerBlock width={90} height={16} radius={6} /></View>
      <View style={{marginTop: 12, height: 100, justifyContent: 'center'}}><ShimmerBlock width={'100%'} height={2} radius={1} /></View>
    </View>
    <View style={{flexDirection: 'row', gap: 12}}>{tile(2, true)}{tile(1)}{tile(1)}</View>
    <View style={{flexDirection: 'row', gap: 12}}>{tile(2, true)}{tile(1)}{tile(1)}{tile(1)}</View>
  </View></ShimmerGroup>;
}
