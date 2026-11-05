'use strict';
// Editor de Páginas no estilo Notion (computador): Enter divide, Backspace junta, menu "/", atalhos e colar várias linhas.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
let n=0;const K=load('src/lib/page-block-keys.ts',{'./page-editor':{newBlock:(type='text')=>({id:'new'+(++n),type,text:''})}});
const B=(id,type,text,extra={})=>({id,type,text,...extra});
const J=x=>JSON.parse(JSON.stringify(x));
const shape=r=>r.blocks.map(b=>b.type+':'+b.text);

test('Enter divide o bloco no cursor e o foco vai para o começo do novo',()=>{
 const r=K.splitBlock([B('a','text','Primeira linha')],'a',9);
 assert.deepEqual(shape(r),['text:Primeira ','text:linha']);assert.equal(r.caret,0);assert.notEqual(r.focus,'a');
});
test('Enter em lista continua a lista; lista vazia volta a ser texto; título continua em texto',()=>{
 assert.deepEqual(shape(K.splitBlock([B('a','bullet','item')],'a',4)),['bullet:item','bullet:']);
 assert.deepEqual(shape(K.splitBlock([B('a','todo','')],'a',0)),['text:']);
 assert.deepEqual(shape(K.splitBlock([B('a','heading1','Seção')],'a',5)),['heading1:Seção','text:']);
});
test('Enter no começo de um bloco com texto cria uma linha vazia acima',()=>{
 const r=K.splitBlock([B('a','heading2','Seção')],'a',0);assert.deepEqual(shape(r),['text:','heading2:Seção']);assert.equal(r.focus,'a');
});
test('Backspace no início: primeiro vira texto, depois junta com o anterior no ponto da emenda',()=>{
 const one=K.backspaceAtStart([B('a','text','abc'),B('b','bullet','def')],'b');assert.deepEqual(shape(one),['text:abc','text:def']);
 const two=K.backspaceAtStart(one.blocks,'b');assert.deepEqual(shape(two),['text:abcdef']);assert.equal(two.focus,'a');assert.equal(two.caret,3);
 assert.equal(K.backspaceAtStart([B('a','text','abc')],'a'),null);
 assert.deepEqual(shape(K.backspaceAtStart([B('a','divider',''),B('b','text','x')],'b')),['text:x']);
});
test('Delete no fim puxa o próximo bloco de texto',()=>{
 const r=K.deleteAtEnd([B('a','text','ab'),B('b','text','cd')],'a');assert.deepEqual(shape(r),['text:abcd']);assert.equal(r.caret,2);
 assert.equal(K.deleteAtEnd([B('a','text','ab'),B('b','collection','')],'a'),null);
});
test('Atalhos markdown no começo do bloco',()=>{
 assert.deepEqual(J(K.markdownShortcut('text','#','# ')),{type:'heading1',text:''});
 assert.deepEqual(J(K.markdownShortcut('text','##Seção','## Seção')),{type:'heading2',text:'Seção'});
 assert.deepEqual(J(K.markdownShortcut('text','-','- ')),{type:'bullet',text:''});
 assert.deepEqual(J(K.markdownShortcut('text','[]','[] ')),{type:'todo',text:''});
 assert.deepEqual(J(K.markdownShortcut('text','[ ]','[ ] ')),{type:'todo',text:''});
 assert.deepEqual(J(K.markdownShortcut('todo','1.','1. ')),{type:'number',text:''});
 assert.deepEqual(J(K.markdownShortcut('text','--','---')),{type:'divider',text:''});
 assert.equal(K.markdownShortcut('text','oi','oi '),null);assert.equal(K.markdownShortcut('heading1','#','# '),null);
});
test('Menu "/" busca sem acento, prioriza quem começa com a busca e só abre no começo ou depois de espaço',()=>{
 assert.deepEqual(J(K.slashMatches('tit').map(x=>x.type)),['heading1','heading2','heading3']);
 assert.equal(K.slashMatches('lista')[0].type,'bullet');assert.equal(K.slashMatches('xyzzy').length,0);
 assert.equal(K.slashStart('/ti',3),0);assert.equal(K.slashStart('oi /ti',6),3);assert.equal(K.slashStart('a/b',3),-1);assert.equal(K.slashStart('oi / ti',7),-1);
});
test('Escolher no menu "/": bloco vazio muda de tipo; com texto ganha bloco novo abaixo; divisor deixa uma linha para continuar',()=>{
 assert.deepEqual(shape(K.applySlash([B('a','text','/tit')],'a',0,4,'heading1')),['heading1:']);
 assert.deepEqual(shape(K.applySlash([B('a','text','oi /lis')],'a',3,7,'bullet')),['text:oi ','bullet:']);
 assert.deepEqual(shape(K.applySlash([B('a','text','/div')],'a',0,4,'divider')),['divider:','text:']);
});
test('Colar várias linhas vira vários blocos e reconhece título, lista e tarefa',()=>{
 const r=K.pastedLines([B('a','text','')],'a','','# Título\n- um\n[x] feito\nfim');
 assert.deepEqual(shape(r),['heading1:Título','bullet:um','todo:feito','text:fim']);assert.equal(r.blocks[2].checked,true);
 const mid=K.pastedLines([B('a','text','AB')],'a','AB','Ax\nyB');assert.deepEqual(shape(mid),['text:Ax','text:yB']);assert.equal(mid.caret,1);
 assert.equal(K.pastedLines([B('a','text','A')],'a','A','A\n'),null);
});
test('Numeração recomeça a cada lista',()=>{
 const blocks=[B('a','number','1'),B('b','number','2'),B('c','text',''),B('d','number','1')];
 assert.deepEqual([0,1,3].map(i=>K.listNumber(blocks,i)),[1,2,1]);
});
test('A tela de Páginas usa o teclado novo só no computador e foca o bloco novo na hora',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','src/screens/Pages.tsx'),'utf8');
 assert.ok(src.includes("const webKeys=Platform.OS==='web';"));
 assert.ok(src.includes('onKeyPress={preview?undefined:e=>onBlockKey(e,b)}'));
 assert.ok(src.includes('flushNow(()=>{edit(d=>({...d,blocks}));'),'foco no bloco novo antes da próxima tecla');
 assert.ok(src.includes("testID=\"page-slash-menu\""));
 assert.ok(fs.readFileSync(path.join(__dirname,'..','src/lib/flush-sync.ts'),'utf8').includes('fn();'),'celular não usa react-dom');
});

