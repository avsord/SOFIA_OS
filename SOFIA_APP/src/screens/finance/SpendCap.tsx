// 0.3.310 (Pedro): Controle de gastos = o TETO que a pessoa define para o mes x as despesas que ela lanca fora as
// contas (avulsas e compras no cartao; sem contas a pagar e sem o que se repete). A engrenagem ao lado do titulo muda
// o teto deste mes; mes sem teto usa o ultimo definido. Mesmo numero do "Despesas de ..." do Inicio.
import React, {useMemo, useState} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import {useTheme} from '../../lib/theme';
import type {SofiaApi} from '../../lib/api';
import {looseExpenses, monthLabel, spendCapFor, type Account} from '../../lib/finance';
import type {Data} from './core';
import {Icon} from '../../components/Icon';
import {PALETTE} from '../../lib/palette';

const parseMoney = (v: string) => {const n = Number(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : NaN;};

export function SpendCapCard({api, d, month, accountId, account, show, reload, style, onOpen}: {api: SofiaApi; d: Data; month: string; accountId: string; account: Account | undefined; show: (v: number) => string; reload: () => void; style?: any; onOpen?: () => void}) {
  const c = useTheme(), [editing, setEditing] = useState(false), [value, setValue] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const spent = useMemo(() => Math.round(looseExpenses(d.txs, month, accountId).reduce((s, t) => s + t.amount, 0) * 100) / 100, [d, month, accountId]);
  const cap = spendCapFor(account, month), pct = cap > 0 ? Math.round(spent / cap * 100) : 0;
  const color = pct > 100 ? c.danger : pct >= 80 ? c.warn : PALETTE.green;
  const save = async () => {
    const n = parseMoney(value); if (!Number.isFinite(n)) {setErr('Digite um valor, ex.: 2.000'); return;}
    if (!account?.entity) {setErr('Sem conta para guardar o teto.'); return;}
    setBusy(true); setErr('');
    try {
      const caps = {...(account.spendCaps || {}), [month]: n};
      await api.saveEntity({...account.entity, data: {...account.entity.data, spend_caps_json: JSON.stringify(caps)}, revision: account.entity.revision});
      setEditing(false); reload();
    } catch (e: any) {setErr(String(e?.message || 'Não deu para salvar.'));} finally {setBusy(false);}
  };
  return <View testID="fin-control" style={[{backgroundColor: c.surface, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: pct > 100 ? c.danger : c.line}, style]}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
      <Text style={{flex: 1, color: c.text, fontWeight: '600', fontSize: 14}}>Controle de gastos</Text>
      <Text style={{color: c.muted, fontSize: 12, textTransform: 'capitalize'}}>{monthLabel(month).split(' ')[0]}</Text>
      <Pressable testID="fin-cap-gear" accessibilityRole="button" accessibilityLabel="Definir o teto de gastos do mês" hitSlop={8} onPress={() => {setValue(cap ? String(cap).replace('.', ',') : ''); setErr(''); setEditing(v => !v);}} style={({hovered}: any) => ({width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered || editing ? c.input : 'transparent'})}>
        <Icon name="settings" size={15} color={editing ? c.accent : c.muted} />
      </Pressable>
    </View>
    {editing ? <View style={{gap: 8}}>
      <Text style={{color: c.muted, fontSize: 12}}>Quanto você quer gastar em {monthLabel(month).split(' ')[0].toLowerCase()}, fora as contas?</Text>
      <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
        <View style={{flex: 1, flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 10, backgroundColor: c.input, paddingHorizontal: 12, gap: 6}}>
          <Text style={{color: c.muted, fontSize: 14}}>R$</Text>
          <TextInput testID="fin-cap-input" autoFocus value={value} onChangeText={setValue} onSubmitEditing={() => void save()} keyboardType="decimal-pad" placeholder="2.000" placeholderTextColor={c.muted} style={{flex: 1, color: c.text, fontSize: 16, outlineStyle: 'none'} as any} />
        </View>
        <Pressable accessibilityRole="button" onPress={() => void save()} disabled={busy} style={({hovered}: any) => ({height: 40, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center', backgroundColor: c.accent, opacity: busy ? 0.6 : hovered ? 0.9 : 1})}><Text style={{color: c.onAccent, fontWeight: '600', fontSize: 13}}>{busy ? 'Salvando…' : 'Salvar'}</Text></Pressable>
      </View>
      {err ? <Text style={{color: c.danger, fontSize: 12}}>{err}</Text> : null}
    </View> : <Pressable accessibilityRole={onOpen ? 'button' : undefined} onPress={onOpen} disabled={!onOpen} style={{gap: 8}}>
      <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 6}}>
        <Text style={{color: c.text, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums']}}>{show(spent)}</Text>
        {cap > 0 ? <Text style={{color: c.muted, fontSize: 12}}>de {show(cap)}</Text> : null}
        <View style={{flex: 1}} />
        {cap > 0 ? <Text style={{color, fontWeight: '700'}}>{pct}%</Text> : null}
      </View>
      <View style={{height: 7, borderRadius: 4, backgroundColor: c.line}}>{cap > 0 ? <View style={{width: (Math.min(100, Math.max(1, pct)) + '%') as any, height: 7, borderRadius: 4, backgroundColor: color}} /> : null}</View>
      <Text style={{color: c.muted, fontSize: 12}}>{month > new Date().toISOString().slice(0, 7) ? monthLabel(month).split(' ')[0] + ' ainda não começou. Os números passam a contar quando o mês chegar.' : cap > 0 ? (spent <= cap ? 'Ainda pode gastar ' + show(Math.round((cap - spent) * 100) / 100) + ' neste mês, fora as contas.' : 'Passou ' + show(Math.round((spent - cap) * 100) / 100) + ' do teto do mês.') : 'Toque na engrenagem para definir quanto quer gastar no mês, fora as contas.'}</Text>
    </Pressable>}
  </View>;
}
