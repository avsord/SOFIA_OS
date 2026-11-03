# Sofia OS Android 0.3.24

- Corrige o conflito entre arrastar páginas e puxar para atualizar: o toque na linha bloqueia a atualização desde o início; a rolagem normal permanece separada do arraste.
- Agenda do Início em um único bloco dividido em 50% calendário e 50% compromissos da data selecionada, com rolagem interna dos compromissos.
- Notificações abrem em painel flutuante abaixo do sino, com movimento de cima para baixo e agrupamento por Hoje, Ontem e Últimos 7 dias. Home e Apps continuam usando o mesmo componente.
- Cabeçalhos de Páginas, Agenda e Notificações usam identificação contextual em roxo. Conversa permanece sem essa alteração.
- Mantém os templates, identidade das páginas, logo em alta definição, navegação rápida e menu Ajustes da 0.3.23.

## Atualização e preservação de dados
Pacote `com.avsord.sofiaapp`, versionCode 29, canal `sofia-android-v`, mesma assinatura da 0.3.23. Instalação por cima, sem desinstalar e sem limpar armazenamento.

## Limites registrados, sem prometer sincronização que ainda não existe
O servidor/site v142 NÃO é substituído nesta publicação: seu armazenamento continua temporário e a migração exige backup completo, verificável e persistência. Nenhum dado de produção é apagado ou redefinido.
A ordenação personalizada e a limpeza de avisos no servidor legado continuam locais. Conteúdo e hierarquia usam a API existente. Google Agenda aguarda a publicação segura do backend, configuração OAuth do administrador e autorização da conta. A sincronização total app/site continua pendente e está discriminada na master.
