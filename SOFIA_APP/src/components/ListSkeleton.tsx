import React from 'react';
import {View} from 'react-native';
import {useTheme} from '../lib/theme';
import {ShimmerBlock, ShimmerGroup} from './Loading';

/** 07/11/2026 (Pedro: "esqueleto na estrutura real da tela"): a lista de um app enquanto os dados chegam, no MESMO
 * formato da lista de verdade - no computador, um cartao com linhas separadas por fio; no celular, cartoes soltos.
 * A tela continua desenhando o proprio titulo, botoes, abas e campos; so as linhas viram blocos com brilho. */
const W = [62, 48, 70, 40, 56, 66, 44, 52];
export function RowsSkeleton({desktop, rows = 6, lead = 'none', lines = 2, trailing = false, testID = 'list-skeleton'}: {desktop: boolean; rows?: number; lead?: 'none' | 'icon' | 'check'; lines?: 1 | 2; trailing?: boolean; testID?: string}) {
  const c = useTheme();
  const row = (i: number, first: boolean) => <View key={i} style={desktop
    ? {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderColor: c.line}
    : {flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}>
    {lead === 'icon' ? <ShimmerBlock width={34} height={34} radius={9} /> : lead === 'check' ? <ShimmerBlock width={18} height={18} radius={9} /> : null}
    <View style={{flex: 1, gap: 7}}>
      <ShimmerBlock width={(desktop ? 3.6 : 2.6) * W[i % W.length]} height={12} />
      {lines === 2 ? <ShimmerBlock width={(desktop ? 5 : 3.2) * W[(i + 3) % W.length]} height={9} /> : null}
    </View>
    {trailing ? <ShimmerBlock width={58} height={22} radius={11} /> : null}
  </View>;
  return <ShimmerGroup><View testID={testID} accessibilityLabel="Carregando" style={desktop ? {borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: 'hidden'} : {gap: 8}}>
    {Array.from({length: rows}, (_, i) => row(i, i === 0))}
  </View></ShimmerGroup>;
}

/** Uma linha de texto que ainda depende dos dados (legenda embaixo do titulo, contagem). */
export function TextShimmer({width, height = 12, style}: {width: number | string; height?: number; style?: any}) {
  return <ShimmerGroup><ShimmerBlock width={width} height={height} style={style} /></ShimmerGroup>;
}
