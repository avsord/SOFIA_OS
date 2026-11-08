'use strict';
// 08/11/2026 (Pedro: "as paginas tambem guardam versoes"): cada salvamento vira versao; o historico e podado sem perder o dia a dia.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');

test('cada salvamento da pagina guarda uma versao com o conteudo', t=>{
 const {core}=fixture(t);const w=core.workspace;
 let p=w.save({kind:'user_page',title:'P',data:{blocks_json:JSON.stringify([{id:'a',type:'text',text:'um'}])}});
 p=w.save({...p,data:{...p.data,blocks_json:JSON.stringify([{id:'a',type:'text',text:'dois'}])}},p.id);
 const v=w.versions(p.id);
 assert.equal(v.length,2);
 assert.match(v[1].snapshot.data.blocks_json,/um/);assert.match(v[0].snapshot.data.blocks_json,/dois/);
});

test('poda: ficam as 200 mais recentes + a ultima de cada dia dos ultimos 90 dias', t=>{
 const {core}=fixture(t);const w=core.workspace,db=w.db;
 const p=w.save({kind:'user_page',title:'P',data:{}});
 db.prepare('DELETE FROM entity_versions WHERE entity_id=?').run(p.id);
 const ins=db.prepare('INSERT INTO entity_versions VALUES(?,?,?,?,?)'),now=Date.now();
 // 300 versoes: 3 por dia nos ultimos 100 dias (a mais nova primeiro)
 let r=1000;for(let d=0;d<100;d++)for(let k=0;k<3;k++)ins.run('x'+r,p.id,r--,'{}',new Date(now-d*86400000-k*3600000).toISOString());
 const dropped=w.pruneVersions(p.id);
 const left=db.prepare('SELECT revision,created_at FROM entity_versions WHERE entity_id=? ORDER BY revision DESC').all(p.id);
 assert.ok(dropped>0,'apagou alguma');
 assert.equal(left.slice(0,200).length,200,'as 200 mais recentes ficam');
 const old=left.slice(200),days=new Set(old.map(x=>x.created_at.slice(0,10)));
 assert.equal(days.size,old.length,'das antigas, uma por dia');
 assert.ok(old.every(x=>Date.parse(x.created_at)>=now-90*86400000),'nada com mais de 90 dias fora das 200');
});
