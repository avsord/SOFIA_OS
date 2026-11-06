import {readLocalBlob} from '../lib/blob-registry';
import {useLiveReload} from '../lib/live-reload';
import {dpx} from '../lib/content-width';
// 0.3.269 — Biblioteca redesenhada (protótipo aprovado em 31/10: docs/prototipos-2026-10-31/biblioteca-criar.html).
// Cards em uma coluna; tipos na lateral (computador, ordem arrastável) ou abas com "Mais" (celular); criar = entrada
// universal (nome, link de qualquer site ou arquivo) com o fluxo de 10 passos do documento de pedidos.
// Nada é migrado à força: os itens antigos (film, video, reading, recipe, music, asset e as áreas criadas) aparecem
// como itens dos tipos novos e continuam gravados no lugar de sempre; os novos tipos usam library_item/library_type.
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Image, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import {useTheme} from '../lib/theme';
import {PALETTE} from '../lib/palette';
import {useDesktop} from '../lib/desktop';
import type {CatalogHit, SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {errorText} from '../lib/chat-model';
import {appAlert} from '../lib/app-alert';
import {libraryRating, libraryTags, isLibraryMeta} from '../lib/library-filters';
import {AREA_TAG, MEMBER_TAG, customPayload, customValues, readArea, type LibraryArea} from '../lib/library-areas';
import {Icon, type IconName} from '../components/Icon';
import {IconButton} from '../components/UI';
import {BarPill, DropPanel, PanelRow, StarRow, ResultLine} from '../components/FilterBar';
import {DateTimeField} from '../components/DateTimeField';
import {InternalBackGesture} from '../components/InternalBackGesture';
import {Presence} from '../components/Presence';
import {contextMenu} from '../components/ContextMenu';
import {AppFrame, NavTabs, Chip, Dialog, FieldRow, GhostButton, IconPicker, Input, Panel, PrimaryButton, SideItem, SideLabel, fold, openMore, useToast, AppSkeleton} from '../components/AppKit';

/* ---------- tipos (modelos com blocos liga/desliga) ---------- */
export type TypeDef = {id: string; name: string; one: string; icon: IconName; statuses: string[]; rating: boolean; fields: string[]; kind: string; e: Entity | null; area?: LibraryArea; builtin?: string; position: number; pinned: boolean; inMore: boolean};
export const MODELS: Record<string, Omit<TypeDef, 'id' | 'e' | 'position' | 'pinned' | 'inMore'>> = {
  film: {name: 'Filmes', one: 'Filme', icon: 'film', statuses: ['Quero ver', 'Visto'], rating: true, fields: ['Direção'], kind: 'film'},
  series: {name: 'Séries', one: 'Série', icon: 'tv', statuses: ['Quero ver', 'Vendo', 'Vi'], rating: true, fields: ['Onde assistir', 'Temporada'], kind: 'library_item'},
  video: {name: 'Vídeos', one: 'Vídeo', icon: 'play', statuses: ['Quero ver', 'Visto'], rating: false, fields: ['Canal'], kind: 'video'},
  book: {name: 'Livros', one: 'Livro', icon: 'book', statuses: ['Quero ler', 'Lendo', 'Lido'], rating: true, fields: ['Autor', 'Páginas'], kind: 'reading'},
  recipe: {name: 'Receitas', one: 'Receita', icon: 'forkKnife', statuses: ['Quero fazer', 'Já fiz'], rating: true, fields: ['Tempo', 'Porções'], kind: 'recipe'},
  product: {name: 'Produtos', one: 'Produto', icon: 'tag', statuses: ['Quero', 'Comprei'], rating: false, fields: ['Loja', 'Preço'], kind: 'library_item'},
  place: {name: 'Lugares', one: 'Lugar', icon: 'mapPin', statuses: ['Quero ir', 'Fui'], rating: true, fields: ['Cidade', 'Categoria'], kind: 'library_item'},
  article: {name: 'Artigos', one: 'Artigo', icon: 'note', statuses: ['Ler depois', 'Lido'], rating: false, fields: ['Site'], kind: 'library_item'},
  course: {name: 'Cursos', one: 'Curso', icon: 'graduation', statuses: ['Quero fazer', 'Fazendo', 'Concluído'], rating: true, fields: ['Plataforma'], kind: 'library_item'},
  document: {name: 'Documentos', one: 'Documento', icon: 'notebook', statuses: ['Guardado'], rating: false, fields: [], kind: 'library_item'},
  music: {name: 'Músicas', one: 'Música', icon: 'music', statuses: ['Quero ouvir', 'Ouvi'], rating: true, fields: ['Artista'], kind: 'music'},
  reference: {name: 'Referências', one: 'Referência', icon: 'link', statuses: ['Salvo'], rating: false, fields: [], kind: 'asset'},
  blank: {name: 'Novo tipo', one: 'Item', icon: 'star', statuses: ['Salvo'], rating: false, fields: [], kind: 'library_item'},
};
const DEFAULT_TYPES = ['film', 'book', 'recipe']; // "deixar só Filmes, Livros, Receitas" (os outros aparecem quando têm itens)
const NEW_MODELS = ['film', 'series', 'book', 'recipe', 'product', 'place', 'article', 'course', 'document', 'blank'];
const MODEL_LABEL: Record<string, string> = {film: 'Filme', series: 'Série', book: 'Livro', recipe: 'Receita', product: 'Produto', place: 'Lugar', article: 'Artigo', course: 'Curso', document: 'Documento', blank: 'Do zero'};

export type Item = {id: string; e: Entity; type: string; title: string; status: number; statusOn: string; rating: number; year: number | null; creator: string; url: string; site: string; cover: string; tags: string[]; notes: string; extra: Record<string, string>; fileId: string; fileName: string; fileError: string; links: Record<string, string>; pending?: boolean};
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '').replace(/^m\./, ''); } catch { return ''; } };
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const json = <T,>(v: unknown, d: T): T => { try { const x = JSON.parse(String(v || '')); return x && typeof x === 'object' ? x : d; } catch { return d; } };
const STATUS_TAG = 'lib-status:';
const userTags = (e: Entity) => [...new Map((e.tags || []).filter(t => !isLibraryMeta(t) && t !== AREA_TAG && !t.startsWith(MEMBER_TAG) && !t.startsWith(STATUS_TAG) && !t.startsWith('cat:')).map(t => [fold(t), t] as const)).values()];
/** item antigo ou novo -> forma unica da tela */
export function toItem(e: Entity, areaIds: Set<string>): Item | null {
  const d = e.data || {}, tags = userTags(e), links = json<Record<string, string>>(d.links_json, {});
  const base = {id: e.id, e, title: e.title, rating: e.kind === 'library_item' ? Number(d.rating) || 0 : libraryRating(e), url: String(d.url || d.source_url || ''), cover: String(d.cover_url || ''), fileId: String(d.file_id || ''), fileName: String(d.file_name || ''), fileError: String(d.file_error || ''), links, statusOn: '', year: null as number | null, creator: '', extra: {} as Record<string, string>};
  const st = (n: number) => { const t = (e.tags || []).find(x => x.startsWith(STATUS_TAG)); return t ? Number(t.slice(STATUS_TAG.length)) || 0 : n; };
  if (e.kind === 'library_item') return {...base, type: String(d.type || 'blank'), status: Number(d.status) || 0, statusOn: String(d.status_on || ''), year: Number(d.year) || null, creator: String(d.creator || ''), site: String(d.site || host(base.url)), tags, notes: String(e.content || ''), extra: json(d.extra_json, {})};
  if (e.kind === 'film') return {...base, type: 'film', status: e.state === 'watched' ? 1 : 0, statusOn: String(d.watched_on || ''), year: Number(d.year) || null, creator: String(d.director || ''), site: String(d.site || host(base.url)), tags: [...new Map([...tags, ...String(d.genre || '').split(/[,/]/).map(s => s.trim()).filter(Boolean)].map(t => [fold(t), t] as const)).values()], notes: [e.content, d.review, d.raw_review].map(x => String(x || '').trim()).filter(Boolean).join('\n\n'), extra: {'Direção': String(d.director || '')}};
  if (e.kind === 'video') return {...base, type: 'video', status: e.state === 'watched' ? 1 : 0, statusOn: String(d.watched_on || ''), creator: String(d.channel || ''), site: String(d.site || host(base.url)), tags, notes: [e.content, d.review].map(x => String(x || '').trim()).filter(Boolean).join('\n\n'), extra: {'Canal': String(d.channel || '')}};
  if (e.kind === 'reading') return {...base, type: 'book', status: e.state === 'reading' ? 1 : e.state === 'completed' ? 2 : 0, creator: String(d.author || ''), site: String(d.site || host(base.url)), tags, notes: [e.content, d.notes].map(x => String(x || '').trim()).filter(Boolean).join('\n\n'), extra: {'Autor': String(d.author || ''), 'Páginas': String(d.progress || '')}};
  if (e.kind === 'recipe') return {...base, type: 'recipe', status: e.state === 'ready' ? 1 : 0, creator: String(d.author || ''), site: String(d.site || host(base.url)), tags, notes: [e.content, d.ingredients ? 'Ingredientes:\n' + d.ingredients : '', d.steps ? 'Modo de preparo:\n' + d.steps : '', d.tips].map(x => String(x || '').trim()).filter(Boolean).join('\n\n'), extra: {'Tempo': String(d.time || ''), 'Porções': d.servings ? String(d.servings) : ''}};
  if (e.kind === 'music') return {...base, type: 'music', status: st(0), creator: String(d.artist || ''), site: String(d.site || d.platform || host(base.url)), tags, notes: [e.content, d.comments].map(x => String(x || '').trim()).filter(Boolean).join('\n\n'), extra: {'Artista': String(d.artist || '')}};
  if (e.kind === 'asset') {
    if ((e.tags || []).includes(AREA_TAG)) return null;
    const member = (e.tags || []).find(t => t.startsWith(MEMBER_TAG))?.slice(MEMBER_TAG.length) || '';
    return {...base, type: member && areaIds.has(member) ? 'area:' + member : 'reference', status: 0, site: String(d.site || host(base.url)), tags, notes: [e.content, member ? '' : d.description].map(x => String(x || '').trim()).filter(Boolean).join('\n\n'), extra: member ? customValues(e) : {}};
  }
  return null;
}
const SIMILAR = (a: string, b: string) => { const x = fold(a).replace(/[^a-z0-9 ]/g, ''), y = fold(b).replace(/[^a-z0-9 ]/g, ''); return !!x && x === y; };
async function listAll(api: SofiaApi, kind: string) { const all: Entity[] = []; for (let o = 0; ; o += 100) { const r = await api.entities(kind, '', o); all.push(...r.items); if (r.items.length < 100) break; } return all; }
const LIB_KINDS = ['library_item', 'film', 'video', 'reading', 'recipe', 'music', 'asset', 'library_type'];
const PENDING_KEY = 'sofia.library.pending.v1', LEARN_KEY = 'sofia.library.learn.v1';

