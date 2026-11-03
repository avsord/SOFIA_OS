# Sofia OS Android 0.3.14

A Sofia agora abre em **Início**, tanto ao reaproveitar uma sessão válida quanto depois de um novo login. O destaque roxo e o pager também começam alinhados com Início; a velocidade e o motion aprovados não foram alterados.

A tela de **Páginas** foi aproximada do visual Notion de referência: capa mais ampla, ícone sobreposto, título e conteúdo em fluxo contínuo, menos espaço vazio e subpáginas integradas ao conteúdo. Em páginas vazias, “Título” e “Escreva algo…” continuam como placeholders discretos; depois de escrever, a interface permanece limpa. Desfazer/refazer continuam à direita com as ferramentas e o salvamento automático foi preservado.

Na árvore de páginas, o **ícone pode ser arrastado**. Soltar sobre outra página transforma a página arrastada em subpágina; durante o arraste aparece uma área “Solte aqui para página principal” para devolvê-la ao nível raiz. O app bloqueia movimentos que criariam ciclos (por exemplo, colocar uma página dentro de uma própria descendente), faz atualização visual imediata e persiste a nova hierarquia no servidor.

Versão 0.3.14; versionCode 19; package `com.avsord.sofiaapp`; canal `sofia-android-v` preservado para que a 0.3.12/0.3.13 detecte a atualização dentro do próprio app.
