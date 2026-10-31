'use strict';
// 0.3.221: saldo que subia sozinho, contas do cartao pagas pela fatura, fatura do mes do calendario,
// toque que nao se perde, volta de Financas sem tela cinza e app que assenta ao soltar.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const f=require('./load-ts.cjs')('src/lib/finance.ts');
const E=(kind,id,data,state='active')=>({id,kind,title:id,state,content:'',area:'Pessoal',privacy:'private',tags:[],revision:1,data});
const card=f.toCard(E('fin_card','Visa',{limit:3000,closing_day:20,due_day:27,account_id:'a1'}));
const tx=(id,data)=>f.toTx(E('fin_tx',id,{paid:true,recurrence:'none',account_id:'a1',...data}));

test('fatura: a de outubro paga, a compra depois do fechamento vai para novembro',()=>{
  const txs=[tx('compra-out',{kind:'expense',amount:100,date:'2026-10-10',card_id:'Visa',paid:false}),tx('compra-depois',{kind:'expense',amount:50,date:'2026-10-21',card_id:'Visa',paid:false}),
    tx('fatura-out',{kind:'card_payment',amount:100,date:'2026-10-15',card_id:'Visa',invoice_month:'2026-10'})];
  const inv=m=>f.cardInvoices(card,txs,'2026-10-21').find(i=>i.month===m);
  assert.equal(inv('2026-10').status,'paga');
  assert.equal(inv('2026-11').status,'aberta','0.3.222: depois do fechamento (dia 20) a compra de hoje entra na de novembro, que e a aberta');
  assert.equal(f.invoiceMonth(card,'2026-10-21'),'2026-11','a compra continua indo para a fatura certa pelo fechamento');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('invoiceForMonth(card, d.txs, month)'),'0.3.223: Cartoes mostra a fatura do mes do topo');
});

test('pagar a fatura paga todas as contas marcadas com o cartao; desfazer volta a abrir',()=>{
  const bill=(id,date,extra={})=>tx(id,{kind:'expense',amount:40,date,card_id:'Visa',paid:false,category:'Contas',import_id:'sofia-pendencia:'+id,...extra});
  const bills=[bill('spotify','2026-10-05',{recurrence:'monthly'}),bill('academia','2026-10-08')];
  const pay=tx('fatura',{kind:'card_payment',amount:80,date:'2026-10-21',card_id:'Visa',invoice_month:'2026-10'});
  const open=f.monthDues(bills,'a1','2026-10','2026-10-21',f.cardBillSettled([card],bills,'2026-10-21'));
  assert.ok(open.every(d=>!d.paid),'antes de pagar: em aberto');
  const all=[...bills,pay];
  const paid=f.monthDues(all,'a1','2026-10','2026-10-21',f.cardBillSettled([card],all,'2026-10-21'));
  assert.ok(paid.every(d=>d.paid),'depois de pagar a fatura: todas pagas');
  const fixed=f.fixedSummary(all,'a1',{start:'2026-10-01',end:'2026-10-31'},'expense',f.cardBillSettled([card],all,'2026-10-21'));
  assert.equal(fixed.card,0,'nada fica "no cartao" esperando');
  const nov=f.monthDues(all,'a1','2026-11','2026-10-21',f.cardBillSettled([card],all,'2026-10-21'));
  assert.ok(nov.length&&nov.every(d=>!d.paid),'a repeticao de novembro so se paga com a fatura de novembro');
  assert.ok(bills.every(t=>f.effect(t,'a1')===0)&&f.effect(pay,'a1')===-80,'o Saldo so desconta a fatura, uma vez');
});

