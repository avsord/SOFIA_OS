# Nova Conversa — desenho para aprovação (19/11/2026)

Abra `index.html`. Régua: WhatsApp Web medido pelo Mimic Kaizen em 19/11 (régua de chat
específica: menu, responder, editar, apagar, enviar, rolagem, rascunho; NÃO é o DNA 27/27).
Valem as regras e recusas de `../2026-11-03/README.md`. Muda estrutura e jeito; cores, fontes
e funções atuais ficam.

## Telas
1. Menu único da mensagem (1a Sofia, 1b sua, 1c linha de página). App: segurar. Site: setinha ⌄ ao passar o mouse ou clique direito; ESC fecha. Animação curta (≈150 ms, entra de cima).
   - Sofia: Responder, Copiar, Selecionar várias, Apagar.
   - Sua (conversa com a Sofia): Responder, Copiar, Selecionar várias, Apagar. Editar (decidido 19/11: a Sofia responde de novo à versão editada; precisa do servidor).
   - "Selecionar várias" leva à seleção que já existe (barra com Responder, Copiar, Excluir). Hoje segurar entra direto nela; passa a abrir o menu.
   - Linha de página: Responder, Copiar, Editar, Marcar tarefa, Abrir na página, Apagar.
2. Responder: mesma barra da "Criar" (05/06): traço lilás, quem + trecho, X. ESC cancela.
3. Editar: no lugar, como já é (função mantida); depois "editada" ao lado da hora.
4. Apagar: some na hora + "Linha apagada · Desfazer" (6 s), sem janela.
5. Lendo as antigas: a tela não pula quando chega mensagem; o botão "Descer para a última mensagem" (já existe) ganha a contagem. Antigas carregam sozinhas ao chegar no topo.
6. Enviar: bolha na hora com reloginho → ✓. Sai "Enviando…". Falha: "Não enviada · Tentar novamente" (mantido).
7. Lista: "Arquivadas" sempre em cima, com a contagem (como no WhatsApp); mostra "Rascunho:"; lupa no cabeçalho pesquisa dentro da conversa.
8. Site no computador: página própria em tela cheia, `web.html` (régua do WhatsApp Web; passar o mouse, clique direito, Arquivadas e pesquisa funcionam). Resumo também nas telas 8a/8b (refeito 19/11 pela régua do WhatsApp Web): barra lateral da Sofia (fica) + lista de ~380 px (Pesquisar, filtros Tudo / Páginas, Arquivadas em cima, hora e contagem de não lidas) + conversa no resto. 8a: setinha ⌄ e menu. 8b: Arquivadas troca a lista (seta ← volta) + pesquisa na conversa. Fixar entra.

## Decisões para o Pedro
- **Apagar sem perguntar.** Correção: o WhatsApp pergunta (seleciona → "Cancelar / Apagar para mim" → Desfazer). Ele pergunta porque existe "apagar para todos". A Sofia não tem essa escolha, então aqui fica sem janela, só com Desfazer.
- **Menu na última bolha abre para cima** (colado nela). A regra de 03/11 diz "sempre para baixo", mas embaixo da última bolha está o campo de digitar. Nunca folha subindo do rodapé (recusada em 03/11).
- **Decidido (19/11):** Editar e Fixar entram; Reagir, Encaminhar e o filtro "Não lidas" ficam fora: as conversas das páginas são só textos do Pedro (a da Sofia mantém a contagem de não lidas).
- **Conversa com a Sofia (decidido 19/11):** mesma identidade visual das outras; ela é um contato como os outros, só que fixo no topo (não arquiva, não sai da lista). Editar vale também nela: a Sofia responde de novo à versão editada (precisa de mudança no servidor e na memória dela).

## Medido na conversa do WhatsApp Web (19/11, 1440 px)
Bolha raio 7,5 px com a ponta da cauda reta, padding interno 6 7 8 9 (texto a 7/9/10 px das bordas), letra 14/20 px, sombra fina, hora 12/16 px; setinha 24×18 no canto; data 24 px de altura, raio 6, letra 12/16 peso 600; cabeçalho e rodapé 64 px, botões 40 px, campo em pílula de 52 px, raio 26, padding 5, letra 15 px; menu 197 px com itens de 36 px; caixa de responder 59 px. Cores continuam as da Sofia. Medido com 2 mensagens de teste na conversa do Pedro consigo mesmo, já apagadas. Também visto: ESC fecha o menu e a caixa de responder. Animações medidas: setinha 75 ms deslizando; menu abre em 300 ms (desce 8 px e cresce de 95% com um leve passo de 101%) e fecha em 300 ms encolhendo; caixa de responder sobe 24 px em 300 ms e desce igual ao fechar.

