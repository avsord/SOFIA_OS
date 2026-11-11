'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/lib/update.ts'),'utf8');
const exported={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:exported,AbortController,setTimeout,clearTimeout,Date,Error,Promise});
const {newestPublishedUpdate:pick,checkForUpdate:check,compareVersions}=exported;
function release(v,patch={}){return{tag_name:'sofia-android-v'+v,draft:false,prerelease:false,published_at:'2026-10-02T14:24:27Z',name:'Sofia '+v,assets:[{name:'Sofia-OS.apk',state:'uploaded',size:10,browser_download_url:'https://github.com/avsord/SOFIA_OS/releases/download/sofia-android-v'+v+'/Sofia-OS.apk'}],...patch};}
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const plain=x=>JSON.parse(JSON.stringify(x));
test('real regression: 0.3.9 first and 0.3.10 last still offers 0.3.10',()=>{
 const rows=['0.3.9','0.3.8','0.3.7','0.3.6','0.3.5','0.3.4','0.3.3','0.3.2','0.3.10'].map(v=>release(v));
 assert.equal(pick(rows,'0.3.9').version,'0.3.10');assert.equal(rows[0].tag_name,'sofia-android-v0.3.9');
});
test('numeric ordering is independent of API order, lexical order and dates',()=>{
 const rows=['0.3.9','0.3.100','0.3.10','0.3.11','0.3.99'].map(v=>release(v));
 for(let i=0;i<rows.length;i++){assert.equal(pick(rows,'0.3.9').version,'0.3.100');rows.push(rows.shift());}
 assert.equal(compareVersions('0.3.10','0.3.9'),1);assert.equal(compareVersions('1.0.0','0.99.99'),1);
});
test('does not offer the installed version or downgrade',()=>{assert.equal(pick([release('0.3.11')],'0.3.11'),null);assert.equal(pick([release('0.3.10')],'0.3.11'),null);});
test('ignores drafts, prereleases, other prefixes and malformed versions',()=>{
 const rows=[release('0.3.11'),release('9.0.0',{draft:true}),release('8.0.0',{prerelease:true}),release('7.0.0',{tag_name:'sofia-android-official-v7.0.0'}),release('5.0.0-beta'),release('04.0.0'),release('3.0.0',{published_at:null}),{},null];
 assert.equal(pick(rows,'0.3.10').version,'0.3.11');
});
test('requires complete exact APK assets and the exact trusted tag URL',()=>{
 const good=release('0.3.11');
 for(const patch of [{size:0},{state:'new'},{name:'another-app.apk'},{browser_download_url:'https://github.com.evil.test/avsord/SOFIA_OS/releases/download/sofia-android-v9.0.0/Sofia-OS.apk'},{browser_download_url:good.assets[0].browser_download_url}]){
  const bad=release('9.0.0');Object.assign(bad.assets[0],patch);assert.equal(pick([bad,good],'0.3.10').version,'0.3.11');
 }
});
test('empty or invalid feed cannot falsely claim that the app is up to date',()=>{
 assert.throws(()=>pick([]));assert.throws(()=>pick([release('0.3.12',{assets:[]})]));assert.throws(()=>compareVersions('0.3','0.3.9'));
});
test('list and latest are checked without cache, then numerically reconciled',async()=>{
 const calls=[];const result=await check({currentVersion:'0.3.9',fetcher:async(url,init)=>{calls.push([url,init]);return response(url.includes('/latest')?release('0.3.10'):[release('0.3.9')]);}});
 assert.equal(result.version,'0.3.10');assert.equal(calls.length,2);
 for(const [url,init] of calls){assert.ok(url.includes('_='));assert.equal(init.cache,'no-store');assert.equal(init.headers['Cache-Control'],'no-cache');assert.ok(init.signal);}
});
test('list remains authoritative when latest points to an older or unrelated release',async()=>{
 const result=await check({currentVersion:'0.3.10',fetcher:async url=>response(url.includes('/latest')?{tag_name:'server-v141.0.0'}:[release('0.3.10'),release('0.3.11')])});assert.equal(result.version,'0.3.11');
});
test('pagination finds a newer release beyond the first 100 rows',async()=>{
 const pages=[];const result=await check({currentVersion:'0.3.10',fetcher:async url=>{
  if(url.includes('/latest'))return response(release('0.3.10'));
  const page=new URL(url).searchParams.get('page');pages.push(page);return response(page==='1'?Array.from({length:100},()=>release('0.3.9')):[release('0.3.11')]);
 }});assert.equal(result.version,'0.3.11');assert.deepEqual(pages,['1','2']);
});
test('latest can recover a failed list only when it proves a newer valid APK',async()=>{
 const result=await check({currentVersion:'0.3.10',fetcher:async url=>url.includes('/latest')?response(release('0.3.11')):response({},403)});assert.equal(result.version,'0.3.11');
 await assert.rejects(check({currentVersion:'0.3.11',fetcher:async url=>url.includes('/latest')?response(release('0.3.11')):response({},403)}),/403/);
});
test('valid list still works when the optional latest endpoint fails or is absent',async()=>{
 for(const status of [403,404,500]){
  const result=await check({currentVersion:'0.3.10',fetcher:async url=>url.includes('/latest')?response({},status):response([release('0.3.11')])});assert.equal(result.version,'0.3.11');
 }
});
test('offline or rate-limited checks throw instead of reporting newest installed',async()=>{
 await assert.rejects(check({fetcher:async()=>response({},403)}),/403/);
 await assert.rejects(check({fetcher:async()=>{throw Error('Offline');}}),/Offline/);
 await assert.rejects(check({fetcher:async url=>response(url.includes('/latest')?null:[])}));
});
test('abandoned requests are aborted and produce a recoverable timeout error',async()=>{
 await assert.rejects(check({timeoutMs:5,fetcher:async(_url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Error('aborted'))))}),/demorou demais/);
});
test('truncated pagination is not mistaken for a complete up-to-date list',async()=>{
 await assert.rejects(check({currentVersion:'0.3.11',fetcher:async url=>response(url.includes('/latest')?release('0.3.11'):Array.from({length:100},()=>release('0.3.10')))}),/incompleta/);
});
test('automatic discovery is retried on foreground and while open without blocking navigation',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../App.tsx'),'utf8');
 assert.ok(app.includes('setInterval(()=>void checkUpdate(false),300000)'));
 assert.ok(app.includes("if(state==='active')void checkUpdate(false)"));
 assert.ok(app.includes('clearInterval(interval);sub.remove()'));
 assert.ok(app.includes('lastUpdatePrompt.current===update.version'));
 assert.ok(app.includes("if(manual)appAlert('Atualizações',errorText(e))"));
});
