import React, {useEffect, useRef, useState} from 'react';
import {View, Text, Platform} from 'react-native';
import Svg, {Path, Line, Circle} from 'react-native-svg';
import {useTheme} from '../lib/theme';
import {chartGeometry, svgPath, money} from '../lib/monitoring';
import type {ChartLine, ChartMode, Window} from '../lib/monitoring';

const shortDate = (t: number) => new Date(t).toLocaleDateString('pt-BR', {day: '2-digit', month: 'short'}).replace('.', '');

/** X = tempo, Y = preço (ou variação %). Uma linha por produto/loja, em
 * degraus: o preço vale até a próxima leitura. Sem leitura, sem linha. */
export function PriceChart({lines, height = 200, window = '30d', mode = 'price', currency = 'BRL', axes = true, empty = 'Ainda sem leituras neste período.', refs = [], names = {}}:
  {lines: ChartLine[]; height?: number; window?: Window; mode?: ChartMode; currency?: string; axes?: boolean; empty?: string; refs?: Array<{value: number; color: string}>; names?: Record<string, string>}) {
  const c = useTheme(), [width, setWidth] = useState(0), [hx, setHx] = useState<number | null>(null), area = useRef<View>(null);
  const labelW = axes ? (mode === 'change' ? 44 : 64) : 0;
  const g = width ? chartGeometry(lines, {width: width - labelW, height, window, mode, pad: {l: 6, r: 10, t: 10, b: axes ? 8 : 6}, refs: refs.map(r => r.value)}) : null;
  // 0.3.299 (Pedro): passando o mouse no grafico, uma previa com a data e o valor de cada produto naquele ponto
  useEffect(() => {
    const el: any = area.current; if (Platform.OS !== 'web' || !axes || !el || !el.addEventListener) return;
    const move = (e: MouseEvent) => {const r = el.getBoundingClientRect(); setHx(e.clientX - r.left);};
    const leave = () => setHx(null);
    el.addEventListener('mousemove', move); el.addEventListener('mouseleave', leave);
    return () => {el.removeEventListener('mousemove', move); el.removeEventListener('mouseleave', leave);};
  }, [axes, width]);
  const fmt = (v: number) => mode === 'change' ? (v > 0 ? '+' : '') + Math.round(v) + '%' : money(v, currency).replace(/,00$/, '');
  return (
    <View onLayout={e => {const w = Math.round(e.nativeEvent.layout.width); if (w > 0) setWidth(w);}} style={{minHeight: height + (axes ? 18 : 0)}}>
      {!width ? null : !g ? (
        <View style={{height, alignItems: 'center', justifyContent: 'center'}}><Text style={{color: c.muted, fontSize: 12}}>{empty}</Text></View>
      ) : (
        <>
          <View style={{flexDirection: 'row'}}>
            {axes ? (
              <View style={{width: labelW, height}}>
                {g.yTicks.map(t => <Text key={t.value} style={{position: 'absolute', top: t.y - 7, right: 6, fontSize: 10, color: c.muted}}>{fmt(t.value)}</Text>)}
              </View>
            ) : null}
            <View ref={area} style={{position: 'relative'}}>
            <Svg width={g.width} height={height}>
              {axes ? g.yTicks.map(t => <Line key={t.value} x1={0} x2={g.width} y1={t.y} y2={t.y} stroke={c.line} strokeWidth={1} strokeDasharray={mode === 'change' && t.value === 0 ? undefined : '3 5'} />) : null}
              {g.refY.map((y, i) => <Line key={'r' + i} x1={0} x2={g.width} y1={y} y2={y} stroke={refs[i]?.color || c.muted} strokeWidth={1.2} strokeDasharray="6 4" opacity={0.8} />)}
              {g.lines.map(l => <Path key={l.id} d={svgPath(l.path)} stroke={l.color} strokeWidth={axes ? 2.4 : 2} fill="none" strokeLinejoin="round" strokeLinecap="round" />)}
              {g.lines.map(l => l.last ? <Circle key={'d' + l.id} cx={l.last[0] - 1} cy={l.last[1]} r={axes ? 4 : 3} fill={l.color} stroke={c.surface} strokeWidth={2} /> : null)}
              {hx != null && g ? <Line x1={hx} x2={hx} y1={0} y2={height} stroke={c.muted} strokeWidth={1} strokeDasharray="2 4" /> : null}
            </Svg>
            {hx != null && g ? (() => {
              const padL = 6, padR = 10, t = g.x0 + Math.max(0, Math.min(1, (hx - padL) / (g.width - padL - padR))) * (g.x1 - g.x0);
              const rows = lines.map(l => {const p = [...l.points].filter(x => x.t <= t).at(-1); return p ? {id: l.id, color: l.color, v: p.v, at: p.t} : null;}).filter(Boolean) as {id: string; color: string; v: number; at: number}[];
              if (!rows.length) return null;
              const W = 220, left = Math.max(0, Math.min(g.width - W, hx + 12 > g.width - W ? hx - W - 12 : hx + 12));
              return <View pointerEvents="none" style={{position: 'absolute', top: 6, left, width: W, backgroundColor: c.bg, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, gap: 5, boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 10px 30px rgba(0,0,0,0.4)'} as any}>
                <Text style={{fontSize: 11, color: c.muted}}>{new Date(t).toLocaleDateString('pt-BR', {weekday: 'short', day: '2-digit', month: 'short'}).replace('.', '')}</Text>
                {rows.map(r => <View key={r.id} style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <View style={{width: 7, height: 7, borderRadius: 4, backgroundColor: r.color}} />
                  <Text numberOfLines={1} style={{flex: 1, fontSize: 12, color: c.text}}>{names[r.id] || 'Produto'}</Text>
                  <Text style={{fontSize: 12, color: c.text, fontWeight: '600', fontVariant: ['tabular-nums']}}>{money(r.v, currency).replace(/,00$/, '')}</Text>
                </View>)}
              </View>;
            })() : null}
            </View>
          </View>
          {axes ? (
            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginLeft: labelW, marginTop: 4}}>
              {g.xTicks.map((t, i) => <Text key={i} style={{fontSize: 10, color: c.muted}}>{i === 2 ? 'hoje' : shortDate(t.t)}</Text>)}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
