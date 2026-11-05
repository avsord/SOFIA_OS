'use strict';
// 0.3.201: lote de ajustes juntados pelo Pedro no WhatsApp.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('apagar regra de e-mail nao mostra mais "Cannot read property map of undefined"',()=>{
  const s=read('src/screens/Mail.tsx');
  assert.ok(s.includes('const failed = (r?.errors || []).map(e =>'));
  assert.ok(!/const failed = r\.errors\.map/.test(s));
});

test('editor de paginas e de notas: Enter nao faz o texto pular (campos crescem, so a pagina rola)',()=>{
  for(const f of ['src/screens/Pages.tsx','src/components/LeafEditor.tsx']){
    const s=read(f);const tags=[...s.matchAll(/<TextInput\b[^]*?\/>/g)].map(m=>m[0]).filter(t=>t.includes('multiline'));
    assert.ok(tags.length>0,f);for(const t of tags)assert.ok(t.includes('scrollEnabled={false}'),f+': '+t.slice(0,80));
  }
});
test('titulo do bloco criado por template (Kanban, Formulario, Notas) e editavel',()=>{
  const s=read('src/components/NativeCollectionBlock.tsx');
  assert.ok(s.includes('function BlockTitle(')&&s.includes("accessibilityLabel=\"Título do bloco\""));
  assert.ok(s.includes("commit(next,'collection-title:'+block.id)"));
});

test('arrastar paginas: so redesenha quando o destino muda (com folga na divisa) e a pagina desliza ate o lugar ao soltar',()=>{
  const s=read('src/components/PageTreeList.tsx');
  assert.ok(s.includes('if(same||(!next&&!prev))return;'),'sem redesenho a cada milimetro');
  assert.ok(s.includes('if(prev&&Math.abs(y-d.switchY)<8&&now-d.switchAt<90)return;'),'folga contra o pisca-pisca');
  assert.ok(s.includes('Animated.timing(pan,{toValue:{x:target.kind===\'inside\'?PAGE_INDENT:0,y:toY},duration:140'),'assenta suave');
  assert.ok(s.includes('const commit=()=>{void latest.current.onMove(d.page,target.parentId,target);finish();};'),'nova ordem e fim do arrastar no mesmo quadro');
});

test('notificacoes da agenda como no Google: varias, legado remind_minutes, rotulos e limite de 5',()=>{
  const r=require('./load-ts.cjs')('src/lib/agenda-reminders.ts');
  assert.equal(r.reminderOffsets({reminders_json:'[1440,10,10,120]'}).join(','),'10,120,1440','sem repetidos, em ordem');
  assert.equal(r.reminderOffsets({remind_minutes:30}).join(','),'30','compromisso antigo continua avisando');
  assert.equal(r.reminderOffsets({remind_minutes:''}).length,0);
  const f=r.reminderFields([2880,5,60,5,10080,1,3]);assert.equal(f.reminders_json,'[1,3,5,60,2880]','ate 5');assert.equal(f.remind_minutes,1,'o menor vai para o campo antigo');
  assert.equal(r.reminderFields([]).remind_minutes,'');
  assert.equal(r.reminderLabel(0),'No horário');assert.equal(r.reminderLabel(5),'5 minutos antes');assert.equal(r.reminderLabel(120),'2 horas antes');
  assert.equal(r.reminderLabel(1440),'1 dia antes');assert.equal(r.reminderLabel(5760),'4 dias antes');assert.equal(r.reminderLabel(10080),'1 semana antes');assert.equal(r.reminderLabel(90),'90 minutos antes');
  const n=read('src/lib/agenda-notifications.ts');assert.ok(n.includes("for(const minutes of (offsets.length?offsets:[0])){"),'um aviso por antecedencia');
  const w=read('src/screens/Workspace.tsx');assert.ok(w.includes("item.kind==='commitment'&&f.key==='remind_minutes'?<RemindersField"));
  const h=read('src/components/HomeCommitmentEditor.tsx');assert.ok(h.includes('<RemindersField data={reminders} onChange={setReminders}/>'));
});

test('busca de tarefas acha mesmo com letra errada (Inicio e app de Tarefas)',()=>{
  const fz=require('./load-ts.cjs')('src/lib/fuzzy.ts');
  const items=['Tomar duda','Dentista sexta','Comprar remédio','Ligar para a Carol','Limpeza de pele','Cabelo','Pagar DAS'];
  const q=s=>fz.fuzzyFilter(items,s,x=>x).join('|');
  assert.equal(q('duda'),'Tomar duda');assert.equal(q('dentsta'),'Dentista sexta');assert.equal(q('remedio'),'Comprar remédio');
  assert.equal(q('limpesa pele'),'Limpeza de pele');assert.equal(q('cabeo'),'Cabelo');assert.equal(q('pgar das'),'Pagar DAS');
  assert.equal(q('carro'),'','palavra diferente nao confunde');assert.equal(q(''),items.join('|'));
  const home=read('src/screens/Home.tsx');assert.ok(home.includes('placeholder="🔍 Buscar tarefa"'));assert.ok(home.includes('fuzzyFilter([...tasks]'));
  assert.ok(read('src/lib/task-filters.ts').includes("return fuzzyFilter(base,filter.query"));
});
test('tocar na tarefa programa dia, hora, lembrete e importancia (Inicio, app de Tarefas e Agenda)',()=>{
  const q=read('src/components/TaskQuickSchedule.tsx');
  for(const s of ['Hoje','Amanhã','Sem data','Escolher o dia','Sem horário','Lembrete','Importância','Ver detalhes','Tirar a data'])assert.ok(q.includes(s),s);
  assert.ok(q.includes("notifications:at&&reminder>=0?[String(reminder)]:[]"));
  // 0.3.231: tocar abre os detalhes (como antes); a tela rapida abre pelo Editar
  const h=read('src/screens/Home.tsx'),w=read('src/screens/Workspace.tsx'),td=read('src/components/HomeTaskDetails.tsx');
  assert.ok(h.includes('onPress={()=>openTask(task)}')&&h.includes('onEdit:(t:Task)=>setQuick(t)')&&td.includes('if(onEdit){close();onEdit(task);}'),'Inicio: tocar abre detalhes; Editar tarefa abre a tela rapida');
  assert.ok(h.includes('detailsLabel="Editar título e descrição"')&&td.includes('[editing,setEditing]=useState(startEditing)'),'da tela rapida volta para editar titulo e descricao');
  assert.ok(w.includes("onPress={()=>{setError('');setEditing({...t});}}")&&w.includes("{text:'Editar data e lembrete',onPress:()=>{setError('');setQuick(t);}}"),'Tarefas: tocar abre o editor; segurar > Editar data e lembrete');
  const ag=read('src/screens/Agenda.tsx');assert.ok(ag.includes("if(item.kind==='task')"));assert.ok(ag.includes("item.kind==='task'?'Tarefa'"));
  assert.ok(read('src/components/HomeCommitmentEditor.tsx').includes('[google,setGoogle]=useState(true)'),'compromisso novo ja vai para o Google');
});

