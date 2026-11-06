'use strict';
/** 06/11/2026 (Pedro: "tarefa tambem tem inicio e fim e aparece na linha do tempo igual evento"): coluna end_at em
 * task_details - o horario de fim da tarefa (vazio quando nao tem). So acrescenta a coluna se faltar; nao muda o
 * user_version, entao o banco continua abrindo numa versao anterior do servidor, se precisar voltar. */
function migrateTaskEnd(db){
  const has=db.prepare('PRAGMA table_info(task_details)').all().some(x=>x.name==='end_at');
  if(!has)db.exec("ALTER TABLE task_details ADD COLUMN end_at TEXT NOT NULL DEFAULT ''");
}
module.exports={migrateTaskEnd};
