'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { SCHEMA, TABLES: BASE_TABLES } = require('./schema');
const {EXTRA_TABLES,migrate45}=require('./migration45');
const {EXTRA_TABLES_46,migrate46}=require('./migration46');
const {migrate47}=require('./migration47');
const {EXTRA_TABLES_49,migrate49}=require('./migration49');
const {EXTRA_TABLES_82,migrate82}=require('./migration82');
const {migrate85}=require('./migration85');
const {migrate119}=require('./migration119');
const {migrate317}=require('./migration317');
const TABLES_PRE82=[...BASE_TABLES,...EXTRA_TABLES,...EXTRA_TABLES_46,...EXTRA_TABLES_49,'voice_messages'];
const TABLES=[...TABLES_PRE82,...EXTRA_TABLES_82];
const EXTRA_BACKUP_TABLES=['mobile_capsule_doses','md_kv','google_tombstones'];
const { AppError, now, id, cleanText, cleanMessage, rejectSecrets, searchTerms, normalize } = require('../core/util');
const OWNER = 'owner-local';
const DEFAULTS = { privacyMode: 'auto', dailyCallLimit: 50, maxOutputTokens: 1200, routingEnabled: false, privateConfirmed: false, sharedConfirmed: false, sharedBillingAcknowledged: false, legacyRoute: 'none', privateDailyUSD: 0, privateMonthlyUSD: 0, sharedDailyUSD: 0, sharedMonthlyUSD: 0, privateInputPerMillion: 0, privateOutputPerMillion: 0, sharedInputPerMillion: 0, sharedOutputPerMillion: 0, privateModel: '', sharedModel: 'gpt-5.6-terra', sharedDailyTokenCap: 250000, sharedIncentiveDailyTokens: 2500000, sharedUsageAlertPercent: 90, privateUsageAlertPercent: 90, privateUsageTotalUSD: 5, privateUsageTotalUserSet: false, timezone: 'America/Sao_Paulo', developerModeAllowed: true, uiMode: 'user', homeWidgets: ['priorities','tasks','commitments','notifications','study'], userNavWidgets: ['lists','library'], listViews: ['market','pharmacy','purchase','blackfriday','monitor'], libraryViews: ['recipe','recipe_session','music','film','video','reading','source','asset','file'], profileName: 'Pedro Silva', profileEmail: 'sofiaos.core@gmail.com' };
class Store {
  constructor(filename, { recover = true } = {}) {
    this.filename = filename;
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db.function('sofia_normalize',{deterministic:true},value=>normalize(value||''));
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 8) { this.db.close(); throw new AppError('NEWER_DATABASE', 'O banco é de uma versão mais nova. Nada foi migrado.', 409); }
    this.db.exec(SCHEMA);
    migrate45(this.db,filename,version);
    migrate46(this.db,filename,this.db.prepare('PRAGMA user_version').get().user_version);
    migrate47(this.db,filename,this.db.prepare('PRAGMA user_version').get().user_version);
    migrate49(this.db,filename,this.db.prepare('PRAGMA user_version').get().user_version);
    migrate82(this.db,filename,this.db.prepare('PRAGMA user_version').get().user_version);
    migrate85(this.db,filename,this.db.prepare('PRAGMA user_version').get().user_version);
    migrate119(this.db,filename,this.db.prepare('PRAGMA user_version').get().user_version);
    migrate317(this.db);
    this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(entity_id UNINDEXED,owner UNINDEXED,kind UNINDEXED,conversation_id UNINDEXED,title,content,tokenize='unicode61 remove_diacritics 2');`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS voice_messages(message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,mime TEXT NOT NULL,duration_ms INTEGER NOT NULL DEFAULT 0,transcript TEXT NOT NULL,languages_json TEXT NOT NULL DEFAULT '[]',blob BLOB NOT NULL,created_at TEXT NOT NULL) STRICT;`);
    const priorPrivateTotalRow=this.db.prepare('SELECT value FROM settings WHERE key=?').get('privateUsageTotalUSD');
    const priorPrivateTotalUserSetRow=this.db.prepare('SELECT value FROM settings WHERE key=?').get('privateUsageTotalUserSet');
    for (const [key, value] of Object.entries(DEFAULTS)) this.db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run(key, JSON.stringify(value));
    const tasksWidgetMigration=this.db.prepare('SELECT value FROM settings WHERE key=?').get('homeTasksWidgetV100Added');
    if(!tasksWidgetMigration){
      const row=this.db.prepare('SELECT value FROM settings WHERE key=?').get('homeWidgets');let widgets=[];try{widgets=row?JSON.parse(row.value):[];}catch{}
      if(Array.isArray(widgets)&&!widgets.includes('tasks')){const at=Math.max(0,widgets.indexOf('priorities')+1);widgets.splice(at,0,'tasks');this.db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(widgets),'homeWidgets');}
      this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('homeTasksWidgetV100Added',JSON.stringify(true));
    }
    // v78: o valor de US$10 era apenas um default antigo da Sofia. Nesta instalação o usuário informou
    // que carregou US$5 no Privado. Migre só o default antigo; qualquer total já diferente é preservado.
    if(!priorPrivateTotalUserSetRow){
      let oldTotal=null;try{oldTotal=priorPrivateTotalRow?Number(JSON.parse(priorPrivateTotalRow.value)):null;}catch{}
      if(oldTotal===null||oldTotal===10)this.db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(5),'privateUsageTotalUSD');
    }
    if (recover) {
      this.db.prepare("UPDATE attempts SET status='interrupted',error_code='SERVER_RESTARTED' WHERE status='pending'").run();
      this.db.prepare("UPDATE messages SET status='interrupted',error_code='SERVER_RESTARTED' WHERE role='user' AND status='pending'").run();
    }
  }
  tx(fn) { const depth=this._depth||0,sp='nested_'+depth;this._depth=depth+1;this.db.exec(depth?'SAVEPOINT '+sp:'BEGIN IMMEDIATE');try{const result=fn();this.db.exec(depth?'RELEASE '+sp:'COMMIT');return result;}catch(e){this.db.exec(depth?'ROLLBACK TO '+sp:'ROLLBACK');if(depth)this.db.exec('RELEASE '+sp);throw e;}finally{this._depth=depth;} }
  close() { if (this.db.isOpen) { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); this.db.close(); } }
  audit(event, entityId = null) { this.db.prepare('INSERT INTO audit VALUES (?,?,?,?)').run(id(), event, entityId, now()); }
  settings() { return Object.fromEntries(this.db.prepare('SELECT * FROM settings').all().map(r => [r.key, JSON.parse(r.value)])); }
  updateSettings(input) {
    const updates = {};
    if (input.privacyMode !== undefined) {
      if (!['local', 'private', 'shared', 'test', 'auto'].includes(input.privacyMode)) throw new AppError('INVALID_MODE', 'Modo de privacidade inválido.');
      updates.privacyMode = input.privacyMode;
    }
    for (const [k, min, max] of [['dailyCallLimit',1,1000],['maxOutputTokens',128,4000]]) {
      if (input[k] !== undefined) { if (!Number.isInteger(input[k]) || input[k] < min || input[k] > max) throw new AppError('INVALID_LIMIT', `${k}: use um inteiro de ${min} a ${max}.`); updates[k] = input[k]; }
    }
    for(const k of ['routingEnabled','privateConfirmed','sharedConfirmed','sharedBillingAcknowledged'])if(input[k]!==undefined){if(typeof input[k]!=='boolean')throw new AppError('INVALID_SETTING','Confirmação inválida.');updates[k]=input[k];}
    if(input.legacyRoute!==undefined){if(!['none','private','shared'].includes(input.legacyRoute))throw new AppError('INVALID_SETTING','Destino da chave atual inválido.');updates.legacyRoute=input.legacyRoute;}
    for(const k of ['privateDailyUSD','privateMonthlyUSD','sharedDailyUSD','sharedMonthlyUSD','privateInputPerMillion','privateOutputPerMillion','sharedInputPerMillion','sharedOutputPerMillion'])if(input[k]!==undefined){if(typeof input[k]!=='number'||!Number.isFinite(input[k])||input[k]<0||input[k]>10000)throw new AppError('INVALID_BUDGET','Use um valor entre 0 e 10000 USD.');updates[k]=input[k];}
    for(const k of ['privateModel','sharedModel'])if(input[k]!==undefined){if(typeof input[k]!=='string'||!/^[-a-zA-Z0-9._:]{0,100}$/.test(input[k]))throw new AppError('INVALID_MODEL','Nome de modelo inválido.');updates[k]=input[k];}
    if(input.sharedDailyTokenCap!==undefined){if(!Number.isSafeInteger(input.sharedDailyTokenCap)||input.sharedDailyTokenCap<1||input.sharedDailyTokenCap>100000000)throw new AppError('INVALID_LIMIT','Alerta diário de tokens inválido.');updates.sharedDailyTokenCap=input.sharedDailyTokenCap;}
    if(input.sharedIncentiveDailyTokens!==undefined){if(!Number.isSafeInteger(input.sharedIncentiveDailyTokens)||input.sharedIncentiveDailyTokens<1||input.sharedIncentiveDailyTokens>100000000)throw new AppError('INVALID_LIMIT','Cota diária configurada inválida.');updates.sharedIncentiveDailyTokens=input.sharedIncentiveDailyTokens;}
    for(const k of ['sharedUsageAlertPercent','privateUsageAlertPercent'])if(input[k]!==undefined){if(!Number.isFinite(input[k])||input[k]<1||input[k]>100)throw new AppError('INVALID_LIMIT','O alerta percentual precisa ficar entre 1% e 100%.');updates[k]=Math.round(input[k]);}
    if(input.privateUsageTotalUSD!==undefined){if(typeof input.privateUsageTotalUSD!=='number'||!Number.isFinite(input.privateUsageTotalUSD)||input.privateUsageTotalUSD<=0||input.privateUsageTotalUSD>10000)throw new AppError('INVALID_BUDGET','O total do medidor privado precisa ficar entre US$ 0,01 e US$ 10.000.');updates.privateUsageTotalUSD=input.privateUsageTotalUSD;updates.privateUsageTotalUserSet=true;}
    if(input.developerModeAllowed!==undefined){if(typeof input.developerModeAllowed!=='boolean')throw new AppError('INVALID_SETTING','Modo desenvolvedor inválido.');updates.developerModeAllowed=input.developerModeAllowed;}
    if(input.uiMode!==undefined){if(!['user','developer'].includes(input.uiMode))throw new AppError('INVALID_SETTING','Modo de interface inválido.');updates.uiMode=input.uiMode;}
    if(input.homeWidgets!==undefined){if(!Array.isArray(input.homeWidgets)||input.homeWidgets.length>12||input.homeWidgets.some(x=>typeof x!=='string'||x.length>40))throw new AppError('INVALID_SETTING','Widgets inválidos.');updates.homeWidgets=[...new Set(input.homeWidgets)];}
    if(input.userNavWidgets!==undefined){const allowed=new Set(['lists','library']);if(!Array.isArray(input.userNavWidgets)||input.userNavWidgets.some(x=>!allowed.has(x)))throw new AppError('INVALID_SETTING','Widgets de navegação inválidos.');updates.userNavWidgets=[...new Set(input.userNavWidgets)];}
    if(input.listViews!==undefined){const allowed=new Set(['market','pharmacy','purchase','blackfriday','monitor']);if(!Array.isArray(input.listViews)||input.listViews.some(x=>!allowed.has(x)))throw new AppError('INVALID_SETTING','Listas padrão inválidas.');updates.listViews=[...new Set(input.listViews)];}
    if(input.libraryViews!==undefined){if(!Array.isArray(input.libraryViews)||input.libraryViews.length>30||input.libraryViews.some(x=>typeof x!=='string'||x.length>80))throw new AppError('INVALID_SETTING','Categorias da Biblioteca inválidas.');updates.libraryViews=[...new Set(input.libraryViews)];}
    if(input.profileName!==undefined){updates.profileName=cleanText(input.profileName,'Nome do perfil',80);}
    if(input.profileEmail!==undefined){const email=cleanText(input.profileEmail,'E-mail do perfil',160);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('INVALID_EMAIL','Informe um e-mail válido.');updates.profileEmail=email;}

    return this.tx(() => { for (const [k,v] of Object.entries(updates)) this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,JSON.stringify(v)); this.audit('settings.updated'); return this.settings(); });
  }
  conversation(conversationId) {
    const c = this.db.prepare("SELECT * FROM conversations WHERE id=? AND owner=? AND state<>'deleted'").get(conversationId, OWNER);
    if (!c) throw new AppError('NOT_FOUND', 'Conversa não encontrada.', 404);
    return c;
  }
  createConversation(title = 'Chat', channel = 'web') {
    if (!['web','test','whatsapp-simulator','mobile'].includes(channel)) throw new AppError('BAD_CHANNEL','Canal inválido.');
    const c = { id: id(), title: cleanText(title,'Título',100), channel, created_at: now() };
    this.db.prepare("INSERT INTO conversations VALUES (?,?,?,?, 'active',?,?)").run(c.id, OWNER, c.title, channel, c.created_at, c.created_at);
    this.audit('conversation.created',c.id); return this.conversation(c.id);
  }
  conversations(limit = 100, offset = 0) { return this.db.prepare("SELECT * FROM conversations WHERE owner=? AND state<>'deleted' ORDER BY updated_at DESC,rowid DESC LIMIT ? OFFSET ?").all(OWNER, limit, offset); }
  messages(conversationId, limit = 100, before = Number.MAX_SAFE_INTEGER) {
    this.conversation(conversationId);
    return this.db.prepare("SELECT rowid AS sequence,* FROM messages WHERE conversation_id=? AND owner=? AND status<>'deleted' AND rowid<? ORDER BY rowid DESC LIMIT ?").all(conversationId, OWNER, before, limit).reverse();
  }
  message(messageId) {
    const m = this.db.prepare("SELECT rowid AS sequence,* FROM messages WHERE id=? AND owner=? AND status<>'deleted'").get(messageId,OWNER);
    if (!m) throw new AppError('NOT_FOUND','Mensagem não encontrada.',404);
    return m;
  }
  deleteMessage(messageId) {
    const m=this.message(messageId);if(m.status==='pending')throw new AppError('IN_PROGRESS','Espere a resposta terminar antes de apagar esta mensagem.',409);
    return this.tx(()=>{
      this.db.prepare('DELETE FROM voice_messages WHERE message_id=?').run(m.id);
      this.db.prepare('DELETE FROM search_index WHERE entity_id=?').run(m.id);
      this.db.prepare("DELETE FROM annotations WHERE entity_type='message' AND entity_id=?").run(m.id);
      this.db.prepare('DELETE FROM route_decisions WHERE message_id=?').run(m.id);
      this.db.prepare('DELETE FROM routing_log WHERE message_id=?').run(m.id);
      this.db.prepare('DELETE FROM intent_decisions WHERE message_id=?').run(m.id);
      this.db.prepare('DELETE FROM pending_intents WHERE source_message_id=?').run(m.id);
      this.db.prepare("UPDATE messages SET content='',client_id=NULL,status='deleted',error_code=NULL,refs='[]' WHERE id=? AND owner=?").run(m.id,OWNER);
      this.db.prepare('UPDATE checkpoints SET digest_id=NULL WHERE conversation_id=?').run(m.conversation_id);
      this.db.prepare('DELETE FROM digests WHERE conversation_id=?').run(m.conversation_id);
      this.db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(now(),m.conversation_id);
      if(this.db.prepare("SELECT id FROM messages WHERE conversation_id=? AND owner=? AND status<>'deleted' AND role='user' LIMIT 1").get(m.conversation_id,OWNER))this.makeDigest(m.conversation_id);
      this.audit('message.deleted',m.id);return {ok:true,id:m.id,conversation_id:m.conversation_id};
    });
  }
  clearChatHistory() {
    const conversations=this.db.prepare("SELECT id FROM conversations WHERE owner=? AND state<>'deleted' AND channel IN ('web','mobile','test')").all(OWNER);
    return this.tx(()=>{
      let messages=0;
      for(const conv of conversations){
        const ids=this.db.prepare('SELECT id FROM messages WHERE conversation_id=? AND owner=?').all(conv.id,OWNER).map(r=>r.id);messages+=ids.length;
        for(const mid of ids){
          this.db.prepare('DELETE FROM voice_messages WHERE message_id=?').run(mid);
          this.db.prepare('DELETE FROM search_index WHERE entity_id=?').run(mid);
          this.db.prepare("DELETE FROM annotations WHERE entity_type='message' AND entity_id=?").run(mid);
          this.db.prepare('DELETE FROM route_decisions WHERE message_id=?').run(mid);
          this.db.prepare('DELETE FROM routing_log WHERE message_id=?').run(mid);
          this.db.prepare('DELETE FROM intent_decisions WHERE message_id=?').run(mid);
          this.db.prepare('DELETE FROM pending_intents WHERE source_message_id=?').run(mid);
        }
        this.db.prepare('DELETE FROM pending_intents WHERE conversation_id=?').run(conv.id);
        this.db.prepare('DELETE FROM checkpoints WHERE conversation_id=?').run(conv.id);
        this.db.prepare('DELETE FROM digests WHERE conversation_id=?').run(conv.id);
        this.db.prepare("UPDATE messages SET content='',client_id=NULL,status='deleted',error_code=NULL,refs='[]' WHERE conversation_id=? AND owner=?").run(conv.id,OWNER);
        this.db.prepare("UPDATE conversations SET title='Conversa apagada',state='deleted',updated_at=? WHERE id=? AND owner=?").run(now(),conv.id,OWNER);
      }
      this.audit('chat.history.deleted');return {ok:true,conversations:conversations.length,messages};
    });
  }
  privacyOf(type, entityId) { return entityId ? (this.db.prepare('SELECT privacy FROM annotations WHERE entity_type=? AND entity_id=?').get(type,entityId)?.privacy || null) : null; }
  annotate(type, entityId, privacy='private', tags='[]') { if(!['local','private','shared'].includes(privacy))throw new AppError('BAD_PRIVACY','Privacidade inválida.');this.db.prepare("INSERT INTO annotations VALUES(?,?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET privacy=excluded.privacy,tags=excluded.tags").run(type,entityId,typeof tags==='string'?tags:JSON.stringify(tags),privacy); }
  isLocal(type, entityId) { return this.privacyOf(type,entityId)==='local'; }
  markLocal(type, entityId) { this.annotate(type,entityId,'local'); }
  source(sourceId) { if (!sourceId) return null; this.message(sourceId); return sourceId; }
  index(entityId, kind, conversationId, title, content) {
    this.db.prepare('DELETE FROM search_index WHERE entity_id=?').run(entityId);
    this.db.prepare('INSERT INTO search_index VALUES (?,?,?,?,?,?)').run(entityId, OWNER, kind, conversationId || '', title, content);
  }
  search(query, { kind, limit = 12, excludeId = '', conversationId = '', contentOnly = false } = {}) {
    const terms = searchTerms(query);
    if (!terms.length) return [];
    const termsQuery = terms.map(t => '"' + t + '"*').join(' OR ');
    const expression = contentOnly ? 'content : ('+termsQuery+')' : termsQuery;
    const sql = `SELECT entity_id AS id,kind,conversation_id,title,content,bm25(search_index) AS score
      FROM search_index WHERE search_index MATCH ? AND owner=? AND entity_id<>?
      ${kind ? 'AND kind=?' : ''} ${conversationId ? 'AND conversation_id=?' : ''}
      ORDER BY score LIMIT ?`;
    const values = [expression,OWNER,excludeId]; if (kind) values.push(kind); if (conversationId) values.push(conversationId); values.push(limit);
    return this.db.prepare(sql).all(...values);
  }
  userMessage({ conversationId, clientId, message, channel = 'web', retry = false }) {
    return this.tx(() => {
      let existing = this.db.prepare('SELECT * FROM messages WHERE owner=? AND client_id=?').get(OWNER, clientId);
      if (existing) {
        if (existing.content !== message || (conversationId && existing.conversation_id !== conversationId)) throw new AppError('ID_CONFLICT','Esta identificação já pertence a outra mensagem.',409);
        if (existing.status === 'completed') {
          const reply = this.db.prepare("SELECT * FROM messages WHERE reply_to=? AND role='assistant' ORDER BY rowid DESC LIMIT 1").get(existing.id);
          return { message: existing, reply, replay: true };
        }
        if (existing.status === 'pending') throw new AppError('IN_PROGRESS','Esta mensagem ainda está sendo processada. Aguarde.',409);
        if (!retry) throw new AppError('RETRY_REQUIRED','A tentativa anterior não foi concluída. Use Tentar novamente para autorizar uma nova chamada.',409);
        this.db.prepare("UPDATE messages SET status='pending',error_code=NULL WHERE id=?").run(existing.id);
        return { message: this.message(existing.id), replay:false };
      }
      const c = conversationId ? this.conversation(conversationId) : this.createConversation(message.trim().slice(0,70),channel);
      if(['Nova conversa','Chat'].includes(c.title) && !this.db.prepare('SELECT id FROM messages WHERE conversation_id=? LIMIT 1').get(c.id)) {
        c.title=message.trim().replace(/\s+/g,' ').slice(0,70);
        this.db.prepare('UPDATE conversations SET title=? WHERE id=?').run(c.title,c.id);
      }
      const m = { id:id(),conversation_id:c.id,content:message,created_at:now() };
      this.db.prepare("INSERT INTO messages(id,conversation_id,owner,role,content,created_at,client_id,status) VALUES (?,?,?,'user',?,?,?,'pending')").run(m.id,c.id,OWNER,message,m.created_at,clientId);
      this.index(m.id,'user',c.id,c.title,message);
      this.db.prepare("UPDATE conversations SET state='active',updated_at=? WHERE id=?").run(now(),c.id);
      this.audit('message.saved',m.id);
      return { message:this.message(m.id), replay:false };
    });
  }
  beginAttempt(messageId, model, limit) {
    return this.tx(() => {
      // v69: limites locais de chamadas são apenas alertas; nunca bloqueiam uma conversa.
      const a = id(); this.db.prepare("INSERT INTO attempts(id,message_id,owner,created_at,status,model) VALUES (?,?,?,?,'pending',?)").run(a,messageId,OWNER,now(),model); return a;
    });
  }
  complete(messageId, attemptId, result, refs) {
    return this.tx(() => {
      const user = this.message(messageId), r = id();
      this.db.prepare("INSERT INTO messages(id,conversation_id,owner,role,content,created_at,reply_to,refs) VALUES (?,?,?,'assistant',?,?,?,?)").run(r,user.conversation_id,OWNER,result.reply,now(),user.id,JSON.stringify(refs));
      this.index(r,'assistant',user.conversation_id,this.conversation(user.conversation_id).title,result.reply);
      this.db.prepare("UPDATE messages SET status='completed',error_code=NULL WHERE id=?").run(user.id);
      if (attemptId) this.db.prepare("UPDATE attempts SET status='completed',input_tokens=?,output_tokens=?,usage_known=?,request_id=? WHERE id=?").run(result.usage?.input_tokens || 0,result.usage?.output_tokens || 0,result.usage ? 1 : 0,result.requestId || null,attemptId);
      this.db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(now(),user.conversation_id);
      this.audit('reply.saved',r);
      this.makeDigest(user.conversation_id);
      return this.message(r);
    });
  }
  fail(messageId, attemptId, code, usage) {
    this.tx(() => {
      this.db.prepare("UPDATE messages SET status='failed',error_code=? WHERE id=? AND status='pending'").run(code,messageId);
      if (attemptId) this.db.prepare("UPDATE attempts SET status='failed',error_code=?,input_tokens=?,output_tokens=?,usage_known=? WHERE id=? AND status='pending'").run(code,usage?.input_tokens || 0,usage?.output_tokens || 0,usage ? 1 : 0,attemptId);
      this.audit('reply.failed',messageId);
    });
  }
  usage() {
    const day = now().slice(0,10);
    const r = this.db.prepare(`SELECT COUNT(*) AS calls,COALESCE(SUM(input_tokens),0) AS input_tokens,COALESCE(SUM(output_tokens),0) AS output_tokens,COALESCE(SUM(CASE WHEN usage_known=0 THEN 1 ELSE 0 END),0) AS unknown FROM attempts WHERE owner=? AND created_at>=?`).get(OWNER,day);
    return { day, timezone:'UTC', ...r };
  }
  saveVoiceMessage(messageId,{mime='audio/webm',duration_ms=0,transcript='',languages=[],bytes}) {
    const msg=this.message(messageId);
    if(msg.role!=='user')throw new AppError('VOICE_TARGET','Áudio só pode ser associado a uma mensagem do usuário.',409);
    if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes||[]);
    if(!bytes.length||bytes.length>25*1024*1024)throw new AppError('VOICE_SIZE','Áudio inválido ou acima de 25 MB.',413);
    const safeMime=String(mime||'audio/webm').slice(0,120);
    const safeTranscript=cleanMessage(transcript,'Transcrição',true);
    const dur=Number.isSafeInteger(duration_ms)&&duration_ms>=0?duration_ms:0;
    this.db.prepare(`INSERT INTO voice_messages(message_id,mime,duration_ms,transcript,languages_json,blob,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(message_id) DO UPDATE SET mime=excluded.mime,duration_ms=excluded.duration_ms,transcript=excluded.transcript,languages_json=excluded.languages_json,blob=excluded.blob`).run(messageId,safeMime,dur,safeTranscript,JSON.stringify(Array.isArray(languages)?languages:[]),bytes,now());
    this.audit('voice.saved',messageId);
    return this.voiceMessage(messageId,{includeBlob:false});
  }
  voiceMessage(messageId,{includeBlob=true}={}) {
    const cols=includeBlob?'*':'message_id,mime,duration_ms,transcript,languages_json,created_at,length(blob) AS bytes';
    const row=this.db.prepare(`SELECT ${cols} FROM voice_messages WHERE message_id=?`).get(messageId);
    if(!row)return null;
    return {...row,languages:JSON.parse(row.languages_json||'[]')};
  }
  voiceByClientId(clientId){const m=this.db.prepare('SELECT id FROM messages WHERE owner=? AND client_id=?').get(OWNER,clientId);return m?this.voiceMessage(m.id,{includeBlob:false}):null;}
  voiceForMessages(messages){const out=new Map();const q=this.db.prepare('SELECT message_id,mime,duration_ms,transcript,languages_json,created_at,length(blob) AS bytes FROM voice_messages WHERE message_id=?');for(const m of messages){const v=q.get(m.id);if(v)out.set(m.id,{...v,languages:JSON.parse(v.languages_json||'[]')});}return out;}
  notes(state = 'active') { return this.db.prepare('SELECT * FROM notes WHERE owner=? AND state=? ORDER BY pinned DESC,updated_at DESC,rowid DESC').all(OWNER,state); }
  note(noteId) { const n=this.db.prepare('SELECT * FROM notes WHERE id=? AND owner=?').get(noteId,OWNER); if (!n) throw new AppError('NOT_FOUND','Nota não encontrada.',404); return n; }
  saveNote(input, noteId) {
    const kinds=['decision','fact','idea','preference','rule'];
    const kind=input.kind || 'fact'; if (!kinds.includes(kind)) throw new AppError('BAD_KIND','Tipo de memória inválido.');
    const content=cleanText(input.content,'Conteúdo',12000), title=cleanText(input.title,'Título',120), area=cleanText(input.area || 'Geral','Área',80);
    rejectSecrets(content); rejectSecrets(title);
    const source=this.source(input.source_id), pinned=input.pinned ? 1 : 0;
    return this.tx(() => {
      const old=noteId ? this.note(noteId) : null;
      if (old && input.revision!==old.revision) throw new AppError('REVISION_CONFLICT','A nota mudou em outra aba. Atualize antes de editar.',409);
      const n=noteId || id(), revision=old ? old.revision+1 : 1;
      if (old) this.db.prepare('UPDATE notes SET kind=?,title=?,content=?,area=?,source_id=?,pinned=?,revision=?,updated_at=? WHERE id=?').run(kind,title,content,area,source,pinned,revision,now(),n);
      else this.db.prepare('INSERT INTO notes(id,owner,kind,title,content,area,source_id,pinned,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(n,OWNER,kind,title,content,area,source,pinned,now(),now());
      const inherited=this.privacyOf('message',source);if(input.privacy==='local'||inherited==='local')this.annotate('note',n,'local');else if(input.privacy==='shared'||inherited==='shared')this.annotate('note',n,'shared');else if(input.privacy==='private'||inherited==='private')this.annotate('note',n,'private');
      const note=this.note(n);
      this.db.prepare('INSERT INTO note_versions VALUES (?,?,?,?,?)').run(id(),n,revision,JSON.stringify(note),now());
      if(note.state==='active')this.index(n,'note','',title,content); this.audit(old ? 'note.updated' : 'note.created',n); return note;
    });
  }
  archiveNote(noteId, revision) {
    return this.tx(() => { const old=this.note(noteId); if (old.revision!==revision) throw new AppError('REVISION_CONFLICT','A nota mudou. Atualize a lista.',409);
      this.db.prepare("UPDATE notes SET state='archived',revision=revision+1,updated_at=? WHERE id=?").run(now(),noteId);
      const note=this.note(noteId); this.db.prepare('INSERT INTO note_versions VALUES (?,?,?,?,?)').run(id(),noteId,note.revision,JSON.stringify(note),now()); this.db.prepare('DELETE FROM search_index WHERE entity_id=?').run(noteId); this.audit('note.archived',noteId); return note;
    });
  }
  restoreNote(noteId, revision) {
    return this.tx(() => { const old=this.note(noteId);if(old.revision!==revision)throw new AppError('REVISION_CONFLICT','A nota mudou. Atualize a lista.',409);
      this.db.prepare("UPDATE notes SET state='active',revision=revision+1,updated_at=? WHERE id=?").run(now(),noteId);
      const note=this.note(noteId);this.db.prepare('INSERT INTO note_versions VALUES (?,?,?,?,?)').run(id(),noteId,note.revision,JSON.stringify(note),now());this.index(note.id,'note','',note.title,note.content);this.audit('note.restored',noteId);return note;
    });
  }
  noteVersions(noteId) { this.note(noteId); return this.db.prepare('SELECT * FROM note_versions WHERE note_id=? ORDER BY revision DESC').all(noteId); }
  makeDigest(conversationId) {
    const recent=this.messages(conversationId,30).filter(m=>m.role==='user').slice(-6);
    const content=recent.map(m=>`• ${m.content.slice(0,600)}`).join('\n');
    const existing=this.db.prepare('SELECT * FROM digests WHERE conversation_id=? ORDER BY rowid DESC LIMIT 1').get(conversationId);
    if (existing?.content===content) return existing;
    const d=id(); this.db.prepare("INSERT INTO digests VALUES (?,?,?,?, 'extractive-local-v1',?)").run(d,conversationId,content,JSON.stringify(recent.map(m=>m.id)),now());
    return this.db.prepare('SELECT * FROM digests WHERE id=?').get(d);
  }
  digest(conversationId) { this.conversation(conversationId); return this.db.prepare('SELECT * FROM digests WHERE conversation_id=? ORDER BY rowid DESC LIMIT 1').get(conversationId) || null; }
  checkpoint(conversationId, { reason='manual', topic='', next_step='' } = {}) {
    const c=this.conversation(conversationId);
    if(reason==='shutdown') { const last=this.checkpoints(conversationId)[0]; if(last){topic=topic||last.topic;next_step=next_step||last.next_step;} }
    if (this.db.prepare("SELECT id FROM messages WHERE conversation_id=? AND status='pending'").get(conversationId)) throw new AppError('IN_PROGRESS','Espere a resposta terminar antes de pausar.',409);
    topic=cleanText(topic || c.title,'Assunto',500);next_step=cleanText(next_step,'Próximo passo',3000,true);rejectSecrets(topic);rejectSecrets(next_step);
    return this.tx(() => {
      const d=this.makeDigest(conversationId), last=this.messages(conversationId,1)[0], checkpointId=id();
      this.db.prepare('INSERT INTO checkpoints VALUES (?,?,?,?,?,?,?,?,?)').run(checkpointId,conversationId,OWNER,reason,topic,next_step,d.id,last?.id || null,now());
      if(this.messages(conversationId,200).some(m=>this.isLocal('message',m.id)))this.markLocal('checkpoint',checkpointId);
      // A process shutdown saves a checkpoint; it is not a user request to pause.
      if(reason!=='shutdown')this.db.prepare("UPDATE conversations SET state='paused',updated_at=? WHERE id=?").run(now(),conversationId);
      this.audit('checkpoint.created',checkpointId);
      return this.db.prepare('SELECT * FROM checkpoints WHERE id=?').get(checkpointId);
    });
  }
  checkpoints(conversationId) { this.conversation(conversationId); return this.db.prepare('SELECT * FROM checkpoints WHERE conversation_id=? ORDER BY rowid DESC LIMIT 100').all(conversationId); }
  taskView(row){if(!row)return row;let notifications=[];try{notifications=JSON.parse(row.notifications_json||'[]');if(!Array.isArray(notifications))notifications=[];}catch{}const {notifications_json,...rest}=row;return {...rest,description:row.description||'',location:row.location||'',color:row.color||'default',priority_level:row.priority_level||((row.priority)?'important':'none'),notifications,calendar_provider:row.calendar_provider||'local',external_calendar_id:row.external_calendar_id||'',external_event_id:row.external_event_id||'',sync_state:row.sync_state||'local'};}
  tasks() { return this.db.prepare("SELECT t.*,COALESCE(d.description,'') AS description,COALESCE(d.location,'') AS location,COALESCE(d.color,'default') AS color,COALESCE(d.priority_level,CASE WHEN t.priority=1 THEN 'important' ELSE 'none' END) AS priority_level,COALESCE(d.notifications_json,'[]') AS notifications_json,COALESCE(d.calendar_provider,'local') AS calendar_provider,COALESCE(d.external_calendar_id,'') AS external_calendar_id,COALESCE(d.external_event_id,'') AS external_event_id,COALESCE(d.sync_state,'local') AS sync_state,COALESCE(d.planned_due_at,'') AS planned_due_at FROM tasks t LEFT JOIN task_details d ON d.task_id=t.id WHERE t.owner=? ORDER BY t.priority DESC,t.updated_at DESC,t.rowid DESC").all(OWNER).map(r=>this.taskView(r)); }
  task(taskId) { const t=this.db.prepare("SELECT t.*,COALESCE(d.description,'') AS description,COALESCE(d.location,'') AS location,COALESCE(d.color,'default') AS color,COALESCE(d.priority_level,CASE WHEN t.priority=1 THEN 'important' ELSE 'none' END) AS priority_level,COALESCE(d.notifications_json,'[]') AS notifications_json,COALESCE(d.calendar_provider,'local') AS calendar_provider,COALESCE(d.external_calendar_id,'') AS external_calendar_id,COALESCE(d.external_event_id,'') AS external_event_id,COALESCE(d.sync_state,'local') AS sync_state,COALESCE(d.planned_due_at,'') AS planned_due_at FROM tasks t LEFT JOIN task_details d ON d.task_id=t.id WHERE t.id=? AND t.owner=?").get(taskId,OWNER); if (!t) throw new AppError('NOT_FOUND','Tarefa não encontrada.',404); return this.taskView(t); }
  saveTask(input, taskId) {
    const title=cleanText(input.title,'Tarefa',300), area=cleanText(input.area || 'Geral','Área',80), state=input.state || 'todo'; rejectSecrets(title);
    const description=cleanText(input.description ?? '', 'Descrição', 8000, true), location=cleanText(input.location ?? '', 'Local', 300, true);
    const allowedColors=new Set(['default','gray','blue','green','yellow','orange','red','purple','pink']);const color=allowedColors.has(String(input.color||'default'))?String(input.color||'default'):'default';
    const allowedPriorityLevels=new Set(['none','important','medium','light']);const requestedPriorityLevel=input.priority_level===undefined?'':String(input.priority_level||'none');if(requestedPriorityLevel&&!allowedPriorityLevels.has(requestedPriorityLevel))throw new AppError('BAD_PRIORITY','Nível de prioridade inválido.');
    let notifications=Array.isArray(input.notifications)?input.notifications:String(input.notifications||'').split(',').map(x=>x.trim()).filter(Boolean);notifications=[...new Set(notifications.map(x=>cleanText(x,'Notificação',80,true)).filter(Boolean))].slice(0,8);
    if(taskId){let o={};try{o=this.db.prepare('SELECT calendar_provider,external_calendar_id,external_event_id,sync_state FROM task_details WHERE task_id=?').get(taskId)||{};}catch{o={};}input={...input,calendar_provider:input.calendar_provider??o.calendar_provider,external_calendar_id:input.external_calendar_id??o.external_calendar_id,external_event_id:input.external_event_id??o.external_event_id,sync_state:input.sync_state??o.sync_state};}
    const provider=['local','google'].includes(String(input.calendar_provider||'local'))?String(input.calendar_provider||'local'):'local',externalCalendarId=cleanText(input.external_calendar_id??'', 'ID do calendário externo', 300, true),externalEventId=cleanText(input.external_event_id??'', 'ID do evento externo', 300, true),syncState=cleanText(input.sync_state??'local', 'Estado da sincronização', 80, true)||'local';
    if (!['todo','scheduled','pending','doing','waiting','done','cancelled'].includes(state)) throw new AppError('BAD_STATE','Estado de tarefa inválido.');
    let due=null;
    if (input.due_at) { const value=Date.parse(input.due_at); if (!Number.isFinite(value) || !/[zZ]|[+-]\d\d:\d\d$/.test(input.due_at)) throw new AppError('BAD_DATE','Data inválida: informe data, horário e fuso.'); due=new Date(value).toISOString(); }
    const source=this.source(input.source_id);
    return this.tx(() => {
      const old=taskId ? this.task(taskId) : null;
      if (old && input.revision!==old.revision) throw new AppError('REVISION_CONFLICT','A tarefa mudou. Atualize antes de editar.',409);
      const t=taskId || id(), revision=old ? old.revision+1 : 1;
      const priorityLevel=requestedPriorityLevel||(input.priority===true?'important':input.priority===false?'none':old?.priority_level||'none'),priorityFlag=priorityLevel==='none'?0:1;
      if (old) this.db.prepare('UPDATE tasks SET title=?,area=?,state=?,priority=?,due_at=?,original_due_at=?,source_id=?,revision=?,updated_at=? WHERE id=?').run(title,area,state,priorityFlag,due,old.original_due_at || due,source,revision,now(),t);
      else this.db.prepare('INSERT INTO tasks(id,owner,title,area,state,priority,due_at,original_due_at,source_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(t,OWNER,title,area,state,priorityFlag,due,due,source,now(),now());
      this.db.prepare("INSERT INTO task_details(task_id,description,location,color,priority_level,notifications_json,calendar_provider,external_calendar_id,external_event_id,sync_state) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET description=excluded.description,location=excluded.location,color=excluded.color,priority_level=excluded.priority_level,notifications_json=excluded.notifications_json,calendar_provider=excluded.calendar_provider,external_calendar_id=excluded.external_calendar_id,external_event_id=excluded.external_event_id,sync_state=excluded.sync_state").run(t,description,location,color,priorityLevel,JSON.stringify(notifications),provider,externalCalendarId,externalEventId,syncState);
      // 0.3.317 (Pedro): horario combinado de uma tarefa arrastada na linha do tempo do Inicio (timeline_move). Vazio quando
      // nao foi arrastada; qualquer outra edicao limpa. Na virada do dia, a nao feita volta para este horario (app).
      this.db.prepare('UPDATE task_details SET planned_due_at=? WHERE task_id=?').run(input.timeline_move===true?(old?.planned_due_at||old?.due_at||due||''):'',t);
      const inherited=this.privacyOf('message',source);if(input.privacy==='local'||inherited==='local')this.annotate('task',t,'local');else if(input.privacy==='shared'||inherited==='shared')this.annotate('task',t,'shared');else if(input.privacy==='private'||inherited==='private')this.annotate('task',t,'private');
      const task=this.task(t);this.db.prepare('INSERT INTO task_versions VALUES (?,?,?,?,?)').run(id(),t,revision,JSON.stringify(task),now());this.audit(old?'task.updated':'task.created',t);return task;
    });
  }
  taskVersions(taskId) { this.task(taskId); return this.db.prepare('SELECT * FROM task_versions WHERE task_id=? ORDER BY revision DESC').all(taskId); }
  deleteTask(taskId) { const task=this.task(taskId);return this.tx(()=>{this.db.prepare('DELETE FROM annotations WHERE entity_type=? AND entity_id=?').run('task',taskId);this.db.prepare('DELETE FROM task_versions WHERE task_id=?').run(taskId);this.db.prepare('DELETE FROM tasks WHERE id=? AND owner=?').run(taskId,OWNER);this.audit('task.deleted',taskId);return {ok:true,id:taskId,title:task.title,kind:'task'};}); }
  export() {
    return this.tx(() => ({format:'sofia-core-export',schema:6,created_at:now(),tables:Object.fromEntries(TABLES.map(t=>[t,this.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all().map(r=>['attachments','voice_messages'].includes(t)?{...r,blob:Buffer.from(r.blob).toString('base64')}:r)])),extra:this.exportExtra()}));
  }
  /** 0.3.258 (ensaio de restauracao): tabelas criadas pelos servicos que guardam dado da pessoa e ficavam FORA do
   * backup - historico de doses das Capsulas, ordem dos widgets/estado do Drive (md_kv) e eventos do Google ja
   * apagados (sem isso, voltariam depois de restaurar). Senhas/tokens e sessoes continuam fora de proposito. */
  existingTables() { return new Set(this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)); }
  exportExtra() { const have=this.existingTables(); return Object.fromEntries(EXTRA_BACKUP_TABLES.filter(t=>have.has(t)).map(t=>[t,this.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()])); }
  importExtra(extra) {
    if (!extra || typeof extra!=='object') return;
    const have=this.existingTables();
    for (const table of EXTRA_BACKUP_TABLES) {
      const rows=extra[table]; if (!Array.isArray(rows) || !have.has(table)) continue;
      const fields=this.db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
      this.db.prepare(`DELETE FROM ${table}`).run();
      const insert=this.db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`);
      for (const row of rows) { if (!row || typeof row!=='object' || fields.some(k=>!(k in row))) throw new AppError('BAD_BACKUP','Estrutura de backup inválida ('+table+').'); insert.run(...fields.map(k=>row[k])); }
    }
  }
  importSnapshot(snapshot) {
    if (!snapshot || snapshot.format!=='sofia-core-export' || ![1,2,3,4,5,6].includes(snapshot.schema) || !snapshot.tables) throw new AppError('BAD_BACKUP','Formato de backup incompatível.');
    const importTables=snapshot.schema===1?BASE_TABLES:(snapshot.schema===2?[...BASE_TABLES,...EXTRA_TABLES]:(snapshot.schema===3?[...BASE_TABLES,...EXTRA_TABLES,...EXTRA_TABLES_46]:(snapshot.schema===4?TABLES_PRE82:TABLES)));
    for (const table of importTables) if (!Array.isArray(snapshot.tables[table])) throw new AppError('BAD_BACKUP','Backup incompleto.');
    this.tx(() => {
      for (const table of [...TABLES].reverse()) this.db.prepare(`DELETE FROM ${table}`).run();
      this.db.prepare('DELETE FROM search_index').run();
      for (const table of importTables) {
        const fields=this.db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
        const insert=this.db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`);
        for (const sourceRow of snapshot.tables[table]) {
          const row=sourceRow&&typeof sourceRow==='object'?{...sourceRow}:sourceRow;if(table==='task_details'&&row){if(row.priority_level===undefined)row.priority_level='none';if(row.calendar_provider===undefined)row.calendar_provider='local';if(row.external_calendar_id===undefined)row.external_calendar_id='';if(row.external_event_id===undefined)row.external_event_id='';if(row.sync_state===undefined)row.sync_state='local';}
          if (!row || typeof row!=='object' || Object.keys(row).length!==fields.length || fields.some(k=>!(k in row))) throw new AppError('BAD_BACKUP','Estrutura de backup inválida.');
          if ('owner' in row && row.owner!==OWNER) throw new AppError('BAD_BACKUP','Este backup não pertence ao perfil local suportado.');
          if(table==='attachments'){
            if(typeof row.blob!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(row.blob))throw new AppError('BAD_BACKUP','Anexo inválido no backup.');
            const bytes=Buffer.from(row.blob,'base64');if(bytes.length!==row.bytes||require('node:crypto').createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw new AppError('BAD_BACKUP','Anexo do backup não passou na integridade.');
          }
          if(table==='entities'){try{const data=JSON.parse(row.data),tags=JSON.parse(row.tags);if(!data||Array.isArray(data)||typeof data!=='object'||!Array.isArray(tags))throw new Error();}catch{throw new AppError('BAD_BACKUP','Registro estruturado inválido no backup.');}}
          insert.run(...fields.map(k=>['attachments','voice_messages'].includes(table)&&k==='blob'?Buffer.from(row[k],'base64'):row[k]));
        }
      }
      this.importExtra(snapshot.extra);
      for(const [k,v] of Object.entries(DEFAULTS))this.db.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)').run(k,JSON.stringify(v));
      // Rebuild search from original records; search indexes are not a source of truth.
      for (const m of this.db.prepare('SELECT * FROM messages ORDER BY rowid').all()) this.index(m.id,m.role,m.conversation_id,this.conversation(m.conversation_id).title,m.content);
      for (const n of this.notes()) this.index(n.id,'note','',n.title,n.content);
      if (this.db.prepare('PRAGMA foreign_key_check').all().length) throw new AppError('BAD_BACKUP','As relações do backup não passaram na validação.');
      const s=this.settings(); if (!['local','private','shared','test','auto'].includes(s.privacyMode) || !Number.isInteger(s.dailyCallLimit) || s.dailyCallLimit<1 || s.dailyCallLimit>1000 || !Number.isInteger(s.maxOutputTokens) || s.maxOutputTokens<128 || s.maxOutputTokens>4000) throw new AppError('BAD_BACKUP','Configuração do backup inválida.');
      this.audit('backup.restored');
    });
  }
  stats() { return Object.fromEntries(['conversations','messages','notes','checkpoints','tasks'].map(t=>[t,this.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n])); }
}
module.exports={ Store, OWNER, DEFAULTS };
