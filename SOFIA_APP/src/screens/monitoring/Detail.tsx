import {Presence} from '../../components/Presence';
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
import {GOOD, BAD, originLabel, storeColor, Delta, Chips} from './core';
import {Tag, Header, ColorRow, DetailTab, VERDICT_COLOR, VERDICT_ICON, dateShort, dateTime} from './Add';
import {AddStores, PageViewer} from './Stores';
export function ProductDetail({api, product, issues, running, onClose, onChanged, onDeleted, others = [], visible = true}:
  {api: SofiaApi; product: ProductSeries; issues: Record<string, StoreIssue>; running: boolean; onClose: () => void; onChanged: () => Promise<void>; onDeleted: () => void; others?: Entity[]; visible?: boolean}) {
  const c = useTheme();
  const [monitor, setMonitor] = useState<Entity>(product.monitor), [win, setWin] = useState<Window>('30d'), [tab, setTab] = useState<DetailTab>('summary');
  const [saving, setSaving] = useState(''), [error, setError] = useState(''), [storeSheet, setStoreSheet] = useState(false);
  const [confirm, setConfirm] = useState<{store: StoreSeries; issue: Extract<StoreIssue, {kind: 'confirm'}>} | null>(null);
  const [menu, setMenu] = useState<StoreSeries | null>(null), [rename, setRename] = useState(product.monitor.title), [target, setTarget] = useState('');
  const [relink, setRelink] = useState<{store: StoreSeries; text: string; error: string} | null>(null), [productMenu, setProductMenu] = useState(false);
  const [viewer, setViewer] = useState<StoreSeries | null>(null);
  const [showAll, setShowAll] = useState(false), [storeFocus, setStoreFocus] = useState<string | null>(null), [showOthers, setShowOthers] = useState(false), [moving, setMoving] = useState<StoreSeries | null>(null);
  useEffect(() => { setMonitor(product.monitor); }, [product.monitor]);
  const alerts = alertsOf(monitor);
  useEffect(() => { setTarget(alerts.target ? String(alerts.target).replace('.', ',') : ''); }, [monitor.id]); // eslint-disable-line
  const a = useMemo(() => analyzeProduct(product, win), [product, win]);
  const readings = useMemo(() => allReadings(product), [product]);

  const patch = useCallback(async (data: Record<string, any>, extra: Partial<Entity> = {}, label = 'Salvo') => {
    if ((extra.state && extra.state !== 'active') || data.preferred_url !== undefined || data.source_urls !== undefined) cancelCollection(api, monitor.id);
    setSaving('Salvando…'); setError('');
    try {
      const saved = await api.saveEntity({...monitor, ...extra, data: {...monitor.data, ...data}});
      setMonitor(saved); setSaving(label); await onChanged(); setTimeout(() => setSaving(''), 1400);
      return saved;
    } catch (e) { setError(errorText(e)); setSaving(''); return null; }
  }, [api, monitor, onChanged]);

  const stores = [...product.stores].sort((x, y) => (x.last ? x.last.total : Infinity) - (y.last ? y.last.total : Infinity));
  const bestPrice = product.now?.price ?? null;
  const paused = monitor.state === 'paused';
  const readNow = () => void runCollection(api, {force: true, only: monitor.id, scope: api.owner});
  const statsOf = (url: string) => a.stores.find(s => s.url === url);
  const colorOfStore = (s: StoreSeries) => storeColor(s, product.stores.indexOf(s), product);
  const vc = VERDICT_COLOR[a.verdict.kind];

  function remove() {
    appAlert('Parar de acompanhar?', `“${monitor.title}” e todo o histórico de preços serão apagados.`, [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Apagar', style: 'destructive', onPress: () => { cancelCollection(api, monitor.id); api.deleteEntity(monitor.id).then(onDeleted).catch(e => setError(errorText(e))); }},
    ]);
  }
  // Comprou: vira despesa no Finanças (valor e loja do melhor preço) e o acompanhamento pausa.
  async function bought() {
    if (!product.now) return;
    appAlert('Comprou?', `Lançar ${money(product.now.price, product.currency)} na ${product.now.store.name} como despesa em Finanças e pausar este acompanhamento?`, [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Lançar', onPress: async () => {
        try {
          const accounts = (await api.entities('fin_account')).items.filter(a => a.state !== 'archived');
          if (!accounts.length) { setError('Crie primeiro uma conta em Apps → Finanças.'); return; }
          const d = new Date(), today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          await api.saveEntity({kind: 'fin_tx', title: monitor.title.slice(0, 200), content: 'Comprado na ' + product.now!.store.name + ' (Monitoramento)', area: 'Pessoal', state: 'active', privacy: 'private', tags: [],
            data: {kind: 'expense', amount: product.now!.price, date: today, category: 'Compras', account_id: accounts[0].id, paid: true, recurrence: 'none'}});
          await patch({}, {state: 'paused'}, 'Lançado em Finanças e pausado');
        } catch (e) { setError(errorText(e)); }
      }},
    ]);
  }
  async function saveTarget(text: string) {
    const v = Number(text.replace(/\./g, '').replace(',', '.'));
    if (!text.trim()) { await patch({target_price: ''}); return; }
    if (!Number.isFinite(v) || v <= 0) { setError('Digite um valor em reais, por exemplo 2.300'); return; }
    await patch({target_price: Math.round(v * 100) / 100});
  }

  const storeRow = (s: StoreSeries, i: number, expanded: boolean) => {
    const iss = issues[issueKey(monitor.id, s.url)], sc = colorOfStore(s), st = statsOf(s.url);
    const diff = s.last && bestPrice !== null ? s.last.total - bestPrice : null;
    const open = expanded && storeFocus === s.url;
    return (
      <View key={s.url} style={{borderTopWidth: i ? 1 : 0, borderColor: c.line}}>
        <Pressable accessibilityRole="button" accessibilityLabel={(expanded ? 'Ver análise de ' : 'Opções de ') + s.name}
          onPress={() => expanded ? setStoreFocus(f => f === s.url ? null : s.url) : setMenu(s)} onLongPress={() => setMenu(s)} {...rightClick(() => setMenu(s))}
          style={{flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12}}>
          <View style={{width: 38, height: 38, borderRadius: 19, backgroundColor: sc + '26', alignItems: 'center', justifyContent: 'center'}}><Text style={{color: sc, fontWeight: '700'}}>{s.name.charAt(0)}</Text></View>
          <View style={{flex: 1, gap: 2}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
              <Text style={{fontSize: 16, fontWeight: '500', color: c.text}}>{s.name}</Text>
              {s.primary ? <Text style={{fontSize: 10, color: c.muted, borderWidth: 1, borderColor: c.line, borderRadius: 6, paddingHorizontal: 4}}>PRINCIPAL</Text> : null}
            </View>
            {iss?.kind === 'confirm' ? <Pressable onPress={() => setConfirm({store: s, issue: iss})}><Text style={{fontSize: 12, color: PALETTE.amberDeep, fontWeight: '500'}}>{tap('Toque para confirmar o preço')}</Text></Pressable>
              : iss?.kind === 'failed' ? <Pressable onPress={() => setViewer(s)}><Text style={{fontSize: 12, color: BAD}} numberOfLines={3}>Não consegui ler: {iss.error}</Text><Text style={{fontSize: 12, color: c.accent, fontWeight: '600'}}>{isMercadoLivreUrl(s.url) ? 'Consultar no servidor →' : 'Ver a página e ler daqui →'}</Text></Pressable>
              : <Text style={{fontSize: 12, color: c.muted}}>{s.last ? 'lido ' + since(s.last.at) : 'ainda não lido'}{st && st.cheapestShare !== null && stores.length > 1 ? ' · mais barata ' + Math.round(st.cheapestShare * 100) + '% do tempo' : ''}</Text>}
          </View>
          <View style={{alignItems: 'flex-end', gap: 3}}>
            <Text style={{fontSize: 16, fontWeight: '600', color: c.text}}>{s.last ? money(s.last.total, product.currency) : '—'}</Text>
            {diff === 0 && stores.filter(x => x.last).length > 1 ? <Tag color={GOOD} text="Melhor preço" /> : diff ? <Text style={{fontSize: 11, color: c.muted}}>+{money(diff, product.currency)}</Text> : null}
          </View>
          <IconButton name="more" label={'Opções de ' + s.name} size={36} onPress={() => setMenu(s)} />
        </Pressable>
        {open && st ? (
          <View style={{gap: 10, paddingBottom: 14}}>
            <PriceChart lines={[{id: s.url, color: sc, points: s.points}]} height={120} window={win} currency={product.currency} refs={st.avg ? [{value: st.avg, color: c.muted}] : []} />
            <View style={{flexDirection: 'row', gap: 8}}>
              <Mini label="Menor" value={st.min !== null ? money(st.min, product.currency) : '—'} />
              <Mini label="Média" value={st.avg !== null ? money(st.avg, product.currency) : '—'} />
              <Mini label="Maior" value={st.max !== null ? money(st.max, product.currency) : '—'} />
            </View>
            <Text style={{fontSize: 12, color: c.muted}}>{st.changes ? `Mudou de preço ${st.changes} ${st.changes === 1 ? 'vez' : 'vezes'} no período · última ${dateShort(st.lastChange!)}` : 'Preço estável no período'} · {st.readings} {st.readings === 1 ? 'leitura' : 'leituras'}</Text>
            <Pressable onPress={() => void Linking.openURL(s.url)} style={{alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: sc}}><Text style={{color: PALETTE.white, fontWeight: '600'}}>Abrir na {s.name}</Text></Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <MotionModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex: 1, backgroundColor: c.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title={monitor.title} onClose={onClose} right={<IconButton name="more" label="Opções do produto" onPress={() => setProductMenu(true)} />} />
        <ScrollView keyboardShouldPersistTaps="handled" stickyHeaderIndices={[1]} contentContainerStyle={{paddingBottom: 50}}>
          {/* Destaque */}
          <View style={{padding: 18, paddingBottom: 10, gap: 6}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: product.color}} />
              <Text style={{fontSize: 12, color: c.muted}}>{product.now ? 'Melhor oferta agora · ' + product.now.store.name : 'Aguardando a primeira leitura'}</Text>
            </View>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
              <Text style={{fontSize: 32, fontWeight: '700', color: c.text}}>{product.now ? money(product.now.price, product.currency) : '—'}</Text>
              <Delta value={product.change} size={13} />
            </View>
            {product.now ? (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(product.now!.store.url)} style={{alignSelf: 'flex-start', marginTop: 4, backgroundColor: product.color, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 99}}>
                <Text style={{color: PALETTE.white, fontWeight: '600'}}>Abrir na {product.now.store.name}</Text>
              </Pressable>
            ) : null}
            {product.now ? <Pressable accessibilityRole="button" onPress={() => void bought()} style={{alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: product.color}}><Text style={{color: product.color, fontWeight: '600'}}>✓ Comprei — lançar em Finanças</Text></Pressable> : null}
          </View>
          <View style={{backgroundColor: c.bg, paddingHorizontal: 18, paddingVertical: 8}}>
            <Chips value={tab} onChange={setTab} options={[{value: 'summary' as DetailTab, label: 'Análise'}, {value: 'stores' as DetailTab, label: 'Lojas ' + product.stores.length}, {value: 'history' as DetailTab, label: 'Histórico'}, {value: 'settings' as DetailTab, label: 'Avisos'}]} />
          </View>

          <View style={{padding: 18, paddingTop: 8, gap: 16}}>
            {tab !== 'settings' ? <View style={{alignSelf: 'flex-start'}}><Chips value={win} onChange={setWin} options={WINDOWS.map(w => ({value: w.value, label: w.label}))} /></View> : null}

            {tab === 'summary' ? (
              <>
                <View style={{borderRadius: 22, padding: 16, gap: 12, backgroundColor: vc + '1c', borderWidth: 1, borderColor: vc + '55'}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                    <EmojiIcon e={VERDICT_ICON[a.verdict.kind]} size={30} color={c.accent} fallback={<Text style={{fontSize: 28}}>{VERDICT_ICON[a.verdict.kind]}</Text>} />
                    <View style={{flex: 1}}><Text style={{fontSize: 18, fontWeight: '700', color: c.text}}>{a.verdict.title}</Text><Text style={{fontSize: 13, color: c.muted, lineHeight: 18}}>{a.verdict.text}</Text></View>
                  </View>
                  {a.min && a.max && a.max.v > a.min.v && bestPrice !== null ? (
                    <View style={{gap: 6}}>
                      <View style={{height: 10, borderRadius: 5, backgroundColor: c.line, overflow: 'visible'}}>
                        <View style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 5, flexDirection: 'row', overflow: 'hidden'}}>
                          <View style={{flex: 1, backgroundColor: GOOD + '88'}} /><View style={{flex: 2, backgroundColor: PALETTE.blue+'55'}} /><View style={{flex: 1, backgroundColor: BAD + '88'}} />
                        </View>
                        {a.avg !== null ? <View style={{position: 'absolute', top: -3, width: 2, height: 16, backgroundColor: c.muted, left: `${Math.min(100, Math.max(0, (a.avg - a.min.v) / (a.max.v - a.min.v) * 100))}%`}} /> : null}
                        <View style={{position: 'absolute', top: -5, width: 20, height: 20, marginLeft: -10, borderRadius: 10, backgroundColor: product.color, borderWidth: 3, borderColor: c.surface, left: `${Math.min(100, Math.max(0, (a.position ?? 0) * 100))}%`}} />
                      </View>
                      <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                        <Text style={{fontSize: 11, color: GOOD, fontWeight: '600'}}>{money(a.min.v, product.currency)}</Text>
                        <Text style={{fontSize: 11, color: c.muted}}>média {a.avg !== null ? money(a.avg, product.currency) : '—'}</Text>
                        <Text style={{fontSize: 11, color: BAD, fontWeight: '600'}}>{money(a.max.v, product.currency)}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>

                <View style={{backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 14, gap: 10, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                    <Text style={{fontWeight: '600', color: c.text}}>Melhor preço ao longo do tempo</Text>
                  </View>
                  <PriceChart lines={[{id: 'best', color: product.color, points: product.best}]} height={200} window={win} currency={product.currency}
                    refs={[...(a.avg !== null ? [{value: a.avg, color: c.muted}] : []), ...(alerts.target ? [{value: alerts.target, color: GOOD}] : [])]} />
                  <View style={{flexDirection: 'row', gap: 14, flexWrap: 'wrap'}}>
                    <Legend color={product.color} text="melhor preço entre as lojas" />
                    {a.avg !== null ? <Legend color={c.muted} text="média do período" dashed /> : null}
                    {alerts.target ? <Legend color={GOOD} text="seu preço-alvo" dashed /> : null}
                  </View>
                </View>

                <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
                  {a.flat && a.min ? (
                    <Stat wide label="Preço no período" value={money(a.min.v, product.currency)} sub={'sem variação desde ' + dateShort(a.min.t)} />
                  ) : (
                    <>
                      <Stat label="Menor do período" value={a.min ? money(a.min.v, product.currency) : '—'} sub={a.min ? dateShort(a.min.t) : ''} color={a.min ? GOOD : undefined} />
                      <Stat label="Maior do período" value={a.max ? money(a.max.v, product.currency) : '—'} sub={a.max ? dateShort(a.max.t) : ''} color={a.max ? BAD : undefined} />
                    </>
                  )}
                  <Stat label="Agora vs média" value={a.vsAvg === null ? '—' : percent(a.vsAvg)} sub={a.avg !== null ? 'média ' + money(a.avg, product.currency) : ''} color={a.vsAvg === null ? undefined : a.vsAvg < 0 ? GOOD : a.vsAvg > 0 ? BAD : undefined} />
                  <Stat label="Mediana" value={a.median !== null ? money(a.median, product.currency) : '—'} sub="metade das leituras abaixo" />
                  <Stat label="Mudanças de preço" value={String(a.changes.length)} sub={a.changes.length ? 'última ' + dateShort(a.changes[0].t) : 'estável'} />
                  <Stat label="Acompanhando" value={Math.max(1, Math.round(a.days)) + (Math.round(a.days) === 1 ? ' dia' : ' dias')} sub={a.readings + ' leituras'} />
                </View>

                {a.saving || a.spread ? (
                  <View style={{backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 16, gap: 10, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
                    <Text style={{fontWeight: '600', color: c.text}}>Quanto vale a pena</Text>
                    {a.spread && a.spread.diff > 0 ? <Insight icon="🏪" text={`Hoje a ${a.spread.cheap} está ${money(a.spread.diff, product.currency)} mais barata que a ${a.spread.expensive}.`} /> : null}
                    {a.saving ? <Insight icon="💰" text={`Comprando agora você paga ${money(a.saving, product.currency)} a menos que no pico do período (${a.max ? dateShort(a.max.t) : ''}).`} /> : null}
                    {product.low && bestPrice !== null && bestPrice > product.low.price ? <Insight icon="📌" text={`Já esteve ${money(bestPrice - product.low.price, product.currency)} mais barato, em ${dateShort(product.low.at)}.`} /> : null}
                  </View>
                ) : null}

                <View style={{backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 16, gap: 4, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                    <Text style={{fontWeight: '600', color: c.text}}>Onde comprar</Text>
                    <Pressable onPress={() => setTab('stores')}><Text style={{color: c.accent, fontSize: 13, fontWeight: '500'}}>Ver lojas</Text></Pressable>
                  </View>
                  {stores.slice(0, 3).map((s, i) => storeRow(s, i, false))}
                </View>
              </>
            ) : tab === 'stores' ? (
              <>
                <View style={{backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 14, gap: 10, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
                  <Text style={{fontWeight: '600', color: c.text}}>Cada loja no tempo</Text>
                  <PriceChart lines={product.stores.map(s => ({id: s.url, color: colorOfStore(s), points: s.points}))} height={190} window={win} currency={product.currency} />
                  <View style={{flexDirection: 'row', gap: 14, flexWrap: 'wrap'}}>{product.stores.map(s => <Legend key={s.url} color={colorOfStore(s)} text={s.name} />)}</View>
                </View>
                <Section title="Lojas" hint={tap("Toque numa loja para ver a análise dela. Segure para mais opções.")}>
                  {/* 0.3.146: a oferta principal (escolhida por voce) e a que aparece no Inicio; as outras
                      ficam recolhidas aqui e continuam sendo acompanhadas normalmente. */}
                  {stores.filter(s => s.primary).map((s, i) => storeRow(s, i, true))}
                  {stores.some(s => !s.primary) ? <Pressable accessibilityRole="button" accessibilityState={{expanded: showOthers}} onPress={() => setShowOthers(v => !v)} style={{paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6}}><Text style={{color: c.accent, fontWeight: '600'}}>{showOthers ? 'Esconder' : 'Ver'} outras ofertas ({stores.filter(s => !s.primary).length})</Text><Text style={{color: c.muted, fontSize: 11}}>· acompanhadas, fora do Início</Text></Pressable> : null}
                  {showOthers ? stores.filter(s => !s.primary).map((s, i) => storeRow(s, i + 1, true)) : null}
                  <Pressable accessibilityRole="button" onPress={() => setStoreSheet(true)}
                    style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: c.accent}}>
                    <Icon name="plus" size={16} color={c.accent} />
                    <Text style={{color: c.accent, fontWeight: '600'}}>Adicionar outra loja</Text>
                  </Pressable>
                </Section>
              </>
            ) : tab === 'history' ? (
              <>
                <Section title="Mudanças de preço" hint="Só aparece quando o valor muda de verdade numa loja.">
                  {a.changes.length ? a.changes.slice(0, showAll ? 200 : 12).map((ch, i) => (
                    <View key={ch.url + ch.t} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderColor: c.line}}>
                      <View style={{width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: (ch.pct < 0 ? GOOD : BAD) + '22'}}><Text style={{color: ch.pct < 0 ? GOOD : BAD, fontWeight: '700'}}>{ch.pct < 0 ? '↓' : '↑'}</Text></View>
                      <View style={{flex: 1}}><Text style={{fontSize: 14, color: c.text}}>{ch.store}: {money(ch.from, product.currency)} → <Text style={{fontWeight: '600'}}>{money(ch.to, product.currency)}</Text></Text><Text style={{fontSize: 11, color: c.muted}}>{dateTime(ch.t)}</Text></View>
                      <Text style={{fontSize: 13, fontWeight: '600', color: ch.pct < 0 ? GOOD : BAD}}>{percent(ch.pct)}</Text>
                    </View>
                  )) : <Text style={{fontSize: 13, color: c.muted}}>Nenhuma mudança neste período.</Text>}
                </Section>
                <Section title="Todas as leituras" hint={readings.length + ' leituras desde o início. Sem leitura, sem ponto: nada é estimado.'}>
                  {readings.slice(0, showAll ? 500 : 15).map((r, i) => (
                    <View key={r.store + r.t + i} style={{flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderColor: c.line}}>
                      <Text style={{fontSize: 12, color: c.muted}}>{dateTime(r.t)} · {r.store}</Text>
                      <Text style={{fontSize: 13, color: c.text, fontWeight: '500'}}>{money(r.v, product.currency)}</Text>
                    </View>
                  ))}
                  {readings.length > 15 || a.changes.length > 12 ? <Pressable onPress={() => setShowAll(v => !v)} style={{paddingTop: 8}}><Text style={{color: c.accent, fontWeight: '500'}}>{showAll ? 'Mostrar menos' : 'Mostrar tudo'}</Text></Pressable> : null}
                </Section>
              </>
            ) : (
              <>
                <Section title="Me avise quando" hint={paused ? 'Produto pausado: nenhum aviso sai enquanto estiver pausado.' : 'Pode ligar um, vários ou todos. O aviso chega no celular na hora em que a Sofia lê o preço.'}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4}}>
                    <View style={{flex: 1}}><Text style={{fontSize: 16, fontWeight: '600', color: c.text}}>Todos os avisos</Text><Text style={{fontSize: 12, color: c.muted}}>{[alerts.newLow, alerts.drop !== null, alerts.target !== null].filter(Boolean).length} de 3 ligados</Text></View>
                    <Switch accessibilityLabel="Ligar todos os avisos" value={alerts.newLow && alerts.drop !== null && alerts.target !== null} onValueChange={v => {
                      if (!v) { setTarget(''); void patch({new_low: false, drop_percent: '', target_price: ''}, {}, 'Avisos desligados'); return; }
                      const t = alerts.target ?? (bestPrice ? Math.round(bestPrice * 0.9) : null);
                      if (t) setTarget(String(t));
                      void patch({new_low: true, drop_percent: alerts.drop ?? 10, ...(t ? {target_price: t} : {})}, {}, t ? 'Todos os avisos ligados' : 'Avisos ligados; o preço-alvo entra após a primeira leitura');
                    }} />
                  </View>
                  <AlertCard icon="🏆" title="Bater o menor preço da história" text={product.low ? 'Hoje o menor já visto é ' + money(product.low.price, product.currency) + '.' : 'Vale a partir da segunda leitura.'}
                    value={alerts.newLow} onChange={v => void patch({new_low: v})} />
                  <AlertCard icon="📉" title="Cair de repente" text="Comparado à leitura anterior da mesma loja." value={alerts.drop !== null} onChange={v => void patch({drop_percent: v ? 10 : ''})}>
                    {alerts.drop !== null ? <DropSimulator drop={alerts.drop} stores={stores} currency={product.currency} onChange={p => void patch({drop_percent: p})} /> : null}
                  </AlertCard>
                  <AlertCard icon="🎯" title="Chegar no meu preço" text={alerts.target ? (bestPrice !== null && bestPrice <= alerts.target ? 'Já está no seu preço agora: ' + money(bestPrice, product.currency) + '.' : bestPrice !== null ? 'Faltam ' + money(bestPrice - alerts.target, product.currency) + ' (' + percent((alerts.target - bestPrice) / bestPrice * 100).replace('−', '') + ') para chegar em ' + money(alerts.target, product.currency) + '.' : 'Aviso quando estiver em ' + money(alerts.target, product.currency) + ' ou menos.') : 'Defina quanto você aceita pagar.'}
                    value={alerts.target !== null} onChange={v => { if (!v) { setTarget(''); void patch({target_price: ''}); } else if (bestPrice) { const s = Math.round(bestPrice * 0.9); setTarget(String(s)); void patch({target_price: s}); } else setTarget(' '); }}>
                    {alerts.target !== null || target ? (
                      <View style={{gap: 10}}>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                          <Text style={{color: c.muted, fontSize: 16}}>R$</Text>
                          <TextInput accessibilityLabel="Meu preço" value={target.trim()} onChangeText={setTarget} onEndEditing={e => void saveTarget(e.nativeEvent.text)} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={c.muted}
                            style={{flex: 1, fontSize: 20, fontWeight: '600', color: c.text, borderBottomWidth: 1, borderColor: c.line, paddingVertical: 4}} />
                        </View>
                        <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap'}}>
                          {bestPrice ? [5, 10, 20].map(p => { const v = Math.round(bestPrice * (1 - p / 100)); return (
                            <Pressable key={p} onPress={() => { setTarget(String(v)); void patch({target_price: v}); }} style={{paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: c.input}}>
                              <Text style={{fontSize: 12, color: c.text}}>−{p}% · {money(v, product.currency).replace(/,00$/, '')}</Text>
                            </Pressable>); }) : null}
                          {product.low ? <Pressable onPress={() => { const v = Math.round(product.low!.price); setTarget(String(v)); void patch({target_price: v}); }} style={{paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: c.input}}>
                            <Text style={{fontSize: 12, color: c.text}}>menor já visto · {money(product.low.price, product.currency).replace(/,00$/, '')}</Text></Pressable> : null}
                        </View>
                      </View>
                    ) : null}
                  </AlertCard>
                </Section>
                <Section title="Ajustes">
                  <View style={{gap: 6}}>
                    <Text style={{fontSize: 12, color: c.muted}}>Nome</Text>
                    <TextInput accessibilityLabel="Nome do produto" value={rename} onChangeText={setRename} onEndEditing={() => { if (rename.trim() && rename.trim() !== monitor.title) void patch({}, {title: rename.trim()}); }}
                      style={{fontSize: 16, color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.input}} />
                  </View>
                  <View style={{gap: 8}}><Text style={{fontSize: 12, color: c.muted}}>Cor da linha</Text><ColorRow value={product.color} onChange={col => void patch({line_color: col})} /></View>
                  <View style={{gap: 8}}>
                    <Text style={{fontSize: 12, color: c.muted}}>Ler o preço a cada</Text>
                    <Chips value={Number(monitor.data.interval_minutes) || 360} onChange={v => void patch({interval_minutes: v})} options={INTERVALS} />
                  </View>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                    <View style={{flex: 1}}><Text style={{color: c.text, fontSize: 16}}>Pausar acompanhamento</Text><Text style={{color: c.muted, fontSize: 12}}>Mantém o histórico, mas não lê nem avisa.</Text></View>
                    <Switch value={paused} onValueChange={v => void patch({}, {state: v ? 'paused' : 'active'})} />
                  </View>
                  <Pressable accessibilityRole="button" onPress={remove} style={{paddingVertical: 12, alignItems: 'center'}}><Text style={{color: c.danger, fontWeight: '600'}}>Parar de acompanhar e apagar histórico</Text></Pressable>
                </Section>
              </>
            )}
            {saving ? <Text style={{textAlign: 'center', color: c.muted, fontSize: 12}}>{saving}</Text> : null}
            {error ? <Text style={{textAlign: 'center', color: c.danger}}>{error}</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={!!menu || !!moving} onClose={() => { setMenu(null); setMoving(null); }} label="Fechar opções da loja">
        {moving ? (
          <View style={{gap: 6}}>
            <Text style={{fontSize: 18, fontWeight: '600', color: c.text, marginBottom: 6}}>Mover {moving.name} para…</Text>
            <Text style={{fontSize: 12, color: c.muted, marginBottom: 4}}>A oferta sai deste produto e passa a ser acompanhada no escolhido. Só mova se for exatamente o mesmo produto.</Text>
            {others.map(o => <SheetItem key={o.id} label={String(o.title || 'Produto')} onPress={() => { const u = moving.url, target = o; setMoving(null); void (async () => { try { await api.saveEntity({...target, data: {...target.data, source_urls: addSource(target, u)}}); await patch(removeSource(monitor, u), {}, 'Oferta movida'); } catch (e) { setError(errorText(e)); } })(); }} />)}
            <SheetItem label="Cancelar" onPress={() => setMoving(null)} />
          </View>
        ) : menu ? (
          <View style={{gap: 6}}>
            <Text style={{fontSize: 18, fontWeight: '600', color: c.text, marginBottom: 6}}>{menu.name}</Text>
            <SheetItem label="Abrir na loja" onPress={() => { const u = menu.url; setMenu(null); void Linking.openURL(u); }} />
            <SheetItem label="Ler o preço agora" onPress={() => { setMenu(null); readNow(); }} />
            <SheetItem label={isMercadoLivreUrl(menu.url) ? "Ler pelo servidor" : "Ver a página que a Sofia lê"} onPress={() => { const s = menu; setMenu(null); setViewer(s); }} />
            <SheetItem label="Trocar o link" onPress={() => { const s = menu; setMenu(null); setRelink({store: s, text: s.url, error: ''}); }} />
            {!menu.primary ? <SheetItem label="Tornar oferta principal (a do Início)" onPress={() => { const u = menu.url; setMenu(null); void patch(makePrimary(monitor, u)); }} /> : null}
            {product.stores.length > 1 && others.length ? <SheetItem label="Mover para outro produto" onPress={() => { const s = menu; setMenu(null); setMoving(s); }} /> : null}
            {product.stores.length > 1 ? <SheetItem danger label="Remover esta loja" onPress={() => { const u = menu.url; setMenu(null); void patch(removeSource(monitor, u)); }} />
              : <Text style={{fontSize: 12, color: c.muted, paddingVertical: 8}}>Esta é a única loja. Para parar, use “Parar de acompanhar” nos ajustes.</Text>}
          </View>
        ) : null}
      </Sheet>

      <Presence>{storeSheet ? <AddStores api={api} monitor={monitor} onClose={() => setStoreSheet(false)} onAdded={async urls => {
        let data = monitor;
        for (const u of urls) data = {...data, data: {...data.data, source_urls: addSource(data, u)}};
        const saved = await patch({source_urls: data.data.source_urls}, {}, urls.length === 1 ? 'Loja adicionada' : urls.length + ' lojas adicionadas');
        setStoreSheet(false);
        if (saved) void runCollection(api, {only: saved.id, scope: api.owner});
      }} /> : null}</Presence>

      <Presence>{viewer ? <PageViewer api={api} monitor={monitor} store={viewer} onClose={() => setViewer(null)} onSaved={async () => { setViewer(null); clearIssue(issueKey(monitor.id, viewer.url)); await onChanged(); }} /> : null}</Presence>

      <Sheet visible={productMenu} onClose={() => setProductMenu(false)} label="Fechar opções do produto">
        <View style={{gap: 2}}>
          <Text style={{fontSize: 18, fontWeight: '600', color: c.text, marginBottom: 6}} numberOfLines={1}>{monitor.title}</Text>
          <SheetItem label={running ? 'Lendo os preços…' : 'Atualizar preços agora'} onPress={() => { setProductMenu(false); if (!running) readNow(); }} />
          {product.stores[0] ? <SheetItem label="Trocar o link principal" onPress={() => { setProductMenu(false); const s = product.stores.find(x => x.primary) || product.stores[0]; setRelink({store: s, text: s.url, error: ''}); }} /> : null}
          <SheetItem label="Adicionar outra loja (colar link)" onPress={() => { setProductMenu(false); setStoreSheet(true); }} />
          <SheetItem danger label="Excluir produto" onPress={() => { setProductMenu(false); remove(); }} />
        </View>
      </Sheet>

      <Sheet visible={!!relink} onClose={() => setRelink(null)} label="Fechar troca de link">
        {relink ? (
          <View style={{gap: 12}}>
            <Text style={{fontSize: 18, fontWeight: '600', color: c.text}}>Trocar o link · {relink.store.name}</Text>
            <Text style={{fontSize: 12, color: c.muted}}>Cole o link novo do mesmo produto (pode ser o texto inteiro do “Compartilhar”). O histórico do link antigo deixa de aparecer no gráfico.</Text>
            <TextInput accessibilityLabel="Link novo" value={relink.text} onChangeText={text => setRelink(r => r && {...r, text, error: ''})} autoCapitalize="none" autoCorrect={false} keyboardType="url"
              style={{borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, color: c.text, backgroundColor: c.input}} />
            <Pressable onPress={async () => { const t = await Clipboard.getStringAsync().catch(() => ''); const u = extractProductUrl(t); if (u) setRelink(r => r && {...r, text: u, error: ''}); }} style={{alignSelf: 'flex-start'}}><Text style={{color: c.accent, fontWeight: '600'}}>Colar da área de transferência</Text></Pressable>
            {relink.error ? <Text style={{color: c.danger}}>{relink.error}</Text> : null}
            <Button title="Salvar link" onPress={async () => {
              const u = extractProductUrl(relink.text);
              if (!u) { setRelink(r => r && {...r, error: 'Não achei um link aí.'}); return; }
              if (u !== relink.store.url && product.stores.some(s => s.url === u)) { setRelink(r => r && {...r, error: 'Esse link já está em outra loja deste produto.'}); return; }
              const old = relink.store.url; setRelink(null);
              if (u === old) return;
              const memo = (() => { try { const m = JSON.parse(String(monitor.data.reader_memory || '{}')); delete m[old]; return JSON.stringify(m); } catch { return '{}'; } })();
              const saved = await patch({...replaceSource(monitor, old, u), reader_memory: memo}, {}, 'Link trocado');
              if (saved) void runCollection(api, {force: true, only: saved.id, scope: api.owner});
            }} />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} label="Fechar confirmação de preço">
        {confirm ? (
          <View style={{gap: 10}}>
            <Text style={{fontSize: 18, fontWeight: '600', color: c.text}}>Qual é o preço na {confirm.store.name}?</Text>
            <Text style={{fontSize: 13, color: c.muted}}>A página mostrou mais de um valor. Escolha uma vez: nas próximas leituras a Sofia usa o mesmo lugar da página.</Text>
            {confirm.issue.candidates.map((cand, i) => (
              <Pressable key={i} onPress={async () => {
                const {store} = confirm; setConfirm(null);
                const saved = await patch({reader_memory: withMemory(monitor, store.url, cand.origins)}, {}, 'Preço confirmado');
                if (saved) { await recordPrice(api, saved, store.url, cand.amount, api.owner, undefined, store.name).catch(e => setError(errorText(e))); clearIssue(issueKey(saved.id, store.url)); await onChanged(); }
              }} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.line}}>
                <Text style={{fontWeight: '600', fontSize: 16, color: c.text}}>{money(cand.amount, cand.currency || product.currency)}</Text>
                <Text style={{flex: 1, fontSize: 11, color: c.muted}}>{originLabel(cand.origins)}</Text>
              </Pressable>
            ))}
            <SheetItem label="Nenhum destes — ignorar esta leitura" onPress={() => { clearIssue(issueKey(monitor.id, confirm.store.url)); setConfirm(null); }} />
          </View>
        ) : null}
      </Sheet>
    </MotionModal>
  );
}

export function Mini({label, value}: {label: string; value: string}) {
  const c = useTheme();
  return <View style={{flex: 1, backgroundColor: c.input, borderRadius: 12, padding: 8}}><Text style={{fontSize: 10, color: c.muted}}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={{fontSize: 13, fontWeight: '600', color: c.text}}>{value}</Text></View>;
}
export function Legend({color, text, dashed = false}: {color: string; text: string; dashed?: boolean}) {
  const c = useTheme();
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}><View style={{width: 14, height: 0, borderTopWidth: 2, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid'}} /><Text style={{fontSize: 11, color: c.muted}}>{text}</Text></View>;
}
export function Insight({icon, text}: {icon: string; text: string}) {
  const c = useTheme();
  return <View style={{flexDirection: 'row', gap: 10, alignItems: 'flex-start'}}><EmojiIcon e={icon} size={18} color={c.accent} fallback={<Text style={{fontSize: 16}}>{icon}</Text>} /><Text style={{flex: 1, fontSize: 13, lineHeight: 19, color: c.text}}>{text}</Text></View>;
}
// Simula na hora quanto o preço precisa cair, loja por loja, para o aviso
// sair — sem a pessoa ter que fazer conta de porcentagem.
export function DropSimulator({drop, stores, currency, onChange}: {drop: number; stores: StoreSeries[]; currency: string; onChange: (p: number) => void}) {
  const c = useTheme(), [custom, setCustom] = useState(DROP_CHOICES.includes(drop) ? '' : String(drop));
  const priced = stores.filter(s => s.last);
  const ref = priced[0]?.last?.total ?? null;
  function applyCustom(text: string) {
    const v = Math.round(Number(text.replace(',', '.')));
    if (Number.isFinite(v) && v >= 1 && v <= 90) onChange(v);
  }
  const preview = (() => { const v = Number(custom.replace(',', '.')); return custom.trim() && Number.isFinite(v) && v >= 1 && v <= 90 ? v : drop; })();
  return (
    <View style={{gap: 10}}>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
        {DROP_CHOICES.map(p => (
          <Pressable key={p} accessibilityRole="radio" accessibilityState={{checked: drop === p}} onPress={() => { setCustom(''); onChange(p); }}
            style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, alignItems: 'center', backgroundColor: drop === p ? c.accent : c.input}}>
            <Text style={{color: drop === p ? PALETTE.white : c.text, fontWeight: '600'}}>{p}%</Text>
            {ref !== null ? <Text style={{color: drop === p ? PALETTE.white+'cc' : c.muted, fontSize: 10}}>{money(ref * (1 - p / 100), currency).replace(/,\d\d$/, '')}</Text> : null}
          </Pressable>
        ))}
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: !DROP_CHOICES.includes(drop) ? c.accentSoft : c.input}}>
          <TextInput accessibilityLabel="Outra porcentagem de queda" value={custom} onChangeText={setCustom} onEndEditing={e => applyCustom(e.nativeEvent.text)} keyboardType="number-pad" placeholder="outra" placeholderTextColor={c.muted} maxLength={2}
            style={{minWidth: 44, color: c.text, fontWeight: '600', paddingVertical: 6, textAlign: 'center'}} />
          <Text style={{color: c.muted}}>%</Text>
        </View>
      </View>
      {priced.length ? (
        <View style={{gap: 6, backgroundColor: c.surface, borderRadius: 12, padding: 10}}>
          <Text style={{fontSize: 12, color: c.muted}}>Com {preview}%, o aviso sai quando alguma loja baixar para:</Text>
          {priced.map(s => {
            const now = s.last!.total, limit = now * (1 - preview / 100);
            return (
              <View key={s.url} style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <Text style={{flex: 1, fontSize: 13, color: c.text}} numberOfLines={1}>{s.name}</Text>
                <Text style={{fontSize: 12, color: c.muted}}>{money(now, currency)} →</Text>
                <Text style={{fontSize: 13, fontWeight: '600', color: GOOD}}>{money(limit, currency)}</Text>
                <Text style={{fontSize: 11, color: c.muted}}>(−{money(now - limit, currency)})</Text>
              </View>
            );
          })}
          <Text style={{fontSize: 11, color: c.muted}}>A conta é refeita a cada leitura: vale a queda de uma leitura para a seguinte na mesma loja.</Text>
        </View>
      ) : <Text style={{fontSize: 12, color: c.muted}}>A simulação aparece depois da primeira leitura de preço.</Text>}
    </View>
  );
}

export function Stat({label, value, sub, color, wide}: {label: string; value: string; sub?: string; color?: string; wide?: boolean}) {
  const c = useTheme();
  return (
    <View style={{flexGrow: 1, flexBasis: wide ? '100%' : '46%', backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 12, gap: 2, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
      <Text style={{fontSize: 11, color: c.muted}}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{fontSize: 16, fontWeight: '700', color: color || c.text}}>{value}</Text>
      {sub ? <Text style={{fontSize: 10, color: c.muted}}>{sub}</Text> : null}
    </View>
  );
}
export function Section({title, hint, children}: {title: string; hint?: string; children: React.ReactNode}) {
  const c = useTheme();
  return (
    <View style={{backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 16, gap: 12, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
      <View style={{gap: 2}}><Text style={{fontSize: 18, fontWeight: '600', color: c.text}}>{title}</Text>{hint ? <Text style={{fontSize: 12, color: c.muted}}>{hint}</Text> : null}</View>
      {children}
    </View>
  );
}
export function AlertCard({icon, title, text, value, onChange, children}: {icon: string; title: string; text: string; value: boolean; onChange: (v: boolean) => void; children?: React.ReactNode}) {
  const c = useTheme();
  return (
    <View style={{borderRadius: 16, padding: 12, gap: 10, backgroundColor: value ? c.accentSoft : c.input}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <EmojiIcon e={icon} size={26} color={c.accent} fallback={<Text style={{fontSize: 24}}>{icon}</Text>} />
        <View style={{flex: 1}}><Text style={{fontSize: 16, fontWeight: '500', color: c.text}}>{title}</Text><Text style={{fontSize: 12, color: c.muted}}>{text}</Text></View>
        <Switch accessibilityLabel={title} value={value} onValueChange={onChange} />
      </View>
      {children}
    </View>
  );
}
export function SheetItem({label, onPress, danger = false}: {label: string; onPress: () => void; danger?: boolean}) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={{paddingVertical: 14}}><Text style={{fontSize: 16, color: danger ? c.danger : c.text}}>{label}</Text></Pressable>;
}

// ======================= OUTRAS LOJAS =======================
export type Found = {status: 'idle' | 'searching' | 'done' | 'none' | 'error'; links: StoreLink[]; error?: string};