test('apps mudam de posicao: ordem guardada, apps novos no fim, setas nos limites nao quebram',()=>{
  const o=require('./load-ts.cjs')('src/lib/app-order.ts');
  const apps=[{id:'capsules'},{id:'tasks'},{id:'finance'},{id:'mail'}];
  assert.equal(o.orderApps(apps,[]).map(a=>a.id).join(','),'capsules,tasks,finance,mail','sem ordem: a padrao');
  assert.equal(o.orderApps(apps,['finance','capsules']).map(a=>a.id).join(','),'finance,capsules,tasks,mail','escolhidos primeiro, novos no fim');
  assert.equal(o.moveApp(['a','b','c'],'b',-1).join(','),'b,a,c');assert.equal(o.moveApp(['a','b','c'],'c',1).join(','),'a,b,c','no limite nao muda');
  const w=read('src/screens/Workspace.tsx');assert.ok(w.includes('<AppGrid items={orderedModules}'),'0.3.221: segurar e arrastar (as setas sairam)');assert.ok(w.includes("AsyncStorage.setItem(APP_ORDER_KEY"));
});

test('lembrete com alarme: tipo de aviso, canal de alarme, repeticao ate desligar, Desligar e Adiar',()=>{
  const n=read('src/lib/agenda-notifications.ts');
  assert.ok(n.includes("usage:Notifications.AndroidAudioUsage.ALARM")&&n.includes('bypassDnd:true'),'volume de alarme, passa pelo Nao perturbe');
  assert.ok(n.includes("const times=event.alarm==='ring'?ALARM_REPEATS:1;")&&n.includes('ALARM_REPEATS=10'),'ate desligar: repete por ate 10 minutos');
  assert.ok(n.includes("identifier:'desligar',buttonTitle:'Desligar'")&&n.includes("identifier:'adiar',buttonTitle:'Adiar 5 min'"));
  assert.ok(n.includes("if(dismissed.has(group))continue;"),'desligado nao volta a ser agendado');
  assert.ok(n.includes("response.actionIdentifier==='adiar'?5:0"));
  const r=read('src/components/RemindersField.tsx');assert.ok(r.includes("label:'Alarme até desligar'")&&r.includes("label:'Som de alarme'"));
  const app=JSON.parse(read('app.json'));const pl=app.expo.plugins.find(x=>Array.isArray(x)&&x[0]==='expo-notifications');assert.deepEqual(pl[1].sounds,['./assets/sounds/sofia_alarm.wav']);
  assert.ok(require('node:fs').statSync(require('node:path').join(__dirname,'..','assets/sounds/sofia_alarm.wav')).size>50000,'som de alarme no app');
});

test('Notas reestruturadas: pastas em cartoes, previa e data da nota, busca, acoes da pasta; dados antigos continuam',()=>{
  const nb=require('./load-ts.cjs')('src/components/NotebookBlock.tsx',{'./MotionModal':{},'../lib/leaf-document':{applyLeafPatch:(p,x)=>({...p,...x})},'./KeyboardViewport':{},'./LeafEditor':{},'react':{useMemo:()=>{},useRef:()=>{},useState:()=>[]},'react-native':{},'react-native-safe-area-context':{},'../lib/theme':{},'./UI':{},'./Sheet':{},'../lib/app-alert':{},'../lib/fuzzy':{fuzzyScore:()=>1},'../lib/desktop':{tap:t=>t,useDesktop:()=>false},'./ContextMenu':{contextMenu:()=>({}),openContextMenu:()=>{}},'./Icon':{Icon:()=>null},'../lib/hover-hold':{useHoverKey:()=>({key:null,enter(){},leave(){}})},'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null,Fragment:'F'}});
  assert.equal(nb.leafPreview({id:'1',title:'',content:'texto   antigo\nlinha'}),'texto antigo linha','nota antiga (so content)');
  assert.equal(nb.leafPreview({id:'2',title:'',content:'',blocks:[{id:'a',text:'Comprar pão',type:'todo',marks:[],checked:true},{id:'b',text:'Ligar',type:'todo',marks:[]}]}),'✓ Comprar pão · ☐ Ligar');
  const hoje=new Date().toISOString();assert.match(nb.leafStamp({id:'3',title:'',content:'',updated_at:hoje}),/^hoje, \d\d:\d\d$/);
  assert.equal(nb.leafStamp({id:'4',title:'',content:''}),'');
  const s=read('src/components/NotebookBlock.tsx');
  for(const t of ['＋ Pasta','＋ Nota','🔍 Buscar nas notas','Trocar ícone','Excluir pasta','Mover para outra pasta','Pasta vazia. Toque para criar a primeira nota.'])assert.ok(s.includes(t),t);
  assert.ok(s.includes("Array.isArray(data.notebooks)?data.notebooks:(data.rows||[])"),'le o formato antigo');
  assert.ok(s.includes("(p as Dated).updated_at=new Date().toISOString()"),'registra a ultima edicao');
});

test('0.3.202: foto do chat abre baixando pelo caminho do "Salvar" (autorizacao garantida) e mostra o motivo se falhar',()=>{
  const s=read('src/screens/Chat.tsx');
  assert.ok(s.includes("temp=await File.downloadFileAsync(source.uri,target,{headers:source.headers,idempotent:true});"));
  assert.ok(s.includes("Não consegui abrir a foto: {error}"),'motivo exato');
  assert.ok(s.includes("return()=>{alive=false;if(temp){try{temp.delete();}"),'ao fechar, a copia sai do celular');
  assert.ok(!/<Image source=\{api\.attachmentSource\(id\)\}/.test(s),'nao depende mais do cabecalho de autorizacao na Image');
});

test('0.3.207: depois de salvar uma conta, vai ao mes e ao lado (A pagar/A receber) dela, confirma onde ficou e avisa se o servidor nao devolveu',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("onSaved({id:saved.id,kind:flow,date:finalDate,title:name.trim()});"));
  assert.ok(s.includes("setMonth(monthOf(saved.date));setPendingSide(saved.kind==='income'?'receber':'pagar');navigateFinance('bills');"));
  assert.ok(!s.includes('setSavedNotice'),'0.3.225: sem o aviso verde depois de salvar (continua indo ao mes e ao lado certos)');
  assert.ok(!s.includes('mas o servidor ainda não devolveu a conta'));
  assert.ok(s.includes("side={pendingSide} onSide={setPendingSide}"),'o lado escolhido nao volta sozinho para A pagar');
});

