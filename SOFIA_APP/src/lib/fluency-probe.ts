// 06/11/2026 (Pedro: "precisamos ver uma forma pra voce arrumar essas coisas sem ficar enchendo o saco"): gravador invisivel
// de fluidez do Inicio, so no site. Por ~20 s depois de abrir o Inicio anota o que pulou (parte, quantos px, quando), o que
// foi apagado e redesenhado, as animacoes que reiniciaram e as travadas da pagina, e manda um relatorio para o registro do
// servidor (lido pelo agente no Railway). Grava so posicoes, tamanhos, tempos e nomes de partes (testID): nunca texto do
// usuario, titulos, valores ou ids. Uma vez por carregamento da pagina.
import {Platform} from 'react-native';

type Api = {diagFluidez(body: unknown): Promise<unknown>};
let started = false;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Nome da parte sem conteudo: tag, testID mais proximo (ate 6 niveis), papel e tamanho. */
function part(node: Node | null | undefined): string {
  const e = (node && (node.nodeType === 1 ? node : node.parentElement)) as HTMLElement | null;
  if (!e || !e.getBoundingClientRect) return '?';
  let id = '', x: HTMLElement | null = e;
  for (let i = 0; i < 6 && x; i++, x = x.parentElement) { const t = x.getAttribute?.('data-testid'); if (t) { id = (i ? '<' : '') + t.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, 'ID').slice(0, 40); break; } }
  const role = e.getAttribute('role') || '', b = e.getBoundingClientRect();
  return [e.tagName.toLowerCase(), id, role, Math.round(b.width) + 'x' + Math.round(b.height) + '@' + Math.round(b.left) + ',' + Math.round(b.top)].filter(Boolean).join(' ');
}

export function startHomeProbe(api: Api, durationMs = 20000) {
  if (started || Platform.OS !== 'web' || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
  started = true;
  try {
    const t0 = performance.now(), at = () => Math.round(performance.now() - t0);
    const shifts: unknown[] = [], longs: number[][] = [], greet: unknown[] = [], churn: Record<string, number> = {}, removed: string[] = [], restarts: string[] = [];
    let frames = 0, worstGap = 0, lastFrame = 0, lastG: number[] | null = null, stop = false;
    const obs: PerformanceObserver[] = [];
    const watch = (type: string, fn: (e: any) => void) => { try { const o = new PerformanceObserver(l => { for (const e of l.getEntries()) fn(e); }); o.observe({type, buffered: false} as any); obs.push(o); } catch { /* navegador sem esse tipo */ } };
    watch('layout-shift', e => { if (shifts.length < 60) shifts.push({t: at(), v: r1(e.value * 1000) / 1000, input: !!e.hadRecentInput, src: (e.sources || []).slice(0, 4).map((s: any) => ({part: part(s.node), from: [Math.round(s.previousRect.x), Math.round(s.previousRect.y), Math.round(s.previousRect.width), Math.round(s.previousRect.height)], to: [Math.round(s.currentRect.x), Math.round(s.currentRect.y), Math.round(s.currentRect.width), Math.round(s.currentRect.height)]}))}); });
    watch('longtask', e => { if (longs.length < 80) longs.push([Math.round(e.startTime - t0), Math.round(e.duration)]); });
    // partes apagadas e recriadas (piscada): conta por segundo e descreve as primeiras
    const mo = new MutationObserver(ms => { for (const m of ms) for (const n of Array.from(m.removedNodes)) { if (n.nodeType !== 1) continue; const s = String(Math.floor(at() / 1000)); churn[s] = (churn[s] || 0) + 1; if (removed.length < 40) removed.push(at() + ' ' + part(m.target)); } });
    mo.observe(document.body, {subtree: true, childList: true});
    // saudacao: cada salto > 0,4 px entre quadros (a subida aprovada e continua e bem menor por quadro)
    const seen = new Map<string, number>();
    const frame = () => {
      if (stop) return; const now = performance.now(); frames++; if (lastFrame) worstGap = Math.max(worstGap, now - lastFrame); lastFrame = now;
      const h = Array.from(document.querySelectorAll('[role=heading]')).find(e => /^(Bom|Boa)\b/.test(e.textContent || '')) as HTMLElement | undefined;
      if (h) { const b = h.getBoundingClientRect(), g = [b.left, b.top, b.width, b.height, Number(getComputedStyle(h.parentElement || h).opacity)];
        if (lastG && greet.length < 80 && (Math.abs(g[1] - lastG[1]) > 0.4 || Math.abs(g[0] - lastG[0]) > 0.4 || Math.abs(g[2] - lastG[2]) > 0.4 || Math.abs(g[3] - lastG[3]) > 0.4)) greet.push({t: at(), dx: r1(g[0] - lastG[0]), dy: r1(g[1] - lastG[1]), dw: r1(g[2] - lastG[2]), dh: r1(g[3] - lastG[3]), top: r1(g[1]), font: getComputedStyle(h).fontFamily.slice(0, 30)});
        lastG = g; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    // animacoes que reiniciam (pisca-pisca): a cada 500 ms compara o inicio de cada animacao por parte
    const anim = setInterval(() => { try { for (const a of document.getAnimations() as any[]) { const k = (a.animationName || a.constructor?.name || 'anim') + ' ' + part(a.effect?.target); const s = Number(a.startTime); if (!Number.isFinite(s)) continue; const prev = seen.get(k); if (prev !== undefined && Math.abs(prev - s) > 50 && restarts.length < 40) restarts.push(at() + ' ' + k); seen.set(k, s); } } catch { /* sem getAnimations */ } }, 500);
    setTimeout(() => {
      stop = true; clearInterval(anim); mo.disconnect(); for (const o of obs) o.disconnect();
      if (document.visibilityState !== 'visible' && frames < 30) return; // aba escondida: relatorio nao representa o que ele ve
      const brief = document.querySelector('[data-testid=home-brief]');
      void api.diagFluidez({v: 1, ms: durationMs, screen: [innerWidth, innerHeight, devicePixelRatio], hour: new Date().getHours(), ua: navigator.userAgent.replace(/\([^)]*\)/g, '').slice(0, 120),
        fps: Math.round(frames / (durationMs / 1000)), worstFrameMs: Math.round(worstGap), nodes: document.getElementsByTagName('*').length, briefNodes: brief ? brief.getElementsByTagName('*').length : 0,
        shifts, longs, greet, churn, removed, restarts}).catch(() => undefined);
    }, durationMs);
  } catch { /* o gravador nunca pode atrapalhar o Inicio */ }
}
