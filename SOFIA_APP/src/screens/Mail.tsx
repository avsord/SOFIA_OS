import {dpx} from '../lib/content-width';
import {Presence} from '../components/Presence';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {contextMenu} from '../components/ContextMenu';
import {PALETTE} from '../lib/palette';
import {tap,useDesktop} from '../lib/desktop';
import {useColumnPad} from '../lib/desktop';
import {ActivityIndicator, Alert, Animated, Easing, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, Switch, Text, TextInput, View} from 'react-native';
// 0.3.255: ScrollView que rola sozinho ate o calendario aberto caber na tela (ver RevealScroll)
import {RevealScrollView as ScrollView} from '../components/RevealScroll';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../lib/theme';
import {rescanAfterRule, type RuleAction} from '../lib/mail-rules';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {errorText} from '../lib/chat-model';
import {useRenderCost} from '../lib/render-cost';
import {Sheet} from '../components/Sheet';
import {InternalBackGesture} from '../components/InternalBackGesture';
import {Icon, type IconName} from '../components/Icon';
import {Panel} from '../components/AppKit';
import {Button, IconButton, DeskTabs} from '../components/UI';
import {relativeTime} from '../components/NotificationCenter';
import {Spinner, LoadingLines,LoadingCaption} from '../components/Loading';
import {parseBill, parseMoney, todayISO, toAccount} from '../lib/finance';
import {money} from '../lib/monitoring';
import {openInGmail} from '../lib/open-gmail';
import {appAlert} from '../lib/app-alert';
import {DateTimeField} from '../components/DateTimeField';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Tab = 'hits' | 'rules' | 'accounts';
const PROVIDERS: Array<{value: string; label: string; help: string; link?: string}> = [
  {value: 'gmail_google', label: 'Gmail · Conta Google (mais fácil)', help: 'Sem senha nenhuma: usa a mesma Conta Google da Agenda e do Drive (Perfil → Conta Google). A Sofia só lê remetente, assunto e o trecho que o Gmail mostra.'},
  {value: 'gmail', label: 'Gmail (senha de app)', help: 'No Google: ative a verificação em duas etapas e crie uma "senha de app" (16 letras). Cole aqui essa senha, não a sua senha normal.', link: 'https://myaccount.google.com/apppasswords'},
  {value: 'outlook', label: 'Outlook / Hotmail', help: 'Crie uma senha de app na conta Microsoft (Segurança → Opções avançadas). Algumas contas pessoais da Microsoft não permitem mais IMAP; se recusar, o app avisa.', link: 'https://account.live.com/proofs/AppPassword'},
  {value: 'yahoo', label: 'Yahoo', help: 'Em Segurança da conta, gere uma senha de app e cole aqui.', link: 'https://login.yahoo.com/myaccount/security/'},
  {value: 'icloud', label: 'iCloud', help: 'Em appleid.apple.com → Senhas de app, gere uma e cole aqui.', link: 'https://appleid.apple.com/'},
  {value: 'imap', label: 'Outro (IMAP)', help: 'Informe o servidor IMAP do seu provedor (ex.: imap.seudominio.com) e a senha da caixa ou senha de app.'},
];
const FIELDS = [{value: 'any', label: 'Em qualquer lugar'}, {value: 'from', label: 'Remetente'}, {value: 'subject', label: 'Assunto'}, {value: 'body', label: 'Texto'}];
/** 0.3.222: emoji do e-mail - o escolhido pela pessoa vale; sem escolha, a estrela das regras "importante". */
const HIT_EMOJIS = ['⭐', '🔥', '💰', '📌', '✅', '❗', '🧾', '📦'];
/** 0.3.268: as marcacoes viram icones de traco (pedido do Pedro). O valor guardado continua o mesmo, entao os
 * e-mails e regras ja marcados com emoji aparecem convertidos sem mexer em dado nenhum. */
const MARKS: Record<string, {icon: IconName; label: string; color: string}> = {
  '⭐': {icon: 'star', label: 'Estrela', color: PALETTE.amber}, '🔥': {icon: 'lightning', label: 'Urgente', color: PALETTE.red}, '💰': {icon: 'coins', label: 'Dinheiro', color: PALETTE.green},
  '📌': {icon: 'pin', label: 'Fixado', color: PALETTE.blue}, '✅': {icon: 'checkCircle', label: 'Resolvido', color: PALETTE.green}, '❗': {icon: 'warning', label: 'Atenção', color: PALETTE.red},
  '🧾': {icon: 'receipt', label: 'Conta', color: PALETTE.lilac}, '📦': {icon: 'box', label: 'Encomenda', color: PALETTE.amber},
};
export function MarkIcon({value, size = 15}: {value: string; size?: number}) {
  const m = MARKS[value]; if (!value) return null;
  if (!m) return <Text style={{fontSize: size - 1}}>{value}</Text>;
  return <View accessibilityLabel={'Marcado: ' + m.label}><Icon name={m.icon} size={size} color={m.color} /></View>;
}
/** 0.3.223: a regra tambem escolhe o emoji (no lugar da estrela); o e-mail usa o dele, senao o da regra, senao a estrela. */
function hitEmoji(h: {data: Record<string, any>}, rules: Array<{id: string; data: Record<string, any>}> = []): string { const e = String(h.data?.emoji || ''); if (e === 'none') return ''; if (e) return e; if (!h.data?.important) return ''; const r = rules.find(x => x.id === h.data?.rule_id); return String(r?.data?.emoji || '') || '⭐'; }
const TEMPLATES = [
  {title: 'Contas e faturas', field: 'any', contains: 'fatura, boleto, vencimento, pagamento', important: true},
  {title: 'Entregas', field: 'subject', contains: 'pedido, entrega, enviado, rastreio', important: false},
  {title: 'Trabalho urgente', field: 'subject', contains: 'urgente, prazo, aprovação', important: true},
];

async function listAll(api: SofiaApi, kind: string) {
  const all: Entity[] = [];
  for (let o = 0; ; o += 100) { const r = await api.entities(kind, '', o); all.push(...r.items); if (r.items.length < 100) break; }
  return all;
}
function Chips<T extends string>({value, options, onChange}: {value: T; options: Array<{value: T; label: string}>; onChange: (v: T) => void}) {
  const c = useTheme();
  return <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{options.map(o => <Pressable key={o.value} onPress={() => onChange(o.value)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: o.value === value ? c.accent : c.input}}><Text style={{color: o.value === value ? c.onAccent : c.text, fontWeight: '500', fontSize: 13}}>{o.label}</Text></Pressable>)}</View>;
}
function Field({label, value, onChange, placeholder, secure = false, email = false}: {label: string; value: string; onChange: (v: string) => void; placeholder?: string; secure?: boolean; email?: boolean}) {
  const c = useTheme();
  return <View style={{gap: 6}}><Text style={{fontSize: 12, color: c.muted}}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.muted} secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} keyboardType={email ? 'email-address' : 'default'} style={{fontSize: 16, color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.input}} /></View>;
}