test('0.3.208: meta com progresso de 0 ate a meta, marcos e projecao (Relatorios e Inicio)',()=>{
  const g=require('./load-ts.cjs')('src/components/GoalProgress.tsx',{react:{},'react-native':{},'../lib/theme':{},'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null},'./Icon':{Icon:()=>null}});
  const st=g.goalStats({name:'Reserva',saved:15000,target:40000,monthly:4000,deadline:'2027-06-30',today:'2026-10-20'});
  assert.equal(Math.round(st.pct*100),38);assert.equal(st.missing,25000);assert.equal(st.next,0.5);assert.equal(st.nextMissing,5000);
  assert.equal(st.reach,'2027-05','4 mil por mes: chega em maio');assert.equal(st.diff,1,'1 mes antes do prazo');
  assert.match(st.message,/Um quarto do caminho/);
  assert.match(g.goalStats({name:'',saved:40000,target:40000,monthly:0,deadline:'',today:'2026-10-20'}).message,/Meta batida/);
  const atras=g.goalStats({name:'',saved:1000,target:40000,monthly:500,deadline:'2027-06-30',today:'2026-10-20'});assert.ok(atras.diff<0&&atras.needed>4000,'atrasado: mostra quanto por mes precisa');
  const f=read('src/screens/Finance.tsx'),h=read('src/screens/Home.tsx');
  assert.ok(f.includes('{goal ? <Fold id="meta" title="Dinheiro guardado"><GoalProgressCard g={goal} flat /></Fold> : null}'),'Relatorios (secao Dinheiro guardado)');
  assert.ok(h.includes('const goal=useFinanceGoal(api,active&&launchVisible);')&&h.includes("<GoalProgressCard g={goal} compact masked={valuesHidden} onToggleMask={()=>setValuesHidden(!valuesHidden)} onPress={()=>onOpenModule?onOpenModule('finance'):navigate('apps')}/>"),'Inicio');
});

test('0.3.210: importar extrato - lista com altura maxima (rola por dentro) e botao Importar sempre visivel',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("<View style={{maxHeight: Math.round(Dimensions.get('window').height * 0.42)"),'a lista nao empurra o botao para fora da tela');
  assert.ok(s.includes('>Marcar todos</Text>')&&s.includes('>Desmarcar todos</Text>'));
  const i=s.indexOf("maxHeight: Math.round(Dimensions.get('window').height * 0.42)"),b=s.indexOf("<Button title={chosenItems.length ? 'Lançar ' + chosenItems.length",i);assert.ok(b>i,'botao logo depois da lista');
});

test('0.3.211: desfazer importacao na engrenagem e conferencia do Saldo item por item',()=>{
  const s=read('src/screens/Finance.tsx'),a=read('src/lib/api.ts');
  assert.ok(a.includes("financeImportUndo(targetId: string)"));
  assert.ok(!s.includes('Desfazer importação de extrato</Text>'),'0.3.219: saiu da engrenagem (apagar o extrato faz isso)');
  assert.ok(!s.includes("'Extrato do saldo'"),'0.3.225: o extrato do saldo saiu a pedido do Pedro');
});

test('0.3.213: Financas reestruturadas - abas, Lancamentos com Extrato do banco (conciliacao), "+" com cinco entradas',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("[{value: 'home' as Tab, label: 'Resumo'}, {value: 'bills' as Tab, label: 'Contas'}, {value: 'cards' as Tab, label: 'Cartões'}, {value: 'refunds' as Tab, label: 'Devoluções'}, {value: 'reports' as Tab, label: 'Relatórios'}]"),'abas; historico de volta no Resumo (0.3.255: + Devolucoes)');
  assert.ok(s.includes('function BankStatements(')&&s.includes("'falta no app'")&&s.includes("'lançado pelo extrato'"),'conciliacao (so leitura desde 0.3.219)');
  assert.ok(s.includes("api.financeStatement(file.text, target.id)"),'importar guarda o extrato a parte');
  assert.ok(s.includes("[['expense', '⏰ Conta a pagar', c.text], ['income', '⏰ Conta a receber', c.text]]"),'+ com conta a pagar e a receber');
  assert.ok(s.includes("statements: g('fin_statement')"));
});

test('0.3.214: Controle de gastos e o Saldo; 100% e o que havia no mes antes de comecar a gastar; historico no Resumo',()=>{
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const tx=(id,amount,date)=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind:'expense',amount,date,account_id:'a1',paid:true,category:'X',recurrence:'none'}});
  const r=f.spendControl([tx('a',2529.58,'2026-10-11')],[],'',{start:'2026-10-01',end:'2026-10-31'},'a1',353.13);
  assert.equal(r.left,353.13,'o valor e o Saldo');assert.equal(r.available,2882.71,'saldo + tudo o que saiu no mes');assert.equal(Math.round(r.pct*100),12);
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("monthControl(d.txs, d.moves || [], reserve?.id || '', month, accountId, controlSaldo, manualStart)"));
  assert.ok(s.includes('<TxTab d={d} month={month} accountFilter="" setAccountFilter={() => undefined} onTx={onTx} api={api} reload={reload} />'),'historico de volta no Resumo');
  assert.ok(!s.includes("label: 'Lançamentos'}, {value: 'cards'"),'sem aba Lancamentos repetida');
});


test('0.3.214: Ajustar saldo com inicio do mes e atual; Controle compara so os dois (receita do mes fica so no atual)',()=>{
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const tx=(id,kind,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:true,category:'X',recurrence:'none',...extra}});
  const r=f.monthControl([tx('g','expense',1596.02,'2026-10-11')],[],'','2026-10','a1',353.13,1949.15);
  assert.equal(r.available,1949.15,'100% = inicio do mes informado');assert.equal(r.left,353.13,'atual = Saldo');assert.equal(Math.round(r.pct*100),18);assert.equal(r.spent,1596.02);
  const sal=f.monthControl([tx('s','income',7821,'2026-10-25',{recurrence:'monthly'})],[],'','2026-10','a1',8174.13,1949.15);
  assert.equal(sal.available,1949.15,'salario (programada) NAO entra no inicio do mes');assert.equal(sal.left,8174.13,'entra so no atual');assert.ok(sal.pct>1,'passa de 100%');
  assert.equal(f.parseMonthStarts('{"2026-10":1949.15,"x":1}')['2026-10'],1949.15);
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('<Button title="Ajustar saldo" secondary')&&!s.includes('Ajustar saldo ao valor do banco'),'nome do botao');
  assert.ok(s.includes('accessibilityLabel="Saldo no início do mês"')&&s.includes('accessibilityLabel="Saldo atual"'),'dois valores');
  assert.ok(s.includes('month_starts_json: JSON.stringify(starts)'),'guarda o inicio do mes');
  assert.ok(s.includes('monthControl(d.txs, d.moves || [], reserve?.id || \'\', month, accountId, controlSaldo, manualStart)'),'controle usa o inicio do mes');
});

