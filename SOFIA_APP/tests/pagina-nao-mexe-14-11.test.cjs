const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),p=f=>fs.readFileSync(__dirname+'/../src/'+f,'utf8');
test('campos de pagina, nota e tabela nao encolhem a 0 para medir (a pagina nao pula ao digitar)',()=>{
 const fit=p('lib/fit-textarea.ts');assert.ok(fit.includes("visibility:'hidden'")&&fit.includes('measureTextarea'));
 for(const f of ['screens/Pages.tsx','components/LeafEditor.tsx','components/DatabaseView.web.tsx']){const s=p(f);assert.ok(s.includes('fitTextarea('),f);assert.ok(!/\.style\.height='0px';\w+\.style\.height=\w+\.scrollHeight/.test(s),f+' ainda encolhe a 0');}
});