type Draft = {raw: string; title: string; type: string; status: number; tags: string[]; year: string; creator: string; url: string; site: string; cover: string; notes: string; extra: Record<string, string>; file?: {name: string; mime: string; uri: string; file?: any}; actions: string[]; when?: string};
const emptyDraft = (type: string): Draft => ({raw: '', title: '', type, status: 0, tags: [], year: '', creator: '', url: '', site: '', cover: '', notes: '', extra: {}, actions: []});
function typeForFile(mime: string, name: string): string { if (/^image\//.test(mime)) return 'reference'; if (/^video\//.test(mime)) return 'video'; if (/^audio\//.test(mime)) return 'music'; if (/pdf|word|document|text|sheet|presentation/.test(mime) || /\.(pdf|docx?|txt|xlsx?|pptx?)$/i.test(name)) return 'document'; return 'document'; }
function typeForLink(url: string, type?: string): string { const h = host(url); if (/youtube|youtu\.be|vimeo|tiktok/.test(h)) return 'video'; if (/spotify|deezer|soundcloud|music\.apple/.test(h)) return 'music'; if (/maps\.|goo\.gl\/maps|maps\.app|tripadvisor|ifood/.test(h + url)) return 'place'; if (/imdb|letterboxd|netflix|primevideo|disneyplus|max\.com|filmow/.test(h)) return 'film'; if (/goodreads|skoob|amazon\.com\.br\/.*livro|estantevirtual/.test(h + url)) return 'book'; if (/receita|tudogostoso|panelinha|cookpad/.test(h + url)) return 'recipe'; if (/mercadolivre|kabum|amazon|pichau|shopee|aliexpress|magazineluiza|americanas|casasbahia|terabyte/.test(h)) return 'product'; if (/udemy|coursera|alura|domestika|hotmart/.test(h)) return 'course'; if (type === 'article' || /medium|substack|blog|news|g1\.|uol\.|folha|estadao/.test(h)) return 'article'; return 'reference'; }

export function Library({api, active, onBack}: {api: SofiaApi; active: boolean; onBack: () => void}) {
  const c = useTheme(), desktop = useDesktop(), {toast, toastNode} = useToast();
  const [ents, setEnts] = useState<Record<string, Entity[]> | null>(null), [error, setError] = useState('');
  const [view, setView] = useState('all'), [query, setQuery] = useState(''), [filter, setFilter] = useState<{status: string; rating: number; tag: string}>({status: '', rating: 0, tag: ''}), [filterOpen, setFilterOpen] = useState(false);
  const [adding, setAdding] = useState<null | {seed?: string; files?: any[]; type?: string}>(null), [openId, setOpenId] = useState<string | null>(null), [flash, setFlash] = useState('');
  const [typeDialog, setTypeDialog] = useState<null | {edit: TypeDef | null}>(null), [organize, setOrganize] = useState(false), [moreOpen, setMoreOpen] = useState(false);
  // 03/11/2026: barra [Area ⌄] [Filtros ⌄]; so um painel aberto por vez; a busca abre pela lupa do topo (celular)
  const [drop, setDrop] = useState<'' | 'area' | 'filter' | 'order'>(''), [order, setOrder] = useState<'recent' | 'az' | 'rating'>('recent'), [searchOpen, setSearchOpen] = useState(false);
  const [pending, setPending] = useState<Entity[]>([]);

  const load = useCallback(async () => {
    try { const got = await Promise.all(LIB_KINDS.map(k => listAll(api, k).catch(() => [] as Entity[]))); setEnts(Object.fromEntries(LIB_KINDS.map((k, i) => [k, got[i]]))); setError(''); }
    catch (e) { setError(errorText(e)); setEnts(x => x || {}); }
    // falha 9: o que foi salvo sem internet completa agora
    try { const raw = await AsyncStorage.getItem(PENDING_KEY); const list: Partial<Entity>[] = raw ? JSON.parse(raw) : []; if (list.length) { const left: Partial<Entity>[] = []; for (const p of list) { try { const s = await api.saveEntity(p); patchLocal(s); } catch { left.push(p); } } await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(left)); setPending(left.map((p, i) => ({...(p as Entity), id: 'pending-' + i}))); if (list.length > left.length) toast('Itens salvos sem internet foram enviados.'); } } catch { /* sem fila */ }
  }, [api]);
  useEffect(() => { if (active) void load(); }, [active, load]);
  useLiveReload(load, active); // 0.3.285: o que mudar no celular aparece aqui sem recarregar a pagina (e vice-versa)
  useEffect(() => { if (!active) { setOpenId(null); setAdding(null); } }, [active]);
  const patchLocal = (e: Entity) => setEnts(d => d ? {...d, [e.kind!]: (d[e.kind!] || []).some(x => x.id === e.id) ? d[e.kind!].map(x => x.id === e.id ? e : x) : [e, ...(d[e.kind!] || [])]} : d);
  const dropLocal = (e: Entity) => setEnts(d => d ? {...d, [e.kind!]: (d[e.kind!] || []).filter(x => x.id !== e.id)} : d);
  async function save(e: Partial<Entity>, quiet = false): Promise<Entity | null> {
    try { const s = await api.saveEntity(e); patchLocal(s); return s; }
    catch (err: any) {
      if (!e.id && (err?.status === 0 || /rede|internet|network|conex/i.test(String(err?.message || '')))) { // sem internet: guarda e completa depois
        const raw = await AsyncStorage.getItem(PENDING_KEY).catch(() => null); const list = raw ? JSON.parse(raw) : []; list.push(e); await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(list)).catch(() => {});
        setPending(p => [...p, {...(e as Entity), id: 'pending-' + Date.now()}]); toast('Sem internet: o item ficou guardado aqui e vai ser enviado quando a conexão voltar.'); return null;
      }
      if (!quiet) toast(errorText(err)); return null;
    }
  }

  /* ---------- tipos ---------- */
  const E = ents || {};
  const areas = useMemo(() => (E.asset || []).map(readArea).filter((a): a is LibraryArea => !!a), [E.asset]);
  const areaIds = useMemo(() => new Set(areas.map(a => a.record.id)), [areas]);
  const items: Item[] = useMemo(() => [...pending, ...LIB_KINDS.filter(k => k !== 'library_type').flatMap(k => (E[k] || []).filter(e => e.state !== 'archived'))].map((e): Item | null => { const it = toItem(e, areaIds); return it ? {...it, pending: e.id.startsWith('pending-')} : null; }).filter((x): x is Item => !!x).sort((a, b) => String(b.e.created_at || '').localeCompare(String(a.e.created_at || ''))), [E, areaIds, pending]);
  const types: TypeDef[] = useMemo(() => {
    const recs = (E.library_type || []).filter(t => t.state !== 'archived'), byBuiltin = new Map(recs.filter(t => t.data?.builtin).map(t => [String(t.data.builtin), t]));
    const out: TypeDef[] = [];
    const cfgOf = (t: Entity | undefined) => json<{statuses?: string[]; rating?: boolean; fields?: string[]; name?: string; one?: string}>(t?.data?.config_json, {});
    for (const [id, m] of Object.entries(MODELS)) { if (id === 'blank') continue; const r = byBuiltin.get(id), cfg = cfgOf(r); if (r && r.state === 'archived') continue;
      out.push({...m, id, name: r?.title || m.name, one: cfg.one || m.one, icon: (r?.data?.icon as IconName) || m.icon, statuses: cfg.statuses?.length ? cfg.statuses : m.statuses, rating: cfg.rating ?? m.rating, fields: cfg.fields ?? m.fields, e: r || null, builtin: id, position: r ? Number(r.data?.position) || 0 : 999, pinned: !!r?.data?.pinned, inMore: !!r?.data?.in_more}); }
    for (const r of recs.filter(t => !t.data?.builtin)) { const cfg = cfgOf(r), base = MODELS[String(r.data?.model || 'blank')] || MODELS.blank;
      out.push({...base, id: 'type:' + r.id, name: r.title, one: cfg.one || r.title, icon: (r.data?.icon as IconName) || base.icon, statuses: cfg.statuses?.length ? cfg.statuses : base.statuses, rating: cfg.rating ?? base.rating, fields: cfg.fields ?? base.fields, kind: 'library_item', e: r, position: Number(r.data?.position) || 0, pinned: !!r.data?.pinned, inMore: !!r.data?.in_more}); }
    for (const a of areas) out.push({id: 'area:' + a.record.id, name: a.record.title, one: a.record.title, icon: 'star', statuses: ['Salvo'], rating: true, fields: a.fields.map(f => f.label), kind: 'asset', e: null, area: a, position: 900, pinned: false, inMore: false});
    const count = (t: TypeDef) => items.filter(i => i.type === t.id).length;
    // mostra: tipos com itens, os tres padrao e os criados; vazios vao para o fim, apagados
    return out.filter(t => count(t) || DEFAULT_TYPES.includes(t.id) || t.e || t.area).sort((a, b) => (count(a) ? 0 : 1) - (count(b) ? 0 : 1) || Number(b.pinned) - Number(a.pinned) || a.position - b.position || a.name.localeCompare(b.name, 'pt-BR'));
  }, [E.library_type, areas, items]);
  const typeOf = (id: string): TypeDef => types.find(t => t.id === id) || (MODELS[id] ? {...MODELS[id], id, e: null, position: 999, pinned: false, inMore: false} : {...MODELS.blank, id, name: 'Outros', one: 'Item', e: null, position: 999, pinned: false, inMore: false});
  const curType = view !== 'all' ? typeOf(view) : null;
  const tagsFor = (typeId: string | null) => [...new Map(items.filter(i => !typeId || i.type === typeId).flatMap(i => i.tags).map(t => [fold(t), t] as const)).values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  // 03/11/2026: as caixinhas de etiqueta marcam varias (antes a segunda trocava a primeira); mostra quem tem qualquer uma
  const tagList = filter.tag ? filter.tag.split('\n') : [], hasTag = (tg: string) => tagList.some(x => fold(x) === fold(tg));
  const filterOn = !!(filter.status || filter.rating || filter.tag);
  // 03/11/2026 (desenho 20): ordem escolhida na barra (Recentes, A a Z, Nota); a lista ja vem das mais recentes
  const sortLib = (list: Item[]) => order === 'recent' ? list : [...list].sort((a, b) => order === 'az' ? a.title.localeCompare(b.title, 'pt-BR') : (b.rating || 0) - (a.rating || 0));
  const shown = sortLib(items.filter(i => (view === 'all' || i.type === view) && (!query.trim() || fold([i.title, i.creator, i.site, i.tags.join(' '), i.notes].join(' ')).includes(fold(query)))
    && (!filter.tag || i.tags.some(t => hasTag(t))) && (!filter.rating || i.rating >= filter.rating) && (!filter.status || (filter.status === 'done' ? i.status === typeOf(i.type).statuses.length - 1 && typeOf(i.type).statuses.length > 1 : i.status !== typeOf(i.type).statuses.length - 1 || typeOf(i.type).statuses.length === 1))));
  const open = items.find(i => i.id === openId) || null;
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(''), 1200); return () => clearTimeout(t); }, [flash]);

  /* ---------- gravar item (tipo novo ou antigo, cada um no seu lugar) ---------- */
  function payload(base: Partial<Entity> | null, t: TypeDef, v: {title: string; status: number; statusOn?: string; rating: number; year: number | null; creator: string; url: string; site: string; cover: string; tags: string[]; notes: string; extra: Record<string, string>; fileId?: string; fileName?: string; fileMime?: string; fileError?: string; links?: Record<string, string>}): Partial<Entity> {
    const kind = base?.kind || (t.area ? 'asset' : t.kind), last = t.statuses.length - 1, done = last > 0 && v.status >= last, common = {cover_url: v.cover, site: v.site, links_json: JSON.stringify(v.links || {})};
    const out: Partial<Entity> = {...(base || {}), kind, title: v.title.slice(0, 240) || 'Sem título', area: base?.area || 'Biblioteca', privacy: base?.privacy || 'private', revision: base?.revision};
    const tagsPlain = [...new Map(v.tags.map(t2 => [fold(t2), t2.trim()] as const)).values()].filter(Boolean);
    if (kind === 'library_item') return {...out, content: v.notes, state: 'saved', tags: tagsPlain, data: {...(base?.data || {}), ...common, type: t.id, status: String(v.status), status_on: v.statusOn || '', rating: v.rating || '', year: v.year || '', creator: v.creator, url: v.url, file_id: v.fileId ?? base?.data?.file_id ?? '', file_name: v.fileName ?? base?.data?.file_name ?? '', file_mime: v.fileMime ?? base?.data?.file_mime ?? '', file_error: v.fileError ?? '', extra_json: JSON.stringify(v.extra || {})}};
    const keepMeta = (base?.tags || []).filter(x => x.startsWith(MEMBER_TAG));
    const tags = libraryTags([...tagsPlain, ...keepMeta], v.rating);
    if (kind === 'film') return {...out, content: v.notes, state: done ? 'watched' : 'to_watch', tags, data: {...(base?.data || {}), ...common, year: v.year || '', director: v.extra['Direção'] ?? v.creator ?? '', genre: '', url: v.url, watched_on: done ? (v.statusOn || base?.data?.watched_on || today()) : '', review: '', raw_review: ''}};
    if (kind === 'video') return {...out, content: v.notes, state: done ? 'watched' : 'to_watch', tags, data: {...(base?.data || {}), ...common, url: v.url, channel: v.extra['Canal'] ?? v.creator ?? '', watched_on: done ? (v.statusOn || base?.data?.watched_on || today()) : '', review: ''}};
    if (kind === 'reading') return {...out, content: v.notes, state: v.status >= 2 ? 'completed' : v.status === 1 ? 'reading' : 'interest', tags, data: {...(base?.data || {}), ...common, author: v.extra['Autor'] ?? v.creator ?? '', url: v.url, progress: v.extra['Páginas'] ?? '', notes: ''}};
    if (kind === 'recipe') return {...out, content: v.notes, state: done ? 'ready' : 'draft', tags, data: {...(base?.data || {}), ...common, source_url: v.url, time: v.extra['Tempo'] ?? '', servings: Number(v.extra['Porções']) || '', ingredients: '', steps: '', tips: ''}};
    if (kind === 'music') return {...out, content: v.notes, state: 'saved', tags: [...tags.filter(x => !x.startsWith(STATUS_TAG)), ...(v.status ? [STATUS_TAG + v.status] : [])], data: {...(base?.data || {}), ...common, artist: v.extra['Artista'] ?? v.creator ?? '', url: v.url, comments: ''}};
    if (t.area) { const values: Record<string, string> = {}; t.area.fields.forEach(f => { values[f.id] = v.extra[f.label] ?? v.extra[f.id] ?? ''; }); const p = customPayload(t.area, base || {}, v.title, v.notes, v.url, v.rating, values); return {...p, tags: [...new Set([...(p.tags || []), ...tagsPlain])], data: {...(p.data || {}), ...common}, revision: base?.revision}; }
    return {...out, kind: 'asset', content: v.notes, state: 'saved', tags, data: {...(base?.data || {}), ...common, type: base?.data?.type || 'other', url: v.url, description: ''}};
  }
  async function updateItem(it: Item, patch: Partial<Item>) {
    const n = {...it, ...patch}, t = typeOf(n.type);
    const changingKind = patch.type && patch.type !== it.type && (t.area ? 'asset' : t.kind) !== it.e.kind;
    const body = payload(changingKind ? null : it.e, t, {...n, fileMime: String(it.e.data?.file_mime || '')});
    if (changingKind) { // trocar o tipo para um que mora em outro lugar: cria la e apaga aqui, com o mesmo conteudo
      const created = await save(body); if (!created) return; dropLocal(it.e); await api.deleteEntity(it.id).catch(() => {}); setOpenId(created.id); return;
    }
    patchLocal({...it.e, ...body} as Entity); await save(body, true);
  }
  async function remove(it: Item) {
    const linked = Object.entries(it.links || {}).filter(([, v]) => v);
    const go = async (alsoLinked: boolean) => {
      setOpenId(null); dropLocal(it.e);
      try {
        await api.deleteEntity(it.id);
        if (alsoLinked) for (const [k, v] of linked) { if (k === 'task') await api.deleteTask(v).catch(() => {}); else await api.deleteEntity(v).catch(() => {}); }
        toast('Item excluído.', alsoLinked ? [] : [{label: 'Desfazer', run: () => { const {id: _i, revision: _r, ...rest} = it.e as any; void save(rest); }}]);
      } catch (e) { toast(errorText(e)); void load(); }
    };
    if (!linked.length) return void go(false);
    // passo 7: apagar o item pergunta se apaga o que esta ligado a ele
    appAlert('Excluir "' + it.title + '"?', 'Ele está ligado a: ' + linked.map(([k]) => ({monitor: 'monitoramento de preço', task: 'agenda', reminder: 'lembrete', page: 'página'} as any)[k] || k).join(', ') + '.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Só o item', onPress: () => void go(false)}, {text: 'Item e ligações', style: 'destructive', onPress: () => void go(true)}]);
  }
  /** acoes com o app, ligadas nos dois sentidos (o item guarda o id do que criou) */
  async function runAction(it: {id: string; title: string; url: string; notes: string; links: Record<string, string>; e?: Entity}, action: string, when?: string): Promise<Record<string, string>> {
    const links = {...it.links};
    try {
      if (action === 'monitor' && it.url) { const m = await save({kind: 'monitor', title: it.title.slice(0, 200), content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {method: 'product', variant: it.title.slice(0, 200), preferred_url: it.url, source_urls: '', discover: false, currency: 'BRL', interval_minutes: 360, new_low: true}}, true); /* 0.3.274: mesmo formato do Price Tracker (antes o servidor recusava: pedia um item de Comprar) */ if (m) { links.monitor = m.id; toast('O Price Tracker vai acompanhar o preço.'); } }
      if (action === 'schedule') { const d = when ? new Date(when) : (() => { const x = new Date(); x.setDate(x.getDate() + 1); x.setHours(20, 0, 0, 0); return x; })(); const t = await api.saveTask({title: it.title, state: 'scheduled', due_at: d.toISOString(), description: it.url}); links.task = t.item.id; toast('Na agenda: ' + d.toLocaleString('pt-BR', {weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'}) + '.'); }
      if (action === 'remind') { const d = when ? new Date(when) : (() => { const x = new Date(); x.setDate(x.getDate() + 1); x.setHours(9, 0, 0, 0); return x; })(); const r = await save({kind: 'reminder', title: it.title, content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {remind_at: d.toISOString(), message: it.url, location: ''}}, true); if (r) { links.reminder = r.id; toast('Lembrete criado.'); } }
      if (action === 'page') { const blocks = [{id: 'b' + Date.now(), type: 'text', text: [it.url, it.notes].filter(Boolean).join('\n\n') || it.title}]; const pg = await save({kind: 'user_page', title: it.title, content: it.notes, area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {node_type: 'space', blocks_json: JSON.stringify(blocks)}}, true); if (pg) { links.page = pg.id; toast('Página criada em Páginas.'); } }
    } catch (e) { toast(errorText(e)); }
    return links;
  }
  async function uploadFile(entity: Entity, file: NonNullable<Draft['file']>): Promise<{file_id?: string; file_error: string}> {
    try {
      let base64 = '';
      if (Platform.OS === 'web') { const blob: Blob = file.file || await readLocalBlob(file.uri); const data: string = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(blob); }); base64 = data.slice(data.indexOf(',') + 1); }
      else { const {File} = require('expo-file-system'); base64 = await new File(file.uri).base64(); }
      if (base64.length > 34e6) throw new Error('O arquivo passa de 25 MB.');
      const att = await api.uploadAttachment(entity.id, {name: file.name, mime: file.mime || 'application/octet-stream', base64});
      return {file_id: att.id, file_error: ''};
    } catch (e) { return {file_error: errorText(e).slice(0, 200) || 'Falhou'}; }
  }
  async function retryUpload(it: Item) { toast('Escolha o arquivo de novo para enviar.'); const files = await pickFiles(); if (!files.length) return; const f = files[0]; const r = await uploadFile(it.e, f); await save({...it.e, data: {...it.e.data, ...r, file_name: f.name, file_mime: f.mime}, revision: it.e.revision}); toast(r.file_error ? 'O envio falhou de novo.' : 'Arquivo enviado.'); }
  async function create(d: Draft, keepOpen: boolean) {
    const t = typeOf(d.type), id0 = 'tmp';
    const body = payload(null, t, {title: d.title || d.raw.trim(), status: d.status, statusOn: d.status && d.status >= t.statuses.length - 1 ? today() : '', rating: 0, year: Number(d.year) || null, creator: d.creator, url: d.url, site: d.site || host(d.url), cover: d.cover, tags: d.tags, notes: d.notes, extra: d.extra, fileName: d.file?.name || '', fileMime: d.file?.mime || '', fileError: d.file ? 'enviando' : ''});
    const saved = await save(body); if (!saved) return;
    setFlash(saved.id); void AsyncStorage.setItem(LEARN_KEY, JSON.stringify({...json<Record<string, string>>(await AsyncStorage.getItem(LEARN_KEY).catch(() => ''), {}), [d.url ? 'host:' + host(d.url) : 'last']: d.type})).catch(() => {});
    let patch: Record<string, any> = {};
    if (d.file) patch = {...patch, ...(await uploadFile(saved, d.file))};
    const links = d.actions.length ? await (async () => { let l: Record<string, string> = {}; for (const a of d.actions) l = await runAction({id: saved.id, title: saved.title, url: d.url, notes: d.notes, links: l}, a, d.when); return l; })() : null;
    if (links) patch.links_json = JSON.stringify(links);
    if (Object.keys(patch).length) await save({...saved, data: {...saved.data, ...patch}, revision: saved.revision}, true);
    if (patch.file_error) toast('O arquivo não subiu. O item ficou marcado com "Tentar de novo".');
    else toast('"' + saved.title + '" está na Biblioteca' + (t ? ', em ' + t.name : '') + '.', [{label: 'Desfazer', run: () => { dropLocal(saved); void api.deleteEntity(saved.id); }}]);
    if (!keepOpen) setAdding(null);
    void id0;
  }
  async function pickFiles(): Promise<NonNullable<Draft['file']>[]> {
    try { const r: any = await DocumentPicker.getDocumentAsync({multiple: true, copyToCacheDirectory: true}); if (r.canceled) return []; return (r.assets || []).map((a: any) => ({name: a.name, mime: a.mimeType || '', uri: a.uri, file: a.file})); } catch { return []; }
  }
  async function saveType(edit: TypeDef | null, name: string, icon: IconName, model: string, statuses: string[], rating: boolean, fields: string[]) {
    const cfg = JSON.stringify({statuses, rating, fields});
    if (edit?.e) await save({...edit.e, title: name, data: {...edit.e.data, icon, config_json: cfg}, revision: edit.e.revision});
    else if (edit?.builtin) await save({kind: 'library_type', title: name, content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {builtin: edit.builtin, icon, model: edit.builtin, config_json: cfg, position: edit.position === 999 ? types.indexOf(edit) : edit.position}});
    else { const r = await save({kind: 'library_type', title: name, content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {builtin: '', icon, model, config_json: cfg, position: types.length}}); if (r) setView('type:' + r.id); }
    setTypeDialog(null);
  }
  async function reorder(ids: string[]) {
    for (let i = 0; i < ids.length; i++) { const t = types.find(x => x.id === ids[i]); if (!t || t.area) continue; if (t.e) { if (Number(t.e.data?.position) !== i) await save({...t.e, data: {...t.e.data, position: i}, revision: t.e.revision}, true); }
      else if (t.builtin) await save({kind: 'library_type', title: t.name, content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {builtin: t.builtin, icon: t.icon, model: t.builtin, config_json: '', position: i}}, true); }
  }
  async function setTypeFlag(t: TypeDef, flag: 'pinned' | 'in_more', value: boolean) {
    if (t.area) return;
    if (t.e) await save({...t.e, data: {...t.e.data, [flag]: value}, revision: t.e.revision}, true);
    else await save({kind: 'library_type', title: t.name, content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {builtin: t.builtin || '', icon: t.icon, model: t.builtin || 'blank', config_json: '', position: types.indexOf(t), [flag]: value}}, true);
  }

  /* ---------- entradas: N, Ctrl+V, arrastar arquivo, Ctrl+K ---------- */
  const state = useRef({active, adding: !!adding, view}); state.current = {active, adding: !!adding, view};
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const typing = (t: any) => t && (/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable);
    const key = (e: KeyboardEvent) => { if (!state.current.active || state.current.adding || typing(e.target)) return; if (e.key === 'n' || e.key === 'N') { if (e.ctrlKey || e.metaKey || e.altKey) return; e.preventDefault(); setAdding({type: state.current.view !== 'all' ? state.current.view : undefined}); } };
    const paste = (e: ClipboardEvent) => { if (!state.current.active || state.current.adding || typing(e.target)) return; const files = [...(e.clipboardData?.files || [])]; const text = e.clipboardData?.getData('text') || ''; if (!files.length && !text.trim()) return; e.preventDefault(); setAdding({seed: text.trim(), files: files.map(f => ({name: f.name || 'imagem-colada.png', mime: f.type, uri: URL.createObjectURL(f), file: f})), type: state.current.view !== 'all' ? state.current.view : undefined}); };
    const over = (e: DragEvent) => { if (!state.current.active) return; if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); setDropping(true); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDropping(false); };
    const drop = (e: DragEvent) => { if (!state.current.active) return; const files = [...(e.dataTransfer?.files || [])]; setDropping(false); if (!files.length) return; e.preventDefault(); setAdding({files: files.map(f => ({name: f.name, mime: f.type, uri: URL.createObjectURL(f), file: f})), type: state.current.view !== 'all' ? state.current.view : undefined}); };
    const cmd = () => setAdding({});
    document.addEventListener('keydown', key); document.addEventListener('paste', paste); document.addEventListener('dragover', over); document.addEventListener('dragleave', leave); document.addEventListener('drop', drop); window.addEventListener('sofia:library-add', cmd);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('paste', paste); document.removeEventListener('dragover', over); document.removeEventListener('dragleave', leave); document.removeEventListener('drop', drop); window.removeEventListener('sofia:library-add', cmd); };
  }, []);
  const [dropping, setDropping] = useState(false);
  useEffect(() => { if (active && (globalThis as any).__sofiaLibraryAdd) { (globalThis as any).__sofiaLibraryAdd = false; setAdding({}); } }, [active]);

  /* ---------- tela ---------- */
  const count = (t: TypeDef) => items.filter(i => i.type === t.id).length;
  const sidebar = <>
    <SideItem testID="lib-nav-all" icon="book" label="Todos" count={items.length} selected={view === 'all'} onPress={() => setView('all')} />
    <SideLabel>Tipos</SideLabel>
    <DragTypes types={types} view={view} count={count} onSelect={id => { setView(id); setFilter({status: '', rating: 0, tag: ''}); }} onReorder={ids => void reorder(ids)}
      menu={t => contextMenu(() => [{label: 'Editar tipo', icon: 'edit', run: () => setTypeDialog({edit: t})}, ...(t.area ? [] : [{label: t.pinned ? 'Desafixar' : 'Fixar', icon: 'pin' as IconName, run: () => void setTypeFlag(t, 'pinned', !t.pinned)}])])} />
    <Pressable accessibilityRole="button" onPress={() => setTypeDialog({edit: null})} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32, paddingLeft: 12, borderRadius: 9, backgroundColor: hovered ? c.line + '80' : 'transparent'})}><Icon name="plus" size={13} color={c.muted} /><Text style={{color: c.muted, fontSize: 13}}>Novo tipo</Text></Pressable>
  </>;
  const tabs = types.filter(t => !t.inMore || t.pinned), more = types.filter(t => t.inMore && !t.pinned);
  const mobileNav = <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{flexGrow: 0}} contentContainerStyle={{gap: 8, paddingHorizontal: 16, paddingVertical: 10}}>
    <Chip label="Todos" count={items.length} selected={view === 'all'} onPress={() => setView('all')} />
    {tabs.map(t => <Chip key={t.id} icon={t.icon} label={t.name} selected={view === t.id} onPress={() => setView(t.id)} />)}
    <Chip icon="more" label="Mais" selected={more.some(t => t.id === view)} onPress={() => setMoreOpen(true)} />
  </ScrollView>;
  function Card({it, first}: {it: Item; first?: boolean}) {
    const t = typeOf(it.type), last = t.statuses.length - 1, isDone = last > 0 && it.status >= last, small = t.id === 'video' || t.id === 'reference' || t.id === 'article' || t.id === 'place';
    const meta = [t.one, it.year ? String(it.year) : '', it.creator && t.id !== 'video' ? it.creator : '', it.site || host(it.url)].filter(Boolean).join(' · ');
    const next = () => void updateItem(it, {status: isDone ? 0 : Math.min(last, it.status + 1), statusOn: !isDone && it.status + 1 >= last ? today() : it.statusOn});
    return <Pressable testID={'lib-card-' + it.id} accessibilityRole="button" accessibilityLabel={'Abrir ' + it.title} onPress={() => setOpenId(it.id)} {...contextMenu(() => [{label: 'Abrir', icon: 'edit', run: () => setOpenId(it.id)}, ...(it.url ? [{label: 'Abrir link', icon: 'link' as IconName, run: () => { if (typeof window !== 'undefined') window.open(it.url, '_blank'); }}] : []), {label: 'Excluir', icon: 'trash', danger: true, run: () => void remove(it)}])}
      style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, ...(desktop ? {paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderColor: c.line, backgroundColor: flash === it.id ? c.accentSoft : hovered ? c.input : 'transparent'} : {borderRadius: 14, borderWidth: 1, borderColor: hovered ? c.accent + '55' : c.line, backgroundColor: flash === it.id ? c.accentSoft : c.surface}), opacity: it.pending ? 0.6 : 1, ...({transitionProperty: 'background-color', transitionDuration: '500ms'} as any)})}>
      <View style={{width: small ? 62 : 40, height: small ? 40 : 56, borderRadius: 8, overflow: 'hidden', backgroundColor: c.input, alignItems: 'center', justifyContent: 'center'}}>{it.cover ? <Image source={{uri: it.cover}} style={{width: '100%', height: '100%'}} resizeMode="cover" /> : <Icon name={t.icon} size={18} color={c.muted} />}</View>
      <View style={{flex: 1, minWidth: 0, gap: 3}}>
        <Text numberOfLines={1} style={{color: c.text, fontSize: 14, fontWeight: '600'}}>{it.title}</Text>
        <View style={{flexDirection: 'row', gap: 12, flexWrap: 'wrap'}}>{[t.one, it.year ? String(it.year) : '', it.creator && t.id !== 'video' ? it.creator : '', it.site || host(it.url), it.pending ? 'aguardando internet' : ''].filter(Boolean).map((x, k) => <Text key={k} numberOfLines={1} style={{color: c.muted, fontSize: 12}}>{x}</Text>)}</View>
        {it.rating ? <Text accessibilityLabel={'Nota ' + it.rating + ' de 5'} style={{color: PALETTE.amber, fontSize: 13, letterSpacing: 1}}>{'★'.repeat(it.rating)}<Text style={{color: c.line}}>{'★'.repeat(5 - it.rating)}</Text></Text> : null}
        {it.tags.length && !desktop ? <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2}}>{it.tags.slice(0, 6).map(tg => <Pressable key={tg} accessibilityRole="button" accessibilityLabel={'Filtrar por ' + tg} onPress={() => setFilter(f => ({...f, tag: fold(f.tag) === fold(tg) ? '' : tg}))} style={{paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: c.accentSoft}}><Text style={{color: c.accent, fontSize: 12}}>{tg}</Text></Pressable>)}</View> : null}
        {it.fileError && it.fileError !== 'enviando' ? <Pressable accessibilityRole="button" onPress={() => void retryUpload(it)}><Text style={{color: c.danger, fontSize: 12}}>Arquivo não enviado · Tentar de novo</Text></Pressable> : null}
      </View>
      {desktop && it.tags.length ? <Pressable accessibilityRole="button" accessibilityLabel={'Filtrar por ' + it.tags[0]} onPress={() => setFilter(f => ({...f, tag: fold(f.tag) === fold(it.tags[0]) ? '' : it.tags[0]}))}><Text numberOfLines={1} style={{color: c.muted, fontSize: 13, maxWidth: 160}}>{it.tags.slice(0, 2).join(', ')}</Text></Pressable> : null}
      {t.statuses.length > 1 ? <Pressable testID={'lib-status-' + it.id} accessibilityRole="button" accessibilityLabel={isDone ? 'Marcado como ' + t.statuses[last] : 'Marcar ' + t.statuses[Math.min(last, it.status + 1)]} onPress={next} style={({hovered}: any) => ({paddingHorizontal: 11, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: isDone ? PALETTE.green + '88' : c.line, backgroundColor: isDone ? PALETTE.green + '18' : hovered ? c.input : 'transparent'})}><Text style={{color: isDone ? c.success : c.muted, fontSize: 12, fontWeight: '500'}}>{t.statuses[it.status] || t.statuses[0]}</Text></Pressable> : null}
    </Pressable>;
  }
  if (!ents) return <AppSkeleton label="Carregando a Biblioteca…" />;
  const kbd = (k: string) => <Text style={{color: c.muted, fontSize: 11, borderWidth: 1, borderColor: c.line, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1}}>{k}</Text>;
  return <InternalBackGesture enabled={active && !openId && !adding && !typeDialog} onBack={onBack}>
    <View testID="library-screen" style={{flex: 1}}>
      <AppFrame tabsOnTop sidebar={sidebar} mobileNav={desktop ? mobileNav : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{...(desktop ? {paddingLeft: dpx(40), paddingRight: dpx(40), paddingTop: dpx(32), maxWidth: 1160, width: '100%', alignSelf: 'flex-start'} : {paddingHorizontal: 16, paddingTop: 6}) as any, paddingBottom: 60, gap: 12}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
            {!desktop ? <IconButton name="back" label="Voltar aos apps" onPress={onBack} /> : null}
            <View style={{flex: 1}}>
              <Text accessibilityRole="header" style={{color: c.text, fontSize: 28, fontWeight: '600', letterSpacing: -1}}>Biblioteca</Text>
              {desktop ? <Text style={{color: c.muted, fontSize: 14, marginTop: 4}}>{(() => { const pend = shown.filter(i => { const t = typeOf(i.type); return t.statuses.length > 1 && i.status < t.statuses.length - 1; }); return !shown.length ? 'Nada aqui ainda. Aperte N para adicionar pelo nome, por um link ou por um arquivo.' : pend.length ? (pend.length === 1 ? '“' + pend[0].title + '” está esperando por você.' : pend.length + ' itens esperando por você; o mais recente é “' + pend[0].title + '”.') : 'Você já viu, leu ou fez tudo o que está aqui.'; })()}</Text> : null}
            </View>
            {desktop && curType && !curType.area ? <GhostButton icon="edit" label="Editar tipo" onPress={() => setTypeDialog({edit: curType})} /> : null}
            {!desktop ? <IconButton name="search" label="Buscar na Biblioteca" onPress={() => setSearchOpen(v => {if (v) setQuery(''); return !v;})} /> : null}
            {desktop ? <PrimaryButton testID="lib-add" icon="plus" label="Adicionar" onPress={() => setAdding({type: curType?.id})} /> : <IconButton name="plus" label="Adicionar à Biblioteca" onPress={() => setAdding({type: curType?.id})} />}
          </View>
          {desktop ? <NavTabs nav={mobileNav} /> : null}
          {desktop || searchOpen ? <View style={{flexDirection: 'row', gap: 10}}><View style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}><Icon name="search" size={15} color={c.muted} /><TextInput accessibilityLabel="Buscar na Biblioteca" value={query} onChangeText={setQuery} placeholder={'Buscar em ' + (curType ? curType.name : 'Biblioteca') + (desktop ? ' (N adiciona; Ctrl+V cola um link)' : '')} placeholderTextColor={c.muted} style={{flex: 1, color: c.text, fontSize: 14, paddingVertical: 9}} /></View></View> : null}
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 2}}>
            {!desktop ? <BarPill testID="lib-area" label={curType ? curType.name : 'Tudo'} open={drop === 'area'} onPress={() => setDrop(d => d === 'area' ? '' : 'area')} /> : null}
            <BarPill testID="lib-filter" label="Filtros" count={tagList.length + (filter.rating ? 1 : 0)} open={drop === 'filter'} onPress={() => setDrop(d => d === 'filter' ? '' : 'filter')} />
            {!desktop ? <><View style={{flex: 1}} /><Pressable testID="lib-order" accessibilityRole="button" accessibilityLabel="Ordem da lista" accessibilityState={{expanded: drop === 'order'}} onPress={() => setDrop(d => d === 'order' ? '' : 'order')} style={{height: 38, justifyContent: 'center'}}><Text style={{color: c.muted, fontSize: 13}}>{order === 'recent' ? 'Recentes' : order === 'az' ? 'A a Z' : 'Nota'} ⌄</Text></Pressable></> : null}
          </View>
          {drop === 'order' && !desktop ? <DropPanel onClose={() => setDrop('')} title="Ordem">{([['recent', 'Recentes'], ['az', 'A a Z'], ['rating', 'Maior nota']] as const).map(([k, label]) => <PanelRow key={k} label={label} on={order === k} onPress={() => { setOrder(k); setDrop(''); }} />)}</DropPanel> : null}
          {drop === 'area' && !desktop ? <DropPanel onClose={() => setDrop('')} title="Áreas" action={{label: 'Organizar', onPress: () => { setDrop(''); setOrganize(true); }}} footer={<PanelRow kind="plain" icon="plus" label="Nova área" on={false} onPress={() => { setDrop(''); setTypeDialog({edit: null}); }} />}>
            <PanelRow label="Tudo" count={items.length} on={view === 'all'} onPress={() => { setView('all'); setFilter({status: '', rating: 0, tag: ''}); setDrop(''); }} />
            {types.map(t => <PanelRow key={t.id} label={t.name} count={count(t)} on={view === t.id} onPress={() => { setView(t.id); setFilter({status: '', rating: 0, tag: ''}); setDrop(''); }} />)}
          </DropPanel> : null}
          {drop === 'filter' ? <DropPanel onClose={() => setDrop('')} title={'Filtros' + (curType ? ' de ' + curType.name : '')} action={filterOn ? {label: 'Limpar', onPress: () => setFilter({status: '', rating: 0, tag: ''})} : undefined} footer={<PrimaryButton label={'Ver ' + shown.length + ' ' + (curType ? curType.name.toLowerCase() : shown.length === 1 ? 'item' : 'itens')} onPress={() => setDrop('')} />}>
            {!curType ? <Text style={{color: c.muted, fontSize: 13, paddingHorizontal: 4, paddingVertical: 8}}>Escolha uma área para filtrar pelas etiquetas dela.</Text> : null}{tagsFor(curType?.id || null).filter(() => !!curType).map(tg => <PanelRow key={tg} kind="check" label={tg} count={items.filter(i => (!curType || i.type === curType.id) && i.tags.some(x => fold(x) === fold(tg))).length} on={hasTag(tg)} onPress={() => setFilter(f => {const cur = f.tag ? f.tag.split('\n') : [], next = cur.some(x => fold(x) === fold(tg)) ? cur.filter(x => fold(x) !== fold(tg)) : [...cur, tg]; return {...f, tag: next.join('\n')};})} />)}
            <StarRow value={filter.rating} onChange={r => setFilter(f => ({...f, rating: r}))} />
            <View style={{height: 12}} />
          </DropPanel> : null}
          <ResultLine text={[tagList.join(', '), filter.rating ? filter.rating + '★' : ''].filter(Boolean).concat([(filterOn ? shown.length + ' de ' + items.filter(i => view === 'all' || i.type === view).length : String(shown.length)) + ' ' + (curType ? curType.name.toLowerCase() : shown.length === 1 ? 'item' : 'itens')]).join(' · ')} onClear={filterOn ? () => setFilter({status: '', rating: 0, tag: ''}) : undefined} />
          {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
          {shown.length ? <View style={desktop ? {borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: 'hidden'} : {gap: 8}}>{shown.map((it, k) => <Card key={it.id} it={it} first={!k} />)}</View> : null}
          {!shown.length ? <View style={{alignItems: 'center', gap: 10, paddingVertical: 40}}><Icon name={curType?.icon || 'book'} size={32} color={c.muted} /><Text style={{color: c.muted, textAlign: 'center', maxWidth: 360}}>{query || filterOn ? 'Nada encontrado com esse filtro.' : 'Nada aqui ainda. Adicione pelo nome, cole um link de qualquer site ou arraste um arquivo.'}</Text></View> : null}
        </ScrollView>
      </AppFrame>
      {dropping ? <View pointerEvents="none" style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent + '1f', borderWidth: 2, borderStyle: 'dashed', borderColor: c.accent, borderRadius: 16, margin: 8}}><Text style={{color: c.accent, fontSize: 18, fontWeight: '700'}}>Solte para adicionar à Biblioteca</Text></View> : null}
      {toastNode}
      <Presence>{adding ? <AddDialog api={api} seed={adding.seed || ''} files={adding.files || []} initialType={adding.type || ''} types={types} typeOf={typeOf} items={items} tagsFor={tagsFor}
        onClose={() => setAdding(null)} onOpenExisting={id => { setAdding(null); setOpenId(id); }} onSave={(d, keep) => void create(d, keep)} onPickFiles={pickFiles} onNewType={() => setTypeDialog({edit: null})} /> : null}</Presence>
      <Presence>{open ? <ItemPanel key={open.id} it={open} t={typeOf(open.type)} types={types} tagsFor={tagsFor} onClose={() => setOpenId(null)} onChange={p => void updateItem(open, p)} onDelete={() => void remove(open)}
        onAction={(a, when) => void runAction(open, a, when).then(links => updateItem(open, {links}))} onMenu={e => openMore(e, open.title, [
          ...(open.url ? [{label: 'Abrir link', icon: 'link' as IconName, run: () => { if (typeof window !== 'undefined' && Platform.OS === 'web') window.open(open.url, '_blank'); else require('react-native').Linking.openURL(open.url); }}] : []),
          {label: open.e.privacy === 'shared' ? 'Tornar privado' : 'Compartilhado com a Sofia', icon: 'shield', run: () => void save({...open.e, privacy: open.e.privacy === 'shared' ? 'private' : 'shared', revision: open.e.revision})},
          {label: 'Excluir', icon: 'trash', danger: true, run: () => void remove(open)},
        ])} /> : null}</Presence>
      <Presence>{typeDialog ? <TypeDialog edit={typeDialog.edit} onClose={() => setTypeDialog(null)} onSave={(n, i, m, s, r, f) => void saveType(typeDialog.edit, n, i, m, s, r, f)}
        onDelete={typeDialog.edit?.e && !typeDialog.edit.builtin ? () => { const t = typeDialog.edit!; if (count(t)) { toast('Mova ou exclua os itens deste tipo antes.'); return; } void save({...t.e!, state: 'archived', revision: t.e!.revision}).then(() => { setTypeDialog(null); setView('all'); toast('Tipo excluído.', [{label: 'Desfazer', run: () => void save({...t.e!, state: 'active'})}]); }); } : undefined} /> : null}</Presence>
      <Presence>{moreOpen ? <Dialog visible onClose={() => setMoreOpen(false)} title="Mais tipos" footer={<GhostButton icon="move" label="Organizar tipos" onPress={() => { setMoreOpen(false); setOrganize(true); }} />}>
        <View style={{gap: 4}}>{types.filter(t => !tabs.includes(t)).map(t => <SideItem key={t.id} icon={t.icon} label={t.name} count={count(t)} selected={view === t.id} onPress={() => { setView(t.id); setMoreOpen(false); }} />)}{types.filter(t => !tabs.includes(t)).length ? null : <Text style={{color: c.muted}}>Todos os tipos já estão nas abas. Em "Organizar tipos" você escolhe quais vão para o Mais.</Text>}
          <SideItem icon="plus" label="Novo tipo" onPress={() => { setMoreOpen(false); setTypeDialog({edit: null}); }} /></View>
      </Dialog> : null}</Presence>
      <Presence>{organize ? <Dialog visible onClose={() => setOrganize(false)} title="Organizar tipos" footer={<PrimaryButton label="Pronto" onPress={() => setOrganize(false)} />}>
        <Text style={{color: c.muted, fontSize: 12}}>A ordem vale no celular e no computador. Os tipos que vão para o Mais ficam mais apagados aqui.</Text>
        <View style={{gap: 4}}>{types.map((t, i) => <View key={t.id} style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, opacity: t.inMore && !t.pinned ? 0.45 : 1}}>
          <Icon name={t.icon} size={17} color={c.text} /><Text style={{flex: 1, color: c.text}}>{t.name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={(t.pinned ? 'Desafixar ' : 'Fixar ') + t.name} onPress={() => void setTypeFlag(t, 'pinned', !t.pinned)} style={{padding: 6}}><Icon name="pin" size={16} color={t.pinned ? c.accent : c.muted} active={t.pinned} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={(t.inMore ? 'Trazer para as abas: ' : 'Levar para o Mais: ') + t.name} onPress={() => void setTypeFlag(t, 'in_more', !t.inMore)} style={{padding: 6}}><Icon name={t.inMore ? 'eyeOff' : 'eye'} size={16} color={c.muted} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={'Subir ' + t.name} disabled={!i} onPress={() => { const ids = types.map(x => x.id); [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; void reorder(ids); }} style={{padding: 6, opacity: i ? 1 : 0.3}}><Icon name="chevron" size={14} color={c.muted} /></Pressable>
        </View>)}</View>
      </Dialog> : null}</Presence>
    </View>
  </InternalBackGesture>;
}

