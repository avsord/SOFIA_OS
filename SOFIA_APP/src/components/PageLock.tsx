// 06/11/2026 (Pedro: "paginas com senha"; desenho aprovado em 3 telas): trancar (senha + nivel), pagina trancada (destrancar /
// esqueci a senha) e a pergunta quando a pagina tem uma senha escrita ("Quer trancar? Nao, salvar sem senha").
import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, TextInput, View} from 'react-native';
import {useTheme} from '../lib/theme';
import {Icon} from './Icon';
import {OverAll} from '../lib/over-all';
import type {LockLevel} from '../lib/page-lock';

export function Field({value, onChange, placeholder, onSubmit, testID, autoFocus}: {value: string; onChange: (v: string) => void; placeholder: string; onSubmit?: () => void; testID?: string; autoFocus?: boolean}) {
  const c = useTheme(), [f, setF] = useState(false);
  return <TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.muted} secureTextEntry autoFocus={autoFocus} autoCapitalize="none" autoCorrect={false}
    onFocus={() => setF(true)} onBlur={() => setF(false)} onSubmitEditing={onSubmit} accessibilityLabel={placeholder}
    style={{height: 40, borderRadius: 9, borderWidth: 1, borderColor: f ? c.accent : c.line, backgroundColor: c.input, color: c.text, paddingHorizontal: 12, fontSize: 14, outlineStyle: 'none'} as any} />;
}
export function Btn({title, onPress, primary, danger, busy, disabled, testID}: {title: string; onPress: () => void; primary?: boolean; danger?: boolean; busy?: boolean; disabled?: boolean; testID?: string}) {
  const c = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} disabled={disabled || busy} onPress={onPress}
    style={({hovered}: any) => ({height: 36, paddingHorizontal: 14, borderRadius: 9, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1, backgroundColor: primary ? (hovered ? c.accent : c.accent + 'E6') : hovered ? c.line : 'transparent'})}>
    {busy ? <ActivityIndicator size="small" color={primary ? c.onAccent : c.muted} /> : <Text style={{color: primary ? c.onAccent : danger ? c.danger : c.muted, fontSize: 13, fontWeight: '600'}}>{title}</Text>}
  </Pressable>;
}

