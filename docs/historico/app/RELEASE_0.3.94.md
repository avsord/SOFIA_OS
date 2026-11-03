# Sofia OS Android 0.3.94

Entrega manual solicitada: S 50% maior, branco, anel discreto, fundo roxo e escala orgânica finita. A própria imagem original da splash cresce de 0,88 até 1 em 800ms; o mesmo pai faz a saída em fade sobre a Home preparada, sem troca de S, nova cobertura, SurfaceView animada ou reinício no final.

O vetor da entrada contém a escala inicial: a primeira imagem do sistema já tem o mesmo tamanho que o começo da animação nativa. A marca e o fundo compartilham a alpha do pai. A prontidão da Home não aguarda os 800ms; a curva segue durante o fade e é cancelada apenas na remoção final.

Testes de comportamento/tipos antes do build; verificação de assinatura, instalação por cima, Home offline autenticada sintética, histórico, paginação, primeiro toque e tempos originais no emulador. Resultado final na execução/handoff. Aparelho físico não testado nesta sessão.

Package com.avsord.sofiaapp; versionCode99. Instalar por cima sem limpar dados. Sem backend ou publicação no atualizador.
