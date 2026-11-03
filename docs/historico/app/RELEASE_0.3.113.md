# Sofia OS 0.3.113 — candidato manual

Primeira correção guiada por um relatório limpo do celular do dono (0.3.112, sem o erro de áudio no meio).

1. A pré-montagem das abas em segundo plano agora é fatiada (`startTransition`): o React atende o toque entre as fatias em vez de montar a aba inteira de uma vez (Conversa 385 ms, Agenda 248 ms, Apps 247 ms, com bloqueios de até ~900 ms). Ela só começa depois de 2,5 s sem trocar de aba, e trocar de aba reinicia a espera.
2. O histórico de ~4 MB não é mais regravado quando a resposta de rede é idêntica à já guardada, e gravações comuns têm intervalo mínimo de 30 s (eram 11 em 3 minutos, cada uma com ~200 ms de bloqueio). Apagar dados, apagar conversa e remover registros continuam imediatos. Ao ir para segundo plano o app grava o que estiver pendente.

Pacote com.avsord.sofiaapp, mesma assinatura, ARM64 e R8. Código 118, instalação por cima da 0.3.112. Candidato manual: não publicado no atualizador.
