// 07/11/2026 (Pedro): "um drive igual o Google Drive, so que versao da Sofia" - subir qualquer arquivo, criar pastas,
// arrastar, mover, renomear, apagar e visualizar PDF, Word, Excel, imagem, audio e video, no site e no app. Os arquivos ficam
// no GOOGLE DRIVE DO PROPRIO USUARIO (pasta "Sofia Drive"), pela conta Google que ele ja liga em Perfil > Conexoes.
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import {File, Paths} from 'expo-file-system';
import type {SdItem, SdListing, SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {appAlert} from '../lib/app-alert';
import {attachmentBase64} from '../lib/attachment-read';
import {Icon, type IconName} from '../components/Icon';
import {Dialog, GhostButton, PrimaryButton, openMore} from '../components/AppKit';
import {contextMenu, type MenuItem} from '../components/ContextMenu';
import {DriveVideoPlayer} from '../components/DriveVideoPlayer';
import * as WebBrowser from 'expo-web-browser';

const WEB = Platform.OS === 'web';
const VIEW_KEY = 'sofia.drive.view';
type Kind = 'folder' | 'image' | 'pdf' | 'doc' | 'sheet' | 'slides' | 'audio' | 'video' | 'text' | 'zip' | 'other';
export function driveKind(it: Pick<SdItem, 'mime' | 'name' | 'folder'>): Kind {
  const m = String(it.mime || ''), n = String(it.name || '').toLowerCase();
  if (it.folder) return 'folder';
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (/wordprocessingml|msword|opendocument\.text|google-apps\.document|rtf/.test(m) || /\.(docx?|odt|rtf)$/.test(n)) return 'doc';
  if (/spreadsheetml|ms-excel|opendocument\.spreadsheet|google-apps\.spreadsheet|text\/csv/.test(m) || /\.(xlsx?|ods|csv)$/.test(n)) return 'sheet';
  if (/presentationml|ms-powerpoint|opendocument\.presentation|google-apps\.presentation/.test(m) || /\.(pptx?|odp)$/.test(n)) return 'slides';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('text/') || /json|xml|javascript/.test(m)) return 'text';
  if (/zip|rar|7z|tar|gzip/.test(m)) return 'zip';
  return 'other';
}
const KIND: Record<Kind, {icon: IconName; color: string; label: string}> = {
  folder: {icon: 'folder', color: '#8A8F98', label: 'Pasta'}, image: {icon: 'fileImage', color: '#D9534F', label: 'Imagem'},
  pdf: {icon: 'filePdf', color: '#E5484D', label: 'PDF'}, doc: {icon: 'fileDoc', color: '#3B82F6', label: 'Documento'},
  sheet: {icon: 'fileXls', color: '#16A34A', label: 'Planilha'}, slides: {icon: 'filePpt', color: '#EA8A23', label: 'Apresentação'},
  audio: {icon: 'fileAudio', color: '#A855F7', label: 'Áudio'}, video: {icon: 'fileVideo', color: '#E5484D', label: 'Vídeo'},
  text: {icon: 'fileText', color: '#64748B', label: 'Texto'}, zip: {icon: 'fileZip', color: '#8A8F98', label: 'Compactado'}, other: {icon: 'file', color: '#8A8F98', label: 'Arquivo'},
};
const size = (b: number | null) => b == null ? '—' : b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + ' MB';
const when = (iso: string) => { const d = new Date(iso); if (!iso || Number.isNaN(d.getTime())) return ''; const today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : d.toLocaleDateString('pt-BR', {day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'}); };
const viewable = (k: Kind) => k !== 'folder' && k !== 'zip' && k !== 'other';

/** Miniatura de imagem com o login da Sofia (no site, o navegador nao manda o cabecalho de acesso numa <img>). */
function Thumb({api, item, h}: {api: SofiaApi; item: SdItem; h: number}) {
  const c = useTheme(), [url, setUrl] = useState('');
  useEffect(() => { if (!WEB) return; let alive = true, made = ''; void api.sdBlob(item.id).then(b => { if (!alive) return; made = URL.createObjectURL(b); setUrl(made); }).catch(() => {}); return () => { alive = false; if (made) URL.revokeObjectURL(made); }; }, [api, item.id]);
  if (!WEB) return <Image source={{uri: api.sdFileUrl(item.id), headers: api.sdAuthHeaders()}} style={{width: '100%', height: h, backgroundColor: c.input}} resizeMode="cover" />;
  return url ? <Image source={{uri: url}} style={{width: '100%', height: h, backgroundColor: c.input}} resizeMode="cover" /> : <View style={{height: h, alignItems: 'center', justifyContent: 'center', backgroundColor: c.input}}><Icon name="fileImage" size={34} color={KIND.image.color} /></View>;
}

export function Drive({api, active, onBack}: {api: SofiaApi; active: boolean; onBack?: () => void}) {
  const c = useTheme(), {width} = useWindowDimensions(), wide = width >= 900;
  const [folder, setFolder] = useState('root'), [data, setData] = useState<SdListing | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(''), [code, setCode] = useState('');
  const [view, setView] = useState<'grid' | 'list'>(() => { try { return (WEB && globalThis.localStorage?.getItem(VIEW_KEY) === 'list') ? 'list' : 'grid'; } catch { return 'grid'; } });
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(''), [preview, setPreview] = useState<SdItem | null>(null);
  const [naming, setNaming] = useState<{mode: 'folder' | 'rename'; item?: SdItem; value: string} | null>(null), [moving, setMoving] = useState<SdItem | null>(null);
  const [uploads, setUploads] = useState<{name: string; state: 'sending' | 'done' | 'error'; msg?: string}[]>([]), [dropOver, setDropOver] = useState(false), [dragTarget, setDragTarget] = useState('');
  const dropRef = useRef<any>(null), dragging = useRef<SdItem | null>(null);

  const load = useCallback(async (f = folder) => {
    setLoading(true); setError(''); setCode('');
    try { const r = await api.sdList(f); if (r.connected === false) { setCode(r.code || 'DRIVE_NOT_CONNECTED'); setData(null); return; } setData(r); setFolder(f); setSelected(''); }
    catch (e: any) { setError(errorText(e)); setCode(String(e?.code || '')); }
    finally { setLoading(false); }
  }, [api, folder]);
  useEffect(() => { if (active) void load(folder); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (id: string) => void load(id);
  const setViewSaved = (v: 'grid' | 'list') => { setView(v); try { globalThis.localStorage?.setItem(VIEW_KEY, v); } catch { /* sem armazenamento */ } };

  // ---------- envio ----------
  async function sendFiles(files: {name: string; mime: string; blob?: Blob; uri?: string}[]) {
    if (!files.length) return; const parent = folder;
    setUploads(u => [...u.filter(x => x.state === 'sending'), ...files.map(f => ({name: f.name, state: 'sending' as const}))]);
    for (const f of files) {
      try { await api.sdUpload(parent, {name: f.name, mime: f.mime, blob: f.blob, base64: f.uri ? await attachmentBase64(f.uri) : undefined}); setUploads(u => u.map(x => x.name === f.name && x.state === 'sending' ? {...x, state: 'done'} : x)); }
      catch (e) { setUploads(u => u.map(x => x.name === f.name && x.state === 'sending' ? {...x, state: 'error', msg: errorText(e)} : x)); }
    }
    if (parent === folder) void load(parent);
    setTimeout(() => setUploads(u => u.filter(x => x.state !== 'done')), 4000);
  }
  function pickFiles() {
    if (WEB) { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.onchange = () => { const list = Array.from(input.files || []); void sendFiles(list.map(f => ({name: f.name, mime: f.type || 'application/octet-stream', blob: f}))); }; input.click(); return; }
    void DocumentPicker.getDocumentAsync({multiple: true, copyToCacheDirectory: true}).then(r => { if (r.canceled) return; void sendFiles(r.assets.map(a => ({name: a.name, mime: a.mimeType || 'application/octet-stream', uri: a.uri}))); });
  }
  // arrastar arquivos do computador para dentro do Drive (site)
  useEffect(() => {
    if (!WEB || !active) return; const el: HTMLElement | null = dropRef.current; if (!el) return;
    const isFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');
    const over = (e: DragEvent) => { if (!isFiles(e)) return; e.preventDefault(); setDropOver(true); };
    const leave = (e: DragEvent) => { if (!el.contains(e.relatedTarget as Node)) setDropOver(false); };
    const drop = (e: DragEvent) => { if (!isFiles(e)) return; e.preventDefault(); setDropOver(false); const list = Array.from(e.dataTransfer?.files || []); void sendFiles(list.map(f => ({name: f.name, mime: f.type || 'application/octet-stream', blob: f}))); };
    el.addEventListener('dragover', over); el.addEventListener('dragleave', leave); el.addEventListener('drop', drop);
    return () => { el.removeEventListener('dragover', over); el.removeEventListener('dragleave', leave); el.removeEventListener('drop', drop); };
  });

  // ---------- acoes ----------
  async function act(run: () => Promise<unknown>, reload = true) { try { await run(); if (reload) await load(folder); } catch (e) { appAlert('Não deu certo', errorText(e)); } }
  async function download(it: SdItem) {
    if (WEB) { try { const b = await api.sdBlob(it.id, 'download'), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = it.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); } catch (e) { appAlert('Não consegui baixar', errorText(e)); } return; }
    try { const target = new File(Paths.cache, 'sofiadrive-' + it.id + '-' + it.name.replace(/[^\p{L}\p{N}._-]/gu, '_')); try { if (target.exists) target.delete(); } catch { /* baixa de novo */ } const f = await File.downloadFileAsync(api.sdFileUrl(it.id, 'download'), target, {headers: api.sdAuthHeaders(), idempotent: true}); await Sharing.shareAsync(f.uri, {mimeType: it.mime || undefined, dialogTitle: it.name}); } catch (e) { appAlert('Não consegui abrir', errorText(e)); }
  }
  const openItem = (it: SdItem) => { const k = driveKind(it); if (it.folder) open(it.id); else if (WEB && viewable(k)) setPreview(it);
    else if (!WEB && (k === 'video' || k === 'audio')) void api.sdStreamUrl(it.id).then(u => WebBrowser.openBrowserAsync(u)).catch(e => appAlert('Não consegui abrir', errorText(e))); else void download(it); };
  const trash = (it: SdItem) => appAlert('Mandar para a lixeira?', '“' + it.name + '” vai para a lixeira do seu Google Drive (dá para recuperar por lá).', [{text: 'Cancelar', style: 'cancel'}, {text: 'Mandar para a lixeira', style: 'destructive', onPress: () => void act(() => api.sdTrash(it.id))}]);
  const menu = (it: SdItem): MenuItem[] => [
    {label: it.folder ? 'Abrir' : viewable(driveKind(it)) ? 'Visualizar' : 'Abrir', icon: 'eye', run: () => openItem(it)},
    ...(it.folder ? [] : [{label: 'Baixar', icon: 'download' as IconName, run: () => void download(it)}]),
    {label: 'Renomear', icon: 'rename', run: () => setNaming({mode: 'rename', item: it, value: it.name})},
    {label: 'Mover para…', icon: 'moveTo', run: () => setMoving(it)},
    {label: 'Mandar para a lixeira', icon: 'trash', danger: true, run: () => trash(it)},
  ];
  // arrastar um item para dentro de uma pasta (site)
  const dragProps = (it: SdItem) => WEB ? {draggable: true, onDragStart: (e: any) => { dragging.current = it; e.dataTransfer?.setData('text/plain', it.id); }, onDragEnd: () => { dragging.current = null; setDragTarget(''); },
    ...(it.folder ? {onDragOver: (e: any) => { if (dragging.current && dragging.current.id !== it.id) { e.preventDefault(); setDragTarget(it.id); } }, onDragLeave: () => setDragTarget(t => t === it.id ? '' : t),
      onDrop: (e: any) => { const d = dragging.current; if (!d || d.id === it.id) return; e.preventDefault(); e.stopPropagation(); setDragTarget(''); dragging.current = null; void act(() => api.sdUpdate(d.id, {parent: it.id})); }} : {})} : {};
  const crumbDrop = (id: string) => WEB ? {onDragOver: (e: any) => { if (dragging.current) { e.preventDefault(); setDragTarget('crumb:' + id); } }, onDragLeave: () => setDragTarget(''), onDrop: (e: any) => { const d = dragging.current; if (!d) return; e.preventDefault(); setDragTarget(''); dragging.current = null; void act(() => api.sdUpdate(d.id, {parent: id})); }} : {};

  const items = useMemo(() => { const q = query.trim().toLowerCase(); const all = data?.items || []; return q ? all.filter(i => i.name.toLowerCase().includes(q)) : all; }, [data, query]);
  const folders = items.filter(i => i.folder), files = items.filter(i => !i.folder);
  const cols = Math.max(2, Math.floor(((wide ? Math.min(width - 300, 1500) : width) - 40) / (wide ? 200 : 160)));

  const Card = ({it}: {it: SdItem}) => { const k = KIND[driveKind(it)], sel = selected === it.id, target = dragTarget === it.id;
    return <Pressable testID={'drive-item-' + it.id} accessibilityRole="button" accessibilityLabel={(it.folder ? 'Pasta ' : '') + it.name} onPress={() => { if (WEB && !it.folder && selected !== it.id) setSelected(it.id); else openItem(it); }} onLongPress={(e: any) => openMore(e, it.name, menu(it))}
      {...({onDoubleClick: () => openItem(it), ...contextMenu(() => menu(it)), ...dragProps(it)} as any)}
      style={({hovered}: any) => ({width: `${100 / cols}%`, padding: 6})}>
      {({hovered}: any) => <View style={{borderRadius: 12, borderWidth: 1, borderColor: target ? c.accent : sel ? c.accent : c.line, backgroundColor: target ? c.accentSoft : sel ? c.accentSoft : hovered ? c.input : c.surface, overflow: 'hidden'}}>
        {it.folder ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12}}><Icon name="folder" size={22} color={k.color} active /><Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 14, fontWeight: '500'}}>{it.name}</Text><Pressable accessibilityLabel={'Mais ações para ' + it.name} hitSlop={8} onPress={(e: any) => openMore(e, it.name, menu(it))}><Icon name="more" size={18} color={c.muted} /></Pressable></View>
          : <><View style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10}}><Icon name={k.icon} size={18} color={k.color} active /><Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 13, fontWeight: '500'}}>{it.name}</Text><Pressable accessibilityLabel={'Mais ações para ' + it.name} hitSlop={8} onPress={(e: any) => openMore(e, it.name, menu(it))}><Icon name="more" size={18} color={c.muted} /></Pressable></View>
            <View style={{marginHorizontal: 8, marginBottom: 8, borderRadius: 8, overflow: 'hidden', height: 120}}>{driveKind(it) === 'image' ? <Thumb api={api} item={it} h={120} /> : <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.input}}><Icon name={k.icon} size={44} color={k.color} /></View>}</View></>}
      </View>}
    </Pressable>; };
  const Row = ({it}: {it: SdItem}) => { const k = KIND[driveKind(it)], target = dragTarget === it.id;
    return <Pressable testID={'drive-item-' + it.id} accessibilityRole="button" accessibilityLabel={(it.folder ? 'Pasta ' : '') + it.name} onPress={() => openItem(it)} onLongPress={(e: any) => openMore(e, it.name, menu(it))} {...({...contextMenu(() => menu(it)), ...dragProps(it)} as any)}
      style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: target ? c.accentSoft : hovered ? c.input : 'transparent'})}>
      <Icon name={k.icon} size={20} color={k.color} active /><Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 14}}>{it.name}</Text>
      {wide ? <><Text style={{width: 120, color: c.muted, fontSize: 13}}>{when(it.modified)}</Text><Text style={{width: 90, color: c.muted, fontSize: 13, textAlign: 'right'}}>{it.folder ? '—' : size(it.size)}</Text></> : null}
      <Pressable accessibilityLabel={'Mais ações para ' + it.name} hitSlop={8} onPress={(e: any) => openMore(e, it.name, menu(it))}><Icon name="more" size={18} color={c.muted} /></Pressable>
    </Pressable>; };

  const notConnected = code === 'DRIVE_NOT_CONNECTED' || code === 'GOOGLE_NOT_CONNECTED' || code === 'DRIVE_NEEDS_PERMISSION';
  const [granting, setGranting] = useState(false);
  async function grant() { // a propria conta Google do usuario: uma vez, na tela do Google
    setGranting(true); try { const r = await api.calendarConnect(); const u = new URL(r.url); if (u.protocol !== 'https:') throw Error('Endereço de autorização inválido.'); await WebBrowser.openAuthSessionAsync(u.toString(), 'sofiaapp://google'); await load('root'); } catch (e) { appAlert('Não deu certo', errorText(e)); } finally { setGranting(false); }
  }
  return <View ref={dropRef} testID="sofia-drive" style={{flex: 1, backgroundColor: c.bg}}>
    {/* cabecalho */}
    <View style={{paddingHorizontal: wide ? 28 : 16, paddingTop: wide ? 22 : 12, gap: 14}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
        {onBack && !wide ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} hitSlop={10}><Icon name="back" size={22} color={c.text} /></Pressable> : null}
        <Text accessibilityRole="header" style={{fontSize: wide ? 28 : 24, fontWeight: '600', letterSpacing: -1, color: c.text}}>Drive</Text>
        <View style={{flex: 1}} />
        {wide ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.input, borderRadius: 10, paddingHorizontal: 12, width: 320}}><Icon name="search" size={16} color={c.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="Pesquisar nesta pasta" placeholderTextColor={c.muted} style={{flex: 1, color: c.text, paddingVertical: 9, fontSize: 14, outlineStyle: 'none'} as any} /></View> : null}
        <GhostButton icon={view === 'grid' ? 'listView' : 'gridView'} label={wide ? (view === 'grid' ? 'Lista' : 'Grade') : undefined} onPress={() => setViewSaved(view === 'grid' ? 'list' : 'grid')} testID="drive-view" />
        <Pressable testID="drive-new" accessibilityRole="button" accessibilityLabel="Novo" onPress={(e: any) => openMore(e, 'Novo', [{label: 'Nova pasta', icon: 'folderPlus', run: () => setNaming({mode: 'folder', value: ''})}, {label: 'Enviar arquivos', icon: 'upload', run: pickFiles}])}
          style={({hovered, pressed}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: c.accent, opacity: hovered ? 0.92 : 1, transform: [{scale: pressed ? 0.97 : 1}], boxShadow: '0 4px 14px rgba(0,0,0,0.18)'} as any)}>
          <Icon name="plus" size={18} color={c.onAccent} /><Text style={{color: c.onAccent, fontSize: 14, fontWeight: '600'}}>Novo</Text></Pressable>
      </View>
      {/* caminho (soltar um item aqui move para a pasta) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{alignItems: 'center', gap: 4}}>
        {[{id: 'root', name: 'Meu Drive'}, ...(data?.path || []), ...(data && data.folder.id !== 'root' ? [data.folder] : [])].map((p, i, all) => <View key={p.id + i} style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
          {i ? <Icon name="chevron" size={14} color={c.muted} /> : null}
          <Pressable accessibilityRole="link" onPress={() => i < all.length - 1 && open(p.id)} {...(crumbDrop(p.id) as any)} style={({hovered}: any) => ({paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: dragTarget === 'crumb:' + p.id ? c.accentSoft : hovered && i < all.length - 1 ? c.input : 'transparent'})}>
            <Text style={{color: i === all.length - 1 ? c.text : c.muted, fontSize: i === all.length - 1 ? 16 : 14, fontWeight: i === all.length - 1 ? '600' : '400'}}>{p.name}</Text>
          </Pressable></View>)}
      </ScrollView>
    </View>
    {!WEB ? <View style={{flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 6}}><GhostButton icon="folderPlus" label="Nova pasta" onPress={() => setNaming({mode: 'folder', value: ''})} /><GhostButton icon="upload" label="Enviar arquivos" onPress={pickFiles} /></View> : null}
    {/* conteudo */}
    <ScrollView keyboardShouldPersistTaps="handled" style={{flex: 1}} contentContainerStyle={{paddingHorizontal: wide ? 22 : 10, paddingBottom: 60, paddingTop: 8}}>
      {notConnected ? <View testID="drive-connect" style={{margin: 16, padding: 24, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 10, alignItems: 'flex-start', maxWidth: 560}}><Icon name="drive" size={30} color={c.accent} /><Text style={{color: c.text, fontSize: 18, fontWeight: '600'}}>Seu Google Drive dentro da Sofia</Text><Text style={{color: c.muted, fontSize: 14, lineHeight: 20}}>{code === 'DRIVE_NEEDS_PERMISSION' ? 'Para mostrar aqui os seus arquivos e pastas, o Google precisa da sua permissão. É uma vez só.' : 'Entre com a sua conta Google para ver e organizar os seus arquivos aqui.'}</Text><PrimaryButton icon="drive" label={granting ? 'Abrindo o Google…' : 'Permitir acesso ao meu Google Drive'} disabled={granting} testID="drive-grant" onPress={() => void grant()} /></View>
        : error ? <View style={{margin: 16, gap: 10}}><Text style={{color: c.danger, fontSize: 14}}>{error}</Text><GhostButton icon="refresh" label="Tentar de novo" onPress={() => void load(folder)} /></View>
        : !data ? <View style={{padding: 40, alignItems: 'center'}}><ActivityIndicator color={c.accent} /></View>
        : !items.length ? <Pressable onPress={pickFiles} style={{margin: 16, padding: 40, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: c.line, alignItems: 'center', gap: 10}}><Icon name="upload" size={34} color={c.muted} /><Text style={{color: c.text, fontSize: 16, fontWeight: '500'}}>{query ? 'Nada com esse nome nesta pasta' : 'Esta pasta está vazia'}</Text><Text style={{color: c.muted, fontSize: 13}}>{WEB ? 'Arraste arquivos para cá ou clique para enviar' : 'Toque para enviar arquivos'}</Text></Pressable>
        : view === 'grid' ? <>
          {folders.length ? <><Text style={{color: c.muted, fontSize: 13, fontWeight: '600', marginHorizontal: 6, marginTop: 6, marginBottom: 2}}>Pastas</Text><View style={{flexDirection: 'row', flexWrap: 'wrap'}}>{folders.map(it => <Card key={it.id} it={it} />)}</View></> : null}
          {files.length ? <><Text style={{color: c.muted, fontSize: 13, fontWeight: '600', marginHorizontal: 6, marginTop: 14, marginBottom: 2}}>Arquivos</Text><View style={{flexDirection: 'row', flexWrap: 'wrap'}}>{files.map(it => <Card key={it.id} it={it} />)}</View></> : null}
        </> : <View style={{borderTopWidth: 1, borderTopColor: c.line}}>{wide ? <View style={{flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 12}}><Text style={{flex: 1, marginLeft: 32, color: c.muted, fontSize: 12, fontWeight: '600'}}>Nome</Text><Text style={{width: 120, color: c.muted, fontSize: 12, fontWeight: '600'}}>Modificado</Text><Text style={{width: 90, color: c.muted, fontSize: 12, fontWeight: '600', textAlign: 'right'}}>Tamanho</Text><View style={{width: 18}} /></View> : null}{items.map(it => <Row key={it.id} it={it} />)}</View>}
      {loading && data ? <View style={{position: 'absolute', top: 8, right: 16}}><ActivityIndicator size="small" color={c.accent} /></View> : null}
    </ScrollView>
    {/* arrastar arquivos do computador */}
    {dropOver ? <View pointerEvents="none" style={{position: 'absolute', left: 12, right: 12, top: 12, bottom: 12, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: c.accent, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', gap: 10}}><Icon name="upload" size={40} color={c.accent} /><Text style={{color: c.accent, fontSize: 18, fontWeight: '600'}}>Solte para enviar para “{data?.folder.name || 'Meu Drive'}”</Text></View> : null}
    {/* envios em andamento */}
    {uploads.length ? <View testID="drive-uploads" style={{position: 'absolute', right: 16, bottom: 16, width: 320, maxWidth: '90%', borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, padding: 12, gap: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.25)'} as any}>
      <Text style={{color: c.text, fontWeight: '600', fontSize: 14}}>{uploads.some(u => u.state === 'sending') ? 'Enviando ' + uploads.filter(u => u.state === 'sending').length + ' arquivo(s)…' : 'Envio concluído'}</Text>
      {uploads.slice(-5).map((u, i) => <View key={u.name + i} style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>{u.state === 'sending' ? <ActivityIndicator size="small" color={c.accent} /> : <Icon name={u.state === 'done' ? 'checkCircle' : 'warning'} size={16} color={u.state === 'done' ? '#16A34A' : c.danger} />}<Text numberOfLines={1} style={{flex: 1, color: u.state === 'error' ? c.danger : c.text, fontSize: 13}}>{u.state === 'error' ? u.name + ': ' + (u.msg || 'falhou') : u.name}</Text></View>)}
    </View> : null}
    {/* nome de pasta nova / renomear */}
    <Dialog visible={!!naming} onClose={() => setNaming(null)} title={naming?.mode === 'folder' ? 'Nova pasta' : 'Renomear'} footer={<View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 8}}><GhostButton label="Cancelar" onPress={() => setNaming(null)} /><PrimaryButton label={naming?.mode === 'folder' ? 'Criar' : 'Salvar'} testID="drive-name-ok" disabled={!naming?.value.trim()} onPress={() => { const n = naming!; setNaming(null); void act(() => n.mode === 'folder' ? api.sdCreateFolder(folder, n.value.trim()) : api.sdUpdate(n.item!.id, {name: n.value.trim()})); }} /></View>}>
      <TextInput testID="drive-name-input" autoFocus value={naming?.value || ''} onChangeText={v => setNaming(n => n ? {...n, value: v} : n)} onSubmitEditing={() => { const n = naming; if (!n || !n.value.trim()) return; setNaming(null); void act(() => n.mode === 'folder' ? api.sdCreateFolder(folder, n.value.trim()) : api.sdUpdate(n.item!.id, {name: n.value.trim()})); }} placeholder={naming?.mode === 'folder' ? 'Pasta sem título' : 'Nome'} placeholderTextColor={c.muted} selectTextOnFocus style={{color: c.text, backgroundColor: c.input, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, outlineStyle: 'none'} as any} />
    </Dialog>
    {moving ? <MoveDialog api={api} item={moving} onClose={() => setMoving(null)} onPick={dest => { const it = moving; setMoving(null); void act(() => api.sdUpdate(it.id, {parent: dest})); }} /> : null}
    {preview ? <Preview api={api} item={preview} onClose={() => setPreview(null)} onDownload={() => void download(preview)} /> : null}
  </View>;
}

/** Escolher a pasta de destino (navega pelas pastas do Sofia Drive). */
function MoveDialog({api, item, onClose, onPick}: {api: SofiaApi; item: SdItem; onClose: () => void; onPick: (dest: string) => void}) {
  const c = useTheme(), [at, setAt] = useState('root'), [data, setData] = useState<SdListing | null>(null), [err, setErr] = useState('');
  useEffect(() => { let alive = true; setData(null); void api.sdList(at).then(r => { if (alive) setData(r); }).catch(e => { if (alive) setErr(errorText(e)); }); return () => { alive = false; }; }, [api, at]);
  const here = data ? (data.folder.id === 'root' ? 'Meu Drive' : data.folder.name) : '';
  return <Dialog visible onClose={onClose} title={'Mover “' + item.name + '”'} footer={<View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 8}}><GhostButton label="Cancelar" onPress={onClose} /><PrimaryButton label={'Mover para ' + (here || '…')} testID="drive-move-ok" disabled={!data} onPress={() => onPick(at)} /></View>}>
    <View style={{gap: 6, minHeight: 220}}>
      {data && data.folder.id !== 'root' ? <Pressable onPress={() => setAt(data.path.length ? data.path[data.path.length - 1].id : 'root')} style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8}}><Icon name="back" size={16} color={c.muted} /><Text style={{color: c.muted}}>Voltar</Text></Pressable> : null}
      {err ? <Text style={{color: c.danger}}>{err}</Text> : !data ? <ActivityIndicator color={c.accent} /> : data.items.filter(i => i.folder && i.id !== item.id).map(f => <Pressable key={f.id} onPress={() => setAt(f.id)} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, backgroundColor: hovered ? c.input : 'transparent'})}><Icon name="folder" size={20} color="#8A8F98" active /><Text style={{flex: 1, color: c.text}}>{f.name}</Text><Icon name="chevron" size={14} color={c.muted} /></Pressable>)}
      {data && !data.items.some(i => i.folder && i.id !== item.id) ? <Text style={{color: c.muted, paddingVertical: 8}}>Sem pastas aqui.</Text> : null}
    </View>
  </Dialog>;
}

