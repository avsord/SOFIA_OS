# Sofia OS 0.3.108 — R7, candidato de arquitetura/medição

**Sem aprovação de publicação no atualizador.** VersionCode 113, com.avsord.sofiaapp, mesma assinatura, APK ARM64, R8 mantido. Instalar por cima; não limpar dados.

Novo modo (padrão) usa fila central que cede a toques (800ms de silêncio, tarefas separadas por 50ms) e Activity para suspender efeitos de abas ocultas. O modo Antigo mantém a política da 0.3.107, mas com a mesma instrumentação e correções de ciclo de vida compartilhadas; não é byte a byte o binário antigo.

Perfil → cinco toques no número da versão abre diagnóstico; selecionar Novo/Antigo vale após encerrar o processo e reabrir. Copiar relatório envia apenas contagens/tempos, não conteúdo ou credenciais.

Dados sintéticos pesados são exclusivos de um APK de semente que NÃO é entregue como app do usuário. Critérios de desempenho são medidos nesta rodada; não presumir ausência de travas antes dos resultados e aceite físico. Virtualização e histórico fragmentado são R8; travas reprovadoras são R9.
