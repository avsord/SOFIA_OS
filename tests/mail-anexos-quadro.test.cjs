// 08/11/2026 (Pedro: Quadro - anexo de e-mail vira cartao): anexos sao lidos so quando pedidos (Gmail pela Conta Google).
const test = require('node:test'), assert = require('node:assert');
const {MailWatcher} = require('../src/services/mail-watch');
test('anexos do Gmail: lista e baixa sob pedido', async () => {
  const ents = {
    h1: {id: 'h1', kind: 'mail_hit', data: {account_id: 'acc1', message_key: 'acc1:gmail:MSG123'}},
    acc1: {id: 'acc1', kind: 'mail_account', data: {provider: 'gmail_google'}},
    p1: {id: 'p1', kind: 'user_page', data: {}}};
  const w = {get: id => {if (!ents[id]) throw Object.assign(new Error('nao'), {code: 'NOT_FOUND'}); return ents[id];}};
  const calls = [];
  const google = {link: () => ({refresh: 'r'}), call: async (m, url) => {calls.push(url);
    if (/\/attachments\/ATT1$/.test(url)) return {data: Buffer.from('PDF bytes').toString('base64').replace(/\+/g, '-').replace(/\//g, '_')};
    return {payload: {parts: [{mimeType: 'text/plain', body: {size: 3}}, {filename: 'contrato.pdf', mimeType: 'application/pdf', body: {attachmentId: 'ATT1', size: 9}}, {parts: [{filename: 'foto.jpg', mimeType: 'image/jpeg', body: {attachmentId: 'ATT2', size: 20}}]}]}};}};
  const mw = new MailWatcher(w, {}, {}); mw.google = google;
  const list = await mw.attachmentsOf('h1');
  assert.deepEqual(list.map(a => a.name), ['contrato.pdf', 'foto.jpg']);
  assert.ok(calls[0].includes('/messages/MSG123?format=full'));
  const f = await mw.attachmentBytes('h1', 'ATT1');
  assert.equal(f.data.toString(), 'PDF bytes'); assert.equal(f.mime, 'application/pdf');
  await assert.rejects(() => mw.attachmentBytes('h1', 'NAO'), /não encontrado/);
  await assert.rejects(() => mw.attachmentsOf('p1'), /não encontrado/);
});
