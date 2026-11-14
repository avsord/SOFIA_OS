// 14/11/2026 (Pedro: "quando chegar um evento ou qualquer coisa da linha do tempo na hora, aparece um ponto ao lado do Início"):
// o Início publica os horários da linha do tempo; a barra lateral acende o ponto quando um deles chega com a pessoa fora do Início.
let times: number[] = [];
const KEY = 'sofia.home.seenAt';

export function setTimelineTimes(list: number[]) {times = list.filter(t => Number.isFinite(t));}

export function readSeenAt(): number {
  try {const v = Number(globalThis.localStorage?.getItem(KEY)); if (v > 0) return v;} catch {/* sem armazenamento */}
  return Date.now();
}

export function markHomeSeen(at = Date.now()) {try {globalThis.localStorage?.setItem(KEY, String(at));} catch {/* sem armazenamento */}}

// chegou = horário passou depois da última vez no Início (e ainda é recente: no máximo 12 h)
export function arrivedSince(seen: number, now = Date.now(), list = times): boolean {
  return list.some(t => t > seen && t <= now && now - t < 12 * 3600000);
}
