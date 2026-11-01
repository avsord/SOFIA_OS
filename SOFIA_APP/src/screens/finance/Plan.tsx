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
import {Data, dateBR, saveEntity, SurePressable, Chips, Card_, Title, Bar, BigMoney, CatIcon} from './core';
import {Field} from './Setup';
import {startSeriesNextMonth, BudgetRow} from './Home';
import {TxRow} from './Transactions';
// ============================ CARTÕES ============================
export function CardsTab({d, month, api, reload, onTx, onManage, onNewBill}: {month: string; d: Data; api: SofiaApi; reload: () => Promise<void>; onTx: (t: Partial<Tx>) => void; onManage: () => void; onNewBill?: (cardId: string) => void; onEditBill?: (t: Tx) => void}) {
  const c = useTheme(), cards = d.cards.filter(x => !x.archived);
  const [cardId, setCardId] = useState(cards[0]?.id || ''), card = cards.find(x => x.id === cardId) || cards[0];
  // 0.3.223: a fatura e a do mes escolhido no topo (trocou o mes, trocou a fatura); sem setas dentro dela
  const i = card ? invoiceForMonth(card, d.txs, month) : undefined;
  const [pick, setPick] = useState(false), [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false), linking = useRef(false);
  if (!card) return <Card_><Text style={{color: c.text, fontWeight: '600'}}>Nenhum cartão ainda</Text><Text style={{color: c.muted}}>Adicione seu cartão com limite, dia de fechamento e vencimento. A Sofia monta as faturas sozinha.</Text><Button title="Adicionar cartão" onPress={onManage} /></Card_>;
  const used = cardUsed(card, d.txs);
  const statusColor: Record<Invoice['status'], string> = {aberta: c.info, fechada: c.warn, paga: c.good, vencida: c.danger, futura: c.muted};
  async function pay(accountId: string) {
    if (!i) return;
    setPick(false); setBusy(true);
    try { await saveEntity(api, 'fin_tx', 'Fatura ' + card.name + ' ' + i.month.slice(5, 7) + '/' + i.month.slice(0, 4), {kind: 'card_payment', amount: Math.round((i.total - i.paid) * 100) / 100, date: todayISO(), card_id: card.id, invoice_month: i.month, account_id: accountId, paid: true, category: 'Fatura do cartão'}); await reload(); }
    catch (e) { appAlert('Finanças', errorText(e)); } finally { setBusy(false); }
  }
  return (
    <>
      {cards.length > 1 ? <Chips scroll value={card.id} onChange={setCardId} options={cards.map(x => ({value: x.id, label: x.name}))} /> : null}
      <View style={{backgroundColor: card.color, borderRadius: 22, padding: 18, gap: 10}}>
        <Text style={{color: PALETTE.white, fontWeight: '700', fontSize: 18}}>💳 {card.name}</Text>
        <Text style={{color: PALETTE.white+'cc', fontSize: 12}}>Limite {money(card.limit)} · usado {money(used)} · {card.limit && used > card.limit ? <Text style={{color: PALETTE.white, fontWeight: '700', backgroundColor: c.danger, borderRadius: 6}}> passou {money(used - card.limit)} do limite </Text> : 'disponível ' + money(Math.max(0, card.limit - used))}</Text>
        <View style={{height: 8, borderRadius: 4, backgroundColor: PALETTE.white+'44', overflow: 'hidden'}}><View style={{width: `${Math.min(100, card.limit ? used / card.limit * 100 : 0)}%`, height: 8, backgroundColor: PALETTE.white}} /></View>
        <Text style={{color: PALETTE.white+'cc', fontSize: 11}}>Fecha dia {card.closing} · vence dia {card.due}</Text>
      </View>
      {i ? (
        <Card_>
          <View style={{alignItems: 'center'}}>
              <Text style={{color: c.text, fontWeight: '600'}}>Fatura de {monthLabel(i.month).toLowerCase()}</Text>
              <View style={{paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: statusColor[i.status] + '22', marginTop: 4}}><Text style={{color: statusColor[i.status], fontWeight: '600', fontSize: 11}}>{i.status.charAt(0).toUpperCase()+i.status.slice(1)}</Text></View>
          </View>
          <View style={{alignItems: 'center'}}><BigMoney text={money(i.total)} color={c.text} size={32} /></View>
          <Text style={{color: c.muted, fontSize: 12, textAlign: 'center'}}>{i.status === 'fechada' || i.status === 'paga' ? 'Fechou' : 'Fecha'} {dateBR(i.close)} · {i.status !== 'paga' && todayISO() > i.due ? <Text style={{color: c.danger, fontWeight: '600'}}>venceu {dateBR(i.due)}</Text> : 'vence ' + dateBR(i.due)}{i.paid ? ' · pago ' + money(i.paid) : ''}</Text>
          {i.total > i.paid && i.status !== 'futura' && i.status !== 'paga' ? <Button title={busy ? 'Pagando…' : 'Pagar fatura · ' + money(i.total - i.paid)} loading={busy} onPress={() => d.accounts.filter(a => !a.archived).length > 1 ? setPick(true) : void pay(card.accountId || d.accounts[0].id)} /> : null}
          {i.items.length ? i.items.map((t, k) => <TxRow key={t.id} t={t} d={d} first={k === 0} onPress={() => onTx(t)} api={api} reload={reload} inInvoice />) : <Text style={{color: c.muted, textAlign: 'center'}}>Nenhuma compra nesta fatura.</Text>}
          <View style={{flexDirection: 'row', gap: 8, marginTop: 4}}>
            <SurePressable accessibilityRole="button" disabled={busy} onPress={() => { if (!busy) setLinkOpen(true); }} style={{flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center'}}><Text style={{color: c.accent, fontWeight: '600', fontSize: 13}}>Usar conta existente</Text></SurePressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => onNewBill?.(card.id)} style={{flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center'}}><Text style={{color: c.onAccent, fontWeight: '600', fontSize: 13}}>Nova conta</Text></Pressable>
          </View>
        </Card_>
      ) : null}
      <Sheet visible={pick} onClose={() => setPick(false)} label="Fechar escolha de conta">
        <Text style={{fontSize: 18, fontWeight: '600', color: c.text, marginBottom: 8}}>Pagar com qual conta?</Text>
        {d.accounts.filter(a => !a.archived).map(a => <Pressable key={a.id} onPress={() => void pay(a.id)} style={{paddingVertical: 14}}><Text style={{color: c.text, fontSize: 16}}>{a.name} · {money(accountBalance(a, d.txs))}</Text></Pressable>)}
      </Sheet>
      {/* 0.3.223: "Usar conta existente" - escolhe uma conta de Contas para passar a ser paga neste cartao */}
      {(() => { const candidates = d.txs.filter(t => !t.virtual && t.manualDue && t.kind === 'expense' && !t.cardId && ((t.recurrence === 'monthly' && !t.seriesId) || (t.recurrence === 'none' && !t.paid)));
        const link = async (t: Tx) => { if (linking.current) return; linking.current = true; setBusy(true); try { if (t.recurrence === 'monthly' && t.paid && t.entity) await startSeriesNextMonth(api, t, {card_id: card.id, invoice_month: ''}, t.desc); else if (t.entity) await saveEntity(api, 'fin_tx', t.desc, {card_id: card.id, invoice_month: '', paid: false}, t.entity); setLinkOpen(false); await reload(); } catch (e) { appAlert('Finanças', errorText(e)); } finally { linking.current = false; setBusy(false); } };
        return <>
          <Presence>{linkOpen ? <Sheet visible onClose={() => setLinkOpen(false)} label="Fechar escolher conta">
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 10, paddingBottom: 18}}>
              <Text style={{fontSize: 20, fontWeight: '700', color: c.text}}>Pagar no {card.name}</Text>
              <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>Escolha a conta que passa a ser paga neste cartão. Conta fixa já paga este mês continua paga pela conta; o cartão vale a partir do mês que vem.</Text>
              {candidates.length ? candidates.map(t => <SurePressable key={t.id} accessibilityRole="button" disabled={busy} onPress={() => void link(t)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, backgroundColor: c.input}}>
                <View style={{flex: 1, gap: 2}}><Text numberOfLines={1} style={{color: c.text, fontWeight: '500'}}>{t.desc}</Text><Text style={{color: c.muted, fontSize: 11}}>{t.recurrence === 'monthly' ? 'todo mês, dia ' + Number(t.date.slice(8, 10)) : dateBR(t.date)}</Text></View>
                <Text style={{color: c.text, fontWeight: '600'}}>{money(t.amount)}</Text>
              </SurePressable>) : <Text style={{color: c.muted}}>Nenhuma conta a pagar em Contas para trazer para o cartão.</Text>}
            </ScrollView>
          </Sheet> : null}</Presence>
        </>; })()}
    </>
  );
}

