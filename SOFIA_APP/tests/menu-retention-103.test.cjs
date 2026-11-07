'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
function fixture(){
 const slots=[],frames=[],timers=[];let cursor=0,layout=[],effects=[],nextId=0,now=0;
 const useState=initial=>{const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];};
 const useRef=initial=>{const i=cursor++;return slots[i]||(slots[i]={current:initial});};
 const effect=(queue)=>(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>!Object.is(v,old.deps[n]))){old?.cleanup?.();slots[i]={deps};queue.push(()=>{slots[i].cleanup=fn();});}};
 // startTransition is synchronous in this fixture: these tests cover retention semantics, not scheduling.
 const react={useRef,useState,useLayoutEffect:(...args)=>effect(layout)(...args),useEffect:(...args)=>effect(effects)(...args),startTransition:fn=>fn()};
 const raf={requestAnimationFrame:run=>{const task={id:++nextId,run,cancelled:false};frames.push(task);return task.id;},cancelAnimationFrame:id=>{const task=frames.find(x=>x.id===id);if(task)task.cancelled=true;},
  setTimeout:(run,delay)=>{const task={id:++nextId,run,at:now+delay,cancelled:false};timers.push(task);return task.id;},
  clearTimeout:id=>{const task=timers.find(x=>x.id===id);if(task)task.cancelled=true;}};
 const {useStartupMounts}=load('src/lib/startup-mounts.ts',{react},raf);
 return {frames,timers,flush(){const task=frames.find(x=>!x.done&&!x.cancelled);if(!task)return false;task.done=true;task.run();return true;},
  advance(ms){now+=ms;for(const t of timers.filter(x=>!x.done&&!x.cancelled&&x.at<=now)){t.done=true;t.run();}},
  render(active,enabled=true,authenticated=true){cursor=0;layout=[];effects=[];const tabs=useStartupMounts(enabled,active,authenticated);layout.forEach(fn=>fn());effects.forEach(fn=>fn());return tabs;}};
}
test('a menu selected before warmup stays mounted when leaving and returning',()=>{
 const f=fixture();assert.deepEqual([...f.render('home')],['home']);
 assert.ok(f.render('pages').has('pages'));
 assert.ok(f.render('chat').has('pages'),'visited Pages must not be unmounted');
 for(let i=0;i<50;i++)for(const tab of ['profile','agenda','pages','apps','chat'])assert.ok(f.render(tab).has('pages'));
 assert.equal(f.render('home').size,6);
});
test('Home mounts without hidden tabs and logout clears archived account trees',()=>{
 const f=fixture();assert.equal(f.render('home',false).size,1);
 f.render('pages',false);assert.equal(f.render('home',false).size,2,'Visited Pages must survive hydration gate');
 f.render('home',false,false);assert.equal(f.render('home',false,false).size,1);
 assert.equal(f.frames.filter(x=>!x.cancelled&&!x.done).length,0);
});
test('warmup starts after reveal even with encrypted archive still pending',()=>{
 const f=fixture();assert.deepEqual([...f.render('home',false)],['home']);
 assert.equal(f.frames.length,0);
 assert.deepEqual([...f.render('home',true)],['home']);assert.equal(f.frames.length,1);
 f.flush();assert.deepEqual([...f.render('home',true)],['home']);
 const expected=['chat','pages','agenda','apps','profile'];
 for(let i=0;i<expected.length;i++){assert.ok(f.flush());assert.deepEqual([...f.render('home',true)],['home',...expected.slice(0,i+1)]);}
 assert.equal(f.flush(),false);
});
test('user touches cancel queued warming immediately and resume only 500ms after last tab change',()=>{
 const f=fixture();f.render('home',true);f.flush(); // initial free Home frame
 assert.equal(f.render('pages',true).has('pages'),true); // prioritized actual touch
 assert.ok(f.frames.some(x=>x.cancelled),'original warm frame must cancel');
 f.advance(499);assert.equal(f.frames.filter(x=>!x.done&&!x.cancelled).length,0);
 assert.ok(f.render('chat',true).has('pages')); // rapid second touch resets idle window
 f.advance(499);assert.equal(f.frames.filter(x=>!x.done&&!x.cancelled).length,0);
 f.advance(1);assert.ok(f.frames.some(x=>!x.done&&!x.cancelled));
 assert.ok(f.flush());assert.ok(f.flush()); // free first frame then warm one tab
 assert.ok(f.render('chat',true).has('pages'),'prioritized Pages stays mounted');
});
test('logout cancels pending frame and timers; stale callbacks cannot resurrect any account screen',()=>{
 const f=fixture();f.render('home',true);f.render('pages',true);
 f.render('home',false,false);assert.deepEqual([...f.render('home',false,false)],['home']);
 for(const task of f.frames.filter(x=>!x.done))task.run();
 for(const task of f.timers.filter(x=>!x.done))task.run();
 assert.deepEqual([...f.render('home',false,false)],['home']);
});