test('0.3.214: virada do mes - salario nao mexe no inicio; novembro comeca no saldo daquele momento; mes passado usa o saldo do ultimo dia dele',()=>{
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const mk=(id,kind,amount,date)=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:true,category:'X',recurrence:'none'}});
  const acc=f.toAccount({id:'a1',kind:'fin_account',title:'Conta',state:'active',data:{account_type:'corrente',initial_balance:'1949.15',include_total:true}});
  const saldo=(t,upTo)=>f.totalBalance([acc],t,upTo),ctl=(t,m,s,man=null)=>f.monthControl(t,[],'',m,'a1',s,man);
  let t=[mk('a','expense',200,'2026-10-05'),mk('b','expense',500,'2026-10-12'),mk('sal','income',7821,'2026-10-25'),mk('c','expense',300,'2026-10-28')];
  assert.equal(ctl(t,'2026-10',saldo(t)).start,1949.15,'salario nao mexe no inicio do mes');
  const nov=ctl(t,'2026-11',saldo(t));assert.equal(nov.start,saldo(t),'novembro comeca no saldo daquele momento');assert.equal(Math.round(nov.pct*100),100);
  const t2=[...t,mk('d','expense',150,'2026-11-03')];
  assert.equal(ctl(t2,'2026-11',saldo(t2)).start,saldo(t),'gastar em novembro nao muda o inicio');
  const fim=f.balanceAsOf([acc],t2,[],'','2026-10-31');assert.equal(fim,saldo(t),'saldo no ultimo dia de outubro');
  const out=ctl(t2,'2026-10',fim);assert.equal(out.start,1949.15,'outubro visto depois: inicio certo');assert.equal(out.left,8770.15,'e o agora e o saldo de 31/10, nao o de hoje');
  assert.ok(read('src/screens/Finance.tsx').includes("month < monthOf(today) ? balanceAsOf("));
});

test('0.3.215: receita avulsa divide entre saldo e guardado; programada (salario) nao; a parte do saldo soma ao inicio do Controle',()=>{
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const mk=(id,kind,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:true,category:'X',recurrence:'none',...extra}});
  const acc=f.toAccount({id:'a1',kind:'fin_account',title:'Conta',state:'active',data:{account_type:'corrente',initial_balance:'1949.15',include_total:true}});
  const mv=(amount,date)=>({id:'m'+amount,goalId:'g1',direction:'in',amount,date,entity:{state:'active'}});
  const usable=(t,m)=>f.totalBalance([acc],t)-m.reduce((s,x)=>s+x.amount,0);
  const ctl=(t,m)=>f.monthControl(t,m,'g1','2026-10','a1',usable(t,m),null);
  let txs=[mk('g','expense',1000,'2026-10-11')],moves=[];
  const base=ctl(txs,moves);assert.equal(base.available,1949.15);assert.equal(base.spent,1000);
  txs=[...txs,mk('freela','income',1000,'2026-10-21',{reserve_part:300})];moves=[mv(300,'2026-10-21')];
  const fr=ctl(txs,moves);assert.equal(fr.extra,700,'so o que ficou no saldo');assert.equal(fr.available,2649.15,'soma ao valor inicial');assert.equal(fr.left,1649.15);assert.equal(fr.spent,1000,'o gasto nao muda');
  txs=[...txs,mk('salario','income',7821,'2026-10-25',{recurrence:'monthly'})];
  const sal=ctl(txs,moves);assert.equal(sal.available,2649.15,'salario (programada) NAO soma na base do mes');assert.equal(sal.left,9470.15,'entra no saldo');
  const venda=ctl([...txs,mk('venda','income',500,'2026-10-26')],moves);assert.equal(venda.extra,1200,'venda sem guardado: tudo no saldo');
  assert.equal(f.isOneOffIncome(mk('x','income',1,'2026-10-01')),true);assert.equal(f.isOneOffIncome(mk('x','income',1,'2026-10-01',{recurrence:'monthly'})),false);assert.equal(f.isOneOffIncome(mk('x','income',1,'2026-10-01',{series_id:'s'})),false);
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('Desta receita, quanto vai para o guardado? (R$)')&&s.includes('syncIncomeReserve(api, d, saved.id, goalForSplit.id, split, true, date, title)'),'lancamento de receita');
  assert.ok(s.includes('<SpendCapCard '),'texto do Controle (0.3.310: teto do mes)');
  assert.ok(f.balanceAsOf,'balanceAsOf continua existindo');
});

test('0.3.216: salario e aluguel (programadas) tambem dividem entre saldo e guardado, com o padrao do cadastro e a pergunta no Recebi',()=>{
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const mk=(id,kind,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:true,category:'X',recurrence:'none',...extra}});
  const acc=f.toAccount({id:'a1',kind:'fin_account',title:'Conta',state:'active',data:{account_type:'corrente',initial_balance:'1949.15',include_total:true}});
  const mv=(amount,date)=>({id:'m'+amount,goalId:'g1',direction:'in',amount,date,entity:{state:'active'}});
  const usable=(t,m)=>f.totalBalance([acc],t)-m.reduce((s,x)=>s+x.amount,0);
  const txs=[mk('gasto','expense',1000,'2026-10-11'),mk('salario','income',7821,'2026-10-25',{recurrence:'monthly',reserve_part:4000})],moves=[mv(4000,'2026-10-25')];
  const r=f.monthControl(txs,moves,'g1','2026-10','a1',usable(txs,moves),null);
  assert.equal(r.left,4770.15,'o saldo recebe so o que nao foi para o guardado (7821 - 4000)');
  assert.equal(r.available,1949.15,'a base do mes continua parada (programada so entra na virada)');
  assert.equal(r.extra,0);assert.equal(mk('s','income',100,'2026-10-01',{recurrence:'monthly',reserve_part:40}).reservePart,40,'o padrao fica na receita');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('Desta receita, quanto vai para o guardado todo mês? (R$)')&&s.includes('Quanto vai para o guardado todo mês'),'cadastro todo mes');
  assert.ok(s.includes('reserve_part:reserveAmt>0?reserveAmt:\'\''),'padrao gravado na receita programada');
});

