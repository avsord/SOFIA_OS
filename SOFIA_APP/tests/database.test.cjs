'use strict';
// 14/11/2026: base de dados no padrão Notion (Tabela e Kanban avançado) — regras puras de src/lib/database.ts
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
const db=load('src/lib/database.ts');
const {PAGE_TEMPLATES}=load('src/lib/page-templates.ts');
const plain=v=>JSON.parse(JSON.stringify(v));
const base=()=>db.normalizeDb({properties:[
 {key:'name',label:'Nome',type:'text'},{key:'status',label:'Status',type:'status',options:['Ideia','Feito'],option_colors:{Ideia:'gray',Feito:'green'}},
 {key:'plat',label:'Plataforma',type:'multi_select',options:['Insta','YT']},{key:'n',label:'Número',type:'number'},{key:'dt',label:'Data',type:'date'},{key:'ok',label:'Caixa',type:'checkbox'}],
 views:[{id:'b',label:'Quadro',type:'board',group_by:'status'}],active_view:'b',rows:[
 {id:'a',values:{name:'Alfa',status:'Ideia',plat:['Insta','YT'],n:5,dt:'2099-01-02',ok:true}},
 {id:'b',values:{name:'beta',status:'Feito',plat:[],n:'',dt:'2000-01-01',ok:false}},
 {id:'c',values:{name:'Gama',status:'',plat:'YT',n:2,dt:'',ok:false}}]});
test('old saved format still loads (filter_key/sort_by become filters/sorts)',()=>{
 const d=db.normalizeDb({properties:[{key:'name',type:'text'},{key:'s',type:'select',options:['A']}],views:[{id:'v',type:'table',filter_key:'s',filter_value:'A',sort_by:'name',sort_dir:'asc'}],rows:[{values:{name:'x'}}]});
 assert.deepEqual(plain(d.views[0].filters),[{key:'s',op:'is',value:['A']}]);assert.deepEqual(plain(d.views[0].sorts),[{key:'name',dir:'asc'}]);assert.ok(d.rows[0].id);
});
test('filters: choice, multi, checkbox, date future/past, text contains, empty',()=>{
 const d=base(),v=d.views[0],ids=f=>db.viewRows(d,{...v,filters:[f]}).map(r=>r.id).join(',');
 assert.equal(ids({key:'status',op:'is',value:['Ideia']}),'a');
 assert.equal(ids({key:'plat',op:'is',value:['YT']}),'a,c');
 assert.equal(ids({key:'ok',op:'is',value:true}),'a');
 assert.equal(ids({key:'dt',op:'future'}),'a');assert.equal(ids({key:'dt',op:'past'}),'b');
 assert.equal(ids({key:'name',op:'contains',value:'ET'}),'b');
 assert.equal(ids({key:'status',op:'empty'}),'c');
 assert.equal(db.viewRows(d,v,'gama').map(r=>r.id).join(','),'c');
});
test('sorts: number keeps empty last, text ignores case, desc reverses',()=>{
 const d=base(),v=d.views[0];
 assert.equal(db.viewRows(d,{...v,sorts:[{key:'n',dir:'asc'}]}).map(r=>r.id).join(','),'c,a,b');
 assert.equal(db.viewRows(d,{...v,sorts:[{key:'name',dir:'asc'}]}).map(r=>r.id).join(','),'a,b,c');
 assert.equal(db.viewRows(d,{...v,sorts:[{key:'name',dir:'desc'}]}).map(r=>r.id).join(','),'c,b,a');
});
test('board: one column per option plus "Sem <campo>"; multi-select card appears in each column',()=>{
 const d=base();
 assert.equal(db.boardGroups(d,d.views[0],d.rows).map(g=>g.label).join('|'),'Ideia|Feito|Sem Status');
 const v={...d.views[0],group_by:'plat'},p=db.groupProp(d,v);
 assert.equal(db.rowsInGroup(d.rows,p,'YT').map(r=>r.id).join(','),'a,c');
 assert.equal(db.boardGroups(d,{...v,hidden_groups:['Insta']},d.rows).map(g=>g.value).join('|'),'YT|');
});
test('dragging between columns changes only that value; multi-select swaps just the source tag',()=>{
 const d=base(),st=d.properties[1],pl=d.properties[2];
 const a=db.moveToGroup(d,'c',st,'','Feito','b');assert.equal(a.rows.find(r=>r.id==='c').values.status,'Feito');assert.equal(a.rows.map(r=>r.id).join(','),'a,c,b');
 const b=db.moveToGroup(d,'a',pl,'Insta','',undefined);assert.deepEqual(plain(b.rows.find(r=>r.id==='a').values.plat),['YT']);
 assert.equal(d.rows.find(r=>r.id==='c').values.status,'','original untouched');
});
test('changing a property type converts values without losing text',()=>{
 const d=base();
 const t=db.changePropType(d,'plat','text');assert.equal(t.rows[0].values.plat,'Insta, YT');
 const m=db.changePropType(t,'plat','multi_select');assert.deepEqual(plain(m.rows[0].values.plat),['Insta','YT']);
 const n=db.changePropType(db.normalizeDb({properties:[{key:'x',type:'text'}],rows:[{id:'1',values:{x:'3,5'}},{id:'2',values:{x:''}}]}),'x','number');assert.equal(n.rows[0].values.x,3.5);assert.equal(n.rows[1].values.x,'');
});
test('helpers: short url, sum, new row defaults, calendar grid',()=>{
 assert.equal(db.shortUrl('https://www.youtube.com/watch?v=abcdefghijklmnop'),'youtube.com/watch?v=abcdefg…');
 assert.equal(db.hrefOf('notion.so'),'https://notion.so');
 const d=base();assert.equal(db.sumOf(d.rows,'n'),7);
 const r=db.newRow(d,{status:'Ideia'},new Date('2026-11-14T10:00:00Z'));assert.deepEqual(plain(r.values.plat),[]);assert.equal(r.values.ok,false);assert.equal(r.values.status,'Ideia');assert.ok(r.created_at.startsWith('2026-11-14'));
 const g=db.monthGrid(2026,10);assert.equal(g.length,42);assert.equal(g[0].getDay(),0);assert.equal(db.longDate('2025-03-05'),'5 de março de 2025');
});
test('Kanban avançado template: status flow, platform/priority boards, calendar and upcoming',()=>{
 const t=PAGE_TEMPLATES.find(x=>x.id==='content_kanban'),d=db.normalizeDb(t.blocks[0].data);
 assert.equal(d.properties.find(p=>p.key==='status').options.join('|'),'Ideia|Projetando|Elaboração|Aprovado|Programado|Publicado');
 assert.equal(d.views.map(v=>v.label).join('|'),'Fluxo de status|Plataforma|Prioridade|Calendário|Próximos|Tabela');
 assert.equal(d.views.find(v=>v.id==='platform').group_by,'platforms');assert.equal(d.properties.find(p=>p.key==='platforms').type,'multi_select');
});
test('site renders collections with the Notion-style view and nothing asks the obvious',()=>{
 const pages=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8'),view=fs.readFileSync(path.join(__dirname,'../src/components/DatabaseView.web.tsx'),'utf8');
 assert.match(pages,/<DatabaseView key=\{b\.id\}/);assert.match(pages,/mode!=='notebooks'/);
 assert.doesNotMatch(view,/appAlert\(/,'excluir faz na hora e oferece Desfazer');assert.match(view,/Desfazer/);
 assert.match(view,/sdb-peek/);assert.match(view,/Escape/);assert.match(view,/createPortal/);
});
