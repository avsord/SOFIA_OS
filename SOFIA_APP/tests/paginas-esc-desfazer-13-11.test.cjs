'use strict';
// 13/11/2026 (Pedro): Esc volta um nível; Ctrl+Z na barra das Páginas; "Só a estrutura" vazia; corretor só no campo em edição.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
const hier=load('src/lib/page-hierarchy.ts'),order=load('src/lib/page-order.ts',{'./page-hierarchy':hier});
const clone=load('src/lib/page-clone.ts',{'./page-hierarchy':hier,'./page-order':order});
const esc=load('src/lib/esc-stack.ts');
const undo=load('src/lib/page-undo.ts',{'./page-order':order});
const trash=load('src/lib/page-trash.ts',{'./page-clone':clone});
const spell=load('src/lib/web-spellcheck.ts');
const src=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const page=(id,parent='',blocks=[],extra={})=>({id,kind:'user_page',title:id,content:'texto '+id,area:'Pessoal',state:'active',privacy:'private',tags:[],revision:1,updated_at:'2026-11-01T00:00:00Z',data:{parent_id:parent,node_type:parent?'page':'space',icon:'📝',sort_order:extra.sort??'',blocks_json:JSON.stringify(blocks)}});

test('Só a estrutura: página de notas fica com as pastas e sem notas; tabela fica com o cabeçalho e sem linhas; original intacto',async()=>{
 const notes=page('n','',[
  {id:'h',type:'heading',text:'Minhas notas',html:'<b>Minhas notas</b>'},
  {id:'c',type:'collection',text:'',data:{title:'Notas',mode:'notebooks',properties:[{key:'name',label:'Nome',type:'text'}],views:[{id:'notebooks',type:'pages'}],
   notebooks:[{id:'f1',name:'Ideias',emoji:'💡',expanded:true,pages:[{id:'x',title:'segredo',content:'texto da nota'}]}],rows:[{id:'r',values:{name:'linha'}}]}},
  {id:'img',type:'image',data:{attachment_id:'att1'}},{id:'t',type:'todo',text:'comprar pão',checked:true}]);
 const table=page('t','',[
  {id:'tb',type:'table',text:'Nome | Valor\nA | 1',data:{rows:[['Nome','Valor'],['A','1'],['B','2']]}},
  {id:'k',type:'collection',data:{properties:[{key:'status',label:'Status',type:'select',options:['A fazer','Feito']}],views:[{id:'board',type:'board',group_by:'status'}],rows:[{id:'r1',values:{status:'Feito',name:'cartão'}}]}},
  {id:'f',type:'file',data:{attachment_id:'a2',name:'x.pdf'}}]);
 const before=JSON.stringify([notes,table]);
 for(const p of [notes,table]){
  const saved=[];let n=0;const api={saveEntity:async input=>{const copy={...input,id:input.id||'novo'+(++n),revision:(input.revision||0)+1};saved.push(copy);return copy;}};
  const top=await clone.clonePageTree(api,[notes,table],p.id,'structure');
  const blocks=JSON.parse(saved.filter(x=>x.id===top.id).at(-1).data.blocks_json),json=JSON.stringify(blocks);
  assert.equal(top.content,'');
  for(const word of ['segredo','texto da nota','linha','comprar pão','att1','a2','cartão','"A"','"B"'])assert.ok(!json.includes(word),p.id+' ainda tem '+word);
  // 13/11/2026 (Mimic Kaizen): o titulo de secao e parte do modelo e fica
  if(json.includes('"id":"h"'))assert.ok(json.includes('Minhas notas'),p.id+' perdeu o titulo do modelo');
  if(p.id==='n'){
   assert.deepEqual(blocks.map(b=>b.type),['heading','collection','todo']);
   const col=blocks[1].data;assert.equal(col.notebooks.length,1);assert.equal(col.notebooks[0].name,'Ideias');assert.equal(col.notebooks[0].pages.length,0);assert.equal(col.rows.length,0);assert.equal(col.properties[0].label,'Nome');
   assert.equal(blocks[2].checked,false);
  }else{
   assert.deepEqual(blocks.map(b=>b.type),['table','collection']);
   assert.deepEqual(blocks[0].data.rows,[['Nome','Valor']]);
   assert.deepEqual(blocks[1].data.properties[0].options,['A fazer','Feito']);assert.equal(blocks[1].data.rows.length,0);assert.equal(blocks[1].data.views[0].group_by,'status');
  }
 }
 assert.equal(JSON.stringify([notes,table]),before);
});