test('0.3.217: Recebi manda sozinho a parte do guardado (sem pergunta); editar o item atualiza o aporte; vale para avulsa e programada',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(!s.includes('Quanto desse valor vai para o guardado?')&&!s.includes('setSplitOpen'),'sem pergunta no Recebi');
  assert.ok(s.includes('async function receiveTx(')&&s.includes('void receiveTx(api, d, due.tx)')&&s.includes('void receiveTx(api, d, t)'),'Recebi (Contas e Historico) usa a parte ja cadastrada');
  assert.ok(s.includes('async function syncIncomeReserve(')&&s.includes('await api.deleteEntity(linked.entity.id)'),'aporte ligado acompanha: cria, ajusta, apaga');
  assert.ok(s.includes("syncIncomeReserve(api, d, savedTx.id, goalForSplit.id, editSplit, paid && !isCard, date, title)"),'editar a receita atualiza o aporte');
  assert.ok(s.includes("syncIncomeReserve(api,finance,saved.id,g.id,reserveAmt,!!data.paid,finalDate,name.trim())"),'editar a conta a receber atualiza o aporte');
  assert.ok(s.includes("syncIncomeReserve(api, d, tx.entity!.id, g.id, 0, false, tx.date || '', tx.desc || '')"),'desfazer o recebimento tira o aporte');
  assert.ok(s.includes("Desta receita, quanto vai para o guardado{repeat==='monthly'?' todo mês':''}? (R$)"),'campo para qualquer receita');
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const t=f.toTx({id:'t',kind:'fin_tx',title:'Salário',state:'active',data:{kind:'income',amount:7821,date:'2026-09-25',account_id:'a1',paid:true,category:'Salário',recurrence:'monthly',reserve_part:4000}});
  const v=f.expandRecurring([t],'2026-10')[0];assert.equal(v.reservePart,4000,'a ocorrencia do mes herda a parte do guardado');
});

test('0.3.217: apagar ou desfazer uma receita que mandou parte para o guardado avisa o que acontece com o aporte',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("' que foi para o guardado também é apagada do guardado (só esse aporte; os seus outros aportes não mudam).'"),'apagar lancamento');
  assert.ok(s.includes("' que foi para o guardado também sai de lá até você receber de novo.'"),'desfazer recebimento');
  assert.ok(s.includes("' que foi para o guardado neste recebimento também é apagado.'"),'apagar conta a receber ja recebida');
});

test('0.3.218: despesas e receitas com horario opcional (lancamento, conta, historico, aviso)',()=>{
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const t=f.toTx({id:'x',kind:'fin_tx',title:'iFood',state:'active',data:{kind:'expense',amount:45,date:'2026-10-20',account_id:'a1',paid:true,category:'Alimentação',recurrence:'none',time:'20:15'}});
  assert.equal(t.time,'20:15');
  assert.equal(f.toTx({id:'y',kind:'fin_tx',title:'x',state:'active',data:{kind:'expense',amount:1,date:'2026-10-20',time:'abc'}}).time,'','horario invalido vira vazio');
  const v=f.expandRecurring([f.toTx({id:'s',kind:'fin_tx',title:'Academia',state:'active',data:{kind:'expense',amount:129,date:'2026-09-11',account_id:'a1',paid:true,category:'Contas',recurrence:'monthly',time:'07:00'}})],'2026-10')[0];
  assert.equal(v.time,'07:00','a ocorrencia do mes herda o horario');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('label="Horário (opcional)" value={time} onChange={v => setTime(v ? String(v).slice(0, 5)'),'lancamento');
  assert.ok(s.includes('label="Horário (opcional)" value={time} onChange={v=>setTime(v?String(v).slice(0,5)'),'conta a pagar/receber');
  assert.ok(s.includes("{t.time ? t.time + ' · ' : ''}{cat.name}"),'historico mostra o horario');
  assert.ok(s.includes("(b.time || '').localeCompare(a.time || '')"),'ordem dentro do dia');
  assert.ok(s.includes("time: t.time || '',"),'confirmar mantem o horario');
  assert.ok(read('src/lib/finance-notifications.ts').includes("const date = new Date(year,month-1,day-offset,hh,mm,0);"),'aviso no horario da conta');
});

test('0.3.219: Receitas/Despesas - titulo e valor fixos no topo, fundo solido, lista rolando por baixo',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('stickyHeaderIndices={parts ? undefined : [0]}'),'cabecalho fixo');
  const i=s.indexOf('stickyHeaderIndices={parts ? undefined : [0]}'),h=s.indexOf('<View style={{backgroundColor: c.surface, paddingBottom: 10, gap: 2, borderBottomWidth: 1, borderColor: c.line}}>',i);
  assert.ok(h>i,'titulo e valor num bloco com fundo solido (sem transparencia)');
  assert.ok(s.indexOf("{parts ? null : <View>",h)>h,'a lista vem depois, como item separado que rola por baixo');
});

test('0.3.219: extrato do banco so fica guardado (nao mexe na conta); arrastar para apagar; setinha unica; sem opcao na engrenagem',()=>{
  const s=read('src/screens/Finance.tsx'),a=read('src/lib/api.ts');
  assert.ok(s.includes("if (target.type === 'account') { await api.financeStatement(file.text, target.id); await onDone(); return; }"),'importar so guarda');
  const b=s.slice(s.indexOf('function BankStatements('),s.indexOf('\nfunction ',s.indexOf('function BankStatements(')+20));
  assert.ok(!b.includes('Lançar</Text>')&&!b.includes('Acertar Saldo</Text>'),'o extrato nao lanca nem acerta o saldo');
  assert.ok(b.includes('<SwipeToDelete key={st.id}')&&s.includes('function SwipeToDelete(')&&a.includes('financeStatementDelete(id: string)'),'arrastar para apagar');
  assert.ok(s.includes('function Chevron(')&&b.includes('<Chevron open={open === st.id} />')&&s.includes('<Chevron open={!!open} />'),'mesma setinha no extrato e nos Relatorios');
  assert.ok(!s.includes('Desfazer importação de extrato</Text>'),'saiu da engrenagem');
});

test('0.3.220: seletores compactos (do tamanho do texto) - Lancamentos | Extrato do banco e A pagar | A receber',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("function Segmented<T extends string>")&&s.includes("alignSelf: 'flex-start'"),'nao estica na largura toda');
  assert.ok(s.includes("<Segmented value={source} onChange={setSource} options={[{value: 'app' as const, label: 'Lançamentos'}, {value: 'months' as const, label: 'Histórico'}]} />"));
  assert.ok(s.includes("<Segmented value={side} onChange={setSide} options={[{value: 'pagar' as const, label: 'A pagar'}, {value: 'receber' as const, label: 'A receber'}]} />"));
  assert.ok(!s.includes("borderRadius:14,padding:4}}>"),'o seletor esticado saiu');
});

