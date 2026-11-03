# Sofia OS 0.3.116 — candidato manual

Guiado pelo relatório do celular da 0.3.115.

1. O gravador de áudio nativo não é mais criado ao abrir a Conversa: só no primeiro toque no microfone, e só é consultado enquanto grava. O relatório mediu `composer:recorder` = 148,8 ms dentro dos 224 ms do campo de digitação, e a primeira abertura da Conversa levava 741 ms. Antes, os ganchos do `expo-audio` criavam o gravador ao montar e o consultavam de 120 em 120 ms durante toda a vida da aba. O envio de voz (permissão, gravar, cancelar deslizando, ouvir antes de enviar) continua igual.
2. O ciclo de vida do gravador é próprio e simétrico, como o do `VoicePlayer`: o gancho original liberava o gravador no cleanup de um efeito que o React também roda ao esconder uma aba.
3. A expansão de recorrências (`agenda:expand` 0,6 ms) NÃO era o custo da Agenda; a memória da 0.3.115 é exata e inofensiva, mas não era o alvo.

Pacote com.avsord.sofiaapp, mesma assinatura, ARM64 e R8. Código 121, instalação por cima da 0.3.115. Candidato manual: não publicado no atualizador.
