// 0.3.228: Paginas > pastas: arrastar nota para dentro/para fora, pasta dentro de pasta. Renderiza o NotebookBlock de
// verdade (React real), simula segurar/arrastar/soltar e confere os DADOS gravados.
const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{act,create}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const load=require('./load-ts.cjs');
const host=name=>function H(props){return React.createElement(name,props,props.children);};
let pan=null,locks=[];const rects={};
function labelOf(p){const ch=Array.isArray(p.children)&&p.children[0]&&p.children[0].props&&String(p.children[0].props.accessibilityLabel||'').startsWith('Abrir nota')?p.children[0]:p.children;if(ch&&ch.props&&ch.props.accessibilityLabel)return ch.props.accessibilityLabel;if(p.style&&p.style.borderStyle==='dashed')return '__up__';return 'root';}
const RN={View:React.forwardRef((p,ref)=>{React.useImperativeHandle(ref,()=>({measureInWindow:cb=>{const r=rects[labelOf(p)]||{x:0,y:0,w:0,h:0};cb(r.x,r.y,r.w,r.h);}}));return React.createElement('View',p,p.children);}),
 Text:host('Text'),TextInput:host('TextInput'),ScrollView:host('ScrollView'),Pressable:host('Pressable'),
 PanResponder:{create:c=>{pan=c;return {panHandlers:{}};}},
 Animated:{View:host('AnimatedView'),ValueXY:function(){this.setValue=()=>{};this.getTranslateTransform=()=>[];}}};
const M=load('src/components/NotebookBlock.tsx',{react:React,'react/jsx-runtime':require('react/jsx-runtime'),'react-native':RN,'react-native-safe-area-context':{SafeAreaView:host('Safe')},
 './MotionModal':{MotionModal:()=>null},'../lib/leaf-document':{applyLeafPatch:(p,x)=>({...p,...x})},'./KeyboardViewport':{KeyboardViewport:host('KV')},'./LeafEditor':{LeafEditor:()=>null},
 '../lib/theme':{useTheme:()=>({text:'t',muted:'m',surface:'s',line:'l',accent:'a',accentSoft:'as',input:'i',onAccent:'o',danger:'d',bg:'b'})},
 './UI':{Button:host('Button'),IconButton:host('IconButton')},'./Sheet':{Sheet:p=>p.visible?React.createElement('Sheet',p,p.children):null},
 '../lib/app-alert':{appAlert:()=>{}},'../lib/fuzzy':{fuzzyScore:()=>0},'../lib/desktop':{tap:t=>t,useDesktop:()=>false},'./ContextMenu':{contextMenu:()=>({}),openContextMenu:()=>{}},'./Icon':{Icon:()=>null},'../lib/hover-hold':{useHoverKey:()=>({key:null,enter(){},leave(){}})}});
const leaf=(id,t)=>({id,title:t,content:'',created_at:'2026-10-25T10:00:00Z'});
const base=()=>({mode:'notebooks',title:'Notas',notebooks:[
 {id:'A',name:'Trabalho',emoji:'💼',expanded:true,pages:[leaf('n1','Ideia 1'),leaf('n2','Ideia 2')]},
 {id:'B',name:'Casa',emoji:'🏠',expanded:true,pages:[]},
 {id:'C',name:'Viagens',emoji:'✈️',expanded:true,pages:[]}]});
