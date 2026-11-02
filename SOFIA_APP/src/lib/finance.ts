// Núcleo do app Finanças (inspirado no Mobills), sem React e testável.
// Regra: saldo real só conta o que está marcado como pago/recebido;
// o que está previsto aparece separado como "previsto", nunca misturado.
import type {Entity} from './types';

export type TxKind = 'expense' | 'income' | 'transfer' | 'card_payment';
export type Recurrence = 'none' | 'monthly' | 'weekly' | 'yearly';
export type Account = {spendCaps?: Record<string, number>; carry?: number; id: string; name: string; type: string; initial: number; color: string; include: boolean; archived: boolean; cycleDay: number; reportStart: string; monthStarts: Record<string, number>; entity: Entity};
export type Card = {id: string; name: string; limit: number; closing: number; due: number; color: string; accountId: string; archived: boolean; entity: Entity};
export type Tx = {paidAt: string; reservePart: number; time: string; noBalance?: boolean; 
  id: string; kind: TxKind; desc: string; amount: number; date: string; category: string; accountId: string; toAccountId: string; cardId: string;
  invoice: string; paid: boolean; seriesId: string; installment: number; installments: number; recurrence: Recurrence; recurrenceEnd: string;
  virtual?: boolean; manualDue?: boolean; remindDays?: number; entity?: Entity;
};
export type Budget = {id: string; category: string; limit: number; entity: Entity};
export type Goal = {id: string; name: string; target: number; saved: number; deadline: string; color: string; done: boolean; entity: Entity};

/** 0.3.259: `glyph` e o icone de verdade (conjunto da Sofia); `icon` (emoji) fica so por compatibilidade (chat, dados antigos). */
export type Category = {name: string; icon: string; color: string; glyph?: string};
export const EXPENSE_CATEGORIES: Category[] = [
  {name: 'Alimentação', icon: '🍽️', color: '#ff8a5b', glyph: 'forkKnife'}, {name: 'Mercado', icon: '🛒', color: '#2fc58b', glyph: 'cart'}, {name: 'Transporte', icon: '🚗', color: '#4fa3ff', glyph: 'car'},
  {name: 'Moradia', icon: '🏠', color: '#a98bff', glyph: 'house2'}, {name: 'Contas', icon: '💳', color: '#ffb547', glyph: 'receipt'}, {name: 'Saúde', icon: '💊', color: '#ff6b7a', glyph: 'heartbeat'},
  {name: 'Educação', icon: '📚', color: '#3fd0d4', glyph: 'graduation'}, {name: 'Lazer', icon: '🎬', color: '#ef7bd0', glyph: 'film'}, {name: 'Compras', icon: '🛍️', color: '#c6d84a', glyph: 'storefront'},
  {name: 'Assinaturas', icon: '📺', color: '#8f7cf7', glyph: 'tv'}, {name: 'Viagem', icon: '✈️', color: '#38b6ff', glyph: 'airplane'}, {name: 'Pets', icon: '🐾', color: '#d99a5b', glyph: 'paw'},
  {name: 'Presentes', icon: '🎁', color: '#ff7eb6', glyph: 'gift'}, {name: 'Impostos', icon: '🧾', color: '#9a9aa8', glyph: 'bank'}, {name: 'Trabalho', icon: '💼', color: '#6c8ebf', glyph: 'briefcase'},
  {name: 'Outros', icon: '📦', color: '#8a84a0', glyph: 'box'},
];
export const INCOME_CATEGORIES: Category[] = [
  {name: 'Salário', icon: '💼', color: '#2fc58b', glyph: 'briefcase'}, {name: 'Freelance', icon: '💻', color: '#4fa3ff', glyph: 'monitor'}, {name: 'Investimentos', icon: '📈', color: '#a98bff', glyph: 'trendUp'},
  {name: 'Vendas', icon: '🏷️', color: '#ffb547', glyph: 'tag'}, {name: 'Reembolso', icon: '↩️', color: '#3fd0d4', glyph: 'refund'}, {name: 'Presente', icon: '🎁', color: '#ff7eb6', glyph: 'gift'},
  {name: 'Outros', icon: '💰', color: '#8a84a0', glyph: 'coins'},
];
export const INVOICE_CATEGORY: Category = {name: 'Fatura do cartão', icon: '💳', color: '#7258e8', glyph: 'card'};
export const TRANSFER_CATEGORY: Category = {name: 'Transferência', icon: '🔁', color: '#8a84a0', glyph: 'repeat'};
export const ACCOUNT_TYPES = [{value: 'corrente', label: 'Conta corrente'}, {value: 'poupanca', label: 'Poupança'}, {value: 'carteira', label: 'Carteira'}, {value: 'investimento', label: 'Investimento'}, {value: 'outro', label: 'Outro'}];
export const FIN_COLORS = ['#7258e8', '#2fc58b', '#4fa3ff', '#ff8a5b', '#ff6b7a', '#ffb547', '#ef7bd0', '#3fd0d4'];

export function categoryOf(name: string, kind: TxKind = 'expense'): Category {
  if (kind === 'card_payment') return INVOICE_CATEGORY;
  if (kind === 'transfer') return TRANSFER_CATEGORY;
  const list = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.find(c => c.name === name) || {name: name || 'Outros', icon: kind === 'income' ? '💰' : '📦', color: '#8a84a0', glyph: kind === 'income' ? 'coins' : 'box'};
}

const num = (v: any) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const round2 = (v: number) => Math.round(v * 100) / 100;

// ---------- Datas ----------
export function monthOf(date: string): string { return date.slice(0, 7); }
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
export function daysIn(month: string): number { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function dayIn(month: string, day: number): string { return month + '-' + String(Math.min(day, daysIn(month))).padStart(2, '0'); }
export function todayISO(now = new Date()): string { return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'); }
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-BR', {month: 'long', timeZone: 'UTC'});
  return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + y;
}
export function addDays(date: string, n: number): string { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// ---------- Leitura das entidades ----------
export function toAccount(e: Entity): Account {
  return {id: e.id, name: e.title, type: String(e.data?.account_type || 'corrente'), initial: num(e.data?.initial_balance), color: String(e.data?.color || FIN_COLORS[0]),
    include: e.data?.include_total !== false, archived: e.state === 'archived', cycleDay: Math.min(31, Math.max(0, num(e.data?.cycle_day))), reportStart: /^\d{4}-\d{2}-\d{2}$/.test(String(e.data?.report_start || '')) ? String(e.data.report_start) : '', monthStarts: parseMonthStarts(e.data?.month_starts_json), spendCaps: parseMonthStarts(e.data?.spend_caps_json), entity: e};
}
export function toCard(e: Entity): Card {
  return {id: e.id, name: e.title, limit: num(e.data?.limit), closing: num(e.data?.closing_day) || 1, due: num(e.data?.due_day) || 10, color: String(e.data?.color || FIN_COLORS[2]),
    accountId: String(e.data?.account_id || ''), archived: e.state === 'archived', entity: e};
}
export function toTx(e: Entity): Tx {
  const d = e.data || {};
  return {id: e.id, kind: (d.kind || 'expense') as TxKind, desc: e.title, amount: num(d.amount), date: String(d.date || ''), category: String(d.category || ''),
    accountId: String(d.account_id || ''), toAccountId: String(d.to_account_id || ''), cardId: String(d.card_id || ''), invoice: String(d.invoice_month || ''),
    paid: !!d.paid, noBalance: !!d.no_balance, seriesId: String(d.series_id || ''), installment: num(d.installment), installments: num(d.installments), recurrence: (d.recurrence || 'none') as Recurrence,
    recurrenceEnd: String(d.recurrence_end || ''), manualDue: String(d.import_id || '').startsWith('sofia-pendencia:'), reservePart: Number(d.reserve_part) > 0 ? Number(d.reserve_part) : 0, time: /^\d{2}:\d{2}$/.test(String(d.time || '')) ? String(d.time) : '', paidAt: d.paid === true && /^\d{4}-\d{2}-\d{2}$/.test(String(d.paid_at || '')) ? String(d.paid_at) : '', remindDays: Math.max(0, Math.min(15, Number(d.remind_days) || 0)), entity: e};
}
export function toBudget(e: Entity): Budget { return {id: e.id, category: String(e.data?.category || e.title), limit: num(e.data?.limit), entity: e}; }
export function toGoal(e: Entity): Goal {
  return {id: e.id, name: e.title, target: num(e.data?.target), saved: num(e.data?.saved), deadline: String(e.data?.deadline || ''), color: String(e.data?.color || FIN_COLORS[1]), done: e.state === 'completed', entity: e};
}

// ---------- Cartão de crédito ----------
/** Compra depois do dia de fechamento cai na fatura do mês seguinte. */
/** 0.3.223: em qual fatura o lancamento entra. Conta do mes marcada no cartao (vencimento) entra na fatura do mes dela -
 * a conta de outubro fica na fatura de outubro. So compra avulsa segue o dia de fechamento (feita depois dele, vai para o
 * mes seguinte). Mes gravado no lancamento sempre vale. */
export function txInvoiceMonth(card: Pick<Card, 'closing'>, t: Pick<Tx, 'invoice' | 'date' | 'manualDue'>): string {
  return t.invoice || (t.manualDue ? monthOf(t.date) : invoiceMonth(card, t.date));
}
export function invoiceMonth(card: Pick<Card, 'closing'>, date: string): string {
  const day = Number(date.slice(8, 10)), month = monthOf(date);
  return day > card.closing ? addMonths(month, 1) : month;
}
/** Vencimento da fatura: se o dia de vencimento é antes do fechamento, vence no mês seguinte. */
export function invoiceDue(card: Pick<Card, 'closing' | 'due'>, month: string): string {
  return card.due <= card.closing ? dayIn(addMonths(month, 1), card.due) : dayIn(month, card.due);
}
export function invoiceClose(card: Pick<Card, 'closing'>, month: string): string { return dayIn(month, card.closing); }
export type Invoice = {card: Card; month: string; total: number; paid: number; due: string; close: string; items: Tx[]; status: 'aberta' | 'fechada' | 'paga' | 'vencida' | 'futura'};
/** 0.3.223: conta fixa no cartao (todo mes) cai na fatura de cada mes sozinha - gera as cobrancas ate 2 meses a frente. */
export function recurringCardCharges(card: Card, txs: Tx[], today = todayISO()): Tx[] {
  const templates = txs.filter(t => !t.virtual && t.cardId === card.id && t.kind === 'expense' && t.recurrence !== 'none');
  if (!templates.length) return [];
  const until = addMonths(monthOf(today), 2), seen = new Set<string>(), out: Tx[] = [];
  let from = templates.reduce((m, t) => monthOf(t.date) < m ? monthOf(t.date) : m, until);
  for (let m = from; m <= until; m = addMonths(m, 1)) for (const v of expandRecurring(txs, m)) if (v.cardId === card.id && !seen.has(v.id)) { seen.add(v.id); out.push(v); }
  return out;
}
export function cardInvoices(card: Card, txs: Tx[], today = todayISO()): Invoice[] {
  const months = new Map<string, Tx[]>();
  for (const t of [...txs, ...recurringCardCharges(card, txs, today)]) if (t.kind === 'expense' && t.cardId === card.id) {
    const m = txInvoiceMonth(card, t);
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(t);
  }
  // 0.3.222: a fatura aberta e a que ainda recebe compras (pelo dia de fechamento). Ex.: fecha dia 9 - em 21/10 a de
  // outubro ja esta fechada (ou paga) e a compra de hoje entra na de novembro, que e a aberta.
  const current = invoiceMonth(card, today);
  if (!months.has(current)) months.set(current, []);
  return [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, items]) => {
    const total = round2(items.reduce((s, t) => s + t.amount, 0));
    const paid = round2(txs.filter(t => t.kind === 'card_payment' && t.cardId === card.id && t.invoice === month && t.paid).reduce((s, t) => s + t.amount, 0));
    const due = invoiceDue(card, month), close = invoiceClose(card, month);
    // 0.3.223: depois do fechamento a fatura aparece FECHADA ate ser paga (o vencimento passado aparece ao lado da data)
    // 0.3.224: fatura que ja fechou e foi paga NAO reabre - conta esquecida que entra nela depois ja vem paga junto (o saldo
    // da pessoa ja e o real, com tudo pago), sem botao de pagar e sem mexer no saldo
    const closedPaid = month < current && paid > 0;
    const status: Invoice['status'] = closedPaid || (total > 0 && paid >= total) ? 'paga' : month > current ? 'futura' : month === current ? 'aberta' : 'fechada';
    return {card, month, total, paid, due, close, items: items.sort((a, b) => b.date.localeCompare(a.date)), status};
  });
}
/** 0.3.223: a fatura de um mes escolhido no topo (com as compras e contas daquele mes; mes sem nada vem vazio). */
export function invoiceForMonth(card: Card, txs: Tx[], month: string, today = todayISO()): Invoice {
  const found = cardInvoices(card, txs, today).find(i => i.month === month);
  if (found) return found;
  const current = invoiceMonth(card, today);
  return {card, month, total: 0, paid: 0, due: invoiceDue(card, month), close: invoiceClose(card, month), items: [], status: month > current ? 'futura' : month === current ? 'aberta' : 'fechada'};
}
/** 0.3.221: conta marcada com o cartao fica paga quando a fatura dela e paga (pagar a fatura paga todas de uma vez).
 * Se o pagamento da fatura for desfeito, elas voltam a ficar em aberto. */
