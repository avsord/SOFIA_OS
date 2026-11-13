'use strict';
// 13/11/2026 (Pedro): "＋ Nota" cria nota solta (sem pasta "Geral"), arrastar funciona no computador (arrastar do navegador)
// e no toque, ordem gravada, cartoes de pasta do mesmo tamanho, nota arrastada para outra pagina, e NENHUMA nota antiga se perde.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),{act,create}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const load=require('./load-ts.cjs');
const NM=load('src/lib/notes-move.ts');
const host=name=>function H(props){return React.createElement(name,props,props.children);};
const labelOf=p=>{if(p.style&&p.style.gap===12)return 'root';const ch=Array.isArray(p.children)?p.children.find(x=>x&&x.props&&x.props.accessibilityLabel):p.children;if(ch&&ch.props&&ch.props.accessibilityLabel)return ch.props.accessibilityLabel;if(p.style&&p.style.borderStyle==='dashed')return '__up__';return '';};
// elemento falso do navegador: guarda os ouvintes de arrastar e responde a posicao na tela
const els={},rects={};let pan=null;
function fakeEl(label){const el=els[label]||(els[label]={on:{},attrs:{},label,addEventListener(ev,fn){(this.on[ev]=this.on[ev]||[]).push(fn);},setAttribute(k,v){this.attrs[k]=v;},contains(){return false;},
 getBoundingClientRect(){const r=rects[this.label]||{x:0,y:0,w:0,h:0};return {left:r.x,top:r.y,width:r.w,height:r.h};},measureInWindow(cb){const r=rects[this.label]||{x:0,y:0,w:0,h:0};cb(r.x,r.y,r.w,r.h);}});return el;}
const fire=(label,ev,e)=>{for(const fn of (els[label]?.on[ev]||[]))fn(e);};
const RN={View:React.forwardRef((p,ref)=>{const l=labelOf(p);React.useImperativeHandle(ref,()=>fakeEl(l||'x'+Math.random()));return React.createElement('View',p,p.children);}),
 Text:host('Text'),TextInput:host('TextInput'),ScrollView:host('ScrollView'),Pressable:host('Pressable'),
 PanResponder:{create:c=>{pan=c;return {panHandlers:{}};}},
 Animated:{View:host('AnimatedView'),ValueXY:function(){this.setValue=()=>{};this.getTranslateTransform=()=>[];}}};
const M=load('src/components/NotebookBlock.tsx',{react:React,'react/jsx-runtime':require('react/jsx-runtime'),'react-native':RN,'react-native-safe-area-context':{SafeAreaView:host('Safe')},
 './MotionModal':{MotionModal:()=>null},'../lib/leaf-document':{applyLeafPatch:(p,x)=>({...p,...x})},'./KeyboardViewport':{KeyboardViewport:host('KV')},'./LeafEditor':{LeafEditor:()=>null},
 '../lib/theme':{useTheme:()=>({text:'t',muted:'m',surface:'s',line:'l',accent:'a',accentSoft:'as',input:'i',onAccent:'o',danger:'d',bg:'b'})},
 './UI':{Button:host('Button'),IconButton:host('IconButton')},'./Sheet':{Sheet:p=>p.visible?React.createElement('Sheet',p,p.children):null},
 '../lib/app-alert':{appAlert:()=>{}},'../lib/fuzzy':{fuzzyScore:()=>0},'../lib/desktop':{tap:t=>t,useDesktop:()=>true},'./ContextMenu':{contextMenu:()=>({}),openContextMenu:()=>{}},'./Icon':{Icon:()=>null},'../lib/hover-hold':{useHoverKey:()=>({key:null,enter(){},leave(){}})},'../lib/notes-move':NM});
const leaf=(id,t,extra={})=>({id,title:t,content:'texto '+t,created_at:'2026-10-25T10:00:00Z',...extra});
// dados reais de hoje: pasta "Geral" criada pelo ＋ Nota antigo e a pasta caderno-01
const oldData=()=>({mode:'notebooks',title:'Notas',notebooks:[
 {id:'G',name:'Geral',emoji:'📝',expanded:true,pages:[leaf('n1','ideias-claude',{updated_at:'2026-11-01T10:00:00Z'}),leaf('n2','estrutura-organização'),leaf('n3','anotações-geral'),leaf('n4','')]},
 {id:'C',name:'caderno-01',emoji:'📁',expanded:true,pages:[]}]});
