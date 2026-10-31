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
import {Refund, Data, dateBR, weekday, uid, saveEntity, SurePressable, cardWhen, Chips, Card_, CatIcon, Dot} from './core';
import {Field} from './Setup';
import {CLOSED_MSG, isClosedMonth, syncIncomeReserve, receiveTx, Segmented, Chevron} from './Home';
import {ImportSheet} from './Manage';
export function TxTab({d, month, accountFilter, setAccountFilter, onTx, api, reload}: {d: Data; month: string; accountFilter: string; setAccountFilter: (v: string) => void; onTx: (t: Partial<Tx>) => void; api: SofiaApi; reload: () => Promise<void>}) {
  const c = useTheme(), [kind, setKind] = useState<'all' | TxKind>('all'), [cat, setCat] = useState(''), [status, setStatus] = useState<'all' | 'pending'>('all');
  // 0.3.153: o que voce registrou na Sofia e o extrato importado do banco ficam separados, com troca.
  const [source, setSource] = useState<'app' | 'months'>('app'), [openMonth, setOpenMonth] = useState('');
  const imported = (t: Tx) => { const id = String(t.entity?.data?.import_id || ''); return !!id && !id.startsWith('sofia-pendencia:'); };
  // 0.3.160: em vez de digitar uma busca, filtros prontos com as categorias que JA foram usadas nos
  // lancamentos (nada inventado), da mais usada para a menos usada. Sem nenhuma categoria, sem filtro.
  const catPresets = useMemo(() => { const n = new Map<string, number>(); for (const t of d.txs) { if ((t.manualDue && !t.paid) || imported(t) || (kind !== 'all' && t.kind !== kind)) continue; const name = String(t.category || '').trim(); if (name) n.set(name, (n.get(name) || 0) + 1); } return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([name]) => name); }, [d.txs, source, kind]);
  const activeCat = catPresets.includes(cat) ? cat : '';
  const hasAnyTx = d.txs.some(t => (!t.manualDue || t.paid) && !imported(t));
  // 0.3.226: salario e qualquer receita programada (inclusive as de Contas) aparecem no Historico desde o comeco do mes,
  // como "a receber", ate serem confirmadas; conta a pagar segue so em Contas
  const pendingIncome = (t: Tx) => t.kind === 'income' && !t.paid;
  // 0.3.232: conta avulsa aparece so aqui no extrato; as programadas ficam em Contas
  // 0.3.225: pago antes ou depois do vencimento -> fica no Historico no dia em que foi pago
  const histDate = (t: Tx) => t.paid && t.paidAt ? t.paidAt : t.date;
  const monthItems = (m: string) => [...monthTxs(d.txs, m).filter(t => monthOf(histDate(t)) === m), ...d.txs.filter(t => !t.virtual && t.paid && t.paidAt && monthOf(t.paidAt) === m && monthOf(t.date) !== m)]
    .filter(t => !t.virtual && (t.paid || t.kind !== 'expense' || !isScheduled(t)) && !imported(t));
  const daysOf = (its: Tx[]) => { const g = new Map<string, Tx[]>(); for (const t of its) { const k = histDate(t); if (!g.has(k)) g.set(k, []); g.get(k)!.push(t); } return [...g.entries()].sort((a, b) => b[0].localeCompare(a[0])); };
  const closedMonths = useMemo(() => { const cur = monthOf(todayISO()), ms = new Set<string>(); for (const t of d.txs) { if (t.virtual || imported(t)) continue; const m = monthOf(t.paid && t.paidAt ? t.paidAt : t.date); if (m && m < cur) ms.add(m); } return [...ms].sort().reverse(); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const histSource = [...monthTxs(d.txs, month).filter(t => monthOf(histDate(t)) === month), ...d.txs.filter(t => !t.virtual && t.paid && t.paidAt && monthOf(t.paidAt) === month && monthOf(t.date) !== month)];
  const list = histSource.filter(t => (pendingIncome(t) || !t.manualDue || t.paid || !isScheduled(t)) && !imported(t) && (kind === 'all' || t.kind === kind) && (!accountFilter || t.accountId === accountFilter || t.toAccountId === accountFilter || t.cardId === accountFilter)
    && (status === 'all' || (!t.paid && !t.cardId)) && (!activeCat || t.category === activeCat));
  const days = useMemo(() => { const m = new Map<string, Tx[]>(); for (const t of list) { const k = histDate(t); if (!m.has(k)) m.set(k, []); m.get(k)!.push(t); } return [...m.entries()].map(([k, v]) => [k, [...v].sort((a, b) => (b.time || '').localeCompare(a.time || ''))] as [string, Tx[]]); }, [list]);
  const sum = list.reduce((s, t) => s + (t.kind === 'income' ? t.amount : t.kind === 'expense' ? -t.amount : 0), 0);
  const filterName = d.accounts.find(a => a.id === accountFilter)?.name || d.cards.find(x => x.id === accountFilter)?.name;
  const [importing, setImporting] = useState(false), [tools, setTools] = useState(false);
  return (
    <>
      {/* 0.3.152: historico direto sob os cartoes; busca, filtros e importacao ficam recolhidos */}
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 2}}>
        <Text style={{flex: 1, fontSize: 18, fontWeight: '700', color: c.text}}>Histórico</Text>
        {hasAnyTx ? <IconButton name="filter" label={tools ? 'Esconder filtros' : 'Filtrar'} onPress={() => setTools(v => !v)} /> : null}
      </View>
      <Segmented value={source} onChange={setSource} options={[{value: 'app' as const, label: 'Lançamentos'}, {value: 'months' as const, label: 'Histórico'}]} />
      {/* 0.3.231: Historico = meses que ja fecharam, pelo nome; abrir mostra aquele mes (so consulta) */}
      {source === 'months' ? (closedMonths.length ? closedMonths.map(m => { const its = monthItems(m), res = its.reduce((t, x) => t + (x.kind === 'income' ? x.amount : x.kind === 'expense' ? -x.amount : 0), 0), open = openMonth === m;
        return <Card_ key={m} style={{padding: 0, gap: 0}}>
          <Pressable accessibilityRole="button" accessibilityLabel={(open ? 'Fechar ' : 'Abrir ') + monthLabel(m)} onPress={() => setOpenMonth(open ? '' : m)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14}}>
            <Text style={{fontSize: 16}}>🔒</Text>
            <View style={{flex: 1, gap: 2}}><Text style={{color: c.text, fontWeight: '700', fontSize: 16}}>{monthLabel(m)}</Text>
              <Text style={{color: c.muted, fontSize: 12}}>{its.length} {its.length === 1 ? 'lançamento' : 'lançamentos'} · resultado {money(res)}</Text></View>
            <Chevron open={open} />
          </Pressable>
          {open ? <View style={{paddingHorizontal: 10, paddingBottom: 10, gap: 8}}>{daysOf(its).map(([date, items]) => <View key={date} style={{gap: 6}}>
            <Text style={{color: c.muted, fontSize: 12, fontWeight: '600', paddingLeft: 4}}>{weekday(date)}</Text>
            {items.map((t, i) => <TxRow key={t.id} t={t} d={d} first={i === 0} onPress={() => appAlert('Mês fechado', CLOSED_MSG)} api={api} reload={reload} />)}
          </View>)}</View> : null}
        </Card_>; }) : <Text style={{color: c.muted, textAlign: 'center', paddingVertical: 30}}>Nenhum mês fechado ainda. Quando o mês virar, ele aparece aqui para consulta.</Text>) : null}
      <Presence>{importing ? <ImportSheet api={api} d={d} onClose={() => setImporting(false)} onDone={async () => { setImporting(false); await reload(); }} /> : null}</Presence>
      {source === 'months' ? null : hasAnyTx && (tools || activeCat || kind !== 'all' || status !== 'all') ? <View style={{gap: 10}}>
      {catPresets.length ? <Chips scroll value={activeCat} onChange={setCat} options={[{value: '', label: 'Todas as categorias'}, ...catPresets.map(name => ({value: name, label: name}))]} /> : null}
      <Chips scroll value={kind} onChange={setKind} options={[{value: 'all' as const, label: 'Todos'}, {value: 'expense' as const, label: 'Despesas'}, {value: 'income' as const, label: 'Receitas'}, {value: 'transfer' as const, label: 'Transferências'}, {value: 'card_payment' as const, label: 'Faturas'}]} />
      <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
        <Chips value={status} onChange={setStatus} options={[{value: 'all' as const, label: 'Tudo'}, {value: 'pending' as const, label: 'Só pendentes'}]} />
        {filterName ? <Pressable onPress={() => setAccountFilter('')} style={{paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: c.accentSoft}}><Text style={{color: c.accent, fontWeight: '500', fontSize: 12}}>{filterName} ✕</Text></Pressable> : null}
      </View>
      </View> : null}
      {source === 'months' ? null : <>
      {isClosedMonth(month) ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.input}}><Text>🔒</Text><Text style={{flex: 1, color: c.text, fontSize: 13}}>{monthLabel(month)} já fechou — só consulta. Nada entra nem muda neste mês.</Text></View> : null}
      {list.length ? <Text style={{color: c.muted, fontSize: 12}}>{list.length} movimentações no mês · resultado {money(sum)}</Text> : null}
      {!days.length ? <Text style={{color: c.muted, textAlign: 'center', paddingVertical: 30}}>{activeCat || kind !== 'all' || status !== 'all' ? 'Nenhum lançamento com esses filtros.' : (isClosedMonth(month) ? 'Nenhum lançamento neste mês.' : tap('Nenhum lançamento neste mês. Toque em ＋ para registrar.'))}</Text> : days.map(([date, items]) => (
        <View key={date} style={{gap: 8}}>
          <Text style={{color: c.muted, fontSize: 12, fontWeight: '600', paddingLeft: 4}}>{weekday(date)}</Text>
          <Card_ style={{padding: 10, gap: 0}}>{items.map((t, i) => <TxRow key={t.id} t={t} d={d} first={i === 0} onPress={() => onTx(t)} api={api} reload={reload} />)}</Card_>
        </View>
      ))}
      </>}
    </>
  );
}
export function TxRow({t, d, first, onPress, api, reload, inInvoice = false}: {inInvoice?: boolean; t: Tx; d: Data; first: boolean; onPress: () => void; api: SofiaApi; reload: () => Promise<void>}) {
  const c = useTheme(), cat = categoryOf(t.category, t.kind);
  // 0.3.223: compra no cartao cobrada numa fatura de outro mes (feita depois do fechamento): no Historico do mes da compra
  // aparece apagada, avisando quando vai ser cobrada e que nao mexe no saldo agora; dentro da fatura, diz quando foi feita
  const cardOf = t.cardId ? d.cards.find(x => x.id === t.cardId) : undefined, billedIn = cardOf && t.date ? txInvoiceMonth(cardOf, t) : '';
  const later = !!billedIn && t.kind === 'expense' && billedIn > monthOf(t.date), dm = t.date.slice(8, 10) + '/' + t.date.slice(5, 7);
  const source = t.cardId ? (inInvoice ? '💳 ' + (cardOf?.name || 'Cartão') + (later ? ' · compra feita em ' + dm : '')
      : later ? '💳 ' + (cardOf?.name || 'Cartão') + ' · compra de ' + dm + ' · cobrada na fatura de ' + monthLabel(billedIn).split(' ')[0].toLowerCase() + ' · não mexe no saldo agora'
      : '💳 ' + (cardOf?.name || 'Cartão') + cardWhen(t, d.cards)) : t.kind === 'transfer' ? (d.accounts.find(a => a.id === t.accountId)?.name || '') + ' → ' + (d.accounts.find(a => a.id === t.toAccountId)?.name || '') : d.accounts.find(a => a.id === t.accountId)?.name || '';
  const pending = !t.paid && !t.cardId;
  // 0.3.256: despesa marcada para reembolso mostra o estado na linha do Historico
  const refund = t.kind === 'expense' ? (d.refunds || []).find(x => x.expenseId === t.id && x.state !== 'archived') : undefined, refundTag = (refund ? (refund.state === 'received' ? ' · ↩️ reembolsada' : ' · ↩️ reembolso pendente') : '') + (t.noBalance ? ' · não mexe no saldo' : '');
  const color = t.kind === 'income' ? c.good : t.kind === 'transfer' ? c.muted : c.text;
  return (
    <Pressable onPress={onPress} {...contextMenu(() => [
      {label: 'Abrir', icon: 'edit', run: onPress},
      ...(t.virtual ? [] : [
        {label: 'Duplicar', icon: 'copy' as const, run: () => { const e = t.entity; if (!e) return; void saveEntity(api, 'fin_tx', e.title, {...e.data, date: todayISO(), series_id: '', installment: '', installments: '', import_id: '', recurrence: 'none'}).then(() => reload()).catch(err => appAlert('Duplicar', errorText(err))); }},
        {label: 'Apagar', icon: 'trash' as const, danger: true, run: () => appAlert('Apagar lançamento?', 'Essa ação não pode ser desfeita.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Apagar', style: 'destructive', onPress: () => { void api.deleteEntity(t.id).then(() => reload()).catch(err => appAlert('Apagar', errorText(err))); }}])},
      ]),
    ])} style={{flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 6, borderTopWidth: first ? 0 : 1, borderColor: c.line, opacity: later && !inInvoice ? 0.5 : t.virtual ? 0.75 : 1}}>
      <Dot color={cat.color} icon={cat.icon} glyph={cat.glyph} />
      <View style={{flex: 1}}>
        <Text numberOfLines={1} style={{color: c.text, fontWeight: '500'}}>{t.desc}</Text>
        <Text numberOfLines={later && !inInvoice ? 2 : 1} style={{color: c.muted, fontSize: 11}}>{t.time ? t.time + ' · ' : ''}{cat.name} · {source}{t.installments > 1 ? ' · ' + t.installment + '/' + t.installments : ''}{t.recurrence !== 'none' || t.virtual ? ' · 🔁' : ''}{refundTag}</Text>
      </View>
      <View style={{alignItems: 'flex-end', gap: 2}}>
        <Text style={{color, fontWeight: '600'}}>{t.kind === 'income' ? '+' : t.kind === 'transfer' ? '' : '−'}{money(t.amount)}</Text>
        {pending ? <Pressable onPress={() => void receiveTx(api, d, t).then(reload).catch(e => appAlert('Finanças', errorText(e)))}><Text style={{fontSize: 11, color: t.date < todayISO() ? c.danger : c.warn, fontWeight: '600'}}>{t.virtual ? 'previsto · confirmar' : t.kind === 'income' ? 'a receber · ✓' : 'a pagar · ✓'}</Text></Pressable> : null}
      </View>
    </Pressable>
  );
}

