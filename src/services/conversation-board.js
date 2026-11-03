'use strict';
// 0.3.265 (Conversa aprovada pelo Pedro): o "Quadro da conversa". Depois de cada resposta da Sofia, as ultimas mensagens
// sao organizadas por ASSUNTO: decidido, a fazer, em aberto, numeros e referencias. O assunto atual fica aberto e os
// anteriores viram etiquetas (titulo, data e hora). O titulo da conversa passa a ser o assunto (fim das listas com
// "Conversa com a Sofia" repetido). Nada aqui cria tarefa ou lancamento: so organiza o que ja foi dito.
const {OWNER}=require('../memory/store');
const SCHEMA={type:'object',additionalProperties:false,required:['topics'],properties:{topics:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,
 required:['title','start','decided','todo','open','numbers','refs'],properties:{
  title:{type:'string'},start:{type:'integer'},
  decided:{type:'array',maxItems:8,items:{type:'string'}},todo:{type:'array',maxItems:8,items:{type:'string'}},
  open:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,required:['title','detail'],properties:{title:{type:'string'},detail:{type:'string'}}}},
  numbers:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['label','value'],properties:{label:{type:'string'},value:{type:'string'}}}},
  refs:{type:'array',maxItems:6,items:{type:'string'}}}}}}};
const INSTRUCTIONS=['Voce organiza uma conversa entre o Pedro e a assistente Sofia num quadro, por ASSUNTO, em portugues do Brasil.',
 'Separe a conversa em assuntos na ordem em que aparecem (um assunto novo comeca quando o tema muda de verdade).',
 'Para cada assunto: title curto (2 a 4 palavras, sem ponto final); start = numero [n] da primeira mensagem do assunto;',
 'decided = o que ficou combinado ou foi feito; todo = o que alguem ainda precisa fazer; open = o que ficou sem decisao (title + detail curto com as opcoes citadas);',
 'numbers = valores, precos e quantidades citados (label + value como foi dito); refs = paginas, projetos ou arquivos citados.',
 'Use frases curtas (ate 12 palavras). Nao invente nada que nao esteja nas mensagens. Listas vazias quando nao houver.'].join(' ');
function createConversationBoard({store,provider}){
 store.db.exec('CREATE TABLE IF NOT EXISTS conversation_board(conversation_id TEXT PRIMARY KEY,json TEXT NOT NULL,message_count INTEGER NOT NULL,updated_at TEXT NOT NULL) STRICT;');
 const running=new Set(),failed=new Map(); // 0.3.353: conversa -> {seq,at} da ultima tentativa que falhou
 function read(id){const r=store.db.prepare('SELECT json,updated_at FROM conversation_board WHERE conversation_id=?').get(id);if(!r)return {topics:[],updated_at:null};try{return {...JSON.parse(r.json),updated_at:r.updated_at};}catch{return {topics:[],updated_at:r.updated_at};}}
 async function update(id){
  if(!id||running.has(id)||!provider||typeof provider.structured!=='function')return read(id);
  const rows=store.messages(id,80).filter(m=>m.status!=='deleted'&&String(m.content||'').trim());
  // 0.3.353 (custo e conserto): o marcador e a ULTIMA mensagem (sequencia), nao a quantidade lida. Antes era o tamanho
  // da lista lida (no maximo 80): conversa com mais de 80 mensagens ficava sempre em 80 e o Quadro nunca mais mudava.
  const seq=rows.length?Number(rows[rows.length-1].sequence)||rows.length:0;
  const old=store.db.prepare('SELECT message_count FROM conversation_board WHERE conversation_id=?').get(id);
  if(!rows.length||old?.message_count===seq)return read(id);
  // 0.3.353 (custo): tentativa que falhou para estas mesmas mensagens nao se repete por 30 min. Antes cada abertura da
  // conversa e as 3 conferencias depois de cada mensagem refaziam a chamada inteira (ate 80 mensagens) a cada falha.
  const miss=failed.get(id);if(miss&&miss.seq===seq&&Date.now()-miss.at<30*60e3)return read(id);
  running.add(id);
  try{
   const input=rows.map((m,i)=>'['+i+'] '+(m.role==='user'?'Pedro':'Sofia')+': '+String(m.content).replace(/!\[[^\]]*\]\([^)]*\)/g,'[imagem]').replace(/\s+/g,' ').slice(0,700)).join('\n');
   let out;try{out=await provider.structured({instructions:INSTRUCTIONS,input,schema:SCHEMA,name:'conversation_board',cacheKey:'sofia-board',maxOutputTokens:1800});}
   catch(e){failed.set(id,{seq,at:Date.now()});throw e;}
   failed.delete(id);
   const topics=(Array.isArray(out?.topics)?out.topics:[]).map(t=>{const at=rows[Math.max(0,Math.min(rows.length-1,Number(t.start)||0))];return {
    title:String(t.title||'Assunto').slice(0,60),started_at:at?.created_at||null,message_id:at?.id||null,
    decided:(t.decided||[]).map(String).slice(0,8),todo:(t.todo||[]).map(String).slice(0,8),open:(t.open||[]).map(o=>({title:String(o.title||''),detail:String(o.detail||'')})).slice(0,6),
    numbers:(t.numbers||[]).map(n=>({label:String(n.label||''),value:String(n.value||'')})).slice(0,8),refs:(t.refs||[]).map(String).slice(0,6)};}).filter(t=>t.message_id);
   const now=new Date().toISOString();
   // 03/11/2026: se o historico foi apagado enquanto a IA respondia, nao grava o resumo de volta
   if(!store.messages(id,1).some(m=>m.status!=='deleted'))return {topics:[],updated_at:now};
   store.db.prepare('INSERT INTO conversation_board(conversation_id,json,message_count,updated_at) VALUES(?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET json=excluded.json,message_count=excluded.message_count,updated_at=excluded.updated_at').run(id,JSON.stringify({topics}),seq,now);
   // titulo da conversa = assunto (so troca o titulo automatico; um titulo escrito pela pessoa fica)
   const c=store.db.prepare('SELECT title FROM conversations WHERE id=? AND owner=?').get(id,OWNER);
   if(c&&topics.length&&/^(Conversa com a Sofia|Chat|Nova conversa)$/i.test(String(c.title||'').trim()))store.db.prepare('UPDATE conversations SET title=? WHERE id=? AND owner=?').run(topics[topics.length-1].title,id,OWNER);
   return {topics,updated_at:now};
  }finally{running.delete(id);}
 }
 return {read,update,schedule:id=>{setTimeout(()=>{update(id).catch(e=>console.warn('[quadro] nao atualizado:',String(e?.message||e).slice(0,140)));},50);}};
}
module.exports={createConversationBoard,BOARD_SCHEMA:SCHEMA};
