'use strict';
// 08/11/2026 (Pedro: "as paginas tambem guardam versoes, pra nao perder alguma coisa")
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
test('versoes da pagina: painel, menu e restauracao pelo salvamento normal', () => {
  const v = R('src/components/PageVersions.tsx'), p = R('src/screens/Pages.tsx'), api = R('src/lib/api.ts'), lock = R('src/lib/page-lock.ts');
  assert.ok(api.includes("'/versions'") && api.includes('entityVersions('), 'api pede as versoes');
  assert.ok(v.includes('GAP = 10 * 60 * 1000, RECENT = 10') && v.includes('export function spacedVersions'), 'uma por 10 minutos');
  assert.ok(v.includes('Voltar para esta versão') && v.includes('page-version-restore'), 'botao de voltar');
  assert.ok(v.includes('peekBlocks(h)') && lock.includes('export async function peekBlocks'), 'trancada: decifra so para ver');
  assert.ok(p.includes("label:'Versões anteriores…'") && p.includes('...pageItems,') && p.includes('{pageItems.map('), 'no menu do computador e do celular');
  assert.ok(p.includes("'restore-version'"), 'volta pelo edit do store (vira versao nova)');
});
test('spacedVersions: a mais recente sempre, depois uma por janela de 10 min', () => {
  const src = R('src/components/PageVersions.tsx');
  const m = /export function spacedVersions[\s\S]*?\n}\n/.exec(src)[0].replace(/: PageVersion\[\]/g, '').replace(/: number|: PageVersion/g, '').replace('export ', '');
  const spacedVersions = new Function('GAP', 'RECENT', m + '; return spacedVersions;')(600000, 10);
  const t0 = Date.parse('2026-11-08T10:00:00Z'), mk = (r, min) => ({id: 'v' + r, revision: r, created_at: new Date(t0 + min * 60000).toISOString()});
  // 10 saves seguidos agora (rev 20..11, um por minuto a partir do minuto 100) + antigas: rev 10..1
  const list = []; for (let r = 11; r <= 20; r++) list.push(mk(r, 100 + (r - 11)));
  [[10, 60], [9, 59], [8, 48], [7, 47], [6, 30], [5, 29], [4, 15], [3, 2], [2, 1], [1, 0]].forEach(([r, min]) => list.push(mk(r, min)));
  const out = spacedVersions(list).map(x => x.revision);
  assert.deepStrictEqual(out.slice(0, 10), [20, 19, 18, 17, 16, 15, 14, 13, 12, 11], 'as 10 mais recentes, todas');
  assert.deepStrictEqual(out.slice(10), [10, 8, 6, 4, 3], 'antes: uma por 10 minutos');
});
