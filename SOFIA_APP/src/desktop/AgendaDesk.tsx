// 0.3.281 (Agenda nova do site, aprovada no prototipo): tres niveis - Ano, Mes (abre por padrao) e Dia - com o
// zoom de entrar e sair (a tela nova nasce do quadradinho clicado; ao voltar encolhe ate o lugar dela). Medidas em
// px de computador: o arquivo passa so pelo fator da tela (metro: FLUID), nao pela conversao celular->computador.
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, Platform, Pressable, ScrollView, Text, View, useWindowDimensions} from 'react-native';
import type {AgendaItem} from '../lib/types';
import type {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {localDateKey} from '../lib/dashboard';
import {agendaPriority, isHoliday, HOLIDAY_COLOR} from '../lib/agenda-priority';
import {expandAgenda} from '../lib/agenda-recurrence';
import {cacheFor} from '../lib/use-agenda-month';
import {monthKey} from '../lib/agenda-cache';
import {useReducedMotion} from '../lib/motion';
import {Icon} from '../components/Icon';
import {uiScale} from '../web/desktop-scale';

type Level = 'year' | 'month' | 'day';
type Rect = {x: number; y: number; w: number; h: number};
type Local = Rect & {parent?: string};
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DEPTH: Record<Level, number> = {year: 0, month: 1, day: 2};
const HOUR = 56;
const DUR = 460; // 0.3.283: um pouco mais longo para o zoom ser percebido sem pressa
const ease = Easing.bezier(0.32, 0.72, 0, 1); // curva dos calendarios da Apple: arranca firme e pousa macio
const hhmm = (d: Date) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const tint = (hex: string, a: number) => {const h = hex.replace('#', ''); if (h.length !== 6) return hex; const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;};

export type AgendaDeskProps = {
  api: SofiaApi; active: boolean; items: AgendaItem[]; month: Date; setMonth: (d: Date) => void;
  selected: Date; setSelected: (d: Date) => void; start: (i: AgendaItem) => string;
  onOpen: (i: AgendaItem) => void; onToggle: (i: AgendaItem) => void; onCreate: (d: Date, exact?: boolean) => void;
  /** 03/11/2026 (Pedro: "na agenda seria legal a funcionalidade e ate a animacao que a gente ja tem na agenda do site"):
   * a mesma Agenda no celular - Ano, Mes e Dia com o zoom; no Mes os dias mostram bolinhas em vez dos titulos. */
  compact?: boolean;
};

const isTask = (i: AgendaItem) => i.kind === 'task';
const isDone = (i: AgendaItem) => i.state === 'done' || i.state === 'completed';
const allDay = (i: AgendaItem, st: string) => !!i.data.calendar_all_day || isHoliday(i) || (/^\d{4}-\d{2}-\d{2}$/.test(st));
function endOf(i: AgendaItem, st: string) {const e = Date.parse(String((i.data as any).end_at || '')); const s = Date.parse(st); if (Number.isFinite(e) && e > s) return e; return s + (isTask(i) ? 30 : 60) * 60000;}
function colorOf(i: AgendaItem, accent: string) {return isHoliday(i) ? HOLIDAY_COLOR : agendaPriority(i).color || accent;}

/** Dias com compromisso e com feriado no ano inteiro (para as bolinhas da visao Ano). */
function useYearMarks(api: SofiaApi, year: number, on: boolean) {
  const [marks, setMarks] = useState<{ev: Set<string>; hol: Map<string, string>}>({ev: new Set(), hol: new Map()});
  useEffect(() => {
    if (!on) return;
    const cache = cacheFor(api); let alive = true;
    const months = Array.from({length: 12}, (_, m) => new Date(year, m, 1));
    const read = () => {
      const ev = new Set<string>(), hol = new Map<string, string>();
      for (const m of months) {
        const snap = cache.snapshot(monthKey(m));
        for (const i of expandAgenda(snap.items || [], m)) {
          const st = i.data.calendar_all_day ? i.data.calendar_date_start || '' : i.data.start_at || i.data.remind_at || i.data.due_at || '';
          if (!st) continue; const k = localDateKey(st);
          if (isHoliday(i)) hol.set(k, i.title); else ev.add(k);
        }
      }
      if (alive) setMarks({ev, hol});
    };
    const subs = months.map(m => cache.subscribe(monthKey(m), read));
    void (async () => {for (const m of months) {try {await cache.load(monthKey(m));} catch {/* mes sem rede: fica sem bolinha */} if (!alive) return;} read();})();
    read();
    return () => {alive = false; subs.forEach(u => u());};
  }, [api, year, on]);
  return marks;
}

type Ctx = {c: ReturnType<typeof useTheme>; p: AgendaDeskProps; byDay: Map<string, AgendaItem[]>; marks: {ev: Set<string>; hol: Map<string, string>}; today: Date; go: (l: Level, d: Date, from?: string) => void; rects: Map<string, Local>};
const keeper = (rects: Map<string, Local>) => (k: string, parent?: string) => (e: any) => {const l = e.nativeEvent.layout; rects.set(k, {x: l.x, y: l.y, w: l.width, h: l.height, parent});};
function resolve(rects: Map<string, Local>, k: string): Rect | null {let r = rects.get(k); if (!r) return null; let x = r.x, y = r.y; const w = r.w, h = r.h; let guard = 0; while (r && r.parent && guard++ < 6) {const p = rects.get(r.parent); if (!p) return null; x += p.x; y += p.y; r = p;} return {x, y, w, h};}
function YearView({x, y}: {x: Ctx; y: number}) {
  const {c, marks, today, go} = x, keep = keeper(x.rects);
  // 07/11/2026 (robo do site, celular): 3 meses por linha com altura fixa espremiam os numeros ("1011121314") e um mes
  // encavalava no outro. No celular: 2 meses por linha, altura do proprio mes, e a tela rola.
  const phone = useWindowDimensions().width < 600;
  const Wrap: any = phone ? ScrollView : View;
  return <Wrap style={{flex: 1}} contentContainerStyle={phone ? {padding: 10} : undefined} {...(phone ? {keyboardShouldPersistTaps: 'handled'} : {})}><View style={{flex: 1, padding: phone ? 0 : 14}} onLayout={keep('yearpad')}>
    <View style={{flex: 1, flexDirection: 'row', flexWrap: 'wrap'}} onLayout={keep('yeargrid', 'yearpad')}>
      {Array.from({length: 12}, (_, m) => {
        const first = new Date(y, m, 1).getDay(), n = new Date(y, m + 1, 0).getDate(), cur = m === today.getMonth() && y === today.getFullYear();
        return <Pressable key={m} accessibilityRole="button" accessibilityLabel={'Abrir ' + MONTHS[m] + ' de ' + y} onLayout={keep('m' + m, 'yeargrid')} onPress={() => go('month', new Date(y, m, 1), 'm' + m)}
          style={({hovered}: any) => ({width: phone ? '50%' : x.p.compact ? '33.33%' : '25%', ...(phone ? {paddingBottom: 12} : {height: x.p.compact ? '25%' : '33.33%'}), padding: x.p.compact ? 6 : 10, paddingHorizontal: x.p.compact ? 6 : 12, borderRadius: 10, backgroundColor: hovered ? c.input : 'transparent'})}>
          <Text style={{fontSize: 14, fontWeight: '600', color: cur ? c.accent : c.text, marginBottom: 6}}>{MONTHS[m]}</Text>
          <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
            {WD.map((w, i) => <Text key={'w' + i} style={{width: '14.2857%', textAlign: 'center', fontSize: 11, color: c.muted, paddingVertical: 2}}>{w[0].toUpperCase()}</Text>)}
            {Array.from({length: first}, (_, i) => <View key={'b' + i} style={{width: '14.2857%'}} />)}
            {Array.from({length: n}, (_, i) => {
              const d = new Date(y, m, i + 1), k = localDateKey(d), t = localDateKey(today) === k, ev = marks.ev.has(k), hol = marks.hol.get(k);
              return <View key={k} style={{width: '14.2857%', alignItems: 'center', paddingTop: 2, paddingBottom: 4}}>
                <Text accessibilityLabel={hol ? d.getDate() + ', ' + hol : undefined} style={{minWidth: phone ? 16 : 20, textAlign: 'center', fontSize: 11, borderRadius: 5, overflow: 'hidden', fontVariant: ['tabular-nums'], color: t ? c.onAccent : ev || hol ? c.text : c.muted, backgroundColor: t ? c.accent : 'transparent', fontWeight: t ? '700' : '400'}}>{d.getDate()}</Text>
                <View style={{flexDirection: 'row', gap: 2, height: 4, marginTop: 1}}>{hol ? <View style={{width: 4, height: 4, borderRadius: 2, backgroundColor: HOLIDAY_COLOR}} /> : null}{ev ? <View style={{width: 4, height: 4, borderRadius: 2, backgroundColor: t ? c.text : c.accent}} /> : null}</View>
              </View>;
            })}
          </View>
        </Pressable>;
      })}
    </View>
  </View></Wrap>;
}
function Chip({x, i}: {x: Ctx; i: AgendaItem}) {
  const {c, p} = x;
  const st = p.start(i), col = colorOf(i, c.accent), timed = !allDay(i, st), done = isTask(i) && isDone(i);
  return <View style={{height: 20, borderRadius: 6, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: isHoliday(i) ? tint(HOLIDAY_COLOR, 0.18) : timed ? tint(col, 0.16) : c.input, opacity: done ? 0.5 : 1}}>
    {timed ? <Text style={{fontSize: 12, color: c.muted, marginRight: 5, fontVariant: ['tabular-nums']}}>{hhmm(new Date(st))}</Text> : null}
    <Text numberOfLines={1} style={{flex: 1, fontSize: 12, color: c.text, textDecorationLine: done ? 'line-through' : 'none'}}>{i.title}</Text>
  </View>;
}
function MonthView({x, m}: {x: Ctx; m: Date}) {
  const {c, p, byDay, today, go} = x, keep = keeper(x.rects);
  const y = m.getFullYear(), mo = m.getMonth(), first = new Date(y, mo, 1).getDay(), rows = Math.ceil((first + new Date(y, mo + 1, 0).getDate()) / 7);
  const begin = new Date(y, mo, 1 - first);
  const cur = y === p.month.getFullYear() && mo === p.month.getMonth();
  return <View style={{flex: 1}}>
    <View style={{flexDirection: 'row', borderBottomWidth: 1, borderColor: c.line}}>{WD.map((w, i) => <Text key={w} style={{flex: 1, paddingVertical: 10, paddingHorizontal: x.p.compact ? 6 : 12, fontSize: 12, color: c.muted, borderLeftWidth: i ? 1 : 0, borderColor: c.line}}>{w}</Text>)}</View>
    <View style={{flex: 1}} onLayout={keep('monthgrid')}>
      {Array.from({length: rows}, (_, r) => <View key={r} style={{flex: 1, flexDirection: 'row'}} onLayout={keep('row' + r, 'monthgrid')}>
        {Array.from({length: 7}, (_, d) => {
          const day = new Date(begin.getFullYear(), begin.getMonth(), begin.getDate() + r * 7 + d), k = localDateKey(day), out = day.getMonth() !== mo, t = localDateKey(today) === k;
          const list = !out && cur ? byDay.get(k) || [] : [];
          return <Pressable key={k} accessibilityRole="button" accessibilityLabel={day.toLocaleDateString('pt-BR', {weekday: 'long', day: 'numeric', month: 'long'}) + (list.length ? ', ' + list.length + ' itens' : '')}
            onLayout={keep('d' + k, 'row' + r)}
            onPress={() => go('day', day, 'd' + k)} delayLongPress={420} onLongPress={() => x.p.onCreate(day)} /* 03/11/2026: segurar o dia cria nele (como o mes antigo do celular) */
            style={({hovered}: any) => ({flex: 1, minWidth: 0, borderLeftWidth: d ? 1 : 0, borderTopWidth: r ? 1 : 0, borderColor: c.line, paddingVertical: 8, paddingHorizontal: 6, gap: 3, overflow: 'hidden', backgroundColor: hovered ? c.input : 'transparent'})}>
            <View style={{height: 20, justifyContent: 'center', paddingLeft: 6, marginBottom: 2}}>
              <Text style={{alignSelf: 'flex-start', marginLeft: t ? -7 : 0, paddingHorizontal: t ? 7 : 0, borderRadius: 8, overflow: 'hidden', fontSize: 13, fontWeight: t ? '700' : '500', color: t ? c.onAccent : c.muted, backgroundColor: t ? c.accent : 'transparent', opacity: out ? 0.4 : 1, fontVariant: ['tabular-nums']}}>{day.getDate()}</Text>
            </View>
            {x.p.compact ? (list.length ? <View style={{flexDirection: 'row', gap: 3, paddingLeft: 6}}>{list.slice(0, 3).map(i => <View key={i.id + (i as any).occurrence_start} style={{width: 5, height: 5, borderRadius: 3, backgroundColor: colorOf(i, c.accent)}} />)}</View> : null) : <>
            {/* 07/11/2026 (revisao): com 3 pilulas o "+N mais" ficava fora da celula; com mais de 3, mostra 2 e o "+N mais" */}
            {list.slice(0, list.length > 3 ? 2 : 3).map(i => <Chip x={x} key={i.id + (i as any).occurrence_start} i={i} />)}
            {list.length > 3 ? <Text testID="agenda-more" style={{fontSize: 11, fontWeight: '600', color: c.accent, paddingLeft: 6}}>+{list.length - 2} mais</Text> : null}</>}
          </Pressable>;
        })}
      </View>)}
    </View>
  </View>;
}
function DayView({x, d}: {x: Ctx; d: Date}) {
  const {c, p, byDay, today} = x;
  const k = localDateKey(d), list = byDay.get(k) || [], scroll = useRef<ScrollView>(null);
  const top = list.filter(i => allDay(i, p.start(i))), timed = list.filter(i => !allDay(i, p.start(i)));
  const isToday = localDateKey(today) === k, nowY = (today.getHours() + today.getMinutes() / 60) * HOUR;
  useEffect(() => {const first = timed[0] ? new Date(p.start(timed[0])).getHours() : 8; const h = isToday ? Math.min(first, today.getHours()) - 1 : first - 1; setTimeout(() => scroll.current?.scrollTo({y: Math.max(0, h) * HOUR * uiScale(), animated: false}), 0);}, [k]);
  const Check = ({i}: {i: AgendaItem}) => <Pressable accessibilityRole="checkbox" accessibilityState={{checked: isDone(i)}} accessibilityLabel={(isDone(i) ? 'Reabrir ' : 'Concluir ') + i.title} hitSlop={8} onPress={() => p.onToggle(i)}
    style={({hovered}: any) => ({width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, borderColor: isDone(i) ? c.accent : hovered ? c.text : c.muted, backgroundColor: isDone(i) ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 10})}>{isDone(i) ? <Icon name="check" size={10} color={c.onAccent} /> : null}</Pressable>;
  return <View style={{flex: 1}}>
    <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingTop: 16, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderColor: c.line}}>
      <Text style={{fontSize: 20, fontWeight: '600', color: c.text}}>{d.getDate()} de {MONTHS[d.getMonth()].toLowerCase()}</Text>
      <Text style={{fontSize: 14, color: c.muted}}>{d.toLocaleDateString('pt-BR', {weekday: 'long'})}</Text>
    </View>
    <View style={{flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingVertical: 8, borderBottomWidth: 1, borderColor: c.line}}>
      <Text style={{width: 72, paddingRight: 12, textAlign: 'right', fontSize: 11, color: c.muted}}>dia todo</Text>
      <View style={{flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingRight: 20}}>
        {top.length ? top.map(i => <Pressable key={i.id} onPress={() => isHoliday(i) ? undefined : p.onOpen(i)} style={{height: 26, borderRadius: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: isHoliday(i) ? tint(HOLIDAY_COLOR, 0.18) : c.input, opacity: isTask(i) && isDone(i) ? 0.5 : 1}}>
          {isTask(i) ? <Check i={i} /> : null}
          <Text style={{fontSize: 12, color: c.text, textDecorationLine: isTask(i) && isDone(i) ? 'line-through' : 'none'}}>{i.title}</Text>
        </Pressable>) : <Text style={{fontSize: 12, color: c.muted}}>Nada para o dia todo.</Text>}
      </View>
    </View>
    <ScrollView ref={scroll} nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{flex: 1}} contentContainerStyle={{paddingTop: 10, paddingBottom: 12}}>
      <View style={{marginLeft: p.compact ? 58 : 84, marginRight: p.compact ? 12 : 20, height: 24 * HOUR, position: 'relative'}}>
        {/* 03/11/2026: segurar num horario vazio do Dia cria naquele horario (celular e site) */}
        {Array.from({length: 24}, (_, h) => <Pressable key={h} accessibilityRole="button" accessibilityLabel={'Clique para criar às ' + String(h).padStart(2, '0') + ':00'} onPress={() => p.onCreate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h), true) /* 05/11/2026 (Pedro: "quando clico nao esta abrindo pra criar"): no computador um clique cria; antes era so segurar, gesto do celular */} style={({pressed}: any) => ({position: 'absolute', left: 0, right: 0, top: h * HOUR, height: HOUR, borderTopWidth: 1, borderColor: c.line, backgroundColor: pressed ? c.accentSoft : 'transparent'})}>
          <Text style={{position: 'absolute', left: p.compact ? -50 : -64, top: -8, width: p.compact ? 42 : 52, textAlign: 'right', fontSize: 11, color: c.muted, fontVariant: ['tabular-nums']}}>{String(h).padStart(2, '0')}:00</Text>
        </Pressable>)}
        {(() => {
          // 05/11/2026 (Pedro: compromissos no mesmo horario um em cima do outro): quem se cruza no tempo divide a largura
          // em colunas lado a lado, como na agenda do Google; quem esta sozinho continua com a largura toda.
          const minVis = (26 / HOUR) * 60, slots = timed.map(i => {const st = p.start(i), a = +new Date(st), dur = Math.max(15, (endOf(i, st) - a) / 60000); return {i, a, z: a + Math.max(dur, minVis) * 60000};}).sort((x, y) => x.a - y.a || y.z - x.z);
          const lay = new Map<AgendaItem, {col: number; cols: number}>();let group: typeof slots = [], cols: number[] = [], groupEnd = -Infinity;
          const flush = () => {const n = Math.max(1, cols.length); for (const g of group) lay.get(g.i)!.cols = n; group = []; cols = [];};
          for (const sl of slots) {if (sl.a >= groupEnd) {flush(); groupEnd = -Infinity;} let col = cols.findIndex(end => end <= sl.a); if (col < 0) {col = cols.length; cols.push(sl.z);} else cols[col] = sl.z; lay.set(sl.i, {col, cols: 1}); group.push(sl); groupEnd = Math.max(groupEnd, sl.z);}
          flush();
          return timed.map(i => {
          const L = lay.get(i) || {col: 0, cols: 1};
          const st = p.start(i), s = new Date(st), e = endOf(i, st), dur = Math.max(15, (e - +s) / 60000), y = (s.getHours() + s.getMinutes() / 60) * HOUR, h = (dur / 60) * HOUR, short = dur <= 48;
          const col = colorOf(i, c.accent), done = isTask(i) && isDone(i);
          return <Pressable key={i.id + (i as any).occurrence_start} accessibilityRole="button" accessibilityLabel={i.title + ', ' + hhmm(s)} onPress={() => p.onOpen(i)}
            style={({hovered}: any) => ({position: 'absolute', left: (L.col * 100 / L.cols) + '%' as any, width: (100 / L.cols) + '%' as any, paddingRight: L.cols > 1 ? 4 : 0, top: y + 2, height: Math.max(22, h - 4), borderRadius: 9, borderLeftWidth: 3, borderColor: col, backgroundColor: tint(col, hovered ? 0.24 : 0.16), paddingHorizontal: 12, paddingVertical: short ? 0 : 7, justifyContent: short ? 'center' : 'flex-start', overflow: 'hidden', opacity: done ? 0.55 : 1})}>
            <View style={{flexDirection: 'row', alignItems: short ? 'center' : 'flex-start'}}>
              {isTask(i) ? <Check i={i} /> : null}
              <View style={{flex: 1, minWidth: 0, flexDirection: short ? 'row' : 'column', alignItems: short ? 'baseline' : 'flex-start', gap: short ? 8 : 1}}>
                <Text numberOfLines={1} style={{fontSize: 13, fontWeight: '600', color: c.text, textDecorationLine: done ? 'line-through' : 'none'}}>{i.title}</Text>
                <Text numberOfLines={1} style={{fontSize: 12, color: c.muted}}>{hhmm(s)}{(i.data as any).location ? ' · ' + (i.data as any).location : isTask(i) ? ' · Tarefa' : ''}</Text>
              </View>
            </View>
          </Pressable>;
        });})()}
        {isToday ? <View pointerEvents="none" style={{position: 'absolute', left: 0, right: 0, top: nowY, height: 2, backgroundColor: c.danger}}><View style={{position: 'absolute', left: -5, top: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger}} /></View> : null}
      </View>
    </ScrollView>
  </View>;
}

