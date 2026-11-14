'use strict';
// 14/11/2026 (Pedro: "nao ta pulsando na tela maior", "varias coisas nao sincronizam com o outro navegador na tela maior"):
// janela lado a lado sem foco nao atualizava a barra lateral; aba aberta antes de uma atualizacao ficava no codigo velho;
// o pulso dependia do "efeitos de animacao" do Windows.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');
const {bundleOf,shouldReload}=require('../src/lib/web-version.ts');

test('barra lateral busca de novo mesmo sem foco e confere versao nova',()=>{
 const s=read('src/desktop/DesktopShell.tsx');
 assert.ok(s.includes('setInterval(vis,15000)')&&s.includes("addEventListener('visibilitychange',vis)")&&s.includes('watchWebVersion()'));
});
test('aba com codigo velho recarrega so escondida ou sem foco',()=>{
 assert.equal(bundleOf('<script src="/_expo/static/js/web/index-abc123.js" defer></script>'),'index-abc123.js');
 assert.equal(shouldReload('index-a.js','index-a.js',true,5),false);
 assert.equal(shouldReload('index-a.js','index-b.js',false,0),false,'com foco espera');
 assert.equal(shouldReload('index-a.js','index-b.js',true,2),true,'escondida 2 vezes recarrega');assert.equal(shouldReload('index-a.js','index-b.js',true,1),false);
 assert.equal(shouldReload('index-a.js','index-b.js',false,9),false,'visivel sem foco (print, janela ao lado) nao recarrega');
 assert.equal(shouldReload('index-a.js','',true,9),false,'sem resposta do servidor nao recarrega');
});
test('ponto do agora pulsa sem depender do movimento reduzido',()=>{
 const s=read('src/desktop/HomeBrief.tsx');
 assert.ok(s.includes('WEB ? NOW_PULSE.halo : null'));
});
