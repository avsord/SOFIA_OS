# Sofia OS 0.3.74 — fade unificado e abertura mais rápida

Correções para instalar por cima:
- Fundo inteiro e marca S saem JUNTOS no mesmo fade nativo. Não há transição do ícone isolada por cima da Home.
- O fade começa assim que a Home está desenhada e dura 110 ms. Removida espera extra de 240 ms antes da transição; fallback do sistema remove o splash em até 170 ms.
- Movimento vetorial nativo do S encurtado para 180 ms.
- Desfeita a montagem pesada das cinco abas por trás da tela de abertura, que aumentava consideravelmente o tempo de splash na 0.3.73.
- Abas secundárias são mantidas em memória após abertas e inicializadas em fatias ociosas **depois** que a Home aparece; toques mantêm prioridade. Conteúdo disponível em cache local é apresentado sem aguardar a rede.
- A Home agora pode ser revelada quando sua interface e o menu estão prontos, sem exigir respostas da Agenda/Tarefas em rede. Itens não salvos precisam de sincronização real; a interface nunca deve fabricar dados.
- O banco de dados, autenticação, assinatura e a sincronização de Cápsulas seguem os mesmos. package com.avsord.sofiaapp, versionCode 79, 0.3.74.

Esta compilação é candidato manual. Verificar o fade em tela real e transições entre seis abas no aparelho antes de lançar publicamente.
