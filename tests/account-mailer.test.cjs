'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AccountMailer}=require('../src/services/account-mailer');

test('v133: mailer de recuperação usa SMTP seguro sem expor a credencial no conteúdo',async()=>{
  const config={smtpHost:'smtp.gmail.com',smtpPort:465,smtpSecure:true,smtpUser:'owner@example.com',smtpPass:'segredo-smtp-teste',smtpFrom:'owner@example.com',sofiaEmail:'owner@example.com'}; /* 07/11/2026: remetente = e-mail corporativo da Sofia */
  const mailer=new AccountMailer(config);let sent=null;mailer._send=async payload=>{sent=payload;};
  assert.equal(mailer.configured(),true);
  await mailer.sendPasswordReset({to:'destino@example.com',url:'https://example.com/reset-password?token=abc'});
  assert.equal(sent.to,'destino@example.com');assert.match(sent.message,/Subject: =\?UTF-8\?B\?/);assert.match(sent.message,/reset-password\?token=abc/);assert.ok(!sent.message.includes(config.smtpPass));
});
