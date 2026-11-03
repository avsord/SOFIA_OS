'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const load=require('./load-ts.cjs'),root=path.resolve(__dirname,'..');
const {PageRefreshGuard}=load('src/lib/page-gesture.ts');
const layout=load('src/lib/notification-layout.ts');
test('024 gestures: row DOWN blocks refresh before long press, and queued callbacks after UP',()=>{
 let time=1000;const g=new PageRefreshGuard(()=>time);assert.equal(g.canRefresh(),true);
 g.setActive(true);assert.equal(g.canRefresh(),false);time+=100;assert.equal(g.canRefresh(),false);
 time+=900;assert.equal(g.canRefresh(),false);g.setActive(false);assert.equal(g.canRefresh(),false);
 time+=299;assert.equal(g.canRefresh(),false);time++;assert.equal(g.canRefresh(),true);
});
test('024 gestures: a fresh gesture cannot be unlocked by the previous cooldown',()=>{
 let t=0;const g=new PageRefreshGuard(()=>t);g.setActive(true);g.setActive(false);t=400;g.setActive(true);t=900;assert.equal(g.canRefresh(),false);g.setActive(false);t=1200;assert.equal(g.canRefresh(),true);
});
function hooks(){const slots=[];let pos=0;const React={__esModule:true,useRef:v=>{const i=pos++;return slots[i]||(slots[i]={current:v});},useState:v=>{const i=pos++;if(!slots[i])slots[i]={v:typeof v==='function'?v():v};return[slots[i].v,x=>{slots[i].v=typeof x==='function'?x(slots[i].v):x;}];},useMemo:(fn,deps)=>{const i=pos++,old=slots[i];if(!old||deps.some((v,n)=>v!==old.deps[n]))slots[i]={v:fn(),deps};return slots[i].v;},useEffect:()=>{}};React.default=React;return {React,render:fn=>{pos=0;return fn();}};}
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
function compile(file,deps,extra='',globals={}){const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;deps={'../lib/render-cost':{useRenderCost(){}},...deps};vm.runInNewContext(code+extra,{exports,require:n=>{if(/(^|\/)palette$/.test(n))return {PALETTE:new Proxy({},{get:()=>'#FFFFFF'})};assert.ok(n in deps,'Unexpected '+n);return deps[n];},Date,Map,Set,...globals});return exports;}
function row(){const h=hooks(),calls=[],timers=new Map();let seq=0;
 const native={View:'View',Text:'Text',Pressable:'Pressable',Animated:{}};
 const exports=compile('src/components/PageTreeList.tsx',{'react':h.React,'react/jsx-runtime':jsx,'react-native':native,'../lib/theme':{useTheme:()=>({text:'text'})},'./Icon':{Icon:'Icon'},'./ContextMenu':{contextMenu:()=>({})},'../lib/motion':{useReducedMotion:()=>false},'../lib/page-order':{},'../lib/fluency':{queueOptional:(_name,run)=>{run();return()=>{};}}},'\nexports.PageRowTest=PageRow;',{setTimeout:fn=>{timers.set(++seq,fn);return seq;},clearTimeout:id=>timers.delete(id)});
 const props={page:{id:'page',title:'Enjoythevoid',data:{icon:'🖤'}},compact:false,onTouchStart:()=>calls.push('touch'),onOpen:()=>calls.push('open'),onHold:()=>calls.push('hold'),onMove:()=>calls.push('move'),onEnd:()=>calls.push('end'),onCancel:()=>calls.push('cancel')};
 const view=h.render(()=>exports.PageRowTest(props));return {p:view.props,calls,tick:()=>{const jobs=[...timers.values()];timers.clear();jobs.forEach(f=>f());}};
}
const touch=(x,y)=>({nativeEvent:{pageX:x,pageY:y}});
test('024 actual row callbacks: blocks at DOWN, holds the whole icon/text row, then drags without opening',()=>{
 const r=row();r.p.onTouchStart();assert.deepEqual(r.calls,['touch']);r.p.onResponderGrant(touch(80,100));assert.ok(!r.calls.includes('hold'));r.tick();assert.equal(r.p.onResponderTerminationRequest(),false);r.p.onResponderMove(touch(85,140));r.p.onResponderRelease(touch(85,140));assert.deepEqual(r.calls,['touch','touch','hold','move','move','end']);
});
test('024 actual row callbacks: normal scroll before hold cancels timer and does not open',()=>{
 const r=row();r.p.onTouchStart();r.p.onResponderGrant(touch(80,100));r.p.onResponderMove(touch(80,114));r.tick();assert.equal(r.p.onResponderTerminationRequest(),true);r.p.onResponderTerminate();r.tick();assert.ok(!r.calls.includes('hold'));assert.ok(!r.calls.includes('open'));
});
test('024 actual row callbacks: tap opens once, held cancellation never moves the page',()=>{
 let r=row();r.p.onResponderGrant(touch(80,100));r.p.onResponderRelease(touch(80,100));r.tick();assert.equal(r.calls.filter(x=>x==='open').length,1);
 r=row();r.p.onResponderGrant(touch(80,100));r.tick();r.p.onResponderTerminate();assert.ok(r.calls.includes('cancel'));assert.ok(!r.calls.includes('end'));assert.ok(!r.calls.includes('open'));
});
function descendants(node){return node&&typeof node==='object'?[node,...(Array.isArray(node.props?.children)?node.props.children:[node.props?.children]).flat(Infinity).flatMap(descendants)]:[];}
test('024 rendered mini agenda: equal halves, same row, selecting day updates events in place',()=>{
 const h=hooks(),dashboard=load('src/lib/dashboard.ts'),opened=[],viewOwner={};h.React.useReducer=()=>[0,()=>{}];h.React.useLayoutEffect=()=>{};const agendaView=compile('src/lib/agenda-view.ts',{'react':h.React,'./dashboard':dashboard});
 const {MiniAgenda}=compile('src/components/DashboardWidgets.tsx',{'react':h.React,'react/jsx-runtime':jsx,'react-native':{Alert:{},Modal:'Modal',Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View'},'react-native-svg':{},'../lib/dashboard':dashboard,'../lib/fluency-metrics':{perfSync:(_name,run)=>run()},'../lib/agenda-priority':load('src/lib/agenda-priority.ts',{'./task-filters':load('src/lib/task-filters.ts',{'./fuzzy':load('src/lib/fuzzy.ts')})}),'../lib/agenda-view':agendaView,'../lib/web-page':{rightClick:()=>({})},'../lib/desktop':{useDesktop:()=>false},'../lib/palette':{PALETTE:new Proxy({},{get:()=>'#FFFFFF'})},'../lib/agenda-recurrence':load('src/lib/agenda-recurrence.ts'),'../lib/theme':{useTheme:()=>({})},'./UI':{Button:'Button',IconButton:'IconButton'},'./MotionModal':{MotionModal:'MotionModal'},'./MonthSwipe':{MonthSwipe:'MonthSwipe'}});
 const today=new Date(),day=dashboard.localDateKey(today),tomorrow=new Date(today.getFullYear(),today.getMonth(),today.getDate()===1?2:1),other=dashboard.localDateKey(tomorrow);
 const items=[{id:'a',title:'Hoje teste',date:day},{id:'b',title:'Outra data teste',date:other}];
 const render=()=>h.render(()=>MiniAgenda({items,viewOwner,onOpen:d=>opened.push(d),onItem:i=>opened.push(i.id)}));
 let nodes=descendants(render()),row=nodes.find(n=>n.props?.testID==='agenda-split-row');assert.equal(row.props.style.flexDirection,'row');
 const halves=nodes.filter(n=>['agenda-calendar-half','agenda-items-half'].includes(n.props?.testID));assert.equal(halves.length,2);assert.equal(halves[0].props.testID,'agenda-items-half');assert.equal(halves[1].props.testID,'agenda-calendar-half');halves.forEach(n=>assert.equal(n.props.style.width,'50%'));
 assert.ok(nodes.some(n=>n.props?.accessibilityLabel==='Hoje teste'));if(other<day)assert.ok(!nodes.some(n=>n.props?.accessibilityLabel==='Outra data teste'));
 nodes.find(n=>n.props?.testID==='agenda-day-'+other).props.onPress();nodes=descendants(render());{/* 03/11/2026 (Pedro): a lista comeca no dia escolhido e, rolando, segue com os proximos dias */const labels=nodes.map(n=>n.props?.accessibilityLabel).filter(Boolean);assert.ok(labels.includes('Outra data teste'));if(other<day)assert.ok(labels.indexOf('Outra data teste')<labels.indexOf('Hoje teste'));else assert.ok(!labels.includes('Hoje teste'));}assert.deepEqual(opened,[]);
 const list=nodes.find(n=>n.props?.testID==='agenda-day-items');assert.equal(list.props.nestedScrollEnabled,false);assert.equal(list.props.showsVerticalScrollIndicator,false);assert.equal(list.props.bounces,false);assert.equal(list.props.style.height,190);
});
test('024 popover: top follows actual bell across mobile/tablet widths, never screen centre',()=>{
 for(const width of [320,360,400,768,1200]){const anchor={x:width-80,y:48,width:44,height:44};const r=layout.notificationPopoverLayout(anchor,{width,height:900},{top:24,bottom:24});assert.equal(r.top,100);assert.ok(r.left>=16);assert.ok(r.left+r.width<=width-16);assert.ok(r.top+r.height<=876);assert.equal(r.width,width-32);assert.equal(r.left,16);}
});
test('024 popover: short windows are bounded and date headings use calendar days',()=>{
 const r=layout.notificationPopoverLayout({x:300,y:680,width:44,height:44},{width:360,height:740},{top:24,bottom:24});assert.ok(r.top+r.height<=700);assert.ok(r.top>=32);
 const now=new Date(2026,9,4,0,5);assert.equal(layout.noticeDateGroup(new Date(2026,9,3,23,59).toISOString(),now),'Ontem');assert.equal(layout.noticeDateGroup(new Date(2026,9,4).toISOString(),now),'Hoje');assert.equal(layout.noticeDateGroup(new Date(2026,9,1).toISOString(),now),'Últimos 7 dias');assert.equal(layout.noticeDateGroup('invalid',now),'Anteriores');
});
test('024 wiring: native refresh disabled independently of scroll; pending/held row locks inner and tab navigation',()=>{
 const s=fs.readFileSync(path.join(root,'src/screens/Pages.tsx'),'utf8');assert.ok(s.includes('enabled={!pageInteraction&&!selectedId}'));assert.ok(s.includes('onRefresh={refreshPages}'));assert.ok(s.includes('refreshGuard.current.canRefresh()'));assert.ok(!s.includes('setNativeProps('));assert.ok(s.includes('scrollEnabled={!pageDragging}'));assert.ok(!s.includes('scrollEnabled={!pageInteraction}'));assert.ok(s.includes('pageInteractionRef.current=value'));assert.ok(s.includes('onDepthChange?.(!!selectedRef.current||value)'));assert.ok(s.includes('onTouchCancel={endPageTouch}'));assert.ok(s.includes('<ScreenTitle title="Páginas" right=')&&!s.includes('IDEIAS · NOTAS · SEUS ESPAÇOS'),'desenho 03/11: titulo Paginas sem legenda');
});
test('024 identity: native manifest, npm and updater agree; package, scheme and release prefix retained',()=>{
 const config=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')).expo,pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
 const updater=fs.readFileSync(path.join(root,'src/lib/update.ts'),'utf8');assert.equal(config.version,'0.3.266');assert.equal(pkg.version,config.version);assert.equal(lock.version,config.version);assert.equal(lock.packages[''].version,config.version);assert.equal(config.android.versionCode,267);assert.equal(config.android.package,'com.avsord.sofiaapp');assert.equal(config.scheme,'sofiaapp');assert.ok(updater.includes("APP_VERSION = '0.3.266'"));assert.ok(updater.includes("RELEASE_PREFIX = 'sofia-android-v'"));
});
