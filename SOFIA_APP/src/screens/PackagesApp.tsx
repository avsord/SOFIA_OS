// 0.3.269 — Encomendas redesenhadas (protótipo aprovado em 31/10: docs/prototipos-2026-10-31/encomendas.html), web e
// celular. Lateral: A caminho, Precisa de você e a Situação (Em trânsito, Saiu para entrega, Para retirar, Entregues);
// cota da Ship24 discreta no rodapé. Campo único para colar códigos; card com etapas; painel com a linha do tempo.
// Os dados e o rastreio continuam os mesmos (kind package + Ship24/Correios no servidor).
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Linking, Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import {useTheme} from '../lib/theme';
import {PALETTE} from '../lib/palette';
import {useDesktop} from '../lib/desktop';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {errorText} from '../lib/chat-model';
import {appAlert} from '../lib/app-alert';
import {Icon, type IconName} from '../components/Icon';
import {IconButton, DeskTabs} from '../components/UI';
import {DateTimeField} from '../components/DateTimeField';
import {InternalBackGesture} from '../components/InternalBackGesture';
import {Presence} from '../components/Presence';
import {contextMenu} from '../components/ContextMenu';
import {AppFrame, Chip, Dialog, FieldRow, GhostButton, Input, Panel, PrimaryButton, SideItem, SideLabel, brl, moneyInput, openMore, parseMoney, useToast, AppSkeleton} from '../components/AppKit';
import {CARRIER_LABEL, detectCarrier, normalizeCode, officialUrl, parseEvents, type PackageEvent} from './Packages';

const STEPS = ['Postado', 'Em trânsito', 'Saiu para entrega', 'Entregue'];
const FEE = /aguardando pagamento|pagamento de taxa|taxa|tribut|imposto|despacho postal/i;
const PICKUP = /retirada|retirar|disponível para retirada|aguardando retirada/i;
const OUT = /saiu para entrega|out for delivery|em rota de entrega/i;
const DONE7 = 7 * 864e5;
export type Pack = {id: string; e: Entity; title: string; code: string; carrier: string; status: string; local: string; at: string; events: PackageEvent[]; delivered: boolean; step: number; needs: '' | 'fee' | 'pickup' | 'problem'; feeAmount: number | null; feePaid: boolean; estimated: string; error: string};
/** status da encomenda -> etapa (0..3) e o que precisa da pessoa */
export function classify(e: Entity): Pack {
  const d = e.data || {}, events = parseEvents(d.events), top = events[0], status = String(d.status || top?.status || ''), ms = String(d.milestone || '');
  const delivered = e.state === 'delivered' || ms === 'delivered';
  const pickup = !delivered && (ms === 'available_for_pickup' || PICKUP.test(status));
  const fee = !delivered && !d.fee_paid && (!!d.fee || FEE.test(status));
  const problem = !delivered && (ms === 'exception' || ms === 'failed_attempt');
  const out = ms === 'out_for_delivery' || OUT.test(status);
  const step = delivered ? 3 : out || pickup ? 2 : events.length || ['in_transit', 'info_received'].includes(ms) ? 1 : 0;
  const amount = typeof d.fee_amount === 'number' ? d.fee_amount : (() => { const m = status.match(/R\$\s*([\d.]+,\d{2})/); return m ? parseMoney(m[1]) : null; })();
  return {id: e.id, e, title: e.title, code: String(d.code || ''), carrier: String(d.carrier || detectCarrier(String(d.code || ''))), status: status || (d.error ? 'Consulta indisponível' : 'Aguardando a primeira consulta'), local: String(top?.local || ''), at: String(d.last_event_at || top?.at || e.updated_at || ''), events, delivered, step, needs: fee ? 'fee' : pickup ? 'pickup' : problem ? 'problem' : '', feeAmount: amount, feePaid: !!d.fee_paid, estimated: String(d.estimated || ''), error: String(d.error || '')};
}
const rel = (iso: string) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return ''; const diff = Date.now() - t; if (diff < 36e5) return 'há ' + Math.max(1, Math.round(diff / 6e4)) + ' min'; if (diff < 864e5) return 'há ' + Math.round(diff / 36e5) + ' h'; if (diff < 2 * 864e5) return 'ontem'; return new Date(t).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}); };
const dayLabel = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString('pt-BR', {weekday: 'short', day: '2-digit', month: '2-digit'}).replace('.', '') : ''; };
/** "AA123456789BR Fone" / varios codigos colados -> lista {codigo, nome} */
export function parseCodes(raw: string): {code: string; name: string; valid: boolean}[] {
  const parts = raw.split(/\n|;/).map(s => s.trim()).filter(Boolean), out: {code: string; name: string; valid: boolean}[] = [];
  for (const line of parts) {
    const tokens = line.split(/\s+/), codes = tokens.filter(t => /^[A-Za-z0-9.-]{8,40}$/.test(t) && /\d{6,}/.test(t.replace(/[.-]/g, '')));
    if (!codes.length) { out.push({code: normalizeCode(line), name: '', valid: false}); continue; }
    const name = tokens.filter(t => !codes.includes(t)).join(' ').trim();
    codes.forEach(c => out.push({code: normalizeCode(c), name, valid: normalizeCode(c).length >= 8}));
  }
  return out;
}
const CODE_RE = /\b([A-Z]{2}\d{9}[A-Z]{2}|BR\d{12,14}[A-Z]?|LP\d{11,14}|(?:CNBR|SYRM|YT)\w{8,})\b/;
const DISMISS_KEY = 'sofia.packages.dismissed.v1';
async function listAll(api: SofiaApi, kind: string) { const all: Entity[] = []; for (let o = 0; ; o += 100) { const r = await api.entities(kind, '', o); all.push(...r.items); if (r.items.length < 100) break; } return all; }
const STEP_ICON: IconName[] = ['box', 'truck', 'mapPin', 'checkCircle'];

