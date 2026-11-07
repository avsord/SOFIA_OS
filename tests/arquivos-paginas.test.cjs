'use strict';
// 07/11/2026 (Pedro): arrastar qualquer arquivo para a Pagina; linha com tipo e nome; visualizacao com escala; janela flutuante.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {attachmentMime,inlineSafe}=require('../src/core/workspace');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('qualquer tipo de arquivo entra; os que o navegador executaria viram arquivo comum',()=>{
 assert.equal(attachmentMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 assert.equal(attachmentMime('video/mp4'),'video/mp4');
 for(const bad of ['text/html','image/svg+xml','application/javascript','text/xml','lixo',''])assert.equal(attachmentMime(bad),'application/octet-stream',bad);
 assert.ok(inlineSafe('application/pdf')&&inlineSafe('video/mp4')&&inlineSafe('image/png')&&inlineSafe('audio/wav'));
 assert.ok(!inlineSafe('application/octet-stream')&&!inlineSafe('text/html')&&!inlineSafe('image/svg+xml'));
});
test('anexo de pagina: Word e video aceitos, limite de 25 MB por arquivo',t=>{
 const {core}=fixture(t);const w=core.workspace;const page=w.save({kind:'user_page',title:'P',data:{}});
 const doc=w.attach(page.id,{name:'relatorio.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',base64:Buffer.from('PK fake').toString('base64')});
 assert.equal(doc.mime,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 const html=w.attach(page.id,{name:'x.html',mime:'text/html',base64:Buffer.from('<script>1</script>').toString('base64')});
 assert.equal(html.mime,'application/octet-stream');
 assert.throws(()=>w.attach(page.id,{name:'grande.mp4',mime:'video/mp4',base64:Buffer.alloc(26*1024*1024).toString('base64')}),/25 MB/);
});
test('link assinado para quadro/player: so com assinatura valida, com Range e protecao de quadro',()=>{
 const m=read('src/channels/mobile.js');
 assert.ok(m.includes("const fileKey = crypto.randomBytes(32);"),'chave sorteada a cada partida');
 assert.ok(m.includes("crypto.timingSafeEqual(want, got)"),'comparacao segura');
 assert.ok(m.includes("res.statusCode = 206;")&&m.includes("res.setHeader('X-Frame-Options', 'SAMEORIGIN');"));
 assert.ok(m.includes("/^\\/api\\/mobile\\/workspace\\/attachments\\/([A-Za-z0-9_-]{6,80})\\/link$/"),'link so com login');
 assert.ok(read('src/services/google.js').includes('async attachmentPdf(a)'),'Office vira PDF pelo Google');
});
test('site: bloco de arquivo, soltar arquivos, "/arquivo" e janela flutuante',()=>{
 const pf=read('SOFIA_APP/src/components/PageFiles.tsx'),pg=read('SOFIA_APP/src/screens/Pages.tsx');
 for(const s of ['export function PageFileBlock','export function FileWindowHost','export function openFileWindow',"seg('Anexo', 'attach')","seg('Visualização', 'preview')","drag('move')","drag('size')"])assert.ok(pf.includes(s),s);
 assert.ok(pg.includes("if(b.type==='file'&&Platform.OS==='web')return")&&pg.includes('async function dropFiles(')&&pg.includes('<FileWindowHost/>'));
 assert.ok(pg.includes("Arquivos ainda não entram em páginas trancadas"),'pagina trancada nao recebe arquivo sem criptografia');
 assert.ok(read('SOFIA_APP/src/lib/page-block-keys.ts').includes("{type:'file',label:'Arquivo'"));
 assert.ok(read('SOFIA_APP/src/components/PageRichInput.web.tsx').includes('props.onDropFiles(all)'));
});
