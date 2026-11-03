# Sofia OS 0.3.104 — abertura e navegação

A escala 0,70→1 começa no primeiro frame da splash Android, em 650 ms, sem repetição e sem espera mínima. A superfície de saída usa o relógio original e o vetor renderizado no tamanho final; não captura nem amplia pixels da imagem menor. Mantém o fade de 95 ms da 0.3.94, com conclusão única. Remove o desenho antecipado de círculos, retângulos e texto que disputava a abertura com a Home; a superfície pinta apenas fundo e logo, opaca até a saída.

As abas visitadas permanecem montadas. A troca nativa acontece depois de o React montar o destino, evitando mostrar um slot vazio. A Home exige o marcador de dados essenciais; snapshots parciais liberam leituras indispensáveis, enquanto sessões com cache completo não esperam rede. Nenhum login, histórico ou backend é apagado ou alterado.

Validação prevista: tipos, testes, curva JVM, instalação por cima, Home/conversa offline, paginação, 24 toques reais nos menus e gravações do APK exato. Mantém os quatro gates existentes e mede também a 0.3.94 no mesmo emulador. Aparelho físico não disponível. Entrega manual com assinatura preservada; sem publicação no atualizador.
