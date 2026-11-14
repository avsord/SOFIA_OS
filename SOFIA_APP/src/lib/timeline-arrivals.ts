// 14/11/2026 (Pedro): ponto ao lado do Início quando chega a hora de um item da linha do tempo.
// Fica enquanto o item que chegou não for feito; evento (sem "feito") sai 5 min depois de começar.
// Quando chega outro item, o ponto passa a valer para ele.
export type Arrival = {at: number; until: number; title: string; color?: string};
let items: Arrival[] = [];
const subs = new Set<() => void>();

export function setTimelineTimes(list: Arrival[]) {items = list.filter(i => Number.isFinite(i.at)); subs.forEach(f => f());}
export function onTimelineTimes(f: () => void) {subs.add(f); return () => {subs.delete(f);};}

// item atual = o último que chegou (nas últimas 12 h); acende se ainda não acabou o prazo dele
export function currentArrival(now = Date.now(), list = items): Arrival | null {
  let cur: Arrival | null = null;
  for (const i of list) if (i.at <= now && now - i.at < 12 * 3600000 && (!cur || i.at > cur.at)) cur = i;
  return cur && now <= cur.until ? cur : null;
}
