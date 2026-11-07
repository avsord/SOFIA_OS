'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('Listas, Biblioteca e Estudos carregam no mesmo estilo das telas novas (anel + linhas)',()=>{
 const s=read('src/screens/Workspace.tsx');assert.ok(!s.includes('Carregando registros…</Text>'));assert.ok(s.includes('testID="records-loading-placeholder"')&&s.includes('Array.from({length:listCols}'),'07/11/2026: cartoes de registro com brilho, nas mesmas colunas');assert.ok(s.includes('value={kind.startsWith("@records:")?allRecordKinds(kinds):kind}'),'sem o texto interno @records');const l=read('src/components/Loading.tsx');assert.ok(l.includes('export function LoadingCaption')&&l.includes("if (Platform.OS === 'web') return <View accessibilityLabel={label} />;"),'0.3.272: no celular anel + texto; no site so o esqueleto');
});
test('mensagem de erro da conta de e-mail usa a cor do tema (certa em claro e escuro), não um vermelho fixo',()=>{
 assert.ok(!read('src/screens/Mail.tsx').includes("color: '#ff6b7a', fontSize: 12"));assert.ok(read('src/screens/Mail.tsx').includes('color: c.danger, fontSize: 12'));
});
test('Listas, Biblioteca e Estudos usam o mesmo cabeçalho das telas novas (voltar à esquerda, legenda discreta, título); a tela principal de Apps continua com o título grande',()=>{
 const ui=read('src/components/UI.tsx');assert.ok(ui.includes('export function ModuleHeader('));
 assert.ok(ui.includes('{desktop?null:<IconButton name="back" label="Voltar aos apps" onPress={onBack}/>}<View style={{flex:1,paddingHorizontal:desktop?0:4}}>'),'voltar fica à esquerda, antes do título (0.3.273: no computador a lateral e o caminho no topo fazem o papel do voltar)');
 const w=read('src/screens/Workspace.tsx');
 assert.ok(w.includes("{module?<ModuleHeader title={selected?.title||'Seus espaços'} caption={selected?.caption"));
 assert.ok(w.includes(":<ScreenTitle title={selected?.title||'Apps'} eyebrow={module==='all'?"),'tela principal de Apps: titulo Apps (desenho 03/11)');
});
