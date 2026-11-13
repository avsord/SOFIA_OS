// 08/11/2026 (Pedro: "faz tudo" - entregas 2 e 3 do quadro): cartoes VIVOS de itens dos apps no Quadro. O cartao guarda so
// a ligacao (data.live = {kind, id}) e mostra o item de verdade do app; mudou no app, muda aqui. Tarefa e lembrete marcam
// feito pelo proprio cartao (e marca no app). Fontes: Agenda, Tarefas, Notas, Lembretes, Listas, Price Tracker, E-mails,
// Biblioteca. Na pagina vista como lista, o bloco e um 'bookmark' com o texto "Tarefa: ..." (nada se perde).
import {track, note as diagNote} from '../lib/board-diag';
import React, {useEffect, useState} from 'react';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {useTheme} from '../lib/theme';
import {Icon, type IconName} from './Icon';

const h = React.createElement as any;
export type LiveKind = 'event' | 'task' | 'note' | 'reminder' | 'list' | 'monitor' | 'mail' | 'library';
export type LiveItem = {id: string; kind: LiveKind; title: string; sub: string; done?: boolean; lines?: {text: string; done: boolean}[]; raw: any};
export const SOURCES: {id: LiveKind; label: string; one: string; icon: IconName}[] = [
  {id: 'event', label: 'Agenda', one: 'Compromisso', icon: 'calendar'}, {id: 'task', label: 'Tarefas', one: 'Tarefa', icon: 'checkSquare'},
  {id: 'note', label: 'Notas', one: 'Nota', icon: 'note'}, {id: 'reminder', label: 'Lembretes', one: 'Lembrete', icon: 'bell'},
  {id: 'list', label: 'Listas', one: 'Lista', icon: 'list'}, {id: 'monitor', label: 'Price Tracker', one: 'Preço', icon: 'tag'},
  {id: 'mail', label: 'E-mails', one: 'E-mail', icon: 'mail'}, {id: 'library', label: 'Biblioteca', one: 'Biblioteca', icon: 'book'}];
export const sourceOf = (k: string) => SOURCES.find(s => s.id === k) || SOURCES[0];

const when = (iso?: string | null) => {if (!iso) return ''; const d = new Date(iso); if (!Number.isFinite(d.getTime())) return ''; return d.toLocaleDateString('pt-BR', {weekday: 'short', day: '2-digit', month: 'short'}).replace('.', '') + (/T\d\d:\d\d/.test(iso) ? ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : '');};
const money = (v: any, cur = 'BRL') => {const n = Number(v); if (!Number.isFinite(n)) return ''; try {return n.toLocaleString('pt-BR', {style: 'currency', currency: cur || 'BRL'});} catch {return 'R$ ' + n.toFixed(2);}};
const month = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
async function all(api: SofiaApi, kind: string, max = 300) {const out: Entity[] = []; for (let o = 0; o < max; o += 100) {const r = await api.entities(kind, '', o); out.push(...r.items); if (r.items.length < 100) break;} return out;}