/** Lateral do computador: tipos em lista com ordem arrastavel (segura e arrasta para cima/baixo). */
function DragTypes({types, view, count, onSelect, onReorder, menu}: {types: TypeDef[]; view: string; count: (t: TypeDef) => number; onSelect: (id: string) => void; onReorder: (ids: string[]) => void; menu: (t: TypeDef) => any}) {
  const [order, setOrder] = useState(types.map(t => t.id)), [drag, setDrag] = useState<string | null>(null), ROW = 38, start = useRef({id: '', idx: 0, moved: false});
  useEffect(() => { if (!drag) setOrder(types.map(t => t.id)); }, [types.map(t => t.id).join('|')]);
  const list = order.map(id => types.find(t => t.id === id)).filter((t): t is TypeDef => !!t);
  const responder = (t: TypeDef) => PanResponder.create({
    onStartShouldSetPanResponder: () => false, onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => { start.current = {id: t.id, idx: order.indexOf(t.id), moved: false}; setDrag(t.id); },
    onPanResponderMove: (_, g) => { const to = Math.max(0, Math.min(order.length - 1, start.current.idx + Math.round(g.dy / ROW))); setOrder(o => { const from = o.indexOf(t.id); if (from === to) return o; start.current.moved = true; const n = [...o]; n.splice(from, 1); n.splice(to, 0, t.id); return n; }); },
    onPanResponderRelease: () => { setDrag(null); if (start.current.moved) setOrder(o => { onReorder(o); return o; }); }, onPanResponderTerminate: () => setDrag(null),
  });
  return <>{list.map(t => { const n = count(t); return <View key={t.id} {...responder(t).panHandlers} style={{opacity: drag === t.id ? 0.7 : 1}}>
    <SideItem testID={'lib-type-' + t.id} icon={t.icon} label={t.name} count={n || '0'} faded={!n} selected={view === t.id} onPress={() => onSelect(t.id)} onContextMenu={menu(t)} trailing={t.pinned ? <Icon name="pin" size={11} color={'#999'} /> : null} />
  </View>; })}</>;
}

