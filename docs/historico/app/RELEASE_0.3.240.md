# Sofia OS Android 0.3.240

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 241. Atualização por cima, sem desinstalar nem limpar dados.

- Início, Meta: parou de piscar. A Meta nascia vazia, entrava no topo quando os dados chegavam e empurrava o resto da tela; ainda mudava a ordem no meio porque "Meta escondida" nascia como "não". Agora o último estado da Meta (números e se foi escondida) fica guardado no pacote pequeno de abertura, e a Meta já vem desenhada no primeiro quadro, sem aumentar o tempo de abertura.
- A leitura de Finanças para atualizar a Meta agora espera o primeiro quadro, como as outras leituras do Início; se os números não mudaram, nada é redesenhado.
- A ordem dos widgets vinda do servidor só é aplicada se for diferente da atual (antes era sempre reaplicada).
- A Meta do Início também atualiza ao voltar para a aba (antes só lia uma vez por abertura).
- Na primeira abertura depois de atualizar ainda não há nada guardado, então a Meta pode entrar uma vez; da segunda em diante já vem pronta.
