// 09/11/2026 (Pedro: "quando eu copiar algo que tem uma estrutura igual ta no anexo, quero que ele seja copiado e mantido na mesma
// estrutura"): bloco de tabela da pagina. Colar uma tabela (ChatGPT, Word, Excel, Docs, sites) mantem linhas e colunas; cada celula
// guarda o HTML limpo (negrito, italico, link, cor) do mesmo jeito que o texto da pagina. A 1a linha e o cabecalho.
import React, {useEffect, useRef} from 'react';
import {useTheme} from '../lib/theme';
import {pasteHtml, sanitizeRich, escapeHtml} from './PageRichInput.web';

const h = React.createElement as any;
export type TableRows = string[][];

/** Linhas da primeira tabela de um HTML colado (cada celula ja limpa); null se nao houver tabela com pelo menos 2 colunas. */
export function tableFromHtml(html: string, ctx?: {bg?: string; color?: string}): TableRows | null {
  if (typeof document === 'undefined' || !/<table[\s>]/i.test(html || '')) return null;
  const t = document.createElement('template'); t.innerHTML = String(html);
  const table = t.content.querySelector('table'); if (!table) return null;
  const rows: TableRows = [];
  table.querySelectorAll('tr').forEach(tr => {
    if (tr.closest('table') !== table) return; // tabela dentro de celula: fica so o texto dela
    const cells = [...tr.children].filter(c => c.tagName === 'TD' || c.tagName === 'TH') as HTMLElement[];
    if (!cells.length) return;
    const row: string[] = [];
    cells.forEach(cell => { const v = pasteHtml(cell.innerHTML, ctx).replace(/^(<br>)+|(<br>)+$/g, ''); row.push(v); const span = Math.min(20, Math.max(1, Number(cell.getAttribute('colspan')) || 1)); for (let i = 1; i < span; i++) row.push(''); });
    rows.push(row);
  });
  return normalizeRows(rows);
}
/** Texto com tabulacao (copiado de planilha sem HTML): cada linha vira uma linha da tabela. */
export function tableFromText(text: string): TableRows | null {
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter((l, i, a) => l !== '' || i < a.length - 1);
  if (lines.length < 2 || !lines.every(l => l.includes('\t'))) return null;
  return normalizeRows(lines.map(l => l.split('\t').map(escapeHtml)));
}
function normalizeRows(rows: TableRows): TableRows | null {
  const cols = Math.max(0, ...rows.map(r => r.length));
  if (!rows.length || cols < 2) return null;
  return rows.slice(0, 200).map(r => Array.from({length: Math.min(cols, 30)}, (_, i) => r[i] || ''));
}
/** Texto puro da tabela (busca, Sofia e o app do celular): colunas separadas por " | ". */
export function tablePlainText(rows: TableRows): string {
  const plain = (v: string) => { const d = document.createElement('div'); d.innerHTML = v; return String(d.textContent || '').replace(/\s+/g, ' ').trim(); };
  return rows.map(r => r.map(plain).join(' | ')).join('\n');
}

function Cell({html, head, editable, onChange}: {html: string; head: boolean; editable: boolean; onChange: (v: string) => void}) {
  const c = useTheme(), ref = useRef<HTMLElement | null>(null);
  // celula nao controlada: so troca o conteudo quando nao esta sendo editada (senao o cursor pularia)
  useEffect(() => { const el = ref.current; if (el && document.activeElement !== el && el.innerHTML !== html) el.innerHTML = html; }, [html]);
  return h(head ? 'th' : 'td', {ref, contentEditable: editable ? 'true' : 'false', suppressContentEditableWarning: true, 'data-table-cell': '1',
    onPointerDown: (e: any) => e.stopPropagation(), onClick: (e: any) => e.stopPropagation(),
    onKeyDown: (e: any) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); } },
    onPaste: (e: any) => { e.stopPropagation(); e.preventDefault(); const t = e.clipboardData?.getData('text/plain') || ''; document.execCommand('insertText', false, t.replace(/\s*\n\s*/g, ' ')); },
    onBlur: (e: any) => { const v = sanitizeRich((e.currentTarget as HTMLElement).innerHTML); if (v !== html) onChange(v); },
    style: {border: '1px solid ' + c.line, padding: '7px 10px', textAlign: 'left', verticalAlign: 'top', minWidth: 80, fontWeight: head ? 700 : 400, background: head ? c.input : 'transparent', color: c.text, outline: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word'}});
}

export function PageTable({rows, editable = true, onChange}: {rows: TableRows; editable?: boolean; onChange: (rows: TableRows) => void}) {
  const c = useTheme(), cols = Math.max(1, ...rows.map(r => r.length));
  const set = (ri: number, ci: number, v: string) => onChange(rows.map((r, i) => i === ri ? r.map((x, j) => j === ci ? v : x) : r));
  const btn = (label: string, title: string, run: () => void, off = false) => h('button', {type: 'button', title, 'aria-label': title, disabled: off,
    onPointerDown: (e: any) => e.stopPropagation(), onClick: (e: any) => { e.stopPropagation(); if (!off) run(); },
    style: {border: '1px solid ' + c.line, background: 'transparent', color: off ? c.muted : c.text, borderRadius: 6, padding: '2px 8px', fontSize: 12, cursor: off ? 'default' : 'pointer'}}, label);
  return h('div', {'data-testid': 'page-table', style: {maxWidth: '100%'}},
    h('div', {style: {overflowX: 'auto', maxWidth: '100%'}},
      h('table', {style: {borderCollapse: 'collapse', fontSize: 16, lineHeight: '24px', minWidth: '60%'}},
        h('tbody', null, rows.map((r, ri) => h('tr', {key: ri}, Array.from({length: cols}, (_, ci) => h(Cell, {key: ci, html: r[ci] || '', head: ri === 0, editable, onChange: (v: string) => set(ri, ci, v)}))))))),
    editable ? h('div', {style: {display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap'}},
      btn('+ Linha', 'Adicionar uma linha no fim', () => onChange([...rows, Array(cols).fill('')])),
      btn('+ Coluna', 'Adicionar uma coluna no fim', () => onChange(rows.map(r => [...r, '']))),
      btn('− Linha', 'Tirar a última linha', () => onChange(rows.slice(0, -1)), rows.length <= 1),
      btn('− Coluna', 'Tirar a última coluna', () => onChange(rows.map(r => r.slice(0, -1))), cols <= 1)) : null);
}
