'use strict';
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {makeConfig}=require('./config/runtime');
const {createRuntime}=require('./core/runtime');
const {acquireLock}=require('./core/lock');
const {AppError}=require('./core/util');
const {pruneBackupsSync}=require('./services/backup');
async function startServer(options={}) {
  const root=options.root || path.resolve(__dirname,'..');
  const envFile=path.join(root,'.env');
  if(fs.existsSync(envFile)) {
    // Usa o parser já instalado no projeto. Não regrava nem solicita a chave.
    require('dotenv').config({path:envFile,quiet:true,override:true});
  }
  const config=makeConfig({root,...options.config});
  const release=acquireLock(config.dataDir);
  // Antes de abrir o banco: se o disco estiver cheio demais até para o SQLite
  // abrir (ENOSPC logo na inicialização), apagar backup antigo não precisa de
  // espaço livre nenhum, então consegue liberar espaço primeiro.
  const freedAtBoot=pruneBackupsSync(config.backupDir);
  if(freedAtBoot)console.log('[Sofia] '+freedAtBoot+' backup(s) antigo(s) removido(s) antes de abrir o banco.');
  let runtime,server,timer,stopped=false;
  try {
    runtime=createRuntime(config,options.runtimeOptions);
    const app=options.appFactory?options.appFactory(runtime):require('./app').createApp(runtime);
    const PORT=Number(process.env.PORT)||config.port;
    const HOST=process.env.RAILWAY_ENVIRONMENT||process.env.RAILWAY_PROJECT_ID||process.env.RAILWAY_SERVICE_ID?'0.0.0.0':config.host;
    server=http.createServer(app);server.requestTimeout=120000;server.headersTimeout=15000;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PORT,HOST,resolve);});
    server.on('error',()=>console.error('[Sofia] Falha no servidor HTTP.'));
    runtime.backups.daily();runtime.backups.prune();
    process.on('unhandledRejection', error => console.error('[Sofia] Falha assíncrona ignorada para não derrubar o servidor:', String(error && error.message || error).slice(0, 200)));
    runtime.scheduler.start();
    runtime.mailWatch.start();
    runtime.packages.start();
    runtime.google.start();
    // 0.3.200: capas que sobraram de trocas antigas saem do servidor (e do Drive) - 2 min depois de ligar e a cada 12 h
    {const sweep=async()=>{try{const ws=runtime.core.workspace;ws.cleanupOrphanCovers();await ws.shrinkExistingCovers({isBusy:()=>!!(runtime.google&&runtime.google.offloading)});}catch{/* best-effort */}};setTimeout(sweep,120000).unref();setInterval(sweep,12*3600*1000).unref();}
    timer=setInterval(()=>{if(!runtime.core.busy){runtime.backups.daily();runtime.backups.prune();}},60000);timer.unref();
    const address=server.address(),port=address&&typeof address==='object'?address.port:PORT;
    // 07/11/2026: teste do Drive no Google de verdade, uma vez por versao publicada (resultado no registro: [drive-teste])
    try{require('./services/drive-selftest').scheduleDriveSelfTest(runtime,{dataDir:config.dataDir,port,publicBaseUrl:config.publicBaseUrl});}catch(e){console.log('[drive-teste] nao agendado: '+String(e.message||e).slice(0,120));}
    // 08/11/2026 (Pedro: o mesmo metodo do Drive para o Quadro): teste do Quadro no servidor de verdade, uma vez por versao
    try{require('./services/board-selftest').scheduleBoardSelfTest(runtime,{dataDir:config.dataDir,port,publicBaseUrl:config.publicBaseUrl});}catch(e){console.log('[quadro-teste] nao agendado: '+String(e&&e.message||e).slice(0,160));}
    console.log('Sofia OS online em http://'+HOST+':'+port);
    console.log('Core v138 | Memória em data/sofia.sqlite | painel online protegido por login + endpoints públicos controlados.');
    console.log('Início normal: chave preservada, sem nova colagem. Ctrl+C encerra com segurança.');
    if(!runtime.store.settings().routingEnabled)console.log('Memória e módulos locais disponíveis. A IA ainda não está conectada aos filtros.');
    if(runtime.backups.lastError)console.error('[Sofia] '+runtime.backups.lastError);
  }catch(e) {
    clearInterval(timer);try{runtime?.store.close();}catch{}release();
    if(e.code==='EADDRINUSE')throw new AppError('PORT_IN_USE','A porta está ocupada. Pare somente o servidor antigo da Sofia; não encerrei nenhum processo.',409);
    throw e;
  }
  const stop=async()=>{
    if(stopped)return;stopped=true;clearInterval(timer);runtime.core.shutdown();await runtime.scheduler.stop();runtime.vault.lock();
    server.close();
    // Abort provider work first; do not start background work or retry during shutdown.
    const deadline=Date.now()+10000;
    while(runtime.core.busy && Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
    if(!runtime.core.busy) {
      for(const c of runtime.store.conversations(100000,0).filter(c=>c.state==='active')) {
        if(runtime.store.messages(c.id,1).length)try{runtime.store.checkpoint(c.id,{reason:'shutdown'});}catch{}
      }
      runtime.backups.tryCreate('shutdown');
      runtime.store.close();
    }else console.error('[Sofia] Uma chamada ainda estava encerrando. O banco recuperará a tentativa como interrompida no próximo início.');
    server.closeAllConnections();release();process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal);
    console.log('Sofia encerrada. As mensagens já confirmadas permanecem salvas.');
  };
  const onSignal=()=>{stop().catch(()=>console.error('[Sofia] Falha ao finalizar. O banco local não foi apagado.'));};
  process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
  return {...runtime,server,stop};
}
if(require.main===module)startServer().catch(e=>{console.error('ERRO: '+(e instanceof AppError?e.message:'Não foi possível abrir a Sofia. Execute DIAGNOSTICO_SOFIA.cmd; não envie seu .env.'));process.exitCode=1;});
module.exports={startServer};
