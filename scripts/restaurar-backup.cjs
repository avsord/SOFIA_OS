#!/usr/bin/env node
'use strict';
// Sofia OS - restaura TUDO a partir de um "backup com senha" (pasta Sofia OS/Backup com senha no Google Drive).
// Feito para funcionar sem o servidor antigo: so precisa deste repositorio, do arquivo e da senha.
//
//   Uso:  node scripts/restaurar-backup.cjs <arquivo.sofia-backup> [pasta-de-dados]
//   Senha: variavel SOFIA_BACKUP_PASSPHRASE (ou e perguntada na hora).
//   Pasta de dados padrao: ./data  (o servidor usa data/sofia.sqlite). Se ja existir um banco, nada e
//   sobrescrito: use --substituir para trocar (o atual vira sofia.sqlite.antes-da-restauracao).
const fs = require('node:fs'), path = require('node:path'), readline = require('node:readline');
const {openBackup} = require('../src/services/backup');
const {Store} = require('../src/memory/store');

async function ask(q) { const rl = readline.createInterface({input: process.stdin, output: process.stdout}); return new Promise(r => rl.question(q, a => { rl.close(); r(a); })); }
async function main() {
  const args = process.argv.slice(2), replace = args.includes('--substituir'), pos = args.filter(a => !a.startsWith('--'));
  const file = pos[0], dataDir = path.resolve(pos[1] || 'data');
  if (!file || !fs.existsSync(file)) { console.error('Informe o arquivo .sofia-backup baixado do Drive.'); process.exit(2); }
  const passphrase = process.env.SOFIA_BACKUP_PASSPHRASE || await ask('Senha do backup: ');
  const snapshot = openBackup(fs.readFileSync(file), {passphrase});
  fs.mkdirSync(dataDir, {recursive: true});
  const db = path.join(dataDir, 'sofia.sqlite');
  if (fs.existsSync(db) && !replace) { console.error('Ja existe ' + db + '. Rode de novo com --substituir para trocar por este backup.'); process.exit(3); }
  // 03/11/2026: restaura primeiro num arquivo separado; so troca se deu certo. Antes, uma falha deixava um banco VAZIO no
  // lugar do sofia.sqlite (o antigo ficava renomeado) e a Sofia abria sem nada.
  const tmp = path.join(dataDir, 'restauracao-' + process.pid + '-' + Date.now() + '.sqlite');
  let result;
  try { const store = new Store(tmp); result = store.importSnapshot(snapshot); store.close(); }
  catch (e) { for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(tmp + ext); } catch { /* nao existia */ } } throw e; }
  if (fs.existsSync(db)) {
    fs.renameSync(db, db + '.antes-da-restauracao');
    for (const ext of ['-wal', '-shm']) { try { fs.unlinkSync(db + ext); } catch { /* nao existia */ } }
  }
  fs.renameSync(tmp, db);
  for (const ext of ['-wal', '-shm']) { try { fs.unlinkSync(tmp + ext); } catch { /* nao existia */ } }
  if (snapshot.vault_key) fs.writeFileSync(path.join(dataDir, 'cofre-chave-restaurada.txt'), snapshot.vault_key + '\n', {mode: 0o600});
  console.log('Restaurado em ' + db + '.');
  console.log('Registros importados: ' + JSON.stringify(result && result.counts ? result.counts : result));
  if (snapshot.vault_key) console.log('A chave do cofre foi salva em cofre-chave-restaurada.txt (veja COMO-RESTAURAR.md, passo 6).');
}
main().catch(e => { console.error('Nao foi possivel restaurar: ' + (e && e.message || e)); process.exit(1); });
