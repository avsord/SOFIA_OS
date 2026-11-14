'use strict';
// 0.3.250: layout de computador no site (estilo Notion) - so na web com tela larga; o celular nao muda.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('breakpoint so na web, a partir de 1024 px',()=>{
  const d=read('src/lib/desktop.ts');
  assert.ok(d.includes('export const DESKTOP_MIN=900;')); // 0.3.260: metade da tela (~960) ja e computador
  assert.ok(d.includes("return Platform.OS==='web'&&(EMBED||(Number.isFinite(width)&&width>=DESKTOP_MIN));")) // 08/11/2026: pagina dentro do Quadro (?embed=1) sempre no layout do computador;
  assert.ok(d.includes("if(Platform.OS!=='web')return 2;"),'grade de Apps no celular continua com 2 colunas');
});
test('App: moldura e pager de computador so carregam na web; barra de baixo some no computador',()=>{
  const a=read('App.tsx');
  assert.ok(a.includes("Platform.OS==='web'?require('./src/desktop/DesktopShell').DesktopFrame:null"));
  assert.ok(a.includes("Platform.OS==='web'?require('./src/desktop/DesktopPages').makeResponsivePager(NativeTabPager):NativeTabPager"));
  assert.ok(a.includes('maxWidth:desktop?undefined:760'));
  assert.ok(a.includes('{!keyboard&&!desktop&&!tablet?<View nativeID="sofia-menu-bar"'),'barra de baixo some no computador e no tablet');
  assert.ok(!/from '\.\/src\/components\/DesktopShell'/.test(a),'sem import direto (nao pesa na abertura do celular)');
});
test('moldura: barra lateral recolhivel, arvore de paginas, caminho, busca Ctrl+K e atalhos',()=>{
  const s=read('src/desktop/DesktopShell.tsx'),d=read('src/lib/desktop.ts');
  for(const id of ['desktop-sidebar','desktop-topbar','desktop-breadcrumb','desktop-search','desktop-sidebar-toggle','command-palette-input'])assert.ok(s.includes(id),id);
  assert.ok(s.includes('<NotificationBell onViewAll='));assert.ok(s.includes('function PageTree('));
  assert.ok(d.includes("if(mod&&(k==='k'||(k==='p'&&!e.shiftKey&&!e.altKey)))")&&d.includes("e.code==='Backslash'")&&d.includes('e.altKey&&!mod&&!typing&&/^[1-6]$/'));
  // 13/11/2026 (Mimic Kaizen, itens 5 e 11): Ctrl+P abre a busca; borda da lateral estica, lembrada, dois cliques voltam ao padrão
  assert.ok(s.includes('testID="desktop-sidebar-resizer"')&&s.includes('if(ne?.detail>=2){onChange(SIDEBAR_WIDTH,true);return;}')&&s.includes('(collapsed?SIDEBAR_COLLAPSED:sideW)'));
  assert.ok(d.includes("const WIDTH_KEY='sofia.desktop.sidebar.width'")&&d.includes('SIDEBAR_MIN=200,SIDEBAR_MAX=420'));
});
test('telas: Paginas abre pela barra lateral; Inicio em colunas; folhas viram janela central',()=>{
  const p=read('src/screens/Pages.tsx');assert.ok(p.includes('openPageKey=0,openPageId=')&&p.includes('pagesDirectory.set(displayPages)')&&p.includes('pagePath.set(trail)'));
  const h=read('src/screens/Home.tsx');assert.ok(h.includes('columns={columns} openKey={organizeKey}'));
  assert.ok(read('src/components/SortableWidgets.tsx').includes('testID="home-widget-grid"'));
  // 0.3.263: no centro quando nao houve clique recente; perto do clique quando houve
  // 0.3.328: centralizada no CONTEUDO (a direita da barra lateral), nunca por cima da barra
  assert.ok(read('src/components/Sheet.tsx').includes("style={desktop?(anchored?{flex:1}:{flex:1,justifyContent:'center',alignItems:'center',padding:32,...(area?{paddingLeft:area.left+32}:null)})"));
  assert.ok(read('src/components/Sheet.tsx').includes('const area=desktop?contentArea():null,inside=!!area&&!!anchor&&anchor.x>=area.left;'));
});
