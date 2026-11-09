// 07/11/2026 (Pedro): "o docx ta abrindo como PDF; quero que abra com um editor proprio da Sofia com funcoes basicas, que eu
// possa editar as paginas, grifar etc., funcoes basicas que o proprio Word tem."
// - Abre o .docx com as paginas como no Word (docx-preview, carregado so quando abre um documento).
// - Edita direto nas paginas. Barra: desfazer/refazer, estilo (Normal/Titulos), tamanho, negrito, italico, sublinhado,
//   tachado, cor da letra, marca-texto, listas, alinhamento, recuo, limpar formatacao.
// - Salva sozinho 2 s depois de parar de digitar (e no botao Salvar): o servidor transforma em .docx de verdade e ele vira
//   o arquivo do bloco (o anterior fica guardado como versao antiga no servidor).
import React, {useEffect, useRef, useState} from 'react';
import type {SofiaApi} from '../lib/api';
import {useEditorColors, ThemeToggle, useEditorZoom, useWheelZoom, ZoomControl} from './EditorChrome';
import {errorText} from '../lib/chat-model';
import {saveOfficeTo, type SaveTarget} from '../lib/office-save';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
import {addSansFallback, ensureDocFonts} from '../lib/doc-fonts';

const h = React.createElement as any;
type Saved = {id: string; name: string; mime: string; bytes: number};

const HIGHLIGHTS: [string, string][] = [['Amarelo', '#fff176'], ['Verde', '#b9f6ca'], ['Azul', '#b3e5fc'], ['Rosa', '#f8bbd0'], ['Laranja', '#ffcc80']];
const COLORS: [string, string][] = [['Preto', '#000000'], ['Vermelho', '#d32f2f'], ['Azul', '#1565c0'], ['Verde', '#2e7d32'], ['Roxo', '#6a1b9a'], ['Cinza', '#616161']];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48];

/** Estilos que o Word entende, copiados para dentro de cada elemento (o servidor so le estilo escrito no proprio elemento). */
function inlineForDocx(src: HTMLElement): string {
  const clone = src.cloneNode(true) as HTMLElement, a = [src, ...Array.from(src.querySelectorAll('*'))] as HTMLElement[], b = [clone, ...Array.from(clone.querySelectorAll('*'))] as HTMLElement[];
  const BLOCK = /^(P|H1|H2|H3|H4|H5|H6|LI|TD|TH|DIV)$/;
  for (let i = 0; i < a.length && i < b.length; i++) {
    const el = a[i], out = b[i]; if (!el || el.nodeType !== 1) continue; const cs = (el.ownerDocument.defaultView || window).getComputedStyle(el), st: string[] = []; /* funciona tambem na janela separada (outro documento) */
    if (Number(cs.fontWeight) >= 600) st.push('font-weight:bold');
    if (cs.fontStyle === 'italic') st.push('font-style:italic');
    const deco = cs.textDecorationLine || ''; if (/underline|line-through/.test(deco)) st.push('text-decoration:' + deco);
    if (cs.color && cs.color !== 'rgb(0, 0, 0)') st.push('color:' + cs.color);
    if (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) && el.tagName !== 'SECTION' && el.tagName !== 'ARTICLE') st.push('background-color:' + cs.backgroundColor);
    const px = parseFloat(cs.fontSize); if (px) st.push('font-size:' + Math.round(px * 0.75 * 2) / 2 + 'pt');
    if (BLOCK.test(el.tagName) && cs.textAlign && cs.textAlign !== 'start' && cs.textAlign !== 'left') st.push('text-align:' + cs.textAlign);
    const fam = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim(); if (fam) st.push('font-family:' + fam);
    out.removeAttribute('class'); out.removeAttribute('contenteditable'); out.removeAttribute('spellcheck');
    if (st.length) out.setAttribute('style', st.join(';'));
  }
  return clone.innerHTML;
}

