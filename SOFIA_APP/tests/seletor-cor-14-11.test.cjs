const test=require('node:test'),assert=require('node:assert'),fs=require('fs');
const src=fs.readFileSync(__dirname+'/../src/desktop/ColorPicker.tsx','utf8');
test('seletor de cor: so as barras de cor e luz, no body, Esc cancela',()=>{
 for(const s of ['color-hue','color-shade','createPortal','Escape','finish(false)'])assert.ok(src.includes(s),s);
 for(const s of ['SWATCHES','color-hex','color-reset'])assert.ok(!src.includes(s),s);
});
test('seletor abre junto do clique na bolinha',()=>{
 const sh=fs.readFileSync(__dirname+'/../src/desktop/DesktopShell.tsx','utf8');
 assert.equal((sh.match(/clientX\?\?\(b\?b\.left:0\)\)\+14/g)||[]).length,3);
});
