'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
const {PAGE_TEMPLATES,STATUS_COLORS,freshTemplate,diaryEntryBlock,diaryDayTitle}=load('src/lib/page-templates.ts');
test('the official page templates are exposed (Kanban simples fica; Tabela substitui o Formulário)',()=>{
 assert.equal(Array.from(PAGE_TEMPLATES,x=>x.id).join('|'),'tasks_personal|content_kanban|playlist_links|notes_hub|diary');
 assert.equal(Array.from(PAGE_TEMPLATES,x=>x.title).join('|'),'Kanban|Kanban avançado|Tabela|Notas|Diário');
});
test('tasks template has editable status columns with colors',()=>{
 const t=PAGE_TEMPLATES[0],collection=t.blocks.find(x=>x.type==='collection');
 const status=collection.data.properties.find(x=>x.key==='status');
 assert.equal(Array.from(status.options).join('|'),'Não iniciada|Prioridade');
 assert.equal(status.option_colors['Não iniciada'],'gray');assert.equal(status.option_colors['Prioridade'],'red');
 assert.equal(collection.data.views[0].type,'board');assert.equal(collection.data.views[0].group_by,'status');
 assert.ok(STATUS_COLORS.some(x=>x.id==='blue'));assert.ok(STATUS_COLORS.some(x=>x.id==='green'));
});
test('notes and playlist templates match the requested structures',()=>{
 const notes=PAGE_TEMPLATES.find(x=>x.id==='notes_hub'),playlist=PAGE_TEMPLATES.find(x=>x.id==='playlist_links');
 assert.ok(notes.blocks.some(x=>x.type==='collection'&&x.data.views?.some(v=>v.type==='pages')));
 assert.equal(playlist.blocks.filter(x=>x.type==='callout').length,0);
 const links=playlist.blocks.find(x=>x.type==='collection');assert.equal(Array.from(links.data.properties,p=>p.type).join('|'),'text|status|multi_select|url|created|text|date|number|checkbox');assert.ok(links.data.views.some(v=>v.type==='table')&&links.data.views.some(v=>v.type==='board'));assert.equal(notes.blocks.length,1);assert.equal(notes.blocks[0].data.mode,'notebooks');assert.equal(links.data.title,'');
});
test('Pages + offers blank/template and renders collection blocks in the app',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 const picker=fs.readFileSync(path.join(__dirname,'../src/components/PageTemplatePicker.tsx'),'utf8');
 const collection=fs.readFileSync(path.join(__dirname,'../src/components/NativeCollectionBlock.tsx'),'utf8');
 assert.ok(src.includes('PageCreateMenu'));assert.ok(!src.includes('template_id:'));assert.ok(src.includes("title:'Sem título'"));assert.ok(src.includes("icon:'',icon_mode:'default'"));assert.ok(src.includes("blocks_json:preset?JSON.stringify(preset.blocks):'[]'"));assert.ok(src.includes("applyTemplate(template:PageTemplate)"));assert.ok(src.includes("<NativeCollectionBlock"));
 assert.ok(picker.includes('＋ Página em branco'));assert.ok(picker.includes('▦ Usar template'));
 assert.ok(collection.includes('Duplicar coluna'));assert.ok(fs.readFileSync(path.join(__dirname,'../src/components/KanbanBoard.tsx'),'utf8').includes('＋ Coluna'));assert.ok(collection.includes('Cor'));
});

test('stationary long press exposes a named delete action without reparenting',()=>{
 const tree=fs.readFileSync(path.join(__dirname,'../src/components/PageTreeList.tsx'),'utf8');
 assert.ok(tree.includes('if(!d.moved){finish();setContext(d.page.id);return;}'),'segurar parado ainda abre a acao de excluir');
 assert.ok(tree.includes('Excluir “{p.title}”'));assert.ok(tree.includes('onDelete(p)'));
 assert.ok(tree.includes('if(cancelled){finish();return;}'));
});

test('page editor has no hidden back swipe or costly previous-page backdrop',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 assert.ok(!src.includes('previousBackdrop'));assert.ok(!src.includes('pageBackResponder'));
 assert.ok(src.includes("BackHandler.addEventListener('hardwareBackPress'"));
});

