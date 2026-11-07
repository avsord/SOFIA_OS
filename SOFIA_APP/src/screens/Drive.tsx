// 07/11/2026 (Pedro): "um drive igual o Google Drive, so que versao da Sofia" - o Google Drive INTEIRO do usuario, no site
// e no app: Meu Drive, Compartilhados comigo, Recentes, Com estrela e Lixeira (com restaurar); enviar arquivos de qualquer
// tamanho e pastas inteiras (com porcentagem e cancelar), criar pasta, arrastar para mover, renomear, estrela, lixeira com
// desfazer, selecionar varios (Ctrl/Shift/Ctrl+A), pesquisa no Drive todo, ordenar, visualizar (DrivePreview), miniaturas
// do Google, o endereco acompanha a pasta (voltar do navegador sobe de pasta). A area da Sofia nunca aparece (servidor).
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import {File, Paths} from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import type {SdItem, SdListing, SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {appAlert} from '../lib/app-alert';
import {Icon, type IconName} from '../components/Icon';
import {Dialog, GhostButton, PrimaryButton, openMore} from '../components/AppKit';
import {contextMenu, type MenuItem} from '../components/ContextMenu';
import {DrivePreview, KIND, cachedBlobUrl, driveKind, openNative, viewable} from '../components/DrivePreview';
import {driveDiagInit, note, trackedDriveApi} from '../lib/drive-diag';
import {droppedSources, fromBrowserFile, fromNativeAsset, isFileDrag, type UploadSource} from '../lib/drive-upload';
export {driveKind} from '../components/DrivePreview';

const WEB = Platform.OS === 'web';
const VIEW_KEY = 'sofia.drive.view';
type View_ = 'drive' | 'shared' | 'recent' | 'starred' | 'trash';
const VIEWS: {id: View_; label: string; icon: IconName}[] = [
  {id: 'drive', label: 'Meu Drive', icon: 'drive'}, {id: 'shared', label: 'Compartilhados comigo', icon: 'users'}, {id: 'recent', label: 'Recentes', icon: 'clock'},
  {id: 'starred', label: 'Com estrela', icon: 'star'}, {id: 'trash', label: 'Lixeira', icon: 'trash'}];
const size = (b: number | null | undefined) => b == null ? '—' : b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : b < 1073741824 ? (b / 1048576).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + ' MB' : (b / 1073741824).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + ' GB';
const when = (iso: string) => { const d = new Date(iso); if (!iso || Number.isNaN(d.getTime())) return ''; const today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : d.toLocaleDateString('pt-BR', {day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'}); };
// o botao (react-native-web) nao repassa duplo clique nem arrastar: liga direto no elemento da pagina, sempre com as
// funcoes do desenho mais recente
type DomH = Partial<Record<'dblclick' | 'dragstart' | 'dragend' | 'dragover' | 'dragleave' | 'drop', (e: any) => void>> & {draggable?: boolean; selected?: boolean};
const domH = new WeakMap<HTMLElement, DomH>();
function bindDom(el: any, h: DomH) {
  if (!WEB || !el || typeof el.addEventListener !== 'function') return; const first = !domH.has(el); domH.set(el, h);
  el.setAttribute('draggable', h.draggable ? 'true' : 'false'); if (h.selected !== undefined) el.setAttribute('aria-selected', String(h.selected));
  if (first) for (const ev of ['dblclick', 'dragstart', 'dragend', 'dragover', 'dragleave', 'drop'] as const) el.addEventListener(ev, (e: any) => domH.get(el)?.[ev]?.(e));
}
type Upload = {key: string; name: string; sent: number; total: number; state: 'waiting' | 'sending' | 'done' | 'error' | 'canceled'; msg?: string; ctl?: AbortController};
let uploadSeq = 0;

/** Miniatura: a do proprio Google (foto, PDF, video, Docs), pequena e guardada. */
function Thumb({api, item, h}: {api: SofiaApi; item: SdItem; h: number}) {
  const c = useTheme(), [url, setUrl] = useState(''), k = KIND[driveKind(item)];
  useEffect(() => { if (!WEB || !item.thumb) return; let alive = true; void cachedBlobUrl(api, item, 'thumb').then(u => { if (alive) setUrl(u); }).catch(() => {}); return () => { alive = false; }; }, [api, item.id, item.modified, item.thumb]); // eslint-disable-line react-hooks/exhaustive-deps
  const icon = <View style={{height: h, alignItems: 'center', justifyContent: 'center', backgroundColor: c.input}}><Icon name={k.icon} size={44} color={k.color} /></View>;
  if (!item.thumb) return icon;
  if (!WEB) return <Image source={{uri: api.sdFileUrl(item.id, 'thumb') + '?s=440', headers: api.sdAuthHeaders()}} style={{width: '100%', height: h, backgroundColor: c.input}} resizeMode="cover" />;
  return url ? <Image source={{uri: url}} style={{width: '100%', height: h, backgroundColor: c.input}} resizeMode="cover" /> : icon;
}

export function Drive({api: rawApi, active, onBack}: {api: SofiaApi; active: boolean; onBack?: () => void}) {
  const api = useMemo(() => { driveDiagInit(rawApi); return trackedDriveApi(rawApi); }, [rawApi]);
  const c = useTheme(), {width} = useWindowDimensions(), wide = width >= 900, touchWeb = WEB && !wide;
  const [view, setView] = useState<View_>('drive'), [folder, setFolder] = useState('root');
  const [data, setData] = useState<SdListing | null>(null), [viewItems, setViewItems] = useState<SdItem[] | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [code, setCode] = useState('');
  // sem escolha guardada: lista no celular (nomes inteiros, como o Google Drive no celular), grade no computador
  const [layout, setLayout] = useState<'grid' | 'list'>(() => { let v: string | null = null; try { v = WEB ? globalThis.localStorage?.getItem(VIEW_KEY) ?? null : null; } catch { /* sem armazenamento */ } return v === 'list' || v === 'grid' ? v : width < 600 ? 'list' : 'grid'; });
  const [query, setQuery] = useState(''), [found, setFound] = useState<{q: string; items: SdItem[]} | null>(null), [searching, setSearching] = useState(false), [searchErr, setSearchErr] = useState('');
  const [sel, setSel] = useState<string[]>([]), anchor = useRef('');
  const [preview, setPreview] = useState<SdItem | null>(null), [naming, setNaming] = useState<{mode: 'folder' | 'rename'; item?: SdItem; value: string} | null>(null), [moving, setMoving] = useState<SdItem[] | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]), [dropOver, setDropOver] = useState(false), [dragTarget, setDragTarget] = useState('');
  const [toast, setToast] = useState<{msg: string; undo?: () => void} | null>(null), toastT = useRef<any>(null);
  const [about, setAbout] = useState<{used: number; limit: number | null} | null>(null), [limit, setLimit] = useState(300);
  const rootRef = useRef<any>(null), dragging = useRef<SdItem[] | null>(null), seq = useRef(0), here = useRef({view, folder}); here.current = {view, folder};
  const say = (msg: string, undo?: () => void) => { clearTimeout(toastT.current); setToast({msg, undo}); toastT.current = setTimeout(() => setToast(null), undo ? 7000 : 3500); };

  // ---------- carregar (sem corrida: so vale a resposta do ultimo pedido) ----------
  const load = useCallback(async (v: View_ = here.current.view, f: string = here.current.folder, quiet = false) => {
    const my = ++seq.current; if (!quiet) setLoading(true); setError(''); if (!quiet) setCode('');
    try {
      if (v === 'drive') { const r = await api.sdList(f); if (my !== seq.current) return; if (r.connected === false) { setCode(r.code || 'DRIVE_NOT_CONNECTED'); setData(null); return; } setData(r); setViewItems(null); }
      else { const r = await api.sdView(v); if (my !== seq.current) return; if (r.connected === false) { setCode(r.code || 'DRIVE_NOT_CONNECTED'); setViewItems(null); return; } setViewItems(r.items); }
      if (!quiet) { setSel([]); setLimit(300); }
    } catch (e: any) { if (my === seq.current) { setError(errorText(e)); setCode(String(e?.code || '')); } }
    finally { if (my === seq.current) setLoading(false); }
  }, [api]);
  // endereco acompanha a pasta (site): ?pasta=<id> / ?lista=<recentes...>; voltar do navegador sobe de pasta
  const go = useCallback((v: View_, f = 'root', push = true) => {
    setQuery(''); setFound(null); setView(v); setFolder(f); setPreview(null); void load(v, f);
    if (WEB && push) { try { const u = new URL(location.href); u.searchParams.delete('pasta'); u.searchParams.delete('lista'); if (v !== 'drive') u.searchParams.set('lista', v); else if (f !== 'root') u.searchParams.set('pasta', f); if (u.href !== location.href) history.pushState({sofiaDrive: true}, '', u.href); } catch { /* sem historico */ } }
  }, [load]);
  useEffect(() => { if (!active) return;
    if (WEB) { const read = () => { try { const u = new URL(location.href); const l = u.searchParams.get('lista') as View_ | null; return {v: l && VIEWS.some(x => x.id === l) ? l : 'drive' as View_, f: u.searchParams.get('pasta') || 'root'}; } catch { return {v: 'drive' as View_, f: 'root'}; } };
      const s = read(); go(s.v, s.f, false); const pop = () => { if (!location.pathname.includes('/apps/drive')) return; const r = read(); go(r.v, r.f, false); }; window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }
    void load(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (active && !code) void api.sdAbout().then(r => { if (r.connected !== false) setAbout({used: r.used, limit: r.limit}); }).catch(() => {}); }, [active, code, api]);
  const setLayoutSaved = (v: 'grid' | 'list') => { setLayout(v); try { globalThis.localStorage?.setItem(VIEW_KEY, v); } catch { /* sem armazenamento */ } };

  // ---------- pesquisa: filtra o que esta na tela na hora e, depois de uma pausa, busca no Drive inteiro ----------
  const runSearch = useCallback((q: string) => { setSearching(true); setSearchErr(''); return api.sdSearch(q).then(r => setFound({q, items: r.items || []})).catch(e => { setFound(null); setSearchErr(errorText(e)); }).finally(() => setSearching(false)); }, [api]);
  useEffect(() => { const q = query.trim(); if (q.length < 2) { setFound(null); setSearching(false); setSearchErr(''); return; } setSearching(true); const t = setTimeout(() => void runSearch(q), 350); return () => clearTimeout(t); }, [query, runSearch]);
  const [sort, setSort] = useState<{key: 'name' | 'modified' | 'size'; dir: 1 | -1}>(() => { try { const v = JSON.parse(globalThis.localStorage?.getItem(VIEW_KEY + '.sort') || 'null'); if (v && ['name', 'modified', 'size'].includes(v.key)) return {key: v.key, dir: v.dir === -1 ? -1 : 1}; } catch { /* padrao */ } return {key: 'name', dir: 1}; });
  const sortBy = (key: 'name' | 'modified' | 'size') => setSort(o => { const n = {key, dir: (o.key === key ? -o.dir : key === 'name' ? 1 : -1) as 1 | -1}; try { globalThis.localStorage?.setItem(VIEW_KEY + '.sort', JSON.stringify(n)); } catch { /* sem armazenamento */ } return n; });
  const inSearch = query.trim().length > 0;
  const items = useMemo(() => { const q = query.trim().toLowerCase(); const base = view === 'drive' ? data?.items || [] : viewItems || [];
    const all = found && found.q.toLowerCase() === q ? found.items : base.filter(i => !q || i.name.toLowerCase().includes(q));
    if (!inSearch && (view === 'recent' || view === 'trash')) return all; // ja vem na ordem do Google (mais recentes primeiro)
    const cmp = (a: SdItem, b: SdItem) => sort.key === 'name' ? a.name.localeCompare(b.name, 'pt-BR', {numeric: true, sensitivity: 'base'}) * sort.dir
      : sort.key === 'size' ? ((a.size ?? -1) - (b.size ?? -1)) * sort.dir || a.name.localeCompare(b.name, 'pt-BR') : (Date.parse(a.modified || '0') - Date.parse(b.modified || '0')) * sort.dir || a.name.localeCompare(b.name, 'pt-BR');
    return [...all].sort((a, b) => (Number(b.folder) - Number(a.folder)) || cmp(a, b)); }, [data, viewItems, view, query, found, sort, inSearch]);
  const folders = items.filter(i => i.folder), files = items.filter(i => !i.folder);
  const ordered = useMemo(() => [...folders, ...files], [items]); // eslint-disable-line react-hooks/exhaustive-deps
  const viewList = files.filter(i => viewable(driveKind(i)));
  const selItems = ordered.filter(i => sel.includes(i.id));
  const trashView = view === 'trash';

  // ---------- acoes ----------
  const refresh = useCallback(async () => { await load(here.current.view, here.current.folder, true); if (query.trim().length >= 2) void runSearch(query.trim()); }, [load, runSearch, query]);
  async function act(run: () => Promise<unknown>, ok?: string, undo?: () => Promise<unknown>) {
    try { await run(); await refresh(); if (ok) say(ok, undo ? () => { setToast(null); void undo().then(refresh).catch(e => appAlert('Não deu certo', errorText(e))); } : undefined); }
    catch (e) { appAlert('Não deu certo', errorText(e)); await refresh(); }
  }
  async function download(it: SdItem) {
    if (it.folder) { appAlert('Baixar pasta', 'Abra a pasta e selecione os arquivos para baixar.'); return; }
    try {
      const u = await api.sdSignedUrl(it.id, 'download');
      if (WEB) { const a = document.createElement('a'); a.href = u; /* sem o atributo download: o nome vem do servidor (Docs do Google saem .docx/.xlsx/.pptx) */ a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); return; }
      const target = new File(Paths.cache, 'sofiadrive-' + it.id + '-' + it.name.replace(/[^\p{L}\p{N}._-]/gu, '_'));
      try { if (target.exists) target.delete(); } catch { /* baixa de novo */ }
      const f = await File.downloadFileAsync(u, target, {idempotent: true}); await Sharing.shareAsync(f.uri, {mimeType: it.mime || undefined, dialogTitle: it.name});
    } catch (e) { appAlert('Não consegui baixar', errorText(e)); }
  }
  const openItem = (it: SdItem) => {
    if (trashView) { appAlert('Está na lixeira', '“' + it.name + '” está na lixeira. Restaure para abrir.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Restaurar', onPress: () => void act(() => api.sdRestore(it.id), 'Restaurado')}]); return; }
    if (it.folder) { go('drive', it.id); return; }
    const k = driveKind(it);
    if (!viewable(k)) { void download(it); return; }
    if (!WEB) { void openNative(api, it).then(r => { if (r === 'inapp') setPreview(it); }).catch(e => appAlert('Não consegui abrir', errorText(e))); return; }
    setPreview(it); setSel([it.id]);
  };
  const trash = (list: SdItem[]) => { if (!list.length) return;
    const label = list.length === 1 ? '“' + list[0].name + '”' : list.length + ' itens';
    void act(async () => { for (const it of list) await api.sdTrash(it.id); setSel([]); }, label + (list.length === 1 ? ' foi' : ' foram') + ' para a lixeira', async () => { for (const it of list) await api.sdRestore(it.id); }); };
  const restore = (list: SdItem[]) => void act(async () => { for (const it of list) await api.sdRestore(it.id); setSel([]); }, list.length === 1 ? 'Restaurado' : list.length + ' itens restaurados');
  const star = (list: SdItem[], on: boolean) => void act(async () => { for (const it of list) await api.sdUpdate(it.id, {starred: on}); }, on ? 'Estrela adicionada' : 'Estrela removida');
  const moveTo = (list: SdItem[], dest: string, destName: string) => { const from = view === 'drive' ? folder : '';
    const real = list.filter(it => it.id !== dest); if (!real.length) return;
    void act(async () => { for (const it of real) await api.sdUpdate(it.id, {parent: dest}); setSel([]); }, (real.length === 1 ? '“' + real[0].name + '”' : real.length + ' itens') + ' movido' + (real.length === 1 ? '' : 's') + ' para “' + destName + '”',
      from ? async () => { for (const it of real) await api.sdUpdate(it.id, {parent: from}); } : undefined); };
  const rename = (it: SdItem) => setNaming({mode: 'rename', item: it, value: it.name});
  const menu = (it: SdItem): MenuItem[] => { const many = sel.includes(it.id) && sel.length > 1 ? selItems : [it];
    if (trashView) return [{label: many.length > 1 ? 'Restaurar ' + many.length + ' itens' : 'Restaurar', icon: 'restore', run: () => restore(many)}];
    if (many.length > 1) return [
      {label: 'Mover ' + many.length + ' itens para…', icon: 'moveTo', run: () => setMoving(many)},
      {label: 'Baixar ' + many.filter(x => !x.folder).length + ' arquivos', icon: 'download', run: () => { for (const x of many) if (!x.folder) void download(x); }},
      {label: 'Adicionar estrela', icon: 'star', run: () => star(many, true)},
      {label: 'Mandar ' + many.length + ' itens para a lixeira', icon: 'trash', danger: true, run: () => trash(many)}];
    return [
      {label: it.folder ? 'Abrir' : viewable(driveKind(it)) ? 'Visualizar' : 'Baixar', icon: it.folder ? 'folder' : 'eye', run: () => openItem(it)},
      ...(it.folder ? [] : [{label: 'Baixar', icon: 'download' as IconName, run: () => void download(it)}]),
      ...(it.web ? [{label: 'Abrir no Google', icon: 'external' as IconName, run: () => { if (WEB) window.open(it.web, '_blank', 'noopener'); else void WebBrowser.openBrowserAsync(it.web!); }}] : []),
      {label: 'Renomear', icon: 'rename', run: () => rename(it)},
      {label: 'Mover para…', icon: 'moveTo', run: () => setMoving([it])},
      {label: it.starred ? 'Remover estrela' : 'Adicionar estrela', icon: 'star', run: () => star([it], !it.starred)},
      ...(it.shared ? [] : [{label: 'Mandar para a lixeira', icon: 'trash' as IconName, danger: true, run: () => trash([it])}])];
  };

  // ---------- envio ----------
  const createdDirs = useRef(new Map<string, string>());
  async function sendFiles(list: UploadSource[], parent = view === 'drive' ? folder : 'root', parentName = data?.folder.name || 'Meu Drive') {
    if (!list.length) return;
    const rows: Upload[] = list.filter(f => f.name).map(f => ({key: 'u' + (++uploadSeq), name: (f.dirs.length ? f.dirs.join('/') + '/' : '') + f.name, sent: 0, total: f.size, state: 'waiting', ctl: new AbortController()}));
    setUploads(u => [...u.filter(x => x.state === 'sending' || x.state === 'waiting'), ...rows]);
    const dirOf = async (dirs: string[]) => { let cur = parent; for (let i = 0; i < dirs.length; i++) { const key = parent + '/' + dirs.slice(0, i + 1).join('/'); let id = createdDirs.current.get(key);
      if (!id) { id = (await api.sdCreateFolder(cur, dirs[i])).item.id; createdDirs.current.set(key, id); } cur = id; } return cur; };
    for (const f of list.filter(x => !x.name)) await dirOf(f.dirs).catch(() => {}); // pastas vazias
    const real = list.filter(f => f.name); let next = 0;
    const patch = (key: string, p: Partial<Upload>) => setUploads(u => u.map(x => x.key === key ? {...x, ...p} : x));
    await Promise.all(Array.from({length: 3}, async () => { while (next < real.length) { const i = next++, f = real[i], row = rows[i];
      if (row.ctl!.signal.aborted) continue; patch(row.key, {state: 'sending'});
      try { const dest = await dirOf(f.dirs); await api.sdUploadAny(dest, f, (sent, total) => patch(row.key, {sent, total}), row.ctl!.signal); patch(row.key, {state: 'done', sent: f.size}); }
      catch (e: any) { patch(row.key, row.ctl!.signal.aborted ? {state: 'canceled'} : {state: 'error', msg: errorText(e)}); }
    } }));
    createdDirs.current.clear();
    if (here.current.view === 'drive') void refresh();
    const ok = rows.length; say(ok === 1 ? '“' + rows[0].name + '” enviado para “' + parentName + '”' : ok + ' arquivos enviados para “' + parentName + '”');
    setTimeout(() => setUploads(u => u.filter(x => x.state !== 'done' && x.state !== 'canceled')), 5000);
  }
  function pickFiles() {
    if (WEB) { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.onchange = () => void sendFiles(Array.from(input.files || []).map(f => fromBrowserFile(f))); input.click(); return; }
    void DocumentPicker.getDocumentAsync({multiple: true, copyToCacheDirectory: true}).then(r => { if (r.canceled) return; void sendFiles(r.assets.map(a => fromNativeAsset({uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size}))); });
  }
  function pickFolder() { if (!WEB) return; const input = document.createElement('input'); input.type = 'file'; (input as any).webkitdirectory = true; input.multiple = true;
    input.onchange = () => void sendFiles(Array.from(input.files || []).map(f => { const parts = String((f as any).webkitRelativePath || f.name).split('/'); return fromBrowserFile(f, parts.slice(0, -1)); })); input.click(); }
  // soltar arquivos/pastas do computador: na tela vai para a pasta aberta; em cima de uma pasta, para dentro dela
  useEffect(() => {
    if (!WEB || !active) return; const el: HTMLElement | null = rootRef.current; if (!el) return;
    const over = (e: DragEvent) => { if (!isFileDrag(e) || view !== 'drive') return; e.preventDefault(); setDropOver(true); };
    const leave = (e: DragEvent) => { if (!el.contains(e.relatedTarget as Node)) setDropOver(false); };
    const drop = (e: DragEvent) => { if (!isFileDrag(e) || view !== 'drive') return; e.preventDefault(); setDropOver(false); const dt = e.dataTransfer; if (dt) void droppedSources(dt).then(l => sendFiles(l)); };
    el.addEventListener('dragover', over); el.addEventListener('dragleave', leave); el.addEventListener('drop', drop);
    return () => { el.removeEventListener('dragover', over); el.removeEventListener('dragleave', leave); el.removeEventListener('drop', drop); };
  }, [active, view, folder, data]); // eslint-disable-line react-hooks/exhaustive-deps
  // arrastar itens (um ou os selecionados) para uma pasta ou para o caminho; soltar arquivos do computador numa pasta
  const dropOn = (destId: string, destName: string): DomH => !WEB ? {} : {
    dragover: (e: any) => { if (dragging.current && !dragging.current.some(x => x.id === destId)) { e.preventDefault(); setDragTarget(destId); } else if (Array.from(e.dataTransfer?.types || []).includes('Files')) { e.preventDefault(); e.stopPropagation(); setDragTarget(destId); setDropOver(false); } },
    dragleave: () => setDragTarget(t => t === destId ? '' : t),
    drop: (e: any) => { setDragTarget(''); const d = dragging.current; if (d) { e.preventDefault(); e.stopPropagation(); dragging.current = null; if (!d.some(x => x.id === destId)) moveTo(d, destId, destName); return; }
      if (Array.from(e.dataTransfer?.types || []).includes('Files')) { e.preventDefault(); e.stopPropagation(); setDropOver(false); void droppedSources(e.dataTransfer).then(l => sendFiles(l, destId, destName)); } }};
  const dragProps = (it: SdItem): DomH => !WEB || trashView ? {} : {draggable: true, dragstart: (e: any) => { const list = sel.includes(it.id) ? selItems : [it]; dragging.current = list; e.dataTransfer?.setData('text/plain', list.map(x => x.name).join('\n')); if (!sel.includes(it.id)) setSel([it.id]); },
    dragend: () => { dragging.current = null; setDragTarget(''); }, ...(it.folder ? dropOn(it.id, it.name) : {})};

  // ---------- selecao (como no Google Drive: clique seleciona, Ctrl soma, Shift faz faixa, duplo clique abre) ----------
  const clickItem = (it: SdItem, e: any) => {
    const ne = e?.nativeEvent || e || {};
    if (!WEB || touchWeb) { if (sel.length) { setSel(s => s.includes(it.id) ? s.filter(x => x !== it.id) : [...s, it.id]); return; } openItem(it); return; }
    if (ne.shiftKey && anchor.current) { const a = ordered.findIndex(x => x.id === anchor.current), b = ordered.findIndex(x => x.id === it.id); if (a >= 0 && b >= 0) { const [i, j] = a < b ? [a, b] : [b, a]; setSel(ordered.slice(i, j + 1).map(x => x.id)); return; } }
    if (ne.ctrlKey || ne.metaKey) { setSel(s => s.includes(it.id) ? s.filter(x => x !== it.id) : [...s, it.id]); anchor.current = it.id; return; }
    if (sel.length > 1) { setSel(s => s.includes(it.id) ? s.filter(x => x !== it.id) : [...s, it.id]); anchor.current = it.id; return; } // marcando varios: clique soma/tira
    openItem(it); // Pedro (07/11): um clique ja abre (arquivo ou pasta)
  };
  const longPress = (it: SdItem, e: any) => { if (!WEB || touchWeb) { setSel(s => s.includes(it.id) ? s : [...s, it.id]); return; } openMore(e, it.name, menu(it)); };
  // clicar fora de um item (area vazia, cabecalho) tira a selecao
  useEffect(() => {
    if (!WEB || !active) return; const el: HTMLElement | null = rootRef.current; if (!el) return;
    const down = (e: MouseEvent) => { if (e.button !== 0) return; const t = e.target as HTMLElement; if (!t?.closest?.('[data-testid^="drive-item-"],[data-testid=drive-selbar],[role=menu]')) setSel(s => s.length ? [] : s); };
    el.addEventListener('mousedown', down); return () => el.removeEventListener('mousedown', down);
  }, [active]);
  // teclado (site): setas pela posicao na tela, Enter abre, Delete lixeira, F2 renomeia, Ctrl+A seleciona tudo, Esc limpa.
  // Age so com o foco na pagina ou num item do Drive (nunca rouba Enter de um botao, do menu lateral ou de um campo).
  const keyState = useRef({ordered, sel, busy: false, trashView}); keyState.current = {ordered, sel, busy: !!(preview || naming || moving), trashView};
  useEffect(() => {
    if (!WEB || !active) return;
    const onKey = (e: KeyboardEvent) => {
      const st = keyState.current, ae = document.activeElement as HTMLElement | null;
      if (st.busy || e.altKey || !rootRef.current?.isConnected) return;
      const onItem = !!ae?.closest?.('[data-testid^="drive-item-"]');
      if (!(ae === document.body || ae === document.documentElement || onItem || ae === rootRef.current)) return;
      if (document.querySelector('[role=dialog],[role=alertdialog],[role=menu],[aria-modal=true]')) return;
      const handled = () => { e.preventDefault(); e.stopPropagation(); };
      const list = st.ordered; if (!list.length) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { handled(); setSel(list.map(x => x.id)); return; }
      if (e.ctrlKey || e.metaKey) return;
      const curId = st.sel[st.sel.length - 1] || '', cur = list.find(x => x.id === curId) || null;
      if (e.key.startsWith('Arrow')) { handled(); const nextId = cur ? neighbour(curId, e.key) : list[0].id; if (!nextId) return;
        if (e.shiftKey && anchor.current) { const a = list.findIndex(x => x.id === anchor.current), b = list.findIndex(x => x.id === nextId); const [i, j] = a < b ? [a, b] : [b, a]; setSel([...list.slice(i, j + 1).map(x => x.id).filter(x => x !== nextId), nextId]); }
        else { setSel([nextId]); anchor.current = nextId; }
        requestAnimationFrame(() => document.querySelector('[data-testid="drive-item-' + nextId + '"]')?.scrollIntoView({block: 'nearest'})); return; }
      if (e.key === 'Escape') { if (st.sel.length) { handled(); setSel([]); } return; }
      if (!cur) return;
      const chosen = list.filter(x => st.sel.includes(x.id));
      const fn = keyFns.current; // sempre as funcoes do desenho atual (nada de pasta/lista velha)
      if (e.key === 'Enter') { handled(); fn.openItem(cur); }
      else if (e.key === 'Delete' || (e.key === 'Backspace' && onItem)) { handled(); if (st.trashView) fn.restore(chosen); else fn.trash(chosen.filter(x => !x.shared)); }
      else if (e.key === 'F2' && !st.trashView) { handled(); fn.rename(cur); }
    };
    window.addEventListener('keydown', onKey, true); return () => window.removeEventListener('keydown', onKey, true);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const keyFns = useRef({openItem, trash, restore, rename}); keyFns.current = {openItem, trash, restore, rename};
  function neighbour(id: string, key: string): string {
    const els = Array.from(document.querySelectorAll('[data-testid^="drive-item-"]')) as HTMLElement[]; const i = els.findIndex(x => x.getAttribute('data-testid') === 'drive-item-' + id); if (i < 0) return '';
    const idOf = (el?: HTMLElement) => el ? String(el.getAttribute('data-testid')).slice('drive-item-'.length) : '';
    if (key === 'ArrowRight') return idOf(els[i + 1]) || id; if (key === 'ArrowLeft') return idOf(els[i - 1]) || id;
    const r = els[i].getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, down = key === 'ArrowDown'; let best: HTMLElement | undefined, bd = Infinity;
    for (const el of els) { const b = el.getBoundingClientRect(), y = b.top + b.height / 2; if (down ? y <= cy + 4 : y >= cy - 4) continue; const d = Math.abs(y - cy) * 4 + Math.abs(b.left + b.width / 2 - cx); if (d < bd) { bd = d; best = el; } }
    return idOf(best) || id;
  }

  // ---------- desenho ----------
  const cols = Math.max(2, Math.floor((width - (wide ? 560 : 24)) / (wide ? 210 : 160)));
  const itemPress = (it: SdItem) => ({onPress: (e: any) => clickItem(it, e), onLongPress: (e: any) => longPress(it, e), delayLongPress: 380,
    ref: (el: any) => bindDom(el, {selected: sel.includes(it.id), ...dragProps(it)}),
    ...(contextMenu(() => { if (!sel.includes(it.id)) setSel([it.id]); return menu(it); }) as any)});
  // funcoes de desenho (nao componentes): um componente criado dentro do desenho e recriado a cada mudanca e perde o clique
  const more = (it: SdItem) => <Pressable accessibilityLabel={'Mais ações para ' + it.name} hitSlop={8} onPress={(e: any) => { if (!sel.includes(it.id)) setSel([it.id]); openMore(e, it.name, menu(it)); }}><Icon name="more" size={18} color={c.muted} /></Pressable>;
  // caixinha de marcar (computador): aparece ao passar o mouse ou quando ja ha selecao; no lugar do icone do tipo
  // o mesmo botao fica sempre montado (se sumisse no meio do clique, o clique se perdia); so muda de cara
  const check = (it: SdItem, icon: React.ReactNode, hovered: boolean) => { const on = sel.includes(it.id), box = hovered || sel.length > 0;
    if (!WEB || touchWeb) return icon;
    return <Pressable testID={'drive-check-' + it.id} accessibilityRole="checkbox" accessibilityState={{checked: on}} accessibilityLabel={(on ? 'Desmarcar ' : 'Marcar ') + it.name} hitSlop={6}
      onPress={() => { setSel(s => s.includes(it.id) ? s.filter(x => x !== it.id) : [...s, it.id]); anchor.current = it.id; }}
      style={{width: 22, height: 22, borderRadius: 6, borderWidth: box ? 2 : 0, borderColor: on ? c.accent : c.muted, backgroundColor: on ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
      {on ? <Icon name="check" size={14} color={c.onAccent} /> : box ? null : icon}</Pressable>; };
  const card = (it: SdItem) => { const k = KIND[driveKind(it)], on = sel.includes(it.id), target = dragTarget === it.id;
    return <Pressable key={it.id} testID={'drive-item-' + it.id} accessibilityRole="button" accessibilityState={{selected: on}} accessibilityLabel={(it.folder ? 'Pasta ' : '') + it.name} {...itemPress(it)} style={{width: `${100 / cols}%`, padding: 6}}>
      {({hovered}: any) => <View style={{borderRadius: 12, borderWidth: 1, borderColor: target || on ? c.accent : c.line, backgroundColor: target || on ? c.accentSoft : hovered ? c.input : c.surface, overflow: 'hidden'}}>
        {it.folder ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12}}>{check(it, <Icon name="folder" size={22} color={it.shared ? '#3B82F6' : k.color} active />, hovered)}{it.shortcut ? <Icon name="external" size={12} color={c.muted} /> : null}<Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 14, fontWeight: '500'}}>{it.name}</Text>{it.starred ? <Icon name="star" size={14} color="#EAB308" active /> : null}{more(it)}</View>
          : <><View style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10}}>{check(it, <Icon name={k.icon} size={18} color={k.color} active />, hovered)}<Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 13, fontWeight: '500'}}>{it.name}</Text>{it.starred ? <Icon name="star" size={14} color="#EAB308" active /> : null}{more(it)}</View>
            <View style={{marginHorizontal: 8, marginBottom: it.where ? 4 : 8, borderRadius: 8, overflow: 'hidden', height: 120}}><Thumb api={api} item={it} h={120} /></View>
            {it.where ? <Text numberOfLines={1} style={{color: c.muted, fontSize: 12, marginHorizontal: 12, marginBottom: 8}}>em {it.where}</Text> : null}</>}
      </View>}
    </Pressable>; };
  const row = (it: SdItem) => { const k = KIND[driveKind(it)], on = sel.includes(it.id), target = dragTarget === it.id;
    return <Pressable key={it.id} testID={'drive-item-' + it.id} accessibilityRole="button" accessibilityState={{selected: on}} accessibilityLabel={(it.folder ? 'Pasta ' : '') + it.name} {...itemPress(it)}
      style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: target || on ? c.accentSoft : hovered ? c.input : 'transparent'})}>
      {({hovered}: any) => <>{check(it, <Icon name={k.icon} size={20} color={it.folder && it.shared ? '#3B82F6' : k.color} active />, hovered)}
      <View style={{flex: 1, minWidth: 0}}><Text numberOfLines={1} style={{color: c.text, fontSize: 14}}>{it.name}{it.shortcut ? '  ↗' : ''}</Text>{it.where && !wide ? <Text numberOfLines={1} style={{color: c.muted, fontSize: 12}}>em {it.where}</Text> : null}</View>
      {it.starred ? <Icon name="star" size={14} color="#EAB308" active /> : null}
      {wide && (inSearch || view !== 'drive') ? <Text numberOfLines={1} style={{width: 160, color: c.muted, fontSize: 13}}>{it.where || ''}</Text> : null}
      {wide ? <><Text style={{width: 120, color: c.muted, fontSize: 13}}>{when(it.modified)}</Text><Text style={{width: 90, color: c.muted, fontSize: 13, textAlign: 'right'}}>{it.folder ? '—' : size(it.size)}</Text></> : null}
      {more(it)}</>}
    </Pressable>; };

  const notConnected = code === 'DRIVE_NOT_CONNECTED' || code === 'GOOGLE_NOT_CONNECTED' || code === 'DRIVE_NEEDS_PERMISSION';
  const [granting, setGranting] = useState(false);
  async function grant() { // a propria conta Google do usuario: uma vez, na tela do Google
    setGranting(true);
    try { const r = await api.calendarConnect(); const u = new URL(r.url); if (u.protocol !== 'https:') throw Error('Endereço de autorização inválido.');
      const res: any = await WebBrowser.openAuthSessionAsync(u.toString(), 'sofiaapp://google');
      if (res?.url && /[?&]ok=0/.test(res.url)) { const m = /[?&](?:error|reason)=([^&]+)/.exec(res.url); throw Error(m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : 'O Google não liberou o acesso. Tente de novo e marque todas as permissões.'); }
      await load(view, folder); }
    catch (e) { appAlert('Não deu certo', errorText(e)); } finally { setGranting(false); }
  }
  const searchBox = <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.input, borderRadius: 10, paddingHorizontal: 12, flex: wide ? undefined : 1, width: wide ? 420 : undefined, maxWidth: '100%'}}><Icon name="search" size={16} color={c.muted} />
    <TextInput testID="drive-search" value={query} onChangeText={setQuery} placeholder="Pesquisar no Drive" placeholderTextColor={c.muted} returnKeyType="search" {...({onKeyPress: (e: any) => { if (e.nativeEvent?.key === 'Escape') setQuery(''); }} as any)} style={{flex: 1, color: c.text, paddingVertical: 9, fontSize: 14, outlineStyle: 'none'} as any} />
    {searching ? <ActivityIndicator size="small" color={c.muted} /> : query ? <Pressable accessibilityRole="button" accessibilityLabel="Limpar pesquisa" onPress={() => setQuery('')} hitSlop={8}><Icon name="close" size={16} color={c.muted} /></Pressable> : null}</View>;
  const sortMenu = (e: any) => openMore(e, 'Ordenar por', ([['name', 'Nome'], ['modified', 'Data de modificação'], ['size', 'Tamanho']] as const).map(([k, l]) => ({label: l + (sort.key === k ? (sort.dir === 1 ? '  ↑' : '  ↓') : ''), icon: (sort.key === k ? 'check' : 'sort') as IconName, run: () => sortBy(k)})));
  const head = (label: string, key: 'name' | 'modified' | 'size', style: any) => <Pressable accessibilityRole="button" accessibilityLabel={'Ordenar por ' + label} onPress={() => sortBy(key)} style={[{flexDirection: 'row', alignItems: 'center', gap: 4}, style]}>
    <Text style={{color: sort.key === key ? c.text : c.muted, fontSize: 12, fontWeight: '600'}}>{label}</Text>{sort.key === key ? <Text style={{color: c.text, fontSize: 12}}>{sort.dir === 1 ? '↑' : '↓'}</Text> : null}</Pressable>;
  const newMenu: MenuItem[] = [{label: 'Nova pasta', icon: 'folderPlus', run: () => setNaming({mode: 'folder', value: ''})}, {label: 'Enviar arquivos', icon: 'upload', run: pickFiles}, ...(WEB ? [{label: 'Enviar pasta', icon: 'folder' as IconName, run: pickFolder}] : [])];
  const canWrite = view === 'drive' && !inSearch && !data?.shared;
  const crumbs = view === 'drive' ? [{id: 'root', name: 'Meu Drive'}, ...(data?.path || []), ...(data && data.folder.id !== 'root' ? [data.folder] : [])] : [{id: view, name: VIEWS.find(v => v.id === view)!.label}];
  const newButton = (big?: boolean) => <Pressable testID="drive-new" accessibilityRole="button" accessibilityLabel="Novo" disabled={!canWrite && view !== 'drive'} onPress={(e: any) => { if (view !== 'drive' || inSearch) go('drive', 'root'); openMore(e, 'Novo', newMenu); }}
    style={({hovered, pressed}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: big ? 20 : 16, paddingVertical: big ? 14 : 10, borderRadius: 16, alignSelf: 'flex-start', backgroundColor: c.accent, opacity: hovered ? 0.92 : 1, transform: [{scale: pressed ? 0.97 : 1}], boxShadow: '0 4px 14px rgba(0,0,0,0.18)'} as any)}>
    <Icon name="plus" size={18} color={c.onAccent} /><Text style={{color: c.onAccent, fontSize: 14, fontWeight: '600'}}>Novo</Text></Pressable>;
  const storage = about ? <View style={{gap: 6, paddingHorizontal: 12}}><View style={{height: 4, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden'}}><View style={{height: 4, width: (about.limit ? Math.min(100, about.used / about.limit * 100) : 0) + '%' as any, backgroundColor: about.limit && about.used / about.limit > 0.9 ? c.danger : c.accent}} /></View>
    <Text style={{color: c.muted, fontSize: 12}}>{size(about.used)}{about.limit ? ' de ' + size(about.limit) + ' usados' : ' usados'}</Text></View> : null;
  const shown = items.slice(0, limit), shownFolders = shown.filter(i => i.folder), shownFiles = shown.filter(i => !i.folder);

  return <View ref={rootRef} testID="sofia-drive" style={{flex: 1, backgroundColor: c.bg, flexDirection: wide ? 'row' : 'column'}} {...({tabIndex: -1} as any)}>
    {/* menu lateral (computador) */}
    {wide ? <View style={{width: 236, paddingTop: 22, paddingHorizontal: 12, gap: 16, borderRightWidth: 1, borderRightColor: c.line}}>
      <Text accessibilityRole="header" style={{fontSize: 28, fontWeight: '600', letterSpacing: -1, color: c.text, paddingHorizontal: 8}}>Drive</Text>
      <View style={{paddingHorizontal: 4}}>{newButton(true)}</View>
      <View style={{gap: 2}}>{VIEWS.map(v => { const on = view === v.id && !inSearch; return <Pressable key={v.id} testID={'drive-view-' + v.id} accessibilityRole="button" accessibilityState={{selected: on}} onPress={() => go(v.id)} ref={(el: any) => bindDom(el, v.id === 'drive' ? dropOn('root', 'Meu Drive') : {})}
        style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, backgroundColor: on ? c.accentSoft : dragTarget === 'root' && v.id === 'drive' ? c.accentSoft : hovered ? c.input : 'transparent'})}>
        <Icon name={v.icon} size={18} color={on ? c.accent : c.muted} active={on} /><Text style={{color: on ? c.accent : c.text, fontSize: 14, fontWeight: on ? '600' : '400'}}>{v.label}</Text></Pressable>; })}</View>
      <View style={{flex: 1}} />
      <View style={{paddingBottom: 18, gap: 6}}><View style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12}}><Icon name="cloud" size={16} color={c.muted} /><Text style={{color: c.muted, fontSize: 13}}>Armazenamento</Text></View>{storage}</View>
    </View> : null}
    <View style={{flex: 1, minWidth: 0}}>
      {/* cabecalho */}
      <View style={{paddingHorizontal: wide ? 24 : 16, paddingTop: wide ? 22 : 12, gap: 12}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
          {onBack && !wide ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} hitSlop={10}><Icon name="back" size={22} color={c.text} /></Pressable> : null}
          {!wide ? <Text accessibilityRole="header" style={{fontSize: 24, fontWeight: '600', letterSpacing: -1, color: c.text}}>Drive</Text> : searchBox}
          <View style={{flex: 1}} />
          <GhostButton icon={layout === 'grid' ? 'listView' : 'gridView'} label={wide ? (layout === 'grid' ? 'Lista' : 'Grade') : undefined} onPress={() => setLayoutSaved(layout === 'grid' ? 'list' : 'grid')} testID="drive-layout" />
        </View>
        {!wide ? <View style={{flexDirection: 'row', gap: 8}}>{searchBox}</View> : null}
        {!wide ? <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8}}>{VIEWS.map(v => { const on = view === v.id && !inSearch; return <Pressable key={v.id} testID={'drive-view-' + v.id} onPress={() => go(v.id)} style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : 'transparent'}}><Icon name={v.icon} size={14} color={on ? c.accent : c.muted} /><Text style={{color: on ? c.accent : c.text, fontSize: 13}}>{v.label}</Text></Pressable>; })}</ScrollView> : null}
        {/* caminho (soltar um item aqui move para a pasta) ou barra da selecao */}
        {sel.length > 0 && (touchWeb || !WEB || sel.length > 1 || !preview) && selItems.length ? <View testID="drive-selbar" style={{flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.accentSoft, borderRadius: 24, paddingHorizontal: 8, paddingVertical: 4, minHeight: 40}}>
          <Pressable accessibilityRole="button" accessibilityLabel="Limpar seleção" onPress={() => setSel([])} hitSlop={8} style={{padding: 6}}><Icon name="close" size={18} color={c.text} /></Pressable>
          <Text testID="drive-selcount" style={{color: c.text, fontSize: 14, fontWeight: '600', marginRight: 8}}>{sel.length} selecionado{sel.length === 1 ? '' : 's'}</Text>
          {trashView ? <GhostButton icon="restore" label={wide ? 'Restaurar' : undefined} onPress={() => restore(selItems)} testID="drive-sel-restore" /> : <>
            <GhostButton icon="download" label={wide ? 'Baixar' : undefined} onPress={() => { for (const x of selItems) if (!x.folder) void download(x); }} />
            <GhostButton icon="moveTo" label={wide ? 'Mover' : undefined} onPress={() => setMoving(selItems)} testID="drive-sel-move" />
            <GhostButton icon="star" label={wide ? 'Estrela' : undefined} onPress={() => star(selItems, !selItems.every(x => x.starred))} />
            <GhostButton icon="trash" label={wide ? 'Lixeira' : undefined} onPress={() => trash(selItems.filter(x => !x.shared))} testID="drive-sel-trash" /></>}
        </View>
        : <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{alignItems: 'center', gap: 4, minHeight: 40}}>
          {(inSearch ? [{id: 'search', name: 'Resultados da pesquisa'}] : crumbs).map((p, i, all) => <View key={p.id + i} style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
            {i ? <Icon name="chevron" size={14} color={c.muted} /> : null}
            <Pressable testID={'drive-crumb-' + i} accessibilityRole="link" onPress={() => !inSearch && i < all.length - 1 && go('drive', p.id)} ref={(el: any) => bindDom(el, !inSearch && view === 'drive' ? dropOn(p.id, p.name) : {})} style={({hovered}: any) => ({paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: dragTarget === p.id ? c.accentSoft : hovered && i < all.length - 1 ? c.input : 'transparent'})}>
              <Text style={{color: i === all.length - 1 ? c.text : c.muted, fontSize: i === all.length - 1 ? 18 : 14, fontWeight: i === all.length - 1 ? '600' : '400'}}>{p.name}</Text>
            </Pressable></View>)}
        </ScrollView>}
      </View>
      {/* conteudo */}
      <ScrollView keyboardShouldPersistTaps="handled" style={{flex: 1}} contentContainerStyle={{paddingHorizontal: wide ? 18 : 10, paddingBottom: 90, paddingTop: 4, flexGrow: 1}}
        scrollEventThrottle={200} onScroll={(e: any) => { const n = e.nativeEvent; if (n.contentOffset.y + n.layoutMeasurement.height > n.contentSize.height - 800 && limit < items.length) setLimit(l => l + 300); }}
        {...(contextMenu(() => canWrite && !notConnected ? newMenu : []) as any)}>
        {!notConnected && (data || viewItems) ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 6, marginBottom: 4, minHeight: 30}}>
          <Text testID="drive-status" style={{flex: 1, color: searchErr ? c.danger : c.muted, fontSize: 13}}>{inSearch ? (searchErr ? 'A pesquisa falhou: ' + searchErr : searching && !found ? 'Pesquisando no seu Drive…' : items.length + (items.length === 1 ? ' resultado' : ' resultados') + ' no seu Drive para “' + query.trim() + '”') : trashView ? 'Itens na lixeira são apagados pelo Google depois de 30 dias.' : data?.shared && view === 'drive' ? 'Pasta compartilhada com você' : ''}</Text>
          {searchErr ? <GhostButton icon="refresh" label="Tentar de novo" onPress={() => void runSearch(query.trim())} /> : null}
          {layout === 'grid' ? <Pressable testID="drive-sort" accessibilityRole="button" accessibilityLabel="Ordenar" onPress={sortMenu} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: hovered ? c.input : 'transparent'})}><Text style={{color: c.muted, fontSize: 13}}>{({name: 'Nome', modified: 'Modificado', size: 'Tamanho'})[sort.key]} {sort.dir === 1 ? '↑' : '↓'}</Text></Pressable> : null}
        </View> : null}
        {notConnected ? <View testID="drive-connect" style={{margin: 16, padding: 24, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 10, alignItems: 'flex-start', maxWidth: 560}}><Icon name="drive" size={30} color={c.accent} /><Text style={{color: c.text, fontSize: 18, fontWeight: '600'}}>Seu Google Drive dentro da Sofia</Text><Text style={{color: c.muted, fontSize: 14, lineHeight: 20}}>{code === 'DRIVE_NEEDS_PERMISSION' ? 'Para mostrar aqui os seus arquivos e pastas, o Google precisa da sua permissão. É uma vez só.' : 'Entre com a sua conta Google para ver e organizar os seus arquivos aqui.'}</Text><PrimaryButton icon="drive" label={granting ? 'Abrindo o Google…' : 'Permitir acesso ao meu Google Drive'} disabled={granting} onPress={() => void grant()} testID="drive-grant" /></View>
          : error ? <View style={{margin: 16, gap: 10}}><Text style={{color: c.danger, fontSize: 14}}>{error}</Text><GhostButton icon="refresh" label="Tentar de novo" onPress={() => void load()} /></View>
          : !(data || viewItems) || (loading && !items.length) ? <View style={{padding: 40, alignItems: 'center'}}><ActivityIndicator color={c.accent} /></View>
          : !items.length ? <Pressable onPress={canWrite ? pickFiles : undefined} style={{margin: 16, padding: 40, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: c.line, alignItems: 'center', gap: 10}}><Icon name={inSearch ? 'search' : trashView ? 'trash' : view === 'starred' ? 'star' : 'upload'} size={34} color={c.muted} />
              <Text style={{color: c.text, fontSize: 16, fontWeight: '500'}}>{inSearch ? (searching ? 'Pesquisando…' : 'Nada com esse nome no seu Drive') : trashView ? 'A lixeira está vazia' : view === 'starred' ? 'Nada com estrela' : view === 'shared' ? 'Nada compartilhado com você' : view === 'recent' ? 'Nada recente' : 'Esta pasta está vazia'}</Text>
              {canWrite ? <Text style={{color: c.muted, fontSize: 13}}>{WEB ? 'Arraste arquivos ou pastas para cá, ou clique para enviar' : 'Toque para enviar arquivos'}</Text> : null}</Pressable>
          : layout === 'grid' ? <>
            {shownFolders.length ? <><Text style={{color: c.muted, fontSize: 13, fontWeight: '600', marginHorizontal: 6, marginTop: 6, marginBottom: 2}}>Pastas</Text><View style={{flexDirection: 'row', flexWrap: 'wrap'}}>{shownFolders.map(card)}</View></> : null}
            {shownFiles.length ? <><Text style={{color: c.muted, fontSize: 13, fontWeight: '600', marginHorizontal: 6, marginTop: 14, marginBottom: 2}}>Arquivos</Text><View style={{flexDirection: 'row', flexWrap: 'wrap'}}>{shownFiles.map(card)}</View></> : null}
          </> : <View style={{borderTopWidth: 1, borderTopColor: c.line}}>{wide ? <View style={{flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 12}}>{head('Nome', 'name', {flex: 1, marginLeft: 32})}{inSearch || view !== 'drive' ? <Text style={{width: 160, color: c.muted, fontSize: 12, fontWeight: '600'}}>Local</Text> : null}{head('Modificado', 'modified', {width: 120})}{head('Tamanho', 'size', {width: 90, justifyContent: 'flex-end'})}<View style={{width: 18}} /></View> : null}{[...shownFolders, ...shownFiles].map(row)}</View>}
        {limit < items.length ? <Pressable onPress={() => setLimit(l => l + 300)} style={{alignSelf: 'center', padding: 14}}><Text style={{color: c.accent}}>Mostrar mais ({items.length - limit})</Text></Pressable> : null}
        {loading && items.length ? <View style={{position: 'absolute', top: 8, right: 16}}><ActivityIndicator size="small" color={c.accent} /></View> : null}
        {/* area vazia abaixo dos itens (clicar tira a selecao; botao direito: Nova pasta / Enviar) */}
        <View testID="drive-blank" style={{flexGrow: 1, minHeight: 120}} />
      </ScrollView>
    </View>
    {/* celular: botao Novo flutuante */}
    {!wide && canWrite && !notConnected ? <View style={{position: 'absolute', right: 18, bottom: 22}}>{newButton(true)}</View> : null}
    {/* soltar arquivos do computador */}
    {dropOver ? <View pointerEvents="none" style={{position: 'absolute', left: 12, right: 12, top: 12, bottom: 12, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: c.accent, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', gap: 10}}><Icon name="upload" size={40} color={c.accent} /><Text style={{color: c.accent, fontSize: 18, fontWeight: '600'}}>Solte para enviar para “{data?.folder.name || 'Meu Drive'}”</Text></View> : null}
    {/* envios em andamento */}
    {uploads.length ? <View testID="drive-uploads" style={{position: 'absolute', right: 16, bottom: 16, width: 340, maxWidth: '92%', borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, padding: 12, gap: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.25)'} as any}>
      <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text, fontWeight: '600', fontSize: 14}}>{uploads.some(u => u.state === 'sending' || u.state === 'waiting') ? 'Enviando ' + uploads.filter(u => u.state === 'sending' || u.state === 'waiting').length + ' arquivo(s)…' : 'Envio concluído'}</Text>
        {!uploads.some(u => u.state === 'sending' || u.state === 'waiting') ? <Pressable accessibilityLabel="Fechar" onPress={() => setUploads([])} hitSlop={8}><Icon name="close" size={16} color={c.muted} /></Pressable> : null}</View>
      <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight: 220}}>{uploads.map(u => <View key={u.key} style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3}}>
        {u.state === 'sending' || u.state === 'waiting' ? <ActivityIndicator size="small" color={c.accent} /> : <Icon name={u.state === 'done' ? 'checkCircle' : u.state === 'canceled' ? 'close' : 'warning'} size={16} color={u.state === 'done' ? '#16A34A' : u.state === 'canceled' ? c.muted : c.danger} />}
        <Text numberOfLines={1} style={{flex: 1, color: u.state === 'error' ? c.danger : c.text, fontSize: 13}}>{u.state === 'error' ? u.name + ': ' + (u.msg || 'falhou') : u.name}</Text>
        {u.state === 'sending' && u.total ? <Text style={{color: c.muted, fontSize: 12, fontVariant: ['tabular-nums']}}>{Math.floor(u.sent / u.total * 100)}%</Text> : null}
        {u.state === 'sending' || u.state === 'waiting' ? <Pressable accessibilityLabel={'Cancelar ' + u.name} onPress={() => u.ctl?.abort()} hitSlop={8}><Icon name="close" size={14} color={c.muted} /></Pressable> : null}
      </View>)}</ScrollView>
    </View> : null}
    {/* aviso com desfazer */}
    {toast ? <View testID="drive-toast" style={{position: 'absolute', left: wide ? 260 : 16, bottom: uploads.length ? 16 : 22, maxWidth: 520, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#1F1B2B', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.3)'} as any}>
      <Text numberOfLines={2} style={{color: '#fff', fontSize: 14, flexShrink: 1}}>{toast.msg}</Text>
      {toast.undo ? <Pressable testID="drive-undo" accessibilityRole="button" onPress={toast.undo} hitSlop={8}><Text style={{color: '#B9A8FF', fontSize: 14, fontWeight: '600'}}>Desfazer</Text></Pressable> : null}
      <Pressable accessibilityLabel="Fechar aviso" onPress={() => setToast(null)} hitSlop={8}><Icon name="close" size={14} color="#fff" /></Pressable></View> : null}
    {/* nome de pasta nova / renomear (renomear seleciona o nome sem a extensao, como no Google Drive) */}
    <Dialog visible={!!naming} onClose={() => setNaming(null)} title={naming?.mode === 'folder' ? 'Nova pasta' : 'Renomear'} footer={<View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 8}}><GhostButton label="Cancelar" onPress={() => setNaming(null)} /><PrimaryButton label={naming?.mode === 'folder' ? 'Criar' : 'Salvar'} testID="drive-name-ok" disabled={!naming?.value.trim()} onPress={() => submitName()} /></View>}>
      {naming ? <NameInput key={(naming.item?.id || 'nova') + naming.mode} initial={naming.value} folder={naming.mode === 'folder' || !!naming.item?.folder} onChange={v => setNaming(n => n ? {...n, value: v} : n)} onSubmit={() => submitName()} /> : null}
    </Dialog>
    {moving ? <MoveDialog api={api} items={moving} start={view === 'drive' ? folder : 'root'} onClose={() => setMoving(null)} onPick={(dest, name) => { const list = moving; setMoving(null); moveTo(list, dest, name); }} /> : null}
    {preview ? <DrivePreview api={api} item={preview} list={viewList} onGo={it => { setPreview(it); setSel([it.id]); }} onClose={() => setPreview(null)} onDownload={() => void download(preview)} /> : null}
  </View>;
  function submitName() { const n = naming; if (!n || !n.value.trim()) return; setNaming(null);
    if (n.mode === 'folder') void act(() => api.sdCreateFolder(folder, n.value.trim()), 'Pasta “' + n.value.trim() + '” criada');
    else if (n.item && n.value.trim() !== n.item.name) { const old = n.item.name, id = n.item.id; void act(() => api.sdUpdate(id, {name: n.value.trim()}), 'Renomeado para “' + n.value.trim() + '”', () => api.sdUpdate(id, {name: old})); } }
}

