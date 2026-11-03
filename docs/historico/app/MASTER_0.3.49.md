# Sofia OS — Master 0.3.49

**Data:** 7 de outubro de 2026. **Base publicada:** Android 0.3.48. **Pacote:** `com.avsord.sofiaapp`. **Canal:** `sofia-android-v`. **Versão planejada:** 0.3.49 / versionCode crescente automático.

## Objetivo desta master

Esta entrega trata dois problemas observados após a 0.3.48: abertura ainda lenta do aplicativo e capas de páginas que podiam aparecer quebradas após selecionar uma foto.

## Inicialização rápida

A primeira tela não deve competir com árvores React e efeitos de abas que ainda não estão visíveis.

- O primeiro frame monta somente **Início**.
- Conversa e Agenda entram na primeira fase de aquecimento.
- Páginas e Perfil entram depois.
- Apps entra por último, por possuir a maior árvore de componentes.
- Se o usuário tocar numa aba antes da sua fase, ela monta imediatamente naquele mesmo render.
- Uma aba que já montou não é desmontada; rascunhos, posição de rolagem e estado permanecem vivos.
- Os módulos grandes de Conversa, Páginas, Agenda, Apps, Perfil e Notificações usam carregamento adiado. Eles não são executados pelo JavaScript antes da hora somente por estarem importados no app.
- Verificação automática de atualização, alarmes e centro de notificações aguardam a primeira pintura.
- O cache criptografado continua sendo mostrado antes da atualização de rede.
- A pré-carga de rede é limitada e prioriza Home, tarefas, agenda atual, chat atual e dashboard.
- Em cold start sem cache, um endpoint crítico não deve ser buscado uma segunda vez só para “atualizar” o que acabou de chegar.
- Em warm start com cache, os caminhos já existentes no snapshot recebem atualização viva em segundo plano.
- O aquecimento secundário usa no máximo dois workers para não saturar JS/rede enquanto o usuário começa a interagir.

A sessão, o backend e os dados continuam autoritativos. O cache é uma visão descartável e criptografada por conta.

## Capas das páginas

O picker não é mais tratado como se toda foto fosse JPEG.

- A imagem selecionada é lida a partir do arquivo editado real devolvido pelo Android.
- O tamanho é validado nos bytes reais antes da conversão para base64.
- JPEG, PNG, WebP e GIF são identificados pelo conteúdo do arquivo, com o MIME informado pelo picker somente como fallback.
- O nome enviado ao servidor recebe a extensão coerente com o conteúdo.
- O fluxo de recuperação do resultado pendente do Android continua preservado.
- Se a primeira leitura do anexo recém-enviado falhar, a capa tenta novamente com uma URL sem cache antes de ser marcada como indisponível.
- O ID da página, o ID do anexo e os demais dados da página não são migrados nem recriados.

## Preservação

Esta entrega não desinstala o app, não limpa armazenamento, não apaga mensagens, páginas ou anexos, não muda o package e não redeploya o backend por conta própria.

## Entrega

Uma alteração solicitada inclui implementação, testes, geração e publicação do APK aplicável. “Publicado” só deve ser informado depois que a release real existir e a descoberta pelo atualizador estiver verificada.
