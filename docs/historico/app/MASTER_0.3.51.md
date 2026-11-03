# Sofia OS — Master 0.3.51

**Data:** 7 de outubro de 2026. **Base:** Android 0.3.50. **Pacote preservado:** `com.avsord.sofiaapp`. **Canal:** `sofia-android-v`.

## Escopo desta entrega

1. Áudio pode ser cancelado deslizando para a esquerda durante a gravação, com indicação visual “Solte para cancelar”. Ao cruzar o limite e soltar, o arquivo é apagado e não é enviado.
2. Removidos o corte visual de caracteres, o `maxChars`, a parada automática em cinco minutos e os tetos explícitos de caracteres/duração no backend. Permanecem apenas limites físicos de bytes de uma única requisição para proteger memória e transporte.
3. Perfil ganha foto por conta neste aparelho: galeria, câmera, remoção e editor nativo com enquadramento quadrado, zoom e reposicionamento antes de salvar. A foto permanece após atualizar o APK.
4. Agenda e Cápsulas solicitam a permissão de notificações do sistema quando existe um lembrete real e criam canais Android de alta prioridade, com som e vibração. Os avisos aparecem também na central de notificações do celular, mesmo quando a Sofia não está aberta, desde que o Android permita notificações e alarmes.

## Áudio

A gravação continua usando um único canal AAC com bitrate reduzido para permitir mensagens mais longas sem crescimento desnecessário do arquivo. O gesto horizontal só assume o toque quando há movimento claro para a esquerda, evitando disputar com rolagem vertical ou botões. O botão de lixeira continua disponível como alternativa explícita.

Não existe mais temporizador de cinco minutos no compositor nem teto de duração no endpoint móvel. O servidor valida apenas que a duração seja positiva e coerente. O arquivo de uma única mensagem continua sujeito ao orçamento técnico de bytes do transporte; gravações muito longas continuam dependendo de armazenamento, rede, transcrição e limites físicos do provedor.

## Texto

O campo de mensagem não usa `maxLength` nem `maxChars`. O endpoint móvel e o núcleo deixam de aplicar teto explícito de caracteres à mensagem; o corpo HTTP possui somente um orçamento técnico em bytes para impedir exaustão de memória. A capacidade real de resposta da IA ainda depende da janela de contexto do provedor; o app não corta silenciosamente o que o usuário digitou.

## Foto do perfil

A foto é escolhida pela galeria ou câmera e passa pelo editor nativo do Android/iOS com proporção 1:1. O resultado é copiado para o diretório permanente do aplicativo e associado ao e-mail da conta. Remover a foto apaga somente esse arquivo local e retorna às iniciais. Esta entrega não apresenta a foto como sincronizada com o site ou com outro aparelho.

## Notificações no celular

- **Agenda:** compromissos e lembretes com notificação ativa são agendados no canal “Agenda da Sofia”.
- **Cápsulas:** avisos antecipados e do horário são agendados no canal “Cápsulas da Sofia”.
- Ambos usam prioridade alta, som padrão e vibração.
- A permissão do sistema é solicitada somente quando existe ao menos um aviso futuro real.
- Tocar na notificação abre a área correspondente.
- Desativar notificações no Android impede a entrega; a Sofia não contorna a decisão do sistema.
- Em alguns aparelhos, economia de bateria ou falta de permissão para alarmes exatos pode atrasar o aviso.

## Preservação

Instalação por cima, sem desinstalar, limpar dados, apagar mensagens, páginas, capas, tarefas, cápsulas ou agenda. A assinatura, o package e o canal de atualização permanecem os mesmos.

## Critério de entrega

Só informar como publicado após typecheck, regressões do aplicativo, testes de backend, build de produção, instalação sobre a versão anterior, assinatura, dois grupos nativos aprovados, backend compatível/deployado e release real descoberta pelo atualizador.


## Complemento — perfil, sino, tarefas e cold start

### Foto de perfil
O Perfil do usuário exibe um avatar tocável com badge de câmera. O fluxo oferece galeria, câmera e remoção. Galeria/câmera usam o editor nativo com proporção 1:1, permitindo zoom e reposicionamento antes de confirmar. O arquivo final é copiado para armazenamento permanente do app por conta e sobrevive a atualizações do APK. Esta versão não afirma sincronização automática da foto entre dispositivos.

### Marcar tudo como lido
O sino e a tela completa de notificações passam a oferecer **Marcar tudo como lido**. Avisos locais (Agenda, Cápsulas, Rotinas e tarefas derivadas no aparelho) são atualizados de uma vez e persistidos. Avisos remotos recebem confirmação no servidor em lotes; a interface atualiza imediatamente e reconcilia novamente se alguma chamada falhar. Essa ação não apaga notificações nem conclui tarefas/doses.

### Excluir tarefa dentro da edição
Ao editar uma tarefa existente, a lixeira fica visível no cabeçalho e o botão **Excluir tarefa** permanece no fim do formulário. Ambos usam a mesma confirmação destrutiva e removem o registro do app/site somente depois da confirmação.

### Cold start sem flick claro/escuro
Quando o processo do app não está em memória, o Android usa uma única superfície nativa roxa com a marca Sofia. Essa superfície cobre a transição entre splash do sistema e React. O React carrega sessão, preferências, tema e o Home final por trás; somente depois de duas pinturas com o estado correto o overlay nativo é removido.

Com isso, não devem aparecer:
- frame claro seguido de escuro (ou o contrário);
- janela vazia entre splash e React;
- skeleton visível por poucos frames antes do Home completo;
- “estouro” da interface quando o tema termina de carregar.

Há fallback nativo de 5 segundos apenas para não esconder indefinidamente uma tela de erro em caso de falha real de inicialização.

## Critério adicional de aceite da 0.3.51

- cold start entrega uma transição única da marca para a interface final;
- tema já está correto no primeiro frame visível do React;
- foto de perfil pode ser escolhida, enquadrada, persistida e removida;
- sino marca todas as notificações como lidas sem apagá-las;
- editor de tarefa contém exclusão explícita com confirmação;
- áudio continua cancelável por gesto para a esquerda;
- Agenda e Cápsulas continuam agendando notificações nativas no celular;
- texto não possui teto explícito de caracteres e áudio não possui teto explícito de duração; ambos ficam apenas sujeitos aos limites físicos/técnicos de transporte e processamento.


## Gate de backend da entrega

A publicação Android desta versão deve validar o backend já implantado no Railway antes de liberar o APK. Mudanças apenas no aplicativo não podem mascarar uma API móvel antiga: texto sem teto explícito de caracteres, áudio sem teto explícito de duração, sessão persistente, prioridades da Agenda e contexto de tarefas precisam estar ativos no servidor utilizado pelo APK.


O endpoint público de saúde do servidor expõe explicitamente os capabilities usados pelo gate Android (`task_description_format`, `selected_task_context`, `agenda_priority`, `persistent_sessions`, `unrestricted_chat_text` e `unrestricted_audio_duration`), evitando liberar um APK contra backend incompatível.
