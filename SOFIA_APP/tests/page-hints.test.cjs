'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
const {pageBodyIsEmpty,pageBlockHint}=load('src/lib/page-hints.ts');
const blank={id:'first',type:'text',text:''};
test('new empty body shows one writing hint even without focus',()=>{
 assert.equal(pageBodyIsEmpty([blank]),true);assert.equal(pageBlockHint(blank,0,true,false),'Escreva algo…');
 assert.equal(pageBlockHint(blank,1,true,false),'');
});
test('written body is clean and a later empty row has no persistent hint',()=>{
 const written={...blank,text:'My notes'};assert.equal(pageBodyIsEmpty([written,blank]),false);
 assert.equal(pageBlockHint(written,0,false,false),'');assert.equal(pageBlockHint(blank,1,false,false),'');
});
test('rich blocks and HTML count as content; formatting-only empty text does not',()=>{
 for(const type of ['image','file','todo','divider','collection'])assert.equal(pageBodyIsEmpty([{...blank,type}]),false);
 assert.equal(pageBodyIsEmpty([{...blank,html:'<b>Saved text</b>'}]),false);
 assert.equal(pageBodyIsEmpty([{...blank,html:'<p><br>&nbsp;</p>'}]),true);
});
test('a focused empty row still exposes the contextual writing command',()=>{
 assert.equal(pageBlockHint(blank,1,false,true),'Digite / para opções');
});
test('hints are native placeholders with alpha; user content retains its full color',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 assert.ok(source.includes('placeholder={pageTitleHint('));assert.ok(source.includes("const placeholderColor=c.muted+'80'"));
 assert.equal((source.match(/placeholderTextColor=\{placeholderColor\}/g)||[]).length,2);
 assert.ok(source.includes('value={draft.title===\'Sem título\'?\'\':draft.title}'));
 assert.ok(!source.includes('Salvar agora'));
});
test('undo and redo share the right-hand tools group, after the flexible breadcrumb',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 const breadcrumb=source.indexOf("path.map(p=>p.title)"),group=source.indexOf('testID="page-tools-right"');
 assert.ok(breadcrumb<group);const tools=source.slice(group,source.indexOf('</View>',group));
 let prev=-1;for(const name of ['undo','redo','more']){const i=tools.indexOf('name="'+name+'"');assert.ok(i>prev);prev=i;}// 0.3.230: + e lixeira foram para o ⋯
 assert.equal((source.match(/name="undo"/g)||[]).length,1);assert.equal((source.match(/name="redo"/g)||[]).length,1);
});

test('page canvas stays compact and subpages render as inline page rows',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 const tree=fs.readFileSync(path.join(__dirname,'../src/components/PageTreeList.tsx'),'utf8');
 assert.ok(source.includes("hasCover&&desktop?{width:'100%',aspectRatio:6,minHeight:200,maxHeight:460}:{height:hasCover?190:28}")); // 07/11/2026: no computador a capa segue a proporcao da tela; 09/11: pela proporcao em CSS (sem salto ao medir)
 assert.ok(source.includes("marginTop:hasCover?-44:0"));
 assert.ok(source.includes("style={{minHeight:18}}"));
 assert.ok(source.includes('fontSize:56'));
 assert.ok(source.includes("<PageTreeList roots={subpages}"));
 assert.ok(!source.includes("Subpáginas ·"));
 assert.ok(!tree.includes("Solte aqui para página principal"));
 assert.ok(tree.includes("},240)"));
 assert.ok(tree.includes('accessibilityHint="Segure para excluir ou arraste para reorganizar"'));
 assert.ok(tree.includes("projectPageDrop("));
 assert.ok(tree.includes("Abrir subpágina "));
 assert.ok(tree.includes("Abrir página principal "));
});

test('writing hint disappears after the page has a real title and blank body stops reserving vertical space',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 assert.ok(source.includes("const showBodyGuide=emptyBody&&!hasSubpageContent;"));
 assert.ok(source.includes("height:(!b.text&&!b.html&&!pageBlockHint(b,i,bodyGuide,blockFocus===b.id)&&blockFocus!==b.id)?0:undefined"));
 assert.ok(source.includes("marginTop:2"));
 assert.ok(!source.includes('accessibilityLabel="Recolher subpáginas"'));
 assert.ok(!source.includes('accessibilityLabel="Mostrar subpáginas"'));
});

test('draggable rows retain static geometry while a separate ghost follows the finger',()=>{
 const tree=fs.readFileSync(path.join(__dirname,'../src/components/PageTreeList.tsx'),'utf8');
 assert.ok(tree.includes('onResponderTerminationRequest={()=>!held.current}'));
 assert.ok(tree.includes('onResponderTerminate='));assert.ok(tree.includes('latest.current.onCancel()'));
 assert.ok(tree.includes('nodes.current.set(p.id,node)'));assert.ok(tree.includes('transform:pan.getTranslateTransform()'));
 assert.ok(tree.includes('if(cancelled){finish();return;}'),'cancelar ainda nao move nada');assert.ok(tree.includes('dropLineY(drop,rects.current)'));
});

test('body guide remains visible after the title is filled until the body itself has content',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 assert.ok(source.includes("const showBodyGuide=emptyBody&&!hasSubpageContent;"));
 assert.ok(!source.includes("emptyBody&&titleIsBlank"));
 assert.equal(pageBlockHint(blank,0,true,false),'Escreva algo…');
 assert.equal(pageBlockHint({...blank,text:'Texto'},0,false,false),'');
 assert.equal(pageBlockHint(blank,1,false,true),'Digite / para opções');
});

test('subpages count as visible content: hide the initial body guide but keep a tappable writing area',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 assert.ok(source.includes("const hasSubpageContent=!!(selectedId&&(children.get(selectedId)||[]).length);"));
 assert.ok(source.includes("const showBodyGuide=emptyBody&&!hasSubpageContent;"));
 assert.ok(source.includes('accessibilityLabel="Continuar escrevendo"'));
 assert.ok(source.includes("style={{minHeight:18}}"));
 assert.equal(pageBlockHint(blank,0,false,false),'');
 assert.equal(pageBlockHint(blank,0,false,true),'Digite / para opções');
});
