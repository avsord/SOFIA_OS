const test=require('node:test'),assert=require('node:assert'),fs=require('fs');
test('Início: ponto menor e item atual embaixo, em L, com texto que passa na horizontal',()=>{
  const shell=fs.readFileSync(__dirname+'/../src/desktop/DesktopShell.tsx','utf8');
  assert.match(shell,/desktop-home-arrived[\s\S]{0,700}fontSize:7\}\}>●/);
  assert.match(shell,/t==='home'&&arrived&&!collapsed\?<HomeNow/);
  assert.match(shell,/testID="desktop-home-now"/); assert.match(shell,/borderLeftWidth:1\.5,borderBottomWidth:1\.5/);
  assert.match(shell,/translateX:'-50%'/); assert.match(shell,/run=box>0&&w>box/);
  const home=fs.readFileSync(__dirname+'/../src/desktop/HomeBrief.tsx','utf8');
  assert.match(home,/info: r\.kind === "reminder" \? "Lembrete" : r\.isTask \? "Tarefa" : "Evento"/); assert.match(home,/info: m\.sub/);
});
