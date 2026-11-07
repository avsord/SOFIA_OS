#!/usr/bin/env node
'use strict';
// Laboratorio completo do Drive: liga o servidor da Sofia com o Google Drive fiel, roda as sondas do servidor (casos
// dificeis do Google: Docs nativos, atalhos, compartilhados, 250 arquivos, video em partes, envio grande, protecao da
// area da Sofia) e depois o robo na tela (computador e celular). Uso: node tools/drive-lab/run-all.cjs [pasta-de-prints]
const path = require('node:path'), fs = require('node:fs'), os = require('node:os'), {spawn, spawnSync} = require('node:child_process');
const PORT = 5800 + Math.floor(Math.random() * 300) * 2, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sofia-lab-')), OUT = process.argv[2] || path.join(dir, 'prints');
(async () => {
  const lab = spawn(process.execPath, [path.join(__dirname, 'lab-server.cjs'), String(PORT), dir], {stdio: ['ignore', 'pipe', 'pipe']});
  let log = ''; lab.stdout.on('data', d => log += d); lab.stderr.on('data', d => log += d);
  process.on('exit', () => { try { lab.kill('SIGKILL'); } catch { /* ja saiu */ } });
  for (let i = 0; i < 80 && !/laboratorio pronto/.test(log); i++) { if (lab.exitCode != null) break; await new Promise(r => setTimeout(r, 250)); }
  if (!/laboratorio pronto/.test(log)) { console.log('✗ laboratorio nao ligou: ' + log.slice(-500)); process.exitCode = 1; return; }
  const probe = spawnSync(process.execPath, [path.join(__dirname, 'api-probe.cjs'), String(PORT)], {encoding: 'utf8', timeout: 5 * 60000});
  const pout = (probe.stdout || '') + (probe.stderr || ''); process.stdout.write(pout);
  await fetch('http://127.0.0.1:' + (PORT + 1) + '/reset');
  const robot = spawnSync(process.execPath, [path.join(__dirname, 'robot.cjs'), String(PORT), OUT], {encoding: 'utf8', timeout: 12 * 60000});
  const rout = (robot.stdout || '') + (robot.stderr || ''); process.stdout.write(rout);
  const probeBad = !/\n0 falha\(s\)/.test(pout), robotBad = !/TUDO CERTO/.test(rout);
  console.log('\n' + (probeBad || robotBad ? '✗ DRIVE COM PROBLEMA' : '✓ DRIVE OK (servidor e tela)'));
  process.exitCode = probeBad || robotBad ? 1 : 0; lab.kill('SIGKILL');
})();