test('page row drag disables the outer menu pager while active',()=>{
 const pages=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 const tree=fs.readFileSync(path.join(__dirname,'../src/components/PageTreeList.tsx'),'utf8');
 assert.ok(pages.includes('[pageInteraction,setPageInteraction]=useState(false)'));
 assert.ok(pages.includes('onDepthChange?.(!!selectedId||pageInteraction)'));
 assert.ok(pages.includes('pageInteractionRef.current=value;refreshGuard.current.setActive(value)'));
 assert.ok(pages.includes('setPageInteraction(value);onDepthChange?.(!!selectedRef.current||value)'));
 assert.ok(pages.includes('enabled={!pageInteraction&&!selectedId}'));
 assert.ok(pages.includes('onInteractionChange={changePageInteraction}')); 
 assert.ok(tree.includes('},240)'));
});


test('MD8: insertion retains written content and replaces only the untouched guide',()=>{
 const {insertTemplateBlocks}=load('src/lib/page-templates.ts');
 const written=[{id:'user',type:'text',text:'Minha anotação'}],incoming=[{id:'template',type:'collection',data:{rows:[]}}];
 const result=insertTemplateBlocks(written,incoming);assert.equal(result.length,2);assert.equal(result[0].text,'Minha anotação');assert.equal(written.length,1);assert.equal(incoming.length,1);
 result[1].data.rows.push({id:'local'});assert.equal(incoming[0].data.rows.length,0);
 assert.equal(insertTemplateBlocks([{id:'guide',type:'text',text:''}],incoming).length,1);
});

test('Kanban owns measured drag, supports reordering and cannot navigate out of a page',()=>{
 const pages=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 const board=fs.readFileSync(path.join(__dirname,'../src/components/KanbanBoard.tsx'),'utf8');
 const collection=fs.readFileSync(path.join(__dirname,'../src/components/NativeCollectionBlock.tsx'),'utf8');
 assert.ok(board.includes('horizontal nestedScrollEnabled directionalLockEnabled'));
 assert.ok(board.includes('scrollEnabled={!drag}'));assert.ok(board.includes('delayLongPress={180}'));
 assert.ok(board.includes('measureInWindow'));assert.ok(board.includes('columnAt('));assert.ok(board.includes('edgeSpeed('));
 assert.ok(collection.includes('moveKanbanRow(next.rows,id,group.key,column,before)'));
 assert.ok(collection.includes('onInteractionChange={onInteractionChange}'));
 assert.ok(!pages.includes('pageBackResponder'));assert.ok(pages.includes('enabled={!pageDragging&&!kanbanInteractionRef.current&&!coverMove}'));
});
test('page cover uses local preview and an authenticated downloaded file instead of a header-bound Image request',()=>{
 const appearance=fs.readFileSync(path.join(__dirname,'../src/components/PageAppearance.tsx'),'utf8');
 const cache=fs.readFileSync(path.join(__dirname,'../src/lib/page-cover-cache.ts'),'utf8');
 const cover=load('src/lib/page-cover-upload.ts');
 assert.ok(appearance.includes('ImagePicker.getPendingResultAsync()'));
 assert.ok(appearance.includes("PENDING_COVER_KEY='sofia.native.pending-page-cover.v1'"));
 assert.ok(appearance.includes('AsyncStorage.setItem(PENDING_COVER_KEY,pageId)'));
 assert.ok(appearance.includes('new File(asset.uri)'));assert.ok(appearance.includes('await file.base64()'));
 assert.ok(appearance.includes('coverMime(base64,asset.mimeType)'));assert.ok(!appearance.includes('base64:true'));
 assert.ok(appearance.includes('cachedPageCover(api.attachmentSource(attachment)'));
 assert.ok(appearance.includes('cover_local_uri:asset.uri'));assert.ok(appearance.includes('source={{uri}}'));
 assert.ok(cache.includes('File.downloadFileAsync'));assert.ok(cache.includes('headers:source.headers'));assert.ok(cache.includes('Paths.cache'));
 assert.ok(cache.includes("'sofia-page-cover-'"));assert.ok(!appearance.includes('source={retrySource}'));
 assert.equal(cover.coverMime('/9j/AAAA','image/png'),'image/jpeg');
 assert.equal(cover.coverMime('iVBORw0KGgoAAAA','image/jpeg'),'image/png');
 assert.equal(cover.coverName('image/webp'),'capa.webp');
});