export function cardBillSettled(cards: Card[], txs: Tx[], today = todayISO()): (t: Tx) => boolean {
  const cache = new Map<string, Invoice[]>();
  return (t: Tx) => {
    if (!t.cardId || t.kind !== 'expense') return false;
    const card = cards.find(c => c.id === t.cardId);
    if (!card) return false;
    let list = cache.get(card.id);
    if (!list) { list = cardInvoices(card, txs, today); cache.set(card.id, list); }
    const inv = list.find(i => i.month === txInvoiceMonth(card, t));
    return !!inv && inv.status === 'paga';
  };
}
/** 0.3.224: usado = tudo o que esta no cartao e ainda nao foi pago, em qualquer fatura (a compra parcelada ocupa o limite
 * inteiro na hora; pagar a fatura devolve). Assinatura/conta fixa no cartao so ocupa quando e cobrada naquele mes. */
export function cardUsed(card: Card, txs: Tx[], today = todayISO()): number {
  return round2(cardInvoices(card, txs, today).filter(i => i.status !== 'paga')
    .reduce((s, i) => s + Math.max(0, i.items.filter(t => !(t.virtual && t.date > today)).reduce((x, t) => x + t.amount, 0) - i.paid), 0));
}

// ---------- Parcelas e recorrência ----------
export function installmentPlan(amount: number, n: number, firstDate: string): Array<{amount: number; date: string; installment: number}> {
  const cents = Math.round(amount * 100), base = Math.floor(cents / n), rest = cents - base * n;
  const day = Number(firstDate.slice(8, 10)), month = monthOf(firstDate);
  return Array.from({length: n}, (_, i) => ({amount: (base + (i === 0 ? rest : 0)) / 100, date: dayIn(addMonths(month, i), day), installment: i + 1}));
}
/** Lançamentos repetidos aparecem nos meses seguintes como "previstos" até a
 * pessoa confirmar; confirmar cria o lançamento real daquele mês. */
export function expandRecurring(txs: Tx[], month: string): Tx[] {
  const out: Tx[] = [];
  for (const t of txs) {
    if (t.recurrence === 'none' || !t.date || monthOf(t.date) >= month) continue;
    if (t.recurrenceEnd && month > t.recurrenceEnd) continue;
    const series = t.seriesId || t.id;
    const day = Number(t.date.slice(8, 10));
    const dates: string[] = [];
    if (t.recurrence === 'monthly') dates.push(dayIn(month, day));
    else if (t.recurrence === 'yearly') { if (t.date.slice(5, 7) === month.slice(5, 7)) dates.push(dayIn(month, day)); }
    else if (t.recurrence === 'weekly') { for (let d = t.date; monthOf(d) <= month; d = addDays(d, 7)) if (monthOf(d) === month) dates.push(d); }
    for (const date of dates) {
      const exists = txs.some(x => (x.seriesId === series || x.id === series) && x.id !== t.id && x.date === date);
      const newer = txs.some(x => (x.seriesId === series) && x.id !== t.id && x.recurrence !== 'none' && x.date > t.date && x.date <= date);
      if (!exists && !newer) out.push({...t, id: 'virtual:' + series + ':' + date, date, paid: false, virtual: true, seriesId: series, invoice: ''});
    }
  }
  return out;
}

// ---------- Saldos ----------
export function effect(t: Tx, accountId: string): number {
  // 0.3.257: "Nao mexer no saldo" - fica no Historico e nos totais do mes, mas nao desconta nem soma no Saldo
  if (!t.paid || t.virtual || t.noBalance) return 0;
  if (t.kind === 'income' && t.accountId === accountId) return t.amount;
  if (t.kind === 'expense' && !t.cardId && t.accountId === accountId) return -t.amount;
  if (t.kind === 'card_payment' && t.accountId === accountId) return -t.amount;
  if (t.kind === 'transfer') return (t.toAccountId === accountId ? t.amount : 0) - (t.accountId === accountId ? t.amount : 0);
  return 0;
}
export function accountBalance(a: Account, txs: Tx[], upTo?: string): number {
  return round2(a.initial + txs.filter(t => !upTo || t.date <= upTo).reduce((s, t) => s + effect(t, a.id), 0));
}
export function totalBalance(accounts: Account[], txs: Tx[], upTo?: string): number {
  return round2(accounts.filter(a => a.include && !a.archived).reduce((s, a) => s + accountBalance(a, txs, upTo), 0));
}
/** Saldo previsto no fim do mês: real + o que ainda falta pagar/receber no mês. */
export function forecastBalance(accounts: Account[], txs: Tx[], month: string, cards: Card[], today = todayISO()): number {
  const end = dayIn(month, 31), included = new Set(accounts.filter(a => a.include && !a.archived).map(a => a.id));
  let v = totalBalance(accounts, txs, end);
  for (const t of monthTxs(txs, month)) {
    if (t.paid && !t.virtual) continue;
    if (t.kind === 'income' && included.has(t.accountId)) v += t.amount;
    if (t.kind === 'expense' && !t.cardId && included.has(t.accountId)) v -= t.amount;
  }
  for (const c of cards) for (const i of cardInvoices(c, txs, today)) if (i.due.slice(0, 7) === month && i.status !== 'paga') v -= Math.max(0, i.total - i.paid);
  return round2(v);
}

// ---------- Mês ----------
export function monthTxs(txs: Tx[], month: string): Tx[] {
  return [...txs.filter(t => monthOf(t.date) === month), ...expandRecurring(txs, month)].sort((a, b) => b.date.localeCompare(a.date) || a.desc.localeCompare(b.desc));
}
export type MonthSummary = {income: number; incomePending: number; expense: number; expensePending: number; cardSpend: number; result: number};
/** Despesas do mês contam compras no cartão na data da compra (como no
 * Mobills); pagamento de fatura e transferência não entram, para não contar
 * o mesmo gasto duas vezes. */
