# Sofia OS Android 0.3.76 — saída de splash atômica e teste de desempenho real

### Causa observada na 0.3.75
No teste autenticado/offline em emulador Android, a Home estava pronta após 768–840 ms desde o início do processo, mas o splash só saía 1346–1490 ms. A regressão era **após** a Home já estar pronta, não no carregamento dos dados ou foto. A mediana do APK 0.3.75 foi 1410 ms, comparada a 947 ms do APK referência 0.3.65.

### Correção
- O código nativo chama `transition.contentReady()` no próprio callback que detecta a Home, sem agendar outro `postOnAnimation`. Isso elimina uma espera de renderização que pode ser muito longa se a thread principal estiver ocupada.
- A `SplashScreenView` e sua `iconView` (que alguns fabricantes compõem em camadas próprias) compartilham o mesmo `ValueAnimator`, alpha de 1 para 0, duração 95 ms. No fechamento, os dois alphas são zerados antes da remoção do splash para evitar S persistente.
- Permanecem inalterados o cache de dados do usuário, sincronização no servidor, assinatura, perfil e cápsulas.
- Reforçado o smoke test real da compilação, com cinco aberturas frias offline do APK final, usando sessão e histórico sintéticos. Reprova se mediana de Home-ready→fade >150 ms, fade→retirada >250 ms, ou abertura mediana > referência + 200 ms. Os cinco testes devem preservar conversa e navegação.
- APK candidato para instalar por cima: com.avsord.sofiaapp, versão 0.3.76, versionCode 81. NÃO é release oficial.

Observação: teste de emulador não substitui validação no aparelho; se o fade seguir ruim em algum fabricante é necessário registro nativo ou vídeo para investigar a implementação específica do Android.