test('Esc: o nível mais alto volta primeiro; quem não tem o que voltar passa para o de baixo',()=>{
 esc.resetEsc();const log=[];
 const offRoute=esc.pushEsc(()=>{log.push('rota');},esc.ESC_LEVEL.route);
 const offPage=esc.pushEsc(()=>{log.push('página mãe');},esc.ESC_LEVEL.page);
 let folder=true;const offNotes=esc.pushEsc(()=>{if(!folder)return false;folder=false;log.push('raiz das notas');},esc.ESC_LEVEL.section);
 const offMenu=esc.pushEsc(()=>{log.push('menu');offMenu();},esc.ESC_LEVEL.menu);
 esc.runEsc();esc.runEsc();esc.runEsc();offPage();esc.runEsc();
 assert.deepEqual(log,['menu','raiz das notas','página mãe','rota']);
 offNotes();offRoute();assert.equal(esc.escDepth(),0);assert.equal(esc.runEsc(),false);
});

test('Esc: campo de texto só perde o foco; Esc já tratado não volta; janela aberta não volta',async()=>{
 esc.resetEsc();let back=0;esc.pushEsc(()=>{back++;},esc.ESC_LEVEL.page);
 const listeners={};let dialog=false;const win={addEventListener:(t,f)=>{listeners[t]=f;},removeEventListener:()=>{},setTimeout:(f)=>f(),document:{querySelector:()=>dialog?{}:null}};
 const off=esc.installEscStack(win);
 let blurred=0;listeners.keydown({key:'Escape',target:{tagName:'TEXTAREA',blur:()=>blurred++},defaultPrevented:false});
 assert.equal(blurred,1);assert.equal(back,0);
 listeners.keydown({key:'Escape',target:{tagName:'DIV'},defaultPrevented:true});assert.equal(back,0);
 dialog=true;listeners.keydown({key:'Escape',target:{tagName:'DIV'},defaultPrevented:false});assert.equal(back,0);dialog=false;
 listeners.keydown({key:'Escape',target:{tagName:'DIV'},defaultPrevented:false});assert.equal(back,1);
 off();esc.resetEsc();
});

test('Ctrl+Z da barra: vários passos para trás e para a frente; o editor que mexeu por último fica com o Ctrl+Z',async()=>{
 let t=0;const s=new undo.UndoStack(()=>++t);const state=[];
 s.push({label:'a',undo:()=>state.push('-a'),redo:()=>state.push('+a')});
 s.push({label:'b',undo:async()=>{state.push('-b');},redo:()=>state.push('+b')});
 assert.equal(s.wants(false),true);
 assert.equal((await s.undo()).label,'b');assert.equal((await s.undo()).label,'a');assert.equal(await s.undo(),null);
 assert.equal((await s.redo()).label,'a');assert.deepEqual(state,['-b','-a','+a']);
 s.markEditor();assert.equal(s.wants(false),false);
 s.push({label:'c',undo:()=>{throw Error('offline');},redo:()=>{}});assert.equal(s.wants(true),false);
 await assert.rejects(s.undo());assert.equal(s.past.at(-1).label,'c'); // falhou: o passo continua para tentar de novo
});

test('lugar da página para desfazer mover: depois da irmã de cima, antes da de baixo, ou dentro da mãe',()=>{
 const pages=[page('a','',[],{sort:1}),page('b','',[],{sort:2}),page('c','a',[],{sort:1}),page('d','a',[],{sort:2}),page('e','d')];
 assert.deepEqual({...undo.pageSpot(pages,'b')},{parentId:'',kind:'after',anchorId:'a'});
 assert.deepEqual({...undo.pageSpot(pages,'a')},{parentId:'',kind:'before',anchorId:'b'});
 assert.deepEqual({...undo.pageSpot(pages,'e')},{parentId:'d',kind:'inside',anchorId:'d'});
});

test('excluir arquiva a árvore (filhas antes da mãe) e desfazer volta tudo; lixeira velha é apagada',async()=>{
 const pages=[page('a'),page('b','a'),page('c','b')];const calls=[];
 const api={saveEntity:async input=>{calls.push(input.id+':'+input.state);const cur=pages.find(p=>p.id===input.id);return {...cur,...input,revision:input.revision+1};}};
 const trashed=await trash.trashPageTree(api,pages,'a');
 assert.deepEqual(calls,['c:archived','b:archived','a:archived']);
 assert.equal(trashed.map(p=>p.id).join(),'a,b,c');assert.ok(trashed[0].tags.includes(trash.TRASH_ROOT_TAG));assert.ok(!trashed[1].tags.includes(trash.TRASH_ROOT_TAG));
 calls.length=0;const back=await trash.restorePageTree(api,trashed);
 assert.deepEqual(calls,['a:active','b:active','c:active']);assert.ok(back.every(p=>!p.tags.includes(trash.TRASH_TAG)));
 const old={...trashed[0],updated_at:'2026-01-01T00:00:00Z'},fresh={...trashed[0],id:'z',updated_at:new Date().toISOString()};
 assert.equal(trash.staleTrash([old,fresh,trashed[1]]).map(p=>p.id).join(),'a');
});

