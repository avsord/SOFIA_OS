'use strict';
// 0.3.142: app Encomendas (rastreio inspirado no Muambator).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('0.3.142: Encomendas entra nos apps, usa o registro package e atualiza pelo servidor',()=>{
  const w=read('src/screens/Workspace.tsx'),p=read('src/screens/Packages.tsx'),api=read('src/lib/api.ts');
  assert.ok(w.includes("{id:'packages',title:'Encomendas',caption:'Rastreio que avisa quando muda',icon:'box'}"));
  // 0.3.269: a tela nova (PackagesApp) usa o mesmo registro package e a mesma atualizacao pelo servidor; abre o site oficial no ⋯
  assert.ok(w.includes("<PackagesApp api={api} active={active&&module==='packages'}"));
  const pa=read('src/screens/PackagesApp.tsx');assert.ok(pa.includes("listAll(api, 'package')")&&pa.includes('api.refreshPackage(')&&pa.includes('officialUrl(open.carrier, open.code)'));
  assert.ok(p.includes("useWorkspaceRecords(api,'package','',true)"));
  assert.ok(api.includes("refreshPackage(id: string) { return this.request<{item: Entity; changed: boolean; error: string}>('/packages/refresh', { id }); }"));
  assert.ok(p.includes('Abrir rastreio oficial'),'outras transportadoras abrem o rastreio oficial');
  const server=fs.readFileSync(path.join(root,'..','src/channels/mobile.js'),'utf8'),catalog=fs.readFileSync(path.join(root,'..','src/core/catalog.js'),'utf8');
  assert.ok(server.includes("p === '/api/mobile/packages/refresh' && m === 'POST'"));
  assert.ok(catalog.includes('"package": {'));
  assert.ok(read('src/components/NotificationCenter.tsx').includes("if(/package|encomenda|rastreio/.test(category))return 'Encomendas';"));
});
test('0.3.142: detecta a transportadora e monta o link oficial no app',()=>{
  const ts=require('typescript');const src=read('src/screens/Packages.tsx');
  const out=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
  const m={exports:{}};new Function('require','module','exports',out)(name=>name==='react'?require('react'):new Proxy({},{get:()=>()=>null}),m,m.exports);
  assert.equal(m.exports.detectCarrier('aa 123456789 br'),'correios');assert.equal(m.exports.detectCarrier('LP00123456789012'),'cainiao');
  assert.match(m.exports.officialUrl('correios','AA123456789BR'),/correios\.com\.br/);
  assert.deepEqual(m.exports.parseEvents('[{"at":"2026-10-15T10:00:00","status":"Em trânsito"}]').map(e=>e.status),['Em trânsito']);
  assert.deepEqual(m.exports.parseEvents('lixo'),[]);
});
