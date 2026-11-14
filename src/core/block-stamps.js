'use strict';
// 14/11/2026 (Pedro: Diário nas Notas com a hora real de cada linha): cada bloco das páginas e das notas (leaf.blocks dentro
// de data.notebooks) guarda created_at = quando apareceu pela primeira vez. O campo fica dentro do blocks_json (não é campo
// novo da página). Nunca apaga nada: só acrescenta created_at onde falta e devolve o mesmo texto se não mudou nada.
const MAX_JSON=250000;
function walk(blocks,fn){
 for(const b of blocks){if(!b||typeof b!=='object')continue;fn(b,null);
  const books=b.data&&Array.isArray(b.data.notebooks)?b.data.notebooks:[];
  for(const book of books)for(const leaf of (book&&Array.isArray(book.pages)?book.pages:[]))
   for(const lb of (leaf&&Array.isArray(leaf.blocks)?leaf.blocks:[]))if(lb&&typeof lb==='object')fn(lb,leaf);}
}
function blockDates(json){const m=new Map();let bs;try{bs=JSON.parse(json||'[]');}catch{return m;}if(Array.isArray(bs))walk(bs,b=>{if(b.id!==undefined&&b.id!==null)m.set(String(b.id),typeof b.created_at==='string'?b.created_at:'');});return m;}
/** versions: [{revision,created_at,snapshot}] em ordem crescente (lidas só se precisar). Devolve id -> 1ª vez visto
 * ('' quando a 1ª vez é a versão mais antiga guardada e o histórico anterior já foi podado: data desconhecida). */
function firstSeen(versions){const m=new Map();versions.forEach((r,i)=>{let s;try{s=typeof r.snapshot==='string'?JSON.parse(r.snapshot):r.snapshot;}catch{return;}
 const cut=i===0&&Number(r.revision)>1;for(const id of blockDates(s&&s.data&&s.data.blocks_json).keys())if(!m.has(id))m.set(id,cut?'':String(r.created_at||''));});return m;}
/** Acrescenta created_at aos blocos que não têm. oldJson = blocks_json gravado antes; history() = versões crescentes. */
function stampBlocks(blocksJson,{oldJson='',now=new Date().toISOString(),pageCreated='',history=()=>[]}={}){
 let blocks;try{blocks=JSON.parse(blocksJson);}catch{return blocksJson;}if(!Array.isArray(blocks))return blocksJson;
 const prev=blockDates(oldJson);let seen=null,changed=false;
 walk(blocks,(b,leaf)=>{if(b.id===undefined||b.id===null||(typeof b.created_at==='string'&&b.created_at))return;const id=String(b.id);
  let at=prev.get(id)||'';
  if(!at&&prev.has(id)){if(!seen)seen=firstSeen(history()||[]);at=seen.get(id)||(leaf&&typeof leaf.created_at==='string'&&leaf.created_at)||pageCreated||now;}
  if(!at)at=now;b.created_at=at;changed=true;});
 if(!changed)return blocksJson;
 const out=JSON.stringify(blocks);return out.length>MAX_JSON?blocksJson:out;
}
module.exports={stampBlocks,firstSeen,blockDates};