const cache = new Map<LiveKind, {at: number; items: LiveItem[]; p?: Promise<LiveItem[]>}>(), subs = new Set<() => void>();
export function bustLive(kind?: LiveKind) {if (kind) cache.delete(kind); else cache.clear(); subs.forEach(f => f());}
async function fetchSource(api: SofiaApi, kind: LiveKind): Promise<LiveItem[]> {
  if (kind === 'event') {const now = new Date(), next = new Date(now.getFullYear(), now.getMonth() + 1, 1); const rs = await Promise.all([api.agenda(month(now)), api.agenda(month(next))]); const seen = new Set<string>(), floor = Date.now() - 86400000;
    return rs.flatMap(r => r.items).filter(e => {if (seen.has(e.id)) return false; seen.add(e.id); return true;}).map(e => ({id: e.id, kind, title: e.title, sub: when(e.data?.start_at || e.data?.due_at), done: e.state === 'done', raw: e}))
      .sort((a, b) => String(a.raw.data?.start_at || a.raw.data?.due_at || '').localeCompare(String(b.raw.data?.start_at || b.raw.data?.due_at || ''))).filter(x => {const t = Date.parse(String(x.raw.data?.start_at || x.raw.data?.due_at || '')); return !Number.isFinite(t) || t >= floor;});}
  if (kind === 'task') return (await api.tasks()).items.map(t => ({id: t.id, kind, title: t.title, sub: when(t.due_at || t.start_at), done: t.state === 'done', raw: t}));
  if (kind === 'note') {const rs = (await Promise.all(['idea', 'annotation', 'lesson_learned'].map(k => all(api, k, 200)))).flat().filter(e => e.state !== 'archived' && !e.data?.enc_json);
    return rs.map(e => ({id: e.id, kind, title: e.title || String(e.content || '').split('\n')[0].slice(0, 80) || 'Nota', sub: String(e.content || '').replace(/\s+/g, ' ').slice(0, 160), raw: e}));}
  if (kind === 'reminder') return (await all(api, 'reminder')).filter(e => e.state !== 'archived').map(e => ({id: e.id, kind, title: e.title, sub: when(e.data?.remind_at) || String(e.data?.message || ''), done: e.state === 'done', raw: e}));
  if (kind === 'list') {const [cols, items] = await Promise.all([all(api, 'list_collection'), all(api, 'list_item', 600)]);
    return cols.filter(e => e.state !== 'archived').map(e => {const its = items.filter(i => String(i.data?.collection_id || '') === e.id && i.state !== 'archived'); return {id: e.id, kind, title: e.title, sub: its.length + (its.length === 1 ? ' item' : ' itens'), lines: its.slice(0, 12).map(i => ({text: i.title, done: i.state === 'done' || !!i.data?.in_cart})), raw: e};});}
  if (kind === 'monitor') {const [ms, obs] = await Promise.all([all(api, 'monitor'), api.monitorObservations().catch(() => ({items: {} as Record<string, any[]>}))]);
    return ms.filter(e => e.state !== 'archived').map(e => {const list = (obs.items || {})[e.id] || [], last = list[list.length - 1] || list[0], price = last ? (last.price ?? last.value ?? last.amount) : null;
      return {id: e.id, kind, title: e.title, sub: [price != null ? money(price, e.data?.currency) : '', e.data?.target_price ? 'alvo ' + money(e.data.target_price, e.data?.currency) : ''].filter(Boolean).join(' · ') || 'sem preço ainda', raw: e};});}
  if (kind === 'mail') return (await all(api, 'mail_hit', 200)).map(e => ({id: e.id, kind, title: e.title, sub: [e.data?.from_name || e.data?.from_addr, when(e.data?.received_at)].filter(Boolean).join(' · '), lines: e.data?.snippet ? [{text: String(e.data.snippet).slice(0, 200), done: false}] : [], raw: e}))
    .sort((a, b) => String(b.raw.data?.received_at || '').localeCompare(String(a.raw.data?.received_at || '')));
  return (await api.library()).items.filter(e => e.state !== 'archived').map(e => ({id: e.id, kind, title: e.title, sub: [e.data?.creator, e.data?.year, e.data?.status].filter(Boolean).join(' · '), raw: e}));
}
export function loadSource(api: SofiaApi, kind: LiveKind, fresh = false): Promise<LiveItem[]> {
  const c = cache.get(kind); if (c && !fresh && Date.now() - c.at < 60000) return c.p || Promise.resolve(c.items);
  const p = track('vivo-' + kind, () => fetchSource(api, kind)).then(items => {cache.set(kind, {at: Date.now(), items}); subs.forEach(f => f()); return items;}).catch(e => {cache.delete(kind); throw e;});
  cache.set(kind, {at: Date.now(), items: c?.items || [], p}); return p;
}
export function useLive(api: SofiaApi, kind: LiveKind, id: string) {
  const [, tick] = useState(0), [err, setErr] = useState('');
  useEffect(() => {const f = () => tick(x => x + 1); subs.add(f); loadSource(api, kind).catch(e => setErr(String(e?.message || 'Não deu para carregar.'))); const t = setInterval(() => {void loadSource(api, kind).catch(() => {});}, 65000); return () => {subs.delete(f); clearInterval(t);};}, [api, kind]);
  const c = cache.get(kind); return {item: c?.items.find(x => x.id === id), loading: !!c?.p && !c.items.length, err};
}
/** Texto do item para o bloco (busca, pagina vista como lista e pedir a Sofia). */
export const liveText = (x: LiveItem) => sourceOf(x.kind).one + ': ' + x.title + (x.sub ? ' — ' + x.sub : '');

