'use strict';
// 07/11/2026 (Pedro: "quero integracao com as paginas: poder copiar e colar la qualquer tipo de item, alem disso posso
// alterar os itens dentro do drive tambem"): Drive <-> Paginas e editar Word/Excel/PowerPoint no proprio arquivo do Drive.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const {createFakeGoogle}=require('../SOFIA_APP/tools/drive-lab/fake-google.cjs');

test('servidor: Drive -> pagina, pagina -> Drive e salvar no mesmo arquivo do Drive',()=>{
 const g=read('src/services/google.js'),m=read('src/channels/mobile.js'),hh=read('src/core/http-handler.js');
 for(const s of['async sdFileBytes(','async sdPutNew(','async sdFromAttachment(','async sdWrite(','async sdStamp('])assert.ok(g.includes(s),s);
 // salvar e nova revisao do MESMO arquivo (PATCH de conteudo), nunca uma copia; recusa Docs do Google, vazio e mudanca no meio
 assert.ok(g.includes("UPLOAD + '/files/' + at.meta.id + '?uploadType=media"),'PATCH no proprio arquivo');
 assert.ok(/sdWrite[\s\S]{0,300}sdResolve/.test(g),'confere caminho e area da Sofia antes de gravar');
 assert.ok(g.includes("'CONFLICT'")&&g.includes('Arquivo vazio não é salvo'),'conflito e vazio');
 for(const s of["sd === 'to-page'","sd === 'from-page'","sd === 'docx-render'","/^items\\/([A-Za-z0-9_-]+)\\/content$/","/^items\\/([A-Za-z0-9_-]+)\\/stamp$/"])assert.ok(m.includes(s),s);
 assert.ok(m.includes("includes('sofia-lock-v1')"),'pagina trancada recusa arquivo');
 assert.ok(/to-page[\s\S]{0,1600}attachmentToDrive/.test(m),'arquivo colado vai para a area oculta do Drive (nada no servidor)');
 assert.ok(hh.includes('items\\/[A-Za-z0-9_-]+\\/content)$/'),'PUT de conteudo liberado so nessa rota');
});

test('site: copiar/colar entre Drive e paginas e editor salvando no Drive',()=>{
 const clip=read('SOFIA_APP/src/lib/sofia-clipboard.ts'),drive=read('SOFIA_APP/src/screens/Drive.tsx'),pages=read('SOFIA_APP/src/screens/Pages.tsx'),pf=read('SOFIA_APP/src/components/PageFiles.tsx'),os=read('SOFIA_APP/src/lib/office-save.ts'),doc=read('SOFIA_APP/src/components/DocEditor.tsx');
 assert.ok(clip.includes("sofia: 'drive-items'")&&clip.includes("sofia: 'page-files'"));
 for(const s of["label: 'Copiar'","copyItems(","pasteClip(","addEventListener('paste'","'Abrir no editor da Sofia'","drive: true","<FileWindowHost />"])assert.ok(drive.includes(s),s);
 for(const s of['pasteClipBlocks(','parseSofiaClip(pasted)',"setSofiaClip({sofia:'page-files'","d.addEventListener('paste',paste)"])assert.ok(pages.includes(s),s);
 assert.ok(pf.includes("'Copiar (para colar no Drive ou em outra página)'"),'botao Copiar no arquivo da pagina');
 assert.ok(pf.includes("!String(f.mime || '').startsWith('application/vnd.google-apps.')"),'Docs do Google so abre para ver');
 assert.ok(pf.includes('const hosts: object[] = []')&&pf.includes('hosts[0] !== me'),'uma janela nao aparece duas vezes (Paginas e Drive)');
 assert.ok(os.includes("api.sdWriteBytes(t.fileId, bytes, mime, t.base || '')")&&os.includes('t.base = r.item.modified'),'salva no Drive com a data de quando abriu');
 // Word do Drive: o servidor so converte; o site confere se nada sumiu ANTES de gravar no Drive
 assert.ok(doc.includes('api.sdRenderDocx({html, name})')&&doc.indexOf('driveBytes ? driveBytes.slice().buffer')<doc.indexOf('saveOfficeTo(api, drive'));
 for(const f of['DocEditor','SheetEditor','SlideEditor'])assert.ok(read('SOFIA_APP/src/components/'+f+'.tsx').includes('[403, 409].includes'),f+': conflito/sem permissao nao tenta de novo em loop');
});

test('Google de teste: salvar conteudo cria revisao nova no mesmo arquivo; area do app aceita pastas',async()=>{
 const g=createFakeGoogle(),H={authorization:'Bearer x'};
 const f=[...g.files.values()].find(x=>x.name==='Proposta comercial.docx'),id=f.id,t0=f.modifiedTime;
 let r=await g.fetch('https://www.googleapis.com/upload/drive/v3/files/'+id+'?uploadType=media',{method:'PATCH',headers:{...H,'content-type':'application/octet-stream'},body:Buffer.from('novo')});
 const j=await r.json();assert.equal(r.status,200);assert.equal(j.id,id);assert.equal(j.revisions,2);assert.notEqual(j.modifiedTime,t0);
 assert.equal(g.bytes.get(id).toString(),'novo');
 const gd=[...g.files.values()].find(x=>x.name==='Notas da reunião');
 r=await g.fetch('https://www.googleapis.com/upload/drive/v3/files/'+gd.id+'?uploadType=media',{method:'PATCH',headers:H,body:Buffer.from('x')});assert.equal(r.status,400);
 r=await g.fetch('https://www.googleapis.com/drive/v3/files',{method:'POST',headers:{...H,'content-type':'application/json'},body:JSON.stringify({name:'Anexos',mimeType:g.FOLDER,parents:['appDataFolder']})});
 const dir=await r.json();assert.equal(r.status,200);assert.deepEqual(g.files.get(dir.id).spaces,['appDataFolder']);
});
