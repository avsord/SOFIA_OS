# Sofia OS Android 0.3.148

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 153. Atualização por cima, sem desinstalar nem limpar dados. O servidor (Railway) também é atualizado.

- Conta Google: o erro "Enviar ...: Google: Bad Request" vinha de compromissos que o Google recusa — o caso mais comum é evento de dia inteiro com fim igual ao início (para o Google o fim é exclusivo). Agora a Sofia sempre manda o compromisso num formato válido (fim depois do início, lembrete dentro do limite do Google), mostra o motivo real que o Google der e, se ele ainda recusar, tenta de novo só com título e horário.
- Um compromisso recusado não aparece mais como erro vermelho da conta: vira uma nota discreta ("1 compromisso não foi enviado ao Google — motivo") e a Sofia para de reenviar a mesma versão a cada sincronização; editar o compromisso tenta de novo. Erros da conta (acesso revogado, falha geral) continuam em destaque.
