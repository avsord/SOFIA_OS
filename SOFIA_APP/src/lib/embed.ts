// 08/11/2026 (Pedro: pagina dentro do Quadro "como um iframe"): /paginas/<id>?embed=1 abre so a pagina, sem barra lateral nem
// barra de cima, com todas as funcoes (abrir PDF/Word, editar, compartilhar). O cartao de pagina do Quadro usa isso.
import {Platform} from 'react-native';
export const EMBED = Platform.OS === 'web' && typeof location !== 'undefined' && /[?&]embed=1(&|$)/.test(location.search);

// 08/11/2026 (Pedro, "igual ao Weje"): dentro do cartao do Quadro, segurar a rodinha e arrastar anda pelo QUADRO e Ctrl+rodinha
// da zoom no quadro (o navegador entrega o mouse a esta pagina; ela repassa ao quadro). Coordenadas de tela (nao mudam ao andar).
if (EMBED && typeof window !== 'undefined' && window.parent !== window) {
  const send = (m: object) => {try {window.parent.postMessage({sofia: 'board-nav', ...m}, location.origin);} catch {}};
  let panning = false;
  window.addEventListener('mousedown', e => {if (e.button !== 1) return; e.preventDefault(); panning = true; send({kind: 'pan-start', sx: e.screenX, sy: e.screenY});}, true);
  window.addEventListener('mousemove', e => {if (panning) send({kind: 'pan-move', sx: e.screenX, sy: e.screenY});}, true);
  const end = () => {if (panning) {panning = false; send({kind: 'pan-end'});}};
  window.addEventListener('mouseup', end, true); window.addEventListener('blur', end);
  window.addEventListener('wheel', e => {if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); send({kind: 'zoom', x: e.clientX, y: e.clientY, dy: e.deltaY * (e.deltaMode === 1 ? 16 : 1)});}, {passive: false, capture: true});
}
