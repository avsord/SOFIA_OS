'use strict';
// 06/11/2026: o Railway bloqueia SMTP; redefinicao de senha e codigo do login saem pela conta Google ligada.
const test=require('node:test'),assert=require('node:assert/strict');
const {AccountMailer}=require('../src/services/account-mailer.js');
const fakeGoogle=(can=true,fail=false)=>{const sent=[];return {sent,canSendMail:()=>can,link:()=>({email:'pedro@gmail.com'}),sendRawMail:async m=>{if(fail)throw new Error('quota');sent.push(m);return {};}};};
test('redefinicao de senha sai pela conta Google quando ela pode enviar',async()=>{
  const g=fakeGoogle();const m=new AccountMailer({smtpSecure:true},{google:g});
  assert.equal(m.configured(),true);
  const r=await m.sendPasswordReset({to:'pedro@gmail.com',url:'https://x/reset?token=abc'});
  assert.equal(r.via,'google');assert.equal(g.sent.length,1);
  assert.match(g.sent[0],/^From: Sofia OS <pedro@gmail\.com>\r\nTo: pedro@gmail\.com\r\nSubject: =\?UTF-8\?B\?/);
  assert.ok(g.sent[0].includes('https://x/reset?token=abc'));
});
test('codigo do login tambem sai pelo Google',async()=>{const g=fakeGoogle();const m=new AccountMailer({},{google:g});const r=await m.sendLoginCode({to:'a@b.c',code:'123456'});assert.equal(r.via,'google');assert.ok(g.sent[0].includes('123456'));});
test('sem Google com permissao de envio e sem SMTP: nao configurado (como antes)',async()=>{const m=new AccountMailer({},{google:fakeGoogle(false)});assert.equal(m.configured(),false);await assert.rejects(m.sendLoginCode({to:'a@b.c',code:'1'}));});
test('cabecalho nao aceita quebra de linha (sem injecao de destinatario)',async()=>{const g=fakeGoogle();const m=new AccountMailer({},{google:g});await m.sendLoginCode({to:'a@b.c\r\nBcc: x@y.z',code:'1'});assert.ok(!/\r\nBcc:/.test(g.sent[0]));});
