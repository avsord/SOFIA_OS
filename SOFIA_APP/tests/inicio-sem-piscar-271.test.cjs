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
test('Inicio: aureola do "agora" pulsa por CSS, sem Animated.loop no JavaScript',()=>{
  const s=read('src/desktop/HomeBrief.tsx');
  const nb=s.slice(s.indexOf('function NowBeacon('),s.indexOf('\n}\n',s.indexOf('function NowBeacon(')));
  assert.ok(!nb.includes('Animated.loop')&&!nb.includes('Animated.View'),'pulso voltou para o JavaScript');
  assert.ok(nb.includes('NOW_PULSE.halo')&&s.includes("animationIterationCount: 'infinite'"));
  assert.ok(nb.includes('WEB && !reduced'),'respeita movimento reduzido e fica parado no celular');
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
  assert.ok(av.includes('useState(()=>photoPreview(scope)||earlyPhoto())'));
  assert.ok(ev.includes("v.startsWith('data:image/')"),'so aceita imagem');
});
