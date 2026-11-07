// 07/11/2026 (Pedro): "quero poder arrastar um docx, pdf, o que for, ele ficar uma linha com o tipo de arquivo e o nome; quando
// clico eu posso visualizar, assim com imagem, video, audio. Imagem tem a opcao de visualizacao (mexer na escala) ou anexo. A
// janela e flutuante, igual as janelas do tablet, que voce move e usa de referencia ao lado. Para todo tipo de conteudo."
// - Bloco 'file' da pagina: modo "anexo" (linha com icone do tipo, nome e tamanho) ou "visualizacao" (imagem, video, audio,
//   PDF e Office direto na pagina, com a escala ajustavel).
// - Clicar abre a JANELA FLUTUANTE: arrasta pelo topo, muda o tamanho pelo canto, varias abertas ao mesmo tempo, ficam por cima
//   enquanto voce escreve. PDF e Office (convertido em PDF pelo Google no servidor) num quadro; imagem com zoom; video e audio
//   com o player do navegador; texto em letra fixa.
// Os arquivos abrem por LINK ASSINADO do proprio site (a protecao da pagina bloqueia quadros com blob:).
import React, {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {Platform, Pressable, Text, View} from 'react-native';
import type {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {Icon} from './Icon';
import {Spinner} from './Loading';
import {driveKind, KIND, type Kind} from './DrivePreview';
import {OverAll} from '../lib/over-all';
import {errorText} from '../lib/chat-model';
import {DocEditor} from './DocEditor';
import {SheetEditor, XLSX_MIME} from './SheetEditor';
import {SlideEditor, PPTX_MIME} from './SlideEditor';
import {mountInWindow} from '../lib/popup-root';
import type {SaveTarget} from '../lib/office-save';
import {setSofiaClip} from '../lib/sofia-clipboard';

const WEB = Platform.OS === 'web';
const h = React.createElement as any;
export const FILE_MAX = 25 * 1024 * 1024;
export type PageFileData = {attachment_id?: string; name?: string; mime?: string; size?: number; view?: 'attach' | 'preview'; scale?: number; uploading?: boolean; progress?: string};

export const fileKind = (mime?: string, name?: string): Kind => driveKind({mime: String(mime || ''), name: String(name || ''), folder: false} as any);
const OFFICE = (k: Kind) => k === 'doc' || k === 'sheet' || k === 'slides';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** .docx abre no editor da Sofia (o resto do Office continua em PDF). */
export const isDocx = (mime?: string, name?: string) => String(mime || '') === DOCX_MIME || /\.docx$/i.test(String(name || ''));
/** 07/11/2026: Word, Excel e PowerPoint abrem nos editores da Sofia. */
export const editKind = (mime?: string, name?: string): 'docx' | 'xlsx' | 'pptx' | null => isDocx(mime, name) ? 'docx' : String(mime || '') === XLSX_MIME || /\.xlsx$/i.test(String(name || '')) ? 'xlsx' : String(mime || '') === PPTX_MIME || /\.pptx$/i.test(String(name || '')) ? 'pptx' : null;
export {XLSX_MIME, PPTX_MIME};
function officeEditor(kind: 'docx' | 'xlsx' | 'pptx', p: {api: SofiaApi; id: string; name: string; url: string; pageId: string; onSaved: (a: SavedFile) => void; onShowVersions?: () => void; target?: SaveTarget}) {return kind === 'docx' ? <DocEditor {...p} /> : kind === 'xlsx' ? <SheetEditor {...p} /> : <SlideEditor {...p} />;}
type SavedFile = {id: string; name: string; mime: string; bytes: number};
/** Abre no editor: arquivo de pagina, ou do Drive que nao seja do Google Docs (esse so abre para ver). */
const canEdit = (f: {mime: string; name: string; pageId?: string; drive?: boolean}) => !!editKind(f.mime, f.name) && (!!f.pageId || (!!f.drive && !String(f.mime || '').startsWith('application/vnd.google-apps.')));
/** O alvo fica o mesmo enquanto o editor estiver aberto (guarda a data de modificacao do ultimo salvamento). */
function DriveEdit({kind, p, base}: {kind: 'docx' | 'xlsx' | 'pptx'; p: {api: SofiaApi; id: string; name: string; url: string; pageId: string; onSaved: (a: SavedFile) => void}; base: string}) {
  const target = useRef<SaveTarget>({kind: 'drive', fileId: p.id, base}).current; return officeEditor(kind, {...p, target});
}
/** Pode aparecer dentro da pagina (modo visualizacao). */
export const inlineCapable = (k: Kind) => k === 'image' || k === 'video' || k === 'audio' || k === 'pdf' || OFFICE(k);
/** Abre na janela (o resto: so baixar). */
const windowCapable = (k: Kind, name: string) => inlineCapable(k) || k === 'text' || /\.(txt|md|csv|json|log)$/i.test(name);
export const defaultView = (k: Kind): 'attach' | 'preview' => (k === 'image' || k === 'video' || k === 'audio' ? 'preview' : 'attach');
export function sizeLabel(n?: number) {if (!n) return ''; if (n < 1024) return n + ' B'; if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB'; return (n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0).replace('.', ',') + ' MB';}
const ext = (name?: string) => {const m = /\.([a-z0-9]{1,5})$/i.exec(String(name || '')); return m ? m[1].toUpperCase() : '';};
const GUESS: Record<string, string> = {pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown', json: 'application/json', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', zip: 'application/zip', rtf: 'application/rtf'};
export const guessMime = (f: {type?: string; name?: string}) => String(f.type || '') || GUESS[ext(f.name).toLowerCase()] || 'application/octet-stream';

/** Envia o arquivo como anexo da pagina. Devolve id, nome, tipo e tamanho. */
export async function uploadPageFile(api: SofiaApi, pageId: string, file: File): Promise<Required<Pick<PageFileData, 'attachment_id' | 'name' | 'mime' | 'size'>>> {
  if (!file.size) throw new Error('O arquivo “' + file.name + '” está vazio.');
  if (file.size > FILE_MAX) throw new Error('“' + file.name + '” tem ' + sizeLabel(file.size) + '. O limite por arquivo é 25 MB.');
  const data: string = await new Promise((ok, bad) => {const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(file);});
  const mime = guessMime(file), name = String(file.name || 'arquivo').replace(/[\\/]/g, '_').slice(0, 160);
  const a = await api.uploadAttachment(pageId, {name, mime, base64: data.slice(data.indexOf(',') + 1)});
  return {attachment_id: a.id, name, mime, size: file.size};
}

/** Links assinados (valem 2 h no servidor; aqui 90 min). */
// 07/11/2026 (Pedro: "memorizar o tamanho da tela que deixei pela ultima vez"): tamanho e posicao da janela flutuante e da
// janela separada ficam guardados neste navegador (editor e visualizacao separados: editar costuma pedir janela maior).
type Geo = {x: number; y: number; w: number; h: number};
const geoKey = (where: 'win' | 'popup', ed: boolean) => 'sofia.janela.' + where + '.' + (ed ? 'editor' : 'ver');
function readGeo(where: 'win' | 'popup', ed: boolean): Geo | null {try {const g = JSON.parse(localStorage.getItem(geoKey(where, ed)) || 'null'); return g && [g.x, g.y, g.w, g.h].every(Number.isFinite) && g.w > 200 && g.h > 150 ? g : null;} catch {return null;}}
function saveGeo(where: 'win' | 'popup', ed: boolean, g: Geo) {try {localStorage.setItem(geoKey(where, ed), JSON.stringify({x: Math.round(g.x), y: Math.round(g.y), w: Math.round(g.w), h: Math.round(g.h)}));} catch {}}
const links = new Map<string, {url: string; until: number}>();
async function signedUrl(api: SofiaApi, id: string, as: '' | 'pdf' | 'download' = '') {
  const hit = links.get(id); let url = hit && hit.until > Date.now() ? hit.url : '';
  if (!url) {url = (await api.attachmentLink(id)).url; links.set(id, {url, until: Date.now() + 90 * 60000});}
  return url + (as ? '&as=' + as : '');
}
function useSigned(api: SofiaApi, id: string | undefined, as: '' | 'pdf' = '', drive = false) {
  const [state, setState] = useState<{url: string; error: string; base?: string}>({url: '', error: ''});
  useEffect(() => {let live = true; setState({url: '', error: ''}); if (!id) return;
    // 07/11/2026: arquivo do Drive (editar no proprio Drive): link assinado do Drive e a data de modificacao de agora
    if (drive) {void Promise.all([api.sdSignedUrl(id, as === 'pdf' ? 'preview' : ''), api.sdStamp(id)]).then(([url, st]) => {if (live) setState({url, error: '', base: st.modified});}).catch(e => {if (live) setState({url: '', error: errorText(e)});}); return () => {live = false;};}
    (async () => {const url = await signedUrl(api, id, as);
      if (as === 'pdf') {const r = await fetch(url, {method: 'HEAD'}); if (!r.ok) {const j = await fetch(url).then(x => x.json()).catch(() => null); throw new Error(j?.error || 'Não consegui abrir este arquivo (' + r.status + ').');}}
      return url;})().then(url => {if (live) setState({url, error: ''});}).catch(e => {if (live) setState({url: '', error: errorText(e)});});
    return () => {live = false;};}, [api, id, as, drive]);
  return state;
}
/** 07/11/2026 (Pedro: "quero que ela possa sair da Sofia, como uma segunda pagina avulsa, e navegar entre as telas"): abre o
 * arquivo numa JANELA SEPARADA do navegador (pode ir para outro monitor). A janela e aberta na hora do clique (senao o
 * navegador bloqueia) e preenchida quando o link assinado chega. So imagem, video, audio, PDF, Office (em PDF) e texto. */
export function detachFile(api: SofiaApi, f: {id: string; name: string; mime: string; pageId?: string; onSaved?: (a: SavedFile) => void}) {
  const k = fileKind(f.mime, f.name), sw = window.screen?.availWidth || 1440, sh = window.screen?.availHeight || 900;
  const ed = !!editKind(f.mime, f.name) && !!f.pageId, g = readGeo('popup', ed);
  const w = g ? g.w : Math.round(Math.min(960, sw * 0.5)), hh = g ? g.h : Math.round(Math.min(1040, sh * 0.88)), left = g ? g.x : Math.max(0, sw - w - 40), top = g ? g.y : 40;
  const win = window.open('', 'sofia-arquivo-' + f.id, 'popup=yes,width=' + w + ',height=' + hh + ',left=' + left + ',top=' + top);
  if (!win) return false;
  // a janela nao avisa quando e movida: confere a cada segundo (e ao mudar o tamanho/fechar) e guarda o ultimo lugar
  {let last = ''; const keep = () => {try {if (win.closed) return; const cur = {x: win.screenX, y: win.screenY, w: win.innerWidth, h: win.innerHeight}, k2 = JSON.stringify(cur); if (k2 !== last && cur.w > 200) {last = k2; saveGeo('popup', ed, cur);}} catch {}};
    const t = setInterval(() => {if (win.closed) clearInterval(t); else keep();}, 1000); try {win.addEventListener('resize', keep); win.addEventListener('beforeunload', keep);} catch {}}
  const doc = win.document; doc.title = f.name;
  // 07/11/2026 (Pedro): o modo escuro forcado do navegador (Brave) pintava por cima e invertia os temas: a janela declara que
  // ja cuida das proprias cores, entao o navegador nao mexe (Original = o arquivo como ele e).
  try {const meta = doc.createElement('meta'); meta.name = 'color-scheme'; meta.content = 'light dark'; doc.head.appendChild(meta); doc.documentElement.style.colorScheme = 'light dark';} catch {}
  doc.body.style.cssText = 'margin:0;height:100vh;background:#1c1c1f;display:flex;align-items:center;justify-content:center;font:14px system-ui,sans-serif;color:#ddd';
  doc.body.textContent = 'Abrindo ' + f.name + '…';
  const ek = editKind(f.mime, f.name), editable = !!ek && !!f.pageId;
  // 07/11/2026 (Pedro: "nesse tipo de aba tambem tem que dar pra editar e salvar no proprio docx"): .docx abre no editor
  if (editable) {void signedUrl(api, f.id, '').then(url => {doc.body.textContent = ''; doc.body.style.cssText = 'margin:0;height:100vh;background:#e9e9ee;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif';
    mountInWindow(win, officeEditor(ek!, {api, id: f.id, name: f.name, url, pageId: f.pageId!, onSaved: a => {doc.title = a.name; f.onSaved?.(a);}}));}).catch(e => {doc.body.textContent = errorText(e);}); return true;}
  void signedUrl(api, f.id, OFFICE(k) ? 'pdf' : '').then(async url => {
    doc.body.textContent = ''; doc.title = f.name;
    const el = (tag: string, css: string) => {const x = doc.createElement(tag); x.style.cssText = css; doc.body.appendChild(x); return x as any;};
    if (k === 'image') {const img = el('img', 'max-width:100%;max-height:100vh;object-fit:contain'); img.src = url; img.alt = f.name;}
    else if (k === 'video') {const v = el('video', 'width:100%;height:100vh;background:#000'); v.controls = true; v.src = url;}
    else if (k === 'audio') {const a = el('audio', 'width:90%'); a.controls = true; a.src = url;}
    else if (k === 'pdf' || OFFICE(k) || f.mime === 'text/plain') {const fr = el('iframe', 'width:100%;height:100vh;border:0;background:#fff'); fr.title = f.name; fr.src = url;}
    else {const t = await fetch(url).then(r => r.text()).catch(() => ''); const pre = el('pre', 'margin:0;padding:16px;width:100%;height:100vh;box-sizing:border-box;overflow:auto;white-space:pre-wrap;background:#fff;color:#222;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace'); pre.textContent = t.slice(0, 400000);}
  }).catch(e => {doc.body.textContent = errorText(e);});
  return true;
}
export async function downloadPageFile(api: SofiaApi, id: string) {
  const url = await signedUrl(api, id, 'download'); const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
}

// ---------------- Janelas flutuantes ----------------
type Win = {key: string; api: SofiaApi; id: string; name: string; mime: string; x: number; y: number; w: number; hgt: number; z: number; max: boolean; drag?: boolean; pageId?: string; onSaved?: (a: SavedFile) => void; editId?: string; rev?: number; drive?: boolean};
let wins: Win[] = [], topZ = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const setWins = (next: Win[]) => {wins = next; emit();};
/** `drive`: arquivo do Google Drive do usuario (07/11/2026, Pedro: "posso alterar os itens dentro do drive tambem"): Word, Excel
 * e PowerPoint abrem no editor da Sofia e salvar grava no proprio arquivo do Drive. */
export function openFileWindow(api: SofiaApi, f: {id: string; name: string; mime: string; pageId?: string; onSaved?: (a: SavedFile) => void; drive?: boolean}, at?: Partial<Pick<Win, 'x' | 'y' | 'w' | 'hgt' | 'drag'>>): string {
  const found = wins.find(w => w.id === f.id); if (found) {setWins(wins.map(w => w === found ? {...w, ...(at || {}), z: ++topZ} : w)); return found.key;}
  const ed = canEdit(f), W = window.innerWidth, H = window.innerHeight, g = readGeo('win', ed), n = wins.length, key = f.id + ':' + Date.now();
  const w = g ? Math.min(g.w, W - 8) : ed ? Math.min(960, W - 48) : Math.min(560, Math.max(360, Math.round(W * 0.38))), hgt = g ? Math.min(g.h, H - 8) : ed ? H - 90 : Math.min(H - 110, 720);
  const x0 = g ? Math.max(0, Math.min(W - 120, g.x)) : Math.max(12, W - w - 24), y0 = g ? Math.max(0, Math.min(H - 60, g.y)) : 70;
  setWins([...wins, {key, api, id: f.id, editId: f.id, name: f.name, mime: f.mime, pageId: f.pageId, drive: f.drive, onSaved: f.onSaved, x: x0 + n * 28, y: y0 + n * 28, w, hgt, z: ++topZ, max: false, ...(at || {})}]);
  return key;
}
const useWins = () => useSyncExternalStore(fn => {subs.add(fn); return () => {subs.delete(fn);};}, () => wins, () => wins);
/** 07/11/2026 (Pedro: "quero que esse bloco seja flutuante igual no iPad, que eu possa mover pelo navegador"): segurar a
 * alca do bloco e arrastar TIRA o arquivo da pagina: vira janela flutuante que segue o mouse e fica onde soltar. */
function popOut(api: SofiaApi, f: {id: string; name: string; mime: string; pageId?: string; onSaved?: (a: SavedFile) => void}, e: any, el: HTMLElement | null) {
  if (e.button != null && e.button !== 0) return; e.preventDefault(); e.stopPropagation();
  const sx = e.clientX, sy = e.clientY, r = el?.getBoundingClientRect?.(), bodyStyle = document.body.style, oldSel = bodyStyle.userSelect; let key = '';
  bodyStyle.userSelect = 'none';
  const mv = (ev: PointerEvent) => {const dx = ev.clientX - sx, dy = ev.clientY - sy, W = window.innerWidth, H = window.innerHeight;
    if (!key) {if (Math.hypot(dx, dy) < 6) return; const g = readGeo('win', !!editKind(f.mime, f.name) && !!f.pageId), w = g ? Math.min(g.w, W - 8) : Math.round(Math.max(360, Math.min(720, r?.width || 520))), hgt = g ? Math.min(g.h, H - 8) : Math.round(Math.max(280, Math.min(H - 40, (r?.height || 480) + 44)));
      key = openFileWindow(api, f, {x: (r?.left || sx - 40), y: (r?.top || sy - 20), w, hgt, drag: true});}
    const cur = wins.find(x => x.key === key); if (!cur) return;
    patchWin(key, {x: Math.min(W - 80, Math.max(-cur.w + 120, (r?.left || sx - 40) + dx)), y: Math.min(Math.max(0, H - cur.hgt - 4), Math.max(0, (r?.top || sy - 20) + dy))});};
  const up = () => {bodyStyle.userSelect = oldSel; if (key) {patchWin(key, {drag: false}); const now = wins.find(x => x.key === key); if (now) saveGeo('win', !!editKind(now.mime, now.name) && !!now.pageId, {x: now.x, y: now.y, w: now.w, h: now.hgt});} window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);};
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}
const closeWin = (key: string) => setWins(wins.filter(w => w.key !== key));
const patchWin = (key: string, p: Partial<Win>) => setWins(wins.map(w => w.key === key ? {...w, ...p} : w));

/** Fica montado na tela de Paginas: as janelas abertas aparecem por cima de tudo (e continuam ao trocar de pagina). */
// 07/11/2026: Paginas e Drive montam o seu; so o primeiro desenha (a mesma janela nao aparece duas vezes).
const hosts: object[] = [];
export function FileWindowHost() {
  const list = useWins(), me = useRef({}).current, lead = useSyncExternalStore(fn => {subs.add(fn); return () => {subs.delete(fn);};}, () => hosts[0] === me, () => hosts[0] === me);
  useEffect(() => {hosts.push(me); emit(); return () => {hosts.splice(hosts.indexOf(me), 1); emit();};}, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {if (!WEB) return; const onKey = (e: KeyboardEvent) => {if (e.key !== 'Escape' || !wins.length || hosts[0] !== me) return; const ae = document.activeElement as HTMLElement | null; if (ae && (ae.isContentEditable || /INPUT|TEXTAREA/.test(ae.tagName))) return; const top = [...wins].sort((a, b) => b.z - a.z)[0]; if (top) closeWin(top.key);}; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);}, []);
  if (!WEB || !list.length || !lead) return null;
  return <OverAll>{list.map(w => <FileWindow key={w.key} win={w} />)}</OverAll>;
}

// alcas um pouco para fora da borda (o canto arredondado cortava a ponta onde se pega)
const HANDLES: [string, any, string][] = [
  ['nw', {left: -6, top: -6, width: 20, height: 20}, 'nwse-resize'], ['ne', {right: -6, top: -6, width: 20, height: 20}, 'nesw-resize'],
  ['sw', {left: -6, bottom: -6, width: 20, height: 20}, 'nesw-resize'], ['se', {right: -6, bottom: -6, width: 22, height: 22}, 'nwse-resize'],
  ['n', {left: 14, right: 14, top: -5, height: 9}, 'ns-resize'], ['s', {left: 14, right: 16, bottom: -5, height: 9}, 'ns-resize'],
  ['w', {left: -5, top: 14, bottom: 14, width: 9}, 'ew-resize'], ['e', {right: -5, top: 14, bottom: 16, width: 9}, 'ew-resize']];
function FileWindow({win}: {win: Win}) {
  const [vers, setVers] = useState(false), firstId = useRef(win.id), c = useTheme(), k = fileKind(win.mime, win.name), meta = KIND[k], [zoom, setZoom] = useState(0), [moving, setMoving] = useState(false);
  const drag = (mode: string) => (e: any) => {
    if (e.button != null && e.button !== 0) return; if (mode === 'move' && (e.target as HTMLElement)?.closest?.('[data-win-btn]')) return;
    e.preventDefault(); try {window.getSelection()?.removeAllRanges();} catch {} const sx = e.clientX, sy = e.clientY, o = {...win}, bodyStyle = document.body.style, oldSel = bodyStyle.userSelect; bodyStyle.userSelect = 'none'; setMoving(true); patchWin(win.key, {z: ++topZ});
    const mv = (ev: PointerEvent) => {const dx = ev.clientX - sx, dy = ev.clientY - sy, W = window.innerWidth, H = window.innerHeight;
      if (mode === 'move') patchWin(win.key, {max: false, x: Math.min(W - 80, Math.max(-o.w + 120, o.x + dx)), y: Math.min(Math.max(0, H - o.hgt - 4), Math.max(0, o.y + dy))});
      else {// 07/11/2026 (Pedro: "da pra escalar a tela nos quatro cantos"): os 4 cantos e os 4 lados mudam o tamanho
        let x = o.x, y = o.y, w = o.w, hh = o.hgt;
        if (mode.includes('e')) w = Math.min(W - o.x - 4, o.w + dx);
        if (mode.includes('s')) hh = Math.min(H - o.y - 4, o.hgt + dy);
        if (mode.includes('w')) {const nx = Math.max(0, Math.min(o.x + o.w - 300, o.x + dx)); w = o.w + (o.x - nx); x = nx;}
        if (mode.includes('n')) {const ny = Math.max(0, Math.min(o.y + o.hgt - 220, o.y + dy)); hh = o.hgt + (o.y - ny); y = ny;}
        patchWin(win.key, {x, y, w: Math.max(300, w), hgt: Math.max(220, hh)});}};
    const up = () => {bodyStyle.userSelect = oldSel; setMoving(false); const now = wins.find(x => x.key === win.key); if (now && !now.max) saveGeo('win', !!editKind(now.mime, now.name) && !!now.pageId, {x: now.x, y: now.y, w: now.w, h: now.hgt}); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);};
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const box = win.max ? {left: 12, top: 12, width: 'calc(100vw - 24px)', height: 'calc(100vh - 24px)'} : {left: win.x, top: win.y, width: win.w, height: win.hgt};
  const btn = (icon: any, label: string, run: () => void) => <Pressable key={label} {...({dataSet: {winBtn: '1'}} as any)} accessibilityLabel={label} onPress={run} style={({hovered}: any) => ({width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.line : 'transparent'})}><Icon name={icon} size={15} color={c.muted} /></Pressable>;
  return h('div', {'data-testid': 'file-window', role: 'dialog', 'aria-label': win.name, onPointerDown: () => {if (wins.find(w => w.key === win.key)?.z !== topZ) patchWin(win.key, {z: ++topZ});},
    style: {position: 'absolute', ...box, zIndex: win.z, pointerEvents: 'auto', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.12)'}},
    h('div', {style: {position: 'absolute', inset: 0, background: c.surface, borderRadius: 12, border: '1px solid ' + c.line, overflow: 'hidden', display: 'flex', flexDirection: 'column'}},
    h('div', {onPointerDown: drag('move'), onDoubleClick: () => patchWin(win.key, {max: !win.max}), style: {height: 44, paddingTop: 4, position: 'relative', flexShrink: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 6, borderBottom: '1px solid ' + c.line, cursor: moving ? 'grabbing' : 'grab', userSelect: 'none'}},
      <>{h('div', {style: {position: 'absolute', left: '50%', top: 4, width: 38, height: 4, marginLeft: -19, borderRadius: 2, background: c.line}})}<Icon name={meta.icon} size={16} color={meta.color} />
      <Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 13, fontWeight: '600'}}>{win.name}</Text>
      {k === 'image' ? <>{btn('zoomOut', 'Diminuir', () => setZoom(z => Math.max(25, (z || 100) - 25)))}<Text style={{color: c.muted, fontSize: 11, minWidth: 34, textAlign: 'center'}}>{zoom ? zoom + '%' : 'Ajust.'}</Text>{btn('zoomIn', 'Aumentar', () => setZoom(z => Math.min(400, (z || 100) + 25)))}</> : null}
      {win.pageId ? btn('history', 'Versões anteriores', () => setVers(v => !v)) : null}
      {btn('download', 'Baixar', () => void (win.drive ? win.api.sdSignedUrl(win.id, 'download').then(u => {const a = document.createElement('a'); a.href = u; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();}) : downloadPageFile(win.api, win.id)))}
      {windowCapable(k, win.name) && !win.drive ? btn('external', 'Abrir em janela separada (fora da Sofia)', () => {if (detachFile(win.api, {id: win.id, name: win.name, mime: win.mime, pageId: win.pageId, onSaved: win.onSaved})) closeWin(win.key);}) : null}
      {btn('back', 'Voltar para a página', () => closeWin(win.key))}
      {btn('close', 'Fechar', () => closeWin(win.key))}</>
    ),
    <View style={{flex: 1, minHeight: 0, backgroundColor: k === 'image' || k === 'video' ? '#111' : c.bg}}>
      {vers ? <Versions win={win} onClose={() => setVers(false)} /> : null}
      <FileBody key={win.rev || 0} api={win.api} id={win.id} firstId={win.editId || firstId.current} name={win.name} mime={win.mime} zoom={zoom} onZoom={setZoom} pageId={win.pageId} drive={win.drive} onSaved={a => {patchWin(win.key, {id: a.id, name: a.name}); win.onSaved?.(a);}} onShowVersions={() => setVers(true)} />
      {moving || win.drag ? <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}} /> /* o quadro do PDF nao rouba o arrastar */ : null}
    </View>),
    win.max ? null : HANDLES.map(([mode, css, cursor]) => h('div', {key: mode, onPointerDown: drag(mode), 'aria-label': 'Mudar o tamanho', style: {position: 'absolute', zIndex: 3, cursor, ...css}},
      mode === 'se' ? h('div', {style: {position: 'absolute', right: 10, bottom: 10, width: 8, height: 8, borderRight: '2px solid ' + c.muted, borderBottom: '2px solid ' + c.muted, opacity: 0.6}}) : null)));
}

