const test=require('node:test'),assert=require('node:assert'),fs=require('fs');
test('ponto do Início: fica até feito; evento até 5 min do fim; passa ao próximo',()=>{
  const lib=fs.readFileSync(__dirname+'/../src/lib/timeline-arrivals.ts','utf8');
  const src=lib.match(/export function currentArrival[\s\S]*?\n}/)[0].replace('export function','function').replace(/: Arrival \| null/g,'').replace('now = Date.now(), list = items','now, list');
  const cur=new Function(src+';return currentArrival;')();
  const H=3600000,now=1e12;
  assert.equal(cur(now,[{at:now-H,until:Infinity,title:'a'}]).title,'a');
  assert.equal(cur(now,[{at:now-H,until:0,title:'a'}]),null);
  assert.equal(cur(now,[{at:now-H,until:now-1,title:'ev'}]),null);
  assert.equal(cur(now,[{at:now-2*H,until:Infinity,title:'a'},{at:now-H,until:Infinity,title:'b'}]).title,'b');
  assert.equal(cur(now,[{at:now+H,until:Infinity,title:'futuro'}]),null);
  const shell=fs.readFileSync(__dirname+'/../src/desktop/DesktopShell.tsx','utf8');
  assert.match(shell,/desktop-home-arrived/); assert.match(shell,/desktop-icon-dot/); assert.match(shell,/currentArrival\(\)/);
  assert.match(fs.readFileSync(__dirname+'/../src/desktop/HomeBrief.tsx','utf8'),/\+ M\}/);
});
