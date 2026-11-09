'use strict';
// "As telas dos menus estão piscando no início quando abre o app": o
// esqueleto virava o conteúdo de verdade num corte seco, bem na hora em
// que o aquecimento em segundo plano terminava — se a pessoa olhasse ou
// tocasse o menu nesse instante, via um corte brusco de layout (parecia
// uma piscada). Agora os dois ficam empilhados e o conteúdo esmaece por
// cima, em vez de substituir de uma vez.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('FadeSwap: fica no esqueleto até o conteúdo existir, e esmaece ao trocar (nunca corte seco)',()=>{
 const s=read('src/components/Loading.tsx');
 assert.ok(s.includes('export function FadeSwap('));
 assert.ok(s.includes('duration: 160'));
 assert.ok(s.includes('useNativeDriver: true'));
 assert.ok(s.includes('if (!everReady) return <>{fallback}</>;'),'enquanto não ficou pronto nem uma vez, mostra só o esqueleto');
});
test('as cinco telas de menu (Conversa, Páginas, Agenda, Apps, Perfil) trocam com FadeSwap',()=>{
 const app=read('App.tsx');
 for(const tab of ['chat','pages','agenda','apps','profile']){
  assert.ok(app.includes("<FadeSwap ready={mountedTabs.has('"+tab+"')} fallback={<ScreenSkeleton tab='"+tab+"'"+(tab==='pages'?" pageId={pageTarget.id}/>}>":tab==='apps'?" module={":"/>}>")),tab); // 08/11/2026: Paginas sabe a pagina que esta abrindo; 09/11: Apps sabe o app
 }
 assert.ok(!/\{mountedTabs\.has\('(chat|pages|agenda|apps|profile)'\)\?<DeferredScreen/.test(app),'nenhuma troca em corte seco restante');
});
