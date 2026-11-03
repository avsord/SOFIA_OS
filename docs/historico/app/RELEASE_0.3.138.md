# Sofia OS Android 0.3.138

Atualização automática a partir da 0.3.57.

Consulte o commit e o relatório da execução para as alterações e verificações deste pacote.

Package com.avsord.sofiaapp; versionCode 143. Atualização por cima, sem desinstalar nem limpar dados. O backend não é reiniciado por este fluxo.
- Lojas do Price Tracker (Perfil): nova conexao de lojas, igual a Conta Google. Mercado Livre: entre com a sua conta uma vez; a leitura de precos passa a usar a API oficial (sem pagina, sem verificacao, sem tela "Abra o app"); tokens criptografados, renovacao automatica, Desconectar. AliExpress: leitura pela API oficial com a chave do Sofia (ALIEXPRESS_APP_KEY/SECRET no servidor), sem login da pessoa.
- Servidor: ML_APP_ID / ML_APP_SECRET (aplicativo em developers.mercadolivre.com.br; endereco de retorno = <servidor>/stores/mercadolivre/oauth/callback). Sem as chaves, o card mostra "Aguardando configuracao no servidor" e a leitura segue pelo caminho antigo.
- Conversa: a Sofia deixa de prometer e não fazer ("Localizando a tarefa…", "precisa ser localizada no sistema"). Ela agora recebe os registros recentes COM ID (tarefas, lembretes, compromissos; "a última tarefa que eu criei" é reconhecida), executa pedidos claros de edição sem pedir confirmação desnecessária, entende confirmação curta ("s", "sim", "pode") como ordem para fazer, e qualquer resposta que só anuncie uma ação volta ao planejamento até virar ação de verdade (no máximo 2 tentativas, sem loop).
- Conversa: sem asteriscos crus (**texto**) nas respostas.
- Início: adicionar ou mover o widget de Cápsulas não dá mais "Esta rota do aplicativo não existe" (o app salva a ordem com PATCH e o servidor só aceitava POST; agora aceita os dois).
