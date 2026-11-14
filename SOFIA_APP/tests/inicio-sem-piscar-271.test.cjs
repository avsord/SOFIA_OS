'use strict';
// 06/11/2026 (Pedro: "Inicio piscando as bolinhas, Boa tarde pulando"): o Inicio do site redesenhava inteiro a cada 1 s
// (tique da Rotina), o bloco de Financas era recriado a cada redesenho e a aureola do "agora" era animada pelo JavaScript.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('Rotina: o tique so redesenha quando muda o minuto (nao a cada segundo)',()=>{
  const s=read('src/lib/capsule-store.ts');
  assert.match(s,/const m=new Date\(\)\.getMinutes\(\);if\(m!==minute\)\{minute=m;tick\(\);\}/);
  assert.ok(!/\{tick\(\);if\(\+\+count%30===0\)/.test(s),'tick() incondicional a cada 1 s voltou');
});
test('Inicio: Stat das Financas fica fora do FinanceTile (nao e recriado a cada redesenho)',()=>{
  const s=read('src/desktop/HomeBrief.tsx');
  const ft=s.slice(s.indexOf('function FinanceTile('),s.indexOf('\n}\n',s.indexOf('function FinanceTile(')));
  assert.ok(!/const Stat\s*=/.test(ft),'componente criado dentro do FinanceTile');
  assert.ok(s.indexOf('function Stat(')>=0&&s.indexOf('function Stat(')<s.indexOf('function FinanceTile('));
});
test('Inicio estatico (07/11, Pedro: "tudo estatico"): agora pulsa só em CSS, sem fade/escala no texto, sem bolinha nem fade na abertura',()=>{
  const b=read('src/desktop/HomeBrief.tsx'),h=read('src/components/HomeHero.tsx'),m=read('src/screens/Home.tsx'),i=read('public/index.html'),l=read('src/lib/launch-handoff.ts');
  const nb=b.slice(b.indexOf('function NowBeacon('),b.indexOf('\n}\n',b.indexOf('function NowBeacon(')));
  // 14/11 (Pedro): o ponto do agora volta a pulsar, mas só a auréola e só em CSS (sem JavaScript redesenhando a página)
  assert.ok(!nb.includes('Animated.loop')&&b.split("animationIterationCount: 'infinite'").length===2&&b.includes('const NOW_PULSE = StyleSheet.create({halo: {animationKeyframes'),'pulso só na auréola do agora, em CSS');
  assert.ok(h.includes('const fadeIn = (_delay: number) => ({} as any);')&&m.includes('const NO_INTRO=true;'),'texto animado voltou');
  assert.ok(!i.includes('class="spin"')&&i.includes('#sofia-veil.out { animation: sofia-veil-open 180ms')&&l.includes("veil.classList.add('out')"),'sem bolinha; so o fade rapido do veu');
});
test('Gravador de fluidez: so no site, uma vez, envio direto (sem invalidar caches) e sem conteudo do usuario',()=>{
  const pr=read('src/lib/fluency-probe.ts'),api=read('src/lib/api.ts'),home=read('src/screens/Home.tsx'),srv=fs.readFileSync(path.join(__dirname,'..','..','src/channels/mobile.js'),'utf8');
  assert.ok(pr.includes("Platform.OS !== 'web'")&&pr.includes('if (started'));
  assert.ok(api.includes("diagFluidez(body: unknown) { return this.fetchRequest<{ok: boolean}>('/diag/fluidez'"),'nao pode passar pelo request() (invalida caches)');
  assert.ok(home.includes('useEffect(()=>{startHomeProbe(api);},[api]);'));
  // textContent so para achar a saudacao; nunca enviado
  assert.equal((pr.match(/textContent/g)||[]).length,1);assert.ok(!/innerText|innerHTML|outerHTML/.test(pr));
  assert.ok(srv.includes("p === '/api/mobile/diag/fluidez' && m === 'POST'")&&srv.includes("rate(session, 'diag-fluidez', 6)"));
});
test('Inicio no site: encaixe e largura da linha do tempo medidos antes da 1a pintura (sem pulo da saudacao nem nomes atrasados)',()=>{
  const home=read('src/screens/Home.tsx'),brief=read('src/desktop/HomeBrief.tsx');
  assert.ok(home.includes('(homeWidth||scroller.clientWidth)<980'),'encaixe nao pode esperar a largura do onLayout');
  assert.ok(home.includes('cc.style.zoom=String(z)'),'zoom entra no proprio quadro da medida');
  assert.ok(brief.includes("useLayoutEffect(() => {if (!WEB || w) return; const v = (lineBox.current as any)?.offsetWidth; if (v > 0) {setW(v); setWS(v);}}, [w]);"));
});
test('Foto do perfil no site: pedida junto com a pagina (early.js) e o avatar ja nasce com ela',()=>{
  const early=read('public/assets/early.js'),cloud=read('src/lib/profile-photo-cloud.web.ts'),av=read('src/components/ProfileAvatar.tsx'),ev=read('src/lib/profile-photo-events.ts');
  assert.ok(early.includes("'/md/capabilities','/profile/photo']")&&early.includes('window.__sofiaPhoto='));
  assert.ok(cloud.includes("__sofiaEarly?.['/profile/photo']"),'usa a resposta antecipada sem esperar o login');
  assert.ok(av.includes('useState(()=>photoPreview(scope)||earlyPhoto()||cachedThumb(scope))')&&ev.includes('function storeThumb'),'nasce com a foto (ou a copia pequena guardada)');
  assert.ok(ev.includes("v.startsWith('data:image/')"),'so aceita imagem');
});
test('Linha do tempo: selecao sai com Esc e clicando fora do quadro',()=>{
  const s=read('src/desktop/HomeBrief.tsx');
  assert.ok(s.includes("document.addEventListener('pointerdown', out, true)")&&s.includes("if (e.key === 'Escape') {e.preventDefault(); setSel([]);}"));
  assert.ok(fs.existsSync(path.join(__dirname,'..','tools','ux-sweep.cjs')),'varredura de coerencia do site');
});
test('Linha do tempo: arrasto pendurado (mouse sem botao) e cancelado sem gravar; Esc fecha o balao mesmo com o mouse em cima',()=>{
  const s=read('src/desktop/HomeBrief.tsx');
  assert.ok(s.includes("if (ev.pointerType === 'mouse' && ev.buttons === 0) {const d = stop();"),'bolinha nao pode seguir o mouse sem botao');
  assert.ok(s.includes("if (e.key === 'Escape') {e.preventDefault(); setPin(''); setHover('');}"));
  const sw=read('tools/ux-sweep.cjs');assert.ok(sw.includes('dado-mudou-sem-pedir'),'varredura confere dados antes/depois');
});
test('Linha do tempo: clique rapido nao prepara arrasto com botao ja solto; Esc so e segurado durante arrasto de verdade',()=>{
  const s=read('src/desktop/HomeBrief.tsx');
  assert.ok(s.includes("if (typeof ne.buttons === 'number' && ne.buttons === 0 && (ne.pointerType === 'mouse'"));
  assert.ok(s.includes("if (!dragRef.current?.live) {stop(); return;}"));
});
test('Checkup 06/11: leituras insistem durante a troca de versao; Proximos eventos reserva o espaco (Paginas nao pulam)',()=>{
  const api=read('src/lib/api.ts'),shell=read('src/desktop/DesktopShell.tsx');
  assert.ok(api.includes("if(attempt<2&&!signal?.aborted&&(a.status===502||a.status===503||a.status===504||a.code==='NETWORK'))"));
  assert.ok(shell.includes("EVENTS_N='sofia.side.events.n'")&&shell.includes('testID="sidebar-events-reserve"'));
  assert.ok(!/setItem\(EVENTS_N,[^)]*title/.test(shell),'so a quantidade, nunca titulos');
});
test('E-mail da Sofia e estrutura do app: nenhuma tela de usuario pede conexao de remetente',()=>{
  const p=read('src/screens/Profile.tsx'),g=read('src/components/GoogleCalendarSettings.tsx'),api=read('src/lib/api.ts');
  assert.ok(!p.includes('MailSender')&&!api.includes('mail-sender'),'nada de remetente na tela do usuario');
  assert.ok(!g.includes('can_send'),'a conta pessoal nao pede envio');
});
test('Inicio: prazo fixo para mostrar os blocos (nao recomeca) e alarme de qual leitura faltou; portao de qualidade existe',()=>{
  const h=read('src/screens/Home.tsx');
  assert.ok(h.includes('if(!deskDeadline.current)deskDeadline.current=Date.now()+5000;')&&h.includes("alert:'inicio-incompleto'"));
  assert.ok(fs.existsSync(path.join(__dirname,'..','tools','release-check.cjs')));
});
test('Aparencia escolhida vai para o servidor (pagina compartilhada com a mesma cara)',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','App.tsx'),'utf8'),api=read('src/lib/api.ts');
  assert.ok(app.includes('api.saveAppearance({appearance:prefs.appearance'));assert.ok(api.includes("this.fetchRequest<{ok: boolean}>('/appearance'"));
});
test('Aba aberta pega a versao nova sozinha (sem recarregar na mao), nunca no meio da digitacao',()=>{
  const e=read('public/assets/early.js'),i=read('public/index.html');
  assert.ok(e.includes("fetch('/inicio',{cache:'no-store'")&&e.includes("a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.isContentEditable")&&e.includes('120000'));
  assert.ok(i.includes('early.js?v=6'));
});
test('Drive desligado pelo Pedro (07/11): fora do menu, da lista de apps e do endereco; codigo guardado para reativar',()=>{
  const f=read('src/lib/features.ts'),w=read('src/screens/Workspace.tsx'),dk=read('src/lib/desktop.ts'),core=read('src/screens/workspace/core.tsx');
  assert.ok(f.includes('export const DRIVE_APP = true')); // 07/11/2026: reativado
  assert.ok(w.includes("DRIVE_APP&&module==='drive'?<Drive api={api}")&&w.includes("if(!DRIVE_APP&&module==='drive')setModule('')"));
  assert.ok(dk.includes("...(DRIVE_APP?[{id:'drive'")&&core.includes("...(DRIVE_APP?[{id:'drive'"));
});
test('Drive: player de video proprio (streaming, barra, velocidade, tela cheia, atalhos) e permissao do Drive do usuario',()=>{
  const p=read('src/components/DriveVideoPlayer.tsx'),d=read('src/screens/Drive.tsx'),v=read('src/components/DrivePreview.tsx');
  for(const k of ['requestFullscreen','requestPictureInPicture','playbackRate','drive-video-seek',"key === 'arrowright'","key === 'm'","key.startsWith('arrow') && !focused",'onExpired'])assert.ok(p.includes(k),k);
  assert.ok(v.includes('<DriveVideoPlayer key={item.id} src={url}')&&d.includes('testID="drive-grant"'));
});
test('Drive: visualizador por link assinado (quadro liberado), setas, clicar fora, Esc',()=>{
  const v=read('src/components/DrivePreview.tsx');
  assert.ok(v.includes("api.sdSignedUrl(item.id, office")&&!/createObjectURL\(b\)\); setUrl/.test(v),'PDF/Office pelo link assinado, nao blob:');
  assert.ok(v.includes("testID={'drive-preview-' + dir}")&&v.includes("e.key === 'ArrowRight' && n.next")&&v.includes('drive-preview-count')&&v.includes('downOnBack.current && back(e)'));
});
test('Drive: Google Drive inteiro - listas, varios selecionados, envio grande por partes, pastas, desfazer, endereco da pasta',()=>{
  const d=read('src/screens/Drive.tsx'),a=read('src/lib/api.ts'),u=read('src/lib/drive-upload.ts');
  for(const k of ["'shared'","'recent'","'starred'","'trash'",'drive-selbar','drive-undo','sdUploadAny','pickFolder',"searchParams.set('pasta'",'popstate','neighbour(','keyFns.current','NameInput'])assert.ok(d.includes(k),k);
  assert.ok(a.includes("'/api/mobile/md/sofiadrive/upload/start'")&&a.includes("'&mime='"),'envio por partes e tipo na query');
  assert.ok(u.includes('webkitGetAsEntry')&&u.includes('readBytes'),'pastas soltas e leitura em pedacos no celular');
});

