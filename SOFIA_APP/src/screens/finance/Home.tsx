import {SpendCapCard} from './SpendCap';
import {Presence} from '../../components/Presence';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {PALETTE} from '../../lib/palette';
import {contextMenu} from '../../components/ContextMenu';
import {useValuesHidden} from '../../lib/values-mask';
import {tap,useColumnPad,useDesktop} from '../../lib/desktop';
import {GoalProgressCard} from '../../components/GoalProgress';
import type {GoalNumbers} from '../../components/GoalProgress';
import {keepIfSame, useCachedGoal, writeGoalWidget} from '../../lib/goal-widget';
import {scheduleIdleTask} from '../../lib/idle-task';
import * as SecureStore from 'expo-secure-store';
import {ActivityIndicator, Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, Switch, Text, TextInput, View, Dimensions, PanResponder, Animated, Easing} from 'react-native';
// 0.3.255: ScrollView que rola sozinho ate o calendario aberto caber na tela (ver RevealScroll)
import {RevealScrollView as ScrollView} from '../../components/RevealScroll';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path, Rect, Line} from 'react-native-svg';
import {useTheme, light} from '../../lib/theme';
import {encryptedStorage} from '../../lib/encrypted-storage';
import * as DocumentPicker from 'expo-document-picker';
import {File} from 'expo-file-system';
import type {ImportItem} from '../../lib/api';
import type {SofiaApi} from '../../lib/api';
import type {Entity} from '../../lib/types';
import {errorText} from '../../lib/chat-model';
import {useRenderCost} from '../../lib/render-cost';
import {MotionModal} from '../../components/MotionModal';
import {Sheet, markSheetHandoff} from '../../components/Sheet';
import {InternalBackGesture} from '../../components/InternalBackGesture';
import {DateTimeField} from '../../components/DateTimeField';
import {Icon, type IconName} from '../../components/Icon';
import {Button, IconButton} from '../../components/UI';
import {PriceChart} from '../../components/PriceChart';
import {Spinner, LoadingLines, ShimmerBlock, ShimmerGroup} from '../../components/Loading';
import {money} from '../../lib/monitoring';
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, ACCOUNT_TYPES, FIN_COLORS, categoryOf, toAccount, toCard, toTx, toBudget, toGoal, monthOf, addMonths, monthLabel, todayISO,
  invoiceMonth, cardInvoices, cardUsed, installmentPlan, accountBalance, totalBalance, forecastBalance, monthTxs, monthSummary, byCategory, budgetProgress,
  trend, balanceSeries, upcoming, manualDues, transactionsForAccount, goalProgress, parseMoney, formatMoneyInput, finishMoneyInput, addDays,
  dayIn, daysIn} from '../../lib/finance';
import type {Account, Card, Tx, TxKind, Budget, Goal, Invoice, Due, ReserveMove, SaldoSnap, SaldoChange} from '../../lib/finance';
import {saldoSnapshot, reserveSnapshot, saldoDiff, cardBillSettled, saldoLedger, txInvoiceMonth, invoiceForMonth} from '../../lib/finance';
import type {LedgerItem} from '../../lib/finance';
import {sinceReportStart, cycleRange, cycleRoom, fixedSummary, lastInstallmentMonth, monthDues, moneySplit, reserveOutlook, reserveBadge, reserveHistory, reserveMoveLabel, reserveOf, reserveFor, reserveSeries, toReserveMove, effectiveCycleDay, periodBudget, salaryForecast, currentPlan, nextPlan, simpleForecast, spendControl, categoryAlerts, lastWeekByCategory, duplicateGroups, moneyLeft, monthControl, balanceAsOf, isOneOffIncome, fixedDuplicateGroups, fixedUpcoming, isScheduled, exactTwinExtras} from '../../lib/finance';
import {syncFinanceDueNotifications} from '../../lib/finance-notifications';
import {appAlert} from '../../lib/app-alert';
import {useFormDraft, clearAllFormDrafts} from '../../lib/form-draft';
// 0.3.263: parte de Financas (ver src/screens/Finance.tsx).
import {GUARD, Data, StatementLine, Statement, Tab, dateBR, uid, saveEntity, Bar, BigMoney, CatIcon} from './core';
import {ReserveHistorySheet, ReserveSheet} from './Setup';
import {TxTab} from './Transactions';
import {MonthBreakdown} from './Reports';
// ============================ RESUMO ============================
/** 0.3.159: a reserva da conta principal programa os lembretes do aporte. */
export function planReminder(d: Data, today: string) {
  const reserve = reserveOf(d.goals);
  if (!reserve || !(Number(reserve.entity?.data?.monthly_plan) > 0)) return undefined;
  return {split: moneySplit(reserve, d.moves || [], d.accounts, d.txs, d.cards, monthOf(today), today), title: reserve.name};
}

