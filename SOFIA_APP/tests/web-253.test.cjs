'use strict';
// 0.3.253: fundacao do site no computador - escala de computador, rolagem na largura toda, Agenda lado a lado.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
function scaleModule(){const code=ts.transpileModule(read('src/web/desktop-scale.ts'),{compilerOptions:{module:1,target:9}}).outputText;const ex={};vm.runInNewContext(code,{exports:ex});return ex;}
test('escala de computador: corpo, titulos, controles, espacos e cantos',()=>{
  const s=scaleModule();
  assert.equal(s.scaleFont(16),14.5);assert.equal(s.scaleFont(29),23);assert.equal(s.scaleFont(11),11);
  assert.equal(s.scaleSize(50),41);assert.equal(s.scaleSize(148),148,'medidas grandes (grades) ficam');
  assert.equal(s.scaleSpace(20),14);assert.equal(s.scaleRadius(22),12);assert.equal(s.scaleRadius(99),99,'pilulas ficam');
  const st=s.scaleStyle({fontSize:16,padding:20,borderRadius:22,color:'red',opacity:0.5,marginTop:-44});
  assert.equal(JSON.stringify(st),JSON.stringify({fontSize:14.5,padding:14,borderRadius:12,color:'red',opacity:0.5,marginTop:-32}));
});
test('so no site: o metro troca os componentes das telas pela camada; celular e node_modules ficam de fora',()=>{
  const m=read('metro.config.js');
  assert.ok(m.includes("if(platform==='web'&&moduleName==='react-native'&&usesDesktopLayer(context.originModulePath))"));
  assert.ok(m.includes("const m=platform==='web'?RNW_EXPORT.exec(moduleName):null;"));
  assert.ok(m.includes("if(!origin||origin.includes(path.sep+'node_modules'+path.sep))return false;"));
  const w=read('src/web/rn-desktop.tsx');assert.ok(w.includes('if(!desktop)return <Base {...props} ref={ref}/>;'),'tela estreita: componentes originais');
  for(const n of ['View','Text','Pressable','ScrollView','FlatList','Animated'])assert.ok(fs.existsSync(path.join(root,'src/web/rnd',n+'.ts')),n);
});
test('rolagem na largura toda, conteudo centralizado; Agenda lado a lado; cabecalhos alinhados',()=>{
  assert.ok(read('src/desktop/DesktopPages.tsx').includes('<ContentWidth.Provider value={max}>'));
  // 0.3.276: largura maxima igual; nas telas de app o conteudo encosta a esquerda (Inicio e Conversa seguem centralizados)
  assert.ok(read('src/web/rn-desktop.tsx').includes("{contentContainerStyle:[p.contentContainerStyle,{width:'100%',maxWidth:max,alignSelf:'center'}]}"));
  assert.ok(read('src/screens/Agenda.tsx').includes('testID="agenda-split"'));
  assert.ok(read('src/screens/Finance.tsx').includes('<View style={pad(0)}>'));
  assert.ok(read('src/screens/Chat.tsx').includes('paddingLeft:columnPadding(column,12)'));
});
