// 07/11/2026 (Pedro): visualizador do Drive, como o do Google Drive.
// Site: imagem (com zoom), PDF, Word/Excel/PowerPoint e Docs/Planilhas/Apresentacoes do Google (convertidos em PDF), texto,
// audio e video (player proprio). Abre por um LINK ASSINADO do proprio site (nao por blob: - a protecao da pagina bloqueia
// quadros com blob:, e era por isso que PDF/Word apareciam em branco). Setas e botoes dos lados passam de arquivo, clicar
// fora fecha, Esc fecha. No video, as setas avancam o video so depois de clicar nele.
// Celular: imagem e texto dentro do app; PDF, Office, video e audio no visualizador do aparelho.
import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, Text, View} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type {SdItem, SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {Icon, type IconName} from './Icon';
import {DriveVideoPlayer} from './DriveVideoPlayer';
import {note} from '../lib/drive-diag';
import {OverAll} from '../lib/over-all';

const WEB = Platform.OS === 'web';
export type Kind = 'folder' | 'image' | 'pdf' | 'doc' | 'sheet' | 'slides' | 'audio' | 'video' | 'text' | 'zip' | 'other';
export function driveKind(it: Pick<SdItem, 'mime' | 'name' | 'folder'>): Kind {
  const m = String(it.mime || ''), n = String(it.name || '').toLowerCase();
  if (it.folder) return 'folder';
  if (m.startsWith('image/') || m === 'application/vnd.google-apps.drawing') return 'image';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (/wordprocessingml|msword|opendocument\.text|google-apps\.document|rtf/.test(m) || /\.(docx?|odt|rtf)$/.test(n)) return 'doc';
  if (/spreadsheetml|ms-excel|opendocument\.spreadsheet|google-apps\.spreadsheet|text\/csv/.test(m) || /\.(xlsx?|ods|csv)$/.test(n)) return 'sheet';
  if (/presentationml|ms-powerpoint|opendocument\.presentation|google-apps\.presentation/.test(m) || /\.(pptx?|odp)$/.test(n)) return 'slides';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('text/') || /json|xml|javascript|markdown/.test(m) || /\.(txt|md|json|csv|log|xml|ya?ml)$/.test(n)) return 'text';
  if (/zip|rar|7z|tar|gzip/.test(m)) return 'zip';
  return 'other';
}
export const KIND: Record<Kind, {icon: IconName; color: string; label: string}> = {
  folder: {icon: 'folder', color: '#8A8F98', label: 'Pasta'}, image: {icon: 'fileImage', color: '#D9534F', label: 'Imagem'},
  pdf: {icon: 'filePdf', color: '#E5484D', label: 'PDF'}, doc: {icon: 'fileDoc', color: '#3B82F6', label: 'Documento'},
  sheet: {icon: 'fileXls', color: '#16A34A', label: 'Planilha'}, slides: {icon: 'filePpt', color: '#EA8A23', label: 'Apresentação'},
  audio: {icon: 'fileAudio', color: '#A855F7', label: 'Áudio'}, video: {icon: 'fileVideo', color: '#E5484D', label: 'Vídeo'},
  text: {icon: 'fileText', color: '#64748B', label: 'Texto'}, zip: {icon: 'fileZip', color: '#8A8F98', label: 'Compactado'}, other: {icon: 'file', color: '#8A8F98', label: 'Arquivo'},
};
export const viewable = (k: Kind) => k !== 'folder' && k !== 'zip' && k !== 'other';
const browserImage = (m: string) => /^image\/(png|jpeg|gif|webp|bmp|avif|svg\+xml)$/.test(m) && m !== 'image/svg+xml';

/** Copias de imagens/miniaturas ja baixadas (por item, data e tamanho): nao baixa de novo a cada clique. Ate 150. */
const blobCache = new Map<string, Promise<string>>();
export function cachedBlobUrl(api: SofiaApi, item: SdItem, kind: 'content' | 'thumb' | 'big'): Promise<string> {
  const key = item.id + '|' + (item.modified || '') + '|' + kind;
  const hit = blobCache.get(key); if (hit) { blobCache.delete(key); blobCache.set(key, hit); return hit; }
  const p = api.sdBlob(item.id, kind === 'content' ? 'content' : 'thumb', undefined, kind === 'big' ? 1600 : 440).then(b => URL.createObjectURL(b)); blobCache.set(key, p); p.catch(() => blobCache.delete(key));
  while (blobCache.size > 150) { const [k, old] = blobCache.entries().next().value as [string, Promise<string>]; blobCache.delete(k); void old.then(u => setTimeout(() => URL.revokeObjectURL(u), 30000)).catch(() => {}); }
  return p;
}