// ============================ PLANEJAMENTO ============================
export function PlanTab({d, month, api, reload}: {d: Data; month: string; api: SofiaApi; reload: () => Promise<void>}) {
  const c = useTheme(), progress = budgetProgress(d.budgets, d.txs, month);
  const [budgetSheet, setBudgetSheet] = useState<Budget | 'new' | null>(null), [goalSheet, setGoalSheet] = useState<Goal | 'new' | null>(null), [deposit, setDeposit] = useState<Goal | null>(null);
  const totalLimit = d.budgets.reduce((s, b) => s + b.limit, 0), totalSpent = progress.reduce((s, p) => s + p.spent, 0);
  return (
    <>
      <Card_>
        <Title text="Orçamento do mês" action="+ Categoria" onAction={() => setBudgetSheet('new')} />
        {d.budgets.length ? (
          <>
            <Text style={{color: c.muted, fontSize: 12}}>{money(totalSpent)} gastos de {money(totalLimit)} planejados</Text>
            <Bar pct={totalLimit ? totalSpent / totalLimit : 0} color={totalSpent > totalLimit ? c.danger : c.accent} />
            {progress.map(p => <Pressable key={p.budget.id} onPress={() => setBudgetSheet(p.budget)}><BudgetRow p={p} /></Pressable>)}
          </>
        ) : <Text style={{color: c.muted}}>Defina quanto quer gastar por mês em cada categoria. A Sofia mostra quanto ainda pode gastar e avisa quando passar de 80%.</Text>}
      </Card_>
      <Card_>
        <Title text="Objetivos" action="+ Objetivo" onAction={() => setGoalSheet('new')} />
        {d.goals.length ? d.goals.map(g => {
          const p = goalProgress(g);
          return (
            <Pressable key={g.id} onPress={() => setGoalSheet(g)} style={{gap: 6}}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}><View style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8}}><Icon name={g.done ? 'checkCircle' : 'guardado'} size={16} color={g.done ? c.good : c.accent} /><Text style={{flex: 1, color: c.text, fontWeight: '500'}}>{g.name}</Text></View><Text style={{color: c.muted, fontSize: 12}}>{Math.round(p.pct * 100)}%</Text></View>
              <Bar pct={p.pct} color={g.color} />
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <Text style={{flex: 1, color: c.muted, fontSize: 11}}>{money(g.saved)} de {money(g.target)}{p.perMonth ? ' · guarde ' + money(p.perMonth) + '/mês até ' + dateBR(g.deadline) + '/' + g.deadline.slice(0, 4) : p.left ? ' · faltam ' + money(p.left) : ' · concluído!'}</Text>
                {p.left > 0 ? <Pressable onPress={() => setDeposit(g)} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: g.color + '22'}}><Text style={{color: g.color, fontWeight: '600', fontSize: 12}}>+ Guardar</Text></Pressable> : null}
              </View>
            </Pressable>
          );
        }) : <Text style={{color: c.muted}}>Viagem, reserva de emergência, um equipamento novo… A Sofia calcula quanto guardar por mês até o prazo.</Text>}
      </Card_>
      <Presence>{budgetSheet ? <BudgetSheet api={api} budget={budgetSheet === 'new' ? null : budgetSheet} used={d.budgets.map(b => b.category)} onClose={() => setBudgetSheet(null)} onSaved={() => { setBudgetSheet(null); void reload(); }} /> : null}</Presence>
      <Presence>{goalSheet ? <GoalSheet api={api} goal={goalSheet === 'new' ? null : goalSheet} onClose={() => setGoalSheet(null)} onSaved={() => { setGoalSheet(null); void reload(); }} /> : null}</Presence>
      <Presence>{deposit ? <AmountSheet title={'Guardar em ' + deposit.name} onClose={() => setDeposit(null)} onSave={async v => { const saved = Math.round((deposit.saved + v) * 100) / 100; await saveEntity(api, 'fin_goal', deposit.name, {saved}, deposit.entity, saved >= deposit.target ? 'completed' : undefined); setDeposit(null); await reload(); }} /> : null}</Presence>
    </>
  );
}
export function AmountSheet({title, onClose, onSave}: {title: string; onClose: () => void; onSave: (v: number) => Promise<void>}) {
  const c = useTheme(), [text, setText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return (
    <Sheet visible onClose={onClose} label="Fechar">
      <View style={{gap: 12}}>
        <Text style={{fontSize: 18, fontWeight: '600', color: c.text}}>{title}</Text>
        <Field label="Valor (R$)" value={text} onChange={setText} numeric big placeholder="0,00" />
        {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
        <Button title="Salvar" loading={busy} onPress={async () => { const v = parseMoney(text); if (!v || v <= 0) { setError('Digite um valor.'); return; } setBusy(true); try { await onSave(v); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }} />
      </View>
    </Sheet>
  );
}
export function BudgetSheet({api, budget, used, onClose, onSaved}: {api: SofiaApi; budget: Budget | null; used: string[]; onClose: () => void; onSaved: () => void}) {
  const c = useTheme(), [cat, setCat] = useState(budget?.category || ''), [limit, setLimit] = useState(budget ? finishMoneyInput(String(budget.limit).replace('.', ',')) : ''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return (
    <Sheet visible onClose={onClose} label="Fechar orçamento">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 12}}>
        <Text style={{fontSize: 18, fontWeight: '600', color: c.text}}>{budget ? 'Editar orçamento' : 'Novo orçamento'}</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
          {EXPENSE_CATEGORIES.filter(x => x.name === budget?.category || !used.includes(x.name)).map(x => <Pressable key={x.name} onPress={() => setCat(x.name)} style={{flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: cat === x.name ? x.color : c.line, backgroundColor: cat === x.name ? x.color + '22' : 'transparent'}}><CatIcon cat={x} size={16} /><Text style={{color: c.text, fontSize: 13}}>{x.name}</Text></Pressable>)}
        </View>
        <Field label="Limite por mês (R$)" value={limit} onChange={setLimit} numeric placeholder="0,00" />
        {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
        <Button title="Salvar" loading={busy} onPress={async () => { const v = parseMoney(limit); if (!cat || !v || v <= 0) { setError('Escolha a categoria e o limite.'); return; } setBusy(true); try { await saveEntity(api, 'fin_budget', cat, {category: cat, limit: v}, budget?.entity); onSaved(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }} />
        {budget ? <Pressable onPress={async () => { await api.deleteEntity(budget.id).catch(() => undefined); onSaved(); }} style={{alignItems: 'center', padding: 10}}><Text style={{color: c.danger}}>Remover orçamento</Text></Pressable> : null}
      </ScrollView>
    </Sheet>
  );
}
export function GoalSheet({api, goal, onClose, onSaved}: {api: SofiaApi; goal: Goal | null; onClose: () => void; onSaved: () => void}) {
  const c = useTheme(), [name, setName] = useState(goal?.name || ''), [target, setTarget] = useState(goal ? finishMoneyInput(String(goal.target).replace('.', ',')) : ''), [saved, setSaved] = useState(goal ? finishMoneyInput(String(goal.saved).replace('.', ',')) : '');
  const [deadline, setDeadline] = useState(goal?.deadline || ''), [color, setColor] = useState(goal?.color || FIN_COLORS[1]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return (
    <Sheet visible onClose={onClose} label="Fechar objetivo">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 12}}>
        <Text style={{fontSize: 18, fontWeight: '600', color: c.text}}>{goal ? 'Editar objetivo' : 'Novo objetivo'}</Text>
        <Field label="Nome" value={name} onChange={setName} placeholder="Ex.: Reserva de emergência" />
        <Field label="Valor do objetivo (R$)" value={target} onChange={setTarget} numeric placeholder="0,00" />
        <Field label="Já guardado (R$)" value={saved} onChange={setSaved} numeric placeholder="0,00" />
        <DateTimeField label="Prazo (opcional)" value={deadline} onChange={setDeadline} dateOnly />
        <View style={{flexDirection: 'row', gap: 10}}>{FIN_COLORS.map(x => <Pressable key={x} onPress={() => setColor(x)} style={{width: 30, height: 30, borderRadius: 15, backgroundColor: x, borderWidth: color === x ? 3 : 0, borderColor: c.text}} />)}</View>
        {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
        <Button title="Salvar" loading={busy} onPress={async () => {
          const t = parseMoney(target), s = saved.trim() ? parseMoney(saved) : 0;
          if (!name.trim() || !t || t <= 0 || s === null || s < 0) { setError('Preencha nome e valor.'); return; }
          setBusy(true); try { await saveEntity(api, 'fin_goal', name.trim(), {target: t, saved: s, deadline, color}, goal?.entity, s >= t ? 'completed' : 'active'); onSaved(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
        }} />
        {goal ? <Pressable onPress={async () => { await api.deleteEntity(goal.id).catch(() => undefined); onSaved(); }} style={{alignItems: 'center', padding: 10}}><Text style={{color: c.danger}}>Apagar objetivo</Text></Pressable> : null}
      </ScrollView>
    </Sheet>
  );
}

// ============================ RELATÓRIOS ============================
export function Donut({slices, size = 170}: {slices: Array<{value: number; color: string}>; size?: number}) {
  const c = useTheme(), total = slices.reduce((s, x) => s + x.value, 0), r = size / 2 - 14, cx = size / 2, cy = size / 2;
  if (!total) return <View style={{width: size, height: size, borderRadius: size / 2, borderWidth: 24, borderColor: c.input}} />;
  let a0 = -Math.PI / 2;
  const arcs = slices.filter(x => x.value > 0).map((x, i) => {
    const a1 = a0 + x.value / total * Math.PI * 2 - 0.0001, large = a1 - a0 > Math.PI ? 1 : 0;
    const p = `M ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`;
    a0 = a1 + 0.0001;
    return <Path key={i} d={p} stroke={x.color} strokeWidth={24} fill="none" />;
  });
  return <Svg width={size} height={size}>{arcs}</Svg>;
}