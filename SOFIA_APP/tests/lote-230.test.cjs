// 0.3.230: padrao unico em Paginas, como no Notion: opcoes no ⋯ do topo; segurar so serve para arrastar.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('pagina: + e lixeira viram um ⋯; desfazer/refazer continuam a vista',()=>{
  const s=read('src/screens/Pages.tsx');
  // 0.3.267: no celular o ⋯ abre o painel de baixo; no computador, o menu pequeno junto do botão (mesmas opções)
  assert.ok(s.includes('<IconButton name="more" label="Opções da página" size={34} onPress={()=>{if(!desktop){setPageMenu(true);return;}'));
  assert.ok(s.includes("openContextMenu(vw-236,92,[{label:'Nova subpágina ou template'"));
  assert.ok(!s.includes('<IconButton name="trash" label="Excluir página" size={34} onPress={removePage}/>'),'lixeira saiu do topo');
  assert.ok(s.includes('<IconButton name="undo" label="Desfazer"')&&s.includes('<IconButton name="redo" label="Refazer"'));
  for(const t of ['Nova subpágina ou template','Ícone','Remover bloco selecionado','Excluir página'])assert.ok(s.includes(t),t+' no ⋯');
});
test('blocos da pagina: segurar nao pede mais para excluir (texto volta a selecionar texto); toque seleciona',()=>{
  const s=read('src/screens/Pages.tsx');
  assert.ok(!s.includes('onLongPress={()=>confirmRemoveBlock(b)}'),'nenhum bloco exclui ao segurar');
  assert.equal((s.match(/onPress=\{\(\)=>\{Keyboard\.dismiss\(\);setFocus\(b\.id\);\}\}/g)||[]).length,3,'divisor, imagem e anexos selecionam com um toque');
  assert.equal((s.match(/onLongPress/g)||[]).length,0,'Paginas nao usa segurar para menu');
});
test('bloco de notas: remover fica no ⋯ do topo do bloco; segurar so arrasta notas/pastas',()=>{
  const n=read('src/components/NotebookBlock.tsx');
  assert.ok(!n.includes('Segure aqui para remover'),'sem "segure aqui"');
  assert.ok(n.includes('accessibilityLabel="Opções do bloco de notas"')&&n.includes('Remover bloco de notas'));
  const longs=n.match(/onLongPress=\{[^}]*\}/g)||[];
  assert.ok(longs.every(l=>l.includes('startDrag')),'todo segurar e arrastar');
});