test('mudancas no Saldo: o que entrou, saiu, deixou de estar pago e o ponto de partida aparecem',()=>{
  const acc=Object.assign(f.toAccount(E('fin_account','a1',{initial_balance:'1000',include_total:true})),{carry:200});
  acc.initial+=200;
  const a=tx('mercado',{kind:'expense',amount:100,date:'2026-10-10'}),b=tx('salario',{kind:'income',amount:500,date:'2026-10-05'}),c=tx('luz',{kind:'expense',amount:60,date:'2026-10-12'});
  const s1=f.saldoSnapshot(acc,[a,b,c]);
  assert.equal(s1.total,1540);assert.equal(s1.base,1000);assert.equal(s1.carry,200);
  const unpaidLuz={...c,paid:false};
  const s2=f.saldoSnapshot({...acc,initial:acc.initial+50},[b,unpaidLuz,tx('pix',{kind:'income',amount:30,date:'2026-10-20'})]);
  const ch=f.saldoDiff(s1,s2,'2026-10-21T15:00:00.000Z',new Set(['salario','luz','pix']));
  assert.equal(ch.after-ch.before,s2.total-s1.total);
  const why=Object.fromEntries(ch.lines.map(l=>[l.title,[l.why,l.delta]]));
  assert.deepEqual(why['mercado'],['saiu',100],'despesa apagada: o Saldo sobe e mostra qual foi');
  assert.deepEqual(why['luz'],['desmarcado',60],'conta que voltou a "a pagar"');
  assert.deepEqual(why['pix'],['novo',30]);
  assert.deepEqual(why['Saldo inicial / ajuste do saldo'],['inicial',50]);
  assert.equal(Math.round(ch.lines.reduce((s,l)=>s+l.delta,0)*100)/100,Math.round((ch.after-ch.before)*100)/100,'as linhas explicam toda a diferenca');
  assert.equal(f.saldoDiff(s1,f.saldoSnapshot(acc,[a,b,c]),'x'),null,'sem mudanca, nada registrado');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('recordSaldo(api, fresh)'),'registro');
  assert.ok(s.includes("kind === 'transfer' && (ids.has(t.accountId) !== ids.has(t.toAccountId))"),'transferencias no extrato do saldo');
});

test('o acumulado dos meses anteriores nao e gravado no saldo inicial (Ajustar saldo e Refazer configuracao)',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("carry: carry[a.id] || 0, initial: a.initial + (carry[a.id] || 0)"));
  assert.ok(s.includes('const storedInitial = acc ? Math.round((acc.initial - (acc.carry || 0)) * 100) / 100 : 0;'));
  assert.ok(s.includes("initial_balance: String(initialTouched ? money0(balance) : storedInitial)"));
  assert.ok(!s.includes('initial_balance: String(Math.round((target.initial + diff) * 100) / 100)'));
  const srv=fs.readFileSync(path.join(__dirname,'../../src/channels/mobile.js'),'utf8');
  assert.ok(srv.includes("String(t.data?.date || '') < start && !sent(t)"),'servidor: o que vai na lista nao entra no acumulado');
});

test('toque que nao se perde nos botoes de escolha (cartao, conta, abas de Financas)',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('function SurePressable(')&&s.includes('setTimeout(() => { if (!fired.current) { fired.current = true; onPress(); } }, 0);'));
  assert.ok(s.includes('<SurePressable key={String(o.value)} accessibilityRole="button" accessibilityState={{selected: o.value === value}}'),'Chips (Feita no cartao)');
  assert.ok(s.includes('{sources.map(s => <SurePressable key={s.id}'),'Pago com');
  assert.ok(s.includes('if (linking.current) return; linking.current = true;'),'Usar uma de Contas nao liga duas vezes');
});

test('voltar de Financas para Apps: grade ja montada, Financas nao desmonta, esqueleto com brilho no lugar do cinza',()=>{
  const w=read('src/screens/Workspace.tsx'),g=read('src/components/AppGrid.tsx'),s=read('src/screens/Finance.tsx');
  assert.ok(w.includes("<View style={{flex:1,display:module?'none':'flex'}}"),'grade so escondida');
  assert.ok(w.includes("financeKept||(module==='finance'&&financeReady)?<Finance"),'Financas fica montada');
  // 0.3.269: Listas, Notas e Biblioteca tambem viraram telas proprias (mesma protecao: nao carregam a lista generica por tras)
  assert.ok(/id==='finance'\|\|id==='monitor'\|\|id==='mail'(\|\|id==='[a-z]+')*\)\{setKind\(''\);return;\}/.test(w),'nao carrega lista de registros por tras');
  assert.ok(g.includes('export function AppGridSkeleton(')&&g.includes('<ShimmerBlock')&&g.includes('if(width>0)setW(width);'));
  assert.ok(s.includes("if (wasActive.current && !active) { goHome(); setMonth(monthOf(todayISO()));"),'ao sair volta ao Resumo do mes, como antes');
});

test('soltar um app: fica no lugar e o contorno sai na hora',()=>{
  const g=read('src/components/AppGrid.tsx');
  // 0.3.223: assenta deslizando, curto e suave (sem mola demorada); contorno e sombra somem no mesmo movimento
  assert.ok(g.includes('Animated.parallel([ease(p(d.id),slot(k),240),ease(scale,1,240),ease(lift,0,240)])'));
  assert.ok(!g.includes('bounciness'),'sem mola');
});
