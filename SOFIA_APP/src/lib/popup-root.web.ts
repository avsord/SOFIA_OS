// 07/11/2026: desenha um componente do site dentro de uma janela separada do navegador (o editor de Word da Sofia aberto
// fora da Sofia). Raiz React propria no documento da janela: os eventos funcionam la dentro.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {createRoot} = require('react-dom/client') as {createRoot: (el: Element) => {render: (e: unknown) => void; unmount: () => void}};
import type React from 'react';
export function mountInWindow(win: Window, element: React.ReactElement): () => void {
  const host = win.document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column';
  win.document.body.appendChild(host); const root = createRoot(host); root.render(element);
  let done = false; const stop = () => {if (done) return; done = true; try {root.unmount();} catch {}};
  win.addEventListener('pagehide', stop); win.addEventListener('beforeunload', stop);
  return stop;
}
