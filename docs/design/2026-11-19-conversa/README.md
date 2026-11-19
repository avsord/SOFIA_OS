# Nova Conversa — desenho para aprovação (19/11/2026)

Abra `index.html`. Régua: WhatsApp Web medido pelo Mimic Kaizen em 19/11 (régua de chat
específica: menu, responder, editar, apagar, enviar, rolagem, rascunho; NÃO é o DNA 27/27).
Valem as regras e recusas de `../2026-11-03/README.md`. Muda estrutura e jeito; cores, fontes
e funções atuais ficam.

## Telas
1. Menu único da mensagem (1a Sofia, 1b sua, 1c linha de página). App: segurar. Site: setinha ⌄ ao passar o mouse ou clique direito; ESC fecha. Animação curta (≈150 ms, entra de cima).
   - Sofia: Responder, Copiar, Marcar tarefa, Selecionar.
   - Sua (conversa com a Sofia): Responder, Copiar, Editar, Selecionar, Apagar.
   - Linha de página: Responder, Copiar, Editar, Marcar tarefa, Abrir na página, Apagar.
2. Responder: mesma barra da "Criar" (05/06): traço lilás, quem + trecho, X. ESC cancela.
3. Editar: no lugar, como já é (função mantida); depois "editada" ao lado da hora.
4. Apagar: some na hora + "Linha apagada · Desfazer" (6 s), sem janela.
5. Lendo as antigas: a tela não pula quando chega mensagem; o botão "Descer para a última mensagem" (já existe) ganha a contagem. Antigas carregam sozinhas ao chegar no topo.
6. Enviar: bolha na hora com reloginho → ✓. Sai "Enviando…". Falha: "Não enviada · Tentar novamente" (mantido).
7. Lista mostra "Rascunho:"; lupa no cabeçalho pesquisa dentro da conversa.

## Decisões para o Pedro
- **Apagar sem perguntar.** Correção: o WhatsApp pergunta (seleciona → "Cancelar / Apagar para mim" → Desfazer). Ele pergunta porque existe "apagar para todos". A Sofia não tem essa escolha, então aqui fica sem janela, só com Desfazer.
- **Menu na última bolha abre para cima** (colado nela). A regra de 03/11 diz "sempre para baixo", mas embaixo da última bolha está o campo de digitar. Nunca folha subindo do rodapé (recusada em 03/11).
- **Opcionais ("quer?")**: Reagir, Fixar, Encaminhar. Num chat com IA não são ganho óbvio.
- **Editar sua mensagem na conversa com a Sofia** depois que ela já respondeu: proposta = a Sofia responde de novo à versão editada. Se não quiser, Editar fica só nas linhas de página.

## Não medido no WhatsApp (escolha da Sofia, não cópia)
ESC fechando o menu; antigas carregando sozinhas.

## Correções sem desenho (entram junto)
- O quadro da conversa recarrega de novo 6 s depois de abrir (`Chat.tsx`, `setTimeout(...loadBoard...,6000)`): pode trocar/piscar; recarregar só quando mudar.
- Juntar as duas telas (Chat e ChatHub) no mesmo menu/componente de mensagem.
