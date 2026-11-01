import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {PALETTE} from '../../lib/palette';
import {rightClick} from '../../lib/web-page';
import {tap,useColumnPad} from '../../lib/desktop';
import {ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {useTheme} from '../../lib/theme';
import type {SofiaApi} from '../../lib/api';
import type {Entity} from '../../lib/types';
import {errorText} from '../../lib/chat-model';
import {useRenderCost} from '../../lib/render-cost';
import {MotionModal} from '../../components/MotionModal';
import {Sheet} from '../../components/Sheet';
import {InternalBackGesture} from '../../components/InternalBackGesture';
import {EmojiIcon, Icon} from '../../components/Icon';
import {Button, IconButton} from '../../components/UI';
import {PriceChart} from '../../components/PriceChart';
import {Spinner, LoadingLines} from '../../components/Loading';
import {readPrice, readLinks, USER_AGENT, DESKTOP_AGENT} from '../../lib/price-reader';
import {readStorePrice, identityOf, storedMLIdentity, isMercadoLivreUrl} from '../../lib/price-direct';
import type {MercadoLivreReading} from '../../lib/mercado-livre-types';
import {buildInjectedScript, parsePriceMessage} from '../../lib/price-extractor';
import type {StoreLink} from '../../lib/price-extractor';
import {fallbackSearchUrl} from '../../lib/price-extractor';
import {collectorState, onCollector, runCollection, cancelCollection, loadProducts, recordPrice, clearIssue, issueKey} from '../../lib/monitor-collector';
import type {StoreIssue} from '../../lib/monitor-collector';
import {
  PRODUCT_COLORS, WINDOWS, DROP_CHOICES, INTERVALS, money, percent, since, storeName, hostOf, nextColor,
  alertsOf, alertSummary, analyzeProduct, allReadings, searchTerms, extractProductUrl, replaceSource, readerUrl, readerAgent, searchTargetsFor, addSource, removeSource, makePrimary, withMemory, storesOf,
} from '../../lib/monitoring';
import type {ProductSeries, Window, Candidate, StoreSeries} from '../../lib/monitoring';
import {appAlert} from '../../lib/app-alert';
// 0.3.263: parte de Monitoring (ver src/screens/Monitoring.tsx).
import {GOOD, BAD, originLabel} from './core';
export function Tag({text, color, subtle = false}: {text: string; color: string; subtle?: boolean}) {
  return (
    <View style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: subtle ? 'transparent' : color + '22', borderWidth: subtle ? 1 : 0, borderColor: color + '55'}}>
      <Text numberOfLines={1} style={{fontSize: 11, fontWeight: subtle ? '400' : '700', color}}>{text}</Text>
    </View>
  );
}

export function Header({title, onClose, right}: {title: string; onClose: () => void; right?: React.ReactNode}) {
  const c = useTheme(), insets = useSafeAreaInsets();
  return (
    <View style={{paddingTop: insets.top + 8, paddingBottom: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: c.line}}>
      <IconButton name="back" label="Voltar" onPress={onClose} />
      <Text numberOfLines={1} style={{flex: 1, fontSize: 18, fontWeight: '600', color: c.text}}>{title}</Text>
      {right}
    </View>
  );
}

