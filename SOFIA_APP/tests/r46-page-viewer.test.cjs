'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('Ver a página que a Sofia lê: mesmo endereço e navegador da leitura, nunca abre app, lê o preço dali',()=>{
 const s=read('src/screens/Monitoring.tsx'),v=s.slice(s.indexOf('function PageViewer('));
 assert.ok(s.includes('Ler pelo servidor') && s.includes('Ver a página que a Sofia lê'));assert.ok(s.includes('isMercadoLivreUrl(props.store.url) ? <MercadoLivrePreview'));assert.ok(s.includes('function StorePageViewer('));assert.ok(s.includes("'Ver a página e ler daqui'"));
 assert.ok(v.includes('const target = readerUrl(store.url)')&&v.includes("readerAgent(target) === 'desktop' ? DESKTOP_AGENT : USER_AGENT"));
 assert.ok(v.includes("originWhitelist={['*']}")&&v.includes('/^https?:\\/\\//i.test'));
 assert.ok(v.includes('injectJavaScript(buildInjectedScript())'));assert.ok(v.includes('withMemory(monitor, store.url, cand.origins)'),'lembra de onde veio o preço escolhido');
});
test('leitura escondida usa os mesmos cookies da página aberta à mão',()=>{const s=read('src/lib/price-reader.tsx');assert.ok(s.includes('sharedCookiesEnabled')&&s.includes('thirdPartyCookiesEnabled'));});
