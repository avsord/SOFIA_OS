'use strict';
// 0.3.161: ciclo do recebimento, contas fixas, Saldo do ciclo, meta e passo a passo.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs'),read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const f=load('src/lib/finance.ts');
const acc=(cycle=25,initial=0)=>f.toAccount({id:'a1',kind:'fin_account',title:'Conta',state:'active',data:{account_type:'corrente',initial_balance:initial,include_total:true,cycle_day:cycle}});
const tx=(id,kind,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:true,category:'Contas',recurrence:'none',...extra}});
test('ciclo comeca no dia em que a pessoa recebe e se adapta a meses curtos',()=>{
  assert.equal(JSON.stringify(f.cycleRange(25,'2026-10-17')),JSON.stringify({start:'2026-09-25',end:'2026-10-24',label:'até 24/10'}));
  assert.equal(JSON.stringify(f.cycleRange(25,'2026-10-26')),JSON.stringify({start:'2026-10-25',end:'2026-11-24',label:'até 24/11'}));
  assert.equal(f.cycleRange(31,'2026-02-15').end,'2026-02-27','fevereiro cai no ultimo dia');
  assert.equal(f.cycleRange(0,'2026-10-17').start,'2026-10-01','sem dia: mes do calendario');
});
test('contas fixas: total do ciclo, pagas e proporcao do que entrou',()=>{
  const txs=[tx('Salario','income',6000,'2026-09-25'),
    tx('Aluguel','expense',1800,'2026-09-28',{recurrence:'monthly'}),
    tx('Academia','expense',150,'2026-10-10',{recurrence:'monthly',paid:false}),
    tx('Padaria','expense',40,'2026-10-02')];
  const s=f.fixedSummary(txs,'a1',f.cycleRange(25,'2026-10-17'));
  assert.equal(s.bills.length,2);assert.equal(s.total,1950);assert.equal(s.paid,1800);assert.equal(s.open,150);
  assert.equal(s.income,6000);assert.ok(Math.abs(s.share-0.325)<0.001);
});
test('Saldo do ciclo: teto desconta fixas e aporte; gasto variavel esvazia; estouro vira "over"',()=>{
  const txs=[tx('Salario','income',6000,'2026-09-25'),
    tx('Aluguel','expense',1800,'2026-09-28',{recurrence:'monthly'}),
    tx('Mercado','expense',500,'2026-10-02')];
  const r=f.cycleRoom(txs,'a1',f.cycleRange(25,'2026-10-17'),4000,0);
  assert.equal(r.income,6000);assert.equal(r.fixed,1800);assert.equal(r.plan,4000);
  assert.equal(r.ceiling,200,'6000 - 1800 - 4000');assert.equal(r.spent,500);assert.equal(r.left,-300);assert.equal(r.over,300);
  const folga=f.cycleRoom([txs[0],txs[1]],'a1',f.cycleRange(25,'2026-10-17'),0,0);
  assert.equal(folga.ceiling,4200);assert.equal(folga.pct,1);
});
test('meta: projecao no ritmo atual e quanto por mes fecharia no prazo',()=>{
  const g=f.toGoal({id:'g1',kind:'fin_goal',title:'Guardado',state:'active',data:{role:'reserve',saved:15000,target:39000,deadline:'2027-03-31'}});
  const o=f.reserveOutlook(g,19000,4000,'2026-10-17');
  assert.equal(o.missing,20000);assert.equal(o.months,5);assert.equal(o.atCurrent,39000);assert.equal(o.neededMonthly,4000);assert.equal(o.onTrack,true);
  const curto=f.reserveOutlook(g,19000,3000,'2026-10-17');
  assert.equal(curto.atCurrent,34000);assert.equal(curto.onTrack,false);assert.equal(curto.neededMonthly,4000);assert.equal(curto.reachDate,'2027-05');
  assert.equal(f.reserveOutlook(f.toGoal({id:'g2',kind:'fin_goal',title:'x',state:'active',data:{role:'reserve',saved:0}}),0,0),null,'sem meta nao calcula');
});
test('telas: cartao Saldo, secao de contas fixas, meta e passo a passo com 7 etapas',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('>Controle de gastos</Text>')&&s.includes('moneyLeft(d.txs, d.cards, monthRange, accountId, total, aportePendingIn(monthRange), today)'),'cartao do ciclo');
  assert.ok(s.includes('<SpendCapCard '),'controle de gastos com teto (0.3.310)');
  assert.ok(s.includes("<Title text={side==='pagar'?'Contas fixas':'Receitas fixas'} />")&&s.includes('Total do mês'));
  assert.ok(s.includes('Meta: {show(outlook.target)}')&&s.includes('Para fechar no prazo:'));
  assert.ok(s.includes("{title: 'Quando e quanto você recebe'")&&s.includes("{title: 'Tudo pronto'"));
  assert.ok(s.includes('Passo {step + 1} de {steps.length}')&&s.includes('Pular o resto'));
  assert.ok(s.includes('Refazer a configuração'),'reabre ja preenchido em Contas e cartoes');
  assert.ok(s.includes('Dia em que você recebe (opcional)'),'campo no cadastro da conta');
});

