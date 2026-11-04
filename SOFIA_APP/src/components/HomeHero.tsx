import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useTheme} from '../lib/theme';
import {DISPLAY_ITALIC} from '../lib/sofia-font';
import type {SofiaApi} from '../lib/api';
import {errorText} from '../lib/chat-model';
import {Icon} from './Icon';
/** 04/11/2026 (Pedro: "hierarquia da ordem do que aparece: quarta-feira, bom dia Pedro, resumo, blocos"): no site cada
 * linha do topo aparece em seguida da anterior, so com opacidade (sem mover). Os blocos vem depois (Home.tsx). */
const fadeIn = (delay: number) => ({animationKeyframes: {'0%': {opacity: 0}, '100%': {opacity: 1}}, animationDuration: '420ms', animationDelay: delay + 'ms', animationTimingFunction: 'ease-out', animationFillMode: 'both'} as any);
const STAGGER = StyleSheet.create({date: fadeIn(0), greet: fadeIn(130), summary: fadeIn(260),
  // 04/11/2026 (Pedro: "o Bom dia aparece com um fade e leve scale suave, um pan frontal"): aproxima de 94% para 100%
  push: {animationKeyframes: {'0%': {opacity: 0, transform: 'scale(0.94)'}, '100%': {opacity: 1, transform: 'scale(1)'}}, animationDuration: '1100ms', animationTimingFunction: 'cubic-bezier(0.16,1,0.3,1)', animationFillMode: 'both'} as any});
/** 0.3.265 (Inicio, desenho aprovado pelo Pedro): saudacao centralizada com o nome em italico de destaque, uma frase que
 * nasce do dia de verdade e a barra da Sofia (mini chat) com atalhos. A resposta aparece num cartao curto logo abaixo;
 * a conversa e a mesma da aba Conversa ("Continuar na Conversa"). Mesmo desenho no app e no site, mais compacto no celular. */
/** 04/11/2026 (Pedro: "ainda esta flikando, analisa toda a animacao"): a abertura do site roda inteira em CSS, numa linha do
 * tempo unica que comeca quando a saudacao aparece (at). Animacao em JavaScript para quando a pagina esta ocupada montando
 * os dados (era o engasgo e a piscada); a do navegador continua. Montado atrasado, o atraso negativo poe cada parte no ponto certo. */
// 04/11/2026: versao aprovada pelo Pedro (branch aprovado/site-abertura-2026-11-04-v2) e a versao de TESTE, que so liga com
// ?teste=1 no endereco (Pedro: "zoom out mais lento e suave, quase nada de escala, e os blocos aparecem rapidamente")
export const INTRO_TEST = typeof location !== 'undefined' && /[?&]teste=1(?:&|$)/.test(location.search || '');
export const INTRO = INTRO_TEST
  ? {scale: 1.04, moveMs: 2400, scaleMs: 3200, ease: 'cubic-bezier(0.4,0,0.08,1)', scaleEase: 'cubic-bezier(0.25,0.1,0.1,1)', rowGap: 110, rowMs: 600, travel: 0.1}
  : {scale: 1.6, moveMs: 1300, scaleMs: 1300, ease: 'cubic-bezier(0.33,0,0.15,1)', scaleEase: 'cubic-bezier(0.33,0,0.15,1)', rowGap: 180, rowMs: 520, travel: 1};
export const INTRO_T = INTRO_TEST
  ? {greet: 0, move: 140, date: 990, summary: 1140, rows: 480, glow: 1500} /* move 140: a subida comeca 0,5 s antes de a tela abrir */
  : {greet: 0, move: 640, date: 990, summary: 1140, rows: 700, glow: 1350};
