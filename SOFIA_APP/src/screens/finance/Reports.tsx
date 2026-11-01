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
import {GUARD, Data, readSaldoStore, Chips, Bar, CatIcon, Dot} from './core';
import {CLOSED_MSG, isClosedMonth, afterSheet, saveFresh} from './Home';
import {Donut} from './Plan';
import {Fold} from './Goal';
export function ReportsTab({d: full, month, reserve, api, reload}: {d: Data; month: string; reserve: Goal | null; api?: SofiaApi; reload?: () => Promise<void>}) {
  const c = useTheme(), [kind, setKind] = useState<'expense' | 'income'>('expense');
  // 0.3.194: botao para recomecar os relatorios a partir de hoje (ponto de partida). Nada e apagado.
  const accounts = full.accounts.filter(a => !a.archived);
  const starts = [...new Set(accounts.map(a => a.reportStart).filter(Boolean))].sort();
  const startLabel = starts.length ? starts[starts.length - 1].split('-').reverse().join('/') : '';
  const d = useMemo(() => ({...full, txs: sinceReportStart(full.accounts, full.txs), moves: (full.moves || []).filter(m => !starts.length || m.date >= starts[0])}), [full]);
  // saldo e guardado sao valores absolutos: vem do historico inteiro, mas o grafico so mostra a partir do ponto de partida
  const startMs = starts.length ? Date.parse(starts[starts.length - 1] + 'T00:00:00Z') : 0;
  const fromStart = (pts: Array<{t: number; v: number}>) => pts.filter(p => p.t >= startMs);
  const [resetBusy, setResetBusy] = useState(false);
  // 0.3.208: meta do guardado com progresso, marcos e projecao
  const goal = useMemo(() => { if (!reserve || !(Number(reserve.target) > 0)) return null; const sp = moneySplit(reserve, full.moves || [], full.accounts, full.txs, full.cards, monthOf(todayISO()));
    return {name: reserve.name || 'Sua meta', saved: sp.saved, target: Number(reserve.target), monthly: sp.planned || 0, deadline: String(reserve.entity?.data?.deadline || ''), today: todayISO()}; }, [reserve, full]);
  // 0.3.227: so despesas avulsas (sem contas, fixas e parcelas)
  const week = useMemo(() => lastWeekByCategory(full.txs.filter(t => !t.manualDue && t.recurrence === 'none' && !t.seriesId), ''), [full]);
  function setStart(date: string) {
    if (!api) return;
    const go = async () => {
      setResetBusy(true);
      try { await Promise.all(accounts.map(a => api.saveEntity({...a.entity, data: {...a.entity.data, report_start: date}}))); await reload?.(); }
      catch (e) { appAlert('Finanças', errorText(e)); } finally { setResetBusy(false); }
    };
    if (!date) { void go(); return; }
    appAlert('Recomeçar os relatórios a partir de hoje?', 'Os gráficos e totais passam a contar a partir de ' + date.split('-').reverse().join('/') + '. Nada é apagado: os lançamentos de antes continuam no Histórico e no Saldo, e dá para voltar ao histórico completo quando quiser.',
      [{text: 'Cancelar', style: 'cancel'}, {text: 'Recomeçar', onPress: () => void go()}]);
  }
  const cats = useMemo(() => byCategory(d.txs, month, kind), [d, month, kind]), total = cats.reduce((s, x) => s + x.total, 0);
  const {t6, s, prev, bal, saved} = useMemo(() => ({t6: trend(d.txs, month, 6), s: monthSummary(d.txs, month), prev: monthSummary(d.txs, addMonths(month, -1)), bal: fromStart(balanceSeries(full.accounts, full.txs, month, reserve ? {goalId: reserve.id, moves: full.moves || []} : undefined)), saved: reserve ? fromStart(reserveSeries(reserve, full.moves || [], month)) : []}), [d, full, month, reserve]);
  const max = Math.max(1, ...t6.flatMap(x => [x.income, x.expense]));
  const [w, setW] = useState(0);
  const [hoverMonth, setHoverMonth] = useState(-1);
  return (
    <>
      {/* 0.3.223: ordem - Por categoria, Evolucao do guardado, Dinheiro guardado, Evolucao do saldo; depois semana, comparado e 6 meses */}
      <Fold id="categorias" title="Por categoria">
        <View style={{alignSelf: 'flex-start'}}><Chips value={kind} onChange={setKind} options={[{value: 'expense' as const, label: 'Despesas'}, {value: 'income' as const, label: 'Receitas'}]} /></View>
        <View style={{alignItems: 'center', justifyContent: 'center'}}>
          <Donut slices={cats.map(x => ({value: x.total, color: x.category.color}))} />
          <View style={{position: 'absolute', alignItems: 'center'}}><Text style={{color: c.muted, fontSize: 11}}>Total</Text><Text style={{color: c.text, fontWeight: '700', fontSize: 16}}>{money(total)}</Text></View>
        </View>
        {cats.length ? cats.map(x => (
          <View key={x.category.name} style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
            <Dot color={x.category.color} icon={x.category.icon} glyph={x.category.glyph} size={30} />
            <View style={{flex: 1, gap: 4}}><View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.text}}>{x.category.name}</Text><Text style={{color: c.text, fontWeight: '600'}}>{money(x.total)}</Text></View><Bar pct={x.pct} color={x.category.color} /></View>
            <Text style={{color: c.muted, fontSize: 11, width: 36, textAlign: 'right'}}>{Math.round(x.pct * 100)}%</Text>
          </View>
        )) : <Text style={{color: c.muted, textAlign: 'center'}}>Sem {kind === 'expense' ? 'despesas' : 'receitas'} neste mês.</Text>}
      </Fold>
      {saved.length > 1 ? (
        <Fold id="guardado" title="Evolução do guardado no mês">
          
          <PriceChart lines={[{id: 'guardado', color: GUARD, points: saved}]} height={160} window="all" mode="price" />
          <Text style={{color: c.muted, fontSize: 12}}>De {money(saved[0].v)} no início a {money(saved[saved.length - 1].v)} hoje.</Text>
        </Fold>
      ) : null}
      {goal ? <Fold id="meta" title="Dinheiro guardado"><GoalProgressCard g={goal} flat /></Fold> : null}
      {bal.length > 1 ? (
        <Fold id="saldo" title="Evolução do saldo no mês">
          
          <PriceChart lines={[{id: 'saldo', color: c.accent, points: bal}]} height={160} window="all" mode="price" />
        </Fold>
      ) : null}
      {week.lines.length ? <Fold id="semana" title="Semana passada">
        
        <Text style={{color: c.muted, fontSize: 12}}>{week.start.split('-').reverse().slice(0, 2).join('/')} a {week.end.split('-').reverse().slice(0, 2).join('/')} · {money(week.total)} em gastos</Text>
        {week.lines.slice(0, 6).map(l => <View key={l.category} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderColor: c.line}}>
          <CatIcon cat={categoryOf(l.category)} size={18} />
          <Text style={{flex: 1, color: c.text, fontSize: 13}}>{l.category}</Text>
          {l.change !== null ? <Text style={{color: l.change > 0.3 ? c.warn : l.change < -0.1 ? c.good : c.muted, fontSize: 11, fontWeight: '600'}}>{l.change > 0 ? '+' : ''}{Math.round(l.change * 100)}% vs média</Text> : <Text style={{color: c.muted, fontSize: 11}}>novo</Text>}
          <Text style={{color: c.text, fontWeight: '600', fontSize: 13}}>{money(l.total)}</Text>
        </View>)}
      </Fold> : null}
      <Fold id="seis" title="Receitas × despesas · 6 meses">
        
        <View onLayout={e => {const w = e.nativeEvent.layout.width; if (w > 0) setW(w);}} style={{height: 150}}>
          {w ? <Svg width={w} height={150}>
            <Line x1={0} x2={w} y1={130} y2={130} stroke={c.line} />
            {t6.map((m, i) => { const bw = w / t6.length, x = i * bw + bw * 0.18, h1 = m.income / max * 120, h2 = m.expense / max * 120; return <React.Fragment key={m.month}><Rect x={x} y={130 - h1} width={bw * 0.3} height={h1} rx={3} fill={c.good} /><Rect x={x + bw * 0.33} y={130 - h2} width={bw * 0.3} height={h2} rx={3} fill={c.danger} /></React.Fragment>; })}
          </Svg> : null}
          {/* 0.3.263 (fase 4 — graficos): no computador, passar o mouse num mes mostra os valores dele */}
          {w ? <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row'}}>{t6.map((m, k) => <Pressable key={m.month} accessibilityLabel={monthLabel(m.month) + ': receitas ' + money(m.income) + ', despesas ' + money(m.expense)} onHoverIn={() => setHoverMonth(k)} onHoverOut={() => setHoverMonth(h => h === k ? -1 : h)} onPress={() => setHoverMonth(h => h === k ? -1 : k)} style={{flex: 1, backgroundColor: hoverMonth === k ? c.accent + '10' : 'transparent', borderRadius: 8}} />)}</View> : null}
          {w && hoverMonth >= 0 && t6[hoverMonth] ? <View pointerEvents="none" style={{position: 'absolute', top: 4, left: Math.max(0, Math.min(w - 190, (hoverMonth + 0.5) * (w / t6.length) - 95)), width: 190, padding: 10, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 3, boxShadow: '0 6px 20px rgba(24,18,48,0.16)'} as any}>
            <Text style={{color: c.text, fontWeight: '600', fontSize: 12, textTransform: 'capitalize'}}>{monthLabel(t6[hoverMonth].month)}</Text>
            <Text style={{color: c.good, fontSize: 12, fontVariant: ['tabular-nums']}}>Receitas {money(t6[hoverMonth].income)}</Text>
            <Text style={{color: c.danger, fontSize: 12, fontVariant: ['tabular-nums']}}>Despesas {money(t6[hoverMonth].expense)}</Text>
            <Text style={{color: c.muted, fontSize: 12, fontVariant: ['tabular-nums']}}>Resultado {money(t6[hoverMonth].income - t6[hoverMonth].expense)}</Text>
          </View> : null}
        </View>
        <View style={{flexDirection: 'row'}}>{t6.map(m => <Text key={m.month} style={{flex: 1, textAlign: 'center', fontSize: 10, color: m.month === month ? c.text : c.muted, fontWeight: m.month === month ? '700' : '400'}}>{monthLabel(m.month).slice(0, 3)}</Text>)}</View>
        <View style={{flexDirection: 'row', gap: 14, justifyContent: 'center'}}><Text style={{color: c.good, fontSize: 12}}>● Receitas</Text><Text style={{color: c.danger, fontSize: 12}}>● Despesas</Text></View>
      </Fold>

    </>
  );
}

