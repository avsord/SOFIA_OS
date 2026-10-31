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
import {Data, saveEntity, Card_, Title} from './core';
import {Onboarding, Field} from './Setup';
// ============================ 0.3.182: RECUPERAR APAGADOS ============================
export function ManageSheet({api, d, onClose, reload, onFinished}: {api: SofiaApi; d: Data; onClose: () => void; reload: () => Promise<void>; onFinished?: () => void}) {
  const c = useTheme(), [edit, setEdit] = useState<{type: 'account'; item: Account | null} | {type: 'card'; item: Card | null} | null>(null);
  const [resetting, setResetting] = useState(false), [resetWord, setResetWord] = useState(''), [resetBusy, setResetBusy] = useState(false);
  const [setup, setSetup] = useState(false), [recover, setRecover] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  return (
    <MotionModal visible animationType="slide" onRequestClose={onClose}>
      <View style={{flex: 1, backgroundColor: c.bg}}>
        <View style={{paddingTop: 40, paddingBottom: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: c.line}}>
          <IconButton name="back" label="Voltar" onPress={onClose} /><Text style={{flex: 1, fontSize: 18, fontWeight: '600', color: c.text}}>Contas e cartões</Text>
        </View>
        {setup ? <Onboarding api={api} onDone={reload} onClose={() => setSetup(false)} onFinished={() => { setSetup(false); onFinished ? onFinished() : onClose(); }} existing={{account: d.accounts.find(a => !a.archived) || null, reserve: reserveOf(d.goals), fixed: d.txs.filter(t => t.manualDue && t.recurrence === 'monthly' && !t.virtual && t.kind === 'expense' && t.entity?.state !== 'archived'),
            salary: d.txs.filter(t => !t.virtual && t.kind === 'income' && t.recurrence === 'monthly' && !t.seriesId && t.entity?.state !== 'archived').sort((a, b) => b.amount - a.amount)[0] || null}} /> :
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 18, gap: 14}}>
          {/* 0.3.223: Redefinir Financas - apaga tudo e abre o passo a passo do zero */}
          <View style={{backgroundColor: c.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: c.line, gap: 10, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
            <View style={{gap: 2}}><Text style={{color: c.text, fontWeight: '600', fontSize: 14}}>Redefinir Finanças</Text><Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>Apaga contas, cartões, lançamentos, reserva e metas. Você recomeça do zero, pelo passo a passo ou mandando seus prints para a Sofia.</Text></View>
            {resetting ? <View style={{gap: 8}}>
              <TextInput accessibilityLabel="Confirmação para zerar" value={resetWord} onChangeText={setResetWord} autoCapitalize="characters" placeholder="Digite REDEFINIR" placeholderTextColor={c.muted} style={{color: c.text, backgroundColor: c.input, borderRadius: 12, padding: 12, fontSize: 16, letterSpacing: 2}} />
              <View style={{flexDirection: 'row', gap: 8}}>
                <Pressable accessibilityRole="button" disabled={resetWord.trim().toUpperCase() !== 'REDEFINIR' || resetBusy} onPress={() => { setResetBusy(true); void api.financeReset().then(async () => { await clearAllFormDrafts(); setResetBusy(false); setResetting(false); void reload(); onClose(); }).catch(e => { setResetBusy(false); appAlert('Finanças', errorText(e)); }); }} style={{flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: resetWord.trim().toUpperCase() === 'REDEFINIR' ? c.danger : c.line, alignItems: 'center'}}>{resetBusy ? <ActivityIndicator color={PALETTE.white} /> : <Text style={{color: PALETTE.white, fontWeight: '700'}}>Redefinir</Text>}</Pressable>
                <Pressable accessibilityRole="button" onPress={() => setResetting(false)} style={{flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: c.input, alignItems: 'center'}}><Text style={{color: c.text, fontWeight: '600'}}>Cancelar</Text></Pressable>
              </View>
            </View> : <Pressable accessibilityRole="button" onPress={() => { setResetWord(''); setResetting(true); }} style={{paddingVertical: 10, borderRadius: 12, backgroundColor: c.danger + '1f', alignItems: 'center'}}><Text style={{color: c.danger, fontWeight: '600', fontSize: 13}}>Redefinir Finanças</Text></Pressable>}
          </View>
          <Pressable accessibilityRole="button" onPress={() => setSetup(true)} style={{backgroundColor: c.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', gap: 10, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
            <View style={{flex: 1, gap: 2}}>
              <Text style={{color: c.text, fontWeight: '600', fontSize: 14}}>Refazer a configuração</Text>
              <Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>Passo a passo com o que você já tem: conta, dia do recebimento, contas fixas, guardado, aporte e meta. Nada é apagado.</Text>
            </View>
            <Text style={{color: c.muted}}>›</Text>
          </Pressable>
          <Card_>
            <Title text="Contas" action="+ Conta" onAction={() => setEdit({type: 'account', item: null})} />
            {d.accounts.map(a => <Pressable key={a.id} onPress={() => setEdit({type: 'account', item: a})} style={{flexDirection: 'row', alignItems: 'center', gap: 10, opacity: a.archived ? 0.5 : 1}}><View style={{width: 12, height: 12, borderRadius: 6, backgroundColor: a.color}} /><Text style={{flex: 1, color: c.text}}>{a.name}{a.archived ? ' (arquivada)' : ''}</Text><Text style={{color: c.muted}}>{money(accountBalance(a, d.txs))}</Text></Pressable>)}
          </Card_>
          <Card_>
            <Title text="Cartões de crédito" action="+ Cartão" onAction={() => setEdit({type: 'card', item: null})} />
            {d.cards.filter(x=>!x.archived || showArchived).length ? d.cards.filter(x=>!x.archived || showArchived).map(x => <Pressable key={x.id} onPress={() => setEdit({type: 'card', item: x})} style={{flexDirection: 'row', alignItems: 'center', gap: 10, opacity: x.archived ? 0.5 : 1}}><View style={{width: 12, height: 12, borderRadius: 6, backgroundColor: x.color}} /><Text style={{flex: 1, color: c.text}}>{x.name}</Text><Text style={{color: c.muted, fontSize: 12}}>{x.archived ? 'removido · ' : ''}fecha {x.closing} · vence {x.due}</Text></Pressable>) : <Text style={{color: c.muted}}>Nenhum cartão.</Text>}
            {d.cards.some(x=>x.archived)?<Pressable accessibilityRole="button" onPress={()=>setShowArchived(v=>!v)}><Text style={{color:c.accent,fontSize:12}}>{showArchived?'Ocultar cartões removidos':'Mostrar cartões removidos'}</Text></Pressable>:null}
          </Card_>
        </ScrollView>}
      </View>
      <Presence>{edit ? <AccountCardSheet api={api} d={d} edit={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void reload(); }} /> : null}</Presence>
    </MotionModal>
  );
}
export function AccountCardSheet({api, d, edit, onClose, onSaved}: {api: SofiaApi; d: Data; edit: {type: 'account'; item: Account | null} | {type: 'card'; item: Card | null}; onClose: () => void; onSaved: () => void}) {
  const c = useTheme(), isCard = edit.type === 'card', acc = edit.type === 'account' ? edit.item : null, card = edit.type === 'card' ? edit.item : null;
  const [name, setName] = useState(edit.item?.name || ''), [type, setType] = useState(acc?.type || 'corrente'), [initial, setInitial] = useState(acc ? finishMoneyInput(String(acc.entity.data.initial_balance || '0').replace('.', ',')) : '');
  const [include, setInclude] = useState(acc?.include ?? true), [color, setColor] = useState(edit.item?.color || FIN_COLORS[isCard ? 2 : d.accounts.length % FIN_COLORS.length]);
  // 0.3.161: dia em que a pessoa recebe - o ciclo do Saldo comeca nele (vazio = mes do calendario)
  const [cycleDay, setCycleDay] = useState(acc?.cycleDay ? String(acc.cycleDay) : '');
  const [limit, setLimit] = useState(card ? finishMoneyInput(String(card.limit).replace('.', ',')) : ''), [closing, setClosing] = useState(card ? String(card.closing) : ''), [due, setDue] = useState(card ? String(card.due) : '');
  const [payFrom, setPayFrom] = useState(card?.accountId || d.accounts[0]?.id || ''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function save() {
    if (!name.trim()) { setError('Dê um nome.'); return; }
    setBusy(true); setError('');
    try {
      if (isCard) {
        const l = parseMoney(limit), cl = Number(closing), du = Number(due);
        if (!l || !Number.isInteger(cl) || !Number.isInteger(du) || cl < 1 || cl > 31 || du < 1 || du > 31) { setError('Limite e dias (1 a 31) são obrigatórios.'); setBusy(false); return; }
        await saveEntity(api, 'fin_card', name.trim(), {limit: l, closing_day: cl, due_day: du, color, account_id: payFrom}, card?.entity);
      } else {
        const v = initial.trim() ? parseMoney(initial) : 0;
        if (v === null) { setError('Saldo inválido.'); setBusy(false); return; }
        await saveEntity(api, 'fin_account', name.trim(), {account_type: type, initial_balance: String(v), color, include_total: include, cycle_day: Math.min(31, Math.max(0, Number(cycleDay) || 0))}, acc?.entity);
      }
      onSaved();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const archived = edit.item?.archived;
  async function removeCard() {
    if(!card)return;
    setBusy(true);setError('');
    try {
      // O resumo mensal recebe apenas uma janela de lançamentos.
      // Consultar a coleção completa evita apagar um cartão com faturas antigas.
      let used=false,exhaustive=false;
      for(let offset=0;offset<20000;offset+=100){
        const result=await api.entities('fin_tx','',offset);
        if(result.items.some(e=>String(e.data?.card_id||'')===card.id)){used=true;break;}
        if(result.items.length<100){exhaustive=true;break;}
      }
      const mustArchive=used||!exhaustive;
      appAlert(mustArchive?'Remover cartão e preservar histórico?':'Excluir cartão?',
        mustArchive?'O cartão sai da lista. Compras, pagamentos e faturas anteriores continuam salvos.':'Nenhum lançamento está vinculado a este cartão. Excluir definitivamente?',[
        {text:'Cancelar',style:'cancel'},
        {text:mustArchive?'Remover cartão':'Excluir definitivamente',style:'destructive',onPress:()=>{setBusy(true);void (mustArchive
          ? saveEntity(api,'fin_card',card.name,{},card.entity,'archived')
          : api.deleteEntity(card.id)).then(onSaved).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}
      ]);
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  return (
    <Sheet visible onClose={onClose} label="Fechar edição">
      <ScrollView contentContainerStyle={{gap: 12}} keyboardShouldPersistTaps="handled">
        <Text style={{fontSize: 18, fontWeight: '600', color: c.text}}>{edit.item ? 'Editar' : 'Novo'} {isCard ? 'cartão' : 'conta'}</Text>
        <Field label="Nome" value={name} onChange={setName} placeholder={isCard ? 'Ex.: Nubank Visa' : 'Ex.: Itaú'} />
        {isCard ? (
          <>
            <Field label="Limite (R$)" value={limit} onChange={setLimit} numeric placeholder="0,00" />
            <View style={{flexDirection: 'row', gap: 10}}><View style={{flex: 1}}><Field label="Fecha dia" value={closing} onChange={setClosing} numeric placeholder="5" /></View><View style={{flex: 1}}><Field label="Vence dia" value={due} onChange={setDue} numeric placeholder="12" /></View></View>
            <Text style={{fontSize: 12, color: c.muted}}>Fatura paga com</Text>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{d.accounts.filter(a => !a.archived).map(a => <Pressable key={a.id} onPress={() => setPayFrom(a.id)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: payFrom === a.id ? c.accent : c.input}}><Text style={{color: payFrom === a.id ? PALETTE.white : c.text, fontSize: 13}}>{a.name}</Text></Pressable>)}</View>
          </>
        ) : (
          <>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{ACCOUNT_TYPES.map(t => <Pressable key={t.value} onPress={() => setType(t.value)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: type === t.value ? c.accent : c.input}}><Text style={{color: type === t.value ? PALETTE.white : c.text, fontSize: 13}}>{t.label}</Text></Pressable>)}</View>
            <Field label="Saldo inicial (R$)" value={initial} onChange={setInitial} numeric placeholder="0,00" />
            <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text}}>Somar no saldo geral</Text><Switch value={include} onValueChange={setInclude} /></View>
            <Field label="Dia em que você recebe (opcional)" value={cycleDay} onChange={setCycleDay} numeric placeholder="Ex.: 25" />
            <Text style={{fontSize: 11, color: c.muted, lineHeight: 16}}>Com esse dia, o Saldo passa a contar de um recebimento ao outro. Em branco, conta pelo mês do calendário.</Text>
          </>
        )}
        <View style={{flexDirection: 'row', gap: 10}}>{FIN_COLORS.map(x => <Pressable key={x} onPress={() => setColor(x)} style={{width: 30, height: 30, borderRadius: 15, backgroundColor: x, borderWidth: color === x ? 3 : 0, borderColor: c.text}} />)}</View>
        {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
        <Button title="Salvar" loading={busy} onPress={() => void save()} />
        {edit.item ? <Pressable onPress={async () => { try { await saveEntity(api, isCard ? 'fin_card' : 'fin_account', edit.item!.name, {}, edit.item!.entity, archived ? 'active' : 'archived'); onSaved(); } catch (e) { setError(errorText(e)); } }} style={{alignItems: 'center', padding: 10}}><Text style={{color: archived ? c.accent : c.danger}}>{archived ? 'Reativar' : 'Arquivar (o histórico fica)'}</Text></Pressable> : null}
        {card && !card.archived ? <Pressable accessibilityRole="button" accessibilityLabel="Excluir cartão" disabled={busy} onPress={()=>void removeCard()} style={{alignItems:'center',padding:12}}><Text style={{color:c.danger,fontWeight:'700'}}>Excluir cartão</Text></Pressable>:null}
      </ScrollView>
    </Sheet>
  );
}

// ---------- Importar extrato (OFX/CSV) ----------
export function ImportSheet({api, d, onClose, onDone}: {api: SofiaApi; d: Data; onClose: () => void; onDone: () => Promise<void>}) {
  const c = useTheme();
  const [target, setTarget] = useState<{type: 'account' | 'card'; id: string} | null>(() => d.accounts.filter(a => !a.archived).length === 1 && !d.cards.length ? {type: 'account', id: d.accounts[0].id} : null);
  const [file, setFile] = useState<{name: string; text: string} | null>(null), [preview, setPreview] = useState<ImportItem[] | null>(null), [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<{created: number; skipped: number} | null>(null);
  async function pick() {
    setError('');
    try {
      const r = await DocumentPicker.getDocumentAsync({type: ['*/*'], copyToCacheDirectory: true, multiple: false});
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0]; const text = await new File(a.uri).text();
      setFile({name: a.name || 'extrato', text}); setPreview(null); setChosen(new Set());
    } catch (e) { setError(errorText(e)); }
  }
  async function analyze() {
    if (!file || !target) return;
    setBusy(true); setError('');
    try {
      // 0.3.219: extrato da conta so fica guardado em "Extrato do banco" - nada e lancado na conta
      if (target.type === 'account') { await api.financeStatement(file.text, target.id); await onDone(); return; }
      const r = await api.financeImportPreview(file.text, target.type, target.id); setPreview(r.items); setChosen(new Set(r.items.filter(i => i.checked !== false && !i.duplicate && !i.skip).map(i => i.import_id)));
    }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function confirm() {
    if (!preview || !target) return;
    setBusy(true); setError('');
    try { const r = await api.financeImportCommit(preview.filter(i => chosen.has(i.import_id)), target.type, target.id); setResult(r); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const toggle = (id: string) => setChosen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosenItems = preview ? preview.filter(i => chosen.has(i.import_id)) : [];
  const sum = chosenItems.reduce((s, i) => s + (i.kind === 'income' ? i.amount : -i.amount), 0);
  return (
    <Sheet visible onClose={onClose} label="Fechar importação de extrato">
      <View style={{gap: 12}}>
        <Text style={{fontSize: 18, fontWeight: '600', color: c.text}}>Importar extrato</Text>
        {result ? (
          <View style={{gap: 10}}>
            <Text style={{color: c.text}}>{result.created} lançamento{result.created === 1 ? '' : 's'} importado{result.created === 1 ? '' : 's'}{result.skipped ? ' · ' + result.skipped + ' já existia' + (result.skipped === 1 ? '' : 'm') + ' (não duplicado)' : ''}.</Text>
            <Button title="Pronto" onPress={() => void onDone()} />
          </View>
        ) : (
          <>
            <Text style={{fontSize: 12, color: c.muted}}>Exporte o extrato no app do banco (OFX ou CSV) e escolha o arquivo aqui. Nada entra duplicado: o que já foi importado fica desmarcado.</Text>
            <Text style={{fontSize: 12, color: c.muted, fontWeight: '600'}}>1. De onde é o extrato?</Text>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
              {d.accounts.filter(a => !a.archived).map(a => <Pressable key={a.id} onPress={() => { setTarget({type: 'account', id: a.id}); setPreview(null); }} style={{paddingVertical: 8, paddingHorizontal: 12, borderRadius: 99, backgroundColor: target?.id === a.id ? c.accent : c.surface, borderWidth: 1, borderColor: c.line}}><Text style={{color: target?.id === a.id ? PALETTE.white : c.text, fontWeight: '500'}}>{a.name}</Text></Pressable>)}
              {d.cards.filter(x => !x.archived).map(x => <Pressable key={x.id} onPress={() => { setTarget({type: 'card', id: x.id}); setPreview(null); }} style={{paddingVertical: 8, paddingHorizontal: 12, borderRadius: 99, backgroundColor: target?.id === x.id ? c.accent : c.surface, borderWidth: 1, borderColor: c.line}}><Text style={{color: target?.id === x.id ? PALETTE.white : c.text, fontWeight: '500'}}>💳 {x.name}</Text></Pressable>)}
            </View>
            <Text style={{fontSize: 12, color: c.muted, fontWeight: '600'}}>2. Arquivo</Text>
            <Button title={file ? file.name : 'Escolher arquivo (OFX ou CSV)'} secondary onPress={() => void pick()} />
            {file && target && !preview ? <Button title={target?.type === 'account' ? 'Guardar extrato' : 'Conferir com o app'} loading={busy} onPress={() => void analyze()} /> : null}
            {preview ? (
              <View style={{gap: 6}}>
                <Text style={{fontSize: 12, color: c.muted, fontWeight: '600'}}>3. Confira ({chosenItems.length} de {preview.length} marcados · {money(Math.abs(sum))} {sum >= 0 ? 'de entrada' : 'de saída'})</Text>
                {/* 0.3.210: a lista rola por dentro e o botao Importar fica sempre visivel logo abaixo */}
                <View style={{flexDirection: 'row', gap: 16}}>
                  <Pressable accessibilityRole="button" onPress={() => setChosen(new Set(preview.filter(i => !i.skip && !i.duplicate).map(i => i.import_id)))}><Text style={{color: c.accent, fontWeight: '600', fontSize: 12}}>Marcar todos</Text></Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setChosen(new Set())}><Text style={{color: c.accent, fontWeight: '600', fontSize: 12}}>Desmarcar todos</Text></Pressable>
                </View>
                <View style={{maxHeight: Math.round(Dimensions.get('window').height * 0.42), borderRadius: 12, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10}}><ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {preview.map(i => <Pressable key={i.import_id} disabled={!!i.skip} onPress={() => toggle(i.import_id)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: c.line, opacity: i.skip ? 0.45 : 1}}>
                    <View style={{width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: chosen.has(i.import_id) ? c.accent : c.line, backgroundColor: chosen.has(i.import_id) ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>{chosen.has(i.import_id) ? <Text style={{color: c.onAccent, fontSize: 13, fontWeight: '700'}}>✓</Text> : null}</View>
                    <View style={{flex: 1}}><Text style={{color: c.text}} numberOfLines={1}>{i.desc}</Text><Text style={{fontSize: 11, color: c.muted}}>{i.date.split('-').reverse().join('/')}{i.category ? ' · ' + i.category : ''}{i.duplicate ? ' · já importado' : ''}{i.match ? ' · já está no app: “' + i.match.title + '”' + (typeof i.match.amount === 'number' && Math.abs(i.match.amount - i.amount) > 0.004 ? ' (lá com ' + money(i.match.amount) + ')' : '') : ''}{i.before ? ' · antes do seu ponto de partida (já está no Saldo)' : ''}{i.skip ? ' · ' + i.skip : ''}</Text></View>
                    <Text style={{fontWeight: '600', color: i.kind === 'income' ? c.good : c.text}}>{i.kind === 'income' ? '+' : '-'}{money(i.amount)}</Text>
                  </Pressable>)}
                </ScrollView></View>
                <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>O extrato já ficou guardado em Lançamentos → Extrato do banco, para conferir e acertar o Saldo. Só o que está marcado vira lançamento.</Text>
                <Button title={chosenItems.length ? 'Lançar ' + chosenItems.length + (chosenItems.length === 1 ? ' que falta' : ' que faltam') : 'Nada a lançar: tudo já está no app'} loading={busy} disabled={!chosenItems.length} onPress={() => void confirm()} />
              </View>
            ) : null}
            {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
          </>
        )}
      </View>
    </Sheet>
  );
}
