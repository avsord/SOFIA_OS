// 08/11/2026 (Pedro: "as paginas tambem guardam versoes, pra nao perder alguma coisa"): cada salvamento da pagina ja vira
// uma versao no servidor (entity_versions). Este painel lista as versoes (as 10 mais recentes e, antes delas, uma a cada 10 min, para nao
// virar uma lista de centenas), mostra o texto da escolhida e "Voltar para esta versao" grava pelo salvamento normal da
// pagina: vira uma versao nova, nada se perde. Pagina trancada: so com a senha aberta (decifra so para ver).
import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, Text, View} from 'react-native';
import type {Entity} from '../lib/types';
import type {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {Dialog, GhostButton, PrimaryButton} from './AppKit';
import {errorText} from '../lib/chat-model';
import {pageDraft, type PageDraft} from '../lib/page-editor';
import {isLocked, isOpen, lockHeader, peekBlocks} from '../lib/page-lock';

export type PageVersion = {id: string; revision: number; created_at: string; snapshot: Entity};
const GAP = 10 * 60 * 1000, RECENT = 10;

/** As 10 mais recentes uma a uma (desfazer um erro de agora ha pouco); das mais antigas, uma por janela de 10 minutos. */
export function spacedVersions(list: PageVersion[]): PageVersion[] {
  const sorted = [...list].sort((a, b) => b.revision - a.revision), out: PageVersion[] = [];
  let last = Infinity;
  for (const v of sorted) { const t = Date.parse(v.created_at); if (out.length < RECENT || !Number.isFinite(t) || t <= last - GAP) { out.push(v); if (Number.isFinite(t)) last = t; } }
  return out;
}
function when(iso: string) {
  const d = new Date(iso); if (!Number.isFinite(d.getTime())) return iso;
  const today = new Date(), same = d.toDateString() === today.toDateString(), y = new Date(today.getTime() - 86400000).toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
  return same ? 'Hoje às ' + hm : y ? 'Ontem às ' + hm : d.toLocaleDateString('pt-BR', {day: '2-digit', month: 'short', year: today.getFullYear() === d.getFullYear() ? undefined : 'numeric'}) + ' às ' + hm;
}
function textOfBlocks(blocks: any[]): string { return blocks.map(b => String(b?.text || (b?.type === 'file' ? '📎 ' + (b?.data?.name || 'arquivo') : '') || '')).filter(Boolean).join('\n'); }

/** Rascunho de uma versao (decifrando quando a pagina e trancada e a chave esta aberta). */
export async function versionDraft(v: PageVersion): Promise<PageDraft> {
  const snap = v.snapshot;
  if (isLocked(snap)) { const h = lockHeader(snap); if (!h || !isOpen(h.kid)) throw Error('Página trancada: abra com a senha para ver as versões.'); const blocks = await peekBlocks(h); return pageDraft({...snap, data: {...(snap.data || {}), blocks_json: blocks}} as Entity); }
  return pageDraft(snap);
}

export function PageVersions({api, page, visible, onClose, onRestore}: {api: SofiaApi; page: Entity; visible: boolean; onClose: () => void; onRestore: (draft: PageDraft) => void}) {
  const c = useTheme(), [list, setList] = useState<PageVersion[] | null>(null), [err, setErr] = useState(''), [pick, setPick] = useState(''), [draft, setDraft] = useState<PageDraft | null>(null), [busy, setBusy] = useState(false);
  const locked = isLocked(page), h = locked ? lockHeader(page) : null, keyOpen = !locked || (!!h && isOpen(h.kid));
  useEffect(() => { if (!visible) return; let live = true; setList(null); setErr(''); setPick(''); setDraft(null);
    api.entityVersions(page.id).then(items => { if (!live) return; const s = spacedVersions(items as PageVersion[]); setList(s); if (s[1]) setPick(s[1].id); else if (s[0]) setPick(s[0].id); }).catch(e => { if (live) setErr(errorText(e)); });
    return () => { live = false; }; }, [visible, page.id, api]);
  const cur = useMemo(() => list?.find(v => v.id === pick) || null, [list, pick]);
  useEffect(() => { let live = true; setDraft(null); if (!cur || !keyOpen) return; versionDraft(cur).then(d => { if (live) setDraft(d); }).catch(e => { if (live) setErr(errorText(e)); }); return () => { live = false; }; }, [cur, keyOpen]);
  const latest = list?.[0]?.id;
  const preview = draft ? textOfBlocks(draft.blocks) : '';
  return <Dialog visible={visible} onClose={onClose} title="Versões anteriores"
    footer={<><GhostButton label="Fechar" onPress={onClose} /><PrimaryButton testID="page-version-restore" label={busy ? 'Voltando…' : 'Voltar para esta versão'} disabled={!draft || busy || cur?.id === latest} onPress={() => { if (!draft) return; setBusy(true); onRestore(draft); setBusy(false); onClose(); }} /></>}>
    <Text style={{color: c.muted, fontSize: 12}}>Cada salvamento fica guardado. Voltar cria uma versão nova com o conteúdo escolhido: a atual continua na lista.</Text>
    {locked && !keyOpen ? <Text testID="page-versions-locked" style={{color: c.danger, fontSize: 13}}>Versões de página trancada: abra a página com a senha para ver e voltar.</Text> : null}
    {err ? <Text style={{color: c.danger, fontSize: 13}}>{err}</Text> : null}
    {!list && !err ? <ActivityIndicator color={c.muted} /> : null}
    {list && !list.length ? <Text style={{color: c.muted, fontSize: 13}}>Ainda não há versões guardadas desta página.</Text> : null}
    {list && list.length ? <ScrollView testID="page-versions-list" keyboardShouldPersistTaps="handled" style={{maxHeight: 220}} contentContainerStyle={{gap: 4}}>
      {list.map(v => { const on = v.id === pick, n = (() => { try { const b = JSON.parse(String(v.snapshot?.data?.blocks_json || '[]')); return Array.isArray(b) ? b.length : 0; } catch { return 0; } })();
        return <Pressable key={v.id} testID={'page-version-' + v.revision} accessibilityRole="radio" accessibilityState={{checked: on}} onPress={() => setPick(v.id)}
          style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, backgroundColor: on ? c.accentSoft : hovered ? c.input : 'transparent'})}>
          <Text style={{flex: 1, color: c.text, fontSize: 13, fontWeight: on ? '600' : '400'}}>{when(v.created_at)}{v.id === latest ? ' · atual' : ''}</Text>
          <Text style={{color: c.muted, fontSize: 11}}>{locked ? 'cifrada' : n + (n === 1 ? ' bloco' : ' blocos')}</Text>
        </Pressable>; })}
    </ScrollView> : null}
    {draft ? <View testID="page-version-preview" style={{borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 10, gap: 4}}>
      <Text numberOfLines={1} style={{color: c.text, fontSize: 14, fontWeight: '600'}}>{draft.title || 'Sem título'}</Text>
      <Text numberOfLines={8} style={{color: c.muted, fontSize: 12}}>{preview || '(página vazia)'}</Text>
      <Text style={{color: c.muted, fontSize: 11}}>{draft.blocks.length} {draft.blocks.length === 1 ? 'bloco' : 'blocos'} · {preview.length} caracteres</Text>
    </View> : null}
  </Dialog>;
}
