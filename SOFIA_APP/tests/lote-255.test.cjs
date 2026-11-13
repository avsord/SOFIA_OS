'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');
const j=x=>JSON.parse(JSON.stringify(x));
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('0.3.255: Devolucoes a receber nao mexem no Saldo; "Recebi" vira receita paga de hoje',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("refunds: g('fin_refund')")&&s.includes("'fin_statement', 'fin_refund'] as const"),'carregadas a parte');
  assert.ok(s.includes("saveEntity(api, 'fin_tx', r.title, {kind: 'income', amount: r.amount, date: todayISO(), category: 'Reembolso', account_id: acc, paid: true"),'recebi = receita paga');
  const {CATALOG}=require('../../src/core/catalog.js');assert.deepEqual(CATALOG.fin_refund.states,['pending','received','archived']);
  assert.ok(read('../src/channels/mobile.js').includes("'fin_statement', 'fin_refund']"),'servidor manda no pacote de Financas');
});

test('0.3.255: tarefa da agenda nao ticada passa para o dia seguinte no mesmo horario; ticada nao anda',()=>{
  const r=load('src/lib/task-rollover.ts',{'./dashboard':load('src/lib/dashboard.ts')});
  const now=new Date(2026,9,28,0,0,30),at=(d,h,m)=>new Date(2026,9,d,h,m).toISOString();
  const list=r.overdueScheduled([{id:'a',title:'A',state:'scheduled',due_at:at(27,14,30),revision:1},{id:'b',title:'B',state:'done',due_at:at(27,9,0),revision:1},{id:'c',title:'C',state:'todo',due_at:at(26,9,0),revision:1},{id:'d',title:'D',state:'scheduled',due_at:at(28,8,0),revision:1}],now);
  assert.deepEqual(j(list.map(x=>x.task.id)),['a']);
  const d=new Date(list[0].due);assert.deepEqual(j([d.getDate(),d.getHours(),d.getMinutes()]),[28,14,30]);
  assert.ok(r.msToMidnight(new Date(2026,9,27,23,59,0))<=61000);
});

test('0.3.255: agenda do Inicio nao repete a tarefa e mostra a concluida riscada no dia',()=>{
  const d=load('src/lib/dashboard.ts');const due=new Date(Date.now()+3600e3).toISOString();
  const recs=d.dayRecords([{id:'task:t1',kind:'task',title:'T1',state:'todo',revision:1,data:{start_at:due,task_id:'t1'}},{id:'task:t2',kind:'task',title:'T2',state:'done',revision:2,data:{start_at:due,task_id:'t2'}}],[{id:'t1',title:'T1',state:'todo',due_at:due,revision:1}]);
  assert.deepEqual(j(recs.map(x=>x.id).sort()),['t1','task:t2']);assert.ok(recs.every(x=>x.isTask));
  assert.equal(recs.find(x=>x.id==='task:t2').original.state,'done');
  assert.ok(read('src/lib/agenda-recurrence.ts').includes("&&!(item.kind==='task'&&item.state==='done')&&!(keepDone&&['done','completed'].includes(item.state)))return [];"));
  assert.ok(read('src/components/DashboardWidgets.tsx').includes("textDecorationLine:done?'line-through':'none'"));
});

test('0.3.255: calendario aberto rola ate caber na tela',()=>{
  const m=load('src/components/RevealScroll.tsx',{react:{createContext:()=>({}),forwardRef:f=>f,useCallback:f=>f,useContext:()=>null,useImperativeHandle(){},useRef:()=>({current:null})},'react-native':{},'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null}});
  assert.equal(m.revealDelta({y:100,h:600},{y:500,h:300}),116,'desce o que passou do fim + margem');
  assert.equal(m.revealDelta({y:100,h:600},{y:200,h:100}),0,'ja cabe');
  assert.equal(m.revealDelta({y:100,h:400},{y:300,h:500}),184,'maior que o visor: alinha o topo');
  assert.ok(read('src/components/DateTimeField.tsx').includes('reveal(panel.current)'));
});

test('0.3.255: Notas sem categorias prontas (as da pessoa viram etiquetas); Biblioteca so com Filmes, Livros e Receitas',()=>{
  const n=load('src/lib/note-categories.ts',{'./library-filters':load('src/lib/library-filters.ts')});
  assert.deepEqual(j(n.noteCategories({kind:'annotation',tags:['cat:ideia','x']})),['ideia']);
  assert.deepEqual(j(n.noteCategories({kind:'idea',tags:[]})),['Ideia'],'nota antiga do tipo Ideia nao perde a categoria');
  assert.deepEqual(j(n.noteCategories({kind:'annotation',tags:[]})),[]);
  assert.deepEqual(j(n.withNoteCategories(['x','cat:velha'],['Ideia','ideia ','Roteiro'])),['x','cat:Ideia','cat:Roteiro']);
  assert.deepEqual(j(n.noteCategoryOptions([{kind:'annotation',tags:['cat:Ideia']},{kind:'idea',tags:[]},{kind:'annotation',tags:['cat:Roteiro']}]).map(o=>[o.label,o.count])),[['Ideia',2],['Roteiro',1]]);
  assert.deepEqual(j([...n.LIBRARY_BASE_KINDS]),['film','reading','recipe']);
  const w=read('src/screens/Workspace.tsx');assert.ok(w.includes('{pickerKinds.map(k=>')&&w.includes("module==='knowledge'?setEditing({kind:definitions.annotation?'annotation'"));
});

test('0.3.255: Inicio abre o compromisso direto; + na agenda; capa reposiciona; ordem das paginas guardada; olho salvo',()=>{
  const h=read('src/screens/Home.tsx');assert.ok(h.includes('load={loadEntityEditor}')&&h.includes('onToggleTask={toggleAgendaTask}'));
  assert.ok(read('src/components/DashboardWidgets.tsx').includes('testID="home-agenda-create"'));
  const pg=read('src/screens/Pages.tsx');assert.ok(pg.includes('testID="page-cover-reposition"')&&pg.includes('cover_position:value'));
  assert.ok(read('../src/core/catalog.js').includes('"key":"cover_position"'));
  assert.ok(read('src/lib/page-editor.ts').includes("'cover_position'"));
  assert.ok(read('src/lib/api.ts').includes('this.snapshots.remember(path,decorated)'),'lista de paginas guardada ja na ordem do aparelho');
  assert.ok(read('src/lib/startup-snapshot.ts').includes('GOAL_WIDGET_PATH,VALUES_MASK_PATH].includes(path)'));
  assert.ok(read('src/screens/Finance.tsx').includes('useValuesHidden(api)'));
  assert.ok(read('src/screens/Workspace.tsx').includes('<ScreenTitle title="Tarefas"')&&read('src/screens/Workspace.tsx').includes('<TaskToAgendaSheet api={api} task={toAgenda}'));
});

test('0.3.255: build do APK nao cai mais no teste de E-mails (empate de contas criadas no mesmo milissegundo)',()=>{
  const s=read('../src/services/mail-watch.js');
  assert.ok(s.includes('|| y.i - x.i)[0].a;'),'no empate vale a conta criada primeiro, sem sorteio');
});
