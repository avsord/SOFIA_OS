# Sofia OS Android 0.3.78 — fade composto sem S isolado

Investigação de 0.3.77 no emulador: LOCAL_READY→FADE_START = 0 ms, mas FADE_START→SPLASH_REMOVED = 602–643 ms, apesar de 95 ms configurados. Alterar o tipo de animador da SplashScreenView não resolveu a demora.

Mudança estrutural no código nativo:
- A imagem do S e o fundo são desenhados pela MESMA View Canvas, sem ImageView/splash icon separado. É impossível um S residir sozinho quando o fundo some.
- O SplashScreenView original do Android é REMOVIDO assim que a Home já está pronta, antes de começar a transição.
- Um único ViewPropertyAnimator de 95 ms aplica alpha na View composta e a remove; a Home já está pronta por baixo. A superfície é não interativa e inacessível para o leitor de telas.
- A confirmação de visualização só ocorre depois do fade, para não acionar rede/carregamento pesado durante a transição.
- O QA agora registra SPLASH_REMOVED, FADE_START e FADE_DONE separadamente e exige: demora para retirar splash do sistema após Home pronta <=150 ms, fade completo <=250 ms, abertura total <= mediana da referência 0.3.65 + 200 ms. Não considerar build aprovado se QA falhar.
- Mantido APK com assinatura de atualização, pacote com.avsord.sofiaapp, versionCode 83. Instalar por cima, sem desinstalar. Não publicar release automático.
