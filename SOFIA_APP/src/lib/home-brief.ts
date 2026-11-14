// 0.3.292 (Inicio novo, prototipo aprovado): os dados do "resumo de tudo" num lugar so. O Inicio espera este
// pacote ficar pronto junto com tarefas e agenda, e o esqueleto troca uma vez so, com tudo no lugar.
import {useEffect, useState} from 'react';
import type {SofiaApi} from './api';
import type {Entity} from './types';
import {useCapsules} from './capsule-store';
import {manualDues, todayISO, reserveOf, moneySplit, upcoming, addDays, cardInvoices, type Due, type Tx, type Card} from './finance';
import type {GoalNumbers} from '../components/GoalProgress';
import {readCache, toData, loadAll, financeWindow} from '../screens/finance/core';
import {classify, type Pack} from '../screens/PackagesApp';
import {leftAfterBills, spendControl, looseSpending} from './finance-left';

/** 13/11/2026 (Pedro: "marquei recebi o aluguel e sumiu da linha do tempo"): contas, receitas e faturas da linha do tempo.
 * As em aberto (como antes) e TAMBEM as ja pagas/recebidas pela Sofia (paid_at preenchido) no periodo da linha: ficam no lugar,
 * marcadas como feitas. Gasto lancado ja pago (sem paid_at) nao entra: nunca foi conta a pagar. */
export function timelineMoney(txs: Tx[], cards: Card[], today = todayISO(), days = 4): Due[] {
  const open = upcoming(txs, cards, today, days).filter(x => !x.paid), from = addDays(today, -31), until = addDays(today, days), ids = new Set(open.map(x => x.id));
  // 13/11/2026 (Mimic Kaizen: conta paga pelo "Paguei" sumia da linha do tempo): conta atrasada ha mais de 31 dias aparecia
  // (pendente nao tem limite para tras) e, paga, saia da janela. Paga nos ultimos 2 dias fica no lugar, ticada.
  const recentPay = addDays(today, -2);
  const paid: Due[] = txs.filter(t => t.paid && !!t.paidAt && !t.virtual && !t.cardId && (t.kind === 'expense' || t.kind === 'income') && (t.date >= from || String(t.paidAt).slice(0, 10) >= recentPay) && t.date <= until && !ids.has(t.id))
    .map(t => ({id: t.id, title: t.desc, amount: t.amount, date: t.date, kind: t.kind === 'income' ? 'receber' as const : 'pagar' as const, late: false, paid: true, tx: t}));
  for (const c of cards) if (!c.archived) for (const i of cardInvoices(c, txs, today)) {
    if (i.total > 0 && (i.status === 'paga' || i.total <= i.paid) && i.due >= from && i.due <= until) paid.push({id: 'fatura:' + c.id + ':' + i.month, title: 'Fatura ' + c.name, amount: i.total, date: i.due, kind: 'fatura', late: false, paid: true, invoice: i});
  }
  return [...open, ...paid].sort((a, b) => a.date.localeCompare(b.date));
}

export type HomeBriefData = {
  ready: boolean;
  capsules: ReturnType<typeof useCapsules>;
  packs: Pack[];
  timelinePacks: Pack[]; // 13/11/2026: tambem as entregues (a entrega fica na linha do tempo, marcada como feita)
  dues: Due[] | null; // null = Financas ainda sem dados neste aparelho
  left: {left: number; end: string} | null; // o que sobra depois de tudo pago (0.3.303)
  spend: {spent: number; available: number; pct: number} | null; // controle de gastos do mes (0.3.305)
  goal: GoalNumbers | null; // meta de guardar dinheiro, lida junto com o resto (0.3.306)
  money: Due[];
  fin: any; // dados de Financas (para "Paguei"/"Recebi" pela linha do tempo)
  reload: () => void; // contas a pagar, receitas a receber e faturas dos proximos dias, para a linha do tempo (0.3.311)
  loose: {total: number; count: number; cap: number; biggest: {title: string; amount: number} | null} | null; // despesas do mes fora as contas (0.3.308)
  mailNew: Entity[];
};

