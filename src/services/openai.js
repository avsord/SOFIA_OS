'use strict';
const { AppError } = require('../core/util');
const {httpsFetch}=require('./http-client');
const ENDPOINT = 'https://api.openai.com/v1/responses';
function outputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const parts=[],refusals=[];
  for (const item of Array.isArray(data?.output)?data.output:[]) for (const part of Array.isArray(item?.content)?item.content:[]) {
    if (part?.type==='output_text' && typeof part.text==='string') parts.push(part.text);
    else if(part?.type==='refusal'&&typeof part.refusal==='string'&&part.refusal.trim())refusals.push(part.refusal.trim());
  }
  return (parts.length?parts:refusals).join('\n').trim();
}
function outputRefusal(data){
  const refusals=[];
  for(const item of Array.isArray(data?.output)?data.output:[]) for(const part of Array.isArray(item?.content)?item.content:[]) {
    if(part?.type==='refusal'&&typeof part.refusal==='string'&&part.refusal.trim())refusals.push(part.refusal.trim());
  }
  return refusals.join('\n').trim();
}
function parseStructuredText(text){
  const raw=String(text||'').replace(/^\uFEFF/,'').trim();
  if(!raw)return null;
  try{return JSON.parse(raw);}catch{}
  const fenced=raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if(fenced){try{return JSON.parse(fenced[1]);}catch{}}
  // Alguns provedores podem envolver o JSON válido com uma frase curta apesar do schema estrito.
  // Aceitamos apenas um objeto completo delimitado por { ... }; nunca avaliamos código ou texto livre.
  const first=raw.indexOf('{'),last=raw.lastIndexOf('}');
  if(first>=0&&last>first){try{return JSON.parse(raw.slice(first,last+1));}catch{}}
  return null;
}
function safeUsage(data) {
  const u=data?.usage;
  if(!(Number.isSafeInteger(u?.input_tokens) && u.input_tokens>=0 && Number.isSafeInteger(u?.output_tokens) && u.output_tokens>=0))return null;
  // 0.3.353: quanto da entrada veio do cache de prompt (cobrado com desconto) - aparece no diagnostico de uso
  const cached=Number(u?.input_tokens_details?.cached_tokens);
  return Number.isSafeInteger(cached)&&cached>0?{input_tokens:u.input_tokens,output_tokens:u.output_tokens,cached_input_tokens:cached}:{input_tokens:u.input_tokens,output_tokens:u.output_tokens};
}
class OpenAIProvider {
  constructor(config, fetchImpl=null) { this.config=config; this.fetch=fetchImpl||httpsFetch; }
  async respond({ instructions, input, maxOutputTokens, signal, cacheKey }) {
    const key=this.config.apiKey;
    if (!key) throw new AppError('NO_API_KEY','A chave não está carregada. Use o reparador de chave existente, sem colá-la no chat.',503);
    if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) throw new AppError('BAD_API_KEY_FORMAT','A chave carregada contém um formato inesperado. Nenhuma credencial foi enviada.',503);
    let response;
    const timeout=AbortSignal.timeout(this.config.apiTimeoutMs);
    try {
      response=await this.fetch(ENDPOINT, {
        method:'POST',redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout,
        headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify(Object.assign({model:this.config.model,instructions,input,max_output_tokens:maxOutputTokens,store:false,prompt_cache_key:cacheKey||'sofia-text'},/^gpt-5\.6/i.test(this.config.model)?{reasoning:{effort:'none'}}:{}))
      });
    } catch (e) {
      if (signal?.aborted) throw new AppError('CANCELLED','A chamada foi interrompida. A mensagem continua salva.',503);
      if (timeout.aborted) throw new AppError('API_TIMEOUT','A OpenAI não respondeu no prazo. Não repeti a chamada automaticamente; uma tentativa interrompida ainda pode ter custo.',504);
      const err=new AppError('API_CONNECTION','Falha de conexão com a OpenAI. A mensagem foi preservada; tente novamente. Isso não prova que a chave é inválida.',502);err.causeCode=e?.code||e?.cause?.code||'';throw err;
    }
    let data;
    try { data=await response.json(); } catch { throw new AppError('API_INVALID_RESPONSE','O provedor devolveu uma resposta inválida. Não fiz nova tentativa.',502); }
    const requestId=response.headers?.get('x-request-id') || null;
    if (!response.ok) {
      const [code,message]=({
        401:['API_AUTH','A OpenAI não aceitou a credencial carregada. Não coloque a chave no chat.'],
        403:['API_FORBIDDEN','O projeto ou a chave não tem acesso a esta operação.'],
        404:['API_MODEL_NOT_FOUND','O modelo configurado não está disponível para este projeto. Não troquei de modelo automaticamente.'],
        429:['API_QUOTA','A OpenAI informou limite de uso, taxa ou saldo. Confira o painel da API; não gere outra chave só por isso.']
      })[response.status] || ['API_HTTP','A OpenAI respondeu com erro HTTP '+response.status+'. A solicitação não foi repetida.'];
      const error=new AppError(code,message,response.status===429?429:502);error.requestId=requestId;throw error;
    }
    const reply=outputText(data), usage=safeUsage(data);
    if (!reply) { const error=new AppError('API_EMPTY','A API não devolveu texto utilizável. A resposta pode ter atingido o limite de saída; não repeti a chamada.',502);error.usage=usage;throw error; }
    return {reply,usage,requestId,incomplete:data.status==='incomplete'};
  }

  async structured({ instructions, input, schema, name='structured_output', maxOutputTokens, signal, cacheKey }) {
    const key=this.config.apiKey;
    if (!key) throw new AppError('NO_API_KEY','A chave não está carregada. Use o reparador de chave existente, sem colá-la no chat.',503);
    if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) throw new AppError('BAD_API_KEY_FORMAT','A chave carregada contém um formato inesperado. Nenhuma credencial foi enviada.',503);
    if(!schema||typeof schema!=='object')throw new AppError('BAD_SCHEMA','Esquema estruturado inválido.');
    let response;const timeout=AbortSignal.timeout(this.config.apiTimeoutMs);
    try{
      response=await this.fetch(ENDPOINT,{method:'POST',redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(Object.assign({model:this.config.model,instructions,input,max_output_tokens:maxOutputTokens,store:false,prompt_cache_key:cacheKey||('sofia-'+name),text:{format:{type:'json_schema',name,strict:true,schema}}},/^gpt-5\.6/i.test(this.config.model)?{reasoning:{effort:'none'}}:{}))});
    }catch(e){
      if(signal?.aborted)throw new AppError('CANCELLED','A chamada foi interrompida. A mensagem continua salva.',503);
      if(timeout.aborted)throw new AppError('API_TIMEOUT','A OpenAI não respondeu no prazo. Não repeti a chamada automaticamente; uma tentativa interrompida ainda pode ter custo.',504);
      const err=new AppError('API_CONNECTION','Falha de conexão com a OpenAI. A mensagem foi preservada; tente novamente. Isso não prova que a chave é inválida.',502);err.causeCode=e?.code||e?.cause?.code||'';throw err;
    }
    let data;try{data=await response.json();}catch{throw new AppError('API_INVALID_RESPONSE','O provedor devolveu uma resposta inválida. Não fiz nova tentativa.',502);}
    const requestId=response.headers?.get('x-request-id')||null;
    if(!response.ok){const [code,message]=({401:['API_AUTH','A OpenAI não aceitou a credencial carregada. Não coloque a chave no chat.'],403:['API_FORBIDDEN','O projeto ou a chave não tem acesso a esta operação.'],404:['API_MODEL_NOT_FOUND','O modelo configurado não está disponível para este projeto. Não troquei de modelo automaticamente.'],429:['API_QUOTA','A OpenAI informou limite de uso, taxa ou saldo. Confira o painel da API; não gere outra chave só por isso.']})[response.status]||['API_HTTP','A OpenAI respondeu com erro HTTP '+response.status+'. A solicitação não foi repetida.'];const error=new AppError(code,message,response.status===429?429:502);error.requestId=requestId;throw error;}
    const usage=safeUsage(data);
    if(data.status==='incomplete'){
      const reason=String(data?.incomplete_details?.reason||'unknown');
      const message=reason==='max_output_tokens'?'A interpretação da Sofia ficou incompleta antes de terminar o JSON. Nenhuma ação foi executada.':'A resposta estruturada chegou incompleta. Nenhuma ação foi executada.';
      const e=new AppError('API_STRUCTURED_INCOMPLETE',message,502);e.usage=usage;e.requestId=requestId;e.incompleteReason=reason;throw e;
    }
    const refusal=outputRefusal(data);
    if(refusal){const e=new AppError('API_STRUCTURED_REFUSAL','A interpretação estruturada foi recusada pelo modelo. Nenhuma ação foi executada.',502);e.usage=usage;e.requestId=requestId;throw e;}
    const text=outputText(data);if(!text)throw Object.assign(new AppError('API_EMPTY','A API não devolveu saída estruturada utilizável. Não repeti a chamada.',502),{usage,requestId});
    const parsed=parseStructuredText(text);if(!parsed){const e=new AppError('API_STRUCTURED_PARSE','A API respondeu com uma estrutura inválida. Nenhuma ação foi executada.',502);e.usage=usage;e.requestId=requestId;throw e;}
    return {data:parsed,reply:text,usage,requestId,incomplete:false};
  }
}
module.exports={OpenAIProvider,outputText,outputRefusal,parseStructuredText,safeUsage};