export function monthSummary(txs: Tx[], month: string): MonthSummary {
  const list = monthTxs(txs, month);
  let income = 0, incomePending = 0, expense = 0, expensePending = 0, cardSpend = 0;
  // 0.3.223: compra no cartao cobrada na fatura de outro mes (feita depois do fechamento) conta nas Despesas do mes da
  // fatura, nao no da compra - nao mexe no mes atual
  const later = (t: Tx) => t.kind === 'expense' && !!t.cardId && !!t.invoice && t.invoice > monthOf(t.date);
  for (const t of txs) if (!t.virtual && later(t) && t.invoice === month && monthOf(t.date) !== month) { cardSpend += t.amount; expense += t.amount; }
  for (const t of list) {
    if (t.kind === 'income') { if (t.paid && !t.virtual) income += t.amount; else incomePending += t.amount; }
    if (t.kind === 'expense') {
      if (later(t)) continue;
      if (t.cardId) { cardSpend += t.amount; expense += t.amount; }
      else if (t.paid && !t.virtual) expense += t.amount; else expensePending += t.amount;
    }
  }
  return {income: round2(income), incomePending: round2(incomePending), expense: round2(expense), expensePending: round2(expensePending), cardSpend: round2(cardSpend), result: round2(income - expense)};
}
export type CategorySlice = {category: Category; total: number; pct: number; count: number};
export function byCategory(txs: Tx[], month: string, kind: 'expense' | 'income' = 'expense', includePending = true): CategorySlice[] {
  const map = new Map<string, {total: number; count: number}>();
  for (const t of monthTxs(txs, month)) {
    if (t.kind !== kind) continue;
    if (!includePending && !t.cardId && (!t.paid || t.virtual)) continue;
    const k = t.category || 'Outros', cur = map.get(k) || {total: 0, count: 0};
    cur.total += t.amount; cur.count++; map.set(k, cur);
  }
  const sum = [...map.values()].reduce((s, v) => s + v.total, 0);
  return [...map.entries()].map(([name, v]) => ({category: categoryOf(name, kind), total: round2(v.total), pct: sum ? v.total / sum : 0, count: v.count})).sort((a, b) => b.total - a.total);
}
export type BudgetProgress = {budget: Budget; spent: number; pct: number; left: number; state: 'ok' | 'alerta' | 'estourado'};
export function budgetProgress(budgets: Budget[], txs: Tx[], month: string): BudgetProgress[] {
  const spent = new Map(byCategory(txs, month, 'expense').map(s => [s.category.name, s.total]));
  return budgets.map(b => {
    const s = spent.get(b.category) || 0, pct = b.limit ? s / b.limit : 0;
    return {budget: b, spent: s, pct, left: round2(b.limit - s), state: pct >= 1 ? 'estourado' : pct >= 0.8 ? 'alerta' : 'ok'} as BudgetProgress;
  }).sort((a, b) => b.pct - a.pct);
}
export function trend(txs: Tx[], month: string, count = 6): Array<{month: string; income: number; expense: number}> {
  return Array.from({length: count}, (_, i) => addMonths(month, i - count + 1)).map(m => { const s = monthSummary(txs, m); return {month: m, income: s.income + s.incomePending, expense: s.expense + s.expensePending}; });
}
/** 0.3.160: com reserva, o saldo geral de cada dia desconta o que ja tinha sido guardado ate ali
 * (e devolve o que foi retirado), igual ao Saldo geral do Resumo. */
export function reserveNetUntil(moves: ReserveMove[], goalId: string, date: string): number {
  return round2(moves.filter(m => m.goalId === goalId && m.entity?.state !== 'archived' && m.date <= date)
    .reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0));
}
export function balanceSeries(accounts: Account[], txs: Tx[], month: string, reserve?: {goalId: string; moves: ReserveMove[]}): Array<{t: number; v: number}> {
  const out: Array<{t: number; v: number}> = [], days = daysIn(month), today = todayISO();
  for (let d = 1; d <= days; d++) {
    const date = dayIn(month, d);
    if (date > today) break;
    out.push({t: Date.parse(date + 'T12:00:00Z'), v: round2(totalBalance(accounts, txs, date) - (reserve ? reserveNetUntil(reserve.moves, reserve.goalId, date) : 0))});
  }
  return out;
}
/** Evolucao do guardado dia a dia no mes: valor inicial + aportes - retiradas ate cada dia. */
export function reserveSeries(reserve: Goal, moves: ReserveMove[], month: string, today = todayISO()): Array<{t: number; v: number}> {
  const out: Array<{t: number; v: number}> = [], days = daysIn(month);
  for (let d = 1; d <= days; d++) {
    const date = dayIn(month, d);
    if (date > today) break;
    out.push({t: Date.parse(date + 'T12:00:00Z'), v: round2((Number(reserve.saved) || 0) + reserveNetUntil(moves, reserve.id, date))});
  }
  return out;
}

// ---------- Contas a pagar / receber ----------
export type Due = {id: string; title: string; amount: number; date: string; kind: 'pagar' | 'receber' | 'fatura'; late: boolean; paid?: boolean; tx?: Tx; invoice?: Invoice};
export function upcoming(txs: Tx[], cards: Card[], today = todayISO(), days = 7): Due[] {
  const until = addDays(today, days), months = [monthOf(today), monthOf(until)].filter((m, i, a) => a.indexOf(m) === i);
  const list: Due[] = [];
  const pending = [...txs, ...months.flatMap(m => expandRecurring(txs, m))].filter(t => !t.paid && !t.cardId && (t.kind === 'expense' || t.kind === 'income') && t.date <= until);
  const seen = new Set<string>();
  for (const t of pending) {
    if (seen.has(t.id)) continue; seen.add(t.id);
    if (t.virtual && t.date < monthOf(today) + '-01') continue;
    list.push({id: t.id, title: t.desc, amount: t.amount, date: t.date, kind: t.kind === 'income' ? 'receber' : 'pagar', late: t.date < today, tx: t});
  }
  for (const c of cards) if (!c.archived) for (const i of cardInvoices(c, txs, today)) {
    if (i.total <= i.paid || i.status === 'paga' || i.status === 'futura' || i.status === 'aberta' && i.due > until) continue;
    if (i.due <= until) list.push({id: 'fatura:' + c.id + ':' + i.month, title: 'Fatura ' + c.name, amount: round2(i.total - i.paid), date: i.due, kind: 'fatura', late: i.due < today, invoice: i});
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}


/** Uma conta selecionada é um painel isolado: não mistura saldo ou histórico da esposa/empresa.
 * Cobranças de cartões entram na conta que paga a fatura, sem duplicar transferências. */
export function transactionsForAccount(txs: Tx[], cards: Card[], accountId: string): Tx[] {
  const linked = new Set(cards.filter(c => c.accountId === accountId).map(c => c.id));
  return txs.filter(t => t.accountId === accountId || t.toAccountId === accountId || (!!t.cardId && linked.has(t.cardId)));
}
/** Pendências são cadastradas manualmente na Sofia (fin_tx.import_id=sofia-pendencia:*).
 * Compras de extrato e despesas lançadas não criam lembretes automaticamente. */
export function manualDues(txs: Tx[], accountId = '', today = todayISO(), days = 40): Due[] {
  const until = addDays(today, days), months: string[] = [];
  for (let m = monthOf(today); m <= monthOf(until); m = addMonths(m, 1)) months.push(m);
  const seen = new Set<string>();
  return [...txs, ...months.flatMap(m => expandRecurring(txs, m))]
    .filter(t => t.manualDue && !t.paid && (t.kind === 'expense' || t.kind === 'income') && !t.cardId && (!accountId || t.accountId === accountId) && t.date <= until)
    .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })
    .map(t => ({id: t.id, title: t.desc, amount: t.amount, date: t.date, kind: (t.kind === 'income' ? 'receber' : 'pagar') as Due['kind'], late: t.date < today, tx: t}))
    .sort((a,b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
/** Pendencias do MES escolhido no topo. 0.3.180: cada mes fica com as suas contas, mesmo as
 * atrasadas - uma conta de setembro nao pagas continua em setembro (marcada como atrasada). */
export function monthDues(txs: Tx[], accountId: string, month: string, today = todayISO(), settled?: (t: Tx) => boolean): Due[] {
  const start = dayIn(month, 1), end = dayIn(month, daysIn(month));
  const seen = new Set<string>();
  return [...txs, ...expandRecurring(txs, month)]
    // 0.3.177: as pagas daquele mes continuam na lista (verdes), em vez de sumirem ao pagar
    // 0.3.223: as contas no cartao tambem aparecem (com o simbolo do cartao); elas se pagam pela fatura
    .filter(t => t.manualDue && (t.kind === 'expense' || t.kind === 'income') && (!accountId || t.accountId === accountId))
    .filter(t => t.date >= start && t.date <= end)
    .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })
    .map(t => ({id: t.id, title: t.desc, amount: t.amount, date: t.date, kind: (t.kind === 'income' ? 'receber' : 'pagar') as Due['kind'], late: !t.paid && !t.cardId && t.date < today, paid: t.paid || (!!t.cardId && !!settled?.(t)), tx: t}))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
/** 0.3.185: lancamentos pagos que parecem repetidos - mesmo tipo, mesma descricao, mesmo valor e mesmo
 * mes (ex.: o salario confirmado duas vezes). A pessoa decide qual sai. */
export type DuplicateGroup = {key: string; title: string; amount: number; month: string; kind: TxKind; items: Tx[]};
export function duplicateGroups(txs: Tx[]): DuplicateGroup[] {
  const groups = new Map<string, Tx[]>();
  for (const t of txs) {
    if (!t.paid || t.virtual || !t.entity || String(t.id).startsWith('local:')) continue;
    if (t.kind !== 'income' && t.kind !== 'expense') continue;
    const key = [t.kind, t.desc.trim().toLowerCase(), t.amount.toFixed(2), monthOf(t.date), t.accountId].join('|');
    groups.set(key, [...(groups.get(key) || []), t]);
  }
  return [...groups.entries()].filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({key, title: items[0].desc, amount: items[0].amount, month: monthOf(items[0].date), kind: items[0].kind, items: items.sort((a, b) => a.date.localeCompare(b.date))}));
}
export type FinanceInsight = {tone: 'good' | 'attention' | 'neutral'; text: string};
export function financeInsights(txs: Tx[], month: string): FinanceInsight[] {
  // Conselhos só com dados realmente registrados; sem inventar gastos, projeções ou culpa.
  const settled = txs.filter(t => !t.virtual && ((t.paid) || (t.kind === 'expense' && !!t.cardId)) && (!t.manualDue || t.paid));
  const monthPaid = monthTxs(settled, month);
  const count = monthPaid.filter(t => t.kind === 'income' || t.kind === 'expense').length;
  if (!count) return [{tone:'neutral',text:'Ainda não há receitas ou despesas confirmadas suficientes para analisar este mês.'}];
  const summary = monthSummary(settled, month);
  const insights: FinanceInsight[] = [];
  if (summary.income > 0 && summary.expense <= summary.income) insights.push({tone:'good',text:'As despesas registradas ficaram dentro das receitas recebidas neste mês.'});
  else if (summary.income > 0 && summary.expense > summary.income) insights.push({tone:'attention',text:'As despesas superaram as receitas registradas. Revise os gastos antes de assumir novas contas.'});
  const cats = byCategory(settled, month, 'expense', false);
  if (cats.length > 0 && cats[0].pct >= .40 && cats[0].total > 0) insights.push({tone:'attention',text:'A categoria '+cats[0].category.name+' concentra '+Math.round(cats[0].pct * 100)+'% dos gastos do mês. Vale conferir se isso era esperado.'});
  const prior = monthSummary(settled, addMonths(month, -1));
  if (prior.expense > 0 && summary.expense > prior.expense * 1.2) insights.push({tone:'attention',text:'As despesas registradas cresceram mais de 20% em relação ao mês anterior.'});
  if (!insights.length) insights.push({tone:'neutral',text:'Continue registrando entradas e saídas para a Sofia identificar tendências com mais segurança.'});
  return insights;
}