export function HomeTab({d, month, api, reload, onTx, onTab, accountId, isPrimary, onBill, aporteKey = 0, fresh = true, failed = false, onPatchTx, onRemoveTx}: {onPatchTx?: (id: string, ch: Partial<Tx>) => void; onRemoveTx?: (id: string) => void; failed?: boolean; fresh?: boolean; aporteKey?: number; d: Data; month: string; api: SofiaApi; reload: () => Promise<void>; onTx: (t: Partial<Tx>) => void; onTab: (t: Tab) => void; accountId: string; isPrimary: boolean; onBill: (t?: Tx) => void}) {
  const desktop = useDesktop(); // 0.3.252 (computador)
  const c = useTheme(), today = todayISO();
  // Contas pesadas só quando os dados ou o mês mudam (não a cada toque, como esconder valores).
  const {s, total: accountsTotal, forecast: accountsForecast, dues} = useMemo(() => ({s: monthSummary(d.txs, month), total: totalBalance(d.accounts, d.txs), forecast: forecastBalance(d.accounts, d.txs, month, d.cards),
    dues: manualDues(d.txs, accountId, today, 3)}), [d, accountId, month, today]);
  const [aporteEdit, setAporteEdit] = useState<ReserveMove | null>(null);
  // 0.3.255: o olho fica do jeito que a pessoa deixou (o mesmo do Inicio)
  const [hide, setHideValue] = useValuesHidden(api), setHide = (f: (h: boolean) => boolean) => setHideValue(f(hide));
  const [reserveSheet, setReserveSheet] = useState<'setup' | 'in' | 'out' | 'plan' | 'goal' | 'adjust' | null>(null), [reserveHistoryOpen, setReserveHistoryOpen] = useState(false);
  const show = (v: number) => hide ? 'R$ •••••' : money(v);
  // 0.3.151: cada conta tem o proprio guardado (a principal mantem a reserva antiga, sem conta).
  const reserve = reserveFor(d.goals, accountId, isPrimary);
  const split = useMemo(() => reserve ? moneySplit(reserve, d.moves || [], d.accounts, d.txs, d.cards, month, today, manualDues(d.txs,accountId,today,45)) : null, [reserve, d, accountId, month, today]);
  // 0.3.154: o guardado e independente das contas. O Saldo geral e o que voce tem para usar: so os
  // movimentos de guardar/retirar passam dinheiro entre os dois (o valor inicial nao e descontado).
  const badge = split ? reserveBadge(split, today, money) : '';
  const outlook = useMemo(() => reserve && split ? reserveOutlook(reserve, split.saved, split.planned, today) : null, [reserve, split, today]);
  // 0.3.161: ciclo do dinheiro (comeca no dia em que a pessoa recebe) e a folga dele
  // 0.3.195: cada pessoa no seu ciclo (dia informado na conta ou, se nao houver, o dia do salario fixo)
  const cycleDay = useMemo(() => effectiveCycleDay(d.accounts, d.txs, accountId), [d, accountId]);
  const plan = split?.planned || 0;
  const net = split ? split.net : 0, total = Math.round((accountsTotal - net) * 100) / 100, forecast = Math.round((accountsForecast - net) * 100) / 100;
  // 0.3.208: sobra = Saldo + o que ainda entra - contas que faltam - fatura em aberto - aporte que falta.
  // Controle de gastos: a sobra do periodo atual (100% = sobra + gastos livres ja feitos). Previsto: a sobra ate o fim
  // do periodo do salario (na ultima semana antes do salario, ate o fim do proximo periodo).
  const aportePendingIn = useCallback((range: {start: string; end: string}) => {
    const planDay = split?.planDay || 0, months: string[] = [];
    for (let m = monthOf(range.start); m <= monthOf(range.end); m = addMonths(m, 1)) months.push(m);
    const due = planDay ? months.filter(m => { const dt = dayIn(m, Math.min(planDay, daysIn(m))); return dt >= range.start && dt <= range.end; }).length * plan : 0;
    const done = reserve ? (d.moves || []).filter(m => m.goalId === reserve.id && m.direction === 'in' && m.entity?.state !== 'archived' && m.date >= range.start && m.date <= range.end).reduce((t, m) => t + m.amount, 0) : 0;
    return Math.max(0, due - done);
  }, [split?.planDay, plan, reserve, d]);
  const monthRange = useMemo(() => ({start: dayIn(month, 1), end: dayIn(month, daysIn(month))}), [month]);
  const cycleNow = useMemo(() => moneyLeft(d.txs, d.cards, monthRange, accountId, total, aportePendingIn(monthRange), today), [d, monthRange, accountId, total, aportePendingIn, today]);
  // 0.3.214: Controle de gastos = quanto tinha no inicio do mes (o informado em "Ajustar saldo") x quanto tem agora (o Saldo)
  const manualStart = useMemo(() => { const accs = accountId ? d.accounts.filter(a => a.id === accountId) : d.accounts.filter(a => a.include && !a.archived);
    return accs.length && accs.every(a => typeof a.monthStarts[month] === 'number') ? accs.reduce((t, a) => t + a.monthStarts[month], 0) : null; }, [d, accountId, month]);
  // mes que ja passou: o "agora" e o saldo do ultimo dia daquele mes (nao o de hoje)
  const controlSaldo = useMemo(() => month < monthOf(today) ? balanceAsOf(d.accounts.filter(a => a.include && !a.archived && (!accountId || a.id === accountId)), d.txs, d.moves || [], reserve?.id || '', dayIn(month, daysIn(month))) : total, [d, reserve, month, accountId, total, today]);
  const spend = useMemo(() => monthControl(d.txs, d.moves || [], reserve?.id || '', month, accountId, controlSaldo, manualStart), [d, reserve, month, accountId, controlSaldo, manualStart]);
  // 0.3.224: Previsto ate a VESPERA DO PROXIMO SALARIO (o ponto mais baixo do ciclo, para quem recebe em qualquer dia);
  // nos 5 dias antes do pagamento ele ja mostra o ciclo seguinte. Sem dia de salario informado, o ciclo e o mes.
  // Conta: saldo de agora + receitas programadas ate la - despesas programadas - fatura - aporte.
  // 0.3.225: Previsto = o que SOBRA do ciclo depois de tudo pago (regra do Pedro, 23/10): salario + outras receitas do
  // ciclo (avulsas ou programadas, recebidas ou nao) - todas as despesas do ciclo (avulsas ou programadas, pagas ou nao)
  // - faturas do cartao que vencem no ciclo (pagas ou nao) - aporte do ciclo (contado como feito). NAO usa o Saldo:
  // pagar uma conta nao muda o previsto. Ciclo = do dia do salario ate a vespera do proximo; nos 5 dias antes do
  // pagamento ja mostra o ciclo seguinte. Sem dia de salario informado, o ciclo e o mes.
  const aporteInCycle = useCallback((range: {start: string; end: string}) => {
    const planDay = split?.planDay || 0, months: string[] = [];
    for (let m = monthOf(range.start); m <= monthOf(range.end); m = addMonths(m, 1)) months.push(m);
    const due = planDay ? months.filter(m => { const dt = dayIn(m, Math.min(planDay, daysIn(m))); return dt >= range.start && dt <= range.end; }).length * plan : 0;
    const done = reserve ? (d.moves || []).filter(m => m.goalId === reserve.id && m.direction === 'in' && m.entity?.state !== 'archived' && m.date >= range.start && m.date <= range.end).reduce((t, m) => t + m.amount, 0) : 0;
    return Math.round(Math.max(due, done) * 100) / 100;
  }, [split?.planDay, plan, reserve, d]);
  const forecastP = useMemo(() => {
    const ref = month === monthOf(today) ? today : dayIn(month, 1), cur = cycleRange(cycleDay, ref), nextPay = addDays(cur.end, 1);
    const daysLeft = Math.round((Date.parse(nextPay + 'T12:00:00Z') - Date.parse(ref + 'T12:00:00Z')) / 864e5), upcoming = daysLeft <= 5;
    const r = upcoming ? cycleRange(cycleDay, nextPay) : cur;
    const f = simpleForecast(d.txs, d.cards, r, accountId, today, aporteInCycle(r));
    return {start: r.start, end: r.end, income: f.income, toPay: f.expense, card: f.card, aporte: f.aporte, left: f.left,
      incomeItems: f.incomeItems, expenseItems: f.expenseItems, upcoming, shownStart: r.start};
  }, [d, month, cycleDay, accountId, aporteInCycle, today]);
  const monthAporte = useMemo(() => reserve ? (d.moves || []).filter(m => m.goalId === reserve.id && m.direction === 'in' && m.entity?.state !== 'archived' && monthOf(m.date) === month).sort((a, b) => b.date.localeCompare(a.date))[0] || null : null, [d, reserve, month]);
  const forecastEnd = forecastP.end.slice(8, 10) + '/' + forecastP.end.slice(5, 7), paydayKnown = cycleDay > 1;
  // 0.3.225: mes que ainda nao chegou fica zerado no Resumo - so passa a contar quando o mes chegar
  const future = month > monthOf(today);
  const catAlerts = useMemo(() => categoryAlerts(d.txs, accountId, month), [d, accountId, month]);
  // 0.3.208: lancamento repetido (mesmo nome, valor e mes) - avisa e deixa apagar os extras
  const [dupOk, setDupOk] = useState<string[]>([]), [dupOpen, setDupOpen] = useState<string | null>(null), [dupBusy, setDupBusy] = useState('');
  // so um codigo (sem nome nem valor), no armazenamento seguro
  const dupCode = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  useEffect(() => { SecureStore.getItemAsync('sofia_fin_dupok_v1').then(v => { try { const a = JSON.parse(v || '[]'); if (Array.isArray(a)) setDupOk(a.map(String)); } catch { /* nenhum */ } }).catch(() => {}); }, []);
  const dups = useMemo(() => duplicateGroups(d.txs).filter(g => g.month === month && !dupOk.includes(dupCode(g.key))), [d, month, dupOk]);
  const dupGroup = dups.find(g => g.key === dupOpen) || null;
  const [forecastOpen, setForecastOpen] = useState(false), [forecastOpenLine, setForecastOpenLine] = useState('');
  const periodLabel = (b: {start: string; end: string}) => b.start.slice(8, 10) + '/' + b.start.slice(5, 7) + ' a ' + b.end.slice(8, 10) + '/' + b.end.slice(5, 7);
  const [reserveMenu, setReserveMenu] = useState(false), [breakdown, setBreakdown] = useState<'saldo' | 'income' | 'expense' | null>(null);
  const lastAporteKey = useRef(aporteKey);
  useEffect(() => { if (aporteKey === lastAporteKey.current) return; lastAporteKey.current = aporteKey; setReserveSheet(reserve ? 'in' : 'setup'); }, [aporteKey, reserve]);
  // aporte em aberto no mes atual: aparece 3 dias antes do dia do aporte (ou do aviso, se for antes) ate ser feito
  const aporteDue = !!split && split.planned > 0 && split.missing > 0 && month === monthOf(today) && Number(today.slice(8, 10)) >= Math.max(1, (split.planDay || 1) - Math.max(3, split.remindBefore || 0));
  // 0.3.252 (computador): Resumo em duas colunas - saldo, guardado, controle e avisos a esquerda; lancamentos a direita
  const summary = (
    <>
      <Presence>{breakdown ? <MonthBreakdown kind={breakdown} d={d} month={month} show={show} net={net} api={api} accountId={accountId} reload={reload} onPatch={onPatchTx} onRemove={onRemoveTx} onTx={(t: Tx) => { setBreakdown(null); afterSheet(() => onTx(t)); }} onClose={() => setBreakdown(null)} /> : null}</Presence>
      <Presence>{forecastOpen ? <Sheet visible onClose={() => setForecastOpen(false)} label="Fechar previsão">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 12, paddingBottom: 18}}>
          <Text style={{fontSize: 20, fontWeight: '700', color: c.text}}>Previsto até {forecastEnd}</Text>
          <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>{paydayKnown ? 'Quanto sobra do ciclo, do dia do salário até a véspera do próximo' : 'Quanto sobra do mês'}, depois de tudo pago: salário e outras receitas do ciclo − todas as despesas do ciclo (pagas ou não) − faturas do cartão − aporte. Não usa o Saldo: pagar uma conta não muda o previsto.{paydayKnown ? ' Nos 5 dias antes do pagamento, já mostra o ciclo seguinte.' : ''}</Text>
          <View style={{backgroundColor: c.input, borderRadius: 16, padding: 14, gap: 6}}>
            {([['Salário e receitas', forecastP.income, c.good, '+', forecastP.incomeItems], ['Despesas do ciclo (pagas ou não)', forecastP.toPay, c.danger, '−', forecastP.expenseItems], ['Faturas do cartão', forecastP.card, c.danger, '−', [] as Tx[]], ['Aporte', forecastP.aporte, c.danger, '−', [] as Tx[]]] as const)
              .filter(([, v], i) => i < 2 || v > 0).map(([label, v, color, sign, items]) => <View key={label} style={{gap: 4}}>
                <Pressable accessibilityRole="button" disabled={!items.length} onPress={() => setForecastOpenLine(l => l === label ? '' : label)} style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                  <Text style={{color: c.muted, fontSize: 13}}>{sign} {label}{items.length ? (forecastOpenLine === label ? ' ▾' : ' ▸') : ''}</Text><Text style={{color, fontWeight: '600'}}>{show(v)}</Text>
                </Pressable>
                {forecastOpenLine === label ? items.map(t => { const original = t.virtual ? (d.txs.find(x => !x.virtual && x.id === (t.seriesId || t.id)) || t) : t;
                  return <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={'Abrir ' + t.desc} onPress={() => { setForecastOpen(false); afterSheet(() => original.manualDue ? onBill(original) : onTx(original)); }}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingVertical: 4}}>
                    <Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 12}}>{t.desc}</Text>
                    <Text style={{color: c.muted, fontSize: 11}}>{t.date.slice(8, 10)}/{t.date.slice(5, 7)}{t.virtual || t.recurrence === 'monthly' ? ' · 🔁' : ''}</Text>
                    <Text style={{color: c.text, fontSize: 12, fontWeight: '600'}}>{show(t.amount)}</Text>
                  </Pressable>; }) : null}
              </View>)}
            <View style={{height: 1, backgroundColor: c.line, marginVertical: 4}} />
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.text, fontWeight: '700'}}>= Previsto</Text><Text style={{color: forecastP.left < 0 ? c.danger : c.text, fontWeight: '700'}}>{show(forecastP.left)}</Text></View>
          </View>
          {forecastP.left < 0 ? <Text style={{color: c.danger, fontSize: 12, lineHeight: 18}}>O que ainda falta pagar passa {show(-forecastP.left)} do que você tem e do que vai entrar até lá.</Text> : null}
        </ScrollView>
      </Sheet> : null}</Presence>
      <Presence>{reserveHistoryOpen && reserve ? <ReserveHistorySheet api={api} reserve={reserve} moves={d.moves || []} show={show} reload={reload} startEdit={aporteEdit} onClose={() => { setReserveHistoryOpen(false); setAporteEdit(null); }} /> : null}</Presence>
      <Presence>{reserveSheet ? <ReserveSheet accountId={accountId} api={api} kind={reserveSheet} reserve={reserve} split={split} onClose={() => setReserveSheet(null)} onDone={async () => { setReserveSheet(null); await reload(); }} /> : null}</Presence>
      {/* 0.3.153: cartao verde inteiro ATRAS do roxo (empilhados); o roxo cobre tudo menos a faixa de cima */}
      <View style={{backgroundColor: accountId ? GUARD : 'transparent', borderRadius: 24}}>
      {accountId ? <Pressable accessibilityRole="button" accessibilityLabel="Gerenciar dinheiro guardado" onPress={() => split ? setReserveMenu(true) : setReserveSheet('setup')}
        style={{paddingTop: 15, paddingHorizontal: 20, paddingBottom: 13, flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <Text style={{color: PALETTE.white, fontWeight: '700', fontSize: 18}}>{split ? show(split.saved) : 'Configurar ›'}</Text>
        {split && outlook ? <Text style={{color: PALETTE.white+'cc', fontSize: 11}}>de {show(outlook.target)} · {Math.round(Math.min(1, split.saved / outlook.target) * 100)}%</Text> : split && badge ? <Text style={{color: PALETTE.white+'cc', fontSize: 11}}>{badge}</Text> : null}
        <View style={{flex: 1}} />
        <Text style={{color: PALETTE.white+'dd', fontWeight: '600', fontSize: 13}}>Guardado</Text>
        <Icon name="guardado" size={16} color={PALETTE.white+'dd'} />
      </Pressable> : null}
      <View style={{backgroundColor: c.accent, borderRadius: 24, padding: 20, gap: 16, elevation: 2}}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Text style={{flex: 1, color: c.onAccent + 'cc', fontSize: 13}}>Saldo</Text>
          <Pressable accessibilityLabel={hide ? 'Mostrar valores' : 'Esconder valores'} onPress={() => setHide(h => !h)} hitSlop={8}><Icon name={hide ? 'eyeOff' : 'eye'} size={18} color={c.onAccent + 'cc'} /></Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Ver como o saldo é calculado" onPress={() => setBreakdown('saldo')}><BigMoney text={show(future ? 0 : total)} color={c.onAccent} size={32} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Ver a previsão" onPress={() => setForecastOpen(true)}><Text style={{color: c.onAccent + 'cc', fontSize: 12}}>{future ? monthLabel(month).split(' ')[0] + ' ainda não começou · previsto' : 'Previsto até ' + forecastEnd}: <Text style={{color: c.onAccent, fontWeight: '600'}}>{show(future ? 0 : forecastP.left)}</Text> ›</Text></Pressable>
        <View style={{flexDirection: 'row', gap: 12}}>
          <Pressable accessibilityRole="button" accessibilityLabel="Ver receitas do mês" onPress={() => setBreakdown('income')} style={{flex: 1, backgroundColor: c.onAccent + '22', borderRadius: 16, padding: 12, gap: 2}}><Text style={{color: c.onAccent + 'cc', fontSize: 11}}>↑ Receitas</Text><Text style={{color: c.onAccent, fontWeight: '700', fontSize: 16}}>{show(future ? 0 : s.income)}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Ver despesas do mês" onPress={() => setBreakdown('expense')} style={{flex: 1, backgroundColor: c.onAccent + '22', borderRadius: 16, padding: 12, gap: 2}}><Text style={{color: c.onAccent + 'cc', fontSize: 11}}>↓ Despesas</Text><Text style={{color: c.onAccent, fontWeight: '700', fontSize: 16}}>{show(future ? 0 : s.expense)}</Text></Pressable>
        </View>

      </View>
      </View>
      <Sheet visible={reserveMenu} onClose={() => setReserveMenu(false)} label="Fechar detalhes da reserva">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 14, paddingBottom: 28}}>
          <Text style={{fontSize: 18, fontWeight: '700', color: c.text}}>Sua reserva</Text>
          {split ? <>
            <Text style={{fontSize: 28, fontWeight: '700', color: c.text}}>{show(split.saved)}</Text>
            <Text style={{fontSize: 12, lineHeight: 18, color: c.muted}}>Esse valor é separado das suas contas: não entra no Saldo, que é o que você tem para usar. Aportar tira do Saldo e soma aqui; retirar devolve. É uma organização da Sofia, não bloqueia nada no banco.</Text>
            {outlook ? <Pressable accessibilityRole="button" accessibilityLabel="Editar meta" onPress={() => { setReserveMenu(false); afterSheet(() => setReserveSheet('goal')); }} style={{backgroundColor: GUARD + '1f', borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: GUARD + '55'}}>
              <Text style={{color: c.text, fontWeight: '700', fontSize: 14}}>Meta: {show(outlook.target)} até {outlook.deadline.split('-').reverse().join('/')}</Text>
              <View style={{height: 8, borderRadius: 4, backgroundColor: c.line, overflow: 'hidden'}}>
                <View style={{width: `${Math.round(Math.min(1, split.saved / outlook.target) * 100)}%` as `${number}%`, height: 8, backgroundColor: GUARD}} />
              </View>
              <Text style={{color: c.muted, fontSize: 12}}>Hoje {show(split.saved)} · faltam {show(outlook.missing)}{outlook.months > 0 ? ' em ' + outlook.months + (outlook.months === 1 ? ' mês' : ' meses') : ''}</Text>
              {split.planned > 0 ? <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>Com {show(split.planned)} por mês: {show(outlook.atCurrent)} em {monthLabel(outlook.deadline.slice(0, 7))}{outlook.reachDate ? ', e a meta inteira em ' + monthLabel(outlook.reachDate) : ''}.</Text> : null}
              {outlook.onTrack ? <Text style={{color: c.good, fontWeight: '600', fontSize: 13}}>No ritmo atual você chega no prazo ✓</Text>
                : <Text style={{color: c.text, fontWeight: '600', fontSize: 13}}>Para fechar no prazo: {show(outlook.neededMonthly)} por mês</Text>}
              {!outlook.onTrack && split.planned > 0 ? <Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>Você pode manter {show(split.planned)} e compensar com aportes maiores quando sobrar, ou ajustar o valor em “Editar aportes”.</Text> : null}
            </Pressable> : null}
            {!outlook ? <Pressable accessibilityRole="button" onPress={() => { setReserveMenu(false); afterSheet(() => setReserveSheet('goal')); }}><Text style={{color: c.accent, fontSize: 13, fontWeight: '600'}}>+ Definir uma meta (quanto e até quando)</Text></Pressable> : null}
            {split.monthTarget > 0 || split.realized > 0 ? <View style={{backgroundColor: GUARD + '1f', borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: GUARD + '55'}}>
              <Text style={{color: c.text, fontWeight: '700', fontSize: 14}}>Aportes de {monthLabel(month)}</Text>
              {split.planned > 0 ? <Text style={{color: c.muted, fontSize: 12}}>{show(split.planned)} todo dia {split.planDay}, avisar às {split.remindTime}</Text> : null}
              <Text style={{color: c.muted, fontSize: 12}}>Guardado no mês: {show(split.realized)}</Text>
              {split.takenBack > 0 ? <Text style={{color: c.muted, fontSize: 12}}>Retirado no mês, a recompor: −{show(split.takenBack)}</Text> : null}
              {split.monthTarget > 0 ? <Text style={{color: split.closed ? c.good : c.text, fontWeight: '600', fontSize: 13}}>{split.closed ? 'Aporte do mês fechado ✓' : 'Faltam ' + show(split.missing) + ' para fechar o mês'}</Text> : null}
              {split.monthTarget > 0 ? <Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>O que faltar não passa para o mês seguinte: a conta recomeça no valor do aporte.</Text> : null}
            </View> : null}
            <View style={{backgroundColor: c.input, borderRadius: 16, padding: 14, gap: 10}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.muted, fontSize: 12}}>Saldo (para usar)</Text><Text style={{color: split.daily < 0 ? c.danger : c.text, fontWeight: '600'}}>{show(split.daily)}</Text></View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.muted, fontSize: 12}}>Guardado + Saldo</Text><Text style={{color: c.text, fontWeight: '600'}}>{show(split.total)}</Text></View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.muted, fontSize: 12}}>Despesas previstas do mês</Text><Text style={{color: c.text, fontWeight: '600'}}>{show(split.committed)}</Text></View>
              <View style={{height: 1, backgroundColor: c.line}} />
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.text, fontWeight: '600', fontSize: 12}}>Livre após despesas previstas</Text><Text style={{color: split.free < 0 ? c.danger : c.good, fontWeight: '700'}}>{show(split.free)}</Text></View>
            </View>
            {split.daily < 0 ? <Text style={{color: c.danger, fontSize: 12}}>O saldo geral ficou negativo: o que foi guardado é maior que o dinheiro que estava disponível. Confira os valores.</Text> : null}
          </> : null}
          {[['Guardar dinheiro', 'in'], ['Retirar da reserva', 'out'], ['Ajustar valor guardado', 'adjust'], ['Editar aportes', 'plan'], ['Editar meta', 'goal'], ['Histórico da reserva', 'history']].map(([label, k]) => (
            <Pressable key={k} accessibilityRole="button" onPress={() => { setReserveMenu(false); afterSheet(() => { if (k === 'history') setReserveHistoryOpen(true); else setReserveSheet(k as 'in' | 'out' | 'plan' | 'goal' | 'adjust'); }); }}
              style={{paddingVertical: 13, borderBottomWidth: 1, borderColor: c.line}}>
              <Text style={{color: k === 'out' ? c.danger : c.text, fontSize: 16, fontWeight: '500'}}>{label}  ›</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>

      {/* 0.3.188: o aporte do mes aparece como uma conta a fazer, com o valor sugerido; tocar abre ja preenchido */}
      {aporteDue && split ? <Pressable accessibilityRole="button" accessibilityLabel={'Aportar ' + show(split.missing)} onPress={() => setReserveSheet('in')}
        style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.warn + '1a', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: c.warn}}>
        <Text style={{fontSize: 18}}>🔒</Text>
        <View style={{flex: 1, gap: 2}}>
          <Text style={{color: c.text, fontWeight: '600', fontSize: 14}}>Aporte de {monthLabel(month).split(' ')[0].toLowerCase()}</Text>
          <Text style={{color: c.muted, fontSize: 12}}>{show(split.missing)} {split.planDay ? '· dia ' + split.planDay : ''} · toque para aportar este ou outro valor</Text>
        </View>
        <View style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: c.warn + '33'}}><Text style={{color: c.text, fontWeight: '700', fontSize: 12}}>Aportar</Text></View>
      </Pressable> : null}


      {/* 0.3.161: quanto ainda da para gastar neste ciclo, depois das contas fixas e do aporte */}
      {!fresh && !future && !failed ? <ShimmerGroup><View accessibilityRole="progressbar" accessibilityLabel="Atualizando o controle de gastos" style={{backgroundColor: c.surface, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: c.line, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
        <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 8}}><Text style={{flex: 1, color: c.text, fontWeight: '700', fontSize: 16}}>Controle de gastos</Text><Text style={{color: c.muted, fontSize: 11}}>{monthLabel(month).split(' ')[0]}</Text></View>
        <ShimmerBlock width={'52%'} height={24} radius={8} /><ShimmerBlock width={'100%'} height={10} radius={5} /><ShimmerBlock width={'78%'} height={10} />
      </View></ShimmerGroup> :
      <SpendCapCard api={api} d={d} month={month} accountId={accountId} account={d.accounts.find(x => x.id === accountId) || d.accounts.find(x => !x.archived)} show={show} reload={reload} onOpen={() => setBreakdown('expense')} style={{borderRadius: 20}} />}

      {dups.slice(0, 2).map(g => <Pressable key={g.key} accessibilityRole="button" onPress={() => setDupOpen(g.key)} style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.danger + '14', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: c.danger}}>
        <Text style={{fontSize: 18}}>⚠️</Text>
        <View style={{flex: 1, gap: 2}}>
          <Text style={{color: c.text, fontWeight: '600', fontSize: 13}}>“{g.title}” ({show(g.amount)}) aparece {g.items.length} vezes</Text>
          <Text style={{color: c.muted, fontSize: 12}}>Pode ter sido lançado repetido e descontado {g.items.length} vezes. Toque para revisar.</Text>
        </View>
      </Pressable>)}
      <FixedDupCard d={d} api={api} reload={reload} />
      <Presence>{dupGroup ? <Sheet visible onClose={() => setDupOpen(null)} label="Fechar revisão de repetidos">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 12, paddingBottom: 18}}>
          <Text style={{fontSize: 20, fontWeight: '700', color: c.text}}>Lançamentos repetidos</Text>
          <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>“{dupGroup.title}”, {show(dupGroup.amount)}, aparece {dupGroup.items.length} vezes em {monthLabel(month).split(' ')[0].toLowerCase()}. Apague os que foram lançados a mais: cada um que sai devolve o valor ao Saldo.</Text>
          {dupGroup.items.map((t, i) => <View key={t.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.input, borderRadius: 14, padding: 12}}>
            <View style={{flex: 1}}><Text style={{color: c.text, fontWeight: '500'}}>{i + 1}. {t.desc}</Text><Text style={{color: c.muted, fontSize: 12}}>{t.date.split('-').reverse().join('/')} · {t.category}{(t.entity as {created_at?: string} | undefined)?.created_at ? ' · lançado às ' + new Date(String((t.entity as {created_at?: string}).created_at)).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : ''}</Text></View>
            <Pressable accessibilityRole="button" disabled={!!dupBusy || dupGroup.items.length < 2} onPress={() => { setDupBusy(t.id); void api.deleteEntity(t.entity!.id).then(() => reload()).catch(e => appAlert('Finanças', errorText(e))).finally(() => setDupBusy('')); }}
              style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: c.danger + '1f'}}>{dupBusy === t.id ? <ActivityIndicator color={c.danger} /> : <Text style={{color: c.danger, fontWeight: '600'}}>Apagar</Text>}</Pressable>
          </View>)}
          <Pressable accessibilityRole="button" onPress={() => { const next = [...dupOk, dupCode(dupGroup.key)].slice(-150); setDupOk(next); void SecureStore.setItemAsync('sofia_fin_dupok_v1', JSON.stringify(next)).catch(() => {}); setDupOpen(null); }} style={{paddingVertical: 12}}>
            <Text style={{color: c.accent, fontWeight: '600'}}>São compras diferentes, pode manter</Text></Pressable>
        </ScrollView>
      </Sheet> : null}</Presence>
      {/* 0.3.199: categoria que ja passou do que voce costuma gastar no mes */}
      {month === monthOf(today) ? catAlerts.slice(0, 2).map(a => <Pressable key={a.category} accessibilityRole="button" onPress={() => setBreakdown('expense')}
        style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.warn + '1a', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: c.warn}}>
        <CatIcon cat={categoryOf(a.category)} size={20} />
        <View style={{flex: 1, gap: 2}}>
          <Text style={{color: c.text, fontWeight: '600', fontSize: 13}}>{a.category}: {show(a.total)} em {monthLabel(month).split(' ')[0].toLowerCase()}</Text>
          <Text style={{color: c.muted, fontSize: 12}}>{Math.round(a.pct * 100)}% acima do que você costuma gastar ({show(a.average)} por mês)</Text>
        </View>
      </Pressable>) : null}

      {/* 0.3.152: vencimentos proximos viram uma linha so (o detalhe fica em Pendentes); cartoes ficam na aba Cartoes */}
      {dues.length ? <Pressable accessibilityRole="button" accessibilityLabel="Ver pendentes" onPress={() => onTab('bills')}
        style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: dues.some(x => x.late) ? c.danger : c.line, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
        <Text style={{fontSize: 16}}>⏰</Text>
        <Text style={{flex: 1, color: c.text, fontSize: 13}}>{dues.some(x => x.late) ? 'Há conta atrasada' : dues.length === 1 ? '1 vencimento nos próximos 3 dias' : dues.length + ' vencimentos nos próximos 3 dias'}</Text>
        <Text style={{color: c.text, fontWeight: '600', fontSize: 13}}>{show(dues.reduce((sum, x) => sum + x.amount, 0))}</Text><Text style={{color: c.muted}}>›</Text>
      </Pressable> : null}

    </>
  );
  const history = <View style={{gap: 12, paddingTop: desktop ? 0 : 6}}>
        <TxTab d={d} month={month} accountFilter="" setAccountFilter={() => undefined} onTx={onTx} api={api} reload={reload} />
      </View>;
  if (desktop) return <View testID="finance-home-split" style={{flexDirection: 'row', gap: 24, alignItems: 'flex-start'}}>
    <View style={{flex: 1, minWidth: 0, maxWidth: 560, gap: 14}}>{summary}</View>
    <View style={{flex: 1.3, minWidth: 0}}>{history}</View>
  </View>;
  return (
    <>
      {summary}
      {history}
    </>
  );
}
export function DueRow({due, d, api, reload, onTx}: {due: Due; d: Data; api: SofiaApi; reload: () => Promise<void>; onTx: (t: Partial<Tx>) => void}) {
  const c = useTheme(), [busy, setBusy] = useState(false), [pick, setPick] = useState(false);
  // 0.3.181: atrasada continua vermelha e fatura roxa; o resto em aberto (inclusive a receber) amarelo; paga verde
  const color = due.late ? c.danger : due.kind === 'fatura' ? c.accent : c.warn;
  const local = React.useContext(FinanceLocal);
  async function settle(accountId?: string) {
    setBusy(true);
    try {
      if (due.invoice) {
        const acc = accountId || due.invoice.card.accountId || d.accounts[0]?.id;
        await saveEntity(api, 'fin_tx', 'Fatura ' + due.invoice.card.name + ' ' + due.invoice.month.slice(5, 7) + '/' + due.invoice.month.slice(0, 4), {kind: 'card_payment', amount: due.amount, date: todayISO(), card_id: due.invoice.card.id, invoice_month: due.invoice.month, account_id: acc, paid: true, category: 'Fatura do cartão'});
        await reload();
      } else if (due.tx) {
        // Fica "pago" na hora; o servidor grava em seguida. Se falhar, a tela volta ao estado real.
        local?.markPaid(due.tx);
        setBusy(false);
        void receiveTx(api, d, due.tx).then(() => reload()).catch(e => { appAlert('Finanças', errorText(e)); void reload(); });
        return;
      }
    } catch (e) { appAlert('Finanças', errorText(e)); } finally { setBusy(false); }
  }
  // 0.3.222: pagar pela conta do cartao = pagar a fatura em que ela cai (o que falta dela)
  function invoiceOf(card: Card, t: Tx) { const m = txInvoiceMonth(card, t); return cardInvoices(card, d.txs).find(i => i.month === m) || null; }
  async function payInvoiceOf(card: Card, t: Tx, accountId: string) {
    const inv = invoiceOf(card, t); if (!inv) return;
    const left = Math.round((inv.total - inv.paid) * 100) / 100; if (left <= 0) return;
    setBusy(true);
    try { await saveEntity(api, 'fin_tx', 'Fatura ' + card.name + ' ' + inv.month.slice(5, 7) + '/' + inv.month.slice(0, 4), {kind: 'card_payment', amount: left, date: todayISO(), card_id: card.id, invoice_month: inv.month, account_id: accountId, paid: true, category: 'Fatura do cartão'}); await reload(); }
    catch (e) { appAlert('Finanças', errorText(e)); } finally { setBusy(false); }
  }
  function askPayInvoice(card: Card, t: Tx) {
    const inv = invoiceOf(card, t); if (!inv) return;
    const left = Math.round((inv.total - inv.paid) * 100) / 100, n = inv.items.length, label = monthLabel(inv.month).split(' ')[0].toLowerCase();
    const accounts = d.accounts.filter(a => !a.archived);
    appAlert('Pagar a fatura de ' + label + '?', 'Esta conta está no ' + card.name + '. Pagar marca a fatura de ' + label + ' como paga (' + money(left) + ') e as ' + n + (n === 1 ? ' compra/conta dela fica paga.' : ' compras e contas dela ficam pagas.'),
      [{text: 'Cancelar', style: 'cancel'}, {text: 'Pagar fatura', onPress: () => { if (accounts.length > 1 && !card.accountId) setPick(true); else void payInvoiceOf(card, t, card.accountId || accounts[0]?.id || ''); }}]);
  }
  // 0.3.192: tocar em qualquer parte da linha abre a edicao; numa repeticao, abre a conta fixa original
  // 0.3.193: pela lista do mes, a edicao vale so para aquele mes (a conta fixa inteira muda em Contas fixas)
  const target = due.tx;
  const openEdit = () => { if (target) onTx(target); };
  // 0.3.223: conta no cartao - entra na fatura, sem "Paguei" (quem se paga e a fatura)
  if (due.tx?.cardId && !due.paid) { const cardOf = d.cards.find(x => x.id === due.tx!.cardId); return (
    <Pressable accessibilityRole="button" accessibilityLabel={'Editar ' + due.title} disabled={!target} onPress={openEdit}
      style={({pressed}) => ({flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: c.input, opacity: pressed ? 0.7 : 1})}>
      <View style={{width: 4, height: 36, borderRadius: 2, backgroundColor: cardOf?.color || c.accent}} />
      <View style={{flex: 1, gap: 2}}>
        <Text numberOfLines={1} style={{color: c.text, fontWeight: '500'}}>💳 {due.title}</Text>
        <Text style={{fontSize: 11, color: c.muted}}>{dateBR(due.date)}{due.tx?.time ? ' · ' + due.tx.time : ''} · na fatura do {cardOf?.name || 'cartão'}{cardOf && due.tx ? ' de ' + monthLabel(txInvoiceMonth(cardOf, due.tx)).split(' ')[0].toLowerCase() : ''}</Text>
      </View>
      <Text style={{color: c.text, fontWeight: '600'}}>{money(due.amount)}</Text>
      {/* 0.3.222: Paguei numa conta do cartao paga a fatura dela inteira - todas as contas daquela fatura ficam pagas */}
      {cardOf && due.tx ? <Pressable disabled={busy} onPress={() => askPayInvoice(cardOf, due.tx!)} style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: c.accent + '22'}}>
        {busy ? <ActivityIndicator size="small" color={c.accent} /> : <Text style={{color: c.accent, fontWeight: '600', fontSize: 12}}>Paguei</Text>}
      </Pressable> : null}
      <Sheet visible={pick} onClose={() => setPick(false)} label="Fechar escolha de conta">
        <Text style={{fontSize: 18, fontWeight: '600', color: c.text, marginBottom: 8}}>Pagar a fatura com qual conta?</Text>
        {d.accounts.filter(a => !a.archived).map(a => <Pressable key={a.id} onPress={() => { setPick(false); if (cardOf && due.tx) void payInvoiceOf(cardOf, due.tx, a.id); }} style={{paddingVertical: 14}}><Text style={{color: c.text, fontSize: 16}}>{a.name} · {money(accountBalance(a, d.txs))}</Text></Pressable>)}
      </Sheet>
    </Pressable>); }
  if (due.paid) return (
    <Pressable accessibilityRole="button" accessibilityLabel={'Editar ' + due.title} disabled={!target} onPress={openEdit}
      style={({pressed}) => ({flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: c.good + '1a', opacity: pressed ? 0.7 : 1})}>
      <View style={{width: 4, height: 36, borderRadius: 2, backgroundColor: c.good}} />
      <View style={{flex: 1, gap: 2}}>
        <Text numberOfLines={1} style={{color: c.text, fontWeight: '500'}}>{due.title}</Text>
        <Text style={{fontSize: 11, color: c.good}}>{due.kind === 'receber' ? 'Recebido' : 'Pago'} · {dateBR(due.date)}{due.tx?.time ? ' · ' + due.tx.time : ''}{due.tx?.cardId ? ' · com a fatura do ' + (d.cards.find(x => x.id === due.tx!.cardId)?.name || 'cartão') : ''}</Text>
      </View>
      <Text style={{color: c.good, fontWeight: '600'}}>{money(due.amount)}</Text>
      <Text style={{color: c.good, fontWeight: '700', fontSize: 12}}>✓ {due.kind === 'receber' ? 'Recebido' : 'Pago'}</Text>
    </Pressable>
  );
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={'Editar ' + due.title} disabled={!target} onPress={openEdit}
      style={({pressed}) => ({flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: color + '1a', opacity: pressed ? 0.7 : 1})}>
      <View style={{width: 4, height: 36, borderRadius: 2, backgroundColor: color}} />
      <View style={{flex: 1, gap: 2}}>
        <Text numberOfLines={1} style={{color: c.text, fontWeight: '500'}}>{due.title}</Text>
        <Text style={{fontSize: 11, color: due.late ? c.danger : c.muted}}>{due.late ? 'Atrasado · ' : ''}{due.kind === 'receber' ? 'receber' : 'vence'} {dateBR(due.date)}{due.tx?.time ? ' · ' + due.tx.time : ''}{due.tx?.virtual ? ' · repetição' : ''}</Text>
      </View>
      <Text style={{color: c.text, fontWeight: '600'}}>{money(due.amount)}</Text>
      <Pressable disabled={busy} onPress={() => due.invoice && d.accounts.length > 1 ? setPick(true) : void settle()} style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: color + '22'}}>
        {busy ? <ActivityIndicator size="small" color={color} /> : <Text style={{color, fontWeight: '600', fontSize: 12}}>{due.kind === 'receber' ? 'Recebi' : 'Paguei'}</Text>}
      </Pressable>
      <Sheet visible={pick} onClose={() => setPick(false)} label="Fechar escolha de conta">
        <Text style={{fontSize: 18, fontWeight: '600', color: c.text, marginBottom: 8}}>Pagar {due.title} com qual conta?</Text>
        {d.accounts.filter(a => !a.archived).map(a => <Pressable key={a.id} onPress={() => { setPick(false); void settle(a.id); }} style={{paddingVertical: 14}}><Text style={{color: c.text, fontSize: 16}}>{a.name} · {money(accountBalance(a, d.txs))}</Text></Pressable>)}
      </Sheet>

    </Pressable>
  );
}
/** Pagar/receber: lançamento real vira pago; repetição prevista vira um lançamento real daquele mês. */
/** Espera a janela que esta fechando terminar de sair antes de abrir a proxima. */
// 0.3.227: a janela que fecha segura o fundo ate a proxima aparecer (sem piscar) e a pausa caiu de 230 para 120 ms
// 0.3.231: mes que ja passou esta FECHADO - nao entra nem muda mais nenhum lancamento; fica no Historico para consulta
export const CLOSED_MSG = 'Esse mês já fechou e está no Histórico só para consulta. Use uma data deste mês.';
export function isClosedMonth(m: string) { return !!m && m < monthOf(todayISO()); }
export function afterSheet(run: () => void) { markSheetHandoff(); setTimeout(run, 120); }
// 0.3.175: atualizacoes locais imediatas (o servidor confirma por tras, sem a pessoa esperar).
export const FinanceLocal = React.createContext<{markPaid: (t: Tx) => void} | null>(null);
/** 0.3.208: grava sobre a versao ATUAL do registro: se ele mudou desde que a tela carregou (chat, outra tela),
 * busca de novo e tenta outra vez - antes o “Paguei” falhava calado e a conta voltava para “a pagar”. */