// ============================ DEVOLUCOES (0.3.255) ============================
export function RefundsTab({d, api, reload, accountId}: {d: Data; api: SofiaApi; reload: () => Promise<void>; accountId: string}) {
  const c = useTheme(), accounts = d.accounts.filter(a => !a.archived);
  const all = (d.refunds || []).filter(r => !accountId || !r.accountId || r.accountId === accountId);
  const pending = all.filter(r => r.state === 'pending').sort((a, b) => (a.expected || '9999').localeCompare(b.expected || '9999'));
  const received = all.filter(r => r.state === 'received').sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, 10);
  const total = Math.round(pending.reduce((t, r) => t + r.amount, 0) * 100) / 100;
  const [editing, setEditing] = useState<Refund | 'new' | null>(null), [busy, setBusy] = useState('');
  const accountName = (id: string) => accounts.find(a => a.id === id)?.name || '';
  function receive(r: Refund) {
    const acc = r.accountId && accounts.some(a => a.id === r.accountId) ? r.accountId : accountId || accounts[0]?.id || '';
    if (!acc) { appAlert('Devoluções', 'Cadastre uma conta antes de receber.'); return; }
    appAlert('Recebeu ' + money(r.amount) + '?', '“' + r.title + '” entra agora no Saldo e no Histórico como receita de hoje' + (accountName(acc) ? ', na conta ' + accountName(acc) : '') + '.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Recebi', onPress: () => {
      setBusy(r.id);
      const now = new Date(), time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      void saveEntity(api, 'fin_tx', r.title, {kind: 'income', amount: r.amount, date: todayISO(), category: 'Reembolso', account_id: acc, paid: true, recurrence: 'none', time, __content: 'Devolução recebida'})
        .then(tx => saveEntity(api, 'fin_refund', r.title, {received_at: todayISO(), tx_id: tx.id, account_id: acc}, r.entity, 'received'))
        .then(() => reload()).catch(e => appAlert('Devoluções', errorText(e))).finally(() => setBusy(''));
    }}]);
  }
  return <View style={{gap: 14}}>
    <View style={{backgroundColor: c.surface, borderRadius: 20, padding: 16, gap: 6, borderWidth: 1, borderColor: c.line, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
      <Text style={{color: c.muted, fontSize: 12}}>A receber de devoluções</Text>
      <Text testID="refunds-total" style={{color: c.text, fontSize: 28, fontWeight: '700'}}>{money(total)}</Text>
      <Text style={{color: c.muted, fontSize: 12, lineHeight: 17}}>{tap('Não entra no Saldo nem no previsto. Quando o dinheiro cair, toque em “Recebi”: ele vai para o Saldo e para o Histórico.')}</Text>
    </View>
    <Button title="+ Nova devolução a receber" secondary onPress={() => setEditing('new')} />
    {pending.length ? pending.map(r => <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={'Editar ' + r.title} onPress={() => setEditing(r)} style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: c.line, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
      <Text style={{fontSize: 20}}>↩️</Text>
      <View style={{flex: 1, gap: 2}}>
        <Text style={{color: c.text, fontWeight: '600'}} numberOfLines={2}>{r.title}</Text>
        <Text style={{color: c.muted, fontSize: 12}}>{money(r.amount)}{r.expected ? ' · previsão ' + r.expected.split('-').reverse().join('/') : ''}{accountName(r.accountId) ? ' · ' + accountName(r.accountId) : ''}</Text>
      </View>
      <Pressable testID={'refund-receive-' + r.id} accessibilityRole="button" accessibilityLabel={'Recebi ' + r.title} disabled={!!busy} onPress={() => receive(r)} style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: c.good + '22'}}>
        {busy === r.id ? <ActivityIndicator color={c.good} /> : <Text style={{color: c.good, fontWeight: '700', fontSize: 12}}>Recebi</Text>}
      </Pressable>
    </Pressable>) : <Text style={{color: c.muted, fontSize: 13, textAlign: 'center', paddingVertical: 12}}>Nenhuma devolução esperando.</Text>}
    {received.length ? <View style={{gap: 8}}><Text style={{color: c.muted, fontSize: 12, fontWeight: '600'}}>RECEBIDAS</Text>{received.map(r => <View key={r.id} style={{flexDirection: 'row', gap: 10, paddingVertical: 6}}>
      <Text style={{flex: 1, color: c.text}} numberOfLines={1}>✓ {r.title}</Text><Text style={{color: c.muted, fontSize: 12}}>{money(r.amount)}{r.receivedAt ? ' · ' + r.receivedAt.split('-').reverse().join('/') : ''}</Text></View>)}</View> : null}
    <Presence>{editing ? <RefundSheet api={api} refund={editing === 'new' ? null : editing} accounts={accounts} defaultAccount={accountId || accounts[0]?.id || ''} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} /> : null}</Presence>
  </View>;
}
export function RefundSheet({api, refund, accounts, defaultAccount, expense, onClose, onSaved}: {api: SofiaApi; refund: Refund | null; accounts: Account[]; defaultAccount: string; expense?: {id: string; desc: string; amount: number}; onClose: () => void; onSaved: () => void}) {
  // 0.3.256: aberta pelo editar de uma despesa ("Vai ser reembolsada"): ja vem com o nome e o valor dela (valor ajustavel, reembolso parcial)
  const c = useTheme(), [title, setTitle] = useState(refund?.title || expense?.desc || ''), [amount, setAmount] = useState(refund ? finishMoneyInput(String(refund.amount).replace('.', ',')) : expense ? finishMoneyInput(String(expense.amount).replace('.', ',')) : '');
  const [expected, setExpected] = useState(refund?.expected || ''), [account, setAccount] = useState(refund?.accountId || defaultAccount), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save() {
    const value = parseMoney(amount);
    if (!title.trim()) { setError('Diga de onde vem a devolução.'); return; }
    if (!value || value <= 0) { setError('Digite o valor.'); return; }
    setBusy(true); setError('');
    try { await saveEntity(api, 'fin_refund', title.trim(), {amount: value, expected_date: expected || '', account_id: account || '', ...(expense && !refund ? {expense_id: expense.id} : {})}, refund?.entity, refund ? undefined : 'pending'); onSaved(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  function erase() {
    if (!refund) return;
    appAlert('Apagar esta devolução?', 'Ela sai da lista. O Saldo não muda.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Apagar', style: 'destructive', onPress: () => { setBusy(true); void api.deleteEntity(refund.id).then(onSaved).catch(e => setError(errorText(e))).finally(() => setBusy(false)); }}]);
  }
  return <Sheet visible onClose={onClose} label="Fechar devolução">
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 14, paddingBottom: 12}}>
      <Text style={{color: c.text, fontSize: 20, fontWeight: '700'}}>{refund ? 'Devolução a receber' : expense ? 'Vai ser reembolsada' : 'Nova devolução a receber'}</Text>
      {expense && !refund ? <Text style={{color: c.muted, fontSize: 12, lineHeight: 17}}>A despesa continua no Histórico e no Saldo (o dinheiro já saiu). O valor entra em Devoluções como a receber; quando cair, toque em “Recebi” e ele volta para o Saldo.</Text> : null}
      <Field label="De onde vem" value={title} onChange={setTitle} placeholder="Ex.: Estorno da loja" />
      <Field label="Valor (R$)" value={amount} onChange={setAmount} placeholder="0,00" numeric />
      <DateTimeField label="Previsão de chegada (opcional)" value={expected} onChange={setExpected} dateOnly />
      {accounts.length > 1 ? <View style={{gap: 6}}><Text style={{fontSize: 12, color: c.muted}}>Conta onde vai cair</Text><Chips scroll value={account} onChange={setAccount} options={accounts.map(a => ({value: a.id, label: a.name}))} /></View> : null}
      {error ? <Text style={{color: c.danger, fontSize: 13}}>{error}</Text> : null}
      <Button title="Salvar" loading={busy} onPress={() => void save()} />
      {refund ? <Pressable accessibilityRole="button" onPress={erase} style={{alignItems: 'center', paddingVertical: 10}}><Text style={{color: c.danger, fontWeight: '600'}}>Apagar devolução</Text></Pressable> : null}
    </ScrollView>
  </Sheet>;
}