test('Diário: dia como título e hora em destaque na frente do texto',()=>{
 const t=freshTemplate(PAGE_TEMPLATES.find(x=>x.id==='diary'));
 assert.equal(t.blocks[0].type,'heading3');assert.match(t.blocks[0].text,/^\d\d\/\d\d\/\d{4} · /);assert.equal(t.blocks[1].type,'text');
 assert.equal(diaryDayTitle(new Date(2026,10,14)),'14/11/2026 · sábado');
 const e=diaryEntryBlock('05:29','a <b> & c');assert.equal(e.text,'05:29  a <b> & c');assert.ok(e.html.includes('<b>05:29</b>'));assert.ok(e.html.includes('a &lt;b&gt; &amp; c'));
});

test('Diário aplicado em página com texto reorganiza datas e horas sem perder nada',()=>{
 const {diaryFromBlocks}=load('src/lib/page-templates.ts');
 const src=[{id:'a',type:'text',text:'07/11/2026\n19:30 - Perder você\n\n20:12 - Se eu tivesse\ncontinua aqui\n14/11/2026\n 4:30 - Não quero ruído'},{id:'img',type:'image',text:'',data:{u:1}},{id:'b',type:'text',text:'06:13 - Eu amo a vida. (bye-Altare>Eternal Rest)'}];
 const r=diaryFromBlocks(src);
 assert.equal(r.map(x=>x.type).join('|'),'heading3|text|text|divider|heading3|text|image|text');
 assert.equal(r[0].text,'07/11/2026 · sábado');assert.equal(r[4].text,'14/11/2026 · sábado');
 assert.equal(r[2].text,'20:12  Se eu tivesse\ncontinua aqui');assert.ok(r[2].html.includes('<br>'));
 assert.equal(r[5].text,'04:30  Não quero ruído');assert.ok(r[7].html.includes('bye-Altare&gt;Eternal Rest'));
 assert.equal(diaryFromBlocks([{id:'x',type:'text',text:'só texto'}]),null);
 assert.equal(JSON.stringify(diaryFromBlocks(r).map(x=>x.text)),JSON.stringify(r.map(x=>x.text)));
});

test('Diário age na página: Enter com hora, dia novo, recolher e índice',()=>{
 const T=load('src/lib/page-templates.ts');
 const page=T.diaryFromBlocks([{id:'a',type:'text',text:'07/11/2026\n19:30 - um\n14/11/2026\n04:30 - dois\n05:29 - tres'}]);
 const e1=page[4].id,now=new Date(2026,10,14,7,52);
 let r=T.diaryEnter(page,e1,now);assert.equal(r.blocks.length,page.length+1);assert.equal(r.blocks[5].text,'07:52  ');assert.equal(r.focus,r.blocks[5].id);assert.equal(r.caret,7);
 r=T.diaryEnter(page,page.at(-1).id,new Date(2026,10,15,0,5));assert.equal(r.blocks.slice(-3).map(x=>x.type).join('|'),'divider|heading3|text');assert.equal(r.blocks.at(-2).text,'15/11/2026 · domingo');
 assert.equal(T.diaryEnter(page,r.blocks.at(-1).id,now),null);
 assert.equal(T.diaryEnter([{id:'x',type:'text',text:'07:00  sem dia'}],'x',now),null);
 const days=T.diaryDays(page);assert.equal(days.map(d=>d.label+'='+d.count).join(','),'07/11 · sáb=1,14/11 · sáb=2');
 const col=page.map(b=>b.id===days[0].id?{...b,data:{collapsed:true}}:b),h=T.diaryHidden(col);
 assert.equal(h.size,1);assert.ok(h.has(page[1].id));assert.ok(!h.has(page[2].id));
});
