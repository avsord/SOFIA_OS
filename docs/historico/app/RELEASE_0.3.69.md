# Sofia OS Android 0.3.69 — Candidato para atualizar no celular

## Mudanças executadas
- Animação do S mais perceptível (opacidade 0.06 → 1.0, 260 ms), com duração de ícone declarada no tema Android 12; não retém a splash até a animação terminar.
- Reidratação de Home, tarefas/Agenda do snapshot e foto local do proprietário em paralelo. A primeira Home autenticada só aparece após o resultado local da foto, sem depender da rede.
- Menus sem montagem automática de cinco telas ocultas. Telas abertas continuam montadas para preservar estado e scroll; código de módulos continua aquecido em fatias ociosas.
- Sino: “Marcar tudo como lido” na mesma cor neutra que “Limpar todas”, lado a lado e sem quebra de linha; marcação individual também neutra.
- Mantém sincronização de Cápsulas com API do servidor, não cria registros locais independentes.

## Compatibilidade
com.avsord.sofiaapp, 0.3.69, versionCode 74. Preserva criptografia, token, dados e assinatura anterior. A instalação sobre a versão existente deve ser verificada pelo workflow.

## Limitações honestas
Os testes de unidade e validação nativa não substituem medição de tempo no celular real. Cache vazio / primeira conexão precisam do servidor, sem inventar tarefas ou Agenda. Não afirmar desempenho em milissegundos sem instrumentação física. A versão é candidata manual e não entra no atualizador público sem aprovação.