// ============================ EDITOR ============================
/** 0.3.255: quando o item foi lancado no app (criado), em data e hora locais. */
export function addedAt(tx: Partial<Tx>): string {
  const raw = String((tx.entity as {created_at?: string} | undefined)?.created_at || ''), at = Date.parse(raw);
  if (!raw || !Number.isFinite(at)) return '';
  const dt = new Date(at);
  return dt.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'}) + ' às ' + dt.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
}
export function TxEditor({api, d, tx, defaultAccountId, onClose, onSaved, onOptimistic, onOptimisticRemove}: {onOptimisticRemove?: (id: string) => void; onOptimistic?: (id: string, changes: Partial<Tx>) => void; api: SofiaApi; d: Data; tx: Partial<Tx>; defaultAccountId?: string; onClose: () => void; onSaved: () => void}) {
  const c = useTheme(), editing = !!tx.entity && !tx.virtual;
  const [kind, setKind] = useState<TxKind>(tx.kind || 'expense'), [refundOpen, setRefundOpen] = useState(false), [noBalance, setNoBalance] = useState(!!tx.noBalance);
  const [amount, setAmount] = useState(tx.amount ? finishMoneyInput(String(tx.amount).replace('.', ',')) : ''), [desc, setDesc] = useState(tx.desc || '');
  const [category, setCategory] = useState(tx.category || ''), [date, setDate] = useState(tx.date || todayISO());
  const firstAccount = (defaultAccountId && d.accounts.some(a=>a.id===defaultAccountId&&!a.archived) ? defaultAccountId : d.accounts.find(a => !a.archived)?.id) || '';
  const [source, setSource] = useState(tx.cardId || tx.accountId || firstAccount), [to, setTo] = useState(tx.toAccountId || d.accounts.find(a => !a.archived && a.id !== firstAccount)?.id || '');
  const [paid, setPaid] = useState(tx.paid ?? true), [repeat, setRepeat] = useState<'none' | 'monthly' | 'installments'>(tx.recurrence && tx.recurrence !== 'none' ? 'monthly' : 'none');
  const [time, setTime] = useState(tx.time || '');
  const [note, setNote] = useState(String(tx.entity?.content || ''));
  const [parts, setParts] = useState(3), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const isCard = d.cards.some(x => x.id === source);
  // 0.3.215: receita avulsa pode mandar uma parte para o guardado (a parte do saldo soma ao valor inicial do Controle)
  const goalForSplit = reserveOf(d.goals), [toReserve, setToReserve] = useState(tx.reservePart ? finishMoneyInput(String(tx.reservePart).replace('.', ',')) : '');
  const reserveValue = parseMoney(toReserve) || 0;
  const cats = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const value = parseMoney(amount);
  const sources = kind === 'expense' ? [...d.accounts.filter(a => !a.archived).map(a => ({id: a.id, label: a.name, card: false})), ...d.cards.filter(x => !x.archived).map(x => ({id: x.id, label: '💳 ' + x.name, card: true}))] : d.accounts.filter(a => !a.archived).map(a => ({id: a.id, label: a.name, card: false}));
  const plan = repeat === 'installments' && value ? installmentPlan(value, parts, date) : null;

  async function save() {
    if (isClosedMonth(monthOf(date)) || (tx.entity && !tx.virtual && tx.date && isClosedMonth(monthOf(tx.date)))) { setError(CLOSED_MSG); return; }
    if (!value || value <= 0) { setError('Digite o valor.'); return; }
    if (kind !== 'transfer' && !category) { setError('Escolha a categoria.'); return; }
    if (kind === 'transfer' && (!to || to === source)) { setError('Escolha a conta de destino.'); return; }
    if (value && reserveValue > value) { setError('O valor para o guardado passa do valor da receita.'); return; }
    setBusy(true); setError('');
    try {
      const card = d.cards.find(x => x.id === source);
      const base: Record<string, any> = {kind, amount: value, date, category: kind === 'transfer' ? 'Transferência' : category, account_id: card ? '' : source, to_account_id: kind === 'transfer' ? to : '',
        card_id: card ? card.id : '', invoice_month: card ? invoiceMonth(card, date) : '', paid: card ? false : paid, recurrence: repeat === 'monthly' ? 'monthly' : 'none', time: time || '', __content: note.trim(), no_balance: kind !== 'transfer' && !card && noBalance};
      const title = desc.trim() || (kind === 'transfer' ? 'Transferência' : category);
      const splitOk = kind === 'income' && !isCard && !!goalForSplit && (repeat === 'monthly' || paid);
      const editSplit = splitOk && reserveValue > 0 && value ? Math.min(reserveValue, value) : 0;
      if (editing) {
        // 0.3.225: editar um item muda a tela NA HORA (valor, totais de Receitas/Despesas, previsto) e fecha;
        // a gravacao no servidor segue por tras. Se falhar, avisa e volta ao que esta no servidor.
        if (onOptimistic && tx.id) {
          onOptimistic(tx.id, {kind, amount: value, desc: title, date, category: base.category, paid: base.paid, accountId: base.account_id, cardId: base.card_id, time: base.time, recurrence: base.recurrence, noBalance: !!base.no_balance});
          onClose();
          void (async () => {
            try {
              const savedTx = await saveEntity(api, 'fin_tx', title, {...base, ...(kind === 'income' ? {reserve_part: editSplit > 0 ? editSplit : ''} : {})}, tx.entity);
              if (kind === 'income' && goalForSplit) await syncIncomeReserve(api, d, savedTx.id, goalForSplit.id, editSplit, paid && !isCard, date, title);
            } catch (e) { appAlert('Não consegui salvar', errorText(e) + ' Os valores voltaram ao que está salvo.'); }
            onSaved();
          })();
          return;
        }
        const savedTx = await saveEntity(api, 'fin_tx', title, {...base, ...(kind === 'income' ? {reserve_part: editSplit > 0 ? editSplit : ''} : {})}, tx.entity);
        if (kind === 'income' && goalForSplit) await syncIncomeReserve(api, d, savedTx.id, goalForSplit.id, editSplit, paid && !isCard, date, title);
      }
      else if (plan && parts > 1) {
        const series = uid();
        for (const p of plan) await saveEntity(api, 'fin_tx', title + ' (' + p.installment + '/' + parts + ')', {...base, amount: p.amount, date: p.date, invoice_month: card ? invoiceMonth(card, p.date) : '', paid: card ? false : p.installment === 1 ? paid : false, series_id: series, installment: p.installment, installments: parts, recurrence: 'none'});
      } else {
        const split = editSplit;
        const saved = await saveEntity(api, 'fin_tx', title, {...base, ...(tx.virtual ? {series_id: tx.seriesId, recurrence: 'none'} : {}), ...(split ? {reserve_part: split} : {})});
        if (split && goalForSplit && paid) {
          try { await syncIncomeReserve(api, d, saved.id, goalForSplit.id, split, true, date, title); }
          catch (e) { await api.deleteEntity(saved.id).catch(() => {}); throw e; }
        }
      }
      onSaved();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  function remove() {
    if (!tx.entity) return;
    // 0.3.217: avisa quando a receita mandou uma parte para o guardado (o aporte ligado a ela acompanha)
    const guarded = tx.kind === 'income' && (tx.reservePart || 0) > 0 ? money(tx.reservePart || 0) : '';
    // 0.3.178/0.3.181: pagamento de CONTA FIXA (inclusive a 1a vez dela). Apagar no historico desfaz o
    // pagamento: a conta volta para Pendentes como "a pagar". Conta avulsa paga e apagada sai de vez.
    if (tx.manualDue && tx.paid && (tx.recurrence === 'monthly' || !!tx.seriesId)) {
      const kind = tx.kind === 'income' ? 'recebimento' : 'pagamento';
      appAlert('Desfazer o ' + kind + '?', '“' + tx.desc + '” sai do histórico e volta para Pendentes como ' + (tx.kind === 'income' ? 'a receber' : 'a pagar') + '.' + (guarded ? ' A parte de ' + guarded + ' que foi para o guardado também sai de lá até você receber de novo.' : ''),
        [{text: 'Cancelar', style: 'cancel'}, {text: 'Desfazer', style: 'destructive', onPress: () => void (async () => {
          try { await api.saveEntity({...tx.entity!, data: {...tx.entity!.data, paid: false, paid_at: ''}}); const g = reserveOf(d.goals); if (g && tx.kind === 'income') await syncIncomeReserve(api, d, tx.entity!.id, g.id, 0, false, tx.date || '', tx.desc || ''); onSaved(); } catch (e) { setError(errorText(e)); }
        })()}]);
      return;
    }
    const series = tx.seriesId;
    const others = series ? d.txs.filter(x => x.seriesId === series && x.id !== tx.id) : [];
    const del = async (all: boolean) => {
      if (tx.date && !tx.virtual && isClosedMonth(monthOf(tx.date))) { setError(CLOSED_MSG); return; }
      // 0.3.226: apagar some da tela na hora (item, total, Historico); o servidor apaga por tras
      if (onOptimisticRemove && tx.id && tx.entity) { const id = tx.entity.id, rest = all ? others.filter(o => o.entity && !o.paid).map(o => o.entity!.id) : [];
        onOptimisticRemove(tx.id); for (const o of all ? others.filter(o => o.entity && !o.paid) : []) onOptimisticRemove(o.id); onClose();
        void (async () => { try { await api.deleteEntity(id); for (const r of rest) await api.deleteEntity(r); } catch (e) { appAlert('Não consegui apagar', errorText(e) + ' O item voltou.'); } onSaved(); })(); return; }
      try { await api.deleteEntity(tx.entity!.id); if (all) for (const o of others) if (o.entity && !o.paid) await api.deleteEntity(o.entity.id); onSaved(); } catch (e) { setError(errorText(e)); } };
    appAlert('Apagar lançamento?', others.length ? 'Este lançamento faz parte de uma série.' : 'Essa ação não pode ser desfeita.' + (guarded ? ' A parte de ' + guarded + ' que foi para o guardado também é apagada do guardado (só esse aporte; os seus outros aportes não mudam).' : ''), others.length
      ? [{text: 'Cancelar', style: 'cancel'}, {text: 'Só este', onPress: () => void del(false)}, {text: 'Este e os pendentes', style: 'destructive', onPress: () => void del(true)}]
      : [{text: 'Cancelar', style: 'cancel'}, {text: 'Apagar', style: 'destructive', onPress: () => void del(false)}]);
  }
  // A abinha selecionada tem fundo branco fixo, então o texto dela precisa de uma cor sempre
  // escura o bastante contra branco — a própria cor do destaque no modo claro serve bem para isso,
  // mesmo no app em modo escuro (é só o texto dessa abinha, não muda o resto da tela).
  const head = kind === 'income' ? c.good : kind === 'transfer' ? c.info : c.accent, headText = head === c.accent ? c.onAccent : PALETTE.white, selectedTabText = head === c.accent ? light.accent : head;
  return (
    <MotionModal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex: 1, backgroundColor: c.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* 0.3.257: o cabecalho roxo fica sempre por cima; o conteudo rola por baixo dele e nunca aparece sobre o roxo */}
        <View style={{backgroundColor: head, paddingTop: 40, paddingBottom: 18, paddingHorizontal: 16, gap: 12, zIndex: 2}}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Pressable accessibilityLabel="Fechar" onPress={onClose} style={{padding: 8}}><Text style={{color: headText, fontSize: 18}}>✕</Text></Pressable>
            <Text style={{flex: 1, color: headText, fontWeight: '600', fontSize: 18}}>{editing ? 'Editar' : tx.virtual ? 'Confirmar repetição' : 'Novo lançamento'}</Text>
            {editing ? <Pressable accessibilityLabel={tx.manualDue && tx.paid && (tx.recurrence === 'monthly' || !!tx.seriesId) ? "Desfazer pagamento" : "Apagar lançamento"} onPress={remove} style={{padding: 8}}><Icon name="trash" size={20} color={headText} /></Pressable> : null}
          </View>
          {/* 0.3.255: tocar num item do Historico mostra quando ele foi lancado (data e hora) */}
          {editing && addedAt(tx) ? <Text testID="tx-added-at" style={{color: headText + 'cc', fontSize: 12, marginTop: -4}}>Lançado em {addedAt(tx)}{tx.paidAt && tx.paid ? ' · pago em ' + tx.paidAt.slice(0, 10).split('-').reverse().join('/') : ''}</Text> : null}

          {!editing ? (
            <View style={{flexDirection: 'row', backgroundColor: headText + '26', borderRadius: 99, padding: 3}}>
              {([['expense', 'Despesa'], ['income', 'Receita'], ['transfer', 'Transferência']] as Array<[TxKind, string]>).map(([k, l]) => (
                <Pressable key={k} onPress={() => { setKind(k); setCategory(''); if (k !== 'expense' && d.cards.some(x => x.id === source)) setSource(firstAccount); }} style={{flex: 1, paddingVertical: 7, borderRadius: 99, backgroundColor: kind === k ? PALETTE.white : 'transparent', alignItems: 'center'}}>
                  <Text style={{color: kind === k ? selectedTabText : headText, fontWeight: '600', fontSize: 13}}>{l}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <Text style={{color: headText + 'cc', fontSize: 24}}>R$</Text>
            <TextInput accessibilityLabel="Valor" value={amount} onChangeText={v => setAmount(old => formatMoneyInput(v, old))} onBlur={() => setAmount(v => finishMoneyInput(v))} placeholder="0,00" placeholderTextColor={headText + '88'} keyboardType="decimal-pad" autoFocus={!editing}
              style={{flex: 1, color: headText, fontSize: 40, fontWeight: '700', padding: 0}} />
          </View>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{flex: 1, overflow: 'hidden', zIndex: 1}} overScrollMode="never" contentContainerStyle={{padding: 18, gap: 16, paddingBottom: 40}}>
          <Field label="Nome" value={desc} onChange={setDesc} placeholder={kind === 'income' ? 'Ex.: Salário' : 'Ex.: Mercado do mês'} />
          <View style={{gap: 6}}><Text style={{fontSize: 12, color: c.muted}}>Descrição (opcional)</Text><TextInput accessibilityLabel="Descrição" value={note} onChangeText={setNote} placeholder="Uma observação breve" placeholderTextColor={c.muted} multiline maxLength={280} style={{minHeight: 44, maxHeight: 88, color: c.text, backgroundColor: c.input, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, textAlignVertical: 'top'}} /></View>
          {kind !== 'transfer' ? (
            <View style={{gap: 8}}>
              <Text style={{fontSize: 12, color: c.muted}}>Categoria</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                {cats.map(cat => (
                  <Pressable key={cat.name} accessibilityRole="radio" accessibilityState={{checked: category === cat.name}} onPress={() => setCategory(cat.name)}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: category === cat.name ? cat.color : c.line, backgroundColor: category === cat.name ? cat.color + '22' : 'transparent'}}>
                    <CatIcon cat={cat} size={16} /><Text style={{color: c.text, fontSize: 13}}>{cat.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <View style={{gap: 8}}>
            <Text style={{fontSize: 12, color: c.muted}}>{kind === 'transfer' ? 'Sai de' : kind === 'income' ? 'Entra em' : 'Pago com'}</Text>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
              {sources.map(s => <SurePressable key={s.id} accessibilityRole="button" accessibilityState={{selected: source === s.id}} onPress={() => setSource(s.id)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: source === s.id ? c.accent : c.input}}><Text style={{color: source === s.id ? PALETTE.white : c.text, fontSize: 13, fontWeight: '500'}}>{s.label}</Text></SurePressable>)}
            </View>
            {isCard ? <Text style={{fontSize: 11, color: c.muted}}>Entra na fatura de {monthLabel(invoiceMonth(d.cards.find(x => x.id === source)!, date)).toLowerCase()}.</Text> : null}
          </View>
          {kind === 'transfer' ? (
            <View style={{gap: 8}}>
              <Text style={{fontSize: 12, color: c.muted}}>Vai para</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                {d.accounts.filter(a => !a.archived && a.id !== source).map(a => <SurePressable key={a.id} accessibilityRole="button" onPress={() => setTo(a.id)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: to === a.id ? c.accent : c.input}}><Text style={{color: to === a.id ? PALETTE.white : c.text, fontSize: 13, fontWeight: '500'}}>{a.name}</Text></SurePressable>)}
              </View>
              {d.accounts.filter(a => !a.archived).length < 2 ? <Text style={{fontSize: 12, color: c.muted}}>Crie uma segunda conta em ⚙ para transferir.</Text> : null}
            </View>
          ) : null}
          <View style={{flexDirection: 'row', gap: 8}}>
            {[['Hoje', todayISO()], ['Ontem', addDays(todayISO(), -1)]].map(([l, v]) => <Pressable key={l} onPress={() => setDate(v)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: date === v ? c.accent : c.input}}><Text style={{color: date === v ? PALETTE.white : c.text, fontWeight: '500', fontSize: 13}}>{l}</Text></Pressable>)}
          </View>
          <DateTimeField label="Data" value={date} onChange={v => v && setDate(v)} dateOnly allowClear={false} />
          <DateTimeField label="Horário (opcional)" value={time} onChange={v => setTime(v ? String(v).slice(0, 5) : '')} timeOnly emptyLabel="Sem horário" />
          {!isCard && kind !== 'transfer' ? (
            <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text, fontSize: 16}}>{kind === 'income' ? 'Já recebi' : 'Já paguei'}</Text><Switch value={paid} onValueChange={setPaid} /></View>
          ) : null}
          {kind === 'income' && !isCard && goalForSplit && (repeat === 'monthly' || paid) ? (
            <View style={{gap: 6}}>
              <Text style={{fontSize: 12, color: c.muted}}>{repeat === 'monthly' ? 'Desta receita, quanto vai para o guardado todo mês? (R$)' : 'Desta receita, quanto vai para o guardado? (R$)'}</Text>
              <TextInput accessibilityLabel="Quanto vai para o guardado" value={toReserve} onChangeText={v => setToReserve(old => formatMoneyInput(v, old))} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={c.muted}
                style={{fontSize: 16, color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.input}} />
              <Text style={{fontSize: 11, color: c.muted, lineHeight: 16}}>{reserveValue > 0 && value && value > 0 ? 'Ficam ' + money(Math.max(0, value - reserveValue)) + ' no saldo (somam ao Controle de gastos) e ' + money(Math.min(reserveValue, value)) + ' vão para o guardado.' : 'Deixe em branco para o valor todo ficar no saldo.'}</Text>
            </View>
          ) : null}
          {!editing && kind !== 'transfer' ? (
            <View style={{gap: 10}}>
              <Text style={{fontSize: 12, color: c.muted}}>Repetir</Text>
              <Chips value={repeat} onChange={setRepeat} options={[{value: 'none' as const, label: 'Não'}, {value: 'monthly' as const, label: 'Todo mês'}, ...(kind === 'expense' ? [{value: 'installments' as const, label: 'Parcelado'}] : [])]} />
              {repeat === 'monthly' ? <Text style={{fontSize: 12, color: c.muted}}>{tap('Aparece todo mês como previsto (aluguel, assinatura, salário). Você confirma com um toque quando pagar.')}</Text> : null}
              {repeat === 'installments' ? (
                <View style={{gap: 8}}>
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                    {[2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map(n => <Pressable key={n} onPress={() => setParts(n)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: parts === n ? c.accent : c.input}}><Text style={{color: parts === n ? PALETTE.white : c.text, fontWeight: '500'}}>{n}x</Text></Pressable>)}
                  </View>
                  {plan ? <Text style={{fontSize: 13, color: c.text}}>{parts}x de <Text style={{fontWeight: '600'}}>{money(plan[plan.length - 1].amount)}</Text> · última em {dateBR(plan[plan.length - 1].date)}/{plan[plan.length - 1].date.slice(0, 4)}</Text> : null}
                </View>
              ) : null}
            </View>
          ) : null}
          {/* 0.3.257: "Nao mexer no saldo" - fica registrado (Historico, totais do mes), mas o Saldo nao muda */}
          {kind !== 'transfer' && !isCard ? (
            <View style={{gap: 4}}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text, fontSize: 16}}>Não mexer no saldo</Text><Switch testID="tx-no-balance" accessibilityLabel="Não mexer no saldo" value={noBalance} onValueChange={setNoBalance} /></View>
              {noBalance ? <Text style={{fontSize: 12, color: c.muted, lineHeight: 17}}>{kind === 'income' ? 'Fica registrada no Histórico e nos totais do mês, mas não soma no Saldo.' : 'Fica registrada no Histórico e nos totais do mês, mas não desconta do Saldo.'}</Text> : null}
            </View>
          ) : null}
          {/* 0.3.256/0.3.257: despesa que vai ser reembolsada (liga com Devolucoes) - junto das outras opcoes */}
          {editing && kind === 'expense' && tx.id ? (() => { const r = (d.refunds || []).find(x => x.expenseId === tx.id && x.state !== 'archived');
            return r ? <View testID="tx-refund-status" style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text, fontSize: 16}}>Reembolso</Text><Text style={{color: r.state === 'received' ? c.good : c.muted, fontSize: 13, fontWeight: '500'}}>{r.state === 'received' ? 'Reembolsada' + (r.receivedAt ? ' em ' + r.receivedAt.split('-').reverse().join('/') : '') : 'Pendente · ' + money(r.amount)}</Text></View>
              : <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text, fontSize: 16}}>Vai ser reembolsada</Text><Switch testID="tx-refund-mark" accessibilityLabel="Marcar que esta despesa vai ser reembolsada" value={refundOpen} onValueChange={v => setRefundOpen(v)} /></View>; })() : null}
          {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
          <Button title={editing ? 'Salvar alterações' : 'Salvar'} loading={busy} onPress={() => void save()} />
        </ScrollView>
      </KeyboardAvoidingView>
      <Presence>{refundOpen && tx.id ? <RefundSheet api={api} refund={null} accounts={d.accounts.filter(a => !a.archived)} defaultAccount={tx.accountId || defaultAccountId || ''} expense={{id: tx.id, desc: desc || tx.desc || '', amount: parseMoney(amount) || tx.amount || 0}} onClose={() => setRefundOpen(false)} onSaved={() => { setRefundOpen(false); onSaved(); }} /> : null}</Presence>
    </MotionModal>
  );
}
