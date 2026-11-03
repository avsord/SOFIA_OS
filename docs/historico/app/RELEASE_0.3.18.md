# Sofia OS Android 0.3.18

Ajusta a dica de escrita das Páginas para seguir o comportamento esperado do Notion.

- Página totalmente vazia: “Título” e “Escreva algo…” aparecem em baixa opacidade.
- Título preenchido, corpo ainda vazio e sem subpáginas: “Escreva algo…” continua aparecendo.
- Se a página já possui **subpáginas**, elas contam como conteúdo visual: “Escreva algo…” não fica aparecendo por padrão.
- Mesmo com subpáginas, a área de escrita continua clicável; ao tocar nela, o usuário pode começar a escrever normalmente e recebe apenas a dica contextual do bloco.
- Ao existir texto/conteúdo real no corpo, o placeholder some e a página permanece limpa.

Mantém os demais comportamentos da 0.3.17/0.3.16.

Versão 0.3.18; versionCode 23; package `com.avsord.sofiaapp`; canal `sofia-android-v`.
