// 14/11/2026 (Pedro: "aparecer sinal de capslock na senha"): so no site; vale enquanto o campo de senha esta em foco.
import {useEffect, useState} from 'react';
import {Platform} from 'react-native';
export function useCapsLock(focused: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const d = (globalThis as any).document;
    if (Platform.OS !== 'web' || !focused || !d?.addEventListener) {setOn(false); return;}
    const h = (e: KeyboardEvent) => {if (typeof e.getModifierState === 'function' && e.key !== 'CapsLock' || e.key === 'CapsLock') setOn(e.getModifierState('CapsLock'));};
    d.addEventListener('keydown', h); d.addEventListener('keyup', h);
    return () => {d.removeEventListener('keydown', h); d.removeEventListener('keyup', h);};
  }, [focused]);
  return on && focused;
}
export const CAPS_MESSAGE = 'Caps Lock ligado';