function setup(data){
 const st={data,tree:null};locks=[];
 const render=()=>React.createElement(M.NotebookBlock,{data:st.data,onChange:d=>{st.data=d;},onInteractionChange:v=>locks.push(v)});
 act(()=>{st.tree=create(render());});
 st.sync=()=>act(()=>{st.tree.update(render());});
 st.press=l=>st.tree.root.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel===l);
 st.has=l=>st.tree.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel===l).length>0;
 return st;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function drag(st,fromLabel,toTarget){
 for(const k of Object.keys(rects))delete rects[k];
 rects.root={x:0,y:0,w:400,h:900};
 if(toTarget)rects[toTarget]={x:200,y:300,w:150,h:100};
 const card=st.press(fromLabel);
 await act(async()=>{card.props.onLongPress({nativeEvent:{pageX:20,pageY:20}});await sleep(90);});
 // como no Android: o arrastar pega o dedo (captura) e o cartao recebe o aviso de que perdeu o toque
 await act(async()=>{assert.equal(pan.onMoveShouldSetPanResponderCapture(),true);card.props.onPressOut&&card.props.onPressOut();});
 await act(async()=>{pan.onPanResponderMove({nativeEvent:{pageX:120,pageY:200}});pan.onPanResponderMove({nativeEvent:{pageX:260,pageY:340}});});
 await act(async()=>{pan.onPanResponderRelease();});
 st.sync();
}
const book=(st,id)=>st.data.notebooks.find(b=>b.id===id);
const ids=pages=>JSON.parse(JSON.stringify(pages.map(p=>p.id)));
test('dentro de uma pasta: arrastar a nota para "Tirar desta pasta" deixa a nota fora de pastas',async()=>{
 const st=setup(base());
 act(()=>{st.press('Abrir pasta Trabalho').props.onPress();});
 await drag(st,'Abrir nota Ideia 1','__up__');
 assert.deepEqual(ids(book(st,'A').pages),['n2'],'saiu de Trabalho');
 assert.deepEqual(ids(book(st,'__fora_de_pastas__').pages),['n1'],'ficou fora de pastas');
 assert.deepEqual(JSON.parse(JSON.stringify(locks)),[true,false],'rolagem travada so durante o arrastar');
});
test('na tela das pastas: arrastar a nota solta para cima de uma pasta coloca a nota dentro dela',async()=>{
 const d=base();d.notebooks.push({id:'__fora_de_pastas__',name:'Fora de pastas',emoji:'📝',expanded:true,pages:[leaf('n9','Solta')],root:true});
 const st=setup(d);
 assert.ok(st.has('Abrir nota Solta'),'nota fora de pastas aparece na raiz');
 assert.ok(!st.has('Abrir pasta Fora de pastas'),'nao vira um cartao de pasta');
 await drag(st,'Abrir nota Solta','Abrir pasta Casa');
 assert.deepEqual(ids(book(st,'B').pages),['n9']);
 assert.equal(book(st,'__fora_de_pastas__').pages.length,0);
});
test('pasta dentro de pasta: arrastar Viagens para Casa; abrir Casa mostra Viagens; tirar de volta',async()=>{
 const st=setup(base());
 await drag(st,'Abrir pasta Viagens','Abrir pasta Casa');
 assert.equal(book(st,'C').parent,'B','Viagens agora esta dentro de Casa');
 assert.ok(!st.has('Abrir pasta Viagens'),'some da raiz');
 act(()=>{st.press('Abrir pasta Casa').props.onPress();});
 assert.ok(st.has('Abrir pasta Viagens'),'aparece dentro de Casa');
 await drag(st,'Abrir pasta Viagens','__up__');
 assert.equal(book(st,'C').parent,undefined,'voltou para a raiz');
});
test('0.3.229: segurar e soltar sem arrastar nao muda nada e NAO abre Renomear',async()=>{
 const st=setup(base());const before=JSON.stringify(st.data);
 await act(async()=>{st.press('Abrir pasta Casa').props.onLongPress({nativeEvent:{pageX:20,pageY:20}});await sleep(90);});
 await act(async()=>{st.press('Abrir pasta Casa').props.onPressOut();});
 assert.equal(JSON.stringify(st.data),before);
 assert.equal(st.tree.root.findAll(n=>n.type==='Sheet').length,0,'nenhum menu abriu');
 assert.deepEqual(JSON.parse(JSON.stringify(locks)),[true,false],'arrastar terminou e a rolagem voltou');
});
test('0.3.229: as opcoes da pasta ficam no ⋯ do topo da pasta aberta (como no Notion)',async()=>{
 const st=setup(base());
 assert.ok(!st.has('Opções da pasta'),'na tela das pastas nao ha ⋯ de pasta');
 act(()=>{st.press('Abrir pasta Casa').props.onPress();});
 act(()=>{st.press('Opções da pasta').props.onPress();});
 const sheet=st.tree.root.findAll(n=>n.type==='Sheet');assert.ok(sheet.length>0,'menu da pasta abriu pelo ⋯');
 assert.ok(st.tree.root.findAll(n=>n.type==='Button'&&n.props.title==='Renomear').length>0,'Renomear esta no ⋯');
});
test('soltar fora de qualquer pasta nao muda nada',async()=>{
 const st=setup(base());const before=JSON.stringify(st.data);
 await drag(st,'Abrir pasta Casa',null);
 assert.equal(JSON.stringify(st.data),before);
});
test('pasta criada dentro de uma pasta aberta vira subpasta; contagem mostra as subpastas',async()=>{
 const d=base();d.notebooks[2].parent='B';const st=setup(d);
 const tile=st.tree.root.findAll(n=>n.type==='Text'&&typeof n.props.children==='string'&&n.props.children.includes('· 1 pasta'));
 assert.ok(tile.length>0,'Casa mostra "0 notas · 1 pasta"');
});
