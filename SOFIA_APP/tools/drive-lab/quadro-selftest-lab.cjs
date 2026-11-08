'use strict';
// 08/11/2026: roda o teste do Quadro de producao (src/services/board-selftest.js) no laboratorio: servidor de verdade ligado
// ao Google Drive fiel. Uso: node tools/drive-lab/quadro-selftest-lab.cjs   (imprime "[quadro-teste] {...}" e sai 0/1)
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const {createFakeGoogle} = require('./fake-google.cjs');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'sofia-quadro-teste-')), PORT = 6900 + Math.floor(Math.random() * 300);
const ENV = {...process.env, GOOGLE_CALENDAR_CLIENT_ID: 'lab-client', GOOGLE_CALENDAR_CLIENT_SECRET: 'lab-secret', SOFIA_CALENDAR_TOKEN_KEY: 'lab-key-1234567890'};
const google = createFakeGoogle();
process.env.PORT = String(PORT); process.env.SOFIA_DATA_DIR = path.join(DATA, 'data'); process.env.SOFIA_BACKUP_DIR = path.join(DATA, 'bk'); process.env.RAILWAY_ENVIRONMENT = '';
process.env.SOFIA_LOGIN_EMAIL = 'lab@sofia.local'; process.env.SOFIA_LOGIN_PASSWORD = 'senha-do-laboratorio-123';
const ROOT = path.resolve(__dirname, '..', '..', '..');
const {startServer} = require(path.join(ROOT, 'src/server.js'));
const {runBoardSelfTest} = require(path.join(ROOT, 'src/services/board-selftest.js'));
(async () => {
  const rt = await startServer({root: ROOT, runtimeOptions: {googleFetch: (u, o) => google.fetch(u, o), googleEnv: ENV}});
  rt.google.saveLink({refresh: rt.google.seal('lab-refresh'), email: 'usuario@gmail.com', scopes: 'openid email https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive'}); rt.google.stop?.();
  await new Promise(r => setTimeout(r, 800));
  const r = await runBoardSelfTest(rt, {base: 'http://127.0.0.1:' + PORT});
  console.log(r.ok ? '✓ QUADRO-TESTE OK (' + r.steps.length + ' passos)' : '✗ QUADRO-TESTE: ' + r.falhas + ' falha(s)');
  process.exit(r.ok ? 0 : 1);
})().catch(e => {console.error(e); process.exit(1);});