test('0.3.162: corrigir ou apagar um movimento reajusta o guardado e o aporte do mes',()=>{
  const acc2=f.toAccount({id:'a1',kind:'fin_account',title:'C',state:'active',data:{account_type:'corrente',initial_balance:0,include_total:true}});
  const reserve=f.toGoal({id:'g1',kind:'fin_goal',title:'R',state:'active',data:{role:'reserve',saved:15000,monthly_plan:4000}});
  const mv=(id,dir,amount,date,planned=false)=>f.toReserveMove({id,kind:'fin_reserve_move',title:id,state:'active',data:{goal_id:'g1',direction:dir,amount,date,planned}});
  const split=m=>f.moneySplit(reserve,m,[acc2],[],[], '2026-10','2026-10-20',[]);
  const errado=split([mv('m1','in',20000,'2026-10-05')]);
  assert.equal(errado.saved,35000);assert.equal(errado.realized,20000);
  const corrigido=split([mv('m1','in',2000,'2026-10-05')]);
  assert.equal(corrigido.saved,17000);assert.equal(corrigido.realized,2000);assert.equal(corrigido.missing,2000);
  const apagado=split([]);
  assert.equal(apagado.saved,15000);assert.equal(apagado.realized,0);assert.equal(apagado.missing,4000);
  // trocar "a recompor" por "planejada" tira a retirada da conta do mes, sem mexer no guardado
  const recompor=split([mv('m2','out',1000,'2026-10-10')]),planejada=split([mv('m2','out',1000,'2026-10-10',true)]);
  assert.equal(recompor.saved,planejada.saved);assert.equal(recompor.monthTarget,5000);assert.equal(planejada.monthTarget,4000);
});
test('0.3.162: historico abre a edicao do movimento, com apagar',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("accessibilityLabel={'Editar ' + reserveMoveLabel(it) + ' de ' + show(it.amount)}"));
  assert.ok(s.includes('Apagar movimento'));assert.ok(s.includes('o dinheiro guardado volta ao valor de antes'));
  assert.ok(s.includes('<DateTimeField label="Data" value={date} onChange={v => setDate(v || date)} dateOnly allowClear={false} />'),'0.3.172: data pelo seletor');
  assert.ok(s.includes("Toque em um movimento para corrigir o valor, a data ou apagá-lo."));
});

test('0.3.165: conta fixa com prazo conta as parcelas e acaba sozinha',()=>{
  const bill=(id,date,paid,extra={})=>f.toTx({id,kind:'fin_tx',title:'Cartão',state:'active',
    data:{kind:'expense',amount:500,date,account_id:'a1',paid,category:'Contas',recurrence:'monthly',installments:10,recurrence_end:'2027-05',...extra}});
  // primeira parcela em agosto/2026; em outubro estamos na 3a
  const txs=[bill('p1','2026-08-10',true),bill('p2','2026-09-10',true,{series_id:'p1'}),bill('p3','2026-10-10',false,{series_id:'p1'})];
  const out=f.fixedBills(txs,'a1',{start:'2026-10-01',end:'2026-10-31'});
  assert.equal(out.length,1);
  const b=out[0];assert.equal(b.installments,10);assert.equal(b.index,1,'index sai da data da propria parcela quando ela e a primeira do registro');
  // usando o campo data.date da serie (primeira parcela) o indice fica correto
  const serie=f.fixedBills([f.toTx({id:'p3',kind:'fin_tx',title:'Cartão',state:'active',
    data:{kind:'expense',amount:500,date:'2026-10-10',account_id:'a1',paid:false,category:'Contas',recurrence:'monthly',installments:10}})],'a1',{start:'2026-10-01',end:'2026-10-31'});
  assert.equal(serie[0].left,10,'a pagar: conta a propria parcela');
  assert.equal(f.lastInstallmentMonth('2026-08-10',10),'2027-05','para de se repetir na 10a');
  assert.equal(f.monthsBetween('2026-08','2026-10'),2);
});
test('0.3.165: tela e avisos das parcelas',()=>{
  const s=read('src/screens/Finance.tsx'),n=read('src/lib/finance-notifications.ts');
  assert.ok(s.includes('Parcelas (opcional)'));
  assert.ok(s.includes("parcela '+b.index+' de '+b.installments"));
  assert.ok(s.includes('A Sofia avisa quando terminar.'));
  assert.ok(n.includes("due.title + ' acabou"));assert.ok(n.includes("'Última parcela de '"));
});

test('0.3.166: conta que ja esta no meio ("3 de 10") conta certo e termina na decima',()=>{
  const tx=f.toTx({id:'p1',kind:'fin_tx',title:'Cartão',state:'active',
    data:{kind:'expense',amount:500,date:'2026-10-10',account_id:'a1',paid:false,category:'Contas',recurrence:'monthly',installments:10,installment:3}});
  const b=f.fixedBills([tx],'a1',{start:'2026-10-01',end:'2026-10-31'})[0];
  assert.equal(b.index,3);assert.equal(b.left,8,'a pagar: a 3a mais as 7 seguintes');
  const pago=f.fixedBills([{...tx,paid:true}],'a1',{start:'2026-10-01',end:'2026-10-31'})[0];
  assert.equal(pago.left,7,'depois de pagar a 3a, faltam 7');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('Esta é a parcela nº'),'campo ao criar e ao editar');
  assert.ok(s.includes('Conta com prazo (ex.: 10x)?'),'tambem no passo a passo');
});