function Stars({value, onChange}: {value: number; onChange: (v: number) => void}) {
  return <View style={{flexDirection: 'row', gap: 4}}>{[1, 2, 3, 4, 5].map(n => <Pressable key={n} accessibilityRole="button" accessibilityLabel={'Nota ' + n} onPress={() => onChange(value === n ? 0 : n)} hitSlop={4}><Text style={{fontSize: 20, color: n <= value ? PALETTE.amber : '#d6d2de'}}>★</Text></Pressable>)}</View>;
}
function TagEditor({tags, options, onChange}: {tags: string[]; options: string[]; onChange: (t: string[]) => void}) {
  const c = useTheme(), [txt, setTxt] = useState(''), [adding, setAdding] = useState(false);
  const has = (t: string) => tags.some(x => fold(x) === fold(t));
  const add = (t: string) => { const v = t.trim(); if (!v) return; const existing = options.find(o => fold(o) === fold(v)); if (!has(v)) onChange([...tags, existing || v]); setTxt(''); setAdding(false); };
  return <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center'}}>
    {[...new Map([...options, ...tags].map(t => [fold(t), t] as const)).values()].map(t => <Chip key={t} label={t} selected={has(t)} onPress={() => onChange(has(t) ? tags.filter(x => fold(x) !== fold(t)) : [...tags, t])} />)}
    {adding ? <Input autoFocus value={txt} onChangeText={setTxt} onSubmitEditing={() => add(txt)} onBlur={() => { add(txt); setAdding(false); }} placeholder="Nova etiqueta" style={{minHeight: 32, paddingVertical: 4, width: 150}} /> : <Chip icon="plus" label="Nova etiqueta" dashed onPress={() => setAdding(true)} />}
  </View>;
}

