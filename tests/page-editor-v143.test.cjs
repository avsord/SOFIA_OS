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

test('v144: barra lateral, prévia, seleção de blocos e espaço → Sofia estão ligados', ()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','public','ui-current.css'),'utf8');
  for(const fn of ['showSidebarPageMenu','renameSidebarPage','duplicateUserPage','moveUserPage','bindSidebarPageDrag','renderPageTopMeta','showPagePreview','enterBlockSelection','deleteSelectedBlocks','openSofiaFromPage'])
    assert.match(app,new RegExp('function '+fn+'\\('),fn);
  assert.ok(app.includes("bindSidebarPageDrag(row,b,page)"),'páginas da barra lateral podem ser arrastadas');
  assert.ok(app.includes("if(page.id===parentId||parentId&&pageIsDescendant(parentId,page.id))"),'mover impede ciclo pai/filho');
  assert.ok(css.includes('.mode-user #userPagesNav{max-height:none!important'),'lista de páginas não fica presa em 180px');
});