test('0.3.221: Apps arrastaveis como no iPhone; Inicio: segurar um widget abre o seletor com puxador',()=>{
  const g=read('src/components/AppGrid.tsx'),l=read('src/components/ReorderList.tsx'),sw=read('src/components/SortableWidgets.tsx'),w=read('src/screens/Workspace.tsx'),h=read('src/screens/Home.tsx');
  assert.ok(g.includes('const GAP=12,H=148,COLS=2,HOLD=170;')&&g.includes('onShouldBlockNativeResponder:()=>false')&&g.includes("Animated.parallel([ease(scale,1.06,180),ease(lift,1,180)])"),'segura, cresce e segue o dedo; rolagem livre antes de segurar');
  assert.ok(g.includes('if(target!==cur){const next=[...idsRef.current];next.splice(cur,1);next.splice(target,0,id)'),'os outros abrem espaco');
  assert.ok(w.includes('<AppGrid items={orderedModules} onMenu={setHighlightFor} onDragging={on=>{setDraggingApp(on);onGestureLock?.(on);}} onReorder={saveAppOrder}')&&w.includes('scrollEnabled={!draggingApp}'),'apps usam a grade; a tela nao rola durante o arrasto');
  assert.ok(!w.includes('Use as setas para mudar os apps de lugar.'),'saiu o modo das setas');
  assert.ok(l.includes('onPanResponderTerminationRequest:()=>false')&&l.includes('useLayoutEffect(()=>{if(reset.current)'),'lista com puxador sem pulo ao soltar');
  assert.ok(sw.includes('const HOLD=450;')&&sw.includes('Organizar Início</Text>')&&sw.includes('<ReorderList '),'segurar abre o seletor');
  assert.ok(sw.includes("if(noHold.includes(id))return <View key={id} onLayout={e=>measure(id,e.nativeEvent.layout.height)}>{item.content}</View>;"),'widget que usa o segurar para outra coisa nao abre o seletor (0.3.264: medido para equilibrar as colunas)');
  assert.ok(h.includes("{id:'goal',title:'Meta',content:<GoalProgressCard"),'meta e widget ordenavel');
  assert.ok(h.includes('export function withFixedWidgets(order:string[],goalHidden=false):string[]')&&h.includes('order={withFixedWidgets(widgets,goalHidden)}'),'listas antigas recebem agenda e meta no topo');
});

test('0.3.222: Previsto no fim do proximo mes; agenda fixa; meta sem espaco extra; busca de tarefas dentro da caixa',()=>{
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const tx=(id,kind,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:false,category:'X',recurrence:'none',import_id:'sofia-pendencia:'+id,...extra}});
  const txs=[tx('salario','income',7821,'2026-09-25',{recurrence:'monthly',paid:true,reserve_part:4000}),tx('aluguel','income',1853.94,'2026-10-25',{recurrence:'monthly'}),tx('contas','expense',4793.43,'2026-10-25',{recurrence:'monthly'})];
  const r=f.moneyLeft(txs,[],{start:'2026-10-01',end:'2026-11-30'},'a1',353.13,8000,'2026-10-20');
  assert.equal(r.toReceive,11349.88,'salario e aluguel de outubro e novembro, sem a parte do guardado');assert.equal(r.toGuard,8000);
  assert.equal(r.toPay,9586.86);assert.equal(r.aporte,0,'a parte do guardado do salario ja e o aporte');assert.equal(r.left,2116.15);
  const sem=f.moneyLeft([tx('c','expense',100,'2026-10-25')],[],{start:'2026-10-01',end:'2026-11-30'},'a1',1000,4000,'2026-10-20');assert.equal(sem.aporte,4000,'sem parte do guardado, o aporte planejado conta inteiro');
  const s=read('src/screens/Finance.tsx'),h=read('src/screens/Home.tsx');
  assert.ok(s.includes('const r = upcoming ? cycleRange(cycleDay, nextPay) : cur;'),'0.3.224: previsto ate a vespera do proximo salario');
  const ai=h.indexOf('<MiniAgenda '),si=h.indexOf('<SortableWidgets fixed={HOME_FIXED_WIDGETS}');assert.ok(h.includes('lead={<MiniAgenda ')||(ai>0&&ai<si),'agenda fixa antes da lista (0.3.264: no computador ela abre a 1a coluna como lead)');
  assert.ok(!h.includes("{id:'agenda'"),'agenda fora do organizador');
  assert.ok(!s.includes('<View style={{marginBottom: 18}}><GoalProgressCard'),'meta sem margem extra');
  assert.ok(h.includes("...(goal?[{id:'goal'"),'sem meta, sem espaco vazio');
  const box=h.indexOf("todo.length||(tasks.length>2||taskQuery)?<View style={{backgroundColor:c.surface,borderRadius:18"),inp=h.indexOf('accessibilityLabel="Buscar tarefa no Início"');
  assert.ok(box>0&&inp>box,'busca dentro da caixa');assert.ok(h.includes('marginTop:14,marginBottom:6}}'),'com respiro');
  assert.ok(h.includes("marginTop:0,marginBottom:12}}><Text style={{fontSize:20,fontWeight:'500',color:c.text}}>Tarefas</Text>"),'titulo e filtro logo acima da caixa (0.3.257: Tarefas backlog)');
});

test('0.3.223: Redefinir Financas; Relatorios na ordem pedida e todas as secoes abrem/fecham; contas no cartao',()=>{
  const s=read('src/screens/Finance.tsx'),g=read('src/components/GoalProgress.tsx');
  assert.ok(s.includes('>Redefinir Finanças</Text>')&&!s.includes('Zerar Finanças')&&s.includes("resetWord.trim().toUpperCase() === 'REDEFINIR'"),'nome profissional');
  const r=s.slice(s.indexOf('function ReportsTab('));
  const pos=['<Fold id="categorias" title="Por categoria">','<Fold id="guardado"','<Fold id="meta" title="Dinheiro guardado">','<Fold id="saldo"','<Fold id="semana"','<Fold id="seis"'].map(x=>r.indexOf(x));
  assert.ok(pos.every(p=>p>0),'todas as secoes existem e abrem/fecham: '+pos);
  assert.deepEqual([...pos].sort((a,b)=>a-b),pos,'ordem: categoria, evolucao do guardado, dinheiro guardado, evolucao do saldo, semana, comparado, 6 meses');
  assert.ok(!r.slice(0,r.indexOf('\nfunction ',10)).includes('para mudar, use a engrenagem'),'sem frase velha');
  assert.ok(g.includes('flat?{gap:10}:'),'meta sem caixa dentro de caixa');
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const card={id:'c1',name:'Nubank',limit:5000,closing:3,due:10,color:'#000',accountId:'a1',archived:false,entity:null};
  const adobe=f.toTx({id:'adobe',kind:'fin_tx',title:'Adobe',state:'active',data:{kind:'expense',amount:47,date:'2026-09-11',account_id:'a1',card_id:'c1',paid:false,category:'Contas',recurrence:'monthly',import_id:'sofia-pendencia:adobe'}});
  const inv=f.cardInvoices(card,[adobe],'2026-10-20');
  assert.equal(JSON.stringify(inv.slice(0,3).map(i=>[i.month,i.total])),JSON.stringify([['2026-09',47],['2026-10',47],['2026-11',47]]),'conta fixa no cartao cai na fatura todo mes (0.3.223: na fatura do mes da propria conta)');
  assert.equal(f.cardUsed(card,[adobe],'2026-10-20'),94,'usado so com o que ja foi cobrado');
  const due=f.monthDues([adobe],'a1','2026-10','2026-10-20');assert.equal(due.length,1);assert.equal(due[0].late,false,'conta do cartao nao fica atrasada');
  assert.equal(f.effect(adobe,'a1'),0,'nao sai do saldo direto');
  const fx=f.fixedSummary([adobe],'a1',{start:'2026-10-01',end:'2026-10-31'});assert.equal(fx.card,47);assert.equal(fx.open,0,'no cartao nao conta em faltam');
  assert.ok(!s.includes('<Title text="Contas no cartão" />')&&s.includes('>Usar conta existente</Text>')&&s.includes('>Nova conta</Text>'),'aba Cartoes (0.3.223: sem o bloco repetido; botoes na fatura)');
  assert.ok(s.includes("options={[{value:'',label:'Não'},...cardsList.map(k=>({value:k.id,label:'💳 '+k.name}))]}")&&s.includes('>Feita no cartão</Text>'),'0.3.224: marcar no editar que foi feita no cartao');
  assert.ok(s.includes('async function startSeriesNextMonth(')&&s.includes("o cartão vale a partir do mês que vem"),'conta ja paga este mes passa ao cartao no mes seguinte');
  assert.ok(s.includes("💳 {due.title}")&&s.includes("const open=list.filter(row=>!row.paid&&!row.tx?.cardId)"),'simbolo em Contas e fora dos totais');
});

