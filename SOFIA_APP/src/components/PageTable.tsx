// 09/11/2026: no app do celular a tabela da pagina aparece como texto (linhas, colunas separadas por " | "); edicao completa no site.
import React from 'react';
import {Text, View} from 'react-native';
import {useTheme} from '../lib/theme';
export type TableRows = string[][];
const plain = (v: string) => String(v || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
export function tableFromHtml(_html: string, _ctx?: unknown): TableRows | null { return null; }
export function tableFromText(_text: string): TableRows | null { return null; }
export function tablePlainText(rows: TableRows): string { return rows.map(r => r.map(plain).join(' | ')).join('\n'); }
export function PageTable({rows}: {rows: TableRows; editable?: boolean; onChange: (rows: TableRows) => void}) {
  const c = useTheme();
  return <View style={{borderWidth: 1, borderColor: c.line, borderRadius: 6}}>{rows.map((r, i) => <View key={i} style={{flexDirection: 'row', borderTopWidth: i ? 1 : 0, borderColor: c.line, backgroundColor: i ? 'transparent' : c.input}}>{r.map((v, j) => <Text key={j} style={{flex: 1, padding: 6, color: c.text, fontSize: 13, fontWeight: i ? '400' : '600'}}>{plain(v)}</Text>)}</View>)}</View>;
}
