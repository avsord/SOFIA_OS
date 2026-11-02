// 0.3.292 (Inicio novo do site, prototipo aprovado): embaixo da saudacao, o cartao "Seu dia" (frase da Sofia,
// atalhos e a linha do tempo do dia) e o resumo de tudo em blocos do mesmo tamanho. So o Price Tracker passa
// sozinho pelos produtos; o resto fica parado no item mais importante (decisao do Pedro: menos movimento).
// Medidas em px de computador (metro: FLUID - so o fator da tela).
import React, {useEffect, useMemo, useRef, useState} from 'react';
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
  onOpenItem: (r: DayRecord) => void; onOpenTasks: () => void; onOpenTask?: (id: string) => void; onToggleTask: (t: Task) => void;
  onOpenModule: (id: string) => void; onOpenMonitoring: () => void; onOpenAgenda: () => void;
  onMute?: (t: MuteTarget, scope: 'one' | 'all', on: boolean) => void;
  onMarkAction?: (m: TimeMark) => void;
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
type TimelineSettings = {cats: Record<string, boolean>; items: Record<string, boolean>; opacity: number};
const TL_KEY = 'sofia.timeline.v1';
function useTimelineSettings(): [TimelineSettings, (s: TimelineSettings | ((old: TimelineSettings) => TimelineSettings)) => void] {
  const [s, set] = useState<TimelineSettings>(() => {try {const v = JSON.parse(globalThis.localStorage?.getItem(TL_KEY) || 'null'); if (v && v.cats) return {cats: v.cats || {}, items: v.items || {}, opacity: Number(v.opacity) || 1};} catch {} return {cats: {}, items: {}, opacity: 1};});
  return [s, (f: TimelineSettings | ((old: TimelineSettings) => TimelineSettings)) => set(old => {const v = typeof f === 'function' ? f(old) : f; try {globalThis.localStorage?.setItem(TL_KEY, JSON.stringify(v));} catch {} return v;})];
}
const TL_CATS: {id: string; label: string; color: string}[] = [{id: 'events', label: 'Compromissos', color: '#8fb4ff'}, {id: 'tasks', label: 'Tarefas', color: '#F5A0AE'}, {id: 'reminders', label: 'Lembretes', color: '#7FD1E8'}, {id: 'bill', label: 'Contas a pagar', color: '#E8B04A'}, {id: 'income', label: 'Receitas', color: '#7ED6A5'}, {id: 'invoice', label: 'Faturas do cartão', color: '#B49AE6'}, {id: 'package', label: 'Encomendas', color: '#F0956A'}, {id: 'routine', label: 'Rotina', color: '#5FD3C6'}];
function Switch({on, onChange, label}: {on: boolean; onChange: (v: boolean) => void; label: string}) {
  const c = useTheme();
  return <Pressable accessibilityRole="switch" accessibilityState={{checked: on}} accessibilityLabel={label} onPress={() => onChange(!on)} hitSlop={6} style={{width: 34, height: 20, borderRadius: 10, padding: 2, backgroundColor: on ? c.accent : c.line, justifyContent: 'center'}}>
    <View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', transform: [{translateX: on ? 14 : 0}]}} />
  </Pressable>;
}
function TimelineSettingsPanel({s, set, plans, bills, incomes, onClose}: {s: TimelineSettings; set: (v: TimelineSettings | ((old: TimelineSettings) => TimelineSettings)) => void; plans: {id: string; title: string; type: string; color?: string}[]; bills: string[]; incomes: string[]; onClose: () => void}) {
  const c = useTheme(), [open, setOpen] = useState('');
  const cat = (id: string) => s.cats[id] !== false, item = (k: string) => s.items[k] !== false;
  const setCat = (id: string, v: boolean) => set(o => ({...o, cats: {...o.cats, [id]: v}})), setItem = (k: string, v: boolean) => set(o => ({...o, items: {...o.items, [k]: v}}));
  const sub = (id: string) => id === 'routine' ? plans.map(p => ({k: 'routine:' + p.id, label: p.title, color: p.color || routineColor(p.type)})) : id === 'bill' ? bills.map(t => ({k: 'fin:' + t, label: t, color: '#E8B04A'})) : id === 'income' ? incomes.map(t => ({k: 'fin:' + t, label: t, color: '#7ED6A5'})) : [];
  return <View style={{position: 'absolute', top: 52, right: 16, width: 340, maxHeight: 460, zIndex: 20, backgroundColor: c.bg, borderRadius: 16, boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 18px 44px rgba(0,0,0,0.5)'} as any}>
    <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8}}>
      <Text style={{flex: 1, fontSize: 14, fontWeight: '600', color: c.text}}>Linha do tempo</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} hitSlop={8} style={({hovered}: any) => ({width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Icon name="close" size={15} color={c.muted} /></Pressable>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight: 400}} contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 16, gap: 2}}>
      <Text style={{fontSize: 12, color: c.muted, marginBottom: 6}}>O que aparece na linha do tempo do Início. Não muda avisos nem os apps.</Text>
      {TL_CATS.map(k => {const items = sub(k.id); return <View key={k.id}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, height: 38}}>
          <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: k.color}} />
          <Pressable disabled={!items.length} onPress={() => setOpen(o => o === k.id ? '' : k.id)} style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <Text style={{fontSize: 13, color: c.text}}>{k.label}</Text>
            {items.length ? <Text style={{fontSize: 12, color: c.muted}}>{open === k.id ? '▴' : '▾'} {items.filter(i => item(i.k)).length}/{items.length}</Text> : null}
          </Pressable>
          <Switch label={k.label} on={cat(k.id)} onChange={v => setCat(k.id, v)} />
        </View>
        {open === k.id && items.length ? <View style={{marginLeft: 18, paddingLeft: 10, borderLeftWidth: 1, borderColor: c.line, opacity: cat(k.id) ? 1 : 0.45}}>
          {items.map(i => <View key={i.k} style={{flexDirection: 'row', alignItems: 'center', gap: 8, height: 32}}>
            <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: i.color}} />
            <Text numberOfLines={1} style={{flex: 1, fontSize: 12, color: c.text}}>{i.label}</Text>
            <Switch label={i.label} on={item(i.k)} onChange={v => setItem(i.k, v)} />
          </View>)}
        </View> : null}
      </View>;})}
      <View style={{height: 1, backgroundColor: c.line, marginVertical: 10}} />
      <Text style={{fontSize: 13, color: c.text, marginBottom: 8}}>Opacidade das marcas</Text>
      <View style={{flexDirection: 'row', gap: 6}}>{[0.4, 0.6, 0.8, 1].map(o => <Pressable key={o} accessibilityRole="button" accessibilityState={{selected: s.opacity === o}} onPress={() => set(old => ({...old, opacity: o}))} style={({hovered}: any) => ({flex: 1, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: s.opacity === o ? c.accentSoft : hovered ? c.input : 'transparent', borderWidth: 1, borderColor: s.opacity === o ? c.accent : c.line})}>
        <Text style={{fontSize: 12, color: s.opacity === o ? c.accent : c.text, fontWeight: s.opacity === o ? '600' : '400'}}>{Math.round(o * 100)}%</Text></Pressable>)}</View>
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
    return out.sort((x, y) => x.at.getTime() - y.at.getTime());
  }, [p.data, p.masked]);
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
      {gear ? <TimelineSettingsPanel s={tl} set={setTl} onClose={() => setGear(false)} plans={p.data.capsules.plans.filter(x => x.state === 'active').map(x => ({id: x.id, title: x.title, type: String(x.data?.rotina_type || 'capsula'), color: typeInfo(x).color}))} bills={[...new Set((p.data.money || []).filter(d => d.kind === 'pagar').map(d => d.title))]} incomes={[...new Set((p.data.money || []).filter(d => d.kind === 'receber').map(d => d.title))]} /> : null}
      <Timeline items={timelineItems.filter(r => tl.cats[r.isTask ? 'tasks' : r.kind === 'reminder' ? 'reminders' : 'events'] !== false)} next={next} opacity={tl.opacity}
        marks={timeMarks.filter(m => tl.cats[m.kind] !== false && !(m.kind === 'routine' && m.dose && tl.items['routine:' + m.dose.planId] === false) && !((m.kind === 'bill' || m.kind === 'income' || m.kind === 'invoice') && tl.items['fin:' + m.title] === false))}
        actions={{onEdit: r => r.isTask && p.onOpenTask ? p.onOpenTask(String((r.original as any)?.id || r.id.replace(/^task:/, ''))) : p.onOpenItem(r), onToggleTask: r => r.original && p.onToggleTask(r.original as any), onMarkAction: p.onMarkAction, onMarkOpen: m => p.onOpenModule(m.kind === 'package' ? 'packages' : m.kind === 'routine' ? 'capsules' : 'finance')}} />
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
export type TimelineActions = {onEdit: (r: DayRecord) => void; onToggleTask?: (r: DayRecord) => void; onMarkAction?: (m: TimeMark) => void; onMarkOpen?: (m: TimeMark) => void};
const routineColor = (type?: string) => (ROTINA_TYPES.find(x => x.id === type) || ROTINA_TYPES[0]).color;
const markColor = (m: TimeMark, danger: string) => m.late ? danger : m.kind === 'routine' ? (m.dose?.color || routineColor(m.dose?.type)) : MARK_COLOR[m.kind];
const markAction = (m: TimeMark) => m.done ? '' : m.kind === 'bill' && m.due?.tx ? 'Paguei' : m.kind === 'income' && m.due?.tx ? 'Recebi' : m.kind === 'routine' ? 'Tomei' : '';
type Point = {key: string; x: number; recs: DayRecord[]; marks: TimeMark[]};
function Timeline({items, next, marks = [], opacity = 1, actions}: {items: DayRecord[]; next: DayRecord | null; marks?: TimeMark[]; opacity?: number; actions: TimelineActions}) {
  const c = useTheme(), [w, setW] = useState(0), [start, setStart] = useState(7), box = useRef<View>(null);
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
    let acc = 0;
    const onWheel = (e: WheelEvent) => {e.preventDefault(); acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; const steps = Math.trunc(acc / 40); if (!steps) return; acc -= steps * 40; setPin(''); setHover(''); setStart(v => Math.max(0, Math.min(24 * 3 - SPAN, v + steps)));};
    el.addEventListener('wheel', onWheel, {passive: false});
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => {if (typeof window === 'undefined' || !pin) return; const k = (e: KeyboardEvent) => {if (e.key === 'Escape') setPin('');}; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);}, [pin]);
  const enter = (key: string) => {clearTimeout(hide.current); setHover(key);};
  const leave = () => {clearTimeout(hide.current); hide.current = setTimeout(() => setHover(''), 180);};
  const label = (h: number) => {const d = new Date(day0 + h * 3600000), dd = Math.floor(h / 24); return (dd === 0 ? '' : dd === 1 ? 'amanhã ' : d.toLocaleDateString('pt-BR', {weekday: 'short'}).replace('.', '') + ' ') + String(d.getHours()).padStart(2, '0') + ':00';};
  const desc = (r: DayRecord) => {const o: any = r.original || {}; return String(o.description || o.data?.description || o.data?.message || o.content || o.data?.location || '').trim();};
  // rotulos fixos: compromissos e tarefas primeiro, depois dinheiro e encomendas; rotina so na previa
  // 0.3.310 (tela grande): o rotulo cresce com o espaco de cada hora (150 a 230 px), para o nome nao cortar a toa
  const LW = Math.round(Math.max(150, Math.min(230, (w || 0) / SPAN * 1.45))), OFF = 44, rows: number[][] = [[], []], place: Record<string, number> = {};
  const fits = (px: number) => {for (const r of [0, 1]) if (rows[r].every(q => Math.abs(q - px) >= LW + 8)) {rows[r].push(px); return r;} return -1;};
  for (const p of points) {const r = fits(p.x * (w || 1)); if (r >= 0) place[p.key] = r;}
  for (const p of mpoints) if (p.marks[0].kind !== 'routine') {const r = fits(p.x * (w || 1)); if (r >= 0) place[p.key] = r;}
  const shown = all.find(p => p.key === (pin || hover));
  const tagOf = (p: Point) => {const m = p.marks[0]; if (m) return {text: m.title + ' · ' + m.sub, color: markColor(m, c.danger), strong: true}; const r = p.recs[0], isNext = !!next && p.recs.includes(next);
    return {text: hhmm(new Date(r.date)) + ' ' + (p.recs.length > 1 ? p.recs.length + ' itens' : r.title), color: p.recs.length === 1 && r.kind === 'reminder' ? REMIND : isNext ? c.text : c.muted, strong: isNext, bg: isNext ? tint(c.accent, 0.14) : undefined};};
  return <View ref={box} style={{marginTop: 12, height: 56 + OFF}} onLayout={e => {const v = e.nativeEvent.layout.width; if (v > 0) setW(v);}}>
    <View style={{position: 'absolute', left: 0, right: 0, top: 28 + OFF, height: 2, borderRadius: 1, backgroundColor: c.line}} />
    {nowX > 0 ? <View style={{position: 'absolute', left: 0, width: (Math.min(1, nowX) * 100 + '%') as any, top: 28 + OFF, height: 2, borderRadius: 1, backgroundColor: tint(c.accent, 0.45)}} /> : null}
    {[24, 48].map(m => {const x = (m - start) / SPAN; return x > 0 && x < 1 ? <View key={m} style={{position: 'absolute', left: (x * 100 + '%') as any, top: 20 + OFF, width: 1, height: 18, backgroundColor: c.line}} /> : null;})}
    {/* marcas e pontos (com a opacidade escolhida na engrenagem) */}
    <View pointerEvents="box-none" style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity}}>
      {all.map(p => {
        const m = p.marks[0], r = p.recs[0], open = () => setPin(k => k === p.key ? '' : p.key), hov = {onHoverIn: () => enter(p.key), onHoverOut: leave};
        if (m) {
          const col = markColor(m, c.danger), diamond = m.kind === 'bill' || m.kind === 'income' || m.kind === 'invoice';
          const shape = diamond ? {width: 20, height: 20, marginLeft: -10, top: 29 + OFF - 10, borderRadius: 6, transform: [{rotate: '45deg'}]} : m.kind === 'package' ? {width: 22, height: 22, marginLeft: -11, top: 29 + OFF - 11, borderRadius: 6} : {width: 26, height: 16, marginLeft: -13, top: 29 + OFF - 8, borderRadius: 8};
          const glyph = m.kind === 'bill' ? '$' : m.kind === 'income' ? '+' : m.kind === 'invoice' ? '▭' : '';
          return <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={p.marks.map(x => x.title + ' · ' + x.sub).join(', ')} onPress={open} hitSlop={12} {...hov} style={({hovered}: any) => ({position: 'absolute', left: (p.x * 100 + '%') as any, ...shape, backgroundColor: m.done ? c.surface : col, borderWidth: m.done ? 2 : 3, borderColor: m.done ? col : c.surface, alignItems: 'center', justifyContent: 'center', boxShadow: (p.marks.length > 1 ? '3px -3px 0 -1px ' + tint(col, 0.55) + ', ' : '') + '0 0 0 4px ' + tint(col, hovered || pin === p.key ? 0.3 : 0.16), zIndex: 2} as any)}>
            {glyph ? <Text style={{transform: [{rotate: '-45deg'}], fontSize: 10, fontWeight: '700', color: '#17122A'}}>{glyph}</Text> : <Icon name={m.kind === 'package' ? 'box' : ((m.dose?.icon || ROUTINE_ICON[m.dose?.type || 'capsula'] || 'capsule') as IconName)} size={m.kind === 'package' ? 11 : 10} color={m.done ? col : '#17122A'} />}
          </Pressable>;
        }
        const isNext = !!next && p.recs.includes(next), many = p.recs.length > 1;
        if (!many && r.kind === 'reminder') return <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={'Lembrete ' + hhmm(new Date(r.date)) + ' ' + r.title} onPress={open} hitSlop={12} {...hov}
          style={({hovered}: any) => ({position: 'absolute', left: (p.x * 100 + '%') as any, top: 29 + OFF - 11, width: 22, height: 22, marginLeft: -11, borderRadius: 11, borderWidth: 2, borderColor: REMIND, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 4px ' + tint(REMIND, hovered || pin === p.key ? 0.3 : 0.16)} as any)}><Icon name="bell" size={11} color={REMIND} /></Pressable>;
        const size = isNext ? 16 : many ? 20 : 12;
        return <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={p.recs.map(x => hhmm(new Date(x.date)) + ' ' + x.title).join(', ')} onPress={open} hitSlop={14} {...hov}
          style={{position: 'absolute', left: (p.x * 100 + '%') as any, top: 29 + OFF - size / 2, width: size, height: size, marginLeft: -size / 2, borderRadius: size / 2, borderWidth: 3, borderColor: c.surface, backgroundColor: colorOf(r, c.accent), alignItems: 'center', justifyContent: 'center'}}>
          {many && !isNext ? <Text style={{fontSize: 10, fontWeight: '700', color: c.onAccent}}>{p.recs.length}</Text> : null}
        </Pressable>;
      })}
      {all.map(p => place[p.key] == null ? null : (() => {const t = tagOf(p); return <View key={'l' + p.key} pointerEvents="none" style={{position: 'absolute', left: Math.max(0, Math.min((w || 1) - LW, p.x * (w || 1) - LW / 2)), top: place[p.key] === 0 ? OFF - 2 : OFF - 26, width: LW, alignItems: 'center'}}>
        <Text numberOfLines={1} style={{fontSize: 12, color: t.color, fontWeight: t.strong ? '600' : '400', backgroundColor: t.bg || (p.marks[0] ? tint(t.color, 0.14) : 'transparent'), borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden', fontVariant: ['tabular-nums']}}>{t.text}</Text>
      </View>;})())}
    </View>
    {/* 0.3.314 (Pedro): o "agora" em destaque - um farol que pulsa na linha, com o horario numa etiqueta; o trecho que ja
        passou fica preenchido. Se a pessoa rolar para longe, aparece um botao para voltar para agora. */}
    {nowX >= 0 && nowX <= 1 ? <NowBeacon x={nowX} w={w} top={29 + OFF} /> : <Pressable accessibilityRole="button" accessibilityLabel="Voltar para agora" onPress={() => setStart(Math.max(0, Math.min(24 * 3 - SPAN, Math.floor((Date.now() - day0) / 3600000) - 3)))}
      style={({hovered}: any) => ({position: 'absolute', top: OFF + 18, [nowX < 0 ? 'left' : 'right']: 0, height: 22, paddingHorizontal: 9, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: hovered ? c.danger : tint('#F5A0AE', 0.18), zIndex: 3} as any)}>
      {({hovered}: any) => <><Text style={{fontSize: 11, fontWeight: '700', color: hovered ? '#fff' : c.danger}}>{nowX < 0 ? '‹' : ''} agora {nowX > 1 ? '›' : ''}</Text></>}
    </Pressable>}
    {[0, 0.25, 0.5, 0.75, 1].filter(f => !(nowX >= 0 && nowX <= 1 && w && Math.abs(f - nowX) * w < 46)).map(f => <Text key={f} style={{position: 'absolute', top: 42 + OFF, left: (f * 100 + '%') as any, transform: [{translateX: f === 0 ? 0 : f === 1 ? -60 : -30}], width: f === 1 ? 60 : undefined, textAlign: f === 1 ? 'right' : 'left', fontSize: 11, color: c.muted, fontVariant: ['tabular-nums']}}>{label(Math.round(start + f * SPAN))}</Text>)}
    {shown ? <PreviewCard point={shown} width={w} pinned={pin === shown.key} actions={actions} desc={desc} onEnter={() => enter(shown.key)} onLeave={leave} onClose={() => {setPin(''); setHover('');}} /> : null}
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
function PreviewCard({point, width, pinned, actions, desc, onEnter, onLeave, onClose}: {point: Point; width: number; pinned: boolean; actions: TimelineActions; desc: (r: DayRecord) => string; onEnter: () => void; onLeave: () => void; onClose: () => void}) {
  const c = useTheme(), W = 320, x = Math.max(0, Math.min((width || 1) - W, point.x * (width || 1) - W / 2));
  const Row = ({color, icon, time, title, sub, action, onAction, onEdit, done, check}: {color: string; icon?: IconName; time: string; title: string; sub?: string; action?: string; onAction?: () => void; onEdit?: () => void; done?: boolean; check?: () => void}) =>
    <View style={{flexDirection: 'row', gap: 10, paddingVertical: 8}}>
      {check ? <Pressable accessibilityRole="checkbox" accessibilityState={{checked: !!done}} accessibilityLabel={(done ? 'Reabrir ' : 'Concluir ') + title} onPress={check} hitSlop={8} style={({hovered}: any) => ({width: 18, height: 18, marginTop: 1, borderRadius: 9, borderWidth: 2, borderColor: done ? color : hovered ? color : c.muted, backgroundColor: done ? color : 'transparent', alignItems: 'center', justifyContent: 'center'})}>{done ? <Icon name="check" size={11} color={c.surface} /> : null}</Pressable>
        : <View style={{width: 18, height: 18, marginTop: 1, borderRadius: 6, backgroundColor: tint(color, 0.16), alignItems: 'center', justifyContent: 'center'}}>{icon ? <Icon name={icon} size={11} color={color} /> : <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: color}} />}</View>}
      <View style={{flex: 1, minWidth: 0, gap: 2}}>
        <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 6}}>
          <Text style={{fontSize: 12, color: c.muted, fontVariant: ['tabular-nums']}}>{time}</Text>
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
      check: r.isTask && actions.onToggleTask ? () => actions.onToggleTask!(r) : undefined, done: r.isTask ? (r.original as any)?.state === 'done' : false, onEdit: () => {onClose(); actions.onEdit(r);}})}</View>)}
    {marks.map((m, i) => <View key={m.id} style={{borderTopWidth: i || recs.length ? 1 : 0, borderColor: c.line}}>{Row({color: markColor(m, c.danger), icon: m.kind === 'package' ? 'box' : m.kind === 'routine' ? ((m.dose?.icon || ROUTINE_ICON[m.dose?.type || 'capsula'] || 'capsule') as IconName) : m.kind === 'income' ? 'plus' : 'wallet',
      time: m.kind === 'routine' || m.kind === 'package' ? hhmm(m.at) : m.at.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}), title: m.title, sub: m.kind === 'routine' ? (m.done ? 'Feito' : '') : m.sub, done: m.done && m.kind === 'routine',
      action: markAction(m), onAction: actions.onMarkAction ? () => actions.onMarkAction!(m) : undefined, onEdit: actions.onMarkOpen ? () => {onClose(); actions.onMarkOpen!(m);} : undefined})}</View>)}
    {extra > 0 ? <Text style={{fontSize: 11, color: c.muted, paddingBottom: 6}}>+{extra} mais</Text> : null}
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
  return <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={({hovered, pressed}: any) => ({alignSelf: 'flex-start', marginTop: 8, height: 28, paddingHorizontal: 11, borderRadius: 9, justifyContent: 'center', backgroundColor: hovered ? tint(c.accent, 0.22) : c.accentSoft, transform: [{scale: pressed ? 0.97 : 1}]})}>
    <Text style={{fontSize: 12, fontWeight: '600', color: c.accent}}>{label}</Text>
  </Pressable>;
}
function Quiet({text, sub}: {text: string; sub: string}) {const c = useTheme(); return <View style={{marginTop: 'auto', gap: 4} as any}><Text style={{fontSize: 14, color: c.muted, fontWeight: '500'}}>{text}</Text><Text numberOfLines={1} style={{fontSize: 12, color: c.muted}}>{sub}</Text></View>;}
const Dot = () => {const c = useTheme(); return <View style={{position: 'absolute', top: 18, right: 18, width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger, boxShadow: '0 0 0 4px ' + tint('#F5A0AE', 0.15)} as any} />;};

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
function TasksTile({style, card, open, onOpen, onDone}: {style: any; card: any; open: Task[]; onOpen: () => void; onDone: (t: Task) => void}) {
  const imp = open.filter(isImportant), first = imp[0] || open[0];
  return <View style={[card, {gap: 6, overflow: 'hidden', paddingVertical: 16}, style]}>
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
  return <View style={[card, {gap: 6, overflow: 'hidden', paddingVertical: 16}, style]}>
    {late ? <Dot /> : null}
    <TileHead icon="cycle" color="#88CFB8" name="Rotina" onOpen={onOpen} />
    {doses.length ? <View style={{marginTop: 'auto', gap: 4} as any}>
      <Big value={String(done)} unit={'de ' + doses.length + ' hoje'} />
      <Line text={next ? (late ? next.plan.title + ' passou da hora (' + hhmm(next.date) + ')' : 'Próximo: ' + next.plan.title + ' às ' + hhmm(next.date)) : 'Tudo feito por hoje.'} />
      {next ? <Act label="Tomei" onPress={() => void s.take(next.plan.id, next.day, next.time).catch(() => undefined)} /> : null}
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
    <Text numberOfLines={1} style={{fontSize: 24, fontWeight: '600', letterSpacing: -0.6, color: c.text, fontVariant: ['tabular-nums']}}>{value}</Text>
    {/* sem barra quando nao ha limite (despesas): so a linha fina, para os dois lados ficarem alinhados */}
    <View style={{height: 4, borderRadius: 2, backgroundColor: c.line}}>{pct != null ? <View style={{height: 4, borderRadius: 2, width: (Math.min(100, Math.max(1, pct)) + '%') as any, backgroundColor: color}} /> : null}
      {ticks.map(t => <View key={t.f} style={{position: 'absolute', left: (t.f * 100 + '%') as any, top: -2, width: 1.5, height: 8, marginLeft: -0.75, borderRadius: 1, backgroundColor: c.muted, opacity: 0.6}} />)}
    </View>
    {ticks.length ? <View style={{height: 12, marginTop: -2}}>{ticks.map(t => <Text key={t.f} numberOfLines={1} style={{position: 'absolute', left: (t.f * 100 + '%') as any, transform: [{translateX: -20}], width: 40, textAlign: 'center', fontSize: 10, color: c.muted, fontVariant: ['tabular-nums']}}>{t.label}</Text>)}</View> : null}
    <Text numberOfLines={1} style={{fontSize: 12, color: c.muted, fontVariant: ['tabular-nums']}}>{sub}</Text>
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
  // 0.3.293 (Pedro): parado; troca so quando a pessoa escolhe
  void hover; void reduced;
  const r = list[i % Math.max(1, list.length)];
  return <View style={[card, {gap: 6, overflow: 'hidden', paddingVertical: 16}, style]} {...({onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false)} as any)}>
    
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
  const list = [...data.packs].sort((a, b) => Number(isOut(b) || !!b.needs) - Number(isOut(a) || !!a.needs)), first = list[0];
  return <View style={[card, {gap: 6, overflow: 'hidden', paddingVertical: 16}, style]}>
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