export function useHomeBriefData(api: SofiaApi, active: boolean): HomeBriefData {
  const capsules = useCapsules(api, active);
  // 0.3.302: encomendas lidas direto do servidor (o gancho de registros nao carregava fora do app Encomendas)
  const [pkgItems, setPkgItems] = useState<Entity[] | undefined>(undefined);
  const [dues, setDues] = useState<Due[] | null | undefined>(undefined), [left, setLeft] = useState<{left: number; end: string} | null>(null), [spend, setSpend] = useState<{spent: number; available: number; pct: number} | null>(null), [goal, setGoal] = useState<GoalNumbers | null>(null), [moneyDues, setMoneyDues] = useState<Due[]>([]), [fin, setFin] = useState<any>(null), [epoch, setEpoch] = useState(0), [loose, setLoose] = useState<{total: number; count: number; cap: number; biggest: {title: string; amount: number} | null} | null>(null);
  const [mailNew, setMailNew] = useState<Entity[] | undefined>(undefined);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let saved: any;
    void (async () => {
      try {
        // 0.3.293: guardado neste aparelho se houver; senao busca no servidor (antes o bloco ficava "Abra Financas")
        // 04/11/2026 (Pedro: "os blocos ja tem que aparecer logo de primeira"): no site abre com o retrato guardado (criptografado)
        // e atualiza com o servidor logo em seguida
        const apply = (bundle: any) => {
        const data = toData(bundle.items || {}, bundle.carry || {});
        const today = todayISO();
        setDues(manualDues((data as any).txs || [], '', today, 7).filter(d => !d.paid && d.kind !== 'receber'));
        try {setLeft(leftAfterBills(data as any, today));} catch {setLeft(null);}
        try {setSpend(spendControl(data as any, today));} catch {setSpend(null);}
        try {setLoose(looseSpending(data as any, today));} catch {setLoose(null);}
        setFin(data);
        try {setMoneyDues(timelineMoney((data as any).txs || [], (data as any).cards || [], today, 4));} catch {setMoneyDues([]);}
        // a mesma meta que Financas mostra (papel "reserve"); antes vinha de outra leitura, que podia chegar tarde ou nao chegar
        try {const r = reserveOf((data as any).goals || []); if (r && Number(r.target) > 0) {const sp = moneySplit(r, (data as any).moves || [], (data as any).accounts, (data as any).txs, (data as any).cards, today.slice(0, 7)); setGoal({name: r.name || 'Sua meta', saved: sp.saved, target: Number(r.target), monthly: sp.planned || 0, deadline: String(r.entity?.data?.deadline || ''), today});} else setGoal(null);} catch {setGoal(null);}
        };
        saved = epoch ? undefined : api.webPeek?.('finance-home');
        if (saved && saved.items) apply(saved);
        let bundle = epoch ? null : await readCache(api);
        if (!bundle || saved) {const month = (() => {const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');})(); /* mes local */ bundle = await loadAll(api, financeWindow(month, 'home')) || bundle; if (bundle) api.webKeep?.('finance-home', bundle);}
        if (!alive) return;
        if (!bundle) {if (!saved) setDues(null); return;}
        apply(bundle);
      } catch {if (alive && !saved) setDues(null);}
    })();
    void (async () => {
      try {
        const all: Entity[] = [];
        for (let o = 0; ; o += 100) {const r = await api.entities('package', '', o); all.push(...r.items); if (r.items.length < 100) break;}
        if (alive) setPkgItems(all);
      } catch {if (alive) setPkgItems([]);}
    })();
    void (async () => {
      try {
        const r = await api.entities('mail_hit', '', 0);
        if (alive) setMailNew(r.items.filter(h => h.state === 'new'));
      } catch {if (alive) setMailNew([]);}
    })();
    return () => {alive = false;};
  }, [api, active, epoch]);
  const timelinePacks = (pkgItems || []).filter(i => i.state !== 'archived').map(classify);
  const packs = timelinePacks.filter(x => x.e.state !== 'delivered' && !x.delivered);
  const ready = !!capsules.loaded && pkgItems !== undefined && dues !== undefined && mailNew !== undefined;
  return {ready, capsules, packs, timelinePacks, dues: dues ?? null, left, spend, goal, loose, money: moneyDues, fin, reload: () => setEpoch(e => e + 1), mailNew: mailNew || []};
}
