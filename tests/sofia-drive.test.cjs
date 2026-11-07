'use strict';
// 07/11/2026 (Pedro): app Drive da Sofia = o Google Drive INTEIRO do usuario; a area da Sofia (oculta) nunca aparece nem e mexida.
const test=require('node:test'),assert=require('node:assert/strict');
const {GoogleService}=require('../src/services/google');
const {fixture}=require('./helpers.cjs');
const ENV={GOOGLE_CALENDAR_CLIENT_ID:'cid',GOOGLE_CALENDAR_CLIENT_SECRET:'csecret',SOFIA_CALENDAR_TOKEN_KEY:'chave-de-teste'};
const FULL='openid email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive';
function fakeDrive(){
  const files=new Map();let n=0;const id=()=>'id'+(++n)+'xxxxxx';
  const put=f=>{files.set(f.id,{trashed:false,mimeType:'text/plain',...f});};
  put({id:'meudrive0001',name:'Meu Drive',mimeType:'application/vnd.google-apps.folder',parents:[]});
  put({id:'fotosdousuario',name:'Fotos da viagem',mimeType:'application/vnd.google-apps.folder',parents:['meudrive0001']});
  put({id:'backupdasofia',name:'sofia-backup.sofia-backup',parents:['meudrive0001'],appProperties:{sofia_cat:'Backups'}});
  put({id:'pastaantigasofia',name:'Sofia OS',mimeType:'application/vnd.google-apps.folder',parents:['meudrive0001']});
  const json=(o,st=200)=>({ok:st<400,status:st,json:async()=>o,headers:{get:()=>null},arrayBuffer:async()=>Buffer.from('conteudo'),body:null});
  const fetch=async(url,opt={})=>{const u=new URL(String(url)),m=opt.method||'GET',body=opt.body&&typeof opt.body==='string'&&opt.body.startsWith('{')?JSON.parse(opt.body):null;
    if(u.pathname.endsWith('/token'))return json({access_token:'at',expires_in:3600});
    if(u.pathname==='/drive/v3/files/root')return json({id:'meudrive0001'});
    if(u.pathname==='/drive/v3/files'&&m==='POST'){const f={id:id(),name:body.name,mimeType:body.mimeType,parents:body.parents||['meudrive0001'],trashed:false};files.set(f.id,f);return json(f);}
    if(u.pathname==='/upload/drive/v3/files'){const meta=JSON.parse(String(opt.body).split('\r\n\r\n')[1].split('\r\n')[0]);const f={id:id(),name:meta.name,mimeType:meta.mimeType,parents:meta.parents,trashed:false,size:'8'};files.set(f.id,f);return json(f);}
    if(u.pathname==='/drive/v3/files'&&m==='GET'&&/name contains/.test(u.searchParams.get('q'))&&!/in parents/.test(u.searchParams.get('q'))){const w=u.searchParams.get('q').match(/name contains '([^']+)'/)[1];return json({files:[...files.values()].filter(f=>f.name.includes(w)&&!f.trashed&&f.id!=='meudrive0001')});}
    if(u.pathname==='/drive/v3/files'&&m==='GET'){const par=u.searchParams.get('q').match(/'([^']+)' in parents/)[1];return json({files:[...files.values()].filter(f=>f.parents.includes(par)&&!f.trashed).sort((a,b)=>(b.mimeType.includes('folder')-a.mimeType.includes('folder'))||a.name.localeCompare(b.name))});}
    const fm=u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if(fm){const f=files.get(fm[1]);if(!f)return json({error:{message:'nao achei'}},404);
      if(m==='GET')return json(f);
      if(m==='PATCH'){if(body&&body.name)f.name=body.name;if(body&&body.trashed)f.trashed=true;const add=u.searchParams.get('addParents');if(add)f.parents=[add];return json(f);} }
    return json({});};
  return {files,fetch};
}
function svc(t,scopes=FULL){const f=fixture(t),d=fakeDrive();const g=new GoogleService(f.store,f.core.workspace,f.config,{fetchImpl:d.fetch,env:ENV});
  g.saveLink({refresh:g.seal('rt'),email:'usuario@gmail.com',scopes,drive:{folders:{root:'pastaantigasofia'}}});return {g,d};}