export async function saveFresh(api: SofiaApi, title: string, data: Record<string, any>, entity: Entity) {
  try { return await saveEntity(api, 'fin_tx', title, data, entity); }
  catch (e) {
    const status = (e as {status?: number}).status;
    if (status !== 409 && status !== 412 && !/revis|vers|alterad/i.test(errorText(e))) throw e;
    const fresh = await api.entity(entity.id);
    if (data.paid === true && fresh.data?.paid === true) return fresh; // ja estava pago: nada a fazer
    return saveEntity(api, 'fin_tx', title, data, fresh);
  }
}
/** 0.3.223: a conta fixa continua a partir do mes seguinte com as mudancas (ex.: passar para o cartao); o registro deste
 * mes fica como foi (ja pago pela conta). Mesmo esquema do "so este mes" do cadastro. */
export async function startSeriesNextMonth(api: SofiaApi, tx: Tx, patch: Record<string, any>, title: string) {
  const old = tx.entity!.data || {}, nm = addMonths(monthOf(tx.date), 1), nextDate = nm + '-' + String(Math.min(Number(tx.date.slice(8, 10)), daysIn(nm))).padStart(2, '0');
  const total = Number(old.installments) || 0, at = Number(old.installment) || 1, continues = !total || at < total;
  let nextId = '';
  if (continues) { const next = await api.saveEntity({kind: 'fin_tx', title, content: '', area: tx.entity!.area || 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {...old, date: nextDate, paid: false, recurrence: 'monthly', series_id: '', installment: total ? at + 1 : '', import_id: 'sofia-pendencia:' + uid(), ...patch}}); nextId = next.id; }
  await api.saveEntity({...tx.entity!, data: {...old, recurrence: 'none', series_id: nextId, installments: '', installment: '', recurrence_end: ''}});
}
/** 0.3.217: mantem o aporte ligado a uma receita igual a parte do guardado dela (cria, ajusta ou apaga). */
export async function syncIncomeReserve(api: SofiaApi, d: Data, incomeId: string, goalId: string, part: number, paid: boolean, date: string, title: string) {
  const linked = (d.moves || []).find(m => String((m.entity?.data as {income_id?: string} | undefined)?.income_id || '') === incomeId);
  if (part > 0 && paid) {
    const data = {goal_id: goalId, direction: 'in', amount: part, date, note: 'Da receita: ' + title, planned: false, income_id: incomeId};
    if (linked?.entity) await api.saveEntity({...linked.entity, data: {...linked.entity.data, ...data}});
    else await api.saveEntity({kind: 'fin_reserve_move', title: 'Guardado na reserva', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data});
  } else if (linked?.entity) await api.deleteEntity(linked.entity.id);
}
/** 0.3.217: "Recebi": a parte do guardado ja cadastrada na receita vai sozinha para a reserva (sem perguntar);
 * para mudar, a pessoa edita o item. */