test('Arrastar blocos pelo ⋮⋮ começa no mousedown (não fica "preso") e mostra a linha de destino',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','src/screens/Pages.tsx'),'utf8');
 assert.ok(src.includes("node.addEventListener('mousedown',(ev:MouseEvent)=>{if(ev.button!==0)return;"));
 assert.ok(src.includes('ref={(n:any)=>bindGrip(n,b)}'));assert.ok(src.includes('testID="page-drop-line"'));
 assert.ok(src.includes("if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();const gone="),'apagar blocos selecionados');
});
test('Capa: miniaturas com degradê próprio, envio no site sem link blob: e janelas presas ao botão no computador',()=>{
 const a=fs.readFileSync(path.join(__dirname,'..','src/components/PageAppearance.tsx'),'utf8');
 assert.ok(a.includes("gradientId='cover'+React.useId()"),'cada capa tem seu degradê');
 assert.ok(a.includes('const file:Blob|undefined=(asset as any).file;')&&!a.includes('await fetch(asset.uri)'),'sem fetch do blob: (bloqueado pela CSP)');
 assert.ok(a.includes("Platform.OS==='web'?{mediaTypes:['images'],allowsEditing:false"),'sem recorte 3:1 no site');
 assert.ok(a.includes("testID={'page-'+kind+'-picker'}"));
});
test('Barra lateral: ⋯ e + nas páginas, como no Notion',()=>{
 const d=fs.readFileSync(path.join(__dirname,'..','src/desktop/DesktopShell.tsx'),'utf8');
 assert.ok(d.includes('menu={menuFor(p)} onAdd={()=>void newChild(p)}'));assert.ok(d.includes("{label:'Duplicar',icon:'copy'"));
});