function setup(data,pageId){
 const st={data,changes:0,tree:null};
 const render=()=>React.createElement(M.NotebookBlock,{data:st.data,pageId,onChange:d=>{st.data=d;st.changes++;}});
 act(()=>{st.tree=create(render());});
 st.sync=()=>act(()=>{st.tree.update(render());});
 st.press=l=>st.tree.root.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel===l);
 st.has=l=>st.tree.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel===l).length>0;
 return st;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ids=pages=>pages.map(p=>p.id).join();
const book=(st,id)=>st.data.notebooks.find(b=>b.id===id);
function clearRects(){for(const k of Object.keys(rects))delete rects[k];}

test('dados antigos: todas as notas aparecem com titulo e nada é regravado só por abrir',()=>{
 const st=setup(oldData());const before=JSON.stringify(st.data);
 act(()=>{st.press('Abrir pasta Geral').props.onPress();});
 for(const t of ['ideias-claude','estrutura-organização','anotações-geral','Sem título'])assert.ok(st.has('Abrir nota '+t),t);
 assert.equal(st.changes,0);assert.equal(JSON.stringify(st.data),before);
 // formato mais antigo (rows) continua legivel
 const legacy=NM.booksOf({rows:[{id:'r1',values:{name:'Velho'},page_content:'conteudo velho'}]});
 assert.equal(legacy[0].name,'Velho');assert.equal(legacy[0].pages[0].content,'conteudo velho');
 assert.ok(fs.readFileSync(path.join(__dirname,'../src/components/NotebookBlock.tsx'),'utf8').includes("Array.isArray(data.notebooks)?data.notebooks:(data.rows||[])"));
});

test('＋ Nota na raiz cria nota solta (sem pasta "Geral"); dentro da pasta, cria nela',()=>{
 const st=setup({mode:'notebooks',title:'Notas',notebooks:[{id:'C',name:'caderno-01',emoji:'📁',expanded:true,pages:[]}]});
 act(()=>{st.press('Nova nota').props.onPress();});st.sync();
 assert.ok(!st.data.notebooks.some(b=>b.name==='Geral'),'nao cria Geral');
 const root=book(st,NM.ROOT_BOOK);assert.equal(root.pages.length,1);assert.equal(root.root,true);
 assert.ok(!st.has('Abrir pasta Fora de pastas'),'nota solta nao vira cartao de pasta');
 assert.ok(st.has('Abrir nota Sem título'),'aparece como cartao de nota na raiz');
 act(()=>{st.press('Abrir pasta caderno-01').props.onPress();});
 act(()=>{st.press('Nova nota').props.onPress();});st.sync();
 assert.equal(book(st,'C').pages.length,1);assert.equal(book(st,NM.ROOT_BOOK).pages.length,1);
 // sem nenhuma pasta: tambem solta
 const r=NM.addLooseNote([],null,leaf('x','nova'));assert.equal(r.bookId,NM.ROOT_BOOK);assert.equal(r.books.length,1);
});

test('computador: arrastar do navegador reordena as notas e a ordem fica gravada; leva o tipo application/x-sofia-note',async()=>{
 const st=setup(oldData(),'pagina-1');
 act(()=>{st.press('Abrir pasta Geral').props.onPress();});
 clearRects();rects['Abrir nota ideias-claude']={x:0,y:100,w:400,h:60};rects['Abrir nota anotações-geral']={x:0,y:240,w:400,h:60};
 const set={};const dt={setData:(k,v)=>{set[k]=v;},effectAllowed:'',dropEffect:''};
 assert.equal(els['Abrir nota ideias-claude'].attrs.draggable,'true','cartao arrastavel');
 await act(async()=>{fire('Abrir nota ideias-claude','dragstart',{dataTransfer:dt,stopPropagation(){}});await sleep(10);});
 assert.equal(dt.effectAllowed,'move');
 assert.deepEqual(JSON.parse(set['application/x-sofia-note']),{noteId:'n1',fromPageId:'pagina-1',title:'ideias-claude'});
 let prevented=0;const ev={clientX:50,clientY:290,preventDefault(){prevented++;},stopPropagation(){},dataTransfer:dt};
 await act(async()=>{fire('root','dragover',ev);fire('root','drop',ev);});st.sync();
 assert.ok(prevented>0);
 assert.equal(ids(book(st,'G').pages),'n2,n3,n1,n4','foi para depois de anotações-geral');
 await act(async()=>{fire('Abrir nota ideias-claude','dragend',{});});
 assert.equal(ids(book(st,'G').pages),'n2,n3,n1,n4','dragend depois do soltar nao desfaz');
});

