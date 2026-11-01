// 0.3.269 — Finanças no SITE (protótipo aprovado em 31/10: docs/prototipos-2026-10-31/financas.html). Só no computador;
// o celular continua com a Finanças de antes. Todas as regras de número são as mesmas do Resumo (copiadas do HomeTab:
// Saldo como banco, Guardado fora do saldo, Previsto pela regra do dia do pagamento, Controle de gastos como antes,
// cartão/fatura pelo fechamento). O mês do topo vale para todas as telas: mês fechado = só consulta; mês futuro = programado.
import React, {useCallback, useMemo, useState} from 'react';
import {Image, Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {useTheme} from '../../lib/theme';
import {PALETTE} from '../../lib/palette';
import type {SofiaApi} from '../../lib/api';
import {errorText} from '../../lib/chat-model';
import {appAlert} from '../../lib/app-alert';
import {useValuesHidden} from '../../lib/values-mask';
import {Icon, type IconName} from '../../components/Icon';
import {Presence} from '../../components/Presence';
import {contextMenu} from '../../components/ContextMenu';
import {Chip, Dialog, GhostButton, PrimaryButton, fold, useToast} from '../../components/AppKit';
import {DeskTabs} from '../../components/UI';
import {EXPENSE_CATEGORIES, INCOME_CATEGORIES, addDays, addMonths, balanceAsOf, budgetProgress, categoryOf, cycleRange, dayIn, daysIn, effectiveCycleDay, expandRecurring, installmentPlan, invoiceForMonth, invoiceMonth, manualDues, monthControl, monthLabel, monthOf, moneySplit, reserveFor, reserveHistory, simpleForecast, todayISO, totalBalance, type Account, type Card, type Tx} from '../../lib/finance';
import {money} from '../../lib/monitoring';
import {saveEntity, uid, type Data, type Refund} from './core';
import {DueRow} from './Home';
import {ReserveHistorySheet, ReserveSheet, PendingTab} from './Setup';
import {RefundsTab} from './Transactions';
import {ReportsTab} from './Reports';

export type DeskView = 'home' | 'bills' | 'cards' | 'budgets' | 'reserve' | 'refunds' | 'reports' | 'history';
const NAV: [DeskView, string, IconName][] = [['home', 'Resumo e extrato', 'home'], ['bills', 'Contas', 'receipt'], ['cards', 'Cartões', 'card'], ['budgets', 'Orçamentos', 'chartPie'], ['reserve', 'Reserva', 'piggy'], ['refunds', 'Devoluções', 'refund']];
const NAV2: [DeskView, string, IconName][] = [['reports', 'Relatórios', 'chartBar'], ['history', 'Histórico', 'history']];
const longDay = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {weekday: 'long', day: 'numeric', month: 'long'});
const short = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const sign = (t: Tx) => t.kind === 'income' ? 1 : t.kind === 'transfer' ? 0 : -1;

/** "mercado 87,50", "tv 2.400 10x cartão", "uber 23 nubank" -> lançamento */
export function parseQuick(raw: string, cards: Card[], accounts: Account[]): {desc: string; amount: number | null; parts: number; card: Card | null; account: Account | null; kind: 'expense' | 'income'; category: string} {
  let s = ' ' + raw.trim() + ' ';
  const income = /\b(recebi|receita|salario|salário|entrada|pix recebido|reembolso)\b/i.test(s);
  let parts = 1; const pm = s.match(/\s(\d{1,2})\s*x\b/i); if (pm) { parts = Math.max(1, Math.min(48, Number(pm[1]))); s = s.replace(pm[0], ' '); }
  let amount: number | null = null; const am = s.match(/\s(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?|\d+\.\d{1,2})(?=\s)/i);
  if (am) { const v = am[1]; amount = Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : /\.\d{3}$/.test(v) ? v.replace(/\./g, '') : v); s = s.replace(am[0], ' '); }
  const f = ' ' + fold(s) + ' ';
  let card = cards.filter(c => !c.archived).find(c => f.includes(' ' + fold(c.name) + ' ')) || null;
  if (!card && /\s(cartao|credito|no cartao)\s/.test(f)) card = cards.filter(c => !c.archived)[0] || null;
  const account = card ? null : accounts.filter(a => !a.archived).find(a => f.includes(' ' + fold(a.name) + ' ')) || null;
  for (const w of [card?.name, account?.name, 'cartão', 'cartao', 'crédito', 'credito', 'no', 'na', 'com', 'de'].filter(Boolean) as string[]) s = s.replace(new RegExp('\\s' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s)', 'ig'), ' ');
  const desc = s.replace(/\s+/g, ' ').trim();
  const K: [string, RegExp][] = [['Mercado', /mercado|supermerc|feira|hortifruti|atacad|assai|carrefour|pao de acucar/], ['Alimentação', /ifood|restaurante|lanche|almoco|jantar|pizza|padaria|cafe|burguer|hamburg/], ['Transporte', /uber|99|onibus|metro|bilhete|gasolina|combustivel|estaciona|pedagio/], ['Saúde', /farmacia|remedio|medico|consulta|exame|drogaria|dentista/], ['Assinaturas', /netflix|spotify|openai|chatgpt|prime|disney|youtube|icloud|google one|assinatura/], ['Moradia', /aluguel|condominio|luz|agua|gas|internet|enel|sabesp/], ['Lazer', /cinema|show|bar|ingresso|jogo|steam/], ['Educação', /curso|livro|escola|faculdade|udemy/], ['Compras', /tv|celular|roupa|tenis|loja|amazon|mercado livre|shopee|kabum|presente/], ['Pets', /pet|racao|veterin/], ['Viagem', /hotel|passagem|airbnb|viagem/]];
  const category = income ? (/salario/.test(f) ? 'Salário' : /reembolso/.test(f) ? 'Reembolso' : 'Outros') : (K.find(([, re]) => re.test(f))?.[0] || 'Outros');
  return {desc: desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : '', amount, parts, card, account, kind: income ? 'income' : 'expense', category};
}

type Props = {api: SofiaApi; d: Data; full: Data; month: string; setMonth: (m: string) => void; accountId: string; isPrimary: boolean; account: Account | undefined; onPickAccount: () => void; reload: () => Promise<void>;
  onTx: (t: Partial<Tx>) => void; onBill: (t: Tx | 'new', scope?: 'month' | 'series') => void; onNewBill: (flow: 'expense' | 'income') => void; onManage: () => void; view: DeskView; setView: (v: DeskView) => void; pendingSide: 'pagar' | 'receber'; setPendingSide: (s: 'pagar' | 'receber') => void; warning: string};

