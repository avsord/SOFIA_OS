'use strict';
// 0.3.242: Biblioteca com etiquetas (tocar, sem duplicar, editar/juntar/apagar), Capsulas (aba "Todas" e apagar), Apps sem Estudos e Projetos e rotina.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),{act,create}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const load=require('./load-ts.cjs');const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const LF=load('src/lib/library-filters.ts');const LT=load('src/lib/library-tags.ts',{'./library-filters':LF});
const film=(id,genre,extra={})=>({id,kind:'film',title:'F'+id,revision:1,tags:[],data:{genre},...extra});

test('regras: separa, junta sem duplicar (maiusculas/acentos/espacos), conta e sugere a que ja existe',()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(LT.splitTags('Terror, suspense; terror / Térror |  Ficção  científica '))),['Terror','suspense','Ficção científica']);
  const opts=LT.tagOptions([film('1','Terror'),film('2','terror, Suspense'),film('3','Comédia')]);
  assert.deepEqual(JSON.parse(JSON.stringify(opts)),[{label:'Comédia',count:1},{label:'Suspense',count:1},{label:'Terror',count:2}]);
  const s=LT.suggestTags(' TÉRROR ',opts);assert.equal(s.exact,'Terror');assert.equal(s.canCreate,false,'nao oferece criar outra igual');
  const s2=LT.suggestTags('sus',opts);assert.equal(s2.exact,null);assert.deepEqual(JSON.parse(JSON.stringify(s2.matches)),['Suspense']);assert.equal(s2.canCreate,true);
  assert.deepEqual(JSON.parse(JSON.stringify(LT.addTag(['Comédia'],'terror',opts))),['Comédia','Terror'],'usa a grafia que ja existe');
  assert.deepEqual(JSON.parse(JSON.stringify(LT.addTag(['Terror'],' TERROR ',opts))),['Terror'],'nunca duplica');
  assert.equal(LT.renameTagInValue('Horror, Suspense','horror','Terror'),'Terror, Suspense');
  assert.equal(LT.renameTagInValue('Horror, Terror','Horror','Terror'),'Terror','juntar: as duas viram uma');
  assert.equal(LT.removeTagFromValue('Terror, Suspense','TERROR'),'Suspense');
});

// --- componentes renderizados de verdade ---
const host=name=>function H(p){return React.createElement(name,p,p.children);};
const RN={View:host('View'),Text:host('Text'),TextInput:host('TextInput'),Pressable:host('Pressable'),ScrollView:host('ScrollView')};
const theme={useTheme:()=>({text:'t',muted:'m',surface:'s',line:'l',accent:'a',accentSoft:'as',input:'i',danger:'d'})};
const UI={forms:{label:{},input:{}},Button:host('Button')};
const deps={react:React,'react/jsx-runtime':require('react/jsx-runtime'),'react-native':RN,'../lib/theme':theme,'./UI':UI,'../lib/library-tags':LT,'../lib/library-filters':LF};
const TP=load('src/components/TagPicker.tsx',deps);
const byLabel=(tree,l)=>tree.root.find(n=>n.props&&n.props.accessibilityLabel===l&&typeof n.props.onPress==='function');
const has=(tree,l)=>tree.root.findAll(n=>n.props&&n.props.accessibilityLabel===l).length>0;

test('formulario: toca nas etiquetas que ja existem; digitar "terror" oferece a "Terror" existente e nao cria outra',async()=>{
  let value='';const opts=[{label:'Comédia',count:1},{label:'Terror',count:2}];let tree;
  const render=()=>React.createElement(TP.TagPicker,{label:'Gênero',value,options:opts,onChange:v=>{value=v;}});
  act(()=>{tree=create(render());});
  act(()=>{byLabel(tree,'Pôr etiqueta Terror').props.onPress();});assert.equal(value,'Terror');act(()=>{tree.update(render());});
  assert.ok(has(tree,'Tirar etiqueta Terror'),'fica marcada');
  const input=tree.root.find(n=>n.type==='TextInput');
  act(()=>{input.props.onChangeText(' terror ');});
  assert.ok(!has(tree,'Criar etiqueta terror'),'sem botao de criar duplicata');
  act(()=>{input.props.onSubmitEditing();});assert.equal(value,'Terror','continua uma so');
  act(()=>{input.props.onChangeText('Suspense');});assert.ok(has(tree,'Criar etiqueta Suspense'));
  act(()=>{byLabel(tree,'Criar etiqueta Suspense').props.onPress();});assert.equal(value,'Terror, Suspense','varias por item');
  act(()=>{tree.update(render());});act(()=>{byLabel(tree,'Tirar etiqueta Terror').props.onPress();});assert.equal(value,'Suspense','tocar de novo tira');
});
test('formulario: respeita o limite do tipo e avisa em vez de salvar algo que o servidor recusaria',()=>{
  let value='Ficção científica, Terror';let tree;
  act(()=>{tree=create(React.createElement(TP.TagPicker,{label:'Gênero literário',value,options:[],maxLength:30,onChange:v=>{value=v;}}));});
  const input=tree.root.find(n=>n.type==='TextInput');act(()=>{input.props.onChangeText('Suspense psicológico');});act(()=>{input.props.onSubmitEditing();});
  assert.equal(value,'Ficção científica, Terror','nao passou do limite');
  assert.ok(tree.root.findAll(n=>n.type==='Text'&&typeof n.props.children==='string'&&n.props.children.includes('Limite de etiquetas')).length>0);
});

