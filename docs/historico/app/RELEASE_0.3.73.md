# Sofia OS Android 0.3.73 — fade da tela inteira e menus preparados

- A transição entre a tela nativa do S e a Home usa animação alpha de 1 para 0 no SplashScreenView inteiro (fundo + círculo + letra), com 190 ms e interpolação desacelerada. A animação começa apenas quando a Home local está pronta. Caso o Android cancele a animação, fallback idempotente remove a splash após no máximo 300 ms.
- Mantida a animação de movimento do S da tela nativa; retirada a segunda animação por cima da Home.
- Todos os seis painéis dos menus são montados antes da retirada da splash, e continuam vivos entre trocas de aba (sem placeholder branco por lazy mount). Removido o agendamento de importações tardias.
- Páginas inicia a partir do snapshot salvo (quando disponível) e não bloqueia a tela na consulta remota; restaura rascunhos e expandidos antes de declarar a tela pronta. Apps inicia do catálogo local salvo (quando disponível).
- Dados sem cache continuam exigindo resposta do servidor; não se inventam registros, não se altera nem remove dados.
- Versão 0.3.73 (versionCode 78), pacote e assinatura mantidos, instalar como atualização por cima. Candidato manual para testar no telefone, não lançamento oficial.
