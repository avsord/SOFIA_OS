'use strict';
// 0.3.268 — Rodada 1 de 31/10 (resto do site + Conversa + E-mails). Ver docs/PEDIDOS_2026-10-31.md.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('site: esqueleto so depois de 300 ms, app abre no mesmo clique e telas baixadas em segundo plano',()=>{
  const l=read('src/components/Loading.tsx');assert.ok(l.includes('WEB_SKELETON_DELAY = 0')&&l.includes('useSkeletonDelay()'));
  assert.ok(read('src/components/ScreenSkeleton.tsx').includes('useSkeletonDelay()'));
  assert.ok(/if \(Platform\.OS === 'web'\) return true;/.test(read('src/components/ModuleSkeleton.tsx')));
  assert.ok(read('src/lib/screen-loader.web.tsx').includes('export function prefetchWebScreens')&&read('App.tsx').includes('prefetchWebScreens()'));
});
test('site: nenhum contorno de clique, nem o anel do campo; hover com transicao curta',()=>{
  const d=read('src/lib/desktop.ts');
  assert.ok(!/box-shadow:0 0 0 3px/.test(d),'sem anel no campo de texto');assert.ok(d.includes("'*:focus,*:focus-visible{outline:none!important}'"));
  assert.ok(d.includes('div[tabindex]{transition:box-shadow .1s ease'));
});
test('janelas montadas so quando abertas agora saem animadas (Presence)',()=>{
  const p=read('src/components/Presence.tsx');assert.ok(p.includes('PresenceClosing'));
  assert.ok(read('src/components/Sheet.tsx').includes('visibleProp&&!useContext(PresenceClosing)'));
  assert.ok(read('src/components/MotionModal.tsx').includes('visibleProp&&!useContext(PresenceClosing)'));
  const files=['src/screens/Finance.tsx','src/screens/finance/Home.tsx','src/screens/finance/Plan.tsx','src/screens/finance/Transactions.tsx','src/screens/finance/Manage.tsx','src/screens/Mail.tsx','src/screens/Monitoring.tsx','src/screens/monitoring/Detail.tsx','src/screens/Chat.tsx','src/screens/workspace/Tasks.tsx','src/screens/Agenda.tsx','src/screens/Home.tsx','src/screens/Workspace.tsx'];
  let n=0;for(const f of files){const s=read(f);const k=(s.match(/<Presence>/g)||[]).length;assert.ok(k>0,f);n+=k;}
  assert.ok(n>=30,'janelas cobertas: '+n);
  // as quatro que tinham ficado de fora: detalhe do mes (Financas), pagina da loja (Price Tracker), Aparencia (Paginas), Diagnostico (Perfil)
  assert.ok(read('src/screens/finance/Home.tsx').includes('<Presence>{breakdown ? <MonthBreakdown'));
  assert.ok(read('src/screens/monitoring/Detail.tsx').includes('<Presence>{viewer ? <PageViewer'));
  assert.ok(read('src/screens/Pages.tsx').includes('<Presence>{appearance?<PageAppearance'));
  assert.ok(read('src/screens/Profile.tsx').includes('<Presence>{perfOpen?<FluencyPanel'));
  assert.ok(read('src/components/PageAppearance.tsx').includes('<MotionModal visible transparent')&&read('src/components/FluencyPanel.tsx').includes('<MotionModal visible'));
});
test('alerta mantem o texto durante a saida; menu do botao direito anima; seta da arvore gira suave; pagina solta sem voltar',()=>{
  assert.ok(read('src/lib/app-alert.tsx').includes('const current=open||lastShown.current'));
  const m=read('src/components/ContextMenu.tsx');assert.ok(m.includes("testID={open ? 'context-menu' : 'context-menu-closing'}")&&m.includes('Animated.timing(anim'));
  assert.ok(read('src/components/PageTreeList.tsx').includes("transitionProperty:'transform'")&&read('src/desktop/DesktopShell.tsx').includes("transitionProperty:'transform'"));
  const t=read('src/components/PageTreeList.tsx');assert.ok(t.includes('useLayoutEffect(()=>{if(!ghost)pan.setValue({x:0,y:0});},[ghost,pan]);'));
  assert.ok(!t.includes('const finish=()=>{setGhost(null);setDrop(null);pan.setValue'),'o deslocamento nao zera antes da ordem nova');
  assert.ok(read('src/components/NotificationCenter.tsx').includes("if(Platform.OS!=='web'){try{LayoutAnimation.configureNext"));
});
test('voltar do navegador e Esc fecham o painel; Price Tracker fecha o produto ao sair',()=>{
  const w=read('src/lib/web-panels.ts');assert.ok(w.includes("addEventListener('popstate'")&&w.includes('stopImmediatePropagation'));
  assert.ok(read('src/components/MotionModal.tsx').includes('useWebBackClose(!!visible'));
  assert.ok(read('src/screens/Monitoring.tsx').includes('if (!active) setOpenId(null);'));
});
test('foto do perfil e capas iguais no app e no site',()=>{
  assert.ok(read('src/lib/profile-photo-cloud.ts').includes('api.saveProfilePhoto(')&&read('src/lib/profile-photo-cloud.web.ts').includes('api.profilePhoto()'));
  assert.ok(read('src/components/ProfileAvatar.tsx').includes("from '../lib/profile-photo-cloud'"));
  assert.ok(read('src/lib/page-cover-cache.web.ts').includes('URL.createObjectURL'));
  assert.ok(read('src/components/PageAppearance.tsx').includes('const localPreview='));
});
test('Capsulas: tique neutro tambem no app, cor so na barrinha',()=>{
  const w=read('src/components/CapsuleWidget.tsx');assert.ok(w.includes("borderColor:c.muted+'77'")&&w.includes('DOSE_COLORS[Math.max(0,state.plans.findIndex'));
  const caps=read('src/screens/Capsules.tsx');assert.ok(caps.includes('borderColor:done?c.line:c.muted')&&caps.includes('backgroundColor:t.color'),'tique neutro; cor so na barrinha (0.3.270: cor do tipo na Rotina)');
});
test('Conversa: no site Enter envia e Shift+Enter quebra linha; no celular o Enter quebra linha',()=>{
  const c=read('src/components/Composer.tsx');assert.ok(c.includes("n.key==='Enter'&&!n.shiftKey&&!n.isComposing")&&c.includes("submitBehavior={enterToSend&&!WEB_KEYS?'submit':'newline'}"));
});
test('E-mails: painel lateral, setas, icones de traco, contador e regra apagada',()=>{
  const m=read('src/screens/Mail.tsx');
  // 0.3.270: o painel do e-mail no site e o Panel padrao (por cima, escurecendo o fundo; voltar/Esc pelo proprio painel)
  assert.ok(m.includes('testID="mail-side-panel"')&&m.includes("e.key === 'ArrowDown'")&&m.includes('<Panel visible={!!open}'));
  assert.ok(m.includes("'🧾': {icon: 'receipt'")&&!/<Text>\{hitEmoji/.test(m));
  assert.ok(m.includes("label: 'Encontrados' + (accounts === null ? '' : ' ' + scoped.length)")&&m.includes("'Regra apagada'"));
  assert.ok(m.includes("flexDirection: 'row', alignItems: 'center', gap: 8}}><Icon name=\"receipt\""),'icone ao lado de Lancar como conta a pagar');
});
