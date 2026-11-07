// 07/11/2026 (Pedro: "esqueleto na estrutura real da tela"): Finanças enquanto os dados chegam. No computador, o mesmo
// cabecalho (titulo, conta, mes, olho, Conta a pagar), as mesmas abas, os 4 cartoes e as duas colunas de Desk.tsx; no
// celular, os cartoes do Resumo. So os numeros e as linhas viram blocos com brilho. Se Desk.tsx mudar, mude aqui junto.
import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {useTheme} from '../../lib/theme';
import {dpx} from '../../lib/content-width';
import {monthLabel, monthOf, todayISO} from '../../lib/finance';
import {Icon, type IconName} from '../../components/Icon';
import {PrimaryButton} from '../../components/AppKit';
import {DeskTabs} from '../../components/UI';
import {ShimmerBlock, ShimmerGroup} from '../../components/Loading';

const TABS = ['Resumo e extrato', 'Contas', 'Cartões', 'Orçamentos', 'Reserva', 'Devoluções', 'Relatórios', 'Histórico'];

export function FinanceDeskSkeleton() {
  const c = useTheme(), month = monthOf(todayISO()), noop = () => {};
  const bar = (w: number | string, h = 12) => <ShimmerBlock width={w} height={h} />;
  const card = (label: string, icon: IconName, tone?: boolean) => <View style={{flex: 1, minWidth: 180, gap: 6, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: tone ? c.accentSoft : c.surface}}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}><Icon name={icon} size={14} color={c.muted} /><Text style={{color: c.muted, fontSize: 13}}>{label}</Text></View>
    <View style={{height: tone ? 36 : 31, justifyContent: 'center'}}>{bar(tone ? 150 : 120, tone ? 22 : 18)}</View>
    {bar(110, 9)}
  </View>;
  const box = (title: string, rows: number) => <View style={{gap: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}>
    <Text style={{color: c.text, fontSize: 14, fontWeight: '700'}}>{title}</Text>
    {Array.from({length: rows}, (_, i) => <View key={i}>{bar(['82%', '64%', '74%'][i % 3], 10)}</View>)}
  </View>;
  return <View testID="finance-loading" accessibilityLabel="Carregando suas finanças" pointerEvents="none" style={{flex: 1, backgroundColor: c.bg}}><ShimmerGroup>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingLeft: dpx(40), paddingRight: dpx(40), paddingTop: dpx(32), paddingBottom: 40, gap: 18, maxWidth: 1240, width: '100%', alignSelf: 'flex-start'} as any}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <View style={{flex: 1, gap: 9}}><Text style={{color: c.text, fontSize: 28, fontWeight: '600', letterSpacing: -1}}>Finanças</Text>{bar(320)}</View>
        <ShimmerBlock width={140} height={36} radius={11} />
        <View style={{flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}>
          <View style={{padding: 9, transform: [{rotate: '180deg'}]}}><Icon name="chevron" size={15} color={c.text} /></View>
          <Text style={{minWidth: 120, textAlign: 'center', color: c.text, fontWeight: '700', textTransform: 'capitalize'}}>{monthLabel(month)}</Text>
          <View style={{padding: 9}}><Icon name="chevron" size={15} color={c.text} /></View>
        </View>
        <View style={{padding: 9, borderRadius: 11, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}><Icon name="eye" size={16} color={c.text} /></View>
        <PrimaryButton icon="plus" label="Conta a pagar" onPress={noop} />
      </View>
      <DeskTabs value="Resumo e extrato" onChange={noop} options={TABS.map(l => ({value: l, label: l}))} />
      <View style={{gap: 16}}>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 12}}>{card('Saldo', 'wallet', true)}{card('Previsto', 'calendar')}{card('Guardado', 'piggy')}{card('Faturas abertas', 'card')}</View>
        <View style={{flexDirection: 'row', gap: 16, alignItems: 'flex-start'}}>
          <View style={{flex: 1.55, minWidth: 0, gap: 14, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}>
            <View style={{flexDirection: 'row', gap: 10}}><ShimmerBlock width={170} height={30} radius={11} /><View style={{flex: 1}} /><ShimmerBlock width={150} height={30} radius={11} /></View>
            {Array.from({length: 6}, (_, i) => <View key={i} style={{flexDirection: 'row', alignItems: 'center', gap: 12}}><ShimmerBlock width={36} height={36} radius={10} /><View style={{flex: 1, gap: 7}}>{bar([140, 110, 170, 90, 150, 120][i])}{bar(80, 9)}</View>{bar(70)}</View>)}
          </View>
          <View style={{flex: 1, minWidth: 300, gap: 14}}>{box('Próximas contas', 2)}{box('Devoluções a receber', 1)}{box('Controle de gastos', 3)}{box('Orçamentos', 2)}</View>
        </View>
      </View>
    </ScrollView>
  </ShimmerGroup></View>;
}

export function FinancePhoneSkeleton() {
  const c = useTheme();
  const box = () => <View style={{gap: 10, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}><ShimmerBlock width={130} height={12} /><ShimmerBlock width={110} height={18} /><ShimmerBlock width={'90%'} height={8} radius={4} /></View>;
  return <ShimmerGroup><View testID="finance-loading" accessibilityLabel="Carregando suas finanças" style={{gap: 14, paddingHorizontal: 4}}>
    <ShimmerBlock width={'100%'} height={220} radius={22} />
    {box()}{box()}
  </View></ShimmerGroup>;
}
