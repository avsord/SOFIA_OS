// 0.3.292 (Inicio novo do site, prototipo aprovado): embaixo da saudacao, o cartao "Seu dia" (frase da Sofia,
// atalhos e a linha do tempo do dia) e o resumo de tudo em blocos do mesmo tamanho. So o Price Tracker passa
// sozinho pelos produtos; o resto fica parado no item mais importante (decisao do Pedro: menos movimento).
// Medidas em px de computador (metro: FLUID - so o fator da tela).
import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, Image, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions} from 'react-native';
import {ShimmerBlock, ShimmerGroup, LoadingLines} from '../components/Loading';
import {goalStats, type GoalNumbers} from '../components/GoalProgress';
import {useTheme} from '../lib/theme';
import {uiScale, fluidFactor} from '../web/desktop-scale';
import {dpx} from '../lib/content-width';
import type {Task} from '../lib/types';
import type {DayRecord} from '../lib/dashboard';
import type {MonitorWidgetRow} from '../lib/monitoring';
import {money as fmtMoney} from '../lib/monitoring';
import type {HomeBriefData} from '../lib/home-brief';
import type {Due} from '../lib/finance';
import {capsuleDoses, capsuleDay} from '../lib/capsule-model';
import {agendaPriority, isHoliday, HOLIDAY_COLOR} from '../lib/agenda-priority';
import {useReducedMotion} from '../lib/motion';
import {Icon, type IconName} from '../components/Icon';
import Svg, {Path, Circle} from 'react-native-svg';
import {DISPLAY_ITALIC} from '../lib/sofia-font';
import {HoverPressable} from '../components/HoverPressable';

const hhmm = (d: Date) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const brl = (v: number) => v.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL', maximumFractionDigits: v >= 1000 ? 0 : 2});
const tint = (hex: string, a: number) => {const h = hex.replace('#', ''); if (h.length !== 6) return hex; const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;};
const isImportant = (t: Task) => t.priority_level === 'important';
/** saiu para entrega (a etapa 2 sem ser retirada) */
const isOut = (x: {step: number; needs: string; delivered: boolean}) => !x.delivered && x.step === 2 && x.needs !== 'pickup';
/** cor do item na Agenda (tarefa usa a prioridade da tarefa; compromisso a do evento; feriado verde) */
/** 0.3.332: urgencia do item (importante 3 > media 2 > leve 1 > sem 0) - o mais urgente manda no miolo da bolinha agrupada */
const urgOf = (r: DayRecord) => {const o: any = r.original || {}; const v = o.data?.priority_level ?? o.priority_level; return v === 'important' ? 3 : v === 'medium' ? 2 : v === 'light' ? 1 : 0;};
const LIME = '#C3DC82', IMPORTANT_RED = '#D94B57';
/** 0.3.335 (Pedro: "naturaliza mais o degrade"): curva suave para o fundo dos periodos - nasce devagar em cima (sem borda),
 * chega ao tom cheio logo abaixo e vai sumindo em curva (smoothstep) ate a linha, sem degraus */
const SOFT_FADE: [number, number][] = Array.from({length: 26}, (_, k) => {const t = k / 25; return [Math.round(t * 100), Math.max(0, Math.pow(1 - t, 1.15))];}); // 0.3.335 (Pedro): degrade bem longo, quase reto, sumindo aos poucos ate abaixo da linha
const colorOf = (r: DayRecord, accent: string) => {const o: any = r.original || {}; return agendaPriority({data: {priority_level: o.data?.priority_level ?? o.priority_level, calendar_id: o.data?.calendar_id}} as any).color || accent;};
/** hora (hoje) ou dia e hora (outros dias) */
const whenLabel = (r: DayRecord) => {const d = new Date(r.date), n = new Date(), tm = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1); const t = timed(r) ? hhmm(d) : ''; if (d.toDateString() === n.toDateString()) return 'hoje' + (t ? ' ' + t : ''); if (d.toDateString() === tm.toDateString()) return 'amanhã' + (t ? ' ' + t : ''); return d.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}) + (t ? ' ' + t : '');};
const timed = (r: DayRecord) => {if (/^\d{4}-\d{2}-\d{2}$/.test(r.date) || (r.original as any)?.data?.calendar_all_day) return false; const d = new Date(r.date); return !(d.getHours() === 0 && d.getMinutes() === 0); /* 0.3.295: 00:00 = sem hora (nao estica a linha do tempo) */};

