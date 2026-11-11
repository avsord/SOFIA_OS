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
 for(const s of ['export function PageFileBlock','export function FileWindowHost','export function openFileWindow',"seg('Anexo', 'attach')","seg('Visualização', 'preview')","drag('move')","onPointerDown: drag(mode)"])assert.ok(pf.includes(s),s);
 assert.ok(pg.includes("if(b.type==='file'&&Platform.OS==='web')return")&&pg.includes('async function dropFiles(')&&pg.includes('<FileWindowHost/>'));
 assert.ok(pg.includes("Arquivos ainda não entram em páginas trancadas"),'pagina trancada nao recebe arquivo sem criptografia');
 assert.ok(read('SOFIA_APP/src/lib/page-block-keys.ts').includes("{type:'file',label:'Arquivo'"));
 assert.ok(pf.includes('function popOut(')&&pf.includes("testID=\"page-file-floating\"")&&pf.includes("'Voltar para a página'"),'arrastar a alca solta o bloco como janela flutuante (iPad)');
 assert.ok(pf.includes('export function detachFile(')&&pf.includes("'Abrir em janela separada (fora da Sofia)'")&&pf.includes("window.open('', 'sofia-arquivo-'"),'janela separada do navegador (outro monitor)');
 assert.ok(pf.includes('mountInWindow(win, officeEditor(ek!')&&read('SOFIA_APP/src/lib/popup-root.web.ts').includes('createRoot'),'Word tambem editavel na janela separada, salvando na Sofia');
 assert.ok(read('SOFIA_APP/src/components/PageRichInput.web.tsx').includes('props.onDropFiles(all)'));
});
test('editor de Word da Sofia: abre .docx com paginas, grifa e salva de volta em .docx; "/documento" cria um novo',async t=>{
 const ed=read('SOFIA_APP/src/components/DocEditor.tsx'),pf=read('SOFIA_APP/src/components/PageFiles.tsx'),pg=read('SOFIA_APP/src/screens/Pages.tsx');
 for(const s of ["import('docx-preview')","exec('hiliteColor', col)","exec('bold')","api.saveDocx(pageId"])assert.ok(ed.includes(s),s);
 assert.ok(pf.includes('if (editable && pageId && ek) return officeEditor(ek')&&pf.includes("['nw', {left: -6, top: -6"),'docx no editor; janela muda de tamanho pelos 4 cantos');
 assert.ok(pg.includes("if(type==='docx'||type==='xlsx'||type==='pptx')")&&read('SOFIA_APP/src/lib/page-block-keys.ts').includes("{type:'docx',label:'Documento do Word'"));
 // o servidor transforma o HTML do editor em .docx de verdade (com o grifo)
 const H=require('@turbodocx/html-to-docx'),JSZip=require('jszip');
 const buf=await (H.default||H)('<p>Texto <span style="background-color:rgb(255, 241, 118)">grifado</span> <b>forte</b></p>',null,{});
 const xml=await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
 assert.ok(/w:fill="fff176"/i.test(xml)&&xml.includes('<w:b/>')&&xml.includes('grifado'));
 assert.ok(read('src/channels/mobile.js').includes("/^\\/api\\/mobile\\/workspace\\/entities\\/([A-Za-z0-9_-]{6,80})\\/docx$/"));
});

test('Excel e PowerPoint tambem nos editores da Sofia; tema claro/escuro; so a janela separada na barra do arquivo',()=>{
 const pf=read('SOFIA_APP/src/components/PageFiles.tsx'),sl=read('SOFIA_APP/src/components/SlideEditor.tsx'),ch=read('SOFIA_APP/src/components/EditorChrome.tsx');
 assert.ok(pf.includes("kind === 'xlsx' ? <SheetEditor")&&pf.includes('<SlideEditor'));
 assert.ok(!pf.includes("tool('external', 'Abrir em janela', open)"),'sem a opcao da janela dentro da pagina na barra');
 for(const s of ["import('jszip')","function writeBox(","setChild(rPr, 'highlight', nh)","async function addSlide(","function deleteSlide(","async function addTextBox(","dragBox(b, 'move')"])assert.ok(sl.includes(s),s);
 assert.ok(sl.includes('el.innerHTML = bodyHtml(')&&!sl.includes('dangerouslySetInnerHTML: {__html: bodyHtml(b.el, b.title, sc)}}),'),'texto do slide nao e redesenhado ao clicar');
 assert.ok(ch.includes("['original', 'Original',")&&ch.includes("const KEY = 'sofia.editor.theme'")&&read('SOFIA_APP/src/components/DocEditor.tsx').includes('h(ThemeToggle'));
 assert.ok(read('SOFIA_APP/src/components/DocEditor.tsx').includes("wrap.style.cursor = 'default'"),'cursor nao some no cinza');
 assert.ok(read('SOFIA_APP/src/lib/page-block-keys.ts').includes("{type:'xlsx'")&&read('SOFIA_APP/src/lib/page-block-keys.ts').includes("{type:'pptx'"));
});

test('fonte do documento e modo escuro do navegador (Pedro 07/11)',()=>{
 const f=read('SOFIA_APP/src/lib/doc-fonts.ts'),m=read('src/channels/mobile.js'),pf=read('SOFIA_APP/src/components/PageFiles.tsx');
 assert.ok(f.includes("'/api/mobile/fonts.css?f='")&&f.includes('FALLBACK'),'fonte que falta vem do Google Fonts pelo site; reserva sem serifa');
 assert.ok(m.includes("if (p === '/api/mobile/fonts.css' && m === 'GET')")&&m.includes("https://fonts.gstatic.com' + path"),'rota de fontes so busca no Google Fonts');
 assert.ok(pf.includes("meta.name = 'color-scheme'"),'janela separada nao recebe o escuro forcado do navegador');
});

