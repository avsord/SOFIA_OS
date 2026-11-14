'use strict';
const crypto=require('node:crypto');
const {stampBlocks}=require('./block-stamps');
// 07/11/2026: anexos das Paginas. Ate 25 MB por arquivo; ate 200 MB guardados aqui antes de irem para o Google Drive.
const ATTACH_MAX=25*1024*1024,LOCAL_ATTACH_MAX=200*1024*1024;
/** Tipo do arquivo como fica guardado: os que o navegador executaria (pagina, SVG, script) viram arquivo comum. */
function attachmentMime(mime){const m=String(mime||'').toLowerCase().trim();if(!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(m))return 'application/octet-stream';if(/^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml)$|javascript|ecmascript|\/x-sh$|x-msdownload/.test(m))return 'application/octet-stream';return m;}
/** Pode abrir dentro do navegador (imagem, PDF, audio, video, texto simples); o resto so baixa. */
function inlineSafe(mime){const m=String(mime||'');return /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(m)||m==='application/pdf'||/^(audio|video)\//.test(m)||m==='text/plain';}
const {CATALOG}=require('./catalog');
const mlIdentity=require('../services/mercado-livre-identity');
const {OWNER}=require('../memory/store');
const {AppError,now,id,cleanText,rejectSecrets,normalize}=require('./util');
const AREAS=['Pessoal','Sofia OS','AVSORD','AVSORD Studio','AVSORD Technology','Enjoy The Void','Estudos','Assets','Geral'];
const PRIV=['private','local','shared','public'];
const SYSTEM_KEYS={mail_account:['last_uid','uid_validity','last_check','last_error','secret_set'],package:['status','events','checked_at','ok_at','error','blocked_until','last_event_at','ship24_tracker_id','milestone','milestone_label','fee','estimated']};
function parse(row){if(!row)return row;return {...row,data:JSON.parse(row.data),tags:JSON.parse(row.tags)};}
function dateISO(v,field='Data'){if(!v)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)throw new AppError('BAD_DATE',field+': informe uma data válida.');return v;}
// 0.3.146: horario sem fuso ("2026-10-15T10:00", vindo do chat ou do app) e lido no fuso da
// Sofia (America/Sao_Paulo) em vez de ser recusado - a pessoa nao precisa informar fuso.
const SOFIA_TZ='America/Sao_Paulo';
function tzOffsetMs(utcMs,tz){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(utcMs)).map(x=>[x.type,x.value]));return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-utcMs;}
function localToUtc(v,tz=SOFIA_TZ){const m=/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(v);if(!m)return null;const naive=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));let t=naive-tzOffsetMs(naive,tz);t=naive-tzOffsetMs(t,tz);return Number.isFinite(t)?new Date(t).toISOString():null;}
function dateTime(v,field='Data'){if(!v)return '';if(typeof v==='string'&&!/(?:Z|[+-]\d\d:?\d\d)$/.test(v.trim())){const z=localToUtc(v.trim());if(z)return z;}if(typeof v!=='string'||!/(?:Z|[+-]\d\d:?\d\d)$/.test(v.trim())||!Number.isFinite(Date.parse(v)))throw new AppError('BAD_DATE',field+': inclua data e hora.');return new Date(v).toISOString();}
function tags(v){const list=Array.isArray(v)?v:(typeof v==='string'?v.split(','):[]);if(list.length>20)throw new AppError('TAGS_LIMIT','Use até 20 labels.');return [...new Set(list.map(t=>cleanText(String(t),'Label',60)).filter(Boolean))];}
function url(v){if(!v)return '';let u;try{u=new URL(v);}catch{throw new AppError('BAD_URL','Informe um link completo http(s).');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new AppError('BAD_URL','Não use credenciais ou outro protocolo no link.');return u.toString();}
class Workspace {
 constructor(store){this.s=store;this.db=store.db;}
 get(entityId){const r=this.db.prepare('SELECT * FROM entities WHERE id=? AND owner=?').get(entityId,OWNER);if(!r)throw new AppError('NOT_FOUND','Registro não encontrado.',404);return parse(r);}
 list({kind,group,state,area,q,limit=200,offset=0}={}){
   if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0)throw new AppError('BAD_PAGE','Paginação inválida.');
   const clauses=['owner=?'],params=[OWNER];
   if(kind){if(!CATALOG[kind])throw new AppError('BAD_KIND','Categoria desconhecida.');clauses.push('kind=?');params.push(kind);}
   if(group){const kinds=Object.entries(CATALOG).filter(([,v])=>v.group===group).map(([k])=>k);if(!kinds.length)return [];clauses.push('kind IN ('+kinds.map(()=>'?').join(',')+')');params.push(...kinds);}
   if(state){clauses.push('state=?');params.push(state);}if(area){clauses.push('area=?');params.push(area);}
   if(q){const text=cleanText(q,'Busca',300);clauses.push("sofia_normalize(title || ' ' || content || ' ' || tags || ' ' || data) LIKE ? ESCAPE '!'");const escaped='%'+normalize(text).replace(/[!%_]/g,'!$&')+'%';params.push(escaped);}
   return this.db.prepare('SELECT * FROM entities WHERE '+clauses.join(' AND ')+' ORDER BY updated_at DESC,rowid DESC LIMIT ? OFFSET ?').all(...params,limit,offset).map(parse);
 }
 validate(input,old){
   const kind=old?.kind||input.kind,def=CATALOG[kind];if(!def)throw new AppError('BAD_KIND','Categoria inválida.');
   const title=cleanText(input.title??old?.title,'Título',240),content=cleanText(input.content??old?.content??'','Descrição',16000,true);
   // 06/11/2026 (Pedro: "a pagina pergunta se quer colocar senha; se falar que nao, fica sem, mas nao aparece esse erro"):
   // pagina marcada pelo dono (sofia-secret-ok-v1) ou trancada (sofia-lock-v1) guarda o texto como esta; ela nao vai para a IA (context)
   const secretOk=kind==='user_page'&&(input.tags??old?.tags??[]).some(t=>t==='sofia-secret-ok-v1'||t==='sofia-lock-v1');
   if(!secretOk)rejectSecrets(title+'\n'+content);
   const area=cleanText(input.area||old?.area||'Geral','Área',80),state=input.state||old?.state||def.states[0];if(!def.states.includes(state))throw new AppError('BAD_STATE','Estado inválido para '+def.label+'.');
   let privacy=input.privacy||old?.privacy||def.defaultPrivacy||(def.group==='study'||def.group==='library'?'shared':'private');if(privacy==='public')privacy='shared';if(!PRIV.includes(privacy))throw new AppError('BAD_PRIVACY','Privacidade inválida.');if(def.private&&privacy==='shared')throw new AppError('PRIVATE_RECORD','Esse tipo de registro deve permanecer privado ou local.');
   const raw=input.data===undefined?(old?.data||{}):input.data;if(!raw||Array.isArray(raw)||typeof raw!=='object')throw new AppError('BAD_DATA','Campos inválidos.');
   const data={};const permitted=new Set(def.fields.map(f=>f.key));for(const k of Object.keys(raw))if(!permitted.has(k))throw new AppError('BAD_FIELD','Campo não previsto: '+k);
   for(const f of def.fields){let v=raw[f.key];if((f.type==='flag'||f.type==='colormap')&&(v===undefined||v===null||v===''))continue;if(v===undefined||v===null||v===''){data[f.key]=f.type==='checkbox'?false:'';continue;}
     // 14/11/2026 (Pedro: barra lateral diferente em cada navegador): subatalho (sim/não, ausente = nunca escolhido) e cores dos pontos da barra lateral ficam na conta
     if(f.type==='flag'){if(typeof v!=='boolean')throw new AppError('BAD_FIELD',f.label+': use sim ou não.');data[f.key]=v;continue;}
     if(f.type==='colormap'){if(typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>300)throw new AppError('BAD_FIELD',f.label+': cores inválidas.');const m={};for(const [k,c] of Object.entries(v)){if(k.length>120||typeof c!=='string'||!/^#[0-9a-f]{3,8}$/i.test(c))throw new AppError('BAD_FIELD',f.label+': cor inválida.');m[k]=c;}data[f.key]=m;continue;}
     if(f.type==='checkbox'){if(typeof v!=='boolean')throw new AppError('BAD_FIELD',f.label+': marque sim ou não.');}
     else if(f.type==='number'){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e10)throw new AppError('BAD_FIELD',f.label+': use um número positivo.');}
     else if(f.type==='date')v=dateISO(v,f.label);
     else if(f.type==='datetime')v=dateTime(v,f.label);
     else if(f.type==='time'){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))throw new AppError('BAD_TIME','Use HH:MM.');}
     else if(f.type==='select'){if(!f.options.includes(v))throw new AppError('BAD_FIELD',f.label+': escolha uma opção válida.');}
     else if(f.type==='url')v=url(v);
     else {v=cleanText(v,f.label,f.type==='textarea'?(f.max||16000):(f.max||1000),true);if(!secretOk)rejectSecrets(v);}
     data[f.key]=v;
   }
   if(kind==='user_page'){
     const allowedBlocks=new Set(['text','heading1','heading2','heading3','heading4','bullet','number','todo','toggle','code','quote','callout','equation','divider','page_link','image','file','table','date','task_link','commitment_link','bookmark','sofia','collection']);
     if(data.blocks_json){
       let blocks;try{blocks=JSON.parse(data.blocks_json);}catch{throw new AppError('BAD_PAGE_BLOCKS','O conteúdo em blocos da página está inválido.');}
       if(!Array.isArray(blocks)||blocks.length>500)throw new AppError('BAD_PAGE_BLOCKS','Use até 500 blocos por página.');
       for(const block of blocks){
         if(!block||typeof block!=='object'||Array.isArray(block))throw new AppError('BAD_PAGE_BLOCKS','Bloco inválido.');
         if(!allowedBlocks.has(String(block.type||'text')))throw new AppError('BAD_PAGE_BLOCKS','Tipo de bloco inválido.');
         const text=String(block.text||'');if(text.length>12000)throw new AppError('BAD_PAGE_BLOCKS','Um bloco não pode ultrapassar 12000 caracteres.');secretOk||rejectSecrets(text);
         const html=String(block.html||'');if(html.length>24000||/<\/?(?:script|style|iframe|object|embed|form|svg)|on\w+\s*=|javascript\s*:/i.test(html))throw new AppError('BAD_PAGE_BLOCKS','Formatação rich text inválida.');secretOk||rejectSecrets(html.replace(/<[^>]*>/g,' '));
         if(block.comments!==undefined){if(!Array.isArray(block.comments)||block.comments.length>100)throw new AppError('BAD_PAGE_BLOCKS','Use até 100 comentários por bloco.');for(const c of block.comments){if(!c||typeof c!=='object'||Array.isArray(c))throw new AppError('BAD_PAGE_BLOCKS','Comentário inválido.');const q=String(c.quote||''),body=String(c.text||'');if(q.length>2000||body.length>4000)throw new AppError('BAD_PAGE_BLOCKS','Comentário grande demais.');secretOk||rejectSecrets(q);secretOk||rejectSecrets(body);}}
         if(block.data!==undefined){if(!block.data||typeof block.data!=='object'||Array.isArray(block.data))throw new AppError('BAD_PAGE_BLOCKS','Dados do bloco inválidos.');const packed=JSON.stringify(block.data).replace(/"created_at":"[^"]{0,40}",?/g,'');/* o carimbo de data dos blocos (block-stamps.js) não conta no limite */if(packed.length>50000)throw new AppError('BAD_PAGE_BLOCKS','Dados do bloco grandes demais.');secretOk||rejectSecrets(packed);if(block.type==='table'&&block.data.rows!==undefined){if(!Array.isArray(block.data.rows)||block.data.rows.length>50||block.data.rows.some(r=>!Array.isArray(r)||r.length>20||r.some(c=>String(c??'').length>3000)))throw new AppError('BAD_PAGE_BLOCKS','Tabela limitada a 50 linhas, 20 colunas e 3000 caracteres por célula.');}}
       }
     }
     if(data.parent_id){
       if(old&&data.parent_id===old.id)throw new AppError('PAGE_SELF_PARENT','Uma página não pode ficar dentro dela mesma.',409);
       const parent=this.get(data.parent_id);if(parent.kind!=='user_page'||parent.state==='archived')throw new AppError('PAGE_PARENT_INVALID','A página pai não está disponível.',409);
       let cursor=parent,depth=0;
       while(cursor?.data?.parent_id&&depth<30){
         if(old&&cursor.data.parent_id===old.id)throw new AppError('PAGE_CYCLE','Esse movimento criaria um ciclo entre páginas.',409);
         cursor=this.get(cursor.data.parent_id);depth++;
       }
       data.node_type='page';
     }else data.node_type='space';
   }
   if(kind==='purchase'&&data.purchase_group_id){const group=this.get(data.purchase_group_id);if(group.kind!=='purchase_group'||group.state==='archived')throw new AppError('PURCHASE_GROUP_REQUIRED','O grupo de compra selecionado não está disponível.');}
   if(kind==='shopping_item'&&data.list==='pharmacy')privacy='private';
   if(['AVSORD','AVSORD Studio','AVSORD Technology'].includes(area)&&['file','project','request','approval'].includes(kind))privacy='private';
   if(kind==='contact'&&!data.permission)data.permission='blocked';
   if(kind==='lesson'&&(!data.course_id||this.get(data.course_id).kind!=='course'))throw new AppError('COURSE_REQUIRED','Selecione um curso existente para esta aula.');
   if(kind==='list_item'){if(!data.collection_id)throw new AppError('LIST_REQUIRED','Selecione uma lista personalizada.');const collection=this.get(data.collection_id);if(collection.kind!=='list_collection')throw new AppError('LIST_REQUIRED','A lista selecionada não é uma lista personalizada válida.');if(!input.privacy&&!old?.privacy)privacy=collection.privacy;}
   if(['commitment','reminder'].includes(kind)){data.calendar_provider=data.calendar_provider||'local';data.sync_state=data.sync_state||'local';}
   if(kind==='commitment'&&data.end_at&&data.start_at&&data.end_at<=data.start_at)throw new AppError('BAD_DATE','O fim precisa ser posterior ao início.');
   if(kind==='course'&&data.progress!==''&&data.progress>100)throw new AppError('BAD_PROGRESS','Progresso deve ficar entre 0 e 100.');
   if(kind==='monitor'){
     data.currency=data.currency||'BRL';data.method=data.method||'manual';data.interval_minutes=data.interval_minutes||360;
     if(data.method==='product'){
       if(data.target_id&&!['purchase','course'].includes(this.get(data.target_id).kind))throw new AppError('TARGET_REQUIRED','O item vinculado precisa ser de Comprar ou um curso existente.');
       if(!data.preferred_url)throw new AppError('STORE_REQUIRED','Cole o link da página do produto na loja principal.');
     }
     else if(!data.target_id||!['purchase','course'].includes(this.get(data.target_id).kind))throw new AppError('TARGET_REQUIRED','O monitor deve referenciar um item de Comprar ou um curso existente.');
     if(!data.variant)throw new AppError('VARIANT_REQUIRED','Defina a variante exata para não comparar produtos diferentes.');
     if(data.preferred_url&&!data.preferred_url.startsWith('https://'))throw new AppError('BAD_STORE_URL','O link da loja principal precisa usar HTTPS.');
     if(data.source_urls){
       const lines=data.source_urls.split('\n').map(l=>l.trim()).filter(Boolean);
       if(lines.length>10)throw new AppError('TOO_MANY_SOURCES','Use até 10 lojas por produto.');
       const seen=new Set();
       for(const line of lines){
         let u;try{u=new URL(line);}catch{throw new AppError('BAD_STORE_URL','"'+line.slice(0,60)+'" não é um link completo. Use um link por linha.');}
         if(u.protocol!=='https:'||u.username||u.password)throw new AppError('BAD_STORE_URL','Cada loja precisa de um link HTTPS, sem credenciais.');
         if(seen.has(u.toString()))throw new AppError('BAD_STORE_URL','Esse link aparece duas vezes: '+u.hostname+'.');
         seen.add(u.toString());
       }
       data.source_urls=lines.join('\n');
     }
     if(data.source_identities||old?.data.source_identities)data.source_identities=mlIdentity.mergePins(data.source_identities,old?.data.source_identities,[data.preferred_url,...String(data.source_urls||'').split('\n')]);
     if(data.line_color&&!/^#[0-9a-fA-F]{6}$/.test(data.line_color))throw new AppError('BAD_COLOR','Escolha uma cor válida para a linha do gráfico.');
     if(!Number.isInteger(data.interval_minutes)||data.interval_minutes<15||data.interval_minutes>43200)throw new AppError('BAD_INTERVAL','Intervalo entre 15 e 43200 minutos.');
     if(data.drop_percent!==''&&data.drop_percent>100)throw new AppError('BAD_PERCENT','Queda deve ficar entre 0 e 100%.');
     if(data.method==='json'&&(!data.feed_url||!data.price_path||!data.variant_path||!data.currency_path||!data.consent))throw new AppError('FEED_REQUIRED','Informe feed HTTPS autorizado, campos de preço/variante/moeda e consentimento.');
     if(data.feed_url&&[...new URL(data.feed_url).searchParams.keys()].some(k=>/token|api.?key|auth|secret|signature/i.test(k)))throw new AppError('SECRET_FEED','Use um feed público sem tokens, assinaturas ou credenciais na URL.');
     if(data.feed_url&&!data.feed_url.startsWith('https://'))throw new AppError('BAD_FEED','O feed precisa usar HTTPS.');
     if(old&&this.db.prepare('SELECT id FROM observations WHERE monitor_id=? LIMIT 1').get(old.id)&&['target_id','variant','currency'].some(k=>data[k]!==old.data[k]))throw new AppError('OBSERVATION_SCOPE','Esse monitor já tem observações. Crie outro para mudar produto, variante ou moeda.');
   }
   if(kind==='mail_account'){data.provider=data.provider||'gmail';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.address))throw new AppError('BAD_EMAIL','Informe o e-mail completo.');if(data.provider==='imap'&&!data.host)throw new AppError('MAIL_HOST','Informe o servidor IMAP.');if(data.port!==''&&(!Number.isInteger(data.port)||data.port<1||data.port>65535))throw new AppError('BAD_PORT','Porta inválida.');}
   if(kind==='mail_rule'){data.field=data.field||'any';if(!String(data.contains||'').trim())throw new AppError('RULE_EMPTY','Diga o que a Sofia deve procurar (nome, e-mail, assunto ou palavra).');}
   if(kind==='fin_account'){data.account_type=data.account_type||'corrente';if(data.initial_balance!==''&&!/^-?\d{1,10}(\.\d{1,2})?$/.test(String(data.initial_balance)))throw new AppError('BAD_BALANCE','Saldo inicial: use um valor como 1500.50 ou -200.');}
   if(kind==='fin_card'){for(const k of ['closing_day','due_day'])if(!Number.isInteger(data[k])||data[k]<1||data[k]>31)throw new AppError('BAD_CARD_DAY','Dias de fechamento e vencimento entre 1 e 31.');if(data.limit===''||data.limit<=0)throw new AppError('BAD_LIMIT','Informe o limite do cartão.');}
   if(kind==='fin_tx'){
     data.kind=data.kind||'expense';data.recurrence=data.recurrence||'none';
     if(data.amount===''||!(data.amount>0))throw new AppError('BAD_AMOUNT','Informe um valor maior que zero.');
     if(!data.date)throw new AppError('DATE_REQUIRED','Informe a data do lançamento.');
     if(data.kind==='transfer'&&(!data.account_id||!data.to_account_id||data.account_id===data.to_account_id))throw new AppError('BAD_TRANSFER','Escolha duas contas diferentes para a transferência.');
     if(data.kind==='card_payment'&&(!data.card_id||!/^\d{4}-\d{2}$/.test(data.invoice_month)))throw new AppError('BAD_INVOICE','Pagamento de fatura precisa do cartão e do mês da fatura.');
     if(data.kind==='expense'&&!data.account_id&&!data.card_id)throw new AppError('SOURCE_REQUIRED','Escolha a conta ou o cartão.');
     if(data.kind==='income'&&!data.account_id)throw new AppError('SOURCE_REQUIRED','Escolha a conta que recebe.');
     if(data.invoice_month&&!/^\d{4}-\d{2}$/.test(data.invoice_month))throw new AppError('BAD_INVOICE','Mês da fatura inválido.');
     if(data.installments!==''&&(!Number.isInteger(data.installments)||data.installments<1||data.installments>72))throw new AppError('BAD_INSTALLMENTS','Parcelas entre 1 e 72.');
   }
   if(kind==='fin_budget'&&(!data.category||data.limit===''||data.limit<=0))throw new AppError('BAD_BUDGET','Escolha a categoria e o limite mensal.');
   // 0.3.146: a reserva (Dinheiro guardado) nao precisa de meta final, prazo ou compra especifica.
   if(kind==='fin_goal'&&data.role!=='reserve'&&(data.target===''||data.target<=0))throw new AppError('BAD_GOAL','Informe o valor do objetivo.');
   if(kind==='fin_reserve_move'&&(!(Number(data.amount)>0)||!['in','out'].includes(data.direction)||!data.goal_id))throw new AppError('BAD_RESERVE_MOVE','Informe o valor e se é para guardar ou retirar.');
   if(kind==='routine'&&state==='active'){
     if(!data.frequency||!data.time||!data.starts_on||!data.delivery)throw new AppError('ROUTINE_INCOMPLETE','Defina frequência, horário, início e entrega antes de ativar.');
     if(data.frequency==='weekly'&&(!Number.isInteger(data.weekday)||data.weekday>6))throw new AppError('BAD_WEEKDAY','Dia da semana: 0 a 6.');
     if(data.frequency==='monthly'&&(!Number.isInteger(data.monthday)||data.monthday<1||data.monthday>31))throw new AppError('BAD_MONTHDAY','Dia do mês: 1 a 31.');
     if(data.ends_on&&data.ends_on<data.starts_on)throw new AppError('BAD_DATE','O término precede o início.');
   }
   let finalState=state;
   if(kind==='approval'){
     const changed=old&&['proposed_text','recipient','channel','sender'].some(k=>data[k]!==old.data[k]);
     if(state==='approved'&&input.confirm_approval!==true&&old?.state!=='approved')throw new AppError('CONFIRM_REQUIRED','Revise destinatário, remetente e texto, então use Aprovar.');
     if(changed&&old.state==='approved')finalState='pending';
     if(finalState==='approved')data.approved_revision=(old?.revision||0)+1;
   }
   if(kind==='recipe'&&state==='ready'&&(!data.ingredients||!data.steps))throw new AppError('RECIPE_INCOMPLETE','Uma receita pronta precisa de ingredientes e preparo. Mantenha rascunho se faltarem.');
   const labels=tags(input.tags??old?.tags??[]);if(kind==='purchase'&&data.occasion==='black-friday'&&!labels.includes('Black Friday'))labels.push('Black Friday');
   return {kind,title,content,area,privacy,state:finalState,data,tags:labels};
 }
 event(type,entityId,event,area,summary){this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?)').run(id(),type,entityId,event,area,summary.slice(0,500),now());}
 // 0.3.146: campos que so a propria Sofia escreve em segundo plano (horario da ultima
 // verificacao do e-mail, ponto de leitura, status da encomenda...). Se a revisao mudou SO por
 // eles, o salvamento da pessoa segue: os campos dela valem e os automaticos ficam como estao
 // no servidor. Se outra pessoa/dispositivo mudou um campo de verdade, o conflito continua.
 systemOnlyChange(kind,input,old){const keys=SYSTEM_KEYS[kind];if(!keys||!input||!old)return false;const base=input.base_data;if(!base||typeof base!=='object')return false;const cur=old.data||{};for(const k of new Set([...Object.keys(cur),...Object.keys(base)])){if(keys.includes(k))continue;if(JSON.stringify(cur[k])!==JSON.stringify(base[k]))return false;}return ['title','content','area','state','privacy'].every(f=>input['base_'+f]===undefined||input['base_'+f]===old[f]);}
 /** 0.3.186: a mesma ocorrencia de uma conta fixa/salario so existe uma vez por mes. Se ha mais de um
  * registro da mesma serie no mesmo mes (sobra de versoes antigas), fica um so: o pago e, entre iguais,
  * o original da serie. Os outros sao apagados. Nada de fora de series e tocado. */
 repairFinanceDuplicates(){
  const rows=this.db.prepare("SELECT id FROM entities WHERE kind='fin_tx' AND state!='archived'").all().map(r=>this.get(r.id));
  // 0.3.230: conta/receita fixa cadastrada mais de uma vez IGUALZINHA (mesmo nome, tipo, conta, valor, data e parcelas),
  // ainda sem nenhum pagamento ligado a ela: fica a mais antiga, as copias saem (sobra do rascunho que voltava sozinho).
  {const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
   const children=new Set(rows.map(e=>e.data&&e.data.series_id).filter(Boolean));
   const twins=new Map();
   for(const e of rows){const d=e.data||{};if(!String(d.import_id||'').startsWith('sofia-pendencia:')||d.recurrence!=='monthly'||d.series_id||d.paid||children.has(e.id))continue;
    const key=[d.kind,d.account_id,norm(e.title),Number(d.amount).toFixed(2),d.date,Number(d.installments)||0,Number(d.installment)||0,d.card_id||''].join('|');twins.set(key,[...(twins.get(key)||[]),e]);}
   for(const list of twins.values()){if(list.length<2)continue;const keep=[...list].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))[0];
    for(const e of list){if(e.id===keep.id)continue;try{this.deleteEntity(e.id);}catch{/* segue */}}}}
  const groups=new Map();
  for(const e of rows){const d=e.data||{};const series=d.series_id||(d.recurrence&&d.recurrence!=='none'?e.id:'');if(!series||!d.date)continue;const key=series+'|'+String(d.date).slice(0,7);groups.set(key,[...(groups.get(key)||[]),e]);}
  let removed=0;
  for(const [key,list] of groups){
   if(list.length<2)continue;
   const series=key.split('|')[0];
   const original=list.find(e=>e.id===series),anyPaid=list.some(e=>e.data&&e.data.paid);
   // com o original da serie naquele mes, ele fica (pago se alguma copia estava paga); senao fica a copia paga mais antiga
   const keep=original||[...list].sort((a,b)=>Number(!!b.data.paid)-Number(!!a.data.paid)||String(a.created_at).localeCompare(String(b.created_at)))[0];
   if(original&&anyPaid&&!original.data.paid){try{this.save({revision:original.revision,data:{...original.data,paid:true}},original.id);}catch{/* fica como esta */}}
   for(const e of list){if(e.id===keep.id)continue;try{this.deleteEntity(e.id);removed++;}catch{/* segue com os outros */}}
  }
  return {removed};
 }
 save(input,entityId){
  // 0.3.200: trocar ou tirar a capa de uma pagina apaga o arquivo da capa antiga (antes ele ficava para sempre)
  let coverBefore='';try{if(entityId){const old=this.get(entityId);if(old.kind==='user_page')coverBefore=String(old.data&&old.data.cover_attachment_id||'');}}catch{/* o save reclama */}
  const out=this.saveCore(input,entityId);
  try{if(coverBefore&&out&&out.kind==='user_page'&&String(out.data&&out.data.cover_attachment_id||'')!==coverBefore)this.dropOldCover(out.id,coverBefore);}catch{/* limpeza e best-effort */}
  return out;
 }
 /** Apaga um anexo (a capa antiga, por exemplo). O servico do Google apaga tambem a copia no Drive. */
 dropAttachment(attId){let a;try{a=this.db.prepare('SELECT id,entity_id,drive_id FROM attachments WHERE id=?').get(attId);}catch{a=this.db.prepare('SELECT id,entity_id FROM attachments WHERE id=?').get(attId);}if(!a)return null;this.db.prepare('DELETE FROM attachments WHERE id=?').run(attId);return a;}
 /** So apaga se for mesmo uma capa DESTA pagina e nenhuma outra pagina/registro usar o mesmo arquivo. */
 dropOldCover(pageId,attId){
  // 14/11/2026 (Pedro: "as capas que foram subidas ficam salvas em uma biblioteca de capas, e mesmo se remover so sai se remover da biblioteca"): trocar/remover a capa nunca apaga o arquivo; so removeCover apaga
  if(pageId!==null)return false;
  const a=this.db.prepare('SELECT id,entity_id,name FROM attachments WHERE id=?').get(attId);
  if(!a||a.entity_id!==pageId||!/^capa\./.test(String(a.name||'')))return false;
  const used=this.db.prepare("SELECT 1 AS x FROM entities WHERE id!=? AND instr(data,?)>0 LIMIT 1").get(pageId,attId);
  if(used)return false;
  // 14/11/2026 (Pedro: "capa desapareceu" / cancelar capa nao volta como estava): a capa antiga fica enquanto estiver nas ultimas 20 versoes da pagina, para desfazer/versoes anteriores voltarem a abrir
  try{if(this.db.prepare('SELECT snapshot FROM entity_versions WHERE entity_id=? ORDER BY revision DESC LIMIT 20').all(pageId).some(r=>String(r.snapshot).includes(attId)))return false;}catch{/* sem versoes: segue */}
  this.dropAttachment(attId);return true;
 }
 /** 14/11/2026: biblioteca de capas = todo anexo "capa.*" enviado (de qualquer pagina, mesmo excluida). */
 coverLibrary(){return this.db.prepare("SELECT id,entity_id,name,mime,bytes,created_at FROM attachments WHERE name LIKE 'capa.%' AND mime LIKE 'image/%' ORDER BY created_at DESC LIMIT 200").all();}
 /** Tira a capa da biblioteca (apaga o arquivo). Recusa se alguma pagina ainda usa a capa. */
 removeCover(attId){const a=this.db.prepare("SELECT id,name FROM attachments WHERE id=?").get(attId);if(!a||!/^capa./.test(String(a.name||'')))throw new AppError('NOT_FOUND','Capa não encontrada na biblioteca.',404);
  const used=this.db.prepare("SELECT title FROM entities WHERE instr(data,?)>0 LIMIT 1").get(attId);if(used)throw new AppError('COVER_IN_USE','Esta capa está em uso na página “'+(used.title||'Sem título')+'”. Troque a capa dela antes de tirar da biblioteca.',409);
  this.dropAttachment(attId);return {removed:attId};}
 /** Capas que sobraram de trocas antigas: anexo "capa.*" de uma pagina que nao e mais a capa atual dela. Ignora
  * o que tem menos de 1 hora (o app envia a capa e so depois salva a pagina). */
 cleanupOrphanCovers(){
  const cutoff=new Date(Date.now()-3600*1000).toISOString();let removed=0;
  const rows=this.db.prepare("SELECT a.id AS aid,a.entity_id AS pid,e.data AS data FROM attachments a JOIN entities e ON e.id=a.entity_id WHERE e.kind='user_page' AND a.name LIKE 'capa.%' AND a.created_at<?").all(cutoff);
  for(const r of rows){let cur='';try{cur=String(JSON.parse(r.data||'{}').cover_attachment_id||'');}catch{continue;}
   if(cur===r.aid)continue;try{if(this.dropOldCover(r.pid,r.aid))removed++;}catch{/* segue */}}
  return {removed};
 }
 /** 0.3.200: reduz as capas JPEG que JA estao no servidor (as novas ja chegam reduzidas). Uma por vez, com pausa
  * entre elas para o servidor continuar respondendo, e nunca enquanto o envio ao Drive esta rodando. */
 async shrinkExistingCovers({isBusy=()=>false,max=40}={}){
  const {shrinkJpeg,jpegSize}=require('../services/thumb');let shrunk=0,saved=0;
  let rows;try{rows=this.db.prepare("SELECT id FROM attachments WHERE name LIKE 'capa.%' AND mime='image/jpeg' AND drive_id IS NULL AND length(blob)>200000 ORDER BY length(blob) DESC LIMIT ?").all(max);}
  catch{rows=this.db.prepare("SELECT id FROM attachments WHERE name LIKE 'capa.%' AND mime='image/jpeg' AND length(blob)>200000 ORDER BY length(blob) DESC LIMIT ?").all(max);}
  for(const r of rows){
   if(isBusy())break;
   const a=this.db.prepare('SELECT id,blob FROM attachments WHERE id=?').get(r.id);if(!a||!a.blob||!a.blob.length)continue;
   const bytes=Buffer.from(a.blob),size=jpegSize(bytes);if(!size||size.width<=1600)continue;
   const small=shrinkJpeg(bytes);
   if(small){this.db.prepare('UPDATE attachments SET blob=?,bytes=?,sha256=? WHERE id=? AND length(blob)>0').run(small,small.length,crypto.createHash('sha256').update(small).digest('hex'),a.id);shrunk++;saved+=bytes.length-small.length;}
   await new Promise(res=>setTimeout(res,250));
  }
  return {shrunk,saved};
 }
 saveCore(input,entityId){
  // 0.3.185: uma ocorrencia de conta fixa/salario so pode existir uma vez por mes. Se ja existe um
  // registro dessa serie no mesmo mes, o "novo" vira atualizacao dele (evita somar duas vezes).
  // 0.3.227: conta/receita fixa (todo mes) igual a uma que ja existe (mesmo nome, tipo, conta, valor e dia) nao vira outra
  if(!entityId&&input&&input.kind==='fin_tx'&&input.data&&String(input.data.import_id||'').startsWith('sofia-pendencia:')&&input.data.recurrence==='monthly'&&!input.data.series_id&&input.data.date){
    const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const d=input.data,day=String(d.date).slice(8,10),title=norm(input.title);
    for(let offset=0;offset<20000;offset+=500){const page=this.list({kind:'fin_tx',limit:500,offset});for(const e of page){if(e.state==='archived')continue;const x=e.data||{};
      if(String(x.import_id||'').startsWith('sofia-pendencia:')&&x.recurrence==='monthly'&&!x.series_id&&x.kind===d.kind&&String(x.account_id||'')===String(d.account_id||'')&&Math.abs(Number(x.amount)-Number(d.amount))<0.005&&String(x.date||'').slice(8,10)===day&&norm(e.title)===title)return e;}if(page.length<500)break;}
  }
  if(!entityId&&input&&input.kind==='fin_tx'&&input.data&&input.data.series_id&&input.data.date){
   const series=String(input.data.series_id),month=String(input.data.date).slice(0,7);
   const dup=this.db.prepare("SELECT id FROM entities WHERE kind='fin_tx' AND state!='archived' AND (id=? OR json_extract(data,'$.series_id')=?) AND id!=? AND substr(json_extract(data,'$.date'),1,7)=? LIMIT 1").all(series,series,series,month).map(r=>this.get(r.id)).find(e=>e.state!=='archived'&&(e.id===series||(e.data&&e.data.series_id===series))&&e.id!==series&&String(e.data&&e.data.date||'').slice(0,7)===month);
   if(dup){entityId=dup.id;input={...input,revision:dup.revision,data:{...dup.data,...input.data}};}
  }
  const old=entityId?this.get(entityId):null;if(old&&input.revision!==old.revision){if(this.systemOnlyChange(old.kind,input,old)){const keys=SYSTEM_KEYS[old.kind],data={...(input.data||{})};for(const k of keys)if(k in (old.data||{}))data[k]=old.data[k];input={...input,data,revision:old.revision};}else throw new AppError('REVISION_CONFLICT','Este registro mudou em outro aparelho. Suas alterações não foram perdidas: reabra para conferir e salve de novo.',409);}
 delete input.base_data;delete input.base_title;delete input.base_content;delete input.base_area;delete input.base_state;delete input.base_privacy;
   const v=this.validate(input,old);if(v.kind==='user_page'&&v.data&&typeof v.data.blocks_json==='string')v.data.blocks_json=stampBlocks(v.data.blocks_json,{oldJson:old?String(old.data?.blocks_json||''):'',pageCreated:old?String(old.created_at||''):'',history:()=>old?this.db.prepare('SELECT revision,created_at,snapshot FROM entity_versions WHERE entity_id=? ORDER BY revision ASC').all(old.id):[]});const inherited=this.s.privacyOf('message',input.source_id||old?.source_id);if(inherited==='local')v.privacy='local';else if(!input.privacy&&inherited==='shared'&&!CATALOG[v.kind].private)v.privacy='shared';else if(!input.privacy&&inherited==='private')v.privacy='private';const key=entityId||id(),revision=(old?.revision||0)+1,stamp=now();
   return this.s.tx(()=>{
     if(old)this.db.prepare('UPDATE entities SET title=?,content=?,area=?,tags=?,privacy=?,state=?,data=?,revision=?,updated_at=? WHERE id=?').run(v.title,v.content,v.area,JSON.stringify(v.tags),v.privacy,v.state,JSON.stringify(v.data),revision,stamp,key);
     else this.db.prepare('INSERT INTO entities VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(key,OWNER,v.kind,v.title,v.content,v.area,JSON.stringify(v.tags),v.privacy,v.state,JSON.stringify(v.data),input.source_id?this.s.source(input.source_id):null,revision,stamp,stamp);
     const saved=this.get(key);this.db.prepare('INSERT INTO entity_versions VALUES(?,?,?,?,?)').run(id(),key,revision,JSON.stringify(saved),stamp);this.pruneVersions(key);
     this.event('entity',key,old?'updated':'created',v.area,v.title);this.s.audit('workspace.'+(old?'updated':'created'),key);
     if(v.kind==='monitor'||v.kind==='routine')this.syncJob(saved);
     return saved;
   });
 }
 changeState(entityId,state,revision,extra={}){const old=this.get(entityId);return this.save({...old,...extra,state,revision},entityId);}
 deleteEntity(entityId){
   const e=this.get(entityId);
   // 0.3.215: receita que mandou uma parte para o guardado - apagar a receita apaga o aporte ligado a ela
   // 0.3.235: apagar uma regra de e-mail solta os e-mails que ela encontrou (eles continuam na lista, sem o vinculo) -
   // antes o servidor recusava ("ainda e usado por...") e o app ficava parado sem avisar
   // 0.3.222: direto no banco (antes o regravar podia falhar em e-mail antigo e a regra continuava presa); a estrela
   // que veio da regra sai, os e-mails ficam. Emoji escolhido pela pessoa (que nao seja a estrela) continua.
   if(e.kind==='mail_rule'){const at=now(),rows=this.db.prepare("SELECT id,data FROM entities WHERE owner=? AND kind='mail_hit' AND data LIKE ?").all(OWNER,'%'+entityId+'%');
    for(const r of rows){let d={};try{d=JSON.parse(r.data)||{};}catch{d={};}if(d.rule_id===entityId)d.rule_id='';for(const k of Object.keys(d))if(typeof d[k]==='string'&&d[k].includes(entityId))d[k]=d[k].split(entityId).join('');
     d.important=false;if(d.emoji==='⭐'||(e.data&&e.data.emoji&&d.emoji===e.data.emoji))d.emoji='';d.rule_names=String(d.rule_names||'').split(', ').filter(n=>n&&n!==e.title).join(', ');
     this.db.prepare('UPDATE entities SET data=?,revision=revision+1,updated_at=? WHERE id=?').run(JSON.stringify(d),at,r.id);}}
   if(e.kind==='fin_tx'&&Number(e.data&&e.data.reserve_part)>0){for(const m of this.list({kind:'fin_reserve_move',limit:500}))if(m.data&&m.data.income_id===entityId){try{this.deleteEntity(m.id);}catch{/* ja saiu */}}}
   if(e.kind==='user_page'){
     const pages=this.list({kind:'user_page',limit:500}),byParent=new Map();for(const p of pages){const parent=p.data?.parent_id||'';if(!byParent.has(parent))byParent.set(parent,[]);byParent.get(parent).push(p);}
     const ordered=[],seen=new Set();const walk=id=>{for(const child of byParent.get(id)||[]){if(seen.has(child.id))continue;seen.add(child.id);walk(child.id);ordered.push(child);}};walk(entityId);ordered.push(e);
     const ids=new Set(ordered.map(x=>x.id)),all=this.list({limit:500});
     // 08/11/2026 (Pedro: "isso nao tem nada a ver"): pagina citada so DENTRO DO CONTEUDO de outra pagina (cartao no Quadro,
     // link de pagina, mencao) nao trava a exclusao: o cartao/link sai dessa outra pagina depois. Vinculo fora do conteudo continua travando.
     const inBlocksOnly=(other,id)=>{if(other.kind!=='user_page')return false;const d={...(other.data||{})};delete d.blocks_json;return !JSON.stringify(d).includes(id)&&String(other.data?.blocks_json||'').includes(id);};
     const tidy=new Set();
     for(const target of ordered){for(const other of all){if(ids.has(other.id))continue;if(JSON.stringify(other.data||{}).includes(target.id)&&inBlocksOnly(other,target.id)){tidy.add(other.id);continue;}if(JSON.stringify(other.data||{}).includes(target.id))throw new AppError('ENTITY_IN_USE','A página “'+target.title+'” ainda é usada por “'+other.title+'”. Remova ou altere esse vínculo antes de excluir.',409);}const links=this.db.prepare("SELECT * FROM relations WHERE (from_type='entity' AND from_id=?) OR (to_type='entity' AND to_id=?)").all(target.id,target.id);for(const link of links){const other=(link.from_type==='entity'&&link.from_id===target.id)?link.to_id:link.from_id;if(!ids.has(other))throw new AppError('ENTITY_IN_USE','A página “'+target.title+'” possui vínculo com outro registro. Remova esse vínculo antes de excluir.',409);}}
     const removed=this.s.tx(()=>{for(const target of ordered){this.db.prepare("DELETE FROM relations WHERE (from_type='entity' AND from_id=?) OR (to_type='entity' AND to_id=?)").run(target.id,target.id);this.db.prepare('DELETE FROM observations WHERE monitor_id=?').run(target.id);this.db.prepare('DELETE FROM jobs WHERE entity_id=?').run(target.id);this.db.prepare('DELETE FROM attachments WHERE entity_id=?').run(target.id);this.db.prepare('DELETE FROM notifications WHERE entity_id=?').run(target.id);this.db.prepare('DELETE FROM events WHERE entity_type=? AND entity_id=?').run('entity',target.id);this.db.prepare('DELETE FROM annotations WHERE entity_type=? AND entity_id=?').run('entity',target.id);this.db.prepare('DELETE FROM entity_versions WHERE entity_id=?').run(target.id);this.db.prepare('DELETE FROM entities WHERE id=? AND owner=?').run(target.id,OWNER);this.s.audit('workspace.deleted',target.id);}return {ok:true,id:entityId,title:e.title,kind:e.kind,deleted_ids:ordered.map(x=>x.id),deleted_total:ordered.length};});
     // cartoes/links/mencoes das paginas apagadas saem das outras paginas (cartao de copia cuja ORIGINAL sumiu fica, sem sincronizar)
     for(const pid of tidy){try{const pg=this.get(pid);let bs=JSON.parse(String(pg.data?.blocks_json||'[]'));if(!Array.isArray(bs))continue;let changed=false;
       bs=bs.filter(b=>{const d=b&&b.data||{};if(b&&b.type==='page_link'&&(ids.has(String(d.page_id||''))||ids.has(String(d.copy_id||'')))){if(d.synced&&ids.has(String(d.page_id||''))&&d.copy_id&&!ids.has(String(d.copy_id))){return true;}changed=true;return false;}return true;})
         .map(b=>{const d=b&&b.data;if(!d)return b;let nd=d;if(d.source_id&&ids.has(String(d.source_id))){nd={...nd,source_id:'',synced:false,page_id:nd.copy_id||nd.page_id};changed=true;}
           const g=d.board;if(g&&Array.isArray(g.mentions)&&g.mentions.some(m=>ids.has(String(m&&m.id)))){nd={...nd,board:{...g,mentions:g.mentions.filter(m=>!ids.has(String(m&&m.id)))}};changed=true;}return nd===d?b:{...b,data:nd};});
       if(changed)this.save({id:pg.id,revision:pg.revision,data:{...pg.data,blocks_json:JSON.stringify(bs)}},pg.id);}catch{/* a pagina apagada ja saiu; o resto e arrumacao */}}
     return removed;
   }
   const token='%'+entityId+'%';
   const dependent=this.db.prepare("SELECT id,title,kind FROM entities WHERE id<>? AND data LIKE ? LIMIT 1").get(entityId,token);
   if(dependent)throw new AppError('ENTITY_IN_USE','Este registro ainda é usado por “'+dependent.title+'”. Remova ou altere esse vínculo antes de excluir.',409);
   const linked=this.db.prepare("SELECT id FROM relations WHERE (from_type='entity' AND from_id=?) OR (to_type='entity' AND to_id=?) LIMIT 1").get(entityId,entityId);
   if(linked)throw new AppError('ENTITY_IN_USE','Este registro possui vínculos. Remova os vínculos antes de excluir.',409);
   return this.s.tx(()=>{
     this.db.prepare('DELETE FROM observations WHERE monitor_id=?').run(entityId);
     this.db.prepare('DELETE FROM jobs WHERE entity_id=?').run(entityId);
     // 14/11/2026 (Pedro: "capa desapareceu"): excluir uma pagina nao leva junto o arquivo que outra pagina ainda usa (capa de copia/duplicata)
     this.db.prepare("DELETE FROM attachments WHERE entity_id=? AND name NOT LIKE 'capa.%' AND NOT EXISTS (SELECT 1 FROM entities e WHERE e.id!=? AND instr(e.data,attachments.id)>0)").run(entityId,entityId);
     this.db.prepare('DELETE FROM notifications WHERE entity_id=?').run(entityId);
     this.db.prepare('DELETE FROM events WHERE entity_type=? AND entity_id=?').run('entity',entityId);
     this.db.prepare('DELETE FROM annotations WHERE entity_type=? AND entity_id=?').run('entity',entityId);
     this.db.prepare('DELETE FROM entity_versions WHERE entity_id=?').run(entityId);
     this.db.prepare('DELETE FROM entities WHERE id=? AND owner=?').run(entityId,OWNER);
     this.s.audit('workspace.deleted',entityId);return {ok:true,id:entityId,title:e.title,kind:e.kind,deleted_ids:[entityId],deleted_total:1};
   });
  }
 /** 08/11/2026 (Pedro: "as paginas guardam versoes"): o historico nao cresce sem fim. Fica: as 200 mais recentes e, das
  * mais antigas, a ultima de cada dia dos ultimos 90 dias. O resto sai. */
 pruneVersions(entityId,keep=200,days=90){
  const rows=this.db.prepare('SELECT id,created_at FROM entity_versions WHERE entity_id=? ORDER BY revision DESC').all(entityId);if(rows.length<=keep)return 0;
  const limit=Date.now()-days*86400000,seenDay=new Set(),drop=[];
  for(const r of rows.slice(keep)){const t=Date.parse(r.created_at),day=String(r.created_at||'').slice(0,10);if(Number.isFinite(t)&&t>=limit&&!seenDay.has(day)){seenDay.add(day);continue;}drop.push(r.id);}
  const del=this.db.prepare('DELETE FROM entity_versions WHERE id=?');for(const x of drop)del.run(x);return drop.length;
 }
 versions(entityId){this.get(entityId);return this.db.prepare('SELECT * FROM entity_versions WHERE entity_id=? ORDER BY revision DESC').all(entityId).map(r=>({...r,snapshot:JSON.parse(r.snapshot)}));}
 reference(type,key){if(type==='entity')return this.get(key);if(type==='note')return this.s.note(key);if(type==='task')return this.s.task(key);if(type==='message')return this.s.message(key);throw new AppError('BAD_REFERENCE','Tipo de vínculo inválido.');}
 link(b){const a=this.reference(b.from_type,b.from_id),z=this.reference(b.to_type,b.to_id);if(b.from_type===b.to_type&&b.from_id===b.to_id)throw new AppError('SELF_LINK','Não vincule o registro a ele mesmo.');const kind=cleanText(b.kind||'related','Relação',80);rejectSecrets(kind);this.db.prepare('INSERT OR IGNORE INTO relations VALUES(?,?,?,?,?,?,?)').run(id(),b.from_type,a.id,b.to_type,z.id,kind,now());return this.links(b.from_type,a.id);}
 links(type,key){this.reference(type,key);return this.db.prepare('SELECT * FROM relations WHERE (from_type=? AND from_id=?) OR (to_type=? AND to_id=?) ORDER BY created_at DESC').all(type,key,type,key);}
 timeline({area='',limit=100,offset=0}={}){
   if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0)throw new AppError('BAD_PAGE','Paginação inválida.');
   const query=`SELECT * FROM (
    SELECT id,entity_type,entity_id,event,area,summary,created_at FROM events
    UNION ALL SELECT v.id,'note',n.id,'version',n.area,n.title,v.created_at FROM note_versions v JOIN notes n ON n.id=v.note_id
    UNION ALL SELECT v.id,'task',t.id,'version',t.area,t.title,v.created_at FROM task_versions v JOIN tasks t ON t.id=v.task_id
    UNION ALL SELECT c.id,'checkpoint',c.id,c.reason,'Sofia OS',c.topic,c.created_at FROM checkpoints c
   ) WHERE (?='' OR area=?) ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`;
   return this.db.prepare(query).all(area,area,limit,offset);
 }
 notify(category,title,body,entityId,importance='info',dedup=null){this.db.prepare('INSERT OR IGNORE INTO notifications VALUES(?,?,?,?,?,?,?, ?,?)').run(id(),category,title,body,entityId||null,importance,'unread',dedup,now());}
 // 0.3.146: aviso apagado vira 'dismissed' (nao DELETE). Com o INSERT OR IGNORE por dedup,
 // apagar a linha deixava o mesmo aviso ser criado de novo e "voltar". Apagar so remove o
 // aviso, nunca o compromisso, tarefa ou capsula de origem.
 notifications(){return this.db.prepare("SELECT n.*,COALESCE(e.area,'Geral') AS area FROM notifications n LEFT JOIN entities e ON e.id=n.entity_id WHERE n.state!='dismissed' ORDER BY n.created_at DESC,n.rowid DESC LIMIT 300").all();}
 noticePage(offset=0,limit=100){offset=Math.max(0,Number(offset)||0);const items=this.db.prepare("SELECT n.*,COALESCE(e.area,'Geral') AS area FROM notifications n LEFT JOIN entities e ON e.id=n.entity_id WHERE n.state!='dismissed' ORDER BY n.created_at DESC,n.rowid DESC LIMIT ? OFFSET ?").all(limit+1,offset);const unread=this.db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE state='unread'").get().c;return {items:items.slice(0,limit),next_offset:items.length>limit?offset+limit:null,unread:Number(unread)||0};}
 markRead(key){this.db.prepare("UPDATE notifications SET state='read' WHERE id=? AND state='unread'").run(key);return {ok:true};}
 markAllRead(){const r=this.db.prepare("UPDATE notifications SET state='read' WHERE state='unread'").run();return {ok:true,updated:Number(r.changes)||0};}
 clearNotification(key){const r=key==='all'?this.db.prepare("UPDATE notifications SET state='dismissed' WHERE state!='dismissed'").run():this.db.prepare("UPDATE notifications SET state='dismissed' WHERE id=?").run(key);return {ok:true,removed:Number(r.changes)||0};}
 syncJob(e){const active=e.state==='active'&&(e.kind==='routine'||e.data.method==='json');this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,0) ON CONFLICT(entity_id,kind) DO UPDATE SET state=excluded.state,next_at=CASE WHEN jobs.state<>excluded.state THEN excluded.next_at ELSE jobs.next_at END,interval_minutes=excluded.interval_minutes').run(id(),e.id,e.kind,active?'active':'paused',active?now():null,null,null,e.kind==='monitor'?e.data.interval_minutes:1);}
 observations(key){if(this.get(key).kind!=='monitor')throw new AppError('BAD_KIND','Não é um monitor.');return this.db.prepare('SELECT * FROM observations WHERE monitor_id=? ORDER BY observed_at ASC,rowid ASC').all(key);}
 observe(key,b){const mon=this.get(key);if(mon.kind!=='monitor')throw new AppError('BAD_KIND','Não é um monitor.');
   if(mon.data.method==='product'&&mon.state!=='active')throw new AppError('MONITOR_PAUSED','Acompanhamento pausado; leitura descartada.',409);
   const price=Number(b.price),shipping=Number(b.shipping??0);if(!Number.isFinite(price)||price<=0||price>1e8||!Number.isFinite(shipping)||shipping<0||shipping>1e8)throw new AppError('BAD_PRICE','Informe preço positivo e frete não negativo.');
   if(b.variant!==mon.data.variant||b.currency!==mon.data.currency)throw new AppError('VARIANT_MISMATCH','A moeda ou variante não corresponde ao monitor. Observação recusada.');
   const source=cleanText(b.source,'Fonte',1000),when=b.observed_at?dateTime(b.observed_at):now();rejectSecrets(source);
   if(Date.parse(when)>Date.now()+60000)throw new AppError('FUTURE_OBSERVATION','Uma observação não pode vir do futuro.');
   let mlPin=null; if(b.source_identity){mlPin=mlIdentity.identity(b.source_identity);const sources=[mon.data.preferred_url,...String(mon.data.source_urls||'').split('\n')];if(!sources.includes(source)||!mlIdentity.isML(source))throw new AppError('SOURCE_REMOVED','A fonte não pertence ao acompanhamento.');const oldPin=mlIdentity.pins(mon.data.source_identities)[source];if(oldPin&&(oldPin.itemId!==mlPin.itemId||oldPin.sellerId!==mlPin.sellerId))throw new AppError('SELLER_MISMATCH','Não misturar ofertas no histórico.',409);}
   const previous=this.observations(key),cents=Math.round(price*100),freight=Math.round(shipping*100),total=cents+freight,sourceKey=b.source_key?cleanText(b.source_key,'ID da observação',160):null;
   const duplicate=sourceKey&&this.db.prepare('SELECT * FROM observations WHERE monitor_id=? AND source_key=?').get(key,sourceKey);if(duplicate)return {...duplicate,replayed:true};
   return this.s.tx(()=>{if(mlPin){const data={...mon.data,source_identities:JSON.stringify({...mlIdentity.pins(mon.data.source_identities),[source]:mlPin})};this.db.prepare('UPDATE entities SET data=?,revision=revision+1,updated_at=? WHERE id=? AND owner=?').run(JSON.stringify(data),now(),key,OWNER);}
     const oid=id();this.db.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(oid,key,cents,freight,total,b.currency,b.variant,source,when,now(),sourceKey);
     const history=previous.filter(p=>p.observed_at<=when),latest=history.filter(p=>p.source===source).at(-1),min=history.length?Math.min(...history.map(x=>x.total_cents)):null;
     const reasons=[];if(mon.data.target_price!==''&&total<=Math.round(mon.data.target_price*100))reasons.push('atingiu o preço-alvo');
     if(latest&&mon.data.drop_percent!==''&&total<latest.total_cents&&(latest.total_cents-total)/latest.total_cents*100>=mon.data.drop_percent)reasons.push('atingiu a queda percentual');
     if(mon.data.new_low&&min!==null&&total<min)reasons.push('menor total desde o início das suas observações');
     if(reasons.length&&(!previous.length||when>=previous.at(-1).observed_at)&&(!latest||latest.total_cents!==total))this.notify('price',mon.title+' — oportunidade',reasons.join('; ')+(mlPin?'. Preço do produto, sem frete. Fonte: ':'. Total inclui o frete informado. Fonte: ')+source,key,'opportunity',key+':'+total+':'+when.slice(0,10));
     this.event('entity',key,'observation',mon.area,'Observação de preço registrada');return this.db.prepare('SELECT * FROM observations WHERE id=?').get(oid);
   });
 }
 recipeFragment(key,text){const e=this.get(key);if(e.kind!=='recipe_session'||e.state!=='collecting')throw new AppError('NOT_COLLECTING','Abra uma sessão de receita em coleta.');const value=cleanText(text,'Fragmento',6000);const fragments=e.data.fragments+(e.data.fragments?'\n\n':'')+'['+now()+'] '+value;return this.save({...e,data:{...e.data,fragments}},e.id);}
 finishRecipeSession(key){const e=this.get(key);if(e.kind!=='recipe_session')throw new AppError('BAD_KIND','Não é uma sessão.');return this.save({...e,state:'questions',data:{...e.data,questions:e.data.questions||'Confira ingredientes/quantidades, preparo, tempo, temperatura quando aplicável e rendimento. Não completei nenhum dado ausente automaticamente.'}},key);}
 recipeToShopping(key){const e=this.get(key);if(e.kind!=='recipe')throw new AppError('BAD_KIND','Selecione uma receita.');const lines=[...new Set(e.data.ingredients.split(/\r?\n/).map(s=>s.trim()).filter(Boolean))];if(!lines.length)throw new AppError('NO_INGREDIENTS','A receita ainda não tem ingredientes.');if(lines.length>80)throw new AppError('TOO_MANY','Use até 80 ingredientes.');const existing=this.list({kind:'shopping_item',limit:500});const created=[];
   for(const line of lines){if(existing.some(x=>x.data.recipe_id===key&&x.title===line&&['needed','unavailable'].includes(x.state)))continue;created.push(this.save({kind:'shopping_item',title:line,area:e.area,data:{list:'market',recipe_id:key},tags:e.tags,source_id:e.source_id,privacy:e.privacy}));}
   return {created,notice:'Lista gerada das quantidades informadas. Confira o que já tem em casa; nenhum estoque foi presumido.'};
 }
 checkout(key){const e=this.get(key);if(e.kind!=='checkout')throw new AppError('BAD_KIND','Selecione uma saída.');const a=(e.data.items||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),b=(e.data.returned_items||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);return {original:a,returned:b,pending_confirmation:a.filter(x=>!b.some(y=>normalize(y)===normalize(x))),note:'Itens não confirmados não são classificados automaticamente como perdidos.'};}
 attach(key,{name,mime,base64}){this.get(key);name=cleanText(name,'Nome',160);if(/[\\/]/.test(name))throw new AppError('BAD_NAME','Use só o nome do arquivo.');mime=attachmentMime(mime);/* 07/11/2026 (Pedro: arrastar qualquer arquivo para a Pagina): qualquer tipo; os que o navegador executaria (HTML, SVG, script) ficam guardados como arquivo comum */if(typeof base64!=='string'||base64.length>Math.ceil(ATTACH_MAX/3)*4+8||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new AppError('BAD_ATTACHMENT','Arquivo inválido ou maior que 25 MB.');let bytes=Buffer.from(base64,'base64');if(!bytes.length||bytes.length>ATTACH_MAX)throw new AppError('BAD_ATTACHMENT','Use arquivo de 1 byte a 25 MB.');
   // 0.3.200: capa de pagina (JPEG largo) e reduzida para 1600 px: de 1 a 2 MB vira algo em torno de 150 a 400 KB
   if(mime==='image/jpeg'&&/^capa\./.test(name)&&this.get(key).kind==='user_page'){const small=require('../services/thumb').shrinkJpeg(bytes);if(small)bytes=small;}
   const total=(()=>{try{return this.db.prepare('SELECT COALESCE(SUM(bytes),0) AS n FROM attachments WHERE drive_id IS NULL').get().n;}catch{return this.db.prepare('SELECT COALESCE(SUM(bytes),0) AS n FROM attachments').get().n;}})();if(total+bytes.length>LOCAL_ATTACH_MAX)throw new AppError('MEDIA_LIMIT','O espaço de anexos ainda não enviados ao Google Drive está cheio (200 MB). Conecte o Google Drive em Perfil › Conexões ou aguarde o envio dos anexos.');
   const a=id();this.db.prepare('INSERT INTO attachments(id,entity_id,name,mime,bytes,sha256,blob,created_at) VALUES(?,?,?,?,?,?,?,?)').run(a,key,name,mime,bytes.length,crypto.createHash('sha256').update(bytes).digest('hex'),bytes,now());this.event('entity',key,'attachment',this.get(key).area,'Original anexado localmente');return this.attachmentList(key).find(x=>x.id===a);
 }
 attachmentList(key){this.get(key);return this.db.prepare('SELECT id,entity_id,name,mime,bytes,sha256,created_at FROM attachments WHERE entity_id=? ORDER BY created_at').all(key);}
 attachment(key){const a=this.db.prepare('SELECT * FROM attachments WHERE id=?').get(key);if(!a)throw new AppError('NOT_FOUND','Anexo não encontrado.',404);return a;}
 scopeCatalog(){
   const entities=this.list({limit:500}),tasks=this.s.tasks();
   const scopes=[];const entityRef=e=>({id:e.id,record_type:'entity',kind:e.kind,title:e.title,state:e.state});const taskRef=t=>({id:t.id,record_type:'task',kind:'task',title:t.title,state:t.state});
   const active=e=>!['archived','cancelled'].includes(e.state);const activeTask=t=>!['done','cancelled'].includes(t.state);
   const add=(scope_id,label,category,members,meta={})=>{const unique=[];const seen=new Set();for(const m of members){if(!m||seen.has(m.id))continue;seen.add(m.id);unique.push(m);}scopes.push({scope_id,label,category,count:unique.length,members:unique,...meta});};
   add('agenda','Agenda','system',entities.filter(e=>['commitment','reminder'].includes(e.kind)&&e.state!=='archived').map(entityRef),{ui_target:'commitments'});
   add('commitments','Compromissos','system',entities.filter(e=>e.kind==='commitment'&&e.state!=='archived').map(entityRef),{ui_target:'commitments'});
   add('reminders','Lembretes','system',entities.filter(e=>e.kind==='reminder'&&e.state!=='archived').map(entityRef),{ui_target:'commitments'});
   add('tasks','Tarefas','system',tasks.filter(activeTask).map(taskRef),{ui_target:'tasks'});
   add('priorities','Prioridades','system',tasks.filter(t=>activeTask(t)&&t.priority).map(taskRef),{ui_target:'tasks'});
   const libraryKinds=Object.entries(CATALOG).filter(([,v])=>v.group==='library').map(([k])=>k);add('library','Biblioteca','system',entities.filter(e=>libraryKinds.includes(e.kind)&&active(e)).map(entityRef),{ui_target:'library'});
   const studyKinds=Object.entries(CATALOG).filter(([,v])=>v.group==='study').map(([k])=>k);add('study','Estudos','system',entities.filter(e=>studyKinds.includes(e.kind)&&active(e)).map(entityRef),{ui_target:'study',protected_from_quick_delete:true});
   add('market','Mercado','list',entities.filter(e=>e.kind==='shopping_item'&&e.data.list==='market'&&active(e)).map(entityRef),{ui_target:'lists'});
   add('pharmacy','Farmácia','list',entities.filter(e=>e.kind==='shopping_item'&&e.data.list==='pharmacy'&&active(e)).map(entityRef),{ui_target:'lists'});
   add('purchase','Comprar','list',entities.filter(e=>e.kind==='purchase'&&active(e)).map(entityRef),{ui_target:'lists'});
   add('blackfriday','Black Friday','list',entities.filter(e=>e.kind==='purchase'&&active(e)&&(e.data.occasion==='black-friday'||e.tags.includes('Black Friday'))).map(entityRef),{ui_target:'lists'});
   add('monitors','Monitoramentos','system',entities.filter(e=>e.kind==='monitor'&&active(e)).map(entityRef),{ui_target:'lists'});
   for(const g of entities.filter(e=>e.kind==='purchase_group'&&e.state==='active'))add('purchase-group:'+g.id,g.title,'purchase_group',entities.filter(e=>e.kind==='purchase'&&active(e)&&e.data.purchase_group_id===g.id).map(entityRef),{ui_target:'lists',container_id:g.id});
   for(const c of entities.filter(e=>e.kind==='list_collection'&&e.state==='active'))add('list:'+c.id,c.title,'custom_list',entities.filter(e=>e.kind==='list_item'&&active(e)&&e.data.collection_id===c.id).map(entityRef),{ui_target:'lists',container_id:c.id});
   const pages=entities.filter(e=>e.kind==='user_page'&&e.state==='active');const children=new Map();for(const p of pages){const parent=p.data.parent_id||'';if(!children.has(parent))children.set(parent,[]);children.get(parent).push(p);}const descendants=root=>{const out=[],seen=new Set();const walk=id=>{for(const p of children.get(id)||[]){if(seen.has(p.id))continue;seen.add(p.id);out.push(entityRef(p));walk(p.id);}};walk(root);return out;};for(const p of pages)add('page:'+p.id,p.title,p.data.parent_id?'page':'space',descendants(p.id),{ui_target:'userpage',container_id:p.id});
   const tagMap=new Map();for(const e of entities.filter(active)){for(const tag of e.tags||[]){const n=normalize(tag);if(!n)continue;if(!tagMap.has(n))tagMap.set(n,{label:tag,members:[]});tagMap.get(n).members.push(entityRef(e));}}for(const [n,v] of tagMap)if(v.members.length)add('tag:'+n,v.label,'tag',v.members,{ui_target:null});
   return scopes;
 }
 resolveScope(scopeId){const scope=this.scopeCatalog().find(s=>s.scope_id===scopeId);if(!scope)throw new AppError('SCOPE_NOT_FOUND','Esse grupo ou visão não existe mais.',409);return scope;}
 deleteScope(scopeId,{scope='all',targetIds=[]}={}){
   const resolved=this.resolveScope(scopeId);let members=resolved.members;if(scope==='selected'||scope==='single'){const wanted=new Set((targetIds||[]).map(String));members=members.filter(m=>wanted.has(m.id));if(!members.length&&wanted.size)throw new AppError('SCOPE_TARGET_NOT_FOUND','Os itens escolhidos não pertencem mais a esse grupo.',409);}else if(scope!=='all'&&scope!=='active')throw new AppError('DELETE_SCOPE_REQUIRED','Escopo de exclusão inválido.',409);
   const deleted=this.s.tx(()=>members.map(m=>m.record_type==='task'?this.s.deleteTask(m.id):this.deleteEntity(m.id)));
   return {scope:resolved,deleted};
 }
 removePurchaseGroup(groupId){const group=this.get(groupId);if(group.kind!=='purchase_group')throw new AppError('BAD_KIND','Selecione um grupo de compras.');return this.s.tx(()=>{const items=this.list({kind:'purchase',limit:500}).filter(e=>e.data.purchase_group_id===groupId);for(const e of items)this.save({...e,revision:e.revision,data:{...e.data,purchase_group_id:''}},e.id);const deleted=this.deleteEntity(groupId);return {deleted,detached:items.length};});}
 panorama(){const all=this.list({limit:500}),tasks=this.s.tasks(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const activeTasks=tasks.filter(t=>!['done','cancelled'].includes(t.state));return {today,stats:this.s.stats(),tasks:activeTasks.slice(0,12),priorities:activeTasks.filter(t=>t.priority),today_tasks:activeTasks.filter(t=>t.due_at&&require('../services/scheduler').localISO(new Date(t.due_at))===today),active_flows:all.filter(e=>!['completed','archived','cancelled','purchased','watched','paid_reported','uploaded_reported'].includes(e.state)&&CATALOG[e.kind]?.group==='flow'),lessons:all.filter(e=>e.kind==='lesson'&&['active','paused'].includes(e.state)),notifications:this.notifications().filter(n=>n.state==='unread'),timeline:this.timeline({limit:12}),truncated:all.length===500};}
 context(query,limit=5,{route='private'}={}){const allowed=e=>(route==='shared'?e.privacy==='shared':e.privacy!=='local')&&!(e.kind==='user_page'&&(e.tags||[]).some(t=>t==='sofia-secret-ok-v1'||t==='sofia-lock-v1'));return this.list({limit:500}).filter(e=>allowed(e)&&!['contact','payment','invoice','approval','recipe_session'].includes(e.kind)&&e.state!=='archived').map(e=>({...e,rank:normalize(query).split(/\W+/).filter(t=>t.length>2&&normalize(e.title+' '+e.content+' '+e.tags.join(' ')+' '+JSON.stringify(e.data)).includes(t)).length})).filter(e=>e.rank>0).sort((a,b)=>b.rank-a.rank).slice(0,limit).map(e=>({id:e.id,kind:e.kind,title:e.title,content:e.content,data:e.data,tags:e.tags,area:e.area,privacy:e.privacy}));}
 contextSensitivity(query){const hits=this.context(query,8,{route:'private'});if(hits.some(e=>e.privacy==='private'))return 'private';if(hits.some(e=>e.privacy==='shared'))return 'shared';return 'none';}
}
module.exports={Workspace,AREAS,dateISO,dateTime,tags,url,inlineSafe,attachmentMime};
