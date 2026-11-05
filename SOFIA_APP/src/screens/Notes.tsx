import {useLiveReload} from '../lib/live-reload';
import {dpx} from '../lib/content-width';
// 0.3.269 — Notas redesenhadas (protótipo aprovado em 31/10, docs/prototipos-2026-10-31/notas.html), web e celular.
// Sai: Estado, Área, Privacidade, Contexto e "etiquetas por vírgula". Fica: etiquetas (com cor) + fixar/arquivar.
// Etiquetas continuam nas notas como "cat:Nome" (compatível com as notas antigas); a cor e a senha ficam num note_tag.
// Etiqueta com senha: as notas dela ficam cifradas no aparelho (lib/note-crypto) e não aparecem fora dela.
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {useTheme} from '../lib/theme';
import {PALETTE} from '../lib/palette';
import {useDesktop} from '../lib/desktop';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {errorText} from '../lib/chat-model';
import {appAlert} from '../lib/app-alert';
import {newLock, open as openSealed, seal, unlock, type LockInfo, type Sealed} from '../lib/note-crypto';
import {Icon} from '../components/Icon';
import {IconButton} from '../components/UI';
import {InternalBackGesture} from '../components/InternalBackGesture';
import {Presence} from '../components/Presence';
import {contextMenu} from '../components/ContextMenu';
import {BarPill, DropPanel, PanelRow, ResultLine} from '../components/FilterBar';
import {AppFrame, NavTabs, Chip, Dialog, GhostButton, Input, Panel, PrimaryButton, SideItem, SideLabel, fold, openMore, useToast, AppSkeleton} from '../components/AppKit';