test('R5 first taps prewarm independently of the full archived Page/chat history',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const app=fs.readFileSync(path.join(__dirname,'../App.tsx'),'utf8');
 const pages=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 assert.ok(app.includes("const mountedTabs=useStartupMounts(visible&&!!auth,tab,!!auth,fluency,previewTabs);"));
 assert.ok(!app.includes('hydratedApi===api'),'waiting for whole archive reproduces first-tap delays');
 assert.ok(!app.includes('setHydratedApi('),'archive completion cannot rerender every mounted screen');
 assert.ok(app.includes("if(!visible||!auth||!initialDataReady||fluency==='pending')return;"));
 assert.ok(app.includes("queueOptional('hidratar',()=>api.hydrate().then(()=>"),'archive hydration is still preserved after reveal');
 assert.ok(pages.includes("void api.hydrate().then(()=>"),'Pages still recovers saved listing when archive finishes');
 assert.ok(pages.includes('(!ready||!loaded)&&!error&&!pages.length'),'Pages still has neutral loading state');
 assert.ok(pages.includes('ready&&loaded&&!pages.length&&!error'),'Pages only shows empty after real load');
 const f=fixture();
 assert.equal(f.render('home',false).size,1,'no hidden tabs underneath Android splash');
 assert.equal(f.render('home',true).size,1,'Home commits alone before first warm frame');
 f.flush();f.render('home',true);
 f.flush();assert.ok(f.render('home',true).has('chat'),'post-reveal warmup works while archive is unresolved');
 assert.ok(f.render('pages',true).has('pages'),'an early touch wins over optional warmup');
 assert.ok(f.frames.some(x=>x.cancelled),'foreground touch cancels pending background work');
});

test('R5 manual smoke explicitly exercises first taps and a same-emulator baseline (07/11/2026: the published version, durable)',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.join(__dirname,'..','..');
 const smoke=fs.readFileSync(path.join(root,'SOFIA_APP/tools/manual-apk-smoke.py'),'utf8');
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/sofia-native-047-update.yml'),'utf8');
 // os artefatos de 30 dias (0.3.60 semente, 0.3.94, 0.3.105-107) expiraram; a base agora e a versao publicada
 assert.ok(!/run-id: 3\d{10}/.test(workflow),'nenhum artefato antigo fixo por numero de compilacao');
 assert.ok(workflow.includes('dist/QA-ONLY-seed.apk')&&workflow.includes('versionCode $((BASE_CODE-1))'),'semente compilada a cada rodada, abaixo da publicada');
 assert.ok(smoke.includes("previous=dist/'baseline-Sofia-OS.apk'")&&smoke.includes("adb('install',str(dist/'QA-ONLY-seed.apk'))"));
 assert.ok(smoke.includes("result['candidate_median_ms']<=result['owner_baseline_median_ms']+100"),'mesmo limite de 100 ms, contra a publicada');
 assert.ok(smoke.includes("result['early_menu_first_touch_after_native_DATA']=True"));
 assert.ok(smoke.includes("result['early_menu_native_touch_count']>=3"));
 assert.ok(smoke.includes("for label in ['Páginas','Conversa','Agenda','Início']"));
 const code=smoke.slice(smoke.indexOf("result['migration_run']=cold('candidate-migration')"),smoke.indexOf('recording.wait(timeout=15)'));
 assert.ok(code.includes("tap_label(before,label)"),'early taps must precede the recording wait');
 assert.ok(smoke.includes("assert result['native_first_taps']>=12"),'retain the existing native responsiveness gate');
 assert.ok(smoke.includes("assert 'FIM DA RESPOSTA QA' in conversation"),'retain chat persistence gate');
});
