# Sofia OS Android 0.3.91

S48dp/anel100.8dp,50% maiores que087, com a mesma escala orgânica. Fade aplicado à própria splash original do Android: nenhum novo S, cópia, recenter ou transferência de quadro. SurfaceView do ícone recebe a mesma opacidade absoluta do fundo a cada frame; ícones ImageView herdam normalmente. Não reinicia a escala nem restaura alpha1 durante o fade.

95ms/cleanup180ms. Ordem de medição reflete remoção da splash após o fade: LOCAL_READY≤FADE_START≤SPLASH_REMOVED≤FADE_DONE≤DATA. Limites150ms para início e remoção,250ms fade,baseline+200ms intactos; a remoção agora limita o próprio fade inteiro. Sem dados/histórico/backend alterados. Entrega manual, package/assinatura existentes, código96. CI/APK/visual pendentes.
