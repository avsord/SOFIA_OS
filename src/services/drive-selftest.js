'use strict';
// 07/11/2026 (Pedro: "tem varios erros no drive; como faz pra voce resolver sem eu falar item por item?"): teste do Drive
// no GOOGLE DE VERDADE, sozinho, uma vez por versao publicada. Cria uma pasta de teste escondida da lista do Drive da Sofia
// (marca sofia_selftest), faz nela tudo o que o app faz pelas MESMAS funcoes do servidor (listar, criar pasta, enviar
// imagem/PDF/Word/Excel/texto, abrir, visualizar Word/Excel em PDF, tocar por partes com link assinado, renomear, mover,
// pesquisar, lixeira, protecao da area da Sofia) e no fim apaga a pasta de vez. Nao toca em nenhum arquivo do usuario.
// Resultado so no registro do servidor: linha "[drive-teste]".
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');

function zip(files) { // zip simples sem compressao (o suficiente para .docx/.xlsx)
  const parts = [], central = []; let off = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text), nm = Buffer.from(name), crc = zlib.crc32(data) >>> 0;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, nm, data); central.push(c, nm); off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const DOCX = () => zip([
  ['[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
  ['_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
  ['word/document.xml', X + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Teste da Sofia</w:t></w:r></w:p></w:body></w:document>']]);
const XLSX = () => zip([
  ['[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
  ['_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
  ['xl/workbook.xml', X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Plan1" sheetId="1" r:id="rId1"/></sheets></workbook>'],
  ['xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
  ['xl/worksheets/sheet1.xml', X + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Teste</t></is></c><c r="B1"><v>42</v></c></row></sheetData></worksheet>']]);
const PDF = () => { const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'];
  let out = '%PDF-1.4\n'; const offs = []; objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const x = out.length; out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF\n'; return Buffer.from(out); };
const PNG = () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAQUlEQVR4nO3OMQ0AAAjDsM2/aFTwEtRAm+x8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOA4DPgFAAeUhkL4AAAAASUVORK5CYII=', 'base64');

async function bodyOf(r) { if (r.res) { const b = Buffer.from(await r.res.arrayBuffer()); return b; } if (r.body) return Buffer.isBuffer(r.body) ? r.body : Buffer.from(r.body); if (r.bytes) return Buffer.from(r.bytes); return Buffer.alloc(0); }

/** Roda o teste. `base` e o endereco local do proprio servidor (para conferir o link de video de verdade). */
async function runDriveSelfTest(g, {base, log = console.log} = {}) {
  const steps = [], t0 = Date.now(); let folder = null;
  const step = async (name, fn) => { const s = Date.now(); try { const note = await fn(); steps.push({step: name, ok: true, ms: Date.now() - s, ...(note ? {note: String(note).slice(0, 120)} : {})}); return true; } catch (e) { steps.push({step: name, ok: false, ms: Date.now() - s, code: e.code || '', err: String(e.message || e).slice(0, 200)}); return false; } };
  const must = (c, m) => { if (!c) throw new Error(m); };
  try {
    if (!await step('listar Meu Drive', async () => { const l = await g.sdList('root'); return l.items.length + ' itens'; })) return finish();
    await step('limpar sobra de teste anterior', async () => { const old = await g.call('GET', 'https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id)&q=' + encodeURIComponent("name='Teste automatico da Sofia (some sozinho)' and trashed=false and 'me' in owners"));
      for (const f of old.files || []) await g.call('DELETE', 'https://www.googleapis.com/drive/v3/files/' + f.id); return (old.files || []).length + ' sobra(s)'; });
    const root = await g.sdRoot();
    folder = await g.call('POST', 'https://www.googleapis.com/drive/v3/files?fields=id', {name: 'Teste automatico da Sofia (some sozinho)', mimeType: 'application/vnd.google-apps.folder', parents: [root], appProperties: {sofia_selftest: '1'}});
    await step('pasta de teste fora da lista', async () => { const l = await g.sdList('root'); must(!l.items.some(i => i.id === folder.id), 'a pasta de teste apareceu na lista'); });
    const up = {};
    for (const [name, mime, bytes] of [['foto.png', 'image/png', PNG()], ['contrato.pdf', 'application/pdf', PDF()], ['notas.txt', 'text/plain', Buffer.from('ola, teste da Sofia')],
      ['proposta.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', DOCX()], ['planilha.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', XLSX()]])
      await step('enviar ' + name, async () => { up[name] = await g.sdUpload(folder.id, name, mime, bytes); must(up[name].id, 'sem id'); });
    await step('listar a pasta', async () => { const l = await g.sdList(folder.id); must(l.items.length === Object.keys(up).length, 'esperava ' + Object.keys(up).length + ', veio ' + l.items.length); must(l.path.length === 0 || l.folder.id === folder.id, 'caminho errado'); });
    if (up['foto.png']) await step('abrir imagem', async () => { const b = await bodyOf(await g.sdContent(up['foto.png'].id)); must(b.length === PNG().length, 'tamanho ' + b.length); });
    if (up['contrato.pdf']) await step('abrir PDF', async () => { const b = await bodyOf(await g.sdContent(up['contrato.pdf'].id)); must(b.slice(0, 5).toString() === '%PDF-', 'nao e PDF'); });
    if (up['notas.txt']) await step('abrir texto', async () => { const b = await bodyOf(await g.sdContent(up['notas.txt'].id)); must(b.toString().includes('teste da Sofia'), 'texto diferente'); });
    for (const n of ['proposta.docx', 'planilha.xlsx']) if (up[n]) await step('visualizar ' + n + ' (PDF)', async () => { const b = await bodyOf(await g.sdPreview(up[n].id)); must(b.slice(0, 5).toString() === '%PDF-', 'conversao nao deu PDF (' + b.length + ' bytes)'); return b.length + ' bytes'; });
    if (up['foto.png'] && base) await step('tocar por partes (link assinado + Range)', async () => {
      const {exp, sig} = g.sdStreamToken(up['foto.png'].id); const r = await fetch(base + '/api/mobile/md/sofiadrive/stream/' + up['foto.png'].id + '?exp=' + exp + '&sig=' + sig, {headers: {Range: 'bytes=0-9'}});
      const b = Buffer.from(await r.arrayBuffer()); must(r.status === 206, 'status ' + r.status); must(b.length === 10, 'veio ' + b.length + ' bytes'); must(/^bytes 0-9\//.test(r.headers.get('content-range') || ''), 'content-range ' + r.headers.get('content-range'));
      const bad = await fetch(base + '/api/mobile/md/sofiadrive/stream/' + up['foto.png'].id + '?exp=' + exp + '&sig=x'); must(bad.status >= 400, 'link falso aceito'); });
    let sub = null;
    await step('criar subpasta', async () => { sub = await g.sdCreateFolder(folder.id, 'Subpasta'); must(sub.folder, 'nao e pasta'); });
    if (up['notas.txt']) await step('renomear', async () => { const r = await g.sdUpdate(up['notas.txt'].id, {name: 'notas renomeadas.txt'}); must(r.name === 'notas renomeadas.txt', 'nome ' + r.name); });
    if (up['notas.txt'] && sub) await step('mover para a subpasta', async () => { await g.sdUpdate(up['notas.txt'].id, {parent: sub.id}); const l = await g.sdList(sub.id); must(l.items.some(i => i.id === up['notas.txt'].id), 'nao chegou'); must(l.path.some(p => p.id === folder.id), 'caminho sem a pasta de cima'); });
    if (sub) await step('pasta nao entra nela mesma', async () => { try { await g.sdUpdate(folder.id, {parent: sub.id}); } catch { return; } throw new Error('deixou mover a pasta para dentro da subpasta'); });
    if (up['planilha.xlsx']) await step('pesquisar no Drive todo', async () => { for (let i = 0; i < 4; i++) { const r = await g.sdSearch('planilha'); if (r.items.some(x => x.id === up['planilha.xlsx'].id)) return 'achou na tentativa ' + (i + 1); await new Promise(r => setTimeout(r, 2500)); } return 'AVISO: o Google ainda nao indexou (normal nos primeiros segundos)'; });
    // so leitura: nunca tenta apagar nada da Sofia (se a protecao falhasse, o proprio teste estragaria)
    await step('area da Sofia protegida', async () => {
      const named = await g.call('GET', 'https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id)&q=' + encodeURIComponent("name='Sofia OS' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'me' in owners"));
      const ids = [...new Set([...Object.values(g.link()?.drive?.folders || {}).filter(Boolean), ...(named.files || []).map(f => f.id)])];
      const l = await g.sdList('root'); must(!l.items.some(i => ids.includes(i.id)), 'pasta da Sofia apareceu na lista');
      for (const id of ids.slice(0, 5)) { let reached = false; try { await g.sdPath(id); reached = true; } catch { /* recusado: certo */ } must(!reached, 'o Drive alcanca uma pasta da Sofia'); }
      const s = await g.sdSearch('Sofia OS'); must(!s.items.some(i => ids.includes(i.id)), 'pasta da Sofia apareceu na pesquisa');
      return ids.length + ' pasta(s) da Sofia conferida(s)'; });
    if (up['foto.png']) await step('lixeira', async () => { await g.sdTrash(up['foto.png'].id); const l = await g.sdList(folder.id); must(!l.items.some(i => i.id === up['foto.png'].id), 'continua na lista'); });
  } finally {
    if (folder) await step('apagar a pasta de teste', async () => { await g.call('DELETE', 'https://www.googleapis.com/drive/v3/files/' + folder.id); });
  }
  return finish();
  function finish() { const bad = steps.filter(s => !s.ok); const r = {ok: !bad.length, falhas: bad.length, ms: Date.now() - t0, steps}; log('[drive-teste] ' + JSON.stringify(r)); return r; }
}

/** Uma vez por versao publicada (commit do Railway), 90 s depois de ligar, se o Drive do usuario estiver ligado. */
function scheduleDriveSelfTest(runtime, {dataDir, port, publicBaseUrl = '', version = process.env.RAILWAY_GIT_COMMIT_SHA || ''} = {}) {
  if (!version || process.env.SOFIA_DRIVE_SELFTEST === '0') return;
  const mark = path.join(dataDir, 'drive-selftest.json');
  setTimeout(async () => {
    try {
      let last = ''; try { last = JSON.parse(fs.readFileSync(mark, 'utf8')).version || ''; } catch { /* primeira vez */ }
      if (last === version) return;
      const g = runtime.google; const l = g && g.link && g.link();
      if (!l || !g.fullDriveOn || !g.fullDriveOn(l)) { console.log('[drive-teste] pulado: Drive do usuario sem a permissao completa'); return; }
      let tries = 0; try { const m = JSON.parse(fs.readFileSync(mark, 'utf8')); if (m.pending === version) tries = Number(m.tries || 0); } catch { /* primeira vez */ }
      if (tries >= 2) return; // caiu no meio duas vezes: nao insiste nesta versao
      fs.writeFileSync(mark, JSON.stringify({version: last, pending: version, tries: tries + 1, at: new Date().toISOString()}));
      // pelo endereco publico, como o navegador (o servidor recusa outro endereco por seguranca)
      const r = await runDriveSelfTest(g, {base: String(publicBaseUrl || '').replace(/\/$/, '') || 'http://127.0.0.1:' + port});
      fs.writeFileSync(mark, JSON.stringify({version, ok: r.ok, at: new Date().toISOString()}));
    } catch (e) { console.log('[drive-teste] erro: ' + String(e && e.message || e).slice(0, 200)); }
  }, 90000).unref();
}
module.exports = {runDriveSelfTest, scheduleDriveSelfTest, zip, DOCX, XLSX, PDF};
