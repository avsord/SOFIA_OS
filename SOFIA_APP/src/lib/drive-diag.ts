// 07/11/2026 (Pedro: "tem varios erros no drive, nao quero ficar falando item por item"): registro automatico do Drive.
// Anota o que falhou ou demorou (acao, tipo de arquivo, extensao, tamanho aproximado, codigo e status do erro, tempo) e manda
// em lotes para o registro do servidor, lido pelo agente no Railway. Nunca manda nome, conteudo ou id de arquivo.
import {Platform} from 'react-native';

type Api = {diagDrive(body: unknown): Promise<unknown>};
type Ev = {t: number; op: string; ok: boolean; ms?: number; kind?: string; ext?: string; mb?: number; code?: string; status?: number; msg?: string};
let api: Api | null = null, queue: Ev[] = [], timer: any = null, sent = 0;
const t0 = Date.now();
const flush = () => { timer = null; if (!api || !queue.length || sent > 60) return; const batch = queue.splice(0, 40); sent++;
  void api.diagDrive({v: 1, platform: Platform.OS, screen: typeof window !== 'undefined' ? [window.innerWidth, window.innerHeight] : null, events: batch}).catch(() => undefined); };
export function driveDiagInit(a: Api) {
  api = a;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && !(window as any).__sofiaDriveDiag) {
    (window as any).__sofiaDriveDiag = true;
    window.addEventListener('error', e => { if (location.pathname.includes('/apps/drive')) note('erro-pagina', false, {msg: String(e.message || '').replace(/["'“”][^"'“”]{0,200}["'“”]/g, '"…"').slice(0, 160)}); });
    window.addEventListener('unhandledrejection', e => { if (location.pathname.includes('/apps/drive')) note('promessa', false, {msg: String((e as any).reason?.message || (e as any).reason || '').replace(/["'“”][^"'“”]{0,200}["'“”]/g, '"…"').slice(0, 160)}); });
    window.addEventListener('pagehide', flush);
  }
}
const extOf = (name?: string) => { const m = /\.([a-z0-9]{1,6})$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
/** Anota um evento. `file` so serve para tirar tipo/extensao/tamanho: o nome nunca sai daqui. */
export function note(op: string, ok: boolean, extra: {ms?: number; kind?: string; file?: {name?: string; size?: number | null}; error?: any; msg?: string} = {}) {
  const e: Ev = {t: Math.round((Date.now() - t0) / 1000), op, ok};
  if (extra.ms != null) e.ms = Math.round(extra.ms);
  if (extra.kind) e.kind = extra.kind;
  if (extra.file) { const x = extOf(extra.file.name); if (x) e.ext = x; if (extra.file.size != null) e.mb = Math.round(Number(extra.file.size) / 104857.6) / 10; }
  if (extra.error) { e.code = String(extra.error.code || extra.error.name || '').slice(0, 40) || undefined; const st = Number(extra.error.status); if (st) e.status = st; }
  if (extra.msg) e.msg = extra.msg;
  // so o que interessa: falhas, e acertos que demoraram (lista > 3 s, visualizar > 6 s, envio > 20 s)
  if (ok && !(e.ms != null && e.ms > (op === 'listar' ? 3000 : op.startsWith('enviar') ? 20000 : 6000))) return;
  queue.push(e); if (queue.length > 200) queue.shift();
  if (!timer) timer = setTimeout(flush, ok ? 15000 : 3000);
}
/** Mede uma acao: anota falha (com codigo) ou demora. Repassa o resultado/erro. */
export async function track<T>(op: string, run: () => Promise<T>, extra: {kind?: string; file?: {name?: string; size?: number | null}} = {}): Promise<T> {
  const s = Date.now();
  try { const r = await run(); note(op, true, {...extra, ms: Date.now() - s}); return r; }
  catch (error) { note(op, false, {...extra, ms: Date.now() - s, error}); throw error; }
}
/** Mesma api, com cada chamada do Drive medida (sem guardar argumentos, exceto tipo/tamanho do arquivo enviado). */
export function trackedDriveApi<A extends Record<string, any>>(a: A): A {
  const ops: Record<string, (args: any[]) => string> = {sdList: () => 'listar', sdSearch: () => 'pesquisar', sdCreateFolder: () => 'criar-pasta', sdTrash: () => 'lixeira',
    sdUpdate: args => args[1]?.parent ? 'mover' : 'renomear', sdUpload: () => 'enviar', sdBlob: args => 'abrir-' + (args[1] || 'content'), sdStreamUrl: () => 'link-video'};
  return new Proxy(a, {get(target, prop, recv) {
    const v: any = Reflect.get(target, prop, recv); const op = typeof prop === 'string' ? ops[prop] : undefined;
    if (!op || typeof v !== 'function') return typeof v === 'function' ? v.bind(target) : v;
    return (...args: any[]) => { const f = prop === 'sdUpload' ? {name: args[1]?.name, size: args[1]?.blob?.size ?? null} : undefined; return track(op(args), () => v.apply(target, args), {file: f}); };
  }});
}
