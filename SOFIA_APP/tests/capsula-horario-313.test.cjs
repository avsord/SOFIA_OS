const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');const ts=require('typescript');
function load(rel){const src=fs.readFileSync(path.join(__dirname,'..',rel),'utf8');const out=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const m={exports:{}};new Function('module','exports','require',out)(m,m.exports,require);return m.exports;}
test('0.3.313: mudar o horario de uma capsula nao desfaz o que ja foi tomado (nem enche de atrasadas)',()=>{
  const cm=load('src/lib/capsule-model.ts');
  const plan={id:'p1',title:'Vitamina D',state:'active',tags:[],data:{times_json:JSON.stringify(['09:00']),repeat_type:'daily',start_date:'2026-10-20',notifications:true}};
  const days=['2026-10-30','2026-10-31','2026-11-01'];
  // tomou todos os dias as 08:00 (horario antigo)
  const history=days.map((d,i)=>({id:'h'+i,data:{capsule_id:'p1',day:d,time:'08:00'}}));
  const missed=cm.capsuleMissed([plan],history,'2026-10-29','2026-11-02');
  assert.equal(missed.filter(x=>days.includes(x.day)).length,0,'dias ja tomados no horario antigo nao viram atrasados');
  const today=cm.capsuleDoses([plan],[{id:'h9',data:{capsule_id:'p1',day:'2026-11-02',time:'08:00'}}],'2026-11-02',new Date('2026-11-02T12:00:00'));
  assert.ok(today[0].taken,'a dose de hoje tomada no horario antigo continua tomada');
});