test('corretor ortográfico só no campo em edição',()=>{
 const el={tagName:'TEXTAREA',spellcheck:true};spell.spellWhileEditing(el,false);assert.equal(el.spellcheck,false);spell.spellWhileEditing(el,true);assert.equal(el.spellcheck,true);
 const host={isContentEditable:true,spellcheck:true,parentElement:{isContentEditable:false}},child={isContentEditable:true,parentElement:host};
 spell.spellWhileEditing(child,false);assert.equal(host.spellcheck,false);
});

test('barra lateral: soltar nota, Ctrl+Z, Esc da página e salvar sem piscar estão ligados',()=>{
 const shell=src('src/desktop/DesktopShell.tsx'),pages=src('src/screens/Pages.tsx'),app=src('App.tsx');
 assert.ok(shell.includes("application/x-sofia-note"));assert.ok(shell.includes("moveNoteToPage("));assert.ok(shell.includes("'Nota movida para '"));
 assert.ok(shell.includes('pageUndo.wants('));assert.ok(shell.includes('trashPageTree('));
 assert.ok(pages.includes('pushEsc('));assert.ok(pages.includes('pageUndo.markEditor()'));assert.ok(pages.includes('trashPageTree('));
 assert.ok(app.includes('installEscStack()'));assert.ok(app.includes('installSpellcheckFocus()'));
 assert.ok(src('src/lib/page-editor.ts').includes('delay??1000'));
});

test('aviso de salvar: Salvando… enquanto há o que salvar, depois Salvo (sem voltar a piscar Sincronizando)',()=>{
 const {nextSaveLabel}=load('src/components/SaveStatus.tsx',{react:{useEffect(){},useRef(){},useState(){}},'react/jsx-runtime':{jsx(){},jsxs(){},Fragment:{}}});
 assert.equal(nextSaveLabel('idle','pending'),'busy');assert.equal(nextSaveLabel('busy','saving'),'busy');
 assert.equal(nextSaveLabel('busy','saved'),'wait');assert.equal(nextSaveLabel('done','saved'),'done');assert.equal(nextSaveLabel('done','error'),'idle');
 assert.ok(!src('src/screens/Pages.tsx').includes("'Sincronizando…'"));
});

test('lixeira: limpeza automática nunca apaga o que não está na lixeira, nem com relógio adiantado ou dado faltando',()=>{
 const T=[trash.TRASH_TAG,trash.TRASH_ROOT_TAG],day=864e5,base=Date.parse('2026-11-13T12:00:00Z');
 const p=(id,o)=>({id,kind:'user_page',title:id,state:'archived',tags:T,revision:1,data:{parent_id:''},updated_at:new Date(base-40*day).toISOString(),...o});
 const active=p('ativa',{state:'active',tags:[],updated_at:new Date(base-90*day).toISOString()});
 const arquivadaSemMarca=p('arq',{tags:[]}),soFilha=p('filha',{tags:[trash.TRASH_TAG]}),velha=p('velha'),nova=p('nova',{updated_at:new Date(base-2*day).toISOString()});
 const all=[active,arquivadaSemMarca,soFilha,velha,nova];
 assert.equal(trash.staleTrash(all,base).map(x=>x.id).join(),'velha');
 // relógio do aparelho 1 ano adiantado: vale a edição mais nova vista no servidor
 assert.equal(trash.staleTrash(all,base+365*day).map(x=>x.id).join(),'velha');
 assert.equal(trash.staleTrash([velha,p('n2',{updated_at:new Date(base-35*day).toISOString()})],base+365*day).map(x=>x.id).join(),'','sem edição recente: nada sai');
 // sem data, data inválida, relógio inválido, lista vazia
 assert.equal(trash.staleTrash([p('x',{updated_at:''}),p('y',{updated_at:'lixo'})],base).length,0);
 assert.equal(trash.staleTrash(all,NaN).length,0);assert.equal(trash.staleTrash([],base).length,0);
 // raiz que ainda é mãe de página ativa não sai
 assert.equal(trash.staleTrash([...all,p('viva',{state:'active',tags:[],data:{parent_id:'velha'},updated_at:new Date(base).toISOString()})],base).map(x=>x.id).join(),'');
 const sh=src('src/desktop/DesktopShell.tsx');assert.ok(sh.includes('const stale=complete?staleTrash(seen):[]'),'só limpa com a lista inteira');
});
