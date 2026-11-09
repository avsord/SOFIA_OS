'use strict';
// 0.3.146: amarra os pontos de comportamento do lote (notificacoes, e-mails, retomada, Price Tracker, financas).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('notificacoes: arrastar para a direita marca lida; feriado nao gera aviso no celular; sem texto tecnico',()=>{
  const n=read('src/components/NotificationCenter.tsx');
  assert.ok(n.includes("onRead={unread?()=>void notices.read(item):dose?()=>void takeDose():undefined}"));
  assert.ok(n.includes('if(onRead&&g.dx>SWIPE_READ)onRead();'));
  assert.ok(!n.includes('A limpeza global aguarda a atualização do servidor'));
  assert.ok(read('src/lib/agenda-notifications.ts').includes('holiday@group'));
});
test('e-mails: grupos e selecao pelo titulo; Conta Google nao aparece como "falta a senha de app"; abrir no Gmail',()=>{
  const m=read('src/screens/Mail.tsx');
  assert.ok(m.includes('export function selectionAccounts(sel: MailSelection, accounts: Entity[])'));
  assert.ok(m.includes("a.data.provider === 'gmail_google' ? 'pela Conta Google'"));
  assert.ok(m.includes('title="Abrir no Gmail"'));
  assert.ok(m.includes("onDone={(action) => { setRuleSheet(null); void load(); if (rescanAfterRule(action)) void check(14); }}"),'regra nova reavalia 14 dias');
  assert.ok(m.includes("if (r.errors.length) { setError('Conta salva como Conta Google, mas o teste falhou: '"));
});
test('retomada: erro de demora so do chat fala em "mensagem"; leitura interrompida repete; teclado e abas na volta',()=>{
  const a=read('src/lib/api.ts');
  assert.ok(a.includes("isChatSend(path, method) ? 'A conexão demorou. Recarregue antes de reenviar: sua mensagem pode ter chegado.' : 'A Sofia demorou para responder. Tente de novo.'"));
  // 09/11/2026: leitura que perde a conexao (interrompida ou nao, inclusive no meio da resposta) repete antes do erro
  assert.ok(a.includes("e.code==='TIMEOUT'||e.code==='NETWORK')){"));
  assert.ok(a.includes("if (controller.signal.aborted || (bodyError as any)?.name === 'AbortError' || bodyError instanceof TypeError) throw bodyError;"));
  assert.ok(read('App.tsx').includes('TextInput.State.blurTextInput(f)'));
  assert.ok(read('src/components/TabPager.tsx').includes("if(state==='active'){selection.current.cancelDrag();aligned.current=null;align();clearPreview();}"));
});
test('Price Tracker: sem busca automatica de lojas; Inicio mostra a oferta principal; outras ofertas recolhidas e acompanhadas',()=>{
  const p=read('src/screens/Monitoring.tsx'),lib=read('src/lib/monitoring.ts');
  assert.ok(!p.includes('label="Encontrar em outras lojas"'));
  assert.ok(p.includes("outras ofertas ({stores.filter(s => !s.primary).length})"));
  assert.ok(p.includes('label="Mover para outro produto"'));
  assert.ok(lib.includes('export function primaryNow(p: ProductSeries)'));
});
test('financas: card de reserva (verde desde a 0.3.153) atrás do saldo roxo com detalhamento sem valor redundante',()=>{
  const f=read('src/screens/Finance.tsx');
  assert.ok(f.includes("backgroundColor: accountId ? GUARD : 'transparent'"),'o guardado tem cartao verde proprio atras do roxo');
  assert.ok(f.includes('Gerenciar dinheiro guardado') && f.includes('>{split ? show(split.saved) :'), 'valor e gesto de abrir');
  assert.ok(!f.includes('>Para usar<'),'reserva nao compete com saldo');
  assert.ok(!f.includes('function MoneyBlocks('),'nao restaurar blocos duplicados');
  assert.ok(f.includes("fontSize: 13}}>Saldo</Text>"),'0.3.182: so "Saldo"');
  for(const label of ['Saldo (para usar)','Guardado + Saldo','Despesas previstas do mês','Livre após despesas previstas','Guardar dinheiro','Retirar da reserva'])assert.ok(f.includes(label),label);
  assert.ok(f.includes("appAlert('Retirar da reserva?'"),'retirada confirmada');
  assert.ok(f.includes('onChangeText={v => setAmount(old => formatMoneyInput(v, old))}'),'lançamento recebe máscara enquanto digita');
  assert.ok(f.includes('onBlur={() => setAmount(v => finishMoneyInput(v))}'),'termina mostrando centavos');
  assert.ok(f.includes("label.includes('(R$)')"),'formatação nos campos de valores sem mexer no dia de fatura');
});