export function PackagesApp({api, active, onBack}: {api: SofiaApi; active: boolean; onBack: () => void}) {
  const c = useTheme(), desktop = useDesktop(), {toast, toastNode} = useToast();
  const [ents, setEnts] = useState<Entity[] | null>(null), [mails, setMails] = useState<Entity[]>([]), [dismissed, setDismissed] = useState<string[]>([]), [quota, setQuota] = useState<{used: number; limit: number} | null>(null);
  const [view, setView] = useState('all'), // 0.3.271: abre em Todas (pedido do Pedro)
     [raw, setRaw] = useState(''), [openId, setOpenId] = useState<string | null>(null), [busy, setBusy] = useState(''), [feeDialog, setFeeDialog] = useState<Pack | null>(null), [pickDialog, setPickDialog] = useState<Pack | null>(null);
  const load = useCallback(async () => {
    try { const [p, m] = await Promise.all([listAll(api, 'package'), listAll(api, 'mail_hit').catch(() => [] as Entity[])]); setEnts(p); setMails(m); } catch (e) { toast(errorText(e)); setEnts(x => x || []); }
    api.packagesQuota().then(q => setQuota(q)).catch(() => {});
    AsyncStorage.getItem(DISMISS_KEY).then(v => setDismissed(v ? JSON.parse(v) : [])).catch(() => {});
  }, [api]);
  useEffect(() => { if (active) void load(); }, [active, load]);
  useEffect(() => { if (!active) { setOpenId(null); setFeeDialog(null); setPickDialog(null); } }, [active]);
  const patchLocal = (e: Entity) => setEnts(l => (l || []).some(x => x.id === e.id) ? (l || []).map(x => x.id === e.id ? e : x) : [e, ...(l || [])]);
  const packs = useMemo(() => (ents || []).filter(e => e.state !== 'archived').map(classify).sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)), [ents]);
  const recentDone = (p: Pack) => p.delivered && Date.now() - (Date.parse(p.at) || 0) < DONE7; // entregues saem da frente depois de 7 dias
  const lists: Record<string, Pack[]> = {
    all: packs, way: packs.filter(p => !p.delivered || recentDone(p)), needs: packs.filter(p => p.needs),
    transit: packs.filter(p => !p.delivered && p.step <= 1 && !p.needs), out: packs.filter(p => !p.delivered && p.step === 2 && p.needs !== 'pickup'), pickup: packs.filter(p => p.needs === 'pickup'), done: packs.filter(p => p.delivered),
  };
  const open = packs.find(p => p.id === openId) || null;
  // sugestao da Sofia: codigo de rastreio achado num e-mail que ainda nao e encomenda
  const known = new Set(packs.map(p => p.code));
  const suggestion = (() => { for (const m of mails) { const txt = (m.title + ' ' + String(m.data?.snippet || '')).toUpperCase(), hit = txt.match(CODE_RE); if (hit && !known.has(hit[1]) && !dismissed.includes(hit[1])) return {code: hit[1], from: String(m.data?.from_name || m.data?.from_addr || 'um e-mail'), mail: m}; } return null; })();

  async function add(input: string, nameFromMail = '', mailId = '') {
    const list = parseCodes(input); if (!list.length) return;
    let ok = 0;
    for (const x of list) {
      if (!x.valid) { toast('"' + x.code + '" não parece um código de rastreio.'); continue; }
      if (known.has(x.code)) { toast(x.code + ' já está em Encomendas.', [{label: 'Abrir', run: () => { const p = packs.find(p2 => p2.code === x.code); if (p) setOpenId(p.id); }}]); continue; }
      const carrier = detectCarrier(x.code);
      try {
        const saved = await api.saveEntity({kind: 'package', title: (x.name || nameFromMail || x.code).slice(0, 120), content: '', area: 'Encomendas', privacy: 'private', state: 'active', tags: [], data: {code: x.code, carrier, status: '', last_event_at: '', events: '[]', checked_at: '', error: '', note: '', source_mail: mailId}});
        patchLocal(saved); ok++; known.add(x.code);
        void api.refreshPackage(saved.id).then(r => { patchLocal(r.item); if (r.error) toast(saved.title + ': ' + r.error); }).catch(() => {});
      } catch (e) { toast(errorText(e)); }
    }
    if (ok) { toast(ok === 1 ? 'Encomenda adicionada. ' + CARRIER_LABEL[detectCarrier(list[0].code)] + ' reconhecido.' : ok + ' encomendas adicionadas.'); api.packagesQuota().then(setQuota).catch(() => {}); }
  }
  async function refresh(p: Pack) { setBusy(p.id); try { const r = await api.refreshPackage(p.id); patchLocal(r.item); toast(r.error ? 'Não deu para consultar agora: ' + r.error : r.changed ? 'Status novo: ' + classify(r.item).status : 'Sem novidade desde a última consulta.'); } catch (e) { toast(errorText(e)); } finally { setBusy(''); } }
  async function patch(p: Pack, data: Record<string, any>, state?: string) { try { const s = await api.saveEntity({...p.e, ...(state ? {state} : {}), data: {...p.e.data, ...data}, revision: p.e.revision}); patchLocal(s); return s; } catch (e) { toast(errorText(e)); return null; } }
  async function remove(p: Pack) {
    setOpenId(null); setEnts(l => (l || []).filter(x => x.id !== p.id));
    try { await api.saveEntity({...p.e, state: 'archived', revision: p.e.revision}); toast('"' + p.title + '" saiu da lista.', [{label: 'Desfazer', run: () => void api.saveEntity({...p.e, revision: undefined as any}).catch(() => {}).then(() => load())}]); } catch (e) { toast(errorText(e)); void load(); }
  }
  async function launchFee(p: Pack, amount: number) {
    try {
      const accounts = (await api.entities('fin_account')).items.filter(a => a.state !== 'archived'); if (!accounts.length) { toast('Crie primeiro uma conta em Finanças.'); return; }
      if (p.e.data?.fee_tx) { toast('O imposto desta encomenda já foi lançado em Finanças.'); return; }
      const d = new Date(), day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const tx = await api.saveEntity({kind: 'fin_tx', title: 'Imposto: ' + p.title, content: 'Encomenda ' + p.code, area: 'Pessoal', state: 'active', privacy: 'private', tags: [], data: {kind: 'expense', amount, date: day, category: 'Compras', account_id: accounts[0].id, paid: true, recurrence: 'none'}});
      await patch(p, {fee_amount: amount, fee_paid: true, fee_tx: tx.id}); setFeeDialog(null); toast('Imposto de ' + brl(amount) + ' lançado em Finanças e marcado como pago.');
    } catch (e) { toast(errorText(e)); }
  }
  async function pickupReminder(p: Pack, when: string) {
    try { const r = await api.saveEntity({kind: 'reminder', title: 'Retirar: ' + p.title, content: '', area: 'Lembretes', privacy: 'private', state: 'active', tags: [], data: {remind_at: new Date(when).toISOString(), message: p.local ? 'Local: ' + p.local : '', location: p.local}}); await patch(p, {pickup_reminder: r.id}); setPickDialog(null); toast('Lembrete de retirada criado.'); } catch (e) { toast(errorText(e)); }
  }
  const openUrl = (u: string) => { if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(u, '_blank'); else void Linking.openURL(u); };

  const TITLES: Record<string, string> = {all: 'Todas', way: 'A caminho', needs: 'Precisa de você', transit: 'Em trânsito', out: 'Saiu para entrega', pickup: 'Para retirar', done: 'Entregues'};
  const quotaNode = quota ? <View testID="packages-quota" style={{gap: 6, paddingHorizontal: 12, paddingTop: 16}}><Text style={{color: c.muted, fontSize: 12}}>{Math.max(0, quota.limit - quota.used)} de {quota.limit} rastreios grátis em {new Date().toLocaleDateString('pt-BR', {month: 'long'})}</Text><View style={{height: 4, borderRadius: 2, backgroundColor: c.line}}><View style={{width: (Math.min(100, quota.used / quota.limit * 100) + '%') as any, height: 4, borderRadius: 2, backgroundColor: c.accent}} /></View><Text style={{color: c.muted, fontSize: 11}}>Atualizar não gasta. Renova todo mês.</Text></View> : null;
  const sidebar = <View style={{flex: 1, minHeight: 520}}>
    <SideItem testID="pk-nav-all" icon="box" label="Todas" count={packs.length} selected={view === 'all'} onPress={() => setView('all')} />
    <SideItem testID="pk-nav-way" icon="list" label="A caminho" count={lists.way.filter(p => !p.delivered).length} selected={view === 'way'} onPress={() => setView('way')} />
    <SideItem testID="pk-nav-needs" icon="warning" label="Precisa de você" count={lists.needs.length} selected={view === 'needs'} onPress={() => setView('needs')} />
    <SideLabel>Situação</SideLabel>
    <SideItem icon="truck" label="Em trânsito" count={lists.transit.length} selected={view === 'transit'} onPress={() => setView('transit')} />
    <SideItem icon="mapPin" label="Saiu para entrega" count={lists.out.length} selected={view === 'out'} onPress={() => setView('out')} />
    <SideItem icon="storefront" label="Para retirar" count={lists.pickup.length} selected={view === 'pickup'} onPress={() => setView('pickup')} />
    <SideItem icon="check" label="Entregues" count={lists.done.length} selected={view === 'done'} onPress={() => setView('done')} />
    <View style={{flex: 1}} />{quotaNode}
  </View>;
  const mobileNav = <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow: 0}} contentContainerStyle={{gap: 8, paddingHorizontal: 16, paddingVertical: 10}}>
    {Object.keys(TITLES).map(k => <Chip key={k} label={TITLES[k]} count={(k === 'way' ? lists.way.filter(p => !p.delivered) : lists[k]).length || undefined} selected={view === k} onPress={() => setView(k)} />)}
  </ScrollView>;
  function Card({p}: {p: Pack}) {
    const tone = p.needs === 'fee' || p.needs === 'problem' ? c.danger : p.needs === 'pickup' ? c.warn : null;
    return <Pressable testID={'pk-card-' + p.id} accessibilityRole="button" accessibilityLabel={'Abrir encomenda ' + p.title} onPress={() => setOpenId(p.id)} {...contextMenu(() => [{label: 'Abrir', icon: 'box', run: () => setOpenId(p.id)}, {label: 'Atualizar', icon: 'refresh', run: () => void refresh(p)}, {label: 'Copiar código', icon: 'copy', run: () => void Clipboard.setStringAsync(p.code)}, {label: 'Excluir', icon: 'trash', danger: true, run: () => void remove(p)}])}
      style={({hovered}: any) => ({gap: 8, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: tone || (hovered ? c.accent + '55' : c.line), backgroundColor: c.surface, opacity: p.delivered && view === 'way' ? 0.75 : 1})}>
      <View style={{flexDirection: 'row', gap: 12}}>
        <View style={{width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: (tone || c.accent) + '1f'}}><Icon name={p.needs === 'fee' ? 'card' : p.needs === 'pickup' ? 'storefront' : p.needs === 'problem' ? 'warning' : STEP_ICON[p.step]} size={18} color={tone || c.accent} /></View>
        <View style={{flex: 1, minWidth: 0, gap: 2}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 14, fontWeight: '600'}}>{p.title}</Text><Text style={{color: c.muted, fontSize: 12}}>{rel(p.at)}</Text></View>
          <Text numberOfLines={2} style={{color: c.text, fontSize: 13}}>{p.status}{p.local ? ' · ' + p.local : ''}</Text>
          <Text style={{color: c.muted, fontSize: 12}}>{CARRIER_LABEL[p.carrier] || 'Transportadora'} · {p.code}</Text>
        </View>
      </View>
      {p.needs === 'fee' ? <View style={{flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: c.dangerBg}}><Icon name="card" size={13} color={c.danger} /><Text style={{color: c.danger, fontSize: 12}}>{p.feeAmount ? 'Imposto de ' + brl(p.feeAmount) + ' a pagar' : 'Imposto a pagar'}</Text></View> : null}
      {p.needs === 'pickup' ? <View style={{flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: c.warn + '22'}}><Icon name="mapPin" size={13} color={c.warn} /><Text style={{color: c.warn, fontSize: 12}}>Aguardando retirada{p.local ? ' · ' + p.local : ''}</Text></View> : null}
      <View style={{flexDirection: 'row', gap: 4}}>{STEPS.map((s, i) => <View key={s} style={{flex: 1, gap: 4}}><View style={{height: 4, borderRadius: 2, backgroundColor: i <= p.step ? c.accent : c.line}} /><Text numberOfLines={1} style={{color: i === p.step ? c.text : c.muted, fontSize: 11, fontWeight: i === p.step ? '600' : '400'}}>{s}</Text></View>)}</View>
      {p.estimated && !p.delivered ? <Text style={{color: c.accent, fontSize: 12}}>Previsão: {dayLabel(p.estimated)}</Text> : null}
    </Pressable>;
  }
  const cur = lists[view] || [];
  const sections: [string, Pack[]][] = view === 'all' ? [['Precisa de você', cur.filter(p => p.needs)], ['A caminho', cur.filter(p => !p.needs && !p.delivered)], ['Entregues', cur.filter(p => p.delivered)]] : view === 'way' ? [['Precisa de você', cur.filter(p => p.needs)], ['A caminho', cur.filter(p => !p.needs && !p.delivered)], ['Entregues nos últimos 7 dias', cur.filter(p => p.delivered)]] : [[TITLES[view], cur]];
  const hint = raw.trim() ? parseCodes(raw).map(x => !x.valid ? 'Código inválido' : known.has(x.code) ? x.code + ' já está na lista' : (CARRIER_LABEL[detectCarrier(x.code)] || 'Transportadora') + ' · ' + x.code + (x.name ? ' · "' + x.name + '"' : '')) : [];
  if (!ents) return <AppSkeleton label="Carregando encomendas…" />;
  return <InternalBackGesture enabled={active && !openId} onBack={onBack}>
    <View testID="packages-screen" style={{flex: 1}}>
      <AppFrame sidebar={sidebar} mobileNav={mobileNav} tabsOnTop>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{...(desktop ? {paddingLeft: '40px', paddingRight: '40px', paddingTop: '32px', maxWidth: 1160} : {paddingHorizontal: 16, paddingTop: 6}) as any, paddingBottom: 40, gap: 12}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
            {!desktop ? <IconButton name="back" label="Voltar aos apps" onPress={onBack} /> : null}
            <View style={{flex: 1, gap: 2}}><Text style={{color: c.text, fontSize: desktop ? 28 : 20, fontWeight: desktop ? '600' : '700', letterSpacing: desktop ? -0.5 : 0}}>{desktop || view === 'all' || view === 'way' ? 'Encomendas' : TITLES[view]}</Text><Text style={{color: c.muted, fontSize: desktop ? 14 : 13}}>{lists.way.filter(p => !p.delivered).length} a caminho · aviso no celular quando o status muda</Text></View>
            {desktop && quota ? <Text style={{color: c.muted, fontSize: 12, borderWidth: 1, borderColor: c.line, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6}}>{Math.max(0, quota.limit - quota.used)} de {quota.limit} rastreios grátis em {new Date().toLocaleDateString('pt-BR', {month: 'long'})}</Text> : null}
          </View>
          {desktop ? <DeskTabs value={view} onChange={setView} options={(['all', 'needs', 'way', 'transit', 'out', 'pickup', 'done'] as const).map(k => ({value: k, label: TITLES[k], count: (k === 'way' ? lists.way.filter(p => !p.delivered) : lists[k]).length}))} /> : null}
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}>
            <Icon name="plus" size={16} color={c.muted} />
            <TextInput testID="pk-add" accessibilityLabel="Código de rastreio" value={raw} onChangeText={setRaw} placeholder="Cole o código de rastreio e, se quiser, um nome. Ex.: AA123456789BR Fone" placeholderTextColor={c.muted} autoCapitalize="characters" submitBehavior="submit"
              onSubmitEditing={() => { const v = raw.trim(); if (!v) return; setRaw(''); void add(v); }} style={{flex: 1, color: c.text, fontSize: 14, paddingVertical: 13}} />
          </View>
          {hint.length ? <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{hint.map((h, i) => <Text key={i} style={{color: /inválido|já está/.test(h) ? c.danger : c.accent, fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: /inválido|já está/.test(h) ? c.dangerBg : c.accentSoft}}>{h}</Text>)}<Text style={{color: c.muted, fontSize: 12}}>Enter para adicionar</Text></View> : null}
          {suggestion ? <View testID="pk-suggestion" style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 13, backgroundColor: c.accentSoft, flexWrap: 'wrap'}}>
            <Icon name="mail" size={16} color={c.accent} /><Text style={{flex: 1, minWidth: 200, color: c.text, fontSize: 13}}>A Sofia achou um código de rastreio num e-mail de <Text style={{fontWeight: '700'}}>{suggestion.from}</Text>: {suggestion.code}</Text>
            <PrimaryButton label="Adicionar" onPress={() => void add(suggestion.code, suggestion.mail.title.slice(0, 60), suggestion.mail.id)} /><GhostButton label="Ignorar" onPress={() => { const next = [...dismissed, suggestion.code]; setDismissed(next); void AsyncStorage.setItem(DISMISS_KEY, JSON.stringify(next)); }} />
          </View> : null}
          {sections.filter(([, l]) => l.length).map(([t, l]) => <View key={t} style={{gap: 8}}><Text style={{color: c.muted, fontSize: 12, fontWeight: '700', paddingHorizontal: 4}}>{t} <Text style={{fontWeight: '400'}}>{l.length}</Text></Text>{l.map(p => <Card key={p.id} p={p} />)}</View>)}
          {!cur.length ? <Text style={{color: c.muted, textAlign: 'center', paddingVertical: 30}}>{view === 'way' || view === 'all' ? (view === 'all' ? 'Nenhuma encomenda ainda. Cole um código de rastreio no campo acima.' : 'Nada a caminho. Cole um código de rastreio no campo acima.') : 'Nenhuma encomenda aqui.'}</Text> : null}
          {!desktop ? quotaNode : null}
        </ScrollView>
      </AppFrame>
      {toastNode}
      <Presence>{open ? <Panel visible onClose={() => setOpenId(null)} width={520} testID="pk-panel" title={<View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 18, fontWeight: '600'}}>{open.title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Mais opções" onPress={e => openMore(e, open.title, [
          {label: 'Abrir no site da transportadora', icon: 'link', run: () => openUrl(officialUrl(open.carrier, open.code))},
          {label: 'Copiar código', icon: 'copy', run: () => void Clipboard.setStringAsync(open.code).then(() => toast('Código copiado.'))},
          ...(open.delivered ? [] : [{label: 'Marcar como entregue', icon: 'check' as IconName, run: () => void patch(open, {}, 'delivered')}]),
          {label: 'Excluir', icon: 'trash', danger: true, run: () => void remove(open)},
        ])} style={{width: 32, height: 32, alignItems: 'center', justifyContent: 'center'}}><Icon name="more" size={18} color={c.muted} /></Pressable></View>}>
        <Text style={{color: c.muted}}>{CARRIER_LABEL[open.carrier] || 'Transportadora'} · {open.code}</Text>
        <View style={{flexDirection: 'row', gap: 4}}>{STEPS.map((s, i) => <View key={s} style={{flex: 1, gap: 4}}><View style={{height: 4, borderRadius: 2, backgroundColor: i <= open.step ? c.accent : c.line}} /><Text style={{color: i === open.step ? c.text : c.muted, fontSize: 11}}>{s}</Text></View>)}</View>
        {open.needs === 'fee' ? <View style={{gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.dangerBg}}><Text style={{color: c.danger, fontWeight: '600'}}>{open.feeAmount ? 'Imposto de ' + brl(open.feeAmount) + ' a pagar' : 'Imposto de importação a pagar'}</Text><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}><PrimaryButton icon="card" label="Pagar imposto" onPress={() => openUrl('https://apps.correios.com.br/portalimportador/')} /><GhostButton icon="wallet" label="Lançar em Finanças" onPress={() => setFeeDialog(open)} /></View></View> : null}
        {open.feePaid ? <Text style={{color: c.success, fontSize: 13}}>Imposto pago{open.feeAmount ? ' · ' + brl(open.feeAmount) : ''}{open.e.data?.fee_tx ? ' · lançado em Finanças' : ''}</Text> : null}
        {open.needs === 'pickup' ? <View style={{gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.warn + '1f'}}><Text style={{color: c.warn, fontWeight: '600'}}>Aguardando retirada{open.local ? ' · ' + open.local : ''}</Text><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}><GhostButton icon="mapPin" label="Ver no mapa" onPress={() => openUrl('https://www.google.com/maps/search/' + encodeURIComponent((open.local || 'agência ' + (CARRIER_LABEL[open.carrier] || '')).trim()))} /><GhostButton icon="bell" label={open.e.data?.pickup_reminder ? 'Lembrete criado' : 'Lembrar de retirar'} on={!!open.e.data?.pickup_reminder} onPress={() => !open.e.data?.pickup_reminder && setPickDialog(open)} /></View></View> : null}
        {open.estimated && !open.delivered ? <Text style={{color: c.accent}}>Previsão de entrega: {dayLabel(open.estimated)}</Text> : null}
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>{open.e.data?.checked_at ? 'Consultado ' + rel(String(open.e.data.checked_at)) : ''}{open.error ? ' · ' + open.error : ''}</Text><GhostButton icon="refresh" label={busy === open.id ? 'Atualizando…' : 'Atualizar'} onPress={() => void refresh(open)} /></View>
        <View style={{gap: 0}}>{open.events.length ? open.events.map((ev, i) => <View key={i} style={{flexDirection: 'row', gap: 12}}>
          <View style={{alignItems: 'center', width: 14}}><View style={{width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: i === 0 ? c.accent : c.line}} />{i < open.events.length - 1 ? <View style={{flex: 1, width: 2, backgroundColor: c.line}} /> : null}</View>
          <View style={{flex: 1, paddingBottom: 14}}><Text style={{color: i === 0 ? c.text : c.muted, fontWeight: i === 0 ? '600' : '400'}}>{ev.status}</Text>{ev.local ? <Text style={{color: c.muted, fontSize: 12}}>{ev.local}</Text> : null}<Text style={{color: c.muted, fontSize: 11}}>{ev.at ? new Date(ev.at).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) : ''}</Text></View>
        </View>) : <Text style={{color: c.muted}}>Ainda sem eventos. A Sofia consulta de tempos em tempos e avisa quando mudar.</Text>}</View>
      </Panel> : null}</Presence>
      <Presence>{feeDialog ? <FeeDialog p={feeDialog} onClose={() => setFeeDialog(null)} onSave={v => void launchFee(feeDialog, v)} /> : null}</Presence>
      <Presence>{pickDialog ? <PickupDialog onClose={() => setPickDialog(null)} onSave={w => void pickupReminder(pickDialog, w)} /> : null}</Presence>
    </View>
  </InternalBackGesture>;
}
function FeeDialog({p, onClose, onSave}: {p: Pack; onClose: () => void; onSave: (v: number) => void}) {
  const [v, setV] = useState(moneyInput(p.feeAmount)); const n = parseMoney(v);
  return <Dialog visible onClose={onClose} title="Lançar imposto em Finanças" footer={<><GhostButton label="Cancelar" onPress={onClose} /><PrimaryButton label="Lançar" disabled={!n} onPress={() => n && onSave(n)} /></>}>
    <FieldRow label="Valor"><Input autoFocus value={v} onChangeText={setV} placeholder="0,00" keyboardType="decimal-pad" /></FieldRow>
  </Dialog>;
}
function PickupDialog({onClose, onSave}: {onClose: () => void; onSave: (when: string) => void}) {
  const [w, setW] = useState('');
  return <Dialog visible onClose={onClose} title="Lembrar de retirar" footer={<><GhostButton label="Cancelar" onPress={onClose} /><PrimaryButton label="Criar lembrete" disabled={!w} onPress={() => onSave(w)} /></>}>
    <DateTimeField label="Dia e hora" value={w} onChange={setW} allowClear={false} />
  </Dialog>;
}
void PALETTE;
