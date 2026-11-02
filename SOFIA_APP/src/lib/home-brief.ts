// 0.3.292 (Inicio novo, prototipo aprovado): os dados do "resumo de tudo" num lugar so. O Inicio espera este
// pacote ficar pronto junto com tarefas e agenda, e o esqueleto troca uma vez so, com tudo no lugar.
import {useEffect, useState} from 'react';
import type {SofiaApi} from './api';
import type {Entity} from './types';
import {useCapsules} from './capsule-store';
import {manualDues, todayISO, reserveOf, moneySplit, type Due} from './finance';
import type {GoalNumbers} from '../components/GoalProgress';
import {readCache, toData, loadAll, financeWindow} from '../screens/finance/core';
import {classify, type Pack} from '../screens/PackagesApp';
import {leftAfterBills, spendControl, looseSpending} from './finance-left';

export type HomeBriefData = {
  ready: boolean;
  capsules: ReturnType<typeof useCapsules>;
  packs: Pack[];
  dues: Due[] | null; // null = Financas ainda sem dados neste aparelho
  left: {left: number; end: string} | null; // o que sobra depois de tudo pago (0.3.303)
  spend: {spent: number; available: number; pct: number} | null; // controle de gastos do mes (0.3.305)
  goal: GoalNumbers | null; // meta de guardar dinheiro, lida junto com o resto (0.3.306)
  loose: {total: number; count: number; cap: number; biggest: {title: string; amount: number} | null} | null; // despesas do mes fora as contas (0.3.308)
  mailNew: Entity[];
};

export function useHomeBriefData(api: SofiaApi, active: boolean): HomeBriefData {
  const capsules = useCapsules(api, active);
  // 0.3.302: encomendas lidas direto do servidor (o gancho de registros nao carregava fora do app Encomendas)
  const [pkgItems, setPkgItems] = useState<Entity[] | undefined>(undefined);
  const [dues, setDues] = useState<Due[] | null | undefined>(undefined), [left, setLeft] = useState<{left: number; end: string} | null>(null), [spend, setSpend] = useState<{spent: number; available: number; pct: number} | null>(null), [goal, setGoal] = useState<GoalNumbers | null>(null), [loose, setLoose] = useState<{total: number; count: number; cap: number; biggest: {title: string; amount: number} | null} | null>(null);
  const [mailNew, setMailNew] = useState<Entity[] | undefined>(undefined);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void (async () => {
      try {
        // 0.3.293: guardado neste aparelho se houver; senao busca no servidor (antes o bloco ficava "Abra Financas")
        let bundle = await readCache(api);
        if (!bundle) {const month = new Date().toISOString().slice(0, 7); bundle = await loadAll(api, financeWindow(month, 'home'));}
        if (!alive) return;
        if (!bundle) {setDues(null); return;}
        const data = toData(bundle.items || {}, bundle.carry || {});
        const today = todayISO();
        setDues(manualDues((data as any).txs || [], '', today, 7).filter(d => !d.paid && d.kind !== 'receber'));
        try {setLeft(leftAfterBills(data as any, today));} catch {setLeft(null);}
        try {setSpend(spendControl(data as any, today));} catch {setSpend(null);}
        try {setLoose(looseSpending(data as any, today));} catch {setLoose(null);}
        // a mesma meta que Financas mostra (papel "reserve"); antes vinha de outra leitura, que podia chegar tarde ou nao chegar
        try {const r = reserveOf((data as any).goals || []); if (r && Number(r.target) > 0) {const sp = moneySplit(r, (data as any).moves || [], (data as any).accounts, (data as any).txs, (data as any).cards, today.slice(0, 7)); setGoal({name: r.name || 'Sua meta', saved: sp.saved, target: Number(r.target), monthly: sp.planned || 0, deadline: String(r.entity?.data?.deadline || ''), today});} else setGoal(null);} catch {setGoal(null);}
      } catch {if (alive) setDues(null);}
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
  }, [api, active]);
  const packs = (pkgItems || []).filter(i => i.state !== 'archived' && i.state !== 'delivered').map(classify).filter(x => !x.delivered);
  const ready = !!capsules.loaded && pkgItems !== undefined && dues !== undefined && mailNew !== undefined;
  return {ready, capsules, packs, dues: dues ?? null, left, spend, goal, loose, mailNew: mailNew || []};
}
