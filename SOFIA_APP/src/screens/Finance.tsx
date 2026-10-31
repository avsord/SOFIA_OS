import {Presence} from '../components/Presence';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {PALETTE} from '../lib/palette';
import {contextMenu} from '../components/ContextMenu';
import {useValuesHidden} from '../lib/values-mask';
import {tap,useColumnPad,useDesktop} from '../lib/desktop';
import {GoalProgressCard} from '../components/GoalProgress';
import type {GoalNumbers} from '../components/GoalProgress';
import {keepIfSame, useCachedGoal, writeGoalWidget} from '../lib/goal-widget';
import {scheduleIdleTask} from '../lib/idle-task';
import * as SecureStore from 'expo-secure-store';
import {ActivityIndicator, Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, Switch, Text, TextInput, View, Dimensions, PanResponder, Animated, Easing} from 'react-native';
// 0.3.255: ScrollView que rola sozinho ate o calendario aberto caber na tela (ver RevealScroll)
import {RevealScrollView as ScrollView} from '../components/RevealScroll';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path, Rect, Line} from 'react-native-svg';
import {useTheme, light} from '../lib/theme';
import {encryptedStorage} from '../lib/encrypted-storage';
import * as DocumentPicker from 'expo-document-picker';
import {File} from 'expo-file-system';
import type {ImportItem} from '../lib/api';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {errorText} from '../lib/chat-model';
import {useRenderCost} from '../lib/render-cost';
import {MotionModal} from '../components/MotionModal';
import {Sheet, markSheetHandoff} from '../components/Sheet';
import {InternalBackGesture} from '../components/InternalBackGesture';
import {DateTimeField} from '../components/DateTimeField';
import {Icon, type IconName} from '../components/Icon';
import {Button, IconButton} from '../components/UI';
import {PriceChart} from '../components/PriceChart';
import {Spinner, LoadingLines, ShimmerBlock, ShimmerGroup} from '../components/Loading';
import {money} from '../lib/monitoring';
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, ACCOUNT_TYPES, FIN_COLORS, categoryOf, toAccount, toCard, toTx, toBudget, toGoal, monthOf, addMonths, monthLabel, todayISO,
  invoiceMonth, cardInvoices, cardUsed, installmentPlan, accountBalance, totalBalance, forecastBalance, monthTxs, monthSummary, byCategory, budgetProgress,
  trend, balanceSeries, upcoming, manualDues, transactionsForAccount, goalProgress, parseMoney, formatMoneyInput, finishMoneyInput, addDays,
  dayIn, daysIn} from '../lib/finance';
import type {Account, Card, Tx, TxKind, Budget, Goal, Invoice, Due, ReserveMove, SaldoSnap, SaldoChange} from '../lib/finance';
import {saldoSnapshot, reserveSnapshot, saldoDiff, cardBillSettled, saldoLedger, txInvoiceMonth, invoiceForMonth} from '../lib/finance';
import type {LedgerItem} from '../lib/finance';
import {sinceReportStart, cycleRange, cycleRoom, fixedSummary, lastInstallmentMonth, monthDues, moneySplit, reserveOutlook, reserveBadge, reserveHistory, reserveMoveLabel, reserveOf, reserveFor, reserveSeries, toReserveMove, effectiveCycleDay, periodBudget, salaryForecast, currentPlan, nextPlan, simpleForecast, spendControl, categoryAlerts, lastWeekByCategory, duplicateGroups, moneyLeft, monthControl, balanceAsOf, isOneOffIncome, fixedDuplicateGroups, fixedUpcoming, isScheduled, exactTwinExtras} from '../lib/finance';
import {syncFinanceDueNotifications} from '../lib/finance-notifications';
import {appAlert} from '../lib/app-alert';
import {useFormDraft, clearAllFormDrafts} from '../lib/form-draft';
// 0.3.263 (refatoracao, sem mudar o que a tela faz): o arquivo de ~280 mil caracteres foi dividido em partes:
 // finance/core (dados, cache e pecas pequenas), Setup, Home (Resumo), Transactions (lancamentos), Plan (cartoes e planos),
 // Goal (meta no Inicio), Reports (relatorios) e Manage (contas, cartoes e importacao).
