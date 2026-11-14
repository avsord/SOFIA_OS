'use strict';
// 13/11/2026 22h (Pedro, com print): depois do Ctrl+Z o PDF ficou preso em "Enviando..."; esse envio preso nao dava para
// apagar; e copiar texto + anexo selecionados so levava o anexo.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');
const draft=blocks=>({title:'Reuniao',appearance:{},blocks});

test('Ctrl+Z: o arquivo que ja subiu nao volta para "Enviando..."',()=>{
 const {settleUploads}=load('src/lib/page-editor.ts');
 const txt={id:'t',type:'text',text:'antes'},sub={id:'f',type:'file',text:'',data:{uploading:true,name:'Estudo.pdf'}};
 const pronto={id:'f',type:'file',text:'',data:{attachment_id:'a1',name:'Estudo.pdf',mime:'application/pdf'}};
 const out=settleUploads(draft([txt,sub]),draft([{...txt,text:'depois'},pronto]));
 assert.equal(out.blocks[0].text,'antes','o resto do passo volta normalmente');
 assert.deepEqual(JSON.parse(JSON.stringify(out.blocks[1])),pronto,'o arquivo fica como esta agora, com o anexo');
});
test('Ctrl+Z: envio que ninguem esta fazendo sai da pagina',()=>{
 const {settleUploads}=load('src/lib/page-editor.ts');
 const out=settleUploads(draft([{id:'t',type:'text',text:'x'},{id:'g',type:'file',text:'',data:{uploading:true,name:'perdido.pdf'}}]),draft([{id:'t',type:'text',text:'x'}]));
 assert.deepEqual([...out.blocks.map(b=>b.id)],['t']);
});
test('desfazer e refazer passam pelo acerto dos envios',()=>{
 const s=read('src/lib/page-editor.ts');
 assert.ok(s.includes('e.draft=settleUploads(e.past.pop()!,e.draft);'));
 assert.ok(s.includes('e.draft=settleUploads(e.future.pop()!,e.draft);'));
});
test('arquivo preso em "Enviando..." tem lixeira',()=>{
 const s=read('src/components/PageFiles.tsx');
 assert.ok(s.includes('testID="page-file-uploading-remove"'));
 assert.ok(/page-file-uploading-remove[^\n]*onRemove\(\)/.test(s));
});
test('copiar texto + anexo: leva o texto (com o nome do arquivo) e, colado na Sofia, volta tudo na ordem',()=>{
 const clip=load('src/lib/sofia-clipboard.ts');
 const c={sofia:'page-files',items:[{attachment_id:'a1',name:'Estudo.pdf',mime:'application/pdf'}],blocks:[{id:'t',type:'text',text:'12/11 Reuniao'},{id:'f',type:'file',data:{attachment_id:'a1',name:'Estudo.pdf'}}]};
 clip.rememberSofiaClip(c,'12/11 Reuniao\nEstudo.pdf');
 assert.equal(clip.sofiaClipFor('12/11 Reuniao\r\nEstudo.pdf'),c,'o mesmo texto colado (Windows) traz os blocos');
 assert.equal(clip.sofiaClipFor('outro texto'),null,'texto de fora cola como texto');
 const p=read('src/screens/Pages.tsx');
 assert.ok(p.includes("if(files.length&&files.length===idx.length)setSofiaClip({sofia:'page-files',items});"),'so arquivos: como antes (cola no Drive)');
 assert.ok(p.includes("rememberSofiaClip({sofia:'page-files',items,blocks:"),'mistura: texto + blocos');
 assert.ok(p.includes("x.type==='file'?String(x.data?.name||'arquivo'):t"),'o arquivo aparece pelo nome no texto copiado');
 assert.ok(p.includes('blocks.push(...all)')&&p.includes('const clip=sofiaClipFor(pasted)'),'colar dentro de um texto tambem traz os blocos');
});
test('subpagina da lista do topo tem ⋮⋮ e, arrastada, vira bloco onde for solta (sem duplicar)',()=>{
 const p=read('src/screens/Pages.tsx');
 assert.ok(p.includes("testID={'page-subpage-grip-'+sp.id}"));
 assert.ok(p.includes("dragStart.current({...newBlock('page_link'),text:'',data:{page_id:sp.id}},ev)"));
 assert.ok(p.includes("if(from<0){if(b.type!=='page_link'||blocks.some(x=>x.type==='page_link'&&String(x.data?.page_id||'')===String(b.data?.page_id||'')))return dr;blocks.splice(t.index,0,b);"));
});