test('computador: soltar a nota no "‹ Notas" tira da pasta; soltar na pasta coloca dentro',async()=>{
 const st=setup(oldData(),'p');
 act(()=>{st.press('Abrir pasta Geral').props.onPress();});
 clearRects();rects['Voltar às pastas']={x:0,y:0,w:120,h:20};
 const dt={setData(){},effectAllowed:''};
 await act(async()=>{fire('Abrir nota ideias-claude','dragstart',{dataTransfer:dt});await sleep(10);});
 const ev={clientX:10,clientY:10,preventDefault(){},stopPropagation(){}};
 await act(async()=>{fire('root','dragover',ev);fire('root','drop',ev);});st.sync();
 assert.equal(ids(book(st,NM.ROOT_BOOK).pages),'n1');assert.equal(ids(book(st,'G').pages),'n2,n3,n4');
 act(()=>{st.press('Voltar às pastas').props.onPress();});
 clearRects();rects['Abrir pasta caderno-01']={x:300,y:0,w:200,h:132};
 await act(async()=>{fire('Abrir nota ideias-claude','dragstart',{dataTransfer:dt});await sleep(10);});
 const ev2={clientX:400,clientY:60,preventDefault(){},stopPropagation(){}};
 await act(async()=>{fire('root','dragover',ev2);fire('root','drop',ev2);});st.sync();
 assert.equal(ids(book(st,'C').pages),'n1');assert.equal(book(st,NM.ROOT_BOOK).pages.length,0);
});

test('reordenar pastas: borda do cartao = antes/depois (ordem gravada); meio = entrar; nunca dentro dela mesma',()=>{
 const books=[{id:'A',name:'A',pages:[]},{id:'B',name:'B',pages:[]},{id:'C',name:'C',pages:[]}];
 const item={kind:'folder',id:'C',from:'',label:'C'};
 const r=[{id:'A',x:0,y:0,w:100,h:100}];
 assert.equal(NM.hitTarget(r,item,10,50),'folder:A|before');assert.equal(NM.hitTarget(r,item,90,50),'folder:A|after');assert.equal(NM.hitTarget(r,item,50,50),'A');
 assert.equal(NM.applyDrop(books,item,'folder:A|before',null).books.map(b=>b.id).join(),'C,A,B');
 assert.equal(NM.applyDrop(books,item,'A',null).books.find(b=>b.id==='C').parent,'A');
 const nested=[{id:'A',name:'A',pages:[]},{id:'B',name:'B',parent:'A',pages:[]}];
 assert.ok(NM.applyDrop(nested,{kind:'folder',id:'A',from:'',label:'A'},'B',null).error);
 assert.equal(JSON.stringify(books),JSON.stringify([{id:'A',name:'A',pages:[]},{id:'B',name:'B',pages:[]},{id:'C',name:'C',pages:[]}]),'entrada intacta');
});

test('cartoes de pasta: mesma altura e mesmas linhas (pasta vazia mostra "Vazia")',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../src/components/NotebookBlock.tsx'),'utf8');
 assert.ok(s.includes('height:132,overflow:\'hidden\''));assert.ok(s.includes(":'Vazia'}"));assert.ok(!s.includes("name:'Geral'"),'＋ Nota nao cria mais a pasta Geral');
 const st=setup(oldData());
 const lines=st.tree.root.findAll(n=>n.type==='Text'&&(n.props.children==='Vazia'||String(n.props.children).startsWith('Última: ')));
 assert.equal(lines.length,2,'Geral e caderno-01 tem a mesma 4a linha');
});

