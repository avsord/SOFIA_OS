'use strict';
// 03/11/2026: os scripts de restauracao (RESTAURAR_MEMORIA, tools/restore-backup.cjs) abrem um Store simples. Antes:
// backup de antes de 02/11 (sem task_details.planned_due_at) ou com anexo (colunas drive_id/thumb criadas pelos servicos)
// falhava com "Estrutura de backup inválida", e doses da Rotina, widgets, apagados do Google e a foto sumiam calados.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const {fixture}=require('./helpers.cjs');const {createRuntime}=require('../src/core/runtime');const {Store}=require('../src/memory/store.js');
test('restauracao num Store simples traz tudo de volta, inclusive de backup antigo e com anexo',async t=>{
 const a=fixture(t);a.config.loginPassword='integration-test-password-only';a.config.loginEmail='owner@example.com';
 const ra=createRuntime(a.config,{store:a.store,provider:a.provider,secureDir:path.join(a.dir,'secure')});
 const task=a.store.saveTask({title:'Ligar pro banco',state:'scheduled',due_at:'2026-10-29T12:00:00.000Z'});
 const file=ra.core.workspace.save({kind:'file',title:'cupom.png',area:'Pessoal',state:'saved',data:{}});
 const db=a.store.db,blob=Buffer.from('conteudo do cupom'),sha=crypto.createHash('sha256').update(blob).digest('hex');
 const cols=db.prepare('PRAGMA table_info(attachments)').all().map(c=>c.name);
 assert.ok(cols.includes('drive_id'),'o servidor completo cria attachments.drive_id');
 const row={id:'att1',entity_id:file.id,name:'cupom.png',mime:'image/png',bytes:blob.length,sha256:sha,blob,created_at:new Date().toISOString(),drive_id:'drive-123'};
 const use=cols.filter(c=>c in row);db.prepare(`INSERT INTO attachments (${use.join(',')}) VALUES (${use.map(()=>'?').join(',')})`).run(...use.map(c=>row[c]));
 db.prepare("INSERT INTO mobile_capsule_doses (owner,capsule_id,day,time,taken_at,title,dose_text) VALUES (?,?,?,?,?,?,?)").run('owner','cap1','2026-10-27','08:00','2026-10-27T11:00:00Z','Vitamina D','1 cápsula');
 ra.google.kvSet('dashboard_widgets',['agenda','goal']);
 db.prepare('INSERT INTO google_tombstones VALUES(?,?,?)').run('primary','evt-apagado',new Date().toISOString());
 const snapshot=JSON.parse(JSON.stringify(a.store.export()));
 for(const r of snapshot.tables.task_details)delete r.planned_due_at; // como um backup de antes de 02/11
 const plain=new Store(':memory:');t.after(()=>{try{plain.close();}catch{}});
 plain.importSnapshot(snapshot);
 assert.equal(plain.db.prepare('SELECT title FROM tasks WHERE id=?').get(task.id).title,'Ligar pro banco');
 assert.equal(plain.db.prepare('SELECT planned_due_at FROM task_details WHERE task_id=?').get(task.id).planned_due_at,'');
 const att=plain.db.prepare('SELECT * FROM attachments WHERE id=?').get('att1');
 assert.equal(att.drive_id,'drive-123');assert.equal(Buffer.from(att.blob).toString(),'conteudo do cupom');
 assert.equal(plain.db.prepare('SELECT COUNT(*) n FROM mobile_capsule_doses').get().n,1);
 assert.equal(plain.db.prepare('SELECT COUNT(*) n FROM google_tombstones').get().n,1);
 assert.ok(plain.db.prepare("SELECT value FROM md_kv WHERE key='dashboard_widgets'").get());
});
test('backup com coluna de nome estranho continua recusado',()=>{
 const s=new Store(':memory:');s.saveTask({title:'x'});const snap=JSON.parse(JSON.stringify(s.export()));
 snap.tables.task_details[0]['x; DROP TABLE tasks']=1;
 assert.throws(()=>s.importSnapshot(snap),/Estrutura de backup inválida/);s.close();
});
