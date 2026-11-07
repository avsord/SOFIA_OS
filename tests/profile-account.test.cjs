'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Store}=require('../src/memory/store');

test('v133: perfil padrão do proprietário existe e pode ser editado',()=>{
  const store=new Store(':memory:');
  try{
    assert.equal(store.settings().profileName,'Pedro Silva');
    assert.equal(store.settings().profileEmail,'','07/11/2026: sem e-mail de usuario padrao (o da Sofia e corporativo)');
    const saved=store.updateSettings({profileName:'Pedro Silva',profileEmail:'pedro@example.com'});
    assert.equal(saved.profileName,'Pedro Silva');
    assert.equal(saved.profileEmail,'pedro@example.com');
  }finally{store.close();}
});

test('v133: perfil rejeita email inválido',()=>{
  const store=new Store(':memory:');
  try{assert.throws(()=>store.updateSettings({profileEmail:'email-invalido'}),/e-mail válido/i);}finally{store.close();}
});
