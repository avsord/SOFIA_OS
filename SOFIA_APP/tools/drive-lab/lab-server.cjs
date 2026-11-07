'use strict';
/*
 * Sobe o servidor da Sofia de VERDADE (src/server.js) ligado ao Google Drive fiel do laboratorio, com uma conta de teste.
 * Uso: node tools/drive-lab/lab-server.cjs <porta> <pasta-de-dados>
 * Porta+1: /state (estado do Drive de teste, para o robo conferir o que aconteceu de fato) e /reset.
 */
const http = require('node:http'), path = require('node:path'), fs = require('node:fs');
const {createFakeGoogle} = require('./fake-google.cjs');
const PORT = Number(process.argv[2] || 4610), DATA = path.resolve(process.argv[3] || path.join(require('node:os').tmpdir(), 'sofia-drive-lab'));
fs.rmSync(DATA, {recursive: true, force: true}); fs.mkdirSync(DATA, {recursive: true});
const ENV = {...process.env, GOOGLE_CALENDAR_CLIENT_ID: 'lab-client', GOOGLE_CALENDAR_CLIENT_SECRET: 'lab-secret', SOFIA_CALENDAR_TOKEN_KEY: 'lab-key-1234567890'};
let google = createFakeGoogle();
const fetchImpl = (u, o) => google.fetch(u, o);
process.env.PORT = String(PORT); process.env.SOFIA_DATA_DIR = path.join(DATA, 'data'); process.env.SOFIA_BACKUP_DIR = path.join(DATA, 'bk');
process.env.SOFIA_LOGIN_EMAIL = process.env.SOFIA_LOGIN_EMAIL || 'lab@sofia.local'; process.env.SOFIA_LOGIN_PASSWORD = process.env.SOFIA_LOGIN_PASSWORD || 'senha-do-laboratorio-123';
process.env.RAILWAY_ENVIRONMENT = '';
const ROOT = path.resolve(__dirname, '..', '..', '..');
const {startServer} = require(path.join(ROOT, 'src/server.js'));
(async () => {
  const rt = await startServer({root: ROOT, runtimeOptions: {googleFetch: fetchImpl, googleEnv: ENV}});
  const link = () => rt.google.saveLink({refresh: rt.google.seal('lab-refresh'), email: 'usuario@gmail.com', scopes: 'openid email https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive', connected_at: new Date().toISOString(), calendar_id: 'primary', sync: {}, last_error: '', conflicts: [], drive: {folders: {root: 'pastaSofiaAntiga01'}}});
  link(); rt.google.stop?.();
  http.createServer((req, res) => {
    if (req.url === '/reset') { google = createFakeGoogle(); rt.google.access = null; rt.google._sdRoot = null; rt.google.sdBust?.(); link(); res.end('ok'); return; }
    if (req.url === '/state') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({files: [...google.files.values()], sofia: google.SOFIA_IDS(), log: google.log.slice(-400)})); return; }
    res.statusCode = 404; res.end();
  }).listen(PORT + 1, '127.0.0.1', () => console.log('laboratorio pronto em http://127.0.0.1:' + PORT + ' (estado em :' + (PORT + 1) + ')'));
})().catch(e => { console.error(e); process.exit(1); });
