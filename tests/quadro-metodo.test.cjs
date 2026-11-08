// 08/11/2026 (Pedro: "faz o mesmo metodo [do Drive] pro quadro"): portao + registro [quadro] + teste de producao [quadro-teste].
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test('quadro: portao, registro e teste de producao ligados', () => {
  const gate = read('SOFIA_APP/tools/release-check.cjs');
  for (const f of ['pagina-quadro.cjs', 'paginas-versoes.cjs', 'pagina-trancada-shift-enter.cjs', 'quadro-selftest-lab.cjs']) assert.ok(gate.includes(f), 'portao roda ' + f);
  assert.ok(read('src/channels/mobile.js').includes("'[quadro] '"), 'registro [quadro] no servidor');
  assert.ok(read('src/server.js').includes('scheduleBoardSelfTest'), 'teste de producao agendado a cada versao');
  const st = read('src/services/board-selftest.js'); assert.ok(st.includes("'[quadro-teste] '") && st.includes('apagar o teste'), 'teste registra e limpa');
  const d = read('SOFIA_APP/src/lib/board-diag.ts'); assert.ok(!/name:\s*f\.name|title/.test(d.split('export function note')[1].split('queue.push')[0]), 'registro nao manda nome');
});
