// 0.3.292 (Inicio novo, prototipo aprovado): os dados do "resumo de tudo" num lugar so. O Inicio espera este
// pacote ficar pronto junto com tarefas e agenda, e o esqueleto troca uma vez so, com tudo no lugar.
import {useEffect, useState} from 'react';
import type {SofiaApi} from './api';
import type {Entity} from './types';
import {useCapsules} from './capsule-store';
import {useWorkspaceRecords} from './workspace-records';
import {manualDues, todayISO, type Due} from './finance';
import {readCache, toData} from '../screens/finance/core';
import {classify, type Pack} from '../screens/PackagesApp';

export type HomeBriefData = {
  ready: boolean;
  capsules: ReturnType<typeof useCapsules>;
  packs: Pack[];
  dues: Due[] | null; // null = Financas ainda sem dados neste aparelho
  mailNew: Entity[];
};

export function useHomeBriefData(api: SofiaApi, active: boolean): HomeBriefData {
  const capsules = useCapsules(api, active);
  const pkgs = useWorkspaceRecords(api, 'package', '', true);
  const [dues, setDues] = useState<Due[] | null | undefined>(undefined);
  const [mailNew, setMailNew] = useState<Entity[] | undefined>(undefined);
  useEffect(() => {if (active) void pkgs.load();}, [active, api]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void (async () => {
      try {
        const bundle = await readCache(api);
        if (!alive) return;
        if (!bundle) {setDues(null); return;}
        const data = toData(bundle.items || {}, bundle.carry || {});
        const today = todayISO();
        setDues(manualDues((data as any).txs || [], '', today, 7).filter(d => !d.paid && d.kind !== 'receber'));
      } catch {if (alive) setDues(null);}
    })();
    void (async () => {
      try {
        const r = await api.entities('mail_hit', '', 0);
        if (alive) setMailNew(r.items.filter(h => h.state === 'new'));
      } catch {if (alive) setMailNew([]);}
    })();
    return () => {alive = false;};
  }, [api, active]);
  const packs = pkgs.items.filter(i => i.state !== 'archived' && i.state !== 'delivered').map(classify);
  const ready = !!capsules.loaded && (pkgs.loaded || !!pkgs.error) && dues !== undefined && mailNew !== undefined;
  return {ready, capsules, packs, dues: dues ?? null, mailNew: mailNew || []};
}