test('0.3.224: rascunho velho nao volta; fechar o cadastro descarta; Redefinir apaga; menu sem linha dupla; cartao e identificacao; previsto pelo ciclo do salario',()=>{
  const fd=read('src/lib/form-draft.ts'),s=read('src/screens/Finance.tsx');
  assert.ok(fd.includes('const MAX_AGE = 6 * 60 * 60 * 1000;')&&fd.includes("JSON.stringify({v: value, at: Date.now()})")&&fd.includes("typeof box.at !== 'number'"),'rascunho com hora e validade (o formato antigo nao volta)');
  assert.ok(fd.includes('export async function clearAllFormDrafts('),'apagar todos');
  assert.ok(s.includes('<Sheet visible onClose={() => { void clearDraft(); onClose(); }} label="Fechar cadastro de vencimento">'),'fechar descarta o rascunho');
  assert.ok(s.includes('await clearAllFormDrafts(); setResetBusy(false);'),'Redefinir apaga os rascunhos');
  assert.ok(s.includes("borderBottomWidth: flow === 'expense' ? 1 : 0, borderColor: c.line}}>")&&!s.includes("afterSheet(() => setBillEditor('new')); }} style={{paddingVertical: 15, borderTopWidth: 1"),'menu sem linha dupla');
  assert.ok(!s.includes('>Pagar com</Text>'),'sem "pagar com"');
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const addDays=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
  const end=(day,ref)=>{const cur=f.cycleRange(day,ref),next=addDays(cur.end,1),left=Math.round((Date.parse(next+'T12:00:00Z')-Date.parse(ref+'T12:00:00Z'))/864e5);return left<=5?f.cycleRange(day,next).end:cur.end;};
  assert.equal(end(25,'2026-10-10'),'2026-10-24','recebe dia 25: vespera do salario');
  assert.equal(end(25,'2026-10-21'),'2026-11-24','a 4 dias do salario: ja mostra o ciclo seguinte');
  assert.equal(end(5,'2026-10-10'),'2026-11-04','recebe dia 5');
  assert.equal(end(0,'2026-10-21'),'2026-10-31','sem dia de salario: fim do mes');
});

test('0.3.225: sem aviso verde ao salvar; mes que ainda nao chegou fica zerado no Resumo',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(!s.includes('salvo em ')&&!s.includes('savedNotice'),'sem o aviso');
  assert.ok(s.includes("setMonth(monthOf(saved.date));setPendingSide(saved.kind==='income'?'receber':'pagar');navigateFinance('bills');"),'continua indo ao mes e ao lado certos');
  assert.ok(s.includes('const future = month > monthOf(today);'));
  for(const t of ['{show(future ? 0 : total)}','{show(future ? 0 : forecastP.left)}','{show(future ? 0 : s.income)}','{show(future ? 0 : s.expense)}'])assert.ok(s.includes(t),t);
  assert.ok(fs.readFileSync(path.join(__dirname,'..','src/screens/finance/SpendCap.tsx'),'utf8').includes('ainda não começou. Os números passam a contar quando o mês chegar.'),'explica');
});

test('0.3.226: aporte fora de "A vencer e atrasadas"; receita programada no Historico desde o comeco do mes',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(!s.includes("{aporte&&aporte.monthTarget>0?(aporte.missing>0"),'sem o aporte na lista');
  assert.ok(s.includes("(pendingIncome(t) || !t.manualDue || t.paid || !isScheduled(t))"),'receita a receber aparece o mes todo');
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const sal=f.toTx({id:'sal',kind:'fin_tx',title:'Salário',state:'active',data:{kind:'income',amount:7821,date:'2026-09-25',account_id:'a1',paid:true,category:'Salário',recurrence:'monthly',import_id:'sofia-pendencia:sal'}});
  const conta=f.toTx({id:'c',kind:'fin_tx',title:'Internet',state:'active',data:{kind:'expense',amount:100,date:'2026-10-15',account_id:'a1',paid:false,category:'Contas',recurrence:'none',import_id:'sofia-pendencia:c'}});
  const shown=f.monthTxs([sal,conta],'2026-10').filter(t=>(t.kind==='income'&&!t.paid)||!t.manualDue||t.paid);
  assert.equal(shown.length,1,'o salario de outubro aparece desde o dia 1; a conta a pagar fica so em Contas');assert.equal(shown[0].desc,'Salário');
});