import {GUARD, Data, Tab, toData, financeWindow, loadAll, readCache, recordSaldo, writeCache, Chips} from './finance/core';
import {Onboarding, PendingTab, BillEditor} from './finance/Setup';
import {planReminder, HomeTab, afterSheet, FinanceLocal} from './finance/Home';
import {RefundsTab, TxEditor} from './finance/Transactions';
import {CardsTab} from './finance/Plan';
import {preloadFolds} from './finance/Goal';
import {ReportsTab} from './finance/Reports';
import {ManageSheet} from './finance/Manage';
// 0.3.263: Financas dividida em partes (src/screens/finance/*). Quem importava daqui continua importando daqui.
export {financeWindow} from './finance/core';
export {useFinanceGoal, FinanceGoalHome} from './finance/Goal';
// ============================ TELA ============================
export function Finance({api, active, onBack, onAppsTap}: {onAppsTap?: (handler: (() => boolean) | null) => void; api: SofiaApi; active: boolean; onBack: () => void}) {
  const pad = useColumnPad(); // 0.3.253: barras de cima alinhadas a coluna
  const desktop = useDesktop(); // 0.3.252 (computador)
  useRenderCost('apps:finance');
  const c = useTheme(), insets = useSafeAreaInsets();
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('home'), [month, setMonth] = useState(monthOf(todayISO()));
  const [editing, setEditing] = useState<Partial<Tx> | null>(null), [manage, setManage] = useState(false);
  const [accountFilter, setAccountFilter] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState(''), [accountPicker, setAccountPicker] = useState(false);
  const [billScope, setBillScope] = useState<'month' | 'series'>('series'), [billFlow, setBillFlow] = useState<'expense' | 'income'>('expense');
  const [billEditor, setBillEditor] = useState<Tx | 'new' | null>(null), [notificationWarning, setNotificationWarning] = useState(''), [billCard, setBillCard] = useState('');
  const [pendingSide, setPendingSide] = useState<'pagar' | 'receber'>('pagar');
  const [tabHistory, setTabHistory] = useState<Tab[]>([]);
  const navigateFinance = useCallback((next: Tab) => {
    if (next === tab) return;
    setTabHistory(h => [...h, tab].slice(-16)); setTab(next);
  },[tab]);
  // 0.3.226: editar/apagar muda a tela na hora (item, totais de Receitas/Despesas, Historico); o servidor segue por tras
  const patchTx = useCallback((id: string, ch: Partial<Tx>) => setData(prev => prev ? {...prev, txs: prev.txs.map(x => x.id === id ? {...x, ...ch} : x)} : prev), []);
  const removeTx = useCallback((id: string) => setData(prev => prev ? {...prev, txs: prev.txs.filter(x => x.id !== id)} : prev), []);
  const putTx = useCallback((t: Tx, replaceId: string | null) => setData(prev => prev ? {...prev, txs: replaceId ? prev.txs.map(x => x.id === replaceId ? t : x) : [...prev.txs, t]} : prev), []);
  useEffect(() => { void preloadFolds(); }, []);
  const markPaid = useCallback((t: Tx) => setData(prev => {
    if (!prev) return prev;
    if (t.virtual) return {...prev, txs: [...prev.txs, {...t, id: 'local:' + t.id, virtual: false, paid: true, recurrence: 'none'} as Tx]};
    return {...prev, txs: prev.txs.map(x => x.id === t.id ? {...x, paid: true, paidAt: todayISO()} : x)};
  }), []);
  const local = useMemo(() => ({markPaid}), [markPaid]);
  const goHome = useCallback(() => { setManage(false); setEditing(null); setBillEditor(null); setAccountPicker(false); setTabHistory([]); setTab('home'); }, []);
  const backFinance = useCallback(() => {
    if (billEditor) {setBillEditor(null);return;}
    if (accountPicker) {setAccountPicker(false);return;}
    if (editing) {setEditing(null);return;}
    if (manage) {setManage(false);return;}
    // 0.3.192: de qualquer aba volta direto para o Resumo; do Resumo, sai de Finanças
    // 0.3.225: volta ao Resumo e ao TOPO da pagina
    if (tab !== 'home') {setTab('home');setTabHistory([]);scrollY.current = 0;setTimeout(() => mainScroll.current?.scrollTo({y: 0, animated: false}), 0);return;}
    onBack();
  },[billEditor,accountPicker,editing,manage,tab,onBack]);
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {backFinance();return true;});
    return () => sub.remove();
  },[active,backFinance]);
  const window = financeWindow(month, tab), windowKey = window.from + '..' + window.to, loaded = useRef<string>('');
  const twinsTried = useRef(new Set<string>());
  // 0.3.224: tocar em Apps na barra dentro de Financas - fora do Resumo (ou com algo aberto por cima) volta ao Resumo;
  // no Resumo rolado para baixo, sobe ao topo; no Resumo ja no topo, sai para a grade de apps
  const mainScroll = useRef<ScrollView>(null), scrollY = useRef(0);
  const appsTap = useRef<() => boolean>(() => false);
  appsTap.current = () => {
    if (tab !== 'home' || editing || billEditor || manage || accountPicker || newMenu) { goHome(); setNewMenu(false); scrollY.current = 0; mainScroll.current?.scrollTo({y: 0, animated: false}); return true; }
    if (scrollY.current > 4) { mainScroll.current?.scrollTo({y: 0, animated: true}); scrollY.current = 0; return true; }
    return false;
  };
  useEffect(() => { if (!onAppsTap) return; onAppsTap(active ? () => appsTap.current() : null); return () => onAppsTap(null); }, [active, onAppsTap]);
  // 0.3.223: qual periodo ja chegou atualizado do servidor (o Controle de gastos so mostra numero e cor com ele)
  const [liveKey, setLiveKey] = useState('');
  const reload = useCallback(async () => {
    setLoading(true);
    try { const bundle = await loadAll(api, window), fresh = toData(bundle.items, bundle.carry); setData(fresh); setError(''); loaded.current = windowKey; setLiveKey(windowKey);
      // 0.3.223: a copia no aparelho e so a do periodo padrao do mes atual (antes guardava a de outro mes e a tela abria com numeros dela)
      if (window.from === addMonths(monthOf(todayISO()), -1) && window.to === addMonths(monthOf(todayISO()), 1)) writeCache(api, bundle);
      // so a janela padrao do mes atual (o acumulado dos meses anteriores e sempre o mesmo corte) entra no registro do Saldo
      if (window.from === addMonths(monthOf(todayISO()), -1) && window.to === addMonths(monthOf(todayISO()), 1)) recordSaldo(api, fresh); }
    catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [api, windowKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // 0.3.232: copias identicas de uma conta/receita programada (sobra do rascunho que voltava) somem sozinhas ao abrir
  useEffect(() => { if (!data) return; const extras = exactTwinExtras(data.txs).filter(t => !twinsTried.current.has(t.id)); if (!extras.length) return;
    extras.forEach(t => twinsTried.current.add(t.id));
    void (async () => { for (const t of extras) { try { await api.deleteEntity(t.entity!.id); } catch { /* segue */ } } await reload(); })(); }, [data]);
  // 0.3.221: Financas continua montada depois de aberta (voltar aos Apps nao desmonta a tela). Ao sair, volta ao Resumo
  // do mes atual, como abria antes, e a proxima abertura atualiza por tras mostrando o que ja esta na tela.
  const wasActive = useRef(active);
  useEffect(() => { if (wasActive.current && !active) { goHome(); setMonth(monthOf(todayISO())); setNewMenu(false); loaded.current = ''; } wasActive.current = active; }, [active, goHome]);
  // Abre na hora com a última versão guardada (mês atual); a atualização chega por trás.
  // Mudou o mês ou foi para Relatórios: busca a janela nova, mantendo o que está na tela até chegar.
  useEffect(() => {
    if (!active) return;
    let live = true;
    if (!loaded.current) void readCache(api).then(b => { if (live && b && !loaded.current) setData(d => d || toData(b.items, b.carry)); });
    if (loaded.current !== windowKey) void reload();
    return () => { live = false; };
  }, [active, reload, api, windowKey]);

  const d = data;
  const primary = useMemo(() => {
    const activeAccounts = d?.accounts.filter(a => !a.archived) || [];
    return activeAccounts.find(a => /^conta principal$/i.test(a.name.trim())) || activeAccounts[0];
  },[d]);
  const account = d?.accounts.find(a => a.id === selectedAccount && !a.archived) || primary;
  const accountId = account?.id || '';
  const isPrimary = !primary || accountId === primary.id;
  const scoped = useMemo(() => {
    if (!d || !account) return d;
    return {...d, accounts: [{...account, include: true}], cards: d.cards.filter(card => card.accountId === account.id && !card.archived),
      txs: transactionsForAccount(d.txs,d.cards,account.id)};
  },[d,accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [newMenu, setNewMenu] = useState(false), [aporteKey, setAporteKey] = useState(0);
  const newTx = (kind: TxKind = 'expense') => setEditing({kind, date: todayISO(), accountId, paid: true});
  useEffect(() => {
    if (!active || !d) return;
    let valid = true;
    void syncFinanceDueNotifications(d.txs, api.owner, new Date(), planReminder(d, todayISO())).then(w => {if(valid)setNotificationWarning(w);});
    return () => {valid=false;};
  },[active,api,d]);

  return (
    <FinanceLocal.Provider value={local}>
    <InternalBackGesture enabled={active && !editing && !manage && !billEditor && !accountPicker} onBack={backFinance}>
      <View style={{flex: 1, backgroundColor: c.bg}}>
        {/* 0.3.253: no computador o cabecalho, a linha conta/mes e as abas se alinham a coluna de leitura */}
        <View style={pad(0)}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 2}}>
          <IconButton name="back" label="Voltar à tela anterior" onPress={backFinance} />
          <View style={{flex: 1, paddingHorizontal: 4}}>
            <Text style={{fontSize: 24, fontWeight: '700', color: c.text}}>Finanças</Text>
          </View>
          <IconButton name="settings" label="Contas e cartões" onPress={() => setManage(true)} />
        </View>
        {/* 0.3.152: conta e mes na mesma linha, compactos (antes eram dois blocos grandes) */}
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10, gap: 8}}>
          {d?.accounts.length ? <Pressable accessibilityRole="button" accessibilityLabel={'Conta: ' + (account?.name || 'selecionar') + '. Trocar'} onPress={() => setAccountPicker(true)}
            style={{flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8}}>
            <View style={{width: 9, height: 9, borderRadius: 5, backgroundColor: account?.color || c.accent}} />
            <Text numberOfLines={1} style={{flexShrink: 1, fontWeight: '600', color: c.text, fontSize: 13}}>{account?.name || 'Selecionar conta'}</Text>
            <Text style={{color: c.muted, fontSize: 11}}>▾</Text>
          </Pressable> : <View style={{flex: 1}} />}
          <View style={{flex: 1}} />
          {desktop && d?.accounts.length ? <Pressable accessibilityRole="button" accessibilityLabel="Novo lançamento" onPress={() => setNewMenu(true)} style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: c.accent, marginRight: 10}}><Text style={{color: c.onAccent, fontWeight: '600', fontSize: 13}}>＋ Novo lançamento</Text></Pressable> : null}
          <IconButton name="back" label="Mês anterior" size={32} onPress={() => setMonth(m => addMonths(m, -1))} />
          <Pressable accessibilityLabel="Voltar ao mês atual" onPress={() => setMonth(monthOf(todayISO()))}><Text style={{fontSize: 14, fontWeight: '600', color: c.text, minWidth: 104, textAlign: 'center'}}>{monthLabel(month)}</Text></Pressable>
          <Pressable accessibilityLabel="Próximo mês" onPress={() => setMonth(m => addMonths(m, 1))} style={{width: 32, height: 32, alignItems: 'center', justifyContent: 'center', transform: [{rotate: '180deg'}]}}><Icon name="back" size={18} color={c.text} /></Pressable>
        </View>
        <View style={{paddingHorizontal: 20, paddingBottom: 14}}>
          <Chips scroll value={tab} onChange={navigateFinance} options={[{value: 'home' as Tab, label: 'Resumo'}, {value: 'bills' as Tab, label: 'Contas'}, {value: 'cards' as Tab, label: 'Cartões'}, {value: 'refunds' as Tab, label: 'Devoluções'}, {value: 'reports' as Tab, label: 'Relatórios'}]} />
        </View>
        </View>

        {!d ? <View style={{flex: 1, padding: 16, gap: 14}}>{error ? <View style={{padding: 20, gap: 12}}><Text style={{color: c.danger}}>{error}</Text><Button title="Tentar de novo" secondary onPress={() => void reload()} /></View> : <View style={{gap: 6}}><View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}><Spinner size={16} stroke={1.8} /><Text style={{color: c.muted, fontSize: 13}}>Carregando suas finanças</Text></View><LoadingLines rows={5} /></View>}</View> : !d.accounts.length ? (
          <Onboarding api={api} onDone={reload} onFinished={goHome} />
        ) : (
          <ScrollView ref={mainScroll} onScroll={e => { scrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={64} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal: 20, paddingTop: 2, paddingBottom: 84, gap: 16}} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}>
            {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
            {tab === 'home' ? <HomeTab onPatchTx={patchTx} onRemoveTx={removeTx} failed={!!error} fresh={liveKey === windowKey} d={scoped || d} month={month} api={api} reload={reload} onTx={setEditing} onTab={navigateFinance} accountId={accountId} isPrimary={isPrimary} onBill={t => { setBillScope('series'); setBillEditor(t || 'new'); }} aporteKey={aporteKey} />
              : tab === 'bills' ? <PendingTab d={scoped || d} api={api} month={month} accountId={accountId} isPrimary={isPrimary} onAporte={() => { navigateFinance('home'); setAporteKey(k => k + 1); }} warning={notificationWarning} onBill={(t, scope) => { setBillScope(scope || 'series'); setBillFlow('expense'); setBillEditor(t); }} onNew={flow => { setBillScope('series'); setBillFlow(flow); setBillEditor('new'); }} onMonth={setMonth} side={pendingSide} onSide={setPendingSide} reload={reload} />
              : tab === 'cards' ? <CardsTab d={scoped || d} month={month} api={api} reload={reload} onTx={setEditing} onManage={() => setManage(true)} onNewBill={cid => { setBillScope('series'); setBillFlow('expense'); setBillCard(cid); setBillEditor('new'); }} onEditBill={t => { setBillScope('series'); setBillCard(''); setBillEditor(t); }} />
              : tab === 'refunds' ? <RefundsTab d={d} api={api} reload={reload} accountId={accountId} />
              : <ReportsTab d={scoped || d} month={month} reserve={reserveFor((scoped || d).goals, accountId, isPrimary)} api={api} reload={reload} />}
          </ScrollView>
        )}

        {d && d.accounts.length ? <>
          {/* 0.3.152: um unico botao + (antes eram dois botoes grandes sobre o extrato) */}
          {/* 0.3.252: botao flutuante e coisa de celular; no computador o + fica no topo, ao lado do mes */}
          {!desktop ? <Pressable accessibilityRole="button" accessibilityLabel="Novo lançamento" onPress={() => setNewMenu(true)}
            style={{position: 'absolute', right: 18, bottom: 16, width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', elevation: 6}}>
            <Text style={{color: c.onAccent, fontSize: 28, fontWeight: '400', marginTop: -2}}>＋</Text>
          </Pressable> : null}
          <Sheet visible={newMenu} onClose={() => setNewMenu(false)} label="Fechar novo lançamento">
            <View style={{gap: 4, paddingBottom: 12}}>
              <Text style={{fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 6}}>Novo lançamento</Text>
              {([['expense', '↓ Despesa', c.danger], ['income', '↑ Receita', c.good], ['transfer', '⇄ Transferência entre contas', c.accent]] as const).map(([k, label, color]) =>
                <Pressable key={k} accessibilityRole="button" onPress={() => { setNewMenu(false); afterSheet(() => newTx(k as TxKind)); }} style={{paddingVertical: 15, borderBottomWidth: 1, borderColor: c.line}}><Text style={{color, fontSize: 16, fontWeight: '600'}}>{label}</Text></Pressable>)}
              <Pressable accessibilityRole="button" onPress={() => { setNewMenu(false); navigateFinance('home'); afterSheet(() => setAporteKey(k => k + 1)); }} style={{paddingVertical: 15, borderBottomWidth: 1, borderColor: c.line}}><Text style={{color: GUARD, fontSize: 16, fontWeight: '600'}}>🔒 Aporte (guardar dinheiro)</Text></Pressable>
              {/* 0.3.213: um "+" com as cinco entradas do modulo */}
              {([['expense', '⏰ Conta a pagar', c.text], ['income', '⏰ Conta a receber', c.text]] as const).map(([flow, label, color]) =>
                <Pressable key={flow} accessibilityRole="button" onPress={() => { setNewMenu(false); setBillScope('series'); setBillFlow(flow); afterSheet(() => setBillEditor('new')); }} style={{paddingVertical: 15, borderBottomWidth: flow === 'expense' ? 1 : 0, borderColor: c.line}}><Text style={{color, fontSize: 16, fontWeight: '600'}}>{label}</Text></Pressable>)}
            </View>
          </Sheet>
        </> : null}

        <Presence>{editing && d ? <TxEditor api={api} d={d} tx={editing} defaultAccountId={accountId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} onOptimistic={patchTx} onOptimisticRemove={removeTx} /> : null}</Presence>
        <Presence>{billEditor && d ? <BillEditor api={api} scope={billScope} initialFlow={billFlow} hasReserve={!!reserveOf(d.goals)} finance={d} initialCard={billCard} tx={billEditor === 'new' ? null : billEditor} accountId={accountId} onClose={() => { setBillEditor(null); setBillCard(''); }} onSaved={saved => {setBillEditor(null); setBillCard('');
          // 0.3.207: depois de salvar, vai para o mes e para o lado (A pagar / A receber) da conta e confirma onde ficou
          if(saved){setMonth(monthOf(saved.date));setPendingSide(saved.kind==='income'?'receber':'pagar');navigateFinance('bills');
            }
          void reload();}}
          onOptimistic={(t, replaceId) => { setData(prev => prev ? {...prev, txs: replaceId ? prev.txs.map(x => x.id === replaceId ? t : x) : [...prev.txs, t]} : prev);
            setBillEditor(null); setBillCard(''); setMonth(monthOf(t.date)); setPendingSide(t.kind === 'income' ? 'receber' : 'pagar'); navigateFinance('bills'); }} /> : null}</Presence>
        <Presence>{manage && d ? <ManageSheet api={api} d={d} onClose={() => setManage(false)} onFinished={goHome} reload={reload} /> : null}</Presence>
        <Sheet visible={accountPicker} onClose={() => setAccountPicker(false)} label="Fechar seletor de contas">
          <View style={{gap:14,paddingBottom:12}}>
            <Text style={{fontSize:20,fontWeight:'700',color:c.text}}>Qual conta quer acompanhar?</Text>
            <Text style={{fontSize:12,color:c.muted}}>Cada conta mostra apenas o próprio saldo, entradas, saídas, faturas e pendências.</Text>
            {d?.accounts.filter(a=>!a.archived).map(a=><Pressable key={a.id} accessibilityRole="button" accessibilityState={{selected:a.id===accountId}} onPress={()=>{setSelectedAccount(a.id);setTab('home');setTabHistory([]);setAccountPicker(false);}}
              style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:13,borderBottomWidth:1,borderColor:c.line}}>
              <View style={{width:12,height:12,borderRadius:6,backgroundColor:a.color}} />
              <View style={{flex:1}}><Text style={{color:c.text,fontSize:16,fontWeight:'600'}}>{a.name}</Text><Text style={{color:c.muted,fontSize:11}}>{a.id===primary?.id?'Principal':'Secundária'}</Text></View>
              <Text style={{color:c.text,fontWeight:'600'}}>{money(accountBalance(a,d.txs))}</Text>
            </Pressable>)}
            <Button title="Gerenciar ou adicionar conta" secondary onPress={()=>{setAccountPicker(false);setManage(true);}} />
          </View>
        </Sheet>
      </View>
    </InternalBackGesture>
    </FinanceLocal.Provider>
  );
}