// ---------- Objetivos ----------
export function goalProgress(g: Goal, today = todayISO()): {pct: number; left: number; perMonth: number | null} {
  const left = Math.max(0, round2(g.target - g.saved)), pct = g.target ? Math.min(1, g.saved / g.target) : 0;
  if (!g.deadline || left <= 0) return {pct, left, perMonth: null};
  const months = Math.max(1, (Number(g.deadline.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(g.deadline.slice(5, 7)) - Number(today.slice(5, 7)));
  return {pct, left, perMonth: round2(left / months)};
}

// ---------- Entrada de valor ----------
/** "1.234,56", "1234.56", "R$ 89,90" → número. Nada válido → null. */
export function parseMoney(text: string): number | null {
  let t = String(text || '').replace(/[^\d.,-]/g, '');
  if (!t) return null;
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
  if (lc > -1 && ld > -1) t = lc > ld ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (lc > -1) t = t.replace(/\./g, '').replace(',', '.');
  else if (ld > -1 && t.length - ld - 1 === 3 && (t.match(/\./g) || []).length >= 1) t = t.replace(/\./g, '');
  const v = Number(t);
  return Number.isFinite(v) ? round2(v) : null;
}

/** Máscara brasileira durante a digitação: agrupa milhares sem mudar a ordem digitada.
 * A vírgula é o separador decimal explícito (ponto do teclado decimal também é aceito).
 * Nunca converte o texto em centavos automaticamente: "191146" são 191.146 reais. */
export function formatMoneyInput(text: string, _previous: string | number = ''): string {
  // 0.3.164: máscara de banco - os dígitos entram pela direita e os separadores aparecem sozinhos.
  // "3" → 0,03 · "30" → 0,30 · "300" → 3,00 · "3000" → 30,00 · apagar devolve o dígito anterior.
  const raw = String(text ?? '');
  const sign = raw.trim().startsWith('-') ? '-' : '';
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return '';
  const cents = digits.slice(-14).padStart(3, '0');
  const head = cents.slice(0, -2).replace(/^0+(?=\d)/, '') || '0';
  return sign + head.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + cents.slice(-2);
}
/** No fim da edição, mostra os centavos sem arredondamentos invisíveis no campo. */
export function finishMoneyInput(text: string): string {
  const value = parseMoney(text);
  if (value === null) return '';
  const cents = Math.round(Math.abs(value) * 100);
  const whole = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (value < 0 ? '-' : '') + whole + ',' + String(cents % 100).padStart(2, '0');
}

// ---------- Ligações com outros apps ----------
/** Lê valor e vencimento de um texto de cobrança (assunto + trecho do e-mail).
 * Só sugere: a pessoa confere antes de salvar. */
export function parseBill(text: string, today = todayISO()): {amount: number | null; due: string | null} {
  const t = String(text || '');
  const money = [...t.matchAll(/R\$\s*([\d.]+,\d{2}|\d+(?:\.\d{2})?)/gi)].map(m => parseMoney(m[1])).filter((v): v is number => v !== null && v > 0);
  const near = /(vencimento|vence|vencendo|pagar até|pague até|data de pagamento)[^\d]{0,25}(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/i.exec(t)
    || /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(t);
  let due: string | null = null;
  if (near) {
    const g = near.length === 5 ? [near[2], near[3], near[4]] : [near[1], near[2], near[3]];
    const d = Number(g[0]), m = Number(g[1]); let y = g[2] ? Number(g[2].length === 2 ? '20' + g[2] : g[2]) : Number(today.slice(0, 4));
    if (!g[2] && (m < Number(today.slice(5, 7)) - 1)) y++;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) due = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  return {amount: money.length ? Math.max(...money) : null, due};
}

// ---------- Dinheiro guardado x saldo geral (0.3.154: guardado e INDEPENDENTE das contas) ----------
// O valor guardado (Objetivo com papel 'reserve') e um dinheiro a parte: os R$ 15.000 informados
// NAO estao nas contas e nao sao descontados do saldo geral. Saldo geral = o que voce tem para usar.
// So os movimentos (guardar/retirar) passam dinheiro entre os dois: guardar tira do saldo geral e
// soma no guardado; retirar faz o caminho inverso. O total (guardado + saldo geral) nao muda por isso.
// Guardado = valor inicial + guardados - retiradas. Comprometido = contas a pagar ate o fim do mes.
// Livre = saldo geral - comprometido. Aporte planejado nao soma nada ate ser registrado.
export type ReserveMove = {id: string; goalId: string; direction: 'in' | 'out'; amount: number; date: string; note: string; planned: boolean; entity: Entity};
export function toReserveMove(e: Entity): ReserveMove {
  const d = e.data || {};
  return {id: e.id, goalId: String(d.goal_id || ''), direction: d.direction === 'out' ? 'out' : 'in', amount: Number(d.amount) || 0, date: String(d.date || ''), note: String(d.note || ''), planned: d.planned === true, entity: e};
}
export function reserveOf(goals: Goal[]): Goal | null { return goals.find(g => g.entity?.data?.role === 'reserve') || null; }
export type MoneySplit = {net: number; total: number; saved: number; daily: number; committed: number; free: number;
  planned: number; realized: number; takenBack: number; monthTarget: number; missing: number; shortfall: number;
  planDay: number; remindBefore: number; remindTime: string; remindRepeatDays: number; nextPlanDate: string; closed: boolean};
export function moneySplit(reserve: Goal, moves: ReserveMove[], accounts: Account[], txs: Tx[], cards: Card[], month: string, today = todayISO(), manualBills?: Due[]): MoneySplit {
  const mine = moves.filter(m => m.goalId === reserve.id && m.entity?.state !== 'archived');
  const net = mine.reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0);
  const saved = round2((Number(reserve.saved) || 0) + net);
  const daily = round2(totalBalance(accounts, txs) - net);   // saldo geral: o que voce tem para usar
  const total = round2(daily + saved);                        // guardado + saldo geral (resumo)
  const monthEnd = dayIn(month, daysIn(month));
  const days = Math.max(0, Math.round((Date.parse(monthEnd + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 864e5));
  const commitments = manualBills === undefined ? upcoming(txs, cards, today, days) : manualBills;
  const committed = round2(commitments.filter(d => d.kind !== 'receber' && d.date <= monthEnd).reduce((s, d) => s + d.amount, 0));
  // 0.3.159: aporte do mes. Retirada marcada para recompor soma ao que falta NESTE mes; retirada
  // planejada nao. O mes nunca acumula para o seguinte: em novembro a conta recomeca no valor cheio.
  const d = reserve.entity?.data || {};
  const planned = Number(d.monthly_plan) || 0;
  const ofMonth = mine.filter(m => monthOf(m.date) === month);
  const realized = round2(ofMonth.filter(m => m.direction === 'in').reduce((s, m) => s + m.amount, 0));
  const takenBack = round2(ofMonth.filter(m => m.direction === 'out' && m.entity?.data?.planned !== true).reduce((s, m) => s + m.amount, 0));
  const monthTarget = round2(planned > 0 ? planned + takenBack : takenBack);
  const planDay = Math.min(28, Math.max(1, Number(d.plan_day) || 1));
  const nextPlanDate = planned > 0 ? (dayIn(month, planDay) >= today ? dayIn(month, planDay) : dayIn(addMonths(month, 1), planDay)) : '';
  const missing = round2(Math.max(0, monthTarget - realized));
  return {net, total, saved, daily, committed, free: round2(daily - committed), planned, realized, takenBack, monthTarget,
    missing, shortfall: round2(Math.max(0, committed - daily)), planDay,
    remindBefore: Math.max(0, Math.min(15, Number(d.remind_before_days) || 0)),
    remindTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.remind_time || '')) ? String(d.remind_time) : '09:00',
    remindRepeatDays: Math.max(0, Number(d.remind_repeat_days) || 0),
    nextPlanDate, closed: monthTarget > 0 && missing === 0};
}

/** 0.3.151: reserva (Dinheiro guardado) de cada conta. A principal tambem usa a reserva antiga, sem conta. */
export function reserveFor(goals: Goal[], accountId: string, isPrimary: boolean): Goal | null {
  const reserves = goals.filter(g => g.entity?.data?.role === 'reserve');
  return reserves.find(g => String(g.entity?.data?.account_id || '') === accountId) || (isPrimary ? reserves.find(g => !g.entity?.data?.account_id) || null : null);
}

/** 0.3.159: resumo curto para a faixa do guardado (o texto longo fica em "Sua reserva"). */
export function reserveBadge(split: MoneySplit, today = todayISO(), money = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})): string {
  if (split.realized > 0 && split.missing > 0) return '+' + money(split.realized) + ' de ' + money(split.monthTarget);
  if (split.closed) return '✓ em dia';
  if (split.missing > 0) {
    const day = dayIn(monthOf(today), split.planDay);
    if (today < day) return money(split.missing) + ' · dia ' + split.planDay;
    return 'faltam ' + money(split.missing);
  }
  return '';
}

