# Sofia OS Android 0.3.206

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 211. Atualização por cima, sem desinstalar nem limpar dados. A mudança é no servidor (Railway).

- A Sofia repetia a compra da foto anterior quando a foto nova não carregava. Agora a foto anterior só acompanha mensagem SEM foto (o "tá na imagem"); se a foto da mensagem não carregar, ela avisa e pede para reenviar, sem registrar nada.
- Foto da conversa fica 24 horas no servidor antes de ir para o Drive (Sofia OS/Comprovantes): ler a foto e abri-la na conversa não depende do Drive nas primeiras 24 h.
- Trava de compra repetida: a mesma compra (mesmo nome, valor e data) registrada de novo em até 30 minutos não é lançada outra vez — a Sofia avisa que já está registrada. Para lançar uma igual de propósito, diga "registra de novo".
- Cada foto é tratada como uma compra nova.
