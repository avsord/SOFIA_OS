import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, Platform, StyleSheet, Text, View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {useTheme, dark} from '../lib/theme';

/** Anel fino girando, como o do Notion: discreto, cinza, sem a rodinha grossa
 * e colorida do Android. O arco ocupa 3/4 do círculo. */
export function Spinner({size = 22, color, stroke = 2}: {size?: number; color?: string; stroke?: number}) {
  const c = useTheme(), spin = useRef(new Animated.Value(0)).current;
  // Gira sempre, mesmo com 'remover animações' ligado no celular: é um sinal de
  // que algo está carregando, não enfeite (pedido do dono).
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, {toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true}));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const r = (size - stroke) / 2, len = 2 * Math.PI * r;
  return (
    <Animated.View accessibilityRole="progressbar" accessibilityLabel="Carregando"
      style={{width: size, height: size, transform: [{rotate: spin.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']})}]}}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color || c.muted} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${len * 0.72} ${len}`} />
      </Svg>
    </Animated.View>
  );
}

/** 0.3.268 (site): no computador as telas ja estao carregadas; o esqueleto so aparece se a espera passar de ~300 ms.
 * Antes ele piscava por alguns milissegundos (e no canto, com o desenho do celular) a cada troca de menu. No celular
 * nada muda: o esqueleto continua aparecendo no mesmo toque. */
export const WEB_SKELETON_DELAY = 300;
export function useSkeletonDelay(): boolean {
  const web = Platform.OS === 'web';
  const [show, setShow] = useState(!web);
  useEffect(() => { if (!web) return; const t = setTimeout(() => setShow(true), WEB_SKELETON_DELAY); return () => clearTimeout(t); }, [web]);
  return show;
}

/** Linhas finas no lugar do conteúdo (como as linhas da tabela do Notion),
 * respirando de leve. Separadores entre elas, larguras variadas. */
export function LoadingLines({rows = 3, separated = true}: {rows?: number; separated?: boolean}) {
  const c = useTheme(), pulse = useRef(new Animated.Value(0.5)).current, show = useSkeletonDelay();
  useEffect(() => {
    if (!show) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, {toValue: 1, duration: 700, useNativeDriver: true}),
      Animated.timing(pulse, {toValue: 0.5, duration: 700, useNativeDriver: true}),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, show]);
  const widths = ['78%', '64%', '72%', '56%', '68%', '60%'];
  if (!show) return <View style={{minHeight: rows * 47}} />;
  return (
    <Animated.View style={{opacity: pulse}}>
      {Array.from({length: rows}, (_, i) => (
        <View key={i} style={{paddingVertical: 18, borderBottomWidth: separated ? 1 : 0, borderColor: c.line}}>
          <View style={{height: 10, width: widths[i % widths.length] as any, borderRadius: 5, backgroundColor: c.line}} />
        </View>
      ))}
    </Animated.View>
  );
}

/** Troca de esqueleto para conteúdo de verdade suavizada: os dois ficam
 * empilhados por ~160 ms, o conteúdo entra esmaecendo por cima e o esqueleto
 * sai, em vez de um corte seco (a "piscada" ao abrir um menu pela primeira
 * vez, quando o aquecimento em segundo plano termina bem na hora do toque). */
export function FadeSwap({ready, fallback, children}: {ready: boolean; fallback: React.ReactNode; children: React.ReactNode}) {
  const [everReady, setEverReady] = useState(ready), fade = useRef(new Animated.Value(ready ? 1 : 0)).current, [showFallback, setShowFallback] = useState(!ready);
  useEffect(() => {
    if (!ready) return;
    setEverReady(true);
    Animated.timing(fade, {toValue: 1, duration: 160, useNativeDriver: true}).start(() => setShowFallback(false));
  }, [ready, fade]);
  if (!everReady) return <>{fallback}</>;
  return (
    <View style={{flex: 1}}>
      <Animated.View style={{flex: 1, opacity: fade}}>{children}</Animated.View>
      {showFallback ? <View style={StyleSheet.absoluteFill} pointerEvents="none">{fallback}</View> : null}
    </View>
  );
}

/** Carregando com o que já se sabe na tela: o título real aparece na hora,
 * o anel fino mostra que algo está vindo e as linhas marcam onde o conteúdo
 * vai entrar. Sem título, fica só o anel no centro. */
export function PageLoading({title, eyebrow, label, rows = 4, testID}: {title?: string; eyebrow?: string; label?: string; rows?: number; testID?: string}) {
  const c = useTheme(), show = useSkeletonDelay();
  if (!show) return <View testID={testID ? testID + '-wait' : undefined} style={{flex: 1, backgroundColor: c.bg}} />;
  if (!title) return <View testID={testID} style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg}}><Spinner size={26} /></View>;
  return (
    <View testID={testID} style={{flex: 1, backgroundColor: c.bg, paddingHorizontal: 20, paddingTop: 22, gap: 18}}>
      <View style={{paddingLeft: 52, gap: 4}}>
        {eyebrow ? <Text style={{fontSize: 11, letterSpacing: 1.2, color: c.muted, fontWeight: '500'}}>{eyebrow}</Text> : null}
        <Text style={{fontSize: 24, fontWeight: '700', color: c.text}}>{title}</Text>
      </View>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', backgroundColor: c.surface, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: c.line}}>
        <Spinner size={16} stroke={1.8} />
        <Text style={{color: c.text, fontSize: 13, fontWeight: '500'}}>{label || 'Carregando'}</Text>
      </View>
      <LoadingLines rows={rows} />
    </View>
  );
}

