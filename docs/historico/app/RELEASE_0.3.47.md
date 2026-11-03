# Sofia OS Android 0.3.47

Base preservada: Sofia OS Android 0.3.46. Esta release mantém Cápsulas, agenda e notificações nativas, anexos, login persistente, filtros, Biblioteca e demais recursos já publicados.

## Correções e melhorias

- Mantém a troca imediata dos menus da base atual, sem regressão para a navegação antiga.
- Conversa volta sempre para a mensagem mais recente ao entrar ou retornar à aba; o botão de ir para o fim continua disponível quando o usuário sobe manualmente.
- Respostas da Sofia disparam atualização imediata dos dados que podem ter sido criados pela conversa: Início/widgets, Agenda, Cápsulas, Tarefas, Apps/registros, Páginas e notificações.
- Capa de página recupera o resultado do seletor de imagens quando o Android recria a Activity; a imagem é preparada com qualidade reduzida para diminuir memória e upload.
- O template “Quadro de tarefas” passa a se chamar **Kanban**.
- O Kanban tem rolagem horizontal própria e confiável no Android.
- Cartões do Kanban podem ser movidos entre colunas segurando e arrastando; a coluna de destino é destacada e o quadro acompanha colunas fora da área visível.
- O gesto de voltar de uma página só começa pela borda esquerda e exige um movimento deliberado; ele fica bloqueado durante interações do Kanban.
- Novo app **Rotinas**, separado de Cápsulas, para hábitos e cuidados recorrentes. Suporta rotinas diárias, semanais ou mensais, horário, período, instrução e pausa.
- Ocorrências de Rotinas são entregues como tarefas usando a estrutura recorrente existente da Sofia; não inventa streak/histórico de conclusão que o servidor ainda não registra.

## Atualização

- package: `com.avsord.sofiaapp`
- versionCode: `52`
- Atualiza por cima da versão instalada e preserva os dados do app.
- Não exige desinstalação.

A publicação só é válida após TypeScript, regressões, build nativo, instalação por cima e descoberta da atualização passarem no CI.