/** Abre no celular: imagem/texto ficam no app; o resto no visualizador do aparelho pelo link assinado. */
export async function openNative(api: SofiaApi, it: SdItem): Promise<'inapp' | 'external'> {
  const k = driveKind(it);
  if (k === 'image' || k === 'text') return 'inapp';
  const u = await api.sdSignedUrl(it.id, k === 'doc' || k === 'sheet' || k === 'slides' ? 'preview' : '');
  await WebBrowser.openBrowserAsync(u); return 'external';
}

export function DrivePreview({api, item, list, onGo, onClose, onDownload}: {api: SofiaApi; item: SdItem; list: SdItem[]; onGo: (it: SdItem) => void; onClose: () => void; onDownload: () => void}) {
  return WEB ? <WebPreview api={api} item={item} list={list} onGo={onGo} onClose={onClose} onDownload={onDownload} /> : <NativePreview api={api} item={item} list={list} onGo={onGo} onClose={onClose} onDownload={onDownload} />;
}

function WebPreview({api, item, list, onGo, onClose, onDownload}: {api: SofiaApi; item: SdItem; list: SdItem[]; onGo: (it: SdItem) => void; onClose: () => void; onDownload: () => void}) {
  const c = useTheme(), k = driveKind(item), [url, setUrl] = useState(''), [text, setText] = useState(''), [err, setErr] = useState(''), [retry, setRetry] = useState(0);
  const idx = list.findIndex(x => x.id === item.id), prev = idx > 0 ? list[idx - 1] : null, next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  const office = k === 'doc' || k === 'sheet' || k === 'slides';
  useEffect(() => {
    let alive = true; setUrl(''); setText(''); setErr('');
    const fail = (e: any) => { if (alive) { setErr(errorText(e)); note('visualizar', false, {kind: k, file: item, error: e}); } };
    const t0 = Date.now(), done = () => note('visualizar', true, {kind: k, file: item, ms: Date.now() - t0});
    if (k === 'image') { cachedBlobUrl(api, item, browserImage(item.mime) || !item.thumb ? 'content' : 'big').then(u => { if (alive) { setUrl(u); done(); } }).catch(fail); return () => { alive = false; }; }
    if (k === 'text') { void api.sdSignedUrl(item.id).then(u => fetch(u, {headers: {Range: 'bytes=0-262143'}})).then(async r => { if (!r.ok) throw new Error('Não consegui abrir (' + r.status + ').'); const t = await r.text(); if (alive) { setText(t || ' '); done(); } }).catch(fail); return () => { alive = false; }; }
    void api.sdSignedUrl(item.id, office || item.mime.startsWith('application/vnd.google-apps.') ? 'preview' : '').then(u => { if (alive) { setUrl(u); done(); } }).catch(fail);
    return () => { alive = false; };
  }, [api, item.id, k, retry]); // eslint-disable-line react-hooks/exhaustive-deps
  const [zoom, setZoom] = useState(1), zoomRef = useRef(1); zoomRef.current = zoom; useEffect(() => setZoom(1), [item.id]);
  const nav = useRef({prev, next, onGo, onClose, k}); nav.current = {prev, next, onGo, onClose, k};
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const n = nav.current; if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') { if (!document.fullscreenElement) { e.preventDefault(); e.stopPropagation(); n.onClose(); } return; }
      const t = e.target as HTMLElement | null; if (t && (/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return;
      if (document.activeElement?.closest?.('[data-testid=drive-video-player]')) return; // video em foco: as setas avancam o video
      if (n.k === 'image' && (e.key === '+' || e.key === '=')) { e.preventDefault(); setZoom(z => Math.min(8, z * 1.25)); return; }
      if (n.k === 'image' && (e.key === '-' || e.key === '_')) { e.preventDefault(); setZoom(z => Math.max(1, z / 1.25)); return; }
      if (n.k === 'image' && e.key === '0') { setZoom(1); return; }
      if (n.k === 'image' && zoomRef.current > 1 && e.key.startsWith('Arrow')) return; // com zoom, as setas andam pela imagem
      if (e.key === 'ArrowRight' && n.next) { e.preventDefault(); e.stopPropagation(); n.onGo(n.next); } else if (e.key === 'ArrowLeft' && n.prev) { e.preventDefault(); e.stopPropagation(); n.onGo(n.prev); }
    };
    window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true);
  }, []);
  // fecha so quando o clique comeca e termina no fundo (arrastar a barra do video ate fora nao fecha)
  const downOnBack = useRef(false);
  const back = (e: any) => e.target === e.currentTarget;
  const K = KIND[k], h = React.createElement;
  const side = (dir: 'prev' | 'next', it: SdItem | null) => it ? <Pressable key={dir} testID={'drive-preview-' + dir} accessibilityRole="button" accessibilityLabel={(dir === 'prev' ? 'Anterior: ' : 'Próximo: ') + it.name} onPress={() => onGo(it)}
    style={({hovered}: any) => ({position: 'absolute', top: '50%', [dir === 'prev' ? 'left' : 'right']: 14, marginTop: -26, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)', zIndex: 2} as any)}>
    <View style={{transform: [{rotate: dir === 'prev' ? '180deg' : '0deg'}]}}><Icon name="chevron" size={26} color="#fff" /></View></Pressable> : null;
  const content = err ? <View style={{alignItems: 'center', gap: 14, maxWidth: 520}}><Icon name="warning" size={30} color="#fff" /><Text style={{color: '#fff', fontSize: 16, textAlign: 'center'}}>{err}</Text>
      <View style={{flexDirection: 'row', gap: 10}}><DarkButton icon="refresh" label="Tentar de novo" onPress={() => setRetry(r => r + 1)} /><DarkButton icon="download" label="Baixar" onPress={onDownload} /></View></View>
    : k === 'text' ? (text ? <ScrollView keyboardShouldPersistTaps="handled" style={{width: '100%', maxWidth: 1000, maxHeight: '100%', backgroundColor: c.surface, borderRadius: 10, flexGrow: 0}} contentContainerStyle={{padding: 20}}><Text selectable style={{color: c.text, fontFamily: 'monospace', fontSize: 13}}>{text}</Text>{text.length >= 262000 ? <Text style={{color: c.muted, marginTop: 12}}>Mostrando só o começo. Baixe para ver o arquivo inteiro.</Text> : null}</ScrollView> : <Spinner label="Abrindo…" />)
    : !url ? <Spinner label={office ? 'Preparando a visualização…' : 'Abrindo…'} />
    : k === 'image' ? <ZoomImage key={item.id} src={url} alt={item.name} zoom={zoom} setZoom={setZoom} />
    : k === 'audio' ? <DriveVideoPlayer key={item.id} src={url} title={item.name} audio onFail={m => note('tocar', false, {kind: k, file: item, msg: m})} onExpired={() => setRetry(r => r + 1)} />
    : k === 'video' ? h('div', {style: {width: 'min(1400px, 100%)', aspectRatio: '16 / 9', maxHeight: '100%', display: 'flex'}}, <DriveVideoPlayer key={item.id} src={url} title={item.name} onFail={m => note('tocar', false, {kind: k, file: item, msg: m})} onExpired={() => setRetry(r => r + 1)} />)
    : h('iframe', {key: url, src: url, title: item.name, 'data-testid': 'drive-preview-frame', style: {width: 'min(1100px, 100%)', height: '100%', border: 0, borderRadius: 6, background: '#fff', display: 'block'}});
  // por cima da pagina inteira (menu lateral da Sofia incluido): clicar fora so fecha, nunca abre outra coisa por baixo
  return <OverAll><View testID="drive-preview" accessibilityViewIsModal style={{position: 'fixed' as any, left: 0, right: 0, top: 0, bottom: 0, zIndex: 50, backgroundColor: 'rgba(10,8,14,0.92)', pointerEvents: 'auto'} as any}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} hitSlop={10}><Icon name="back" size={22} color="#fff" /></Pressable>
      <Icon name={K.icon} size={20} color={K.color} active /><Text numberOfLines={1} style={{flex: 1, color: '#fff', fontSize: 16, fontWeight: '500'}}>{item.name}</Text>
      {k === 'image' && url ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 4}}>
        <Pressable testID="drive-zoom-out" accessibilityRole="button" accessibilityLabel="Diminuir zoom" disabled={zoom <= 1} onPress={() => setZoom(z => Math.max(1, z / 1.25))} style={{padding: 6, opacity: zoom <= 1 ? 0.4 : 1}}><Icon name="zoomOut" size={18} color="#fff" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Ajustar à tela" onPress={() => setZoom(1)} style={{paddingHorizontal: 4, minWidth: 48, alignItems: 'center'}}><Text style={{color: '#fff', fontSize: 13, fontVariant: ['tabular-nums']}}>{Math.round(zoom * 100)}%</Text></Pressable>
        <Pressable testID="drive-zoom-in" accessibilityRole="button" accessibilityLabel="Aumentar zoom" disabled={zoom >= 8} onPress={() => setZoom(z => Math.min(8, z * 1.25))} style={{padding: 6, opacity: zoom >= 8 ? 0.4 : 1}}><Icon name="zoomIn" size={18} color="#fff" /></Pressable></View> : null}
      {list.length > 1 && idx >= 0 ? <Text testID="drive-preview-count" style={{color: 'rgba(255,255,255,0.7)', fontSize: 13, fontVariant: ['tabular-nums']}}>{idx + 1} de {list.length}</Text> : null}
      {item.web ? <DarkButton icon="external" label="Abrir no Google" onPress={() => window.open(item.web, '_blank', 'noopener')} /> : null}
      <DarkButton icon="download" label="Baixar" onPress={onDownload} />
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar visualização" onPress={onClose} hitSlop={10}><Icon name="close" size={22} color="#fff" /></Pressable>
    </View>
    {h('div', {'data-testid': 'drive-preview-backdrop', onMouseDown: (e: any) => { downOnBack.current = back(e); }, onClick: (e: any) => { if (downOnBack.current && back(e)) onClose(); downOnBack.current = false; },
      style: {flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 84px 24px', boxSizing: 'border-box'}},
      side('prev', prev), content, side('next', next))}
  </View></OverAll>;
}
const Spinner = ({label}: {label: string}) => <View style={{alignItems: 'center', gap: 12}}><ActivityIndicator color="#fff" /><Text style={{color: 'rgba(255,255,255,0.7)'}}>{label}</Text></View>;
function DarkButton({icon, label, onPress}: {icon: IconName; label: string; onPress: () => void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: hovered ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)'})}><Icon name={icon} size={18} color="#fff" /><Text style={{color: '#fff', fontSize: 14}}>{label}</Text></Pressable>;
}

/** Imagem do visualizador com zoom (botoes, + e -, Ctrl + rodinha, duplo clique). Com zoom, arrasta-se a imagem para andar nela. */
function ZoomImage({src, alt, zoom, setZoom}: {src: string; alt: string; zoom: number; setZoom: (f: (z: number) => number) => void}) {
  const box = useRef<HTMLDivElement | null>(null), [nat, setNat] = useState<{w: number; h: number} | null>(null), [area, setArea] = useState({w: 0, h: 0}), drag = useRef<{x: number; y: number; l: number; t: number} | null>(null);
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setArea({w: el.clientWidth, h: el.clientHeight})); ro.observe(el); setArea({w: el.clientWidth, h: el.clientHeight});
    const wheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); setZoom(z => Math.max(1, Math.min(8, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))); };
    const host = el.parentElement || el; host.addEventListener('wheel', wheel, {passive: false}); return () => { ro.disconnect(); host.removeEventListener('wheel', wheel); }; }, [setZoom]);
  const fit = nat && area.w ? Math.min(1, area.w / nat.w, area.h / nat.h) : 1, w = nat ? nat.w * fit * zoom : undefined;
  const h = React.createElement;
  return h('div', {ref: box, 'data-testid': 'drive-image', style: {width: '100%', height: '100%', overflow: zoom > 1 ? 'auto' : 'hidden', display: 'flex', pointerEvents: zoom > 1 ? 'auto' : 'none'}},
    h('img', {src, alt, draggable: false, onLoad: (e: any) => setNat({w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1}),
      onDoubleClick: () => setZoom(z => z > 1 ? 1 : 2),
      onMouseDown: (e: any) => { const el = box.current; if (zoom <= 1 || !el) return; e.preventDefault(); drag.current = {x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop};
        const mv = (ev: MouseEvent) => { const d = drag.current; if (d) { el.scrollLeft = d.l - (ev.clientX - d.x); el.scrollTop = d.t - (ev.clientY - d.y); } }, up = () => { drag.current = null; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); },
      style: {margin: 'auto', display: 'block', borderRadius: 6, pointerEvents: 'auto', cursor: zoom > 1 ? 'grab' : 'zoom-in', userSelect: 'none', flexShrink: 0, ...(w ? {width: w, height: 'auto', maxWidth: 'none'} : {maxWidth: '100%', maxHeight: '100%', objectFit: 'contain'})}}));
}

