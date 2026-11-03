# Sofia OS — Master 0.3.52

**Base:** Android 0.3.51. **Pacote preservado:** `com.avsord.sofiaapp`. **Canal:** `sofia-android-v`.

## Tarefas — Áreas

A organização de Tarefas passa a usar Área como uma propriedade de primeira classe.

- A tela de Tarefas mantém o filtro **Filtrar por área** junto dos filtros existentes.
- O filtro reúne as áreas conhecidas pelo catálogo e também qualquer área já usada nas tarefas do usuário.
- Ao criar uma tarefa com um filtro de área ativo, essa área é usada como padrão no novo registro.
- No editor de criar/editar tarefa, o campo de texto livre de Área foi substituído pelo mesmo padrão de seleção usado na Biblioteca:
  - busca pelas áreas existentes;
  - escolha de uma área já criada;
  - criação inline de uma nova área ao digitar um nome que ainda não existe;
  - a nova área fica associada à tarefa e passa a aparecer nos filtros depois que a tarefa é salva.
- A criação de uma nova área não apaga, renomeia nem migra áreas existentes.

## Preservação

Instalação por cima da 0.3.51, preservando tarefas, áreas, mensagens, agenda, páginas, capas, perfil, notificações e demais dados existentes.

## Critério de entrega

A versão só é considerada entregue depois de typecheck, testes do app/backend, build Android, validação de upgrade/assinatura, shards nativos e publicação real no canal `sofia-android-v`.


## Correção da Home / servidor

A Home não pode falhar inteira por incompatibilidade de catálogo ou por um módulo secundário.

- O backend deixa de assumir que todo registro persistido ainda possui uma definição no catálogo atual. Registros legados desconhecidos são preservados e ignorados apenas nos agrupamentos que exigem definição de catálogo.
- O tipo `capsule` volta a fazer parte oficialmente do catálogo do servidor, compatível com os dados que o app de Cápsulas já grava.
- A pré-carga Android consulta somente tipos anunciados pelo catálogo quando ele está disponível.
- Falhas de Monitoramentos ficam restritas ao widget; Home, Agenda e Tarefas continuam utilizáveis.
- Há regressão de backend garantindo que `/api/mobile/home` continue 200 mesmo quando existe um registro legado desconhecido.

A regressão automatizada usa um fixture de workspace completo para provar que a Home permanece 200 mesmo com registros legados incompatíveis com o catálogo atual.
