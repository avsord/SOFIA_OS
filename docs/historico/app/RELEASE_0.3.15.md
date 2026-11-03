# Sofia OS Android 0.3.15

Corrige a navegação interna e o comportamento real das Páginas no Android.

**Página no fluxo do Notion:** a capa ocupa a largura, o ícone fica solto sobre a capa, o título vem logo abaixo e as subpáginas entram imediatamente no fluxo do documento. “Escreva algo…” aparece apenas enquanto a página realmente está vazia; depois que existe um título real ou conteúdo, o bloco vazio não reserva altura nem deixa um texto auxiliar permanente. Dentro da página, as subpáginas ficam visíveis como linhas de página, sem seta/label de “Subpáginas” para recolher o grupo.

**Voltar arrastando:** quando uma página está aberta na aba Páginas, arrastar para a direita move a própria página junto com o dedo e revela a lista por baixo. Enquanto a página está aberta, o pager principal fica bloqueado para esse gesto. Depois que a página fecha e a lista volta a aparecer, o swipe entre Início, Conversa, Páginas, Agenda, Apps e Perfil volta a funcionar normalmente. A velocidade/motion aprovado do carrossel principal não foi alterado.

**Hierarquia por arraste:** a linha inteira da página — ícone e texto — pode ser arrastada. Soltar sobre outra página altera o parent_id e transforma a página em subpágina. Para voltar a ser página principal, basta puxar a subpágina para a esquerda/para fora da hierarquia; não existe área nem label “solte aqui”. Ciclos continuam bloqueados e a mudança é salva no servidor.

A Sofia continua iniciando em **Início**. Versão 0.3.15; versionCode 20; package `com.avsord.sofiaapp`; canal `sofia-android-v` preservado para atualização dentro do próprio app.
