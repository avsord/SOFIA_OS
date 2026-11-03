# Sofia OS Android 0.3.16

Esta versão substitui a 0.3.15 para entregar os ajustes finais de **Páginas** sem sobrescrever uma release já publicada.

- A Sofia continua abrindo em **Início**.
- Ao abrir uma página e arrastar para a direita, **a própria página acompanha o dedo até voltar para a lista de Páginas**. Só depois disso o swipe horizontal volta a circular entre Início, Conversa, Páginas, Agenda, Apps e Perfil.
- O documento segue a referência estilo Notion: capa em largura total, ícone solto sobre a capa, título grande e conteúdo/subpáginas no mesmo fluxo, sem o espaço vazio artificial.
- **“Escreva algo…” só aparece enquanto a página está realmente vazia.** Depois que existe título ou conteúdo, o texto auxiliar desaparece e o bloco vazio não reserva espaço.
- As subpáginas aparecem diretamente abaixo do conteúdo, sem a seta/label extra de “Subpáginas” dentro do documento.
- Para reorganizar a hierarquia, **segure e arraste a linha inteira da página (ícone + texto)**. Soltar sobre outra página a transforma em subpágina.
- Para voltar uma subpágina ao nível principal, **arraste-a para a esquerda/para fora da hierarquia**. Não existe área ou label de “solte aqui”.
- O app continua bloqueando ciclos de hierarquia e salva o novo parent_id no servidor.
- Autosave, desfazer/refazer à direita, chat sincronizado e o motion/velocidade aprovados dos menus são preservados.

Versão 0.3.16; versionCode 21; package `com.avsord.sofiaapp`; canal `sofia-android-v`.
