# Sofia OS Android 0.3.93

Entrega manual solicitada: S branco 50% maior (48dp), anel discreto e fundo roxo da referência. Escala orgânica finita de 0,88 a 1 em 800 ms.

A camada do fade é preparada e renderizada enquanto o splash original ainda está visível. Ao liberar a Home, ela recebe a mesma posição, tamanho e fase da curva do Android. O fundo e a marca saem juntos em uma única camada, sem reiniciar a escala, sem uma cópia criada no último quadro e sem alterar o SurfaceControl do sistema.

Validação do APK exato: testes de comportamento e tipos antes do build; assinatura, instalação por cima, Home autenticada offline, dados preservados, chat, paginação, primeiro toque e limites originais de abertura no emulador. Resultado final na execução e no handoff; aparelho físico não testado nesta sessão.

Package com.avsord.sofiaapp; versionCode 98. Instalar por cima, sem desinstalar ou limpar dados. Sem atualização do backend nem publicação no atualizador.
