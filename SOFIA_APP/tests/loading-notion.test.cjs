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
 for(const f of ['src/components/ScreenSkeleton.tsx','src/screens/Monitoring.tsx'])assert.ok(read(f).includes('<LoadingLines'),f);
 // 07/11/2026 (Pedro: esqueleto na estrutura real): Financas, E-mails, Listas, Biblioteca, Notas e Todos os registros
 assert.ok(read('src/screens/Finance.tsx').includes('<FinanceDeskSkeleton />')&&read('src/screens/Finance.tsx').includes('<FinancePhoneSkeleton />'),'Financas');
 assert.ok(read('src/screens/Mail.tsx').includes('<RowsSkeleton desktop={desktop} rows={5} lead="icon" testID="mail-skeleton" />'),'E-mails');
 assert.ok(read('src/screens/Lists.tsx').includes('if (!data) return <ListsSkeleton desktop={desktop} />;'),'Listas');
 assert.ok(read('src/screens/Library.tsx').includes('testID="library-skeleton"')&&!read('src/screens/Library.tsx').includes('<AppSkeleton'),'Biblioteca');
 assert.ok(read('src/screens/Notes.tsx').includes('testID="notes-skeleton"')&&!read('src/screens/Notes.tsx').includes('<AppSkeleton'),'Notas');
 assert.ok(read('App.tsx').includes('{booting?<Spinner size={26}/>:null}'));
 assert.ok(!read('src/components/PageAppearance.tsx').includes('<ActivityIndicator color={c.accent}/></View>;'),'capa sem a rodinha grossa');
});
