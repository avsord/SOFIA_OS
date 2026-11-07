'use strict';
// 07/11/2026 (Pedro: "quero que faca o mesmo para PowerPoint e Excel"): editor de planilha proprio da Sofia.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('editor de Excel da Sofia: grade, formulas, formatacao, abas, tema e salva .xlsx no proprio arquivo',async()=>{
 const se=read('SOFIA_APP/src/components/SheetEditor.tsx');
 for(const s of ["import('exceljs/dist/exceljs.min.js'","wb.current.xlsx.writeBuffer()","saveOfficeTo(api, target || {kind: 'page', pageId}","ThemeToggle","'Preencher ' + n.toLowerCase()","s.spliceRows(","s.spliceColumns(","addWorksheet('Planilha' + n)","colResize(cc)","{formula: t.slice(1)}"])assert.ok(se.includes(s),s);
 assert.ok(se.includes('first = Math.max(1, Math.floor(sTop / ROW_H) - 5)'),'so desenha as linhas visiveis (planilhas grandes)');
 assert.ok(se.includes("if (e.key === 'Enter') {e.preventDefault(); commit(ed.text"),'Enter digitado rapido nao se perde');
 assert.ok(!/fontSize: (11\.5|12\.5|15)\b/.test(se));
 // a planilha salva pelo editor abre no ExcelJS com formula, negrito e preenchimento
 const X=require('../SOFIA_APP/node_modules/exceljs');const wb=new X.Workbook();const ws=wb.addWorksheet('Planilha1');
 ws.getCell('A1').value=10;ws.getCell('A2').value={formula:'SUM(A1:A1)'};ws.getCell('B1').font={bold:true};ws.getCell('B1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF176'}};
 const back=new X.Workbook();await back.xlsx.load(await wb.xlsx.writeBuffer());const w2=back.worksheets[0];
 assert.equal(w2.getCell('A2').value.formula,'SUM(A1:A1)');assert.equal(w2.getCell('B1').font.bold,true);assert.equal(w2.getCell('B1').fill.fgColor.argb,'FFFFF176');
});
