'use strict';
// Carregamento no estilo Notion: anel fino + linhas, com o título real na tela.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('anel fino (3/4 de círculo, cinza) e linhas finas no lugar dos blocos',()=>{
 const l=read('src/components/Loading.tsx');
 assert.ok(l.includes('strokeDasharray'));assert.ok(l.includes('c.muted'));assert.ok(l.includes("easing: Easing.linear"));
 assert.ok(!l.includes('useReducedMotion')&&!l.includes('if (reduced)'),'continua girando mesmo com animações desligadas no celular');
});
test('abertura dos apps, abas, páginas, apps internos e entrada usam o novo carregamento',()=>{
 assert.ok(read('src/components/ModuleSkeleton.tsx').includes('<PageLoading testID="module-skeleton"'));
 assert.ok(read('src/screens/Pages.tsx').includes('<PagesLoadingBody/>'),'Paginas: esqueleto na estrutura real (07/11/2026)');
 for(const f of ['src/components/ScreenSkeleton.tsx','src/screens/Monitoring.tsx','src/screens/Finance.tsx','src/screens/Mail.tsx'])assert.ok(read(f).includes('<LoadingLines'),f);
 assert.ok(read('App.tsx').includes('{booting?<Spinner size={26}/>:null}'));
 assert.ok(!read('src/components/PageAppearance.tsx').includes('<ActivityIndicator color={c.accent}/></View>;'),'capa sem a rodinha grossa');
});
