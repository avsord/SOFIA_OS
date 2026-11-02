const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('0.3.310: Controle de gastos = teto do mes x despesas fora as contas; engrenagem muda o teto; Inicio usa o mesmo',()=>{
  const sc=read('src/screens/finance/SpendCap.tsx');assert.ok(sc.includes('testID="fin-cap-gear"')&&sc.includes('spend_caps_json')&&sc.includes('looseExpenses(d.txs, month, accountId)'));
  const f=read('src/lib/finance.ts');assert.ok(f.includes('export function spendCapFor')&&f.includes('export function looseExpenses')&&f.includes('spendCaps: parseMonthStarts(e.data?.spend_caps_json)'));
  assert.ok(read('src/lib/finance-left.ts').includes('cap: spendCapFor('));
  assert.ok(read('../src/core/catalog.js').includes('"key": "spend_caps_json"'));
});
