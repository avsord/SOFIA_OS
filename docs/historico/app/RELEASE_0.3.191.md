# Sofia OS Android 0.3.191

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 196. Atualização por cima, sem desinstalar nem limpar dados.

- Campo de data e hora sem segunda janela: o calendário abre dentro do próprio formulário, logo abaixo do campo, com animação curta. Antes ele abria numa janela por cima, e o formulário de trás ficava cortado (preso no tamanho que tinha com o teclado). Teclado aberto? Ele fecha primeiro e só então o calendário expande. Só data: tocar no dia já escolhe e fecha. Data e hora: "Confirmar" mostra o valor escolhido. Há "Limpar" (quando permitido) e "Fechar"; o dia de hoje fica marcado.
- Meta ("Até") e aviso do aporte ("Avisar às") passaram para largura cheia, para o calendário não ficar espremido.
- Quando uma janela fecha para outra abrir (menu do ＋, "Sua reserva" → Aportar/Editar/Histórico, detalhes do Saldo → lançamento), a segunda espera a primeira sair, sem duas animando ao mesmo tempo.
