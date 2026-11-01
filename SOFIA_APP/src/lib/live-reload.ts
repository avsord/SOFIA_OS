// 0.3.285 (Pedro: "as notas do site nao estao sincronizadas com o app"): os apps novos (Notas, Listas, Biblioteca,
// Encomendas) so buscavam os dados ao abrir. Agora tambem buscam quando a janela/o app volta para a frente, quando o
// servidor avisa mudanca (subscribeSystemChanged) e a cada 30 s enquanto a tela esta aberta e visivel.
import {useEffect, useRef} from 'react';
import {AppState, Platform} from 'react-native';
import {subscribeSystemChanged} from './system-events';

export function useLiveReload(load: () => unknown, active: boolean, everyMs = 30000) {
  const fn = useRef(load); fn.current = load;
  useEffect(() => {
    if (!active) return;
    let last = 0;
    const run = () => {const now = Date.now(); if (now - last < 1500) return; last = now; void fn.current();};
    const visible = () => Platform.OS !== 'web' || typeof document === 'undefined' || document.visibilityState === 'visible';
    const timer = setInterval(() => {if (visible() && AppState.currentState === 'active') run();}, everyMs);
    const app = AppState.addEventListener('change', s => {if (s === 'active') run();});
    const sys = subscribeSystemChanged(() => run());
    let off = () => {};
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onVis = () => {if (visible()) run();};
      window.addEventListener('focus', onVis); document.addEventListener('visibilitychange', onVis);
      off = () => {window.removeEventListener('focus', onVis); document.removeEventListener('visibilitychange', onVis);};
    }
    return () => {clearInterval(timer); app.remove(); sys(); off();};
  }, [active, everyMs]);
}
