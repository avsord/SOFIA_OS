import type {PriceReaderMessage} from './price-extractor';
import type {MercadoLivreApi, MercadoLivreOptions, MercadoLivreReading, MercadoLivreIdentity} from './mercado-livre-types';
import {isMercadoLivreUrl} from './price-provider';
export {isMercadoLivreUrl} from './price-provider';
export type StoreReadMessage = (Extract<PriceReaderMessage, {ok: true}> & {mercadoLivre?: MercadoLivreReading}) | {ok: false; error: string; code?: string; keepLastPrice?: boolean};
const failed = (code: string, error: string): StoreReadMessage => ({ok: false, code, error, keepLastPrice: true});
export function identityOf(r: MercadoLivreReading): MercadoLivreIdentity {
  return {provider: 'mercadolivre', itemId: r.itemId, catalogProductId: r.catalogProductId, identityKey: r.identityKey, sellerId: r.seller.id, sellerName: r.seller.name, normalizedUrl: r.normalizedUrl, priceBasis: 'product_excluding_shipping'};
}
export function storedMLIdentity(raw: unknown, source: string): MercadoLivreIdentity | undefined {
  try { const data = JSON.parse(typeof raw === 'string' ? raw : '{}'); return data?.[source]; } catch { return undefined; }
}
/** Null means ONLY another provider, never a failed Mercado Livre request. */
export async function readDirect(url: string, api: MercadoLivreApi, options: MercadoLivreOptions = {}): Promise<StoreReadMessage | null> {
  if (!isMercadoLivreUrl(url)) return null;
  if (options.signal?.aborted) return failed('CANCELLED', 'Leitura cancelada.');
  try {
    const result = await api.readMercadoLivre(url, options);
    if (options.signal?.aborted) return failed('CANCELLED', 'Leitura cancelada.');
    if (!result?.ok) return failed(result?.code || 'INVALID_RESPONSE', result?.message || 'O servidor não retornou uma leitura válida.');
    const r = result.reading;
    // 06/11/2026 (Pedro: "esse ja esta lendo mas ta dizendo que nao esta"): a mensagem diz QUAL conferencia falhou (so o nome
    // do campo, nunca conteudo), para achar a causa na primeira tentativa
    const bad = !r ? ['leitura'] : [
      r.provider !== 'mercadolivre' && 'loja', !/^MLB\d{6,16}$/.test(r.itemId) && 'anúncio', r.identityKey !== 'mercadolivre:' + r.itemId && 'identidade',
      !/^\d{1,20}$/.test(r.seller?.id) && 'vendedor', !r.title && 'título', !r.seller?.name && 'nome do vendedor',
      (!Number.isSafeInteger(r.amountCents) || r.amountCents <= 0 || r.amountCents > 1e10) && 'preço', r.currency !== 'BRL' && 'moeda',
      (!Number.isFinite(Date.parse(r.observedAt)) || Date.parse(r.observedAt) > Date.now() + 60000) && 'data', !isMercadoLivreUrl(r.normalizedUrl) && 'link'].filter(Boolean);
    if (bad.length) return failed('INVALID_RESPONSE', 'Identidade, preço ou data inválidos; leitura descartada. [' + bad.join(', ') + ']');
    if (options.expectedSellerId && options.expectedSellerId !== r.seller.id) return failed('SELLER_MISMATCH', 'O vendedor mudou; leitura descartada.');
    const best = {amount: r.amountCents / 100, currency: 'BRL', origins: ['mercadolivre:html:' + r.itemId], confidence: 1};
    return {ok: true, title: r.title, mercadoLivre: r, result: {found: true, needsConfirmation: false, best, candidates: [best]}};
  } catch (error: any) {
    if (options.signal?.aborted || error?.code === 'CANCELLED') return failed('CANCELLED', 'Leitura cancelada.');
    return failed(error?.status === 404 ? 'READER_NOT_AVAILABLE' : String(error?.code || 'NETWORK'), error?.status === 404 ? 'O servidor ainda precisa receber o leitor do Mercado Livre.' : 'Não consegui consultar a Sofia. O último preço foi preservado.');
  }
}
/** Every collection entry point uses the same dispatch, including failures. */
export async function readStorePrice(url: string, api: MercadoLivreApi, browserRead: (url: string) => Promise<PriceReaderMessage>, options: MercadoLivreOptions = {}): Promise<StoreReadMessage> {
  if (options.signal?.aborted) return failed('CANCELLED', 'Leitura cancelada.');
  const direct = await readDirect(url, api, options);
  if (direct !== null) return direct;
  return browserRead(url);
}
