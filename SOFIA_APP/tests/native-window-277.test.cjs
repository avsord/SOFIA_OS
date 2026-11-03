'use strict';
// 03/11/2026 (#277): o Inicio do site passou a rodar no celular e caiu com "TypeError: undefined is not a function em
// Timeline > HomeBrief": no Android `window` existe mas nao tem addEventListener, entao `typeof window === 'undefined'`
// nao protege. Os componentes do site usados no celular so ligam atalhos de navegador com a guarda de plataforma web.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const file of ['src/desktop/HomeBrief.tsx','src/desktop/AgendaDesk.tsx']){
 test('277: '+file+' nao chama window/document.addEventListener no Android',()=>{
  const s=fs.readFileSync(path.join(root,file),'utf8');
  assert.doesNotMatch(s,/typeof window === 'undefined'/,'guarda so com typeof window nao protege no Android');
  const effects=s.split('useEffect(').slice(1).map(b=>b.slice(0,Math.max(0,b.indexOf('return () =>'))||400)).filter(b=>/(window|document)\.addEventListener\(/.test(b));
  assert.ok(effects.length>0);
  for(const e of effects)assert.match(e.slice(0,220),/!WEB|Platform\.OS !== 'web'/,'efeito sem guarda de plataforma: '+e.slice(0,120));
 });
}
