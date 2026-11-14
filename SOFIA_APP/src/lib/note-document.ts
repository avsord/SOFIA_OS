import type {Entity} from './types';
import type {Leaf} from './leaf-document';
export function noteLeaf(item:Partial<Entity>):Leaf{
 const base={id:item.id||'new-note',title:item.title||'',content:item.content||''};
 if(!item.data?.leaf_document)return base;
 try{const value=JSON.parse(item.data.leaf_document);if(value.version!==1||!Array.isArray(value.blocks)||!Array.isArray(value.properties))throw Error();return {...base,created_at:value.created_at,...(value.diary?{diary:true}:{}),blocks:value.blocks,properties:value.properties};}catch{throw Error('O documento desta nota tem um formato diferente. O registro original foi preservado.');}
}
export function notePayload(item:Partial<Entity>,leaf:Leaf):Partial<Entity>{
 if(leaf.content.length>16000)throw Error('Use até 16.000 caracteres na nota.');
 const document=JSON.stringify({version:1,created_at:leaf.created_at,...(leaf.diary?{diary:true}:{}),blocks:leaf.blocks||[],properties:leaf.properties||[]});
 if(document.length>64000)throw Error('A formatação desta nota excedeu o limite. Divida o conteúdo em duas notas.');
 return {...item,kind:item.kind||'annotation',title:leaf.title.trim()||'Sem título',content:leaf.content,data:{...item.data,leaf_document:document}};
}
