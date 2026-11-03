'use strict';
// 03/11/2026: varias publicacoes num dia criavam backups de desligamento que empurravam para fora os dos dias anteriores.
const {test}=require('node:test'),assert=require('node:assert/strict');const {backupsToRemove}=require('../src/services/backup.js');
test('fica um backup de cada um dos ultimos dias, alem dos 7 mais novos',()=>{
 const n=(d,h)=>`sofia-2026-11-${d}T${h}-00-00-000Z-abcdef12.sofia-backup`;
 const names=[...['10','11','12','13','14','15','16','17'].map(h=>n('03',h)),n('02','09'),n('01','09'),n('31'.padStart(2,'0'),'09').replace('11-31','10-31')];
 const gone=backupsToRemove(names,7);
 assert.ok(!gone.includes(n('02','09'))&&!gone.includes(n('01','09')),'os de 02 e 01/11 ficam');
 assert.ok(gone.includes(n('03','10')),'o mais antigo do dia cheio sai');
 assert.equal(names.length-gone.length,7+3);
});
