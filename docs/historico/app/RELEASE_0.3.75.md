# Sofia OS 0.3.75 — elimina o S duplicado e reduz a espera do splash

Diagnóstico confirmado:
- Tema do Android 12/13 tinha duas imagens: windowSplashScreenAnimatedIcon e android:windowBackground apontando para splashscreen_logo (outra imagem com o S). Quando a splash nativa desaparecia, o fundo da janela ainda podia desenhar o segundo S.
- Teste real em emulador da 0.3.74 apresentou mediana de abertura 1382 ms vs referência 838 ms; a validação manual falhou e não deve ser tomada como aprovada.

Alterações:
1. **Android 12+**: windowBackground do tema agora é apenas @color/sofiaLaunchBackground, com suporte a claro/escuro. A única imagem com S no início passa a ser windowSplashScreenAnimatedIcon. O fade nativo alpha da SplashScreenView não afeta mais uma cópia fantasma no background da Activity.
2. **Android <=11**: ao revelar a Home, substitui o fundo legado do S por fundo de cor sólida para não persistir em nenhuma Activity.
3. Registra timestamp da chegada da janela do sistema no callback de saída para separar demora do Android da demora de montar a Home.
4. Desacopla decodificação da foto de perfil do bloqueio da Home: a leitura começa em paralelo e o avatar é atualizado ao concluir.
5. Se já há Home ou Tarefas na projeção criptografada compacta, lê o arquivo completo maior em segundo plano quando o mês da Agenda mudou; preserva todos os registros, sem zerar cache nem depender de rede.
6. Mantém o fade único de 110 ms sem atraso extra e telas secundárias pré-montadas progressivamente após a saída da splash.

Instalar **por cima**. Mesmo package com.avsord.sofiaapp, versionCode 80. Candidato de teste; requer validação no Android real para confirmar efeito visual. Não publicar release público sem autorização.
