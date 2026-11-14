'use strict';
// 14/11/2026 (Pedro, desenho aprovado): seletor de data/hora no padrão Notion, com início e fim que se desliga.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');
const {parseDateText,parseTimeText,TIME_SLOTS}=require('../src/lib/date-text.ts');

test('data e hora digitadas no campo',()=>{
 const base=new Date(2026,10,14,9,0);
 const t=parseTimeText('1530',base);assert.equal(t.getHours()+':'+t.getMinutes(),'15:30');
 assert.equal(parseTimeText('9',base).getHours(),9);assert.equal(parseTimeText('15h',base).getHours(),15);assert.equal(parseTimeText('25:00',base),null);
 const d=parseDateText('20/11',base);assert.equal(d.getDate()+'/'+(d.getMonth()+1)+' '+d.getHours(),'20/11 9');
 assert.equal(parseDateText('31/02/2026',base),null);assert.equal(TIME_SLOTS.length,96);
});

test('seletor sem Confirmar, com Horário final que desliga, e usado na linha do tempo e no compromisso',()=>{
 const s=read('src/components/DateTimeField.tsx');
 assert.ok(!s.includes("'Confirmar '")&&s.includes("sw(!!endD,'Horário final'")&&s.includes("onEndChange?.('')")&&s.includes('Ir para hoje'));
 assert.ok(read('src/desktop/HomeBrief.tsx').includes('end={end} onEndChange={setEnd}')&&read('src/screens/Home.tsx').includes('...(ch.end!==undefined?{end_at:ch.end}:{})'));
 assert.ok(read('src/components/HomeCommitmentEditor.tsx').includes("{end,onEndChange:setEnd}"));
});
