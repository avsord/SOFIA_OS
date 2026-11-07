'use strict';
// Sondas de servidor no laboratorio: cada caso dificil do Google Drive de verdade. Uso: node api-probe.cjs <porta>
const PORT = Number(process.argv[2] || 4610), B = 'http://127.0.0.1:' + PORT, S = 'http://127.0.0.1:' + (PORT + 1);
const out = []; const ok = (c, m, extra = '') => { out.push((c ? 'OK   ' : 'FALHA') + ' ' + m + (extra ? ' — ' + extra : '')); };
(async () => {
  const lg = await (await fetch(B + '/api/mobile/auth/login', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({email: 'lab@sofia.local', password: 'senha-do-laboratorio-123', device_name: 'sonda'})})).json();
  const H = {Authorization: 'Bearer ' + lg.token};
  const api = async (p, o = {}) => { const r = await fetch(B + '/api/mobile/md/sofiadrive/' + p, {...o, headers: {...H, ...(o.json ? {'content-type': 'application/json'} : {}), ...(o.headers || {})}, body: o.json ? JSON.stringify(o.json) : o.body}); const t = Buffer.from(await r.arrayBuffer()); let j = null; try { j = JSON.parse(t.toString()); } catch {} return {st: r.status, j, t, h: r.headers}; };
  const st = async () => (await fetch(S + '/state')).json();
  const root = await api('list?folder=root'); const byName = n => root.j.items.find(i => i.name === n);
  const s0 = await st(); const sofia = s0.sofia;
  ok(!root.j.items.some(i => sofia.includes(i.id)), 'raiz sem nada da Sofia');
  const trab = byName('Trabalho'); const tl = await api('list?folder=' + trab.id); ok(tl.j.items.length === 250, 'pasta com 250 arquivos lista tudo', 'veio ' + tl.j.items.length);
  ok(tl.j.items[0].name === 'Relatório 001.txt' && tl.j.items[249].name === 'Relatório 250.txt', 'ordem natural', tl.j.items[0].name + ' ... ' + tl.j.items[249].name);
  const gdoc = byName('Notas da reunião'); ok(!!gdoc, 'Docs nativo aparece');
  let r = await api('items/' + gdoc.id + '/download'); ok(r.st === 200 && r.t.length > 0, 'baixar Google Docs', 'status ' + r.st + ' ' + (r.j?.error?.message || r.j?.message || ''));
  r = await api('items/' + gdoc.id + '/preview'); ok(r.st === 200 && r.t.slice(0, 5).toString() === '%PDF-', 'ver Google Docs (PDF)', 'status ' + r.st + ' ' + (r.j?.error?.message || ''));
  const sheet = byName('Controle de gastos'); r = await api('items/' + sheet.id + '/preview'); ok(r.st === 200, 'ver Google Planilha', 'status ' + r.st);
  r = await api('items/' + gdoc.id + '/content'); ok(r.st === 200, 'abrir conteudo de Google Docs', 'status ' + r.st + ' ' + (r.j?.error?.message || ''));
  const sc = byName('Atalho para Trabalho'); ok(sc && (sc.folder || sc.target), 'atalho para pasta se comporta como pasta', JSON.stringify(sc));
  r = await api('list?folder=' + (sc?.id || 'x')); ok(r.st === 200 && r.j.items?.length === 250, 'abrir atalho mostra a pasta de destino', 'status ' + r.st + ' ' + (r.j?.error?.message || ''));
  for (const n of ['Proposta comercial.docx', 'Orçamento 2026.xlsx', 'Apresentação.pptx']) { r = await api('items/' + byName(n).id + '/preview'); ok(r.st === 200 && r.t.slice(0, 5).toString() === '%PDF-', 'ver ' + n, 'status ' + r.st + ' ' + (r.j?.error?.message || '')); }
  const s1 = await st(); ok(!s1.files.some(f => f.appProperties?.sofia_cat === 'preview_tmp'), 'visualizacao nao deixa copia temporaria');
  r = await api('search?q=' + encodeURIComponent('relat')); ok(r.st === 200 && !r.j.items.some(i => sofia.includes(i.id)), 'pesquisa nao mostra nada da Sofia', (r.j.items || []).filter(i => sofia.includes(i.id)).map(i => i.name).join(','));
  ok(r.j.items.length >= 250, 'pesquisa acha os 250 relatorios', 'veio ' + r.j.items.length);
  r = await api('search?q=' + encodeURIComponent("d'Ouro")); ok(r.st === 200 && r.j.items.some(i => i.name.includes("d'Ouro")), 'pesquisa com apostrofo', 'status ' + r.st + ' ' + (r.j?.items || []).map(i => i.name).join(','));
  r = await api('search?q=' + encodeURIComponent('PLANILHA')); ok(r.st === 200 && r.j.items.some(i => i.name.includes('compartilhada')), 'pesquisa acha compartilhado comigo', (r.j?.items || []).map(i => i.name).join(','));
  r = await api('search?q=' + encodeURIComponent('fundo')); ok(r.j.items.some(i => i.name === 'no fundo.txt'), 'pesquisa acha arquivo 7 niveis abaixo');
  const fotos = byName('Fotos 📷 de família'); const fl = await api('list?folder=' + fotos.id); ok(fl.j.items.every(i => i.thumb || i.thumbnail || i.thumbnailLink), 'fotos tem miniatura do Google', Object.keys(fl.j.items[0] || {}).join(','));
  // protecao
  const sofiaFolder = 'pastaSofiaAntiga01', bk = s0.files.find(f => f.name === 'Backups').id, inside = s0.files.find(f => f.name === 'Relatório interno da Sofia.txt').id;
  const cf = await api('folder', {method: 'POST', json: {parent: 'root', name: 'Pasta do robo'}}); const mine = cf.j.item || cf.j;
  r = await api('items/' + mine.id, {method: 'PATCH', json: {parent: sofiaFolder}}); ok(r.st >= 400, 'nao move para dentro da pasta da Sofia', 'status ' + r.st);
  r = await api('items/' + mine.id, {method: 'PATCH', json: {parent: bk}}); ok(r.st >= 400, 'nao move para dentro da pasta de backups', 'status ' + r.st);
  r = await api('upload?parent=' + bk + '&name=x.txt', {method: 'POST', body: 'x', headers: {'content-type': 'text/plain'}}); ok(r.st >= 400, 'nao envia para dentro dos backups', 'status ' + r.st);
  r = await api('folder', {method: 'POST', json: {parent: sofiaFolder, name: 'invasao'}}); ok(r.st >= 400, 'nao cria pasta na area da Sofia', 'status ' + r.st);
  for (const id of [sofiaFolder, bk, inside]) { r = await api('items/' + id, {method: 'DELETE'}); ok(r.st >= 400, 'nao apaga item da Sofia ' + id.slice(0, 10), 'status ' + r.st); r = await api('items/' + id + '/download'); ok(r.st >= 400, 'nao baixa item da Sofia ' + id.slice(0, 10), 'status ' + r.st); }
  r = await api('list?folder=' + bk); ok(r.st >= 400, 'nao lista pasta de backups', 'status ' + r.st);
  r = await api('list?folder=appDataFolder'); ok(r.st >= 400, 'nao lista appDataFolder', 'status ' + r.st);
  // video
  const viagem = byName('Viagem "Europa" d\'Ouro 2026'); const vl = await api('list?folder=' + viagem.id); const vid = vl.j.items.find(i => i.mime === 'video/mp4');
  const link = await api('items/' + vid.id + '/stream-link'); const vurl = B + link.j.url;
  let v = await fetch(vurl, {headers: {Range: 'bytes=0-1023'}}); ok(v.status === 206 && (await v.arrayBuffer()).byteLength === 1024, 'video em partes (inicio)');
  v = await fetch(vurl, {headers: {Range: 'bytes=100000-'}}); const vb = await v.arrayBuffer(); ok(v.status === 206 && vb.byteLength === 187214 - 100000, 'video pula para o meio', 'status ' + v.status + ' ' + vb.byteLength + ' ' + v.headers.get('content-range'));
  v = await fetch(vurl, {headers: {Range: 'bytes=-500'}}); ok(v.status === 206, 'video pede o fim (moov no fim)', 'status ' + v.status);
  v = await fetch(vurl, {headers: {Range: 'bytes=999999-'}}); ok(v.status === 416, 'faixa fora do arquivo responde 416', 'status ' + v.status);
  v = await fetch(vurl.replace(/sig=[^&]+/, 'sig=AAAA')); ok(v.status >= 400, 'link falso recusado');
  v = await fetch(vurl, {method: 'HEAD'}); ok(v.status < 400, 'HEAD no video (Safari/iPhone)', 'status ' + v.status);
  // envio
  const big = Buffer.alloc(60 * 1024 * 1024, 7);
  { const st0 = await api('upload/start', {method: 'POST', json: {parent: 'root', name: 'grande.bin', mime: 'application/octet-stream', size: big.length}}); let pos = 0, last = null;
    while (st0.j?.upload && pos < big.length) { const part = big.subarray(pos, pos + 8 * 1024 * 1024); last = await api('upload/' + st0.j.upload + '?start=' + pos, {method: 'PUT', body: part, headers: {'content-type': 'application/octet-stream'}}); if (last.j?.item) break; pos = last.j?.next ?? -1; if (pos < 0) break; }
    const sz = (await st()).files.find(f => f.name === 'grande.bin')?.size; ok(last?.j?.item && Number(sz) === big.length, 'envia arquivo de 60 MB por partes', 'start ' + st0.st + ' ' + JSON.stringify(st0.j).slice(0, 120) + ' ultimo ' + (last && last.st) + ' tamanho ' + sz); }
  r = await api('upload?parent=root&name=' + encodeURIComponent('vazio.txt'), {method: 'POST', body: '', headers: {'content-type': 'text/plain'}}); ok(r.st === 200, 'envia arquivo vazio (o Google aceita)', 'status ' + r.st);
  r = await api('upload?parent=root&name=' + encodeURIComponent('ação 😀 "x".txt'), {method: 'POST', body: 'ola', headers: {'content-type': 'text/plain'}}); const s2 = await st(); ok(s2.files.some(f => f.name === 'ação 😀 "x".txt'), 'nome com acento/emoji/aspas chega igual', (r.j?.item || r.j)?.name);
  r = await api('items/' + mine.id, {method: 'PATCH', json: {name: '   '}}); ok(r.st >= 400, 'nome vazio recusado');
  r = await api('items/' + mine.id, {method: 'DELETE'}); const s3 = await st(); ok(s3.files.find(f => f.id === mine.id)?.trashed === true, 'lixeira manda para a lixeira (recuperavel)');
  r = await api('trash'); ok(r.st === 200, 'lista da lixeira existe', 'status ' + r.st);
  r = await api('shared'); ok(r.st === 200, 'lista "Compartilhados comigo" existe', 'status ' + r.st);
  r = await api('recent'); ok(r.st === 200, 'lista "Recentes" existe', 'status ' + r.st);
  r = await api('items/' + mine.id + '/restore', {method: 'POST'}); ok(r.st === 200, 'restaurar da lixeira', 'status ' + r.st);
  r = await api('about'); ok(r.st === 200, 'espaco usado do Drive', 'status ' + r.st);
  // 07/11/2026 (Pedro: senha do Drive, aberto 10 min)
  const lk = async (p, json, h = H) => { const q = await fetch(B + '/api/mobile/md/drive-lock' + p, {method: json ? 'POST' : 'GET', headers: {...h, 'content-type': 'application/json'}, body: json ? JSON.stringify(json) : undefined}); return {st: q.status, j: await q.json().catch(() => ({}))}; };
  r = await lk(''); ok(r.st === 200 && r.j.hasPassword === false, 'Drive sem senha no comeco');
  r = await lk('/set', {password: 'abc'}); ok(r.st === 400 || r.st === 422, 'senha curta recusada', 'status ' + r.st);
  r = await lk('/set', {password: 'drive-123'}); ok(r.st === 200 && r.j.locked === false && r.j.openMs > 9 * 60000, 'criar senha deixa aberto 10 min', JSON.stringify(r.j));
  r = await api('list?folder=root'); ok(r.st === 200, 'quem criou a senha continua usando o Drive', 'status ' + r.st);
  const lg2 = await (await fetch(B + '/api/mobile/auth/login', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({email: 'lab@sofia.local', password: 'senha-do-laboratorio-123', device_name: 'sonda2'})})).json();
  const H2 = {Authorization: 'Bearer ' + lg2.token};
  r = await fetch(B + '/api/mobile/md/sofiadrive/list?folder=root', {headers: H2}); ok(r.status === 423, 'outra sessao: Drive trancado (423)', 'status ' + r.status);
  r = await lk('/open', {password: 'errada'}, H2); ok(r.st === 403, 'senha errada recusada', 'status ' + r.st);
  r = await lk('/set', {password: 'nova-1234', accountPassword: 'conta-errada'}, H2); ok(r.st === 403, 'esqueci: senha da conta errada recusada', 'status ' + r.st);
  r = await lk('/open', {password: 'drive-123'}, H2); ok(r.st === 200 && r.j.locked === false, 'senha certa abre', JSON.stringify(r.j));
  r = await fetch(B + '/api/mobile/md/sofiadrive/list?folder=root', {headers: H2}); ok(r.status === 200, 'depois de abrir, lista o Drive', 'status ' + r.status);
  r = await lk('/set', {password: 'nova-1234', accountPassword: 'senha-do-laboratorio-123'}, H2); ok(r.st === 200, 'esqueci: senha da conta cria senha nova', 'status ' + r.st);
  r = await lk('/open', {password: 'drive-123'}, H2); ok(r.st === 403, 'senha antiga deixa de valer', 'status ' + r.st);
  r = await lk('/set', {remove: true, current: 'nova-1234'}, H2); ok(r.st === 200 && r.j.hasPassword === false, 'tirar a senha (limpa para o robo)', 'status ' + r.st);
  console.log(out.join('\n')); console.log('\n' + out.filter(l => l.startsWith('FALHA')).length + ' falha(s) de ' + out.length);
})().catch(e => { console.error('sonda quebrou:', e); process.exit(1); });