/** 0.3.159: historico da reserva agrupado por mes (mais recente primeiro), com o que entrou e saiu. */
export type ReserveMonth = {month: string; in: number; out: number; net: number; items: ReserveMove[]};
export function reserveHistory(moves: ReserveMove[], goalId: string): ReserveMonth[] {
  const mine = moves.filter(m => m.goalId === goalId && m.entity?.state !== 'archived');
  const by = new Map<string, ReserveMove[]>();
  for (const m of mine) { const k = monthOf(m.date || todayISO()); by.set(k, [...(by.get(k) || []), m]); }
  return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, list]) => {
    const items = [...list].sort((a, b) => b.date.localeCompare(a.date) || String(b.entity?.updated_at || '').localeCompare(String(a.entity?.updated_at || '')));
    const inn = round2(items.filter(m => m.direction === 'in').reduce((t, m) => t + m.amount, 0));
    const out = round2(items.filter(m => m.direction === 'out').reduce((t, m) => t + m.amount, 0));
    return {month, in: inn, out, net: round2(inn - out), items};
  });
}
/** Rotulo de cada movimento no historico. */
export function reserveMoveLabel(m: ReserveMove): string {
  return m.direction === 'in' ? 'Aporte' : m.planned ? 'Retirada planejada' : 'Retirada a recompor';
}

// ---------- 0.3.161: ciclo do dinheiro, contas fixas e folga ----------
/** O ciclo comeca no dia em que a pessoa recebe (ex.: 25) e vai ate a vespera do proximo.
 * Sem dia definido, e o proprio mes do calendario. */
export function cycleRange(day: number, today = todayISO()): {start: string; end: string; label: string} {
  const d = Math.min(31, Math.max(1, Math.round(day) || 0));
  if (!d) { const m = monthOf(today); return {start: dayIn(m, 1), end: dayIn(m, daysIn(m)), label: monthLabel(m)}; }  // sem dia: mes do calendario
  const clamp = (month: string) => dayIn(month, Math.min(d, daysIn(month)));
  const thisMonth = monthOf(today), start = today >= clamp(thisMonth) ? clamp(thisMonth) : clamp(addMonths(thisMonth, -1));
  const next = clamp(addMonths(monthOf(start), 1));
  const end = addDays(next, -1);
  return {start, end, label: 'até ' + end.slice(8, 10) + '/' + end.slice(5, 7)};
}
/** Contas fixas = pendencias marcadas como "todo mes". Previsto e o valor cadastrado; realizado, o confirmado. */
export type FixedBill = {id: string; title: string; amount: number; paidAmount: number | null; day: number; date: string; paid: boolean; cardId: string;
  installments: number; index: number; left: number; last: boolean; tx: Tx};