/** Tela 2: criar a senha e escolher o nivel. */
export function PageLockDialog({title, change, onCancel, onLock}: {title: string; change?: LockLevel; onCancel: () => void; onLock: (password: string, level: LockLevel) => Promise<void>}) {
  const c = useTheme(), [pw, setPw] = useState(''), [pw2, setPw2] = useState(''), [level, setLevel] = useState<LockLevel>(change || 'max'), [ack, setAck] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const ok = pw.length >= 4 && pw === pw2 && (level === 'medium' || ack || !!change);
  const go = async () => {if (!ok) {setErr(pw.length < 4 ? 'Use uma senha com pelo menos 4 caracteres.' : pw !== pw2 ? 'As senhas não são iguais.' : 'Confirme que entendeu: na Máxima, esqueceu a senha = perdeu.'); return;} setBusy(true); setErr(''); try {await onLock(pw, level);} catch (e: any) {setErr(String(e?.message || 'Não foi possível trancar.')); setBusy(false);}};
  const opt = (id: LockLevel, name: string, tag: string, tagColor: string, text: string) => <Pressable testID={'lock-level-' + id} accessibilityRole="radio" accessibilityState={{checked: level === id}} onPress={() => setLevel(id)}
    style={{flexDirection: 'row', gap: 10, padding: 11, borderRadius: 11, borderWidth: 1, borderColor: level === id ? c.accent : c.line, backgroundColor: level === id ? c.accentSoft : 'transparent'}}>
    <View style={{width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: level === id ? c.accent : c.muted, marginTop: 2, alignItems: 'center', justifyContent: 'center'}}>{level === id ? <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent}} /> : null}</View>
    <View style={{flex: 1}}><View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}><Text style={{color: c.text, fontSize: 13, fontWeight: '700'}}>{name}</Text><Text style={{fontSize: 10, fontWeight: '700', color: tagColor, backgroundColor: tagColor + '26', paddingHorizontal: 6, borderRadius: 5, overflow: 'hidden'}}>{tag}</Text></View>
      <Text style={{color: c.muted, fontSize: 12, marginTop: 2}}>{text}</Text></View>
  </Pressable>;
  return <OverAll><View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto', padding: 16} as any}>
    <View testID="page-lock-dialog" {...({role: 'dialog'} as any)} style={{width: 440, maxWidth: '100%', gap: 10, padding: 18, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, boxShadow: '0 20px 50px rgba(0,0,0,.5)'} as any}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><Icon name="lock" size={16} color={c.accent} /><Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 16, fontWeight: '600'}}>{change ? 'Nova senha para' : 'Trancar'} “{title || 'Sem título'}”</Text></View>
      <Text style={{color: c.muted, fontSize: 12}}>A página e as subpáginas dela ficam criptografadas. A Sofia, a busca e o link público não leem o conteúdo.</Text>
      <Field testID="lock-pw" value={pw} onChange={setPw} placeholder="Senha da página" autoFocus />
      <Field testID="lock-pw2" value={pw2} onChange={setPw2} placeholder="Repetir a senha" onSubmit={() => void go()} />
      {change ? null : <>{opt('max', 'Máxima', 'SEM VOLTA', c.danger, 'Só a sua senha abre. Ninguém consegue ler, nem o servidor. Esqueceu a senha, o conteúdo se perde. Tranca na hora ao sair da página.')}
      {opt('medium', 'Média', 'RECUPERÁVEL', c.success, 'Criptografada do mesmo jeito, mas dá para criar senha nova confirmando a senha da sua conta. Fica aberta por 5 min depois de sair.')}
      {level === 'max' ? <Pressable testID="lock-ack" accessibilityRole="checkbox" accessibilityState={{checked: ack}} onPress={() => setAck(v => !v)} style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
        <View style={{width: 16, height: 16, borderRadius: 4, borderWidth: 2, borderColor: ack ? c.accent : c.muted, backgroundColor: ack ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>{ack ? <Icon name="check" size={11} color={c.onAccent} /> : null}</View>
        <Text style={{color: c.text, fontSize: 12}}>Entendi: na Máxima, esqueci a senha = perdi o conteúdo</Text></Pressable> : null}</>}
      {err ? <Text style={{color: c.danger, fontSize: 12}}>{err}</Text> : null}
      <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4}}><Btn title="Cancelar" onPress={onCancel} /><Btn testID="lock-confirm" title={change ? 'Salvar senha nova' : 'Trancar página'} primary busy={busy} disabled={!ok} onPress={() => void go()} /></View>
    </View>
  </View></OverAll>;
}

/** Tela 3: pagina trancada. */
export function PageLockScreen({title, level, onUnlock, onRecover}: {title: string; level: LockLevel; onUnlock: (password: string) => Promise<void>; onRecover: (account: string, newPassword: string) => Promise<void>}) {
  const c = useTheme(), [pw, setPw] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [rec, setRec] = useState(false), [acc, setAcc] = useState(''), [n1, setN1] = useState(''), [n2, setN2] = useState('');
  const run = async (fn: () => Promise<void>) => {setBusy(true); setErr(''); try {await fn();} catch (e: any) {setErr(String(e?.message || 'Não deu certo.')); setBusy(false);}};
  return <LockFrame testID="page-locked" title={title || 'Sem título'} text={level === 'max' ? 'Esta página está trancada (Máxima). Digite a senha para ver o conteúdo; ao sair da página, ela tranca de novo.' : 'Esta página está trancada (Média). Digite a senha para ver o conteúdo; ela continua aberta por 5 minutos depois que você sair.'}>
      {rec ? <>
        <Text style={{color: c.text, fontSize: 13, fontWeight: '600'}}>Criar senha nova</Text>
        <Field testID="lock-account" value={acc} onChange={setAcc} placeholder="Senha da sua conta Sofia" autoFocus />
        <Field value={n1} onChange={setN1} placeholder="Senha nova da página" />
        <Field value={n2} onChange={setN2} placeholder="Repetir a senha nova" />
        <Btn title="Salvar senha nova" primary busy={busy} disabled={!acc || n1.length < 4 || n1 !== n2} onPress={() => void run(() => onRecover(acc, n1))} />
        <Btn title="Voltar" onPress={() => {setRec(false); setErr('');}} />
      </> : <>
        <Field testID="unlock-pw" value={pw} onChange={setPw} placeholder="Senha da página" autoFocus onSubmit={() => pw && void run(() => onUnlock(pw))} />
        <Btn testID="unlock-go" title="Destrancar" primary busy={busy} disabled={!pw} onPress={() => void run(() => onUnlock(pw))} />
        {level === 'medium' ? <Pressable accessibilityRole="button" onPress={() => {setRec(true); setErr('');}} style={{alignSelf: 'center', padding: 6}}><Text style={{color: c.accent, fontSize: 13}}>Esqueci a senha</Text></Pressable> : null}
      </>}
      {err ? <Text testID="unlock-error" style={{color: c.danger, fontSize: 12, textAlign: 'center'}}>{err}</Text> : null}
  </LockFrame>;
}