export function DocEditor({api, id, name, url, pageId, onSaved, onShowVersions, target}: {api: SofiaApi; id: string; name: string; url: string; pageId: string; onSaved: (a: Saved) => void; onShowVersions?: () => void; target?: SaveTarget}) {
  const drive = target && target.kind === 'drive' ? target : null;
  const [empty, setEmpty] = useState(false);
  const [zoom, setZoom] = useEditorZoom('docx'), scroller = useRef<HTMLDivElement | null>(null);
  const [c, toggleTheme] = useEditorColors(id), host = useRef<HTMLDivElement | null>(null), styles = useRef<HTMLDivElement | null>(null), sel = useRef<Range | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading'), [err, setErr] = useState(''), [status, setStatus] = useState(''), dirty = useRef(false), timer = useRef<any>(null), saving = useRef(false);
  const onSavedRef = useRef(onSaved); onSavedRef.current = onSaved; const initial = useRef(''), blocked = useRef(''), lib = useRef<any>(null);
  useEffect(() => {let live = true; setState('loading');
    (async () => {
      const buf = await fetch(url).then(r => {if (!r.ok) throw new Error('Não consegui abrir o documento (' + r.status + ').'); return r.arrayBuffer();});
      const mod: any = await import('docx-preview'); lib.current = mod; if (!live || !host.current) return;
      host.current.innerHTML = ''; if (styles.current) styles.current.innerHTML = '';
      await mod.renderAsync(buf, host.current, styles.current, {className: 'docx', inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, useBase64URL: true, renderHeaders: true, renderFooters: true, experimental: true});
      if (!live || !host.current) return;
      const wrap = host.current.querySelector('.docx-wrapper') as HTMLElement | null || host.current;
      wrap.setAttribute('contenteditable', 'true'); wrap.setAttribute('spellcheck', 'true'); wrap.style.outline = 'none';
      // 07/11/2026 (Pedro: "o mouse ta sumindo na parte cinza"): no Windows o cursor de texto inverte a cor do fundo e some no
      // cinza medio. Fora das paginas: fundo do editor e seta normal; cursor de texto so em cima da folha.
      wrap.style.background = 'transparent'; wrap.style.cursor = 'default'; wrap.querySelectorAll('section.docx').forEach(sec => {(sec as HTMLElement).style.cursor = 'text';});
      addSansFallback(styles.current, host.current); initial.current = pageHtml(); setState('ready');
      if (!drive && !((host.current?.innerText || '').replace(/\s+/g, '').length)) void api.entityAttachments(pageId).then(items => {if (live && items.filter(x => /\.docx$/i.test(x.name)).length > 1) setEmpty(true);}).catch(() => {}); // so avisa se ha versao anterior setTimeout(() => ensureDocFonts(host.current), 50);
    })().catch(e => {if (live) {setErr(errorText(e)); setState('error');}});
    return () => {live = false;};
  }, [url]);
  const pageHtml = () => {const wrap = host.current?.querySelector('.docx-wrapper') as HTMLElement | null; if (!wrap) return '';
    const pages = Array.from(wrap.querySelectorAll('section.docx')) as HTMLElement[];
    return (pages.length ? pages : [wrap]).map(p => {const art = (p.querySelector('article') as HTMLElement | null) || p; return inlineForDocx(art);}).join('<div class="page-break" style="page-break-after: always;"></div>');};
  /** Quanto de conteudo ha num trecho: linhas de tabela e letras (sem espacos). */
  const measure = (root: Element | null) => ({rows: root ? root.querySelectorAll('tr').length : 0, chars: (root ? (root as HTMLElement).innerText || root.textContent || '' : '').replace(/\s+/g, '').length});
  const save = async () => {if (saving.current || !dirty.current) return;
    const html = pageHtml(); if (html === initial.current) {dirty.current = false; setStatus(''); return;} // nada mudou de verdade: nao salva
    if (html === blocked.current) {dirty.current = false; return;} // a mesma versao ja foi recusada: nao tenta em loop
    // 07/11/2026 (Pedro: documento salvo em branco): nunca salva antes de terminar de abrir, nem um documento vazio
    if (!initial.current || !host.current?.querySelector('.docx-wrapper') || measure(host.current.querySelector('.docx-wrapper')).chars === 0) {dirty.current = false; return;}
    saving.current = true; dirty.current = false; setStatus('Salvando…');
    try {
      // Drive (07/11/2026): o servidor so converte; aqui confere e so entao grava no proprio arquivo do Drive
      const driveBytes = drive ? await api.sdRenderDocx({html, name}) : null;
      const a = drive ? null : await api.saveDocx(pageId, {html, name});
      // 07/11/2026 (Pedro: "sumiu conteudo aqui"): antes de trocar o arquivo, abre o salvo escondido e compara com a tela.
      // Se faltar linha de tabela ou texto, NAO troca: o documento continua o de antes.
      const now = measure(host.current?.querySelector('.docx-wrapper') || null);
      try {const bytes = driveBytes ? driveBytes.slice().buffer : await fetch((await api.attachmentLink(a!.id)).url + '&as=download').then(r => r.arrayBuffer()); const d = host.current!.ownerDocument, box = d.createElement('div'), st = d.createElement('div'); box.style.cssText = 'position:fixed;left:-99999px;top:0;width:900px;visibility:hidden'; d.body.appendChild(st); d.body.appendChild(box);
        await lib.current.renderAsync(bytes, box, st, {className: 'docxcheck', inWrapper: true, breakPages: false, experimental: true}); const got = measure(box); box.remove(); st.remove();
        if (got.rows < now.rows || got.chars < now.chars * 0.97) {dirty.current = false; blocked.current = html; setStatus('Não salvei para não perder conteúdo (' + (got.rows < now.rows ? 'tabela' : 'texto') + '). O documento continua como estava.'); return;}
      } catch {/* sem como conferir: segue (o servidor ja confere o texto) */}
      onSavedRef.current(drive ? await saveOfficeTo(api, drive, driveBytes!, name, DOCX_MIME) : a!); initial.current = html; setStatus(drive ? 'Salvo no Drive' : 'Salvo');}
    catch (e) {const stop = [403, 409].includes(Number((e as any)?.status)); dirty.current = !stop; setStatus('Não salvo: ' + errorText(e));} // 409/403 do Drive: nao tenta de novo sozinho
    finally {saving.current = false; if (dirty.current) schedule();}};
  const schedule = () => {clearTimeout(timer.current); timer.current = setTimeout(() => void save(), 2000);};
  useEffect(() => () => {clearTimeout(timer.current); if (dirty.current) void save();}, []); // fechou a janela com algo por salvar
  const changed = () => {dirty.current = true; setStatus('Editando…'); schedule();};
  const doc = () => (host.current?.ownerDocument || document) as Document, win = () => (doc().defaultView || window) as Window;
  useWheelZoom(scroller, zoom, setZoom, state === 'ready');
  const keep = () => {const s = win().getSelection(); if (s && s.rangeCount && host.current?.contains(s.anchorNode)) sel.current = s.getRangeAt(0).cloneRange();};
  const restore = () => {const s = win().getSelection(); if (sel.current && s) {s.removeAllRanges(); s.addRange(sel.current);}};
  const exec = (cmd: string, value?: string) => {restore(); try {doc().execCommand('styleWithCSS', false, 'true');} catch {} doc().execCommand(cmd, false, value); keep(); changed();};
  const fontSize = (pt: number) => {restore(); const s = win().getSelection(); if (!s || !s.rangeCount || s.isCollapsed) return;
    doc().execCommand('styleWithCSS', false, 'false'); doc().execCommand('fontSize', false, '7');
    host.current?.querySelectorAll('font[size="7"]').forEach(f => {const span = doc().createElement('span'); span.style.fontSize = pt + 'pt'; span.innerHTML = (f as HTMLElement).innerHTML; f.replaceWith(span);});
    keep(); changed();};
  const B = (label: string, title: string, run: () => void, extra: any = {}) => h('button', {key: title, type: 'button', title, 'aria-label': title, onMouseDown: (e: any) => {e.preventDefault(); run();},
    style: {height: 28, minWidth: 28, padding: '0 6px', border: 0, borderRadius: 6, background: 'transparent', color: c.text, cursor: 'pointer', fontSize: 13, ...extra}}, label);
  const sep = (k: string) => h('span', {key: k, style: {width: 1, height: 18, background: c.line, margin: '0 4px'}});
  const swatch = (k: string, color: string, title: string, run: () => void) => h('button', {key: k, type: 'button', title, 'aria-label': title, onMouseDown: (e: any) => {e.preventDefault(); run();}, style: {width: 18, height: 18, borderRadius: 4, border: '1px solid ' + c.line, background: color, cursor: 'pointer', padding: 0}});
  const selectStyle = {height: 28, borderRadius: 6, border: '1px solid ' + c.line, background: c.field, color: c.text, fontSize: 12, padding: '0 4px'};
  const bar = h('div', {style: {display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, padding: '6px 8px', borderBottom: '1px solid ' + c.line, background: c.bar, flexShrink: 0}},
    B('↶', 'Desfazer', () => exec('undo')), B('↷', 'Refazer', () => exec('redo')), sep('s1'),
    h('select', {key: 'style', 'aria-label': 'Estilo', defaultValue: '', onMouseDown: keep, onChange: (e: any) => {const v = e.target.value; if (v) exec('formatBlock', v); e.target.value = '';}, style: selectStyle},
      h('option', {value: ''}, 'Estilo'), h('option', {value: 'p'}, 'Normal'), h('option', {value: 'h1'}, 'Título 1'), h('option', {value: 'h2'}, 'Título 2'), h('option', {value: 'h3'}, 'Título 3')),
    h('select', {key: 'size', 'aria-label': 'Tamanho da letra', defaultValue: '', onMouseDown: keep, onChange: (e: any) => {const v = Number(e.target.value); if (v) fontSize(v); e.target.value = '';}, style: {...selectStyle, marginLeft: 4}},
      h('option', {value: ''}, 'Tamanho'), ...SIZES.map(n => h('option', {key: n, value: n}, n + ' pt'))), sep('s2'),
    B('N', 'Negrito (Ctrl+B)', () => exec('bold'), {fontWeight: 800}), B('I', 'Itálico (Ctrl+I)', () => exec('italic'), {fontStyle: 'italic', fontFamily: 'serif'}),
    B('S', 'Sublinhado (Ctrl+U)', () => exec('underline'), {textDecoration: 'underline'}), B('ab', 'Tachado', () => exec('strikeThrough'), {textDecoration: 'line-through'}), sep('s3'),
    h('span', {key: 'hl', title: 'Marca-texto', style: {display: 'flex', alignItems: 'center', gap: 3, padding: '0 4px'}}, h('span', {style: {fontSize: 11, color: c.muted, marginRight: 2}}, 'Grifar'),
      ...HIGHLIGHTS.map(([n, col]) => swatch('h' + n, col, 'Marca-texto ' + n.toLowerCase(), () => exec('hiliteColor', col))), B('⌫', 'Tirar o grifo', () => exec('hiliteColor', 'transparent'))), sep('s4'),
    h('span', {key: 'fc', title: 'Cor da letra', style: {display: 'flex', alignItems: 'center', gap: 3, padding: '0 4px'}}, h('span', {style: {fontSize: 11, color: c.muted, marginRight: 2}}, 'Cor'),
      ...COLORS.map(([n, col]) => swatch('c' + n, col, 'Cor ' + n.toLowerCase(), () => exec('foreColor', col)))), sep('s5'),
    B('•', 'Lista com marcadores', () => exec('insertUnorderedList'), {fontSize: 18}), B('1.', 'Lista numerada', () => exec('insertOrderedList')),
    B('⇤', 'Diminuir recuo', () => exec('outdent')), B('⇥', 'Aumentar recuo', () => exec('indent')), sep('s6'),
    B('⯇≡', 'Alinhar à esquerda', () => exec('justifyLeft'), {fontSize: 11}), B('≡', 'Centralizar', () => exec('justifyCenter')), B('≡⯈', 'Alinhar à direita', () => exec('justifyRight'), {fontSize: 11}), B('☰', 'Justificar', () => exec('justifyFull')), sep('s7'),
    B('Tx', 'Limpar formatação', () => exec('removeFormat'), {textDecoration: 'line-through', fontSize: 12}),
    h('span', {key: 'sp', style: {flex: 1}}),
    h(ZoomControl, {key: 'zoom', colors: c, zoom, setZoom}), h('span', {key: 'gz', style: {width: 6}}), h(ThemeToggle, {key: 'theme', colors: c, toggle: toggleTheme}), h('span', {key: 'gap', style: {width: 6}}),
    h('span', {key: 'st', style: {fontSize: 11, color: /Não salvo/.test(status) ? c.danger : c.muted, marginRight: 6}}, status),
    B('Salvar', 'Salvar agora', () => {dirty.current = true; void save();}, {background: c.accent, color: c.onAccent, fontWeight: 600, padding: '0 10px'}));
  return h('div', {style: {display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0}},
    bar,
    h('div', {ref: scroller, style: {flex: 1, minHeight: 0, overflow: 'auto', background: c.bg, position: 'relative'}, onKeyUp: keep, onMouseUp: keep, onInput: changed},
      h('div', {ref: styles}),
      // 07/11/2026 (Pedro: "ainda ta vazio"): documento vazio ao abrir -> mostra o caminho para a versao anterior
      empty && onShowVersions ? h('div', {style: {position: 'sticky', top: 12, zIndex: 5, margin: '12px auto 0', width: 'min(460px, 90%)', padding: '14px 16px', borderRadius: 12, background: c.bar, border: '1px solid ' + c.line, boxShadow: '0 8px 24px rgba(0,0,0,.25)', color: c.text, fontSize: 13, display: 'flex', alignItems: 'center', gap: 12}},
        h('span', {style: {flex: 1}}, 'Este documento está vazio. Se ele tinha conteúdo, volte para uma versão anterior.'),
        h('button', {type: 'button', onClick: onShowVersions, style: {height: 30, padding: '0 12px', border: 0, borderRadius: 8, background: c.accent, color: c.onAccent, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'}}, 'Ver versões anteriores')) : null,
      state === 'loading' ? h('div', {style: {padding: 40, textAlign: 'center', color: '#666', fontSize: 13}}, 'Abrindo o documento…') : null,
      state === 'error' ? h('div', {style: {padding: 40, textAlign: 'center', color: '#a33', fontSize: 13}}, err) : null,
      h('div', {ref: host, style: {color: '#000', filter: c.pageFilter, zoom, fontFamily: 'Calibri, Carlito, Arial, sans-serif' /* letra padrao do Word (sem herdar a do site) */}})));
}
