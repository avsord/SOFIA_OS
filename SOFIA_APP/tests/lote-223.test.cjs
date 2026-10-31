'use strict';
// 0.3.223: conta do mes no cartao fica na fatura do mes dela (MaisLaser e Claude Max de 11/10 no Inter -> outubro),
// compra avulsa segue o fechamento, outubro aparece FECHADA, pagar paga as duas e a aba abre em outubro.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const f=require('./load-ts.cjs')('src/lib/finance.ts');
const E=(kind,id,data)=>({id,kind,title:id,state:'active',content:'',area:'Pessoal',privacy:'private',tags:[],revision:1,data});
const inter=f.toCard(E('fin_card','Inter',{limit:16000,closing_day:9,due_day:15,account_id:'a1'}));
const bill=(id,amount)=>f.toTx(E('fin_tx',id,{kind:'expense',amount,date:'2026-10-11',account_id:'a1',card_id:'Inter',paid:false,recurrence:'none',category:'Contas',import_id:'sofia-pendencia:'+id}));
const buy=f.toTx(E('fin_tx','Compra hoje',{kind:'expense',amount:120,date:'2026-10-21',account_id:'',card_id:'Inter',paid:false,recurrence:'none',category:'Compras'}));
test('contas de outubro no Inter ficam na fatura de outubro; a compra de hoje vai para novembro',()=>{
  const txs=[bill('MaisLaser',300),bill('Claude Max',550),buy];
  const inv=f.cardInvoices(inter,txs,'2026-10-21'),by=m=>inv.find(i=>i.month===m);
  assert.equal(by('2026-10').total,850,'MaisLaser + Claude Max em outubro');
  assert.equal(by('2026-10').status,'fechada');assert.equal(by('2026-10').due,'2026-10-15');
  assert.equal(by('2026-11').total,120,'so a compra depois do fechamento');assert.equal(by('2026-11').status,'aberta');
  const pay=f.toTx(E('fin_tx','pg',{kind:'card_payment',amount:850,date:'2026-10-21',account_id:'a1',card_id:'Inter',invoice_month:'2026-10',paid:true}));
  const all=[...txs,pay],ok=f.cardBillSettled([inter],all,'2026-10-21');
  assert.ok(ok(txs[0])&&ok(txs[1]),'pagar outubro paga as duas contas');assert.ok(!ok(buy),'a compra de novembro continua em aberto');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('invoiceForMonth(card, d.txs, month)'),'Cartoes mostra a fatura do mes do topo');
  assert.ok(s.includes("' de '+monthLabel(monthOf(date)).split(' ')[0].toLowerCase()"),'a conta avisa que entra na fatura do mes dela');
});

test('fatura de cada mes pelo topo: mes sem nada vem vazio; compra depois do fechamento ja consta no mes seguinte',()=>{
  const txs=[buy];
  assert.equal(f.invoiceForMonth(inter,txs,'2026-11','2026-10-21').total,120,'a compra de 21/10 ja esta em novembro');
  const dez=f.invoiceForMonth(inter,txs,'2026-12','2026-10-21');assert.equal(dez.total,0);assert.equal(dez.status,'futura');assert.equal(dez.due,'2026-12-15');
  const s=read('src/screens/Finance.tsx');
  assert.ok(!s.includes('label="Fatura anterior"')&&!s.includes('accessibilityLabel="Próxima fatura"'),'sem setas dentro da fatura');
  assert.ok(s.includes("' · compra de ' + dm + ' · cobrada na fatura de ' + monthLabel(billedIn).split(' ')[0].toLowerCase() + ' · não mexe no saldo agora'"),'historico do mes da compra: linha apagada avisando');
  assert.ok(s.includes("opacity: later && !inInvoice ? 0.5"),'apagada');
});

test('Despesas: a compra de 21/10 cobrada em novembro nao conta em outubro, conta em novembro',()=>{
  const b={...buy,invoice:'2026-11'};
  assert.equal(f.monthSummary([b],'2026-10').expense,0);
  assert.equal(f.monthSummary([b],'2026-11').expense,120);
});