/** 07/11/2026 (Pedro: "alinhar a diagramacao de todos que entram com bloqueio, padronizado"): a mesma moldura para toda
 * tela de senha (pagina, Drive, etiqueta de notas): cadeado, titulo, explicacao e campos de 300 px, na mesma altura. */
export function LockFrame({testID, title, text, children, foot}: {testID?: string; title: string; text: string; children: React.ReactNode; foot?: string}) {
  const c = useTheme(), box = useRef<any>(null);
  // 14/11/2026 (Pedro: "quando dou control a na senha pra selecionar tudo seleciona a pagina inteira"): fora de um campo
  // (ex.: depois de "Senha incorreta" o cursor sai do campo), Ctrl+A seleciona a senha, nunca a pagina
  useEffect(() => {const d = (globalThis as any).document; if (!d?.addEventListener) return;
    const key = (e: KeyboardEvent) => {if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'a') return;
      const t = e.target as HTMLElement | null; if (t?.closest?.('input,textarea,[contenteditable="true"]')) return;
      const root = box.current as HTMLElement | null, inputs = Array.from(root?.querySelectorAll?.('input') || []) as HTMLInputElement[]; if (!inputs.length) return;
      e.preventDefault(); const i = inputs.find(x => x.value) || inputs[0]; i.focus(); i.select();};
    d.addEventListener('keydown', key); return () => d.removeEventListener('keydown', key);}, []);
  return <View ref={box} testID={testID} style={{flex: 1, alignItems: 'center', paddingTop: 80, paddingBottom: 40, paddingHorizontal: 24}}>
    <View style={{width: 58, height: 58, borderRadius: 16, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16}}><Icon name="lock" size={26} color={c.accent} /></View>
    <Text style={{color: c.text, fontSize: 24, fontWeight: '700', textAlign: 'center'}}>{title}</Text>
    <Text style={{color: c.muted, fontSize: 13, textAlign: 'center', maxWidth: 340, marginTop: 6}}>{text}</Text>
    <View style={{width: 300, maxWidth: '100%', gap: 10, marginTop: 18}}>{children}</View>
    {foot ? <Text style={{color: c.muted, fontSize: 12, textAlign: 'center', maxWidth: 340, marginTop: 14}}>{foot}</Text> : null}
  </View>;
}

/** Pergunta quando a pagina tem uma senha escrita (o servidor recusou guardar como texto aberto). */
export function SecretAsk({onLock, onKeep}: {onLock: () => void; onKeep: () => void}) {
  const c = useTheme();
  return <View testID="page-secret-ask" accessibilityRole="alert" style={{marginHorizontal: 16, marginTop: 8, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: c.accent + '55', backgroundColor: c.accentSoft, gap: 10}}>
    <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}><Icon name="lock" size={15} color={c.accent} /><Text style={{flex: 1, color: c.text, fontSize: 13, fontWeight: '600'}}>Esta página tem uma senha escrita. Quer trancar a página com senha?</Text></View>
    <Text style={{color: c.muted, fontSize: 12}}>Trancada, o conteúdo fica criptografado. Sem senha, a página salva normalmente, mas fica fora do que a Sofia (IA) lê.</Text>
    <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap'}}><Btn testID="secret-lock" title="Trancar com senha" primary onPress={onLock} /><Btn testID="secret-keep" title="Não, salvar sem senha" onPress={onKeep} /></View>
  </View>;
}
