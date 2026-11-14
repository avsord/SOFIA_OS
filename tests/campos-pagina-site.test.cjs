'use strict';
// 14/11/2026 (Pedro: barra lateral diferente em cada navegador): o site gravava sidebar_sub/sidebar_color nos dados da
// página e o servidor recusava (campo fora da lista) em silêncio. Todo campo que o site grava numa página tem de existir aqui.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {CATALOG}=require('../src/core/catalog');
test('todo campo que o site grava nos dados de uma página é aceito pelo servidor',()=>{
 const allowed=new Set(CATALOG.user_page.fields.map(f=>f.key));const found=new Map();
 const walk=d=>{for(const n of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,n.name);if(n.isDirectory())walk(p);else if(/\.(tsx?|jsx?)$/.test(n.name)){const s=fs.readFileSync(p,'utf8');
  for(const m of s.matchAll(/patchPage\([^,]+,\s*d\s*=>[^;]*?\.\.\.d,\s*([a-z_]+)\s*:/g))found.set(m[1],p); // patchPage(id,d=>({...d,campo:...}))
  for(const m of s.matchAll(/\bsidebar_[a-z_]+\b/g))found.set(m[0],p);}}};
 walk(path.join(__dirname,'..','SOFIA_APP','src'));
 assert.ok(found.has('sidebar_fav')&&found.has('sidebar_sub'),'o teste enxerga os campos da barra lateral');
 const missing=[...found].filter(([k])=>!allowed.has(k)).map(([k,p])=>k+' ('+path.basename(p)+')');
 assert.deepEqual(missing,[],'campos que o servidor recusaria: '+missing.join(', '));
});
