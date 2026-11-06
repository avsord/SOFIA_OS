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
