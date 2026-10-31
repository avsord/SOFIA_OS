import React, {useEffect} from 'react';
import {Platform} from 'react-native';
import {PageLoading} from './Loading';

/** Esqueleto que aparece no MESMO toque em que o app é aberto (estilo Notion/
 * Telegram): título real, blocos pulsando no lugar do conteúdo. O conteúdo
 * entra por cima quando estiver pronto — o toque nunca fica "travado". */
export function ModuleSkeleton({title, eyebrow, blocks = [150, 92, 92, 92]}: {title: string; eyebrow?: string; blocks?: number[]}) {
  return <PageLoading testID="module-skeleton" title={title} eyebrow={eyebrow} label={'Abrindo ' + title} rows={Math.max(3, blocks.length + 1)} />;
}

/** Monta o conteúdo pesado um quadro depois do toque, com o esqueleto já na tela. */
export function useAfterFrame(key: string): boolean {
  const [ready, setReady] = React.useState('');
  // 0.3.268 (site): no computador o app abre no mesmo clique (sem os dois quadros de esqueleto que piscavam)
  if (Platform.OS === 'web') return true;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!key) { setReady(''); return; }
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setReady(key)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [key]);
  return ready === key;
}