test('0.3.227: segurar widget nao abre a tela; meta removivel; arrastar app trava as telas; seletor largo; menos espaco; relatorios; repetidos',()=>{
  const sw=read('src/components/SortableWidgets.tsx'),h=read('src/screens/Home.tsx'),w=read('src/screens/Workspace.tsx'),s=read('src/screens/Finance.tsx'),a=read('src/lib/api.ts');
  assert.ok(sw.includes("setNonce(n=>({...n,[id]:(n[id]||0)+1}))")&&sw.includes("key={id+':'+(nonce[id]||0)}"),'o toque do widget segurado e cancelado');
  assert.ok(h.includes("export const HOME_FIXED_WIDGETS:string[]=[];")&&h.includes('order={withFixedWidgets(widgets,goalHidden)} onSave={saveHomeOrder}'),'meta pode sair');
  assert.ok(w.includes('onDragging={on=>{setDraggingApp(on);onGestureLock?.(on);}}')&&read('App.tsx').includes('load={loadWorkspace} screenProps={{onModuleChange:setAppsModule,onGestureLock:setGestureLocked,'),'arrastar app nao troca de tela');
  assert.ok(s.includes("style={{flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center'"),'seletor de duas metades');
  assert.ok(s.includes('paddingBottom: 84')&&s.includes('bottom: 16, width: 56, height: 56,'),'menos espaco embaixo');
  assert.ok(!s.includes('<Fold id="comparado"'),'sem comparado ao mes anterior');
  assert.ok(s.includes("lastWeekByCategory(full.txs.filter(t => !t.manualDue && t.recurrence === 'none' && !t.seriesId), '')"),'semana passada so avulsas');
  assert.ok(a.includes('/Campo não previsto: ([a-z_]+)/'),'servidor atrasado nao trava o salvar');
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const mk=(id,title,amount,extra={})=>f.toTx({id,kind:'fin_tx',title,state:'active',data:{kind:'income',amount,date:'2026-11-12',account_id:'a1',paid:false,category:'Contas',recurrence:'monthly',import_id:'sofia-pendencia:'+id,...extra}});
  const g=f.fixedDuplicateGroups([mk('a','Quinto andar (aluguel)',1853.94),mk('b','Quinto andar (aluguel)',1853.94),mk('c','Quinto Andar(aluguel)',1853.54),mk('x','Outra',10)]);
  assert.equal(g.length,1);assert.equal(g[0].items.length,3,'mesmo nome (sem diferenca de maiuscula/espaco) e dia');
  assert.ok(s.includes('<FixedDupCard d={d} api={api} reload={reload} />'),'aviso em Contas e no Resumo');
});

test('0.3.228: fixa que comeca no mes seguinte aparece em Contas ("comeca em"), fora dos totais, com "Contar em <mes>"',()=>{
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const mk=(id,title,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title,state:'active',data:{kind:'income',amount,date,account_id:'a1',paid:false,category:'Contas',recurrence:'monthly',import_id:'sofia-pendencia:'+id,...extra}});
  const txs=[mk('q','Quinto andar (aluguel)',1853.94,'2026-11-12'),mk('s','Salário',7821,'2026-09-25',{paid:true})];
  const out={start:'2026-10-01',end:'2026-10-31'};
  assert.equal(f.fixedUpcoming(txs,'a1',out,'income').map(t=>t.desc).join(),'Quinto andar (aluguel)','aparece em outubro');
  assert.equal(f.fixedSummary(txs,'a1',out,'income').total,7821,'fora do total de outubro');
  assert.equal(f.fixedUpcoming(txs,'a1',{start:'2026-11-01',end:'2026-11-30'},'income').length,0,'em novembro ja esta na lista normal');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("{to?'de '+from+' a '+to:'a partir de '+from}")&&!s.includes('Contar em {range.label}')&&s.includes('{fx.bills.length||upcomingFx.length ? <Card_>'),'0.3.230: igual as outras, sem botao');
});


test('0.3.232: Contas so com programadas, avulsas so no extrato; copias identicas do aluguel somem sozinhas',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('monthDues(d.txs,accountId,month,today,settled).filter(r=>isScheduled(r.tx))')&&s.includes('(pendingIncome(t) || !t.manualDue || t.paid || !isScheduled(t))'));
  assert.ok(s.includes('const extras = exactTwinExtras(data.txs).filter(t => !twinsTried.current.has(t.id));'));
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const mk=(id,title,amount,created,extra={})=>{const t=f.toTx({id,kind:'fin_tx',title,state:'active',data:{kind:'income',amount,date:'2026-11-12',account_id:'a1',paid:false,category:'Contas',recurrence:'monthly',installments:5,installment:1,import_id:'sofia-pendencia:'+id,...extra}});t.entity.created_at=created;return t;};
  const txs=[mk('a','Quinto andar (aluguel)',1853.94,'2026-10-20T10:00'),mk('b','Quinto andar (aluguel)',1853.94,'2026-10-20T11:00'),mk('c','Quinto andar (aluguel)',1853.94,'2026-10-21T00:10'),mk('d','Quinto Andar(aluguel)',1853.54,'2026-10-20T09:00',{installments:'',installment:''})];
  assert.equal(f.exactTwinExtras(txs).map(t=>t.id).join(','),'b,c','as duas copias iguais saem; fica a mais antiga');
});

test('0.3.234: o previsto conta so os aportes de hoje em diante (nao o do ciclo que ja passou)',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('simpleForecast(d.txs, d.cards, r, accountId, today, aporteInCycle(r))'));
});

test('0.3.234: previsto conta so os aportes de hoje em diante; itens de Financas com descricao breve',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('simpleForecast(d.txs, d.cards, r, accountId, today, aporteInCycle(r))'),'aporte do ciclo que ja passou nao entra');
  assert.ok(s.includes("const {__content, ...rest} = data, content = typeof __content === 'string' ? __content : undefined;"),'descricao vai no conteudo do registro');
  assert.ok(s.includes("time: time || '', __content: note.trim(), no_balance:")&&s.includes("__content:note.trim(),"),'lancamento e conta');
  assert.ok((s.match(/Descrição \(opcional\)<\/Text>/g)||[]).length===2&&s.includes('maxLength={280}'),'caixa pequena nos dois formularios');
  assert.ok(s.includes('<Field label="Nome" value={desc} onChange={setDesc}'),'o nome do lancamento virou Nome');
});

test('0.3.233-0.3.236: aporte do previsto so de hoje em diante; descricao nos itens; Biblioteca sem fotos da conversa; apagar regra; apps sem animacao ao abrir',()=>{
  const s=read('src/screens/Finance.tsx'),w=read('src/screens/Workspace.tsx'),m=read('src/screens/Mail.tsx'),g=read('src/components/AppGrid.tsx');
  assert.ok(s.includes('simpleForecast(d.txs, d.cards, r, accountId, today, aporteInCycle(r))'),'aporte que ja passou nao entra no previsto');
  assert.ok(s.includes('const {__content, ...rest} = data')&&s.includes("__content: note.trim(), no_balance:")&&s.includes('__content:note.trim(),'),'descricao no lancamento e na conta');
  assert.ok((s.match(/Descrição \(opcional\)/g)||[]).length>=2&&s.includes('maxLength={280}'),'caixa pequena');
  assert.ok(w.includes("(e.tags||[]).includes('chat-attachment')")&&w.includes('!isChatAttachment(item)'),'Biblioteca sem anexos da conversa');
  assert.ok(m.includes("{deleting ? 'Apagando…' : 'Apagar regra'}")&&m.includes('catch (e) { setError(errorText(e)); }'),'apagar regra mostra o andamento e o erro');
  assert.ok(w.includes('{!orderReady?<AppGridSkeleton count={modules.length}/>:<AppGrid items={orderedModules}')&&w.includes('let cachedAppOrder:string[]|null=null;'),'apps abrem na ordem salva');
  assert.ok(g.includes('if(first||!live)p(id).setValue(s);'),'so anima ao arrastar');
});