function NameInput({initial, folder, onChange, onSubmit}: {initial: string; folder: boolean; onChange: (v: string) => void; onSubmit: () => void}) {
  const c = useTheme(), [v, setV] = useState(initial), dot = folder ? -1 : initial.lastIndexOf('.');
  const [selection, setSelection] = useState<{start: number; end: number} | undefined>({start: 0, end: dot > 0 ? dot : initial.length});
  return <TextInput testID="drive-name-input" autoFocus value={v} selection={selection} onSelectionChange={() => setSelection(undefined)} onChangeText={t => { setV(t); onChange(t); }} onSubmitEditing={onSubmit} placeholder={folder ? 'Pasta sem título' : 'Nome'} placeholderTextColor={c.muted} style={{color: c.text, backgroundColor: c.input, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, outlineStyle: 'none'} as any} />;
}

function MoveDialog({api, items, start, onClose, onPick}: {api: SofiaApi; items: SdItem[]; start: string; onClose: () => void; onPick: (dest: string, name: string) => void}) {
  const c = useTheme(), [at, setAt] = useState(start), [data, setData] = useState<SdListing | null>(null), [err, setErr] = useState('');
  useEffect(() => { let alive = true; setData(null); setErr(''); void api.sdList(at).then(r => { if (alive) setData(r); }).catch(e => { if (alive) setErr(errorText(e)); }); return () => { alive = false; }; }, [api, at]);
  const ids = items.map(i => i.id), here = data?.folder.name || '…', inside = data && data.folder.id !== 'root' ? data.path[data.path.length - 1] || {id: 'root', name: 'Meu Drive'} : null;
  const title = items.length === 1 ? 'Mover “' + items[0].name + '”' : 'Mover ' + items.length + ' itens';
  return <Dialog visible onClose={onClose} title={title} footer={<View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 8}}><GhostButton label="Cancelar" onPress={onClose} /><PrimaryButton label={'Mover para ' + here} testID="drive-move-ok" disabled={!data || ids.includes(data.folder.id)} onPress={() => data && onPick(data.folder.id, data.folder.name)} /></View>}>
    <View style={{gap: 4, minHeight: 220}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>{inside ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar uma pasta" onPress={() => setAt(inside.id)} hitSlop={8}><Icon name="back" size={18} color={c.text} /></Pressable> : null}<Text style={{color: c.text, fontWeight: '600'}}>{here}</Text></View>
      {err ? <View style={{gap: 8}}><Text style={{color: c.danger}}>{err}</Text><GhostButton icon="refresh" label="Tentar de novo" onPress={() => setAt(a => a === 'root' ? 'root' : a)} /></View> : !data ? <ActivityIndicator color={c.accent} /> : null}
      <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight: 300}}>
        {(data?.items || []).filter(i => i.folder && !ids.includes(i.id)).map(i => <Pressable key={i.id} accessibilityRole="button" accessibilityLabel={'Abrir pasta ' + i.name} onPress={() => setAt(i.id)} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 8, backgroundColor: hovered ? c.input : 'transparent'})}><Icon name="folder" size={18} color={c.muted} active /><Text style={{color: c.text, flex: 1}} numberOfLines={1}>{i.name}</Text><Icon name="chevron" size={14} color={c.muted} /></Pressable>)}
        {data && !data.items.some(i => i.folder && !ids.includes(i.id)) ? <Text style={{color: c.muted, paddingVertical: 8}}>Sem pastas aqui.</Text> : null}
      </ScrollView>
    </View>
  </Dialog>;
}
