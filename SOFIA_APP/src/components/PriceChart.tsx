import React, {useState} from 'react';
import {View, Text} from 'react-native';
import Svg, {Path, Line, Circle} from 'react-native-svg';
import {useTheme} from '../lib/theme';
import {chartGeometry, svgPath, money} from '../lib/monitoring';
import type {ChartLine, ChartMode, Window} from '../lib/monitoring';

const shortDate = (t: number) => new Date(t).toLocaleDateString('pt-BR', {day: '2-digit', month: 'short'}).replace('.', '');

/** X = tempo, Y = preço (ou variação %). Uma linha por produto/loja, em
 * degraus: o preço vale até a próxima leitura. Sem leitura, sem linha. */
export function PriceChart({lines, height = 200, window = '30d', mode = 'price', currency = 'BRL', axes = true, empty = 'Ainda sem leituras neste período.', refs = []}:
  {lines: ChartLine[]; height?: number; window?: Window; mode?: ChartMode; currency?: string; axes?: boolean; empty?: string; refs?: Array<{value: number; color: string}>}) {
  const c = useTheme(), [width, setWidth] = useState(0);
  const labelW = axes ? (mode === 'change' ? 44 : 64) : 0;
  const g = width ? chartGeometry(lines, {width: width - labelW, height, window, mode, pad: {l: 6, r: 10, t: 10, b: axes ? 8 : 6}, refs: refs.map(r => r.value)}) : null;
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
            <Svg width={g.width} height={height}>
              {axes ? g.yTicks.map(t => <Line key={t.value} x1={0} x2={g.width} y1={t.y} y2={t.y} stroke={c.line} strokeWidth={1} strokeDasharray={mode === 'change' && t.value === 0 ? undefined : '3 5'} />) : null}
              {g.refY.map((y, i) => <Line key={'r' + i} x1={0} x2={g.width} y1={y} y2={y} stroke={refs[i]?.color || c.muted} strokeWidth={1.2} strokeDasharray="6 4" opacity={0.8} />)}
              {g.lines.map(l => <Path key={l.id} d={svgPath(l.path)} stroke={l.color} strokeWidth={axes ? 2.4 : 2} fill="none" strokeLinejoin="round" strokeLinecap="round" />)}
              {g.lines.map(l => l.last ? <Circle key={'d' + l.id} cx={l.last[0] - 1} cy={l.last[1]} r={axes ? 4 : 3} fill={l.color} stroke={c.surface} strokeWidth={2} /> : null)}
            </Svg>
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
