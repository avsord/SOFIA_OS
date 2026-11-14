const test=require('node:test'),assert=require('node:assert'),fs=require('fs');
test('ponto ao lado do Início: chega horário da linha do tempo fora do Início',()=>{
  const lib=fs.readFileSync(__dirname+'/../src/lib/timeline-arrivals.ts','utf8');
  const fn=new Function('return '+lib.match(/export function arrivedSince[\s\S]*?\n}/)[0].replace('export function','function').replace(/: number|: boolean|= times/g,'').replace(/list\s*,/,'list,')+';')();
  const now=1e12;
  assert.equal(fn(now-60000,now,[now-30000]),true);
  assert.equal(fn(now-10000,now,[now-30000]),false);
  assert.equal(fn(now-60000,now,[now+30000]),false);
  const shell=fs.readFileSync(__dirname+'/../src/desktop/DesktopShell.tsx','utf8');
  assert.match(shell,/desktop-home-arrived/); assert.match(shell,/desktop-icon-dot/); assert.match(shell,/markHomeSeen\(\)/);
  assert.match(fs.readFileSync(__dirname+'/../src/desktop/HomeBrief.tsx','utf8'),/setTimelineTimes\(/);
});
