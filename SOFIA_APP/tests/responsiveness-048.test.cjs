'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs'),fs=require('fs'),path=require('path');
const kanban=load('src/lib/kanban.ts');
const capsule=load('src/lib/capsule-model.ts');
const bell=load('src/lib/bell-inbox.ts',{'./capsule-model':capsule});
const snapshot=load('src/lib/startup-snapshot.ts');
const chat=load('src/lib/chat-tail.ts',{'react':{},'react-native':{}});
const file=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
function disk(){const m=new Map();return{read:async k=>m.get(k)||null,write:async(k,v)=>{m.set(k,v);},remove:async k=>{m.delete(k);},m};}
const row=(id,status)=>({id,values:{name:id,status,extra:'preserved'},page_content:'Description '+id});
test('Kanban target uses measured geometry including unequal widths and scroll offsets',()=>{const c=[{value:'a',x:0,width:180},{value:'b',x:192,width:290},{value:'c',x:494,width:246}];assert.equal(kanban.columnAt(c,181),'a');assert.equal(kanban.columnAt(c,200),'b');assert.equal(kanban.columnAt(c,520),'c');assert.equal(kanban.columnAt(c,NaN),null);});
test('Kanban move preserves identity descriptions and unrelated custom fields',()=>{const original=[row('a','todo'),row('b','done')];const result=kanban.moveKanbanRow(original,'a','status','done','b');assert.equal(result[0].id,'a');assert.equal(result[0].values.status,'done');assert.equal(result[0].values.extra,'preserved');assert.equal(result[0].page_content,'Description a');assert.equal(original[0].values.status,'todo');assert.equal(result.length,2);});
test('Kanban reorders within a column without duplicating or losing cards',()=>{const r=[row('a','x'),row('b','x'),row('c','x')];assert.deepEqual(Array.from(kanban.moveKanbanRow(r,'c','status','x','a'),r=>r.id),['c','a','b']);assert.deepEqual(Array.from(kanban.moveKanbanRow(r,'a','status','x'),r=>r.id),['b','c','a']);});
test('Kanban edge scroll has a dead center and bounded speed on both edges',()=>{assert.equal(kanban.edgeSpeed(150,300),0);assert.ok(kanban.edgeSpeed(5,300)<0);assert.ok(kanban.edgeSpeed(295,300)>0);assert.equal(kanban.edgeSpeed(800,300),14);});
test('chat newest-first order never mutates canonical chronological history',()=>{const a=['old','new'];assert.deepEqual(Array.from(chat.newestFirst(a)),['new','old']);assert.deepEqual(a,['old','new']);});
test('chat follows native zero unless the user explicitly scrolls away',()=>{const i=new chat.ChatTailIntent();assert.equal(i.position(400),false);i.begin();assert.equal(i.position(400),true);i.end();i.follow();assert.equal(i.following,true);assert.equal(i.position(0),false);});
test('chat tail has no animated travel, and the production list is inverted',()=>{assert.ok(!file('src/lib/chat-tail.ts').includes('animated:true'));const s=file('src/screens/Chat.tsx');assert.ok(s.includes('inverted initialNumToRender'));assert.ok(s.includes('data={reverseMessages}'));assert.ok(s.includes('previous={reverseMessages[index+1]}'));});
test('native menu moves pager on DOWN; blocked controls never bypass React guard',()=>{
 const s=file('plugins/native/SofiaCalendarTouchGuard.kt'),input=s.slice(s.indexOf('private fun immediateMenu('),s.indexOf('private fun menuAt('));
 assert.ok(s.includes('immediateMenu(root, event)'));
 assert.ok(input.includes('index in 0..5'));
 assert.ok(input.includes('tag != "sofia-menu-blocked"'));
 assert.ok(input.includes('pager.scrollEnabled && pager.width > 0'));
 assert.ok(input.includes('pager.scrollTo(target, 0)'),'No waiting for JS to move the real native viewport');
 assert.ok(!input.includes('.alpha ='),'Do not override native icon opacity');
 assert.ok(input.includes('return true // Locked buttons'));
 assert.ok(file('src/components/MenuTab.tsx').includes("locked?'sofia-menu-blocked'"));
});
test('snapshots only admit initial read surfaces, not credentials or large pagination',()=>{assert.equal(snapshot.cacheableRead('/auth/login'),false);assert.equal(snapshot.cacheableRead('/workspace/entities?limit=100&kind=user_page&q=&offset=100'),false);assert.equal(snapshot.cacheableRead('/workspace/entities?limit=100&kind=user_page&q=&offset=0'),true);assert.equal(snapshot.cacheableRead('/chat-sync/current'),true);});
test('snapshot hydrate separates accounts and purge prevents old cache writes',async()=>{const d=disk(),a=new snapshot.StartupSnapshot(d,'a',()=>10000);a.remember('/home',{title:'private'});await a.flush();const b=new snapshot.StartupSnapshot(d,'b',()=>10000);await b.hydrate();assert.equal(b.peek('/home'),undefined);const again=new snapshot.StartupSnapshot(d,'a',()=>10001);await again.hydrate();assert.equal(again.peek('/home').title,'private');await again.clear();again.remember('/home',{title:'resurrected'});await again.flush();assert.equal(await d.read('a'),null);await a.clear();});
test('expired/corrupt snapshots fail as cache misses, not authentication failures',async()=>{const d=disk();d.m.set('s','bad-json');const s=new snapshot.StartupSnapshot(d,'s',()=>1e10);await s.hydrate();assert.equal(s.peek('/home'),undefined);d.m.set('s',JSON.stringify({schema:1,entries:[['/home',{at:1,value:'old'}],['/auth/login',{at:1e10,value:'secret'}]]}));await s.hydrate();assert.equal(s.peek('/home'),undefined);assert.equal(s.peek('/auth/login'),undefined);});
test('encrypted cache uses Android Keystore, authenticated scope and no backup path',()=>{const s=file('plugins/native/SofiaAlarmPackage.kt');for(const token of ['AES/GCM/NoPadding','AndroidKeyStore','noBackupFilesDir','updateAAD','AtomicFile','newSingleThreadExecutor'])assert.ok(s.includes(token),token);assert.ok(!file('src/lib/encrypted-storage.ts').includes('AsyncStorage'));});
const plan={id:'p',title:'Cuidado',state:'active',data:{times_json:'["08:00","20:00"]',start_date:'2026-10-07',notifications:true}};
const now=new Date('2026-10-07T09:00:00');
test('due capsules enter bell while future doses do not',()=>{const n=bell.dueNotices([plan],[],[],[],now);assert.equal(n.length,1);assert.equal(n[0].category,'capsule');assert.ok(n[0].id.includes('08:00'));});
test('completed capsules are not regenerated as pending alerts',()=>{const h={id:'h',data:{capsule_id:'p',day:'2026-10-07',time:'08:00'}};assert.equal(bell.dueNotices([plan],[h],[],[],now).length,0);});
test('routine weekdays, monthly clamp, start/end and paused state are honored',()=>{const p={id:'r',state:'active',data:{frequency:'monthly',monthday:31,time:'08:00',starts_on:'2026-01-01'}};assert.equal(bell.routineOccurs(p,'2026-02-28'),true);assert.equal(bell.routineOccurs(p,'2026-02-27'),false);assert.equal(bell.routineOccurs({...p,state:'paused'},'2026-02-28'),false);});
test('Android delivered notification is isolated by account scope',()=>{const req={identifier:'native1',content:{title:'Dose',data:{sofiaCapsule:true,scope:bell.notificationScope('a'),planId:'p',day:'2026-10-07',time:'08:00'}}};assert.equal(bell.presentedNotice(req,'b'),null);assert.equal(bell.presentedNotice(req,'a',now.getTime()).id,'local:capsule:p:2026-10-07:08:00');});
test('due and delivered capsule share one ID; read and dismissed state survive reload',async()=>{const d=disk(),inbox=new bell.BellInbox(d,'a',()=>now.getTime()),n=bell.dueNotices([plan],[],[],[],now);inbox.ingest(n);inbox.ingest(n);assert.equal(inbox.items.length,1);inbox.read(n[0].id);const next=new bell.BellInbox(d,'a',()=>now.getTime());await next.hydrate();assert.equal(next.items[0].state,'read');next.dismiss(n[0].id);next.ingest(n);assert.equal(next.items.length,0);const third=new bell.BellInbox(d,'a',()=>now.getTime());await third.hydrate();third.ingest(n);assert.equal(third.items.length,0);});
test('server routine notice replaces its derived duplicate and monitors remain visible',()=>{const local={id:'local:r',title:'Routine',created_at:now.toISOString(),dedup:'r:day:time'},remote={...local,id:'server'},monitor={id:'monitor',category:'price',created_at:now.toISOString()};const merged=bell.mergeBellNotices([remote,monitor],[local]);assert.equal(merged.length,2);assert.ok(merged.some(x=>x.id==='monitor'));});
test('form template identity is updated without changing persistent template IDs',()=>{const templates=load('src/lib/page-templates.ts').PAGE_TEMPLATES;const f=templates.find(t=>t.id==='playlist_links');assert.equal(f.title,'Tabela');assert.equal(f.icon,'▤');assert.equal(f.blocks[0].data.views[0].label,'Tabela');assert.equal(f.blocks[0].data.views[0].id,'links');/* 14/11/2026: o Formulário virou a Tabela (item 13); mesmo id */});