function FileBody({api, id, firstId, name, mime, zoom, onZoom, pageId, drive, onSaved, onShowVersions}: {api: SofiaApi; id: string; firstId: string; name: string; mime: string; zoom: number; onZoom: (z: number) => void; pageId?: string; drive?: boolean; onSaved: (a: SavedFile) => void; onShowVersions?: () => void}) {
  const ek = editKind(mime, name), editable = canEdit({mime, name, pageId, drive}); /* o editor fica com o arquivo de quando abriu: salvar cria um anexo novo e nao recarrega */
  const c = useTheme(), k = fileKind(mime, name), {url, error, base} = useSigned(api, editable ? firstId : id, editable ? '' : OFFICE(k) ? 'pdf' : '', !!drive), [text, setText] = useState<string | null>(null), [loaded, setLoaded] = useState(false);
  useEffect(() => {if (!url) return; const t = setTimeout(() => setLoaded(true), 3500); return () => clearTimeout(t);}, [url]); // o leitor de PDF nem sempre avisa que terminou
  const textual = !inlineCapable(k) && windowCapable(k, name);
  useEffect(() => {if (!textual || !url) return; let live = true; fetch(url).then(r => r.text()).then(t => {if (live) setText(t.slice(0, 400000));}).catch(() => {if (live) setText('');}); return () => {live = false;};}, [url, textual]);
  if (error) return <Center><Icon name="warning" size={22} color={c.muted} /><Text style={{color: c.text, fontSize: 13, textAlign: 'center', maxWidth: 320}}>{error}</Text><DownloadButton api={api} id={id} /></Center>;
  if (!windowCapable(k, name)) return <Center><Icon name={KIND[k].icon} size={30} color={KIND[k].color} /><Text style={{color: c.text, fontSize: 13}}>Este tipo de arquivo não tem visualização.</Text><DownloadButton api={api} id={id} /></Center>;
  if (!url) return <Center><Spinner size={18} /><Text style={{color: c.muted, fontSize: 12}}>{OFFICE(k) ? 'Preparando a visualização…' : 'Abrindo…'}</Text></Center>;
  if (editable && drive && ek) return <DriveEdit kind={ek} p={{api, id: firstId, name, url, pageId: '', onSaved}} base={base || ''} />;
  if (editable && pageId && ek) return officeEditor(ek, {api, id: firstId, name, url, pageId, onSaved, onShowVersions});
  if (k === 'image') return h('div', {style: {width: '100%', height: '100%', overflow: 'auto', display: 'flex', alignItems: zoom ? 'flex-start' : 'center', justifyContent: zoom ? 'flex-start' : 'center'},
    onWheel: (e: any) => {if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); onZoom(Math.max(25, Math.min(400, (zoom || 100) + (e.deltaY < 0 ? 15 : -15))));}},
    h('img', {src: url, alt: name, draggable: false, style: zoom ? {width: zoom + '%', maxWidth: 'none'} : {maxWidth: '100%', maxHeight: '100%', objectFit: 'contain'}}));
  if (k === 'video') return h('video', {src: url, controls: true, style: {width: '100%', height: '100%', background: '#000'}});
  if (k === 'audio') return <Center><Icon name="fileAudio" size={34} color={KIND.audio.color} /><Text numberOfLines={2} style={{color: c.text, fontSize: 13, textAlign: 'center'}}>{name}</Text>{h('audio', {src: url, controls: true, style: {width: '90%'}})}</Center>;
  if (k === 'pdf' || OFFICE(k)) return <View style={{flex: 1}}>{h('iframe', {src: url, title: name, onLoad: () => setLoaded(true), style: {width: '100%', height: '100%', border: 0, background: '#fff'}})}{loaded ? null : <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg}}><Spinner size={18} /></View>}</View>;
  if (text == null) return <Center><Spinner size={18} /></Center>;
  return h('pre', {style: {margin: 0, padding: 14, width: '100%', height: '100%', overflow: 'auto', boxSizing: 'border-box', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.5, color: c.text, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'}}, text);
}
/** 07/11/2026 (Pedro: "sumiu conteudo"): cada salvamento vira um arquivo novo e o anterior fica guardado; aqui da para voltar. */
function Versions({win, onClose}: {win: Win; onClose: () => void}) {
  const c = useTheme(), [list, setList] = useState<{id: string; name: string; mime: string; bytes: number; created_at: string}[] | null>(null), [err, setErr] = useState('');
  useEffect(() => {let live = true; const ext = (win.name.split('.').pop() || '').toLowerCase();
    win.api.entityAttachments(win.pageId!).then(items => {if (live) setList(items.filter(x => (x.name.split('.').pop() || '').toLowerCase() === ext).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));}).catch(e => {if (live) setErr(errorText(e));});
    return () => {live = false;};}, [win.pageId, win.name]);
  const use = (x: {id: string; name: string; mime: string; bytes: number}) => {win.onSaved?.(x); patchWin(win.key, {id: x.id, editId: x.id, name: x.name, rev: (win.rev || 0) + 1}); onClose();};
  return <View testID="file-versions" style={{position: 'absolute', top: 6, right: 8, zIndex: 20, width: 340, maxHeight: 380, borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, boxShadow: '0 12px 30px rgba(0,0,0,.25)', overflow: 'hidden'} as any}>
    <View style={{flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderColor: c.line}}><Text style={{flex: 1, color: c.text, fontWeight: '700', fontSize: 13}}>Versões anteriores</Text><Pressable accessibilityLabel="Fechar versões" onPress={onClose}><Icon name="close" size={14} color={c.muted} /></Pressable></View>
    {err ? <Text style={{color: c.danger, fontSize: 12, padding: 10}}>{err}</Text> : !list ? <View style={{padding: 16}}><Spinner size={16} /></View> :
      h('div', {style: {overflowY: 'auto', maxHeight: 320, display: 'flex', flexDirection: 'column'}}, list.map(x => <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={'Usar a versão de ' + new Date(x.created_at).toLocaleString('pt-BR')} onPress={() => {if (x.id !== win.id) use(x);}} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: x.id === win.id ? c.accentSoft : hovered ? c.input : 'transparent'})}>
        <View style={{flex: 1}}><Text style={{color: c.text, fontSize: 13}}>{new Date(x.created_at).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})}</Text><Text style={{color: c.muted, fontSize: 11}}>{sizeLabel(x.bytes)}{x.name !== win.name ? ' · ' + x.name : ''}</Text></View>
        <Text style={{color: x.id === win.id ? c.accent : c.muted, fontSize: 12, fontWeight: '600'}}>{x.id === win.id ? 'Aberta agora' : 'Usar esta'}</Text></Pressable>))}
  </View>;
}
const Center = ({children}: {children: React.ReactNode}) => <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20}}>{children}</View>;
function DownloadButton({api, id}: {api: SofiaApi; id: string}) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" onPress={() => void downloadPageFile(api, id)} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 8, borderWidth: 1, borderColor: c.line, backgroundColor: hovered ? c.line : c.surface})}><Icon name="download" size={14} color={c.text} /><Text style={{color: c.text, fontSize: 12, fontWeight: '600'}}>Baixar</Text></Pressable>;
}

