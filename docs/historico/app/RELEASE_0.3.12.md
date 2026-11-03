# Sofia OS Android 0.3.12

Corrige a abertura com Conversa selecionada e Início visível. O pager nativo só é montado após medir a largura, começa com o deslocamento da aba correta, e aguarda as dimensões nativas do viewport e de todas as páginas antes de confirmar o alinhamento. A geometria não é mais usada para reaplicar uma seleção antiga; foco em controles fora da tela não pode mudar a aba silenciosamente. Login/remontagem e mudança de largura reconciliam página e destaque roxo.

A velocidade aprovada foi preservada: mesma mola dos ícones (420/30/0.8), mesma escala/curva, mesmo decelerationRate fast, mesmo acompanhamento nativo do dedo e troca sem animação ao tocar nos menus. Nenhum atraso artificial, mudança de autenticação, filtro privado ou migração de dados.

Páginas vazias exibem Título e Escreva algo… como placeholders em baixa opacidade. O conteúdo digitado mantém a cor normal; depois de preenchido, não há texto auxiliar sobre o conteúdo. Linhas vazias adicionais continuam limpas, com a dica de comando apenas no foco. Desfazer e refazer ficam à direita do cabeçalho junto de criar subpágina/excluir. Salvamento automático, histórico de edição e seleção persistida de subpáginas permanecem.

Versão 0.3.12; versionCode 17; com.avsord.sofiaapp; prefixo sofia-android-v e assinatura anteriores mantidos. Publicação pelo mesmo canal reconhecido pelo atualizador instalado na 0.3.11. A confirmação final da instalação continua sendo do Android.

Validação: testes unitários de dimensões/eventos fora de ordem, montagem, gesto, reset, placeholders e ferramentas; compilação e tipos; APK separado de CI com componentes reais e dados sintéticos para abertura, primeiros gestos, remontagem, redimensionamento e editor; upgrade do APK de produção sobre a 0.3.11. Depois de publicar, o pipeline verifica tanto o código exato do atualizador antigo quanto a oferta Atualizar dentro do APK 0.3.11 original. O APK sintético não é publicado e não acessa contas/dados reais. Resultados de CI devem ser consultados antes de afirmar que essas etapas passaram; não é medição de FPS no celular do usuário.