test('0.3.180: pendencias seguem o mes do topo; cada mes fica com as suas, mesmo atrasadas',()=>{
  const p=(id,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind:'expense',amount:100,date,account_id:'a1',paid:false,category:'Contas',recurrence:'none',import_id:'sofia-pendencia:'+id,...extra}});
  const txs=[p('atrasada','2026-09-20'),p('outubro','2026-10-25'),p('novembro','2026-11-05'),p('academia','2026-10-10',{recurrence:'monthly'})];
  const titles=m=>f.monthDues(txs,'a1',m,'2026-10-17').map(d=>d.title).join(',');
  assert.equal(titles('2026-10'),'academia,outubro','a atrasada de setembro nao vem para outubro');
  assert.equal(titles('2026-09'),'atrasada','fica em setembro');
  assert.equal(f.monthDues(txs,'a1','2026-09','2026-10-17')[0].late,true,'marcada como atrasada');
  assert.equal(titles('2026-11'),'novembro,academia','outro mes: so o dele, com as fixas daquele mes');
  assert.equal(titles('2026-12'),'academia');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('monthDues(d.txs,accountId,month,today,settled)'));
  assert.ok(s.includes("'Pendentes de '+monthLabel(month)"));
});

test('0.3.177: ao pagar, a conta fica verde e continua na lista do mes',()=>{
  const p=(id,date,paid=false)=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind:'expense',amount:100,date,account_id:'a1',paid,category:'Contas',recurrence:'none',import_id:'sofia-pendencia:'+id}});
  const list=f.monthDues([p('atrasada','2026-09-20'),p('paga-setembro','2026-09-05',true),p('outubro','2026-10-25'),p('paga-outubro','2026-10-02',true)],'a1','2026-10','2026-10-17');
  assert.equal(list.map(d=>d.title).join(','),'paga-outubro,outubro','so as de outubro');
  const paga=list.find(d=>d.title==='paga-outubro');assert.equal(paga.paid,true);assert.equal(paga.late,false);
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("if (due.paid) return ("),'linha propria para paga');
  assert.ok(s.includes("backgroundColor: c.good + '1a'"),'verde');
  assert.ok(s.includes("import_id: t.manualDue ? 'sofia-pendencia:' + (t.seriesId || t.id) + ':' + t.date : ''"),'repeticao paga continua pendencia daquele mes');
  assert.ok(s.includes("{sideOpen.length} em aberto em"),'cabecalho mostra as abertas do lado escolhido');
});

test('0.3.178: apagar no historico um pagamento de pendencia desfaz o pagamento (volta como a pagar)',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("if (tx.manualDue && tx.paid && (tx.recurrence === 'monthly' || !!tx.seriesId)) {"),'0.3.181: so conta fixa volta como nao paga');
  assert.ok(s.includes("await api.saveEntity({...tx.entity!, data: {...tx.entity!.data, paid: false, paid_at: ''}})"),'nao apaga o registro, so desfaz o pagamento');
  assert.ok(s.includes("'Desfazer o ' + kind + '?'"));
  assert.ok(s.includes('accessibilityLabel={tx.manualDue && tx.paid && (tx.recurrence === \'monthly\' || !!tx.seriesId) ? "Desfazer pagamento" : "Apagar lançamento"}'));
  // e a pendencia desfeita aparece de novo no mes como a pagar
  const p=f.toTx({id:'luz',kind:'fin_tx',title:'Luz',state:'active',data:{kind:'expense',amount:180,date:'2026-10-12',account_id:'a1',paid:false,category:'Contas',recurrence:'none',import_id:'sofia-pendencia:luz'}});
  const d=f.monthDues([p],'a1','2026-10','2026-10-17')[0];assert.equal(d.paid,false);assert.equal(d.late,true);
});

test('0.3.181: amarelo em aberto, verde pago, vermelho atrasada e roxo fatura',()=>{
  const s=read('src/screens/Finance.tsx');
  const row=s.slice(s.indexOf('function DueRow('),s.indexOf('// 0.3.175: atualizacoes locais imediatas'));
  assert.ok(row.includes("const color = due.late ? c.danger : due.kind === 'fatura' ? c.accent : c.warn;"),'atrasada vermelha, fatura roxa, resto amarelo');
  assert.ok(row.includes("backgroundColor: color + '1a'"));assert.ok(row.includes("backgroundColor: c.good + '1a'"),'pago: verde');
});

test('0.3.182: Saldo, detalhes do saldo, listas de receitas e despesas, cartao no lugar da lampada',()=>{
  const s=read('src/screens/Finance.tsx'),lib=read('src/lib/finance.ts');
  assert.ok(s.includes('accessibilityLabel="Ver como o saldo é calculado" onPress={() => setBreakdown(\'saldo\')}'));
  assert.ok(s.includes('accessibilityLabel="Ver receitas do mês"')&&s.includes('accessibilityLabel="Ver despesas do mês"'));
  assert.ok(s.includes("'Como o saldo é calculado'")||s.includes('Como o saldo é calculado'));
  assert.ok(s.includes('Transferências entre contas'),'a conta do saldo sempre fecha');
  assert.ok(s.includes('>Controle de gastos</Text>'),'sem dois cartoes com o mesmo nome');
  assert.ok(lib.includes("{name: 'Contas', icon: '💳'")&&!lib.includes('💡'));
  assert.ok(!s.includes('Recuperar itens apagados'),'0.3.212: a recuperacao saiu da engrenagem');
});

