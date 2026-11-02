'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');
const j=x=>JSON.parse(JSON.stringify(x));
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('0.3.256: Controle de gastos voltou a ser o do mes (inicio do mes x agora)',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(!s.includes('cycleControl')&&!read('src/lib/finance.ts').includes('export function cycleControl'),'sem o calculo desde o salario');
  assert.ok(s.includes('<SpendCapCard ')); // 0.3.310: o Controle virou teto do mes x despesas fora as contas
});

test('0.3.256: despesa "Vai ser reembolsada" liga com Devolucoes e mostra o estado',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('testID="tx-refund-mark"')&&s.includes('testID="tx-refund-status"'));
  assert.ok(s.includes('...(expense && !refund ? {expense_id: expense.id} : {})'),'a devolucao guarda a despesa');
  assert.ok(s.includes("' · ↩️ reembolso pendente'"),'linha do Historico');
  const {CATALOG}=require('../../src/core/catalog.js');assert.ok(CATALOG.fin_refund.fields.some(f=>f.key==='expense_id'));
});

test('0.3.256: Paginas nao sambam - esqueleto ate a ordem do aparelho estar pronta',()=>{
  const p=read('src/screens/Pages.tsx');
  assert.ok(p.includes("roots={orderReady?children.get('')||[]:[]}")&&p.includes('(!orderReady&&pages.length>0)?<View testID="pages-loading-placeholder"'));
  assert.ok(p.includes('api.pageOrderApply(cachedPageRows(api)||[])'));
  const h=load('src/lib/page-hierarchy.ts'),m=load('src/lib/legacy-md.ts',{'./page-hierarchy':h,'./page-order':load('src/lib/page-order.ts',{'./page-hierarchy':h})});
  const disk={getItem:async()=>JSON.stringify({order:{b:1024,a:2048},dismissed:[]}),setItem:async()=>{}};
  const md=new m.LegacyMdAdapter(async()=>{throw Object.assign(Error('x'),{status:404});},disk,'u');
  const items=[{id:'a',kind:'user_page',data:{}},{id:'b',kind:'user_page',data:{}}];
  assert.equal(md.orderLoaded,false);assert.deepEqual(j(md.decorateNow(items)),j(items),'antes de ler o disco nao mexe');
  return md.loadOrder().then(()=>{assert.equal(md.orderLoaded,true);assert.deepEqual(j(md.decorateNow(items).map(x=>x.data.sort_order)),[2048,1024]);});
});

test('0.3.256: criar e editar evento - Tornar tarefa e Buscar tarefa (existente ou nova)',()=>{
  const t=load('src/components/TaskLinkPanel.tsx',{react:{useEffect(){},useMemo:f=>f(),useState:v=>[typeof v==='function'?v():v,()=>{}]},'react-native':{},'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null},'../lib/theme':{useTheme:()=>({})},'./UI':{forms:{}}});
  const tasks=[{id:'1',title:'Comprar tinta',state:'todo'},{id:'2',title:'Ligar pro banco',state:'done'},{id:'3',title:'Tinta da parede',state:'scheduled'}];
  assert.deepEqual(j(t.searchTasks(tasks,'tinta').map(x=>x.id)),['3','1'],'comeca com o texto vem primeiro');
  assert.deepEqual(j(t.searchTasks(tasks,'banco')),[],'concluida nao aparece');
  assert.deepEqual(j(t.searchTasks(tasks,'')),[]);
  const w=read('src/screens/Workspace.tsx');
  assert.ok(w.includes("{item.kind==='commitment'?<TaskLinkPanel api={api} value={taskLink}"),'editar e criar evento na Agenda');
  assert.ok(w.includes("await saveEventAsTask(api,{title,startIso:packed.start_at,description:content,priority:packed.priority_level,area,task:taskLink.task});if(item.id)await api.deleteEntity(item.id);"),'evento que vira tarefa sai dos compromissos');
  assert.ok(read('src/components/HomeCommitmentEditor.tsx').includes('<TaskLinkPanel api={api} value={taskLink}'),'+ do Inicio igual');
  assert.ok(!read('src/screens/Agenda.tsx').includes("label:'Evento tarefa (com check)'"),'sem o tipo separado');
});