export function LiveCard({api, kind, id, text}: {api: SofiaApi; kind: LiveKind; id: string; text: string}) {
  const c = useTheme(), s = sourceOf(kind), {item, loading, err} = useLive(api, kind, id), [busy, setBusy] = useState(false);
  const toggle = async () => {if (!item || busy) return; setBusy(true); try {
    if (kind === 'task') await api.taskState(item.raw, item.done ? 'todo' : 'done');
    else if (kind === 'reminder') await api.saveEntity({...item.raw, state: item.done ? 'active' : 'done', revision: item.raw.revision});
    bustLive(kind); await loadSource(api, kind, true);} catch (e) {diagNote('vivo-marcar', false, {kind, error: e}); /* o proximo carregamento mostra o estado real */} finally {setBusy(false);}};
  const canCheck = kind === 'task' || kind === 'reminder';
  return h('div', {style: {width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'hidden', borderRadius: 12, background: c.surface, border: '1px solid ' + c.line, display: 'flex', flexDirection: 'column'}},
    h('div', {style: {display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid ' + c.line}}, <Icon name={s.icon} size={15} color={c.accent} />,
      h('span', {style: {flex: 1, color: c.muted, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase'}}, s.one), h('span', {title: 'Atualiza sozinho com o app', style: {width: 7, height: 7, borderRadius: 4, background: item ? c.good : c.line}})),
    h('div', {style: {padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', flex: 1}},
      !item ? h('span', {style: {color: c.muted, fontSize: 13}}, loading ? 'Carregando…' : err ? err : (text || 'Item não encontrado') + (loading ? '' : ' (apagado no app?)')) : [
        h('div', {key: 't', style: {display: 'flex', alignItems: 'flex-start', gap: 8}},
          canCheck ? h('input', {type: 'checkbox', checked: !!item.done, disabled: busy, 'aria-label': item.done ? 'Desmarcar' : 'Marcar como feito', onPointerDown: (e: any) => e.stopPropagation(), onChange: () => void toggle(), style: {width: 16, height: 16, marginTop: 2, accentColor: c.accent}}) : null,
          h('span', {style: {flex: 1, color: c.text, fontSize: 16, fontWeight: 600, lineHeight: 1.35, textDecoration: item.done ? 'line-through' : 'none'}}, item.title || 'Sem título')),
        item.sub ? h('span', {key: 's', style: {color: c.muted, fontSize: 12, lineHeight: 1.4}}, item.sub) : null,
        ...(item.lines || []).map((l, i) => h('span', {key: 'l' + i, style: {color: l.done ? c.muted : c.text, fontSize: 12, textDecoration: l.done ? 'line-through' : 'none', whiteSpace: kind === 'mail' ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, (kind === 'list' ? '• ' : '') + l.text))]));
}

export function LivePicker({api, onPick, onClose}: {api: SofiaApi; onPick: (x: LiveItem) => void; onClose: () => void}) {
  const c = useTheme(), [src, setSrc] = useState<LiveKind>('task'), [items, setItems] = useState<LiveItem[] | null>(null), [err, setErr] = useState(''), [q, setQ] = useState('');
  useEffect(() => {let live = true; setItems(null); setErr(''); loadSource(api, src, true).then(r => {if (live) setItems(r);}).catch(e => {if (live) setErr(String(e?.message || 'Não deu para carregar.'));}); return () => {live = false;};}, [api, src]);
  useEffect(() => {const on = (e: KeyboardEvent) => {if (e.key === 'Escape') {e.preventDefault(); onClose();}}; window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);}, [onClose]);
  const list = (items || []).filter(x => !q || (x.title + ' ' + x.sub).toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  return h('div', {'data-board-ui': '1', onPointerDown: (e: any) => {e.stopPropagation(); if (e.target === e.currentTarget) onClose();}, style: {position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60}},
    h('div', {role: 'dialog', 'aria-label': 'Trazer item do app', 'data-testid': 'board-live-picker', style: {width: 640, maxWidth: 'calc(100% - 32px)', height: '72%', display: 'flex', flexDirection: 'column', gap: 12, padding: 20, boxSizing: 'border-box', borderRadius: 18, background: c.surface, border: '1px solid ' + c.line, boxShadow: '0 24px 60px rgba(0,0,0,.5)'}},
      h('div', {style: {color: c.text, fontSize: 18, fontWeight: 700}}, 'Trazer do app'),
      h('div', {style: {color: c.muted, fontSize: 12, lineHeight: 1.5}}, 'O cartão fica ligado ao item: mudou no app, muda no quadro. Tarefa e lembrete dá para marcar como feito ali mesmo.'),
      h('div', {role: 'tablist', style: {display: 'flex', flexWrap: 'wrap', gap: 6}}, ...SOURCES.map(s => h('button', {key: s.id, type: 'button', role: 'tab', 'aria-selected': src === s.id, 'data-testid': 'live-src-' + s.id, onClick: () => setSrc(s.id),
        style: {display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: src === s.id ? 700 : 500, border: '1px solid ' + (src === s.id ? c.accent : c.line), background: src === s.id ? c.accentSoft : 'transparent', color: src === s.id ? c.accent : c.text}}, <Icon name={s.icon} size={14} color={src === s.id ? c.accent : c.muted} />, s.label))),
      h('input', {value: q, onChange: (e: any) => setQ(e.target.value), placeholder: 'Buscar em ' + sourceOf(src).label, 'aria-label': 'Buscar', style: {height: 40, borderRadius: 9, border: '1px solid ' + c.line, background: c.input, color: c.text, padding: '0 12px', fontSize: 14, outline: 'none'}}),
      h('div', {style: {flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2}},
        err ? h('div', {style: {color: c.danger, fontSize: 13, padding: 10}}, err) : !items ? h('div', {style: {color: c.muted, fontSize: 13, padding: 10}}, 'Carregando…') : !list.length ? h('div', {style: {color: c.muted, fontSize: 13, padding: 10}}, 'Nada aqui.') :
          list.map(x => h('button', {key: x.id, type: 'button', 'data-testid': 'live-item', onClick: () => onPick(x), style: {textAlign: 'left', padding: '9px 12px', borderRadius: 10, border: 0, background: 'transparent', color: c.text, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2},
            onMouseEnter: (e: any) => {e.currentTarget.style.background = c.input;}, onMouseLeave: (e: any) => {e.currentTarget.style.background = 'transparent';}},
            h('span', {style: {fontSize: 14, fontWeight: 600, textDecoration: x.done ? 'line-through' : 'none'}}, x.title || 'Sem título'), x.sub ? h('span', {style: {fontSize: 12, color: c.muted}}, x.sub) : null)))));
}

/** Pedir a Sofia sobre os itens escolhidos no quadro: manda o conteudo deles e o pedido; a resposta volta como nota. */
export async function askSofiaAbout(api: SofiaApi, boardTitle: string, prompt: string, context: string): Promise<string> {
  const chat = await api.ensureChat(), id = chat.conversation?.id || (await api.newConversation('Quadro')).conversation.id; // sem conversa ainda: cria uma
  const message = 'Estou no quadro "' + (boardTitle || 'Sem título') + '" das Páginas do Sofia OS. ' + prompt.trim() + '\n\nItens selecionados no quadro:\n' + (context.trim() || '(nenhum texto)') +
    '\n\nResponda só com o texto para colocar numa nota do quadro, em markdown simples (# títulos, - listas), sem comentários antes ou depois.';
  const r = await api.chat({conversation_id: id, message, client_message_id: 'quadro-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)});
  const reply = String((r as any).reply || '').trim(); if (!reply) throw new Error('A Sofia não devolveu texto.'); return reply;
}
/** Markdown simples da resposta vira HTML da nota (titulo, lista, negrito). */
export function mdToHtml(md: string) {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (v: string) => esc(v).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
  return md.split('\n').map(l => {const t = l.trim(); if (/^#{1,6}\s/.test(t)) return '<b>' + inline(t.replace(/^#+\s/, '')) + '</b>'; if (/^[-*•]\s/.test(t)) return '• ' + inline(t.replace(/^[-*•]\s/, '')); return inline(l);}).join('<br>');
}
/** Titulo ja carregado de um item vivo (para a busca do quadro), sem pedir ao servidor. */
export function liveTitleNow(kind: string, id: string) {const it = cache.get(kind as LiveKind)?.items.find(x => x.id === id); return it ? liveText(it) : '';}
