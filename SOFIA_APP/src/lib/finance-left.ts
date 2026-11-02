// 0.3.303: "o que sobra depois de tudo pago" (a mesma regra do card Previsto de Financas: ciclo do salario, nos 5 dias
// antes do pagamento ja o ciclo seguinte; aporte do ciclo contado como feito), para o Inicio usar sem abrir Financas.
import {monthControl, totalBalance, transactionsForAccount, addDays, addMonths, cycleRange, dayIn, daysIn, effectiveCycleDay, manualDues, monthOf, moneySplit, reserveFor, simpleForecast, todayISO, type Account, type Card, type Tx, type Goal, type ReserveMove} from './finance';

export type LeftData = {accounts: Account[]; cards: Card[]; txs: Tx[]; goals: Goal[]; moves?: ReserveMove[]};

/** Igual a Financas: a conta principal ("Conta principal" ou a primeira ativa), so com os lancamentos dela. */
function primaryScope(d: LeftData): {d: LeftData; accountId: string} {
  const active = d.accounts.filter(a => !a.archived), acc = active.find(a => /^conta principal$/i.test(a.name.trim())) || active[0];
  if (!acc) return {d, accountId: ''};
  return {accountId: acc.id, d: {...d, accounts: [{...acc, include: true}], cards: d.cards.filter(c => c.accountId === acc.id && !c.archived), txs: transactionsForAccount(d.txs, d.cards, acc.id)}};
}

export function leftAfterBills(all: LeftData, today = todayISO()): {left: number; end: string} {
  const {d, accountId} = primaryScope(all), month = monthOf(today);
  const reserve = reserveFor(d.goals, accountId, true);
  const split = reserve ? moneySplit(reserve, d.moves || [], d.accounts, d.txs, d.cards, month, today, manualDues(d.txs, accountId, today, 45)) : null;
  const plan = split?.planned || 0, cycleDay = effectiveCycleDay(d.accounts, d.txs, accountId);
  const aporte = (range: {start: string; end: string}) => {
    const planDay = split?.planDay || 0, months: string[] = [];
    for (let m = monthOf(range.start); m <= monthOf(range.end); m = addMonths(m, 1)) months.push(m);
    const due = planDay ? months.filter(m => {const dt = dayIn(m, Math.min(planDay, daysIn(m))); return dt >= range.start && dt <= range.end;}).length * plan : 0;
    const done = reserve ? (d.moves || []).filter(m => m.goalId === reserve.id && m.direction === 'in' && (m as any).entity?.state !== 'archived' && m.date >= range.start && m.date <= range.end).reduce((t, m) => t + m.amount, 0) : 0;
    return Math.round(Math.max(due, done) * 100) / 100;
  };
  const cur = cycleRange(cycleDay, today), nextPay = addDays(cur.end, 1);
  const daysLeft = Math.round((Date.parse(nextPay + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 864e5), r = daysLeft <= 5 ? cycleRange(cycleDay, nextPay) : cur;
  const f = simpleForecast(d.txs, d.cards, r, accountId, today, aporte(r));
  return {left: (f as any).left, end: r.end};
}

/** 0.3.305: o Controle de gastos do mes (o mesmo card de Financas): gasto, disponivel e a porcentagem. */
export function spendControl(all: LeftData, today = todayISO()): {spent: number; available: number; pct: number} {
  const {d, accountId} = primaryScope(all), month = monthOf(today);
  const reserve = reserveFor(d.goals, accountId, true);
  const split = reserve ? moneySplit(reserve, d.moves || [], d.accounts, d.txs, d.cards, month, today, manualDues(d.txs, accountId, today, 45)) : null;
  const total = Math.round((totalBalance(d.accounts, d.txs) - (split ? split.net : 0)) * 100) / 100;
  const accs = accountId ? d.accounts.filter(a => a.id === accountId) : d.accounts.filter(a => a.include && !a.archived);
  const manualStart = accs.length && accs.every(a => typeof a.monthStarts[month] === 'number') ? accs.reduce((t, a) => t + a.monthStarts[month], 0) : null;
  const m = monthControl(d.txs, d.moves || [], reserve?.id || '', month, accountId, total, manualStart);
  return {spent: m.spent, available: m.available, pct: m.available > 0 ? Math.round(m.spent / m.available * 100) : 0};
}
