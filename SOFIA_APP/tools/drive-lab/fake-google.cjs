'use strict';
/*
 * Laboratorio do Drive (07/11/2026, Pedro: "cria um metodo pra deixar o drive 100%"). Um Google Drive FIEL, em memoria,
 * para o servidor da Sofia conversar como se fosse o Google: consulta `q` de verdade (clausulas com and/or/not, contains sem
 * diferenciar maiusculas, parents, trashed, owners, sharedWithMe, mimeType), paginas com nextPageToken, arquivos nativos do
 * Google (Docs/Planilhas/Apresentacoes, sem tamanho e sem download direto), atalhos, compartilhados comigo (sem pais no meu
 * Drive), area de app (appDataFolder), miniaturas, Range em video, exportar/copiar convertendo, envio multipart e resumable,
 * erros no formato do Google. Consulta que o Google recusaria aqui tambem e recusada (400), para pegar consulta mal feita.
 */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const FIX = path.join(__dirname, 'fixtures');
const FOLDER = 'application/vnd.google-apps.folder', GDOC = 'application/vnd.google-apps.document', GSHEET = 'application/vnd.google-apps.spreadsheet', GSLIDES = 'application/vnd.google-apps.presentation', SHORTCUT = 'application/vnd.google-apps.shortcut';
const OFFICE = {docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'};

function createFakeGoogle({rootId = 'raizMeuDrive0001', seed = true} = {}) {
  const files = new Map(), bytes = new Map(), log = [], uploads = new Map();
  let n = 0, clock = Date.parse('2026-11-01T12:00:00Z');
  const nid = () => 'lab' + (++n).toString(36).padStart(6, '0') + crypto.randomBytes(4).toString('hex');
  const tick = () => new Date(clock += 60000).toISOString();
  const put = (f, data) => { const id = f.id || nid(); const rec = {kind: 'drive#file', id, name: '', mimeType: 'application/octet-stream', parents: [rootId], trashed: false, appProperties: {}, spaces: ['drive'], ownedByMe: true, owners: [{me: true, emailAddress: 'usuario@gmail.com'}], createdTime: tick(), modifiedTime: tick(), ...f, id};
    if (data != null) { const b = Buffer.isBuffer(data) ? data : Buffer.from(String(data)); bytes.set(id, b); rec.size = String(b.length); }
    if (rec.mimeType === FOLDER || rec.mimeType.startsWith('application/vnd.google-apps.')) delete rec.size;
    if (/^(image|video)\//.test(rec.mimeType) || rec.mimeType === 'application/pdf' || rec.mimeType.startsWith('application/vnd.google-apps.') && rec.mimeType !== FOLDER && rec.mimeType !== SHORTCUT) rec.thumbnailLink = 'https://lh3.googleusercontent.com/drive-thumb/' + id + '=s220';
    files.set(id, rec); return rec; };
  files.set(rootId, {kind: 'drive#file', id: rootId, name: 'Meu Drive', mimeType: FOLDER, parents: [], trashed: false, appProperties: {}, spaces: ['drive'], ownedByMe: true, owners: [{me: true}], modifiedTime: tick()});

  const fixtures = {};
  const fx = name => fixtures[name] || (fixtures[name] = fs.readFileSync(path.join(FIX, name)));
  const zip = require('../../../src/services/drive-selftest.js');
  if (seed) {
    const trab = put({name: 'Trabalho', mimeType: FOLDER});
    const fotos = put({name: 'Fotos 📷 de família', mimeType: FOLDER});
    const viagem = put({name: 'Viagem "Europa" d\'Ouro 2026', mimeType: FOLDER});
    put({name: 'foto da praia.jpg', mimeType: 'image/jpeg', parents: [fotos.id]}, fx('foto.jpg'));
    put({name: 'retrato.png', mimeType: 'image/png', parents: [fotos.id]}, fx('retrato.png'));
    put({name: 'vídeo da viagem.mp4', mimeType: 'video/mp4', parents: [viagem.id]}, fx('video.mp4'));
    put({name: 'música.mp3', mimeType: 'audio/mpeg', parents: [viagem.id]}, fx('audio.mp3'));
    let deep = viagem; for (let i = 1; i <= 6; i++) deep = put({name: 'Nível ' + i, mimeType: FOLDER, parents: [deep.id]});
    put({name: 'no fundo.txt', mimeType: 'text/plain', parents: [deep.id]}, 'cheguei no fundo');
    put({name: 'Contrato assinado.pdf', mimeType: 'application/pdf'}, zip.PDF());
    put({name: 'Proposta comercial.docx', mimeType: OFFICE.docx}, zip.DOCX());
    put({name: 'Orçamento 2026.xlsx', mimeType: OFFICE.xlsx}, zip.XLSX());
    put({name: 'Apresentação.pptx', mimeType: OFFICE.pptx}, zip.DOCX());
    put({name: 'Notas da reunião', mimeType: GDOC});
    put({name: 'Controle de gastos', mimeType: GSHEET});
    put({name: 'Pitch', mimeType: GSLIDES});
    put({name: 'Atalho para Trabalho', mimeType: SHORTCUT, shortcutDetails: {targetId: trab.id, targetMimeType: FOLDER}});
    put({name: 'arquivo sem extensao', mimeType: 'application/octet-stream'}, 'dados');
    put({name: 'backup.zip', mimeType: 'application/zip'}, 'PK');
    put({name: 'leia-me.txt', mimeType: 'text/plain'}, 'Olá! Arquivo de texto com acentuação: ção, ñ, 😀.');
    for (let i = 1; i <= 250; i++) put({name: 'Relatório ' + String(i).padStart(3, '0') + '.txt', mimeType: 'text/plain', parents: [trab.id]}, 'relatorio ' + i);
    // compartilhado comigo: nao e meu, sem pai no meu Drive
    put({name: 'Planilha do cliente (compartilhada)', mimeType: GSHEET, parents: undefined, ownedByMe: false, owners: [{me: false, emailAddress: 'cliente@empresa.com'}], sharedWithMe: true});
    // area da Sofia: NUNCA pode aparecer nem ser mexida
    const sofiaOld = put({id: 'pastaSofiaAntiga01', name: 'Sofia OS', mimeType: FOLDER});
    put({name: 'Paginas', mimeType: FOLDER, parents: [sofiaOld.id]});
    put({name: 'pagina-secreta.md', mimeType: 'text/markdown', parents: [sofiaOld.id]}, '# segredo da Sofia');
    const bk = put({name: 'Backups', mimeType: FOLDER, appProperties: {sofia_cat: 'Backups'}});
    put({name: 'sofia-2026-11-06.sofia-backup', mimeType: 'application/octet-stream', parents: [bk.id], appProperties: {sofia_cat: 'Backups'}}, 'backup');
    put({name: 'Relatório interno da Sofia.txt', mimeType: 'text/plain', parents: [bk.id]}, 'interno');
    put({name: 'config.json', mimeType: 'application/json', parents: ['appDataFolder'], spaces: ['appDataFolder']}, '{}');
  }
  const SOFIA_IDS = () => [...files.values()].filter(f => f.id === 'pastaSofiaAntiga01' || f.appProperties?.sofia_cat || (f.spaces || []).includes('appDataFolder') || ancestors(f).some(a => a.id === 'pastaSofiaAntiga01' || a.appProperties?.sofia_cat)).map(f => f.id);
  function ancestors(f) { const out = []; let cur = f; for (let i = 0; i < 50 && cur && cur.parents && cur.parents[0]; i++) { cur = files.get(cur.parents[0]); if (cur) out.push(cur); } return out; }

  // ---------- consulta q ----------
  function tokenize(q) { const t = []; let i = 0; while (i < q.length) { const c = q[i]; if (/\s/.test(c)) { i++; continue; }
    if (c === "'") { let s = ''; i++; while (i < q.length && q[i] !== "'") { if (q[i] === '\\') { s += q[i + 1]; i += 2; } else s += q[i++]; } if (q[i] !== "'") throw bad('aspas sem fechar'); i++; t.push({s}); continue; }
    if (c === '(' || c === ')') { t.push({p: c}); i++; continue; }
    const m = /^(!=|=|<=|>=|<|>|[A-Za-z_][\w.]*)/.exec(q.slice(i)); if (!m) throw bad('caractere ' + c); t.push({w: m[1]}); i += m[1].length; } return t; }
  function bad(m) { const e = new Error('Invalid Value'); e.status = 400; e.reason = 'invalid'; e.detail = m; return e; }
  function parse(q) { const t = tokenize(q); let i = 0; const peek = () => t[i], take = () => t[i++];
    const expr = () => { let a = term(); while (peek() && peek().w && peek().w.toLowerCase() === 'or') { take(); const b = term(), x = a; a = f => x(f) || b(f); } return a; };
    const term = () => { let a = fac(); while (peek() && peek().w && peek().w.toLowerCase() === 'and') { take(); const b = fac(), x = a; a = f => x(f) && b(f); } return a; };
    const fac = () => { const k = peek(); if (!k) throw bad('fim inesperado');
      if (k.w && k.w.toLowerCase() === 'not') { take(); const x = fac(); return f => !x(f); }
      if (k.p === '(') { take(); const x = expr(); if (!peek() || peek().p !== ')') throw bad('parentese'); take(); return x; }
      if (k.s !== undefined) { take(); const op = take(); if (!op || op.w !== 'in') throw bad('esperava in'); const fld = take(); if (!fld || !fld.w) throw bad('campo');
        const v = k.s; if (fld.w === 'parents') return f => (f.parents || []).includes(v); if (fld.w === 'owners') return f => v === 'me' ? !!f.ownedByMe : (f.owners || []).some(o => o.emailAddress === v); throw bad('campo ' + fld.w); }
      if (k.w) { take(); const fld = k.w;
        if (fld === 'sharedWithMe' || fld === 'starred') { if (peek() && peek().w === '=') { take(); const v = take().w; return f => !!f[fld] === (v === 'true'); } return f => !!f[fld]; }
        const op = take(); if (!op || !op.w) throw bad('operador'); const valTok = take(); if (!valTok) throw bad('valor');
        const val = valTok.s !== undefined ? valTok.s : valTok.w;
        if (fld === 'trashed') { if (!['=', '!='].includes(op.w)) throw bad('trashed'); const want = val === 'true'; return f => op.w === '=' ? !!f.trashed === want : !!f.trashed !== want; }
        if (fld === 'name' || fld === 'fullText') { if (valTok.s === undefined) throw bad('texto sem aspas');
          if (op.w === 'contains') return f => String(f.name).toLowerCase().includes(val.toLowerCase()) || fld === 'fullText' && String(bytes.get(f.id) || '').toLowerCase().includes(val.toLowerCase());
          if (op.w === '=') return f => f.name === val; if (op.w === '!=') return f => f.name !== val; throw bad('operador de nome'); }
        if (fld === 'mimeType') { if (valTok.s === undefined) throw bad('mime sem aspas'); if (op.w === '=') return f => f.mimeType === val; if (op.w === '!=') return f => f.mimeType !== val; if (op.w === 'contains') return f => f.mimeType.includes(val); throw bad('operador mime'); }
        if (fld === 'modifiedTime') { const d = Date.parse(val); return f => { const m = Date.parse(f.modifiedTime); return op.w === '>' ? m > d : op.w === '<' ? m < d : op.w === '>=' ? m >= d : m <= d; }; }
        if (fld === 'appProperties' || fld === 'properties') throw bad('appProperties nao suportado no laboratorio');
        throw bad('campo ' + fld); }
      throw bad('token'); };
    const r = expr(); if (i < t.length) throw bad('sobrou ' + JSON.stringify(t[i])); return r; }
  function order(list, ob) { const keys = String(ob || '').split(',').map(s => s.trim()).filter(Boolean);
    return list.sort((a, b) => { for (const k of keys) { const [f, dir] = k.split(/\s+/), d = dir === 'desc' ? -1 : 1; let c = 0;
      if (f === 'folder') c = Number(b.mimeType === FOLDER) - Number(a.mimeType === FOLDER); else if (f === 'name' || f === 'name_natural') c = a.name.localeCompare(b.name, 'pt-BR', {numeric: f === 'name_natural', sensitivity: 'base'}) * d;
      else if (f === 'modifiedTime' || f === 'createdTime' || f === 'recency' || f === 'viewedByMeTime') c = (Date.parse(a.modifiedTime) - Date.parse(b.modifiedTime)) * d; else if (f === 'quotaBytesUsed') c = (Number(a.size || 0) - Number(b.size || 0)) * d; else throw bad('orderBy ' + f);
      if (c) return c; } return 0; }); }

  // ---------- respostas ----------
  const J = (st, o, h = {}) => new Response(o == null ? null : JSON.stringify(o), {status: st, headers: {'content-type': 'application/json', ...h}});
  const ERR = (st, msg, reason = 'notFound') => J(st, {error: {code: st, message: msg, errors: [{message: msg, domain: 'global', reason}]}});
  const pub = f => { const o = {...f}; return o; };
  const visibleTo = f => f && !(f.spaces || []).includes('appDataFolder');

  async function fetchImpl(url, opt = {}) {
    const u = new URL(String(url)), m = (opt.method || 'GET').toUpperCase(), hd = Object.fromEntries(Object.entries(opt.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const bodyBuf = opt.body == null ? null : Buffer.isBuffer(opt.body) ? opt.body : typeof opt.body === 'string' ? Buffer.from(opt.body) : opt.body instanceof Uint8Array ? Buffer.from(opt.body) : null;
    const js = bodyBuf && /json/.test(String(hd['content-type'] || '')) ? JSON.parse(bodyBuf.toString() || '{}') : null;
    log.push(m + ' ' + u.pathname + u.search.slice(0, 200));
    try {
      if (u.hostname === 'oauth2.googleapis.com' || u.pathname.endsWith('/token')) return J(200, {access_token: 'lab-token', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive', token_type: 'Bearer'});
      if (u.hostname.endsWith('googleusercontent.com')) { const id = u.pathname.split('/').pop().split('=')[0]; const f = files.get(id); if (!f) return ERR(404, 'not found'); return new Response(/^image\//.test(f.mimeType) ? bytes.get(id) : fx('foto.jpg'), {status: 200, headers: {'content-type': 'image/jpeg'}}); }
      if (u.hostname !== 'www.googleapis.com') return J(200, {});
      if (!/^Bearer /.test(String(hd.authorization || ''))) return ERR(401, 'Login Required', 'required');
      let p = u.pathname;
      // ---- envio ----
      if (p === '/upload/drive/v3/files' && m === 'POST') {
        const type = u.searchParams.get('uploadType');
        if (type === 'multipart') { const ct = String(hd['content-type'] || ''), bnd = /boundary=([^;]+)/.exec(ct)?.[1]; if (!bnd || !bodyBuf) return ERR(400, 'Bad multipart', 'badRequest');
          const s = bodyBuf.toString('latin1'), parts = s.split('--' + bnd).slice(1, -1); if (parts.length !== 2) return ERR(400, 'Esperava 2 partes', 'badRequest');
          const meta = JSON.parse(Buffer.from(parts[0].split('\r\n\r\n').slice(1).join('\r\n\r\n'), 'latin1').toString('utf8').trim());
          const raw = parts[1].slice(parts[1].indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''); const data = Buffer.from(raw, 'latin1');
          for (const par of meta.parents || []) if (!files.get(par) || files.get(par).mimeType !== FOLDER) return ERR(404, 'File not found: ' + par + '.');
          return J(200, pub(put({name: meta.name, mimeType: meta.mimeType || 'application/octet-stream', parents: meta.parents || [rootId], appProperties: meta.appProperties || {}}, data))); }
        if (type === 'resumable') { const sid = nid(); uploads.set(sid, {meta: js || {}, chunks: [], total: Number(hd['x-upload-content-length'] || 0)}); return new Response(null, {status: 200, headers: {location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=' + sid}}); }
        return ERR(400, 'uploadType invalido', 'badRequest');
      }
      if (p === '/upload/drive/v3/files' && m === 'PUT') { const up = uploads.get(u.searchParams.get('upload_id')); if (!up) return ERR(404, 'upload nao existe');
        const cr = /bytes (\d+)-(\d+)\/(\d+|\*)/.exec(String(hd['content-range'] || '')); if (bodyBuf) up.chunks.push(bodyBuf); const got = up.chunks.reduce((a, b) => a + b.length, 0);
        if (cr && cr[3] !== '*' && got < Number(cr[3])) return new Response(null, {status: 308, headers: {range: 'bytes=0-' + (got - 1)}});
        uploads.delete(u.searchParams.get('upload_id')); return J(200, pub(put({name: up.meta.name, mimeType: up.meta.mimeType || 'application/octet-stream', parents: up.meta.parents || [rootId], appProperties: up.meta.appProperties || {}}, Buffer.concat(up.chunks)))); }
      if (!p.startsWith('/drive/v3/')) return J(200, {});
      p = p.slice('/drive/v3'.length);
      if (p === '/about') return J(200, {user: {emailAddress: 'usuario@gmail.com'}, storageQuota: {limit: '16106127360', usage: '1000000'}});
      if (p === '/files' && m === 'GET') {
        const q = u.searchParams.get('q') || '', space = u.searchParams.get('spaces') || 'drive';
        const pred = q ? parse(q) : () => true;
        let list = [...files.values()].filter(f => f.id !== rootId && (space === 'appDataFolder' ? (f.spaces || []).includes('appDataFolder') : visibleTo(f)) && pred(f));
        list = order(list, u.searchParams.get('orderBy'));
        const size = Math.min(1000, Number(u.searchParams.get('pageSize') || 100)), start = Number(u.searchParams.get('pageToken') || 0);
        const page = list.slice(start, start + size); return J(200, {kind: 'drive#fileList', files: page.map(pub), ...(start + size < list.length ? {nextPageToken: String(start + size)} : {})});
      }
      if (p === '/files' && m === 'POST') { for (const par of js?.parents || []) if (!files.get(par)) return ERR(404, 'File not found: ' + par + '.');
        return J(200, pub(put({name: js?.name || 'Sem título', mimeType: js?.mimeType || 'application/octet-stream', parents: js?.parents || [rootId], appProperties: js?.appProperties || {}}, js?.mimeType === FOLDER || String(js?.mimeType || '').startsWith('application/vnd.google-apps.') ? null : ''))); }
      let mm = /^\/files\/([^/]+)$/.exec(p);
      if (mm) { let id = mm[1]; if (id === 'root') id = rootId; const f = files.get(id); if (!f) return ERR(404, 'File not found: ' + mm[1] + '.');
        if (m === 'GET' && u.searchParams.get('alt') === 'media') {
          if (f.mimeType.startsWith('application/vnd.google-apps.')) return ERR(403, 'Only files with binary content can be downloaded. Use Export with Docs Editors files.', 'fileNotDownloadable');
          const b = bytes.get(id) || Buffer.alloc(0), r = /bytes=(\d*)-(\d*)/.exec(String(hd.range || ''));
          if (r) { let a = r[1] === '' ? Math.max(0, b.length - Number(r[2])) : Number(r[1]), z = r[1] === '' ? b.length - 1 : r[2] === '' ? b.length - 1 : Math.min(Number(r[2]), b.length - 1); if (a >= b.length) return new Response(null, {status: 416, headers: {'content-range': 'bytes */' + b.length}});
            return new Response(b.subarray(a, z + 1), {status: 206, headers: {'content-type': f.mimeType, 'content-range': 'bytes ' + a + '-' + z + '/' + b.length, 'content-length': String(z - a + 1)}}); }
          return new Response(b, {status: 200, headers: {'content-type': f.mimeType, 'content-length': String(b.length)}}); }
        if (m === 'GET') return J(200, pub(f));
        if (m === 'PATCH') { const add = u.searchParams.get('addParents'), rem = u.searchParams.get('removeParents');
          if (add) { if (!files.get(add)) return ERR(404, 'File not found: ' + add + '.'); let cur = files.get(add); for (let i = 0; cur && i < 60; i++) { if (cur.id === id) return ERR(403, 'Cycles are not allowed', 'cannotAddParent'); cur = files.get((cur.parents || [])[0]); }
            f.parents = [...(f.parents || []).filter(x => !rem || !rem.split(',').includes(x)), add]; } else if (rem) f.parents = (f.parents || []).filter(x => !rem.split(',').includes(x));
          if (js) { if (typeof js.name === 'string') f.name = js.name; if (typeof js.trashed === 'boolean') f.trashed = js.trashed; if (typeof js.starred === 'boolean') f.starred = js.starred; if (js.appProperties) f.appProperties = {...f.appProperties, ...js.appProperties}; }
          f.modifiedTime = tick(); return J(200, pub(f)); }
        if (m === 'DELETE') { const kill = x => { files.delete(x); bytes.delete(x); for (const c of [...files.values()]) if ((c.parents || []).includes(x)) kill(c.id); }; kill(id); return new Response(null, {status: 204}); }
      }
      mm = /^\/files\/([^/]+)\/copy$/.exec(p);
      if (mm && m === 'POST') { const f = files.get(mm[1]); if (!f) return ERR(404, 'File not found: ' + mm[1] + '.');
        const to = js?.mimeType || f.mimeType; if (to.startsWith('application/vnd.google-apps.') && !f.mimeType.startsWith('application/vnd.google-apps.') && !/officedocument|msword|ms-excel|ms-powerpoint|opendocument|text\/(plain|csv)|rtf/.test(f.mimeType)) return ERR(400, 'Conversion not supported', 'badRequest');
        return J(200, pub(put({name: js?.name || 'Cópia de ' + f.name, mimeType: to, parents: js?.parents || f.parents, appProperties: js?.appProperties || {}}, to.startsWith('application/vnd.google-apps.') ? null : bytes.get(f.id)))); }
      mm = /^\/files\/([^/]+)\/export$/.exec(p);
      if (mm) { const f = files.get(mm[1]); if (!f) return ERR(404, 'File not found: ' + mm[1] + '.'); if (!f.mimeType.startsWith('application/vnd.google-apps.')) return ERR(403, 'Export only supports Docs Editors files.', 'fileNotExportable');
        const want = u.searchParams.get('mimeType'); if (want === 'application/pdf') return new Response(zip.PDF(), {status: 200, headers: {'content-type': 'application/pdf'}});
        if (Object.values(OFFICE).includes(want)) return new Response(f.mimeType === GSHEET ? zip.XLSX() : zip.DOCX(), {status: 200, headers: {'content-type': want}});
        if (want === 'text/plain' || want === 'text/csv') return new Response('texto exportado', {status: 200, headers: {'content-type': want}});
        return ERR(400, 'Export format not supported', 'badRequest'); }
      return ERR(404, 'Not Found: ' + p, 'notFound');
    } catch (e) { if (e.status) return ERR(e.status, e.message + (e.detail ? ' (' + e.detail + ')' : ''), e.reason); throw e; }
  }
  return {fetch: fetchImpl, files, bytes, log, rootId, SOFIA_IDS, ancestors, FOLDER};
}
module.exports = {createFakeGoogle};
