import {useLiveReload} from '../lib/live-reload';
import {dpx} from '../lib/content-width';
// 0.3.269 — Listas redesenhadas (protótipo aprovado em 31/10, docs/prototipos-2026-10-31/listas.html). Mesma tela no
// computador e no celular. Modelos: Mercado (secoes automaticas, soma do carrinho), Compras (grupos) e Simples.
// Dados: Mercado = shopping_item; Compras = purchase + purchase_group; listas criadas = list_collection + list_item.
// O cabecalho de Mercado/Compras (nome, icone, historico, lembrete) fica num list_collection com data.system.
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {LayoutAnimation, Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {useTheme} from '../lib/theme';
import {PALETTE} from '../lib/palette';
import {useDesktop} from '../lib/desktop';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {errorText} from '../lib/chat-model';
import {appAlert} from '../lib/app-alert';
import {Icon, type IconName} from '../components/Icon';
import {IconButton} from '../components/UI';
import {DateTimeField} from '../components/DateTimeField';
import {InternalBackGesture} from '../components/InternalBackGesture';
import {Presence} from '../components/Presence';
import {contextMenu} from '../components/ContextMenu';
import {AppFrame, NavTabs, Chip, Dialog, FieldRow, GhostButton, IconPicker, Input, Panel, PrimaryButton, SideItem, SideLabel, Stepper, brl, fold, moneyInput, numText, openMore, parseMoney, shareText, useToast, AppSkeleton} from '../components/AppKit';

export type Model = 'market' | 'shopping' | 'simple';
type ListDef = {id: string; name: string; icon: IconName; model: Model; meta: Entity | null; system?: 'market' | 'shopping'};
type Item = {id: string; e: Entity; list: string; name: string; qty: number; unit: string; price: number | null; section: string; group: string; store: string; url: string; note: string; done: boolean};
type Group = {id: string; e: Entity; name: string; color: string; budget: number | null; keywords: string; list: string};
export type HistEntry = {id: string; at: string; total: number | null; cat?: string; group?: string; tx?: string; items: {name: string; qty: number; unit: string; price: number | null}[]};

const MODELS: Record<Model, {name: string; icon: IconName; desc: string; ph: string}> = {
  market: {name: 'Mercado', icon: 'cart', desc: 'Separa por seção do mercado e soma o carrinho', ph: 'Adicionar… ex.: 2 leite, 1 kg tomate'},
  shopping: {name: 'Compras', icon: 'box', desc: 'Produtos com preço, loja e link, em grupos', ph: 'Nome do produto ou cole o link'},
  simple: {name: 'Simples', icon: 'checklist', desc: 'Só uma lista para ticar', ph: 'Adicionar item'},
};
const SECTIONS: [string, string[]][] = [
  ['Hortifruti', ['banana', 'tomate', 'alface', 'cebola', 'alho', 'batata', 'maca', 'limao', 'laranja', 'cenoura', 'abacate', 'mamao', 'morango', 'pepino', 'uva', 'abobrinha', 'brocolis', 'couve', 'cheiro verde', 'pimentao', 'melancia', 'abacaxi', 'manga', 'kiwi', 'beterraba', 'mandioca', 'gengibre']],
  ['Padaria', ['pao', 'bisnaguinha', 'bolo', 'torrada', 'croissant', 'baguete', 'rosca']],
  ['Laticínios', ['leite', 'queijo', 'iogurte', 'manteiga', 'requeijao', 'creme de leite', 'ovo', 'margarina', 'mussarela', 'presunto', 'nata']],
  ['Carnes', ['carne', 'frango', 'peixe', 'linguica', 'bacon', 'patinho', 'alcatra', 'picanha', 'file', 'costela', 'salsicha', 'atum', 'sardinha', 'hamburguer', 'peito']],
  ['Mercearia', ['arroz', 'feijao', 'macarrao', 'acucar', 'sal', 'oleo', 'azeite', 'farinha', 'cafe', 'molho', 'biscoito', 'bolacha', 'aveia', 'granola', 'cereal', 'milho', 'ervilha', 'tempero', 'vinagre', 'chocolate', 'achocolatado', 'fuba', 'lentilha', 'pipoca']],
  ['Bebidas', ['agua', 'suco', 'refrigerante', 'cerveja', 'vinho', 'cha', 'energetico', 'coca', 'guarana', 'kombucha']],
  ['Congelados', ['sorvete', 'congelado', 'pizza', 'lasanha', 'nugget', 'gelo', 'polpa']],
  ['Limpeza', ['detergente', 'sabao', 'amaciante', 'desinfetante', 'agua sanitaria', 'esponja', 'saco de lixo', 'papel toalha', 'limpador', 'alcool', 'multiuso', 'vassoura', 'pano']],
  ['Higiene', ['shampoo', 'condicionador', 'sabonete', 'pasta de dente', 'creme dental', 'escova', 'papel higienico', 'desodorante', 'fio dental', 'absorvente', 'barbeador', 'algodao', 'cotonete']],
  ['Farmácia', ['remedio', 'vitamina', 'dipirona', 'paracetamol', 'curativo', 'band-aid', 'protetor solar', 'soro']],
];
export const SECTION_ORDER = ['Hortifruti', 'Padaria', 'Laticínios', 'Carnes', 'Mercearia', 'Bebidas', 'Congelados', 'Limpeza', 'Higiene', 'Farmácia', 'Outros'];
export function sectionOf(name: string) { const k = fold(name); for (const [s, w] of SECTIONS) if (w.some(x => new RegExp('(^|\\s)' + x).test(k))) return s; return 'Outros'; }
const GROUP_WORDS: Record<string, string[]> = {
  pc: ['placa', 'fonte', 'ssd', 'hd', 'memoria', 'ram', 'processador', 'gabinete', 'monitor', 'teclado', 'mouse', 'cooler', 'gpu', 'suporte', 'headset', 'webcam', 'cabo', 'nvme', 'water cooler'],
  roupa: ['camisa', 'camiseta', 'calca', 'tenis', 'jaqueta', 'meia', 'bermuda', 'moletom', 'blusa', 'vestido', 'cueca', 'sapato', 'bone', 'cinto'],
  farmacia: ['vitamina', 'remedio', 'protetor', 'dipirona', 'creatina', 'whey', 'colageno', 'omega', 'suplemento'],
  casa: ['luminaria', 'tapete', 'cortina', 'travesseiro', 'lencol', 'toalha', 'panela', 'prato', 'copo', 'organizador'],
};
const GROUP_COLORS = [PALETTE.lilac, PALETTE.blue, PALETTE.green, PALETTE.amber, PALETTE.pink, PALETTE.teal, PALETTE.orange];

/** "2 leite", "1 kg tomate", "café 24,90", "leite 2", "#pc fonte", link */
export function parseEntry(raw0: string): {name: string; qty: number; unit: string; price: number | null; url: string; tag: string} {
  let raw = raw0.trim(), tag = '';
  const t = raw.match(/(^|\s)#(\S+)/); if (t) { tag = t[2]; raw = raw.replace(t[0], ' ').trim(); }
  if (/^(https?:\/\/|www\.)\S+$/i.test(raw)) return {name: '', qty: 1, unit: '', price: null, url: raw.startsWith('http') ? raw : 'https://' + raw, tag};
  let s = raw, qty = 1, unit = '', price: number | null = null;
  const pm = s.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})\s*$/i) || s.match(/r\$\s*(\d+(?:[.,]\d{1,2})?)/i);
  if (pm) { price = parseMoney(pm[1]); s = s.replace(pm[0], '').trim(); }
  const U = '(kg|g|l|ml|un|cx|pct|dz|lata|latas|garrafa|garrafas|pacote|pacotes|caixa|caixas|unidades?)';
  const qm = s.match(new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*(?:' + U + '\\b)?\\s*(?:x\\s+)?(?:de\\s+)?(.+)$', 'i'));
  if (qm) { qty = Number(qm[1].replace(',', '.')); unit = (qm[2] || '').toLowerCase(); s = qm[3]; }
  else { const q2 = s.match(new RegExp('^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(?:' + U + '\\b)?$', 'i')); if (q2) { s = q2[1]; qty = Number(q2[2].replace(',', '.')); unit = (q2[3] || '').toLowerCase(); } }
  if (/^unidades?$|^un$/.test(unit)) unit = '';
  s = s.trim(); return {name: s ? s.charAt(0).toUpperCase() + s.slice(1) : '', qty: qty > 0 ? qty : 1, unit, price, url: '', tag};
}
/** quantidade antiga em texto ("2 kg") -> numero + unidade */
function splitQty(q: unknown, unit: unknown): {qty: number; unit: string} {
  if (typeof q === 'number') return {qty: q > 0 ? q : 1, unit: String(unit || '')};
  const m = String(q || '').trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  return m ? {qty: Number(m[1].replace(',', '.')) || 1, unit: String(unit || m[2] || '').trim()} : {qty: 1, unit: String(unit || '')};
}
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export function readHistory(meta: Entity | null): HistEntry[] { try { const v = JSON.parse(String(meta?.data?.history_json || '[]')); return Array.isArray(v) ? v : []; } catch { return []; } }
const fmtWhen = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString('pt-BR', {weekday: 'short', day: '2-digit', month: 'short'}).replace('.', '') + ' às ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}); };
async function listAll(api: SofiaApi, kind: string) { const all: Entity[] = []; for (let o = 0; ; o += 100) { const r = await api.entities(kind, '', o); all.push(...r.items); if (r.items.length < 100) break; } return all; }
const KIND: Record<Model, string> = {market: 'shopping_item', shopping: 'purchase', simple: 'list_item'};
const listKindOf = (l: ListDef) => l.system === 'market' ? 'shopping_item' : l.system === 'shopping' ? 'purchase' : 'list_item';