## Não medido no WhatsApp (escolha da Sofia, não cópia)
ESC sem nada aberto; antigas carregando sozinhas; conversa arquivada continuar arquivada quando chega mensagem (no WhatsApp é uma configuração).

## Pastas, notas e subpáginas na Conversa (19/11, no web.html; NÃO medido no WhatsApp, escolha da Sofia)
Pedido do Pedro: "notas, pastas etc. aparecerem de uma forma funcional". Conferido no código atual (`ChatHub.tsx`, `page-chat.ts`, `note-chat.ts`), sem os dados reais dele. Pasta = caderno do bloco de Notas (um nível só); nota = folha.

Hoje não funciona → fica assim:
- Bloco de Notas aparece como balão "Base de dados · abrir na página" (o rótulo errado: o bloco é do tipo `collection`) e só leva à página → balão "Notas · 2 pastas · 3 notas" com **Ver pastas e notas**, que abre o painel da página.
- Pastas não aparecem em lugar nenhum da Conversa → painel **Dentro de <página>** (clique no nome da página no topo, como "Dados do contato" no WhatsApp): pastas que abrem e fecham, com as notas dentro, **+ Nova nota em <pasta>** e **+ Nova pasta**.
- Subpáginas ficam empilhadas no topo da conversa, antes das mensagens → vão para o painel (seção Subpáginas, **+ Subpágina**). O botão "Subpágina" do topo sai dali, a função fica.
- Notas na lista com o mesmo ícone das páginas e sem dizer de onde são → ícone 📝 e a linha "📁 Mercado · Casa"; filtro **Notas** ao lado de Tudo / Páginas.
- Conversa de uma nota mostra "em <página>", mas não a pasta → topo "Nota · 📁 Mercado · em Casa"; "Casa" abre a página com o painel aberto. Clicar no nome da nota abre um painel pequeno com Abrir a nota e Arquivar/Trazer (funções de hoje).
- **"Apagar" num balão de Notas/Tabela/Quadro apaga o bloco inteiro da página** (todas as pastas e notas), só com uma confirmação → esses balões não têm Apagar no chat (nem entram em "Selecionar várias → Excluir"): o menu mostra Abrir / Abrir na página e o aviso "Apagar pasta, nota ou tabela: só na página".
- Tabela e Quadro só dizem "abrir na página" → balão com as 2 primeiras linhas e **Abrir na página**.
- Link de página leva à página dona, não à página do link → balão **Abrir conversa** daquela página.
- Subpágina tem o mesmo painel (com as pastas e subpáginas dela). Abrir a página e Arquivar/Trazer continuam: no fim do painel (e o alfinete em cada nota/subpágina tira ou põe na lista principal).
- Painel: abaixo de 1600 px de largura ele passa por cima da conversa (não aperta a conversa).
- Campo de escrever: no WhatsApp a pílula de 52 px contém os botões (+ e emoji); aqui os botões ficam fora dela (escolha da Sofia, como já estava).

Arquivadas (decidido 19/11): não chega mensagem de outra pessoa. Páginas e notas novas entram em Arquivadas e ficam lá até o Pedro tirar. Ponto aberto: hoje a página criada pelo "+" da própria Conversa nasce na principal (`chat_main:true` em `ChatHub.tsx`); no desenho, nota e subpágina criadas no painel abrem na hora, mas ficam em Arquivadas.

## Correções sem desenho (entram junto)
- O quadro da conversa recarrega de novo 6 s depois de abrir (`Chat.tsx`, `setTimeout(...loadBoard...,6000)`): pode trocar/piscar; recarregar só quando mudar.
- Juntar as duas telas (Chat e ChatHub) no mesmo menu/componente de mensagem.

## Fica como está (não aparece nas telas, mas não sai)
Quadro da conversa (Agora / Assuntos anteriores); áudio com transcrição e "Áudio apagado. A transcrição continua"; anexos, arrastar ("Solte para anexar à conversa") e Remover; visualizador de foto; prévia de link; barra "Criar" (05/06); "Tarefa em contexto"; "Aguardando a Sofia…"; Arquivadas, Nova página, Pesquisar conversas; Marcar tarefa nas linhas-tarefa da página.
- Responder e Criar abertos juntos: só uma barra por vez; abrir uma fecha a outra.
