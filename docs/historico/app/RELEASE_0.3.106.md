# Sofia OS 0.3.106 — Rodada 4 (candidato manual)

O ícone de sistema Android 12+ passa a ser invisível, preservando geometria. O overlay pinta o S com fade-in de 140 ms e curva nativa de escala 650 ms quando o Android entrega o primeiro frame; o splash inicial fica roxo até a animação nativa.

Páginas deixa de anunciar falsa lista vazia antes da primeira leitura e aproveita o arquivo local após o fade. O aquecimento das abas só começa após a hidratação local, cancela quando o usuário troca de aba e retoma em 500 ms. Registro do custo de hidratação e do toque até o frame React.

Sem mudança de package, assinatura, OTA, Railway, dados ou gates de inicialização. APK ARM64, R8 ativo, versionCode 111. Não publicar sem aprovação e validação em aparelho físico.
