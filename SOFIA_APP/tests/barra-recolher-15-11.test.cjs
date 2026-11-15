'use strict';
// 15/11/2026 (Pedro): recolher subatalhos das páginas não pode fazer o topo da barra lateral descer.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('barra lateral segura a posição com um espaço no fim quando a lista encolhe',()=>{
 const s=fs.readFileSync('src/desktop/DesktopShell.tsx','utf8');
 assert.match(s,/need=Math\.max\(0,Math\.ceil\(sideScroll\.top\+el\.clientHeight-natural\)\)/);
 assert.match(s,/box\.style\.paddingBottom=\(24\+spacer\)\+'px'/);assert.match(s,/new RO\(\(\)=>fit\(true\)\)/);assert.match(s,/fit\(false\)/);
});
