export const APP_VERSION = '0.3.266';
const RELEASE_PREFIX = 'sofia-android-v';
const RELEASES_API = 'https://api.github.com/repos/avsord/SOFIA_OS/releases';
const DOWNLOAD_ROOT = 'https://github.com/avsord/SOFIA_OS/releases/download/';
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export type UpdateInfo = {version: string; url: string; name: string};
type CheckOptions = {fetcher?: typeof fetch; currentVersion?: string; timeoutMs?: number};
function numbers(version: string): number[] | null {
  const normalized = version.replace(/^v/i, '');
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(normalized)) return null;
  const parts = normalized.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
export function compareVersions(a: string, b: string): number {
  const aa = numbers(a), bb = numbers(b);
  if (!aa || !bb) throw new Error('Número de versão inválido.');
  for (let i = 0; i < 3; i++) {
    if (aa[i] > bb[i]) return 1;
    if (aa[i] < bb[i]) return -1;
  }
  return 0;
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function candidate(value: unknown): UpdateInfo | null {
  const r = record(value);
  if (!r || r.draft !== false || r.prerelease !== false || typeof r.published_at !== 'string'
      || !Number.isFinite(Date.parse(r.published_at)) || typeof r.tag_name !== 'string'
      || !r.tag_name.startsWith(RELEASE_PREFIX)) return null;
  const version = r.tag_name.slice(RELEASE_PREFIX.length);
  if (!numbers(version) || !Array.isArray(r.assets)) return null;
  // Never choose a source ZIP, incomplete asset, another package or another host.
  const url = DOWNLOAD_ROOT + encodeURIComponent(r.tag_name) + '/Sofia-OS.apk';
  const asset = r.assets.map(record).find(a => a?.name === 'Sofia-OS.apk'
    && a.state === 'uploaded' && typeof a.size === 'number' && a.size > 0
    && a.browser_download_url === url);
  if (!asset) return null;
  return {version, url, name: typeof r.name === 'string' ? r.name : `Sofia OS ${version}`};
}
/** Numeric maximum, not array order or lexical sorting: 0.3.10 is newer than 0.3.9. */
export function newestPublishedUpdate(releases: readonly unknown[], currentVersion = APP_VERSION): UpdateInfo | null {
  if (!numbers(currentVersion)) throw new Error('Número de versão instalada inválido.');
  let newest: UpdateInfo | null = null;
  for (const value of releases) {
    const next = candidate(value);
    if (next && (!newest || compareVersions(next.version, newest.version) > 0)) newest = next;
  }
  if (!newest) throw new Error('A consulta não retornou uma versão Android válida. Tente novamente.');
  return compareVersions(newest.version, currentVersion) > 0 ? newest : null;
}
export async function checkForUpdate(options: CheckOptions = {}): Promise<UpdateInfo | null> {
  // 0.3.247: no site nao ha APK para baixar - o navegador recebe a versao nova a cada publicacao
  if (typeof document !== 'undefined') return null;
  const fetcher = options.fetcher || fetch;
  const currentVersion = options.currentVersion || APP_VERSION;
  const timeoutMs = options.timeoutMs ?? 12000;
  const nonce = Date.now();
  async function get(path: string, missingIsEmpty = false): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(RELEASES_API + path + (path.includes('?') ? '&' : '?') + '_=' + nonce, {
        signal: controller.signal, cache: 'no-store',
        headers: {Accept: 'application/vnd.github+json', 'Cache-Control': 'no-cache', Pragma: 'no-cache'},
      });
      if (response.status === 404 && missingIsEmpty) return null;
      if (!response.ok) throw new Error(`Não foi possível consultar atualizações (HTTP ${response.status}). Tente novamente.`);
      return await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw new Error('A verificação de atualização demorou demais. Tente novamente.');
      throw error;
    } finally {clearTimeout(timer);}
  }
  async function list(): Promise<unknown[]> {
    const releases: unknown[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const rows = await get(`?per_page=${PAGE_SIZE}&page=${page}`);
      if (!Array.isArray(rows)) throw new Error('Resposta inválida ao consultar atualizações.');
      releases.push(...rows);
      if (rows.length < PAGE_SIZE) return releases;
    }
    throw new Error('A lista de atualizações está incompleta. Tente novamente.');
  }
  // The latest endpoint is independent of the list's order/cache. Neither is trusted alone
  // to report "up to date" when the list failed or was truncated.
  const [listed, latest] = await Promise.allSettled([list(), get('/latest', true)]);
  const releases = listed.status === 'fulfilled' ? [...listed.value] : [];
  if (latest.status === 'fulfilled' && latest.value) releases.push(latest.value);
  const update = releases.length ? newestPublishedUpdate(releases, currentVersion) : null;
  if (update) return update;
  if (listed.status === 'rejected') throw listed.reason;
  if (!releases.some(value => candidate(value))) throw new Error('Não foi possível confirmar a versão disponível. Tente novamente.');
  return null;
}
