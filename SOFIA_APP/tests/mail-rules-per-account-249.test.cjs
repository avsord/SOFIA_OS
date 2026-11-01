'use strict';
// 0.3.249: cada regra e de UMA conta; a aba Regras mostra so as da conta escolhida; nova regra nasce na conta aberta.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const m=fs.readFileSync(path.join(__dirname,'..','src/screens/Mail.tsx'),'utf8');
test('lista e contador so com as regras da conta (ou grupo) escolhida no topo',()=>{
  assert.ok(m.includes('const scopedRules = rules.filter(r => inSel.has(ruleOwner(r)));'));
  // 0.3.272: enquanto carrega o contador nao mostra 0 (some o numero); carregado, conta so as regras da conta escolhida
  assert.ok(m.includes("label: 'Regras' + (accounts === null ? '' : ' ' + scopedRules.length)")&&m.includes('{scopedRules.map(r => ('));
  assert.ok(!m.includes("'Todas as contas'} · "),'card nao diz mais "Todas as contas"');
});
test('nova regra (e modelo) nasce na conta aberta; o editor nao tem mais "Todas"; salvar sempre grava uma conta',()=>{
  assert.ok(m.includes("setRuleSheet({data: {field: 'from', notify: true, account_id: newRuleAccount}})"));
  assert.ok(m.includes('important: t.important, account_id: newRuleAccount}'));
  assert.ok(!m.includes("{value: '', label: 'Todas'}"),'sem a opcao Todas');
  assert.ok(m.includes("account_id: accountId || accounts[0]?.id || ''"));
});
