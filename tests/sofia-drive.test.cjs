'use strict';
// 07/11/2026 (Pedro): Sofia Drive - "um Google Drive dentro da Sofia", guardado no Drive do proprio usuario.
const test=require('node:test'),assert=require('node:assert/strict');
const {GoogleService}=require('../src/services/google');
const {fixture}=require('./helpers.cjs');
const ENV={GOOGLE_CALENDAR_CLIENT_ID:'cid',GOOGLE_CALENDAR_CLIENT_SECRET:'csecret',SOFIA_CALENDAR_TOKEN_KEY:'chave-de-teste'};
/** Google Drive de mentira, em memoria: so o suficiente para o Sofia Drive. */
function fakeDrive(){
  const files=new Map();let n=0;const id=()=>'id'+(++n)+'xxxxxx';
  files.set('outro123456',{id:'outro123456',name:'fora',mimeType:'text/plain',parents:['raizdousuario'],trashed:false});
  const json=(o,st=200)=>({ok:st<400,status:st,json:async()=>o,arrayBuffer:async()=>Buffer.from('conteudo'),body:null});
  const fetch=async(url,opt={})=>{const u=new URL(String(url)),m=opt.method||'GET',body=opt.body&&typeof opt.body==='string'&&opt.body.startsWith('{')?JSON.parse(opt.body):null;
    if(u.pathname.endsWith('/token'))return json({access_token:'at',expires_in:3600});
    if(u.pathname==='/drive/v3/files'&&m==='POST'){const f={id:id(),name:body.name,mimeType:body.mimeType,parents:body.parents||['raizdousuario'],trashed:false,modifiedTime:'2026-11-07T00:00:00Z'};files.set(f.id,f);return json(f);}
    if(u.pathname==='/upload/drive/v3/files'){const meta=JSON.parse(String(opt.body).split('\r\n\r\n')[1].split('\r\n')[0]);const f={id:id(),name:meta.name,mimeType:meta.mimeType,parents:meta.parents,trashed:false,size:'8'};files.set(f.id,f);return json(f);}
    if(u.pathname==='/drive/v3/files'&&m==='GET'){const q=u.searchParams.get('q');const par=q.match(/'([^']+)' in parents/)[1];return json({files:[...files.values()].filter(f=>f.parents.includes(par)&&!f.trashed).sort((a,b)=>(b.mimeType.includes('folder')-a.mimeType.includes('folder'))||a.name.localeCompare(b.name))});}
    const fm=u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if(fm){const f=files.get(fm[1]);if(!f)return json({error:{message:'nao achei'}},404);
      if(m==='GET')return json(f);
      if(m==='PATCH'){if(body&&body.name)f.name=body.name;if(body&&body.trashed)f.trashed=true;const add=u.searchParams.get('addParents');if(add){f.parents=[add];}return json(f);} }
    return json({});};
  return {files,fetch};
}
function svc(t){const f=fixture(t),d=fakeDrive();const g=new GoogleService(f.store,f.core.workspace,f.config,{fetchImpl:d.fetch,env:ENV});
  g.saveLink({refresh:g.seal('rt'),email:'usuario@gmail.com',scopes:'openid email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata'});return {g,d};}

test('Sofia Drive: pasta propria no Drive do usuario; criar pasta, enviar, listar, renomear, mover, lixeira',async t=>{
  const {g,d}=svc(t);
  const pasta=await g.sdCreateFolder('root','Projetos');assert.equal(pasta.folder,true);
  const root=g.link().sofia_drive_root;assert.ok(root);assert.equal(d.files.get(root).name,'Sofia Drive');
  const arq=await g.sdUpload('root','contrato.pdf','application/pdf',Buffer.from('%PDF-1'));assert.equal(arq.name,'contrato.pdf');
  let lista=await g.sdList('root');assert.deepEqual(lista.items.map(i=>i.name),['Projetos','contrato.pdf'],'pastas primeiro');
  await g.sdUpdate(arq.id,{name:'contrato assinado.pdf'});await g.sdUpdate(arq.id,{parent:pasta.id});
  lista=await g.sdList(pasta.id);assert.deepEqual(lista.items.map(i=>i.name),['contrato assinado.pdf']);assert.deepEqual(lista.path,[],'caminho ate a raiz');
  await g.sdTrash(arq.id);assert.equal((await g.sdList(pasta.id)).items.length,0);
});
test('Sofia Drive: nada fora da pasta do Sofia Drive pode ser lido, movido ou apagado',async t=>{
  const {g}=svc(t);await g.sdRoot();
  await assert.rejects(g.sdContent('outro123456'),/não está no Sofia Drive/);
  await assert.rejects(g.sdTrash('outro123456'),/não está no Sofia Drive/);
  await assert.rejects(g.sdUpdate('outro123456',{name:'x'}),/não está no Sofia Drive/);
});
test('Sofia Drive: pasta nao entra nela mesma nem numa subpasta dela; raiz nao vai para a lixeira',async t=>{
  const {g}=svc(t);const a=await g.sdCreateFolder('root','A');const b=await g.sdCreateFolder(a.id,'B');
  await assert.rejects(g.sdUpdate(a.id,{parent:b.id}),/numa pasta dela/);await assert.rejects(g.sdUpdate(a.id,{parent:a.id}),/nela mesma/);
  await assert.rejects(g.sdTrash(g.link().sofia_drive_root),/principal/);
});
test('Sofia Drive: sem conta Google ligada, avisa o que fazer',async t=>{const f=fixture(t);const g=new GoogleService(f.store,f.core.workspace,f.config,{fetchImpl:async()=>({ok:true,json:async()=>({})}),env:ENV});await assert.rejects(g.sdList('root'),/Conexões/);});