/** Celular: imagem e texto em tela cheia dentro do app, com anterior/proximo. */
function NativePreview({api, item, list, onGo, onClose, onDownload}: {api: SofiaApi; item: SdItem; list: SdItem[]; onGo: (it: SdItem) => void; onClose: () => void; onDownload: () => void}) {
  const k = driveKind(item), [text, setText] = useState(''), [err, setErr] = useState('');
  const idx = list.findIndex(x => x.id === item.id), prev = idx > 0 ? list[idx - 1] : null, next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  useEffect(() => { let alive = true; setText(''); setErr(''); if (k === 'text') void api.sdSignedUrl(item.id).then(u => fetch(u, {headers: {Range: 'bytes=0-262143'}})).then(r => r.text()).then(t => { if (alive) setText(t || ' '); }).catch(e => { if (alive) setErr(errorText(e)); }); return () => { alive = false; }; }, [api, item.id, k]);
  const src = k === 'image' ? {uri: item.thumb && !browserImage(item.mime) ? api.sdFileUrl(item.id, 'thumb') + '?s=1600' : api.sdFileUrl(item.id, 'content'), headers: api.sdAuthHeaders()} : null;
  return <Modal visible animationType="fade" onRequestClose={onClose} transparent={false}>
    <View testID="drive-preview" style={{flex: 1, backgroundColor: '#0A080E'}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 44, paddingBottom: 10}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} hitSlop={12}><Icon name="back" size={24} color="#fff" /></Pressable>
        <Text numberOfLines={1} style={{flex: 1, color: '#fff', fontSize: 16, fontWeight: '500'}}>{item.name}</Text>
        {list.length > 1 && idx >= 0 ? <Text style={{color: 'rgba(255,255,255,0.7)', fontSize: 13}}>{idx + 1} de {list.length}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Baixar" onPress={onDownload} hitSlop={12}><Icon name="download" size={22} color="#fff" /></Pressable>
      </View>
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
        {err ? <Text style={{color: '#fff', padding: 24, textAlign: 'center'}}>{err}</Text>
          : src ? <Image source={src} resizeMode="contain" style={{width: '100%', height: '100%'}} />
          : text ? <ScrollView keyboardShouldPersistTaps="handled" style={{alignSelf: 'stretch'}} contentContainerStyle={{padding: 16}}><Text selectable style={{color: '#fff', fontFamily: 'monospace', fontSize: 13}}>{text}</Text></ScrollView> : <ActivityIndicator color="#fff" />}
      </View>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', padding: 16, paddingBottom: 28}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Anterior" disabled={!prev} onPress={() => prev && onGo(prev)} style={{opacity: prev ? 1 : 0.3, padding: 10}}><View style={{transform: [{rotate: '180deg'}]}}><Icon name="chevron" size={26} color="#fff" /></View></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Próximo" disabled={!next} onPress={() => next && onGo(next)} style={{opacity: next ? 1 : 0.3, padding: 10}}><Icon name="chevron" size={26} color="#fff" /></Pressable>
      </View>
    </View>
  </Modal>;
}
