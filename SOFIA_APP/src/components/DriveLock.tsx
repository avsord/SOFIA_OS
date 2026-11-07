// 07/11/2026 (Pedro: "coloca senha pra acessar o drive, fica aberto por 10 minutos"): porta do Drive. Primeira vez cria a
// senha do Drive; depois pede a senha e o Drive fica aberto 10 minutos (o servidor conta o tempo e recusa com 423 depois).
// Esqueci a senha: cria outra com a senha da conta Sofia.
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import type {DriveLockState, SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {Icon} from './Icon';
import {Btn, Field, LockFrame} from './PageLock';

const listeners = new Set<() => void>();
/** Qualquer tela que recebeu DRIVE_LOCKED chama isto: a porta do Drive fecha e pede a senha de novo. */
export function driveLockedNow() { listeners.forEach(f => f()); }
export function isDriveLocked(e: any) { return e?.code === 'DRIVE_LOCKED' || e?.status === 423; }

export function DriveLock({api, active, children}: {api: SofiaApi; active: boolean; children: React.ReactNode}) {
  const c = useTheme(), [st, setSt] = useState<DriveLockState | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'open' | 'forgot'>('open'), [pw, setPw] = useState(''), [n1, setN1] = useState(''), [n2, setN2] = useState(''), [acc, setAcc] = useState('');
  const timer = useRef<any>(null);
  const apply = useCallback((s: DriveLockState) => {
    setSt(s); clearTimeout(timer.current);
    if (s.hasPassword && !s.locked && s.openMs > 0) timer.current = setTimeout(() => setSt(v => v ? {...v, locked: true, openMs: 0} : v), s.openMs + 500);
  }, []);
  const check = useCallback(() => { api.driveLock().then(apply).catch((e: any) => { setErr(String(e?.message || 'Não deu para abrir o Drive.')); setSt(v => v || {locked: false, hasPassword: true, openMs: 0}); }); }, [api, apply]);
  useEffect(() => { if (active) check(); }, [active, check]);
  useEffect(() => { const f = () => setSt(v => v ? {...v, locked: true, openMs: 0} : v); listeners.add(f); return () => { listeners.delete(f); clearTimeout(timer.current); }; }, []);
  const run = async (fn: () => Promise<DriveLockState>) => { setBusy(true); setErr(''); try { apply(await fn()); setPw(''); setN1(''); setN2(''); setAcc(''); setMode('open'); } catch (e: any) { setErr(String(e?.message || 'Não deu certo.')); } finally { setBusy(false); } };

  if (st && st.hasPassword && !st.locked) return <>{children}</>;
  if (!st) return <View testID="drive-lock-check" style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}><ActivityIndicator color={c.muted} /></View>;
  const first = !st.hasPassword, forgot = mode === 'forgot';
  return <LockFrame testID="drive-locked" title="Drive" text={first ? 'Crie uma senha para o Drive. Depois de digitar a senha, o Drive fica aberto por 10 minutos.' : forgot ? 'Crie uma senha nova para o Drive usando a senha da sua conta Sofia.' : 'O Drive está trancado. Digite a senha do Drive; ele fica aberto por 10 minutos.'}>
      {first || forgot ? <>
        {forgot ? <Field testID="drive-lock-account" value={acc} onChange={setAcc} placeholder="Senha da sua conta Sofia" autoFocus /> : null}
        <Field testID="drive-lock-new" value={n1} onChange={setN1} placeholder="Senha nova do Drive" autoFocus={first} />
        <Field testID="drive-lock-new2" value={n2} onChange={setN2} placeholder="Repetir a senha nova" onSubmit={() => n1.length >= 4 && n1 === n2 && void run(() => api.driveLockSet({password: n1, accountPassword: acc || undefined}))} />
        {n2 && n1 !== n2 ? <Text style={{color: c.muted, fontSize: 12}}>As duas senhas precisam ser iguais.</Text> : null}
        <Btn testID="drive-lock-save" title={first ? 'Criar senha e abrir' : 'Salvar senha nova'} primary busy={busy} disabled={n1.length < 4 || n1 !== n2 || (forgot && !acc)} onPress={() => void run(() => api.driveLockSet({password: n1, accountPassword: acc || undefined}))} />
        {forgot ? <Btn title="Voltar" onPress={() => { setMode('open'); setErr(''); }} /> : null}
      </> : <>
        <Field testID="drive-lock-pw" value={pw} onChange={setPw} placeholder="Senha do Drive" autoFocus onSubmit={() => pw && void run(() => api.driveLockOpen(pw))} />
        <Btn testID="drive-lock-go" title="Abrir o Drive" primary busy={busy} disabled={!pw} onPress={() => void run(() => api.driveLockOpen(pw))} />
        <Pressable accessibilityRole="button" onPress={() => { setMode('forgot'); setErr(''); }} style={{alignSelf: 'center', padding: 6}}><Text style={{color: c.accent, fontSize: 13}}>Esqueci a senha</Text></Pressable>
      </>}
      {err ? <Text testID="drive-lock-error" style={{color: c.danger, fontSize: 12, textAlign: 'center'}}>{err}</Text> : null}
  </LockFrame>;
}