test('Prints do Pedro: subpágina como link no texto com prévia, espaço → Sofia, topo com Editada/link/favorito',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','src/screens/Pages.tsx'),'utf8');
 assert.ok(src.includes("if(b.type==='page_link'){const target=byId.get(String(b.data?.page_id||''));"),'subpágina como linha do texto');
 assert.ok(src.includes('testID="page-peek"'),'prévia ao passar o mouse');
 assert.ok(src.includes("const link={...newBlock('page_link'),text:'',data:{page_id:saved.id}};"),'"/Subpágina" cria o link no lugar');
 assert.ok(src.includes("setAi({id:b.id,busy:false,error:''});return;}"),'espaço numa linha vazia chama a Sofia');
 assert.ok(src.includes('testID="page-edited"')&&src.includes('label="Copiar link da página"')&&src.includes('testID="page-favorite"'));
 assert.ok(src.includes('testID="page-back-to-top"'),'botão Topo no centro');
 const route=fs.readFileSync(path.join(__dirname,'..','src/lib/web-route.ts'),'utf8');assert.ok(route.includes("'/paginas/' + id"));
});
test('Barra de formatação ao selecionar texto e texto rico só no site',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','src/screens/Pages.tsx'),'utf8');
 assert.ok(src.includes('testID="page-format-bar"'));for(const t of ['Negrito (Ctrl+B)','Itálico (Ctrl+I)','Sublinhado (Ctrl+U)','Tachado (Ctrl+Shift+S)','Melhorar escrita','Revisão','Explicar','Reformatar','Editar com a Sofia'])assert.ok(src.includes(t),t);
 assert.ok(src.includes("{webKeys&&b.type!=='code'?<PageRichInput"),'celular continua no TextInput');
 const rich=fs.readFileSync(path.join(__dirname,'..','src/components/PageRichInput.web.tsx'),'utf8');
 assert.ok(rich.includes("const ALLOWED=new Set(['B','STRONG','I','EM','U','S','STRIKE','DEL','CODE','A','SPAN','MARK','BR']);"),'HTML só com marcas de texto');
 assert.ok(rich.includes("if(/^(https?:|mailto:)/i.test(href))"),'links só http/https/mailto');
 const stub=fs.readFileSync(path.join(__dirname,'..','src/components/PageRichInput.tsx'),'utf8');assert.ok(stub.includes('return null;'));
 const md=K.blocksFromMarkdown('# Ideias\n- um\n- dois\n\ntexto');assert.deepEqual(J(md.map(b=>b.type+':'+b.text)),['heading1:Ideias','bullet:um','bullet:dois','text:texto']);
});
test('Barra lateral: arrastar página, favoritos e próximos eventos',()=>{
 const d=fs.readFileSync(path.join(__dirname,'..','src/desktop/DesktopShell.tsx'),'utf8');
 assert.ok(d.includes('testID="sidebar-drag-ghost"')&&d.includes("kind:f<0.28?'before':f>0.72?'after':'inside'"));
 assert.ok(d.includes('<Section title="Favoritos">')&&d.includes('<Section title="Próximos eventos">'));
});

test('Prints de 05/11 à noite: botões que sumiam, linha do tempo, Agenda, + minimalista e áreas só da pessoa',()=>{
 const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 const pg=read('src/screens/Pages.tsx'),shell=read('src/desktop/DesktopShell.tsx'),home=read('src/desktop/HomeBrief.tsx'),agenda=read('src/desktop/AgendaDesk.tsx');
 assert.ok(read('src/lib/hover-hold.ts').includes('export function useHoverHold'),'hover que não some ao ir para o botão');
 assert.ok(pg.includes('onHoverIn={coverHoverOn} onHoverOut={coverHoverOff} onPress={e=>openAppearance(\'cover\',e)}'));
 assert.ok(pg.includes('opacity:rowHover.key===b.id||menuOpen?1:0')&&pg.includes('opacity:headHover.on?1:0'));
 assert.ok(shell.includes('hold=useHoverHold()'));
 assert.ok(home.includes('export function timelineRange(')&&!home.includes('Math.min(24 * 3 - spanRef.current'),'linha do tempo passa de 3 dias');
 assert.ok(agenda.includes("accessibilityLabel={'Clique para criar às '"),'um clique cria na Agenda do computador');
 assert.ok(pg.includes('testID="page-start-bar"')&&pg.includes('if(desktop)void create();else setCreateParent(null);'),'+ cria direto');
 assert.ok(pg.includes('{preview?null:aiBox(block)}')&&!pg.includes("position:'absolute',top:lineH+6,left:0,right:0,zIndex:60"),'caixa da Sofia no fluxo do texto');
 assert.ok(shell.includes('expandForHome(base)'),'próximos eventos com a mesma leitura da Agenda');
 const ed=read('src/screens/workspace/EntityEditor.tsx');assert.ok(ed.includes("!(isAppointment&&f.key==='calendar_all_day')"),'"Dia inteiro" não aparece duas vezes');
 for(const f of ['src/screens/Reminders.tsx','src/screens/Packages.tsx','src/components/NotificationCenter.tsx','src/screens/Notes.tsx'])assert.ok(!/area: *'(Lembretes|Encomendas|Notas)'/.test(read(f)),f+' não cria área com nome pronto');
});

test('Voltar ao Início sem pulo, página criada pela lateral abre direto e o ponto criado pela Sofia aparece na hora',()=>{
 const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');const home=read('src/screens/Home.tsx'),shell=read('src/desktop/DesktopShell.tsx'),pg=read('src/screens/Pages.tsx');
 assert.ok(home.includes('if(h>0&&Math.abs(h-homeViewH)>1)setHomeViewH(h);'),'altura 0 de quando o Início está escondido não é guardada');
 assert.ok(shell.includes('createdPage.set(saved);onOpenPage(saved.id);')&&shell.includes('createdPage.set(saved);onOpen(saved.id);'),'lateral cria antes de trocar de tela');
 assert.ok(pg.includes('const fresh=createdPage.get();if(fresh&&fresh.id===openPageId)')&&pg.includes('useLayoutEffect(()=>{if(!openPageKey||handledOpen.current===openPageKey'),'abre antes de desenhar a lista');
 assert.ok(home.includes('adoptCreated((result as any)?.items);'),'o que a Sofia criou entra na linha do tempo com a resposta');
});