export async function receiveTx(api: SofiaApi, d: Data, t: Tx) {
  const goal = reserveOf(d.goals), part = t.kind === 'income' && goal ? (t.reservePart || 0) : 0;
  const saved = await confirmTx(api, t, d.txs, part > 0 ? {reserve_part: part} : {});
  if (part > 0 && saved && goal) await syncIncomeReserve(api, d, saved.id, goal.id, part, true, t.date, t.desc);
  return saved;
}
export async function confirmTx(api: SofiaApi, t: Tx, txs: Tx[] = [], extra: Record<string, any> = {}): Promise<Entity | null> {
  if (t.virtual) {
    // 0.3.185: nunca registrar duas vezes a mesma ocorrencia (ex.: salario do mes). Se ja existe um
    // registro dessa serie naquele mes, ele e o que fica pago.
    const series = t.seriesId || t.id, month = t.date.slice(0, 7);
    const same = txs.find(x => !x.virtual && x.entity && (x.seriesId === series || x.id === series) && x.date.slice(0, 7) === month);
    if (same && same.entity) return saveFresh(api, same.desc, {paid: true, paid_at: todayISO(), ...extra}, same.entity);
    const data: Record<string, any> = {kind: t.kind, amount: t.amount, date: t.date, category: t.category, account_id: t.accountId, paid: true, paid_at: todayISO(), series_id: t.seriesId, recurrence: 'none', time: t.time || '',
      // 0.3.177: a parcela paga continua aparecendo como pendencia (paga) daquele mes
      import_id: t.manualDue ? 'sofia-pendencia:' + (t.seriesId || t.id) + ':' + t.date : '', ...extra};
    return saveEntity(api, 'fin_tx', t.desc, data);
  } else if (t.entity) return saveFresh(api, t.desc, {paid: true, paid_at: todayISO(), ...extra}, t.entity);
  return null;
}
export function BudgetRow({p}: {p: ReturnType<typeof budgetProgress>[number]}) {
  const c = useTheme(), cat = categoryOf(p.budget.category), color = p.state === 'estourado' ? c.danger : p.state === 'alerta' ? c.warn : c.good;
  return (
    <View style={{gap: 6}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
        <CatIcon cat={cat} size={18} /><Text style={{flex: 1, color: c.text, fontWeight: '500'}}>{cat.name}</Text>
        <Text style={{color: c.muted, fontSize: 12}}>{money(p.spent)} de {money(p.budget.limit)}</Text>
      </View>
      <Bar pct={p.pct} color={color} />
      <Text style={{fontSize: 11, color}}>{p.state === 'estourado' ? 'Passou ' + money(-p.left) + ' do limite' : 'Ainda pode gastar ' + money(p.left)}</Text>
    </View>
  );
}

// ============================ LANÇAMENTOS ============================
/** 0.3.213: extratos do banco guardados a parte. Cada linha e conferida ao vivo com os lancamentos do app:
 * bate / falta no app (Lancar) / ja estava no Saldo. O saldo do banco no fim do extrato pode acertar o Saldo. */
/** 0.3.220: seletor compacto de duas opcoes (do tamanho do texto, alinhado a esquerda) - o mesmo em todo Financas. */
export function Segmented<T extends string>({value, onChange, options}: {value: T; onChange: (v: T) => void; options: {value: T; label: string}[]}) {
  const c = useTheme();
  // 0.3.227: duas metades iguais na largura toda (como era em Contas), o mesmo em Contas e no Historico do Resumo
  return <View accessibilityRole="tablist" style={{flexDirection: 'row', backgroundColor: c.input, borderRadius: 14, padding: 4}}>
    {options.map(o => { const on = o.value === value; return <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{selected: on}} onPress={() => onChange(o.value)}
      style={{flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center', backgroundColor: on ? c.surface : 'transparent', ...(on ? {shadowColor: PALETTE.black, shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: {width: 0, height: 1}, elevation: 1} : {})}}>
      <Text style={{color: on ? c.text : c.muted, fontWeight: on ? '800' : '600', fontSize: 13}}>{o.label}</Text>
    </Pressable>; })}
  </View>;
}
/** 0.3.219: setinha de abrir/fechar, do mesmo tamanho em todo Financas. */
export function Chevron({open}: {open: boolean}) {
  const c = useTheme();
  return <View style={{width: 30, height: 30, borderRadius: 15, backgroundColor: c.input, alignItems: 'center', justifyContent: 'center'}}>
    <Text style={{color: c.text, fontSize: 20, lineHeight: 22, fontWeight: '500', transform: [{rotate: open ? '90deg' : '0deg'}]}}>›</Text>
  </View>;
}
/** 0.3.219: arrastar para o lado mostra "Apagar"; passando do ponto, pede confirmacao. Rolagem vertical nao e afetada. */
export function SwipeToDelete({children, onDelete, label, busy = false}: {children: React.ReactNode; onDelete: () => void; label: string; busy?: boolean}) {
  const c = useTheme(), x = useRef(new Animated.Value(0)).current, LIMIT = -96;
  const back = () => Animated.spring(x, {toValue: 0, useNativeDriver: true, bounciness: 4}).start();
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_e, g) => x.setValue(Math.max(-160, Math.min(0, g.dx))),
    onPanResponderRelease: (_e, g) => { if (g.dx <= LIMIT) { Animated.timing(x, {toValue: -120, duration: 120, useNativeDriver: true}).start(); onDelete(); setTimeout(back, 400); } else back(); },
    onPanResponderTerminate: back,
  })).current;
  return <View style={{borderRadius: 18, overflow: 'hidden'}}>
    <View style={{position: 'absolute', top: 0, bottom: 0, right: 0, left: 0, backgroundColor: c.danger, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 22}}>
      {busy ? <ActivityIndicator color={PALETTE.white} /> : <Text accessibilityLabel={label} style={{color: PALETTE.white, fontWeight: '700'}}>Apagar</Text>}
    </View>
    <Animated.View {...pan.panHandlers} style={{transform: [{translateX: x}]}}>{children}</Animated.View>
  </View>;
}
/** 0.3.227: conta/receita fixa cadastrada mais de uma vez - avisa e deixa apagar as copias (ou manter). */
export function FixedDupCard({d, api, reload}: {d: Data; api: SofiaApi; reload: () => Promise<void>}) {
  const c = useTheme(), [ok, setOk] = useState<string[]>([]), [open, setOpen] = useState<string | null>(null), [busy, setBusy] = useState('');
  const code = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } return 'f' + (h >>> 0).toString(36); };
  useEffect(() => { SecureStore.getItemAsync('sofia_fin_dupok_v1').then(v => { try { const a = JSON.parse(v || '[]'); if (Array.isArray(a)) setOk(a.map(String)); } catch { /* nenhum */ } }).catch(() => {}); }, []);
  const groups = useMemo(() => fixedDuplicateGroups(d.txs).filter(g => !ok.includes(code(g.key))), [d, ok]);
  const g = groups.find(x => x.key === open) || null;
  if (!groups.length) return null;
  return <>
    {groups.slice(0, 2).map(x => <Pressable key={x.key} accessibilityRole="button" onPress={() => setOpen(x.key)} style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.danger + '14', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: c.danger}}>
      <Text style={{fontSize: 18}}>⚠️</Text>
      <View style={{flex: 1, gap: 2}}>
        <Text style={{color: c.text, fontWeight: '600', fontSize: 13}}>“{x.title}” está cadastrada {x.items.length} vezes</Text>
        <Text style={{color: c.muted, fontSize: 12}}>{x.kind === 'income' ? 'Receita' : 'Conta'} do dia {x.day}. Toque para apagar as cópias.</Text>
      </View>
    </Pressable>)}
    <Presence>{g ? <Sheet visible onClose={() => setOpen(null)} label="Fechar cadastros repetidos">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 12, paddingBottom: 18}}>
        <Text style={{fontSize: 20, fontWeight: '700', color: c.text}}>Cadastros repetidos</Text>
        <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>“{g.title}” aparece {g.items.length} vezes, todas no dia {g.day}. Apague as que sobram e deixe só a certa.</Text>
        {g.items.map((t, i) => <View key={t.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.input, borderRadius: 14, padding: 12}}>
          <View style={{flex: 1, gap: 2}}><Text style={{color: c.text, fontWeight: '500'}}>{i + 1}. {t.desc} · {money(t.amount)}</Text><Text style={{color: c.muted, fontSize: 12}}>{t.recurrence === 'monthly' ? (t.installments > 1 ? 'parcela ' + t.installment + ' de ' + t.installments : 'todo mês, sem prazo') : 'só esta vez'} · desde {t.date.split('-').reverse().join('/')}</Text></View>
          <Pressable accessibilityRole="button" disabled={!!busy || g.items.length < 2} onPress={() => { setBusy(t.id); void api.deleteEntity(t.entity!.id).then(() => reload()).catch(e => appAlert('Finanças', errorText(e))).finally(() => setBusy('')); }}
            style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: c.danger + '1f'}}>{busy === t.id ? <ActivityIndicator color={c.danger} /> : <Text style={{color: c.danger, fontWeight: '600'}}>Apagar</Text>}</Pressable>
        </View>)}
        <Pressable accessibilityRole="button" onPress={() => { const next = [...ok, code(g.key)].slice(-150); setOk(next); void SecureStore.setItemAsync('sofia_fin_dupok_v1', JSON.stringify(next)).catch(() => {}); setOpen(null); }} style={{paddingVertical: 12}}>
          <Text style={{color: c.accent, fontWeight: '600'}}>São diferentes, pode manter</Text></Pressable>
      </ScrollView>
    </Sheet> : null}</Presence>
  </>;
}
export function BankStatements({d, api, reload, onImport}: {d: Data; api: SofiaApi; reload: () => Promise<void>; onImport: () => void}) {
  const c = useTheme(), [open, setOpen] = useState<string>(''), [busy, setBusy] = useState('');
  const account = (id: string) => d.accounts.find(a => a.id === id);
  const matchOf = (line: StatementLine, acc: Account | undefined) => {
    const t = Date.parse(line.date + 'T12:00:00Z');
    const byId = d.txs.find(x => !x.virtual && String(x.entity?.data?.import_id || '') === line.import_id); if (byId) return {tx: byId, how: 'extrato' as const};
    const found = d.txs.filter(x => !x.virtual && x.paid && (!acc || x.accountId === acc.id) && x.kind === line.kind && Math.abs(x.amount - line.amount) <= 1.0001 && Math.abs(Date.parse(x.date + 'T12:00:00Z') - t) <= 3 * 864e5)
      .sort((a, b) => Math.abs(a.amount - line.amount) - Math.abs(b.amount - line.amount))[0];
    return found ? {tx: found, how: 'app' as const} : null;
  };
  async function remove(st: Statement) {
    setBusy(st.id);
    try { await api.financeStatementDelete(st.id); await reload(); } catch (e) { appAlert('Finanças', errorText(e)); } finally { setBusy(''); }
  }
  if (!d.statements.length) return <View style={{backgroundColor: c.surface, borderRadius: 18, padding: 16, gap: 8, borderWidth: 1, borderColor: c.line, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
    <Text style={{color: c.text, fontWeight: '600'}}>Nenhum extrato ainda</Text>
    <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>O extrato do banco fica guardado só aqui, para você conferir com o app. Ele não mexe na conta.</Text>
    <Button title="Importar extrato (OFX ou CSV)" secondary onPress={onImport} />
  </View>;
  return <View style={{gap: 12}}>
    {d.statements.map(st => { const acc = account(st.accountId), start = String(acc?.entity?.data?.balance_set_at || ''); const rows = st.lines.map(l => ({l, m: matchOf(l, acc), before: !!start && l.date < start})); const missing = rows.filter(r => !r.m && !r.before).length;
      return <SwipeToDelete key={st.id} busy={busy === st.id} label="Apagar extrato" onDelete={() => appAlert('Apagar este extrato?', 'O extrato sai daqui' + (st.lines.some(l => d.txs.some(x => String(x.entity?.data?.import_id || '') === l.import_id)) ? ' e o que foi lançado a partir dele também, e a conta volta a como era.' : '.'), [{text: 'Cancelar', style: 'cancel'}, {text: 'Apagar', style: 'destructive', onPress: () => void remove(st)}])}>
      <View style={{backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.line, overflow: 'hidden', boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
        <Pressable accessibilityRole="button" onPress={() => setOpen(o => o === st.id ? '' : st.id)} style={{padding: 14, gap: 4}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><Text style={{flex: 1, color: c.text, fontWeight: '700', fontSize: 14}}>{st.from.split('-').reverse().slice(0, 2).join('/')} a {st.to.split('-').reverse().slice(0, 2).join('/')}{acc ? ' · ' + acc.name : ''}</Text><Chevron open={open === st.id} /></View>
          <Text style={{color: c.muted, fontSize: 12}}>{st.lines.length} linhas · {missing ? missing + (missing === 1 ? ' falta no app' : ' faltam no app') : 'tudo confere'}{st.closing !== null ? ' · saldo no banco ' + money(st.closing) : ''}</Text>
        </Pressable>
        {open === st.id ? <View style={{paddingHorizontal: 14, paddingBottom: 14, gap: 6}}>
          {acc && st.closing !== null ? <Text style={{color: c.text, fontSize: 12, backgroundColor: c.input, borderRadius: 12, padding: 10}}>Banco no fim do extrato: <Text style={{fontWeight: '700'}}>{money(st.closing)}</Text> · app agora: <Text style={{fontWeight: '700'}}>{money(accountBalance(acc, d.txs))}</Text></Text> : null}
          {rows.map(({l, m, before}) => <View key={l.import_id} style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: 1, borderColor: c.line}}>
            <View style={{flex: 1}}><Text numberOfLines={1} style={{color: c.text, fontSize: 13}}>{l.desc}</Text><Text style={{color: m ? c.good : before ? c.muted : c.warn, fontSize: 11}}>{l.date.split('-').reverse().slice(0, 2).join('/')} · {m ? (m.how === 'app' ? 'bate com “' + m.tx.desc + '”' : 'lançado pelo extrato') : before ? 'antes do ponto de partida (já no Saldo)' : 'falta no app'}</Text></View>
            <Text style={{color: l.kind === 'income' ? c.good : c.text, fontWeight: '600', fontSize: 13}}>{l.kind === 'income' ? '+' : '−'}{money(l.amount)}</Text>
          </View>)}
        </View> : null}
      </View>
      </SwipeToDelete>; })}
    <Text style={{color: c.muted, fontSize: 11, textAlign: 'center'}}>Arraste um extrato para o lado para apagar.</Text>
    <Button title="Importar outro extrato" secondary onPress={onImport} />
  </View>;
}