export function AgendaDesk(p: AgendaDeskProps) {
  const c = useTheme(), reduced = useReducedMotion();
  const [level, setLevel] = useState<Level>('month');
  const [anim, setAnim] = useState<null | {from: Level; fromDate: Date; dir: 'in' | 'out' | 'side'; rect: Rect | null; side: number; axis?: 'x' | 'y'}>(null);
  const axisRef = useRef<'x' | 'y'>('x');
  const stageRef = useRef<any>(null);
  const progress = useRef(new Animated.Value(1)).current;
  const stage = useRef<Rect>({x: 0, y: 0, w: 1, h: 1});
  const rects = useRef(new Map<string, Local>());
  const today = new Date();
  const year = p.selected.getFullYear();
  const marks = useYearMarks(p.api, level === 'year' || anim?.from === 'year' ? year : -1, p.active && (level === 'year' || anim?.from === 'year'));

  // itens do mes atual agrupados por dia
  const byDay = useMemo(() => {
    const m = new Map<string, AgendaItem[]>();
    for (const i of p.items) {const st = p.start(i); if (!st) continue; const k = localDateKey(st); const l = m.get(k) || []; l.push(i); m.set(k, l);}
    for (const l of m.values()) l.sort((a, b) => (isHoliday(b) ? 1 : 0) - (isHoliday(a) ? 1 : 0) || Date.parse(p.start(a)) - Date.parse(p.start(b)));
    return m;
  }, [p.items]);

  function go(next: Level, date: Date, from?: string) {
    if (anim) return;
    const prev = level, prevDate = p.selected;
    const deeper = DEPTH[next] > DEPTH[prev], shallower = DEPTH[next] < DEPTH[prev];
    p.setSelected(date);
    if (date.getFullYear() !== p.month.getFullYear() || date.getMonth() !== p.month.getMonth()) p.setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setLevel(next);
    if (reduced) return;
    const rect = deeper && from ? resolve(rects.current, from) : null;
    const side = !deeper && !shallower ? (+date >= +prevDate ? 1 : -1) : 0;
    setAnim({from: prev, fromDate: prevDate, dir: deeper ? 'in' : shallower ? 'out' : 'side', rect, side, axis: axisRef.current});
    axisRef.current = 'x';
    progress.setValue(0);
    Animated.timing(progress, {toValue: 1, duration: side ? DUR * 0.8 : DUR, easing: ease, useNativeDriver: false}).start(() => setAnim(null));
  }
  function step(n: number) {
    const d = p.selected;
    if (level === 'year') go('year', new Date(d.getFullYear() + n, d.getMonth(), 1));
    else if (level === 'month') go('month', new Date(d.getFullYear(), d.getMonth() + n, 1));
    else go('day', new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  }
  // 0.3.284: rolar a rodinha (ou deslizar dois dedos no trackpad) no Mes e no Ano passa para o proximo/anterior.
  // No Dia a rodinha continua rolando as horas.
  const wheel = useRef({acc: 0, at: 0, lock: 0});
  useEffect(() => {
    const node = stageRef.current as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function' || level === 'day') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now(), w = wheel.current;
      const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY), d = horiz ? e.deltaX : e.deltaY;
      // a inercia do trackpad (passos pequenos seguidos) nao passa varios meses de uma vez: enquanto ela durar, a trava
      // se estende; cliques de rodinha (passos grandes) continuam passando um mes por clique depois da trava
      if (now < w.lock) {if (Math.abs(d) < 50) w.lock = now + 300; w.at = now; return;}
      if (now - w.at > 250) w.acc = 0;
      w.at = now;
      w.acc += d;
      if (anim || Math.abs(w.acc) < 60) return;
      const n = w.acc > 0 ? 1 : -1; w.acc = 0; w.lock = now + 450;
      axisRef.current = horiz ? 'x' : 'y';
      step(n);
    };
    node.addEventListener('wheel', onWheel, {passive: false});
    return () => node.removeEventListener('wheel', onWheel);
  });
  useEffect(() => {
    if (!p.active || Platform.OS !== 'web' || typeof document === 'undefined') return; // 03/11/2026: no Android o window existe sem addEventListener
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; if (t && /input|textarea|select/i.test(t.tagName)) return; if (e.defaultPrevented || document.querySelector('[aria-modal="true"],[role="dialog"]')) return; // 03/11/2026: com uma janela aberta, Esc/setas sao dela, nao da Agenda atras
      if (e.key === 'Escape') {if (level === 'day') go('month', p.selected); else if (level === 'month') go('year', p.selected);}
      else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  const x: Ctx = {c, p, byDay, marks, today, go, rects: rects.current};
  const viewFor = (l: Level, d: Date) => l === 'year' ? <YearView x={x} y={d.getFullYear()} /> : l === 'month' ? <MonthView x={x} m={new Date(d.getFullYear(), d.getMonth(), 1)} /> : <DayView x={x} d={d} />;

  // ---------- animacao ----------
  // 0.3.283 (Pedro: "mais pra zoom"): zoom de verdade, como a camera chegando perto - a visao de cima AMPLIA em
  // direcao ao quadradinho clicado (ate ele ocupar a tela) enquanto a visao nova cresce de dentro dele, sempre na
  // mesma proporcao (sem achatar). Voltar faz o caminho inverso: a visao atual encolhe para dentro do quadradinho e
  // a de cima "se afasta" ate o tamanho normal.
  const S = stage.current;
  const lerp = (from: number, to: number) => progress.interpolate({inputRange: [0, 1], outputRange: [from, to]});
  const card = {position: 'absolute' as const, left: 0, top: 0, right: 0, bottom: 0, borderWidth: 1, borderColor: c.line, borderRadius: 14, backgroundColor: c.surface, overflow: 'hidden' as const};
  const zoomOf = (r: Rect) => {const k = Math.min(S.w / Math.max(1, r.w), S.h / Math.max(1, r.h)); return {k, dx: r.x + r.w / 2 - S.w / 2, dy: r.y + r.h / 2 - S.h / 2};};
  let layers: React.ReactNode;
  if (!anim) layers = <View style={card}>{viewFor(level, p.selected)}</View>;
  else if (anim.dir === 'in' || anim.dir === 'out') {
    const inward = anim.dir === 'in';
    const outer = inward ? anim.from : level, outerDate = inward ? anim.fromDate : p.selected;
    const inner = inward ? level : anim.from, innerDate = inward ? p.selected : anim.fromDate;
    const r = inward ? anim.rect : resolve(rects.current, level === 'year' ? 'm' + anim.fromDate.getMonth() : 'd' + localDateKey(anim.fromDate));
    if (r) {
      const {k, dx, dy} = zoomOf(r);
      // t: 0 = afastado (visao de cima normal), 1 = dentro (visao de dentro na tela toda)
      const t = (a0: number, a1: number) => inward ? lerp(a0, a1) : lerp(a1, a0);
      const fade = (pts: number[], vals: number[]) => progress.interpolate({inputRange: pts, outputRange: inward ? vals : [...vals].reverse()});
      layers = <>
        <Animated.View style={[card, {opacity: fade([0, 0.45, 1], [1, 1, 0]), transform: [{translateX: t(0, -k * dx)}, {translateY: t(0, -k * dy)}, {scale: t(1, k)}]}]}>{viewFor(outer, outerDate)}</Animated.View>
        <Animated.View style={[card, {opacity: fade([0, 0.35, 1], [0, 1, 1]), transform: [{translateX: t(dx, 0)}, {translateY: t(dy, 0)}, {scale: t(1 / k, 1)}]}]}>{viewFor(inner, innerDate)}</Animated.View>
      </>;
    } else {
      layers = <>
        <Animated.View style={[card, {opacity: lerp(1, 0)}]}>{viewFor(anim.from, anim.fromDate)}</Animated.View>
        <Animated.View style={[card, {opacity: lerp(0, 1), transform: [{scale: lerp(inward ? 0.94 : 1.06, 1)}]}]}>{viewFor(level, p.selected)}</Animated.View>
      </>;
    }
  } else {
    // ‹ › e setas deslizam para o lado; a rodinha do mouse desliza para cima/baixo (como rolar o calendario)
    const dx = (anim.axis === 'y' ? 40 : 24) * anim.side, tr = anim.axis === 'y' ? 'translateY' : 'translateX';
    layers = <>
      <Animated.View style={[card, {opacity: lerp(1, 0), transform: [{[tr]: lerp(0, -dx)} as any]}]}>{viewFor(anim.from, anim.fromDate)}</Animated.View>
      <Animated.View style={[card, {opacity: lerp(0, 1), transform: [{[tr]: lerp(dx, 0)} as any]}]}>{viewFor(level, p.selected)}</Animated.View>
    </>;
  }

  // ---------- barra ----------
  const d = p.selected;
  const seg = ([['year', 'Ano'], ['month', 'Mês'], ['day', 'Dia']] as [Level, string][]);
  const crumbBtn = (label: string, onPress: () => void) => <Pressable accessibilityRole="link" onPress={onPress}>{({hovered}: any) => <Text style={{fontSize: 18, fontWeight: '500', color: hovered ? c.text : c.muted}}>{label}</Text>}</Pressable>;
  const sep = <Text style={{fontSize: 18, color: c.muted}}>›</Text>;
  const ghost = (label: string, onPress: () => void, a11y?: string) => <Pressable accessibilityRole="button" accessibilityLabel={a11y || label} onPress={onPress} style={({hovered}: any) => ({height: 36, minWidth: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Text style={{color: c.text, fontSize: 14}}>{label}</Text></Pressable>;
  // 03/11/2026 (desenho 03): no celular as abas sao um seletor segmentado (trilho cinza, aba escolhida em cartao)
  const segBar = <View accessibilityRole="tablist" style={p.compact ? {flexDirection: 'row', flex: 1, padding: 3, gap: 2, borderRadius: 11, backgroundColor: c.input} : {flexDirection: 'row', borderWidth: 1, borderColor: c.line, borderRadius: 10, overflow: 'hidden'}}>
        {seg.map(([l, label]) => <Pressable key={l} accessibilityRole="tab" accessibilityState={{selected: level === l}} onPress={() => go(l, l === 'day' && level !== 'day' && d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear() ? new Date() : d)}
          style={p.compact ? {flex: 1, alignItems: 'center', height: 30, borderRadius: 9, justifyContent: 'center', backgroundColor: level === l ? c.surface : 'transparent', ...(level === l ? {boxShadow: '0 1px 2px rgba(0,0,0,0.3)'} : null)} as any : {alignItems: 'center', height: 34, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: level === l ? c.accentSoft : 'transparent'}}><Text style={{fontSize: p.compact ? 13 : 14, color: level === l ? c.text : c.muted, fontWeight: p.compact || level === l ? '600' : '400'}}>{label}</Text></Pressable>)}
      </View>;
  if (p.compact) return <View style={{flex: 1}}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10}}>{segBar}{ghost('Hoje', () => go(level, new Date()))}</View>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10}}>
      {ghost('‹', () => step(-1), 'Anterior')}
      <View style={{flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6}}>
        {level === 'year' ? <Text style={{fontSize: 18, fontWeight: '600', color: c.text}}>{d.getFullYear()}</Text> : level === 'month' ? <>{crumbBtn(String(d.getFullYear()), () => go('year', d))}{sep}<Text style={{fontSize: 18, fontWeight: '600', color: c.text}}>{MONTHS[d.getMonth()]}</Text></>
          : <>{crumbBtn(MONTHS[d.getMonth()], () => go('month', d))}{sep}<Text style={{fontSize: 18, fontWeight: '600', color: c.text}}>{d.getDate()}</Text></>}
      </View>
      {ghost('›', () => step(1), 'Próximo')}
    </View>
    <View ref={stageRef} style={{height: 520, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: c.line}} onLayout={e => {const l = e.nativeEvent.layout; stage.current = {x: 0, y: 0, w: l.width, h: l.height};}}>{layers}</View>
  </View>;
  return <View style={{flex: 1}}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12}}>
      {ghost('Hoje', () => go(level, new Date()))}
      {ghost('‹', () => step(-1), 'Anterior')}
      {ghost('›', () => step(1), 'Próximo')}
      <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 6, marginLeft: 8}}>
        {level === 'year' ? <Text style={{fontSize: 18, fontWeight: '600', color: c.text}}>{d.getFullYear()}</Text> : <>
          {crumbBtn(String(d.getFullYear()), () => go('year', d))}{sep}
          {level === 'month' ? <Text style={{fontSize: 18, fontWeight: '600', color: c.text}}>{MONTHS[d.getMonth()]}</Text> : <>
            {crumbBtn(MONTHS[d.getMonth()], () => go('month', d))}{sep}
            <Text style={{fontSize: 18, fontWeight: '600', color: c.text}}>{d.getDate()}</Text>
          </>}
        </>}
      </View>
      <View style={{flex: 1}} />
      <View accessibilityRole="tablist" style={{flexDirection: 'row', borderWidth: 1, borderColor: c.line, borderRadius: 10, overflow: 'hidden'}}>
        {seg.map(([l, label]) => <Pressable key={l} accessibilityRole="tab" accessibilityState={{selected: level === l}} onPress={() => go(l, l === 'day' && level !== 'day' && d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear() ? new Date() : d)}
          style={{height: 34, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: level === l ? c.accentSoft : 'transparent'}}><Text style={{fontSize: 14, color: level === l ? c.text : c.muted, fontWeight: level === l ? '600' : '400'}}>{label}</Text></Pressable>)}
      </View>
    </View>
    <View ref={stageRef} style={{flex: 1, minHeight: 520, borderRadius: 14, overflow: 'hidden'}} onLayout={e => {const l = e.nativeEvent.layout; stage.current = {x: 0, y: 0, w: l.width, h: l.height};}}>{layers}</View>
  </View>;
}
