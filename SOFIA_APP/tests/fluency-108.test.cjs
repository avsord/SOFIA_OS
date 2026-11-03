const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs'),fs=require('fs'),path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('Activity keeps fixed six page slots and guards native jumps into hidden content',()=>{
 const s=read('src/components/TabPager.tsx');
 assert.ok(s.includes('<Activity mode={visibleTab(TAB_ORDER[index])'));
 assert.ok(s.includes("readyTabs?.has(id)&&visibleTab(id)?'1':'0'"));
 assert.ok(s.includes('style={[styles.page,{width}]}'));
 assert.ok(s.includes('onPreviewTabs?.(neighbors)'));
 assert.ok(s.includes('noteFluencyInput()'));
 assert.ok(s.includes('removeClippedSubviews={false}'));
});
test('new prewarm uses the queue and sliced rendering, not the legacy rAF chain or its 500ms timer; old policy retained for comparison',()=>{
 const s=read('src/lib/startup-mounts.ts'),legacy=read('src/lib/startup-mounts-legacy.ts');
 assert.ok(s.includes("queueOptional('prerender:'+tab"));assert.ok(!s.includes('requestAnimationFrame('));
 assert.ok(!s.includes('timer=setTimeout(start,500)'),'the legacy 500 ms policy must not come back');
 // 0.3.113/114: sliced rendering, no fixed wait (see tests/first-seconds-113.test.cjs)
 assert.ok(s.includes('startTransition(()=>setWarmed'));assert.ok(!s.includes('PRERENDER_QUIET_MS'),'a espera fixa de 0.3.113 foi um erro e não volta');assert.ok(!s.includes('setTimeout('));
 assert.ok(s.includes('useLegacyStartupMounts'));
 assert.ok(legacy.includes('timer=setTimeout(start,500)'));
});
test('post-reveal mode is fixed, no mode storage read in launch preparation',()=>{
 const s=read('App.tsx');assert.ok(s.includes('if(!visible)return;'));
 assert.ok(s.includes('AsyncStorage.getItem(FLUENCY_MODE_KEY)'));
 assert.ok(s.includes("queueOptional('hidratar'"));assert.ok(s.includes('}),2,8000)'));
 assert.ok(!read('src/lib/local-launch.ts').includes('FLUENCY_MODE_KEY'));
 assert.ok(s.includes('onStartShouldSetResponderCapture={()=>{noteFluencyInput();return false;}}'));
});
test('input-aware gap survives work enqueued during a 50ms cooldown',async()=>{
 const {createIdleWork}=load('src/lib/idle-work.ts');let now=0,id=0;const timers=new Map(),ran=[];
 const w=createIdleWork({now:()=>now,setTimer:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimer:id=>timers.delete(id),startDelayMs:0,gapMs:50});
 async function tick(t){now=t;for(const [id,x] of [...timers])if(x.at<=now){timers.delete(id);x.fn();}for(let i=0;i<8;i++)await Promise.resolve();}
 w.enqueue({name:'a',run:()=>ran.push(now)});w.start();await tick(0);
 await tick(10);w.enqueue({name:'b',run:()=>ran.push(now)});await tick(10);assert.deepEqual(ran,[0]);
 await tick(49);assert.deepEqual(ran,[0]);await tick(50);assert.deepEqual(ran,[0,50]);w.dispose();
});
test('reversible PageEditorStore resumes after disposal without discarding dirty text',async()=>{
 const {PageEditorStore}=load('src/lib/page-editor.ts');let disk=[];
 const page={id:'qa',kind:'user_page',title:'initial',revision:1,data:{blocks_json:'[]'}};
 const store=new PageEditorStore({save:async()=>{throw Error('offline');},read:async()=>page,persist:async rows=>{disk=rows;},delay:50000});
 store.open(page);store.edit('qa',d=>({...d,title:'draft survives'}));await store.flushAll();store.dispose();
 store.resume();let changes=0;const stop=store.subscribe(()=>changes++);store.edit('qa',d=>({...d,title:d.title+' again'}));
 assert.equal(store.get('qa').draft.title,'draft survives again');assert.ok(changes>0);
 await store.flushAll();assert.equal(disk[0].draft.title,'draft survives again');stop();store.dispose();
});
test('cache count uses unique IDs only and does not expose contents',()=>{
 const {measureVolume,perfReport}=load('src/lib/fluency-metrics.ts');
 measureVolume([['/workspace/entities?x',{items:[{id:'p',kind:'user_page',title:'PRIVATE'}]}],['/chat-sync/current',{conversation:{id:'c'},messages:[{id:'m',content:'SECRET'}]}],['/conversations/c',{conversation:{id:'c'},messages:[{id:'m',content:'SECRET'}]}]],120);
 const data=perfReport();assert.equal(data.data.pages,1);assert.equal(data.data.messages,1);assert.equal(data.data.conversations,1);assert.equal(data.data.historyBytes,120);
 assert.ok(!JSON.stringify(data).includes('PRIVATE'));assert.ok(!JSON.stringify(data).includes('SECRET'));
});
test('350ms visible-load start is cancelled when a screen hides',()=>{
 let fired=0,callback,cleared=false;const f=load('src/lib/fluency.ts',{'./idle-work':{idleWork:{start(){}}},'./fluency-metrics':{perfEvent(){},perfInput(){},perfNow:()=>0,perfSetMode(){},perfStart(){}}},{setTimeout:fn=>{callback=fn;return 9;},clearTimeout:id=>{assert.equal(id,9);cleared=true;}});
 f.startFluency('new');const stop=f.afterVisible(()=>fired++);assert.equal(fired,0);stop();assert.equal(cleared,true);
});
test('heavy fixture has the required real-shaped counts and stays inside current archive import bounds',()=>{
 const ts=require('typescript'),vm=require('vm'),path=require('path');const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(read('tests/fixtures/fluency-data.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:m.exports,Date,Math,JSON,Array,Object,Error});
 const d=m.exports.fluencyData(1),e=JSON.parse(d.raw).entries;
 for(const [k,v] of Object.entries({pages:600,blocks:12000,entities:1500,conversations:30,messages:9000,months:12,events:600,tasks:300}))assert.equal(d.counts[k],v,k);
 assert.ok(d.raw.length<=8*1024*1024);assert.ok(m.exports.fluencyData(2).raw.length<=8*1024*1024);
 const pages=e.find(([p])=>p.includes('kind=user_page'))[1].value.items;const map=new Map(pages.map(p=>[p.id,p]));
 for(const p of pages){let n=p,depth=1;while(n.data.parent_id){n=map.get(n.data.parent_id);assert.ok(n);depth++;assert.ok(depth<=3);}}
 const starts=JSON.parse(d.launch).entries.map(([p])=>p);assert.ok(!starts.some(p=>p.includes('user_page')),'large Page history remains out of first-screen snapshot');
 assert.equal(d.auth.token.length,43);assert.ok(d.auth.profile.email.endsWith('.test'));
});
test('new snapshot mode stays on exact old cache schema and explicit writes never wait for idle',()=>{
 const s=read('src/lib/startup-snapshot.ts');assert.ok(s.includes('MAX_BYTES=4*1024*1024'));assert.ok(s.includes('.slice(0,32)'));
 assert.ok(s.includes("queueOptional('snapshot:write'"));assert.ok(s.includes("perfSync(onlyLaunch?'parse:home':'parse:history'"));
 const api=read('src/lib/api.ts');assert.ok(api.includes('await this.snapshots.flush()'));
});
test('new isolated heavy job reuses signed binaries and timing goals are reported, not weakened old gates',()=>{
 const wf=fs.readFileSync(path.join(__dirname,'../../.github/workflows/sofia-native-047-update.yml'),'utf8');
 assert.ok(wf.includes('QA-ONLY-fluency-seed.apk'));assert.ok(wf.includes('python3 tools/verify-abi-equivalence.py'));
 const heavy=read('tools/fluency-heavy-smoke.py'),manual=read('tools/manual-apk-smoke.py');
 assert.ok(heavy.includes("'performance_gate_enforced':False"));assert.ok(heavy.includes('seed(mode,scale)'));
 assert.ok(manual.includes("result['policy_mode']='old'"));assert.ok(manual.includes("result['native_first_taps']>=12"));
 // The R8 observer strengthens the single marker check to twenty real edits
 // in each policy; keep the exact typed suffix and screen-error guards.
 // 03/11/2026: o cursor fica onde o dedo toca e o teclado sugere letras; a protecao passou a ser "o titulo digitado
 // volta IGUAL depois de esconder/mostrar a tela, e cada ciclo muda o titulo" (marca _R8_KEEP continua).
 assert.ok(heavy.includes("'_R8_KEEP' in typed"));
 assert.ok(heavy.includes('for cycle in range(20):'));
 assert.ok(heavy.includes("assert after==typed,'Actual Page draft lost across Activity hide/show"));
 assert.ok(heavy.includes('typed!=prev'));
 assert.ok(heavy.includes("RESULT.setdefault('draft_cycles',{})[mode]=20"));
 assert.ok(heavy.includes("for mode in ['old','new']:"));
 assert.ok(heavy.includes("'Algo deu errado nesta tela' not in tree"));
 assert.ok(heavy.includes("'Vamos reabrir' not in tree"));
 assert.ok(!heavy.includes("'pm','clear'"));
});
