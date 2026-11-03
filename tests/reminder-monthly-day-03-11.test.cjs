'use strict';
// 03/11/2026: lembrete mensal do dia 31 passava por fevereiro e ficava no dia 28 para sempre.
const {test}=require('node:test'),assert=require('node:assert/strict');const {nextRepeat}=require('../src/services/scheduler.js');
test('lembrete mensal volta ao dia original depois de um mes curto',()=>{
 const tags=['sofia-repeat-v1:monthly:America/Sao_Paulo'];
 const feb=nextRepeat({tags,data:{remind_at:'2026-01-31T12:00:00.000Z',repeat_day:31}},'2026-02-01T00:00:00.000Z');
 assert.equal(feb.slice(0,10),'2026-02-28');
 const mar=nextRepeat({tags,data:{remind_at:feb,repeat_day:31}},'2026-03-01T00:00:00.000Z');
 assert.equal(mar.slice(0,10),'2026-03-31');
 const old=nextRepeat({tags,data:{remind_at:'2026-01-15T12:00:00.000Z'}},'2026-01-16T00:00:00.000Z');
 assert.equal(old.slice(0,10),'2026-02-15','sem repeat_day usa o dia do horario, como antes');
});