test('telas que baixam depois mostram o esqueleto enquanto o arquivo chega (nunca so o fundo)', () => {
  const s = require('fs').readFileSync(require('path').join(__dirname, '../src/lib/screen-loader.web.tsx'), 'utf8');
  assert.ok(s.includes("SKELETON_TABS.has(name)?<ScreenSkeleton tab={name} pageId={name==='pages'?String(props?.openPageId||''):undefined} module={name==='apps'?"), 'Suspense com esqueleto (09/11: Apps sabe o app que esta abrindo)');
  // 08/11/2026 (Pedro: "esqueleto de outra tela"): abrindo UMA pagina, o esqueleto da lista de Paginas nao aparece (so o fundo)
  const sk = require('fs').readFileSync(require('path').join(__dirname, '../src/components/ScreenSkeleton.tsx'), 'utf8');
  assert.ok(sk.includes("if(tab==='pages'&&openingOnePage(pageId))return <View testID=\"screen-wait-page\""), 'pagina aberta sem esqueleto da lista');
  const pg = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/Pages.tsx'), 'utf8');
  assert.ok(pg.includes('testID="page-open-wait"') && pg.indexOf('testID="page-open-wait"') < pg.indexOf(' if(!entry)return <View style={{flex:1}} onTouchEnd='), 'Paginas espera a pagina sem mostrar a lista');
  assert.ok(!s.includes('fallback={null}>'), 'sem fallback vazio');
});

test('esqueleto de cada aba na estrutura real da tela (Pedro 07/11/2026)', () => {
  const s = fs.readFileSync(path.join(__dirname, '../src/components/ScreenSkeleton.tsx'), 'utf8');
  for (const f of ['function AgendaSkeleton', 'function ChatSkeleton', 'function PagesSkeleton', 'function AppsSkeleton', 'function ProfileSkeleton']) assert.ok(s.includes(f), f);
  assert.ok(s.includes('<AgendaDesk compact={!desktop}') && s.includes(' loading items={[]}'), 'Agenda usa a propria grade carregando');
  assert.ok(!s.includes('DeskPageSkeleton'), 'sem o esqueleto generico igual para todas');
  const g = fs.readFileSync(path.join(__dirname, '../src/components/AppGrid.tsx'), 'utf8');
  assert.ok(g.includes('cols=w?gridColumns(w):COLS,rows=Math.ceil(Math.max(1,count)/cols)'), 'grade de apps com as colunas reais');
});
