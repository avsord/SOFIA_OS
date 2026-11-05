'use strict';
// 05/11/2026 (Pedro): "essas areas tem que ser criadas pelo proprio usuario" - a lista nao junta mais nomes escritos
// em registros (a IA inventava); so as areas criadas pela pessoa, e a IA nao cria area nova.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
test('lista de áreas começa só com Pessoal e guarda as criadas pela pessoa, sem repetir',t=>{
 const f=fixture(t);assert.deepEqual(f.store.userAreas(),['Pessoal']);
 f.store.updateSettings({userAreas:['Pessoal','Trabalho','trabalho','  Estudos  ']});
 assert.deepEqual(f.store.userAreas(),['Pessoal','Trabalho','Estudos']);
 assert.throws(()=>f.store.updateSettings({userAreas:'Boxe'}),/inválida/);
});
test('catálogo devolve as áreas da pessoa (não as escritas nos registros) e a IA não cria área nova',()=>{
 const api=fs.readFileSync(path.join(__dirname,'..','src/core/api45.js'),'utf8');
 assert.ok(api.includes("if(m==='GET'&&p==='/api/catalog')return send({catalog:CATALOG,areas:store.userAreas()});"));
 assert.ok(!api.includes('SELECT area FROM tasks WHERE trim(area)'),'não monta a lista a partir dos registros');
 assert.ok(api.includes("if(m==='POST'&&p==='/api/areas')"));
 assert.ok(fs.readFileSync(path.join(__dirname,'..','src/channels/mobile.js'),'utf8').includes('catalog|areas|panorama'));
 const core=fs.readFileSync(path.join(__dirname,'..','src/core/sofia-core.js'),'utf8');
 assert.ok(core.includes("if(a.area){const known=this.store.userAreas().find("));
});