test('Drive: mostra o Google Drive inteiro do usuario e esconde o que e da Sofia',async t=>{
  const {g}=svc(t);const l=await g.sdList('root');
  assert.deepEqual(l.items.map(i=>i.name),['Fotos da viagem'],'nem o backup da Sofia nem a pasta antiga dela aparecem');
});
test('Drive: criar pasta, enviar, renomear, mover e mandar para a lixeira no Drive do usuario',async t=>{
  const {g}=svc(t);const pasta=await g.sdCreateFolder('root','Projetos');
  const arq=await g.sdUpload('root','contrato.pdf','application/pdf',Buffer.from('%PDF-1'));
  assert.deepEqual((await g.sdList('root')).items.map(i=>i.name),['Fotos da viagem','Projetos','contrato.pdf']);
  await g.sdUpdate(arq.id,{name:'contrato assinado.pdf'});await g.sdUpdate(arq.id,{parent:pasta.id});
  assert.deepEqual((await g.sdList(pasta.id)).items.map(i=>i.name),['contrato assinado.pdf']);
  await g.sdTrash(arq.id);assert.equal((await g.sdList(pasta.id)).items.length,0);
});
test('Drive: arquivos e pastas da Sofia nao podem ser lidos, movidos, renomeados nem apagados',async t=>{
  const {g}=svc(t);
  for(const idSofia of ['backupdasofia','pastaantigasofia']){
    await assert.rejects(g.sdContent(idSofia),/da Sofia/);await assert.rejects(g.sdTrash(idSofia),/da Sofia/);await assert.rejects(g.sdUpdate(idSofia,{name:'x'}),/da Sofia/);
  }
  await assert.rejects(g.sdList('pastaantigasofia'),/da Sofia/);
});
test('Drive: pasta nao entra nela mesma nem numa subpasta dela; Meu Drive nao vai para a lixeira',async t=>{
  const {g}=svc(t);const a=await g.sdCreateFolder('root','A');const b=await g.sdCreateFolder(a.id,'B');
  await assert.rejects(g.sdUpdate(a.id,{parent:b.id}),/numa pasta dela/);await assert.rejects(g.sdUpdate(a.id,{parent:a.id}),/nela mesma/);
  await assert.rejects(g.sdTrash('meudrive0001'),/principal/);
});
test('Drive: sem a permissao do Drive inteiro pede permissao; sem conta, pede para ligar',async t=>{
  const {g}=svc(t,'openid email https://www.googleapis.com/auth/drive.file');await assert.rejects(g.sdList('root'),e=>e.code==='DRIVE_NEEDS_PERMISSION');
  const f=fixture(t);const g2=new GoogleService(f.store,f.core.workspace,f.config,{fetchImpl:async()=>({ok:true,json:async()=>({})}),env:ENV});await assert.rejects(g2.sdList('root'),e=>e.code==='DRIVE_NOT_CONNECTED');
});
test('Player: link de video assinado vale so para aquele arquivo e expira',t=>{
  const {g}=svc(t);const tk=g.sdStreamToken('arquivo123');
  assert.equal(g.sdStreamValid('arquivo123',tk.exp,tk.sig),true);assert.equal(g.sdStreamValid('outro123456',tk.exp,tk.sig),false);
  const old=g.sdStreamToken('arquivo123',-1000);assert.equal(g.sdStreamValid('arquivo123',old.exp,old.sig),false);assert.equal(g.sdStreamValid('arquivo123',tk.exp,'falsa'),false);
});

test('Drive: pesquisa no Drive inteiro nunca devolve nada da area da Sofia (nem o que esta dentro das pastas dela)',async t=>{
  const {g,d}=svc(t);
  d.files.set('relsofia00001',{id:'relsofia00001',name:'relatorio interno',mimeType:'text/plain',parents:['pastaantigasofia'],trashed:false});
  d.files.set('subsofia00001',{id:'subsofia00001',name:'sub',mimeType:'application/vnd.google-apps.folder',parents:['pastaantigasofia'],trashed:false});
  d.files.set('relsofia00002',{id:'relsofia00002',name:'relatorio fundo',mimeType:'text/plain',parents:['subsofia00001'],trashed:false});
  d.files.set('relbackup0001',{id:'relbackup0001',name:'relatorio backup',mimeType:'text/plain',parents:['meudrive0001'],appProperties:{sofia_cat:'Backups'},trashed:false});
  d.files.set('relusuario001',{id:'relusuario001',name:'relatorio da viagem',mimeType:'text/plain',parents:['fotosdousuario'],trashed:false});
  const r=await g.sdSearch('relatorio');
  assert.deepEqual(r.items.map(i=>i.name),['relatorio da viagem']);
  assert.deepEqual((await g.sdSearch("  ")).items,[]);
});
