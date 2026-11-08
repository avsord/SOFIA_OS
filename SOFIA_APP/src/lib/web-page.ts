/** 0.3.260 (rodada premium, fase 2): o site se comporta como site.
 * - Teclado rola a tela: Page Down/Up, espaco, Home e End rolam a area principal (antes so a rodinha, e so em cima dela).
 * - Imprimir: a pagina sai inteira (sem menu nem barras), em vez de cortada dentro das caixas que rolam.
 * - Clique com o botao direito faz o mesmo que "segurar" no celular: ver rightClick() abaixo, ligado em cada lugar. */
let installed = false;
const typing = (el: Element | null) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el as HTMLElement).isContentEditable);
function mainScroller(): HTMLElement | null {
  const cx = window.innerWidth * 0.6, cy = window.innerHeight * 0.5;
  let el = document.elementFromPoint(cx, cy) as HTMLElement | null;
  while (el && el !== document.body) {
    const st = getComputedStyle(el);
    if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 4) return el;
    el = el.parentElement;
  }
  return null;
}
export function installWebPage() {
  if (installed || typeof document === 'undefined' || typeof window === 'undefined') return; installed = true;
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(document.activeElement)) return;
    if (document.querySelector('[aria-modal="true"]')) return;
    const keys: Record<string, number> = {PageDown: 0.85, PageUp: -0.85, ' ': e.shiftKey ? -0.85 : 0.85};
    const sc = (k: string) => mainScroller();
    if (e.key in keys) { const s = sc(e.key); if (!s) return; e.preventDefault(); s.scrollBy({top: s.clientHeight * keys[e.key], behavior: 'smooth'}); }
    else if (e.key === 'Home' || e.key === 'End') { const s = sc(e.key); if (!s) return; e.preventDefault(); s.scrollTo({top: e.key === 'Home' ? 0 : s.scrollHeight, behavior: 'smooth'}); }
  });
  // 0.3.263: onde foi o ultimo clique (as janelas pequenas abrem perto dele, como menu)
  document.addEventListener('pointerdown', e => { (window as any).__sofiaPointer = {x: e.clientX, y: e.clientY, t: Date.now()}; }, true);
  // 0.3.263: Enter num campo de uma linha confirma a janela/formulario (o botao principal mais proximo)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || e.isComposing) return;
    const el = document.activeElement as HTMLElement | null;
    if (!el || el.tagName !== 'INPUT') return;
    const scope = (el.closest('[aria-modal="true"]') || el.closest('[data-testid="side-peek"]') || document.body) as HTMLElement;
    const buttons = [...scope.querySelectorAll('[data-primary="1"]')].filter(b => { const r = (b as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && (b as HTMLElement).getAttribute('aria-disabled') !== 'true'; }) as HTMLElement[];
    if (!buttons.length) return;
    const after = buttons.filter(b => el.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    e.preventDefault(); (after[0] || buttons[buttons.length - 1]).click();
  });
  // 0.3.263: a rodinha rola a area principal de qualquer lugar (antes, fora da caixa que rola, nada acontecia)
  document.addEventListener('wheel', e => {
    // 08/11/2026 (Pedro: "o scroll confunde movimentando o conteudo"): no Quadro a rodinha e do quadro (ele ja tratou); antes isto rolava
    // tambem o conteudo de uma janela (o Word) achando que era a area principal
    if (e.defaultPrevented || (e.target as HTMLElement | null)?.closest?.('[data-testid="page-board"]')) return;
    let el = e.target as HTMLElement | null;
    while (el && el !== document.body) { const st = getComputedStyle(el); if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 2) return; el = el.parentElement; }
    if (document.querySelector('[aria-modal="true"]')) return;
    const s = mainScroller(); if (s) s.scrollBy({top: e.deltaY});
  }, {passive: true});
  const st = document.createElement('style'); st.id = 'sofia-print';
  st.textContent = '@media print{html,body,#root{height:auto!important;overflow:visible!important}*{overflow:visible!important;max-height:none!important}[data-print-hide],[aria-label="Menu"],[aria-label="Barra lateral"],nav{display:none!important}}';
  document.head.appendChild(st);
}

/** Clique direito no site = "segurar" no celular. Uso: <Pressable onLongPress={fn} {...rightClick(fn)}>. No app nao faz nada. */
export function rightClick(fn: () => void): Record<string, unknown> {
  if (typeof document === 'undefined') return {};
  return {onContextMenu: (e: {preventDefault?: () => void}) => { e?.preventDefault?.(); fn(); }};
}