export type HomeBriefProps = {
  data: HomeBriefData; today: DayRecord[]; all: DayRecord[]; tasks: Task[]; series: MonitorWidgetRow[] | null; goal: GoalNumbers | null; masked: boolean; onToggleMask?: () => void;
  onOpenItem: (r: DayRecord) => void; onOpenTasks: () => void; onOpenTask?: (id: string) => void; onToggleTask: (t: Task) => Promise<boolean | void> | void;
  onOpenModule: (id: string) => void; onOpenMonitoring: () => void; onOpenAgenda: () => void;
  onMute?: (t: MuteTarget, scope: 'one' | 'all', on: boolean) => void;
  onMarkAction?: (m: TimeMark) => void;
  onMove?: (moves: Move[]) => void;
  onAddAt?: (kind: AddKind, at: Date) => void;
  sofia?: SofiaBridge;
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
function TimelineSettingsPanel({boxRef, s, set, plans, bills, incomes, onClose}: {boxRef?: React.RefObject<View | null>; s: TimelineSettings; set: (v: TimelineSettings | ((old: TimelineSettings) => TimelineSettings)) => void; plans: {id: string; title: string; type: string; color?: string}[]; bills: string[]; incomes: string[]; onClose: () => void}) {
  const c = useTheme(), [open, setOpen] = useState('');
  const cat = (id: string) => s.cats[id] !== false, item = (k: string) => s.items[k] !== false;
  // opacidade: cada toque passa 100 -> 80 -> 60 -> 40 -> 100
  const setOp = (k: string, base = 1) => set(o => {const cur = o.op[k] ?? base, nx = cur > 0.9 ? 0.8 : cur > 0.7 ? 0.6 : cur > 0.5 ? 0.4 : 1; return {...o, op: {...o.op, [k]: nx}};});
  const setCat = (id: string, v: boolean) => set(o => ({...o, cats: {...o.cats, [id]: v}})), setItem = (k: string, v: boolean) => set(o => ({...o, items: {...o.items, [k]: v}}));
  const sub = (id: string) => id === 'routine' ? plans.map(p => ({k: 'routine:' + p.id, label: p.title, color: p.color || routineColor(p.type)})) : id === 'bill' ? bills.map(t => ({k: 'fin:' + t, label: t, color: '#E8B04A'})) : id === 'income' ? incomes.map(t => ({k: 'fin:' + t, label: t, color: '#7ED6A5'})) : [];
  return <View ref={boxRef} style={{position: 'absolute', top: 52, right: 16, width: 340, maxHeight: 460, zIndex: 20, backgroundColor: c.bg, borderRadius: 16, boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 18px 44px rgba(0,0,0,0.5)'} as any}>
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
  const gearBox = useRef<View>(null); useClickOutside(gearBox, () => setGear(false), gear, '[data-testid="timeline-gear"]');
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
      try {for (const ds of capsuleDoses(p.data.capsules.plans, p.data.capsules.history, capsuleDay(day))) out.push({id: 'r' + ds.plan.id + ds.day + ds.time, kind: 'routine', at: ds.date, title: ds.plan.title, sub: ds.taken ? 'feito' : hhmm(ds.date), done: !!ds.taken, dose: {planId: ds.plan.id, day: ds.day, time: ds.time, type: String(ds.plan.data?.rotina_type || 'capsula'), color: typeInfo(ds.plan).color, icon: typeInfo(ds.plan).icon, mutedOne: (ds.plan.tags || []).includes('sofia-skip-v1:' + ds.day + 'T' + ds.time), mutedAll: !ds.plan.data?.notifications}});} catch {}
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

  // 0.3.332/0.3.335: placar do dia mostrado na linha (hoje, amanha...) - tarefas do dia e doses da Rotina do dia
  const [viewDay, setViewDay] = useState(0), dayNav = useRef<{go: (d: number) => void} | null>(null);
  const shownDay = useMemo(() => {const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + viewDay); return d;}, [viewDay]);
  const score = useMemo(() => {const key = shownDay.toDateString(); let done = 0, total = 0;
    for (const r of timelineItems) if (r.isTask && new Date(r.date).toDateString() === key) {total++; if ((r.original as any)?.state === 'done') done++;}
    try {for (const ds of capsuleDoses(p.data.capsules.plans, p.data.capsules.history, capsuleDay(shownDay))) {total++; if (ds.taken) done++;}} catch {/* sem rotina */}
    return {done, total};}, [timelineItems, p.data.capsules, shownDay]);
  const dayWord = viewDay === 0 ? 'Hoje' : viewDay === 1 ? 'Amanhã' : shownDay.toLocaleDateString('pt-BR', {weekday: 'long'}).replace(/^./, ch => ch.toUpperCase()).replace('-feira', '');
  const dayDate = shownDay.toLocaleDateString('pt-BR', {day: 'numeric', month: 'long'});
  const card = {backgroundColor: c.surface, borderRadius: 18, padding: 18, boxShadow: '0 0 0 1px rgba(255,255,255,0.045), 0 1px 2px rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.18)'} as any;
  return <View ref={root} style={{gap: 12}}>
    <View testID="home-brief" onLayout={e => {const h = Math.round(e.nativeEvent.layout.height); if (h > 0) {lastBrief = h; setBriefH(h);}}} style={{...card, borderRadius: 22, padding: 20, paddingTop: 16, paddingBottom: 14, backgroundColor: c.surface, position: 'relative', zIndex: 5}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <View style={{width: 24, height: 24, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center'}}><Text style={{color: c.onAccent, fontWeight: '700', fontSize: 12}}>S</Text></View>
        <Text style={{color: c.text, fontWeight: '600', fontSize: 14}}>Seu dia</Text>
        <View style={{flex: 1}} />
        {/* 0.3.335: dia no meio do cabecalho, com setas para o dia anterior/seguinte (clicar no dia volta para hoje) */}
        <View testID="day-nav" style={{position: 'absolute', left: '50%' as any, top: 0, bottom: 0, transform: [{translateX: '-50%' as any}], flexDirection: 'row', alignItems: 'center', gap: 4} as any}>
          <Pressable testID="day-prev" accessibilityRole="button" accessibilityLabel="Dia anterior" disabled={viewDay <= 0} onPress={() => dayNav.current?.go(viewDay - 1)} style={({hovered}: any) => ({width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', opacity: viewDay <= 0 ? 0.3 : 1, backgroundColor: hovered && viewDay > 0 ? c.input : 'transparent', transform: [{rotate: '180deg'}]})}><Icon name="chevron" size={14} color={c.muted} /></Pressable>
          <Pressable testID="day-label" accessibilityRole="button" accessibilityLabel="Voltar para hoje" onPress={() => dayNav.current?.go(0)} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 30, borderRadius: 9, justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}>
            <Text style={{fontSize: 14, fontWeight: '600', color: viewDay === 0 ? c.accent : c.text}}>{dayWord}</Text><Text style={{fontSize: 13, color: c.muted}}>{dayDate}</Text></Pressable>
          <Pressable testID="day-next" accessibilityRole="button" accessibilityLabel="Próximo dia" disabled={viewDay >= 2} onPress={() => dayNav.current?.go(viewDay + 1)} style={({hovered}: any) => ({width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', opacity: viewDay >= 2 ? 0.3 : 1, backgroundColor: hovered && viewDay < 2 ? c.input : 'transparent'})}><Icon name="chevron" size={14} color={c.muted} /></Pressable>
        </View>
        {score.total ? <Text testID="day-score" style={{fontSize: 12, color: c.muted, fontVariant: ['tabular-nums'], marginRight: 4}}>{dayWord} · <Text style={{color: '#5FD3A2', fontWeight: '700'}}>{score.done} de {score.total} feitos</Text></Text> : null}
        <Pressable testID="timeline-gear" accessibilityRole="button" accessibilityLabel="Ajustar a linha do tempo" onPress={() => setGear(v => !v)} hitSlop={8} style={({hovered}: any) => ({width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered || gear ? c.input : 'transparent'})}><Icon name="settings" size={16} color={gear ? c.accent : c.muted} /></Pressable>
      </View>
      {/* 0.3.318/0.3.331 (Pedro): clicar fora - em qualquer lugar, inclusive na barra lateral - ou Esc fecha os ajustes (useClickOutside) */}
      {gear ? <TimelineSettingsPanel boxRef={gearBox} s={tl} set={setTl} onClose={() => setGear(false)} plans={p.data.capsules.plans.filter(x => x.state === 'active').map(x => ({id: x.id, title: x.title, type: String(x.data?.rotina_type || 'capsula'), color: typeInfo(x).color}))} bills={[...new Set((p.data.money || []).filter(d => d.kind === 'pagar').map(d => d.title))]} incomes={[...new Set((p.data.money || []).filter(d => d.kind === 'receber').map(d => d.title))]} /> : null}
      <Timeline nav={dayNav} onDay={setViewDay} items={timelineItems.filter(r => tl.cats[r.isTask ? 'tasks' : r.kind === 'reminder' ? 'reminders' : 'events'] !== false)} next={next} op={{rec: r => tl.op[r.isTask ? 'tasks' : r.kind === 'reminder' ? 'reminders' : 'events'] ?? 1, mark: m => (m.kind === 'routine' && m.dose ? tl.op['routine:' + m.dose.planId] : (m.kind === 'bill' || m.kind === 'income' || m.kind === 'invoice') ? tl.op['fin:' + m.title] : undefined) ?? tl.op[m.kind] ?? 1}}
        marks={timeMarks.filter(m => tl.cats[m.kind] !== false && !(m.kind === 'routine' && m.dose && tl.items['routine:' + m.dose.planId] === false) && !((m.kind === 'bill' || m.kind === 'income' || m.kind === 'invoice') && tl.items['fin:' + m.title] === false))}
        actions={{onEdit: r => r.isTask && p.onOpenTask ? p.onOpenTask(String((r.original as any)?.id || r.id.replace(/^task:/, ''))) : p.onOpenItem(r), onToggleTask: r => r.original && p.onToggleTask(r.original as any), onMarkAction: p.onMarkAction, onMarkOpen: m => p.onOpenModule(m.kind === 'package' ? 'packages' : m.kind === 'routine' ? 'capsules' : 'finance'), onMove: p.onMove ? onMove : undefined, onAddAt: p.onAddAt, sofia: p.sofia}} />
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
const SPAN_FULL = 16, SPAN_MIN = 4, REMIND = '#7FD1E8'; // cor dos lembretes na linha do tempo
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
export type TimelineActions = {onEdit: (r: DayRecord) => void; onToggleTask?: (r: DayRecord) => void; onMarkAction?: (m: TimeMark) => void; onMarkOpen?: (m: TimeMark) => void; onMove?: (moves: Move[]) => void; onAddAt?: (kind: AddKind, at: Date) => void; sofia?: SofiaBridge};
/** 0.3.317 (Pedro): arrastar na linha do tempo muda so aquela vez (compromisso, lembrete, tarefa ou dose da Rotina). */
export type MoveTarget = MuteTarget | {mark: TimeMark};
/** 0.3.331 (Pedro): clicar num lugar vazio da linha do tempo abre um seletor pequeno; a escolha abre o editor da propria
 * funcao (compromisso, tarefa, lembrete, Rotina) ja com o horario do clique. */
export type AddKind = 'event' | 'task' | 'reminder' | 'routine';
/** 0.3.333 (aprovado por foto): o que o mini editor preso ao ponto grava (o Inicio grava como o app grava cada um). */
export type MiniSave = {kind: AddKind; title: string; at: Date; minutes?: number; notify?: boolean; google?: boolean; priority?: string; repeat?: string; message?: string; rtype?: string; dose?: string; daily?: boolean};
/** Ponte do Inicio com a Sofia: conversar (texto e foto) e gravar pelo mini editor; save devolve o "Desfazer". */
export type SofiaBridge = {first: string; ask: (text: string, file?: any) => Promise<string>; save: (x: MiniSave) => Promise<(() => Promise<void>) | void>};
/** 0.3.318: um arrastar pode levar varios itens juntos (bolinha com "2 itens", pilula com varias doses): cada um anda o mesmo tanto. */
export type Move = {t: MoveTarget; to: Date};
const DAY_START = 7; // (legado) inicio fixo de antes
/** 0.3.336 (Pedro): cada dia da linha vai das 05:00 a meia-noite; a janela de hoje acompanha o ritmo do dia - de manha
 * mostra o comeco, ao longo do dia vai andando com o "agora" (5 h antes dele) e a noite termina na meia-noite. */
const DAY_FROM = 5, LEAD = 5;
// 0.3.337 (Pedro: "e 23h, se eu vou para o outro dia nao deveria ir para 00:01?"): o dia seguinte abre na meia-noite,
// continuando de onde hoje termina; hoje de madrugada (antes das 05:00) a linha tambem comeca antes, para o "agora" aparecer
const homeOf = (d: number, span: number, nowH: number) => d === 0 ? Math.max(0, Math.min(24 - span, Math.max(Math.min(DAY_FROM, nowH - 1), nowH - LEAD))) : d * 24;
const nowHours = () => {const n = new Date(), z = new Date(n); z.setHours(0, 0, 0, 0); return (n.getTime() - z.getTime()) / 3600000;};
const routineColor = (type?: string) => (ROTINA_TYPES.find(x => x.id === type) || ROTINA_TYPES[0]).color;
const markColor = (m: TimeMark, danger: string) => m.late ? danger : m.kind === 'routine' ? (m.dose?.color || routineColor(m.dose?.type)) : MARK_COLOR[m.kind];
const markAction = (m: TimeMark) => m.done ? '' : m.kind === 'bill' && m.due?.tx ? 'Paguei' : m.kind === 'income' && m.due?.tx ? 'Recebi' : m.kind === 'routine' ? 'Tomei' : '';
type Point = {key: string; x: number; recs: DayRecord[]; marks: TimeMark[]};
function Timeline({items, next, marks = [], op, actions, nav, onDay}: {items: DayRecord[]; next: DayRecord | null; marks?: TimeMark[]; op: {rec: (r: DayRecord) => number; mark: (m: TimeMark) => number}; actions: TimelineActions; nav?: React.MutableRefObject<{go: (d: number) => void} | null>; onDay?: (d: number) => void}) {
  const c = useTheme(), [w, setW] = useState(0), [wS, setWS] = useState(0), [start, setStartRaw] = useState(() => homeOf(0, SPAN_FULL, nowHours())), box = useRef<View>(null), lineBox = useRef<View>(null);
  // 0.3.333 (aprovado por foto): Ctrl + rodinha aproxima a linha (ate 4 h na tela) e afasta de volta ate o dia inteiro (16 h)
  const [SPAN, setSpanState] = useState(SPAN_FULL), spanRef = useRef(SPAN_FULL), recsRef = useRef<DayRecord[]>(items); recsRef.current = items;
  // 0.3.317 (Pedro): a linha do tempo desliza (roda do mouse, botao "agora", borda ao arrastar) em vez de pular de hora em hora
  const startRef = useRef(homeOf(0, SPAN_FULL, nowHours())), target = useRef(homeOf(0, SPAN_FULL, nowHours())), raf = useRef<any>(null), dayRef = useRef(0), manualAt = useRef(0);
  const clampStart = (v: number) => Math.max(0, Math.min(24 * 3 - spanRef.current, v)); // 0.3.338 (Pedro): rolar passa de um dia para o outro, liso
  // 0.3.319 (Pedro: "o agora da uma bugada quando para"): movimento por tempo (ease-out de 380 ms) em vez de ir chegando aos
  // poucos - termina exatamente no destino, sem os ultimos quadros se arrastando; cada novo pedido continua do ponto atual
  const tween = useRef({from: startRef.current, t0: 0, ms: 380, home: false});
  const glide = (to: number, ms = 380, home = false) => {target.current = clampStart(to); tween.current = {from: startRef.current, t0: Date.now(), ms, home}; if (raf.current) return;
    const step = () => {const {from, t0, ms: dur} = tween.current, t = Math.min(1, (Date.now() - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      const nx = t >= 1 ? target.current : from + (target.current - from) * e; startRef.current = nx; setStartRaw(nx); raf.current = t >= 1 ? null : requestAnimationFrame(step);};
    raf.current = requestAnimationFrame(step);};
  useEffect(() => () => {if (raf.current) cancelAnimationFrame(raf.current);}, []);
  const [hover, setHover] = useState(''), [pin, setPin] = useState(''), hide = useRef<any>(null);
  // 0.3.326 (Pedro: "abrir e fechar a barra lateral faz as bolinhas e os nomes tremerem"): a largura que decide quem junta
  // numa bolinha, em que fileira vai cada nome e o tamanho dos nomes so muda quando a largura PARA de mudar; enquanto a
  // barra abre ou fecha, tudo anda junto em porcentagem da linha (antes os nomes eram em pixels de um quadro atras e as
  // bolinhas juntavam e separavam a cada quadro)
  useEffect(() => {if (!w) return; if (!wS) {setWS(w); return;} const t = setTimeout(() => setWS(w), 180); return () => clearTimeout(t);}, [w]);
  const dayKey = new Date().toDateString(), day0 = useMemo(() => {const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();}, [dayKey]); // 0.3.336: troca a meia-noite
  const pos = (d: Date) => ((d.getTime() - day0) / 3600000 - start) / SPAN;
  const [, tick] = useState(0);
  useEffect(() => {const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t);}, []);
  const nowX = pos(new Date());
  // 0.3.335 (Pedro: "< 02 Novembro > vai para o proximo dia"): o dia que esta no meio da linha vai para o cabecalho; as setas deslizam a linha para o dia anterior/seguinte
  // 0.3.338: o dia do cabecalho e o que esta no meio da linha (rolando, ele troca sozinho ao passar da meia-noite)
  const viewDay = Math.max(0, Math.min(2, Math.floor((start + SPAN / 2) / 24))); dayRef.current = viewDay;
  useEffect(() => {onDay?.(viewDay);}, [viewDay]);
  const goDay = (d: number) => {const dd = Math.max(0, Math.min(2, d)); dayRef.current = dd; manualAt.current = dd ? Date.now() : 0; setPin(''); setHover(''); glide(homeOf(dd, spanRef.current, nowHours()), 520, true);};
  if (nav) nav.current = {go: goDay};
  // 0.3.336: a janela de hoje acompanha o dia sozinha (a cada meio minuto), a nao ser que a pessoa tenha mexido na linha ha pouco;
  // a meia-noite o "hoje" vira o novo dia e a linha recomeca nas 05:00
  useEffect(() => {if (dayRef.current !== 0 || dragRef.current || overLine.current || Date.now() - manualAt.current < 180000) return; /* 0.3.350: com o mouse sobre a linha ela nao anda (a previa nao some) */ const h = homeOf(0, spanRef.current, nowHours()); if (Math.abs(h - target.current) > 0.02) glide(h, 900);}, [day0, Math.floor(Date.now() / 30000)]);
  // pontos: compromissos/tarefas/lembretes colados viram um ponto com numero; rotina colada vira uma pilula so; o resto separado
  const points: Point[] = [];
  const inView = (x: number) => x >= -0.01 && x <= 1.01;
  for (const r of items) {const x = pos(new Date(r.date)); if (!inView(x)) continue; const p = points[points.length - 1]; if (p && p.recs.length && wS && (x - p.x) * wS < 22) p.recs.push(r); else points.push({key: 'r' + r.id + r.date, x, recs: [r], marks: []});}
  const mpoints: Point[] = [];
  for (const m of marks) {const x = m.late ? 0.025 : pos(m.at); if (!inView(x)) continue; const p = mpoints[mpoints.length - 1]; if (m.kind === 'routine' && p && p.marks[0]?.kind === 'routine' && wS && (x - p.x) * wS < 22) p.marks.push(m); else mpoints.push({key: 'm' + m.id, x, recs: [], marks: [m]});}
  // marca colada num compromisso (ex.: conta das 9h e tarefa das 9h) anda um pouco para o lado, para as duas poderem ser tocadas
  if (wS) for (const mp of mpoints) {let tries = 0; while (tries++ < 4 && [...points, ...mpoints].some(o => o !== mp && Math.abs(o.x - mp.x) * wS < 20)) mp.x += 22 / wS;}
  const all = [...points, ...mpoints];
  const nearPoint = (fx: number) => {const W0 = wS || w || 1; let best: Point | null = null, bd = 26; for (const q of all) {if (q.x < -0.01 || q.x > 1.01) continue; const dpx = Math.abs(q.x - fx) * W0; if (dpx < bd) {bd = dpx; best = q;}} return best;};
  useEffect(() => {setSettle(o => {const keys = Object.keys(o); if (!keys.length) return o; let ch = false; const n = {...o};
    for (const k of keys) {const pt = all.find(q => q.key === k); if (!pt || Math.abs(pt.x * SPAN + startRef.current - o[k]) < 0.05) {delete n[k]; ch = true;}} return ch ? n : o;});}, [items, marks]);
  useEffect(() => {
    const el: any = box.current; if (!el || !el.addEventListener) return;
    const onWheel = (e: WheelEvent) => {e.preventDefault(); if (dragRef.current) return;
      if (e.ctrlKey || e.metaKey) {const r = (lineBox.current as any)?.getBoundingClientRect?.(); if (!r?.width) return; const fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), at = startRef.current + fx * spanRef.current;
        const ns = Math.max(SPAN_MIN, Math.min(SPAN_FULL, spanRef.current * (e.deltaY > 0 ? 1.15 : 1 / 1.15))); if (Math.abs(ns - spanRef.current) < 0.01) return; manualAt.current = Date.now(); spanRef.current = ns; setSpanState(ns);
        const st = clampStart(at - fx * ns); if (raf.current) {cancelAnimationFrame(raf.current); raf.current = null;} startRef.current = st; target.current = st; setStartRaw(st); setPin(''); setHover(''); return;}
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; manualAt.current = Date.now(); setPin(''); setHover(''); glide(target.current + d / 40 * spanRef.current / SPAN_FULL);};
    el.addEventListener('wheel', onWheel, {passive: false});
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => {if (typeof window === 'undefined' || !pin) return; const k = (e: KeyboardEvent) => {if (e.key === 'Escape') setPin('');}; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);}, [pin]);
  const enter = (key: string) => {clearTimeout(hide.current); setHover(key);};
  // 0.3.340 (Pedro: "tem que ter uma pontaria muito boa"): a bolinha mais perto do mouse (ate 26 px para os lados) ja abre
  // a previa e o clique ali seleciona ela - nao precisa acertar em cima da bolinha
  const [nearKey, setNearKey] = useState(''), dotNear = useRef('');
  const leave = () => {clearTimeout(hide.current); hide.current = setTimeout(() => setHover(''), 180);};
  // 0.3.317 (Pedro): arrastar para frente ou para tras. A bolinha segue o mouse em tempo real (sem cortes), a hora aparece
  // em cima; ao soltar encaixa de 5 em 5 minutos deslizando ate o lugar. Encostar na borda rola a linha (outro dia).
  type DragItem = {t: MoveTarget; at: Date}; type Drag = {key: string; items: DragItem[]; fx: number; live: boolean; color: string; snap?: string};
  const [drag, setDrag] = useState<Drag | null>(null), dragRef = useRef<Drag | null>(null), justDragged = useRef(false);
  const [settle, setSettle] = useState<Record<string, number>>({});
  // 0.3.330: adicionar clicando num lugar vazio da linha (guia "+ HH:MM" ao passar o mouse)
  const [adding, setAdding] = useState<{fx: number; at: Date} | null>(null), [guide, setGuide] = useState<number | null>(null);
  // confirmacao depois de adicionar pelo mini editor ("Reuniao adicionada as 21:30 · Desfazer"), some em 6 s
  const [toast, setToast] = useState<{text: string; undo?: () => Promise<void>} | null>(null), toastT = useRef<any>(null);
  const showToast = (text: string, undo?: (() => Promise<void>) | void) => {setToast({text, undo: undo || undefined}); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 6000);};
  const fxAt = (pageX: number) => {const el: any = lineBox.current; const r = el?.getBoundingClientRect?.(); return r && r.width ? Math.max(0, Math.min(1, (pageX - r.left) / r.width)) : null;};
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
      // 0.3.333 (aprovado por foto): ima - perto (ate 10 min) do comeco ou do fim de outro item, encosta nele e diz o motivo
      let fx = fxOf(ev.pageX), snap = ''; const ids = new Set(items.map(x => (x.t as any).rec?.id).filter(Boolean)), h = startRef.current + fx * spanRef.current; let best = 10 / 60;
      for (const r of recsRef.current) {if (ids.has(r.id)) continue; const a = (new Date(r.date).getTime() - day0) / 3600000, endIso = (r.original as any)?.data?.end_at, b = endIso ? (new Date(endIso).getTime() - day0) / 3600000 : null;
        if (b != null && Math.abs(h - b) < best) {best = Math.abs(h - b); fx = (b - startRef.current) / spanRef.current; const m = Math.round((b - a) * 60); snap = 'logo depois de ' + r.title + (m > 0 ? ' (' + (m >= 60 ? (m / 60).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + ' h' : m + ' min') + ')' : '');}
        else if (Math.abs(h - a) < best) {best = Math.abs(h - a); fx = (a - startRef.current) / spanRef.current; snap = (r.isTask ? 'junto com ' : 'no começo de ') + r.title;}}
      const d = {key, items, fx, live: true, color, snap}; dragRef.current = d; setDrag(d);
      const px = ev.pageX - rect.left; edge = px < 28 ? -1 : px > rect.width - 28 ? 1 : 0; if (edge && !edgeRaf) edgeRaf = requestAnimationFrame(tickEdge);};
    // 0.3.318 (Pedro): Esc cancela o arrastar - tudo volta para onde estava, nada e gravado
    const esc = (ev: KeyboardEvent) => {if (ev.key !== 'Escape') return; ev.preventDefault(); ev.stopPropagation(); const d = stop(); if (d?.live) {justDragged.current = true; setTimeout(() => {justDragged.current = false;}, 60);}};
    const up = () => {const d = stop(); if (!d?.live) return;
      justDragged.current = true; setTimeout(() => {justDragged.current = false;}, 60);
      // o primeiro item vai para onde a bolinha foi solta; os outros andam o mesmo tanto (de 5 em 5 minutos)
      // 0.3.323 (Pedro: "arrasto e ele vai e volta"): fica no lugar novo ate os dados chegarem com ele (guarda a HORA, nao a
      // posicao, para continuar certo se a linha rolar); antes qualquer atualizacao da tela (a Rotina atualiza todo segundo) desfazia
      const to = snapDate(d.fx), delta = to.getTime() - items[0].at.getTime(), hAbs = (to.getTime() - day0) / 3600000;
      setSettle(o => ({...o, [key]: hAbs})); setTimeout(() => setSettle(o => {const n = {...o}; delete n[key]; return n;}), 8000);
      actions.onMove!(items.map(x => ({t: x.t, to: new Date(x.at.getTime() + delta)})));};
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('keydown', esc, true);
  };
  const dragLabel = (fx: number) => {const d = snapDate(fx), dd = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - day0) / 864e5);
    return (dd === 0 ? '' : dd === 1 ? 'amanhã ' : dd === -1 ? 'ontem ' : d.toLocaleDateString('pt-BR', {weekday: 'short'}).replace('.', '') + ' ') + hhmm(d);};
  const label = (h: number) => {const d = new Date(day0 + h * 3600000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');}; // 0.3.336: o dia aparece no cabecalho; a meia-noite do fim do dia e 00:00 // 0.3.335: o dia aparece no cabecalho; na escala so a hora
  const desc = (r: DayRecord) => {const o: any = r.original || {}; return String(o.description || o.data?.description || o.data?.message || o.content || o.data?.location || '').trim();};
  // rotulos fixos: compromissos e tarefas primeiro, depois dinheiro e encomendas; rotina so na previa
  // 0.3.310 (tela grande): o rotulo cresce com o espaco de cada hora (150 a 230 px), para o nome nao cortar a toa
  for (const p of points) p.recs.sort((a, b) => urgOf(b) - urgOf(a)); // 0.3.332: importante primeiro (miolo, rotulo e previa)
  const LW = Math.round(Math.max(190, Math.min(270, (wS || 0) / SPAN * 1.75))), OFF = 44, rows: number[][] = [[], []], place: Record<string, number> = {};
  const fits = (px: number) => {for (const r of [0, 1]) if (rows[r].every(q => Math.abs(q - px) >= LW + 8)) {rows[r].push(px); return r;} return -1;};
  for (const p of points) {const r = fits(p.x * (wS || 1)); if (r >= 0) place[p.key] = r;}
  for (const p of mpoints) if (p.marks[0].kind !== 'routine') {const r = fits(p.x * (wS || 1)); if (r >= 0) place[p.key] = r;}
  const shown = all.find(p => p.key === (pin || hover));
  // 0.3.350 (Pedro: "com o mouse parado em cima da bolinha a previa sai"): a previa aberta pelo mouse so fecha quando o
  // mouse vai MESMO para longe (mais de 36 px da bolinha e fora da previa) - nao depende mais do "saiu de cima" do
  // navegador, que disparava sozinho quando a tela se redesenhava (dados chegando, Rotina atualizando, linha andando)
  const dotEls = useRef<Record<string, any>>({}), farT = useRef(false);
  useEffect(() => {if (!hover || pin || typeof document === 'undefined') return;
    const mv = (e: MouseEvent) => {const pv = document.querySelector('[data-testid="timeline-preview"]') as HTMLElement | null, dot = dotEls.current[hover];
      const inside = (r?: DOMRect | null, pad = 0) => !!r && e.clientX >= r.left - pad && e.clientX <= r.right + pad && e.clientY >= r.top - pad && e.clientY <= r.bottom + pad;
      const near = inside(pv?.getBoundingClientRect(), 6) || inside(dot?.getBoundingClientRect?.(), 30);
      if (near) {clearTimeout(hide.current); farT.current = false;} else if (!farT.current) {farT.current = true; clearTimeout(hide.current); hide.current = setTimeout(() => {farT.current = false; setHover(''); setNearKey('');}, 140);}};
    document.addEventListener('mousemove', mv); return () => document.removeEventListener('mousemove', mv);}, [hover, pin]);
  const tagOf = (p: Point): {text: string; more?: number; color: string; strong?: boolean; bg?: string; imp?: boolean; sub?: string} => {const m = p.marks[0]; if (m) return {text: m.title + ' · ' + m.sub, color: markColor(m, c.danger), strong: true}; const r = p.recs[0], isNext = !!next && p.recs.includes(next);
    // 0.3.321 (revisao - Reconhecer): bolinha com varios itens mostra o primeiro e quantos mais ("09:00 Cafe +3"), nao so "4 itens"
    const imp = p.recs.length > 1 && urgOf(r) === 3, mins = isNext ? Math.round((new Date(r.date).getTime() - Date.now()) / 60000) : -1;
    const inTxt = mins > 0 ? 'em ' + (mins >= 60 ? Math.floor(mins / 60) + ' h' + (mins % 60 ? ' ' + String(mins % 60).padStart(2, '0') : '') : mins + ' min') : '';
    return {text: hhmm(new Date(r.date)) + ' ' + r.title, more: p.recs.length - 1, color: p.recs.length === 1 && r.kind === 'reminder' ? REMIND : isNext ? c.text : c.muted, strong: isNext, bg: isNext ? tint(c.accent, 0.14) : undefined, imp, sub: inTxt};};
  // 0.3.318 (Pedro): o "agora" fica na altura da linha, colado na borda para onde ele leva ("‹ agora" na esquerda,
  // "agora ›" na direita); a linha encolhe daquele lado (deslizando) para o botao nao cobrir a marca da ponta
  // 0.3.319: o espaco do botao abre e fecha JUNTO com o movimento da linha (sai da distancia ate 07:00), sem transicao
  // separada - antes o botao sumia no meio do caminho, a linha alargava e os itens voltavam para tras no fim
  // na volta pelo botao, o espaco fecha na mesma proporcao do caminho (cada item anda sempre para o mesmo lado, sem tranco)
  // 0.3.336 (Pedro: "esse corte quando desloca a linha nao ta bom"): a linha nao encolhe mais; o botao "agora" so aparece por cima
  const homeNow = homeOf(0, SPAN, nowHours()), dist = viewDay ? 1 : start - homeNow, ease = viewDay ? 1 : Math.min(1, Math.abs(dist) / 0.75);
  const side = viewDay || Math.abs(dist) > 0.05 ? (dist > 0 ? 'left' : 'right') : '', inset = 0;
  // 0.3.318 (Pedro): o "agora" fica no MEIO do cartao inteiro (Seu dia), nao na altura da linha
  const [btnTop, setBtnTop] = useState<string>('');
  useLayoutEffect(() => {const el: any = box.current, card = el?.closest?.('[data-testid="home-brief"]'); if (!el?.getBoundingClientRect || !card) return;
    const a = el.getBoundingClientRect(), b = card.getBoundingClientRect(), z = homeZoom(), k = uiScale();
    setBtnTop(Math.round(((b.top + b.height / 2) - a.top) / z - 12 * k) + 'px');}, [side, w]);
  // 0.3.333 (aprovado): teclado com o mouse sobre a linha - setas andam entre os itens (abre a previa), Enter abre o item,
  // N adiciona agora (abre a Sofia no horario de agora), Esc fecha
  const overLine = useRef(false), kbIdx = useRef(-1);
  useEffect(() => {if (typeof window === 'undefined') return;
    const k = (e: KeyboardEvent) => {if (!overLine.current || adding || dragRef.current) return; const t = e.target as any; if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      const list = [...all].sort((a, b) => a.x - b.x).filter(q => q.x >= 0 && q.x <= 1);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {if (!list.length) return; e.preventDefault(); kbIdx.current = Math.max(0, Math.min(list.length - 1, kbIdx.current < 0 ? (e.key === 'ArrowRight' ? 0 : list.length - 1) : kbIdx.current + (e.key === 'ArrowRight' ? 1 : -1))); setPin(list[kbIdx.current].key); setHover(list[kbIdx.current].key);}
      else if (e.key === 'Enter' && kbIdx.current >= 0 && list[kbIdx.current]) {e.preventDefault(); const q = list[kbIdx.current]; setPin(''); setHover(''); if (q.recs[0]) actions.onEdit(q.recs[0]); else if (q.marks[0] && actions.onMarkOpen) actions.onMarkOpen(q.marks[0]);}
      else if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && (actions.sofia || actions.onAddAt)) {e.preventDefault(); const now = new Date(), fx = Math.max(0.02, Math.min(0.98, pos(now))); setPin(''); setHover(''); setAdding({fx, at: new Date(Math.ceil(now.getTime() / 300000) * 300000)});}
      else if (e.key === 'Escape') {kbIdx.current = -1; setPin(''); setHover('');}};
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);});
  return <View ref={box} {...({onMouseEnter: () => {overLine.current = true;}, onMouseLeave: () => {overLine.current = false;}} as any)} style={{marginTop: 26, height: 56 + OFF, userSelect: 'none', outlineStyle: 'none'} as any}>
   <View ref={lineBox} onLayout={e => {const v = e.nativeEvent.layout.width; if (v > 0) setW(v);}} style={{position: 'absolute', top: 0, bottom: 0, left: side === 'left' ? inset : 0, right: side === 'right' ? inset : 0} as any}>
    <View style={{position: 'absolute', left: 0, right: 0, top: 28 + OFF, height: 2, borderRadius: 1, backgroundColor: tint(c.accent, 0.45)}} />
    {/* 0.3.332: marcas de hora (maiores a cada 4 h) e o risco da troca de periodo (12:00 e 18:00) na propria linha */}
    {Array.from({length: Math.floor(SPAN) + 2}, (_, k) => Math.ceil(start) + k).map(h => {const x = (h - start) / SPAN; if (x <= 0 || x >= 1) return null; const hd = ((h % 24) + 24) % 24, div = hd === 6 || hd === 12 || hd === 18, major = hd % 4 === 3, ht = div ? 12 : major ? 14 : 8;
      return <View key={'t' + h} pointerEvents="none" style={{position: 'absolute', left: (x * 100 + '%') as any, top: 29 + OFF - ht / 2, width: div ? 1.5 : 1, height: ht, marginLeft: div ? -0.75 : -0.5, borderRadius: 1, backgroundColor: div ? 'rgba(255,255,255,0.2)' : major ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)'}} />;})}
    {SPAN <= 7 ? Array.from({length: Math.ceil(SPAN * 4) + 4}, (_, k) => Math.ceil(start * 4) / 4 + k / 4).map(h => {const x = (h - start) / SPAN; if (x <= 0 || x >= 1 || Math.abs(h - Math.round(h)) < 0.01) return null; return <View key={'q' + h} pointerEvents="none" style={{position: 'absolute', left: (x * 100 + '%') as any, top: 29 + OFF - 3, width: 1, height: 6, marginLeft: -0.5, backgroundColor: 'rgba(255,255,255,0.05)'}} />;}) : null}
    {/* 0.3.335 (Pedro: "a cor que divide manha, tarde e noite quase nao aparece"): faixa de fundo de cada periodo, visivel */}
    {[0, 24, 48].flatMap(d => [[0, 6, 'd'], [6, 12, 'm'], [12, 18, 't'], [18, 24, 'n']].map(([a, b, k]) => [d + (a as number), d + (b as number), k as string] as const)).map(([a, b, k]) => {const lo = Math.max(a, start), hi = Math.min(b, start + SPAN); if (hi <= lo) return null; const rgb = k === 'd' ? '170,140,255' : k === 'm' ? '255,196,120' : k === 't' ? '195,220,130' : '140,165,255'; /* 0.3.344 (Pedro): madrugada (00-06) e um periodo proprio */
      return <View key={'f' + a} pointerEvents="none" style={{position: 'absolute', left: `calc(${((lo - start) / SPAN) * 100}% + ${lo === a ? 1.5 : 0}px)` as any, width: `calc(${((hi - lo) / SPAN) * 100}% - ${(lo === a ? 1.5 : 0) + (hi === b ? 1.5 : 0)}px)` as any, top: -10, height: 29 + OFF + 10 + 22, borderTopLeftRadius: lo === a ? 10 : 0, borderTopRightRadius: hi === b ? 10 : 0, backgroundImage: `linear-gradient(180deg, ${SOFT_FADE.map(([pc, f]) => `rgba(${rgb},${(0.038 * f).toFixed(4)}) ${pc}%`).join(', ')})`} as any} />;})}
    {/* simbolos de manha, tarde e noite no meio de cada periodo visivel */}
    {[0, 24, 48].flatMap(d => [[0, 6, 'd'], [6, 12, 'm'], [12, 18, 't'], [18, 24, 'n']].map(([a, b, k]) => [d + (a as number), d + (b as number), k as string] as const)).map(([a, b, k]) => {const x = ((a + b) / 2 - start) / SPAN; if (x < 0.02 || x > 0.98) return null; return <View key={'p' + a} pointerEvents="none" style={{position: 'absolute', left: (x * 100 + '%') as any, top: 0, marginLeft: -8}}><PeriodIcon kind={k} /></View>;})} {/* 0.3.341 (Pedro): o simbolo anda junto com a linha (no meio real de cada periodo: 09:00, 15:00, 21:00) */}
    {[24, 48].map(m => {const x = (m - start) / SPAN; return x > 0 && x < 1 ? <View key={m} style={{position: 'absolute', left: (x * 100 + '%') as any, top: 20 + OFF, width: 1, height: 18, backgroundColor: c.line}} /> : null;})}
    {actions.onAddAt ? <Pressable testID="timeline-add-area" dataSet={{noveil: "1"}} accessibilityRole="button" accessibilityLabel="Adicionar algo na linha do tempo neste horário"
      onPress={(e: any) => {if (justDragged.current || dragRef.current) return; const fx = fxAt(Number(e?.nativeEvent?.pageX)); if (fx == null) return; const near = nearPoint(fx);
        if (near) {setGuide(null); setPin(k => k === near.key ? '' : near.key); return;} setPin(''); setHover(''); setGuide(null); setAdding({fx, at: snapDate(fx)});}}
      {...({onMouseMove: (e: any) => {if (dragRef.current || adding) return; const fx = fxAt(e.pageX); if (fx == null) return; const near = nearPoint(fx);
        if (near) {setGuide(null); if (hover !== near.key) {enter(near.key); dotNear.current = near.key;} setNearKey(near.key);} else {if (nearKey) setNearKey(''); setGuide(fx);}}, onMouseLeave: () => {setGuide(null);}} as any)}
      style={{position: 'absolute', left: 0, right: 0, top: OFF - 6, height: 70, cursor: nearKey ? 'pointer' : 'copy', outlineStyle: 'none'} as any} /> : null} {/* 0.3.341 (Pedro): 'embaixo a distancia e muito curta' - a area pega ate abaixo das horas */}
    {guide != null && !adding && !drag?.live ? <View pointerEvents="none" style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0}}>
      <View style={{position: 'absolute', left: `calc(${guide * 100}% - 0.5px)` as any, top: 29 + OFF - 10, width: 1, height: 20, backgroundColor: c.accent}} />
      <View style={{position: 'absolute', left: `clamp(0px, calc(${guide * 100}% - 34px), calc(100% - 68px))` as any, top: 29 + OFF + 12, width: 68, alignItems: 'center'}}>
        <Text style={{fontSize: 11, fontWeight: '700', color: c.onAccent, backgroundColor: c.accent, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 1, overflow: 'hidden', fontVariant: ['tabular-nums']}}>+ {hhmm(snapDate(guide))}</Text>
      </View>
    </View> : null}
    {/* 0.3.332 (aprovado por foto): compromisso com fim vira uma faixa do inicio ao fim; se encostar em outro, so se sobrepoe */}
    {items.map(r => {const end = (r.original as any)?.data?.end_at; if (r.isTask || !end) return null; const a = pos(new Date(r.date)), b = pos(new Date(end)); if (!(b > a) || b < 0 || a > 1) return null;
      const col = colorOf(r, c.accent), x0 = Math.max(0, a), x1 = Math.min(1, b);
      return <View key={'d' + r.id + r.date} pointerEvents="none" style={{position: 'absolute', left: (x0 * 100 + '%') as any, width: ((x1 - x0) * 100 + '%') as any, top: 29 + OFF - 6, height: 12, borderRadius: 6, backgroundColor: tint(col, 0.18), boxShadow: 'inset 0 0 0 1px ' + tint(col, 0.5), opacity: op.rec(r)} as any} />;})}
    {/* marcas e pontos (com a opacidade escolhida na engrenagem) */}
    <View pointerEvents="box-none" style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0}}>
      {all.map(p => {
        const m = p.marks[0], r = p.recs[0], open = () => {if (justDragged.current) return; setPin(k => k === p.key ? '' : p.key);}, hov = {onHoverIn: () => {if (!dragRef.current) enter(p.key);}, ref: (el: any) => {if (el) dotEls.current[p.key] = el;}};
        // 0.3.317: da para arrastar a bolinha de um item so (compromisso, lembrete, tarefa) e a dose da Rotina sozinha
        // 0.3.318 (Pedro): tudo o que esta na linha arrasta - bolinha de um item ou de varios (andam juntos), dose ou pilula
        // com varias doses, conta, receita, fatura e encomenda (essas so mudam de lugar aqui no Inicio)
        const tgt: DragItem[] | null = !actions.onMove ? null : m ? p.marks.map(x => ({t: (x.kind === 'routine' && x.dose ? {dose: x.dose} : {mark: x}) as MoveTarget, at: x.at})) : p.recs.map(x => ({t: {rec: x} as MoveTarget, at: new Date(x.date)}));
        const xo = settle[p.key] != null ? (settle[p.key] - start) / SPAN : p.x, ghost = drag?.key === p.key;
        const drg: any = tgt ? {onPressIn: (e: any) => beginDrag(e, p.key, tgt!, p.x, m ? markColor(m, c.danger) : r.kind === 'reminder' ? REMIND : colorOf(r, c.accent))} : {};
        const itemOp = m ? op.mark(m) : op.rec(r), extra: any = {opacity: ghost ? 0.3 * itemOp : itemOp, cursor: 'pointer', /* 0.3.343 (Pedro): passar o mouse mostra o que tem na bolinha (mãozinha de clicar, não a de pegar); arrastar continua funcionando e, ao arrastar, a prévia some */ ...(settle[p.key] != null ? {transitionProperty: 'left', transitionDuration: '260ms', transitionTimingFunction: 'cubic-bezier(.2,.8,.2,1)'} : {})};
        if (m) {
          const col = markColor(m, c.danger), diamond = m.kind === 'bill' || m.kind === 'income' || m.kind === 'invoice';
          const shape = diamond ? {width: 20, height: 20, marginLeft: -10, top: 29 + OFF - 10, borderRadius: 6, transform: [{rotate: '45deg'}]} : m.kind === 'package' ? {width: 22, height: 22, marginLeft: -11, top: 29 + OFF - 11, borderRadius: 6} : {width: 26, height: 16, marginLeft: -13, top: 29 + OFF - 8, borderRadius: 8};
          const glyph = m.kind === 'bill' ? '$' : m.kind === 'income' ? '+' : m.kind === 'invoice' ? '▭' : '';
          return <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={p.marks.map(x => x.title + ' · ' + x.sub).join(', ')} onPress={open} hitSlop={12} dataSet={{noveil: '1'}} {...hov} {...drg} style={({hovered}: any) => ({position: 'absolute', left: (xo * 100 + '%') as any, ...extra, ...shape, backgroundColor: m.done ? c.surface : col, borderWidth: m.done ? 2 : 3, borderColor: m.done ? col : c.surface, alignItems: 'center', justifyContent: 'center', boxShadow: (p.marks.length > 1 ? '3px -3px 0 -1px ' + tint(col, 0.55) + ', ' : '') + '0 0 0 4px ' + tint(col, hovered || pin === p.key ? 0.3 : 0.16), zIndex: 2} as any)}>
            {glyph ? <Text style={{transform: [{rotate: '-45deg'}], fontSize: 10, fontWeight: '700', color: '#17122A'}}>{glyph}</Text> : <Icon name={m.kind === 'package' ? 'box' : ((m.dose?.icon || ROUTINE_ICON[m.dose?.type || 'capsula'] || 'capsule') as IconName)} size={m.kind === 'package' ? 11 : 10} color={m.done ? col : '#17122A'} />}
          </Pressable>;
        }
        const isNext = !!next && p.recs.includes(next), many = p.recs.length > 1, past = !isNext && p.recs.every(x => new Date(x.date).getTime() < Date.now()); // 0.3.332: o que ja passou fica mais apagado
        if (!many && r.kind === 'reminder') return <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={'Lembrete ' + hhmm(new Date(r.date)) + ' ' + r.title} onPress={open} hitSlop={12} dataSet={{noveil: '1'}} {...hov} {...drg}
          style={({hovered}: any) => ({position: 'absolute', left: (xo * 100 + '%') as any, ...extra, top: 29 + OFF - 11, width: 22, height: 22, marginLeft: -11, borderRadius: 11, borderWidth: 2, borderColor: REMIND, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 4px ' + tint(REMIND, hovered || pin === p.key ? 0.3 : 0.16)} as any)}><Icon name="bell" size={11} color={REMIND} /></Pressable>;
        // 0.3.332 (aprovado por foto): bolinha solta menor; agrupada do mesmo tamanho de antes, com o miolo na cor do mais
        // urgente e um anel inteiro mostrando a mistura (um pedaco por item, na cor de cada um)
        if (many) {const cols = p.recs.map(x => colorOf(x, c.accent)), step = 360 / cols.length;
          const ring = 'conic-gradient(from -90deg, ' + cols.map((col, k) => col + ' ' + (k * step) + 'deg ' + ((k + 1) * step) + 'deg').join(', ') + ')';
          return <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={p.recs.map(x => hhmm(new Date(x.date)) + ' ' + x.title).join(', ')} onPress={open} hitSlop={14} dataSet={{noveil: '1'}} {...hov} {...drg}
            style={{position: 'absolute', left: (xo * 100 + '%') as any, ...extra, top: 29 + OFF - 11, width: 22, height: 22, marginLeft: -11, borderRadius: 11, backgroundImage: ring, boxShadow: '0 0 0 2px ' + c.surface, alignItems: 'center', justifyContent: 'center', outlineStyle: 'none'} as any}>
            <View style={{width: 15, height: 15, borderRadius: 8, backgroundColor: cols[0], borderWidth: 1.5, borderColor: c.surface, alignItems: 'center', justifyContent: 'center'}}><Text style={{fontSize: 10, fontWeight: '700', color: urgOf(r) ? '#fff' : c.onAccent, fontVariant: ['tabular-nums']}}>{p.recs.length}</Text></View>
          </Pressable>;}
        const size = isNext ? 11 : 9;
        return <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={p.recs.map(x => hhmm(new Date(x.date)) + ' ' + x.title).join(', ')} onPress={open} hitSlop={14} dataSet={{noveil: '1'}} {...hov} {...drg}
          style={{position: 'absolute', left: (xo * 100 + '%') as any, ...extra, top: 29 + OFF - size / 2, width: size, height: size, marginLeft: -size / 2, borderRadius: size / 2, backgroundColor: colorOf(r, c.accent), boxShadow: '0 0 0 2.5px ' + c.surface, outlineStyle: 'none'} as any} />;
      })}
      {all.map(p => place[p.key] == null ? null : (() => {const t = tagOf(p), lx = settle[p.key] != null ? (settle[p.key] - start) / SPAN : p.x, lw = t.sub ? LW + 70 : LW; return <View key={'l' + p.key} pointerEvents="none" style={{position: 'absolute', left: `clamp(0px, calc(${lx * 100}% - ${lw / 2}px), calc(100% - ${lw}px))` as any, top: place[p.key] === 0 ? OFF - 2 : OFF - 26, width: lw, alignItems: 'center', opacity: drag?.key === p.key ? 0 : p.marks[0] ? op.mark(p.marks[0]) : op.rec(p.recs[0]), ...(settle[p.key] != null ? {transitionProperty: 'left', transitionDuration: '260ms', transitionTimingFunction: 'cubic-bezier(.2,.8,.2,1)'} : {})} as any}>
        <View style={{flexDirection: 'row', maxWidth: '100%', alignItems: 'center', backgroundColor: t.bg || (p.marks[0] ? tint(t.color, 0.14) : 'transparent'), borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2} as any}>{t.imp ? <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: IMPORTANT_RED, marginRight: 5}} /> : null}<Text numberOfLines={1} style={{flexShrink: 1, fontSize: 12, color: t.color, fontWeight: t.strong ? '600' : '400', overflow: 'hidden', fontVariant: ['tabular-nums']}}>{t.text}</Text>{t.more ? <Text numberOfLines={1} style={{flexShrink: 0, fontSize: 12, fontWeight: '700', color: t.imp ? IMPORTANT_RED : t.color, fontVariant: ['tabular-nums']}}> +{t.more}</Text> : null}{t.sub ? <Text numberOfLines={1} style={{flexShrink: 0, fontSize: 11, color: c.muted, marginLeft: 5, fontVariant: ['tabular-nums'], whiteSpace: 'nowrap'} as any}>{t.sub}</Text> : null}</View>
      </View>;})())}
    </View>
    {/* 0.3.314 (Pedro): o "agora" em destaque - um farol que pulsa na linha, com o horario numa etiqueta; o trecho que ja
        passou fica preenchido. Se a pessoa rolar para longe, aparece um botao para voltar para agora. */}
    {nowX >= 0 && nowX <= 1 ? <NowBeacon x={nowX} top={29 + OFF} /> : null}
    {/* 0.3.317 (Pedro): o botao "agora" volta para a posicao de inicio do dia (07:00), deslizando; fica no cabecalho do
        cartao, ao lado da engrenagem, para nao cobrir as marcas da ponta da linha */}
    {/* escala: horas cheias de 4 em 4 (07, 11, 15, 19, 23...), andando junto quando a linha desliza */}
    {(SPAN <= 7 ? Array.from({length: Math.ceil(SPAN) + 2}, (_, k) => Math.ceil(start) + k) : Array.from({length: Math.ceil(SPAN / 3) + 2}, (_, k) => Math.ceil(start / 3) * 3 + k * 3)).map(h => {const x = (h - start) / SPAN; if (x < -0.001 || x > 1.001 || (nowX >= 0 && nowX <= 1 && wS && Math.abs(x - nowX) * wS < 60)) return null;
      if (side && wS && (side === 'left' ? x * wS < 86 : (1 - x) * wS < 86)) return null; // a hora que ficaria embaixo do botao "agora" some
      const end = x > 0.96, beg = x < 0.04; return <Text key={h} style={{position: 'absolute', top: 42 + OFF, left: (x * 100 + '%') as any, transform: [{translateX: beg ? 0 : end ? -96 : -48}], width: 96, textAlign: beg ? 'left' : end ? 'right' : 'center', fontSize: 11, color: c.muted, fontVariant: ['tabular-nums']}}>{label(h)}</Text>;})}
    {/* 0.3.317: o que esta sendo arrastado - bolinha e horario seguindo o mouse */}
    {drag?.live ? <View pointerEvents="none" style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 6}}>
      <View style={{position: 'absolute', left: `calc(${drag.fx * 100}% - ${dpx(9)})` as any, top: 29 + OFF - 9, width: 18, height: 18, borderRadius: 9, backgroundColor: drag.color, borderWidth: 3, borderColor: c.surface, boxShadow: '0 0 0 4px ' + tint(drag.color, 0.28) + ', 0 6px 16px rgba(0,0,0,0.45)'} as any} />
      {drag.snap ? <View style={{position: 'absolute', left: `calc(${drag.fx * 100}% - 0.5px)` as any, top: 0, height: 29 + OFF + 12, width: 1, backgroundImage: 'repeating-linear-gradient(180deg, ' + tint(c.accent, 0.7) + ' 0 4px, transparent 4px 8px)'} as any} /> : null}
      <View style={{position: 'absolute', left: `clamp(0px, calc(${drag.fx * 100}% - ${drag.snap ? 160 : 55}px), calc(100% - ${drag.snap ? 320 : 110}px))` as any, top: OFF - 4, width: drag.snap ? 320 : 110, alignItems: 'center'}}>
        <Text numberOfLines={1} style={{fontSize: 12, fontWeight: '700', color: c.onAccent, backgroundColor: drag.color, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden', fontVariant: ['tabular-nums'], whiteSpace: 'nowrap'} as any}>{dragLabel(drag.fx)}{drag.snap ? ' · ' + drag.snap : ''}</Text>
      </View>
    </View> : null}
    {adding ? <View pointerEvents="none" style={{position: 'absolute', left: `calc(${adding.fx * 100}% - 7px)` as any, top: 29 + OFF - 7, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderStyle: 'dashed', borderColor: c.accent, backgroundColor: c.surface, zIndex: 7}} /> : null}
    {adding && actions.sofia ? <SofiaAdd lineW={wS || w} fx={adding.fx} at={adding.at} sofia={actions.sofia} onMore={k => {const at = adding.at; setAdding(null); actions.onAddAt?.(k, at);}} onSaved={(text, undo) => {setAdding(null); showToast(text, undo);}} onClose={() => setAdding(null)} />
     : adding && actions.onAddAt ? <AddMenu fx={adding.fx} when={dragLabel(adding.fx)} onPick={k => {const at = adding.at; setAdding(null); actions.onAddAt!(k, at);}} onClose={() => setAdding(null)} /> : null}
    {toast ? <View testID="timeline-toast" style={{position: 'absolute', left: '50%' as any, top: 29 + OFF + 34, zIndex: 13, transform: [{translateX: '-50%' as any}], flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12, backgroundColor: c.bg, boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 14px 32px rgba(0,0,0,0.45)'} as any}>
      <Icon name="checkCircle" size={15} color="#5FD3A2" /><Text style={{fontSize: 13, color: c.text}}>{toast.text}</Text>
      {toast.undo ? <Pressable accessibilityRole="button" onPress={() => {const u = toast.undo; setToast(null); void u?.();}}><Text style={{fontSize: 13, fontWeight: '600', color: c.accent}}>Desfazer</Text></Pressable> : null}
    </View> : null}
    {shown && !drag?.live && !adding ? <PreviewCard point={shown} width={wS || w} pinned={pin === shown.key} actions={actions} desc={desc} onEnter={() => enter(shown.key)} onLeave={leave} onClose={() => {setPin(''); setHover('');}} onGrab={actions.onMove ? (e, t, color) => beginDrag(e, 'g' + shown.key + ('rec' in t ? t.rec.id + t.rec.date : 'dose' in t ? t.dose.planId + t.dose.time : t.mark.id), [{t, at: 'rec' in t ? new Date(t.rec.date) : 'dose' in t ? (shown.marks.find(x => x.dose === t.dose)?.at || new Date()) : t.mark.at}], shown.x, color) : undefined} /> : null}
   </View>
    {side ? <Pressable testID="timeline-today" accessibilityRole="button" accessibilityLabel="Voltar para o início do dia" onPress={() => goDay(0)}
      style={({hovered}: any) => ({position: 'absolute', top: 42 + OFF + 7 - 12, [side]: 0, /* 0.3.348 (Pedro): o "agora" fica na linha das horas, alinhado no meio dela */ opacity: ease, pointerEvents: ease > 0.5 ? 'auto' : 'none', height: 24, paddingHorizontal: 11, borderRadius: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: hovered ? c.danger : tint('#F5A0AE', 0.18), zIndex: 3} as any)}>
      {({hovered}: any) => <Text style={{fontSize: 11, fontWeight: '700', color: hovered ? '#fff' : c.danger}}>{side === 'left' ? '‹ agora' : 'agora ›'}</Text>}
    </Pressable> : null}
  </View>;
}

/** 0.3.333 (aprovado por foto): ao clicar num lugar vazio da linha a Sofia te recebe ali mesmo - "Oi, Pedro. O que fica
 * para as 21:30?" - com o campo (escrever, foto ou falar). A seta discreta abre os seis tipos (Compromisso, Tarefa,
 * Lembrete, Rotina, Despesa, Receita); cada um abre o mini editor no mesmo cartao. Despesa e Receita vao pela Sofia (ela ja
 * cria o lancamento em Financas com conta e categoria). Esc ou clique fora fecham. */
type ChatMsg = {who: 'me' | 'sofia'; text: string; img?: string};
const TYPE_INFO: {id: AddKind | 'expense' | 'income'; label: string; color: string; icon: IconName; title: string}[] = [
  {id: 'event', label: 'Compromisso', color: '#8fb4ff', icon: 'calendar', title: 'Novo compromisso'}, {id: 'task', label: 'Tarefa', color: '#F5A0AE', icon: 'checklist', title: 'Nova tarefa'},
  {id: 'reminder', label: 'Lembrete', color: '#7FD1E8', icon: 'bell', title: 'Novo lembrete'}, {id: 'routine', label: 'Rotina', color: '#5FD3C6', icon: 'capsule', title: 'Novo na Rotina'},
  {id: 'expense', label: 'Despesa', color: '#F08A8A', icon: 'trendDown', title: 'Nova despesa'}, {id: 'income', label: 'Receita', color: '#5FD3A2', icon: 'trendUp', title: 'Nova receita'}];
function SofiaAdd({lineW, fx, at, sofia, onMore, onSaved, onClose}: {lineW: number; fx: number; at: Date; sofia: SofiaBridge; onMore: (k: AddKind) => void; onSaved: (text: string, undo?: (() => Promise<void>) | void) => void; onClose: () => void}) {
  const c = useTheme(), box = useRef<View>(null), [open, setOpen] = useState(false), [kind, setKind] = useState<(typeof TYPE_INFO)[number]['id'] | null>(null);
  const [text, setText] = useState(''), [file, setFile] = useState<any>(null), [preview, setPreview] = useState(''), [msgs, setMsgs] = useState<ChatMsg[]>([]), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [listening, setListening] = useState(false);
  const [when, setWhen] = useState(at), fileIn = useRef<any>(null), rec = useRef<any>(null), scroller = useRef<any>(null);
  useClickOutside(box, onClose);
  useEffect(() => {if (typeof window === 'undefined') return; const k = (e: KeyboardEvent) => {if (e.key === 'Escape') {e.stopPropagation(); if (kind) setKind(null); else onClose();}}; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true);}, [kind]);
  useEffect(() => () => {if (preview) URL.revokeObjectURL(preview); try {rec.current?.stop();} catch {/* sem microfone */}}, []);
  useEffect(() => {setTimeout(() => {const el = scroller.current as any; if (el?.scrollTo) el.scrollTo({y: 99999, animated: true});}, 30);}, [msgs.length, busy]);
  const hm = hhmm(when), dayTxt = (() => {const d = new Date(when), n = new Date(); return d.toDateString() === n.toDateString() ? 'hoje' : d.toLocaleDateString('pt-BR', {weekday: 'short', day: 'numeric', month: 'numeric'});})();
  const pickFile = () => {if (typeof document === 'undefined') return; if (!fileIn.current) {const el = document.createElement('input'); el.type = 'file'; el.accept = 'image/*,application/pdf'; el.onchange = () => {const f = el.files?.[0]; if (f) {setFile(f); setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : '');} el.value = '';}; fileIn.current = el;} fileIn.current.click();};
  const SR: any = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
  const mic = () => {if (!SR) return; if (listening) {try {rec.current?.stop();} catch {/* ja parou */} return;} const r = new SR(); r.lang = 'pt-BR'; r.interimResults = true; r.continuous = false; const base = text ? text + ' ' : '';
    r.onresult = (e: any) => {let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setText(base + t);}; r.onend = () => setListening(false); r.onerror = () => setListening(false); rec.current = r; setListening(true); try {r.start();} catch {setListening(false);}};
  const send = async (custom?: string, label?: string) => {const t = (custom ?? text).trim(); if (busy || (!t && !file)) return; const shown = label || t || (file ? 'Foto enviada' : ''), img = preview;
    setMsgs(m => [...m, {who: 'me', text: shown, img}]); setText(''); setBusy(true); setErr(''); const f = file; setFile(null); setPreview('');
    try {const reply = await sofia.ask((t || 'Veja este arquivo.') + '\n\n(Pedido pela linha do tempo do Início, para ' + dayTxt + ' às ' + hm + '.)', f); setMsgs(m => [...m, {who: 'sofia', text: reply || 'Pronto.'}]);}
    catch (e: any) {setErr(String(e?.message || 'Não deu para falar com a Sofia agora.')); setMsgs(m => m.slice(0, -1)); if (!custom) setText(t); if (f) {setFile(f); setPreview(img);}}
    finally {setBusy(false);}};
  const W = 400, lw = lineW || 1, /* 0.3.347 (Pedro): janela bem menor */ left = Math.max(0, Math.min(lw - W, fx * lw - W / 2)), caret = Math.max(18, Math.min(W - 18, fx * lw - left));
  const shell = (inner: React.ReactNode, strip?: string) => <View ref={box} testID="sofia-add" style={{position: 'absolute', left, top: 29 + 44 + 22, width: W, zIndex: 12} as any}>
    <View style={{position: 'absolute', left: caret - 7, top: -7, width: 14, height: 14, backgroundColor: c.bg, transform: [{rotate: '45deg'}], borderRadius: 3, boxShadow: '-1px -1px 0 rgba(255,255,255,0.06)'} as any} />
    {/* 0.3.351 (Pedro: "alinhamento ta errado"): sem a faixa de cor no topo (com o canto arredondado ela ficava estreita, como
     uma aba fora do lugar) e com overflow clip - o hidden deixava o navegador rolar o cartao para o lado ao focar o campo,
     e o conteudo colava na borda esquerda. A cor do tipo fica no icone e no botao. */}
    <View style={{backgroundColor: c.bg, borderRadius: 22, overflow: 'clip', boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 24px 60px rgba(0,0,0,0.55)'} as any}>{inner}</View>
  </View>;
  const avatar = (s = 36) => <View style={{width: s, height: s, borderRadius: s / 2, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 1px ' + tint(c.accent, 0.4)} as any}><Text style={{color: c.onAccent, fontWeight: '700', fontSize: s >= 30 ? 14 : 11}}>S</Text><View style={{position: 'absolute', right: 0, bottom: 0, width: 9, height: 9, borderRadius: 5, backgroundColor: '#5FD3A2', boxShadow: '0 0 0 2px ' + c.bg} as any} /></View>;
  if (kind) return <MiniEditor kind={kind} at={when} setAt={setWhen} sofia={sofia} shell={shell} onBack={() => setKind(null)} onMore={k => onMore(k)} onSaved={onSaved} onAsk={async (q, label) => {setKind(null); setOpen(false); await send(q, label);}} />;
  const roundBtn = (icon: IconName, label: string, run: () => void, filled = false, red = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={run} style={({hovered, pressed}: any) => ({width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: red ? '#F57A8C' : filled ? c.accent : hovered ? c.input : 'transparent', transform: [{scale: pressed ? 0.95 : 1}]})}><Icon name={icon} size={15} color={filled || red ? c.onAccent : c.muted} /></Pressable>;
  return shell(<View style={{padding: 12}}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
      {avatar(28)}
      <View style={{flex: 1, minWidth: 0}}><Text style={[DISPLAY_ITALIC, {fontSize: 16, color: c.text}]}>Oi, {sofia.first}.</Text>
        <Text style={{fontSize: 12, color: c.text, marginTop: 0}}>O que fica para as <Text style={{color: c.accent, fontWeight: '700', fontVariant: ['tabular-nums']}}>{hm}</Text>{dayTxt === 'hoje' ? '' : ' de ' + dayTxt}?</Text></View>
      <Pressable testID="sofia-add-more" accessibilityRole="button" accessibilityLabel={open ? 'Fechar os tipos' : 'Escolher e preencher eu mesmo'} onPress={() => setOpen(v => !v)} style={({hovered}: any) => ({width: 30, height: 30, marginRight: 4, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent', transform: [{rotate: open ? '-90deg' : '90deg'}], transitionProperty: 'transform', transitionDuration: '200ms'} as any)}><Icon name="chevron" size={16} color={c.muted} /></Pressable>
    </View>
    {/* 0.3.351 (Pedro: ferramentas grandes e fora de alinhamento): menores, a primeira alinhada com a foto da Sofia e a
        ultima com o botao do microfone (as colunas iguais deixavam sobra nas pontas) */}
    {open ? <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 8}}>
      {TYPE_INFO.map((t, i) => <Pressable key={t.id} testID={'sofia-type-' + t.id} accessibilityRole="button" accessibilityLabel={t.title} onPress={() => setKind(t.id)} style={({hovered}: any) => ({alignItems: 'center', gap: 3, paddingTop: 5, paddingBottom: 4, paddingHorizontal: 5, marginLeft: i === 0 ? -5 : 0, marginRight: i === TYPE_INFO.length - 1 ? -5 : 0, borderRadius: 8, backgroundColor: hovered ? 'rgba(255,255,255,0.05)' : 'transparent', outlineStyle: 'none'} as any)}>
        <Icon name={t.icon} size={14} color={t.color} /><Text style={{fontSize: 10, color: c.muted}}>{t.label}</Text></Pressable>)}
    </View> : null}
    {msgs.length || busy ? <ScrollView ref={scroller} keyboardShouldPersistTaps="handled" style={{maxHeight: 300, marginTop: 14}} contentContainerStyle={{gap: 10}}>
      {msgs.map((m, i) => m.who === 'me' ? <View key={i} style={{alignSelf: 'flex-end', maxWidth: '80%' as any, backgroundColor: c.bubble, borderRadius: 18, borderBottomRightRadius: 6, padding: m.img ? 8 : 0, gap: 6, overflow: 'hidden'}}>
          {m.img ? <Image source={{uri: m.img}} style={{width: 150, height: 100, borderRadius: 12}} resizeMode="cover" /> : null}<Text style={{fontSize: 13, color: c.text, paddingHorizontal: m.img ? 4 : 12, paddingVertical: m.img ? 0 : 8}}>{m.text}</Text></View>
        : <Text key={i} style={{fontSize: 14, lineHeight: 21, color: c.text, paddingHorizontal: 4}}>{m.text}</Text>)}
      {busy ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4}}><View style={{flexDirection: 'row', gap: 4}}>{[1, 0.6, 0.3].map((o, i) => <View key={i} style={{width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent, opacity: o}} />)}</View><Text style={{fontSize: 13, color: c.muted, fontStyle: 'italic'}}>{msgs[msgs.length - 1]?.img ? 'lendo a foto…' : 'pensando…'}</Text></View> : null}
    </ScrollView> : null}
    {err ? <Text style={{fontSize: 12, color: c.danger, marginTop: 10}}>{err}</Text> : null}
    {preview || file ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12}}>{preview ? <Image source={{uri: preview}} style={{width: 40, height: 40, borderRadius: 8}} /> : <Icon name="clip" size={16} color={c.muted} />}<Text numberOfLines={1} style={{flex: 1, fontSize: 12, color: c.muted}}>{file?.name || 'Foto'}</Text><Pressable accessibilityLabel="Tirar a foto" onPress={() => {setFile(null); setPreview('');}}><Icon name="close" size={14} color={c.muted} /></Pressable></View> : null}
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, marginTop: 10, paddingLeft: 12, paddingRight: 4, borderRadius: 19, backgroundColor: c.input, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)'} as any}>
      <TextInput testID="sofia-add-input" autoFocus value={text} onChangeText={setText} onSubmitEditing={() => void send()} placeholder={msgs.length ? 'Mais alguma coisa?' : listening ? 'Ouvindo…' : 'Escreva, fale ou mande uma foto…'} placeholderTextColor={c.muted} editable={!busy}
        style={{flex: 1, fontSize: 13, color: c.text, outlineStyle: 'none', height: 36} as any} />
      {roundBtn('camera', 'Mandar uma foto', pickFile)}
      {text.trim() || file ? roundBtn('send', 'Enviar', () => void send(), true) : SR ? roundBtn('mic', listening ? 'Parar de ouvir' : 'Falar', mic, true, listening) : roundBtn('send', 'Enviar', () => void send(), true)}
    </View>
  </View>);
}
/** Mini editor de cada tipo, no mesmo cartao (faixa da cor, nome grande, horario com ‹ ›, campos do tipo, "Mais opcoes ↗"
 * para o editor completo e "Adicionar ↵"). Despesa e Receita sao pedidas a Sofia, que cria o lancamento com conta e categoria. */
function MiniEditor({kind, at, setAt, sofia, shell, onBack, onMore, onSaved, onAsk}: {kind: (typeof TYPE_INFO)[number]['id']; at: Date; setAt: (d: Date) => void; sofia: SofiaBridge; shell: (inner: React.ReactNode, strip?: string) => React.ReactNode; onBack: () => void; onMore: (k: AddKind) => void; onSaved: (text: string, undo?: (() => Promise<void>) | void) => void; onAsk: (q: string, label?: string) => Promise<void>}) {
  const c = useTheme(), info = TYPE_INFO.find(t => t.id === kind)!, money = kind === 'expense' || kind === 'income';
  const [title, setTitle] = useState(''), [minutes, setMinutes] = useState(60), [notify, setNotify] = useState(true), [google, setGoogle] = useState(true), [priority, setPriority] = useState('none');
  const [repeat, setRepeat] = useState('none'), [message, setMessage] = useState(''), [rtype, setRtype] = useState('capsula'), [dose, setDose] = useState(''), [daily, setDaily] = useState(true);
  const [amount, setAmount] = useState(''), [cat, setCat] = useState(kind === 'income' ? 'Trabalho' : 'Alimentação'), [paid, setPaid] = useState(true), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const chip = (on: boolean, label: string, press: () => void, col = info.color) => <Pressable key={label} accessibilityRole="button" accessibilityState={{selected: on}} onPress={press} style={({hovered}: any) => ({height: 28, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center', backgroundColor: on ? tint(col, 0.2) : hovered ? c.input : 'transparent', boxShadow: 'inset 0 0 0 1px ' + (on ? tint(col, 0.55) : c.line)} as any)}><Text style={{fontSize: 12, fontWeight: on ? '600' : '400', color: on ? col : c.text}}>{label}</Text></Pressable>;
  const toggle = (on: boolean, label: string, press: () => void) => <Pressable accessibilityRole="switch" accessibilityState={{checked: on}} onPress={press} style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><View style={{width: 34, height: 20, borderRadius: 10, backgroundColor: on ? c.accent : c.line, justifyContent: 'center', paddingHorizontal: 3}}><View style={{width: 14, height: 14, borderRadius: 7, backgroundColor: on ? c.onAccent : c.muted, alignSelf: on ? 'flex-end' : 'flex-start'}} /></View><Text style={{fontSize: 12, color: c.text}}>{label}</Text></Pressable>;
  const lbl = (t: string) => <Text style={{fontSize: 10, letterSpacing: 1, color: c.muted, fontWeight: '600', marginBottom: 6}}>{t}</Text>;
  const shift = (m: number) => setAt(new Date(at.getTime() + m * 60000));
  const dayTxt = (() => {const n = new Date(); return at.toDateString() === n.toDateString() ? 'Hoje' : at.toLocaleDateString('pt-BR', {weekday: 'short', day: 'numeric', month: 'numeric'});})();
  const timePill = <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10, borderRadius: 9, backgroundColor: c.input}}><Icon name="calendar" size={13} color={c.muted} /><Text style={{fontSize: 12, color: c.text}}>{dayTxt}</Text></View>
    <View style={{flexDirection: 'row', alignItems: 'center', height: 30, borderRadius: 9, backgroundColor: c.input}}>
      <Pressable accessibilityLabel="15 minutos antes" onPress={() => shift(-15)} style={{paddingHorizontal: 8, height: 30, justifyContent: 'center'}}><Text style={{color: c.muted}}>‹</Text></Pressable>
      <Text style={{fontSize: 12, fontWeight: '600', color: info.color, fontVariant: ['tabular-nums']}}>{hhmm(at)}{kind === 'event' ? ' → ' + hhmm(new Date(at.getTime() + minutes * 60000)) : ''}</Text>
      <Pressable accessibilityLabel="15 minutos depois" onPress={() => shift(15)} style={{paddingHorizontal: 8, height: 30, justifyContent: 'center'}}><Text style={{color: c.muted}}>›</Text></Pressable></View>
  </View>;
  const save = async () => {if (busy) return; setErr('');
    if (money) {const v = Number(String(amount).replace(/\./g, '').replace(',', '.')); if (!(v > 0)) {setErr('Digite o valor.'); return;}
      const brl = v.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
      setBusy(true); try {await onAsk('Registre uma ' + (kind === 'expense' ? 'despesa' : 'receita') + ' de ' + brl + (title.trim() ? ' — ' + title.trim() : '') + ', categoria ' + cat + ', ' + (paid ? (kind === 'expense' ? 'já paga' : 'já recebida') : (kind === 'expense' ? 'a pagar' : 'a receber')) + ', em ' + at.toLocaleDateString('pt-BR') + ' às ' + hhmm(at) + '.', (kind === 'expense' ? 'Despesa' : 'Receita') + ': ' + brl + (title.trim() ? ' — ' + title.trim() : '') + ' · ' + cat);} finally {setBusy(false);} return;}
    if (!title.trim()) {setErr('Dê um nome.'); return;}
    setBusy(true);
    try {const undo = await sofia.save({kind: kind as AddKind, title: title.trim(), at, minutes, notify, google, priority, repeat, message, rtype, dose, daily});
      onSaved(title.trim() + ' adicionado' + (kind === 'task' ? 'a' : '') + ' às ' + hhmm(at), undo);}
    catch (e: any) {setErr(String(e?.message || 'Não deu para adicionar.') + ' Tente de novo.');} finally {setBusy(false);}};
  return <>{shell(<View>
    <View style={{padding: 16, gap: 12}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <View style={{width: 30, height: 30, borderRadius: 9, backgroundColor: tint(info.color, 0.14), alignItems: 'center', justifyContent: 'center'}}><Icon name={info.icon} size={15} color={info.color} /></View>
        <Text style={{flex: 1, fontSize: 13, color: c.muted}}>{info.title}</Text>
        <Pressable accessibilityLabel="Voltar" onPress={onBack} style={({hovered}: any) => ({width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Icon name="close" size={14} color={c.muted} /></Pressable>
      </View>
      {money ? <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 6}}><Text style={{fontSize: 20, fontWeight: '600', color: c.muted}}>R$</Text><TextInput testID="mini-amount" autoFocus value={amount} onChangeText={v => setAmount(v.replace(/[^0-9.,]/g, ''))} onSubmitEditing={() => void save()} placeholder="0,00" placeholderTextColor={c.muted} keyboardType="decimal-pad" style={{flex: 1, fontSize: 28, fontWeight: '700', color: c.text, outlineStyle: 'none', fontVariant: ['tabular-nums']} as any} /></View> : null}
      <TextInput testID="mini-title" autoFocus={!money} value={title} onChangeText={setTitle} onSubmitEditing={() => void save()} placeholder={money ? 'Descrição (opcional)' : kind === 'event' ? 'Ex.: Reunião com a Minerva' : kind === 'task' ? 'Ex.: Emitir nota' : kind === 'reminder' ? 'Ex.: Ligar para o contador' : 'Ex.: Magnésio'} placeholderTextColor={c.muted}
        style={{fontSize: money ? 14 : 18, fontWeight: money ? '400' : '600', color: c.text, outlineStyle: 'none'} as any} />
      {timePill}
      {kind === 'event' ? <><View style={{flexDirection: 'row', gap: 6}}>{[30, 60, 120].map(m => chip(minutes === m, m < 60 ? m + ' min' : m / 60 + ' h', () => setMinutes(m)))}</View>
        <View style={{flexDirection: 'row', gap: 18}}>{toggle(notify, 'Avisar 10 min antes', () => setNotify(v => !v))}{toggle(google, 'Google Agenda', () => setGoogle(v => !v))}</View></> : null}
      {kind === 'task' ? <><View>{lbl('PRIORIDADE')}<View style={{flexDirection: 'row', gap: 6}}>{[['important', 'Importante', IMPORTANT_RED], ['medium', 'Média', '#B77713'], ['light', 'Leve', '#378E78'], ['none', 'Nenhuma', c.accent]].map(([v, l, col]) => chip(priority === v, l, () => setPriority(v), col))}</View></View>
        {toggle(notify, 'Avisar no horário', () => setNotify(v => !v))}</> : null}
      {kind === 'reminder' ? <><View>{lbl('REPETIR')}<View style={{flexDirection: 'row', gap: 6}}>{[['none', 'Não'], ['weekly', 'Toda semana'], ['monthly', 'Todo mês'], ['yearly', 'Todo ano']].map(([v, l]) => chip(repeat === v, l, () => setRepeat(v)))}</View></View>
        <TextInput value={message} onChangeText={setMessage} placeholder="Mensagem (opcional)" placeholderTextColor={c.muted} style={{height: 38, borderRadius: 10, paddingHorizontal: 12, backgroundColor: c.input, color: c.text, fontSize: 13, outlineStyle: 'none'} as any} /></> : null}
      {kind === 'routine' ? <><View>{lbl('TIPO')}<View style={{flexDirection: 'row', gap: 6, flexWrap: 'wrap'}}>{ROTINA_TYPES.map(t => chip(rtype === t.id, t.one, () => setRtype(t.id), t.color))}</View></View>
        <TextInput value={dose} onChangeText={setDose} placeholder="Dose (opcional) — ex.: 1 cápsula" placeholderTextColor={c.muted} style={{height: 36, borderRadius: 10, paddingHorizontal: 12, backgroundColor: c.input, color: c.text, fontSize: 13, outlineStyle: 'none'} as any} />
        <View>{lbl('REPETIR')}<View style={{flexDirection: 'row', gap: 6}}>{chip(!daily, 'Só hoje', () => setDaily(false))}{chip(daily, 'Todo dia', () => setDaily(true))}</View></View>
        {toggle(notify, 'Avisar no horário', () => setNotify(v => !v))}</> : null}
      {money ? <><View>{lbl('CATEGORIA')}<View style={{flexDirection: 'row', gap: 6, flexWrap: 'wrap'}}>{(kind === 'income' ? ['Trabalho', 'Freela', 'Reembolso', 'Outros'] : ['Alimentação', 'Mercado', 'Saúde', 'Transporte', 'Casa', 'Outros']).map(x => chip(cat === x, x, () => setCat(x)))}</View></View>
        <View style={{flexDirection: 'row', gap: 6}}>{chip(paid, kind === 'income' ? 'Já recebida' : 'Já paga', () => setPaid(true), '#5FD3A2')}{chip(!paid, kind === 'income' ? 'A receber' : 'A pagar', () => setPaid(false))}</View></> : null}
      {err ? <Text style={{fontSize: 12, color: c.danger}}>{err}</Text> : null}
    </View>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderColor: c.line}}>
      {money ? <Text style={{fontSize: 11, color: c.muted}}>A Sofia registra em Finanças</Text> : <Pressable accessibilityRole="link" onPress={() => onMore(kind as AddKind)}><Text style={{fontSize: 12, color: c.muted}}>Mais opções ↗</Text></Pressable>}
      <View style={{flex: 1}} /><Text style={{fontSize: 12, color: c.muted}}>Esc</Text>
      <Pressable testID="mini-save" accessibilityRole="button" disabled={busy} onPress={() => void save()} style={({hovered, pressed}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 8, height: 34, paddingHorizontal: 15, borderRadius: 10, backgroundColor: info.color, opacity: busy ? 0.6 : hovered ? 0.92 : 1, transform: [{scale: pressed ? 0.97 : 1}]})}><Text style={{fontSize: 13, fontWeight: '600', color: '#17122A'}}>{busy ? 'Adicionando…' : 'Adicionar'}</Text><Text style={{fontSize: 10, color: '#17122A', opacity: 0.6}}>↵</Text></Pressable>
    </View>
  </View>, info.color)}</>;
}

/** 0.3.331 (Pedro): seletor pequeno que abre ao clicar num lugar vazio da linha do tempo. A escolha abre o editor completo
 * da funcao ja com o horario do clique (nada e gravado aqui). Esc ou clique fora fecham. */
/** Fecha ao clicar em qualquer lugar fora do elemento (inclusive na barra lateral, fora da area que rola). */
function useClickOutside(ref: React.RefObject<View | null>, onOut: () => void, on = true, ignore = '') {
  const cb = useRef(onOut); cb.current = onOut;
  useEffect(() => {if (!on || typeof document === 'undefined') return; const h = (e: PointerEvent) => {const el: any = ref.current, t: any = e.target; if (ignore && t?.closest?.(ignore)) return; if (el && el.contains && !el.contains(t)) cb.current();};
    const t = setTimeout(() => document.addEventListener('pointerdown', h, true), 0); return () => {clearTimeout(t); document.removeEventListener('pointerdown', h, true);};}, [on]);
}
function AddMenu({fx, when, onPick, onClose}: {fx: number; when: string; onPick: (k: AddKind) => void; onClose: () => void}) {
  const c = useTheme(), box = useRef<View>(null);
  useClickOutside(box, onClose);
  useEffect(() => {if (typeof window === 'undefined') return; const k = (e: KeyboardEvent) => {if (e.key === 'Escape') {e.stopPropagation(); onClose();}}; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true);}, []);
  const ITEMS: {id: AddKind; label: string; icon: IconName; color: string}[] = [{id: 'event', label: 'Compromisso', icon: 'calendar', color: '#8fb4ff'}, {id: 'task', label: 'Tarefa', icon: 'checklist', color: '#F5A0AE'}, {id: 'reminder', label: 'Lembrete', icon: 'bell', color: REMIND}, {id: 'routine', label: 'Rotina', icon: 'capsule', color: '#5FD3C6'}];
  return <>
    <View ref={box} testID="add-menu" accessibilityRole="menu" style={{position: 'absolute', left: `clamp(0px, calc(${fx * 100}% - 110px), calc(100% - 220px))` as any, top: 29 + 44 + 14, width: 220, zIndex: 12, backgroundColor: c.bg, borderRadius: 14, paddingVertical: 6, boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 16px 40px rgba(0,0,0,0.5)'} as any}>
      <Text style={{fontSize: 11, color: c.muted, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 6}}>Adicionar · <Text style={{color: c.accent, fontWeight: '600', fontVariant: ['tabular-nums']}}>{when}</Text></Text>
      {ITEMS.map(it => <Pressable key={it.id} testID={'add-' + it.id} accessibilityRole="menuitem" onPress={() => onPick(it.id)} style={({hovered, pressed}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 10, height: 36, marginHorizontal: 6, paddingHorizontal: 8, borderRadius: 9, backgroundColor: hovered || pressed ? c.input : 'transparent'})}>
        <View style={{width: 24, height: 24, borderRadius: 7, backgroundColor: tint(it.color, 0.16), alignItems: 'center', justifyContent: 'center'}}><Icon name={it.icon} size={13} color={it.color} /></View>
        <Text style={{fontSize: 13, color: c.text}}>{it.label}</Text>
      </Pressable>)}
    </View>
  </>;
}

/** 0.3.332 (aprovado por foto): simbolo do periodo no meio dele - madrugada (estrelas, 0.3.344), manha (nascer do sol), tarde (sol verde-limao), noite (lua com estrela) */
function PeriodIcon({kind}: {kind: string}) {
  const col = kind === 'd' ? 'rgba(190,165,255,0.9)' : kind === 'm' ? 'rgba(255,200,140,0.88)' : kind === 't' ? 'rgba(195,220,130,0.9)' : 'rgba(150,175,255,0.92)';
  const d = kind === 'd' ? 'M9 4l1.2 3.3L13.5 8.5l-3.3 1.2L9 13l-1.2-3.3L4.5 8.5l3.3-1.2zM17 12l.8 2.2 2.2.8-2.2.8L17 18l-.8-2.2-2.2-.8 2.2-.8zM16.5 4.5v2M15.5 5.5h2' /* madrugada: estrelas */
    : kind === 'm' ? 'M4 18h16M7 18a5 5 0 0 1 10 0M12 7v3M5.6 11.6l1.6 1.6M18.4 11.6l-1.6 1.6'
    : kind === 't' ? 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4'
    : 'M18 15.5A7 7 0 0 1 8.5 6a6.5 6.5 0 1 0 9.5 9.5zM17 3.5v3M15.5 5h3M20.5 9v2M19.5 10h2';
  return <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <Path d={d} />{kind === 't' ? <Circle cx={12} cy={12} r={4} /> : null}
  </Svg>;
}

/** Marca de "agora": ponto com aureola que pulsa devagar, linha fina descendo ate a escala e a hora numa etiqueta. */
function NowBeacon({x, top}: {x: number; top: number}) {
  const c = useTheme(), reduced = useReducedMotion(), pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {if (reduced) return; const loop = Animated.loop(Animated.timing(pulse, {toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: false})); loop.start(); return () => loop.stop();}, [reduced]);
  const now = new Date(), label = hhmm(now), pct = x * 100, at = (off: number) => `calc(${pct}% - ${dpx(off)})` as any, red = '#F57A8C';
  return <View pointerEvents="none" style={{position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 4}}>
    {/* aureola */}
    <Animated.View style={{position: 'absolute', left: at(14), top: top - 14, width: 28, height: 28, borderRadius: 14, backgroundColor: red, opacity: pulse.interpolate({inputRange: [0, 1], outputRange: [0.35, 0]}), transform: [{scale: pulse.interpolate({inputRange: [0, 1], outputRange: [0.4, 1.4]})}]}} />
    {/* ponto */}
    <View style={{position: 'absolute', left: at(6), top: top - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: red, borderWidth: 2, borderColor: c.surface, boxShadow: '0 0 0 3px ' + tint(red, 0.25) + ', 0 0 12px ' + tint(red, 0.6)} as any} />
    {/* fio ate a escala */}
    <View style={{position: 'absolute', left: at(0.5), top: top + 7, width: 1, height: 9, backgroundColor: tint(red, 0.7)}} />
    {/* etiqueta com a hora, na altura da escala */}
    <View style={{position: 'absolute', left: `clamp(0px, calc(${pct}% - ${dpx(24)}), calc(100% - ${dpx(48)}))` as any, top: top + 13, width: 48, alignItems: 'center'}}>
      <Text style={{fontSize: 11, fontWeight: '700', color: '#fff', backgroundColor: red, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden', fontVariant: ['tabular-nums']}}>{label}</Text>
    </View>
  </View>;
}

/** 0.3.332 (aprovado por foto): a previa mostra o que e cada item - tipo, duracao, onde, prioridade - e as acoes ficam nela.
 * Compromisso sozinho: faixa de cor, nome grande, horario com a duracao, local e descricao. Varios itens: cabecalho com o
 * horario, quantos sao e "1 importante"; cada linha com a barrinha da cor, o icone do tipo e uma segunda linha dizendo o que e;
 * ao passar o mouse na linha aparecem concluir e editar. Setinha aponta para a bolinha. Mantem arrastar pelo horario (⠿). */
function PreviewCard({point, width, pinned, actions, desc, onEnter, onLeave, onClose, onGrab}: {point: Point; width: number; pinned: boolean; actions: TimelineActions; desc: (r: DayRecord) => string; onEnter: () => void; onLeave: () => void; onClose: () => void; onGrab?: (e: any, t: MoveTarget, color: string) => void}) {
  const c = useTheme(), single = point.recs.length === 1 && !point.marks.length && !point.recs[0].isTask && point.recs[0].kind !== 'reminder';
  const W = single ? 300 : 300, /* 0.3.347 (Pedro): janelas bem menores */ w = width || 1, x = Math.max(0, Math.min(w - W, point.x * w - W / 2)), caret = Math.max(18, Math.min(W - 18, point.x * w - x));
  const kindOf = (r: DayRecord) => r.isTask ? 'Tarefa' : r.kind === 'reminder' ? 'Lembrete' : 'Compromisso';
  const iconOf = (r: DayRecord): IconName => r.isTask ? 'checklist' : r.kind === 'reminder' ? 'bell' : 'calendar';
  const colOf = (r: DayRecord) => r.kind === 'reminder' ? REMIND : colorOf(r, c.accent);
  const durOf = (r: DayRecord) => {const end = (r.original as any)?.data?.end_at; if (!end) return ''; const m = Math.round((new Date(end).getTime() - new Date(r.date).getTime()) / 60000); return m > 0 ? (m >= 60 ? Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) : '') : m + ' min') : '';};
  const metaOf = (r: DayRecord) => {const o: any = r.original || {}, u = urgOf(r), loc = String(o.data?.location || '').trim(), d = durOf(r);
    return [kindOf(r), u === 3 ? 'Importante' : u === 2 ? 'Média' : '', d, loc].filter(Boolean).join(' · ');};
  const shell = (inner: React.ReactNode, strip?: string) => <View testID="timeline-preview" {...({onMouseEnter: onEnter, onMouseLeave: onLeave} as any)} style={{position: 'absolute', left: x, bottom: 48, width: W, zIndex: 8} as any}>
    <View style={{backgroundColor: c.bg, borderRadius: 16, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 18px 40px rgba(0,0,0,0.5)'} as any}>{strip ? <View style={{height: 4, backgroundColor: strip}} /> : null}{inner}</View>
    <View style={{position: 'absolute', left: caret - 6, bottom: -6, width: 12, height: 12, backgroundColor: c.bg, transform: [{rotate: '45deg'}], boxShadow: '1px 1px 0 rgba(255,255,255,0.07)'} as any} />
  </View>;
  const chip = (icon: IconName, col: string, s = 24) => <View style={{width: s, height: s, borderRadius: 9, backgroundColor: tint(col, 0.14), alignItems: 'center', justifyContent: 'center'}}><Icon name={icon} size={Math.round(s * 0.5)} color={col} /></View>;
  const iconBtn = (icon: IconName, label: string, run: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={run} hitSlop={4} style={({hovered}: any) => ({width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.line : c.input})}><Icon name={icon} size={14} color={c.muted} /></Pressable>;
  // --- compromisso sozinho
  if (single) {const r = point.recs[0], col = colOf(r), o: any = r.original || {}, d = durOf(r), end = o.data?.end_at ? hhmm(new Date(o.data.end_at)) : '', loc = String(o.data?.location || '').trim(), text = desc(r);
    const mins = Math.round((new Date(r.date).getTime() - Date.now()) / 60000), rel = mins > 0 ? 'em ' + (mins >= 60 ? Math.floor(mins / 60) + ' h' + (mins % 60 ? ' ' + String(mins % 60).padStart(2, '0') : '') : mins + ' min') : '';
    return shell(<View style={{padding: 12, gap: 8}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 9}}>{chip('calendar', col, 24)}<View style={{flex: 1, minWidth: 0}}>
        <Text numberOfLines={2} style={{fontSize: 14, fontWeight: '600', color: c.text}}>{r.title}</Text>
        <Text style={{fontSize: 11, color: c.muted, marginTop: 1, fontVariant: ['tabular-nums']}}>{hhmm(new Date(r.date))}{end ? ' – ' + end : ''}{d ? ' · ' + d : ''}{rel ? <Text style={{color: c.accent}}>{'  ' + rel}</Text> : null}</Text></View></View>
      {loc ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 7}}><Icon name="mapPin" size={13} color={c.muted} /><Text numberOfLines={1} style={{flex: 1, fontSize: 12, color: c.text}}>{loc}</Text></View> : null}
      {text && !text.includes(loc || '\u0000') ? <Text numberOfLines={2} style={{fontSize: 12, lineHeight: 18, color: c.muted}}>{text}</Text> : null}
      {o.data?.calendar_provider === 'google' ? <View style={{flexDirection: 'row'}}><View style={{flexDirection: 'row', alignItems: 'center', gap: 5, height: 22, paddingHorizontal: 8, borderRadius: 7, backgroundColor: c.input}}><Icon name="calendar" size={11} color={c.muted} /><Text style={{fontSize: 11, color: c.text}}>Google Agenda</Text></View></View> : null}
      <View style={{height: 1, backgroundColor: c.line, marginHorizontal: -12, marginTop: 0}} />
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
        <Pressable accessibilityRole="button" onPress={() => {onClose(); actions.onEdit(r);}} style={({hovered, pressed}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: 8, backgroundColor: hovered ? c.line : c.input, transform: [{scale: pressed ? 0.97 : 1}]})}><Icon name="edit" size={12} color={c.text} /><Text style={{fontSize: 12, fontWeight: '600', color: c.text}}>Editar</Text></Pressable>
        {onGrab ? null : null}
      </View>
    </View>, col);}
  // --- varios itens (ou tarefa/lembrete/marca sozinhos)
  const recs = point.recs.slice(0, 5), marks = point.marks.slice(0, 6), extra = point.recs.length - recs.length + point.marks.length - marks.length;
  const total = point.recs.length + point.marks.length, imp = point.recs.filter(r => urgOf(r) === 3).length;
  const firstAt = point.recs[0] ? new Date(point.recs[0].date) : point.marks[0]?.at;
  const Row = ({k, color, icon, time, title, meta, done, check, onEdit, action, onAction, grab, first}: {k: string; color: string; icon: IconName; time: string; title: string; meta?: string; done?: boolean; check?: () => void; onEdit?: () => void; action?: string; onAction?: () => void; grab?: (e: any) => void; first: boolean}) =>
    <HoverPressable key={k} accessibilityRole="button" accessibilityLabel={title} onPress={onEdit} style={{flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6, paddingHorizontal: 8, marginHorizontal: 4, borderRadius: 10, outlineStyle: 'none'} as any}>{({hovered}: any) => <>
      {/* 0.3.349 (Pedro): a alca de arrastar fica no comeco, a esquerda */}
      {grab ? <Pressable accessibilityLabel={'Arrastar ' + title + ' na linha do tempo'} onPressIn={grab} {...({dataSet: {noveil: '1'}} as any)} style={{cursor: 'grab', width: 14, alignSelf: 'stretch', marginRight: -4, alignItems: 'center', justifyContent: 'center', outlineStyle: 'none'} as any}>{/* 0.3.351 (Pedro): sem a selecao colorida na alca; so a maozinha de arrastar */}<Text style={{fontSize: 12, color: c.muted, lineHeight: 14}}>⠿</Text></Pressable> : null}
      <View style={{width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: color, opacity: done ? 0.4 : 1}} />
      {check ? <Pressable accessibilityRole="checkbox" accessibilityState={{checked: !!done}} accessibilityLabel={(done ? 'Reabrir ' : 'Concluir ') + title} onPress={check} hitSlop={6} style={{width: 24, height: 24, alignItems: 'center', justifyContent: 'center', outlineStyle: 'none'} as any}>{({hovered: h}: any) => <View style={{width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: done || h ? color : tint(color, 0.7), backgroundColor: done ? color : h ? tint(color, 0.18) : 'transparent', alignItems: 'center', justifyContent: 'center'}}>{done || h ? <Icon name="check" size={12} color={done ? c.bg : color} /> : null}</View>}</Pressable> : chip(icon, color)} {/* 0.3.345 (Pedro): tarefa tem a bolinha de tique - vazia, ao passar o mouse mostra o tique; feita fica cheia com o tique */}
      <View style={{flex: 1, minWidth: 0}}>
        <Text numberOfLines={1} style={{fontSize: 13, fontWeight: '600', color: done ? c.muted : c.text, textDecorationLine: done ? 'line-through' : 'none'}}>{title}</Text>
        {meta ? <Text numberOfLines={1} style={{fontSize: 11, color: c.muted, marginTop: 1}}>{meta.split(' · ').map((part, n) => <Text key={n} style={{color: part === 'Importante' ? IMPORTANT_RED : c.muted}}>{(n ? ' · ' : '') + part}</Text>)}</Text> : null}
      </View>
      {action && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={({hovered: h, pressed}: any) => ({height: 28, paddingHorizontal: 11, borderRadius: 8, justifyContent: 'center', backgroundColor: h ? tint(color, 0.3) : tint(color, 0.18), transform: [{scale: pressed ? 0.97 : 1}]})}><Text style={{fontSize: 12, fontWeight: '600', color}}>{action}</Text></Pressable> : null}
      {hovered && onEdit ? iconBtn('edit', 'Editar ' + title, onEdit)
        : <Text style={{fontSize: 12, color: c.muted, fontVariant: ['tabular-nums']}}>{time}</Text>}
    </>}</HoverPressable>;
  const many = total > 1;
  return shell(<View style={{paddingVertical: 6}}>
    {many ? <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2}}>
      <Text style={{fontSize: 14, fontWeight: '600', color: c.text, fontVariant: ['tabular-nums']}}>{firstAt ? hhmm(firstAt) : ''}</Text><Text style={{fontSize: 12, color: c.muted}}>{total} itens</Text>
      <View style={{flex: 1}} />{imp ? <View style={{borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: tint(IMPORTANT_RED, 0.16)}}><Text style={{fontSize: 11, color: IMPORTANT_RED}}>{imp} importante{imp > 1 ? 's' : ''}</Text></View> : null}
    </View> : null}
    {recs.map((r, n) => Row({k: r.id + n, first: n === 0, color: colOf(r), icon: iconOf(r), time: hhmm(new Date(r.date)), title: r.title, meta: metaOf(r) + (desc(r) && !many ? ' · ' + desc(r) : ''), done: r.isTask ? (r.original as any)?.state === 'done' : false,
      check: r.isTask && actions.onToggleTask ? () => actions.onToggleTask!(r) : undefined, onEdit: () => {onClose(); actions.onEdit(r);}, grab: onGrab && total > 1 ? (e: any) => onGrab(e, {rec: r}, colOf(r)) : undefined}))}
    {marks.map((m, n) => Row({k: m.id, first: !recs.length && n === 0, color: markColor(m, c.danger), icon: m.kind === 'package' ? 'box' : m.kind === 'routine' ? ((m.dose?.icon || ROUTINE_ICON[m.dose?.type || 'capsula'] || 'capsule') as IconName) : m.kind === 'income' ? 'plus' : 'wallet',
      time: m.kind === 'routine' || m.kind === 'package' ? hhmm(m.at) : m.at.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}), title: m.title, meta: m.kind === 'routine' ? (m.done ? 'Rotina · feito' : 'Rotina') : m.sub, done: m.done && m.kind === 'routine',
      action: markAction(m), onAction: actions.onMarkAction ? () => actions.onMarkAction!(m) : undefined, onEdit: actions.onMarkOpen ? () => {onClose(); actions.onMarkOpen!(m);} : undefined, grab: onGrab && point.marks.length > 1 ? (e: any) => onGrab(e, m.kind === 'routine' && m.dose ? {dose: m.dose} : {mark: m}, markColor(m, c.danger)) : undefined}))}
    {extra > 0 ? <Text style={{fontSize: 11, color: c.muted, paddingHorizontal: 16, paddingVertical: 6}}>+{extra} mais</Text> : null}
  </View>, !many && point.marks[0]?.kind === 'routine' ? markColor(point.marks[0], c.danger) : undefined);
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
/** 0.3.322 (Pedro): troca suave do item mostrado - sai descendo um pouco e apagando (160 ms), entra subindo (260 ms). */
function useSwap(): [Animated.Value, (change: () => void) => void, any] {
  const v = useRef(new Animated.Value(1)).current;
  const swap = (change: () => void) => Animated.timing(v, {toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: false}).start(() => {change(); Animated.timing(v, {toValue: 1, duration: 260, easing: Easing.bezier(0.22, 0.8, 0.24, 1), useNativeDriver: false}).start();});
  return [v, swap, {opacity: v, transform: [{translateY: v.interpolate({inputRange: [0, 1], outputRange: [6, 0]})}]}];
}
function TasksTile({style, card, open, onOpen, onDone}: {style: any; card: any; open: Task[]; onOpen: () => void; onDone: (t: Task) => Promise<boolean | void> | void}) {
  const imp0 = open.filter(isImportant), [, swap, swapStyle] = useSwap(), [held, setHeld] = useState<Task[] | null>(null);
  // segura a lista na tela enquanto grava; quando termina, troca para a nova com a animacao (sem pulo seco)
  const shown = held || open, imp = held ? held.filter(isImportant) : imp0, first = imp[0] || shown[0], [conf, setConf, busy, setBusy] = useConfirm();
  const finish = async (t: Task) => {if (busy) return; setBusy(true); setConf(null); setHeld(open); let ok: boolean | void = undefined; try {ok = await onDone(t);} catch {ok = false;} setBusy(false); swap(() => setHeld(null));
    if (ok === false) setConf({ok: false, text: 'Não deu para concluir.', retry: () => void finish(t)}); else setConf({ok: true, text: t.title + ' concluída', undo: () => onDone({...t, state: 'done'})});};
  return <View style={[card, {gap: 6, overflow: 'hidden', paddingVertical: 16}, style]}>
    {imp.length ? <Dot reason={imp.length === 1 ? '1 tarefa importante em aberto' : imp.length + ' tarefas importantes em aberto'} /> : null}
    <TileHead icon="checklist" color="#F5A0AE" name="Tarefas" onOpen={onOpen} />
    {first ? <View style={{marginTop: 'auto', gap: 4} as any}>
      <Animated.View style={[{gap: 4}, swapStyle]}>
        <Big value={String(imp.length || shown.length)} unit={imp.length ? (imp.length === 1 ? 'importante' : 'importantes') : 'em aberto'} />
        <Line text={(imp.length ? 'Comece por ' : '') + first.title} />
      </Animated.View>
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
  const [, swap, swapStyle] = useSwap(), curIdx = cur ? list.indexOf(cur) : -1;
  const wheel = useWheelStep(d => list.length > 1 && swap(() => setK(((curIdx >= 0 ? curIdx : firstOpen) + d + list.length) % list.length)), list.length > 1);
  const done = list.filter(d => d.taken).length, late = doses.some(d => !d.taken && d.date.getTime() < Date.now());
  const curLate = !!cur && !cur.taken && cur.date.getTime() < Date.now(), [conf, setConf, busy, setBusy] = useConfirm();
  // 0.3.322 (Pedro): depois do Tomei o Inicio ja passa para o proximo que falta (na ordem do dia), com a troca suave
  const takeIt = async (d: NonNullable<typeof cur>) => {if (busy) return; setBusy(true); setConf(null); const at = list.indexOf(d); setK(at);
    const nextOpen = [...list.slice(at + 1), ...list.slice(0, at)].find(x => !x.taken && x !== d), ni = nextOpen ? list.indexOf(nextOpen) : -1;
    try {await s.take(d.plan.id, d.day, d.time); if (ni >= 0) swap(() => setK(ni)); setConf({ok: true, text: d.plan.title + ' feito às ' + hhmm(new Date()), undo: () => s.take(d.plan.id, d.day, d.time, false).catch(() => undefined)});}
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
      <Animated.View style={[{gap: 4}, swapStyle]}>
        <Big value={String(done)} unit={'de ' + list.length + ' hoje'} />
        <Line text={cur.taken ? cur.plan.title + ' · feito às ' + hhmm(cur.date) : curLate ? cur.plan.title + ' passou da hora (' + hhmm(cur.date) + ')' : (curIdx === firstOpen ? 'Próximo: ' : '') + cur.plan.title + ' às ' + hhmm(cur.date)} />
      </Animated.View>
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
      <Big value={fmtMoney(r.price || 0, r.currency || 'BRL')} unit={r.title} />
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
    {wide ? <LoadingLines rows={3} immediate /> : <View style={{marginTop: 'auto', gap: 8} as any}><ShimmerBlock width={70} height={22} radius={6} /><ShimmerBlock width={'80%'} height={11} radius={5} /><ShimmerBlock width={80} height={26} radius={8} /></View>}
  </View>;
  return <ShimmerGroup><View ref={root} testID="home-desk-skeleton" style={{gap: 12}}>
    {/* 0.3.350 (Pedro: "ao atualizar, o esqueleto e o pronto nao tem a mesma medida - da uma flicada"): mesma estrutura do Seu dia
        pronto - cabecalho de 30 (com o dia no meio e o placar), 26 de espaco e a linha de 100 com o traco na mesma altura */}
    <View style={{...card, borderRadius: 22, padding: 20, paddingTop: 16, paddingBottom: 14, overflow: 'visible'}}>
      <View style={{height: 30, flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <ShimmerBlock width={24} height={24} radius={8} /><ShimmerBlock width={70} height={14} radius={6} />
        <View style={{flex: 1, alignItems: 'center'}}><ShimmerBlock width={150} height={14} radius={6} /></View>
        <ShimmerBlock width={110} height={12} radius={6} /><ShimmerBlock width={22} height={22} radius={11} />
      </View>
      <View style={{marginTop: 26, height: 100}}>
        <View style={{position: 'absolute', left: 0, right: 0, top: 72}}><ShimmerBlock width={'100%'} height={2} radius={1} /></View>
        <View style={{position: 'absolute', left: 0, right: 0, top: 86, flexDirection: 'row', justifyContent: 'space-between'}}>{[0, 1, 2, 3, 4, 5].map(k => <ShimmerBlock key={k} width={34} height={10} radius={4} />)}</View>
      </View>
    </View>
    <View style={{flexDirection: 'row', gap: 12}}>{tile(2, true)}{tile(1)}{tile(1)}</View>
    <View style={{flexDirection: 'row', gap: 12}}>{tile(2, true)}{tile(1)}{tile(1)}{tile(1)}</View>
  </View></ShimmerGroup>;
}