// ============================ 0.3.182: DETALHES DO SALDO, RECEITAS E DESPESAS ============================
/** Tocar no Saldo mostra de onde ele vem; tocar em Receitas ou Despesas lista as do mes. */
export function MonthBreakdown({kind, d, month, show, net, onTx, onClose, api, accountId = '', reload, onPatch, onRemove}: {onPatch?: (id: string, ch: Partial<Tx>) => void; onRemove?: (id: string) => void; kind: 'saldo' | 'income' | 'expense'; d: Data; month: string; show: (v: number) => string; net: number; onTx: (t: Tx) => void; onClose: () => void; api?: SofiaApi; accountId?: string; reload?: () => Promise<void>}) {
  const c = useTheme();
  // 0.3.192: ajustar o Saldo para o valor real do banco. Muda o ponto de partida da conta (saldo inicial)
  // pela diferenca; nada e apagado e os lancamentos continuam contando a partir dali.
  const included = d.accounts.filter(a => a.include && !a.archived);
  const target = accountId ? d.accounts.find(a => a.id === accountId) : included.length === 1 ? included[0] : undefined;
  const [adjusting, setAdjusting] = useState(false), [real, setReal] = useState(''), [adjBusy, setAdjBusy] = useState(false), [adjError, setAdjError] = useState('');
  async function applyAdjust(current: number) {
    const v = parseMoney(real), st = parseMoney(startReal);
    if (v === null || !Number.isFinite(v)) { setAdjError('Informe o saldo atual.'); return; }
    if (st === null || !Number.isFinite(st)) { setAdjError('Informe o saldo no início do mês.'); return; }
    if (!target || !api) return;
    setAdjBusy(true); setAdjError('');
    try {
      // 0.3.214: saldo atual -> o Saldo; saldo no inicio do mes -> o 100% do Controle de gastos deste mes
      const diff = Math.round((v - current) * 100) / 100, starts = {...target.monthStarts, [month]: Math.round(st * 100) / 100};
      await api.saveEntity({...target.entity, data: {...target.entity.data, initial_balance: String(Math.round((target.initial - (target.carry || 0) + diff) * 100) / 100), balance_set_at: todayISO(), month_starts_json: JSON.stringify(starts)}});
      // 0.3.225: fecha primeiro e recarrega depois que a janela saiu (antes a tela de tras aparecia cortada)
      Keyboard.dismiss(); setAdjusting(false); onClose(); afterSheet(() => { void reload?.(); });
    } catch (e) { setAdjError(errorText(e)); } finally { setAdjBusy(false); }
  }
  const list = useMemo(() => monthTxs(d.txs, month).filter(t => t.paid && t.kind === kind).sort((a, b) => b.date.localeCompare(a.date)), [d, month, kind]);
  const [rowEdit, setRowEdit] = useState<string | null>(null), [rowAmount, setRowAmount] = useState(''), [rowError, setRowError] = useState('');
  function saveRow(t: Tx) {
    const v = parseMoney(rowAmount);
    if (v === null || !Number.isFinite(v) || v <= 0) { setRowError('Digite o valor.'); return; }
    if (!api || !t.entity || !onPatch) return;
    Keyboard.dismiss(); onPatch(t.id, {amount: v}); setRowEdit(null); setRowError('');
    const entity = t.entity;
    void (async () => { try { await saveFresh(api, t.desc, {amount: v}, entity); } catch (e) { appAlert('Não consegui salvar', errorText(e) + ' O valor voltou ao que está salvo.'); } await reload?.(); })();
  }
  function removeRow(t: Tx) {
    if (!api || !t.entity || !onRemove) return;
    const entity = t.entity;
    appAlert('Apagar ' + (t.kind === 'income' ? 'esta receita' : 'esta despesa') + '?', t.desc + ' · ' + show(t.amount) + ' sai do total e do Histórico.', [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Apagar', style: 'destructive', onPress: () => { Keyboard.dismiss(); onRemove(t.id); setRowEdit(null);
        void (async () => { try { await api.deleteEntity(entity.id); } catch (e) { appAlert('Não consegui apagar', errorText(e) + ' O item voltou.'); } await reload?.(); })(); }},
    ]);
  }
  const total = list.reduce((s, t) => s + t.amount, 0);
  const [ledgerOpen, setLedgerOpen] = useState(false), reserve = reserveOf(d.goals);
  const [changes, setChanges] = useState<SaldoChange[]>([]);
  useEffect(() => {
    if (kind !== 'saldo' || !api) return;
    let live = true;
    const keys = [...(accountId ? [accountId] : d.accounts.filter(a => a.include && !a.archived).map(a => a.id)), ...(net ? ['reserve'] : [])];
    void readSaldoStore(api).then(st => { if (live) setChanges(keys.flatMap(k => st.log[k] || []).sort((a, b) => b.at.localeCompare(a.at))); });
    return () => { live = false; };
  }, [kind, api, accountId, d, net]);
  const parts = useMemo(() => {
    if (kind !== 'saldo') return null;
    const accounts = d.accounts.filter(a => a.include && !a.archived);
    const ids = new Set(accounts.map(a => a.id));
    const paid = d.txs.filter(t => t.paid && !t.virtual && ids.has(t.accountId) && !t.cardId);
    const initial = accounts.reduce((s, a) => s + a.initial, 0);
    const income = paid.filter(t => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = paid.filter(t => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
    const cards = d.txs.filter(t => t.paid && t.kind === 'card_payment' && ids.has(t.accountId)).reduce((s, t) => s + t.amount, 0);
    const total = totalBalance(d.accounts, d.txs) - net;
    // o que sobra para fechar a conta sao as transferencias entre contas (com conta fora do total)
    const transfers = Math.round((total + net - (initial + income - expense - cards)) * 100) / 100;
    const carry = Math.round(accounts.reduce((s, a) => s + (a.carry || 0), 0) * 100) / 100;
    // so o que esta na tela (o resto ja vem somado no acumulado dos meses anteriores)
    return {initial, income: income, expense, cards, transfers, total, carry};
  }, [kind, d, net]);
  // 0.3.222: extrato do saldo com o historico de mudancas (ajustes e alteracoes viram linhas, o passado fica como era)
  const ledger = useMemo(() => {
    if (!parts) return null;
    const ids = new Set(d.accounts.filter(a => a.include && !a.archived).map(a => a.id));
    const items: LedgerItem[] = [...d.txs.filter(t => t.paid && !t.virtual && ids.has(t.accountId) && !t.cardId && (t.kind === 'income' || t.kind === 'expense' || t.kind === 'card_payment')).map(t => ({id: t.id, date: t.date, desc: t.desc, delta: t.kind === 'income' ? t.amount : -t.amount, tx: t as Tx | null, note: t.manualDue ? 'conta' : /^(fitid:|h:)/.test(String(t.entity?.data?.import_id || '')) ? 'do extrato' : t.kind === 'card_payment' ? 'fatura' : ''})),
      ...d.txs.filter(t => t.paid && !t.virtual && t.kind === 'transfer' && (ids.has(t.accountId) !== ids.has(t.toAccountId))).map(t => ({id: t.id, date: t.date, desc: t.desc || 'Transferência', delta: ids.has(t.toAccountId) ? t.amount : -t.amount, tx: t as Tx | null, note: 'transferência'})),
      ...(reserve && net ? (d.moves || []).filter(m => m.goalId === reserve.id && m.entity?.state !== 'archived').map(m => ({id: 'move:' + m.id, date: m.date, desc: m.direction === 'in' ? 'Aporte no guardado' : 'Retirada do guardado', delta: m.direction === 'in' ? -m.amount : m.amount, tx: null as Tx | null, note: 'reserva'})) : [])];
    return saldoLedger(items, Math.round((parts.initial - parts.carry) * 100) / 100, parts.carry, changes, parts.total);
  }, [parts, d, reserve, net, changes]);
  const [startReal, setStartReal] = useState('');
  const monthStartGuess = useMemo(() => { if (!parts) return 0; const r = reserveOf(d.goals); return monthControl(d.txs, d.moves || [], r?.id || '', month, accountId, parts.total, null).start; }, [parts, d, month, accountId]);
  const row = (label: string, value: string, strong = false, color?: string) => <View style={{flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4}}>
    <Text style={{color: strong ? c.text : c.muted, fontSize: strong ? 14 : 13, fontWeight: strong ? '800' : '400'}}>{label}</Text>
    <Text style={{color: color || c.text, fontSize: strong ? 15 : 13, fontWeight: strong ? '800' : '700'}}>{value}</Text></View>;
  return <Sheet visible onClose={onClose} label="Fechar detalhes">
    {/* 0.3.219: em Receitas/Despesas, o titulo e o valor ficam fixos no topo (fundo solido) e a lista rola por baixo */}
    <ScrollView keyboardShouldPersistTaps="handled" stickyHeaderIndices={parts ? undefined : [0]} contentContainerStyle={{gap: 12, paddingBottom: 18}}>
      {parts ? <>
        <Text style={{fontSize: 20, fontWeight: '700', color: c.text}}>Saldo</Text>
        {target && api ? (adjusting ? <View style={{backgroundColor: c.input, borderRadius: 16, padding: 14, gap: 10}}>
          <Text style={{color: c.text, fontWeight: '600'}}>Saldo no início de {monthLabel(month).split(' ')[0].toLowerCase()}</Text>
          <TextInput accessibilityLabel="Saldo no início do mês" value={startReal} onChangeText={v => setStartReal(old => formatMoneyInput(v, old))} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={c.muted}
            style={{fontSize: 24, fontWeight: '700', color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.surface}} />
          <Text style={{color: c.text, fontWeight: '600'}}>Saldo atual</Text>
          <TextInput accessibilityLabel="Saldo atual" value={real} onChangeText={v => setReal(old => formatMoneyInput(v, old))} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={c.muted}
            style={{fontSize: 24, fontWeight: '700', color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.surface}} />
          <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>O saldo atual é o que aparece no Saldo. O do início do mês é de onde o Controle de gastos parte: ele compara quanto você tinha com quanto tem agora. Nenhum lançamento é apagado.</Text>
          {adjError ? <Text style={{color: c.danger}}>{adjError}</Text> : null}
          <Button title="Salvar" loading={adjBusy} onPress={() => void applyAdjust(parts.total)} />
          <Pressable accessibilityRole="button" onPress={() => setAdjusting(false)}><Text style={{color: c.muted, textAlign: 'center'}}>Cancelar</Text></Pressable>
        </View> : <Button title="Ajustar saldo" secondary onPress={() => { setReal(finishMoneyInput(String(parts.total).replace('.', ','))); setStartReal(finishMoneyInput(String(target.monthStarts[month] ?? monthStartGuess).replace('.', ','))); setAdjusting(true); }} />)
          : <Text style={{color: c.muted, fontSize: 12}}>Para ajustar o saldo, escolha uma conta no topo.</Text>}
        <Text style={{fontSize: 16, fontWeight: '700', color: c.text, marginTop: 6}}>Como o saldo é calculado</Text>
        <View style={{backgroundColor: c.input, borderRadius: 16, padding: 14, gap: 2}}>
          {row('Ponto de partida (saldo inicial e ajustes)', show(parts.initial - parts.carry))}
          {parts.carry ? row((parts.carry > 0 ? '+' : '−') + ' Lançamentos de meses anteriores', show(Math.abs(parts.carry)), false, parts.carry > 0 ? c.good : c.danger) : null}
          {parts.initial ? <Text style={{color: c.muted, fontSize: 11, lineHeight: 16, marginBottom: 4}}>Não é um lançamento: é o saldo inicial da conta, já com os ajustes ao valor do banco. Muda pelo botão acima ou em Contas e cartões → conta.</Text> : null}
          {row('+ Receitas recebidas', show(parts.income), false, c.good)}
          {row('− Despesas pagas', show(parts.expense), false, c.danger)}
          {parts.cards ? row('− Faturas de cartão pagas', show(parts.cards), false, c.danger) : null}
          {parts.transfers ? row((parts.transfers > 0 ? '+' : '−') + ' Transferências entre contas', show(Math.abs(parts.transfers)), false, parts.transfers > 0 ? c.good : c.danger) : null}
          {net ? row(net > 0 ? '− Guardado (aportes − retiradas)' : '+ Retirado da reserva', show(Math.abs(net)), false, net > 0 ? c.danger : c.good) : null}
          <View style={{height: 1, backgroundColor: c.line, marginVertical: 6}} />
          {row('= Saldo', show(parts.total), true)}
        </View>
        {/* 0.3.225: extrato do saldo retirado a pedido do Pedro */}
        {ledgerOpen && parts && ledger ? <View style={{backgroundColor: c.input, borderRadius: 16, padding: 12, gap: 4}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.text, fontWeight: '600', fontSize: 12}}>Ponto de partida</Text><Text style={{color: c.text, fontWeight: '700', fontSize: 12}}>{show(ledger.start)}</Text></View>
          {ledger.carry ? <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.muted, fontSize: 12}}>Lançamentos de meses anteriores (somados)</Text><Text style={{color: ledger.carry > 0 ? c.good : c.danger, fontWeight: '600', fontSize: 12}}>{ledger.carry > 0 ? '+' : '−'}{show(Math.abs(ledger.carry))}</Text></View> : null}
          {ledger.rows.map(r => <Pressable key={r.id} accessibilityRole="button" disabled={!r.tx} onPress={() => { if (r.tx) onTx(r.tx); }} style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderColor: c.line, backgroundColor: r.change ? c.warn + '14' : 'transparent'}}>
            <Text style={{color: c.muted, fontSize: 11, width: 38}}>{r.date.slice(8, 10)}/{r.date.slice(5, 7)}</Text>
            <Text numberOfLines={2} style={{flex: 1, color: c.text, fontSize: 12}}>{r.desc}{r.note ? <Text style={{color: r.change ? c.warn : c.muted}}> · {r.note}</Text> : null}</Text>
            <Text style={{color: r.delta >= 0 ? c.good : c.danger, fontSize: 12, fontWeight: '600'}}>{r.delta >= 0 ? '+' : '−'}{show(Math.abs(r.delta))}</Text>
            <Text style={{color: r.run < 0 ? c.danger : c.text, fontSize: 11, width: 76, textAlign: 'right'}}>{show(r.run)}</Text>
          </Pressable>)}
          <Text style={{color: c.muted, fontSize: 11, lineHeight: 16, marginTop: 6}}>{tap('Funciona como o extrato do banco: o que já passou não muda. Ajustes e alterações entram como uma linha nova, na hora em que aconteceram, com quanto mudou e quanto ficou. A última coluna é o saldo depois de cada linha. Toque num item para corrigir ou apagar.')}</Text>
        </View> : null}
        <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>{tap('Soma de tudo o que já foi pago ou recebido nas contas (não só deste mês). Se algum valor parecer errado, toque em Receitas ou Despesas para ver os lançamentos, ou confira o saldo inicial da conta em Contas e cartões.')}</Text>
      </> : <View style={{backgroundColor: c.surface, paddingBottom: 10, gap: 2, borderBottomWidth: 1, borderColor: c.line}}>
        <Text style={{fontSize: 20, fontWeight: '700', color: c.text}}>{kind === 'income' ? 'Receitas' : 'Despesas'} de {monthLabel(month).split(' ')[0].toLowerCase()}</Text>
        <Text style={{color: kind === 'income' ? c.good : c.danger, fontWeight: '700', fontSize: 24}}>{show(total)}</Text>
      </View>}
      {parts ? null : <View>
        {/* 0.3.226: editar o valor ou apagar o item AQUI DENTRO; o item, o total e o Historico mudam na hora */}
        {list.length ? list.map((t, i) => rowEdit === t.id ? <View key={t.id} style={{gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: c.line}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}><CatIcon cat={categoryOf(t.category)} size={16} /><Text numberOfLines={1} style={{flex: 1, color: c.text, fontWeight: '600'}}>{t.desc}</Text></View>
          <TextInput accessibilityLabel={'Valor de ' + t.desc} autoFocus value={rowAmount} onChangeText={v => setRowAmount(old => formatMoneyInput(v, old))} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={c.muted}
            style={{fontSize: 24, fontWeight: '700', color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.input}} />
          {rowError ? <Text style={{color: c.danger}}>{rowError}</Text> : null}
          <View style={{flexDirection: 'row', gap: 8}}>
            <View style={{flex: 1}}><Button title="Salvar" onPress={() => saveRow(t)} /></View>
            <View style={{flex: 1}}><Button title="Apagar" secondary onPress={() => removeRow(t)} /></View>
          </View>
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
            <Pressable accessibilityRole="button" onPress={() => onTx(t)} style={{paddingVertical: 6}}><Text style={{color: c.accent, fontWeight: '600'}}>Mais opções</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setRowEdit(null); setRowError(''); }} style={{paddingVertical: 6}}><Text style={{color: c.muted}}>Cancelar</Text></Pressable>
          </View>
        </View> : <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={'Editar ' + t.desc} onPress={() => { if (isClosedMonth(monthOf(t.date))) { appAlert('Mês fechado', CLOSED_MSG); return; } if (onPatch && t.entity) { setRowEdit(t.id); setRowError(''); setRowAmount(finishMoneyInput(String(t.amount).replace('.', ','))); } else onTx(t); }} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: c.line}}>
          <CatIcon cat={categoryOf(t.category)} size={20} />
          <View style={{flex: 1, gap: 2}}>
            <Text numberOfLines={1} style={{color: c.text, fontWeight: '500'}}>{t.desc}</Text>
            <Text style={{color: c.muted, fontSize: 11}}>{t.date.split('-').reverse().slice(0, 2).join('/')} · {t.category}</Text>
          </View>
          <Text style={{color: kind === 'income' ? c.good : c.danger, fontWeight: '600'}}>{kind === 'income' ? '+' : '−'}{show(t.amount)}</Text>
        </Pressable>) : <Text style={{color: c.muted}}>Nenhuma {kind === 'income' ? 'receita' : 'despesa'} paga neste mês.</Text>}
      </View>}
    </ScrollView>
  </Sheet>;
}
