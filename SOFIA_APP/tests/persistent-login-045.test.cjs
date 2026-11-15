'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function apiFixture(){
 let stored=JSON.stringify({token:'a'.repeat(43),expires_at:'2000-01-01T00:00:00Z',profile:{email:'owner@test.invalid'}}),deleted=0;
 const secure={getItemAsync:async()=>stored,deleteItemAsync:async()=>{deleted++;stored=null;}};
 const exported={},early=require('./load-ts.cjs')('src/lib/startup-read-ahead.ts');
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/lib/api.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exported,require:name=>name==='./startup-read-ahead'?early:name==='expo-secure-store'?secure:name==='@react-native-async-storage/async-storage'?{}:{},URL,process:{env:{}},Date,JSON,Error,Number});
 return {exported,deleted:()=>deleted,set:value=>{stored=value;}};
}
// 14/11/2026: o login dura 30 dias no servidor; login guardado ja vencido abre direto no login (nao mostra conteudo antes)
test('expired saved login opens the login screen directly',async()=>{const f=apiFixture();assert.equal(await f.exported.readAuth(),null);assert.equal(f.deleted(),1);});
test('saved login still valid is kept',async()=>{const f=apiFixture();f.set(JSON.stringify({token:'a'.repeat(43),expires_at:new Date(Date.now()+864e5).toISOString(),profile:{email:'owner@test.invalid'}}));assert.equal((await f.exported.readAuth()).token,'a'.repeat(43));assert.equal(f.deleted(),0);});
test('malformed local token is still discarded',async()=>{const f=apiFixture();f.set(JSON.stringify({token:'invalid',expires_at:'2000-01-01',profile:{}}));assert.equal(await f.exported.readAuth(),null);assert.equal(f.deleted(),1);});
