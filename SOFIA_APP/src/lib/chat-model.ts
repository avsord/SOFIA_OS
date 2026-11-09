import type { Message } from './types';
export function durationLabel(ms: number) {
  const seconds = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function initials(name: string) { return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || 'S'; }
export function dayKey(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function mergeMessages(current: Message[], incoming: Message[]) {
  const key = (m: Message) => m.role === 'user' && m.client_id ? 'client:' + m.client_id : m.id;
  const all = new Map(current.map(m => [key(m), m]));
  incoming.forEach(m => all.set(key(m), m));
  // 09/11/2026 (Pedro: "ta indo na ordem errada"): mensagem ainda saindo ("Enviando") fica sempre no fim; guardava a hora em que
  // foi escrita e aparecia antes de mensagens ja respondidas. Confirmada pelo servidor, vai para o lugar dela.
  const sending = (m: Message) => (m as any).status === 'sending';
  return [...all.values()].sort((a, b) => (sending(a) === sending(b) ? 0 : sending(a) ? 1 : -1) || Date.parse(a.created_at) - Date.parse(b.created_at) || (a.sequence || 0) - (b.sequence || 0));
}
export function statusLabel(status: string) {
  if (status === 'sending') return 'Enviando';
  if (status === 'failed') return 'Não concluída';
  if (status === 'pending') return 'Processando';
  return 'Recebida';
}
export function errorText(error: unknown) { return error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.'; }
