// 0.3.292 (Inicio novo do site, prototipo aprovado): embaixo da saudacao, o cartao "Seu dia" (frase da Sofia,
// atalhos e a linha do tempo do dia) e o resumo de tudo em blocos do mesmo tamanho. So o Price Tracker passa
// sozinho pelos produtos; o resto fica parado no item mais importante (decisao do Pedro: menos movimento).
// Medidas em px de computador (metro: FLUID - so o fator da tela).
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, Pressable, ScrollView, Text, View, useWindowDimensions} from 'react-native';
import {ShimmerBlock, ShimmerGroup, LoadingLines} from '../components/Loading';
import {goalStats, type GoalNumbers} from '../components/GoalProgress';
import {useTheme} from '../lib/theme';
import {uiScale} from '../web/desktop-scale';
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
const timed = (r: DayRecord) => {if (/^\d{4}-\d{2}-\d{2}$/.test(r.date) || (r.original as any)?.data?.calendar_all_day) return false; const d = new Date(r.date); return !(d.getHours() === 0 && d.getMinutes() === 0); /* 0.3.295: 00:00 = sem hora (nao estica a linha do tempo) */};

export type HomeBriefProps = {
  data: HomeBriefData; today: DayRecord[]; all: DayRecord[]; tasks: Task[]; series: MonitorWidgetRow[] | null; goal: GoalNumbers | null; masked: boolean; onToggleMask?: () => void;
  onOpenItem: (r: DayRecord) => void; onOpenTasks: () => void; onOpenTask?: (id: string) => void; onToggleTask: (t: Task) => void;
  onOpenModule: (id: string) => void; onOpenMonitoring: () => void; onOpenAgenda: () => void;
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

/** Os blocos crescem ate o fim da tela (com 32 px de respiro), sem passar dela: altura de cada fileira. */
let lastTop = 0, lastBrief = Math.round(170 * uiScale()); // o esqueleto e o Inicio pronto usam a MESMA medida (a troca nao mexe nada)
function useRowHeight(root: React.RefObject<View | null>, briefH: number) {
  const {height} = useWindowDimensions(), [top, setTop] = useState(lastTop);
  useEffect(() => {const el: any = root.current; if (el && typeof el.getBoundingClientRect === 'function') {const sc = el.closest ? el.closest('[data-testid="home-scroll"]') : null; const t = Math.round(el.getBoundingClientRect().top + (sc ? sc.scrollTop : 0)); if (t > 0 && el.getBoundingClientRect().height > 0) {lastTop = t; setTop(t);}}});
  const avail = height - top - 32 - briefH - 24;
  return Math.max(150, Math.min(300, Math.floor(avail / 2)));
}

export function HomeBrief(p: HomeBriefProps) {
  const c = useTheme(), now = new Date(), root = useRef<View>(null), [briefH, setBriefH] = useState(lastBrief);
  const rowH = useRowHeight(root, briefH);
  const open = useMemo(() => p.tasks.filter(t => t.state !== 'done'), [p.tasks]);
  const important = open.filter(isImportant);
  const items = useMemo(() => p.today.filter(r => !isHoliday((r.original || {}) as any)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), [p.today]);
  const upcoming = items.filter(r => timed(r) && Date.parse(r.date) >= now.getTime() - 5 * 60000);
  const next = upcoming[0] || null;
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
    <View testID="home-brief" onLayout={e => {const h = Math.round(e.nativeEvent.layout.height); if (h > 0) {lastBrief = h; setBriefH(h);}}} style={{...card, borderRadius: 22, padding: 20, paddingBottom: 14, backgroundColor: c.surface}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <View style={{width: 24, height: 24, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center'}}><Text style={{color: c.onAccent, fontWeight: '700', fontSize: 12}}>S</Text></View>
        <Text style={{color: c.text, fontWeight: '600', fontSize: 14}}>Seu dia</Text>
        <View style={{flex: 1}} />
        <Pressable accessibilityRole="link" onPress={p.onOpenAgenda}><Text style={{color: c.muted, fontSize: 12}}>Abrir agenda</Text></Pressable>
      </View>
      <Timeline bills={(p.data.dues || []).map(d => ({id: d.id || d.title, title: d.title, date: d.date, amount: d.amount, late: d.date < new Date().toISOString().slice(0, 10)}))} masked={p.masked} onBill={() => p.onOpenModule('finance')} items={timelineItems} next={next} onEdit={r => r.isTask && p.onOpenTask ? p.onOpenTask(String((r.original as any)?.id || r.id.replace(/^task:/, ''))) : p.onOpenItem(r)} />
    </View>
    <View style={{flexDirection: 'row', gap: 12}}>
      <AgendaTile style={{flex: 2, height: rowH}} card={card} upcoming={nextItems} onOpen={p.onOpenItem} onOpenAgenda={p.onOpenAgenda} />
      <TasksTile style={{flex: 1, height: rowH}} card={card} open={open} onOpen={p.onOpenTasks} onDone={p.onToggleTask} />
      <RotinaTile style={{flex: 1, height: rowH}} card={card} data={p.data} onOpen={() => p.onOpenModule('capsules')} />
    </View>
    <View style={{flexDirection: 'row', gap: 12}}>
      <FinanceTile style={{flex: 1, height: rowH}} card={card} data={p.data} goal={p.data.goal || p.goal} masked={p.masked} onToggleMask={p.onToggleMask} onOpen={() => p.onOpenModule('finance')} />
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
function Timeline({items, next, onEdit, bills = [], masked = false, onBill}: {items: DayRecord[]; next: DayRecord | null; onEdit: (r: DayRecord) => void; bills?: BillMark[]; masked?: boolean; onBill?: () => void}) {
  const c = useTheme(), [w, setW] = useState(0), [hover, setHover] = useState(-1), [pin, setPin] = useState(-1), [start, setStart] = useState(7), box = useRef<View>(null);
  const day0 = useMemo(() => {const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();}, []);
  const hoursOf = (d: Date) => (d.getTime() - day0) / 3600000;
  const pos = (d: Date) => (hoursOf(d) - start) / SPAN;
  const nowX = pos(new Date());
  const shown = items.filter(r => {const x = pos(new Date(r.date)); return x >= -0.01 && x <= 1.01;});
  // 0.3.303 (Pedro): conta a pagar aparece na linha do tempo com marca especial (conexao com Financas)
  const billAt = (b: BillMark) => b.late ? new Date(day0 + (start + 0.4) * 3600000) : new Date(b.date + 'T09:00:00'); // vencida: no comeco da linha
  const billsShown = bills.map(b => ({b, x: pos(billAt(b))})).filter(z => z.x >= -0.01 && z.x <= 1.01);
  const groups: {x: number; list: DayRecord[]}[] = [];
  for (const r of shown) {const x = pos(new Date(r.date)); const g = groups[groups.length - 1]; if (g && w && (x - g.x) * w < 22) g.list.push(r); else groups.push({x, list: [r]});}
  useEffect(() => {
    const el: any = box.current; if (!el || !el.addEventListener) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {e.preventDefault(); acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; const steps = Math.trunc(acc / 40); if (!steps) return; acc -= steps * 40; setPin(-1); setStart(v => Math.max(0, Math.min(24 * 3 - SPAN, v + steps)));};
    el.addEventListener('wheel', onWheel, {passive: false});
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => {if (typeof window === 'undefined' || pin < 0) return; const k = (e: KeyboardEvent) => {if (e.key === 'Escape') setPin(-1);}; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);}, [pin]);
  const label = (h: number) => {const d = new Date(day0 + h * 3600000), dd = Math.floor(h / 24); return (dd === 0 ? '' : dd === 1 ? 'amanhã ' : d.toLocaleDateString('pt-BR', {weekday: 'short'}).replace('.', '') + ' ') + String(d.getHours()).padStart(2, '0') + ':00';};
  const desc = (r: DayRecord) => {const o: any = r.original || {}; return String(o.description || o.data?.description || o.content || o.data?.location || '').trim();};
  const shownGroup = pin >= 0 ? pin : hover;
  // 0.3.302 (Pedro): sem os botoes de atalho; cada bolinha tem o rotulo fixo em cima (horario e nome), em duas fileiras
  const LW = 150, rowsAt: number[][] = [[], []], place: Record<number, number> = {};
  const billRow: Record<number, number> = {};
  billsShown.forEach((z, i) => {const px = z.x * (w || 1); for (const r of [0, 1]) {if (rowsAt[r].every(q => Math.abs(q - px) >= LW + 8)) {rowsAt[r].push(px); billRow[i] = r; break;}}});
  groups.forEach((g, i) => {const px = g.x * (w || 1); for (const r of [0, 1]) {if (rowsAt[r].every(q => Math.abs(q - px) >= LW + 8)) {rowsAt[r].push(px); place[i] = r; break;}}});
  const OFF = 44; // espaco dos rotulos em cima da linha
  return <View ref={box} style={{marginTop: 12, height: 56 + OFF}} onLayout={e => {const v = e.nativeEvent.layout.width; if (v > 0) setW(v);}}>
    <View style={{position: 'absolute', left: 0, right: 0, top: 28 + OFF, height: 2, borderRadius: 1, backgroundColor: c.line}} />
    {nowX > 0 ? <View style={{position: 'absolute', left: 0, width: (Math.min(1, nowX) * 100 + '%') as any, top: 28 + OFF, height: 2, borderRadius: 1, backgroundColor: tint(c.accent, 0.45)}} /> : null}
    {[24, 48].map(m => {const x = (m - start) / SPAN; return x > 0 && x < 1 ? <View key={m} style={{position: 'absolute', left: (x * 100 + '%') as any, top: 20 + OFF, width: 1, height: 18, backgroundColor: c.line}} /> : null;})}
    {groups.map((g, i) => {
      const isNext = !!next && g.list.includes(next), many = g.list.length > 1, size = isNext ? 16 : many ? 20 : 12;
      // 0.3.304: lembrete tem marca propria (sino num circulo contornado), diferente de compromisso e de conta
      if (!many && g.list[0].kind === 'reminder') return <Pressable key={i} accessibilityRole="button" accessibilityLabel={'Lembrete ' + hhmm(new Date(g.list[0].date)) + ' ' + g.list[0].title} onPress={() => setPin(p => p === i ? -1 : i)} hitSlop={12} onHoverIn={() => setHover(i)} onHoverOut={() => setHover(h => h === i ? -1 : h)}
        style={({hovered}: any) => ({position: 'absolute', left: (g.x * 100 + '%') as any, top: 29 + OFF - 11, width: 22, height: 22, marginLeft: -11, borderRadius: 11, borderWidth: 2, borderColor: REMIND, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', transform: [{scale: hovered ? 1.12 : 1}], boxShadow: '0 0 0 4px ' + tint(REMIND, 0.16)} as any)}>
        <Icon name="bell" size={11} color={REMIND} />
      </Pressable>;
      return <Pressable key={i} accessibilityRole="button" accessibilityLabel={g.list.map(r => hhmm(new Date(r.date)) + ' ' + r.title).join(', ')} onPress={() => setPin(p => p === i ? -1 : i)} hitSlop={14} onHoverIn={() => setHover(i)} onHoverOut={() => setHover(h => h === i ? -1 : h)}
        style={{position: 'absolute', left: (g.x * 100 + '%') as any, top: 29 + OFF - size / 2, width: size, height: size, marginLeft: -size / 2, borderRadius: size / 2, borderWidth: 3, borderColor: c.surface, backgroundColor: colorOf(g.list[0], c.accent), alignItems: 'center', justifyContent: 'center'}}>
        {many && !isNext ? <Text style={{fontSize: 10, fontWeight: '700', color: c.onAccent}}>{g.list.length}</Text> : null}
      </Pressable>;
    })}
    {billsShown.map((z, i) => <React.Fragment key={'b' + z.b.id + i}>
      <Pressable accessibilityRole="button" accessibilityLabel={'Conta: ' + z.b.title + (z.b.late ? ', vencida' : '')} onPress={onBill} hitSlop={12} style={({hovered}: any) => ({position: 'absolute', left: (z.x * 100 + '%') as any, top: 29 + OFF - 11, width: 22, height: 22, marginLeft: -11, borderRadius: 7, transform: [{rotate: '45deg'}, {scale: hovered ? 1.12 : 1}], backgroundColor: z.b.late ? c.danger : '#E8B04A', borderWidth: 3, borderColor: c.surface, alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 4px ' + tint(z.b.late ? '#F5A0AE' : '#E8B04A', 0.18)} as any)}>
        <Text style={{transform: [{rotate: '-45deg'}], fontSize: 10, fontWeight: '700', color: '#17122A'}}>$</Text>
      </Pressable>
      {billRow[i] != null ? <View pointerEvents="none" style={{position: 'absolute', left: Math.max(0, Math.min((w || 1) - LW, z.x * (w || 1) - LW / 2)), top: billRow[i] === 0 ? OFF - 2 : OFF - 26, width: LW, alignItems: 'center'}}>
        <Text numberOfLines={1} style={{fontSize: 12, fontWeight: '600', color: z.b.late ? c.danger : '#E8B04A', backgroundColor: tint(z.b.late ? '#F5A0AE' : '#E8B04A', 0.14), borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden'}}>{z.b.title} · {masked ? 'R$ •••' : brl(z.b.amount)}</Text>
      </View> : null}
    </React.Fragment>)}
    {shownGroup >= 0 && groups[shownGroup] ? (() => {
      // previa (mouse em cima) ou cartao fixo (clique): titulo, descricao e o lapis para editar
      const g = groups[shownGroup], pinned = pin >= 0, W = pinned ? 300 : 230, x = Math.max(0, Math.min((w || 1) - W, g.x * (w || 1) - W / 2));
      return <View pointerEvents={pinned ? 'auto' : 'none'} style={{position: 'absolute', left: x, bottom: 40, width: W, zIndex: 6, backgroundColor: c.bg, borderRadius: 12, paddingVertical: pinned ? 10 : 8, paddingHorizontal: 12, gap: pinned ? 10 : 4, boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 10px 30px rgba(0,0,0,0.45)'} as any}>
        {g.list.slice(0, pinned ? 4 : 5).map((r, k) => <View key={k} style={{gap: 2}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: colorOf(r, c.accent)}} />
            <Text style={{fontSize: 12, color: c.muted, fontVariant: ['tabular-nums']}}>{hhmm(new Date(r.date))}</Text>
            <Text numberOfLines={pinned ? 2 : 1} style={{flex: 1, fontSize: 12, color: c.text, fontWeight: pinned ? '600' : '400'}}>{r.title}</Text>
            {pinned ? <Pressable accessibilityRole="button" accessibilityLabel={'Editar ' + r.title} onPress={() => {setPin(-1); onEdit(r);}} hitSlop={8} style={({hovered}: any) => ({width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Icon name="edit" size={14} color={c.muted} /></Pressable> : null}
          </View>
          {pinned && desc(r) ? <Text numberOfLines={3} style={{fontSize: 12, lineHeight: 17, color: c.muted, marginLeft: 14}}>{desc(r)}</Text> : null}
        </View>)}
        {g.list.length > (pinned ? 4 : 5) ? <Text style={{fontSize: 11, color: c.muted}}>+{g.list.length - (pinned ? 4 : 5)} mais</Text> : null}
      </View>;
    })() : null}
    {groups.map((g, i) => place[i] == null ? null : <View key={'l' + i} pointerEvents="none" style={{position: 'absolute', left: Math.max(0, Math.min((w || 1) - LW, g.x * (w || 1) - LW / 2)), top: place[i] === 0 ? OFF - 2 : OFF - 26, width: LW, alignItems: 'center', opacity: shownGroup >= 0 && shownGroup !== i ? 0.35 : 1}}>
      <Text numberOfLines={1} style={{fontSize: 12, color: g.list.length === 1 && g.list[0].kind === 'reminder' ? REMIND : next && g.list.includes(next) ? c.text : c.muted, fontWeight: next && g.list.includes(next) ? '600' : '400', backgroundColor: next && g.list.includes(next) ? tint(c.accent, 0.14) : 'transparent', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden', fontVariant: ['tabular-nums']}}>{hhmm(new Date(g.list[0].date))} {g.list.length > 1 ? g.list.length + ' itens' : g.list[0].title}</Text>
    </View>)}
    {nowX >= 0 && nowX <= 1 ? <View pointerEvents="none" style={{position: 'absolute', left: (nowX * 100 + '%') as any, top: 18 + OFF, width: 2, height: 22, marginLeft: -1, borderRadius: 1, backgroundColor: c.danger}} /> : null}
    {[0, 0.25, 0.5, 0.75, 1].map(f => <Text key={f} style={{position: 'absolute', top: 42 + OFF, left: (f * 100 + '%') as any, transform: [{translateX: f === 0 ? 0 : f === 1 ? -60 : -30}], width: f === 1 ? 60 : undefined, textAlign: f === 1 ? 'right' : 'left', fontSize: 11, color: c.muted, fontVariant: ['tabular-nums']}}>{label(Math.round(start + f * SPAN))}</Text>)}
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

function AgendaTile({style, card, upcoming, onOpen, onOpenAgenda}: {style: any; card: any; upcoming: DayRecord[]; onOpen: (r: DayRecord) => void; onOpenAgenda: () => void}) {
  const c = useTheme(), list = upcoming; // 0.3.302: todos (rolagem invisivel)
  return <View style={[card, {gap: 6, overflow: 'hidden', paddingVertical: 16}, style]}>
    <TileHead icon="calendar" color="#8fb4ff" name="Agenda · próximos" onOpen={onOpenAgenda} />
    {list.length ? <ScrollView keyboardShouldPersistTaps="handled" style={{flex: 1, marginTop: 2}} showsVerticalScrollIndicator={false}>{/* rolagem invisivel para ver os outros (0.3.295) */}{list.map((r, i) => <Pressable key={r.id + i} onPress={() => onOpen(r)} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 10, height: 31, borderTopWidth: i ? 1 : 0, borderColor: c.line, backgroundColor: hovered ? c.input : 'transparent', borderRadius: 6})}>
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
function FinanceTile({style, card, data, goal, masked, onOpen, onToggleMask}: {style: any; card: any; data: HomeBriefData; goal: GoalNumbers | null; masked: boolean; onOpen: () => void; onToggleMask?: () => void}) {
  // 0.3.296 (Pedro): guardado e quanto falta da meta sempre visiveis; a conta que vence primeiro numa linha
  const c = useTheme(), dues = data.dues, first = dues?.[0], today = new Date().toISOString().slice(0, 10);
  const when = (d: string) => d === today ? 'vence hoje' : d < today ? 'venceu ' + d.slice(8, 10) + '/' + d.slice(5, 7) : 'vence ' + d.slice(8, 10) + '/' + d.slice(5, 7);
  const money = (v: number) => masked ? 'R$ •••••' : brl(v);
  const g = goal && goal.target > 0 ? goalStats(goal) : null;
  return <View style={[card, {gap: 6, overflow: 'hidden', paddingVertical: 16}, style]}>
    {first && first.date <= today ? <View style={{position: 'absolute', top: 23, right: onToggleMask ? 50 : 18, width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger, boxShadow: '0 0 0 4px ' + tint('#F5A0AE', 0.15)} as any} /> : null}
    <TileHead icon="wallet" color="#b49ae6" name="Finanças" onOpen={onOpen} />
    {onToggleMask ? <Pressable accessibilityRole="button" accessibilityLabel={masked ? 'Mostrar valores' : 'Esconder valores'} onPress={onToggleMask} hitSlop={8} style={({hovered}: any) => ({position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><Icon name={masked ? 'eyeOff' : 'eye'} size={16} color={c.muted} /></Pressable> : null}
    {data.spend && data.spend.available > 0 ? <View style={{marginTop: 10, gap: 4}}>
      {/* 0.3.305 (Pedro): no lugar do "Sobra ate", o Controle de gastos do mes (o mesmo card de Financas) */}
      <Text style={{fontSize: 12, color: c.muted}}>Gastos de {new Date().toLocaleDateString('pt-BR', {month: 'long'})}</Text>
      <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 6}}>
        <Text numberOfLines={1} style={{fontSize: 24, fontWeight: '600', letterSpacing: -0.6, color: c.text, fontVariant: ['tabular-nums']}}>{money(data.spend.spent)}</Text>
        <Text style={{fontSize: 12, color: c.muted}}>de {money(data.spend.available)}</Text>
        <View style={{flex: 1}} />
        <Text style={{fontSize: 12, fontWeight: '600', color: data.spend.pct > 100 ? c.danger : data.spend.pct >= 80 ? '#E8B04A' : c.text}}>{data.spend.pct}%</Text>
      </View>
      <View style={{height: 5, borderRadius: 3, backgroundColor: c.line}}><View style={{height: 5, borderRadius: 3, width: (Math.min(100, Math.max(1, data.spend.pct)) + '%') as any, backgroundColor: data.spend.pct > 100 ? c.danger : data.spend.pct >= 80 ? '#E8B04A' : '#88CFB8'}} /></View>
    </View> : null}
    {g && goal ? <View style={{marginTop: 'auto', gap: 5} as any}>
      {/* meta numa linha: nome, guardado de quanto e a porcentagem (0.3.306) */}
      <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 8}}><Text numberOfLines={1} style={{flex: 1, fontSize: 12, color: c.muted}}>{goal.name || 'Meta'}</Text><Text numberOfLines={1} style={{fontSize: 12, color: c.text, fontVariant: ['tabular-nums']}}>{money(goal.saved)} de {money(goal.target)} · {Math.round(g.pct * 100)}%</Text></View>
      <View style={{height: 5, borderRadius: 3, backgroundColor: c.line}}><View style={{height: 5, borderRadius: 3, width: (Math.max(1, g.pct * 100) + '%') as any, backgroundColor: '#b49ae6'}} /></View>
      {first ? <Text numberOfLines={1} style={{fontSize: 12, color: first.date <= today ? c.danger : c.muted}}>{first.title + ' ' + when(first.date) + ' · ' + money(first.amount)}</Text> : null}
    </View> : first ? <View style={{marginTop: 'auto', gap: 4} as any}>
      <Big value={String(dues!.length)} unit={dues!.length === 1 ? 'conta na semana' : 'contas na semana'} />
      <Line text={first.title + ' ' + when(first.date) + ' · ' + money(first.amount)} />
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
    <View style={{flexDirection: 'row', gap: 12}}>{tile(1)}{tile(1)}{tile(1)}{tile(1)}</View>
  </View></ShimmerGroup>;
}
