'use strict';
// 15/11/2026 (Pedro): link na Conversa mostra prévia (capa do YouTube, título e canal) no campo e no balão.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
const {firstUrl,youtubeId,linkHost}=load('src/lib/link-info.ts');
test('acha o primeiro link do texto sem a pontuação final',()=>{
 assert.equal(firstUrl('olha isso: https://www.youtube.com/watch?v=OR17lMhcbUc&list=RDOR17lMhcbUc&start_radio=1.'),'https://www.youtube.com/watch?v=OR17lMhcbUc&list=RDOR17lMhcbUc&start_radio=1');
 assert.equal(firstUrl('sem link aqui'),'');
});
test('reconhece vídeo do YouTube em todos os formatos de endereço',()=>{
 for(const u of ['https://www.youtube.com/watch?v=OR17lMhcbUc&list=X','https://youtu.be/OR17lMhcbUc?t=3','https://m.youtube.com/shorts/OR17lMhcbUc','https://www.youtube.com/embed/OR17lMhcbUc','https://music.youtube.com/watch?v=OR17lMhcbUc'])assert.equal(youtubeId(u),'OR17lMhcbUc',u);
 assert.equal(youtubeId('https://www.youtube.com/@canal'),'');assert.equal(youtubeId('https://vimeo.com/123'),'');assert.equal(youtubeId('nada'),'');
 assert.equal(linkHost('https://www.youtube.com/watch?v=1'),'youtube.com');
});
test('a Conversa mostra o cartão no campo (com X) e no balão',()=>{
 const hub=fs.readFileSync('src/screens/ChatHub.tsx','utf8'),comp=fs.readFileSync('src/components/Composer.tsx','utf8'),card=fs.readFileSync('src/components/LinkCard.tsx','utf8');
 assert.match(hub,/<LinkDraftCard api=\{api\} url=\{typedUrl\} onClose=/);assert.match(hub,/<LinkBubbleCard api=\{api\} url=\{firstUrl\(b\.text\)\}/);
 assert.match(comp,/onTextChange\?\.\(text\)/);
 assert.match(card,/i\.ytimg\.com\/vi\/\$\{yt\}\/hqdefault\.jpg/);assert.match(card,/api\.linkPreview\(url\)/);
});
test('servidor lê vídeo do YouTube (oEmbed aceito como JSON) e o site libera imagens https',()=>{
 const lp=require('../../src/services/link-preview.js'),src=fs.readFileSync('../src/services/link-preview.js','utf8'),http=fs.readFileSync('../src/core/http-handler.js','utf8');
 assert.equal(lp.youtubeId('https://youtu.be/OR17lMhcbUc'),'OR17lMhcbUc');assert.equal(lp.youtubeId('https://site.com/x'),'');
 assert.match(src,/youtube\.com\/oembed/);assert.match(src,/\/html\|json\/i/);assert.match(http,/img-src 'self' data: blob: https:;/);
});
