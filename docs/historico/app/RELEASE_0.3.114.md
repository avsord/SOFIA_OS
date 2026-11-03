# Sofia OS 0.3.114 — candidato manual

Corrige uma regressão da 0.3.113 e mede o que ainda falta.

1. Remove a espera fixa de 2,5 s antes da pré-montagem das abas. No relatório da 0.3.113 as cinco abas foram montadas pelo próprio gesto do usuário (toque ou arrasto) antes de essa espera poder terminar, então cada primeira montagem caiu dentro de um gesto. A pré-montagem fatiada (`startTransition`) continua e agora começa o mais cedo que a fila permite.
2. Medição por dentro das telas, sem mudar comportamento: a montagem da Conversa passa a ser separada em lista (`chat:list`) e campo de digitação (`chat:composer`), e a da Agenda em `agenda:month`, para o relatório mostrar qual parte pesa.
3. Teste do relatório não depende mais do histórico do git.

Pacote com.avsord.sofiaapp, mesma assinatura, ARM64 e R8. Código 119, instalação por cima da 0.3.113. Candidato manual: não publicado no atualizador.