test('0.3.186: sem aviso de repetido (o servidor nao deixa duplicar e corrige o antigo); contas fixas no mes da pagina',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(!s.includes('DuplicatesSheet')&&!s.includes('Lançamento repetido'),'nada de tela de repetidos');
  assert.ok(s.includes('receiveTx(api, d, due.tx)')&&s.includes('receiveTx(api, d, t)')&&s.includes('async function confirmTx('),'confirmar nao cria segundo registro');
  assert.ok(s.includes("const range=useMemo(()=>({start:dayIn(month,1),end:dayIn(month,daysIn(month))"),'contas fixas no mes da pagina');
  assert.ok(s.includes("const initialTouched = !acc || money0(balance) !== storedInitial;"),'refazer nao reescreve o saldo inicial');
  assert.ok(s.includes('Não é um lançamento: é o saldo inicial da conta'));
});

test('0.3.188: aporte como conta a fazer (valor sugerido e editavel), no + e em Pendentes; folha da reserva com respiro',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("[amount, setAmount] = useState(kind === 'in' && split && split.missing > 0 ? finishMoneyInput(String(split.missing).replace('.', ',')) : '')"),'abre com o valor que falta');
  assert.ok(s.includes("kind === 'in' ? 'Aportar' :"));
  assert.ok(s.includes("toque para aportar este ou outro valor"),'sugestao no Resumo');
  assert.ok(s.includes("🔒 Aporte (guardar dinheiro)"),'opcao no +');
  assert.ok(!s.includes("{aporte&&aporte.monthTarget>0?(aporte.missing>0"),'0.3.226: o aporte saiu de A vencer e atrasadas (fica no guardado e no +)');
  assert.ok(s.includes('<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 14, paddingBottom: 28}}>'),'Sua reserva rola e tem respiro no fim');
  assert.ok(!s.includes('não entra no saldo geral'),'sem "saldo geral"');
});

test('0.3.192: contas fixas editaveis pela propria secao; mudar a data muda so o dia (o inicio fica)',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("accessibilityLabel={'Editar '+b.title} disabled={!original} onPress={()=>original&&onBill(original,'series')}"),'toque abre a conta fixa original');
  assert.ok(s.includes('Toque numa conta para mudar nome, valor, dia, parcelas ou avisos. Vale para todos os meses.'));
  assert.ok(s.includes("const isSeries=!!tx&&!tx.virtual&&tx.recurrence==='monthly'&&!tx.seriesId&&repeat==='monthly';"));
  assert.ok(s.includes("kind:flow,amount:value,date:finalDate,category,"),'grava com o mes de inicio original');
  assert.ok(s.includes("'Vencimento (o dia vale para todos os meses)'"));
});

test('0.3.192: contas fixas editaveis, linha inteira das pendencias abre a edicao, voltar sempre para o Resumo',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("accessibilityLabel={'Editar '+b.title} disabled={!original} onPress={()=>original&&onBill(original,'series')}"),'conta fixa abre a edicao da original');
  assert.ok(s.includes('const target = due.tx;'),'0.3.193: pela lista do mes, abre o proprio mes');
  assert.ok(s.includes("accessibilityLabel={'Editar ' + due.title} disabled={!target} onPress={openEdit}"),'linha inteira');
  assert.ok(s.includes("const isSeries=!!tx&&!tx.virtual&&tx.recurrence==='monthly'&&!tx.seriesId&&repeat==='monthly';"),'mudar a data muda o dia, nao o inicio');
  assert.ok(s.includes("if (tab !== 'home') {setTab('home');setTabHistory([]);scrollY.current = 0;setTimeout(() => mainScroll.current?.scrollTo({y: 0, animated: false}), 0);return;}"),'voltar: aba -> Resumo (no topo, 0.3.225) -> Apps');
});

test('0.3.192: ajustar o Saldo ao valor do banco muda so o ponto de partida; lancamentos seguem contando',()=>{
  // conta com saldo inicial 0, salario 7.821 e contas pagas 1.103,18 -> Saldo 6.717,82; banco tem 6.000
  const acc=f.toAccount({id:'a1',kind:'fin_account',title:'C',state:'active',data:{account_type:'corrente',initial_balance:'0',include_total:true}});
  const tx=(id,kind,amount,date)=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:true,category:'X',recurrence:'none'}});
  const txs=[tx('sal','income',7821,'2026-09-25'),tx('contas','expense',1103.18,'2026-10-10')];
  const current=f.totalBalance([acc],txs);assert.equal(current,6717.82);
  const diff=Math.round((6000-current)*100)/100;
  const adjusted=f.toAccount({...acc.entity,data:{...acc.entity.data,initial_balance:String(Math.round((acc.initial+diff)*100)/100)}});
  assert.equal(f.totalBalance([adjusted],txs),6000,'Saldo vira o valor do banco');
  assert.equal(f.totalBalance([adjusted],[...txs,tx('mercado','expense',200,'2026-10-20')]),5800,'e continua contando a partir dele');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('<Button title="Ajustar saldo" secondary'),'0.3.214: botao Ajustar saldo');
  assert.ok(s.includes("initial_balance: String(Math.round((target.initial - (target.carry || 0) + diff) * 100) / 100)"),'sem lancamento falso (e sem gravar o acumulado dos meses anteriores)');
});

