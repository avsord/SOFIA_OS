'use strict';
const tls=require('node:tls');

function encodeSubject(value){return '=?UTF-8?B?'+Buffer.from(String(value),'utf8').toString('base64')+'?=';}
function smtpLine(value){return String(value||'').replace(/[\r\n]+/g,' ').trim();}
function dotStuff(text){return String(text).replace(/(^|\r?\n)\./g,'$1..').replace(/\r?\n/g,'\r\n');}

class AccountMailer {
  /** options.google: conexao Google (google.js). 06/11/2026: o Railway bloqueia SMTP, entao os e-mails da Sofia saem primeiro
   * pela conta Google ligada (permissao "enviar"); o SMTP continua como segunda opcao (computador local, outro servidor). */
  constructor(config,options={}){this.config=config;this.google=options.google||null;}
  smtpConfigured(){return Boolean(this.config.smtpHost&&this.config.smtpPort&&this.config.smtpUser&&this.config.smtpPass&&this.config.smtpFrom);}
  googleReady(){try{return Boolean(this.google&&this.google.canSendMail&&this.google.canSendMail());}catch{return false;}}
  configured(){return this.googleReady()||this.smtpConfigured();}
  /** Entrega a mensagem: Google primeiro; se falhar (ou nao houver), SMTP seguro. */
  async _deliver({to,subject,body}){
    const head=from=>['From: '+smtpLine(from),'To: '+smtpLine(to),'Subject: '+encodeSubject(subject),'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: 8bit','',body].join('\r\n');
    let googleError=null;
    if(this.googleReady()){try{const from=this.google.link?.()?.email||this.config.smtpFrom||'';await this.google.sendRawMail(head(from?'Sofia OS <'+from+'>':'Sofia OS'));return {via:'google'};}catch(e){googleError=e;console.warn('[e-mail] Google nao enviou:',String(e.message||e).slice(0,160));}}
    if(this.smtpConfigured()&&this.config.smtpSecure){await this._send({host:this.config.smtpHost,port:this.config.smtpPort,user:this.config.smtpUser,pass:this.config.smtpPass,from:this.config.smtpFrom,to,message:head(this.config.smtpFrom)});return {via:'smtp'};}
    throw googleError||new Error('Envio de e-mail ainda não configurado.');
  }
  async sendPasswordReset({to,url}){
    const body=[
      'Recebemos uma solicitação para redefinir a senha da Sofia OS.',
      '',
      'Abra este link para criar uma nova senha:',
      url,
      '',
      'O link expira em 30 minutos e só pode ser usado uma vez.',
      'Se você não solicitou esta alteração, ignore esta mensagem.'
    ].join('\n');
    return this._deliver({to,subject:'Redefinir senha da Sofia OS',body});
  }
  /** 0.3.258: codigo do segundo passo no login do site (navegador novo). */
  async sendLoginCode({to,code}){
    const body=['Seu código para entrar na Sofia OS neste navegador:','',code,'','Ele vale por 10 minutos.','Se não foi você, troque sua senha: alguém sabe a senha atual.'].join('\n');
    return this._deliver({to,subject:'Código de acesso da Sofia OS: '+code,body});
  }
  _send({host,port,user,pass,from,to,message}){
    return new Promise((resolve,reject)=>{
      const socket=tls.connect({host,port,servername:host,rejectUnauthorized:true});
      socket.setEncoding('utf8');socket.setTimeout(15000);
      let buffer='',queue=[],closed=false,currentReply=null;
      const fail=error=>{if(closed)return;closed=true;try{socket.destroy();}catch{}reject(error instanceof Error?error:new Error(String(error)));};
      const parse=()=>{
        while(true){const i=buffer.indexOf('\n');if(i<0)return;const line=buffer.slice(0,i+1).replace(/\r?\n$/,'');buffer=buffer.slice(i+1);const match=line.match(/^(\d{3})([- ])(.*)$/);if(!match)continue;const code=Number(match[1]),sep=match[2],text=match[3];if(!currentReply)currentReply={code,texts:[text]};else currentReply.texts.push(text);if(sep===' '){const done=currentReply;currentReply=null;const item=queue.shift();if(item)item({code:done.code,text:done.texts.join('\n')});}
        }
      };
      socket.on('data',chunk=>{buffer+=chunk;parse();});socket.on('error',fail);socket.on('timeout',()=>fail(new Error('Tempo esgotado ao enviar o e-mail.')));
      const response=()=>new Promise((res,rej)=>{queue.push(r=>res(r));socket.once('error',rej);parse();});
      const expect=async(expected,command)=>{const r=await response();if(!expected.includes(r.code))throw new Error('SMTP recusou '+command+' ('+r.code+').');return r;};
      const send=line=>socket.write(line+'\r\n');
      socket.once('secureConnect',()=>{void (async()=>{try{
        await expect([220],'conexão');send('EHLO sofiaos.up.railway.app');await expect([250],'EHLO');
        send('AUTH LOGIN');await expect([334],'autenticação');send(Buffer.from(user,'utf8').toString('base64'));await expect([334],'usuário SMTP');send(Buffer.from(pass,'utf8').toString('base64'));await expect([235],'senha SMTP');
        send('MAIL FROM:<'+smtpLine(from).replace(/[<>]/g,'')+'>');await expect([250],'remetente');send('RCPT TO:<'+smtpLine(to).replace(/[<>]/g,'')+'>');await expect([250,251],'destinatário');
        send('DATA');await expect([354],'conteúdo');socket.write(dotStuff(message)+'\r\n.\r\n');await expect([250],'envio');send('QUIT');await expect([221],'encerramento');closed=true;socket.end();resolve();
      }catch(error){fail(error);}})();});
    });
  }
}
module.exports={AccountMailer};
