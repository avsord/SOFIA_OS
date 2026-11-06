'use strict';
// 06/11/2026 (Pedro: "EMAIL DA SOFIA ENVIA PARA O USUARIO, NAO O MEU EMAIL"): o Railway bloqueia SMTP; redefinicao de senha
// e codigo do login saem do E-MAIL DA SOFIA, ligado so para envio (Gmail por HTTPS), separado da conta Google pessoal.
const test=require('node:test'),assert=require('node:assert/strict');
const {AccountMailer}=require('../src/services/account-mailer.js');
const {GoogleService,SCOPES}=require('../src/services/google');
const {fixture}=require('./helpers.cjs');
const ENV={GOOGLE_CALENDAR_CLIENT_ID:'cid',GOOGLE_CALENDAR_CLIENT_SECRET:'csecret',SOFIA_CALENDAR_TOKEN_KEY:'chave-de-teste'};
const jwt=email=>'x.'+Buffer.from(JSON.stringify({email})).toString('base64url')+'.y';
const fakeGoogle=(can=true)=>{const sent=[];return {sent,canSendMail:()=>can,senderEmail:()=>'sofia@gmail.com',sendRawMail:async m=>{sent.push(m);return {};}};};

test('redefinicao de senha sai do e-mail da Sofia para o e-mail do usuario',async()=>{
  const g=fakeGoogle();const m=new AccountMailer({smtpSecure:true},{google:g});
  const r=await m.sendPasswordReset({to:'usuario@exemplo.com',url:'https://x/reset?token=abc'});
  assert.equal(r.via,'google');assert.match(g.sent[0],/^From: Sofia OS <sofia@gmail\.com>\r\nTo: usuario@exemplo\.com\r\n/);assert.ok(g.sent[0].includes('https://x/reset?token=abc'));
});
test('sem remetente ligado e sem SMTP: nao configurado (como antes)',async()=>{const m=new AccountMailer({},{google:fakeGoogle(false)});assert.equal(m.configured(),false);await assert.rejects(m.sendLoginCode({to:'a@b.c',code:'1'}));});
test('cabecalho nao aceita quebra de linha (sem injecao de destinatario)',async()=>{const g=fakeGoogle();await new AccountMailer({},{google:g}).sendLoginCode({to:'a@b.c\r\nBcc: x@y.z',code:'1'});assert.ok(!/\r\nBcc:/.test(g.sent[0]));});
test('conta Google pessoal NAO pede permissao de envio',()=>{assert.ok(!SCOPES.some(s=>/gmail\.send/.test(s)));});

function svcWith(t,tokenEmail,scope){
  const f=fixture(t);const calls=[];
  const fetchImpl=async(url,opt={})=>{calls.push({url:String(url),opt});
    if(String(url).includes('oauth2.googleapis.com/token'))return {ok:true,status:200,json:async()=>({access_token:'at',refresh_token:'rt',expires_in:3600,scope,id_token:jwt(tokenEmail)})};
    if(String(url).includes('/messages/send'))return {ok:true,status:200,json:async()=>({id:'1'})};
    return {ok:true,status:200,json:async()=>({})};};
  const svc=new GoogleService(f.store,f.core.workspace,{...f.config,smtpUser:'Sofia@Gmail.com',publicBaseUrl:'https://sofia.test'},{fetchImpl,env:ENV});
  return {svc,calls};
}
test('ligar o remetente: so aceita o e-mail da Sofia; outra conta e recusada e revogada',async t=>{
  const {svc,calls}=svcWith(t,'pedro.pessoal@gmail.com','openid email https://www.googleapis.com/auth/gmail.send');
  const u=new URL(svc.senderConnectUrl().url);assert.equal(u.searchParams.get('login_hint'),'sofia@gmail.com');assert.match(u.searchParams.get('scope'),/gmail\.send/);assert.ok(!/calendar|readonly/.test(u.searchParams.get('scope')));
  const r=await svc.callback(new URLSearchParams({state:u.searchParams.get('state'),code:'c'}));
  assert.equal(r.ok,false);assert.match(r.message,/sofia@gmail\.com/);assert.equal(svc.canSendMail(),false);assert.ok(calls.some(c=>c.url.includes('/revoke')));
});
test('ligar o remetente com o e-mail da Sofia: envia pelo Gmail e nao mexe na conta pessoal',async t=>{
  const {svc,calls}=svcWith(t,'sofia@gmail.com','openid email https://www.googleapis.com/auth/gmail.send');
  const u=new URL(svc.senderConnectUrl().url);
  const r=await svc.callback(new URLSearchParams({state:u.searchParams.get('state'),code:'c'}));
  assert.equal(r.ok,true);assert.equal(svc.canSendMail(),true);assert.equal(svc.link(),null,'a conta pessoal nao foi tocada');
  const m=new AccountMailer({},{google:svc});const out=await m.sendPasswordReset({to:'usuario@exemplo.com',url:'https://x/r'});
  assert.equal(out.via,'google');const send=calls.find(c=>c.url.includes('/messages/send'));assert.ok(send);
  const raw=Buffer.from(JSON.parse(send.opt.body).raw,'base64url').toString('utf8');assert.match(raw,/^From: Sofia OS <sofia@gmail\.com>\r\nTo: usuario@exemplo\.com/);
});