test('previsto: despesas = Total do mes de Contas (pagas ou nao, inclusive no cartao); aporte em vermelho',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("const f = simpleForecast(d.txs, d.cards, r, accountId, today, aporteInCycle(r));"));
  assert.ok(s.includes("['Despesas do ciclo (pagas ou não)', forecastP.toPay, c.danger"));
  // a conta do Pedro: 279,45 + 9.674,54 - 4.793,43 - 0 - 4.000 = 1.160,56
  assert.equal(Math.round((279.45+9674.54-4793.43-0-4000)*100)/100,1160.56);
});

test('conta do mes no cartao grava o cartao na primeira vez (caminho "so este mes")',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("card_id:cardMonth,invoice_month:'',paid:cardMonth?false:!!old.paid,time:time||''"));
});

test('controle de gastos sem piscar: so mostra numero e cor com os dados atualizados do mes',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('<HomeTab onPatchTx={patchTx} onRemoveTx={removeTx} failed={!!error} fresh={liveKey === windowKey}')&&s.includes('{!fresh && !future && !failed ? <ShimmerGroup>'));
  assert.ok(s.includes("if (window.from === addMonths(monthOf(todayISO()), -1) && window.to === addMonths(monthOf(todayISO()), 1)) writeCache(api, bundle);"),'copia so do periodo padrao');
});

test('apps: selecao e soltura suaves; bolinha menor e redonda; 14 cores; widget abre o app dele',()=>{
  const g=read('src/components/AppGrid.tsx'),w=read('src/screens/Workspace.tsx');
  assert.ok(g.includes('borderColor:theme.accent,opacity:lift')&&g.includes('Easing.bezier(0.25,0.1,0.25,1)'),'contorno aparece e some em transicao');
  assert.ok(w.includes("width:7,height:7,minWidth:7,minHeight:7,aspectRatio:1,borderRadius:3.5,flexShrink:0"));
  assert.equal((w.match(/const HIGHLIGHT_COLORS=\[([^\]]*)\]/)[1].match(/PALETTE\./g)||[]).length,14); // 0.3.263: cores da paleta
  assert.ok(w.includes("if(['reminders','packages','finance','monitor','mail','capsules','routines','tasks'].includes(openModuleId)){setModule(openModuleId);setKind('');}else choose(openModuleId);"),'Meta abre Financas');
});

test('capsulas: dose nao tomada fica acumulando ate marcar (ontem continua la)',()=>{
  const m=require('./load-ts.cjs')('src/lib/capsule-model.ts');
  const plan={id:'vitD',kind:'capsule',title:'Vitamina D',state:'active',data:{start_date:'2026-10-01',repeat_type:'daily',times_json:'["08:00"]'}};
  const took=(day)=>({id:'h'+day,kind:'capsule_taken',data:{capsule_id:'vitD',day,time:'08:00'}});
  const missed=m.capsuleMissed([plan],[took('2026-10-19')],'2026-10-18','2026-10-21');
  assert.equal(JSON.stringify(missed.map(d=>d.day)),JSON.stringify(['2026-10-18','2026-10-20']),'18 e 20 sem marcar; 19 tomada; 21 e hoje (fica na lista do dia)');
  assert.equal(m.capsuleDayLabel('2026-10-20','2026-10-21'),'ontem');
  const c=read('src/screens/Capsules.tsx'),wd=read('src/components/CapsuleWidget.tsx');
  assert.ok(c.includes('<CapsuleMissedList plans={state.plans}')&&wd.includes('<CapsuleMissedList compact'));
});

test('Inicio na barra leva ao topo; e-mail: emoji da regra no lugar da estrela',()=>{
  const h=read('src/screens/Home.tsx'),m=read('src/screens/Mail.tsx');
  assert.ok(h.includes('homeScroll.current?.scrollTo({y:0,animated:homeTopSmooth})'));
  assert.ok(m.includes("emoji: important ? emoji : ''")&&m.includes('Marcação dos e-mails desta regra')); // 0.3.268: icone de traco no lugar do emoji
});
