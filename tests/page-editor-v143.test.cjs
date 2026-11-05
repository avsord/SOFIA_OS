'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {CATALOG}=require('../src/core/catalog.js');

test('v143: página do usuário aceita todos os campos que o painel envia ao salvar', ()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const keys=JSON.parse(app.match(/const USER_PAGE_DATA_KEYS=(\[[^\]]*\])/)[1].replace(/'/g,'"'));
  const server=new Set(CATALOG.user_page.fields.map(f=>f.key));
  for(const key of keys)assert.ok(server.has(key),'campo enviado pelo painel e recusado pelo servidor: '+key);
});

test('v143: editor de blocos divide, junta e abre o menu "/" pelo teclado', ()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  for(const fn of ['handleBlockEnter','handleBlockBackspace','handleBlockDelete','openSlashMenu','chooseSlashItem','pastePageLines','rerenderPageBlocks'])
    assert.match(app,new RegExp('function '+fn+'\\('),fn);
});
