'use strict';
// 13/11/2026 (Pedro: "marquei recebi o dinheiro do aluguel e sumiu da linha do tempo"): todo item da linha do tempo fica no lugar
// depois de feito, com o simbolo original e o tique verde.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const j=x=>JSON.parse(JSON.stringify(x));
const fin=()=>load('src/lib/finance.ts');
const noop=()=>({});
const brief=()=>load('src/lib/home-brief.ts',{react:{useEffect(){},useState:v=>[v,()=>{}]},'./capsule-store':{useCapsules:noop},'./finance':fin(),'../screens/finance/core':{},'../screens/PackagesApp':{classify:x=>x},'./finance-left':{}});
const tx=o=>({paidAt:'',reservePart:0,time:'',id:'x',kind:'income',desc:'Aluguel',amount:1500,date:'2026-11-13',category:'',accountId:'a',toAccountId:'',cardId:'',invoice:'',paid:false,seriesId:'',installment:0,installments:0,recurrence:'none',recurrenceEnd:'',...o});

test('Receita recebida e conta paga continuam na linha do tempo, marcadas como feitas',()=>{
  const {timelineMoney}=brief(),today='2026-11-13';
  const open=timelineMoney([tx({id:'r1'})],[],today);
  assert.deepEqual(j(open.map(d=>[d.id,!!d.paid])),[['r1',false]]);
  const after=timelineMoney([tx({id:'r1',paid:true,paidAt:today}),tx({id:'b1',kind:'expense',desc:'Luz',paid:true,paidAt:today,date:'2026-11-12'})],[],today);
  assert.deepEqual(j(after.map(d=>[d.id,d.kind,!!d.paid])),[['b1','pagar',true],['r1','receber',true]]);
  // gasto lancado ja pago (nunca foi conta a pagar) nao vira marca
  assert.equal(timelineMoney([tx({id:'g',kind:'expense',paid:true,paidAt:''})],[],today).length,0);
});

test('Receita mensal (virtual) recebida: o registro pago fica no mesmo dia',()=>{
  const {timelineMoney}=brief(),today='2026-11-13';
  const series=tx({id:'s',date:'2026-10-13',recurrence:'monthly',paid:true,paidAt:'2026-10-13'});
  const before=timelineMoney([series],[],today);assert.ok(before.some(d=>d.date===today&&!d.paid),'aberta antes');
  const after=timelineMoney([series,tx({id:'p',seriesId:'s',date:today,paid:true,paidAt:today})],[],today);
  assert.ok(after.some(d=>d.date===today&&d.paid&&d.kind==='receber'),'recebida continua no dia');
  assert.ok(!after.some(d=>d.date===today&&!d.paid),'sem duplicar a aberta');
});

test('Lembrete/compromisso concluido fica na linha do tempo (so ela); Agenda e contagens seguem sem ele',()=>{
  const d=load('src/lib/dashboard.ts'),r=load('src/lib/agenda-recurrence.ts');const at=new Date(Date.now()-3600e3).toISOString();
  const ev=[{id:'lem',kind:'reminder',title:'Pagar',state:'done',revision:1,data:{remind_at:at}},{id:'c',kind:'commitment',title:'Reuniao',state:'completed',revision:1,data:{start_at:at}}];
  assert.equal(d.dayRecords(r.expandForHome(ev),[]).length,0,'fora da linha do tempo nada muda');
  assert.deepEqual(j(d.dayRecords(r.expandForHome(ev,new Date(),true),[],true).map(x=>x.id).sort()),['c','lem']);
  const h=read('src/screens/Home.tsx');assert.ok(h.includes('dayRecords(expandForHome(all,new Date(),true),tasks,true)'),'linha do tempo usa keepDone');
});

test('Linha do tempo desenha o tique sobre o simbolo original de cada tipo',()=>{
  const s=read('src/desktop/HomeBrief.tsx');
  assert.ok(s.includes('done: !!d.paid, check: !!d.paid'),'contas/receitas/faturas');
  assert.ok(s.includes('done: !!ds.taken, check: !!ds.taken'),'rotina');
  assert.ok(s.includes('p.data.timelinePacks || p.data.packs')&&s.includes('check: gone && t === last'),'encomenda entregue');
  assert.ok((s.match(/<DoneTick /g)||[]).length>=3,'marcas, lembretes e compromissos');
  assert.ok(s.includes("isDoneRec(x) && !isDoneEv(x)"),'feito nao conta no numero da bolinha');
});

test('Lembrete que repete, "Feito so desta vez": a vez de hoje fica feita na linha do tempo e a repeticao segue igual',()=>{
  const d=load('src/lib/dashboard.ts'),r=load('src/lib/agenda-recurrence.ts');
  const now=new Date(),todayAt=new Date(now.getFullYear(),now.getMonth(),now.getDate(),8,0,0),next=new Date(todayAt.getTime()+7*864e5);
  const tags=r.withDoneOnce(['sofia-repeat-v1:weekly:America/Sao_Paulo'],todayAt.toISOString());
  assert.ok(tags.includes('sofia-repeat-v1:weekly:America/Sao_Paulo')&&tags.includes('sofia-done-v1:'+todayAt.toISOString()),'marca guardada sem mexer na repeticao');
  const rem={id:'aluguel',kind:'reminder',title:'Aluguel',state:'active',revision:2,tags,data:{remind_at:next.toISOString()}};
  const tl=d.dayRecords(r.expandForHome([rem],now,true),[],true).filter(x=>new Date(x.date).toDateString()===now.toDateString());
  assert.equal(tl.length,1,'a vez de hoje continua no dia');assert.equal(tl[0].original.state,'done');assert.equal(tl[0].id,'aluguel');
  assert.equal(r.expandForHome([rem],now).filter(o=>new Date(o.data.remind_at).toDateString()===now.toDateString()).length,0,'Agenda/contagens sem a vez feita');
  assert.ok(r.expandForHome([rem],now,true).some(o=>o.state==='active'&&o.data.remind_at===next.toISOString()),'proxima vez segue ativa');
  // so as 3 ultimas marcas e nunca mais de 20 marcas no total
  let t=[];for(let i=0;i<6;i++)t=r.withDoneOnce(t,new Date(Date.UTC(2026,0,1+i)).toISOString());assert.equal(t.length,3);
  assert.ok(r.withDoneOnce(Array.from({length:20},(_,i)=>'x'+i),todayAt.toISOString()).length<=20);
  assert.deepEqual(j(r.withDoneOnce(['a'],'lixo')),['a'],'data invalida nao grava nada');
  assert.ok(read('src/screens/Reminders.tsx').includes('tags:withDoneOnce(item.tags,'),'Lembretes grava a vez feita');
});