export function FinanceDesk(p: Props) {
  const {api, d, full, month, setMonth, accountId, isPrimary, reload, onTx, view, setView} = p;
  const c = useTheme(), today = todayISO(), curMonth = monthOf(today), past = month < curMonth, future = month > curMonth, {toast, toastNode} = useToast();
  const [hide, setHide] = useValuesHidden(api), show = (v: number) => hide ? 'R$ •••••' : money(v);
  /* ---------- os mesmos numeros do Resumo (HomeTab) ---------- */
  const reserve = reserveFor(d.goals, accountId, isPrimary);
  const split = useMemo(() => reserve ? moneySplit(reserve, d.moves || [], d.accounts, d.txs, d.cards, month, today, manualDues(d.txs, accountId, today, 45)) : null, [reserve, d, accountId, month, today]);
  const net = split ? split.net : 0, total = Math.round((totalBalance(d.accounts, d.txs) - net) * 100) / 100, plan = split?.planned || 0;
  const cycleDay = useMemo(() => effectiveCycleDay(d.accounts, d.txs, accountId), [d, accountId]);
  const aporteInCycle = useCallback((range: {start: string; end: string}) => {
    const planDay = split?.planDay || 0, months: string[] = [];
    for (let m = monthOf(range.start); m <= monthOf(range.end); m = addMonths(m, 1)) months.push(m);
    const due = planDay ? months.filter(m => { const dt = dayIn(m, Math.min(planDay, daysIn(m))); return dt >= range.start && dt <= range.end; }).length * plan : 0;
    const done = reserve ? (d.moves || []).filter(m => m.goalId === reserve.id && m.direction === 'in' && m.entity?.state !== 'archived' && m.date >= range.start && m.date <= range.end).reduce((t, m) => t + m.amount, 0) : 0;
    return Math.round(Math.max(due, done) * 100) / 100;
  }, [split?.planDay, plan, reserve, d]);
  const forecast = useMemo(() => {
    const ref = month === curMonth ? today : dayIn(month, 1), cur = cycleRange(cycleDay, ref), nextPay = addDays(cur.end, 1);
    const daysLeft = Math.round((Date.parse(nextPay + 'T12:00:00Z') - Date.parse(ref + 'T12:00:00Z')) / 864e5), r = daysLeft <= 5 ? cycleRange(cycleDay, nextPay) : cur;
    return {...simpleForecast(d.txs, d.cards, r, accountId, today, aporteInCycle(r)), end: r.end};
  }, [d, month, cycleDay, accountId, aporteInCycle, today, curMonth]);
  const manualStart = useMemo(() => { const accs = accountId ? d.accounts.filter(a => a.id === accountId) : d.accounts.filter(a => a.include && !a.archived); return accs.length && accs.every(a => typeof a.monthStarts[month] === 'number') ? accs.reduce((t, a) => t + a.monthStarts[month], 0) : null; }, [d, accountId, month]);
  const controlSaldo = useMemo(() => past ? balanceAsOf(d.accounts.filter(a => a.include && !a.archived && (!accountId || a.id === accountId)), d.txs, d.moves || [], reserve?.id || '', dayIn(month, daysIn(month))) : total, [d, reserve, month, accountId, total, past]);
  const spendRaw = useMemo(() => monthControl(d.txs, d.moves || [], reserve?.id || '', month, accountId, controlSaldo, manualStart), [d, reserve, month, accountId, controlSaldo, manualStart]);
  // porcentagem do que ja foi gasto do disponivel (o monthControl guarda a fracao que SOBRA)
  const spend = {...spendRaw, pct: spendRaw.available > 0 ? Math.round(spendRaw.spent / spendRaw.available * 100) : 0};
  const invoices = useMemo(() => d.cards.filter(cd => !cd.archived).map(cd => invoiceForMonth(cd, d.txs, month, today)).filter(i => i.total - i.paid > 0.004 && i.status !== 'paga'), [d, month, today]);
  const goalPct = reserve && reserve.target ? Math.round(Math.min(100, (split?.saved || 0) / reserve.target * 100)) : null;
  const refunds = (full.refunds || []).filter(r => r.state === 'pending' && (!accountId || !r.accountId || r.accountId === accountId));
  const refundOf = (t: Tx) => (full.refunds || []).find(r => r.expenseId === t.id);
  /* ---------- extrato do mes (com o programado nos meses futuros) ---------- */
  const monthItems = useMemo(() => {
    const own = d.txs.filter(t => monthOf(t.date) === month && t.entity?.state !== 'archived');
    const prog = future ? expandRecurring(d.txs, month).filter(t => t.virtual && !own.some(o => o.seriesId && o.seriesId === t.seriesId)) : [];
    return [...own, ...prog].sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
  }, [d, month, future]);
  const [tabState, setTab] = useState<'month' | 'past'>('month'), [q, setQ] = useState(''), [filter, setFilter] = useState('all');
  const fil = (t: Tx) => filter === 'all' || (filter === 'out' && t.kind === 'expense') || (filter === 'in' && t.kind === 'income') || (filter === 'card' && !!t.cardId) || (filter === 'inst' && t.installments > 1) || (filter === 'refund' && !!refundOf(t)) || (filter === 'nobal' && !!t.noBalance);
  const shown = monthItems.filter(t => fil(t) && (!q.trim() || fold(t.desc + ' ' + t.category).includes(fold(q))));
  const inSum = monthItems.filter(t => t.kind === 'income' && !t.noBalance).reduce((s, t) => s + t.amount, 0), outSum = monthItems.filter(t => t.kind === 'expense' && !t.noBalance).reduce((s, t) => s + t.amount, 0);
  const days = useMemo(() => { const g = new Map<string, Tx[]>(); shown.forEach(t => { if (!g.has(t.date)) g.set(t.date, []); g.get(t.date)!.push(t); }); return [...g.entries()]; }, [shown]);
  // estado das partes da tela fica aqui (as partes sao funcoes chamadas, nao componentes: o campo nao perde o foco)
  const [openM, setOpenM] = useState(''), [cid, setCid] = useState(''), [ct, setCt] = useState<'cur' | 'past'>('cur'), [cat, setCat] = useState(''), [limit, setLimit] = useState('');
  const [forecastOpen, setForecastOpen] = useState(false), [reserveSheet, setReserveSheet] = useState<'setup' | 'in' | 'out' | 'plan' | 'goal' | 'adjust' | null>(null), [histOpen, setHistOpen] = useState(false);

  /* ---------- lancar ---------- */
  const [quick, setQuick] = useState(''), [busy, setBusy] = useState(false), [receipt, setReceipt] = useState<null | {desc: string; amount: number; date: string; category: string; items: string; preview: string}>(null), [drag, setDrag] = useState(false);
  const pq = quick.trim() ? parseQuick(quick, d.cards, d.accounts) : null;
  async function launch(input: {desc: string; amount: number; parts: number; card: Card | null; accountId: string; kind: 'expense' | 'income'; category: string; date?: string; note?: string}) {
    setBusy(true);
    try {
      const date = input.date || (month === curMonth ? today : dayIn(month, 1)), now = new Date(), time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const base: Record<string, any> = {kind: input.kind, amount: input.amount, date, category: input.category, account_id: input.card ? '' : input.accountId, to_account_id: '', card_id: input.card ? input.card.id : '', invoice_month: input.card ? invoiceMonth(input.card, date) : '', paid: input.card ? false : true, recurrence: 'none', time, __content: input.note || '', no_balance: false};
      if (input.parts > 1) { const series = uid(); for (const x of installmentPlan(input.amount, input.parts, date)) await saveEntity(api, 'fin_tx', input.desc + ' (' + x.installment + '/' + input.parts + ')', {...base, amount: x.amount, date: x.date, invoice_month: input.card ? invoiceMonth(input.card, x.date) : '', paid: input.card ? false : x.installment === 1, series_id: series, installment: x.installment, installments: input.parts}); }
      else await saveEntity(api, 'fin_tx', input.desc, base);
      await reload();
      const bp = input.kind === 'expense' ? budgetProgress(d.budgets, [...d.txs, {kind: 'expense', amount: input.amount, date, category: input.category} as Tx], monthOf(date)).find(b => b.budget.category === input.category) : null;
      toast((input.parts > 1 ? input.parts + 'x de ' + money(Math.round(input.amount / input.parts * 100) / 100) + (input.card ? ' nas faturas do ' + input.card.name : '') : money(input.amount) + ' em ' + input.category) + (bp ? ' · ' + input.category + ' fica em ' + bp.pct + '% do orçamento' : '') + '.');
    } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }
  const submitQuick = () => { if (!pq || !pq.amount || !pq.desc) { toast('Escreva o que foi e o valor. Ex.: mercado 87,50'); return; } setQuick(''); void launch({desc: pq.desc, amount: pq.amount, parts: pq.parts, card: pq.card, accountId: pq.account?.id || accountId, kind: pq.kind, category: pq.category}); };
  async function readFile(file: File | Blob) {
    setBusy(true);
    try { const data: string = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(file); }); const r = await api.readReceipt((file as any).type || 'image/jpeg', data.slice(data.indexOf(',') + 1)); setReceipt({...r.receipt, preview: data}); }
    catch (e) { toast('Não consegui ler a nota: ' + errorText(e)); } finally { setBusy(false); }
  }
  const pickFile = () => { if (Platform.OS !== 'web') return; const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => { const f = i.files?.[0]; if (f) void readFile(f); }; i.click(); };
  const dropProps: any = Platform.OS === 'web' ? {onDragOver: (e: any) => { e.preventDefault(); setDrag(true); }, onDragLeave: () => setDrag(false), onDrop: (e: any) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer?.files?.[0]; if (f) void readFile(f); }} : {};

  /* ---------- pecas ---------- */



  function renderCatSquare({t}: {t: Tx}) { const cat = categoryOf(t.category, t.kind); return <View style={{width: 36, height: 36, borderRadius: 10, backgroundColor: cat.color + '22', alignItems: 'center', justifyContent: 'center'}}><Icon name={(cat.glyph || 'circle') as IconName} size={17} color={cat.color} weight="duotone" /></View>; }
  function renderRow({t, readOnly}: {t: Tx; readOnly?: boolean}) {
    const card = t.cardId ? d.cards.find(x => x.id === t.cardId) : null, rf = refundOf(t);
    const badges = [card ? card.name + ' · fatura de ' + monthLabel(t.invoice || invoiceMonth(card, t.date)).split(' ')[0].slice(0, 3).toLowerCase() + '.' : '', t.installments > 1 ? 'Parcela ' + t.installment + ' de ' + t.installments : '', t.recurrence === 'monthly' || t.virtual || t.seriesId && !t.installments ? 'Conta do mês' : '', rf ? (rf.state === 'pending' ? 'Reembolso pendente' : 'Reembolsado') : '', t.noBalance ? 'Fora do saldo' : '', t.virtual ? 'Programado' : ''].filter(Boolean);
    return <Pressable testID={'fin-row-' + t.id} disabled={readOnly || t.virtual} onPress={() => onTx(t)} accessibilityRole="button" accessibilityLabel={'Abrir ' + t.desc} {...contextMenu(() => readOnly ? [] : [{label: 'Editar', icon: 'edit', run: () => onTx(t)}])}
      style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 10, backgroundColor: hovered && !readOnly ? c.input : 'transparent', opacity: t.virtual ? 0.7 : 1})}>
      {renderCatSquare({t})}
      <View style={{flex: 1, minWidth: 0, gap: 3}}><Text numberOfLines={1} style={{color: c.text, fontSize: 14}}>{t.desc}</Text><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center'}}><Text style={{color: c.muted, fontSize: 12}}>{t.kind === 'income' ? 'Receita' : t.category}</Text>{badges.map(b => <Text key={b} style={{color: /Reembolso pendente/.test(b) ? c.warn : c.accent, fontSize: 11, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 99, backgroundColor: /Reembolso pendente/.test(b) ? c.warn + '1f' : c.accentSoft}}>{b}</Text>)}</View></View>
      <Text style={{color: t.kind === 'income' ? c.success : t.cardId && !t.paid ? c.muted : c.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums']}}>{sign(t) > 0 ? '+' : sign(t) < 0 ? '−' : ''}{show(t.amount)}</Text>
    </Pressable>;
  }
  function renderExtract(onlyPast = false) {
    const tab = onlyPast ? 'past' : tabState;
    const pastMonths = Array.from({length: 12}, (_, i) => addMonths(month, -(i + 1)));
    return <Box testID="fin-extract" title="" action={null}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -10}}>
        <View style={{flexDirection: 'row', padding: 3, borderRadius: 11, backgroundColor: c.input}}>{([['month', monthLabel(month).split(' ')[0]], ['past', 'Meses anteriores']] as const).map(([k, l]) => <Pressable key={k} accessibilityRole="tab" accessibilityState={{selected: tab === k}} onPress={() => setTab(k)} style={{paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9, backgroundColor: tab === k ? c.surface : 'transparent'}}><Text style={{color: tab === k ? c.text : c.muted, fontWeight: '600', fontSize: 13}}>{k === 'month' ? l.charAt(0).toUpperCase() + l.slice(1) : l}</Text></Pressable>)}</View>
        <View style={{flex: 1}} />
        {tab === 'month' ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, width: 220, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: c.line}}><Icon name="search" size={14} color={c.muted} /><TextInput accessibilityLabel="Buscar no extrato" value={q} onChangeText={setQ} placeholder="Buscar" placeholderTextColor={c.muted} style={{flex: 1, color: c.text, fontSize: 13, paddingVertical: 8}} /></View> : null}
      </View>
      {tab === 'past' ? <View style={{gap: 6}}>{pastMonths.map(m => { const items = d.txs.filter(t => monthOf(t.date) === m && t.entity?.state !== 'archived').sort((a, b) => b.date.localeCompare(a.date)); const i2 = items.filter(t => t.kind === 'income' && !t.noBalance).reduce((s, t) => s + t.amount, 0), o2 = items.filter(t => t.kind === 'expense' && !t.noBalance).reduce((s, t) => s + t.amount, 0);
        return <View key={m} style={{borderRadius: 12, borderWidth: 1, borderColor: c.line, overflow: 'hidden'}}>
          <Pressable accessibilityRole="button" accessibilityState={{expanded: openM === m}} onPress={() => setOpenM(openM === m ? '' : m)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12}}><View style={{transform: [{rotate: openM === m ? '90deg' : '0deg'}]}}><Icon name="chevron" size={13} color={c.muted} /></View><Text style={{flex: 1, color: c.text, fontWeight: '600', textTransform: 'capitalize'}}>{monthLabel(m)}</Text><Text style={{color: c.muted, fontSize: 12}}>{items.length} lançamentos · entrou {show(i2)} · saiu {show(o2)}</Text></Pressable>
          {openM === m ? <View style={{paddingHorizontal: 10, paddingBottom: 8}}>{items.length ? items.map(t => <React.Fragment key={t.id}>{renderRow({t: t, readOnly: true})}</React.Fragment>) : <Text style={{color: c.muted, padding: 8}}>Nada lançado neste mês.</Text>}<Text style={{color: c.muted, fontSize: 11, padding: 6}}>Mês fechado: só consulta.</Text></View> : null}
        </View>; })}</View> : <>
        <Text style={{color: c.muted, fontSize: 12}}>{monthItems.length} lançamentos · entrou <Text style={{color: c.success, fontWeight: '600'}}>{show(inSum)}</Text> · saiu <Text style={{color: c.text, fontWeight: '600'}}>{show(outSum)}</Text>{future ? ' · mês futuro: o que já está programado' : past ? ' · mês fechado: só consulta' : ''}</Text>
        {!past ? <View {...dropProps} testID="fin-quick-box" style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 6, borderRadius: 13, borderWidth: 1, borderStyle: drag ? 'dashed' : 'solid', borderColor: drag ? c.accent : c.line, backgroundColor: drag ? c.accentSoft : c.surface}}>
          <Icon name="plus" size={16} color={c.muted} />
          <TextInput testID="fin-quick" accessibilityLabel="Lançar" value={quick} onChangeText={setQuick} onSubmitEditing={submitQuick} submitBehavior="submit" placeholder={drag ? 'Solte a nota para a Sofia ler' : 'Lançar: mercado 87,50 · ou arraste a nota aqui'} placeholderTextColor={c.muted} style={{flex: 1, color: c.text, fontSize: 14, paddingVertical: 12}} />
          <Pressable accessibilityRole="button" accessibilityLabel="Anexar a nota" onPress={pickFile} style={{padding: 8}}><Icon name="clip" size={17} color={c.muted} /></Pressable>
          <GhostButton icon="edit" label="Manual" onPress={() => onTx({kind: 'expense', date: month === curMonth ? today : dayIn(month, 1), accountId, paid: true})} />
        </View> : null}
        {pq && pq.desc ? <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center'}}>{[pq.kind === 'income' ? 'Receita' : 'Despesa', pq.category, pq.amount ? (pq.parts > 1 ? pq.parts + 'x de ' + money(Math.round(pq.amount / pq.parts * 100) / 100) : money(pq.amount)) : 'falta o valor', pq.card ? 'Cartão ' + pq.card.name : pq.account ? pq.account.name : p.account?.name || ''].filter(Boolean).map(x => <Text key={x} style={{color: c.accent, fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: c.accentSoft}}>{x}</Text>)}<Text style={{color: c.muted, fontSize: 12}}>{busy ? 'Lançando…' : 'Enter para lançar'}</Text></View> : null}
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{([['all', 'Todos'], ['out', 'Despesas'], ['in', 'Receitas'], ['card', 'Cartões'], ['inst', 'Parcelados'], ['refund', 'Reembolsos'], ['nobal', 'Fora do saldo']] as const).map(([k, l]) => <Chip key={k} label={l} selected={filter === k} onPress={() => setFilter(k)} />)}</View>
        {days.length ? days.map(([day, list]) => { const net2 = list.reduce((s, t) => s + sign(t) * (t.noBalance ? 0 : t.amount), 0); return <View key={day} style={{gap: 2}}>
          <View style={{flexDirection: 'row', paddingTop: 8, paddingBottom: 2}}><Text style={{flex: 1, color: c.muted, fontSize: 12, fontWeight: '700'}}>{longDay(day)}</Text><Text style={{color: c.muted, fontSize: 12}}>{net2 >= 0 ? '+' : '−'}{show(Math.abs(net2))}</Text></View>
          {list.map(t => <React.Fragment key={t.id}>{renderRow({t: t, readOnly: past})}</React.Fragment>)}
        </View>; }) : <Text style={{color: c.muted, paddingVertical: 20, textAlign: 'center'}}>{q || filter !== 'all' ? 'Nada com esse filtro.' : 'Nada lançado neste mês ainda.'}</Text>}
      </>}
    </Box>;
  }
  function renderDayChart() {
    const days2 = daysIn(month), W = 300, H = 120, accs = d.accounts.filter(a => a.include && !a.archived && (!accountId || a.id === accountId));
    const pts = Array.from({length: days2}, (_, i) => { const day = dayIn(month, i + 1); const out = monthItems.filter(t => t.date === day && t.kind === 'expense' && !t.noBalance).reduce((s, t) => s + t.amount, 0), inn = monthItems.filter(t => t.date === day && t.kind === 'income' && !t.noBalance).reduce((s, t) => s + t.amount, 0); return {day, out, inn, bal: day <= today ? balanceAsOf(accs, d.txs, d.moves || [], reserve?.id || '', day) - net : null}; });
    const vals = pts.map(x => x.bal).filter((v): v is number => v != null), max = Math.max(1, ...vals, 0), min = Math.min(0, ...vals), maxOut = Math.max(1, ...pts.map(x => x.out));
    const xOf = (i: number) => (i / Math.max(1, days2 - 1)) * W, yOf = (v: number) => H - 8 - ((v - min) / Math.max(1, max - min)) * (H - 24);
    const line = pts.map((x, i) => x.bal == null ? '' : (i === 0 || pts[i - 1].bal == null ? 'M' : 'L') + xOf(i).toFixed(1) + ' ' + yOf(x.bal).toFixed(1)).join(' ');
    return <Box title="Dia a dia" testID="fin-daychart"><Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {pts.map((x, i) => x.out ? <Rect key={'o' + i} x={xOf(i) - 3} y={H - 8 - (x.out / maxOut) * 40} width={6} height={(x.out / maxOut) * 40} rx={2} fill={c.danger + '66'} /> : null)}
      <Path d={line} stroke={c.accent} strokeWidth={2} fill="none" />
      {pts.map((x, i) => x.inn ? <Circle key={'i' + i} cx={xOf(i)} cy={10} r={4} fill={c.success} /> : null)}
    </Svg><View style={{flexDirection: 'row', gap: 12}}><Text style={{color: c.accent, fontSize: 11}}>— saldo</Text><Text style={{color: c.danger, fontSize: 11}}>▮ saídas</Text><Text style={{color: c.success, fontSize: 11}}>● entradas</Text></View></Box>;
  }
  function renderBudgetBars({full: big}: {full?: boolean}) {
    const list = budgetProgress(d.budgets, d.txs, month);
    if (!list.length) return <Text style={{color: c.muted, fontSize: 13}}>Nenhum orçamento ainda. Defina um limite por categoria{big ? '' : ' em Orçamentos'}.</Text>;
    return <View style={{gap: 10}}>{list.map(b => { const cat = categoryOf(b.budget.category), col = b.pct > 100 ? c.danger : b.pct >= 80 ? c.warn : PALETTE.green; return <View key={b.budget.id} style={{gap: 4}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><Icon name={(cat.glyph || 'circle') as IconName} size={15} color={cat.color} /><Text style={{flex: 1, color: c.text, fontSize: 13}}>{b.budget.category}</Text><Text style={{color: col, fontSize: 12}}>{b.pct}% · {b.left >= 0 ? show(b.left) + ' sobram' : show(-b.left) + ' acima'}</Text></View>
      <View style={{height: 6, borderRadius: 3, backgroundColor: c.line}}><View style={{width: (Math.min(100, b.pct) + '%') as any, height: 6, borderRadius: 3, backgroundColor: col}} /></View>
      {big ? <Text style={{color: c.muted, fontSize: 12}}>{show(b.spent)} de {show(b.budget.limit)}</Text> : null}
    </View>; })}</View>;
  }
  async function receive(r: Refund) {
    const acc = r.accountId || accountId || d.accounts.find(a => !a.archived)?.id || ''; if (!acc) return;
    appAlert('Recebeu ' + money(r.amount) + '?', '"' + r.title + '" entra agora no Saldo e no Histórico como receita de hoje.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Recebi', onPress: () => void (async () => {
      try { const now = new Date(), time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'); const tx = await saveEntity(api, 'fin_tx', r.title, {kind: 'income', amount: r.amount, date: todayISO(), category: 'Reembolso', account_id: acc, paid: true, recurrence: 'none', time, __content: 'Devolução recebida'}); await api.saveEntity({...r.entity, data: {...r.entity.data, state: 'received', received_at: todayISO(), income_id: tx.id}, revision: r.entity.revision}).catch(() => api.saveEntity({...r.entity, state: 'received', revision: r.entity.revision})); await reload(); toast('Devolução recebida: ' + money(r.amount) + '.'); }
      catch (e) { toast(errorText(e)); }
    })()}]);
  }
  const dues = manualDues(d.txs, accountId, today, 30).slice(0, 4);

  /* ---------- telas ---------- */
  let body: React.ReactNode;
  if (view === 'home') body = <View style={{gap: 16}}>
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 12}}>
      <Card_ testID="fin-card-saldo" tone label="Saldo" value={show(past ? controlSaldo : total)} sub={past ? 'No fim de ' + monthLabel(month).split(' ')[0] : 'O que está na conta agora'} />
      <Card_ testID="fin-card-previsto" label={'Previsto até ' + short(forecast.end)} value={show(forecast.left)} sub="O que sobra depois de tudo pago · ver conta" onPress={() => setForecastOpen(true)} />
      <Card_ icon="piggy" label="Guardado" value={show(split?.saved || 0)} sub={goalPct != null ? goalPct + '% da meta' : 'Fora do saldo'} onPress={() => setView('reserve')} />
      <Card_ icon="card" label="Faturas abertas" value={show(invoices.reduce((s, i) => s + i.total - i.paid, 0))} sub={invoices.map(i => i.card.name).join(' · ') || 'Nenhuma'} onPress={() => setView('cards')} />
    </View>
    <View style={{flexDirection: 'row', gap: 16, alignItems: 'flex-start'}}>
      <View style={{flex: 1.55, minWidth: 0}}>{renderExtract()}</View>
      <View style={{flex: 1, minWidth: 300, gap: 14}}>
        <Box testID="fin-next-bills" title="Próximas contas" action={<Link label="Ver contas" onPress={() => setView('bills')} />}>{dues.length ? dues.map(due => <DueRow key={due.id} due={due} d={d} api={api} reload={reload} onTx={onTx} />) : <Text style={{color: c.muted, fontSize: 13}}>Nada para pagar nos próximos dias.</Text>}</Box>
        <Box testID="fin-refunds" title="Devoluções a receber" action={<Link label="Ver todas" onPress={() => setView('refunds')} />}>{refunds.length ? refunds.slice(0, 4).map(r => <View key={r.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10}}><View style={{width: 32, height: 32, borderRadius: 9, backgroundColor: c.warn + '22', alignItems: 'center', justifyContent: 'center'}}><Icon name="refund" size={15} color={c.warn} /></View><Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 13}}>{r.title}</Text><Text style={{color: c.text, fontWeight: '600'}}>{show(r.amount)}</Text><GhostButton label="Recebi" onPress={() => void receive(r)} /></View>) : <Text style={{color: c.muted, fontSize: 13}}>Nenhuma devolução esperando.</Text>}</Box>
        <Box testID="fin-control" title="Controle de gastos" action={<Text style={{color: c.muted, fontSize: 12, textTransform: 'capitalize'}}>{monthLabel(month).split(' ')[0]}</Text>}>
          <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 6}}><Text style={{color: c.text, fontSize: 18, fontWeight: '700'}}>{show(spend.spent)}</Text><Text style={{color: c.muted, fontSize: 12}}>de {show(spend.available)}</Text><View style={{flex: 1}} /><Text style={{color: spend.pct > 100 ? c.danger : spend.pct >= 80 ? c.warn : c.text, fontWeight: '700'}}>{spend.pct}%</Text></View>
          <View style={{height: 7, borderRadius: 4, backgroundColor: c.line}}><View style={{width: (Math.min(100, spend.pct) + '%') as any, height: 7, borderRadius: 4, backgroundColor: spend.pct > 100 ? c.danger : spend.pct >= 80 ? c.warn : PALETTE.green}} /></View>
          <Text style={{color: c.muted, fontSize: 12}}>Você começou {monthLabel(month).split(' ')[0]} com {show(spend.start)} e {past ? 'terminou' : 'agora tem'} {show(controlSaldo)}.</Text>
        </Box>
        <Box title="Orçamentos" action={<Link label="Ajustar" onPress={() => setView('budgets')} />}>{renderBudgetBars({})}</Box>
        {renderDayChart()}
      </View>
    </View>
  </View>;
  else if (view === 'bills') body = <PendingTab d={d} api={api} month={month} accountId={accountId} isPrimary={isPrimary} warning="" side={p.pendingSide} onSide={p.setPendingSide} onMonth={setMonth} onNew={p.onNewBill} onBill={p.onBill} reload={reload} onAporte={() => setView('reserve')} />;
  else if (view === 'cards') body = renderCardsDesk();
  else if (view === 'budgets') body = renderBudgetsDesk();
  else if (view === 'reserve') body = renderReserveDesk();
  else if (view === 'refunds') body = <RefundsTab d={full} api={api} reload={reload} accountId={accountId} />;
  else if (view === 'reports') body = <ReportsTab d={d} month={month} reserve={reserve} api={api} reload={reload} />;
  else body = <View style={{gap: 12}}><Text style={{color: c.muted}}>Cada mês fica fechado aqui depois que vira; abra para consultar.</Text>{renderExtract(true)}</View>;

  function renderCardsDesk() {
    const cards = d.cards.filter(x => !x.archived), card = cards.find(x => x.id === cid) || cards[0];
    if (!card) return <Box title="Cartões"><Text style={{color: c.muted}}>Nenhum cartão cadastrado.</Text><GhostButton icon="plus" label="Cadastrar cartão" onPress={p.onManage} /></Box>;
    const inv = invoiceForMonth(card, d.txs, month, today), pastInv = Array.from({length: 12}, (_, i) => invoiceForMonth(card, d.txs, addMonths(month, -(i + 1)), today)).filter(i => i.items.length);
    const inst = d.txs.filter(t => t.cardId === card.id && t.installments > 1 && t.entity?.state !== 'archived'), seriesMap = new Map<string, Tx[]>(); inst.forEach(t => { const k = t.seriesId || t.desc; if (!seriesMap.has(k)) seriesMap.set(k, []); seriesMap.get(k)!.push(t); });
    const parcelados = [...seriesMap.values()].map(l => { const left = l.filter(t => !t.paid && txInvoice(card, t) >= monthOf(today)); return {name: l[0].desc.replace(/\s*\(\d+\/\d+\)$/, ''), total: l.reduce((s, t) => s + t.amount, 0), left: left.reduce((s, t) => s + t.amount, 0), n: left.length, of: l[0].installments}; }).filter(x => x.n > 0);
    const used = d.txs.filter(t => t.cardId === card.id && !t.paid && t.entity?.state !== 'archived').reduce((s, t) => s + t.amount, 0);
    return <View style={{gap: 14}}>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{cards.map(x => <Chip key={x.id} icon="card" label={x.name} selected={x.id === card.id} onPress={() => setCid(x.id)} />)}<Chip icon="settings" label="Gerenciar cartões" onPress={p.onManage} /></View>
      <View style={{flexDirection: 'row', gap: 12, flexWrap: 'wrap'}}>
        <Card_ tone label={'Fatura de ' + monthLabel(inv.month).split(' ')[0]} value={show(inv.total)} sub={'Fecha ' + short(inv.close) + ' · vence ' + short(inv.due) + ' · ' + inv.status} />
        {card.limit ? <Card_ label="Limite disponível" value={show(Math.max(0, card.limit - used))} sub={'de ' + show(card.limit) + ' · já desconta as parcelas futuras'} /> : null}
      </View>
      <View style={{flexDirection: 'row', gap: 16, alignItems: 'flex-start'}}>
        <View style={{flex: 1.55, minWidth: 0}}><Box title="">
          <View style={{flexDirection: 'row', padding: 3, borderRadius: 11, backgroundColor: c.input, alignSelf: 'flex-start', marginTop: -10}}>{([['cur', 'Fatura atual'], ['past', 'Faturas anteriores']] as const).map(([k, l]) => <Pressable key={k} accessibilityRole="tab" accessibilityState={{selected: ct === k}} onPress={() => setCt(k)} style={{paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9, backgroundColor: ct === k ? c.surface : 'transparent'}}><Text style={{color: ct === k ? c.text : c.muted, fontWeight: '600', fontSize: 13}}>{l}</Text></Pressable>)}</View>
          {ct === 'cur' ? (inv.items.length ? inv.items.slice().sort((a, b) => b.date.localeCompare(a.date)).map(t => <React.Fragment key={t.id}>{renderRow({t: t, readOnly: past})}</React.Fragment>) : <Text style={{color: c.muted}}>Nada nesta fatura.</Text>)
            : pastInv.length ? pastInv.map(i => <View key={i.month} style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: c.line}}><Text style={{flex: 1, color: c.text, textTransform: 'capitalize'}}>{monthLabel(i.month)}</Text><Text style={{color: c.muted, fontSize: 12, marginRight: 12}}>{i.items.length} compras · {i.status}</Text><Text style={{color: c.text, fontWeight: '600'}}>{show(i.total)}</Text></View>) : <Text style={{color: c.muted}}>Sem faturas anteriores.</Text>}
        </Box></View>
        <View style={{flex: 1, minWidth: 280}}><Box title="Parcelados">{parcelados.length ? parcelados.map(x => <View key={x.name} style={{gap: 2, paddingVertical: 6}}><Text style={{color: c.text}}>{x.name}</Text><Text style={{color: c.muted, fontSize: 12}}>Faltam {x.n} de {x.of} · {show(x.left)} de {show(x.total)}</Text></View>) : <Text style={{color: c.muted, fontSize: 13}}>Nenhuma compra parcelada em aberto.</Text>}</Box></View>
      </View>
    </View>;
  }
  function renderBudgetsDesk() {
    const add = async () => { const v = Number(limit.replace(/\./g, '').replace(',', '.')); if (!cat || !v) return; try { const ex = d.budgets.find(b => b.category === cat); await saveEntity(api, 'fin_budget', cat, {category: cat, limit: v}, ex?.entity); setCat(''); setLimit(''); await reload(); toast('Orçamento de ' + cat + ': ' + money(v) + ' por mês.'); } catch (e) { toast(errorText(e)); } };
    return <View style={{gap: 14}}>
      <Box title={'Orçamentos de ' + monthLabel(month).split(' ')[0]}>{renderBudgetBars({full: true})}</Box>
      <Box title="Definir ou mudar um limite"><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{EXPENSE_CATEGORIES.map(x => <Chip key={x.name} label={x.name + (d.budgets.some(b => b.category === x.name) ? ' ✓' : '')} selected={cat === x.name} onPress={() => { setCat(x.name); const ex = d.budgets.find(b => b.category === x.name); setLimit(ex ? String(ex.limit).replace('.', ',') : ''); }} />)}</View>
        {cat ? <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}><TextInput accessibilityLabel="Limite por mês" value={limit} onChangeText={setLimit} onSubmitEditing={() => void add()} placeholder="Limite por mês, ex.: 800,00" placeholderTextColor={c.muted} style={{flex: 1, color: c.text, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: c.line}} /><PrimaryButton label="Salvar" onPress={() => void add()} /></View> : null}
        <Text style={{color: c.muted, fontSize: 12}}>Verde até 80%, amarelo a partir de 80% e vermelho acima do limite. Ao lançar, a Sofia mostra como a categoria fica.</Text>
      </Box>
    </View>;
  }
  function renderReserveDesk() {
    if (!reserve) return <Box title="Reserva"><Text style={{color: c.muted}}>Você ainda não separou um dinheiro guardado.</Text><PrimaryButton label="Começar a guardar" onPress={() => setReserveSheet('setup')} /></Box>;
    const hist = reserveHistory(d.moves || [], reserve.id).filter(h => future ? true : h.month <= month);
    return <View style={{gap: 14}}>
      <View style={{flexDirection: 'row', gap: 12, flexWrap: 'wrap'}}><Card_ tone label="Guardado" value={show(split?.saved || 0)} sub={reserve.target ? (goalPct || 0) + '% da meta de ' + show(reserve.target) : 'Fora do saldo'} /><Card_ label="Aporte do mês" value={show(plan)} sub={split?.planDay ? 'Todo dia ' + split.planDay : 'Sem aporte programado'} /></View>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}><PrimaryButton icon="plus" label="Guardar dinheiro" onPress={() => setReserveSheet('in')} /><GhostButton label="Retirar da reserva" onPress={() => setReserveSheet('out')} /><GhostButton label="Editar aportes" onPress={() => setReserveSheet('plan')} /><GhostButton label="Editar meta" onPress={() => setReserveSheet('goal')} /><GhostButton label="Ajustar valor guardado" onPress={() => setReserveSheet('adjust')} /><GhostButton icon="history" label="Movimentos" onPress={() => setHistOpen(true)} /></View>
      <Box title="Histórico da reserva por mês">{hist.length ? hist.slice(0, 12).map(h => <View key={h.month} style={{flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderColor: c.line}}><Text style={{flex: 1, color: c.text, textTransform: 'capitalize'}}>{monthLabel(h.month)}</Text><Text style={{color: c.muted, fontSize: 12}}>guardou {show(h.in)} · retirou {show(h.out)} · <Text style={{color: h.net >= 0 ? c.success : c.danger, fontWeight: '600'}}>{h.net >= 0 ? '+' : '−'}{show(Math.abs(h.net))}</Text></Text></View>) : <Text style={{color: c.muted}}>Sem movimentos ainda.</Text>}</Box>
    </View>;
  }
  return <View testID="finance-desk" style={{flex: 1, flexDirection: 'row', backgroundColor: c.bg}}>
    <View style={{flex: 1, minWidth: 0}}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingLeft: '40px', paddingRight: '40px', paddingTop: '32px', paddingBottom: 40, gap: 18, maxWidth: 1240} as any}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <View style={{flex: 1, gap: 2}}><Text style={{color: c.text, fontSize: 28, fontWeight: '600', letterSpacing: -0.5}}>Finanças</Text><Pressable accessibilityRole="button" accessibilityLabel={'Conta: ' + (p.account?.name || '') + '. Trocar'} onPress={p.onPickAccount} style={{flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start'}}><View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: p.account?.color || c.accent}} /><Text style={{color: c.muted, fontSize: 14}}>{p.account?.name || 'Conta'} · {monthLabel(month)}</Text><View style={{transform: [{rotate: '90deg'}]}}><Icon name="chevron" size={11} color={c.muted} /></View></Pressable></View>
          {month !== curMonth ? <Pressable accessibilityRole="link" onPress={() => setMonth(curMonth)}><Text style={{color: c.accent, fontSize: 13}}>Voltar para {monthLabel(curMonth).split(' ')[0]}</Text></Pressable> : null}
          <View style={{flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}>
            <Pressable testID="fin-month-prev" accessibilityRole="button" accessibilityLabel="Mês anterior" onPress={() => setMonth(addMonths(month, -1))} style={{padding: 9, transform: [{rotate: '180deg'}]}}><Icon name="chevron" size={15} color={c.text} /></Pressable>
            <Text testID="fin-month" style={{minWidth: 120, textAlign: 'center', color: c.text, fontWeight: '700', textTransform: 'capitalize'}}>{monthLabel(month)}</Text>
            <Pressable testID="fin-month-next" accessibilityRole="button" accessibilityLabel="Próximo mês" onPress={() => setMonth(addMonths(month, 1))} style={{padding: 9}}><Icon name="chevron" size={15} color={c.text} /></Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={hide ? 'Mostrar valores' : 'Esconder valores'} onPress={() => setHide(!hide)} style={{padding: 9, borderRadius: 11, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}><Icon name={hide ? 'eyeOff' : 'eye'} size={16} color={c.text} /></Pressable>
          <PrimaryButton icon="plus" label="Conta a pagar" onPress={() => p.onNewBill('expense')} />
        </View>
        <DeskTabs value={view} onChange={setView} options={[...NAV, ...NAV2].map(([k, l]) => ({value: k, label: l, count: k === 'bills' ? manualDues(d.txs, accountId, today, 3).filter(x => !x.paid).length || '' : k === 'refunds' ? refunds.length || '' : ''}))} />
        {body}
      </ScrollView>
    </View>
    {toastNode}
    <Presence>{forecastOpen ? <Dialog visible onClose={() => setForecastOpen(false)} title={'Previsto até ' + short(forecast.end)} footer={<GhostButton label="Fechar" onPress={() => setForecastOpen(false)} />}>
      {([['Salário e outras receitas do ciclo', forecast.income, 1], ['Despesas do ciclo (pagas ou não)', forecast.expense, -1], ['Faturas que vencem no ciclo', forecast.card, -1], ['Aporte do ciclo', forecast.aporte, -1]] as const).map(([l, v, s]) => <View key={l} style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.text}}>{l}</Text><Text style={{color: s > 0 ? c.success : c.text, fontWeight: '600'}}>{s > 0 ? '+' : '−'}{show(v)}</Text></View>)}
      <View style={{height: 1, backgroundColor: c.line}} /><View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.text, fontWeight: '700'}}>Sobra</Text><Text style={{color: c.text, fontWeight: '700'}}>{show(forecast.left)}</Text></View>
      <Text style={{color: c.muted, fontSize: 12}}>Do dia do pagamento até a véspera do próximo. Não usa o Saldo: pagar uma conta não muda o previsto.</Text>
    </Dialog> : null}</Presence>
    <Presence>{receipt ? <Dialog visible onClose={() => setReceipt(null)} title="Conferir a nota" footer={<><GhostButton label="Cancelar" onPress={() => setReceipt(null)} /><PrimaryButton label="Lançar" disabled={!receipt.amount} onPress={() => { const r = receipt; setReceipt(null); void launch({desc: r.desc || 'Compra', amount: r.amount, parts: 1, card: null, accountId, kind: 'expense', category: r.category || 'Outros', date: r.date || undefined, note: r.items}); }} /></>}>
      <View style={{flexDirection: 'row', gap: 12}}>{receipt.preview ? <Image source={{uri: receipt.preview}} style={{width: 90, height: 120, borderRadius: 8}} resizeMode="cover" /> : null}<View style={{flex: 1, gap: 6}}>
        <TextInput accessibilityLabel="Descrição" value={receipt.desc} onChangeText={v => setReceipt(r => r && {...r, desc: v})} style={{color: c.text, fontSize: 14, fontWeight: '600', borderBottomWidth: 1, borderColor: c.line, paddingVertical: 4}} />
        <TextInput accessibilityLabel="Valor" value={receipt.amount ? String(receipt.amount.toFixed(2)).replace('.', ',') : ''} onChangeText={v => setReceipt(r => r && {...r, amount: Number(v.replace(/\./g, '').replace(',', '.')) || 0})} placeholder="Valor" placeholderTextColor={c.muted} style={{color: c.text, fontSize: 14, borderBottomWidth: 1, borderColor: c.line, paddingVertical: 4}} />
        <Text style={{color: c.muted, fontSize: 12}}>{receipt.date ? short(receipt.date) : 'Data de hoje'} · {receipt.category}</Text>
      </View></View>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{EXPENSE_CATEGORIES.slice(0, 10).map(x => <Chip key={x.name} label={x.name} selected={receipt.category === x.name} onPress={() => setReceipt(r => r && {...r, category: x.name})} />)}</View>
      {receipt.items ? <Text numberOfLines={3} style={{color: c.muted, fontSize: 12}}>{receipt.items}</Text> : null}
    </Dialog> : null}</Presence>
    <Presence>{reserveSheet ? <ReserveSheet api={api} kind={reserveSheet} reserve={reserve} split={split} accountId={accountId} onClose={() => setReserveSheet(null)} onDone={async () => { setReserveSheet(null); await reload(); }} /> : null}</Presence>
    <Presence>{histOpen && reserve ? <ReserveHistorySheet api={api} reserve={reserve} moves={(d.moves || []).filter(m => m.goalId === reserve.id)} show={show} onClose={() => setHistOpen(false)} reload={reload} /> : null}</Presence>
  </View>;
}
const Card_ = ({label, value, sub, tone, onPress, icon, testID}: {label: string; value: string; sub: string; tone?: boolean; onPress?: () => void; icon?: IconName; testID?: string}) => { const c = useTheme(); return <Pressable testID={testID} disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined}
    style={({hovered}: any) => ({flex: tone ? 1.25 : 1, minWidth: 180, gap: 6, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: hovered && onPress ? c.accent + '66' : c.line, backgroundColor: tone ? c.accentSoft : c.surface})}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>{icon ? <Icon name={icon} size={14} color={c.muted} /> : null}<Text style={{color: c.muted, fontSize: 13}}>{label}</Text></View>
    <Text style={{color: tone ? c.accent : c.text, fontSize: tone ? 28 : 24, fontWeight: '700', fontVariant: ['tabular-nums']}}>{value}</Text>
    <Text style={{color: c.muted, fontSize: 12}}>{sub}</Text>
  </Pressable>; };
const Box = ({title, action, children, testID}: {title: string; action?: React.ReactNode; children: React.ReactNode; testID?: string}) => { const c = useTheme(); return <View testID={testID} style={{gap: 10, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}><View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text, fontSize: 14, fontWeight: '700'}}>{title}</Text>{action}</View>{children}</View>; };
const Link = ({label, onPress}: {label: string; onPress: () => void}) => { const c = useTheme(); return <Pressable accessibilityRole="link" onPress={onPress}><Text style={{color: c.accent, fontSize: 13}}>{label}</Text></Pressable>; };
function txInvoice(card: Card, t: Tx) { return t.invoice || invoiceMonth(card, t.date); }
void INCOME_CATEGORIES;
