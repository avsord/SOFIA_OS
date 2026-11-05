import type {Tab} from './types';
/** 0.3.260 (rodada premium, fase 2): endereco por tela no site. F5 mantem a tela, o voltar do navegador volta para a tela
 * anterior e da para favoritar ou abrir uma tela direto pelo link (ex.: /apps/financas). No app do celular nao faz nada. */
export const TAB_PATH: Record<Tab, string> = {home: '/inicio', chat: '/conversa', pages: '/paginas', agenda: '/agenda', apps: '/apps', notifications: '/avisos', profile: '/perfil'};
export const MODULE_SLUG: Record<string, string> = {capsules: 'rotina', routines: 'rotinas', reminders: 'lembretes', packages: 'encomendas', tasks: 'tarefas', lists: 'listas', library: 'biblioteca', monitor: 'price-tracker', finance: 'financas', mail: 'emails', knowledge: 'notas', all: 'registros'};
export const TAB_TITLE: Record<Tab, string> = {home: 'Início', chat: 'Conversa', pages: 'Páginas', agenda: 'Agenda', apps: 'Apps', notifications: 'Avisos', profile: 'Perfil'};
export const MODULE_TITLE: Record<string, string> = {capsules: 'Rotina', routines: 'Rotinas', reminders: 'Lembretes', packages: 'Encomendas', tasks: 'Tarefas', lists: 'Listas', library: 'Biblioteca', monitor: 'Price Tracker', finance: 'Finanças', mail: 'E-mails', knowledge: 'Notas', all: 'Todos os registros'};
export type Route = {tab: Tab; module: string};
export const isWeb = () => typeof window !== 'undefined' && typeof document !== 'undefined' && !!window.history;
export function routeToPath(r: Route): string { const base = TAB_PATH[r.tab] || '/inicio'; return r.tab === 'apps' && r.module && MODULE_SLUG[r.module] ? base + '/' + MODULE_SLUG[r.module] : base; }
export function pathToRoute(path: string): Route | null {
  const m = /^\/([a-z]+)(?:\/([A-Za-z0-9_-]+))?\/?$/.exec(path || '');
  if (!m) return null;
  const tab = (Object.keys(TAB_PATH) as Tab[]).find(t => TAB_PATH[t] === '/' + m[1]);
  if (!tab) return null;
  // 0.3.270: Capsulas virou Rotina; o endereco antigo /apps/capsulas continua abrindo
  const slug = m[2] === 'capsulas' || m[2] === 'rotinas' ? 'rotina' : m[2];
  const module = tab === 'apps' && slug ? Object.keys(MODULE_SLUG).find(k => MODULE_SLUG[k] === slug) || '' : '';
  return {tab, module};
}
export function routeTitle(r: Route, unread = 0): string { const name = r.tab === 'apps' && r.module ? MODULE_TITLE[r.module] || 'Apps' : TAB_TITLE[r.tab]; return (unread > 0 ? '(' + Math.min(unread, 99) + ') ' : '') + name + ' · Sofia'; }
/** 0.3.267: endereço de cada página (/paginas/<id>) para copiar link, F5 e voltar do navegador. */
export function pageIdFromPath(path: string): string { const m = /^\/paginas\/([A-Za-z0-9_-]{6,})\/?$/.exec(path || ''); return m ? m[1] : ''; }
export function pageUrlPath(id: string): string { return id ? '/paginas/' + id : '/paginas'; }
