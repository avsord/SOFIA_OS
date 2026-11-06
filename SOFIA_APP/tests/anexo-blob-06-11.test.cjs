'use strict';
// 06/11/2026 (Pedro: imagem colada na Conversa ficou "Failed to fetch" e nunca chegou ao servidor): a regra de seguranca do
// site (connect-src 'self') bloqueia fetch de endereco blob:. O arquivo agora e lido do registro, sem fetch.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const load=require('./load-ts.cjs');
test('arquivo de endereco blob: e lido sem fetch (o fetch bloqueado nao e chamado)',async()=>{
 const reg=load('src/lib/blob-registry.ts',{});
 const realFetch=globalThis.fetch;let called=0;globalThis.fetch=async()=>{called++;throw new TypeError('Failed to fetch');};
 try{const blob=new Blob(['abc'],{type:'image/png'}),url=URL.createObjectURL(blob);
  const got=await reg.readLocalBlob(url);assert.equal(await got.text(),'abc');assert.equal(called,0);
  URL.revokeObjectURL(url);assert.equal(reg.blobFromUrl(url),null,'liberado sai do registro');
 }finally{globalThis.fetch=realFetch;}
});
test('anexo da Conversa, foto do perfil e Biblioteca usam o registro; o registro e instalado antes de tudo',()=>{
 const src=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 assert.match(src('src/lib/attachment-read.web.ts'),/const blobOf=readLocalBlob/);
 assert.match(src('src/lib/profile-photo-cloud.web.ts'),/await readLocalBlob\(uri\)/);
 assert.match(src('src/screens/Library.tsx'),/file\.file \|\| await readLocalBlob\(file\.uri\)/);
 assert.match(src('App.tsx').split('\n')[0],/blob-registry/);
});
