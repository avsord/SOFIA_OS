'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
const nav=load('src/lib/page-navigation.ts'),leaf=load('src/lib/leaf-document.ts'),priority=load('src/lib/task-filters.ts',{'./fuzzy':load('src/lib/fuzzy.ts')}),agenda=load('src/lib/agenda-priority.ts',{'./task-filters':priority});
test('back follows entry path: direct subpage returns to menu, nested entry returns to prior page',()=>{const pages=new Map([['parent',{id:'parent',data:{}}],['child',{id:'child',data:{parent_id:'parent'}}],['leaf',{id:'leaf',data:{parent_id:'child'}}]]);assert.equal(nav.entryBackTarget(pages,'child',[]),null);assert.equal(nav.entryBackTarget(pages,'child',['parent']),'parent');assert.equal(nav.entryBackTarget(pages,'leaf',['parent','child']),'child');assert.equal(nav.entryBackTarget(pages,'leaf',['parent','deleted']),'parent');});
test('calendar dots keep multiple priority colors visible even on selected days',()=>{const colors=agenda.dayPriorityColors([{data:{priority_level:'none'}},{data:{priority_level:'important'}},{data:{priority_level:'medium'}},{data:{priority_level:'important'}}],'#FFFFFF');assert.deepEqual(Array.from(colors),['#D94B57','#B77713','#FFFFFF']);assert.equal(agenda.agendaPriority({data:{}}).value,'none');});
test('description edits preserve styles and selected formatting does not affect surrounding text',()=>{let b={id:'d',type:'text',text:'Alfa beta gama',marks:[]};b=leaf.formatRange(b,5,9,{bold:true,italic:true});b=leaf.editBlockText(b,'Alfa beta nova gama');assert.equal(b.text,'Alfa beta nova gama');assert.ok(leaf.textRuns(b).some(r=>r.text.includes('beta')&&r.style.bold));b=leaf.formatRange(b,5,9,{bold:false});assert.equal(leaf.textRuns(b).find(r=>r.start===5).style.bold,undefined);});
test('menu reactivation and unchanged geometry never scroll chat; explicit jump and arrival animate downward',()=>{const refs=[],states=[],effects=[],frames=new Map(),commands=[];let cursor=0,seq=0;const react={useRef:v=>refs[cursor++]||(refs[cursor-1]={current:v}),useState:v=>[v,x=>states.push(x)],useEffect:()=>{},useLayoutEffect:f=>effects.push(f)};const {useChatAutoscroll}=load('src/lib/chat-scroll.ts',{'react':react,'react-native':{Keyboard:{addListener:()=>({remove(){}})}}},{requestAnimationFrame:f=>{frames.set(++seq,f);return seq;},cancelAnimationFrame:id=>frames.delete(id)});const list={current:{scrollToOffset:o=>commands.push(o),scrollToEnd:()=>{}}};const render=active=>{cursor=0;const h=useChatAutoscroll(list,active);effects.splice(0).forEach(f=>f());return h;};const flush=()=>{for(let i=0;frames.size&&i<5;i++){const f=[...frames.values()];frames.clear();f.forEach(x=>x());}};let h=render(true);h.onContentSizeChange(400,3000);h.onLayout({nativeEvent:{layout:{height:700}}});flush();h.onScrollBeginDrag();h.onScrollEndDrag({nativeEvent:{contentOffset:{y:400},contentSize:{height:3000},layoutMeasurement:{height:700}}});const count=commands.length;h=render(false);h.onLayout({nativeEvent:{layout:{height:1000}}});h=render(true);h.onLayout({nativeEvent:{layout:{height:1000}}});h.onContentSizeChange(400,3000);flush();assert.equal(commands.length,count);assert.ok(states.includes(true));h.follow();flush();assert.equal(commands.at(-1).offset,2000);assert.equal(commands.at(-1).animated,true);});

test('page back requires a deliberate left-edge swipe and never starts during an inner interaction',()=>{
 assert.equal(nav.shouldBeginPageBack({x0:10,dx:27,dy:10},400,400,false,false),true);
 assert.equal(nav.shouldBeginPageBack({x0:10,dx:20,dy:2},400,400,false,false),false);
 assert.equal(nav.shouldBeginPageBack({x0:50,dx:100,dy:1},400,400,false,false),false);
 assert.equal(nav.shouldBeginPageBack({x0:10,dx:100,dy:1},400,400,false,true),false);
});

test('tasks filter by user areas and create/edit reuses the Library-style creatable selector',()=>{
 const workspace=fs.readFileSync(path.join(__dirname,'../src/screens/Workspace.tsx'),'utf8');
 assert.ok(workspace.includes('Choice label="Filtrar por área"'));
 assert.ok(workspace.includes("const areaOptions=[...new Set([...areas,...items.map(t=>t.area?.trim()||'Pessoal')])"));
 assert.ok(workspace.includes('<Choice creatable label="Área da tarefa"'));
 // 05/11/2026 (Pedro): no editor so as areas criadas pela pessoa (criar salva na lista; × tira da lista)
 assert.ok(workspace.includes("options={[...new Set([editing.area||'',...myAreas])].filter(Boolean).map(value=>({value,label:value}))}"));
 assert.ok(workspace.includes('onCreate={v=>{setMyAreas(')&&workspace.includes("api.areaChange({add:v})"));
 assert.ok(workspace.includes('Só aparecem as áreas que você criou.'));
 assert.ok(workspace.includes("area:areaFilter||'Pessoal'"));
});
