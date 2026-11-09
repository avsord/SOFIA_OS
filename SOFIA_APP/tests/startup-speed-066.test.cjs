'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const load=require('./load-ts.cjs'),root=path.resolve(__dirname,'..');
const model=load('src/lib/tab-navigation.ts'),animated=require('./animated-stub.cjs')();
const {createMenuMotion}=load('src/lib/menu-motion.ts',{'react-native':{Animated:animated.Animated},'./tab-navigation':model});
function hooks(){
 const slots=[];let cursor=0,effects=[];
 const memo=(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||!deps||deps.some((x,n)=>x!==old.deps[n]))slots[i]={value:fn(),deps};return slots[i].value;};
 const React={__esModule:true,forwardRef:fn=>fn,Children:{map:(kids,fn)=>kids.map(fn)},useRef:value=>{const i=cursor++;return slots[i]||(slots[i]={current:value});},useState:value=>{const i=cursor++;if(!slots[i])slots[i]={value:typeof value==='function'?value():value};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useLayoutEffect:(fn,deps)=>memo(()=>{effects.push(fn);},deps),useImperativeHandle:(ref,fn,deps)=>memo(()=>{effects.push(()=>{ref.current=fn();});},deps)};React.default=React;
 return {React,render:fn=>{cursor=0;const value=fn();const list=effects;effects=[];list.forEach(f=>f());return value;}};
}
function pager(metrics){
 const h=hooks(),commands=[],ref={current:null},native={scrollTo:command=>commands.push({...command})};
 const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 const {TabPager}=load('src/components/TabPager.tsx',{'react':h.React,'react/jsx-runtime':jsx,'react-native':{Platform:{OS:'android'},Animated:animated.Animated,View:'View',StyleSheet:{create:s=>s}},'react-native-safe-area-context':{initialWindowMetrics:metrics},'../lib/tab-navigation':model});
 let props={motion:createMenuMotion(),activeTab:'home',enabled:true,onSelect(){},children:model.TAB_ORDER.map(id=>({id}))},outer,scroll;
 function render(patch={}){props={...props,...patch};outer=h.render(()=>TabPager(props,ref)).props;scroll=outer.children?.props;if(scroll)scroll.ref.current=native;}
 render();return {commands,ref,render,get outer(){return outer;},get scroll(){return scroll;}};
}
const metrics=(width,left=0,right=0)=>({frame:{width},insets:{left,right}});
test('066 native frame mounts Home immediately but requires both real geometry callbacks',()=>{
 for(const reverse of [false,true]){
  const p=pager(metrics(400));assert.ok(p.scroll);assert.equal(p.scroll.children.length,6);assert.equal(p.scroll.contentOffset.x,0);assert.equal(p.scroll.scrollEnabled,false);assert.equal(p.scroll.style[1].opacity,0);
  const viewport=()=>p.scroll.onLayout({nativeEvent:{layout:{width:400}}}),content=()=>p.scroll.onContentSizeChange(2400,700);
  (reverse?content:viewport)();p.render();assert.equal(p.scroll.scrollEnabled,false);assert.equal(p.commands.length,0);
  (reverse?viewport:content)();p.render();assert.equal(p.scroll.scrollEnabled,true);assert.equal(p.scroll.style[1].opacity,1);assert.equal(p.commands.at(-1).x,0);
 }
});
test('066 stale frame recovers from actual layout without replaying Home over a new menu tap',()=>{
 const p=pager(metrics(400));p.ref.current.goTo('profile');p.render({activeTab:'profile'});
 p.outer.onLayout({nativeEvent:{layout:{width:360}}});p.render();
 p.scroll.onLayout({nativeEvent:{layout:{width:400}}});p.scroll.onContentSizeChange(2400,700);assert.equal(p.commands.length,0);
 p.scroll.onContentSizeChange(2160,700);p.scroll.onLayout({nativeEvent:{layout:{width:360}}});p.render();assert.equal(p.scroll.scrollEnabled,true);assert.equal(p.commands.at(-1).x,1800);
});
test('066 native frame respects side insets and the existing 760dp shell bound',()=>{
 assert.equal(pager(metrics(440,20,20)).scroll.snapToInterval,400);assert.equal(pager(metrics(1200)).scroll.snapToInterval,760);
});
test('066 absent or invalid metrics preserve measured fallback rather than zero-width Home',()=>{
 for(const m of [null,metrics(0),metrics(-1),metrics(NaN),metrics(Infinity)]){
  const p=pager(m);assert.equal(p.scroll,undefined);p.outer.onLayout({nativeEvent:{layout:{width:360}}});p.render();p.scroll.onLayout({nativeEvent:{layout:{width:360}}});p.scroll.onContentSizeChange(2160,700);p.render();assert.equal(p.scroll.scrollEnabled,true);
 }
});
test('066 hidden panels never schedule native zero-to-zero startup animations',()=>{
 const effects=[],requests=[],stops=[];class Value{stopAnimation(){stops.push(true);}setValue(){}}
 const {useMotionPresence}=load('src/lib/motion.ts',{'react':{useRef:v=>({current:v}),useState:v=>[v,()=>{}],useEffect:f=>effects.push(f)},'react-native':{AccessibilityInfo:{isReduceMotionEnabled:async()=>false,addEventListener:()=>({remove(){}})},Keyboard:{},Easing:{bezier:()=>null},Animated:{Value,timing:(_v,o)=>{requests.push(o);return {start(){},stop(){}};}}}});
 assert.equal(useMotionPresence(false).mounted,false);effects.splice(0).forEach(f=>f());assert.equal(requests.length,0);assert.equal(stops.length,0);
});
test('066 native startup queues key preparation once in Application before React startup',()=>{
 const code=fs.readFileSync(path.join(root,'plugins/with-sofia-alarms.cjs'),'utf8'),module={exports:{}};
 vm.runInNewContext(code,{module,require:name=>name==='expo/config-plugins'?{withMainApplication:(config,fn)=>fn(config),withDangerousMod:config=>config}:require(name),__dirname:path.join(root,'plugins')});
 const original='PackageList(this).packages.apply {\n}\noverride fun onCreate() {\n super.onCreate()\n loadReactNative(this)\n}';
 const apply=contents=>module.exports({modResults:{language:'kt',contents}}).modResults.contents;
 const once=apply(original);assert.equal(apply(once),once);assert.ok(once.indexOf('SofiaSnapshotIO.prepareLaunch()')<once.indexOf('loadReactNative(this)'));assert.equal((once.match(/SofiaSnapshotIO.prepareLaunch\(\)/g)||[]).length,1);
 assert.throws(()=>apply('PackageList(this).packages.apply {'),/onCreate insertion point/);
});
test('066 native prewarm keeps existing encrypted storage and a single serialized worker',()=>{
 const code=fs.readFileSync(path.join(root,'plugins/native/SofiaAlarmPackage.kt'),'utf8');
 assert.equal((code.match(/newSingleThreadExecutor/g)||[]).length,1);
 for(const marker of ['private val io = SofiaSnapshotIO.worker','@Synchronized fun prepareLaunch()','if (prepared) return','"sofia.cache.aes.v1"','app.noBackupFilesDir','cipher.updateAAD(scope.toByteArray(Charsets.UTF_8))','GCMParameterSpec(128','f.finishWrite(stream)'])assert.ok(code.includes(marker),marker);
 const prewarm=code.slice(code.indexOf('object SofiaSnapshotIO'),code.indexOf('  // Called only on worker.'));
 for(const forbidden of ['.get()', '.join()', 'runBlocking', 'Thread.sleep', 'delete(', 'promise.resolve'])assert.ok(!prewarm.includes(forbidden),forbidden);
});