export function introAnim(at: number, offset: number, ms: number, from: any, to: any, ease = 'cubic-bezier(0.25,0.46,0.45,0.94)') {
  return {animationKeyframes: {'0%': from, '100%': to}, animationDuration: ms + 'ms', animationDelay: Math.round(at + offset - Date.now()) + 'ms', animationTimingFunction: ease, animationFillMode: 'both'} as any;
}
const MOVE_EASE = INTRO.ease;
export function greetingFor(now = new Date()) { const h = now.getHours(); return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
const CHIPS = ['O que tenho hoje?', 'Lançar uma despesa', 'Criar lembrete', 'Quanto já guardei?', 'Resumo da semana'];
export function HomeHero({api, first, subtitle, wide, onContinue, minimal = false, reveal}: {api: SofiaApi; first: string; subtitle: string; wide: boolean; onContinue: () => void; minimal?: boolean; reveal?: {at: number; big: number; done?: boolean} | null}) {
  const c = useTheme(), [text, setText] = useState(''), [busy, setBusy] = useState(false), [answer, setAnswer] = useState<{q: string; a: string; error?: boolean} | null>(null), input = useRef<TextInput>(null);
  async function ask(raw: string) {
    const q = raw.trim(); if (!q || busy) return;
    setBusy(true); setAnswer({q, a: ''}); setText('');
    try {
      const page = await api.ensureChat(); const id = page.conversation?.id || '';
      const r = await api.chat({conversation_id: id, message: q, client_message_id: 'home-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)});
      setAnswer({q, a: String(r.reply || '').trim() || 'Pronto.'});
    } catch (e) { setAnswer({q, a: errorText(e), error: true}); } finally { setBusy(false); }
  }
  const date = new Date().toLocaleDateString('pt-BR', {weekday: 'long', day: 'numeric', month: 'long'}).toUpperCase();
  // 04/11/2026 (Pedro: "QUARTA-FEIRA, 4 DE NOVEMBRO pode aparecer digitando"): na abertura do site a data e digitada
  // letra a letra quando chega a vez dela; o resto do texto fica reservado (transparente) para nada mudar de lugar
  const hello = greetingFor() + ', ';
  // a frase apareceu e terminou o fade: tira a animacao (senao ela se repete ao voltar de outra aba)
  const hasSummary = !!subtitle.trim(), [sumSettled, setSumSettled] = useState(false);
  useEffect(() => {if (!hasSummary) {setSumSettled(false); return;} const t = setTimeout(() => setSumSettled(true), 700); return () => clearTimeout(t);}, [hasSummary]);
  const rv = React.useMemo(() => reveal?.done ? {greet: null, scale: {transform: [{scale: 1 / reveal.big}]}, date: null, chars: null, summary: null} : reveal?.at ? {
    greet: introAnim(reveal.at, INTRO_T.greet, 600, {opacity: 0}, {opacity: 1}),
    scale: {...introAnim(reveal.at, INTRO_T.move, INTRO.scaleMs, {transform: 'scale(1)'}, {transform: 'scale(' + (1 / reveal.big) + ')'}, INTRO.scaleEase), willChange: 'transform'},
    date: introAnim(reveal.at, INTRO_T.date, 200, {opacity: 0}, {opacity: 1}),
    chars: Array.from(date).map((_, i) => introAnim(reveal.at, INTRO_T.date + i * 32, 40, {opacity: 0}, {opacity: 1}, 'linear')),
    summary: introAnim(reveal.at, INTRO_T.summary, 450, {opacity: 0}, {opacity: 1}),
  } : null, [reveal?.at, reveal?.big, reveal?.done, date]);
  // 0.3.294 (Pedro): no computador o Inicio fica so com a data e a saudacao (sem a conversa rapida), para o resumo caber numa tela
  // 03/11/2026 (Pedro): no celular a saudacao tambem fica sem a conversa rapida, alinhada a esquerda como no app
  if (minimal && !wide) return <View testID="home-hero" style={{alignItems: 'flex-start', paddingTop: 6, paddingBottom: 14, paddingHorizontal: 20, gap: 4}}>
    <Text style={{color: c.accent, fontSize: 11, fontWeight: '600', letterSpacing: 2}}>{date}</Text>
    <Text accessibilityRole="header" style={{color: c.text, fontSize: 28, fontWeight: '600', letterSpacing: -0.5}}>{greetingFor()}, <Text style={[DISPLAY_ITALIC, {color: c.accent, fontSize: 32}]}>{first}</Text></Text>
    <Text numberOfLines={2} style={{color: c.muted, fontSize: 14, lineHeight: 20}}>{subtitle || '\u00a0'}</Text>
  </View>;
  if (minimal) return <View testID="home-hero" style={{alignItems: 'center', paddingTop: 44, paddingBottom: 26, paddingHorizontal: 40, gap: 6}}>
    {/* 0.3.295: respiro em cima (o texto nao encosta no teto) e a frase da Sofia logo abaixo da saudacao */}
    {/* 04/11/2026 (Pedro: "primeiro Bom dia Pedro, a data so depois que subir, depois o resumo, depois os blocos"): com
        reveal (abertura do site) a data e o resumo ficam escondidos e quem os mostra e o Inicio, em ordem, apos a subida */}
    <View style={rv ? rv.date : undefined}><Text style={[{color: c.accent, fontSize: 11, fontWeight: '600', letterSpacing: 2, textAlign: 'center'}, wide && !rv ? STAGGER.date : null]}>{rv?.chars ? Array.from(date).map((ch, i) => <Text key={i} style={rv.chars![i]}>{ch}</Text>) : date}</Text></View>
    {rv && reveal ? <View style={[{height: 52, alignItems: 'center', justifyContent: 'center'}, rv.greet]}>
      {/* 04/11/2026 (Pedro: "o Bom dia esta com qualidade ruim quando amplo e da uma flikada quando fica bom"): o tamanho
          grande e o da LETRA (nitido em todo quadro), nao uma ampliacao da imagem; a caixa tem a altura final, nada empurra */}
      {/* 04/11/2026 (Pedro: "no comeco do zoom out ele craquela em pixels"): mudar o tamanho da LETRA a cada quadro reencaixa
          o texto nos pixels; agora a saudacao e desenhada ja GRANDE (nitida) e encolhe inteira (escala <= 1 nao borra) */}
      <Text accessibilityRole="header" style={[{color: c.text, fontSize: (reveal.big || 1) * 40, lineHeight: 52 * (reveal.big || 1), fontWeight: '600', letterSpacing: -0.5 * (reveal.big || 1), textAlign: 'center', whiteSpace: 'nowrap', WebkitFontSmoothing: 'antialiased'} as any, rv.scale]}>{hello}<Text style={[DISPLAY_ITALIC, {color: c.accent, fontSize: (reveal.big || 1) * 46}]}>{first}</Text></Text>
    </View> : <Text accessibilityRole="header" style={[{color: c.text, fontSize: 40, fontWeight: '600', letterSpacing: -0.5, textAlign: 'center'}, wide ? STAGGER.greet : null]}>{greetingFor()}, <Text style={[DISPLAY_ITALIC, {color: c.accent, fontSize: wide ? 46 : 32}]}>{first}</Text></Text>}
    {/* o resumo chega com os dados: a key faz ele aparecer suave quando o texto chega (o espaco ja esta reservado) */}
    <View style={rv ? rv.summary : undefined}><Text key={subtitle.trim() ? 'resumo' : 'vazio' /* 04/11/2026: o espaco de reserva ('\u00a0') contava como frase e a troca nunca refazia o fade */} numberOfLines={2} style={[{color: c.muted, fontSize: 16, lineHeight: 24, minHeight: 48, textAlign: 'center', maxWidth: 760, marginTop: 4, textWrap: 'balance'} as any, wide && !(reveal ? reveal.done : sumSettled) ? (rv ? STAGGER.date : STAGGER.summary) : null]}>{subtitle || '\u00a0'}</Text></View>
  </View>;
  return <View testID="home-hero" style={{alignItems: wide ? 'center' : 'stretch', paddingTop: wide ? 46 : 6, paddingBottom: wide ? 30 : 18, paddingHorizontal: wide ? 0 : 20, gap: wide ? 6 : 4}}>
    <Text style={{color: c.accent, fontSize: 11, fontWeight: '600', letterSpacing: 2, textAlign: wide ? 'center' : 'left'}}>{date}</Text>
    <Text accessibilityRole="header" style={{color: c.text, fontSize: wide ? 40 : 28, fontWeight: '600', letterSpacing: -0.5, textAlign: wide ? 'center' : 'left'}}>{greetingFor()}, <Text style={[DISPLAY_ITALIC, {color: c.accent, fontSize: wide ? 46 : 32}]}>{first}</Text></Text>
    {subtitle ? <Text style={{color: c.muted, fontSize: wide ? 16 : 14, textAlign: wide ? 'center' : 'left', marginTop: 2}}>{subtitle}</Text> : null}
    <View style={{width: '100%', maxWidth: wide ? 820 : undefined, marginTop: wide ? 18 : 12, gap: 10}}>
      <View testID="home-sofia-bar" style={{flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 18, paddingLeft: 12, paddingRight: 8, paddingVertical: 8, boxShadow: '0 0 0 4px ' + c.accent + '10, 0 10px 30px rgba(0,0,0,0.12)'} as any}>
        <View style={{width: 30, height: 30, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center'}}><Icon name="sofia" size={18} color={c.onAccent} active /></View>
        <TextInput ref={input} testID="home-sofia-input" accessibilityLabel="Pedir algo à Sofia" value={text} onChangeText={setText} onSubmitEditing={() => void ask(text)} placeholder="Peça, pergunte ou anote — a Sofia cuida do resto" placeholderTextColor={c.muted} returnKeyType="send" editable={!busy} style={{flex: 1, color: c.text, fontSize: 16, paddingVertical: 8, outlineStyle: 'none'} as any} />
        <Pressable accessibilityRole="button" accessibilityLabel="Enviar para a Sofia" disabled={busy || !text.trim()} onPress={() => void ask(text)} style={{width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: text.trim() ? c.accent : c.accentSoft}}>{busy ? <ActivityIndicator size="small" color={c.onAccent} /> : <Icon name="send" size={17} color={text.trim() ? c.onAccent : c.accent} />}</Pressable>
      </View>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: wide ? 'center' : 'flex-start'}}>{CHIPS.map(chip => <Pressable key={chip} accessibilityRole="button" disabled={busy} onPress={() => void ask(chip)} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: c.accentSoft}}><Text style={{color: c.accent, fontSize: 12}}>{chip}</Text></Pressable>)}</View>
      {answer ? <View testID="home-sofia-answer" style={{flexDirection: 'row', gap: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: answer.error ? c.danger : c.line, borderRadius: 14, padding: 14}}>
        <View style={{width: 24, height: 24, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center'}}><Icon name="sofia" size={14} color={c.onAccent} active /></View>
        <View style={{flex: 1, gap: 8}}>
          <Text style={{color: c.muted, fontSize: 12}}>{answer.q}</Text>
          {answer.a ? <Text selectable style={{color: answer.error ? c.danger : c.text, fontSize: 14, lineHeight: 21}}>{answer.a}</Text> : <Text style={{color: c.muted, fontSize: 14}}>A Sofia está pensando…</Text>}
          {answer.a ? <View style={{flexDirection: 'row', gap: 18}}><Pressable accessibilityRole="link" onPress={onContinue}><Text style={{color: c.accent, fontSize: 13, fontWeight: '600'}}>Continuar na Conversa →</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setAnswer(null)}><Text style={{color: c.muted, fontSize: 13}}>Fechar</Text></Pressable></View> : null}
        </View>
      </View> : null}
    </View>
  </View>;
}
