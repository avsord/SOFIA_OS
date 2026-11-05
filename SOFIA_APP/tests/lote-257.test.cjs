'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('0.3.257: Nao mexer no saldo - fica no Historico mas o Saldo nao muda',()=>{
  const f=load('src/lib/finance.ts');
  const tx=(id,kind,amount,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date:'2026-10-20',account_id:'a1',paid:true,category:'X',recurrence:'none',...extra}});
  const acc={id:'a1',name:'Conta',initial:100,include:true,archived:false};
  assert.equal(f.accountBalance(acc,[tx('m','expense',30),tx('r','income',50,{no_balance:true}),tx('g','expense',20,{no_balance:true})]),70,'so a despesa normal mexeu no saldo');
  const s=read('src/screens/Finance.tsx');assert.ok(s.includes('testID="tx-no-balance"')&&s.includes("' · não mexe no saldo'"));
  const {CATALOG}=require('../../src/core/catalog.js');assert.ok(CATALOG.fin_tx.fields.some(x=>x.key==='no_balance'));
  assert.ok(read('../src/core/app-bridge.js').includes("t.data.paid!==false&&!t.data.no_balance"),'a Sofia no chat tambem');
});

test('0.3.257: editar item - Vai ser reembolsada entre as opcoes de baixo; cabecalho roxo sempre por cima',()=>{
  const s=read('src/screens/Finance.tsx'),i=s.indexOf('function TxEditor('),e=s.slice(i,s.indexOf('\nfunction ',i+20));
  assert.ok(e.indexOf('testID="tx-refund-mark"')>e.indexOf('testID="tx-no-balance"'),'la embaixo, junto das opcoes');
  assert.ok(e.includes("gap: 12, zIndex: 2}}>")&&e.includes("style={{flex: 1, overflow: 'hidden', zIndex: 1}} overScrollMode=\"never\""));
});

test('0.3.257: Inicio - + menor na altura do titulo; criar ao segurar sem piscar; Tarefas backlog',()=>{
  assert.ok(read('src/components/DashboardWidgets.tsx').includes("style={{width:22,height:22,borderRadius:11,"));
  assert.ok(read('src/components/HomeCommitmentEditor.tsx').includes('<MotionModal visible transparent animationType="fade"'));
  assert.ok(read('src/screens/Home.tsx').includes("{id:'tasks',title:'Tarefas',")&&read('src/lib/desktop.ts').includes("title:'Tarefas'"));
});

test('0.3.257: E-mails - Entrar com Google por conta e seletor salvo',()=>{
  const m=read('src/screens/Mail.tsx');
  assert.ok(m.includes("api.mailGoogleConnect(saved.id, Platform.OS !== 'web')")&&m.includes('testID="mail-own-google"'));
  assert.ok(m.includes("const SELECTION_KEY = 'sofia.mail.selection.v1';")&&m.includes('AsyncStorage.setItem(SELECTION_KEY'));
});

test('0.3.257: Area sem nomes de fabrica - so as criadas, sempre com criar nova',()=>{
  const api=read('../src/core/api45.js');assert.ok(!api.includes('...AREAS,')&&api.includes("areas:store.userAreas()")); // 05/11/2026: so as areas criadas pela pessoa
  assert.ok(read('src/screens/Workspace.tsx').includes('<Choice label="Área" creatable value={area}'));
  assert.ok(!read('src/components/HomeCommitmentEditor.tsx').includes("['Pessoal',...areas]")&&!read('src/components/HomeTaskDetails.tsx').includes("new Set(['Pessoal',...areas])"));
});
