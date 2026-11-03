# Sofia OS Android 0.3.61

Entrega manual solicitada pelo usuário. Um único APK de produção, sem publicação no canal automático.

- Fade nativo: prontidão do conteúdo e callback da splash são coordenados. A chegada antecipada dos dados não conclui a abertura antes da animação. Os dois ordenamentos são exercitados na classe Java realmente usada pelo plugin Android.
- Abertura: consultas de monitoramentos e pré-carga dos meses adjacentes começam depois da transição; tarefas e mês atual continuam essenciais. Nenhum dado, chave, cache de conta ou mecanismo de autenticação foi apagado.
- O fluxo manual executa a suíte do app, testes isolados do backend, build, identidade/assinatura e instalação por cima no emulador com o APK de produção. Não compila fixture de QA nem publica release.
- Registrar o resultado efetivo da execução. Testes locais não provam tempo no telefone, transição sem quadros brancos, Home autenticada ou preservação dos dados reais. Não prometer ganho percentual.

Package com.avsord.sofiaapp; versionCode 66. Atualização por cima, sem desinstalar nem limpar dados. O backend não é reiniciado por este fluxo.