test('native menu hit-testing cannot confuse the containing bar with a tab',()=>{const s=file('plugins/native/SofiaCalendarTouchGuard.kt');assert.ok(s.includes('tag.matches(Regex("sofia-menu-[0-5]"))'));assert.ok(!s.includes('tag.startsWith("sofia-menu-")'));});
test('acknowledged chat replies enter the next-start snapshot and pre-write reads cannot replace it',()=>{const s=file('src/lib/api.ts');assert.ok(s.includes('this.rememberChatResult(result,data)'));assert.ok(s.includes('generation===this.cacheGeneration'));assert.ok(s.includes('messages:mergeMessages(before?.messages||[],result.messages).slice(-100)'));});

test('Home keeps monitoring failures local instead of showing a global error',()=>{
 const home=file('src/screens/Home.tsx'),preload=file('src/lib/startup-preload.ts');
 assert.ok(home.includes('One broken monitor must not turn the whole Home into an error.'));
 assert.ok(home.includes('Monitoring is secondary; Home, Agenda and Tasks stay usable.'));
 assert.ok(preload.includes("catalog?priority.filter(kind=>kind in catalog.catalog):['user_page','routine','monitor']"));
 assert.ok(!preload.includes("['user_page','capsule','routine','monitor'].includes(kind)"));
});
