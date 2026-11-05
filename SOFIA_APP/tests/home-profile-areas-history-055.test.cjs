'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
const read=p=>fs.readFileSync(require.resolve('../'+p),'utf8');
test('055 transient empty chat windows retain old messages until explicit tombstones',()=>{
 const model=load('src/lib/chat-model.ts');
 const {reconcileMessages}=load('src/lib/chat-sync.ts',{'./chat-model':model});
 const old=[{id:'original',sequence:1,created_at:'2026-10-07T00:00:00Z',role:'user',content:'preserved'}];
 assert.equal(reconcileMessages(old,{messages:[],has_more:false,deleted_ids:[]})[0].id,'original');
 assert.equal(reconcileMessages(old,{messages:[],has_more:false,deleted_ids:['original']}).length,0);
});
test('055 encrypted snapshot ignores unexplained empty chat responses, explicit clear still works',async()=>{
 const {StartupSnapshot}=load('src/lib/startup-snapshot.ts');
 const disk=new Map(),storage={read:async k=>disk.get(k)||null,write:async(k,v)=>disk.set(k,v),remove:async k=>disk.delete(k)};
 const cache=new StartupSnapshot(storage,'scope');
 const previous={conversation:{id:'owner-chat'},messages:[{id:'one',content:'saved'}],has_more:false,deleted_ids:[]};
 cache.remember('/chat-sync/current',previous);
 cache.remember('/chat-sync/current',{...previous,messages:[]});
 assert.equal(cache.peek('/chat-sync/current').messages[0].content,'saved');
 cache.remember('/conversations?offset=0',{items:[{id:'owner-chat'}]});
 cache.remember('/conversations?offset=0',{items:[]});
 assert.equal(cache.peek('/conversations?offset=0').items[0].id,'owner-chat');
 cache.forgetChat();assert.equal(cache.peek('/chat-sync/current'),undefined);
 await cache.clear();
});
test('055 Home profile picture and shared-area task filter are connected',()=>{
 const src=read('src/screens/Home.tsx');
 assert.ok(src.includes('ProfileAvatar scope={bootstrap.profile.email}'));
 assert.ok(src.includes('Filtrar áreas das tarefas do Início'));
 assert.ok(src.includes('(!areaFilter||'));
 assert.ok(src.includes('load={loadHomeCommitmentEditor}'));assert.ok(read('src/lib/screen-loader.tsx').includes("require('../components/HomeCommitmentEditor').HomeCommitmentEditor"));
 assert.ok(src.includes('onCreate={day=>void createHomeCommitment(day)}'));
});
test('055 profile editor propagates avatar edits to Home',()=>{
 const editor=read('src/components/ProfilePhotoEditor.tsx'),avatar=read('src/components/ProfileAvatar.tsx');
 assert.ok(editor.includes('photoChanged(scope,saved)'));
 assert.ok(editor.includes("photoChanged(scope,'')"));
 assert.ok(avatar.includes('subscribeProfilePhoto(scope,setUri)'));
});
test('055 new Home appointment sends selected priority and shared area without opening Agenda',()=>{
 const src=read('src/components/HomeCommitmentEditor.tsx');
 assert.ok(src.includes('api.saveEntity('));
 assert.ok(src.includes('priority_level:priority'));
 assert.ok(src.includes('creatable value={area}'));
 assert.ok(src.includes('GoogleCalendarProperty'));
});
// 05/11/2026 (Pedro: "essas areas tem que ser criadas pelo proprio usuario"): a lista deixou de juntar as areas escritas
// nos registros (a IA inventava nomes); o catalogo devolve so as areas criadas pela pessoa.
test('055/05-11 backend catalog returns only the areas the person created',()=>{
 const backend=read('../src/core/api45.js');
 assert.ok(backend.includes("return send({catalog:CATALOG,areas:store.userAreas()});"));
 assert.ok(!backend.includes('SELECT area FROM tasks'));
});