test('0.3.193: pela lista do mes a edicao vale so para aquele mes; conta paga continua paga; botoes funcionam com teclado aberto',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("onTx={t=>onBill(t as Tx,'month')}"),'lista do mes: so o mes');
  assert.ok(s.includes("const monthOnly=scope==='month'&&recurring;"));
  assert.ok(s.includes("if(monthOnly&&isTemplate&&tx?.entity){"),'original da conta fixa: vira o mes e a serie continua no mes seguinte com o valor de antes');
  assert.ok(s.includes("recurrence:tx?.virtual||monthOnly?'none':repeat,"),'so o mes nunca muda a repeticao');
  assert.ok(s.includes("paid:cardFor?false:existing?!!tx?.paid:false,"),'editar conta paga nao desmarca (a do cartao se paga pela fatura)');
  assert.ok(s.includes('Para mudar todos os meses, edite a conta em Contas fixas.'));
  assert.ok(!/<ScrollView(?![^>]*keyboardShouldPersistTaps)[^>]*contentContainerStyle=\{\{gap: 12, paddingBottom: 18\}\}>/.test(s),'tela do saldo: toque em Salvar funciona com o teclado aberto');
  // a conta fixa lista tambem os meses ja registrados da serie
  const t=(id,date,extra={})=>f.toTx({id,kind:'fin_tx',title:'Vivo',state:'active',data:{kind:'expense',amount:47,date,account_id:'a1',paid:false,category:'Contas',recurrence:'none',import_id:'sofia-pendencia:'+id,...extra}});
  const list=f.fixedBills([t('mes','2026-10-17',{series_id:'next',amount:60}),t('next','2026-11-17',{recurrence:'monthly'})],'a1',{start:'2026-10-01',end:'2026-10-31'});
  assert.equal(list.length,1);assert.equal(list[0].amount,60,'outubro com o valor alterado so para ele');
  const nov=f.fixedBills([t('mes','2026-10-17',{series_id:'next',amount:60}),t('next','2026-11-17',{recurrence:'monthly'})],'a1',{start:'2026-11-01',end:'2026-11-30'});
  assert.equal(nov[0].amount,47,'novembro segue com o valor de antes');
});

test('0.3.195: previsao do salario (periodo do proximo salario) e ciclo de cada pessoa',()=>{
  const tx=(id,kind,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:false,category:'X',recurrence:'none',import_id:'sofia-pendencia:'+id,...extra}});
  const txs=[tx('sal','income',7821,'2026-09-25',{recurrence:'monthly',paid:true}),tx('academia','expense',129,'2026-10-02',{recurrence:'monthly'}),tx('claude','expense',550,'2026-10-11',{recurrence:'monthly'}),tx('maislaser','expense',300,'2026-10-25',{recurrence:'monthly'}),tx('dentista','expense',200,'2026-11-10')];
  const prev=f.salaryForecast(txs,[],25,4000,'a1','2026-10-19');
  assert.equal(prev.upcoming,true,'semana antes do salario: previsao do proximo periodo');
  assert.equal(prev.start,'2026-10-25');assert.equal(prev.end,'2026-11-24');
  assert.equal(prev.income,7821);assert.equal(prev.fixed,979);assert.equal(prev.single,200);assert.equal(prev.available,2642);
  const mid=f.salaryForecast([...txs,f.toTx({id:'mercado',kind:'fin_tx',title:'mercado',state:'active',data:{kind:'expense',amount:150,date:'2026-10-27',account_id:'a1',paid:true,category:'Mercado',recurrence:'none'}})],[],25,4000,'a1','2026-10-28');
  assert.equal(mid.upcoming,false);assert.equal(mid.spent,150);assert.equal(mid.left,2492,'gasto do dia a dia diminui o que resta');
  const sal5=[tx('sal5','income',3000,'2026-09-05',{recurrence:'monthly',paid:true}),tx('luz','expense',200,'2026-10-20',{recurrence:'monthly'})];
  const p5=f.salaryForecast(sal5,[],5,0,'a1','2026-10-19');
  assert.equal(p5.start,'2026-10-05');assert.equal(p5.end,'2026-11-04');assert.equal(p5.available,2800,'quem recebe dia 5: periodo de 05 a 04');
  const acc=f.toAccount({id:'a1',kind:'fin_account',title:'C',state:'active',data:{account_type:'corrente',initial_balance:0,include_total:true}});
  assert.equal(f.effectiveCycleDay([acc],sal5,'a1'),5,'sem dia informado: o dia do salario fixo');
  assert.equal(f.effectiveCycleDay([acc],[],'a1'),0,'sem salario: mes do calendario');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("'Previsto até ' + forecastEnd}"),'0.3.224: ate a vespera do proximo salario');
  assert.ok(s.includes('<SpendCapCard '),'o cartao nunca some (0.3.310: SpendCapCard)');
});

