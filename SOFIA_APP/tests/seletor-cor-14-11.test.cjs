const test=require('node:test'),assert=require('node:assert'),fs=require('fs');
const src=fs.readFileSync(__dirname+'/../src/desktop/ColorPicker.tsx','utf8');
test('seletor de cor: cores prontas, codigo, Esc cancela, Padrao, nao sai da tela',()=>{
 for(const s of ['SWATCHES','color-hex','Escape','finish(null)','color-reset','y-H-36','onCommit(cur.current)'])assert.ok(src.includes(s),s);
 assert.ok(!src.includes('onPointerUp:()=>onCommit'),'nao grava a cada soltar');
});
test('subatalho e atalho passam a cor padrao',()=>{
 const sh=fs.readFileSync(__dirname+'/../src/desktop/DesktopShell.tsx','utf8');
 assert.equal((sh.match(/defaultColor=\{DEFAULT_SHORTCUT_COLOR\}/g)||[]).length,2);
});