test('Editar etiquetas: juntar "Horror" em "Terror" e apagar mudam TODOS os itens do tipo (inclusive fora da tela), sem apagar itens',async()=>{
  const recs=[...Array.from({length:100},(_,i)=>film('a'+i,i<3?'Horror':'Comédia')),film('b1','Terror, Horror'),film('b2','Suspense')];
  const saved=[];let alerts=[];
  const api={entities:async(kind,q,offset)=>({items:recs.slice(offset,offset+100)}),saveEntity:async e=>{saved.push(JSON.parse(JSON.stringify(e)));const i=recs.findIndex(r=>r.id===e.id);recs[i]={...e};return e;}};
  const M=load('src/components/LibraryTagManager.tsx',{...deps,'./UI':UI,'./Sheet':{Sheet:p=>React.createElement('Sheet',p,p.children)},'../lib/app-alert':{appAlert:(t,b,btns)=>{alerts.push(t);const go=(btns||[]).find(x=>x.style!=='cancel');go&&go.onPress&&go.onPress();}},'../lib/chat-model':{errorText:e=>String(e&&e.message||e)}});
  let changed=0,tree;
  await act(async()=>{tree=create(React.createElement(M.LibraryTagManager,{api,kind:'film',fieldKey:'genre',facet:'Etiquetas · Gênero',onClose:()=>{},onChanged:()=>{changed++;}}));await new Promise(r=>setTimeout(r,20));});
  assert.ok(has(tree,'Renomear Horror'),'lista as etiquetas de todos os itens (2 paginas)');
  act(()=>{byLabel(tree,'Renomear Horror').props.onPress();});
  const input=tree.root.find(n=>n.type==='TextInput');act(()=>{input.props.onChangeText('terror');});
  await act(async()=>{tree.root.find(n=>n.type==='Button'&&n.props.title==='Salvar nome').props.onPress();await new Promise(r=>setTimeout(r,30));});
  assert.equal(alerts[0],'Juntar etiquetas?','pergunta antes de juntar');
  assert.equal(saved.length,4,'so os 4 itens que tinham Horror (3 + o da 2a pagina)');
  assert.equal(recs.find(r=>r.id==='b1').data.genre,'Terror','juntou sem duplicar');assert.equal(recs.find(r=>r.id==='a0').data.genre,'Terror');
  assert.equal(recs.length,102,'nenhum item apagado');assert.ok(changed>=1);
  saved.length=0;alerts=[];
  await act(async()=>{byLabel(tree,'Apagar Suspense').props.onPress();await new Promise(r=>setTimeout(r,30));});
  assert.equal(saved.length,1);assert.equal(recs.find(r=>r.id==='b2').data.genre,'','etiqueta saiu');assert.equal(recs.length,102);
});

test('Capsulas: aba "Todas", apagar de verdade (sai da lista e os lembretes seguem a lista), sem "rotina" nos textos',()=>{
  const s=read('src/screens/Capsules.tsx'),st=read('src/lib/capsule-store.ts');
  // 0.3.270: o app virou "Rotina" (pedido do Pedro) e a aba "Todas" virou "Tudo" (capsulas, cuidados, habitos e treino)
  assert.ok(s.includes("{value:'routines',label:'Tudo'}"));assert.ok(s.includes('title="Rotina"'));
  assert.ok(s.includes('title="Apagar cápsula"')&&s.includes('capsuleStore(api).remove(id)'));assert.ok(!s.includes('Arquivar rotina'));
  assert.ok(s.includes('As doses já marcadas continuam no Histórico.'));
  assert.ok(st.includes('async remove(id:string){await this.api.deleteEntity(id);')&&st.includes('plans:this.snapshot.plans.filter(p=>p.id!==id)'),'sai da lista -> a reconciliacao cancela os lembretes');
});
test('Apps: sem Estudos e sem Projetos e rotina; Todos os registros com legenda nova; Biblioteca com etiquetas a vista e para tocar',()=>{
  const w=read('src/screens/Workspace.tsx');
  assert.ok(!w.includes("{id:'study',")&&!w.includes("{id:'flow',")&&!w.includes('Projetos e rotina'));
  assert.ok(w.includes("caption:'Tudo o que você já registrou'"));
  assert.equal((w.match(/<TagPicker /g)||[]).length,3,'os 3 lugares do formulario');assert.ok(!w.includes('creatable label={presentation.facet}'),'sem a escolha unica antiga');
  assert.ok(w.includes('accessibilityLabel="Editar etiquetas"')&&w.includes('<LibraryTagManager api={api} kind={kind} fieldKey={presentation.key}'));
  assert.ok(w.includes("onPress={()=>setGenre(o.all||on?'':o.label)}"),'tocar filtra; tocar de novo limpa');
});