export function fixedBills(txs: Tx[], accountId: string, range: {start: string; end: string}, kind: 'expense' | 'income' = 'expense', settled?: (t: Tx) => boolean): FixedBill[] {
  const months = [...new Set([monthOf(range.start), monthOf(range.end)])];
  const all = [...txs, ...months.flatMap(m => expandRecurring(txs, m))];
  const seen = new Set<string>();
  return all.filter(t => (t.recurrence === 'monthly' || !!t.seriesId) && t.kind === kind && (!accountId || t.accountId === accountId) && t.date >= range.start && t.date <= range.end)
    .filter(t => { const k = t.desc + '|' + t.date; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(t => {
      // 0.3.165: conta fixa com prazo ("10x"). A parcela sai da distancia ate a primeira; o que falta
      // conta a partir do proximo pagamento: paga a 6a de 10, restam 4.
      const total = Math.max(0, Math.round(Number(t.entity?.data?.installments) || 0));
      const first = String(t.entity?.data?.date || t.date);
      const base = Math.max(1, Math.round(Number(t.entity?.data?.installment) || 1));
      const index = total ? Math.min(total, monthsBetween(monthOf(first), monthOf(t.date)) + base) : 0;
      const paid = t.paid || (!!t.cardId && !!settled?.(t));
      return {id: t.id, title: t.desc, amount: t.amount, paidAmount: paid ? t.amount : null, day: Number(t.date.slice(8, 10)), date: t.date, paid, cardId: t.cardId || '',
        installments: total, index, left: total ? Math.max(0, total - index + (paid ? 0 : 1)) : 0, last: !!total && index >= total, tx: t};
    });
}
export type FixedSummary = {card: number; bills: FixedBill[]; total: number; paid: number; open: number; income: number; share: number | null};
export function fixedSummary(txs: Tx[], accountId: string, range: {start: string; end: string}, kind: 'expense' | 'income' = 'expense', settled?: (t: Tx) => boolean): FixedSummary {
  const bills = fixedBills(txs, accountId, range, kind, settled);
  const total = round2(bills.reduce((s, b) => s + b.amount, 0));
  const paid = round2(bills.filter(b => b.paid).reduce((s, b) => s + b.amount, 0));
  const card = round2(bills.filter(b => !b.paid && b.cardId).reduce((s, b) => s + b.amount, 0));
  const income = round2(txs.filter(t => t.kind === 'income' && (!accountId || t.accountId === accountId) && t.date >= range.start && t.date <= range.end).reduce((s, t) => s + t.amount, 0));
  return {bills, total, paid, card, open: round2(total - paid - card), income, share: income > 0 ? total / income : null};
}
/** Folga do ciclo: o que entrou menos as fixas (pagas ou nao), menos o aporte do ciclo, menos os gastos variaveis. */
export type CycleRoom = {start: string; end: string; label: string; income: number; fixed: number; plan: number; ceiling: number; spent: number; left: number; pct: number; over: number};
export function cycleRoom(txs: Tx[], accountId: string, range: {start: string; end: string; label: string}, plan: number, opening = 0): CycleRoom {
  const mine = txs.filter(t => (!accountId || t.accountId === accountId) && t.date >= range.start && t.date <= range.end);
  const income = round2(mine.filter(t => t.kind === 'income').reduce((s, t) => s + t.amount, 0));
  const fixed = round2(fixedBills(txs, accountId, range).reduce((s, b) => s + b.amount, 0));
  const fixedKeys = new Set(fixedBills(txs, accountId, range).map(b => b.title + '|' + b.date));
  const spent = round2(mine.filter(t => t.kind === 'expense' && !fixedKeys.has(t.desc + '|' + t.date)).reduce((s, t) => s + t.amount, 0));
  const ceiling = round2(Math.max(0, opening + income - fixed - Math.max(0, plan)));
  const left = round2(ceiling - spent);
  return {...range, income, fixed, plan: Math.max(0, plan), ceiling, spent, left: Math.max(left, left), pct: ceiling > 0 ? Math.max(0, Math.min(1, left / ceiling)) : 0, over: round2(Math.max(0, -left))};
}

/** 0.3.161: meta do guardado - quanto falta, o que o aporte atual alcanca no prazo e quanto por mes fecharia. */
export type ReservePlanOutlook = {target: number; deadline: string; missing: number; months: number; atCurrent: number; neededMonthly: number; reachDate: string; onTrack: boolean; ahead: number};
export function reserveOutlook(reserve: Goal, saved: number, monthly: number, today = todayISO()): ReservePlanOutlook | null {
  const target = Number(reserve.target) || 0, deadline = String(reserve.entity?.data?.deadline || '');
  if (target <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const missing = round2(Math.max(0, target - saved));
  const months = Math.max(0, (Number(deadline.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + (Number(deadline.slice(5, 7)) - Number(today.slice(5, 7))));
  const atCurrent = round2(saved + monthly * months);
  const neededMonthly = months > 0 ? round2(missing / months) : missing;
  const reachMonths = monthly > 0 ? Math.ceil(missing / monthly) : 0;
  const reachDate = missing === 0 ? today.slice(0, 7) : monthly > 0 ? addMonths(monthOf(today), reachMonths) : '';
  return {target, deadline, missing, months, atCurrent, neededMonthly, reachDate, onTrack: atCurrent >= target, ahead: round2(saved - Math.max(0, target - neededMonthly * months))};
}

/** Meses entre dois meses no formato AAAA-MM. */
export function monthsBetween(from: string, to: string): number {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));
}
/** 0.3.165: ultimo mes de uma conta fixa com prazo (para parar de se repetir sozinha). */
export function lastInstallmentMonth(firstDate: string, installments: number): string {
  const n = Math.max(1, Math.round(installments)) - 1;
  return addMonths(monthOf(firstDate), n);
}

/** 0.3.194: relatorios a partir de um ponto de partida por conta. Os lancamentos de antes continuam
 * guardados (e no Saldo), so nao entram nos graficos e totais dos Relatorios. */
export function sinceReportStart(accounts: Account[], txs: Tx[]): Tx[] {
  const start = new Map(accounts.map(a => [a.id, a.reportStart]));
  return txs.filter(t => { const s = start.get(t.accountId) || ''; return !s || t.date >= s; });
}

// ---------- 0.3.195: periodo do salario (ex.: 25/10 a 24/11) ----------
export type PeriodBudget = {start: string; end: string; income: number; fixed: number; single: number; card: number; aporte: number; available: number; spent: number; left: number};
/** Orcamento de um periodo: o que entra - contas fixas - avulsas - fatura do cartao que vence nele - aporte.
 * "spent" sao os gastos do dia a dia ja lancados (fora das contas previstas); "left" e o que ainda resta. */
export function periodBudget(txs: Tx[], cards: Card[], range: {start: string; end: string}, accountId: string, plan: number, today = todayISO()): PeriodBudget {
  const months: string[] = [];
  for (let m = monthOf(range.start); m <= monthOf(range.end); m = addMonths(m, 1)) months.push(m);
  const seen = new Set<string>();
  const list = [...txs, ...months.flatMap(m => expandRecurring(txs, m))]
    .filter(t => t.date >= range.start && t.date <= range.end && (!accountId || t.accountId === accountId) && !t.cardId)
    .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
  const sum = (f: (t: Tx) => boolean) => round2(list.filter(f).reduce((s, t) => s + t.amount, 0));
  const recurring = (t: Tx) => t.recurrence === 'monthly' || !!t.seriesId;
  const income = sum(t => t.kind === 'income');
  const fixed = sum(t => t.kind === 'expense' && recurring(t));
  const single = sum(t => t.kind === 'expense' && !!t.manualDue && !recurring(t));
  const spent = sum(t => t.kind === 'expense' && t.paid && !t.manualDue && !recurring(t));
  let card = 0;
  for (const c of cards) if (!accountId || !c.accountId || c.accountId === accountId) for (const i of cardInvoices(c, txs, today)) if (i.due >= range.start && i.due <= range.end) card += Math.max(0, i.total);
  card = round2(card);
  const aporte = round2(Math.max(0, plan)), available = round2(income - fixed - single - card - aporte);
  return {start: range.start, end: range.end, income, fixed, single, card, aporte, available, spent, left: round2(available - spent)};
}
/** Previsao do salario: na ultima semana antes do proximo salario, o periodo que vai comecar; nos outros dias,
 * o periodo em andamento. Sem dia de recebimento, usa o mes do calendario. */
export function salaryForecast(txs: Tx[], cards: Card[], cycleDay: number, plan: number, accountId = '', today = todayISO()): PeriodBudget & {upcoming: boolean} {
  const current = cycleRange(cycleDay, today), nextStart = addDays(current.end, 1);
  const upcoming = Math.round((Date.parse(nextStart + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000) <= 7;
  return {...periodBudget(txs, cards, upcoming ? cycleRange(cycleDay, nextStart) : current, accountId, plan, today), upcoming};
}

/** 0.3.195: dia do ciclo de cada pessoa. Usa o dia informado na conta; se nao houver, o dia da receita fixa
 * principal (o maior "a receber todo mes", ex.: salario do dia 5); se nao houver nenhuma, 0 = mes do calendario. */
export function effectiveCycleDay(accounts: Account[], txs: Tx[], accountId = ''): number {
  const acc = accountId ? accounts.find(a => a.id === accountId) : accounts.find(a => a.include && !a.archived && a.cycleDay);
  if (acc?.cycleDay) return acc.cycleDay;
  const salary = txs.filter(t => !t.virtual && t.kind === 'income' && t.recurrence === 'monthly' && !t.seriesId && (!accountId || t.accountId === accountId))
    .sort((a, b) => b.amount - a.amount)[0];
  return salary ? Number(salary.date.slice(8, 10)) || 0 : 0;
}

// ---------- 0.3.196: previsao e controle a partir do dinheiro real ----------
export type MoneyPlan = {start: string; end: string; carry: number; toReceive: number; toPay: number; card: number; aporte: number;
  income: number; fixed: number; single: number; left: number; spent: number; available: number};
function periodList(txs: Tx[], range: {start: string; end: string}, accountId: string): Tx[] {
  const months: string[] = [];
  for (let m = monthOf(range.start); m <= monthOf(range.end); m = addMonths(m, 1)) months.push(m);
  const seen = new Set<string>();
  return [...txs, ...months.flatMap(m => expandRecurring(txs, m))]
    .filter(t => t.date >= range.start && t.date <= range.end && (!accountId || t.accountId === accountId) && !t.cardId)
    .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
}
function cardDue(cards: Card[], txs: Tx[], range: {start: string; end: string}, accountId: string, today: string, openOnly: boolean): number {
  let v = 0;
  for (const c of cards) if (!accountId || !c.accountId || c.accountId === accountId) for (const i of cardInvoices(c, txs, today))
    if (i.due >= range.start && i.due <= range.end && (!openOnly || i.status !== 'paga')) v += Math.max(0, openOnly ? i.total - i.paid : i.total);
  return round2(v);
}
/** Periodo em andamento: parte do Saldo real. Resta = Saldo + o que ainda vai entrar - contas ainda por pagar
 * no periodo (fixas, avulsas, fatura) - aporte ainda por fazer no periodo. Nunca passa do que a pessoa tem. */
export function currentPlan(txs: Tx[], cards: Card[], range: {start: string; end: string}, accountId: string, saldo: number, aporteDate: string, aportePending: number, today = todayISO()): MoneyPlan {
  const list = periodList(txs, range, accountId);
  const sum = (f: (t: Tx) => boolean) => round2(list.filter(f).reduce((s, t) => s + t.amount, 0));
  const recurring = (t: Tx) => t.recurrence === 'monthly' || !!t.seriesId;
  const toReceive = sum(t => t.kind === 'income' && !t.paid);
  const toPay = sum(t => t.kind === 'expense' && !t.paid);
  const card = cardDue(cards, txs, range, accountId, today, true);
  const aporte = aporteDate >= range.start && aporteDate <= range.end ? round2(Math.max(0, aportePending)) : 0;
  const spent = sum(t => t.kind === 'expense' && t.paid && !t.manualDue && !recurring(t));
  const left = round2(saldo + toReceive - toPay - card - aporte);
  return {start: range.start, end: range.end, carry: saldo, toReceive, toPay, card, aporte, income: 0, fixed: 0, single: 0, left, spent, available: round2(left + spent)};
}
/** Proximo periodo do salario: o que sobra do periodo atual + o que entra no proximo - o que ja tem destino nele. */
export function nextPlan(txs: Tx[], cards: Card[], range: {start: string; end: string}, accountId: string, carry: number, plan: number, today = todayISO()): MoneyPlan {
  const list = periodList(txs, range, accountId);
  const sum = (f: (t: Tx) => boolean) => round2(list.filter(f).reduce((s, t) => s + t.amount, 0));
  const recurring = (t: Tx) => t.recurrence === 'monthly' || !!t.seriesId;
  const income = sum(t => t.kind === 'income');
  const fixed = sum(t => t.kind === 'expense' && recurring(t));
  const single = sum(t => t.kind === 'expense' && !recurring(t));
  const card = cardDue(cards, txs, range, accountId, today, false);
  const aporte = round2(Math.max(0, plan));
  const left = round2(carry + income - fixed - single - card - aporte);
  return {start: range.start, end: range.end, carry: round2(carry), toReceive: 0, toPay: 0, card, aporte, income, fixed, single, left, spent: 0, available: left};
}

// ---------- 0.3.196: modelo simples (definido pelo Pedro) ----------
/** Previsto do periodo do salario: receitas (salario e qualquer outra) - despesas lancadas - pendentes a pagar
 * - fatura do cartao que vence no periodo - aporte do periodo. Sem o que sobrou do periodo anterior. */
export type SimpleForecast = {start: string; end: string; income: number; expense: number; card: number; aporte: number; left: number; incomeItems: Tx[]; expenseItems: Tx[]};
export function simpleForecast(txs: Tx[], cards: Card[], range: {start: string; end: string}, accountId: string, today = todayISO(), aporte = 0): SimpleForecast {
  const list = periodList(txs, range, accountId);
  const income = round2(list.filter(t => t.kind === 'income').reduce((s, t) => s + t.amount, 0));
  const expense = round2(list.filter(t => t.kind === 'expense').reduce((s, t) => s + t.amount, 0));
  const card = cardDue(cards, txs, range, accountId, today, false);
  const ap = round2(Math.max(0, aporte));
  // 0.3.198: os lancamentos de cada linha, para a pessoa ver (e corrigir) o que compoe o previsto
  const byDate = (a: Tx, b: Tx) => a.date.localeCompare(b.date) || b.amount - a.amount;
  return {start: range.start, end: range.end, income, expense, card, aporte: ap, left: round2(income - expense - card - ap),
    incomeItems: list.filter(t => t.kind === 'income').sort(byDate), expenseItems: list.filter(t => t.kind === 'expense').sort(byDate)};
}
/** Controle de gastos: o que esta no Saldo. 100% = Saldo de agora + tudo o que ja saiu no periodo
 * (despesas pagas, faturas pagas e aportes); cada saida diminui a porcentagem. */
export type SpendControl = {start: string; end: string; left: number; out: number; available: number; pct: number};
export function spendControl(txs: Tx[], moves: ReserveMove[], reserveId: string, range: {start: string; end: string}, accountId: string, saldo: number): SpendControl {
  const mine = (t: Tx) => (!accountId || t.accountId === accountId) && t.paid && !t.virtual && t.date >= range.start && t.date <= range.end;
  const spent = txs.filter(t => mine(t) && ((t.kind === 'expense' && !t.cardId) || t.kind === 'card_payment')).reduce((s, t) => s + t.amount, 0);
  const aportes = reserveId ? moves.filter(m => m.goalId === reserveId && m.direction === 'in' && m.entity?.state !== 'archived' && m.date >= range.start && m.date <= range.end).reduce((s, m) => s + m.amount, 0) : 0;
  const out = round2(spent + aportes), available = round2(saldo + out);
  return {start: range.start, end: range.end, left: round2(saldo), out, available, pct: available > 0 ? Math.max(0, Math.min(1, saldo / available)) : 0};
}

// ---------- 0.3.199: resumo da semana e gasto fora do padrao ----------
function expensesBetween(txs: Tx[], accountId: string, start: string, end: string): Map<string, number> {
  const by = new Map<string, number>();
  for (const t of txs) {
    if (t.virtual || t.kind !== 'expense' || t.date < start || t.date > end || (accountId && t.accountId !== accountId)) continue;
    const cat = t.category || 'Outros';
    by.set(cat, round2((by.get(cat) || 0) + t.amount));
  }
  return by;
}
/** Ultima semana completa (segunda a domingo) por categoria, comparada com a media das 8 semanas anteriores. */
export type WeekLine = {category: string; total: number; average: number; change: number | null};
export function lastWeekByCategory(txs: Tx[], accountId = '', today = todayISO()): {start: string; end: string; total: number; lines: WeekLine[]} {
  const dow = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7; // 0 = segunda
  const start = addDays(today, -dow - 7), end = addDays(start, 6);
  const week = expensesBetween(txs, accountId, start, end);
  const avg = new Map<string, number>();
  for (let i = 1; i <= 8; i++) { const s = addDays(start, -7 * i); for (const [c, v] of expensesBetween(txs, accountId, s, addDays(s, 6))) avg.set(c, (avg.get(c) || 0) + v / 8); }
  const lines = [...week.entries()].map(([category, total]) => { const average = round2(avg.get(category) || 0); return {category, total, average, change: average > 0 ? (total - average) / average : null}; })
    .sort((a, b) => b.total - a.total);
  return {start, end, total: round2(lines.reduce((s, l) => s + l.total, 0)), lines};
}
/** Categoria que ja passou do que a pessoa costuma gastar no mes (media dos 3 meses anteriores com gasto):
 * pelo menos 30% e R$ 50 acima. */
export type CategoryAlert = {category: string; total: number; average: number; over: number; pct: number};
export function categoryAlerts(txs: Tx[], accountId: string, month: string): CategoryAlert[] {
  const now = expensesBetween(txs, accountId, dayIn(month, 1), dayIn(month, daysIn(month)));
  const hist: Map<string, number>[] = [];
  for (let i = 1; i <= 3; i++) { const m = addMonths(month, -i); hist.push(expensesBetween(txs, accountId, dayIn(m, 1), dayIn(m, daysIn(m)))); }
  const out: CategoryAlert[] = [];
  for (const [category, total] of now) {
    const values = hist.map(h => h.get(category) || 0).filter(v => v > 0);
    if (!values.length) continue;
    const average = round2(values.reduce((a, b) => a + b, 0) / values.length), over = round2(total - average);
    if (total >= average * 1.3 && over >= 50) out.push({category, total, average, over, pct: over / average});
  }
  return out.sort((a, b) => b.over - a.over);
}

// ---------- 0.3.208: sobra = saldo + o que vai entrar - o que falta pagar (contas, fatura, aporte) ----------
export type MoneyLeft = {start: string; end: string; saldo: number; toReceive: number; toGuard: number; toPay: number; card: number; aporte: number; left: number; spent: number; available: number; incomeItems: Tx[]; expenseItems: Tx[]};
/** Pagar uma conta prevista nao muda a sobra (o saldo cai e a conta sai do "a pagar" juntos). So gasto fora do
 * previsto diminui; receita a mais aumenta. A fatura cadastrada como conta nao e contada duas vezes. */
export function moneyLeft(txs: Tx[], cards: Card[], range: {start: string; end: string}, accountId: string, saldo: number, aportePending: number, today = todayISO()): MoneyLeft {
  const list = periodList(txs, range, accountId);
  const recurring = (t: Tx) => t.recurrence === 'monthly' || !!t.seriesId;
  const card = cardDue(cards, txs, range, accountId, today, true);
  const isInvoiceBill = (t: Tx) => card > 0 && /fatura/i.test(t.desc + ' ' + t.category);
  const incomeItems = list.filter(t => t.kind === 'income' && !t.paid).sort((a, b) => a.date.localeCompare(b.date));
  const expenseItems = list.filter(t => t.kind === 'expense' && !t.paid && !isInvoiceBill(t)).sort((a, b) => a.date.localeCompare(b.date));
  const sum = (xs: Tx[]) => round2(xs.reduce((s, t) => s + t.amount, 0));
  // 0.3.222: a receita entra pelo que fica no saldo; a parte dela que vai para o guardado ja e o aporte (nao desconta duas vezes)
  const toGuard = round2(incomeItems.reduce((s, t) => s + Math.min(t.amount, t.reservePart || 0), 0));
  const toReceive = round2(sum(incomeItems) - toGuard), toPay = sum(expenseItems), aporte = round2(Math.max(0, aportePending - toGuard));
  const spent = sum(list.filter(t => t.kind === 'expense' && t.paid && !t.manualDue && !recurring(t)));
  const left = round2(saldo + toReceive - toPay - card - aporte);
  return {start: range.start, end: range.end, saldo: round2(saldo), toReceive, toGuard, toPay, card, aporte, left, spent, available: round2(Math.max(left, 0) + spent), incomeItems, expenseItems};
}

// ---------- 0.3.214: Controle de gastos = quanto tinha no inicio do mes x quanto tem agora (o Saldo) ----------
export function parseMonthStarts(v: unknown): Record<string, number> {
  try { const o = JSON.parse(String(v || '{}')); const out: Record<string, number> = {}; if (o && typeof o === 'object') for (const [k, n] of Object.entries(o)) if (/^\d{4}-\d{2}$/.test(k) && Number.isFinite(Number(n))) out[k] = Number(n); return out; } catch { return {}; }
}
/** start = saldo no inicio do mes (o informado em "Ajustar saldo"; sem ele, o calculado pelos lancamentos).
 * O 100% e o start (parado); o atual e o Saldo (receitas do mes entram so nele). Gasto = start - atual. */
export type MonthControl = {start: number; manual: boolean; income: number; extra: number; available: number; left: number; spent: number; pct: number};
/** Receita AVULSA (freela, venda...) e a que nao e programada: sem repeticao e sem serie. A parte dela que foi para o
 * guardado nao entra no Controle; o que ficou no saldo soma ao valor inicial. Salario e aluguel (programadas) vao para o
 * Saldo e so entram na base na virada do mes. */
export function isOneOffIncome(t: Tx): boolean { return t.kind === 'income' && t.recurrence !== 'monthly' && !t.seriesId && !t.virtual; }
export function monthControl(txs: Tx[], moves: ReserveMove[], reserveId: string, month: string, accountId: string, saldo: number, manualStart: number | null): MonthControl {
  const first = dayIn(month, 1), last = dayIn(month, daysIn(month));
  const mine = (t: Tx) => (!accountId || t.accountId === accountId) && t.paid && !t.virtual && !t.cardId && t.date >= first && t.date <= last;
  const income = round2(txs.filter(t => mine(t) && t.kind === 'income').reduce((s, t) => s + t.amount, 0));
  const extra = round2(txs.filter(t => mine(t) && isOneOffIncome(t)).reduce((s, t) => s + Math.max(0, t.amount - (t.reservePart || 0)), 0));
  const out = round2(txs.filter(t => mine(t) && (t.kind === 'expense' || t.kind === 'card_payment')).reduce((s, t) => s + t.amount, 0)
    + (reserveId ? moves.filter(m => m.goalId === reserveId && m.entity?.state !== 'archived' && m.date >= first && m.date <= last).reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0) : 0));
  const start = manualStart !== null ? round2(manualStart) : round2(saldo - income + out);
  const available = round2(start + extra), left = round2(saldo);
  return {start, manual: manualStart !== null, income, extra, available, left, spent: round2(available - left), pct: available > 0 ? Math.max(0, left / available) : 0};
}

/** 0.3.214: Saldo (o que voce tem para usar) como estava no fim de uma data: contas ate a data menos o guardado ate a data.
 * Serve ao Controle de gastos de um mes que ja passou - assim ele nao compara o saldo de HOJE com o comeco daquele mes. */
export function balanceAsOf(accounts: Account[], txs: Tx[], moves: ReserveMove[], reserveId: string, date: string): number {
  const net = reserveId ? moves.filter(m => m.goalId === reserveId && m.entity?.state !== 'archived' && m.date <= date).reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0) : 0;
  return round2(totalBalance(accounts, txs, date) - net);
}

// ---------- 0.3.227: conta/receita fixa cadastrada mais de uma vez (mesmo nome, tipo, conta e dia) ----------
export type FixedDupGroup = {key: string; title: string; kind: TxKind; day: number; items: Tx[]};
const normTitle = (v: string) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function fixedDuplicateGroups(txs: Tx[]): FixedDupGroup[] {
  const groups = new Map<string, Tx[]>();
  for (const t of txs) {
    if (t.virtual || !t.entity || !t.manualDue || (t.kind !== 'income' && t.kind !== 'expense')) continue;
    const fixed = t.recurrence === 'monthly' && !t.seriesId, single = t.recurrence === 'none' && !t.paid && !t.seriesId;
    if (!fixed && !single) continue;
    const key = [t.kind, t.accountId, normTitle(t.desc), Number(t.date.slice(8, 10)), fixed ? 'mensal' : t.date.slice(0, 7)].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return [...groups.entries()].filter(([, v]) => v.length > 1).map(([key, items]) => ({key, title: items[0].desc, kind: items[0].kind, day: Number(items[0].date.slice(8, 10)), items}));
}

/** 0.3.228: fixas (todo mes) ja cadastradas que so comecam DEPOIS do periodo - aparecem na lista de Contas (como "comeca em"),
 * fora dos totais do mes. Antes, uma receita cadastrada para comecar no mes seguinte sumia da lista do mes atual. */
export function fixedUpcoming(txs: Tx[], accountId: string, range: {start: string; end: string}, kind: 'expense' | 'income' = 'expense'): Tx[] {
  return txs.filter(t => !t.virtual && t.entity && t.recurrence === 'monthly' && !t.seriesId && t.kind === kind && (!accountId || t.accountId === accountId) && t.date > range.end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.desc.localeCompare(b.desc));
}

/** 0.3.232: conta com programacao (todo mes ou parcelada) fica em Contas; avulsa fica so no extrato (Historico). */
export function isScheduled(t?: Tx | null): boolean { return !!t && (t.recurrence === 'monthly' || !!t.seriesId || (t.installments || 0) > 1); }

/** 0.3.232: copias IDENTICAS de uma conta/receita programada (mesmo nome, tipo, conta, valor, data e parcelas), ainda sem
 * pagamento ligado: devolve as que sobram (fica a mais antiga). O app apaga sozinho - nao depende do servidor. */
export function exactTwinExtras(txs: Tx[]): Tx[] {
  const norm = (v: string) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const children = new Set(txs.map(t => t.seriesId).filter(Boolean)), groups = new Map<string, Tx[]>();
  for (const t of txs) {
    if (t.virtual || !t.entity || !t.manualDue || t.recurrence !== 'monthly' || t.seriesId || t.paid || children.has(t.id)) continue;
    const d = t.entity.data || {};
    const key = [t.kind, t.accountId, norm(t.desc), t.amount.toFixed(2), t.date, Number(d.installments) || 0, Number(d.installment) || 0, t.cardId || ''].join('|');
    groups.set(key, [...(groups.get(key) || []), t]);
  }
  const extras: Tx[] = [];
  for (const list of groups.values()) if (list.length > 1) {
    const created = (t: Tx) => String((t.entity as {created_at?: string} | undefined)?.created_at || '');
    const keep = [...list].sort((a, b) => created(a).localeCompare(created(b)) || a.id.localeCompare(b.id))[0];
    extras.push(...list.filter(t => t.id !== keep.id));
  }
  return extras;
}

// ---------- 0.3.221: mudancas no Saldo (o que mudou entre uma abertura e outra, item por item) ----------
/** Retrato do que forma o Saldo de uma conta: ponto de partida (saldo inicial e ajustes), acumulado dos meses
 * anteriores e cada lancamento que conta, com o valor que ele soma ou tira. */
export type SaldoItem = {d: number; t: string; dt: string};
export type SaldoSnap = {total: number; base: number; carry: number; items: Record<string, SaldoItem>};
export type SaldoLine = {id?: string; title: string; date: string; delta: number; why: 'novo' | 'saiu' | 'desmarcado' | 'mudou' | 'inicial' | 'anteriores'};
export type SaldoChange = {at: string; before: number; after: number; lines: SaldoLine[]};
export function saldoSnapshot(a: Account, txs: Tx[]): SaldoSnap {
  const items: Record<string, SaldoItem> = {};
  let sum = 0;
  for (const t of txs) {
    if (t.virtual || !t.entity || String(t.id).startsWith('local:')) continue;
    const e = effect(t, a.id);
    if (!e) continue;
    items[t.id] = {d: round2(e), t: t.desc, dt: t.date};
    sum += e;
  }
  const carry = round2(a.carry || 0), base = round2(a.initial - carry);
  return {total: round2(base + carry + sum), base, carry, items};
}
/** Reserva (guardado): aporte tira do Saldo, retirada devolve. */
export function reserveSnapshot(moves: ReserveMove[], goalId: string): SaldoSnap {
  const items: Record<string, SaldoItem> = {};
  let sum = 0;
  for (const m of moves) {
    if (m.goalId !== goalId || m.entity?.state === 'archived') continue;
    const d = round2(m.direction === 'in' ? -m.amount : m.amount);
    items['move:' + m.id] = {d, t: m.direction === 'in' ? 'Aporte no guardado' : 'Retirada do guardado', dt: m.date};
    sum += d;
  }
  return {total: round2(sum), base: 0, carry: 0, items};
}
/** O que explica a diferenca entre dois retratos. null quando o Saldo nao mudou. `present` = ids que ainda existem no app
 * (um pago que virou "a pagar" aparece como desmarcado, nao como apagado). */
export function saldoDiff(prev: SaldoSnap, next: SaldoSnap, at: string, present: Set<string> = new Set()): SaldoChange | null {
  if (round2(prev.total) === round2(next.total)) return null;
  const lines: SaldoLine[] = [];
  if (round2(next.base - prev.base)) lines.push({title: 'Saldo inicial / ajuste do saldo', date: at.slice(0, 10), delta: round2(next.base - prev.base), why: 'inicial'});
  if (round2(next.carry - prev.carry)) lines.push({title: 'Lançamentos de meses anteriores', date: at.slice(0, 10), delta: round2(next.carry - prev.carry), why: 'anteriores'});
  for (const [id, it] of Object.entries(next.items)) {
    const old = prev.items[id];
    if (!old) lines.push({id, title: it.t, date: it.dt, delta: it.d, why: 'novo'});
    else if (round2(old.d - it.d)) lines.push({id, title: it.t, date: it.dt, delta: round2(it.d - old.d), why: 'mudou'});
  }
  for (const [id, it] of Object.entries(prev.items)) if (!next.items[id]) lines.push({id, title: it.t, date: it.dt, delta: round2(-it.d), why: present.has(id) ? 'desmarcado' : 'saiu'});
  return {at, before: round2(prev.total), after: round2(next.total), lines};
}

/** 0.3.222: Extrato do saldo como um extrato de banco - o que ja aconteceu nao muda. O ponto de partida fica como era;
 * cada ajuste, item que saiu, deixou de estar pago ou mudou de valor entra como uma linha nova, na data e hora em que
 * aconteceu, com o quanto mudou e quanto ficou. O item que saiu continua na data dele, como era. */
export type LedgerItem = {id: string; date: string; desc: string; delta: number; note: string; tx: Tx | null};
export type LedgerRow = LedgerItem & {at: string; run: number; change: boolean};
export function saldoLedger(items: LedgerItem[], base: number, carry: number, changes: SaldoChange[], total: number): {start: number; carry: number; rows: LedgerRow[]} {
  const rows: Array<LedgerItem & {at: string; change: boolean}> = items.map(i => ({...i, at: '', change: false}));
  const byId = new Map(rows.map(r => [r.id, r]));
  let start = base, prior = carry;
  const hm = (at: string) => { const d = new Date(at); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const ordered = [...changes].sort((a, b) => b.at.localeCompare(a.at));   // do mais novo para o mais antigo: desfaz um por vez
  for (const ch of ordered) {
    const date = todayISO(new Date(ch.at));
    for (const l of ch.lines) {
      if (l.why === 'novo') continue;
      const add = (desc: string, note: string) => rows.push({id: 'change:' + ch.at + ':' + (l.id || l.why), date, desc, delta: l.delta, note: note + ' às ' + hm(ch.at), tx: null, at: ch.at, change: true});
      if (l.why === 'inicial') { start = round2(start - l.delta); add('Ajuste do saldo', 'ajuste'); }
      else if (l.why === 'anteriores') { prior = round2(prior - l.delta); add('Ajuste nos meses anteriores', 'ajuste'); }
      else if (l.why === 'saiu' || l.why === 'desmarcado') {
        const original = {id: (l.id || l.title) + ':antes:' + ch.at, date: l.date, desc: l.title, delta: round2(-l.delta), note: l.why === 'saiu' ? 'saiu depois' : 'desmarcado depois', tx: null, at: '', change: false};
        rows.push(original);
        add(l.title, l.why === 'saiu' ? 'saiu do app' : 'deixou de estar pago');
      } else if (l.why === 'mudou' && l.id && byId.has(l.id)) {
        const cur = byId.get(l.id)!; cur.delta = round2(cur.delta - l.delta);
        add(l.title, 'valor mudou');
      }
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || Number(a.change) - Number(b.change) || a.at.localeCompare(b.at));
  let run = round2(start + prior);
  const out: LedgerRow[] = rows.map(r => { run = round2(run + r.delta); return {...r, run}; });
  const gap = round2(total - run);
  if (gap) { run = round2(run + gap); out.push({id: 'gap', date: todayISO(), desc: 'Diferença sem lançamento', delta: gap, note: 'não identificada', tx: null, at: '', change: true, run}); }
  return {start, carry: prior, rows: out};
}

/** 0.3.310 (Pedro): teto de gastos do mes, que a pessoa define (engrenagem no Controle de gastos). Mes sem valor herda
 * o ultimo teto definido antes dele; sem nenhum, 0 (= sem teto). */
export function spendCapFor(acc: Account | undefined, month: string): number {
  const caps = acc?.spendCaps || {}; if (typeof caps[month] === 'number') return caps[month];
  const prev = Object.keys(caps).filter(m => m < month).sort().pop();
  return prev ? caps[prev] : 0;
}
/** Despesas do mes FORA as contas: o que a pessoa lancou (avulsas e compras no cartao com a parcela do mes), sem contas
 * a pagar e sem o que se repete. E o que conta contra o teto. */
export function looseExpenses(txs: Tx[], month: string, accountId = ''): Tx[] {
  return txs.filter(t => t.kind === 'expense' && monthOf(t.date) === month && !(t as any).virtual && (t as any).entity?.state !== 'archived'
    && (!accountId || t.accountId === accountId || !!t.cardId) && !t.manualDue && (t.recurrence || 'none') === 'none' && !(t.seriesId && !(t.installments > 1)));
}
