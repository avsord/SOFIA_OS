import {Presence} from '../components/Presence';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {contextMenu} from '../components/ContextMenu';
import {PALETTE} from '../lib/palette';
import {rightClick} from '../lib/web-page';
import {tap,useColumnPad} from '../lib/desktop';
import {ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {useTheme} from '../lib/theme';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {errorText} from '../lib/chat-model';
import {useRenderCost} from '../lib/render-cost';
import {MotionModal} from '../components/MotionModal';
import {Sheet} from '../components/Sheet';
import {InternalBackGesture} from '../components/InternalBackGesture';
import {EmojiIcon, Icon} from '../components/Icon';
import {Button, IconButton} from '../components/UI';
import {PriceChart} from '../components/PriceChart';
import {Spinner, LoadingLines,LoadingCaption} from '../components/Loading';
import {readPrice, readLinks, USER_AGENT, DESKTOP_AGENT} from '../lib/price-reader';
import {readStorePrice, identityOf, storedMLIdentity, isMercadoLivreUrl} from '../lib/price-direct';
import type {MercadoLivreReading} from '../lib/mercado-livre-types';
import {buildInjectedScript, parsePriceMessage} from '../lib/price-extractor';
import type {StoreLink} from '../lib/price-extractor';
import {fallbackSearchUrl} from '../lib/price-extractor';
import {collectorState, onCollector, runCollection, cancelCollection, loadProducts, recordPrice, clearIssue, issueKey} from '../lib/monitor-collector';
import type {StoreIssue} from '../lib/monitor-collector';
import {
  PRODUCT_COLORS, WINDOWS, DROP_CHOICES, INTERVALS, money, percent, since, storeName, hostOf, nextColor,
  alertsOf, alertSummary, analyzeProduct, allReadings, searchTerms, extractProductUrl, replaceSource, readerUrl, readerAgent, searchTargetsFor, addSource, removeSource, makePrimary, withMemory, storesOf,
} from '../lib/monitoring';
import type {ProductSeries, Window, Candidate, StoreSeries} from '../lib/monitoring';
import {appAlert} from '../lib/app-alert';
// 0.3.263: tela dividida em partes (src/screens/monitoring/*), sem mudar o que ela faz. Quem importava daqui continua importando daqui.
import {GOOD, useCollector, Delta, Chips, Spark, issuesFor} from './monitoring/core';
import {Tag, AddProduct} from './monitoring/Add';
import {ProductDetail} from './monitoring/Detail';
// ======================= TELA PRINCIPAL =======================
export function Monitoring({api, active, onBack, focusId = ''}: {api: SofiaApi; active: boolean; onBack: () => void; focusId?: string}) {
  useRenderCost('apps:monitoring');
  const c = useTheme(), insets = useSafeAreaInsets(), col = useCollector();
  const [products, setProducts] = useState<ProductSeries[] | null>(null), [error, setError] = useState('');
  const [win, setWin] = useState<Window>('30d'), [hidden, setHidden] = useState<string[]>([]);
  const [adding, setAdding] = useState(false), [openId, setOpenId] = useState<string | null>(null);
  const scope = api.owner;
  // Vindo de um aviso: abre direto o produto.
  useEffect(() => { if (focusId && products?.some(p => p.monitor.id === focusId)) setOpenId(focusId); }, [focusId, products]);

  const load = useCallback(async () => {
    try { setProducts(await loadProducts(api)); setError(''); } catch (e) { setError(errorText(e)); setProducts(p => p || []); }
  }, [api]);
  useEffect(() => { if (active) void load(); }, [active, load]);
  // 0.3.268: sair do Price Tracker (seta, Esc, voltar) fecha o painel do produto; ao voltar ele nao esta mais aberto
  useEffect(() => { if (!active) setOpenId(null); }, [active]);
  useEffect(() => { if (!col.running && col.lastRun && active) void load(); }, [col.running, col.lastRun, active, load]);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => { if (AppState.currentState === 'active') void runCollection(api, {scope}); }, 800);
    return () => clearTimeout(t);
  }, [active, api, scope]);

  const visible = (products || []).filter(p => !hidden.includes(p.monitor.id));
  const lines = visible.map(p => ({id: p.monitor.id, color: p.color, points: p.best}));
  const open = products?.find(p => p.monitor.id === openId) || null;
  // 0.3.267: o painel continua montado enquanto anima a saída (antes sumia num corte seco ao fechar)
  const lastOpen = useRef<typeof open>(null);
  if (open) lastOpen.current = open;
  const shown = open || lastOpen.current;
  const lastRead = Math.max(0, ...(products || []).map(p => p.lastAt || 0)) || null;

  const pad = useColumnPad(); // 0.3.253: cabecalho alinhado a coluna de leitura no computador
  return (
    <InternalBackGesture enabled={active && !adding && !open} onBack={onBack}>
      <View style={{flex: 1, backgroundColor: c.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 14, paddingBottom: 6, ...pad(12)}}>
          <IconButton name="back" label="Voltar aos apps" onPress={onBack} />
          <View style={{flex: 1, paddingHorizontal: 4}}>
            <Text style={{fontSize: 11, letterSpacing: 1.2, color: c.muted, fontWeight: '500'}}>PREÇOS QUE VOCÊ ACOMPANHA</Text>
            <Text style={{fontSize: 24, fontWeight: '700', color: c.text}}>Price Tracker</Text>
          </View>
          <IconButton name="plus" label="Adicionar produto" filled onPress={() => setAdding(true)} />
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 18, paddingTop: 8, paddingBottom: insets.bottom + 40, gap: 16}}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void runCollection(api, {force: true, scope})} />}>
          <Pressable accessibilityRole="button" accessibilityLabel="Atualizar preços agora" disabled={col.running} onPress={() => void runCollection(api, {force: true, scope})}
            style={{flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6}}>
            {col.running ? <ActivityIndicator size="small" color={c.accent} /> : <Icon name="refresh" size={14} color={c.accent} />}
            <Text style={{fontSize: 12, color: c.text}} numberOfLines={1}>
              {col.running ? (col.total ? `Lendo ${col.label} (${Math.min(col.done + 1, col.total)}/${col.total})` : 'Conferindo o que precisa ser lido…') : `Lido ${since(lastRead)} · atualizar agora`}
            </Text>
          </Pressable>

          {error ? <Text style={{color: c.danger, fontSize: 13}}>{error}</Text> : null}
          {products === null ? <View style={{gap: 6}}><LoadingCaption label="Carregando produtos" /><LoadingLines rows={4} /></View> : !products.length ? (
            <View style={{alignItems: 'center', gap: 14, paddingVertical: 40, paddingHorizontal: 10}}>
              <View style={{width: 84, height: 84, borderRadius: 42, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center'}}><Icon name="monitor" size={38} color={c.accent} /></View>
              <Text style={{fontSize: 20, fontWeight: '600', color: c.text, textAlign: 'center'}}>Acompanhe o preço do que você quer comprar</Text>
              <Text style={{fontSize: 14, lineHeight: 21, color: c.muted, textAlign: 'center'}}>Cole o link de um produto. A Sofia lê o preço, encontra o mesmo item em outras lojas, desenha o histórico e te avisa quando valer a pena.</Text>
              <View style={{alignSelf: 'stretch', marginTop: 8}}><Button title="Adicionar meu primeiro produto" onPress={() => setAdding(true)} /></View>
            </View>
          ) : (
            <>
              <View style={{backgroundColor: c.surface, borderRadius: 24, borderWidth: 1, borderColor: c.line, padding: 16, gap: 14, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
                <View style={{alignSelf: 'flex-start'}}><Chips value={win} onChange={setWin} options={WINDOWS.map(w => ({value: w.value, label: w.label}))} /></View>
                <PriceChart lines={lines} height={210} window={win} mode="price" currency={visible[0]?.currency || 'BRL'} />
                <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                  {products.map(p => {
                    const off = hidden.includes(p.monitor.id);
                    return (
                      <Pressable key={p.monitor.id} accessibilityRole="switch" accessibilityState={{checked: !off}} accessibilityLabel={(off ? 'Mostrar ' : 'Esconder ') + p.monitor.title + ' no gráfico'}
                        onPress={() => setHidden(h => off ? h.filter(x => x !== p.monitor.id) : [...h, p.monitor.id])} onLongPress={() => setOpenId(p.monitor.id)} {...rightClick(() => setOpenId(p.monitor.id))}
                        style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1, borderColor: off ? c.line : p.color + '88', backgroundColor: off ? 'transparent' : p.color + '18', opacity: off ? 0.5 : 1}}>
                        <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: p.color}} />
                        <Text numberOfLines={1} style={{maxWidth: 140, fontSize: 12, color: c.text}}>{p.monitor.title}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{fontSize: 11, color: c.muted}}>{tap('Cada linha é a evolução do próprio produto (o melhor preço entre as lojas dele). Toque num nome para esconder ou mostrar a linha.')}</Text>
              </View>

              {products.map(p => {
                const iss = issuesFor(p, col.issues), alerts = alertsOf(p.monitor);
                return (
                  <Pressable key={p.monitor.id} accessibilityRole="button" accessibilityLabel={'Abrir ' + p.monitor.title} onPress={() => setOpenId(p.monitor.id)} {...contextMenu(() => [{label: 'Abrir', icon: 'chartBar', run: () => setOpenId(p.monitor.id)}])}
                    style={{flexDirection: 'row', backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: p.atLow ? GOOD + '88' : c.line, overflow: 'hidden', opacity: p.monitor.state === 'paused' ? 0.6 : 1, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
                    <View style={{width: 5, backgroundColor: p.color}} />
                    <View style={{flex: 1, padding: 14, gap: 6}}>
                      <Text numberOfLines={2} style={{fontSize: 16, fontWeight: '500', color: c.text}}>{p.monitor.title}</Text>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                        <View style={{flex: 1, gap: 3}}>
                          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                            <Text style={{fontSize: 20, fontWeight: '700', color: c.text}}>{p.now ? money(p.now.price, p.currency) : '—'}</Text>
                            <Delta value={p.change} />
                          </View>
                          <Text numberOfLines={1} style={{fontSize: 12, color: c.muted}}>
                            {p.now ? 'na ' + p.now.store.name : 'aguardando a primeira leitura'} · {p.stores.length} {p.stores.length === 1 ? 'loja' : 'lojas'}{p.monitor.state === 'paused' ? ' · pausado' : ''}
                          </Text>
                        </View>
                        <Spark product={p} />
                      </View>
                      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
                        {p.atLow ? <Tag color={GOOD} text="Menor preço já visto" /> : null}
                        {iss.length ? <Tag color={PALETTE.amber} text={iss.some(i => i.kind === 'confirm') ? 'Confirme um preço' : iss.length + (iss.length === 1 ? ' loja não leu' : ' lojas não leram')} /> : null}
                        <Tag color={c.muted} text={alertSummary(alerts, p.currency)} subtle />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
              <Text style={{fontSize: 11, lineHeight: 17, color: c.muted, textAlign: 'center', paddingHorizontal: 12}}>
                {tap('Os preços são lidos neste celular, direto na página da loja, enquanto a Sofia está aberta. Sem leitura, sem ponto no gráfico: nada é estimado. Frete não incluído.')}
              </Text>
            </>
          )}
        </ScrollView>

        <Presence>{adding ? <AddProduct api={api} used={(products || []).map(p => p.color)} existing={products || []} onClose={() => setAdding(false)}
          onCreated={id => { setAdding(false); void load().then(() => setOpenId(id)); }} /> : null}</Presence>
        {shown ? <ProductDetail visible={!!open} others={(products || []).filter(p => p.monitor.id !== shown.monitor.id).map(p => p.monitor)} api={api} product={shown} issues={col.issues} running={col.running} onClose={() => setOpenId(null)} onChanged={load} onDeleted={() => { setOpenId(null); void load(); }} /> : null}
      </View>
    </InternalBackGesture>
  );
}