test('0.3.196: Controle de gastos; passo a passo pede o valor cheio do salario e cria a receita fixa no dia',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("{title: 'Quando e quanto você recebe'"));
  assert.ok(s.includes('Quanto você recebe por mês (R$)'));
  assert.ok(s.includes('Recebe em duas vezes ou tem vale? Some tudo e coloque o valor cheio do mês'));
  assert.ok(s.includes("category: 'Salário', recurrence: 'monthly', import_id: 'sofia-pendencia:' + Date.now() + ':salario'"),'cria o salario como a receber todo mes');
  assert.ok(s.includes('if (salaryTx?.entity) {'),'ao refazer, atualiza o salario que ja existe (sem duplicar)');
  assert.ok(s.includes('>Controle de gastos</Text>'));
});

test('0.3.196: controle de gastos e previsto partem do dinheiro real (cenario do print)',()=>{
  const tx=(id,kind,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:false,category:'X',recurrence:'none',import_id:'sofia-pendencia:'+id,...extra}});
  const fixas=[['academia',129,'2026-10-02',true],['adobe',47,'2026-10-07',true],['claude',550,'2026-10-11',true],['hubla',30.18,'2026-10-13',true],['vivo',47,'2026-10-17',true],['darf',178.31,'2026-10-20',false],['das',469,'2026-10-20',false],['simpl',189,'2026-10-20',false],['maislaser',300,'2026-10-25',false]];
  const txs=[tx('sal','income',7821,'2026-09-25',{recurrence:'monthly',paid:true}),...fixas.map(([id,v,d,p])=>tx(id,'expense',v,d,{recurrence:'monthly',paid:p})),tx('avulsa','expense',1000,'2026-10-28'),tx('fatura','expense',1853.94,'2026-11-05')];
  const cur=f.currentPlan(txs,[],f.cycleRange(25,'2026-10-19'),'a1',1779.53,'2026-10-25',4000,'2026-10-19');
  assert.equal(cur.left,943.22,'Saldo 1.779,53 menos DARF, DAS e Simplificador ainda a pagar');
  assert.ok(cur.left<=1779.53,'nunca passa do que a pessoa tem');
  assert.equal(cur.aporte,0,'aporte do dia 25 e do proximo periodo');
  const nxt=f.nextPlan(txs,[],f.cycleRange(25,'2026-10-25'),'a1',cur.left,4000,'2026-10-19');
  assert.equal(nxt.carry,943.22);assert.equal(nxt.income,7821);assert.equal(nxt.fixed,1939.49);assert.equal(nxt.aporte,4000);
  assert.equal(nxt.left,-29.21,'sobra + salario - fixas - avulsa/fatura - aporte');
  // gasto do dia a dia lancado no periodo diminui o que resta, mas o teto continua o mesmo
  const gasto=f.toTx({id:'mercado',kind:'fin_tx',title:'mercado',state:'active',data:{kind:'expense',amount:100,date:'2026-10-18',account_id:'a1',paid:true,category:'Mercado',recurrence:'none'}});
  const cur2=f.currentPlan([...txs,gasto],[],f.cycleRange(25,'2026-10-19'),'a1',1679.53,'2026-10-25',4000,'2026-10-19');
  assert.equal(cur2.left,843.22);assert.equal(cur2.spent,100);assert.equal(cur2.available,943.22);
});

test('0.3.196: modelo simples - previsto = receitas - despesas e pendentes - fatura - aporte; controle = o Saldo',()=>{
  const tx=(id,kind,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:false,category:'X',recurrence:'none',import_id:'sofia-pendencia:'+id,...extra}});
  const fixas=[['academia',129,'2026-10-02',true],['adobe',47,'2026-10-07',true],['claude',550,'2026-10-11',true],['hubla',30.18,'2026-10-13',true],['vivo',47,'2026-10-17',true],['darf',178.31,'2026-10-20',false],['das',469,'2026-10-20',false],['simpl',189,'2026-10-20',false],['maislaser',300,'2026-10-25',false]];
  const txs=[tx('sal','income',7821,'2026-09-25',{recurrence:'monthly',paid:true}),...fixas.map(([id,v,d,p])=>tx(id,'expense',v,d,{recurrence:'monthly',paid:p})),tx('avulsa','expense',1000,'2026-10-28'),tx('fatura','expense',1853.94,'2026-11-05')];
  const prev=f.simpleForecast(txs,[],f.cycleRange(25,'2026-10-25'),'a1','2026-10-19',4000);
  assert.equal(prev.income,7821);assert.equal(prev.expense,4793.43);assert.equal(prev.aporte,4000);assert.equal(prev.left,-972.43,'com o aporte, como estava no print (faltava a receita)');
  const comReceita=f.simpleForecast([...txs,tx('receita','income',2000,'2026-11-05')],[],f.cycleRange(25,'2026-10-25'),'a1','2026-10-19',4000);
  assert.equal(comReceita.left,1027.57,'a receita que faltava entra e o previsto sobe');
  const freela=f.simpleForecast([...txs,tx('freela','income',800,'2026-11-10')],[],f.cycleRange(25,'2026-10-25'),'a1','2026-10-19');
  assert.equal(freela.left,3827.57,'receita a mais so soma (sem aporte informado)');
  const ctl=f.spendControl(txs,[],'',f.cycleRange(25,'2026-10-19'),'a1',1779.53);
  assert.equal(ctl.left,1779.53,'controle de gastos e o Saldo');assert.equal(ctl.out,803.18);assert.equal(ctl.available,2582.71);assert.equal(Math.round(ctl.pct*100),69);
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("['Aporte', forecastP.aporte, c.danger, '−', [] as Tx[]]"),'aporte aparece na conta do previsto (0.3.223: em vermelho, e um valor que sai)');
});

