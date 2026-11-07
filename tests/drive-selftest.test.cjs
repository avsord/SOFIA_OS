'use strict';
// 07/11/2026: o teste automatico do Drive (que roda no Google de verdade a cada versao) passa num Drive simulado fiel e
// acusa defeito quando o servidor quebra; nunca deixa a pasta de teste para tras nem mexe na area da Sofia.
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {GoogleService}=require('../src/services/google');
const {runDriveSelfTest}=require('../src/services/drive-selftest');
const {fixture}=require('./helpers.cjs');
const ENV={GOOGLE_CALENDAR_CLIENT_ID:'cid',GOOGLE_CALENDAR_CLIENT_SECRET:'csecret',SOFIA_CALENDAR_TOKEN_KEY:'chave-de-teste'};
const FULL='openid email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive';
function google(){
  const {createFakeGoogle}=require('../SOFIA_APP/tools/drive-lab/fake-google.cjs');
  const d=createFakeGoogle({rootId:'raiz00000001',seed:false});
  for(const [id,name,parents] of [['usuario00001','Fotos',['raiz00000001']],['sofiapasta01','Sofia OS',['raiz00000001']]])d.files.set(id,{kind:'drive#file',id,name,mimeType:'application/vnd.google-apps.folder',parents,trashed:false,appProperties:{},spaces:['drive'],ownedByMe:true,owners:[{me:true}],modifiedTime:'2026-11-01T00:00:00Z'});
  return d;
}
async function setup(t){const f=fixture(t),d=google();const g=new GoogleService(f.store,f.core.workspace,f.config,{fetchImpl:d.fetch,env:ENV});
  g.saveLink({refresh:g.seal('rt'),email:'usuario@gmail.com',scopes:FULL,drive:{folders:{root:'sofiapasta01'}}});
  const srv=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://x'),id=u.pathname.split('/').pop();if(!g.sdStreamValid(id,u.searchParams.get('exp'),u.searchParams.get('sig'))){res.statusCode=403;return res.end();}try{await g.sdStream(req,res,id);}catch{res.statusCode=500;res.end();}});
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));t.after(()=>srv.close());
  return {g,d,base:'http://127.0.0.1:'+srv.address().port};}

test('teste do Drive: tudo verde num Drive fiel, sem deixar pasta de teste e sem tocar na area da Sofia',async t=>{
  const {g,d,base}=await setup(t);const before=[...d.files.keys()].sort();const lines=[];
  const r=await runDriveSelfTest(g,{base,log:l=>lines.push(l)});
  assert.equal(r.ok,true,JSON.stringify(r.steps.filter(s=>!s.ok)));
  assert.ok(r.steps.length>=18,'passos: '+r.steps.length);
  assert.deepEqual([...d.files.keys()].sort(),before,'sobrou algo do teste');
  assert.equal(d.files.get('sofiapasta01').trashed,false);
  assert.match(lines[0],/^\[drive-teste\] \{"ok":true/);
});
test('teste do Drive: acusa quando a visualizacao do Word quebra',async t=>{
  const {g,base}=await setup(t);g.sdPreview=async()=>{throw Object.assign(new Error('quebrou'),{code:'GOOGLE_API'});};
  const r=await runDriveSelfTest(g,{base,log:()=>{}});
  assert.equal(r.ok,false);assert.deepEqual(r.steps.filter(s=>!s.ok).map(s=>s.step),['visualizar proposta.docx (PDF)','visualizar planilha.xlsx (PDF)']);
  assert.equal(r.steps.at(-1).step,'apagar a pasta de teste');assert.equal(r.steps.at(-1).ok,true);
});