// ---------- 0.3.146: selecao por grupo/conta ----------
export type MailSelection = {type: 'all'} | {type: 'group'; name: string} | {type: 'account'; id: string};
let lastSelection: MailSelection = {type: 'all'};
// 0.3.257: o seletor de conta fica onde a pessoa deixou por ultimo, tambem depois de fechar o app
const SELECTION_KEY = 'sofia.mail.selection.v1';
let selectionLoaded = false;
const selectionReady = AsyncStorage.getItem(SELECTION_KEY).then(v => {
  if (v && !selectionLoaded) { try { const x = JSON.parse(v); if (x && (x.type === 'all' || (x.type === 'group' && typeof x.name === 'string') || (x.type === 'account' && typeof x.id === 'string'))) lastSelection = x; } catch { /* guardado invalido */ } }
}).catch(() => {}).finally(() => { selectionLoaded = true; });
export function groupNames(accounts: Entity[]) { return [...new Set(accounts.map(a => String(a.data?.group || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')); }
export function selectionAccounts(sel: MailSelection, accounts: Entity[]) {
  const list = sel.type === 'all' ? accounts : sel.type === 'group' ? accounts.filter(a => String(a.data?.group || '').trim() === sel.name) : accounts.filter(a => a.id === sel.id);
  return new Set(list.map(a => a.id));
}
export function selectionLabel(sel: MailSelection, accounts: Entity[]) {
  if (sel.type === 'group') return accounts.some(a => String(a.data?.group || '').trim() === sel.name) ? sel.name : 'Todas as contas';
  if (sel.type === 'account') { const a = accounts.find(x => x.id === sel.id); return a ? String(a.data?.address || 'Conta') : 'Todas as contas'; }
  return 'Todas as contas';
}
function SelectionSheet({api, accounts, selection, onSelect, onClose, onChanged}: {api: SofiaApi; accounts: Entity[]; selection: MailSelection; onSelect: (v: MailSelection) => void; onClose: () => void; onChanged: () => void}) {
  const c = useTheme(), groups = groupNames(accounts), loose = accounts.filter(a => !String(a.data?.group || '').trim());
  const [renaming, setRenaming] = useState(''), [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const isSel = (v: MailSelection) => JSON.stringify(v) === JSON.stringify(selection);
  // Renomear/excluir grupo so muda o campo "grupo" das contas: nao mexe no endereco, nao desconecta e nao apaga e-mails.
  async function setGroupOf(list: Entity[], value: string) {
    setBusy(true); setError('');
    try { for (const a of list) await api.saveEntity({...a, data: {...a.data, group: value}, base_data: a.data, base_title: a.title} as any); onChanged(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const row = (label: string, v: MailSelection, sub = '', indent = 0) => <Pressable key={label + JSON.stringify(v)} accessibilityRole="button" accessibilityState={{selected: isSel(v)}} onPress={() => onSelect(v)} style={{paddingVertical: 12, paddingLeft: 12 + indent, paddingRight: 12, borderRadius: 12, backgroundColor: isSel(v) ? c.accentSoft : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 8}}><Text style={{flex: 1, color: isSel(v) ? c.accent : c.text, fontWeight: indent ? '500' : '700'}}>{label}</Text>{sub ? <Text style={{color: c.muted, fontSize: 12}}>{sub}</Text> : null}</Pressable>;
  return <Sheet visible onClose={onClose} label="Fechar seleção de contas">
    <ScrollView contentContainerStyle={{gap: 4}} keyboardShouldPersistTaps="handled">
      <Text style={{fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 6}}>Mostrar e-mails de</Text>
      {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
      {row('Todas as contas', {type: 'all'}, accounts.length + ' conta(s)')}
      {groups.map(g => { const list = accounts.filter(a => String(a.data?.group || '').trim() === g); return <View key={g} style={{gap: 2, marginTop: 6}}>
        {renaming === g ? <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}><View style={{flex: 1}}><Field label={'Novo nome para ' + g} value={name} onChange={setName} placeholder={g} /></View><IconButton name="check" label="Salvar nome do grupo" disabled={busy || !name.trim()} onPress={() => { void setGroupOf(list, name.trim().slice(0, 60)).then(() => { if (selection.type === 'group' && selection.name === g) onSelect({type: 'group', name: name.trim().slice(0, 60)}); setRenaming(''); }); }} /></View>
        : <View style={{flexDirection: 'row', alignItems: 'center'}}><View style={{flex: 1}}>{row(g, {type: 'group', name: g}, list.length + ' conta(s)')}</View><IconButton name="edit" label={'Renomear grupo ' + g} onPress={() => { setRenaming(g); setName(g); }} /><IconButton name="trash" label={'Excluir grupo ' + g} disabled={busy} onPress={() => appAlert('Excluir grupo “' + g + '”?', 'As contas continuam conectadas e nenhum e-mail é apagado; elas só ficam sem grupo.', [{text: 'Cancelar'}, {text: 'Excluir grupo', style: 'destructive', onPress: () => { void setGroupOf(list, '').then(() => { if (selection.type === 'group' && selection.name === g) onSelect({type: 'all'}); }); }}])} /></View>}
        {list.map(a => row(String(a.data?.address || 'Conta'), {type: 'account', id: a.id}, '', 18))}
      </View>; })}
      {loose.length ? <View style={{gap: 2, marginTop: 6}}><Text style={{color: c.muted, fontSize: 12, paddingHorizontal: 12, paddingTop: 6}}>Sem grupo</Text>{loose.map(a => row(String(a.data?.address || 'Conta'), {type: 'account', id: a.id}, '', 18))}</View> : null}
      <Text style={{color: c.muted, fontSize: 11, lineHeight: 17, marginTop: 10}}>Para criar um grupo ou mover uma conta, abra a conta em Contas e escolha o grupo.</Text>
    </ScrollView>
  </Sheet>;
}

export function Mail({api, active, onBack}: {api: SofiaApi; active: boolean; onBack: () => void}) {
  useRenderCost('apps:mail');
  const c = useTheme(), insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('hits'), [accounts, setAccounts] = useState<Entity[] | null>(null), [rules, setRules] = useState<Entity[]>([]), [hits, setHits] = useState<Entity[]>([]);
  const [error, setError] = useState(''), [checking, setChecking] = useState(false), [info, setInfo] = useState('');
  const [addAccount, setAddAccount] = useState<Entity | 'new' | null>(null), [ruleSheet, setRuleSheet] = useState<Entity | Partial<Entity> | null>(null), [open, setOpen] = useState<Entity | null>(null);
  const [onlyImportant, setOnlyImportant] = useState(false);
  // 0.3.146: grupos de contas criados pela pessoa (Profissional, Pessoal, Minha loja...).
  // O titulo vira seletor: todas as contas, um grupo ou uma conta. A lista e os contadores seguem a selecao.
  const [selection, setSelectionState] = useState<MailSelection>(lastSelection), [picker, setPicker] = useState(false);
  const setSelection = (v: MailSelection) => { lastSelection = v; selectionLoaded = true; setSelectionState(v); void AsyncStorage.setItem(SELECTION_KEY, JSON.stringify(v)).catch(() => {}); };
  useEffect(() => { if (selectionLoaded) return; let live = true; void selectionReady.then(() => { if (live) setSelectionState(lastSelection); }); return () => { live = false; }; }, []);
  // conta escolhida foi removida: volta para a primeira da lista
  useEffect(() => { if (!accounts || selection.type !== 'account' || accounts.some(a => a.id === selection.id)) return; const first = [...accounts].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))[0]; setSelection(first ? {type: 'account', id: first.id} : {type: 'all'}); }, [accounts, selection]);
  const load = useCallback(async () => {
    try { const [a, r, h] = await Promise.all([listAll(api, 'mail_account'), listAll(api, 'mail_rule'), listAll(api, 'mail_hit')]); setAccounts(a.filter(x => x.state !== 'archived')); setRules(r.filter(x => x.state !== 'archived')); setHits(h.filter(x => x.state !== 'archived').sort((x, y) => String(y.data.received_at).localeCompare(String(x.data.received_at)))); setError(''); }
    catch (e) { setError(errorText(e)); setAccounts(a => a || []); }
  }, [api]);
  useEffect(() => { if (active) void load(); }, [active, load]);
  // 0.3.146: "verificando", "concluido sem resultado" e "falha de acesso" sao estados diferentes.
  async function check(rescanDays = 0) {
    setChecking(true); setInfo(rescanDays ? `Reavaliando os últimos ${rescanDays} dias…` : 'Verificando as contas…');
    try {
      const r = await api.mailCheck('', rescanDays);
      // 0.3.201: resposta "ja ha uma verificacao em andamento" vem sem a lista de erros
      const failed = (r?.errors || []).map(e => ((accounts || []).find(a => a.id === e.account)?.data?.address || 'Conta') + ': ' + e.error);
      setInfo(r.skipped ? 'Uma verificação já está em andamento. Tente de novo em instantes.'
        : (failed.length && !r.scanned ? 'Falha de acesso — ' + failed.join(' · ')
        : `Verificação concluída: ${r.scanned || 0} e-mail(s) ${rescanDays ? 'reavaliados' : 'novos'} · ${r.hits || 0} bateram com as regras${failed.length ? ' · Falha de acesso — ' + failed.join(' · ') : ''}.`));
      await load();
    }
    catch (e) { setInfo(errorText(e)); } finally { setChecking(false); }
  }
  const inSel = selectionAccounts(selection, accounts || []);
  const scoped = hits.filter(h => inSel.has(String(h.data.account_id)));
  const unread = scoped.filter(h => h.state === 'new').length, shown = scoped.filter(h => !onlyImportant || h.data.important);
  const groups = groupNames(accounts || []);
  const accountName = (id: string) => accounts?.find(a => a.id === id)?.data.address || '';
  // 0.3.249: cada regra e de UMA conta. A aba Regras mostra so as da conta (ou grupo) escolhida no topo.
  const oldestAccount = [...(accounts || [])].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))[0]?.id || '';
  const ruleOwner = (r: Entity) => String(r.data.account_id || oldestAccount);
  const scopedRules = rules.filter(r => inSel.has(ruleOwner(r)));
  const newRuleAccount = selection.type === 'account' && inSel.has(selection.id) ? selection.id : ([...inSel][0] || oldestAccount);

  // 0.3.268 (site): o e-mail abre num painel lateral; a lista continua visivel com o item aberto destacado. Setas
  // trocam de e-mail; X, Esc e o voltar do navegador fecham com a mesma animacao da abertura. No celular segue a folha.
  const desktop = useDesktop(), panelAnim = useRef(new Animated.Value(0)).current, lastMail = useRef<Entity | null>(null), [panelGone, setPanelGone] = useState(true);
  if (open) lastMail.current = open;
  const panelMail = open || (panelGone ? null : lastMail.current);
  useEffect(() => {
    if (!desktop) return;
    if (open) { setPanelGone(false); Animated.timing(panelAnim, {toValue: 1, duration: 170, easing: Easing.out(Easing.cubic), useNativeDriver: true}).start(); return; }
    Animated.timing(panelAnim, {toValue: 0, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: true}).start(({finished}) => { if (finished) setPanelGone(true); });
  }, [open, desktop, panelAnim]);
  const openMail = (h: Entity) => { setOpen(h); if (h.state === 'new') void api.saveEntity({...h, state: 'read'}).then(load).catch(() => {}); };
  const step = (dir: number) => { const cur = open || lastMail.current; if (!cur) return; const i = shown.findIndex(h => h.id === cur.id); const next = shown[i + dir]; if (next) openMail(next); };
  useEffect(() => {
    if (!desktop || !active || !open || typeof document === 'undefined') return;
    const key = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); step(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); } else if (e.key === 'Escape') { e.preventDefault(); setOpen(null); } };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  });
  const detail = (m: Entity) => (
            <View style={{gap: desktop ? 14 : 10}}>
              <Text style={{fontSize: desktop ? 20 : 18, fontWeight: '700', color: c.text, lineHeight: desktop ? 26 : undefined}}>{m.title}</Text>
              <Text style={{color: c.text}}>{m.data.from_name} <Text style={{color: c.muted}}>&lt;{m.data.from_addr}&gt;</Text></Text>
              <Text style={{color: c.muted, fontSize: 12}}>{new Date(String(m.data.received_at)).toLocaleString('pt-BR')} · {accountName(m.data.account_id)}</Text>
              <Text style={{color: c.text, lineHeight: 21}}>{m.data.snippet}</Text>
              <Text style={{color: c.muted, fontSize: 12}}>{m.data.rule_names ? 'Encontrado pela regra: ' + m.data.rule_names + '.' : 'A regra que encontrou este e-mail foi apagada; ele continua aqui.'}</Text>
              {/* 0.3.222: cada e-mail pode ter o seu emoji (a estrela ou outro) */}
              <View style={{gap: 6}}>
                <Text style={{color: c.muted, fontSize: 12}}>Marcação deste e-mail</Text>
                <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                  {['', ...HIT_EMOJIS].map(e => { const on = (hitEmoji(m, rules) || '') === e; return <Pressable key={e || 'none'} accessibilityRole="button" accessibilityLabel={e ? 'Marcar como ' + (MARKS[e]?.label || e) : 'Sem marcação'} accessibilityState={{selected: on}}
                    onPress={() => { const next = {...m, data: {...m.data, emoji: e || 'none', important: e === '⭐' ? true : e ? m.data.important : false}}; setOpen(next); void api.saveEntity(next).then(saved => { setOpen(o => o && o.id === saved.id ? saved : o); void load(); }).catch(err => setError(errorText(err))); }}
                    style={{minWidth: 40, height: 40, paddingHorizontal: 8, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.accent + '33' : c.input, borderWidth: on ? 2 : 0, borderColor: c.accent}}>
                    {e ? <MarkIcon value={e} size={19} /> : <Text style={{fontSize: 12, color: c.muted}}>Nenhuma</Text>}
                  </Pressable>; })}
                </View>
              </View>
              <Button title="Abrir no Gmail" onPress={() => { const addr = String((accounts || []).find(a => a.id === m.data.account_id)?.data?.address || ''); void openInGmail(m, addr).then(ok => { if (!ok) setInfo('Não foi possível abrir o Gmail neste celular.'); }); }} />
              <BillFromMail api={api} hit={m} onDone={() => setOpen(null)} />
              <Pressable accessibilityRole="button" onPress={() => { const id = m.id; setOpen(null); void api.deleteEntity(id).then(load).catch(() => {}); }} style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, alignSelf: 'flex-start'}}><Icon name="trash" size={16} color={c.danger} /><Text style={{color: c.danger}}>Tirar da lista</Text></Pressable>
            </View>
  );
  const pad = useColumnPad(); // 0.3.253: cabecalho alinhado a coluna de leitura no computador
  return (
    <InternalBackGesture enabled={active && !open && !addAccount && !ruleSheet} onBack={onBack}>
      <View style={{flex: 1, backgroundColor: c.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, ...(desktop ? {paddingTop: dpx(32), paddingBottom: dpx(16)} : {paddingTop: 14, paddingBottom: 6}), ...pad(12)} as any}>
          {desktop ? null : <IconButton name="back" label="Voltar aos apps" onPress={onBack} />}
          {desktop ? <View style={{flex: 1}}><Text style={{fontSize: 28, fontWeight: '600', letterSpacing: -1, color: c.text}}>E-mails</Text><Text style={{color: c.muted, fontSize: 14, marginTop: 4}}>{accounts === null ? ' ' : !accounts.length ? 'Conecte uma conta para a Sofia ficar de olho nos seus e-mails.' : (() => { const fresh = scoped.filter(h => h.state === 'new'); return fresh.length ? (fresh.length === 1 ? 'Um e-mail novo, de ' : fresh.length + ' e-mails novos; o mais recente é de ') + String(fresh[0].data.from_name || fresh[0].data.from_addr || 'alguém') + '.' : scoped.length ? 'Nada novo. A Sofia continua de olho nas suas regras.' : 'Nenhum e-mail bateu nas suas regras ainda.'; })()}</Text></View> : null}
          <View style={{flex: desktop ? undefined : 1, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap'}}>{desktop ? null : <Text style={{fontSize: 24, fontWeight: '700', color: c.text}}>E-mails</Text>}{accounts?.length ? <Pressable accessibilityRole="button" accessibilityLabel={'Mostrando: ' + selectionLabel(selection, accounts) + '. Trocar'} onPress={() => setPicker(true)} style={({hovered}: any) => ({flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, borderWidth: 1, borderColor: c.line, backgroundColor: hovered ? c.input : 'transparent'})}><Text numberOfLines={1} style={{fontSize: 13, color: c.text}}>{selectionLabel(selection, accounts)}</Text><View style={{transform: [{rotate: '90deg'}]}}><Icon name="chevron" size={12} color={c.muted} /></View></Pressable> : null}</View>
          <IconButton name="refresh" label="Verificar agora" disabled={checking || !accounts?.length} onPress={() => void check()} />
        </View>
        <View style={{paddingHorizontal: 16, paddingBottom: desktop ? 18 : 8, ...pad(16)}}>
          {desktop ? <DeskTabs value={tab} onChange={setTab} options={[{value: 'hits' as Tab, label: 'Encontrados', count: accounts === null ? '' : scoped.length}, {value: 'rules' as Tab, label: 'Regras', count: accounts === null ? '' : scopedRules.length}, {value: 'accounts' as Tab, label: 'Contas', count: accounts === null ? '' : accounts.length}]} />
          : <Chips value={tab} onChange={setTab} options={[{value: 'hits' as Tab, label: 'Encontrados' + (accounts === null ? '' : ' ' + scoped.length)}, {value: 'rules' as Tab, label: 'Regras' + (accounts === null ? '' : ' ' + scopedRules.length)}, {value: 'accounts' as Tab, label: 'Contas' + (accounts === null ? '' : ' ' + accounts.length)}]} />}
        </View>
        <View style={{flex: 1, flexDirection: 'row'}}><View style={{flex: 1, minWidth: 0}}>
        {accounts === null ? <View style={{paddingHorizontal: 16, paddingTop: 8, gap: 6, ...pad(16)}}><LoadingCaption label="Carregando e-mails" /><LoadingLines rows={4} /></View> : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 16, gap: 12, paddingBottom: insets.bottom + 40, ...pad(16)}} refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}>
            {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
            {checking ? <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}><ActivityIndicator color={c.accent} /><Text style={{color: c.muted}}>Lendo as caixas de entrada…</Text></View> : info ? <Text style={{color: c.muted, fontSize: 12}}>{info}</Text> : null}
            {!accounts.length ? (
              <View style={{alignItems: 'center', gap: 12, paddingVertical: 30}}>
                <View style={{width: 84, height: 84, borderRadius: 42, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center'}}><Icon name="mail" size={40} color={c.accent} weight="duotone" /></View>
                <Text style={{fontSize: 20, fontWeight: '700', color: c.text, textAlign: 'center'}}>Deixe a Sofia de olho no seu e-mail</Text>
                <Text style={{fontSize: 14, color: c.muted, textAlign: 'center', lineHeight: 21}}>{tap('Conecte uma ou mais contas e diga o que importa: um nome, um e-mail, um assunto ou uma palavra. Quando chegar, ela avisa no celular e guarda aqui.')}</Text>
                <View style={{alignSelf: 'stretch'}}><Button title="Conectar uma conta" onPress={() => setAddAccount('new')} /></View>
                <Text style={{fontSize: 11, color: c.muted, textAlign: 'center'}}>A Sofia lê só remetente, assunto e um trecho curto dos e-mails novos. Nada é apagado, movido ou respondido.</Text>
              </View>
            ) : tab === 'hits' ? (
              <>
                <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>{onlyImportant ? shown.length + ' importantes de ' + scoped.length + ' encontrados' : scoped.length + (scoped.length === 1 ? ' e-mail encontrado' : ' e-mails encontrados')}{unread ? ' · ' + unread + (unread === 1 ? ' novo' : ' novos') : ''}</Text><Text style={{color: c.text, fontSize: 13, marginRight: 6}}>Só importantes</Text><Switch value={onlyImportant} onValueChange={setOnlyImportant} /></View>
                {!rules.length ? <Pressable onPress={() => setTab('rules')} style={{padding: 14, borderRadius: 16, backgroundColor: c.accentSoft}}><Text style={{color: c.accent, fontWeight: '600'}}>Crie sua primeira regra</Text><Text style={{color: c.text, fontSize: 12}}>Sem regras, a Sofia não sabe o que procurar.</Text></Pressable> : null}
                {shown.length ? <View style={desktop ? {borderWidth: 1, borderColor: c.line, borderRadius: 14, overflow: 'hidden', backgroundColor: c.surface} : {gap: 8}}>{shown.map((h, hi) => (
                  <Pressable key={h.id} testID={'mail-hit-'+h.id} onPress={() => openMail(h)} {...contextMenu(() => [{label: 'Abrir', icon: 'mail', run: () => setOpen(h)}, ...(h.state === 'new' ? [{label: 'Marcar como lido', icon: 'check' as const, run: () => { void api.saveEntity({...h, state: 'read'}).then(load).catch(() => {}); }}] : []), {label: 'Tirar da lista', icon: 'trash', danger: true, run: () => { void api.deleteEntity(h.id).then(load).catch(() => {}); }}])}
                    style={desktop ? ({hovered}: any) => ({flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: hi ? 1 : 0, borderColor: c.line, backgroundColor: open?.id === h.id ? c.accentSoft : hovered ? c.input : 'transparent'}) : {flexDirection: 'row', gap: 12, padding: 12, borderRadius: 16, backgroundColor: h.state === 'new' ? PALETTE.sky+'14' : c.surface, borderWidth: 1, borderColor: c.line}}>
                    {desktop ? <View style={{width: 6, alignItems: 'center', paddingTop: 15, marginLeft: -6}}>{h.state === 'new' ? <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent}} /> : null}</View> : null}
                    <View style={{width: 38, height: 38, borderRadius: 19, backgroundColor: PALETTE.sky+'26', alignItems: 'center', justifyContent: 'center'}}><Text style={{fontWeight: '700', color: PALETTE.sky}}>{String(h.data.from_name || h.data.from_addr || '?').charAt(0).toUpperCase()}</Text></View>
                    <View style={{flex: 1, gap: 2}}>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>{hitEmoji(h, rules) ? <MarkIcon value={hitEmoji(h, rules)} /> : null}<Text numberOfLines={1} style={{flex: 1, color: c.text, fontWeight: h.state === 'new' ? '700' : '500'}}>{h.data.from_name || h.data.from_addr}</Text><Text style={{color: c.muted, fontSize: 10}}>{relativeTime(String(h.data.received_at))}</Text></View>
                      <Text numberOfLines={1} style={{color: c.text, fontSize: 13}}>{h.title}</Text>
                      <Text numberOfLines={desktop ? 1 : 2} style={{color: c.muted, fontSize: 12}}>{h.data.snippet}</Text>
                      <Text style={{color: c.muted, fontSize: 10}}>{String(h.data.rule_names || '').trim() ? 'Regra: ' + h.data.rule_names : 'Regra apagada'}</Text>
                    </View>
                  </Pressable>
                ))}</View> : <Text style={{color: c.muted, textAlign: 'center', paddingVertical: 24}}>Nada encontrado ainda. A Sofia confere a cada 5 minutos.</Text>}
              </>
            ) : tab === 'rules' ? (
              <>
                <Button title="+ Nova regra" onPress={() => setRuleSheet({data: {field: 'from', notify: true, account_id: newRuleAccount}})} />
                {!scopedRules.length ? <View style={{gap: 8}}><Text style={{color: c.muted, fontSize: 12}}>Comece por um modelo:</Text>{TEMPLATES.map(t => <Pressable key={t.title} onPress={() => setRuleSheet({title: t.title, data: {field: t.field, contains: t.contains, notify: true, important: t.important, account_id: newRuleAccount}})} style={{padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}><Text style={{color: c.text, fontWeight: '500'}}>{t.title}</Text><Text style={{color: c.muted, fontSize: 12}}>{t.contains}</Text></Pressable>)}</View> : null}
                {scopedRules.map(r => (
                  <Pressable key={r.id} onPress={() => setRuleSheet(r)} style={{padding: 14, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 4, opacity: r.state === 'paused' ? 0.55 : 1, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>{r.data.important ? <MarkIcon value={String(r.data.emoji || '') || '⭐'} /> : null}<Text style={{flex: 1, color: c.text, fontWeight: '600'}}>{r.title}</Text><Text style={{color: c.muted, fontSize: 11}}>{hits.filter(h => String(h.data.rule_names).includes(r.title)).length} encontrados</Text></View>
                    <Text style={{color: c.muted, fontSize: 12}}>{FIELDS.find(f => f.value === r.data.field)?.label} contém: <Text style={{color: c.text}}>{r.data.contains}</Text></Text>
                    <Text style={{color: c.muted, fontSize: 11}}>{accountName(ruleOwner(r)) || 'Conta removida'} · {r.data.notify === false ? 'sem aviso' : 'avisa no celular'}{r.state === 'paused' ? ' · pausada' : ''}</Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <>
                <Button title="+ Conectar outra conta" onPress={() => setAddAccount('new')} />
                {accounts.map(a => (
                  <Pressable key={a.id} onPress={() => setAddAccount(a)} style={{padding: 14, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: a.data.last_error ? PALETTE.red+'88' : c.line, gap: 4, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
                    <Text style={{color: c.text, fontWeight: '600'}}>{a.data.address}</Text>
                    <Text style={{color: c.muted, fontSize: 12}}>{PROVIDERS.find(p => p.value === a.data.provider)?.label}{a.data.group ? ' · ' + a.data.group : ''} · {a.state === 'paused' ? 'pausada' : a.data.provider === 'gmail_google' ? 'pela Conta Google' : a.data.secret_set ? 'conectada' : 'falta a senha de app'}{a.data.last_check ? ' · lida ' + relativeTime(String(a.data.last_check)) : ''}</Text>
                    {a.data.last_error ? <Text style={{color: c.danger, fontSize: 12}}>{a.data.last_error}</Text> : null}
                  </Pressable>
                ))}
              </>
            )}
          </ScrollView>
        )}
        </View>
        </View>
        <Presence>{addAccount ? <AccountSheet groups={groups} api={api} account={addAccount === 'new' ? null : addAccount} onClose={() => setAddAccount(null)} onDone={() => { setAddAccount(null); void load(); }} /> : null}</Presence>
        <Presence>{ruleSheet ? <RuleSheet api={api} rule={ruleSheet} accounts={accounts || []} onClose={() => setRuleSheet(null)} onDone={(action) => { setRuleSheet(null); void load(); if (rescanAfterRule(action)) void check(14); }} /> : null}</Presence>
        <Presence>{picker && accounts ? <SelectionSheet api={api} accounts={accounts} selection={selection} onSelect={v => { setSelection(v); setPicker(false); }} onClose={() => setPicker(false)} onChanged={() => void load()} /> : null}</Presence>
        {/* 0.3.270: no site o e-mail abre por cima, escurecendo o fundo, como os outros paineis (antes era uma coluna
            presa a direita, longe da lista e desalinhada do cabecalho). Setas trocam de e-mail; X, Esc e voltar fecham. */}
        {desktop ? <Panel visible={!!open} onClose={() => setOpen(null)} width={520} roomy dim="8c" testID="mail-side-panel" title={<View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
          <Text style={{flex: 1, color: c.muted, fontSize: 12}}>{(() => { const cur = open || lastMail.current; const i = cur ? shown.findIndex(h => h.id === cur.id) : -1; return i >= 0 ? 'E-mail ' + (i + 1) + ' de ' + shown.length + ' · use ↑ e ↓ para trocar' : ''; })()}</Text>
          {([['E-mail anterior', -1, '-90deg'], ['Próximo e-mail', 1, '90deg']] as const).map(([lb, dir, rot]) => <Pressable key={lb} accessibilityRole="button" accessibilityLabel={lb} onPress={() => step(dir)} style={({hovered}: any) => ({width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.input : 'transparent'})}><View style={{transform: [{rotate: rot}]}}><Icon name="chevron" size={15} color={c.muted} /></View></Pressable>)}
        </View>}>{open || lastMail.current ? detail((open || lastMail.current)!) : null}</Panel> : null}
        {desktop ? null : <Sheet visible={!!open} onClose={() => setOpen(null)} label="Fechar e-mail">
          {open ? detail(open) : null}
        </Sheet>}
      </View>
    </InternalBackGesture>
  );
}

function AccountSheet({api, account, onClose, onDone, groups = []}: {api: SofiaApi; account: Entity | null; onClose: () => void; onDone: () => void; groups?: string[]}) {
  const c = useTheme();
  const [provider, setProvider] = useState(String(account?.data.provider || 'gmail_google')), [address, setAddress] = useState(String(account?.data.address || ''));
  const [google, setGoogle] = useState<{connected: boolean; gmail: boolean; email: string} | null>(null);
  useEffect(() => { let live = true; void api.calendarStatus().then(s => { if (live) { setGoogle({connected: !!s.connected, gmail: !!s.gmail?.connected, email: String(s.email || '')}); if (!account && s.email) setAddress(a => a || String(s.email)); } }).catch(() => { if (live) setGoogle({connected: false, gmail: false, email: ''}); }); return () => { live = false; }; }, [api, account]);
  const viaGoogle = provider === 'gmail_google';
  // 0.3.257: cada conta pode Entrar com Google com a propria conta (ex.: e-mail da empresa), sem trocar a do Perfil
  const [ownGoogle, setOwnGoogle] = useState<{linked: boolean; email: string} | null>(null);
  useEffect(() => { if (!account) return; let live = true; void api.mailGoogleStatus(account.id).then(s => { if (live) setOwnGoogle(s); }).catch(() => {}); return () => { live = false; }; }, [api, account]);
  const typed = address.trim().toLowerCase(), profileReads = !!google?.gmail && !!typed && String(google?.email || '').toLowerCase() === typed;
  const needsOwnLogin = viaGoogle && google !== null && !!typed && !ownGoogle?.linked && !profileReads;
  const [host, setHost] = useState(String(account?.data.host || '')), [port, setPort] = useState(account?.data.port ? String(account.data.port) : '993');
  const [group, setGroup] = useState(String(account?.data.group || '')), [groupDraft, setGroupDraft] = useState('');
  const [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [ok, setOk] = useState('');
  const p = PROVIDERS.find(x => x.value === provider)!;
  async function connect() {
    setBusy(true); setError(''); setOk('');
    try {
      const data = {provider, address: address.trim().toLowerCase(), host: provider === 'imap' ? host.trim() : '', port: provider === 'imap' ? Number(port) || 993 : '', group: group.trim()};
      // 0.3.146: base_data deixa o servidor aceitar o salvamento quando so a verificacao automatica
      // mudou a conta enquanto o formulario estava aberto (antes: "mudou em outra aba").
      const saved = account ? await api.saveEntity({...account, title: data.address, data: {...account.data, ...data}, base_data: account.data, base_title: account.title} as any) : await api.saveEntity({kind: 'mail_account', title: data.address, content: '', area: 'Pessoal', state: 'active', privacy: 'private', tags: [], data});
      if (viaGoogle && (ownGoogle?.linked || needsOwnLogin)) {
        if (needsOwnLogin) {
          const r = await api.mailGoogleConnect(saved.id, Platform.OS !== 'web'), url = new URL(r.url);
          if (url.protocol !== 'https:') throw Error('Endereço de autorização inválido.');
          if (Platform.OS === 'web') { await Linking.openURL(url.toString()); setOk('Entre com ' + typed + ' na janela do Google. Depois volte aqui e toque em Salvar e testar.'); return; }
          const session = await WebBrowser.openAuthSessionAsync(url.toString(), 'sofiaapp://google');
          if (session.type !== 'success') { setError('O login no Google foi fechado antes de terminar. Nada foi conectado.'); return; }
          const back = new URL(session.url.replace('sofiaapp://', 'https://x/'));
          if (back.searchParams.get('ok') !== '1') { setError(back.searchParams.get('message') || 'O Google não concluiu a conexão.'); return; }
          setOwnGoogle({linked: true, email: typed});
        }
        const r = await api.mailCheck(saved.id);
        if (r.errors.length) { setError('Conta salva, mas o teste falhou: ' + r.errors[0].error); return; }
        setOk('Conectado com o Google de ' + typed + '! ' + (r.scanned ? r.scanned + ' e-mails dos últimos 2 dias conferidos.' : 'A Sofia passa a ler os e-mails novos.')); setTimeout(onDone, 1400); return;
      }
      if (viaGoogle) {
        if (!google?.connected || !google.gmail) { setError(!google?.connected ? 'Conecte primeiro a Conta Google em Perfil → Conta Google. Depois volte aqui.' : 'Em Perfil → Conta Google, desconecte e conecte de novo para liberar o Gmail. Depois volte aqui.'); return; }
        // "Salvar e testar" mostra o resultado real do teste (antes: dizia "Conectado" mesmo com erro na conta).
        const r = await api.mailCheck(saved.id);
        if (r.errors.length) { setError('Conta salva como Conta Google, mas o teste falhou: ' + r.errors[0].error); return; }
        setOk('Conectado pela Conta Google! ' + (r.scanned ? r.scanned + ' e-mails dos últimos 2 dias conferidos.' : 'A Sofia passa a ler os e-mails novos.')); setTimeout(onDone, 1400); return;
      }
      if (password.trim()) {
        const r = await api.mailSecret(saved.id, password.replace(/\s+/g, provider === 'gmail' ? '' : ' ').trim());
        setOk('Conectado! Caixa de entrada com ' + r.messages + ' mensagens. A Sofia passa a ler só as novas.');
        setPassword(''); setTimeout(onDone, 1200);
      } else if (!account?.data.secret_set) setError('Conta salva. Falta colar a senha de app para conectar.');
      else onDone();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <Sheet visible onClose={onClose} label="Fechar conta de e-mail">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{gap: 12}} keyboardShouldPersistTaps="handled">
          <Text style={{fontSize: 18, fontWeight: '700', color: c.text}}>{account ? 'Conta de e-mail' : 'Conectar e-mail'}</Text>
          <Chips value={provider} onChange={setProvider} options={PROVIDERS.map(x => ({value: x.value, label: x.label}))} />
          <Field label="Seu e-mail" value={address} onChange={setAddress} placeholder="voce@gmail.com" email />
          <Text style={{fontSize: 12, color: c.muted}}>Grupo (opcional)</Text>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
            {['', ...new Set([...groups, group].filter(Boolean))].map(g => <Pressable key={g || 'nenhum'} accessibilityRole="button" accessibilityState={{selected: group === g}} onPress={() => setGroup(g)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: group === g ? c.accent : c.line, backgroundColor: group === g ? c.accentSoft : 'transparent'}}><Text style={{color: group === g ? c.accent : c.text, fontSize: 13}}>{g || 'Sem grupo'}</Text></Pressable>)}
          </View>
          <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}><View style={{flex: 1}}><Field label="Novo grupo" value={groupDraft} onChange={setGroupDraft} placeholder="Ex.: Profissional, Minha loja" /></View><IconButton name="plus" label="Criar grupo" disabled={!groupDraft.trim()} onPress={() => { setGroup(groupDraft.trim().slice(0, 60)); setGroupDraft(''); }} /></View>
          {viaGoogle ? null : provider === 'imap' ? <View style={{flexDirection: 'row', gap: 10}}><View style={{flex: 3}}><Field label="Servidor IMAP" value={host} onChange={setHost} placeholder="imap.seudominio.com" /></View><View style={{flex: 1}}><Field label="Porta" value={port} onChange={setPort} /></View></View> : null}
          <View style={{padding: 12, borderRadius: 14, backgroundColor: c.accentSoft, gap: 6}}>
            <Text style={{color: c.text, fontSize: 13, lineHeight: 19}}>{p.help}</Text>
            {p.link ? <Pressable onPress={() => void Linking.openURL(p.link!)}><Text style={{color: c.accent, fontWeight: '600'}}>Abrir página da senha de app</Text></Pressable> : null}
          </View>
          {/* 0.3.248: este modo le SO a caixa da Conta Google conectada no Perfil - avisa se o e-mail digitado for outro */}
          {viaGoogle && ownGoogle?.linked ? (
            <View testID="mail-own-google" style={{padding: 12, borderRadius: 12, backgroundColor: PALETTE.green+'1a', gap: 6}}>
              <Text style={{color: PALETTE.green, fontWeight: '700'}}>✓ Entrou com o Google de {ownGoogle.email || typed}</Text>
              <Text style={{color: c.text, fontSize: 13, lineHeight: 19}}>A Sofia lê esta caixa com o login dela. A Conta Google do Perfil continua a mesma (Agenda e Drive).</Text>
              <Pressable accessibilityRole="button" onPress={() => appAlert('Sair desta Conta Google?', 'A Sofia para de ler esta caixa. Os e-mails já encontrados ficam.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Sair', style: 'destructive', onPress: () => { if (account) void api.mailGoogleDisconnect(account.id).then(() => setOwnGoogle({linked: false, email: ''})).catch(e => setError(errorText(e))); }}])}><Text style={{color: c.danger, fontWeight: '600'}}>Sair desta Conta Google</Text></Pressable>
            </View>
          ) : needsOwnLogin ? (
            <View testID="mail-needs-google" style={{padding: 12, borderRadius: 12, backgroundColor: c.accentSoft, gap: 4}}>
              <Text style={{color: c.text, fontWeight: '700'}}>Entre com o Google de {typed}</Text>
              <Text style={{color: c.text, fontSize: 13, lineHeight: 19}}>Toque no botão abaixo e escolha {typed} na janela do Google. A Conta Google do Perfil{google?.email ? ' (' + google.email + ')' : ''} continua a mesma, para Agenda e Drive.</Text>
            </View>
          ) : viaGoogle ? (
            <Text style={{fontSize: 13, color: google?.gmail ? c.good : c.muted}}>{google === null ? 'Conferindo a Conta Google…' : google.gmail ? '✓ Conta Google conectada com acesso ao Gmail' + (google.email ? ' (' + google.email + ')' : '') + '.' : google.connected ? 'A Conta Google está conectada, mas sem o Gmail. Em Perfil → Conta Google, desconecte e conecte de novo.' : 'Conecte a Conta Google em Perfil → Conta Google (a mesma da Agenda e do Drive).'}</Text>
          ) : <Field label={account?.data.secret_set ? 'Nova senha de app (deixe vazio para manter)' : 'Senha de app'} value={password} onChange={setPassword} placeholder="xxxx xxxx xxxx xxxx" secure />}
          {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
          {ok ? <Text style={{color: PALETTE.green, fontWeight: '500'}}>{ok}</Text> : null}
          <Button title={needsOwnLogin ? 'Entrar com Google' : account ? 'Salvar e testar' : 'Conectar e testar'} loading={busy} disabled={!address.includes('@')} onPress={() => void connect()} />
          {account ? (
            <View style={{gap: 4}}>
              <Pressable onPress={async () => { try { await api.saveEntity({...account, state: account.state === 'paused' ? 'active' : 'paused'}); onDone(); } catch (e) { setError(errorText(e)); } }} style={{paddingVertical: 10}}><Text style={{color: c.text}}>{account.state === 'paused' ? 'Voltar a vigiar esta conta' : 'Pausar esta conta'}</Text></Pressable>
              <Pressable onPress={() => appAlert('Desconectar?', 'A senha de app é apagada do servidor. Os e-mails já encontrados ficam.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Desconectar', style: 'destructive', onPress: async () => { try { await api.mailForget(account.id); await api.deleteEntity(account.id); onDone(); } catch (e) { setError(errorText(e)); } }}])} style={{paddingVertical: 10}}><Text style={{color: c.danger}}>Desconectar e remover</Text></Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

function RuleSheet({api, rule, accounts, onClose, onDone}: {api: SofiaApi; rule: Entity | Partial<Entity>; accounts: Entity[]; onClose: () => void; onDone: (action: RuleAction) => void}) {
  const c = useTheme(), existing = (rule as Entity).id ? rule as Entity : null, d = rule.data || {};
  const [deleting, setDeleting] = useState(false);
  const [title, setTitle] = useState(rule.title || ''), [field, setField] = useState(String(d.field || 'from')), [contains, setContains] = useState(String(d.contains || ''));
  const [accountId, setAccountId] = useState(String(d.account_id || [...accounts].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))[0]?.id || '')), [notify, setNotify] = useState(d.notify !== false), [important, setImportant] = useState(!!d.important), [emoji, setEmoji] = useState(String(d.emoji || '⭐'));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const hint = field === 'from' ? 'Ex.: ana@empresa.com, Banco Itaú, @receita.fazenda' : field === 'subject' ? 'Ex.: contrato, aprovado, entrevista' : 'Ex.: nota fiscal, ingresso';
  async function save() {
    if (!contains.trim()) { setError('Diga o que procurar.'); return; }
    setBusy(true); setError('');
    const data = {field, contains: contains.trim(), account_id: accountId || accounts[0]?.id || '', notify, important, emoji: important ? emoji : ''};
    const name = title.trim() || contains.split(',')[0].trim().slice(0, 60);
    try { if (existing) await api.saveEntity({...existing, title: name, data: {...existing.data, ...data}}); else await api.saveEntity({kind: 'mail_rule', title: name, content: '', area: 'Pessoal', state: 'active', privacy: 'private', tags: [], data}); onDone('save'); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <Sheet visible onClose={onClose} label="Fechar regra">
      <ScrollView contentContainerStyle={{gap: 12}} keyboardShouldPersistTaps="handled">
        <Text style={{fontSize: 18, fontWeight: '700', color: c.text}}>{existing ? 'Editar regra' : 'Nova regra'}</Text>
        <Text style={{fontSize: 12, color: c.muted}}>Procurar em</Text>
        <Chips value={field} onChange={setField} options={FIELDS} />
        <Field label="Contém (separe opções por vírgula)" value={contains} onChange={setContains} placeholder={hint} />
        <Field label="Nome da regra (opcional)" value={title} onChange={setTitle} placeholder="Ex.: Mensagens da Ana" />
        {accounts.length > 1 ? <><Text style={{fontSize: 12, color: c.muted}}>Em qual conta</Text><Chips value={accountId} onChange={setAccountId} options={accounts.map(a => ({value: a.id, label: String(a.data.address)}))} /></> : null}
        <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text}}>{tap('Avisar no celular')}</Text><Switch value={notify} onValueChange={setNotify} /></View>
        <View style={{flexDirection: 'row', alignItems: 'center'}}><View style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8}}><Text style={{color: c.text}}>Marcar como importante</Text><MarkIcon value={important ? emoji : '⭐'} /></View><Switch value={important} onValueChange={setImportant} /></View>
        {important ? <View style={{gap: 6}}>
          <Text style={{color: c.muted, fontSize: 12}}>Marcação dos e-mails desta regra</Text>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{HIT_EMOJIS.map(e => <Pressable key={e} accessibilityRole="button" accessibilityLabel={'Marcar como ' + (MARKS[e]?.label || e)} accessibilityState={{selected: emoji === e}} onPress={() => setEmoji(e)}
            style={{width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: emoji === e ? c.accent + '33' : c.input, borderWidth: emoji === e ? 2 : 0, borderColor: c.accent}}><MarkIcon value={e} size={19} /></Pressable>)}</View>
        </View> : null}
        {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
        <Button title="Salvar regra" loading={busy} onPress={() => void save()} />
        {existing ? (
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
            <Pressable onPress={async () => { const resuming = existing.state === 'paused'; await api.saveEntity({...existing, state: resuming ? 'active' : 'paused'}).catch(() => {}); onDone(resuming ? 'resume' : 'pause'); }} style={{padding: 10}}><Text style={{color: c.text}}>{existing.state === 'paused' ? 'Reativar' : 'Pausar'}</Text></Pressable>
            {/* 0.3.235: mostra que esta apagando e, se falhar, o motivo (antes o erro era engolido e parecia carregar para sempre) */}
            <Pressable disabled={deleting} onPress={async () => { setDeleting(true); setError(''); try { await api.deleteEntity(existing.id); onDone('delete'); } catch (e) { setError(errorText(e)); } finally { setDeleting(false); } }} style={{padding: 10}}><Text style={{color: c.danger}}>{deleting ? 'Apagando…' : 'Apagar regra'}</Text></Pressable>
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

/** E-mail de cobrança → conta a pagar no Finanças, com valor e vencimento já lidos. A pessoa confere antes. */
function BillFromMail({api, hit, onDone}: {api: SofiaApi; hit: Entity; onDone: () => void}) {
  const c = useTheme(), guess = parseBill(hit.title + ' ' + hit.data.snippet);
  const [open, setOpen] = useState(false), [amount, setAmount] = useState(guess.amount ? String(guess.amount).replace('.', ',') : ''), [due, setDue] = useState(guess.due || todayISO());
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  async function create() {
    const v = parseMoney(amount);
    if (!v || v <= 0) { setMsg('Digite o valor.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) { setMsg('Escolha a data de vencimento.'); return; }
    setBusy(true); setMsg('');
    try {
      const accounts = (await api.entities('fin_account')).items.map(toAccount).filter(a => !a.archived);
      if (!accounts.length) { setMsg('Crie primeiro uma conta em Apps → Finanças.'); return; }
      await api.saveEntity({kind: 'fin_tx', title: String(hit.title).slice(0, 200), content: 'Criado a partir do e-mail de ' + (hit.data.from_name || hit.data.from_addr), area: 'Pessoal', state: 'active', privacy: 'private', tags: [],
        data: {kind: 'expense', amount: v, date: due, category: 'Contas', account_id: accounts[0].id, paid: false, recurrence: 'none'}});
      setMsg('Conta a pagar criada em Finanças: ' + money(v) + ' para ' + due.split('-').reverse().join('/') + '.'); setTimeout(onDone, 1400);
    } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  }
  if (!open) return <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8}}><Icon name="receipt" size={18} color={c.accent} /><Text style={{color: c.accent, fontWeight: '600'}}>Lançar como conta a pagar{guess.amount ? ' · ' + money(guess.amount) : ''}</Text></Pressable>;
  return (
    <View style={{gap: 10, padding: 12, borderRadius: 14, backgroundColor: c.accentSoft}}>
      <Text style={{color: c.text, fontWeight: '600'}}>Conta a pagar</Text>
      <Field label="Valor (R$)" value={amount} onChange={setAmount} placeholder="0,00" />
      <DateTimeField label="Vencimento" value={due} onChange={v => setDue(v || due)} dateOnly allowClear={false} />
      {msg ? <Text style={{color: msg.startsWith('Conta a pagar criada') ? c.good : c.danger}}>{msg}</Text> : null}
      <Button title="Criar em Finanças" loading={busy} onPress={() => void create()} />
    </View>
  );
}
