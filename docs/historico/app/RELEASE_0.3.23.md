# Sofia OS Android 0.3.23

Atualização nativa a partir das alterações 1 a 10 do MD.

- Arraste pela linha inteira, prévia de inserção e saída suave de subpáginas.
- Logo de 1024 px derivado da matriz vetorial; menu Ajustes com engrenagem; Aplicativo e Perfil separados.
- Início com calendário mensal, agenda do dia e análise de preços; sino compartilhado com painel e notificações por área.
- Templates inserem somente conteúdo e preservam nome, ícone, capa e anotações. Exclusão ao segurar e voltar em Apps um nível por vez.
- Mantém a velocidade e o motion da navegação; inicia em Início.

## Compatibilidade e limites desta publicação
O servidor v142 foi mantido sem redeploy porque não tem volume persistente anexado. Nenhum dado de produção foi apagado ou migrado nesta entrega.

No servidor atual, hierarquia e conteúdo continuam sincronizados. A ordem personalizada fica salva neste aparelho; ordenação entre dispositivos/site depende da publicação segura do backend. Notificações mostram os até 300 avisos recentes fornecidos pelo servidor; limpar oculta localmente, enquanto marcar como lida é sincronizado.

Google Agenda está visível em Ajustes, mas aguarda o backend e credenciais do administrador. Nenhuma conta foi conectada. O app passa a usar os endpoints MD quando estiverem disponíveis.

Package com.avsord.sofiaapp; versionCode 28; canal sofia-android-v. Atualização por cima, sem desinstalar nem limpar armazenamento.