/** Reflexo que atravessa os blocos do esqueleto (estilo Facebook/LinkedIn).
 * Um unico valor animado para a tela toda: todos os blocos brilham juntos.
 * Implementado so com View/Animated.View (sem react-native-svg): criar um
 * Svg/LinearGradient custa bem mais para o sistema montar que uma View comum,
 * e este componente fica no caminho critico da primeira tela (antes do app
 * terminar de abrir) - o custo extra de um Svg ali media mais tempo de
 * abertura em todo cold start sem preco salvo ainda (0.3.137: ficou 100ms+
 * mais lento que a 0.3.94 nesse caminho). Tres faixas semi-transparentes
 * lado a lado (fraca/forte/fraca) imitam a borda suave do gradiente antigo
 * sem o custo de montar um Svg. Roda mesmo com "remover animacoes" ligado —
 * e sinal de carregamento, nao enfeite (pedido do dono). */
const ShimmerContext = React.createContext<Animated.Value | null>(null);
export function ShimmerGroup({children, duration = 1300}: {children: React.ReactNode; duration?: number}) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, {toValue: 1, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true}));
    loop.start();
    return () => loop.stop();
  }, [x, duration]);
  return <ShimmerContext.Provider value={x}>{children}</ShimmerContext.Provider>;
}
const BAND = 140, TRAVEL = 520;
// (0.3.138) Each block used to be an outer View + an inner Animated.View + 3 segment
// Views (soft edge / shine / soft edge) = 5 native views. On Home's first paint this
// repeats for every row (title+subtitle+price = 3 blocks/row), all before the native
// splash can reveal the app - real cost on a cold start, confirmed by a repeatable
// +~100-280ms regression against 0.3.136 in CI. A single flat band (2 views total:
// outer + one Animated.View) keeps the same moving highlight with roughly a third of
// the native views per block. The edge is a little harder than before; at this size,
// moving and mostly hidden by the splash fade-out, that is not visible in practice.
export function ShimmerBlock({width, height, radius = 6, style}: {width: number | string; height: number; radius?: number; style?: any}) {
  const c = useTheme(), x = React.useContext(ShimmerContext);
  const shine = c.bg === dark.bg ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.65)';
  return (
    <View style={[{width: width as any, height, borderRadius: radius, backgroundColor: c.line, overflow: 'hidden'}, style]}>
      {x ? (
        <Animated.View pointerEvents="none" style={{position: 'absolute', top: 0, bottom: 0, width: BAND, backgroundColor: shine,
          transform: [{translateX: x.interpolate({inputRange: [0, 1], outputRange: [-BAND, TRAVEL]})}]}}
        />
      ) : null}
    </View>
  );
}