test('0.3.197: Pendentes com seletor A pagar | A receber, mesmo esquema nos dois lados',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("<Segmented value={side} onChange={setSide} options={[{value: 'pagar' as const, label: 'A pagar'}, {value: 'receber' as const, label: 'A receber'}]} />"),'seletor de duas metades iguais, sem contagem');
  assert.ok(s.includes("onPress={()=>onNew(side==='pagar'?'expense':'income')}"),'+ Nova abre no tipo do lado escolhido');
  assert.ok(s.includes("const fx=side==='pagar'?fixed:fixedIn;"),'contas fixas ou receitas fixas');
  assert.ok(s.includes("tx?tx.kind==='income'?'income':'expense':initialFlow"),'o cadastro comeca no tipo escolhido');
  assert.ok(s.includes("const draftKey='bill:'+(tx?.id||'novo:'+initialFlow);"),'rascunho separado por tipo');
  assert.ok(!s.includes("if(draft.flow)setFlow("),'rascunho antigo nao troca mais o tipo');
  assert.ok(s.includes('{nextHint(side)}'),'aviso das contas programadas do mes seguinte');
  // receitas fixas (salario) aparecem do lado A receber
  const sal=f.toTx({id:'sal',kind:'fin_tx',title:'Salário',state:'active',data:{kind:'income',amount:7821,date:'2026-09-25',account_id:'a1',paid:false,category:'Salário',recurrence:'monthly',import_id:'sofia-pendencia:s'}});
  const inc=f.fixedSummary([sal],'a1',{start:'2026-10-01',end:'2026-10-31'},'income');
  assert.equal(inc.bills.length,1);assert.equal(inc.total,7821);
  assert.equal(f.fixedSummary([sal],'a1',{start:'2026-10-01',end:'2026-10-31'}).bills.length,0,'nao entra nas contas fixas a pagar');
});

test('0.3.198: cada linha do previsto lista os lancamentos que a compoem (para achar receita a mais)',()=>{
  const tx=(id,kind,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:false,category:'X',recurrence:'none',import_id:'sofia-pendencia:'+id,...extra}});
  const txs=[tx('Salário','income',7821,'2026-09-25',{recurrence:'monthly',paid:true}),tx('Freela','income',2000,'2026-10-26',{recurrence:'monthly'}),tx('Reembolso','income',1707.08,'2026-11-03')];
  const p=f.simpleForecast(txs,[],f.cycleRange(25,'2026-10-25'),'a1','2026-10-19',0);
  assert.equal(p.income,11528.08);
  assert.equal(p.incomeItems.map(t=>t.desc).join(','),'Salário,Freela,Reembolso','mostra cada receita do periodo');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("setForecastOpenLine(l => l === label ? '' : label)"));
  assert.ok(s.includes("original.manualDue ? onBill(original) : onTx(original)"),'abre para corrigir ou excluir');
});

test('0.3.199: gasto fora do padrao e resumo da semana por categoria',()=>{
  const tx=(id,amount,date,category)=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind:'expense',amount,date,account_id:'a1',paid:true,category,recurrence:'none'}});
  const txs=[tx('a1',300,'2026-07-10','Alimentação'),tx('a2',320,'2026-08-10','Alimentação'),tx('a3',280,'2026-09-10','Alimentação'),tx('a4',600,'2026-10-12','Alimentação'),tx('m',200,'2026-10-12','Mercado'),tx('m0',190,'2026-09-12','Mercado'),tx('s1',80,'2026-10-13','Alimentação'),tx('s2',40,'2026-10-15','Transporte')];
  const al=f.categoryAlerts(txs,'a1','2026-10');
  assert.equal(al.length,1,'so Alimentacao passou do normal (Mercado esta dentro)');assert.equal(al[0].category,'Alimentação');assert.equal(al[0].total,680);assert.equal(al[0].average,300);
  const w=f.lastWeekByCategory(txs,'a1','2026-10-19');
  assert.equal(w.start,'2026-10-12');assert.equal(w.end,'2026-10-18');assert.equal(w.total,920);assert.equal(w.lines[0].category,'Alimentação');
  const s=read('src/screens/Finance.tsx'),n=read('src/lib/finance-notifications.ts');
  assert.ok(s.includes('% acima do que você costuma gastar'));assert.ok(s.includes('<Fold id="semana" title="Semana passada">'));
  assert.ok(n.includes("weekday: 2, hour: 9, minute: 0"),'toda segunda as 9h');
  assert.ok(n.includes("'sofia.fin.alerts:' + key + ':' + month"),'um aviso por categoria por mes');
});

