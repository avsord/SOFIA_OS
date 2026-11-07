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
  const files=new Map(),bytes=new Map();let n=0;const nid=()=>'gen'+(++n)+'abcdef';
  const put=f=>files.set(f.id,{trashed:false,mimeType:'text/plain',appProperties:{},...f});
  put({id:'raiz00000001',name:'Meu Drive',mimeType:'application/vnd.google-apps.folder',parents:[]});
  put({id:'usuario00001',name:'Fotos',mimeType:'application/vnd.google-apps.folder',parents:['raiz00000001']});
  put({id:'sofiapasta01',name:'Sofia OS',mimeType:'application/vnd.google-apps.folder',parents:['raiz00000001']});
  const res=(st,o,h={})=>new Response(o==null?null:Buffer.isBuffer(o)?o:JSON.stringify(o),{status:st,headers:h});
  const fetch=async(url,opt={})=>{const u=new URL(String(url)),m=opt.method||'GET',hd=opt.headers||{};const js=typeof opt.body==='string'&&opt.body.startsWith('{')?JSON.parse(opt.body):null;
    if(u.pathname.endsWith('/token'))return res(200,{access_token:'at',expires_in:3600});
    if(u.pathname==='/drive/v3/files/root')return res(200,{id:'raiz00000001'});
    if(u.pathname==='/upload/drive/v3/files'){const b=Buffer.from(opt.body);const s=b.toString('latin1');const i1=s.indexOf('\r\n\r\n'),meta=JSON.parse(s.slice(i1+4,s.indexOf('\r\n',i1+4)));const i2=s.indexOf('\r\n\r\n',s.indexOf('--',i1+4))+4,end=s.lastIndexOf('\r\n--');const data=b.subarray(i2,end);const f={id:nid(),name:meta.name,mimeType:meta.mimeType,parents:meta.parents,size:String(data.length)};put(f);bytes.set(f.id,Buffer.from(data));return res(200,files.get(f.id));}
    if(u.pathname==='/drive/v3/files'&&m==='POST'){const f={id:nid(),name:js.name,mimeType:js.mimeType,parents:js.parents,appProperties:js.appProperties||{}};put(f);return res(200,files.get(f.id));}
    if(u.pathname==='/drive/v3/files'&&m==='GET'){const q=u.searchParams.get('q');let out=[...files.values()].filter(f=>!f.trashed&&f.id!=='raiz00000001');
      const par=q.match(/'([^']+)' in parents/);if(par)out=out.filter(f=>f.parents.includes(par[1]));const nc=q.match(/name contains '([^']+)'/);if(nc)out=out.filter(f=>f.name.includes(nc[1]));
      return res(200,{files:out});}
    const cp=u.pathname.match(/^\/drive\/v3\/files\/([^/]+)\/copy$/);if(cp){const f={id:nid(),name:js.name,mimeType:js.mimeType,parents:js.parents,appProperties:js.appProperties||{}};put(f);return res(200,{id:f.id});}
    const ex=u.pathname.match(/^\/drive\/v3\/files\/([^/]+)\/export$/);if(ex){return files.get(ex[1])?.mimeType.startsWith('application/vnd.google-apps.')?res(200,Buffer.from('%PDF-1.4 convertido')):res(400,{error:{message:'nao exporta'}});}
    const fm=u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if(fm){const f=files.get(fm[1]);if(!f)return res(404,{error:{message:'File not found'}});
      if(m==='DELETE'){const kill=id=>{files.delete(id);for(const x of [...files.values()])if(x.parents.includes(id))kill(x.id);};kill(f.id);return res(204,null);}
      if(m==='GET'&&u.searchParams.get('alt')==='media'){const b=bytes.get(f.id)||Buffer.alloc(0);const r=String(hd.Range||'').match(/bytes=(\d+)-(\d*)/);if(r){const a=+r[1],z=r[2]?+r[2]:b.length-1;return res(206,b.subarray(a,z+1),{'content-range':'bytes '+a+'-'+z+'/'+b.length,'content-length':String(z-a+1)});}return res(200,b);}
      if(m==='GET')return res(200,f);
      if(m==='PATCH'){if(js&&js.name)f.name=js.name;if(js&&js.trashed)f.trashed=true;const add=u.searchParams.get('addParents');if(add)f.parents=[add];return res(200,f);} }
    return res(200,{});};
  return {files,fetch};
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
