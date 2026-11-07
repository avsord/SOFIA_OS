'use strict';
const path=require('node:path');const {Store}=require('../memory/store');
const {KeyStore,BackupService}=require('../services/backup');const {SofiaCore}=require('./sofia-core');const {createHandler}=require('./http-handler');const {seed}=require('./seed');const {seed45}=require('./seed45');
const {Workspace}=require('./workspace');const {UsageService}=require('../services/usage');const {AudioService}=require('../services/audio');const {loadPersistedCredentials}=require('../services/credentials');const {seed46}=require('./seed46');const {seed47}=require('./seed47');const {seed48}=require('./seed48');const {seed52}=require('./seed52');const {seed58}=require('./seed58');const {seed59}=require('./seed59');const {seed61}=require('./seed61');const {RoutingService}=require('../services/routing');const {VaultService}=require('../services/vault');const {Scheduler}=require('../services/scheduler');
/** Context indexes accept a compact lookup phrase. The complete user message is
 * still stored and sent to the planner/response model; only retrieval uses this
 * bounded projection so long messages never fail before the AI sees them.
 */
function contextLookup(value){const text=String(value||'').replace(/\s+/g,' ').trim();if(text.length<=500)return text;if(!text)return '';return text.slice(0,340)+' … '+text.slice(-150);}
function createRuntime(config,options={}){
 loadPersistedCredentials(config);
 const store=options.store||new Store(path.join(config.dataDir,'sofia.sqlite'));seed(store);const workspace=new Workspace(store);seed45(store,workspace);seed46(store,workspace);seed47(store,workspace);seed48(store,workspace);seed52(store,workspace);seed58(store,workspace);seed59(store,workspace);seed61(store,workspace);
 let current=store.settings();
 // v133: inicializa o e-mail pessoal a partir do segredo/configuração de ambiente sem publicá-lo no Git/ZIP.
 if(config.loginEmail&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.loginEmail)){const marker=store.db.prepare('SELECT value FROM settings WHERE key=?').get('ownerLoginEmailV133Initialized');if(!marker){if(!current.profileEmail||String(current.profileEmail).toLowerCase()==='sofiaos.core@gmail.com')store.updateSettings({profileEmail:config.loginEmail});store.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('ownerLoginEmailV133Initialized',JSON.stringify(true));current=store.settings();}} /* 07/11/2026 (Pedro: "EMAIL DA SOFIA COMUNICA; 01.PEDRO... E MEU EMAIL DE USUARIO"): o e-mail da Sofia (corporativo, remetente)
    nunca e o e-mail da conta do usuario. Se a conta estiver com ele, passa para o e-mail de usuario definido no servidor. */
 {const corp=new Set(['sofiaos.core@gmail.com',String(config.sofiaEmail||'').trim().toLowerCase()].filter(Boolean)),mine=String(config.userEmail||'').trim().toLowerCase();
  if(mine&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mine)&&!corp.has(mine)&&corp.has(String(current.profileEmail||'').trim().toLowerCase())){store.updateSettings({profileEmail:mine});current=store.settings();console.log('[conta] e-mail do usuario ajustado: o e-mail da Sofia e so remetente');}}
 // Migração personalizada da instalação local: a chave OPENAI_API_KEY existente era a chave do projeto compartilhado/cortesia já usada antes da v44.
 // Isso elimina a tela de primeiro uso sem inventar uma chave privada. Mensagens privadas continuam bloqueadas até o projeto privado ser configurado.
 if(config.apiKey&&!config.privateApiKey&&!config.sharedApiKey&&!current.routingEnabled&&current.legacyRoute==='none'){store.updateSettings({routingEnabled:true,privacyMode:'auto',legacyRoute:'shared',sharedConfirmed:true,sharedBillingAcknowledged:true});current=store.settings();}
 // v139: a presença explícita de OPENAI_PRIVATE_API_KEY no ambiente do servidor é a fonte de verdade
 // para o Filtro Privado online. Isso sincroniza web e app após redeploy sem gravar a chave no banco.
 // Não há fallback silencioso para a chave compartilhada: se a variável privada não existir, o Privado continua bloqueado.
 if(config.privateApiKey||(config.apiKey&&current.legacyRoute==='private')){const updates={};if(!current.routingEnabled)updates.routingEnabled=true;if(!current.privateConfirmed)updates.privateConfirmed=true;if(Object.keys(updates).length){store.updateSettings(updates);current=store.settings();}}
 const vault=new VaultService(store,{secureDir:options.secureDir});const routing=new RoutingService(store,config,options.providerFactory||(options.provider?()=>options.provider:undefined));
 const backups=new BackupService(store,config.backupDir,new KeyStore(options.secureDir));backups.vault=vault;
 if(process.env.SOFIA_PERSISTENT_DIR){const verified=require('../services/history-safety').verifyHistoryBackup(store,backups);console.info('[Sofia] History 056 backup verified; retained records: '+JSON.stringify(verified.states));}
 // Repair legacy shutdown pauses only after retaining a fresh encrypted backup.
 // Failure leaves all records in place and does not prevent the app from opening.
 try{const recovered=require('../services/chat-sync').recoverShutdownConversations(store,()=>backups.create('before-history-recovery'));if(recovered.conversations)console.info('[Sofia] History visibility recovered: '+recovered.conversations+' personal conversations, '+recovered.messages+' existing messages. Message rows unchanged.');}
 catch{console.error('[Sofia] History visibility recovery deferred; backup or transaction failed. Existing records were not replaced.');}
 const usageService=options.usageService||new UsageService(store,config,routing,options.fetchImpl||global.fetch);const audioService=options.audioService||new AudioService(config,options.fetchImpl||global.fetch);const core=new SofiaCore({store,config,workspace,routing,usageService});
 const originalContextPrivacy=core.contextPrivacy.bind(core),originalBuildContext=core.buildContext.bind(core);
 core.contextPrivacy=(conversationId,message,needed)=>originalContextPrivacy(conversationId,contextLookup(message),needed);
 core.buildContext=(user,route,query,settings)=>originalBuildContext(user,route,contextLookup(query||user?.content),settings);
 const scheduler=new Scheduler(workspace,options.schedulerOptions);
 const {GoogleService}=require('../services/google');const google=options.google||new GoogleService(store,workspace,config,{backups,fetchImpl:options.googleFetch,env:options.googleEnv});
 const {StoreConnections}=require('../services/store-connections');const stores=options.stores||new StoreConnections(store,config,{fetchImpl:options.storesFetch,env:options.storesEnv});
 const {PackageTracker}=require('../services/package-tracker');const packages=options.packages||new PackageTracker(workspace,{fetchImpl:options.packagesFetch});
 const {MailWatcher}=require('../services/mail-watch');const mailWatch=options.mailWatch||new MailWatcher(workspace,config,options.mailOptions||{});mailWatch.google=google;
 const runtime={mercadoLivreOptions:options.mercadoLivreOptions,store,backups,core,config,workspace,routing,usageService,audioService,vault,scheduler,mailWatch,packages,google,stores,ownerAuth:options.ownerAuth,accountMailer:options.accountMailer};runtime.handler=createHandler(runtime);return runtime;
}
module.exports={createRuntime,contextLookup};
