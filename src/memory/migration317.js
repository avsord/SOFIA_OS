'use strict';
/** 0.3.317: coluna planned_due_at em task_details - o horario combinado de uma tarefa arrastada na linha do tempo do
 * Inicio (vazio quando nao foi arrastada). So acrescenta a coluna se faltar; nao muda o user_version, entao o banco
 * continua abrindo numa versao anterior do servidor, se precisar voltar. */
function migrate317(db){
  const has=db.prepare('PRAGMA table_info(task_details)').all().some(x=>x.name==='planned_due_at');
  if(!has)db.exec("ALTER TABLE task_details ADD COLUMN planned_due_at TEXT NOT NULL DEFAULT ''");
}
module.exports={migrate317};
