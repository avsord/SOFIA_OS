'use strict';
// 06/11/2026 (Pedro: "paginas com senha, tudo que esta la dentro criptografado"; nivel Maxima ou Media): o conteudo e
// cifrado NO NAVEGADOR com uma chave da pagina, embrulhada pela senha da pagina. O servidor so ve o texto cifrado.
// Nivel Media: o navegador entrega tambem a chave da pagina para o servidor guardar cifrada (com a chave local do
// servidor); "Esqueci a senha" devolve essa chave depois de conferir a senha da CONTA. Nivel Maxima: o servidor nunca
// recebe a chave (esqueceu = perdeu).
const crypto=require('crypto'),fs=require('fs'),path=require('path');
const {AppError}=require('./util');
const KID=/^[A-Za-z0-9_-]{16,64}$/;
// A chave-mestra fica na pasta de dados (o volume que sobrevive aos deploys do Railway); a pasta "secure" padrao do
// servidor e apagada a cada deploy e as chaves guardadas ficariam impossiveis de abrir.
function masterKey(file){
 try{const k=fs.readFileSync(file);if(k.length===32)return k;}catch{}
 const k=crypto.randomBytes(32);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,k,{mode:0o600,flag:'wx'});return fs.readFileSync(file);
}
function makePageLocks(store,{keyFile,ownerAuth}){
 const read=()=>{const v=store.settings().pageLockKeys;return v&&typeof v==='object'&&!Array.isArray(v)?v:{};};
 const write=map=>store.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('pageLockKeys',JSON.stringify(map));
 let mk=null;const master=()=>(mk=mk||crypto.createHash('sha256').update('sofia-page-lock-v1:').update(masterKey(keyFile)).digest());
 const seal=raw=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',master(),iv),d=Buffer.concat([c.update(raw),c.final()]);return [iv,c.getAuthTag(),d].map(b=>b.toString('base64')).join('.');};
 const open=s=>{const [iv,tag,d]=String(s).split('.').map(x=>Buffer.from(x,'base64'));const c=crypto.createDecipheriv('aes-256-gcm',master(),iv);c.setAuthTag(tag);return Buffer.concat([c.update(d),c.final()]);};
 const fails=[];
 return {
  put(kid,keyB64){if(!KID.test(String(kid||'')))throw new AppError('BAD_INPUT','Chave inválida.',400);
   const map=read();if(keyB64==null){delete map[kid];write(map);return {ok:true};}
   const raw=Buffer.from(String(keyB64),'base64');if(raw.length!==32)throw new AppError('BAD_INPUT','Chave inválida.',400);
   map[kid]=seal(raw);write(map);return {ok:true};},
  has(kid){return Boolean(read()[kid]);},
  recover(kid,password){
   const now=Date.now();while(fails.length&&now-fails[0]>15*60000)fails.shift();
   if(fails.length>=5)throw new AppError('RATE_LIMITED','Muitas tentativas. Tente de novo em 15 minutos.',429);
   if(!ownerAuth||!ownerAuth.verifyPassword(String(password||''))){fails.push(now);throw new AppError('BAD_PASSWORD','Senha da conta incorreta.',403);}
   const s=read()[kid];if(!s)throw new AppError('NOT_FOUND','Esta página está no nível Máxima: não há como recuperar.',404);
   return {key:open(s).toString('base64')};}
 };
}
module.exports={makePageLocks};
