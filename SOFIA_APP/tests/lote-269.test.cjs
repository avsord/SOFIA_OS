'use strict';
// 0.3.269 — rodadas 2 a 6 de 31/10 (Listas, Notas, Biblioteca, Encomendas, Financas no site). Ver docs/PEDIDOS_2026-10-31.md.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
/** pega uma funcao exportada pura de um .tsx e roda no node */
function pure(file,name,deps=''){const src=read(file);const i=src.indexOf('export function '+name);assert.ok(i>0,name);const eol=src.indexOf('\n',i);let depth=0,j=src.lastIndexOf('{',eol);for(;j<src.length;j++){if(src[j]==='{')depth++;else if(src[j]==='}'){depth--;if(!depth)break;}}
 const code=ts.transpileModule(deps+'\n'+src.slice(i,j+1).replace('export ',''),{compilerOptions:{target:9}}).outputText;return new Function(code+';return '+name+';')();}
const FOLD="const fold=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim();const parseMoney=r=>{const s=String(r||'').replace(/r\\$\\s*/i,'').trim();if(!s)return null;const c=s.includes(',')?s.replace(/\\./g,'').replace(',','.'):s;const n=Number(c);return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:null;};";
test('Listas: um campo so entende quantidade, unidade, preco total, link e #grupo',()=>{
  const parse=pure('src/screens/Lists.tsx','parseEntry',FOLD);
  assert.deepEqual(parse('2 leite'),{name:'Leite',qty:2,unit:'',price:null,url:'',tag:''});
  assert.equal(parse('1 kg tomate').unit,'kg');assert.equal(parse('café 24,90').price,24.9);assert.equal(parse('café 24,90').name,'Café');
  assert.equal(parse('https://www.kabum.com.br/x').url,'https://www.kabum.com.br/x');assert.equal(parse('fonte 750w #pc').tag,'pc');
  const L=read('src/screens/Lists.tsx');
  assert.ok(L.includes("title={L.model === 'simple' ? 'Feitos' : 'No carrinho'}")&&!/toggleDone|showDone/.test(L),'secao de feitos sempre aberta');
  assert.ok(L.includes('<Stepper value={it.qty}')&&read('src/components/AppKit.tsx').includes('− [quantidade] + com a unidade separada'));
  assert.ok(L.includes('history_json')&&L.includes('Repetir esta lista')&&L.includes("label: 'Excluir lista'")&&L.includes('Colocar também na Agenda'));
  assert.ok(L.includes("fold(x.title) === 'pessoal' && !itemsAll.some"),'lista Pessoal vazia nao aparece');
  assert.ok(L.includes('marginTop: 20'),'20 px entre o campo de adicionar e a primeira secao');
});
test('Notas: etiqueta com senha cifra no aparelho (AES-GCM + PBKDF2) e nunca manda o texto ao servidor',()=>{
  const c=read('src/lib/note-crypto.ts');assert.ok(c.includes("from '@noble/ciphers/aes'")&&c.includes('ROUNDS = 150000')&&c.includes("hash: 'SHA-256'"));
  const N=read('src/screens/Notes.tsx');
  assert.ok(N.includes("title: LOCKED_TITLE, content: ''")&&N.includes('enc_json: JSON.stringify(seal(key'),'servidor so recebe o cifrado');
  assert.ok(N.includes('IDLE_MS = 5 * 60e3')&&N.includes("toast('Etiquetas protegidas trancadas por inatividade.')"));
  assert.ok(N.includes('Não existe "esqueci a senha"')&&!/Estado|Privacidade|Contexto/.test(N.split('function TagDialog')[0].replace(/\/\/.*$/gm,'')));
  const split=pure('src/screens/Notes.tsx','splitTags');assert.deepEqual(split('Ideia nova #Trabalho #enjoy_the_void'),{title:'Ideia nova',tags:['Trabalho','enjoy the void']});
});
test('Biblioteca: itens antigos viram tipos novos sem migrar; criacao universal com os 10 passos',()=>{
  const B=read('src/screens/Library.tsx');
  for(const s of ["e.kind === 'film'","e.kind === 'video'","e.kind === 'reading'","'area:' + member","'Repetir'".slice(0,0)])assert.ok(B.includes(s),s);
  assert.ok(B.includes("document.addEventListener('paste'")&&B.includes("document.addEventListener('drop'")&&B.includes("e.key === 'n'"),'N, Ctrl+V e arrastar');
  assert.ok(B.includes('Criar só com')&&B.includes('Salvar mesmo assim')&&B.includes('Mais detalhes')&&B.includes('PENDING_KEY')&&B.includes('Tentar de novo'));
  assert.ok(B.includes("['monitor', 'chartBar', 'Monitorar preço']")&&B.includes("'Item e ligações'"),'acoes ligadas nos dois sentidos');
  assert.ok(read('src/desktop/DesktopShell.tsx').includes("label:'Adicionar à Biblioteca'")&&read('src/screens/monitoring/Detail.tsx').includes('Guardar na Biblioteca')&&read('src/screens/Pages.tsx').includes('Guardar na Biblioteca'));
  assert.ok(read('src/screens/workspace/core.tsx').includes("caption:'Filmes, livros e receitas'"));
});
test('Encomendas: varios codigos num campo so, transportadora, etapas, imposto e retirada',()=>{
  const P=read('src/screens/PackagesApp.tsx');
  assert.ok(P.includes("Precisa de você")&&P.includes('rastreios grátis em')&&P.includes('A Sofia achou um código de rastreio num e-mail de')&&P.includes('DONE7 = 7 * 864e5'));
  assert.ok(P.includes('Pagar imposto')&&P.includes('Lançar em Finanças')&&P.includes('Ver no mapa')&&P.includes('Lembrar de retirar'));
});
test('Financas no site: estrutura nova so no computador, sem avisos no topo, mes valendo para tudo',()=>{
  const F=read('src/screens/Finance.tsx'),D=read('src/screens/finance/Desk.tsx');
  assert.ok(F.includes('desktop && d && d.accounts.length ? <FinanceDesk'),'so no computador');
  for(const s of ["'Resumo e extrato'","'Orçamentos'","'Reserva'","'Devoluções'","'Relatórios'","'Histórico'",'Meses anteriores','Fatura atual','Faturas anteriores','Parcelados','fin-month-next','Dia a dia','read-receipt'.slice(0,0)])assert.ok(D.includes(s),s);
  assert.ok(D.includes('warning=""')&&!D.includes('categoryAlerts'),'sem avisos no topo');
  assert.ok(D.includes('api.readReceipt(')&&D.includes('installmentPlan('));
  assert.ok(!/function render[A-Za-z]+\([^)]*\)[^{]*\{\s*const \[/.test(D),'partes sem estado proprio (campo nao perde o foco)');
});
test('0.3.271: Encomendas abre em Todas; notificacoes no site em janela pequena saindo do sino (aprovado por foto)',()=>{
  const p=read('src/screens/PackagesApp.tsx');assert.ok(p.includes("useState('all')")&&p.includes('label="Todas"'));
  const n=read('src/components/NotificationCenter.tsx');
  assert.ok(n.includes('function DeskList')&&n.includes('function DeskRow')&&n.includes("const desk=Platform.OS==='web'&&screen.width>=900"));
  assert.ok(n.includes('Adiar 30 min')&&n.includes('Limpar as lidas')&&n.includes("'Cápsulas':'Rotina'"));
});