// ======================= ADICIONAR PRODUTO =======================
export function AddProduct({api, used, existing, onClose, onCreated}: {api: SofiaApi; used: string[]; existing: ProductSeries[]; onClose: () => void; onCreated: (id: string) => void}) {
  const c = useTheme();
  const [url, setUrl] = useState(''), [step, setStep] = useState<'link' | 'reading' | 'review'>('link'), [error, setError] = useState('');
  const [title, setTitle] = useState(''), [candidates, setCandidates] = useState<Candidate[]>([]), [picked, setPicked] = useState<Candidate | null>(null);
  const [color] = useState(nextColor(used)), [busy, setBusy] = useState(false);
  const [mlReading, setMlReading] = useState<MercadoLivreReading | undefined>();
  const readController = React.useRef<AbortController | null>(null);
  useEffect(() => () => readController.current?.abort(), []);


  async function paste() { const t = (await Clipboard.getStringAsync().catch(() => '')).trim(); const u = extractProductUrl(t); if (u) setUrl(u); else if (t) setError('Não achei um link no que foi copiado.'); }
  async function read() {
    const clean = extractProductUrl(url);
    if (!clean) { setError('Não achei um link aí. Cole o link do produto (pode ser o texto inteiro do compartilhar).'); return; }
    if (existing.some(p => storesOf(p.monitor).some(s => s.url === clean))) { setError('Você já acompanha esse link.'); return; }
    setUrl(clean); setError(''); setStep('reading');
    // Leitor direto da loja primeiro (sem abrir página), igual à coleta automática.
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller; setMlReading(undefined);
    const r = await readStorePrice(clean, api, readPrice, {allowCatalogWinner: true, signal: controller.signal});
    if (controller.signal.aborted) return;
    if (!r.ok) { setError(r.error + ' Você ainda pode acompanhar: a Sofia tenta ler de novo depois.'); setTitle(''); setCandidates([]); setPicked(null); setStep('review'); return; }
    if (r.mercadoLivre) {
      const reading = r.mercadoLivre;
      if (existing.some(p => storesOf(p.monitor).some(s => storedMLIdentity(p.monitor.data.source_identities, s.url)?.identityKey === reading.identityKey))) {setError('Você já acompanha esse anúncio.'); setStep('link'); return;}
      setMlReading(reading); setUrl(reading.normalizedUrl);
    }
    setTitle(r.title.replace(/\s*[|–-]\s*(KaBuM!?|Mercado Livre|Pichau|Amazon\.com\.br|Magalu|AliExpress|Shopee).*$/i, '').trim());
    setCandidates(r.result.candidates);
    setPicked(r.result.best && !r.result.needsConfirmation ? r.result.best : null);
    setStep('review');
  }
  async function save() {
    const name = title.trim() || storeName(url) + ' · produto';
    setBusy(true); setError('');
    try {
      const saved = await api.saveEntity({kind: 'monitor', title: name.slice(0, 200), content: '', area: 'Pessoal', state: 'active', privacy: 'private', tags: [],
        data: {method: 'product', variant: name.slice(0, 200), preferred_url: url, source_urls: '', discover: false, currency: 'BRL', interval_minutes: 360, new_low: true, line_color: color,
          ...(picked ? {reader_memory: JSON.stringify({[url]: picked.origins.slice(0, 4)})} : {}), ...(mlReading ? {source_identities: JSON.stringify({[url]: identityOf(mlReading)})} : {})}});
      if (picked) await recordPrice(api, saved, url, picked.amount, '', [], '', mlReading).catch(() => undefined);
      onCreated(saved.id);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <MotionModal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex: 1, backgroundColor: c.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title="Novo produto" onClose={onClose} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 22, gap: 18}}>
          {step === 'link' ? (
            <>
              <Text style={{fontSize: 24, fontWeight: '700', color: c.text}}>Qual produto?</Text>
              <Text style={{fontSize: 14, color: c.muted, lineHeight: 20}}>{tap('Abra o produto no app ou site da loja, toque em compartilhar → copiar link, e cole aqui. Só isso.')}</Text>
              <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
                <TextInput accessibilityLabel="Link do produto" value={url} onChangeText={setUrl} placeholder="https://…" placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url"
                  onSubmitEditing={() => void read()} style={{flex: 1, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 14, color: c.text, backgroundColor: c.input, fontSize: 16}} />
                <Pressable accessibilityRole="button" accessibilityLabel="Colar link" onPress={() => void paste()} style={{paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, backgroundColor: c.accentSoft}}>
                  <Text style={{color: c.accent, fontWeight: '600'}}>Colar</Text>
                </Pressable>
              </View>
              {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
              <Button title="Ler produto" disabled={!url.trim()} onPress={() => void read()} />
              <Text style={{fontSize: 12, color: c.muted, lineHeight: 18}}>Mercado Livre é consultado no servidor, sem abrir a loja. Outras lojas usam o leitor interno. A loja pode recusar a consulta; nesse caso nenhum preço é inventado.</Text>
            </>
          ) : step === 'reading' ? (
            <View style={{alignItems: 'center', gap: 14, paddingVertical: 60}}>
              <ActivityIndicator size="large" color={c.accent} />
              <Text style={{color: c.text, fontSize: 16}}>Lendo a página da {storeName(url)}…</Text>
              <Text style={{color: c.muted, fontSize: 12}}>Pode levar alguns segundos.</Text>
            </View>
          ) : (
            <>
              <View style={{backgroundColor: c.surface, borderRadius: 22, borderWidth: 2, borderColor: color, padding: 18, gap: 10}}>
                <Text style={{fontSize: 13, fontWeight: '600', color}}>{storeName(url)}</Text>
                <TextInput accessibilityLabel="Nome do produto" value={title} onChangeText={setTitle} placeholder="Nome do produto" placeholderTextColor={c.muted} multiline
                  style={{fontSize: 18, fontWeight: '600', color: c.text, padding: 0}} />
                <Text style={{fontSize: 32, fontWeight: '700', color: c.text}}>{picked ? money(picked.amount) : '—'}</Text>
                {mlReading ? <Text style={{fontSize: 13, color: c.muted}}>Vendedor: {mlReading.seller.name} · {mlReading.itemId}. Preço do produto, sem frete. Ao salvar, você confirma esta oferta.</Text> : null}
                {!picked && candidates.length ? <Text style={{fontSize: 13, color: PALETTE.amberDeep}}>{tap('A página mostra mais de um valor. Toque no preço certo:')}</Text> : null}
                {!picked && !candidates.length ? <Text style={{fontSize: 13, color: c.muted}}>Preço não encontrado agora. A Sofia tenta de novo nas próximas leituras.</Text> : null}
                {candidates.length > 1 || (!picked && candidates.length) ? (
                  <View style={{gap: 8}}>
                    {candidates.map((cand, i) => (
                      <Pressable key={i} accessibilityRole="radio" accessibilityState={{checked: picked === cand}} onPress={() => setPicked(cand)}
                        style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: picked === cand ? color : c.line, backgroundColor: picked === cand ? color + '18' : 'transparent'}}>
                        <Text style={{fontWeight: '600', color: c.text, fontSize: 16}}>{money(cand.amount, cand.currency || 'BRL')}</Text>
                        <Text style={{flex: 1, fontSize: 11, color: c.muted}} numberOfLines={2}>{originLabel(cand.origins)}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={{flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.accentSoft, padding: 12, borderRadius: 14}}>
                <Icon name="bell" size={18} color={c.accent} />
                <Text style={{flex: 1, fontSize: 13, color: c.text, lineHeight: 19}}>Vou te avisar quando ele bater o menor preço já visto. Dá pra ajustar os avisos e buscar outras lojas logo depois.</Text>
              </View>
              {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
              <Button title="Começar a acompanhar" loading={busy} disabled={!candidates.length ? false : !picked} onPress={() => void save()} />
              <Pressable onPress={() => { setStep('link'); setError(''); }} style={{alignSelf: 'center', padding: 8}}><Text style={{color: c.accent}}>Trocar o link</Text></Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </MotionModal>
  );
}

export function ColorRow({value, onChange}: {value: string; onChange: (c: string) => void}) {
  const c = useTheme();
  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 12}}>
      {PRODUCT_COLORS.map(color => (
        <Pressable key={color} accessibilityRole="radio" accessibilityState={{checked: value === color}} accessibilityLabel={'Cor ' + color} onPress={() => onChange(color)}
          style={{width: 34, height: 34, borderRadius: 17, backgroundColor: color, borderWidth: value === color ? 3 : 0, borderColor: c.text}} />
      ))}
    </View>
  );
}

// ======================= DETALHE DO PRODUTO =======================
export type DetailTab = 'summary' | 'stores' | 'history' | 'settings';
export const VERDICT_COLOR: Record<string, string> = {great: GOOD, good: GOOD, normal: PALETTE.blue, high: BAD, unknown: PALETTE.slate};
export const VERDICT_ICON: Record<string, string> = {great: '🏆', good: '👍', normal: '〰️', high: '⏳', unknown: '🔎'};
export const dateShort = (t: number) => new Date(t).toLocaleDateString('pt-BR', {day: '2-digit', month: 'short'}).replace('.', '');
export const dateTime = (t: number) => new Date(t).toLocaleString('pt-BR', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'}).replace('.', '');
