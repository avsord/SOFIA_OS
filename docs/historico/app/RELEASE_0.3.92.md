# Sofia OS Android 0.3.92

S50% maior,48dp/anel100.8dp, mesma entrada orgânica, sem cópia/troca na saída. Fade na splash original95ms. O ícone SurfaceView recebe alpha absoluta via SurfaceControl.Transaction, evitando invalidação de toda a árvore em cada frame. Fundo e S seguem o mesmo valor; imagens comuns herdam o alpha do fundo.

Transaction fechada na conclusão/cancelamento. Gates150/150/250ms ebaseline+200 mantidos. Mesmos dados, assinatura/pacote, código97; entrega manual, sem publicar no atualizador. CI e vídeo pendentes.
