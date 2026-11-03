# Sofia OS Android 0.3.27

Revisão após a entrega 0.3.26 não atender ao comportamento esperado.

- Corrigida a ligação do logo à abertura Android: o prebuild usava a imagem genérica do Expo. O desenho original agora gera recursos vetoriais nativos de abertura e ícone adaptativo, sem a fonte raster de 96 px durante a ampliação.
- Voltar em Páginas sobe ao pai mesmo quando a subpágina foi aberta diretamente pela árvore. O botão físico respeita esse nível e a tela por trás do gesto corresponde ao pai.
- Gesto de voltar começa na borda, sem roubar rolagem horizontal dos quadros nem seleção de texto.
- Tela por trás do gesto não aparece como conteúdo interativo duplicado na acessibilidade.
- Versão instalada explícita na área de atualizações e cabeçalho contextual em Ajustes.
- Validação Android ampliada: aplicativo completo de produção com transporte sintético, incluindo Início, Agenda 50/50 e seleção de dia, notificações, temas/perfil, Apps/Voltar, árvore, templates, autosave, desfazer/refazer e seleção no chat.

Pacote com.avsord.sofiaapp; versionCode 32; canal existente. Instalar por cima.

Google Agenda real, publicação web/backend, histórico/limpeza compartilhada e sincronização integral ainda dependem de credenciais e migração segura do servidor. Não estão funcionando em produção por causa deste APK. Nenhuma reinicialização ou perda de dados de produção foi autorizada por um teste sintético.