const COLORS = ['#b49ae6', '#7f9ad8', '#7fcf9f', '#e8b04a', '#e08ad0', '#7fc0c9', '#f0997b', '#a3a0ad'];
const LOCKED_TITLE = 'Nota protegida';
const IDLE_MS = 5 * 60e3;
type Note = {id: string; e: Entity; title: string; body: string; tags: string[]; pinned: boolean; archived: boolean; updated: string; created: string; lockTag: string; enc: Sealed | null};
type Tag = {key: string; name: string; color: string; e: Entity | null; lock: LockInfo | null};
type View_ = 'all' | 'pinned' | 'archived' | string; // 'tag:<chave>'
const tagKey = (name: string) => fold(name);
const tagsOf = (e: Entity) => (e.tags || []).filter(t => t.startsWith('cat:')).map(t => t.slice(4).trim()).filter(Boolean);
const rel = (iso: string) => { const d = new Date(iso), diff = Date.now() - d.getTime(); if (!Number.isFinite(diff)) return ''; if (diff < 60e3) return 'agora'; if (diff < 36e5) return Math.round(diff / 60e3) + ' min'; if (diff < 864e5) return Math.round(diff / 36e5) + ' h'; if (diff < 7 * 864e5) return d.toLocaleDateString('pt-BR', {weekday: 'long'}).split('-')[0]; return d.toLocaleDateString('pt-BR', {day: '2-digit', month: 'short'}).replace('.', ''); };
async function listAll(api: SofiaApi, kind: string) { const all: Entity[] = []; for (let o = 0; ; o += 100) { const r = await api.entities(kind, '', o); all.push(...r.items); if (r.items.length < 100) break; } return all; }
export function splitTags(raw: string): {title: string; tags: string[]} { const tags: string[] = []; const title = raw.replace(/(^|\s)#([^\s#]+)/g, (_, sp, t) => { tags.push(t.replace(/[_-]+/g, ' ')); return sp; }).replace(/\s+/g, ' ').trim(); return {title, tags}; }

export function Notes({api, active, onBack}: {api: SofiaApi; active: boolean; onBack: () => void}) {
  const c = useTheme(), desktop = useDesktop(), {toast, toastNode} = useToast();
  const [notesE, setNotesE] = useState<Entity[] | null>(null), [tagsE, setTagsE] = useState<Entity[]>([]), [error, setError] = useState('');
  const [view, setView] = useState<View_>('all'), [query, setQuery] = useState(''), [sort, setSort] = useState<'recent' | 'created' | 'az'>('recent');
  // 03/11/2026: no celular a area sai da fileira de chips e vai para a barra [Area ⌄] (lista que desce logo abaixo); busca pela lupa do topo
  const [areaOpen, setAreaOpen] = useState(false), [searchOpen, setSearchOpen] = useState(false), [orderOpen, setOrderOpen] = useState(false);
  const [draft, setDraft] = useState(''), [openId, setOpenId] = useState<string | null>(null), [tagDialog, setTagDialog] = useState<{tag: Tag | null} | null>(null);
  const keys = useRef(new Map<string, Uint8Array>()), [, bump] = useState(0), [plain, setPlain] = useState<Record<string, {title: string; body: string}>>({});
  const lastAct = useRef(Date.now()); const touch = () => { lastAct.current = Date.now(); };

  const load = useCallback(async () => {
    // 0.3.300 (Pedro: "notas do app nao aparecem no site"): o app Notas mostrava so as anotacoes; as ideias e os
    // aprendizados (que a Sofia salva pela conversa e o app antigo do celular mostrava em Notas) ficavam de fora.
    try { const [a, i, l, t] = await Promise.all([listAll(api, 'annotation'), listAll(api, 'idea'), listAll(api, 'lesson_learned'), listAll(api, 'note_tag')]); setNotesE([...a, ...i, ...l]); setTagsE(t); setError(''); }
    catch (e) { setError(errorText(e)); setNotesE(x => x || []); }
  }, [api]);
  useEffect(() => { if (active) void load(); }, [active, load]);
  useLiveReload(load, active); // 0.3.285: o que mudar no celular aparece aqui sem recarregar a pagina (e vice-versa)
  const patchLocal = (e: Entity) => { if (e.kind === 'note_tag') setTagsE(l => l.some(x => x.id === e.id) ? l.map(x => x.id === e.id ? e : x) : [...l, e]); else setNotesE(l => (l || []).some(x => x.id === e.id) ? (l || []).map(x => x.id === e.id ? e : x) : [...(l || []), e]); };
  async function save(e: Partial<Entity>, quiet = false) { try { const s = await api.saveEntity(e); patchLocal(s); return s; } catch (err) { if (!quiet) toast(errorText(err)); return null; } }

  /* ---------- modelo ---------- */
  const tags: Tag[] = useMemo(() => {
    const m = new Map<string, Tag>();
    tagsE.filter(t => t.state !== 'archived').forEach((t, i) => { let lock: LockInfo | null = null; try { lock = t.data?.lock_json ? JSON.parse(String(t.data.lock_json)) : null; } catch { lock = null; } m.set(tagKey(t.title), {key: tagKey(t.title), name: t.title, color: String(t.data?.color || '') || COLORS[i % COLORS.length], e: t, lock}); });
    for (const n of notesE || []) for (const name of [...tagsOf(n), ...(n.data?.lock_tag ? [String(n.data.lock_tag)] : [])]) if (!m.has(tagKey(name))) m.set(tagKey(name), {key: tagKey(name), name, color: COLORS[m.size % COLORS.length], e: null, lock: null});
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [tagsE, notesE]);
  const tagBy = (name: string) => tags.find(t => t.key === tagKey(name));
  const notes: Note[] = useMemo(() => (notesE || []).map(e => {
    let enc: Sealed | null = null; try { enc = e.data?.enc_json ? JSON.parse(String(e.data.enc_json)) : null; } catch { enc = null; }
    const p = plain[e.id];
    return {id: e.id, e, title: enc ? (p?.title ?? '') : e.title, body: enc ? (p?.body ?? '') : String(e.content || ''), tags: [...tagsOf(e), ...(e.kind === 'idea' && !tagsOf(e).some(x => fold(x) === 'ideia') ? ['Ideia'] : e.kind === 'lesson_learned' ? ['Aprendizado'] : [])], pinned: !!e.data?.pinned, archived: e.state === 'archived', updated: String(e.updated_at || e.created_at || ''), created: String(e.created_at || ''), lockTag: String(e.data?.lock_tag || ''), enc};
  }), [notesE, plain]);
  const curTag = view.startsWith('tag:') ? tags.find(t => t.key === view.slice(4)) || null : null;
  const unlocked = (k: string) => keys.current.has(k);
  // notas protegidas so aparecem dentro da propria etiqueta, e so depois de abrir com a senha
  const visible = notes.filter(n => {
    if (n.lockTag) { if (!curTag || tagKey(n.lockTag) !== curTag.key || !unlocked(curTag.key)) return false; }
    if (view === 'archived') return n.archived; if (n.archived) return false;
    if (view === 'pinned') return n.pinned; if (curTag) return n.tags.some(t => tagKey(t) === curTag.key) || tagKey(n.lockTag) === curTag.key;
    return true;
  }).filter(n => !query.trim() || fold(n.title + ' ' + n.body + ' ' + n.tags.join(' ')).includes(fold(query)))
    .sort((a, b) => sort === 'az' ? a.title.localeCompare(b.title, 'pt-BR') : sort === 'created' ? b.created.localeCompare(a.created) : b.updated.localeCompare(a.updated));
  const countPlain = (f: (n: Note) => boolean) => notes.filter(n => !n.lockTag && !n.archived && f(n)).length;
  const open = notes.find(n => n.id === openId) || null;

  /* ---------- protecao ---------- */
  async function decryptAll(k: string, key: Uint8Array) {
    const out: Record<string, {title: string; body: string}> = {};
    for (const n of notes) if (n.enc && tagKey(n.lockTag) === k) { try { out[n.id] = openSealed(key, n.enc); } catch { /* nota de outra senha */ } }
    setPlain(p => ({...p, ...out}));
  }
  function lockTag(k: string) { if (!keys.current.has(k)) return; keys.current.delete(k); setPlain(p => { const n2 = {...p}; for (const n of notes) if (tagKey(n.lockTag) === k) delete n2[n.id]; return n2; }); if (open && tagKey(open.lockTag) === k) setOpenId(null); bump(x => x + 1); }
  const lockAll = () => { for (const k of [...keys.current.keys()]) lockTag(k); };
  useEffect(() => { const t = setInterval(() => { if (keys.current.size && Date.now() - lastAct.current > IDLE_MS) { lockAll(); toast('Etiquetas protegidas trancadas por inatividade.'); } }, 20e3); return () => clearInterval(t); });
  useEffect(() => { if (!active) lockAll(); }, [active]); // sair de Notas tranca
  async function sealNote(n: Note | Entity, lockName: string, title: string, body: string): Promise<Partial<Entity> | null> {
    const key = keys.current.get(tagKey(lockName)); if (!key) return null;
    const e = (n as Note).e || (n as Entity);
    return {...e, title: LOCKED_TITLE, content: '', data: {...(e.data || {}), lock_tag: lockName, enc_json: JSON.stringify(seal(key, {title, body}))}};
  }

  /* ---------- acoes ---------- */
  const go = (v: View_) => { if (curTag && unlocked(curTag.key) && v !== view) lockTag(curTag.key); setView(v); setQuery(''); setOpenId(null); touch(); };
  async function create(raw: string, openAfter = true) {
    const {title, tags: tg} = splitTags(raw); if (!title) return;
    const all = [...new Set([...(curTag ? [curTag.name] : []), ...tg.map(t => tagBy(t)?.name || t)])];
    const locked = all.map(tagBy).find(t => t?.lock);
    if (locked && !unlocked(locked.key)) { toast('Abra "' + locked.name + '" com a senha antes de criar notas nela.'); return; }
    let body: Partial<Entity> = {kind: 'annotation', title: title.slice(0, 240), content: '', area: 'Pessoal', privacy: 'private', state: 'saved', tags: all.map(t => 'cat:' + t), data: {pinned: view === 'pinned'}};
    if (locked) { const s = await sealNote(body as Entity, locked.name, title, ''); if (s) body = s; }
    const saved = await save(body); if (!saved) return;
    if (locked) setPlain(p => ({...p, [saved.id]: {title, body: ''}}));
    if (locked && curTag?.key !== locked.key) toast('Nota guardada em "' + locked.name + '", protegida. Ela só aparece lá.');
    else if (openAfter) setOpenId(saved.id);
  }
  async function update(n: Note, patch: {title?: string; body?: string; tags?: string[]; pinned?: boolean; archived?: boolean}) {
    touch();
    const title = patch.title ?? n.title, bodyTxt = patch.body ?? n.body, tg = patch.tags ?? n.tags;
    let e: Partial<Entity> = {...n.e, tags: tg.map(t => 'cat:' + t), state: patch.archived === undefined ? n.e.state : patch.archived ? 'archived' : 'saved', data: {...n.e.data, pinned: patch.pinned ?? n.pinned}, revision: n.e.revision};
    if (n.lockTag || n.enc) { const s = await sealNote({...n, e: e as Entity}, n.lockTag, title, bodyTxt); if (!s) { toast('Abra a etiqueta protegida para editar.'); return; } e = s; setPlain(p => ({...p, [n.id]: {title, body: bodyTxt}})); }
    else { e.title = (title.trim() || 'Sem título').slice(0, 240); e.content = bodyTxt; }
    patchLocal(e as Entity); await save(e, true);
  }
  async function remove(n: Note) {
    setOpenId(null); setNotesE(l => (l || []).filter(x => x.id !== n.id));
    try { await api.deleteEntity(n.id); toast('Nota excluída.', [{label: 'Desfazer', run: () => { const {id: _i, revision: _r, ...rest} = n.e as any; void save(rest); }}]); } catch (e) { toast(errorText(e)); void load(); }
  }
  function closeNote() { if (open && !open.title.trim() && !open.body.trim()) void api.deleteEntity(open.id).then(() => setNotesE(l => (l || []).filter(x => x.id !== open.id))).catch(() => {}); setOpenId(null); } // nota vazia e descartada
  async function noteMenu(e: any, n: Note) {
    openMore(e, n.title || 'Nota', [
      {label: 'Abrir como página', icon: 'book', run: () => void (async () => { const blocks = n.body.split(/\n{2,}/).filter(Boolean).map((t, i) => ({id: 'b' + Date.now() + i, type: 'text', text: t})); const pg = await save({kind: 'user_page', title: n.title || 'Sem título', content: n.body, area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {node_type: 'space', blocks_json: JSON.stringify(blocks)}}); if (pg) toast('Página "' + pg.title + '" criada em Páginas.'); })()},
      {label: 'Criar tarefa', icon: 'checklist', run: () => void api.saveTask({title: n.title || 'Sem título', state: 'todo', description: n.body.slice(0, 4000)}).then(() => toast('Tarefa criada em Tarefas.')).catch(err => toast(errorText(err)))},
      {label: 'Lembrar amanhã às 9:00', icon: 'bell', run: () => void (async () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); const r = await save({kind: 'reminder', title: n.title || 'Nota', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {remind_at: d.toISOString(), message: n.lockTag ? '' : n.body.slice(0, 300), location: ''}}); if (r) toast('Lembrete criado para amanhã às 9:00.', [{label: 'Desfazer', run: () => void api.deleteEntity(r.id)}]); })()},
      {label: 'Copiar', icon: 'copy', run: () => void Clipboard.setStringAsync((n.title ? n.title + '\n\n' : '') + n.body).then(() => toast('Nota copiada.'))},
      {label: n.pinned ? 'Desafixar' : 'Fixar', icon: 'pin', run: () => void update(n, {pinned: !n.pinned})},
      {label: n.archived ? 'Desarquivar' : 'Arquivar', icon: 'box', run: () => { void update(n, {archived: !n.archived}); if (!n.archived) { setOpenId(null); toast('Nota arquivada.', [{label: 'Desfazer', run: () => void update({...n, archived: true}, {archived: false})}]); } }},
      {label: 'Excluir', icon: 'trash', danger: true, run: () => void remove(n)},
    ]);
  }
  async function saveTag(prev: Tag | null, name: string, color: string, password: string | null, removeLock: boolean) {
    touch();
    const nameClean = name.trim().slice(0, 60); if (!nameClean) return;
    if (prev && prev.lock && !unlocked(prev.key) && (removeLock || tagKey(nameClean) !== prev.key)) { toast('Abra a etiqueta com a senha antes de mudar isso.'); return; }
    let lockJson = prev?.e?.data?.lock_json || '';
    let key: Uint8Array | null = prev ? keys.current.get(prev.key) || null : null;
    if (password) { const made = await newLock(password); lockJson = JSON.stringify(made.lock); key = made.key; }
    if (removeLock) lockJson = '';
    const ent = prev?.e ? await save({...prev.e, title: nameClean, data: {...prev.e.data, color, lock_json: lockJson}, revision: prev.e.revision}) : await save({kind: 'note_tag', title: nameClean, content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {color, lock_json: lockJson}});
    if (!ent) return;
    const k = tagKey(nameClean); if (prev && prev.key !== k) keys.current.delete(prev.key); if (key && lockJson) keys.current.set(k, key);
    // renomear: as notas acompanham; proteger: as notas da etiqueta passam a ser cifradas; tirar a senha: voltam a ser texto
    for (const n of notes) {
      const has = prev && (n.tags.some(t => tagKey(t) === prev.key) || tagKey(n.lockTag) === prev.key); if (!has && !(password && n.tags.some(t => tagKey(t) === k))) continue;
      const tg = n.tags.map(t => prev && tagKey(t) === prev.key ? nameClean : t);
      let e: Partial<Entity> = {...n.e, tags: tg.map(t => 'cat:' + t), revision: n.e.revision};
      if (removeLock && tagKey(n.lockTag) === (prev?.key || k)) e = {...e, title: n.title || 'Sem título', content: n.body, data: {...n.e.data, lock_tag: '', enc_json: ''}};
      else if (lockJson && key && !n.lockTag) e = {...e, title: LOCKED_TITLE, content: '', data: {...n.e.data, lock_tag: nameClean, enc_json: JSON.stringify(seal(key, {title: n.title, body: n.body}))}};
      else if (n.lockTag && prev && tagKey(n.lockTag) === prev.key) e = {...e, data: {...n.e.data, lock_tag: nameClean}};
      await save(e, true);
      if (lockJson && key && !removeLock) setPlain(p => ({...p, [n.id]: {title: n.title, body: n.body}}));
    }
    setTagDialog(null); if (!prev) setView('tag:' + k);
    if (password) toast('"' + nameClean + '" agora é protegida por senha.'); else if (removeLock) toast('Senha removida. As notas voltam a aparecer normalmente.');
  }
  async function deleteTag(t: Tag) {
    if (t.lock && !unlocked(t.key)) { toast('Abra a etiqueta com a senha antes de excluir.'); return; }
    const affected = notes.filter(n => n.tags.some(x => tagKey(x) === t.key) || tagKey(n.lockTag) === t.key), before = affected.map(n => n.e);
    setTagDialog(null); setView('all');
    for (const n of affected) await save({...n.e, title: n.lockTag ? n.title || 'Sem título' : n.e.title, content: n.lockTag ? n.body : n.e.content, tags: n.tags.filter(x => tagKey(x) !== t.key).map(x => 'cat:' + x), data: {...n.e.data, ...(tagKey(n.lockTag) === t.key ? {lock_tag: '', enc_json: ''} : {})}, revision: n.e.revision}, true);
    if (t.e) await save({...t.e, state: 'archived', revision: t.e.revision}, true);
    keys.current.delete(t.key);
    toast('Etiqueta "' + t.name + '" excluída.', [{label: 'Desfazer', run: () => void (async () => {
      if (t.e) { const cur = tagsE.find(x => x.id === t.e!.id) || t.e; await save({...cur, state: 'active', revision: cur.revision}, true); }
      for (const e of before) { const cur = (notesE || []).find(x => x.id === e.id) || e; await save({...e, revision: cur.revision}, true); }
      void load();
    })()}]);
  }

  /* ---------- tela ---------- */
  const sidebar = <>
    <SideItem testID="notes-nav-all" icon="note" label="Todas" count={countPlain(() => true)} selected={view === 'all'} onPress={() => go('all')} />
    <SideItem testID="notes-nav-pinned" icon="pin" label="Fixadas" count={countPlain(n => n.pinned)} selected={view === 'pinned'} onPress={() => go('pinned')} />
    <SideItem testID="notes-nav-archived" icon="box" label="Arquivadas" count={notes.filter(n => n.archived && !n.lockTag).length} selected={view === 'archived'} onPress={() => go('archived')} />
    <SideLabel>Etiquetas</SideLabel>
    {tags.map(t => <SideItem key={t.key} testID={'notes-tag-' + t.key} dot={t.color} label={t.name} selected={view === 'tag:' + t.key} onPress={() => go('tag:' + t.key)}
      count={t.lock ? undefined : countPlain(n => n.tags.some(x => tagKey(x) === t.key))}
      trailing={t.lock ? <Icon name="lock" size={13} color={unlocked(t.key) ? c.accent : c.muted} /> : null}
      onContextMenu={contextMenu(() => [{label: 'Editar etiqueta', icon: 'edit', run: () => setTagDialog({tag: t})}, {label: 'Excluir', icon: 'trash', danger: true, run: () => void deleteTag(t)}])} />)}
    <Pressable accessibilityRole="button" onPress={() => setTagDialog({tag: null})} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32, paddingLeft: 12, borderRadius: 9, backgroundColor: hovered ? c.line + '80' : 'transparent'})}><Icon name="plus" size={13} color={c.muted} /><Text style={{color: c.muted, fontSize: 13}}>Nova etiqueta</Text></Pressable>
  </>;
  const mobileNav = <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{flexGrow: 0}} contentContainerStyle={{gap: 8, paddingHorizontal: 16, paddingVertical: 10}}>
    <Chip label="Todas" selected={view === 'all'} onPress={() => go('all')} /><Chip icon="pin" label="Fixadas" selected={view === 'pinned'} onPress={() => go('pinned')} /><Chip icon="box" label="Arquivadas" selected={view === 'archived'} onPress={() => go('archived')} />
    {tags.map(t => <Chip key={t.key} dot={t.color} icon={t.lock ? 'lock' : undefined} label={t.name} selected={view === 'tag:' + t.key} onPress={() => go('tag:' + t.key)} />)}
    <Chip icon="plus" label="Etiqueta" dashed onPress={() => setTagDialog({tag: null})} />
  </ScrollView>;
  const title = curTag ? curTag.name : view === 'pinned' ? 'Fixadas' : view === 'archived' ? 'Arquivadas' : 'Notas';
  const lockedView = !!(curTag?.lock && !unlocked(curTag.key));
  function Card({n, first}: {n: Note; first?: boolean}) {
    return <Pressable testID={'note-card-' + n.id} accessibilityRole="button" accessibilityLabel={'Abrir nota ' + n.title} onPress={() => { touch(); setOpenId(n.id); }} {...contextMenu(() => [{label: 'Abrir', icon: 'edit', run: () => setOpenId(n.id)}, {label: n.pinned ? 'Desafixar' : 'Fixar', icon: 'pin', run: () => void update(n, {pinned: !n.pinned})}, {label: n.archived ? 'Desarquivar' : 'Arquivar', icon: 'box', run: () => void update(n, {archived: !n.archived})}, {label: 'Excluir', icon: 'trash', danger: true, run: () => void remove(n)}])}
      style={({hovered}: any) => (desktop ? {gap: 4, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderColor: c.line, backgroundColor: hovered ? c.input : 'transparent'} : {gap: 6, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: hovered ? c.accent + '55' : c.line, backgroundColor: c.surface})}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>{n.pinned ? <Icon name="pin" size={13} color={c.accent} /> : null}<Text numberOfLines={1} style={{flexShrink: 1, color: c.text, fontSize: 14, fontWeight: '600'}}>{n.title || 'Sem título'}</Text><Text style={{color: c.muted, fontSize: 12}}>{rel(n.updated)}</Text></View>
      {n.body.trim() ? <Text numberOfLines={desktop ? 1 : 3} style={{color: c.muted, fontSize: 13, lineHeight: 19}}>{n.body.replace(/\n+/g, '  ')}</Text> : null}
      {n.tags.length ? <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{n.tags.map(t => { const tg = tagBy(t); return <Pressable key={t} accessibilityRole="button" accessibilityLabel={'Filtrar por ' + t} onPress={() => go('tag:' + tagKey(t))} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: c.input}}><View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: tg?.color || c.muted}} /><Text style={{color: c.muted, fontSize: 12}}>{tg?.name || t}</Text></Pressable>; })}</View> : null}
    </Pressable>;
  }
  const pinned = visible.filter(n => n.pinned && view !== 'pinned'), rest = visible.filter(n => !(n.pinned && view !== 'pinned'));
  if (!notesE) return <AppSkeleton label="Carregando notas…" />;
  return <InternalBackGesture enabled={active && !openId && !tagDialog} onBack={onBack}>
    <View testID="notes-screen" style={{flex: 1}} onTouchStart={touch} {...({onMouseMove: touch, onKeyDown: touch} as any)}>
      <AppFrame tabsOnTop sidebar={sidebar} mobileNav={desktop ? mobileNav : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{...(desktop ? {paddingLeft: dpx(40), paddingRight: dpx(40), paddingTop: dpx(32), maxWidth: 1160, width: '100%', alignSelf: 'flex-start'} : {paddingHorizontal: 16, paddingTop: 6}) as any, paddingBottom: 40, gap: 12}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
            {!desktop ? <IconButton name="back" label="Voltar aos apps" onPress={onBack} /> : null}
            <View style={{flex: 1}}>
              <Text accessibilityRole="header" style={{color: c.text, fontSize: 28, fontWeight: '600', letterSpacing: -1}}>Notas</Text>
              {desktop ? <Text style={{color: c.muted, fontSize: desktop ? 14 : 13, marginTop: desktop ? 4 : 0}}>{curTag?.lock && !lockedView ? 'Criptografada · tranca ao sair ou após 5 min parado' : lockedView ? 'Protegida por senha' : (desktop ? (visible.length ? (visible.length === 1 ? 'Uma nota' : visible.length + ' notas') + '; a última mexida foi “' + ([...visible].sort((a, b) => String(b.e.updated_at || '').localeCompare(String(a.e.updated_at || '')))[0]?.title || 'sem título') + '”.' : 'Nenhuma nota aqui. Escreva o título abaixo e aperte Enter.') : visible.length + (visible.length === 1 ? ' nota' : ' notas'))}</Text> : null}
            </View>
            {curTag && !lockedView ? <GhostButton icon="edit" label={desktop ? 'Editar etiqueta' : undefined} onPress={() => setTagDialog({tag: curTag})} /> : null}
            {curTag?.lock && !lockedView ? <GhostButton testID="notes-lock-now" icon="lock" label={desktop ? 'Trancar' : undefined} onPress={() => lockTag(curTag.key)} /> : null}
            {!desktop ? <IconButton name="search" label="Buscar nas notas" onPress={() => setSearchOpen(v => {if (v) setQuery(''); return !v;})} /> : null}
          </View>
          {!desktop ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <BarPill testID="notes-area" label={view === 'all' ? 'Todas as áreas' : title} dot={curTag?.color} open={areaOpen} onPress={() => {setOrderOpen(false); setAreaOpen(v => !v);}} />
            <View style={{flex: 1}} />
            <Pressable accessibilityRole="button" accessibilityLabel="Ordem e notas fixadas ou arquivadas" accessibilityState={{expanded: orderOpen}} onPress={() => {setAreaOpen(false); setOrderOpen(v => !v);}} style={{height: 38, justifyContent: 'center'}}><Text style={{color: c.muted, fontSize: 13}}>{sort === 'recent' ? 'Editadas' : sort === 'created' ? 'Criadas' : 'A a Z'} ⌄</Text></Pressable>
          </View> : null}
          {!desktop && areaOpen ? <DropPanel onClose={() => setAreaOpen(false)} title="Áreas" footer={<PanelRow kind="plain" icon="plus" label="Nova área" on={false} onPress={() => { setAreaOpen(false); setTagDialog({tag: null}); }} />}>
            <PanelRow label="Todas as áreas" count={notes.filter(n => !n.archived && !n.lockTag).length} on={view === 'all'} onPress={() => { go('all'); setAreaOpen(false); }} />
            {tags.map(t => <PanelRow key={t.key} label={t.name + (t.lock ? ' · com senha' : '')} dot={t.color} count={notes.filter(n => !n.archived && (n.tags.some(x => tagKey(x) === t.key) || tagKey(n.lockTag) === t.key)).length} on={view === 'tag:' + t.key} onPress={() => { go('tag:' + t.key); setAreaOpen(false); }} />)}
          </DropPanel> : null}
          {/* 03/11/2026 (desenho 24): Fixadas e Arquivadas sairam da lista de areas (recusado misturar); ficam aqui, com a ordem */}
          {!desktop && orderOpen ? <DropPanel onClose={() => setOrderOpen(false)} title="Ordem">
            {([['recent', 'Editadas por último'], ['created', 'Criadas por último'], ['az', 'A a Z']] as const).map(([k, label]) => <PanelRow key={k} label={label} on={sort === k} onPress={() => { setSort(k as any); setOrderOpen(false); }} />)}
            <PanelRow kind="plain" icon="pin" label={'Fixadas · ' + notes.filter(n => n.pinned && !n.archived && !n.lockTag).length} on={view === 'pinned'} onPress={() => { go(view === 'pinned' ? 'all' : 'pinned'); setOrderOpen(false); }} />
            <PanelRow kind="plain" icon="box" label={'Arquivadas · ' + notes.filter(n => n.archived && !n.lockTag).length} on={view === 'archived'} onPress={() => { go(view === 'archived' ? 'all' : 'archived'); setOrderOpen(false); }} />
          </DropPanel> : null}
          {!desktop ? <ResultLine text={visible.length + (visible.length === 1 ? ' nota' : ' notas') + (view === 'pinned' ? ' fixadas' : view === 'archived' ? ' arquivadas' : '')} onClear={view === 'pinned' || view === 'archived' ? () => go('all') : undefined} /> : null}
          {desktop ? <NavTabs nav={mobileNav} /> : null}
          {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
          {lockedView ? <LockScreen tag={curTag!} count={notes.filter(n => tagKey(n.lockTag) === curTag!.key).length} onUnlock={async pw => { const k = await unlock(pw, curTag!.lock!); if (!k) return false; keys.current.set(curTag!.key, k); await decryptAll(curTag!.key, k); bump(x => x + 1); touch(); return true; }} /> : <>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}>
              <Icon name="plus" size={16} color={c.muted} />
              <TextInput testID="notes-new" accessibilityLabel="Nova nota" value={draft} onChangeText={setDraft} placeholder={curTag ? 'Nova nota em ' + curTag.name + ': título e Enter' : 'Nova nota: escreva o título e aperte Enter'} placeholderTextColor={c.muted} submitBehavior="submit"
                onSubmitEditing={() => { const v = draft.trim(); if (!v) return; setDraft(''); void create(v); }} style={{flex: 1, color: c.text, fontSize: 14, paddingVertical: 13}} />
              <Text style={{color: c.muted, fontSize: 12}}>#etiqueta</Text>
            </View>
            {desktop || searchOpen ? <View style={{flexDirection: 'row', gap: 10}}>
              <View style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}><Icon name="search" size={15} color={c.muted} /><TextInput accessibilityLabel="Buscar em Notas" value={query} onChangeText={setQuery} placeholder={'Buscar em ' + title} placeholderTextColor={c.muted} style={{flex: 1, color: c.text, fontSize: 14, paddingVertical: 9}} /></View>
              {desktop ? <GhostButton icon="filter" label={sort === 'recent' ? 'Editadas recentemente' : sort === 'created' ? 'Criadas recentemente' : 'A a Z'} onPress={() => setSort(s => s === 'recent' ? 'created' : s === 'created' ? 'az' : 'recent')} /> : null}
            </View> : null}
            {pinned.length ? <View style={{gap: 8}}><Text style={{color: desktop ? c.text : c.muted, fontSize: desktop ? 16 : 12, fontWeight: desktop ? '600' : '700', paddingHorizontal: desktop ? 0 : 4}}>Fixadas <Text style={{fontWeight: '400', color: c.muted}}>{pinned.length}</Text></Text>{desktop ? <View style={{borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: 'hidden'}}>{pinned.map((n, k) => <Card key={n.id} n={n} first={!k} />)}</View> : pinned.map(n => <Card key={n.id} n={n} />)}</View> : null}
            {rest.length ? <View style={{gap: 8}}>{pinned.length ? <Text style={{color: desktop ? c.text : c.muted, fontSize: desktop ? 16 : 12, fontWeight: desktop ? '600' : '700', paddingHorizontal: desktop ? 0 : 4}}>Notas <Text style={{fontWeight: '400', color: c.muted}}>{rest.length}</Text></Text> : null}{desktop ? <View style={{borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: 'hidden'}}>{rest.map((n, k) => <Card key={n.id} n={n} first={!k} />)}</View> : rest.map(n => <Card key={n.id} n={n} />)}</View> : null}
            {!visible.length ? <Text style={{color: c.muted, textAlign: 'center', paddingVertical: 24}}>{query ? 'Nada encontrado.' : view === 'archived' ? 'Nenhuma nota arquivada.' : 'Nenhuma nota aqui ainda. Escreva o título no campo acima e aperte Enter.'}</Text> : null}
          </>}
        </ScrollView>
      </AppFrame>
      {toastNode}
      <Presence>{open ? <NotePanel key={open.id} n={open} tags={tags} onClose={closeNote} onChange={p => void update(open, p)} onMenu={e => void noteMenu(e, open)} canUseTag={t => !t.lock || unlocked(t.key)} /> : null}</Presence>
      <Presence>{tagDialog ? <TagDialog tag={tagDialog.tag} unlocked={!!tagDialog.tag && unlocked(tagDialog.tag.key)} onClose={() => setTagDialog(null)} onSave={(n, col, pw, rm) => void saveTag(tagDialog.tag, n, col, pw, rm)} onDelete={tagDialog.tag ? () => appAlert('Excluir etiqueta?', 'As notas continuam, só sem esta etiqueta.' + (tagDialog.tag!.lock ? ' As protegidas voltam a ser texto normal.' : ''), [{text: 'Cancelar', style: 'cancel'}, {text: 'Excluir', style: 'destructive', onPress: () => void deleteTag(tagDialog.tag!)}]) : undefined} /> : null}</Presence>
    </View>
  </InternalBackGesture>;
}