/* ---------- janela de adicionar (entrada universal) ---------- */
type Hit = {key: string; title: string; sub: string; cover: string; type: string; year?: number | null; creator?: string; url?: string; site?: string; price?: number | null; fileIndex?: number};
function AddDialog({api, seed, files: files0, initialType, types, typeOf, items, tagsFor, onClose, onSave, onOpenExisting, onPickFiles, onNewType}: {api: SofiaApi; seed: string; files: any[]; initialType: string; types: TypeDef[]; typeOf: (id: string) => TypeDef; items: Item[]; tagsFor: (t: string | null) => string[]; onClose: () => void; onSave: (d: Draft, keep: boolean) => void; onOpenExisting: (id: string) => void; onPickFiles: () => Promise<any[]>; onNewType: () => void}) {
  const c = useTheme(), desktop = useDesktop();
  const [d, setD] = useState<Draft>(() => ({...emptyDraft(initialType || ''), raw: seed}));
  const [files, setFiles] = useState<any[]>(files0), [hits, setHits] = useState<Hit[]>([]), [pick, setPick] = useState(''), [searching, setSearching] = useState(false), [more, setMore] = useState(false), [otherTypes, setOtherTypes] = useState(false), [forceDup, setForceDup] = useState(false), [when, setWhen] = useState('');
  const seq = useRef(0), typed = useRef(!!initialType);
  const set = (p: Partial<Draft>) => setD(x => ({...x, ...p}));
  const isUrl = /^(https?:\/\/|www\.)\S+$/i.test(d.raw.trim());
  // passo 3: reconhece o que entrou (link le a pagina; texto busca nos catalogos; arquivo pelo tipo)
  useEffect(() => {
    const raw = d.raw.trim(), my = ++seq.current;
    if (files.length) return;
    if (!raw) { setHits([]); setPick(''); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        if (isUrl) { const url = raw.startsWith('http') ? raw : 'https://' + raw; const learned = await AsyncStorage.getItem(LEARN_KEY).then(v => json<Record<string, string>>(v, {})).catch(() => ({} as Record<string, string>)); const r = await api.linkPreview(url); if (my !== seq.current) return;
          const ty = learned['host:' + host(url)] || typeForLink(url, r.type === 'article' ? 'article' : undefined);
          setHits([{key: 'link', title: r.title || host(url), sub: (r.site || host(url)) + (r.price ? ' · R$ ' + r.price.toFixed(2).replace('.', ',') : ''), cover: r.image, type: ty, url: r.url, site: r.site, price: r.price}]); setPick('link');
          if (!typed.current) set({type: ty}); }
        else { const r = await api.librarySearch(raw, typed.current ? d.type : '').catch(() => ({items: [] as CatalogHit[]})); if (my !== seq.current) return;
          const hs = r.items.slice(0, 3).map((x, i) => ({key: 'c' + i, title: x.title, sub: (MODELS[x.type]?.one || '') + (x.year ? ' · ' + x.year : '') + (x.creator ? ' · ' + x.creator : ''), cover: x.cover, type: x.type, year: x.year, creator: x.creator}));
          setHits(hs); setPick(hs[0]?.key || 'name'); if (!typed.current && hs[0]) set({type: hs[0].type}); else if (!typed.current) { const learned = await AsyncStorage.getItem(LEARN_KEY).then(v => json<Record<string, string>>(v, {})).catch(() => ({} as Record<string, string>)); set({type: learned.last || 'film'}); } }
      } finally { if (my === seq.current) setSearching(false); }
    }, isUrl ? 150 : 400);
    return () => clearTimeout(t);
  }, [d.raw, files.length]);
  useEffect(() => { if (files.length && !typed.current) set({type: typeForFile(files[0].mime || '', files[0].name || '')}); }, [files.length]);
  const chosen = hits.find(h => h.key === pick);
  const final = (): Draft => {
    const base = {...d};
    if (chosen && pick !== 'name') { base.title = chosen.title; base.cover = chosen.cover; base.year = chosen.year ? String(chosen.year) : base.year; base.creator = chosen.creator || base.creator; if (chosen.url) { base.url = chosen.url; base.site = chosen.site || ''; if (chosen.price != null) base.extra = {...base.extra, 'Preço': 'R$ ' + chosen.price.toFixed(2).replace('.', ',')}; } }
    else base.title = d.raw.trim();
    if (isUrl && !base.url) base.url = d.raw.trim().startsWith('http') ? d.raw.trim() : 'https://' + d.raw.trim();
    return {...base, type: base.type || 'reference', when};
  };
  const f0 = final();
  const dup = !forceDup && !files.length && items.find(i => (f0.url && i.url && i.url === f0.url) || (f0.title && SIMILAR(i.title, f0.title) && i.type === f0.type));
  const t = typeOf(f0.type || 'film');
  const doSave = (keep: boolean) => {
    if (dup) return;
    if (files.length) { files.forEach((f, i) => onSave({...f0, title: files.length > 1 || !d.raw.trim() ? f.name.replace(/\.[^.]+$/, '') : f0.title, file: {name: f.name, mime: f.mime, uri: f.uri, file: f.file}, type: f0.type || typeForFile(f.mime, f.name)}, keep || i < files.length - 1)); setFiles([]); set({raw: ''}); return; }
    if (!f0.title.trim()) return; onSave(f0, keep); if (keep) { setD({...emptyDraft(d.type), tags: []}); setHits([]); setForceDup(false); }
  };
  const visibleTypes = [...new Map([...types, ...Object.keys(MODELS).filter(k => k !== 'blank').map(k => typeOf(k))].map(x => [x.id, x] as const)).values()];
  const firstTypes = [t, ...visibleTypes.filter(x => x.id !== t.id)].slice(0, 1);
  return <Dialog visible onClose={onClose} title="Adicionar à Biblioteca" footer={<>
    {desktop ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 'auto'}}><Text style={{color: c.muted, fontSize: 11}}>Enter salvar · Ctrl+Enter mais um · Esc fechar</Text></View> : null}
    <PrimaryButton testID="lib-save" label="Salvar" disabled={!!dup || (!f0.title.trim() && !files.length)} onPress={() => doSave(false)} />
  </>}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: c.accent, backgroundColor: c.accentSoft}}>
      <Icon name="sparkle" size={16} color={c.accent} />
      <TextInput testID="lib-add-input" autoFocus accessibilityLabel="Nome, link ou arquivo" value={d.raw} onChangeText={v => { set({raw: v}); setForceDup(false); }} placeholder="Nome, link de qualquer site ou arquivo" placeholderTextColor={c.muted} submitBehavior="submit"
        onSubmitEditing={() => doSave(false)} {...(Platform.OS === 'web' ? {onKeyPress: (e: any) => { const n = e.nativeEvent || {}; if (n.key === 'Enter' && (n.ctrlKey || n.metaKey)) { e.preventDefault?.(); doSave(true); } }} : {})} style={{flex: 1, color: c.text, fontSize: 16, paddingVertical: 12}} />
      <Pressable accessibilityRole="button" accessibilityLabel="Anexar arquivo" onPress={() => void onPickFiles().then(fs => fs.length && setFiles(f => [...f, ...fs]))} hitSlop={6}><Icon name="clip" size={18} color={c.muted} /></Pressable>
    </View>
    {files.length ? <View style={{gap: 6}}>{files.map((f, i) => <View key={i} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 11, borderWidth: 1, borderColor: c.line}}><Icon name={/image/.test(f.mime) ? 'image' : /video/.test(f.mime) ? 'play' : /audio/.test(f.mime) ? 'music' : 'notebook'} size={18} color={c.muted} /><View style={{flex: 1}}><Text numberOfLines={1} style={{color: c.text}}>{f.name}</Text><Text style={{color: c.muted, fontSize: 12}}>Vai para o seu Drive ao salvar{files.length > 1 ? ' · vira um item separado' : ''}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={'Tirar ' + f.name} onPress={() => setFiles(x => x.filter((_, k) => k !== i))}><Icon name="close" size={14} color={c.muted} /></Pressable></View>)}</View> : null}
    {/* skeleton enquanto busca; da para salvar antes de terminar */}
    {!files.length && d.raw.trim() ? <View style={{gap: 6}}>
      {searching && !hits.length ? [0, 1].map(k => <View key={k} style={{height: 58, borderRadius: 12, backgroundColor: c.input, opacity: 0.7}} />) : null}
      {hits.map(h => <Pressable key={h.key} testID={'lib-hit-' + h.key} accessibilityRole="radio" accessibilityState={{selected: pick === h.key}} onPress={() => { setPick(h.key); if (!typed.current) set({type: h.type}); }} style={{flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: pick === h.key ? c.accent : c.line, backgroundColor: pick === h.key ? c.accentSoft : c.surface}}>
        <View style={{width: 36, height: 48, borderRadius: 7, overflow: 'hidden', backgroundColor: c.input, alignItems: 'center', justifyContent: 'center'}}>{h.cover ? <Image source={{uri: h.cover}} style={{width: '100%', height: '100%'}} /> : <Icon name={MODELS[h.type]?.icon || 'link'} size={16} color={c.muted} />}</View>
        <View style={{flex: 1}}><Text numberOfLines={1} style={{color: c.text, fontWeight: '600'}}>{h.title}</Text><Text numberOfLines={1} style={{color: c.muted, fontSize: 12}}>{h.sub}</Text></View>{pick === h.key ? <Icon name="check" size={16} color={c.accent} /> : null}
      </Pressable>)}
      {!isUrl ? <Pressable testID="lib-hit-name" accessibilityRole="radio" accessibilityState={{selected: pick === 'name' || !hits.length}} onPress={() => setPick('name')} style={{flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: pick === 'name' || !hits.length ? c.accent : c.line, backgroundColor: pick === 'name' || !hits.length ? c.accentSoft : c.surface}}>
        <View style={{width: 36, height: 36, borderRadius: 8, backgroundColor: c.input, alignItems: 'center', justifyContent: 'center'}}><Icon name="plus" size={16} color={c.muted} /></View>
        <View style={{flex: 1}}><Text style={{color: c.text, fontWeight: '600'}}>Criar só com "{d.raw.trim()}"</Text><Text style={{color: c.muted, fontSize: 12}}>Sem buscar nada</Text></View>
      </Pressable> : null}
    </View> : null}
    {dup ? <View testID="lib-dup" style={{gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.dangerBg}}><Text style={{color: c.text, fontWeight: '600'}}>Já está na Biblioteca: {dup.title}</Text><View style={{flexDirection: 'row', gap: 8}}><GhostButton label="Abrir" onPress={() => onOpenExisting(dup.id)} /><GhostButton label="Salvar mesmo assim" onPress={() => setForceDup(true)} /></View></View> : null}
    {/* passo 6: na janela so o essencial */}
    <FieldRow label="Tipo" top><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
      {(otherTypes ? visibleTypes : firstTypes).map(x => <Chip key={x.id} icon={x.icon} label={x.one} selected={f0.type === x.id} onPress={() => { typed.current = true; set({type: x.id, status: 0}); setOtherTypes(false); }} />)}
      <Chip label={otherTypes ? 'Menos' : 'Outro…'} onPress={() => setOtherTypes(v => !v)} />
      {otherTypes ? <Chip icon="plus" label="Novo tipo" dashed onPress={onNewType} /> : null}
    </View></FieldRow>
    {t.statuses.length > 1 ? <FieldRow label="Status"><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{t.statuses.map((s, i) => <Chip key={s} label={s} selected={d.status === i} onPress={() => set({status: i})} />)}</View></FieldRow> : null}
    <FieldRow label="Etiquetas" top><TagEditor tags={d.tags} options={tagsFor(t.id)} onChange={tags => set({tags})} /></FieldRow>
    <FieldRow label="Com o app" top><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
      {(f0.url && (t.id === 'product' || chosen?.price != null) ? [['monitor', 'chartBar', 'Monitorar preço']] : []).concat([['schedule', 'calendar', 'Agendar'], ['remind', 'bell', 'Lembrar'], ['page', 'book', 'Abrir como página']]).map(([k, ic, lb]) => <Chip key={k} icon={ic as IconName} label={lb} selected={d.actions.includes(k)} onPress={() => set({actions: d.actions.includes(k) ? d.actions.filter(x => x !== k) : [...d.actions, k]})} />)}
    </View></FieldRow>
    {d.actions.includes('schedule') || d.actions.includes('remind') ? <DateTimeField label="Quando (agenda e lembrete)" value={when} onChange={setWhen} emptyLabel="Amanhã" /> : null}
    <Pressable accessibilityRole="button" accessibilityState={{expanded: more}} onPress={() => setMore(v => !v)} style={{flexDirection: 'row', alignItems: 'center', gap: 6}}><View style={{transform: [{rotate: more ? '90deg' : '0deg'}]}}><Icon name="chevron" size={13} color={c.accent} /></View><Text style={{color: c.accent, fontWeight: '500'}}>Mais detalhes</Text></Pressable>
    {more ? <View style={{gap: 10}}>
      <FieldRow label="Ano"><Input value={d.year} onChangeText={v => set({year: v.replace(/\D/g, '').slice(0, 4)})} placeholder="Ex.: 2021" keyboardType="number-pad" /></FieldRow>
      <FieldRow label="Autor / direção"><Input value={d.creator} onChangeText={v => set({creator: v})} /></FieldRow>
      {!isUrl ? <FieldRow label="Link"><Input value={d.url} onChangeText={v => set({url: v})} placeholder="https://" autoCapitalize="none" /></FieldRow> : null}
      {t.fields.filter(f => !['Direção', 'Autor', 'Canal', 'Artista'].includes(f)).map(f => <FieldRow key={f} label={f}><Input value={d.extra[f] || ''} onChangeText={v => set({extra: {...d.extra, [f]: v}})} /></FieldRow>)}
      <FieldRow label="Anotações" top><Input value={d.notes} onChangeText={v => set({notes: v})} multiline style={{minHeight: 70, textAlignVertical: 'top'}} /></FieldRow>
    </View> : null}
  </Dialog>;
}

