'use strict';
// 13/11/2026 noite: lista do Pedro (Anotações, Páginas, salvar como o Notion, Tab, link de Páginas, anexo sem senha do Drive)
// e os 5 defeitos que a Mimic Kaizen achou na a716108. O comportamento na tela é conferido pelo robô
// tools/drive-lab/notas-lab.cjs (SOFIA_CHROME=1); aqui ficam as regras sem tela e as amarras do código.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');
const j=x=>JSON.parse(JSON.stringify(x));

test('arrastar: a lixeira vence qualquer alvo embaixo dela',()=>{
 const {hitTarget}=load('src/lib/notes-move.ts');
 const rects=[{id:'f1',x:0,y:0,w:300,h:300},{id:'__trash__',x:50,y:50,w:100,h:40}];
 assert.equal(hitTarget(rects,{kind:'note',id:'n',from:'r',label:'n'},60,60),'__trash__');
 assert.equal(hitTarget(rects,{kind:'note',id:'n',from:'r',label:'n'},10,10),'f1');
});
test('arrastar com o mouse: o cancelamento do toque não apaga o arrastar do navegador (1 arrasto basta)',()=>{
 const s=read('src/components/NotebookBlock.tsx');
 assert.ok(s.includes("onPanResponderTerminate:()=>{if(!webDrag.current)endRef.current(false);}"));
 assert.ok(s.includes('onLongPress={mouse?undefined:e=>startDrag(item,e)}'),'pasta: no mouse só o arrastar do navegador');
 assert.ok(s.includes('onLongPress={showFolder||mouse?undefined:e=>startDrag(item,e)}'),'nota: idem');
 assert.ok(s.includes("if(target==='__trash__'){if(item.kind==='note')deleteNote(item.from,item.id);else removeBook(item.id);return;}"));
});
test('voltar do navegador nas Notas: um passo por pasta aberta',()=>{
 const s=read('src/components/NotebookBlock.tsx');
 assert.ok(s.includes('useWebBackDepth(depthOf(opened),'));
 const w=read('src/lib/web-panels.ts');assert.ok(w.includes('export function useWebBackDepth'));
});
test('salvar calado como o Notion: esperando digitar nunca aparece; gravando aparece só se demorar',()=>{
 const {saveLabelFor,SLOW_SAVE_MS}=load('src/components/SaveStatus.tsx',{react:{useEffect(){},useRef(){},useState(){}},'react/jsx-runtime':{jsx(){},jsxs(){},Fragment:{}}});
 assert.equal(saveLabelFor('pending',60000),'quiet');
 assert.equal(saveLabelFor('saving',500),'quiet');
 assert.equal(saveLabelFor('saving',SLOW_SAVE_MS),'slow');
 assert.equal(saveLabelFor('saved',null),'quiet');
 const p=read('src/screens/Pages.tsx');assert.ok(!p.includes("const status=entry.state==='saving'||entry.state==='pending'?'Salvando…'"),'o topo não troca para Salvando… a cada pausa');
});
test('Tab na página recua o bloco (sem tabulação); Shift+Tab volta',()=>{
 const p=read('src/screens/Pages.tsx');
 assert.ok(p.includes("if(key==='Tab'&&!ne.ctrlKey&&!ne.metaKey&&!ne.altKey){e.preventDefault();"));
 assert.ok(p.includes('marginLeft:Math.max(0,Math.min(6,Number(b.indent)||0))*26'));
});
test('Páginas tem link próprio e mostra as notas editadas recentemente, abrindo a nota',()=>{
 const sh=read('src/desktop/DesktopShell.tsx');assert.ok(sh.includes(`<Section title="Páginas" onTitle={()=>onNavigate('pages')}`));
 const app=read('App.tsx');assert.ok(app.includes("const navigateShell=useCallback((t:Tab)=>{if(t==='pages')setPagesListKey(v=>v+1);navigate(t);},[navigate]);"));
 const p=read('src/screens/Pages.tsx');assert.ok(p.includes('testID="pages-recent-notes"'));assert.ok(p.includes('requestOpenNote(r.page.id,r.id);open(r.page);'));
 const {requestOpenNote,takeOpenNote}=load('src/lib/notes-move.ts');requestOpenNote('p1','n1');assert.equal(takeOpenNote('p1'),'n1');assert.equal(takeOpenNote('p1'),null);
});
test('trocar de página vira um passo do voltar (sem recarregar o site)',()=>{
 const p=read('src/screens/Pages.tsx');assert.ok(p.includes("else w.history?.pushState?.({tab:'pages',module:''},'',next);"));
 const app=read('App.tsx');assert.ok(app.includes('routeMeta.fromPop=true;'));
});
test('nota: colar imagem pergunta anexo ou print e guarda como bloco de arquivo da página',()=>{
 const s=read('src/components/LeafEditor.tsx');
 assert.ok(s.includes("appAlert('Colar imagem','Como a imagem deve aparecer na nota?'"));
 assert.ok(s.includes("b.type==='file'?fileBlock(b)"));
 assert.ok(s.includes('if(sc&&sc.scrollTop!==top)sc.scrollTop=top;'),'medir o campo não puxa a rolagem (nota longa)');
 const f=read('src/components/PageFiles.tsx');assert.ok(f.includes('o anexo pode ser apenas o nome.jpeg'));
});
test('Mimic: conta paga há mais de 31 dias de atraso continua na linha do tempo, ticada',()=>{
 const fin=load('src/lib/finance.ts'),noop=()=>({});
 const {timelineMoney}=load('src/lib/home-brief.ts',{react:{useEffect(){},useState:v=>[v,()=>{}]},'./capsule-store':{useCapsules:noop},'./finance':fin,'../screens/finance/core':{},'../screens/PackagesApp':{classify:x=>x},'./finance-left':{}});
 const tx=o=>({paidAt:'',reservePart:0,time:'',id:'x',kind:'expense',desc:'Condomínio',amount:500,date:'2026-09-20',category:'',accountId:'a',toAccountId:'',cardId:'',invoice:'',paid:false,seriesId:'',installment:0,installments:0,recurrence:'none',recurrenceEnd:'',...o});
 const today='2026-11-13';
 assert.deepEqual(j(timelineMoney([tx({id:'c1'})],[],today).map(d=>[d.id,!!d.paid])),[['c1',false]],'atrasada aparece');
 assert.deepEqual(j(timelineMoney([tx({id:'c1',paid:true,paidAt:today})],[],today).map(d=>[d.id,!!d.paid])),[['c1',true]],'paga hoje continua');
 assert.deepEqual(j(timelineMoney([tx({id:'c1',paid:true,paidAt:'2026-09-21'})],[],today)),[],'paga há muito tempo não volta');
});
test('Mimic: Só a estrutura lê cada página inteira do servidor e mantém os títulos do modelo',async()=>{
 const deps={'./page-hierarchy':load('src/lib/page-hierarchy.ts'),'./page-order':load('src/lib/page-order.ts',{'./page-hierarchy':load('src/lib/page-hierarchy.ts')})};
 const {clonePageTree,structureBlock}=load('src/lib/page-clone.ts',deps);
 const full={id:'a',kind:'user_page',title:'Anotações',content:'',area:'Pessoal',state:'active',privacy:'private',tags:[],revision:1,data:{parent_id:'',blocks_json:JSON.stringify([{id:'h',type:'heading2',text:'Opções'},{id:'t',type:'text',text:'segredo'},{id:'nb',type:'collection',data:{mode:'notebooks',title:'Notas',notebooks:[{id:'f',name:'caderno-01',pages:[{id:'n',title:'oi'}]}]}}])}};
 const listed={...full,data:{parent_id:''}};// cópia curta da barra lateral, sem o conteúdo
 const saved=[];const api={entityFresh:async id=>id==='a'?full:null,saveEntity:async x=>{const e={...x,id:x.id||'copy'+saved.length,revision:1};saved.push(j(e));return e;}};
 await clonePageTree(api,[listed],'a','structure');
 const blocks=JSON.parse(saved[0].data.blocks_json);
 assert.deepEqual(blocks.map(b=>b.id),['h','t','nb'],'o bloco de Notas veio');
 assert.equal(blocks[0].text,'Opções','título do modelo fica');assert.equal(blocks[1].text,'','texto sai');
 assert.deepEqual(j(blocks[2].data.notebooks[0].pages),[],'notas saem, a pasta fica');
 assert.equal(structureBlock({id:'x',type:'heading1',text:'Seção'}).text,'Seção');
});
test('Mimic: corretor desligado também nos campos que aparecem depois',()=>{
 const s=read('src/lib/web-spellcheck.ts');assert.ok(s.includes('mo.observe(doc.body,{childList:true,subtree:true})'));
 const {installSpellcheckFocus}=load('src/lib/web-spellcheck.ts');
 let cb=null;const field={nodeType:1,tagName:'TEXTAREA',type:'',spellcheck:true,getAttribute:()=>null,matches:()=>true,querySelectorAll:()=>[]};
 const doc={activeElement:null,body:{},addEventListener(){},removeEventListener(){},querySelectorAll:()=>[]};
 const off=load('src/lib/web-spellcheck.ts',{},{MutationObserver:function(f){cb=f;this.observe=()=>{};this.disconnect=()=>{};}}).installSpellcheckFocus(doc);
 cb([{addedNodes:[field]}]);assert.equal(field.spellcheck,false,'campo novo nasce sem o sublinhado');off();
 assert.equal(typeof installSpellcheckFocus,'function');
});
test('Mimic: soltar a nota numa página fechada da barra lateral leva a API junto (não dá mais "Sem conexão")',()=>{
 const s=read('src/desktop/DesktopShell.tsx');assert.ok(s.includes('void moveNoteToPage(noteId,from,id,api).then('));
});
test('Mimic: ESC na Agenda refaz só os passos dados nela e depois volta para a tela de onde veio',()=>{
 const s=read('src/desktop/AgendaDesk.tsx');
 assert.ok(s.includes("if (e.key === 'Escape') {const back = trail.current[trail.current.length - 1]; if (back && !anim) {e.preventDefault();"));
 assert.ok(!s.includes("if (level === 'day') {e.preventDefault(); go('month', p.selected);}"),'sem passos, o Esc não fica preso na Agenda');
});
test('copiar anexo de uma página para outra não pede a senha do Drive (arquivos do Drive continuam pedindo)',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','..','src/channels/mobile.js'),'utf8').replace(/\r\n/g,'\n');
 assert.ok(s.includes("if (p !== '/api/mobile/md/sofiadrive/to-page' && driveLocked()) fail('DRIVE_LOCKED'"));
 assert.ok(s.includes("if (Array.isArray(b.ids) && b.ids.length && driveLocked()) fail('DRIVE_LOCKED'"));
});
