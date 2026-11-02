'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('0.3.263: menu do botao direito abre com as acoes certas',()=>{
  let opened=null;const host={};
  const m=load('src/components/ContextMenu.tsx',{react:{useEffect(){},useState:v=>[v,()=>{}]},'react-native':{},'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null},'../lib/theme':{useTheme:()=>({})},'./Icon':{Icon:()=>null}},{document:{}});
  const props=m.contextMenu(()=>[{label:'Abrir',run(){}},{label:'Apagar',danger:true,run(){}}]);
  assert.equal(typeof props.onContextMenu,'function','no site ha onContextMenu');
});
test('0.3.263: telas grandes divididas e testes lendo a tela inteira',()=>{
  for(const f of ['finance/core','finance/Home','finance/Transactions','finance/Plan','finance/Goal','finance/Reports','finance/Manage','finance/Setup','workspace/core','workspace/EntityEditor','workspace/Tasks','monitoring/core','monitoring/Add','monitoring/Detail','monitoring/Stores'])assert.ok(fs.existsSync(path.join(__dirname,'..','src/screens',f+'.tsx')),f);
  assert.ok(fs.statSync(path.join(__dirname,'..','src/screens/Finance.tsx')).size<40000);
  assert.ok(read('src/screens/Finance.tsx').includes('function TxEditor('),'a leitura dos testes junta as partes');
  assert.ok(read('src/screens/Home.tsx').includes("import {useFinanceGoal} from './finance/Goal';"));
});
test('0.3.263: site - partes sob demanda, teclado, hover, folhas perto do clique, avisos no titulo, Ctrl+K com tarefas',()=>{
  const l=read('src/lib/screen-loader.web.tsx');assert.ok(l.includes("lazyScreen('apps',()=>import('../screens/Workspace')"));
  const w=read('src/lib/web-page.ts');assert.ok(w.includes("if (e.key !== 'Enter'")&&w.includes("document.addEventListener('wheel'"));
  assert.ok(read('src/lib/desktop.ts').includes("box-shadow:inset 0 0 0 999px '+colors.accent+'14"));
  assert.ok(read('src/components/Sheet.tsx').includes('const anchored=desktop&&anchor?'));
  const d=read('src/desktop/DesktopShell.tsx');assert.ok(d.includes("group:'Tarefas'")&&d.includes('(window as any).__sofiaOpenTask=t.id'));
  assert.ok(read('src/components/UnreadTitle.tsx').includes("(unread>0?'('+Math.min(unread,99)+') ':'')+base")&&read('App.tsx').includes("{Platform.OS==='web'?<UnreadTitle/>:null}"));
  assert.ok(read('src/screens/Workspace.tsx').includes("||!!catalog)){handledModuleTarget.current=openModuleKey;"),'Notas por link direto espera o catalogo');
  assert.ok(read('src/screens/Chat.tsx').includes('const sideList=null;')); // 0.3.274: sem a coluna do Quadro no computador (pedido do Pedro); abre pelo botao
  assert.ok(fs.readFileSync(path.join(__dirname,'..','src/lib/palette.ts'),'utf8').includes('export const PALETTE'));
});
test('0.3.264: Inicio no computador com colunas equilibradas (sem vazio ao lado da Agenda) e o dia inteiro na lista',()=>{
  const sw=read('src/components/SortableWidgets.tsx');assert.ok(sw.includes('for(let mask=0;mask<(1<<n);mask++)')&&sw.includes('lead?:React.ReactNode'));
  assert.ok(read('src/screens/Home.tsx').includes('testID="home-desk"')); // 0.3.264: desenho aprovado do Inicio no lugar das colunas automaticas
  assert.ok(read('src/components/DashboardWidgets.tsx').includes('style={wideDay?{flex:1,minHeight:0}:{height:190}}') /* 0.3.287: lista na altura do cartao, rola por dentro */);
});
test('0.3.264: Inicio no desenho aprovado (saudacao com nome em italico, barra da Sofia, resumo, agenda, tarefas, capsulas com caixinha)',()=>{
  const h=read('src/screens/Home.tsx');assert.ok(h.includes('<DaySummaryCard ')&&h.includes('<DeskTasksCard ')&&h.includes('<DeskCapsulesCard ')&&h.includes('<SortableWidgets sheetOnly'));
  const hero=read('src/components/HomeHero.tsx');assert.ok(hero.includes('DISPLAY_ITALIC')&&hero.includes('api.ensureChat()')&&hero.includes('Continuar na Conversa →'));
  const d=read('src/desktop/HomeDeskCards.tsx');assert.ok(d.includes("accessibilityRole=\"checkbox\" accessibilityLabel={(on ? 'Tomada: '")&&d.includes('borderLeftWidth: 3'));
  assert.ok(fs.existsSync(path.join(__dirname,'..','assets/fonts/SofiaDisplay-MediumItalic.ttf'))&&read('plugins/with-sofia-fonts.cjs').includes('Sofia(Sans|Display)'));
});
test('0.3.265: Conversa no desenho aprovado - Quadro da conversa (computador na lateral, celular no botao), separador de assunto, foto visivel; barra do Inicio manda message',()=>{
  const ch=read('src/screens/Chat.tsx');assert.ok(!ch.includes('testID="chat-board-chip"')&&ch.includes('Novo assunto · {topic}')&&ch.includes('refreshBoardSoon(result.conversation_id)'));
  const b=read('src/components/ConversationBoard.tsx');assert.ok(b.includes('Assuntos anteriores')&&b.includes("'Guardar em Páginas'")&&b.includes("'Copiar resumo'"));
  const w=load('src/components/ConversationBoard.tsx',{react:{useState:v=>[v,()=>{}]},'react-native':{Platform:{OS:'web'}},'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null,Fragment:'F'},'../lib/theme':{useTheme:()=>({})},'../lib/app-alert':{appAlert(){}},'./Icon':{Icon:()=>null},'./ContextMenu':{contextMenu:()=>({})}}).when;
  const now=new Date('2026-10-30T19:00:00');assert.match(w(new Date('2026-10-30T16:17:00').toISOString(),now),/^Hoje, 30\/10 · 16:17$/);assert.match(w(new Date('2026-10-29T23:04:00').toISOString(),now),/^Ontem, 29\/10 · 23:04$/);
  assert.ok(read('src/components/HomeHero.tsx').includes('api.chat({conversation_id: id, message: q,'),'a barra do Inicio manda o campo message (na 0.3.264 mandava content e o servidor recusava)');
});
