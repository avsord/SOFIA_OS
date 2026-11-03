# Sofia OS Android 0.3.48

- Toque nos menus com resposta nativa antes da fila de JavaScript; swipe existente preservado.
- Abertura local-first com snapshot criptografado por conta e pré-carga prioritária de dados.
- Kanban simplificado: toque para editar, segure para mover, destino medido e rolagem pelas bordas; preserva cartões e campos.
- Removido o swipe próprio de voltar das páginas. Retorno pelo Android e botão explícito.
- Chat posicionado na última mensagem, sem animação de descida ao entrar.
- Template Coleção renomeado para Formulário, com emoji 📋 e identificador persistente mantido.
- Sino integra notificações do servidor e avisos locais de horários/atrasos, com deduplicação e histórico por conta no aparelho.
- Master completa em `SOFIA_APP/MASTER_0.3.48.md`, incluindo arquitetura, limites, testes e regras de entrega sem cobrança repetida.

Package `com.avsord.sofiaapp`, versionCode 53, canal `sofia-android-v`. Atualização por cima, sem apagar dados. O backend não é reiniciado por esta entrega.

A primeira utilização e dados ainda não baixados continuam dependendo da rede. O histórico de avisos locais do sino é específico deste aparelho; avisos remotos mantêm a sincronização existente. Publicação válida somente depois das verificações do fluxo de entrega.