test('067 cached Home and Agenda remain primary; catalog, widgets and monitors start only after reveal and idle',()=>{
 const home=fs.readFileSync(path.join(root,'src/screens/Home.tsx'),'utf8');
 assert.ok(home.includes('readHomeRows(api,'),'primary Home/Tasks loader must remain');
 assert.ok(home.includes('useAgendaMonth(api,calendarDate,active,launchVisible)'),'current Agenda month remains essential');
 assert.ok(home.includes("api.cached<HomeData>('/home')"),'retained Home projection must remain');
 assert.ok(home.includes("api.cached<{items:Task[]}>('/tasks')"),'retained Tasks must remain');
 const catalog=home.indexOf('void api.catalog().then(cat=>');
 const widgets=home.indexOf('void api.dashboardWidgets().then(r=>');
 const monitors=home.indexOf("api.entities('monitor'");
 assert.ok(catalog>=0&&widgets>=0&&monitors>=0);
 // 09/11/2026: soonOrIdle = scheduleIdleTask com cache; sem cache (logo depois do login) sai na hora, ate o Inicio aparecer
 assert.ok(/const firstReveal=useRef\(!api\.cached\('\/home'\)&&!api\.cached\('\/tasks'\)\);const soonOrIdle=\(run:\(\)=>void\)=>\{if\(!firstReveal\.current\|\|Platform\.OS!=='web'\)return scheduleIdleTask\(run\);/.test(home),'cached Home keeps idle deferral');
 assert.ok(home.includes('firstReveal.current=false'),'after the first reveal everything goes back to idle');
 assert.ok(home.slice(catalog-100,catalog).includes('soonOrIdle('),'catalog startup deferred');
 assert.ok(home.slice(widgets-100,widgets).includes('soonOrIdle('),'widget refresh deferred');
 assert.ok(home.slice(monitors,monitors+1400).includes('soonOrIdle(()=>{void load();})'),'monitors startup deferred');
 assert.ok(home.includes('if(!active||!launchVisible||agendaCatalog)return'),'catalog waits for real Home');
 assert.ok(home.includes('if(!launchVisible||!active)return'),'widgets wait for real Home');
});


test('086 finite system S does not extend the native Home handoff or restart an animator',()=>{
 const logo=fs.readFileSync(path.join(root,'plugins/with-sofia-logo.cjs'),'utf8');
 assert.ok(logo.includes('<animated-vector')); 
 assert.ok(logo.includes('android:scaleX="0.86" android:scaleY="0.86"')); 
 assert.ok(logo.includes('android:windowSplashScreenAnimationDuration')); 
 assert.ok(logo.includes('android:windowSplashScreenAnimatedIcon">@drawable/sofia_launch_mark_empty</item>'));
 const launch=fs.readFileSync(path.join(root,'plugins/native/SofiaLaunchOverlay.kt'),'utf8');
 assert.ok(launch.includes('surface.animate().alpha(0f).setDuration(150L)'));
 assert.ok(!launch.includes('Animatable'));
});
test('068 photo preloads without blocking Home; menu prewarm yields to navigation',()=>{
 const app=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
 const local=fs.readFileSync(path.join(root,'src/lib/local-launch.ts'),'utf8');
 const mounts=fs.readFileSync(path.join(root,'src/lib/startup-mounts-legacy.ts'),'utf8');
 assert.ok(local.includes("void photoReady;\n  await snapshot.hydrateLaunch()"));
 assert.ok(app.includes("useStartupMounts(visible&&!!auth,tab,!!auth,fluency,previewTabs)"));
 assert.ok(mounts.includes('frame=requestAnimationFrame(advance)'));
 assert.ok(fs.readFileSync(path.join(root,'src/components/ProfileAvatar.tsx'),'utf8').includes('primeProfilePhoto(scope,readProfilePhoto)'));
});
test('068 bell actions share one horizontal row and capsule reads remain server-backed',()=>{
 const bell=fs.readFileSync(path.join(root,'src/components/NotificationCenter.tsx'),'utf8');
 const code=bell.slice(bell.indexOf('    {n.items.length?<View style='),bell.indexOf('    <Button title="Ver todas as notificações"'));
 assert.ok(code.includes("flexDirection:'row'"));
 // 09/11/2026 (Pedro): sem "Marcar tudo como lido"; fica so limpar
 assert.ok(!code.includes('Marcar tudo como lido')&&code.includes('Limpar todas'));
 const api=fs.readFileSync(path.join(root,'src/lib/api.ts'),'utf8');
 assert.ok(api.includes("'/md/capsules/doses"));
 const server=fs.readFileSync(path.join(root,'../src/channels/mobile.js'),'utf8');
 assert.ok(server.includes("p === '/api/mobile/md/capsules/doses'"));
 assert.ok(server.includes("mobile_capsule_doses"));
});

test('069 unread bell actions use identical neutral color, one no-wrap row',()=>{
 const bell=fs.readFileSync(path.join(root,'src/components/NotificationCenter.tsx'),'utf8');
 const section=bell.slice(bell.indexOf('    {n.items.length?<View style='),bell.indexOf('    <Button title="Ver todas as notificações"'));
 assert.ok(section.includes("flexDirection:'row'"));
 assert.ok(!section.includes("flexWrap:'wrap'"));
 // 09/11/2026 (Pedro: "tirar o marcar tudo como lido e deixar limpar notificacoes"): so o Limpar
 assert.ok(!section.includes('Marcar todas as notificações como lidas'));
 const clean=section.slice(section.indexOf('Limpar todas as notificações'));
 assert.ok(clean.includes('color:c.muted')&&clean.includes('numberOfLines={1}'));
});
test('069 startup restores photo and cached Home together; menus mount only when visited',()=>{
 const launch=fs.readFileSync(path.join(root,'src/lib/local-launch.ts'),'utf8');
 const mounts=fs.readFileSync(path.join(root,'src/lib/startup-mounts-legacy.ts'),'utf8');
 assert.ok(launch.includes('void photoReady;\n  await snapshot.hydrateLaunch()'));
 assert.ok(!launch.includes('fetch('),'No server calls in initial photo/Home restore');
 assert.ok(mounts.includes('frame=requestAnimationFrame(advance)'),'Warm only after reveal, one retained tab per frame');
 assert.ok(mounts.includes('setWarmed(previous=>previous.has(tab)'));
});

test('086 startup S uses the reference vector and one finite scale and defers optional work',()=>{
 const code=fs.readFileSync(path.join(root,'plugins/with-sofia-logo.cjs'),'utf8');
 assert.ok(code.includes('android:name="sofiaLetterMotion"'));
 assert.ok(code.includes('android:pivotX="96" android:pivotY="96"'));
 assert.ok(!code.includes('sofia_letter_reveal'));
 assert.ok(code.includes('android:scaleX="0.020658489"'));
 assert.ok(code.includes('<animated-vector')); 
 assert.ok(!code.includes('repeatCount'));
 assert.ok(code.includes('android:scaleX="0.86" android:scaleY="0.86"')); 
 const bg=fs.readFileSync(path.join(root,'src/components/BackgroundServices.tsx'),'utf8');
 assert.ok(bg.includes('if(!enabled||!preloadWhenIdle'));
 assert.ok(bg.includes('scheduleIdleTask('));
 assert.ok(bg.includes('3400'));
 const app=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
 assert.ok(!app.includes('timer=setTimeout(next,800)'));
 assert.ok(app.includes("useStartupMounts(visible&&!!auth,tab,!!auth,fluency,previewTabs)"));
 assert.ok(app.includes("preloadWhenIdle:screenTab==='home'"));
});



test('102 early Canvas retains its mark during the single alpha fade',()=>{
 const overlay=fs.readFileSync(path.join(root,'plugins/native/SofiaLaunchOverlay.kt'),'utf8');
 const app=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
 const loader=fs.readFileSync(path.join(root,'src/lib/screen-loader.tsx'),'utf8');
 assert.ok(overlay.indexOf('decor.overlay.add(surface)')<overlay.indexOf('exitSystemSplash = { success ->'));
 assert.ok(overlay.includes('SofiaLaunchMotion.scaleAt(startedAt, now)'));
 assert.ok(!overlay.includes('.scaleX('));
 assert.ok(overlay.includes('surface.animate().alpha(0f).setDuration(150L)'));
 assert.ok(!app.includes('<LaunchSAnimation'));
 assert.ok(loader.includes('export const DeferredScreen=React.memo('));
 assert.ok(loader.includes('keys.every(key=>Object.is(left[key],right[key]))'));
});

test('078 Home is allowed to reveal without waiting for server or prefetch',()=>{
 const overlay=fs.readFileSync(path.join(root,'plugins/native/SofiaLaunchOverlay.kt'),'utf8');
 const logo=fs.readFileSync(path.join(root,'plugins/with-sofia-logo.cjs'),'utf8');
 assert.ok(overlay.includes('val home = (signals and 6) == 6'));
 assert.ok(overlay.includes('if (login || (home && (signals and 8) != 0)) {')); 

 assert.ok(overlay.includes('splash.remove()'));
 assert.ok(overlay.includes('record(activity, "FADE_DONE")'));
 assert.ok(logo.includes('android:windowSplashScreenAnimationDuration')); 
 assert.ok(logo.includes('android:scaleX="0.86" android:scaleY="0.86"')); 
});
test('074 hidden tabs mount one frame at a time after original splash exits',()=>{
 const mounts=fs.readFileSync(path.join(root,'src/lib/startup-mounts-legacy.ts'),'utf8');
 const app=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
 const pages=fs.readFileSync(path.join(root,'src/screens/Pages.tsx'),'utf8');
 const apps=fs.readFileSync(path.join(root,'src/screens/Workspace.tsx'),'utf8');
 assert.ok(mounts.includes("if(!enabled){lastTab.current=active;return;}"));
 assert.ok(mounts.includes("frame=requestAnimationFrame(()=>{if(!cancelled)frame=requestAnimationFrame(advance);})"));
 assert.ok(mounts.includes("cancelAnimationFrame(frame)"));
 assert.ok(!mounts.includes("scheduleIdleTask("),"No repeated 1.5s idle waits between menus");
 assert.ok(mounts.includes("setWarmed(previous=>previous.has(tab)?previous:new Set([...previous,tab]))"));
 assert.ok(app.includes("useStartupMounts(visible&&!!auth,tab,!!auth,fluency,previewTabs)"));
 assert.ok(!app.includes('MENU_PRELOADERS'));
 assert.ok(pages.includes("const PAGE_LIST_KEY='/workspace/entities?limit=100&kind=user_page&q=&offset=0'"));
 assert.ok(apps.includes("api.cached<Catalog>('/workspace/catalog')"));
});

test('078 no second OS S persists underneath the single composited image',()=>{
 const theme=fs.readFileSync(path.join(root,'plugins/with-sofia-logo.cjs'),'utf8');
 const native=fs.readFileSync(path.join(root,'plugins/native/SofiaLaunchOverlay.kt'),'utf8');
 assert.ok(theme.includes('<item name="android:windowBackground">@color/sofiaLaunchBackground</item>'));
 assert.ok(!theme.includes('<item name="android:windowBackground">@drawable/splashscreen_logo</item>'));
 assert.ok(theme.includes('<item name="android:windowSplashScreenAnimatedIcon">@drawable/sofia_launch_mark_empty</item>'));
 assert.ok(native.indexOf('decor.overlay.add(surface)')<native.indexOf('exitSystemSplash = { success ->'));
 assert.ok(native.includes('splash.remove()'));
 assert.ok(!native.includes('icon.postDelayed('));
 assert.ok(native.includes('SOFIA_LAUNCH_SYSTEM_CALLBACK_PROCESS_MS='));
});
test('075 launch does not block on optional photo decode or full archive rollover',()=>{
 const launch=fs.readFileSync(path.join(root,'src/lib/local-launch.ts'),'utf8');
 const snapshot=fs.readFileSync(path.join(root,'src/lib/startup-snapshot.ts'),'utf8');
 assert.ok(launch.includes('void photoReady;'));
 assert.ok(launch.includes('await snapshot.hydrateLaunch()'));
 assert.ok(!launch.includes('await Promise.all([snapshot.hydrateLaunch(),photoReady])'));
 assert.ok(snapshot.includes("if(this.entries.has('/home')||this.entries.has('/tasks'))"));
 assert.ok(snapshot.includes('void this.hydrate().then(()=>this.flushLaunch()).catch(()=>{})'));
 assert.ok(snapshot.includes('await this.hydrate();void this.flushLaunch()'),'No-cache sessions can still recover the entire archive');
});

test('102 early prepared surface leaves within the unchanged startup timing gates',()=>{
 const native=fs.readFileSync(path.join(root,'plugins/native/SofiaLaunchOverlay.kt'),'utf8');
 const app=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
 const smoke=fs.readFileSync(path.join(root,'tools/manual-apk-smoke.py'),'utf8');
 const exit=native.slice(native.indexOf('exitSystemSplash = { success ->'),native.indexOf('when (transition.splashReady())'));
 assert.ok(exit.includes('splash.remove()'));
 assert.ok(exit.includes('surface.animate().alpha(0f).setDuration(150L)'));
 assert.ok(exit.includes('surface.postDelayed({ complete() }, 240L)'));
 assert.ok(exit.includes('record(activity, "FADE_DONE")'));
 assert.ok(!exit.includes('setUpdateListener'));
 assert.ok(!exit.includes('icon?.animate()?.alpha(0f)'));
 assert.ok(!exit.includes('decor.overlay.add('));
 assert.ok(!native.includes('SurfaceControl.Transaction'));
 assert.ok(app.includes("const cachedOpening=!!(api.cached('/home')&&api.cached('/tasks')&&api.cached('/agenda?month='+monthKey(new Date())))"));
 assert.ok(smoke.includes("result['fade_to_done_median_ms']<=250"));
 assert.ok(smoke.includes("result['ready_to_splash_remove_median_ms']<=150"));
});

test('078 Android 12 completed fade reports visible without another costly frame',()=>{
 const code=fs.readFileSync(path.join(root,'plugins/native/SofiaLaunchOverlay.kt'),'utf8');
 const complete=code.slice(code.indexOf('private fun completeReveal('),code.indexOf('private fun reveal('));
 assert.ok(complete.includes('if (Build.VERSION.SDK_INT >= 31 && exitStarted) notifyReady()'));
 assert.ok(complete.includes('else activity.window.decorView.postOnAnimation { notifyReady() }'));
 assert.ok(complete.includes('if (success) activity.reportFullyDrawn()'));
 assert.ok(complete.indexOf('record(activity, if (success) "DATA"')<complete.indexOf('activity.reportFullyDrawn()'));
});
// R3: show a static 70%-scale mark until the native overlay starts at 70%.
// The overlay does not trust an OEM-specific system animation clock.
test('107 native S handoff starts at matching 70% scale without OEM clock jump',()=>{
 const generator=fs.readFileSync(path.join(root,'plugins/with-sofia-logo.cjs'),'utf8');
 const overlay=fs.readFileSync(path.join(root,'plugins/native/SofiaLaunchOverlay.kt'),'utf8');
 const reference='<item name="android:windowSplashScreenAnimatedIcon">@drawable/sofia_launch_mark_empty</item>';
 assert.equal(generator.split(reference).length-1,1,'matching reduced static vector must be active');
 assert.ok(generator.includes('android:width="192dp" android:height="192dp"'));
 assert.ok(generator.includes("write('drawable/sofia_launch_mark_empty.xml'"));
 assert.ok(generator.includes("write('drawable-v31/sofia_launch_mark_entry.xml'"));
 assert.ok(!generator.includes('<item name="android:windowSplashScreenAnimatedIcon">@drawable/sofia_launch_mark_animated</item>'));
 assert.ok(overlay.includes('val motionStart = now'));
 assert.ok(!overlay.includes('splash.iconAnimationStart?.let'));
 assert.ok(overlay.includes('SofiaLaunchMotion.scaleAt(startedAt, now)'));
 assert.ok(overlay.includes('surface.animate().alpha(0f).setDuration(150L)'));
 assert.ok(overlay.includes('if (login || (home && (signals and 8) != 0)) {'));
 const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')).expo;
 const plugin=app.plugins.find(row=>Array.isArray(row)&&row[0]==='expo-build-properties');
 assert.ok(plugin,'R8 plugin must be explicitly configured');
 assert.equal(plugin[1].android.enableMinifyInReleaseBuilds,true);
 assert.equal(plugin[1].android.enableShrinkResourcesInReleaseBuilds,true);
 const smoke=fs.readFileSync(path.join(root,'tools/manual-apk-smoke.py'),'utf8');
 assert.ok(smoke.includes("run['icon_is_image_view'] is True"),'R8-proof check must confirm Android ImageView');
 assert.ok(smoke.includes("run['icon_is_surface_view'] is False"),'R8-proof check must exclude animated SurfaceView');
 assert.ok(overlay.includes('paint.alpha = (255f * fade).toInt()'));
 assert.ok(fs.readFileSync(path.join(root,'plugins/native/SofiaLaunchMotion.java'),'utf8').includes('S_FADE_IN_MS = 140L;'));
 assert.ok(overlay.includes('val motionStart = now'));
 assert.ok(!overlay.includes('splash.iconAnimationStart?.let'));
 assert.ok(overlay.includes('SOFIA_LAUNCH_ICON_IS_IMAGE_VIEW=${icon is android.widget.ImageView}'));
 assert.ok(overlay.includes('SOFIA_LAUNCH_ICON_IS_SURFACE_VIEW=${icon is android.view.SurfaceView}'));
});

test('108 pages hydrate from the full archive only AFTER reveal and never show false empty',()=>{
 const app=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
 const pages=fs.readFileSync(path.join(root,'src/screens/Pages.tsx'),'utf8');
 const archive=fs.readFileSync(path.join(root,'src/lib/startup-snapshot.ts'),'utf8');
 assert.ok(app.includes("if(!visible||!auth||!initialDataReady||fluency==='pending')return"));
 assert.ok(app.includes("queueOptional('hidratar',()=>api.hydrate().then(()=>"));
 assert.ok(app.includes('SOFIA_HYDRATE_MS='));
 assert.ok(!app.includes('hydratedApi===api'),'Archive completion cannot block optional prewarming');
 assert.ok(!app.includes('setHydratedApi('),'Hydration completion must not cause a full Shell rerender during first taps');
 assert.ok(app.includes("useStartupMounts(visible&&!!auth,tab,!!auth,fluency,previewTabs)"));
 assert.ok(!archive.slice(archive.indexOf('export function launchRead('),archive.indexOf('export function cacheableRead(')).includes('user_page'),'Full Pages archive must not decrypt before Home');
 assert.ok(pages.includes('const [refreshing,setRefreshing]=useState(false),[ready,setReady]=useState(false),[loaded,setLoaded]'));
 assert.ok(pages.includes('setPages(prev=>prev.length?prev:api.pageOrderApply(local))')); // 0.3.256: ja na ordem do aparelho
 assert.ok(pages.includes("setLoaded(true);setError('')"));
 assert.ok(pages.includes('(!ready||!loaded)&&!error&&!pages.length'));
 assert.ok(pages.includes('ready&&loaded&&!pages.length&&!error'));
});
test('108 native splash icon is fully invisible, overlay fades the only S on every new frame',()=>{
 const logo=fs.readFileSync(path.join(root,'plugins/with-sofia-logo.cjs'),'utf8');
 const native=fs.readFileSync(path.join(root,'plugins/native/SofiaLaunchOverlay.kt'),'utf8');
 const motion=fs.readFileSync(path.join(root,'plugins/native/SofiaLaunchMotion.java'),'utf8');
 assert.ok(logo.includes('sofia_launch_mark_empty.xml'));
 assert.ok(logo.includes('android:fillColor="#00FFFFFF"'));
 assert.ok(logo.includes('android:strokeColor="#00FFFFFF"'));
 assert.equal(logo.split('android:windowSplashScreenAnimatedIcon">@drawable/sofia_launch_mark_empty</item>').length-1,1);
 assert.ok(native.includes('activity.resources.getDrawable(R.drawable.sofia_launch_mark'));
 assert.ok(native.includes('paint.alpha = (255f * fade).toInt()'));
 assert.ok(motion.includes('S_FADE_IN_MS = 140L'));
 assert.ok(native.includes('surface.animate().alpha(0f).setDuration(150L)'));
});