test('0.3.208: sobra = saldo + o que entra - o que falta pagar; pagar conta prevista nao muda; fatura nao conta duas vezes',()=>{
  const tx=(id,kind,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:false,category:'X',recurrence:'none',import_id:'sofia-pendencia:'+id,...extra}});
  const txs=[tx('sal','income',7821,'2026-09-25',{recurrence:'monthly',paid:true}),tx('darf','expense',836.31,'2026-10-22'),tx('mais','expense',300,'2026-10-25',{recurrence:'monthly'}),tx('nov','expense',1000,'2026-11-10'),
    f.toTx({id:'mercado',kind:'fin_tx',title:'Mercado',state:'active',data:{kind:'expense',amount:100,date:'2026-10-18',account_id:'a1',paid:true,category:'Mercado',recurrence:'none'}})];
  const cur=f.moneyLeft(txs,[],f.cycleRange(25,'2026-10-20'),'a1',783.78,0,'2026-10-20');
  assert.equal(cur.left,-52.53);assert.equal(cur.spent,100);
  const paid=txs.map(t=>t.id==='darf'?{...t,paid:true}:t);
  assert.equal(f.moneyLeft(paid,[],f.cycleRange(25,'2026-10-20'),'a1',783.78-836.31,0,'2026-10-20').left,-52.53,'pagar a conta prevista nao muda a sobra');
  const prev=f.moneyLeft(txs,[],{start:'2026-09-25',end:'2026-11-24'},'a1',783.78,4000,'2026-10-20');
  assert.equal(prev.toReceive,7821);assert.equal(prev.toPay,2136.31);assert.equal(prev.left,2468.47,'saldo + salario - contas - aporte');
  const card={id:'c1',name:'Nubank',accountId:'a1',closeDay:1,dueDay:5,limit:0,archived:false,color:'',entity:null};
  const withBill=[...txs,tx('Fatura Nubank','expense',500,'2026-11-05')];
  const r1=f.moneyLeft(withBill,[],{start:'2026-09-25',end:'2026-11-24'},'a1',783.78,0,'2026-10-20');assert.equal(r1.toPay,2636.31,'sem cartao, a fatura cadastrada conta como conta');
});

test('0.3.208: Relatorios com secoes que abrem e fecham (lembra a escolha), guardado primeiro, Recomecar so na engrenagem',()=>{
  const s=read('src/screens/Finance.tsx');
  for(const id of ['guardado','semana','seis','saldo'])assert.ok(s.includes('<Fold id="'+id+'"'),id);
  assert.ok(s.includes("const FOLD_KEY = 'sofia_fin_folds_v1';")&&s.includes('SecureStore.setItemAsync(FOLD_KEY'),'lembra aberta/fechada');
  const r=s.slice(s.indexOf('function ReportsTab('));assert.ok(r.indexOf('<Fold id="guardado"')<r.indexOf('<Fold id="saldo"'),'guardado em cima, saldo embaixo');
  assert.ok(!r.slice(0,r.indexOf('\nfunction ',10)).includes('Recomeçar de hoje</Text>'),'fora dos Relatorios');
  assert.ok(!s.includes('Recomeçar de hoje</Text>')&&!s.includes('Recuperar itens apagados</Text>'),'0.3.212: recomecar e recuperar sairam');assert.ok(s.includes('>Redefinir Finanças</Text>'),'0.3.223: Redefinir Financas na engrenagem');
  assert.ok(s.includes("manualDues(d.txs, accountId, today, 3)")&&s.includes('nos próximos 3 dias'),'vencimentos com 3 dias');
  assert.ok(s.includes("label: 'Contas'")&&s.includes("label: 'Lançamentos'"),'0.3.213: abas Resumo, Contas, Lancamentos, Cartoes, Relatorios');
  assert.ok(s.includes('async function saveFresh(')&&s.includes("return saveFresh(api, t.desc, {paid: true, paid_at: todayISO(), ...extra}, t.entity)"),'Paguei sobre a versao atual');
  assert.ok(s.includes('aparece {g.items.length} vezes'),'aviso de repetido');
});

test('0.3.212: previsto e controle pelo mes da tela; extrato do saldo; pular o passo a passo',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("const monthRange = useMemo(() => ({start: dayIn(month, 1), end: dayIn(month, daysIn(month))}), [month]);"));
  assert.ok(!s.includes('além do que sobra'));
  assert.ok(!s.includes("'Extrato do saldo'")&&!s.includes('Conferir item por item'),'0.3.225: extrato do saldo saiu');
  assert.ok(s.includes('Pular: só a conta. O resto a Sofia cadastra pelos seus prints'));
  assert.ok(s.includes("api.financeReset()"));
  const b=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','..','src/core/app-bridge.js'),'utf8');assert.ok(b.includes('PRINT COM VARIAS CONTAS')&&b.includes('intent "compound" com UM create_entity fin_tx POR LINHA'));
});