const page=(id,blocks,extra={})=>({id,kind:'user_page',title:id,revision:3,data:{blocks_json:JSON.stringify(blocks),...extra}});
const notesBlock=books=>({id:'nb',type:'collection',data:{title:'Notas',mode:'notebooks',notebooks:books,views:[{id:'notebooks',type:'pages'}],active_view:'notebooks',rows:[]}});
function fakeApi(pages){const saves=[];return {saves,pages,entityFresh:async id=>JSON.parse(JSON.stringify(pages[id])),saveEntity:async(input)=>{saves.push(input.id);pages[input.id]={...pages[input.id],data:input.data,revision:pages[input.id].revision+1};return pages[input.id];}};}

test('mover nota para outra página: vai inteira (título, texto, data), destino primeiro, origem depois',async()=>{
 const n=leaf('n1','ideias-claude',{updated_at:'2026-11-01T10:00:00Z',blocks:[{id:'b',type:'text',text:'oi'}]});
 const api=fakeApi({src:page('src',[{id:'t',type:'text',text:'x'},notesBlock([{id:'G',name:'Geral',pages:[n,leaf('n2','fica')]}])]),
  plain:page('plain',[{id:'t2',type:'text',text:'só texto'}]),notes:page('notes',[notesBlock([{id:'K',name:'caderno-01',pages:[]}])])});
 await NM.moveNoteToPage('n1','src','plain',api);
 assert.deepEqual(api.saves,['plain','src']);
 const plain=JSON.parse(api.pages.plain.data.blocks_json);assert.equal(plain[0].text,'só texto');
 const moved=plain[1].data.notebooks[0].pages[0];assert.equal(plain[1].data.notebooks[0].id,NM.ROOT_BOOK);
 assert.deepEqual(moved,n,'nota identica');
 const src=JSON.parse(api.pages.src.data.blocks_json);assert.equal(src[0].text,'x');assert.equal(ids(src[1].data.notebooks[0].pages),'n2');
 // destino que ja e pagina de Notas: nota solta na raiz dele, pastas intactas
 await NM.moveNoteToPage('n2','src','notes',api);
 const nb=JSON.parse(api.pages.notes.data.blocks_json)[0].data.notebooks;
 assert.equal(nb.find(b=>b.id==='K').name,'caderno-01');assert.equal(ids(nb.find(b=>b.id===NM.ROOT_BOOK).pages),'n2');
});

test('mover nota: página trancada ou ilegível recusa e NÃO tira a nota da origem',async()=>{
 const api=fakeApi({src:page('src',[notesBlock([{id:'G',name:'Geral',pages:[leaf('n1','a')]}])]),lock:page('lock',[],{lock_json:'{"v":1}'})});
 const before=api.pages.src.data.blocks_json;
 await assert.rejects(NM.moveNoteToPage('n1','src','lock',api));
 api.pages.bad={id:'bad',kind:'user_page',revision:1,data:{blocks_json:'{quebrado'}};
 await assert.rejects(NM.moveNoteToPage('n1','src','bad',api));
 assert.equal(api.pages.src.data.blocks_json,before);assert.deepEqual(api.saves,[]);
});

test('mover nota da página aberta: usa as Notas da tela (rascunho vivo) e a nota some dela',async()=>{
 const st=setup(oldData(),'aberta');
 const api=fakeApi({dest:page('dest',[])});
 await act(async()=>{await NM.moveNoteToPage('n3','aberta','dest',api);});st.sync();
 assert.equal(ids(book(st,'G').pages),'n1,n2,n4');
 assert.equal(JSON.parse(api.pages.dest.data.blocks_json)[0].data.notebooks[0].pages[0].title,'anotações-geral');
 assert.deepEqual(api.saves,['dest']);
 act(()=>{st.tree.unmount();});
 await assert.rejects(NM.moveNoteToPage('n1','aberta','dest',null),'fechada e sem api: recusa');
});