/** Visualizador (site): imagem, PDF, Word/Excel/PowerPoint (convertidos em PDF), audio, video e texto. */
function Preview({api, item, onClose, onDownload}: {api: SofiaApi; item: SdItem; onClose: () => void; onDownload: () => void}) {
  const c = useTheme(), k = driveKind(item), [url, setUrl] = useState(''), [text, setText] = useState(''), [err, setErr] = useState('');
  useEffect(() => {
    let alive = true, made = ''; setUrl(''); setText(''); setErr('');
    const office = k === 'doc' || k === 'sheet' || k === 'slides';
    if (k === 'video' || k === 'audio') { void api.sdStreamUrl(item.id).then(u => { if (alive) setUrl(u); }).catch(e => { if (alive) setErr(errorText(e)); }); return () => { alive = false; }; }
    void api.sdBlob(item.id, office ? 'preview' : 'content').then(async b => { if (!alive) return; if (k === 'text') setText((await b.text()).slice(0, 200000)); else { made = URL.createObjectURL(b); setUrl(made); } }).catch(e => { if (alive) setErr(errorText(e)); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [api, item.id, k]);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onClose]);
  const K = KIND[k];
  return <View testID="drive-preview" style={{position: 'fixed' as any, left: 0, right: 0, top: 0, bottom: 0, zIndex: 50, backgroundColor: 'rgba(10,8,14,0.92)'}}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} hitSlop={10}><Icon name="back" size={22} color="#fff" /></Pressable>
      <Icon name={K.icon} size={20} color={K.color} active /><Text numberOfLines={1} style={{flex: 1, color: '#fff', fontSize: 16, fontWeight: '500'}}>{item.name}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Baixar" onPress={onDownload} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: hovered ? 'rgba(255,255,255,0.12)' : 'transparent'})}><Icon name="download" size={18} color="#fff" /><Text style={{color: '#fff'}}>Baixar</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar visualização" onPress={onClose} hitSlop={10}><Icon name="close" size={22} color="#fff" /></Pressable>
    </View>
    <Pressable style={{flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20}} onPress={onClose}>
      <Pressable style={{width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', cursor: 'default'} as any} onPress={() => {}}>
        {err ? <Text style={{color: '#fff', fontSize: 16, textAlign: 'center'}}>{err}</Text>
          : k === 'text' ? (text ? <ScrollView keyboardShouldPersistTaps="handled" style={{width: '100%', maxWidth: 1000, backgroundColor: c.surface, borderRadius: 10}} contentContainerStyle={{padding: 20}}><Text selectable style={{color: c.text, fontFamily: 'monospace', fontSize: 13}}>{text}</Text></ScrollView> : <ActivityIndicator color="#fff" />)
          : !url ? <View style={{alignItems: 'center', gap: 12}}><ActivityIndicator color="#fff" /><Text style={{color: 'rgba(255,255,255,0.7)'}}>{k === 'doc' || k === 'sheet' || k === 'slides' ? 'Preparando a visualização…' : 'Abrindo…'}</Text></View>
          : k === 'image' ? React.createElement('img', {src: url, alt: item.name, style: {maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6}})
          : k === 'audio' ? <DriveVideoPlayer src={url} title={item.name} audio />
          : k === 'video' ? <DriveVideoPlayer src={url} title={item.name} />
          : React.createElement('iframe', {src: url, title: item.name, style: {width: 'min(1100px, 100%)', height: '100%', border: 0, borderRadius: 6, background: '#fff'}})}
      </Pressable>
    </Pressable>
  </View>;
}