export function Lists({api, active, onBack}: {api: SofiaApi; active: boolean; onBack: () => void}) {
  const c = useTheme(), desktop = useDesktop(), {toast, toastNode} = useToast();
  const [data, setData] = useState<Record<string, Entity[]> | null>(null), [error, setError] = useState('');
  const [cur, setCur] = useState('market'), [gfilter, setGfilter] = useState('all'), [folded, setFolded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null), [histOpen, setHistOpen] = useState(false), [histRow, setHistRow] = useState(-1);
  const [dialog, setDialog] = useState<null | {type: 'newList' | 'editList' | 'group' | 'finish' | 'remind'; group?: Group | null; gid?: string}>(null);
  const [q, setQ] = useState(''), [busyLink, setBusyLink] = useState(false), [flash, setFlash] = useState(''), inputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    try {
      const kinds = ['shopping_item', 'purchase', 'purchase_group', 'list_collection', 'list_item'];
      const got = await Promise.all(kinds.map(k => listAll(api, k)));
      setData(Object.fromEntries(kinds.map((k, i) => [k, got[i]]))); setError('');
    } catch (e) { setError(errorText(e)); setData(d => d || {shopping_item: [], purchase: [], purchase_group: [], list_collection: [], list_item: []}); }
  }, [api]);
  useEffect(() => { if (active) void load(); }, [active, load]);
  useLiveReload(load, active); // 0.3.285: o que mudar no celular aparece aqui sem recarregar a pagina (e vice-versa)
  useEffect(() => { if (!active) { setOpenId(null); setHistOpen(false); setDialog(null); } }, [active]);
  const patchLocal = (e: Entity) => setData(d => d ? {...d, [e.kind!]: (d[e.kind!] || []).some(x => x.id === e.id) ? d[e.kind!].map(x => x.id === e.id ? e : x) : [...(d[e.kind!] || []), e]} : d);
  const dropLocal = (e: Entity) => setData(d => d ? {...d, [e.kind!]: (d[e.kind!] || []).filter(x => x.id !== e.id)} : d);

  /* ---------- modelo ---------- */
  const D = data || {};
  const metaOf = (sys: string) => (D.list_collection || []).find(x => x.state !== 'archived' && x.data?.system === sys) || null;
  const itemsAll: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const e of D.shopping_item || []) if (e.state === 'needed') { const q2 = splitQty(e.data?.quantity, e.data?.unit); out.push({id: e.id, e, list: 'market', name: e.title, ...q2, price: typeof e.data?.price === 'number' ? e.data.price : null, section: String(e.data?.section || '') || (e.data?.list === 'pharmacy' ? 'Farmácia' : sectionOf(e.title)), group: '', store: '', url: '', note: String(e.content || ''), done: !!e.data?.in_cart}); }
    for (const e of D.purchase || []) if (e.state === 'planned' || e.state === 'interest') { const q2 = splitQty(e.data?.quantity, e.data?.unit); const p = typeof e.data?.price === 'number' ? e.data.price : typeof e.data?.target_price === 'number' ? e.data.target_price : null; out.push({id: e.id, e, list: 'shopping', name: e.title, ...q2, price: p, section: '', group: String(e.data?.purchase_group_id || ''), store: String(e.data?.store || ''), url: String(e.data?.url || ''), note: String(e.content || ''), done: !!e.data?.in_cart}); }
    const cols = new Set((D.list_collection || []).filter(x => x.state !== 'archived' && !x.data?.system).map(x => x.id));
    for (const e of D.list_item || []) if ((e.state === 'needed' || e.state === 'done') && cols.has(String(e.data?.collection_id || ''))) { const q2 = splitQty(e.data?.quantity, e.data?.unit); out.push({id: e.id, e, list: String(e.data.collection_id), name: e.title, ...q2, price: typeof e.data?.price === 'number' ? e.data.price : null, section: String(e.data?.section || '') || sectionOf(e.title), group: String(e.data?.group_id || ''), store: String(e.data?.store || ''), url: String(e.data?.url || ''), note: String(e.data?.notes || e.content || ''), done: !!e.data?.in_cart || e.state === 'done'}); }
    return out;
  }, [D.shopping_item, D.purchase, D.list_item, D.list_collection]);
  const lists: ListDef[] = useMemo(() => {
    const mk = metaOf('market'), sh = metaOf('shopping');
    const custom = (D.list_collection || []).filter(x => x.state !== 'archived' && !x.data?.system)
      // a lista "Pessoal" de exemplo sai quando esta vazia (pedido do Pedro); com itens ela continua
      .filter(x => !(fold(x.title) === 'pessoal' && !itemsAll.some(i => i.list === x.id)))
      .sort((a, b) => (Number(a.data?.position) || 0) - (Number(b.data?.position) || 0) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
    return [
      {id: 'market', name: mk?.title || 'Mercado', icon: (mk?.data?.icon as IconName) || 'cart', model: 'market' as Model, meta: mk, system: 'market' as const},
      {id: 'shopping', name: sh?.title || 'Compras', icon: (sh?.data?.icon as IconName) || 'box', model: 'shopping' as Model, meta: sh, system: 'shopping' as const},
      ...custom.map(x => ({id: x.id, name: x.title, icon: (x.data?.icon as IconName) || MODELS[(x.data?.template as Model) || 'simple'].icon, model: ((x.data?.template as Model) || 'simple'), meta: x})),
    ];
  }, [D.list_collection, itemsAll]);
  const L = lists.find(l => l.id === cur) || lists[0];
  const groups: Group[] = useMemo(() => (D.purchase_group || []).filter(g => g.state !== 'archived').map((g, i) => ({id: g.id, e: g, name: g.title, color: String(g.data?.color || '') || GROUP_COLORS[i % GROUP_COLORS.length], budget: typeof g.data?.budget === 'number' ? g.data.budget : null, keywords: String(g.data?.keywords || ''), list: String(g.data?.collection_id || '') || 'shopping'})), [D.purchase_group]);
  const myGroups = groups.filter(g => g.list === L.id);
  const mine = itemsAll.filter(i => i.list === L.id);
  const view = L.model === 'shopping' && gfilter !== 'all' ? mine.filter(i => (i.group || 'none') === gfilter) : mine;
  const todo = view.filter(i => !i.done), done = view.filter(i => i.done);
  const gname = (id: string) => id === 'none' ? 'Sem grupo' : myGroups.find(g => g.id === id)?.name || 'Sem grupo';
  const open = itemsAll.find(i => i.id === openId) || null;
  const history = readHistory(L.meta);
  useEffect(() => { if (gfilter !== 'all' && gfilter !== 'none' && !myGroups.some(g => g.id === gfilter)) setGfilter('all'); }, [gfilter, myGroups]);

  /* ---------- gravar ---------- */
  async function save(e: Partial<Entity>, quiet = false): Promise<Entity | null> {
    try { const saved = await api.saveEntity(e); patchLocal(saved); return saved; }
    catch (err) { if (!quiet) toast(errorText(err)); void load(); return null; }
  }
  async function ensureMeta(l: ListDef): Promise<Entity | null> {
    if (l.meta) return l.meta;
    return save({kind: 'list_collection', title: l.name, content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {system: l.system, icon: l.icon, template: l.model}});
  }
  function itemData(l: ListDef, it: {qty: number; unit: string; price: number | null; section?: string; group?: string; store?: string; url?: string; done?: boolean; note?: string}, base: Record<string, any> = {}) {
    const k = listKindOf(l);
    if (k === 'shopping_item') return {...base, list: base.list || 'market', quantity: numText(it.qty), unit: it.unit, price: it.price ?? '', section: it.section || '', in_cart: !!it.done};
    if (k === 'purchase') return {...base, quantity: it.qty, unit: it.unit, price: it.price ?? '', store: it.store ?? base.store ?? '', url: it.url ?? base.url ?? '', purchase_group_id: it.group ?? base.purchase_group_id ?? '', in_cart: !!it.done};
    return {...base, collection_id: l.id, quantity: numText(it.qty), unit: it.unit, price: it.price ?? '', section: it.section || '', group_id: it.group || '', store: it.store || '', url: it.url || '', notes: it.note ?? base.notes ?? '', in_cart: !!it.done};
  }
  async function updateItem(it: Item, patch: Partial<Item>) {
    const n = {...it, ...patch}, l = lists.find(x => x.id === it.list) || L;
    const body: Partial<Entity> = {...it.e, title: (n.name || it.name).slice(0, 240), data: itemData(l, n, it.e.data || {}), revision: it.e.revision};
    if (listKindOf(l) !== 'list_item') body.content = n.note;
    if (listKindOf(l) === 'list_item' && it.e.state === 'done' && !n.done) body.state = 'needed';
    patchLocal(body as Entity); await save(body, true);
  }
  async function createItem(l: ListDef, it: {name: string; qty: number; unit: string; price: number | null; section?: string; group?: string; store?: string; url?: string; note?: string}) {
    const kind = listKindOf(l), state = kind === 'purchase' ? 'planned' : 'needed';
    return save({kind, title: it.name.slice(0, 240), content: kind === 'list_item' ? '' : it.note || '', area: 'Pessoal', privacy: 'private', state, tags: [], data: itemData(l, {...it, done: false})});
  }
  function guessGroup(name: string, tag: string, store: string): string {
    if (tag) { const t = fold(tag); const f = myGroups.find(g => fold(g.name).startsWith(t) || t.startsWith(fold(g.name))); if (f) return f.id; return 'new:' + tag.charAt(0).toUpperCase() + tag.slice(1); }
    if (gfilter !== 'all' && gfilter !== 'none') return gfilter;
    const s = fold(store); if (s) { const f = myGroups.find(g => s.includes(fold(g.name)) || fold(g.name).includes(s)); if (f) return f.id; }
    const n = fold(name);
    for (const g of myGroups) { const kw = [...(GROUP_WORDS[fold(g.name).replace(/\s/g, '')] || []), ...g.keywords.split(',').map(fold).filter(Boolean)]; if (kw.some(w => n.includes(w))) return g.id; }
    return '';
  }
  async function newGroup(name: string, budget: number | null, keywords = '') {
    return save({kind: 'purchase_group', title: name.slice(0, 120), content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {color: GROUP_COLORS[myGroups.length % GROUP_COLORS.length], budget: budget ?? '', keywords, collection_id: L.id === 'shopping' ? '' : L.id}});
  }
  async function add(raw: string) {
    const p = parseEntry(raw); if (!p.url && !p.name) return;
    let it = {name: p.name, qty: p.qty, unit: p.unit, price: L.model === 'simple' ? null : p.price, section: L.model === 'market' ? sectionOf(p.name) : '', group: '', store: '', url: '', note: ''};
    if (p.url) {
      setBusyLink(true);
      try { const r = await api.linkPreview(p.url); it = {...it, name: r.title || 'Produto de ' + r.site, price: L.model === 'simple' ? null : r.price, store: r.site, url: r.url, section: L.model === 'market' ? sectionOf(r.title) : ''}; }
      catch { it = {...it, name: 'Link', url: p.url}; } finally { setBusyLink(false); }
    } else {
      const dup = mine.find(i => !i.done && fold(i.name) === fold(p.name));
      if (dup) { await updateItem(dup, {qty: Math.round((dup.qty + p.qty) * 100) / 100, price: p.price ?? dup.price}); setFlash(dup.id); toast('Já estava na lista: somei na quantidade.'); return; }
    }
    if (L.model === 'shopping') { const g = guessGroup(it.name, p.tag, it.store); if (g.startsWith('new:')) { const ng = await newGroup(g.slice(4), null); it.group = ng?.id || ''; } else it.group = g; }
    const saved = await createItem(L, it);
    if (saved) { setFlash(saved.id); if (L.model === 'shopping' && gfilter === 'all') toast('Adicionado em ' + gname(it.group || 'none') + '.', [{label: 'Abrir grupo', run: () => setGfilter(it.group || 'none')}]); else if (p.url) toast(it.price != null ? 'Adicionado com o preço de ' + it.store + '.' : 'Adicionado. O site não mostrou o preço; dá para pôr no item.'); }
  }
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(''), 900); return () => clearTimeout(t); }, [flash]);
  async function toggle(it: Item) { if (Platform.OS !== 'web') try { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); } catch { /* sem animacao */ } await updateItem(it, {done: !it.done}); }
  async function removeItem(it: Item) {
    setOpenId(null); dropLocal(it.e);
    try { await api.deleteEntity(it.id); toast('Item apagado.', [{label: 'Desfazer', run: () => { const {id: _i, revision: _r, ...rest} = it.e as any; void save(rest); }}]); } catch (e) { toast(errorText(e)); void load(); }
  }
  async function moveItem(it: Item, to: ListDef) {
    const created = await createItem(to, {...it, section: to.model === 'market' ? sectionOf(it.name) : it.section, group: ''});
    if (!created) return; setOpenId(null); dropLocal(it.e); await api.deleteEntity(it.id).catch(() => {});
    toast('Movido para ' + to.name + '.');
  }

  /* ---------- finalizar, historico, lembrete ---------- */
  async function finish(gid: string | null, value: number | null, cat: string, launch: boolean) {
    const ticked = mine.filter(i => i.done && (!gid || (i.group || 'none') === gid)); if (!ticked.length) return;
    const meta = await ensureMeta(L); if (!meta) return;
    const total = L.model === 'simple' ? null : value ?? ticked.reduce((s, i) => s + (i.price || 0), 0);
    let tx = '';
    if (launch && total) {
      try {
        const accounts = (await api.entities('fin_account')).items.filter(a => a.state !== 'archived');
        if (!accounts.length) toast('Crie primeiro uma conta em Finanças para lançar.');
        else { const t = await api.saveEntity({kind: 'fin_tx', title: (gid ? gname(gid) : L.name).slice(0, 200), content: 'Compra finalizada em Listas', area: 'Pessoal', state: 'active', privacy: 'private', tags: [], data: {kind: 'expense', amount: total, date: today(), category: cat || 'Compras', account_id: accounts[0].id, paid: true, recurrence: 'none'}}); tx = t.id; }
      } catch (e) { toast(errorText(e)); }
    }
    const entry: HistEntry = {id: String(Date.now()), at: new Date().toISOString(), total, cat, group: gid ? gname(gid) : '', tx, items: ticked.map(i => ({name: i.name, qty: i.qty, unit: i.unit, price: i.price}))};
    const prev = readHistory(meta);
    await save({...meta, data: {...meta.data, history_json: JSON.stringify([entry, ...prev].slice(0, 200))}, revision: meta.revision}, true);
    const kind = listKindOf(L), before = ticked.map(i => i.e);
    for (const i of ticked) {
      const d = {...(i.e.data || {}), in_cart: false};
      if (kind === 'list_item') await save({...i.e, state: 'archived', data: d, revision: i.e.revision}, true);
      else await save({...i.e, state: 'purchased', data: {...d, purchased_on: today(), paid_price: i.price ?? ''}, revision: i.e.revision}, true);
    }
    setDialog(null);
    toast(L.model === 'simple' ? 'Lista concluída e guardada no histórico.' : tx ? 'Compra de ' + brl(total) + ' no histórico e lançada em Finanças.' : 'Compra salva no histórico.', [{label: 'Desfazer', run: () => void (async () => {
      for (const e of before) { const cur2 = (await api.entities(e.kind!, '', 0).catch(() => ({items: [] as Entity[]}))).items.find(x => x.id === e.id); await save({...e, revision: cur2?.revision ?? e.revision}, true); }
      const m2 = metaOf(L.system || '') || (D.list_collection || []).find(x => x.id === meta.id) || meta; await save({...m2, data: {...m2.data, history_json: JSON.stringify(readHistory(m2).filter(h => h.id !== entry.id))}, revision: m2.revision}, true);
      if (tx) await api.deleteEntity(tx).catch(() => {});
      void load();
    })()}]);
  }
  async function repeat(h: HistEntry) {
    let n = 0;
    for (const x of h.items) { if (mine.some(i => !i.done && fold(i.name) === fold(x.name))) continue; await createItem(L, {name: x.name, qty: x.qty, unit: x.unit, price: x.price, section: L.model === 'market' ? sectionOf(x.name) : ''}); n++; }
    setHistOpen(false); toast(n ? n + (n > 1 ? ' itens voltaram' : ' item voltou') + ' para a lista.' : 'Todos esses itens já estão na lista.');
  }
  async function clearHistory() {
    const meta = L.meta; if (!meta) return; const old = meta.data?.history_json || '';
    await save({...meta, data: {...meta.data, history_json: ''}, revision: meta.revision});
    toast('Histórico apagado.', [{label: 'Desfazer', run: () => { const m = (D.list_collection || []).find(x => x.id === meta.id) || meta; void save({...m, data: {...m.data, history_json: old}, revision: m.revision}); }}]);
  }
  async function deleteList() {
    if (L.system) return;
    const meta = L.meta!; setCur('market');
    await save({...meta, state: 'archived', revision: meta.revision});
    toast('Lista "' + L.name + '" excluída.', [{label: 'Desfazer', run: () => { const m = (D.list_collection || []).find(x => x.id === meta.id) || meta; void save({...m, state: 'active', revision: m.revision}).then(() => setCur(meta.id)); }}]);
  }
  async function setReminder(when: string, agenda: boolean) {
    const meta = await ensureMeta(L); if (!meta) return;
    const [oldRem, oldTask] = String(meta.data?.remind_ref || '').split('|');
    if (oldRem) await api.deleteEntity(oldRem).catch(() => {});
    if (oldTask) await api.deleteTask(oldTask).catch(() => {});
    if (!when) { await save({...meta, data: {...meta.data, remind_at: '', remind_agenda: false, remind_ref: ''}, revision: meta.revision}); setDialog(null); toast('Lembrete removido.'); return; }
    const title = 'Ir ' + (L.model === 'market' ? 'ao mercado' : 'às compras') + (L.model === 'market' ? '' : ': ' + L.name);
    const rem = await save({kind: 'reminder', title, content: 'Abre a lista ' + L.name + ' em Listas.', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {remind_at: new Date(when).toISOString(), message: '', location: ''}});
    let taskId = '';
    if (agenda) { try { const t = await api.saveTask({title, state: 'scheduled', due_at: new Date(when).toISOString()}); taskId = t.item.id; } catch (e) { toast(errorText(e)); } }
    await save({...meta, data: {...meta.data, remind_at: new Date(when).toISOString(), remind_agenda: agenda, remind_ref: (rem?.id || '') + '|' + taskId}, revision: meta.revision});
    setDialog(null); toast('Lembrete criado para ' + fmtWhen(new Date(when).toISOString()) + (agenda ? ', também na Agenda.' : '.'));
  }
  async function share() {
    const lines = [L.name + (L.model === 'shopping' && gfilter !== 'all' ? ' · ' + gname(gfilter) : ''), ...view.map(i => (i.done ? '☑ ' : '☐ ') + (i.qty !== 1 || i.unit ? numText(i.qty) + (i.unit ? ' ' + i.unit : '') + ' ' : '') + i.name + (i.price != null && L.model !== 'simple' ? ' — ' + brl(i.price) : ''))];
    try { const r = await shareText(L.name, lines.join('\n')); if (r === 'copied') toast('Lista copiada. É só colar onde quiser.'); } catch { /* cancelado */ }
  }
  const moreItems = () => [
    {label: 'Compartilhar', icon: 'link' as IconName, run: () => void share()},
    {label: 'Editar lista', icon: 'edit' as IconName, run: () => setDialog({type: 'editList'})},
    {label: 'Apagar histórico', icon: 'history' as IconName, run: () => appAlert('Apagar o histórico?', 'As compras guardadas de ' + L.name + ' somem do histórico.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Apagar', style: 'destructive', onPress: () => void clearHistory()}])},
    ...(L.system ? [] : [{label: 'Excluir lista', icon: 'trash' as IconName, danger: true, run: () => appAlert('Excluir a lista?', '"' + L.name + '" e os itens dela saem de Listas. Dá para desfazer logo depois.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Excluir', style: 'destructive', onPress: () => void deleteList()}])}]),
  ];

  /* ---------- pedacos da tela ---------- */
  const sum = (a: Item[]) => a.reduce((s, i) => s + (i.price || 0), 0);
  const choose = (id: string, g = 'all') => { setCur(id); setGfilter(g); setOpenId(null); setHistOpen(false); };
  const sidebar = <>
    <SideLabel>Listas</SideLabel>
    {lists.map(l => {
      const n = itemsAll.filter(i => i.list === l.id && !i.done).length;
      if (l.model !== 'shopping') return <SideItem key={l.id} testID={'list-nav-' + l.id} icon={l.icon} label={l.name} count={n} selected={L.id === l.id} onPress={() => choose(l.id)} leading={<View style={{width: 14}} />} />;
      const gs = groups.filter(g => g.list === l.id), its = itemsAll.filter(i => i.list === l.id), showNone = its.some(i => !i.group);
      return <View key={l.id}>
        <SideItem testID={'list-nav-' + l.id} icon={l.icon} label={l.name} count={n} selected={L.id === l.id && gfilter === 'all'} onPress={() => choose(l.id)}
          leading={<Pressable accessibilityRole="button" accessibilityLabel={folded ? 'Mostrar grupos' : 'Recolher grupos'} onPress={() => setFolded(f => !f)} hitSlop={6} style={{width: 14, alignItems: 'center'}}><View style={{...({transitionProperty: 'transform', transitionDuration: '160ms'} as any), transform: [{rotate: folded ? '0deg' : '90deg'}]}}><Icon name="chevron" size={12} color={c.muted} /></View></Pressable>} />
        {folded ? null : <>
          {[...gs.map(g => ({id: g.id, name: g.name, color: g.color})), ...(showNone ? [{id: 'none', name: 'Sem grupo', color: c.line}] : [])].map(g => {
            const gi = its.filter(i => (i.group || 'none') === g.id), cart = gi.some(i => i.done);
            return <SideItem key={g.id} sub dot={g.color} label={g.name} count={gi.filter(i => !i.done).length} selected={L.id === l.id && gfilter === g.id} onPress={() => choose(l.id, g.id)}
              trailing={cart ? <View accessibilityLabel="Tem item no carrinho"><Icon name="cart" size={13} color={PALETTE.green} /></View> : null} />;
          })}
          <Pressable accessibilityRole="button" onPress={() => { choose(l.id); setDialog({type: 'group', group: null}); }} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30, paddingLeft: 30, borderRadius: 9, backgroundColor: hovered ? c.line + '80' : 'transparent'})}><Icon name="plus" size={13} color={c.muted} /><Text style={{color: c.muted, fontSize: 12}}>Novo grupo</Text></Pressable>
        </>}
      </View>;
    })}
    <View style={{height: 1, backgroundColor: c.line, marginVertical: 10, marginHorizontal: 10}} />
    <SideItem icon="plus" label="Nova lista" onPress={() => setDialog({type: 'newList'})} leading={<View style={{width: 14}} />} />
  </>;
  const mobileNav = <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{flexGrow: 0}} contentContainerStyle={{gap: 8, paddingHorizontal: 16, paddingVertical: 10}}>
    {lists.map(l => <Chip key={l.id} icon={l.icon} label={l.name} count={itemsAll.filter(i => i.list === l.id && !i.done).length || undefined} selected={L.id === l.id} onPress={() => choose(l.id)} />)}
    <Chip icon="plus" label="Nova lista" dashed onPress={() => setDialog({type: 'newList'})} />
  </ScrollView>;

  function Row({it, first}: {it: Item; first?: boolean}) {
    const meta: string[] = []; if (L.model === 'shopping' || L.model !== 'market' && it.store) { if (it.store) meta.push(it.store); if (it.url) meta.push('link'); }
    if (it.note) meta.push(it.note.length > 40 ? it.note.slice(0, 40) + '…' : it.note);
    return <View testID={'list-row-' + it.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderTopWidth: first ? 0 : 1, borderColor: c.line, backgroundColor: flash === it.id ? c.accentSoft : 'transparent', ...({transitionProperty: 'background-color', transitionDuration: '400ms'} as any)}}
      {...contextMenu(() => [{label: 'Abrir', icon: 'edit', run: () => setOpenId(it.id)}, {label: it.done ? 'Desmarcar' : 'Marcar', icon: 'check', run: () => void toggle(it)}, {label: 'Apagar', icon: 'trash', danger: true, run: () => void removeItem(it)}])}>
      <Pressable testID={'list-check-' + it.id} accessibilityRole="checkbox" accessibilityState={{checked: it.done}} accessibilityLabel={(it.done ? 'Desmarcar ' : 'Marcar ') + it.name} onPress={() => void toggle(it)} hitSlop={8}
        style={{width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: it.done ? c.muted : c.muted + '99', backgroundColor: it.done ? c.line : 'transparent', alignItems: 'center', justifyContent: 'center'}}>{it.done ? <Icon name="check" size={12} color={c.text} weight="bold" /> : null}</Pressable>
      {L.model !== 'simple' && (it.qty !== 1 || it.unit) ? <Text style={{color: c.accent, fontSize: 12, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, backgroundColor: c.accentSoft}}>{numText(it.qty)}{it.unit ? ' ' + it.unit : ''}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={'Abrir ' + it.name} onPress={() => setOpenId(it.id)} style={{flex: 1, minWidth: 0, gap: 1}}>
        <Text numberOfLines={1} style={{color: it.done ? c.muted : c.text, fontSize: 14, textDecorationLine: it.done ? 'line-through' : 'none'}}>{it.name}</Text>
        {meta.length ? <Text numberOfLines={1} style={{color: c.muted, fontSize: 12}}>{meta.join(' · ')}</Text> : null}
      </Pressable>
      {it.price != null && L.model !== 'simple' ? <Text style={{color: it.done ? c.muted : c.text, fontSize: 14, fontVariant: ['tabular-nums']}}>{brl(it.price)}</Text> : null}
    </View>;
  }
  const Section = ({title, items, icon}: {title: string; items: Item[]; icon?: IconName}) => <View style={{gap: 6}}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4}}>{icon ? <Icon name={icon} size={13} color={c.muted} /> : null}<Text style={{color: c.muted, fontSize: 12, fontWeight: '700'}}>{title}</Text><Text style={{color: c.muted, fontSize: 12}}>{items.length}</Text></View>
    <View style={{borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: 'hidden'}}>{items.map((i, k) => <Row key={i.id} it={i} first={!k} />)}</View>
  </View>;
  function GroupSummary({gid}: {gid: string}) {
    const arr = mine.filter(i => (i.group || 'none') === gid), grp = myGroups.find(g => g.id === gid), a = sum(arr.filter(i => !i.done)), b = sum(arr.filter(i => i.done)), tot = a + b;
    const cell = (label: string, v: React.ReactNode) => <View style={{gap: 2}}><Text style={{color: c.muted, fontSize: 12}}>{label}</Text>{v}</View>;
    return <View testID="group-summary" style={{gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}>
      <View style={{flexDirection: 'row', gap: 28}}>
        {cell('Para comprar', <Text style={{color: c.text, fontSize: 16, fontWeight: '700'}}>{brl(a)}</Text>)}
        {cell('No carrinho', <Text style={{color: c.text, fontSize: 16, fontWeight: '700'}}>{brl(b)}</Text>)}
        {grp ? cell('Orçamento', grp.budget ? <Text style={{color: tot > grp.budget ? c.danger : c.text, fontSize: 16, fontWeight: '700'}}>{brl(grp.budget)}</Text> : <Pressable accessibilityRole="button" onPress={() => setDialog({type: 'group', group: grp})}><Text style={{color: c.accent, fontSize: 14, fontWeight: '600'}}>Definir</Text></Pressable>) : null}
      </View>
      {grp?.budget ? <><View style={{height: 6, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden'}}><View style={{width: (Math.min(100, tot / grp.budget * 100) + '%') as any, height: 6, backgroundColor: tot > grp.budget ? c.danger : PALETTE.green}} /></View><Text style={{color: c.muted, fontSize: 12}}>{tot > grp.budget ? 'Passou ' + brl(tot - grp.budget) + ' do orçamento' : 'Faltam ' + brl(grp.budget - tot) + ' para o orçamento'}</Text></> : null}
    </View>;
  }
  function GroupCards() {
    const keys = [...myGroups.map(g => g.id), ...(mine.some(i => !i.group) ? ['none'] : [])];
    return <View style={{gap: 10}}>
      {!myGroups.length ? <Text style={{color: c.muted, fontSize: 13}}>Separe as compras em grupos (ex.: PC, Roupa, Farmácia) ou só adicione itens no campo acima.</Text> : null}
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
        {keys.map(k => { const arr = mine.filter(i => (i.group || 'none') === k), t = arr.filter(i => !i.done), d = arr.filter(i => i.done), grp = myGroups.find(g => g.id === k), s = sum(arr);
          return <Pressable key={k} testID={'group-card-' + k} accessibilityRole="button" accessibilityLabel={'Abrir grupo ' + gname(k)} onPress={() => setGfilter(k)}
            style={({hovered}: any) => ({width: desktop ? 228 : '100%' as any, gap: 8, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: hovered ? c.accent + '66' : c.line, backgroundColor: c.surface})}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><View style={{width: 9, height: 9, borderRadius: 3, backgroundColor: grp?.color || c.line}} /><Text numberOfLines={1} style={{flex: 1, color: c.text, fontWeight: '600', fontSize: 14}}>{gname(k)}</Text><Icon name="chevron" size={14} color={c.muted} /></View>
            <Text style={{color: c.muted, fontSize: 12}}>{t.length ? t.length + ' para comprar' : 'Nada pendente'}{d.length ? ' · ' + d.length + ' no carrinho' : ''}</Text>
            <View style={{height: 5, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden'}}>{grp?.budget ? <View style={{width: (Math.min(100, s / grp.budget * 100) + '%') as any, height: 5, backgroundColor: s > grp.budget ? c.danger : PALETTE.green}} /> : null}</View>
            <Text style={{color: c.text, fontSize: 14, fontWeight: '600'}}>{brl(s) || 'R$ 0,00'}{grp?.budget ? <Text style={{color: c.muted, fontWeight: '400', fontSize: 12}}> de {brl(grp.budget)}</Text> : null}</Text>
          </Pressable>; })}
        <Pressable accessibilityRole="button" onPress={() => setDialog({type: 'group', group: null})} style={({hovered}: any) => ({width: desktop ? 228 : '100%' as any, minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: hovered ? c.accent : c.line})}><Icon name="plus" size={18} color={c.muted} /><Text style={{color: c.muted, fontSize: 13}}>Novo grupo</Text></Pressable>
      </View>
    </View>;
  }
  const inGroup = L.model === 'shopping' && gfilter !== 'all';
  let body: React.ReactNode;
  if (L.model === 'shopping' && !inGroup) body = <GroupCards />;
  else if (!view.length) body = <Text style={{color: c.muted, fontSize: 14, paddingVertical: 20, textAlign: 'center'}}>{inGroup ? 'Nada em ' + gname(gfilter) + ' ainda. Escreva no campo acima e aperte Enter.' : 'Lista vazia. Escreva no campo acima e aperte Enter.'}</Text>;
  else {
    const parts: React.ReactNode[] = [];
    if (inGroup) parts.push(<GroupSummary key="sum" gid={gfilter} />);
    if (L.model === 'market' && todo.length) { const g: Record<string, Item[]> = {}; todo.forEach(i => { (g[i.section || 'Outros'] = g[i.section || 'Outros'] || []).push(i); }); Object.keys(g).sort((a, b) => (SECTION_ORDER.indexOf(a) + 99) % 99 - (SECTION_ORDER.indexOf(b) + 99) % 99).forEach(k => parts.push(<Section key={k} title={k} items={g[k]} />)); }
    else if (todo.length) parts.push(<View key="todo" style={{borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: 'hidden'}}>{todo.map((i, k) => <Row key={i.id} it={i} first={!k} />)}</View>);
    else parts.push(<Text key="all" style={{color: c.muted, fontSize: 13, textAlign: 'center', paddingVertical: 8}}>{L.model === 'simple' ? 'Tudo feito. Conclua a lista para guardar no histórico.' : 'Tudo no carrinho. Finalize para guardar no histórico.'}</Text>);
    // "No carrinho" / "Feitos" sempre aberta, sem botao de abrir/fechar (pedido do Pedro)
    if (done.length) parts.push(<Section key="done" title={L.model === 'simple' ? 'Feitos' : 'No carrinho'} items={done} />);
    body = parts;
  }
  const p = q.trim() ? parseEntry(q) : null, dupe = p && !p.url && mine.find(i => !i.done && fold(i.name) === fold(p.name));
  const hint = p ? [p.url ? 'Link: vou buscar nome, preço e loja' : '', !p.url && L.model !== 'simple' && (p.qty !== 1 || p.unit) ? 'Qtd ' + numText(p.qty) + (p.unit ? ' ' + p.unit : '') : '', !p.url && L.model === 'market' && p.name ? sectionOf(p.name) : '', p.price != null && L.model !== 'simple' ? brl(p.price) : '', L.model === 'shopping' && (p.name || p.url) ? (() => { const g = guessGroup(p.name, p.tag, ''); return g.startsWith('new:') ? 'Novo grupo ' + g.slice(4) : g ? 'Grupo ' + gname(g) : 'Sem grupo'; })() : ''].filter(Boolean) : [];
  const header = <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
    {!desktop ? <IconButton name="back" label={inGroup ? 'Voltar para ' + L.name : 'Voltar aos apps'} onPress={() => inGroup ? setGfilter('all') : onBack()} /> : inGroup ? <IconButton name="back" label={'Voltar para ' + L.name} onPress={() => setGfilter('all')} /> : null}
    <View style={{flex: 1, minWidth: 0}}>
      <Text accessibilityRole="header" numberOfLines={1} style={{color: c.text, fontSize: 28, fontWeight: '600', letterSpacing: -1, flexShrink: 1}}>Listas</Text>{/* 07/11/2026 (revisao + desenho aprovado: "titulo = nome do app, sempre; nunca o nome do item aberto") */}
      {desktop ? <Text testID="lists-current" numberOfLines={1} style={{color: c.text, fontSize: 16, fontWeight: '600', marginTop: 2}}>{inGroup ? gname(gfilter) : L.name}</Text> : null}
      {desktop ? <Text style={{color: c.muted, fontSize: 14, marginTop: 4}}>{(() => { /* 0.3.275: a frase da Sofia no lugar dos numeros emendados */
        const open = (L.model === 'shopping' && !inGroup ? mine : todo).filter(i => !i.done), tot = open.reduce((s, i) => s + (i.price || 0), 0);
        if (!open.length) return done.length ? 'Tudo no carrinho. É só finalizar a compra.' : 'Nada na lista ainda.'; // 07/11 (revisao): a instrucao ja aparece no meio da tela (antes repetia, com "abaixo" e "acima")
        if (L.model === 'simple') return open.length === 1 ? 'Falta uma coisa: ' + open[0].name + '.' : 'Faltam ' + open.length + ' coisas; a primeira é ' + open[0].name + '.';
        return (open.length === 1 ? 'Falta comprar ' + open[0].name : 'Faltam ' + open.length + ' itens') + (tot ? ', uns ' + brl(tot) + ' no total.' : '.') + (done.length ? ' ' + done.length + ' já ' + (done.length === 1 ? 'está' : 'estão') + ' no carrinho.' : '');
      })()}</Text> : <Text style={{color: c.muted, fontSize: 13}}>{L.model === 'shopping' && !inGroup ? myGroups.length + (myGroups.length === 1 ? ' grupo' : ' grupos') + ' · ' + mine.filter(i => !i.done).length + ' para comprar' : todo.length + (todo.length === 1 ? ' item ' : ' itens ') + (L.model === 'simple' ? 'a fazer' : 'para comprar') + (done.length ? ' · ' + done.length + (done.length === 1 ? ' ticado' : ' ticados') : '')}</Text>}
    </View>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
      {inGroup && gfilter !== 'none' ? <GhostButton icon="edit" label={desktop ? 'Editar grupo' : undefined} onPress={() => setDialog({type: 'group', group: myGroups.find(g => g.id === gfilter) || null})} /> : null}
      {L.model === 'market' ? <GhostButton testID="list-remind" icon={L.meta?.data?.remind_at ? (L.meta?.data?.remind_agenda ? 'calendar' : 'check') : 'bell'} on={!!L.meta?.data?.remind_at} label={desktop ? (L.meta?.data?.remind_at ? 'Lembrete ' + fmtWhen(String(L.meta.data.remind_at)) : 'Lembrar de ir') : undefined} onPress={() => setDialog({type: 'remind'})} /> : null}
      <GhostButton testID="list-history" icon="history" label={desktop ? 'Histórico' + (history.length ? ' ' + history.length : '') : undefined} onPress={() => { setHistRow(-1); setHistOpen(true); }} />
      <GhostButton testID="list-more" icon="more" onPress={e => openMore(e, L.name, moreItems())} />
    </View>
  </View>;
  const ticked = (inGroup ? view : L.model === 'shopping' ? mine : view).filter(i => i.done);
  const footer = (L.model === 'shopping' && !inGroup && !mine.some(i => i.done)) || !view.length /* 07/11/2026 (revisao): sem totais de R$ 0,00 com a lista vazia */ ? null : <View testID="list-footer" style={desktop ? {flexDirection: 'row', alignItems: 'center', gap: 24, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface} : {flexDirection: 'row', alignItems: 'center', gap: 24, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderColor: c.line, backgroundColor: c.surface}}>
    {L.model === 'simple'
      ? <View style={{flex: 1}}><Text style={{color: c.muted, fontSize: 12}}>Feitos</Text><Text style={{color: c.text, fontSize: 16, fontWeight: '700'}}>{done.length} de {view.length}</Text></View>
      : <View style={{flex: 1, flexDirection: 'row', gap: 24}}>
          <View><Text style={{color: c.muted, fontSize: 12}}>{L.model === 'shopping' && !inGroup ? 'Total de todos os grupos' : 'Total estimado'}</Text><Text style={{color: c.text, fontSize: 16, fontWeight: '700'}}>{brl(sum(L.model === 'shopping' && !inGroup ? mine : view)) || 'R$ 0,00'}</Text></View>
          <View><Text style={{color: c.muted, fontSize: 12}}>No carrinho</Text><Text style={{color: c.text, fontSize: 16, fontWeight: '700'}}>{brl(sum(ticked)) || 'R$ 0,00'}</Text></View>
        </View>}
    {L.model === 'shopping' && !inGroup ? null : <PrimaryButton testID="list-finish" icon={L.model === 'simple' ? 'check' : 'wallet'} label={L.model === 'simple' ? 'Concluir lista' : inGroup ? 'Finalizar compra de ' + gname(gfilter) : 'Finalizar compra'} disabled={!ticked.length} onPress={() => setDialog({type: 'finish', gid: inGroup ? gfilter : undefined})} />}
  </View>;

  if (!data) return <AppSkeleton label="Carregando listas…" />;
  return <InternalBackGesture enabled={active && !openId && !histOpen && !dialog} onBack={() => inGroup ? setGfilter('all') : onBack()}>
    <View testID="lists-screen" style={{flex: 1}}>
      <AppFrame tabsOnTop sidebar={sidebar} footer={desktop ? undefined : footer}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{...(desktop ? {paddingLeft: dpx(40), paddingRight: dpx(40), paddingTop: dpx(32), maxWidth: 1160, width: '100%', alignSelf: 'flex-start'} : {paddingHorizontal: 16, paddingTop: 6}) as any, paddingBottom: 40, maxWidth: desktop ? 800 : undefined, width: '100%'}}>
          {header}
          {/* 03/11/2026 (desenho 31): no celular as listas ficam EMBAIXO do titulo (antes ficavam acima dele) */}
          {desktop ? <NavTabs nav={mobileNav} /> : <View style={{marginHorizontal: -16, marginTop: 6}}>{mobileNav}</View>}
          {error ? <Text style={{color: c.danger, marginTop: 10}}>{error}</Text> : null}
          <View style={{marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}>
            <Icon name="plus" size={16} color={c.muted} />
            <TextInput ref={inputRef} testID="list-add" accessibilityLabel="Adicionar item" value={q} onChangeText={setQ} placeholder={inGroup && gfilter !== 'none' ? 'Adicionar em ' + gname(gfilter) + ': nome ou link' : L.model === 'shopping' ? 'Nome do produto ou link: o app escolhe o grupo' : MODELS[L.model].ph} placeholderTextColor={c.muted}
              onSubmitEditing={() => { const v = q.trim(); if (!v) return; setQ(''); void add(v).then(() => inputRef.current?.focus()); }} submitBehavior="submit" returnKeyType="done" style={{flex: 1, color: c.text, fontSize: 14, paddingVertical: 13}} />
            {busyLink ? <Text style={{color: c.muted, fontSize: 12}}>Lendo o link…</Text> : null}
          </View>
          {hint.length ? <View style={{flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8}}>{hint.map(h => <Text key={h} style={{color: c.accent, fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: c.accentSoft}}>{h}</Text>)}<Text style={{color: c.muted, fontSize: 12}}>{dupe ? 'Já está na lista: Enter soma na quantidade' : 'Enter para adicionar'}</Text></View> : null}
          {/* 20 px entre o campo de adicionar e a primeira secao ("deixa com espaco"); o resto compacto */}
          <View style={{marginTop: 20, gap: 14}}>{body}</View>
          {/* 0.3.285 (site): o total e o Finalizar ficam logo abaixo da lista, num cartao na coluna (antes uma barra colada no pe da janela) */}
          {desktop && footer ? <View style={{marginTop: 16}}>{footer}</View> : null}
        </ScrollView>
      </AppFrame>
      {toastNode}
      <Presence>{open ? <ItemPanel key={open.id} it={open} l={lists.find(x => x.id === open.list) || L} groups={groups.filter(g => g.list === open.list)} lists={lists} onClose={() => setOpenId(null)} onChange={pt => void updateItem(open, pt)} onDelete={() => void removeItem(open)} onMove={to => void moveItem(open, to)} /> : null}</Presence>
      <Panel visible={histOpen} onClose={() => setHistOpen(false)} title={'Histórico · ' + L.name} testID="list-history-panel">
        {history.length ? <>
          <View style={{flexDirection: 'row', gap: 28}}><View><Text style={{color: c.muted, fontSize: 12}}>{L.model === 'simple' ? 'Concluídas' : 'Compras'}</Text><Text style={{color: c.text, fontSize: 16, fontWeight: '700'}}>{history.length}</Text></View>{L.model === 'simple' ? null : <View><Text style={{color: c.muted, fontSize: 12}}>Média por compra</Text><Text style={{color: c.text, fontSize: 16, fontWeight: '700'}}>{brl(history.reduce((s, h) => s + (h.total || 0), 0) / history.length)}</Text></View>}</View>
          {history.map((h, i) => <View key={h.id} style={{borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: 'hidden'}}>
            <Pressable accessibilityRole="button" accessibilityState={{expanded: histRow === i}} onPress={() => setHistRow(histRow === i ? -1 : i)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12}}>
              <View style={{flex: 1}}><Text style={{color: c.text, fontWeight: '600'}}>{fmtWhen(h.at)}</Text><Text style={{color: c.muted, fontSize: 12}}>{h.items.length} {h.items.length > 1 ? 'itens' : 'item'}{h.group ? ' · ' + h.group : ''}{h.tx ? ' · lançada em Finanças' : ''}</Text></View>
              {h.total != null ? <Text style={{color: c.text, fontWeight: '600'}}>{brl(h.total)}</Text> : null}
              <View style={{transform: [{rotate: histRow === i ? '90deg' : '0deg'}]}}><Icon name="chevron" size={14} color={c.muted} /></View>
            </Pressable>
            {histRow === i ? <View style={{borderTopWidth: 1, borderColor: c.line, padding: 12, gap: 6}}>
              {h.items.map((x, k) => <View key={k} style={{flexDirection: 'row', gap: 8}}><Text style={{color: c.muted, width: 56}}>{x.qty !== 1 || x.unit ? numText(x.qty) + (x.unit ? ' ' + x.unit : '') : ''}</Text><Text style={{flex: 1, color: c.text}}>{x.name}</Text>{x.price != null ? <Text style={{color: c.muted}}>{brl(x.price)}</Text> : null}</View>)}
              <View style={{alignSelf: 'flex-start', marginTop: 6}}><GhostButton icon="repeat" label="Repetir esta lista" onPress={() => void repeat(h)} /></View>
            </View> : null}
          </View>)}
        </> : <Text style={{color: c.muted}}>{L.model === 'simple' ? 'As listas concluídas aparecem aqui, com data e itens.' : 'As compras finalizadas aparecem aqui, com data, hora, itens e valor.'}</Text>}
      </Panel>
      <Presence>{dialog?.type === 'newList' || dialog?.type === 'editList' ? <ListDialog edit={dialog.type === 'editList' ? L : null} onClose={() => setDialog(null)} onSave={async (name, icon, model) => {
        if (dialog.type === 'editList') { const meta = await ensureMeta(L); if (meta) await save({...meta, title: name, data: {...meta.data, icon}, revision: meta.revision}); setDialog(null); return; }
        const created = await save({kind: 'list_collection', title: name, content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {icon, template: model, position: lists.length}});
        setDialog(null); if (created) { choose(created.id); setTimeout(() => inputRef.current?.focus(), 200); }
      }} /> : null}</Presence>
      <Presence>{dialog?.type === 'group' ? <GroupDialog group={dialog.group || null} onClose={() => setDialog(null)} onSave={async (name, budget, keywords) => {
        const g = dialog.group;
        if (g) await save({...g.e, title: name, data: {...g.e.data, budget: budget ?? '', keywords}, revision: g.e.revision});
        else { const ng = await newGroup(name, budget, keywords); if (ng) setGfilter(ng.id); }
        setDialog(null);
      }} onDelete={dialog.group ? () => { const g = dialog.group!, moved = mine.filter(i => i.group === g.id); setDialog(null); setGfilter('all');
        void (async () => { for (const i of moved) await updateItem(i, {group: ''}); await save({...g.e, state: 'archived', revision: g.e.revision}); toast('Grupo apagado' + (moved.length ? ', ' + moved.length + (moved.length > 1 ? ' itens foram' : ' item foi') + ' para Sem grupo' : '') + '.', [{label: 'Desfazer', run: () => void (async () => { const cur2 = (D.purchase_group || []).find(x => x.id === g.id) || g.e; await save({...cur2, state: 'active', revision: cur2.revision}); for (const i of moved) await updateItem({...i, e: (D[i.e.kind!] || []).find(x => x.id === i.id) || i.e}, {group: g.id}); })()}]); })(); } : undefined} /> : null}</Presence>
      <Presence>{dialog?.type === 'finish' ? <FinishDialog model={L.model} name={dialog.gid ? gname(dialog.gid) : L.name} count={mine.filter(i => i.done && (!dialog.gid || (i.group || 'none') === dialog.gid)).length} pending={mine.filter(i => !i.done && (!dialog.gid || (i.group || 'none') === dialog.gid)).length} total={sum(mine.filter(i => i.done && (!dialog.gid || (i.group || 'none') === dialog.gid)))} cats={dialog.gid && dialog.gid !== 'none' ? [gname(dialog.gid), 'Casa', 'Tecnologia', 'Outros'] : L.model === 'market' ? ['Mercado', 'Casa', 'Outros'] : ['Compras', 'Casa', 'Tecnologia', 'Outros']} onClose={() => setDialog(null)} onFinish={(v, cat, launch) => void finish(dialog.gid || null, v, cat, launch)} /> : null}</Presence>
      <Presence>{dialog?.type === 'remind' ? <RemindDialog current={String(L.meta?.data?.remind_at || '')} agenda={!!L.meta?.data?.remind_agenda} onClose={() => setDialog(null)} onSave={(w, a) => void setReminder(w, a)} /> : null}</Presence>
    </View>
  </InternalBackGesture>;
}

function ItemPanel({it, l, groups, lists, onClose, onChange, onDelete, onMove}: {it: Item; l: ListDef; groups: Group[]; lists: ListDef[]; onClose: () => void; onChange: (p: Partial<Item>) => void; onDelete: () => void; onMove: (to: ListDef) => void}) {
  const c = useTheme(), [name, setName] = useState(it.name), [price, setPrice] = useState(moneyInput(it.price)), [note, setNote] = useState(it.note), [store, setStore] = useState(it.store), [url, setUrl] = useState(it.url);
  const commit = (p: Partial<Item>) => onChange(p);
  return <Panel visible onClose={onClose} testID="list-item-panel" title={<TextInput accessibilityLabel="Nome do item" value={name} onChangeText={setName} onBlur={() => name.trim() && name.trim() !== it.name && commit({name: name.trim()})} style={{color: c.text, fontSize: 18, fontWeight: '600', paddingVertical: 4}} />}>
    {l.model !== 'simple' ? <FieldRow label="Quantidade"><Stepper value={it.qty} onChange={qty => commit({qty})} unit={it.unit} onUnit={unit => commit({unit})} /></FieldRow> : null}
    {l.model !== 'simple' ? <FieldRow label="Preço"><Input accessibilityLabel="Preço total" value={price} onChangeText={setPrice} onBlur={() => commit({price: parseMoney(price)})} placeholder="0,00 (valor total)" keyboardType="decimal-pad" /></FieldRow> : null}
    {l.model === 'market' ? <FieldRow label="Seção" top><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{SECTION_ORDER.map(s => <Chip key={s} label={s} selected={it.section === s} onPress={() => commit({section: s})} />)}</View></FieldRow> : null}
    {l.model === 'shopping' ? <FieldRow label="Grupo" top><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}><Chip label="Sem grupo" selected={!it.group} onPress={() => commit({group: ''})} />{groups.map(g => <Chip key={g.id} dot={g.color} label={g.name} selected={it.group === g.id} onPress={() => commit({group: g.id})} />)}</View></FieldRow> : null}
    {l.model === 'shopping' ? <FieldRow label="Loja"><Input value={store} onChangeText={setStore} onBlur={() => commit({store: store.trim()})} placeholder="Ex.: KaBuM!" /></FieldRow> : null}
    {l.model === 'shopping' ? <FieldRow label="Link"><Input value={url} onChangeText={setUrl} onBlur={() => commit({url: url.trim()})} placeholder="https://" autoCapitalize="none" /></FieldRow> : null}
    <FieldRow label="Anotação" top><Input value={note} onChangeText={setNote} onBlur={() => commit({note})} placeholder="Marca, tamanho, detalhe…" multiline style={{minHeight: 70, textAlignVertical: 'top'}} /></FieldRow>
    {lists.filter(x => x.id !== it.list).length ? <FieldRow label="Mover para" top><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{lists.filter(x => x.id !== it.list).map(x => <Chip key={x.id} icon={x.icon} label={x.name} onPress={() => onMove(x)} />)}</View></FieldRow> : null}
    <Pressable accessibilityRole="button" onPress={onDelete} style={{alignSelf: 'flex-start', paddingVertical: 8}}><Text style={{color: c.danger, fontWeight: '500'}}>Apagar item</Text></Pressable>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}><Icon name="check" size={13} color={c.muted} /><Text style={{color: c.muted, fontSize: 12}}>Salvo automaticamente</Text></View>
  </Panel>;
}
function ListDialog({edit, onClose, onSave}: {edit: ListDef | null; onClose: () => void; onSave: (name: string, icon: IconName, model: Model) => void}) {
  const c = useTheme(), [name, setName] = useState(edit?.name || ''), [model, setModel] = useState<Model>(edit?.model || 'simple'), [icon, setIcon] = useState<IconName>(edit?.icon || MODELS.simple.icon), [touched, setTouched] = useState(!!edit);
  const go = () => { if (name.trim()) onSave(name.trim().slice(0, 80), icon, model); };
  return <Dialog visible onClose={onClose} title={edit ? 'Editar lista' : 'Nova lista'} footer={<><GhostButton label="Cancelar" onPress={onClose} /><PrimaryButton label={edit ? 'Salvar' : 'Criar lista'} disabled={!name.trim()} onPress={go} /></>}>
    <Input autoFocus accessibilityLabel="Nome da lista" value={name} onChangeText={setName} onSubmitEditing={go} placeholder="Ex.: Viagem, Festa, Farmácia" />
    {edit ? null : <View style={{gap: 6}}>{(Object.keys(MODELS) as Model[]).map(m => <Pressable key={m} accessibilityRole="radio" accessibilityState={{selected: model === m}} onPress={() => { setModel(m); if (!touched) setIcon(MODELS[m].icon); }} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 11, borderWidth: 1, borderColor: model === m ? c.accent : c.line, backgroundColor: model === m ? c.accentSoft : c.surface}}><Icon name={MODELS[m].icon} size={18} color={model === m ? c.accent : c.text} /><View style={{flex: 1}}><Text style={{color: c.text, fontWeight: '600'}}>{MODELS[m].name}</Text><Text style={{color: c.muted, fontSize: 12}}>{MODELS[m].desc}</Text></View></Pressable>)}</View>}
    <Text style={{color: c.muted, fontSize: 12}}>Ícone</Text>
    <IconPicker value={icon} onChange={v => { setIcon(v); setTouched(true); }} />
  </Dialog>;
}
function GroupDialog({group, onClose, onSave, onDelete}: {group: Group | null; onClose: () => void; onSave: (name: string, budget: number | null, keywords: string) => void; onDelete?: () => void}) {
  const c = useTheme(), [name, setName] = useState(group?.name || ''), [bud, setBud] = useState(moneyInput(group?.budget ?? null)), [kw, setKw] = useState(group?.keywords || '');
  const go = () => { if (name.trim()) onSave(name.trim(), parseMoney(bud), kw.trim()); };
  return <Dialog visible onClose={onClose} title={group ? 'Editar grupo' : 'Novo grupo'} footer={<>{onDelete ? <Pressable accessibilityRole="button" onPress={onDelete} style={{marginRight: 'auto', justifyContent: 'center'}}><Text style={{color: c.danger}}>Apagar grupo</Text></Pressable> : null}<GhostButton label="Cancelar" onPress={onClose} /><PrimaryButton label="Salvar" disabled={!name.trim()} onPress={go} /></>}>
    <FieldRow label="Nome"><Input autoFocus value={name} onChangeText={setName} onSubmitEditing={go} placeholder="Ex.: PC, Roupa, Farmácia" /></FieldRow>
    <FieldRow label="Orçamento"><Input value={bud} onChangeText={setBud} onSubmitEditing={go} placeholder="Opcional, ex.: 1.500,00" keyboardType="decimal-pad" /></FieldRow>
    <FieldRow label="Palavras"><Input value={kw} onChangeText={setKw} placeholder="Opcional: loja ou palavras que mandam para este grupo" /></FieldRow>
    <Text style={{color: c.muted, fontSize: 12}}>O app escolhe o grupo sozinho pelo nome, pela loja ou por #grupo no fim do texto.</Text>
  </Dialog>;
}
function FinishDialog({model, name, count, pending, total, cats, onClose, onFinish}: {model: Model; name: string; count: number; pending: number; total: number; cats: string[]; onClose: () => void; onFinish: (value: number | null, cat: string, launch: boolean) => void}) {
  const c = useTheme(), [val, setVal] = useState(moneyInput(total)), [cat, setCat] = useState(cats[0]);
  if (model === 'simple') return <Dialog visible onClose={onClose} title="Concluir lista" footer={<><GhostButton label="Cancelar" onPress={onClose} /><PrimaryButton testID="finish-confirm" icon="check" label="Concluir" onPress={() => onFinish(null, '', false)} /></>}>
    <Text style={{color: c.text}}>{count} {count > 1 ? 'itens feitos vão' : 'item feito vai'} para o histórico.{pending ? ' ' + pending + (pending > 1 ? ' itens não feitos continuam' : ' item não feito continua') + ' na lista.' : ''}</Text>
  </Dialog>;
  return <Dialog visible onClose={onClose} title={'Finalizar compra · ' + name} footer={<><GhostButton label="Concluir sem lançar" onPress={() => onFinish(parseMoney(val), cat, false)} /><PrimaryButton testID="finish-confirm" icon="wallet" label="Lançar em Finanças" onPress={() => onFinish(parseMoney(val), cat, true)} /></>}>
    <FieldRow label="Valor pago"><Input value={val} onChangeText={setVal} keyboardType="decimal-pad" /></FieldRow>
    <FieldRow label="Categoria" top><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{cats.map(x => <Chip key={x} label={x} selected={cat === x} onPress={() => setCat(x)} />)}</View></FieldRow>
    <Text style={{color: c.muted, fontSize: 13}}>{count} {count > 1 ? 'itens no carrinho vão' : 'item no carrinho vai'} para o histórico, com data e hora.</Text>
  </Dialog>;
}
function RemindDialog({current, agenda, onClose, onSave}: {current: string; agenda: boolean; onClose: () => void; onSave: (when: string, agenda: boolean) => void}) {
  const c = useTheme(), [when, setWhen] = useState(current), [ag, setAg] = useState(agenda);
  return <Dialog visible onClose={onClose} title="Lembrar de ir" footer={<>{current ? <Pressable accessibilityRole="button" onPress={() => onSave('', false)} style={{marginRight: 'auto', justifyContent: 'center'}}><Text style={{color: c.danger}}>Tirar lembrete</Text></Pressable> : null}<GhostButton label="Cancelar" onPress={onClose} /><PrimaryButton label="Salvar" disabled={!when} onPress={() => onSave(when, ag)} /></>}>
    {/* so o campo de dia e hora, sem atalhos (pedido do Pedro) */}
    <DateTimeField label="Dia e hora" value={when} onChange={setWhen} allowClear={false} />
    <Pressable accessibilityRole="switch" accessibilityState={{checked: ag}} onPress={() => setAg(!ag)} style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
      <View style={{width: 40, height: 24, borderRadius: 12, backgroundColor: ag ? c.accent : c.line, padding: 3, alignItems: ag ? 'flex-end' : 'flex-start'}}><View style={{width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff'}} /></View>
      <View style={{flex: 1}}><Text style={{color: c.text, fontWeight: '600'}}>Colocar também na Agenda</Text><Text style={{color: c.muted, fontSize: 12}}>Entra como tarefa com check; se não for feita, passa para o dia seguinte.</Text></View>
    </Pressable>
    <Text style={{color: c.muted, fontSize: 12}}>O lembrete entra em Lembretes e chega como notificação na hora.</Text>
  </Dialog>;
}