// ---------------- Bloco da pagina ----------------
/** Arquivo dentro da pagina: linha (anexo) ou visualizacao com escala. Barra ao passar o mouse. */
export function PageFileBlock({api, data, pageId, selected, onSelect, onChange, onRemove}: {api: SofiaApi; data: PageFileData; pageId?: string; selected: boolean; onSelect: () => void; onChange: (d: PageFileData) => void; onRemove: () => void}) {
  const latest = useRef({data, onChange}); latest.current = {data, onChange};
  const c = useTheme(), [hover, setHover] = useState(false), k = fileKind(data.mime, data.name), meta = KIND[k], id = data.attachment_id || '';
  const view = data.view || defaultView(k), preview = view === 'preview' && inlineCapable(k) && !!id, scale = Math.max(15, Math.min(100, data.scale || (k === 'image' ? 70 : 100)));
  const wrap = useRef<any>(null), floating = useWins().some(w => w.id === id && !!id);
  const file = {id, name: data.name || 'arquivo', mime: data.mime || '', pageId, onSaved: (a: SavedFile) => latest.current.onChange({...latest.current.data, attachment_id: a.id, name: a.name, mime: a.mime, size: a.bytes})};
  const open = () => {if (id) openFileWindow(api, file);};
  // 07/11/2026 (Pedro: copiar e colar entre paginas e Drive): Copiar leva o arquivo; colar no Drive ou em outra pagina
  const [copied, setCopied] = useState(false); useEffect(() => {if (!copied) return; const t = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(t);}, [copied]);
  const copy = () => {setSofiaClip({sofia: 'page-files', items: [{attachment_id: id, name: data.name || 'arquivo', mime: data.mime || ''}]}); setCopied(true);};
  if (data.uploading) return <View testID="page-file-uploading" style={{marginVertical: 6, height: 52, borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12}}>
    <Spinner size={16} /><Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 13}}>{data.name || 'Arquivo'}</Text><Text style={{color: c.muted, fontSize: 11}}>Enviando… {sizeLabel(data.size)}</Text></View>;
  const resize = (e: any) => {e.preventDefault(); e.stopPropagation(); const el = wrap.current as HTMLElement | null, col = el?.parentElement?.getBoundingClientRect?.(); if (!el || !col) return; const sx = e.clientX, w0 = el.getBoundingClientRect().width;
    const mv = (ev: PointerEvent) => onChange({...data, scale: Math.round(Math.max(15, Math.min(100, (w0 + ev.clientX - sx) / col.width * 100)))});
    const up = () => {window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);}; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);};
  const tool = (icon: any, label: string, run: () => void, on = false) => <Pressable key={label} accessibilityLabel={label} onPress={(e: any) => {e?.stopPropagation?.(); run();}} style={({hovered}: any) => ({height: 26, minWidth: 26, paddingHorizontal: 6, borderRadius: 6, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, backgroundColor: on ? c.accentSoft : hovered ? c.line : 'transparent'})}><Icon name={icon} size={14} color={on ? c.accent : c.muted} /></Pressable>;
  const seg = (label: string, v: 'attach' | 'preview') => <Pressable key={v} accessibilityRole="radio" accessibilityState={{checked: view === v}} onPress={(e: any) => {e?.stopPropagation?.(); onChange({...data, view: v});}} style={({hovered}: any) => ({height: 24, paddingHorizontal: 9, borderRadius: 6, justifyContent: 'center', backgroundColor: view === v ? c.surface : hovered ? c.line : 'transparent', boxShadow: view === v ? '0 1px 2px rgba(0,0,0,.12)' : undefined} as any)}><Text style={{fontSize: 11, fontWeight: view === v ? '600' : '500', color: view === v ? c.text : c.muted}}>{label}</Text></Pressable>;
  // 07/11/2026 (Pedro: barra cortando na imagem pequena): na visualizacao a barra fica FORA da caixa da imagem (que corta o que
  // passa da borda), presa no canto esquerdo da imagem e podendo passar da largura dela.
  const bar = (hover || selected) && id ? <View style={{position: 'absolute', top: 6, ...(preview ? {left: 6} : {right: 6}), zIndex: 5, flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderRadius: 9, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, boxShadow: '0 4px 14px rgba(0,0,0,.12)'} as any}>
    {inlineCapable(k) ? <View style={{flexDirection: 'row', padding: 2, borderRadius: 8, backgroundColor: c.input, marginRight: 2}}>{seg('Anexo', 'attach')}{seg('Visualização', 'preview')}</View> : null}
    {preview ? <>{tool('zoomOut', 'Diminuir', () => onChange({...data, scale: Math.max(15, scale - 10)}))}<Text style={{color: c.muted, fontSize: 11, minWidth: 32, textAlign: 'center'}}>{scale}%</Text>{tool('zoomIn', 'Aumentar', () => onChange({...data, scale: Math.min(100, scale + 10)}))}</> : null}
    {windowCapable(k, data.name || '') ? tool('external', 'Abrir em janela separada (fora da Sofia)', () => {detachFile(api, file);}) : null /* 07/11/2026 (Pedro): sem a opcao da janela dentro da pagina aqui */}{tool(copied ? 'check' : 'copy', copied ? 'Copiado: cole no Drive ou em outra página (Ctrl+V)' : 'Copiar (para colar no Drive ou em outra página)', copy, copied)}{tool('download', 'Baixar', () => void downloadPageFile(api, id))}{tool('trash', 'Remover arquivo', onRemove)}
  </View> : null;
  const hoverDiv = (child: React.ReactNode) => h('div', {onMouseEnter: () => setHover(true), onMouseMove: () => {if (!hover) setHover(true);}, onMouseLeave: () => setHover(false), style: {position: 'relative', width: '100%', alignSelf: 'stretch', display: 'flex', flexDirection: 'column'}}, child);
  if (!preview) return hoverDiv(<Pressable testID="page-file-row" accessibilityRole="button" accessibilityLabel={'Abrir ' + (data.name || 'arquivo')} onPress={() => {onSelect(); open();}}
    style={({hovered}: any) => ({marginVertical: 4, minHeight: 52, borderRadius: 10, borderWidth: selected ? 2 : 1, borderColor: selected ? c.accent : c.line, backgroundColor: hovered ? c.input : c.surface, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 10, paddingRight: 12, position: 'relative'})}>
    <View style={{width: 34, height: 34, borderRadius: 8, backgroundColor: meta.color + '1f', alignItems: 'center', justifyContent: 'center'}}><Icon name={meta.icon} size={18} color={meta.color} /></View>
    <View style={{flex: 1, minWidth: 0, gap: 2}}><Text numberOfLines={1} style={{color: c.text, fontSize: 14, fontWeight: '600'}}>{data.name || 'Arquivo'}</Text>
      <Text numberOfLines={1} style={{color: c.muted, fontSize: 11}}>{[ext(data.name) || meta.label, sizeLabel(data.size)].filter(Boolean).join(' · ')}</Text></View>
    {bar}
  </Pressable>);
  if (floating) return hoverDiv(<Pressable testID="page-file-floating" accessibilityRole="button" accessibilityLabel={'Trazer de volta ' + (data.name || 'arquivo')} onPress={() => setWins(wins.filter(w => w.id !== id))}
    style={({hovered}: any) => ({marginVertical: 6, height: 44, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: c.accent, backgroundColor: hovered ? c.accentSoft : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12})}>
    <Icon name={meta.icon} size={16} color={meta.color} /><Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 13}}>{data.name}</Text><Text style={{color: c.muted, fontSize: 12}}>Em janela flutuante · </Text><Text style={{color: c.accent, fontSize: 12, fontWeight: '600'}}>Trazer de volta</Text></Pressable>);
  return hoverDiv(<View style={{marginVertical: 6, position: 'relative'}}>
    <View ref={wrap} testID="page-file-preview" style={{width: (scale + '%') as any, maxWidth: '100%', position: 'relative', borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: selected ? c.accent : 'transparent'}}>
      {h('div', {onClick: onSelect, onDoubleClick: open}, <InlineMedia api={api} id={id} kind={k} name={data.name || ''} />)}
      {h('div', {onPointerDown: (e: any) => popOut(api, file, e, wrap.current), title: 'Arraste para soltar na tela (janela flutuante)', 'aria-label': 'Arraste para soltar na tela', style: {position: 'absolute', left: '50%', top: 0, marginLeft: -40, width: 80, height: 18, cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hover || selected ? 1 : 0, zIndex: 6}},
        h('div', {style: {width: 42, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.95)', boxShadow: '0 0 0 1px rgba(0,0,0,.25), 0 1px 3px rgba(0,0,0,.3)'}}))}
      {k !== 'audio' ? h('div', {onPointerDown: resize, 'aria-label': 'Arraste para mudar o tamanho', style: {position: 'absolute', right: 0, top: 0, bottom: 0, width: 12, cursor: 'ew-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hover || selected ? 1 : 0}}, h('div', {style: {width: 4, height: 38, borderRadius: 2, background: 'rgba(255,255,255,.9)', boxShadow: '0 0 0 1px rgba(0,0,0,.25)'}})) : null}
    </View>
    {bar}
    {k !== 'image' ? <Text numberOfLines={1} style={{color: c.muted, fontSize: 11, marginTop: 4}}>{data.name}{data.size ? ' · ' + sizeLabel(data.size) : ''}</Text> : null}
  </View>);
}

function InlineMedia({api, id, kind, name}: {api: SofiaApi; id: string; kind: Kind; name: string}) {
  const c = useTheme(), {url, error} = useSigned(api, id, OFFICE(kind) ? 'pdf' : '');
  if (!WEB) return <View style={{height: 60, alignItems: 'center', justifyContent: 'center', backgroundColor: c.input}}><Text style={{color: c.muted, fontSize: 12}}>{name}</Text></View>;
  if (error) return <View style={{minHeight: 80, padding: 14, gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: c.input}}><Text style={{color: c.muted, fontSize: 12, textAlign: 'center'}}>{error}</Text></View>;
  if (!url) return <View style={{height: kind === 'audio' ? 54 : 200, alignItems: 'center', justifyContent: 'center', backgroundColor: c.input}}><Spinner size={16} /></View>;
  if (kind === 'image') return h('img', {src: url, alt: name, draggable: false, style: {display: 'block', width: '100%', height: 'auto'}});
  if (kind === 'video') return h('video', {src: url, controls: true, preload: 'metadata', style: {display: 'block', width: '100%', maxHeight: 520, background: '#000'}});
  if (kind === 'audio') return h('audio', {src: url, controls: true, preload: 'metadata', style: {display: 'block', width: '100%'}});
  return h('iframe', {src: url, title: name, style: {display: 'block', width: '100%', height: 560, border: 0, background: '#fff'}});
}
