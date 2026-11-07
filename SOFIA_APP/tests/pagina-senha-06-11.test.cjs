'use strict';
// 06/11/2026 (Pedro: paginas com senha, conteudo criptografado; Maxima tranca ao sair, Media fica aberta 5 min e recupera)
const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const L=()=>{const m=load('src/lib/page-lock.ts',{},{TextEncoder,TextDecoder,btoa,atob,Uint8Array,crypto:globalThis.crypto});m._resetLocks();return m;};
const page=(id,lock)=>({id,tags:['sofia-lock-v1'],data:{blocks_json:'[]',lock_json:lock}});
test('trancar: servidor so ve texto cifrado; senha errada nao abre; certa abre',async()=>{
 const m=L(),blocks=JSON.stringify([{id:'1',type:'text',text:'Senha: Jotacom10$'}]);
 const {kid}=await m.createLock('abcd1234','max');const lock=await m.seal('p1',kid,blocks);
 assert.ok(!lock.includes('Jotacom'),'nada do texto no cifrado');
 m.forget(kid);const h=m.lockHeader(page('p1',lock));
 assert.equal(m.viewOf(page('p1',lock)).data.blocks_json,'[]','trancada mostra vazio');
 await assert.rejects(m.unlock(h,'errada'),/Senha incorreta/);
 await m.unlock(h,'abcd1234');assert.equal(await m.openBlocks('p1',h),blocks);
 assert.equal(m.viewOf(page('p1',lock)).data.blocks_json,blocks,'aberta mostra o texto');
});
test('Maxima tranca ao sair; Media continua aberta 5 minutos depois de sair',async()=>{
 const m=L();const a=await m.createLock('aaaa1','max'),b=await m.createLock('bbbb1','medium');
 m.left(a.kid,1000);assert.equal(m.isOpen(a.kid,1001),false);
 m.left(b.kid,1000);assert.equal(m.isOpen(b.kid,1000+4*60000),true);assert.equal(m.isOpen(b.kid,1000+5*60000+1),false);
});
test('Media: esqueci a senha com a chave guardada no servidor -> senha nova abre; trocar senha',async()=>{
 const m=L();const {kid}=await m.createLock('velha1','medium');const raw=m.rawKey(kid);const lock=await m.seal('p2',kid,'["x"]');m.forget(kid);
 const h=m.lockHeader(page('p2',lock));const head=await m.recoverWith(h,raw,'nova1');m.forget(kid);
 const h2={...h,...head};await assert.rejects(m.unlock(h2,'velha1'),/Senha incorreta/);await m.unlock(h2,'nova1');assert.equal(await m.openBlocks('p2',h2),'["x"]');
 const h3={...h2,...(await m.rewrap(kid,'outra1'))};m.forget(kid);await m.unlock(h3,'outra1');
 await assert.rejects(m.recoverWith(h,Buffer.alloc(32).toString('base64'),'x1234'),/não abre/);
});

test('trancada em outra aba ou rascunho velho: copia aberta e descartada e o texto aberto nao fica no disco (07/11/2026)', () => {
  const p = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/Pages.tsx'), 'utf8');
  assert.ok(p.includes('if(open)store.rebase(p);else{store.forget(p.id);store.open(p);}') && p.includes('if(was||(first&&open))continue;'), 'copia velha descartada so quando a pagina passa a ser trancada');
  assert.ok(p.includes('return !(r&&isLocked(r)&&!isLocked(e.base));'), 'versao trancada do servidor vence');
  assert.ok(p.includes("persist:all=>{const items=all.filter(it=>!isLocked(it.base)&&!isLocked(pagesRef.current.find(x=>x.id===it.base.id)));"), 'rascunho trancado fora do disco');
  const ed = require('fs').readFileSync(require('path').join(__dirname, '../src/lib/page-editor.ts'), 'utf8');
  assert.ok(ed.includes('this.changed();void this.persist(); /* 07/11/2026: trancou'), 'ao trancar o disco e regravado');
});
