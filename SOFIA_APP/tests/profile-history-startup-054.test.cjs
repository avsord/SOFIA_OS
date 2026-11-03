'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
function photoFixture(){
 const files=new Map([['file:///picked.jpg',100]]),values=new Map(),deleted=[];let failCopy=false,failWrite=false,copyDone=false;
 class File{constructor(a,b){this.uri=b?(typeof a==='string'?a:a.uri)+b:typeof a==='string'?a:a.uri;}get exists(){return files.has(this.uri);}get size(){return files.get(this.uri)||0;}async copy(to){await tick();if(failCopy)throw Error('copy failed');files.set(to.uri,this.size);copyDone=true;}async delete(){await tick();deleted.push(this.uri);files.delete(this.uri);}}
 const storage={getItem:async key=>values.get(key)||null,setItem:async(k,v)=>{if(failWrite)throw Error('disk full');assert.ok(files.get(v)>0);values.set(k,v);},removeItem:async k=>values.delete(k)};
 const photo=load('src/lib/profile-photo.ts',{'@react-native-async-storage/async-storage':{__esModule:true,default:storage},'expo-file-system':{File,Paths:{document:{uri:'file:///documents/'}}}});
 return{photo,files,values,deleted,failCopy:()=>{failCopy=true;},failWrite:()=>{failWrite=true;},get copyDone(){return copyDone;}};
}
test('054 profile waits for asynchronous SDK copy before validating and saving its pointer',async()=>{const f=photoFixture(),result=f.photo.saveProfilePhoto('A@example.com','file:///picked.jpg');assert.equal(f.values.size,0);const uri=await result;assert.ok(f.copyDone);assert.ok(f.files.get(uri)>0);assert.equal(await f.photo.readProfilePhoto('a@example.com'),uri);assert.equal(await f.photo.readProfilePhoto('other@example.com'),'');});
test('054 profile replacement keeps previous photo on copy failure',async()=>{const f=photoFixture(),old=await f.photo.saveProfilePhoto('a','file:///picked.jpg');f.failCopy();await assert.rejects(f.photo.saveProfilePhoto('a','file:///picked.jpg'));assert.equal(await f.photo.readProfilePhoto('a'),old);assert.ok(f.files.has(old));assert.ok(!f.deleted.includes(old));});
test('054 profile replacement keeps previous photo when metadata commit fails',async()=>{const f=photoFixture(),old=await f.photo.saveProfilePhoto('a','file:///picked.jpg');f.failWrite();await assert.rejects(f.photo.saveProfilePhoto('a','file:///picked.jpg'));assert.equal(await f.photo.readProfilePhoto('a'),old);assert.ok(f.files.has(old));});
test('054 a saved photo can itself be the source without deleting it before copy',async()=>{const f=photoFixture(),old=await f.photo.saveProfilePhoto('a','file:///picked.jpg'),next=await f.photo.saveProfilePhoto('a',old);assert.notEqual(next,old);assert.equal(await f.photo.readProfilePhoto('a'),next);assert.ok(f.files.has(next));});
test('054 explicit removal does not affect another account photo',async()=>{const f=photoFixture();await f.photo.saveProfilePhoto('a','file:///picked.jpg');const b=await f.photo.saveProfilePhoto('b','file:///picked.jpg');await f.photo.removeProfilePhoto('a');assert.equal(await f.photo.readProfilePhoto('a'),'');assert.equal(await f.photo.readProfilePhoto('b'),b);});
test('054 recovers a 0.3.53 legacy file whose copy completed after its error dialog',async()=>{const f=photoFixture(),uri=await f.photo.saveProfilePhoto('a','file:///picked.jpg'),legacy=uri.replace(/-[^-]+-\d+\.jpg$/,'.jpg');f.files.set(legacy,100);f.files.delete(uri);assert.equal(await f.photo.readProfilePhoto('a'),legacy);});
test('054 camera badge is an independently touchable sibling outside the clipped avatar',()=>{
 const jsx=(type,props)=>({type,props}),c={input:'i',line:'l',surface:'s',accent:'a'};
 const {ProfilePhotoEditor}=load('src/components/ProfilePhotoEditor.tsx',{'react':{useState:v=>[v,()=>{}],useEffect:()=>{}},'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Pressable:'Pressable',Image:'Image',ActivityIndicator:'Spinner',Alert:{}},'expo-image-picker':{},'../lib/app-alert':{appAlert:()=>{}},'./UI':{Brand:'Brand'},'./Icon':{Icon:'Icon'},'../lib/theme':{useTheme:()=>c},'../lib/chat-model':{initials:()=>'',errorText:()=>''},'../lib/profile-photo-cloud':{},'../lib/profile-photo-events':{photoChanged(){}}});
 const root=ProfilePhotoEditor({scope:'a',name:'A'}),[avatar,badge]=root.props.children;assert.equal(root.props.style.overflow,'visible');assert.equal(avatar.props.style.overflow,'hidden');assert.equal(badge.type,'Pressable');assert.equal(badge.props.testID,'profile-camera-button');assert.ok(badge.props.style.right+badge.props.style.width<root.props.style.width);assert.equal(badge.props.style.bottom,0);assert.equal(badge.props.style.borderRadius,badge.props.style.width/2);assert.ok(root.props.style.width>avatar.props.style.width);
});
const snapshot=load('src/lib/startup-snapshot.ts');
function disk(){const values=new Map();return{values,read:async k=>values.get(k)||null,write:async(k,v)=>values.set(k,v),remove:async k=>values.delete(k)};}
const chat={conversation:{id:'thread',channel:'mobile'},messages:[{id:'message',content:'kept'}],has_more:false,deleted_ids:[],current_id:'thread',cursor_revision:1};
test('054 deleting an unrelated item does not discard retained chat or its history list',async()=>{const d=disk(),s=new snapshot.StartupSnapshot(d,'account');s.remember('/chat-sync/current',chat);s.remember('/conversations?offset=0',{items:[chat.conversation]});s.remember('/home',{tasks:[]});s.forgetData();assert.equal(s.peek('/chat-sync/current').messages[0].id,'message');assert.equal(s.peek('/conversations?offset=0').items[0].id,'thread');assert.equal(s.peek('/home'),undefined);await s.clear();});
test('054 delayed hydration cannot overwrite a newer network result',async()=>{let resolve;const d=disk();d.read=()=>new Promise(r=>resolve=r);const s=new snapshot.StartupSnapshot(d,'a',()=>1000),h=s.hydrate();s.remember('/chat-sync/current',chat);resolve(JSON.stringify({schema:1,entries:[['/chat-sync/current',{at:999,value:{...chat,messages:[]}}]]}));await h;assert.equal(s.peek('/chat-sync/current').messages[0].id,'message');await s.clear();});
test('054 history does not disappear after the disposable dashboard cache expires',async()=>{const d=disk(),s=new snapshot.StartupSnapshot(d,'a',()=>100);s.remember('/chat-sync/current',chat);s.remember('/home',{tasks:[]});await s.flush();const next=new snapshot.StartupSnapshot(d,'a',()=>100+30*86400000);await next.hydrate();assert.equal(next.peek('/chat-sync/current').messages[0].id,'message');assert.equal(next.peek('/home'),undefined);await s.clear();await next.clear();});
test('054 explicit confirmed chat erasure wins over an older disk read in flight',async()=>{let resolve;const d=disk();d.read=()=>new Promise(r=>resolve=r);const s=new snapshot.StartupSnapshot(d,'a',()=>1000),h=s.hydrate();s.forgetChat();resolve(JSON.stringify({schema:1,entries:[['/chat-sync/current',{at:999,value:chat}]]}));await h;assert.equal(s.peek('/chat-sync/current'),undefined);await s.clear();});
function apiFixture(){
 const d=disk(),calls=[];let fail=false,pause=null,response=chat;
 const reads=load('src/lib/startup-preload.ts'),model=load('src/lib/chat-model.ts');
 const {SofiaApi}=load('src/lib/api.ts',{'./startup-snapshot':snapshot,'./encrypted-storage':{encryptedStorage:d},'./startup-preload':reads,'./theme-schedule':{themeTimes:()=>({})},'./agenda-events':{agendaChanged(){},recordRemoved(){}},'./system-events':{systemChanged(){}},'./chat-model':model,'./legacy-md':{LegacyMdAdapter:class{}},'expo-secure-store':{},'@react-native-async-storage/async-storage':{default:{}}},{process:{env:{}},AbortController,fetch:async(url,options)=>{calls.push({url,options});if(pause)await pause;return{ok:!fail,status:fail?500:200,json:async()=>fail?{error:'unavailable'}:response};}});
 const api=new SofiaApi('token',()=>{},'a');return{api,d,calls,fail:v=>fail=v,pause:v=>pause=v,response:v=>response=v};
}
test('054 API never erases cached messages when unrelated deletion or chat deletion fails',async()=>{const f=apiFixture();await f.api.ensureChat();f.fail(true);await assert.rejects(f.api.deleteTask('task'));assert.equal(f.api.cached('/chat-sync/current').messages[0].id,'message');await assert.rejects(f.api.clearChatHistory());assert.equal(f.api.cached('/chat-sync/current').messages[0].id,'message');f.fail(false);f.response({ok:true,conversations:1,messages:1});await f.api.clearChatHistory();assert.equal(f.api.cached('/chat-sync/current'),undefined);await f.api.discardCache();});
test('054 duplicate startup consumers share one ensureChat server operation',async()=>{const f=apiFixture();let resolve;f.pause(new Promise(r=>resolve=r));const a=f.api.ensureChat(),b=f.api.ensureChat();assert.equal(a,b);await tick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,'GET');resolve();await Promise.all([a,b]);await f.api.discardCache();});
test('054 partial message deletion removes only confirmed IDs from retained history',async()=>{const f=apiFixture();f.response({...chat,messages:[{id:'one'},{id:'two'}]});await f.api.ensureChat();f.response({deleted_ids:['one'],failed:[{id:'two',error:'busy'}]});await f.api.deleteChatMessages('thread',['one','two']);assert.deepEqual(Array.from(f.api.cached('/chat-sync/current').messages,m=>m.id),['two']);await f.api.discardCache();});
const agenda=load('src/lib/agenda-cache.ts');
test('054 initial agenda snapshot is already populated before its screen mounts',async()=>{let calls=0;const cache=agenda.createAgendaCache(async()=>{calls++;return{items:[]};},()=>10000);cache.seed('2026-10',{items:[{id:'existing'}]});assert.equal(cache.snapshot('2026-10').items[0].id,'existing');assert.equal(cache.snapshot('2026-10').loading,false);await cache.load('2026-10');assert.equal(calls,0);});
test('054 invalidation refreshes the agenda without replacing saved events with loading',async()=>{let finish;const cache=agenda.createAgendaCache(()=>new Promise(r=>finish=r),()=>10000);cache.seed('2026-10',{items:[{id:'existing'}]});cache.invalidate();const flight=cache.load('2026-10');assert.equal(cache.snapshot('2026-10').loading,false);assert.equal(cache.snapshot('2026-10').items[0].id,'existing');finish({items:[{id:'new'}]});await flight;assert.equal(cache.snapshot('2026-10').items[0].id,'new');});
const {prepareInitialData}=load('src/lib/startup-preparation.ts',{'./agenda-cache':agenda});
test('057 disk hydration finishes before any optional prefetch is permitted',async()=>{const events=[];let hydrate;const api={hydrate:()=>new Promise(r=>hydrate=r),preload:()=>{events.push('network-prefetch');return new Promise(()=>{});}};let ready=false;const p=prepareInitialData(api,async()=>{}).then(()=>ready=true);await tick();assert.equal(ready,false);assert.deepEqual(events,[]);hydrate();await p;assert.equal(ready,true);assert.deepEqual(events,[]);});
test('054 offline existing snapshots are usable without waiting for failed network',async()=>{const api={hydrate:async()=>{},cached:()=>({}),preload:()=>new Promise(()=>{}),home:()=>new Promise(()=>{}),tasks:()=>new Promise(()=>{}),ensureChat:()=>new Promise(()=>{})};await prepareInitialData(api,()=>new Promise(()=>{}));});
test('054 offline launch stays responsive; Home exposes its own retry banner',async()=>{const offline=async()=>{throw Error('offline');};await prepareInitialData({hydrate:async()=>{},preload:offline},offline);});
test('074 heavy menu panels no longer block the Home first frame',()=>{
 const callbacks=[];
 const {useLegacyStartupMounts:useStartupMounts}=load('src/lib/startup-mounts-legacy.ts',{
  'react':{useState:init=>[typeof init==='function'?init():init,()=>{}],useRef:value=>({current:value}),useLayoutEffect:()=>{},useEffect:effect=>{callbacks.push(effect);}},
  './idle-task':{scheduleIdleTask:()=>()=>{}}
 });
 assert.deepEqual(Array.from(useStartupMounts(true,'home')),['home']);
 assert.deepEqual(Array.from(useStartupMounts(true,'agenda')),['home','agenda']);
 assert.deepEqual(Array.from(useStartupMounts(false,'home')),['home']);
 assert.deepEqual(Array.from(useStartupMounts(false,'profile')),['home','profile']);
 assert.equal(callbacks.length,4);
});

function routedApiFixture(handler){
 const d=disk(),calls=[];let expired=0;
 const {SofiaApi}=load('src/lib/api.ts',{'./startup-snapshot':snapshot,'./encrypted-storage':{encryptedStorage:d},'./startup-preload':load('src/lib/startup-preload.ts'),'./theme-schedule':{themeTimes:()=>({})},'./agenda-events':{agendaChanged(){},recordRemoved(){}},'./system-events':{systemChanged(){}},'./chat-model':load('src/lib/chat-model.ts'),'./legacy-md':{LegacyMdAdapter:class{}},'expo-secure-store':{},'@react-native-async-storage/async-storage':{default:{}}},{process:{env:{}},AbortController,fetch:async(url,options)=>{const p=new URL(url).pathname.replace('/api/mobile','');calls.push({p,options});const answer=await handler(p,options);const status=answer.status||200;return{ok:status===200,status,json:async()=>answer.body};}});
 const create=()=>new SofiaApi('token',()=>expired++,'same-account');
 return {api:create(),create,d,calls,expired:()=>expired};
}
test('056 opening blank current resumes only a remotely verified populated personal conversation',async()=>{
 const blank={...chat,conversation:{id:'blank',channel:'mobile',state:'active'},messages:[]};
 const f=routedApiFixture(async p=>({body:p==='/chat-sync'?blank:p==='/conversations'?{items:[{id:'paused',channel:'web',state:'paused',message_count:94},{id:'thread',channel:'mobile',state:'active',message_count:94}],has_more:false}:chat}));
 const page=await f.api.ensureChat();assert.equal(page.conversation.id,'thread');assert.equal(page.messages[0].content,'kept');
 assert.equal(f.calls.filter(x=>x.options.method==='POST').length,1);assert.equal(f.calls.find(x=>x.options.method==='POST').p,'/chat-sync/select');
 assert.ok(!f.calls.some(x=>x.p==='/conversations/paused'));assert.ok(!f.calls.some(x=>x.p==='/chat-sync/current'));
 const next=f.create();await next.hydrate();assert.equal(next.cached('/chat-sync/current').messages[0].content,'kept');
 await f.api.discardCache();await next.discardCache();
});
test('056 empty account startup never creates a conversation; tombstones never trigger recovery',async()=>{
 for(const deleted_ids of [[],['removed']]){
  const f=routedApiFixture(async p=>({body:p==='/chat-sync'?{...chat,conversation:null,messages:[],deleted_ids}: {items:[],has_more:false}}));
  const page=await f.api.ensureChat();assert.equal(page.conversation,null);assert.ok(f.calls.every(x=>x.options.method==='GET'));
  if(deleted_ids.length)assert.equal(f.calls.length,1);
  await f.api.discardCache();
 }
});
test('056 a first reply in a new conversation is durably cached before the send resolves',async()=>{
 const f=routedApiFixture(async()=>({body:{...chat,conversation_id:'brand-new',messages:[{id:'first',role:'assistant',content:'Resposta salva',created_at:'2026-10-08T00:00:00Z'}]}}));
 await f.api.chat({conversation_id:'brand-new',message:'Oi'});
 const next=f.create();await next.hydrate();assert.equal(next.cached('/chat-sync/current').conversation.id,'brand-new');assert.equal(next.cached('/chat-sync/current').messages[0].content,'Resposta salva');
 await f.api.discardCache();await next.discardCache();
});
test('056 an authentication error locks access but does not erase encrypted history',async()=>{
 let unauthorized=false;const f=routedApiFixture(async()=>unauthorized?{status:401,body:{error:'expired'}}:{body:chat});
 await f.api.ensureChat();unauthorized=true;await assert.rejects(f.api.liveBootstrap());assert.equal(f.expired(),1);
 const next=f.create();await next.hydrate();assert.equal(next.cached('/chat-sync/current').messages[0].content,'kept');await f.api.discardCache();await next.discardCache();
});
test('056 repeated native Activity handoffs are not suppressed by a process-global hidden flag',()=>{
 const frames=new Map();let seq=0,hides=0;
 const launch=load('src/lib/launch-handoff.ts',{'react-native':{NativeModules:{SofiaLaunch:{hide:async()=>hides++}}}},{requestAnimationFrame:f=>{frames.set(++seq,f);return seq;},cancelAnimationFrame:i=>frames.delete(i)});
 const paint=()=>{const fs=[...frames.values()];frames.clear();fs.forEach(f=>f());};launch.finishLaunchHandoff();paint();launch.finishLaunchHandoff();paint();assert.equal(hides,2);
});
test('056 native reveal observes real Home/login geometry, and Expo defers unused imports',()=>{
 const fs=require('node:fs'),path=require('node:path');const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
 const native=source('plugins/native/SofiaLaunchOverlay.kt');assert.ok(native.includes('OnPreDrawListener'));assert.ok(native.includes('sofia-home-scroll'));assert.ok(native.includes('view.alpha <= 0f'));assert.ok(native.includes('Process.getStartUptimeMillis()'));assert.ok(native.includes('SOFIA_LAUNCH_${stage}_PROCESS_MS='));assert.ok(!native.includes('root.addView'));
 assert.ok(source('metro.config.js').includes('inlineRequires:true'));
});
test('057 first-frame network fence never blocks the local snapshot but holds live I/O',async()=>{
 const f=apiFixture();f.api.deferNetworkUntilPaint();const live=f.api.liveBootstrap();
 await tick();assert.equal(f.calls.length,0);
 f.api.releaseNetwork();await live;assert.equal(f.calls.length,1);
 await f.api.discardCache();
});
