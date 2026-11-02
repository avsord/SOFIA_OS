// 0.3.303: "o que sobra depois de tudo pago" (a mesma regra do card Previsto de Financas: ciclo do salario, nos 5 dias
// antes do pagamento ja o ciclo seguinte; aporte do ciclo contado como feito), para o Inicio usar sem abrir Financas.
import {addDays, addMonths, cycleRange, dayIn, daysIn, effectiveCycleDay, manualDues, monthOf, moneySplit, reserveFor, simpleForecast, todayISO, type Account, type Card, type Tx, type Goal, type ReserveMove} from './finance';

export type LeftData = {accounts: Account[]; cards: Card[]; txs: Tx[]; goals: Goal[]; moves?: ReserveMove[]};

export function leftAfterBills(d: LeftData, today = todayISO()): {left: number; end: string} {
  const accountId = '', month = monthOf(today);
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