/* ---------- painel do item (editar: um campo por coisa, salva sozinho) ---------- */
function ItemPanel({it, t, types, tagsFor, onClose, onChange, onDelete, onAction, onMenu}: {it: Item; t: TypeDef; types: TypeDef[]; tagsFor: (t: string | null) => string[]; onClose: () => void; onChange: (p: Partial<Item>) => void; onDelete: () => void; onAction: (a: string, when?: string) => void; onMenu: (e: any) => void}) {
  const c = useTheme(), [title, setTitle] = useState(it.title), [notes, setNotes] = useState(it.notes), [url, setUrl] = useState(it.url), [extra, setExtra] = useState(it.extra), [allTypes, setAllTypes] = useState(false);
  const typeList = [...new Map([...types, ...Object.keys(MODELS).filter(k => k !== 'blank').map(k => ({...MODELS[k], id: k} as any))].map(x => [x.id, x] as const)).values()] as TypeDef[];
  return <Panel visible onClose={onClose} width={520} testID="lib-item-panel" title={<View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>{t.one}{it.statusOn ? ' · ' + t.statuses[it.status] + ' em ' + it.statusOn.split('-').reverse().join('/') : ''}</Text><Pressable accessibilityRole="button" accessibilityLabel="Mais opções" onPress={onMenu} style={{width: 32, height: 32, alignItems: 'center', justifyContent: 'center'}}><Icon name="more" size={18} color={c.muted} /></Pressable></View>}>
    <View style={{flexDirection: 'row', gap: 14, alignItems: 'flex-start'}}>
      {it.cover ? <Image source={{uri: it.cover}} style={{width: 72, height: 100, borderRadius: 10}} /> : null}
      <TextInput accessibilityLabel="Nome" value={title} onChangeText={setTitle} onBlur={() => title.trim() && title !== it.title && onChange({title: title.trim()})} multiline style={{flex: 1, color: c.text, fontSize: 20, fontWeight: '700'}} />
    </View>
    <FieldRow label="Tipo" top><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{(allTypes ? typeList : [t]).map(x => <Chip key={x.id} icon={x.icon} label={x.one || x.name} selected={x.id === it.type} onPress={() => { if (x.id !== it.type) onChange({type: x.id, status: 0}); setAllTypes(false); }} />)}<Chip label={allTypes ? 'Menos' : 'Trocar'} onPress={() => setAllTypes(v => !v)} /></View></FieldRow>
    {t.statuses.length > 1 ? <FieldRow label="Status"><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 0, borderRadius: 10, borderWidth: 1, borderColor: c.line, overflow: 'hidden', alignSelf: 'flex-start'}}>{t.statuses.map((s, i) => <Pressable key={s} accessibilityRole="button" accessibilityState={{selected: it.status === i}} onPress={() => onChange({status: i, statusOn: i === t.statuses.length - 1 ? new Date().toISOString().slice(0, 10) : ''})} style={{paddingHorizontal: 12, paddingVertical: 8, backgroundColor: it.status === i ? c.accentSoft : c.surface, borderLeftWidth: i ? 1 : 0, borderColor: c.line}}><Text style={{color: it.status === i ? c.accent : c.text, fontWeight: it.status === i ? '600' : '400'}}>{s}</Text></Pressable>)}</View></FieldRow> : null}
    {t.rating ? <FieldRow label="Nota"><Stars value={it.rating} onChange={rating => onChange({rating})} /></FieldRow> : null}
    <FieldRow label="Etiquetas" top><TagEditor tags={it.tags} options={tagsFor(it.type)} onChange={tags => onChange({tags})} /></FieldRow>
    {t.fields.map(f => <FieldRow key={f} label={f}><Input value={extra[f] ?? (f === 'Direção' || f === 'Autor' || f === 'Canal' || f === 'Artista' ? it.creator : '')} onChangeText={v => setExtra(x => ({...x, [f]: v}))} onBlur={() => onChange({extra, ...(f === 'Direção' || f === 'Autor' || f === 'Canal' || f === 'Artista' ? {creator: extra[f] || ''} : {})})} /></FieldRow>)}
    <FieldRow label="Link"><Input value={url} onChangeText={setUrl} onBlur={() => url !== it.url && onChange({url: url.trim(), site: host(url.trim())})} placeholder="https://" autoCapitalize="none" /></FieldRow>
    {it.fileName ? <FieldRow label="Arquivo"><Text style={{color: it.fileError ? c.danger : c.text}}>{it.fileName}{it.fileError === 'enviando' ? ' · enviando' : it.fileError ? ' · não enviado' : ' · no seu Drive'}</Text></FieldRow> : null}
    <FieldRow label="Anotações" top><Input value={notes} onChangeText={setNotes} onBlur={() => notes !== it.notes && onChange({notes})} multiline style={{minHeight: 110, textAlignVertical: 'top'}} placeholder="O que achou, onde ver, lembrar de…" /></FieldRow>
    <FieldRow label="Com o app" top><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
      {it.url && (t.id === 'product' || !!it.links.monitor) ? <Chip icon="chartBar" label={it.links.monitor ? 'Monitorando preço' : 'Monitorar preço'} selected={!!it.links.monitor} onPress={() => !it.links.monitor && onAction('monitor')} /> : null}
      <Chip icon="calendar" label={it.links.task ? 'Na agenda' : 'Agendar'} selected={!!it.links.task} onPress={() => !it.links.task && onAction('schedule')} />
      <Chip icon="bell" label={it.links.reminder ? 'Lembrete criado' : 'Lembrar'} selected={!!it.links.reminder} onPress={() => !it.links.reminder && onAction('remind')} />
      <Chip icon="book" label={it.links.page ? 'Página criada' : 'Abrir como página'} selected={!!it.links.page} onPress={() => !it.links.page && onAction('page')} />
    </View></FieldRow>
    <Pressable accessibilityRole="button" onPress={onDelete} style={{alignSelf: 'flex-start', paddingVertical: 8}}><Text style={{color: c.danger}}>Excluir item</Text></Pressable>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}><Icon name="check" size={13} color={c.muted} /><Text style={{color: c.muted, fontSize: 12}}>Salva sozinho</Text></View>
  </Panel>;
}
function TypeDialog({edit, onClose, onSave, onDelete}: {edit: TypeDef | null; onClose: () => void; onSave: (name: string, icon: IconName, model: string, statuses: string[], rating: boolean, fields: string[]) => void; onDelete?: () => void}) {
  const c = useTheme(), [model, setModel] = useState(edit?.builtin || 'blank'), base = MODELS[model] || MODELS.blank;
  const [name, setName] = useState(edit?.name || ''), [icon, setIcon] = useState<IconName>(edit?.icon || base.icon), [statuses, setStatuses] = useState((edit?.statuses || base.statuses).join(', ')), [rating, setRating] = useState(edit ? edit.rating : base.rating), [fields, setFields] = useState((edit?.fields || base.fields).join(', '));
  const pickModel = (m: string) => { setModel(m); const b = MODELS[m]; setIcon(b.icon); setStatuses(b.statuses.join(', ')); setRating(b.rating); setFields(b.fields.join(', ')); if (!name.trim() || Object.values(MODELS).some(x => x.name === name)) setName(m === 'blank' ? '' : b.name); };
  const split = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean).slice(0, 6);
  const go = () => { if (name.trim()) onSave(name.trim().slice(0, 60), icon, model, split(statuses).length ? split(statuses) : ['Salvo'], rating, split(fields)); };
  return <Dialog visible onClose={onClose} title={edit ? 'Editar tipo' : 'Novo tipo'} footer={<>{onDelete ? <Pressable accessibilityRole="button" onPress={onDelete} style={{marginRight: 'auto', justifyContent: 'center'}}><Text style={{color: c.danger}}>Excluir tipo</Text></Pressable> : null}<GhostButton label="Cancelar" onPress={onClose} /><PrimaryButton label="Salvar" disabled={!name.trim()} onPress={go} /></>}>
    {edit ? null : <View style={{gap: 6}}><Text style={{color: c.muted, fontSize: 12}}>Começar de um modelo</Text><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{NEW_MODELS.map(m => <Chip key={m} icon={MODELS[m].icon} label={MODEL_LABEL[m]} selected={model === m} onPress={() => pickModel(m)} />)}</View></View>}
    <FieldRow label="Nome"><Input autoFocus value={name} onChangeText={setName} placeholder="Ex.: Fotógrafos, Vinhos, Jogos" /></FieldRow>
    <FieldRow label="Status" top><Input value={statuses} onChangeText={setStatuses} placeholder="Palavras em ordem, separadas por vírgula" /></FieldRow>
    <FieldRow label="Nota"><Pressable accessibilityRole="switch" accessibilityState={{checked: rating}} onPress={() => setRating(!rating)} style={{width: 40, height: 24, borderRadius: 12, backgroundColor: rating ? c.accent : c.line, padding: 3, alignItems: rating ? 'flex-end' : 'flex-start'}}><View style={{width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff'}} /></Pressable></FieldRow>
    <FieldRow label="Campos" top><Input value={fields} onChangeText={setFields} placeholder="Campos extras, ex.: Cidade, Preço (até 6)" /></FieldRow>
    <Text style={{color: c.muted, fontSize: 12}}>Ícone</Text><IconPicker value={icon} onChange={setIcon} />
  </Dialog>;
}