test('janela lembra o tamanho e o lugar da ultima vez (flutuante e separada)',()=>{
 const pf=read('SOFIA_APP/src/components/PageFiles.tsx');
 assert.ok(pf.includes("const geoKey = (where: 'win' | 'popup', ed: boolean)")&&pf.includes("readGeo('popup', ed)")&&pf.includes("saveGeo('popup', ed, cur)")&&pf.includes("readGeo('win', ed)"));
});

test('arquivo de Pagina vai direto para o Drive (area oculta); sem Drive nao fica no servidor (Pedro 07/11)',()=>{
 const g=read('src/services/google.js'),a=read('src/core/api45.js'),m=read('src/channels/mobile.js');
 assert.ok(g.includes('async attachmentToDrive(id)')&&g.includes("new AppError('NO_DRIVE'")&&g.includes("UPDATE attachments SET drive_id=?, blob=? WHERE id=?').run(up.id, Buffer.alloc(0), a.id);"));
 assert.ok(a.includes("if(runtime.google&&runtime.google.attachmentToDrive){")&&a.includes("DELETE FROM attachments WHERE id=?"),'falhou no Drive: apaga do servidor e avisa');
 assert.ok(m.includes('await runtime.google.attachmentToDrive(a.id)'),'Word salvo pelo editor tambem vai direto');
});

test('pagina compartilhada mostra os arquivos (video, audio, imagem, PDF, Office) so os da propria pagina',()=>{
 const ps=read('src/core/page-share.js');
 assert.ok(ps.includes("else if(type==='file'&&b.data&&b.data.attachment_id)out.push(fileHtml(b.data,ctx));")&&ps.includes('async function serveSharedFile('));
 assert.ok(ps.includes("if(!shares.attachmentAllowed(token,attId)){res.statusCode=404;")&&ps.includes("res.statusCode=206;"),'so arquivo da pagina; video avanca');
 assert.ok(ps.includes("media-src 'self'; frame-src 'self'; font-src 'self'"));
 const pg=read('SOFIA_APP/src/screens/Pages.tsx');assert.ok(pg.includes('coverH=coverW?Math.max(200,Math.min(460,Math.round(coverW/6))):250'),'capa com a mesma proporcao em qualquer monitor');
 const ed=read('SOFIA_APP/src/components/DocEditor.tsx');assert.ok(ed.includes("Não salvei para não perder conteúdo")&&ed.includes('if (html === initial.current)'),'Word: nao troca se perder conteudo; nao salva sem mudanca');
 assert.ok(read('SOFIA_APP/src/components/PageFiles.tsx').includes("'Versões anteriores'"),'voltar versao');
});

test('zoom proprio dos editores (sem mudar o do navegador)',()=>{
 const ch=read('SOFIA_APP/src/components/EditorChrome.tsx');
 assert.ok(ch.includes('export function useEditorZoom(')&&ch.includes("node.addEventListener('wheel', on, {passive: false})"));
 for(const f of ['DocEditor','SheetEditor','SlideEditor'])assert.ok(read('SOFIA_APP/src/components/'+f+'.tsx').includes('h(ZoomControl'),f);
});
// 10/11/2026 (Pedro: "quero o mesmo sistema do word no pdf"): PDF abre no editor do Word e, ao salvar, volta a ser PDF.
test('PDF vira documento para editar e o documento salvo volta a PDF (copia temporaria no Google sempre apagada)',async()=>{
 const {GoogleService}=require('../src/services/google.js'),P=GoogleService.prototype,calls=[];
 const fake={driveOn:()=>true,token:async()=>'t',sdPreviewSweep:async()=>{},attachmentBytes:async()=>Buffer.from('%PDF-1.4'),
  call:async(m,u,body,h)=>{calls.push([m,u,String(body).includes('application/vnd.google-apps.document')]);return {id:'tmp1'};},
  fetch:async u=>{calls.push(['GET',u]);return {ok:true,arrayBuffer:async()=>new TextEncoder().encode(u.includes('pdf')?'PDF':'DOCX').buffer};}};
 fake.convertBytes=P.convertBytes;
 const docx=await P.attachmentDocx.call(fake,{id:'a1',name:'DECUPAGEM.pdf',mime:'application/pdf'});
 assert.equal(docx.toString(),'DOCX');assert.ok(calls.some(c=>c[0]==='POST'&&c[2]),'enviado como documento do Google');
 assert.ok(calls.some(c=>c[0]==='GET'&&c[1].includes('wordprocessingml')));
 assert.ok(calls.some(c=>c[0]==='DELETE'&&c[1].includes('tmp1')),'copia temporaria apagada');
 const pdf=await P.docxToPdf.call(fake,Buffer.from('PK'),'DECUPAGEM.pdf');assert.equal(pdf.toString(),'PDF');
 await assert.rejects(P.attachmentDocx.call({...fake,attDocxMemo:undefined},{id:'a2',name:'x.docx',mime:'application/msword'}),/Só PDF/);
 await assert.rejects(P.convertBytes.call({...fake,driveOn:()=>false},Buffer.from('x'),'application/pdf','x','a.pdf'),/conecte o Google/);
 const m=read('src/channels/mobile.js');assert.ok(m.includes("['download', 'pdf', 'docx'].includes(url.searchParams.get('as'))"));assert.ok(m.includes("const asPdf = b.format === 'pdf';")&&m.includes("await runtime.google.docxToPdf(buf, name)"));
 const f=read('SOFIA_APP/src/components/PageFiles.tsx');assert.ok(f.includes("kind === 'pdf' ? <DocEditor {...p} format=\"pdf\" />"));
});
