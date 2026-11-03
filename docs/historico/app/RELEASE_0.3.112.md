# Sofia OS 0.3.112 — candidato manual

Corrige a causa real do "Vamos reabrir a Sofia", confirmada por log do celular: o player de áudio das mensagens de voz da Conversa era liberado quando a aba era escondida e depois usado. O player agora só é criado ao tocar em reproduzir e tem ciclo de vida próprio. Além disso, elimina o beco sem saída: o app se recupera sozinho, mostra o motivo do erro na tela (tipo e nomes de componentes, nunca conteúdo seu) e guarda o último erro para o painel de diagnóstico. Uma aba que já foi vista nunca mais é escondida pelo pager (era o único ciclo de esconder e reaparecer com tela viva, presente só no modo Novo). O carregamento do módulo de cada tela passa a ficar dentro da proteção por tela.

Pacote com.avsord.sofiaapp, mesma assinatura, ARM64 e R8. Código 117, instalação por cima da 0.3.111. Candidato manual: não publicado no atualizador.