function LockScreen({tag, count, onUnlock}: {tag: Tag; count: number; onUnlock: (pw: string) => Promise<boolean>}) {
  const c = useTheme(), [pw, setPw] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const go = async () => { if (!pw || busy) return; setBusy(true); setMsg('Abrindo…'); const ok = await onUnlock(pw); setBusy(false); if (!ok) { setMsg('Senha incorreta.'); setPw(''); } };
  return <View testID="notes-lockscreen" style={{alignItems: 'center', gap: 12, paddingVertical: 40}}>
    <View style={{width: 64, height: 64, borderRadius: 20, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center'}}><Icon name="lock" size={28} color={c.accent} /></View>
    <Text style={{color: c.text, fontSize: 18, fontWeight: '700'}}>{tag.name} está protegida</Text>
    <Text style={{color: c.muted, textAlign: 'center', maxWidth: 380}}>{count} {count === 1 ? 'nota guardada' : 'notas guardadas'} com criptografia. Digite a senha para abrir.</Text>
    <View style={{flexDirection: 'row', gap: 8, width: '100%', maxWidth: 380}}><Input testID="notes-password" secureTextEntry autoFocus value={pw} onChangeText={setPw} onSubmitEditing={() => void go()} placeholder="Senha" style={{flex: 1}} /><PrimaryButton label="Abrir" disabled={!pw || busy} onPress={() => void go()} /></View>
    {msg ? <Text style={{color: msg === 'Senha incorreta.' ? c.danger : c.muted, fontSize: 13}}>{msg}</Text> : null}
    <Text style={{color: c.muted, fontSize: 12, textAlign: 'center', maxWidth: 380}}>A senha não fica guardada em lugar nenhum. Se ela for esquecida, as notas desta etiqueta não podem ser recuperadas.</Text>
  </View>;
}
function NotePanel({n, tags, onClose, onChange, onMenu, canUseTag}: {n: Note; tags: Tag[]; onClose: () => void; onChange: (p: {title?: string; body?: string; tags?: string[]}) => void; onMenu: (e: any) => void; canUseTag: (t: Tag) => boolean}) {
  const c = useTheme(), [title, setTitle] = useState(n.title), [body, setBody] = useState(n.body), [adding, setAdding] = useState(false), [newTag, setNewTag] = useState(''), timer = useRef<any>(null), latest = useRef({title, body});
  latest.current = {title, body};
  const schedule = () => { clearTimeout(timer.current); timer.current = setTimeout(() => onChange({title: latest.current.title, body: latest.current.body}), 600); };
  useEffect(() => () => { clearTimeout(timer.current); if (latest.current.title !== n.title || latest.current.body !== n.body) onChange({title: latest.current.title, body: latest.current.body}); }, []); // salva ao fechar
  const addTag = (name: string) => { const t = tags.find(x => fold(x.name) === fold(name)); if (t && !canUseTag(t)) return; if (!n.tags.some(x => fold(x) === fold(name))) onChange({tags: [...n.tags, t?.name || name.trim()]}); setAdding(false); setNewTag(''); };
  return <Panel visible onClose={onClose} width={560} testID="note-panel" title={<View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>{n.lockTag ? <Icon name="lock" size={14} color={c.accent} /> : null}<Text style={{color: c.muted, fontSize: 12}}>{n.lockTag ? 'Protegida em ' + n.lockTag : 'Nota'}</Text><View style={{flex: 1}} /><Pressable accessibilityRole="button" accessibilityLabel="Mais opções da nota" onPress={onMenu} style={{width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8}}><Icon name="more" size={18} color={c.muted} /></Pressable></View>}>
    <TextInput testID="note-title" accessibilityLabel="Título" value={title} onChangeText={v => { setTitle(v); schedule(); }} placeholder="Título" placeholderTextColor={c.muted} style={{color: c.text, fontSize: 20, fontWeight: '700', paddingVertical: 4}} />
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center'}}>
      {n.tags.map(t => { const tg = tags.find(x => fold(x.name) === fold(t)); return <Pressable key={t} accessibilityRole="button" accessibilityLabel={'Tirar etiqueta ' + t} onPress={() => onChange({tags: n.tags.filter(x => x !== t)})} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, backgroundColor: c.input}}><View style={{width: 7, height: 7, borderRadius: 3, backgroundColor: tg?.color || c.muted}} /><Text style={{color: c.text, fontSize: 12}}>{tg?.name || t}</Text><Icon name="close" size={11} color={c.muted} /></Pressable>; })}
      {adding ? <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{tags.filter(t => !n.tags.some(x => fold(x) === fold(t.name)) && canUseTag(t)).map(t => <Chip key={t.key} dot={t.color} label={t.name} onPress={() => addTag(t.name)} />)}<Input autoFocus value={newTag} onChangeText={setNewTag} onSubmitEditing={() => newTag.trim() && addTag(newTag)} placeholder="Nova etiqueta" style={{minHeight: 32, paddingVertical: 4, width: 140}} /></View>
        : <Chip icon="plus" label="Etiqueta" dashed onPress={() => setAdding(true)} />}
    </View>
    <TextInput testID="note-body" accessibilityLabel="Texto da nota" value={body} onChangeText={v => { setBody(v); schedule(); }} placeholder="Escreva aqui…" placeholderTextColor={c.muted} multiline style={{minHeight: 320, color: c.text, fontSize: 14, lineHeight: 23, textAlignVertical: 'top'}} />
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}><Icon name="check" size={13} color={c.muted} /><Text style={{color: c.muted, fontSize: 12}}>Salva sozinho{n.lockTag ? ' · criptografada neste aparelho' : ''}</Text></View>
  </Panel>;
}
function TagDialog({tag, unlocked: isOpen, onClose, onSave, onDelete}: {tag: Tag | null; unlocked: boolean; onClose: () => void; onSave: (name: string, color: string, password: string | null, removeLock: boolean) => void; onDelete?: () => void}) {
  const c = useTheme(), [name, setName] = useState(tag?.name || ''), [color, setColor] = useState(tag?.color || COLORS[0]), [want, setWant] = useState(false), [p1, setP1] = useState(''), [p2, setP2] = useState(''), [err, setErr] = useState('');
  const go = () => { if (!name.trim()) return; if (want) { if (p1.length < 4) { setErr('Use pelo menos 4 caracteres.'); return; } if (p1 !== p2) { setErr('As senhas não são iguais.'); return; } } onSave(name, color, want ? p1 : null, false); };
  return <Dialog visible onClose={onClose} title={tag ? 'Editar etiqueta' : 'Nova etiqueta'} footer={<>{onDelete ? <Pressable accessibilityRole="button" onPress={onDelete} style={{marginRight: 'auto', justifyContent: 'center'}}><Text style={{color: c.danger}}>Excluir</Text></Pressable> : null}<GhostButton label="Cancelar" onPress={onClose} /><PrimaryButton label="Salvar" disabled={!name.trim()} onPress={go} /></>}>
    <Input autoFocus value={name} onChangeText={setName} onSubmitEditing={go} placeholder="Nome da etiqueta" />
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{COLORS.map(col => <Pressable key={col} accessibilityRole="button" accessibilityLabel={'Cor ' + col} accessibilityState={{selected: color === col}} onPress={() => setColor(col)} style={{width: 28, height: 28, borderRadius: 9, backgroundColor: col, borderWidth: 2, borderColor: color === col ? c.text : 'transparent'}} />)}</View>
    {tag?.lock ? <View style={{gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.accentSoft}}>
      <View style={{flexDirection: 'row', gap: 8}}><Icon name="shield" size={16} color={c.accent} /><Text style={{flex: 1, color: c.text, fontSize: 13}}>Protegida por senha. As notas ficam criptografadas e não aparecem em Todas, nas outras etiquetas nem na busca. A Sofia não lê essas notas.</Text></View>
      {isOpen ? <Pressable accessibilityRole="button" onPress={() => onSave(name, color, null, true)}><Text style={{color: c.danger, fontSize: 13}}>Tirar a senha</Text></Pressable> : <Text style={{color: c.muted, fontSize: 12}}>Abra a etiqueta com a senha para tirar a proteção.</Text>}
    </View> : <>
      <Pressable accessibilityRole="switch" accessibilityState={{checked: want}} onPress={() => setWant(!want)} style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
        <View style={{width: 40, height: 24, borderRadius: 12, backgroundColor: want ? c.accent : c.line, padding: 3, alignItems: want ? 'flex-end' : 'flex-start'}}><View style={{width: 18, height: 18, borderRadius: 9, backgroundColor: PALETTE.white}} /></View>
        <View style={{flex: 1}}><Text style={{color: c.text, fontWeight: '600'}}>Proteger com senha</Text><Text style={{color: c.muted, fontSize: 12}}>As notas desta etiqueta ficam criptografadas neste aparelho e só aparecem aqui, depois da senha.</Text></View>
      </Pressable>
      {want ? <>
        <Input testID="tag-pw1" secureTextEntry value={p1} onChangeText={v => { setP1(v); setErr(''); }} placeholder="Senha" />
        <Input testID="tag-pw2" secureTextEntry value={p2} onChangeText={v => { setP2(v); setErr(''); }} onSubmitEditing={go} placeholder="Repetir senha" />
        <Text style={{color: c.warn, fontSize: 12}}>Se você esquecer a senha, não há como recuperar as notas. Não existe "esqueci a senha".</Text>
        {err ? <Text style={{color: c.danger, fontSize: 12}}>{err}</Text> : null}
      </> : null}
    </>}
    {Platform.OS === 'web' ? null : <View />}
  </Dialog>;
}
