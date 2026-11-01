'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
const pager=fs.readFileSync(path.join(root,'src/components/TabPager.tsx'),'utf8');
const js=ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/tab-navigation.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exported={};vm.runInNewContext(js,{exports:exported});
const {TAB_ORDER,tabAtOffset,createPagerSelection}=exported;

test('production starts on Início for saved sessions and immediately after login',()=>{
  assert.ok(source.includes("[tab,setTab]=useState<Tab>('home')"));
  assert.ok(source.includes("createMenuMotion('home',noteFluencyMovement)"));
  assert.ok(source.includes("switchTab('home');setError('');"));
  assert.ok(!source.includes("[tab,setTab]=useState<Tab>('chat')"));
});
test('menu selection commits its screen before the native jump',()=>{
  const match=source.match(/const switchTab=useCallback\(\(next:Tab\)=>\{([^}]*)\},\[\]\)/);
  assert.ok(match);
  const calls=[],navigation={current:{tab:'chat'}},pager={current:{goTo:next=>calls.push(['native',next])}},menuMotion={select:next=>calls.push(['highlight',next])};
  const fn=vm.runInNewContext('(next)=>{'+match[1]+'}',{navigation,pager,menuMotion,setTab:next=>calls.push(['react',next])});
  for(let i=0;i<100;i++) {const next=TAB_ORDER[i%TAB_ORDER.length];fn(next);assert.equal(navigation.current.tab,next);assert.deepEqual(calls.slice(-1),[['react',next]]);}
});
test('rapid taps use the latest selection, not a stale render closure',()=>{
  const match=source.match(/const navigate=useCallback\(\(next:Tab\)=>\{([\s\S]*?)\},\[switchTab\]\)/);assert.ok(match);
  const calls=[],navigation={current:{tab:'chat',locked:false}},tabHistory={current:[]},tabTap={current:null},nativeRevealAt={current:Date.now()-1000};
  const tops=[];const fn=vm.runInNewContext('(next)=>{'+match[1]+'}',{setHomeTop:f=>tops.push(f({n:tops.length,smooth:false})),navigation,tabHistory,tabTap,nativeRevealAt,pager:{current:{goTo:()=>{}}},appAlert:()=>calls.push('blocked'),Alert:{alert:()=>calls.push('blocked')},switchTab:next=>{navigation.current.tab=next;calls.push(next);}});
  fn('pages');fn('agenda');fn('home');assert.deepEqual(calls,['pages','agenda','home']);assert.deepEqual(Array.from(tabHistory.current),['chat','pages','agenda']);
  fn('home');assert.equal(calls.length,3);
  // 0.3.223: tocar em Inicio sempre leva ao topo - vindo de outra aba sem animacao, ja no Inicio subindo suave
  assert.deepEqual(tops.map(t=>t.smooth),[false,true]);navigation.current.locked=true;fn('profile');assert.equal(calls.at(-1),'blocked');assert.equal(navigation.current.tab,'home');
});
test('tap selection has no timer, vertical translation, fade or animated jump',()=>{
  // Verify the actual tap-to-selection path, not unrelated optional startup
  // read-ahead. Its cancellable timers are outside the synchronous touch handler.
  for(const token of ['PanResponder','Animated','Easing','transitioning','translateY'])assert.ok(!source.includes(token),token);
  const immediate=source.slice(source.indexOf('const switchTab=useCallback('),source.indexOf('const [taskContext'));
  assert.ok(immediate.includes('setTab(next)'));
  assert.ok(!immediate.includes('pager.current?.goTo(next)')); 
  assert.ok(!immediate.includes('setTimeout'),'No timer in tab selection/navigation');
  assert.ok(!immediate.includes('requestAnimationFrame'),'No frame deferral in the synchronous touch handler');
  assert.ok(source.includes('SOFIA_TAB_TAP_TO_FRAME_MS'),'A separate post-commit frame measurement is permitted');
  assert.ok(!pager.slice(pager.indexOf('const goTo'),pager.indexOf('useImperativeHandle')).includes('animated:true'));assert.ok(pager.includes('animated:false'));assert.ok(!pager.includes('setTimeout'));
});
test('gestures use the native horizontal pager and do not steal vertical scrolls with JS responders',()=>{
  assert.match(pager,/horizontal pagingEnabled/);assert.ok(pager.includes('directionalLockEnabled nestedScrollEnabled'));
  assert.ok(pager.includes('onMomentumScrollEnd={finish}'));assert.ok(pager.includes('onScrollBeginDrag={begin}'));
  assert.ok(pager.includes('velocity !== undefined && Math.abs(velocity) < 0.01'));
  assert.ok(source.includes("enabled={!gestureLocked&&!locked&&!keyboard&&tab!=='notifications'&&!(tab==='pages'&&pagesDepth)&&!(tab==='apps'&&workspaceDepth)}"));
});
test('pager keeps six fixed slots, prioritizes Home and warms hidden screens without blocking launch',()=>{
  assert.deepEqual(Array.from(TAB_ORDER),['home','chat','pages','agenda','apps','profile']);
  const body=source.slice(source.indexOf('<TabPager'),source.indexOf('</TabPager>'));
  const markers=['load={loadHome}','load={loadChat}','load={loadPages}','load={loadAgenda}','load={loadWorkspace}','load={loadProfile}'];
  let previous=-1;for(const marker of markers){const index=body.indexOf(marker);assert.ok(index>previous,marker);previous=index;}
  for(const tab of ['chat','pages','agenda','apps','profile'])assert.ok(body.includes("mountedTabs.has('"+tab+"')"));
  const startup=fs.readFileSync(path.join(root,'src/lib/startup-mounts-legacy.ts'),'utf8');
  assert.ok(fs.readFileSync(path.join(root,'src/lib/startup-mounts.ts'),'utf8').includes("queueOptional('prerender:'+tab"));
  assert.ok(startup.includes("const [warmed,setWarmed]=useState"));assert.ok(startup.includes("frame=requestAnimationFrame(advance)"));assert.ok(startup.includes("MENU_TABS.includes(active)?[active]:[]"));
  assert.ok(startup.includes('timer=setTimeout(start,500)'),'Warming waits after navigation without postponing the tap');
  assert.ok(source.includes('useStartupMounts(visible&&!!auth,tab,!!auth,fluency,previewTabs)'));
  assert.ok(!source.includes('hydratedApi===api'),'archive I/O must not delay first menu warmup');
  assert.ok(!source.includes('setHydratedApi('),'archive completion must not render all tab slots again');
  assert.ok(source.includes('()=>api.hydrate().then(()=>'),'Pages/chat archive is still hydrated safely');
  assert.ok(pager.includes('removeClippedSubviews={false}'));assert.ok(!source.includes('setBootstrap(null);setTab('));
});
test('screen instances stay cached after lazy loading, preserving drafts and scroll positions',()=>{
  const loader=fs.readFileSync(path.join(root,'src/lib/screen-loader.tsx'),'utf8');
  // R8: same guarantees (memoized, cached, module load measured) plus a per-screen error boundary.
  assert.ok(loader.includes("const Loaded=perfSync('module:'+name,load)"));assert.ok(loader.includes('React.memo(Bounded)'));assert.ok(loader.includes('<ScreenBoundary name={name}><Loaded {...props}/></ScreenBoundary>'));assert.ok(loader.includes('const cache=new Map<string,Screen>()'));
  for(const name of ['loadHome','loadChat','loadPages','loadAgenda','loadWorkspace','loadProfile','loadNotifications'])assert.ok(source.includes(name),name);
  assert.ok(!source.includes("from './src/screens/Home'"));
  for(const name of ['navigate','goBack','changePrefs','logout','profile','manualUpdate','clearChat','notificationBack'])assert.ok(source.includes('const '+name+'=useCallback('),name);
  assert.ok(source.includes("key={'chat-'+chatEpoch}"));assert.ok(!source.includes('key={tab}'));
});
test('secure session and decrypted records mount Home before optional services or live bootstrap',()=>{
  const fast=fs.readFileSync(path.join(root,'src/lib/fast-bootstrap.ts'),'utf8');
  const shell=fs.readFileSync(path.join(root,'src/components/StartupHome.tsx'),'utf8');
  assert.ok(source.includes('startup.auth?fastBootstrap(startup.auth):null)'));
  assert.ok(source.includes("!ready?<StartupHome/>"));
  assert.ok(source.includes("initialDataReady?<DeferredScreen load={loadHome}"));
  assert.ok(source.includes('authWithBootstrap(auth,b)'));
  assert.ok(fast.includes('startup?:')||fs.readFileSync(path.join(root,'src/lib/types.ts'),'utf8').includes('startup?: Bootstrap'));
  assert.ok(shell.includes('contains no data fetches')||shell.includes('no data fetches'));
});
test('automatic update checks and notifications wait until the completed visual handoff',()=>{
  assert.ok(source.includes("if(!servicesReady||fluency==='pending')return;"));
  assert.ok(source.includes("enabled={!!auth&&!!bootstrap&&servicesReady&&fluency!=='pending'}"));
  assert.ok(source.includes('prepareInitialData(api,()=>preloadAgenda(api))'));
  assert.ok(source.includes('painted=useAfterFirstPaint(ready&&!cachedOpening)')&&source.includes('servicesReady=visible&&!!auth&&!!bootstrap&&initialDataReady')&&source.includes('visible=useLaunchVisible(ready)')&&source.includes('if(cachedOpening?visible:painted)api.releaseNetwork()')&&source.includes("const cachedOpening=!!(api.cached('/home')&&api.cached('/tasks')&&api.cached('/agenda?month='+monthKey(new Date())))"));
});
test('notification overlay cannot capture touches or accessibility focus while hidden',()=>{
  assert.ok(source.includes("pointerEvents={tab==='notifications'?'auto':'none'}"));
  assert.ok(source.includes("importantForAccessibility={tab==='notifications'?'auto':'no-hide-descendants'}"));
  assert.ok(pager.includes("activeTab === TAB_ORDER[index] ? 'auto' : 'no-hide-descendants'"));
});
test('both swipe directions map to the adjacent menu and clamp at the ends',()=>{
  assert.equal(tabAtOffset(0,400),'home');assert.equal(tabAtOffset(400,400),'chat');assert.equal(tabAtOffset(800,400),'pages');
  assert.equal(tabAtOffset(-500,400),'home');assert.equal(tabAtOffset(10000,400),'profile');
  const state=createPagerSelection('chat');state.beginDrag();state.release();assert.equal(state.finishDrag(800,400),'pages');state.beginDrag();state.release();assert.equal(state.finishDrag(400,400),'chat');
});
test('invalid or unmeasured layouts never choose a menu',()=>{
  for(const [x,w] of [[0,0],[20,-1],[NaN,400],[Infinity,400],[500,NaN],[500,Infinity]])assert.equal(tabAtOffset(x,w),null);
});
test('interrupted or cancelled gestures do not override a newer menu tap',()=>{
  const state=createPagerSelection();state.beginDrag();state.select('profile');assert.equal(state.finishDrag(800,400),null);assert.equal(state.current(),'profile');
  state.beginDrag();state.cancelDrag();assert.equal(state.finishDrag(400,400),null);assert.equal(state.current(),'profile');
});
test('repeated fast menu taps win over stale native momentum events',()=>{
  const state=createPagerSelection();
  for(let i=0;i<100;i++){state.beginDrag();const next=TAB_ORDER[i%TAB_ORDER.length];state.select(next);assert.equal(state.finishDrag(2000,400),null);assert.equal(state.current(),next);}
});
test('short drag returning to its starting page does not add navigation history',()=>{
  const state=createPagerSelection('chat');state.beginDrag();state.release();assert.equal(state.finishDrag(401,400),null);assert.equal(state.current(),'chat');
});
test('notifications are outside the swipe sequence without losing the underlying page',()=>{
  const state=createPagerSelection('pages');state.beginDrag();state.select('notifications');assert.equal(state.current(),'pages');assert.equal(state.finishDrag(1200,400),null);
});
test('Android identity, discovery prefix and version stay compatible',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'app.json'))).expo,pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  const update=fs.readFileSync(path.join(root,'src/lib/update.ts'),'utf8');
  assert.equal(config.android.package,'com.avsord.sofiaapp');assert.equal(config.android.versionCode,267);
  assert.equal(config.version,'0.3.266');assert.equal(pkg.version,config.version);assert.ok(update.includes("APP_VERSION = '"+pkg.version+"'"));assert.ok(update.includes("RELEASE_PREFIX = 'sofia-android-v'"));
});
test('Pages opens a preloaded entity synchronously without a network wait',()=>{
 const pages=fs.readFileSync(path.join(root,'src/screens/Pages.tsx'),'utf8');
 assert.ok(pages.includes('items.forEach(page=>store.open(page))'));
 const fn=pages.match(/function open\(page:Entity,push=true\)\{([^\n]*)/)[1];
 assert.ok(fn.includes('setSelectedId(page.id)'));assert.ok(!fn.includes('await '));assert.ok(!fn.includes('api.entity('));
});

test('an open page disables the outer pager and uses Android Back without a custom page swipe',()=>{
 assert.ok(source.includes("[pagesDepth,setPagesDepth]=useState(false)"));
 assert.ok(source.includes("tab==='pages'&&pagesDepth"));
 assert.ok(source.includes('onDepthChange:setPagesDepth'));
 const pages=fs.readFileSync(path.join(root,'src/screens/Pages.tsx'),'utf8');
 assert.ok(!pages.includes('PanResponder.create'));assert.ok(pages.includes("BackHandler.addEventListener('hardwareBackPress'"));
 assert.ok(!pages.includes('translateX:backX'));
 assert.ok(!pages.includes('pageBackResponder.panHandlers'));
});

test('chat responses trigger immediate refreshes across synchronized app caches',()=>{
 const api=fs.readFileSync(path.join(root,'src/lib/api.ts'),'utf8');
 const home=fs.readFileSync(path.join(root,'src/screens/Home.tsx'),'utf8');
 const pages=fs.readFileSync(path.join(root,'src/screens/Pages.tsx'),'utf8');
 const agenda=fs.readFileSync(path.join(root,'src/lib/use-agenda-month.ts'),'utf8');
 const capsules=fs.readFileSync(path.join(root,'src/lib/capsule-store.ts'),'utf8');
 const records=fs.readFileSync(path.join(root,'src/lib/workspace-records.ts'),'utf8');
 const notices=fs.readFileSync(path.join(root,'src/components/NotificationCenter.tsx'),'utf8');
 assert.ok(api.includes("systemChanged(this);return result"));
 for(const code of [home,pages,agenda,capsules,records,notices])assert.ok(code.includes('subscribeSystemChanged'));
});
test('0.3.270: Capsulas virou Rotina (capsulas, cuidados, habitos e treino) e as Rotinas antigas entram nela sem perder nada',()=>{
 // pedido do Pedro (31/10): "Capsula pode virar Rotina, e dentro de rotina tenha capsulas e outras coisas"
 const core=fs.readFileSync(path.join(root,'src/screens/workspace/core.tsx'),'utf8');
 const caps=fs.readFileSync(path.join(root,'src/screens/Capsules.tsx'),'utf8');
 assert.ok(core.includes("{id:'capsules',title:'Rotina'")&&!core.includes("id:'routines',title:'Rotinas'"),'um app so');
 assert.ok(caps.includes("api.entities('routine')")&&caps.includes("rotina_type:'cuidado'")&&caps.includes("await api.saveEntity({...r,state:'archived'})"),'rotinas antigas migradas e arquivadas');
 assert.ok(caps.includes("['Manhã','Tarde','Noite']")&&caps.includes('ROTINA_TYPES'));
});
test('returning to Conversa explicitly resumes following the newest message',()=>{
 const chat=fs.readFileSync(path.join(root,'src/screens/Chat.tsx'),'utf8');
 assert.ok(chat.includes("if(!active){void silenceVoices();setSelectedIds(new Set());return;}followChat();"));
});
