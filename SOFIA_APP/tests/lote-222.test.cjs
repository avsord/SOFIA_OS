'use strict';
// 0.3.222: segurar app quase na hora e destaque com cor; extrato do saldo como extrato de banco; cartao gravado de
// primeira; fatura pelo fechamento e Paguei na conta do cartao; "Usar conta existente"; regra de e-mail e emoji.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const f=require('./load-ts.cjs')('src/lib/finance.ts');
const E=(kind,id,data)=>({id,kind,title:id,state:'active',content:'',area:'Pessoal',privacy:'private',tags:[],revision:1,data});
const tx=(id,data)=>f.toTx(E('fin_tx',id,{paid:true,recurrence:'none',account_id:'a1',...data}));

test('extrato do saldo: ajuste entra como linha nova na hora, o ponto de partida e as linhas de antes nao mudam',()=>{
  const sal=tx('Salario',{kind:'income',amount:7821,date:'2026-10-05'}),luz=tx('Luz',{kind:'expense',amount:100,date:'2026-10-08'});
  const item=t=>({id:t.id,date:t.date,desc:t.desc,delta:t.kind==='income'?t.amount:-t.amount,note:'',tx:t});
  // ajuste de -821,51 feito hoje: a base atual ja inclui o ajuste
  const change={at:'2026-10-21T17:21:00.000Z',before:1100.96,after:279.45,lines:[{title:'Saldo inicial / ajuste do saldo',date:'2026-10-21',delta:-821.51,why:'inicial'}]};
  const base=-5760.06;
  const total=Math.round((base+7821-100)*100)/100;
  const l=f.saldoLedger([item(sal),item(luz)],base,0,[change],total);
  assert.equal(l.start,Math.round((base+821.51)*100)/100,'ponto de partida como era antes do ajuste');
  assert.deepEqual(l.rows.map(r=>[r.desc,r.delta]),[['Salario',7821],['Luz',-100],['Ajuste do saldo',-821.51]],'uma linha so para o ajuste, depois dos itens de antes');
  assert.equal(l.rows[1].run,Math.round((l.start+7721)*100)/100,'o saldo depois da luz continua o de antes do ajuste');
  assert.equal(l.rows[2].run,total,'e o ajuste mostra quanto ficou');
  assert.ok(!l.rows.some(r=>r.id==='gap'),'tudo explicado');
});

test('extrato do saldo: item que saiu do app fica na data dele e a saida entra como linha nova; valor mudado idem',()=>{
  const sal=tx('Salario',{kind:'income',amount:1000,date:'2026-10-05'}),ifood=tx('iFood',{kind:'expense',amount:80,date:'2026-10-12'});
  const item=t=>({id:t.id,date:t.date,desc:t.desc,delta:t.kind==='income'?t.amount:-t.amount,note:'',tx:t});
  const changes=[{at:'2026-10-21T12:00:00.000Z',before:0,after:0,lines:[{id:'Mercado',title:'Mercado',date:'2026-10-10',delta:200,why:'saiu'},{id:'iFood',title:'iFood',date:'2026-10-12',delta:-30,why:'mudou'}]}];
  const total=1000-80;
  const l=f.saldoLedger([item(sal),item(ifood)],0,0,changes,total);
  const rows=l.rows.map(r=>[r.date,r.desc,r.delta,r.change]);
  assert.deepEqual(rows.slice(0,3),[['2026-10-05','Salario',1000,false],['2026-10-10','Mercado',-200,false],['2026-10-12','iFood',-50,false]],'o passado como era (mercado ainda la, iFood com o valor antigo)');
  assert.ok(rows.slice(3).every(r=>r[3]&&r[0]==='2026-10-21'),'as mudancas no dia em que aconteceram');
  assert.equal(l.rows.at(-1).run,total);
});

test('fatura pelo fechamento (fecha 9, vence 15): em 21/10 outubro esta fechada e a compra de hoje cai em novembro, aberta',()=>{
  const card=f.toCard(E('fin_card','Inter',{limit:5000,closing_day:9,due_day:15,account_id:'a1'}));
  const c1=tx('compra',{kind:'expense',amount:300,date:'2026-10-21',card_id:'Inter',paid:false}),c0=tx('antiga',{kind:'expense',amount:50,date:'2026-10-02',card_id:'Inter',paid:false});
  const inv=f.cardInvoices(card,[c0,c1],'2026-10-21'),by=m=>inv.find(i=>i.month===m);
  assert.equal(by('2026-10').status,'fechada','0.3.223: outubro fechou dia 9 - aparece FECHADA ate ser paga');
  assert.equal(by('2026-11').status,'aberta');assert.equal(by('2026-11').total,300,'a compra de hoje ja consta em novembro');
  assert.equal(f.invoiceDue(card,'2026-11'),'2026-11-15');
  const paid=[c0,c1,tx('pg',{kind:'card_payment',amount:50,date:'2026-10-14',card_id:'Inter',invoice_month:'2026-10'})];
  assert.equal(f.cardInvoices(card,paid,'2026-10-21').find(i=>i.month==='2026-10').status,'paga');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("' · cobrado na fatura de ' + monthLabel(txInvoiceMonth(card, t))"),'historico avisa em qual fatura sera cobrado');
  assert.ok(s.includes('function askPayInvoice(card: Card, t: Tx)')&&s.includes('onPress={() => askPayInvoice(cardOf, due.tx!)}'),'Paguei na conta do cartao paga a fatura toda');
  assert.ok(s.includes('>Usar conta existente</Text>')&&!s.includes('Usar uma de Contas'));
});

test('cartao na conta: grava de primeira (confere depois de salvar) e fica no rascunho',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("const form={name,amount,date,category,repeat,flow,before,parcels,parcelNow,payCard};"));
  assert.ok(s.includes("if(String(saved?.data?.card_id||'')!==String(cardFor||'')){saved=await api.saveEntity("));
});

test('apps: segurar seleciona quase na hora; segurar e soltar sem arrastar abre o destaque com cor',()=>{
  const g=read('src/components/AppGrid.tsx'),w=read('src/screens/Workspace.tsx');
  assert.ok(g.includes('HOLD=170;'));
  assert.ok(g.includes('if(!d.dragged&&!terminated)cb.current.onMenu?.(d.id);'));
  assert.ok(w.includes("const APP_HIGHLIGHT_KEY='sofia-app-highlights-v1';")&&w.includes('backgroundColor:highlights[m.id]')&&w.includes('Tirar o destaque'));
});

test('e-mail: emoji por e-mail (estrela ou outro)',()=>{
  const m=read('src/screens/Mail.tsx');
  // 0.3.268: cada e-mail continua com a sua marcacao, agora desenhada como icone de traco (pedido do Pedro)
  assert.ok(m.includes("const HIT_EMOJIS = ['⭐'")&&m.includes('{hitEmoji(h, rules) ? <MarkIcon value={hitEmoji(h, rules)} /> : null}')&&m.includes('Marcação deste e-mail'));
});
