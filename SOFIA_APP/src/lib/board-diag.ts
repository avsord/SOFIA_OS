// 08/11/2026 (Pedro: "faz o mesmo metodo [do Drive] pro quadro"): registro automatico do Quadro. Anota o que falhou ou
// demorou (acao, tipo de item, extensao, tamanho aproximado, codigo e status do erro, tempo, quantos itens no quadro) e manda
// em lotes para o registro do servidor ("[quadro]" no Railway). Nunca manda nome de arquivo, texto, titulo ou id.
import {Platform} from 'react-native';

type Api = {diagBoard(body: unknown): Promise<unknown>};
type Ev = {t: number; op: string; ok: boolean; ms?: number; kind?: string; ext?: string; mb?: number; code?: string; status?: number; msg?: string; n?: number};
let api: Api | null = null, queue: Ev[] = [], timer: any = null, sent = 0, mounted = 0;
const t0 = Date.now();
const flush = () => {timer = null; if (!api || !queue.length || sent > 60) return; const batch = queue.splice(0, 40); sent++;
  void api.diagBoard({v: 1, platform: Platform.OS, screen: typeof window !== 'undefined' ? [window.innerWidth, window.innerHeight] : null, events: batch}).catch(() => undefined);};
const clean = (m: unknown) => String(m || '').replace(/["'“”][^"'“”]{0,200}["'“”]/g, '"…"').replace(/https?:\/\/\S+/g, '<link>').slice(0, 160);
/** O quadro entrou na tela: erros de JavaScript enquanto ele estiver aberto entram no registro. */
export function boardDiagInit(a: Api) {
  api = a; mounted++;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && !(window as any).__sofiaBoardDiag) {
    (window as any).__sofiaBoardDiag = true;
    window.addEventListener('error', e => {if (mounted > 0 && document.querySelector('[data-testid="page-board"]')) note('erro-pagina', false, {msg: clean(e.message)});});
    window.addEventListener('unhandledrejection', e => {if (mounted > 0 && document.querySelector('[data-testid="page-board"]')) note('promessa', false, {msg: clean((e as any).reason?.message || (e as any).reason)});});
    window.addEventListener('pagehide', flush);
  }
  return () => {mounted = Math.max(0, mounted - 1);};
}
const extOf = (name?: string) => {const m = /\.([a-z0-9]{1,6})$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : '';};
/** Anota um evento. `file` so serve para tirar extensao/tamanho: o nome nunca sai daqui. */
export function note(op: string, ok: boolean, extra: {ms?: number; kind?: string; file?: {name?: string; size?: number | null}; error?: any; msg?: string; n?: number} = {}) {
  const e: Ev = {t: Math.round((Date.now() - t0) / 1000), op, ok};
  if (extra.ms != null) e.ms = Math.round(extra.ms);
  if (extra.kind) e.kind = extra.kind;
  if (extra.n != null) e.n = extra.n;
  if (extra.file) {const x = extOf(extra.file.name); if (x) e.ext = x; if (extra.file.size != null) e.mb = Math.round(Number(extra.file.size) / 104857.6) / 10;}
  if (extra.error) {e.code = String(extra.error.code || extra.error.name || '').slice(0, 40) || undefined; const st = Number(extra.error.status); if (st) e.status = st; if (!e.msg) e.msg = clean(extra.error.message);}
  if (extra.msg) e.msg = clean(extra.msg);
  // so o que interessa: falhas, e acertos que demoraram (abrir o quadro > 2,5 s, itens vivos > 4 s, o resto > 8 s)
  if (ok && !(e.ms != null && e.ms > (op === 'abrir' ? 2500 : op.startsWith('vivo') ? 4000 : 8000))) return;
  queue.push(e); if (queue.length > 200) queue.shift();
  if (!timer) timer = setTimeout(flush, ok ? 15000 : 3000);
}
/** Mede uma acao: anota falha (com codigo) ou demora. Repassa o resultado/erro. */
export async function track<T>(op: string, run: () => Promise<T>, extra: {kind?: string; file?: {name?: string; size?: number | null}; n?: number} = {}): Promise<T> {
  const s = Date.now();
  try {const r = await run(); note(op, true, {...extra, ms: Date.now() - s}); return r;}
  catch (error) {note(op, false, {...extra, ms: Date.now() - s, error}); throw error;}
}
