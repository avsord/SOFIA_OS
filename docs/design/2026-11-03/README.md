# Desenho aprovado — app com a cara do site (chat, 03/11/2026)

Referência para implementar e conferir as telas do app (e do site, quando indicado).
Abra `index.html` no navegador para ver tudo lado a lado. Os arquivos são o desenho,
não o código: textos entre [colchetes] são marcadores, não dados reais; nomes e valores
de exemplo também não são reais. Onde o desenho e uma função que já existe no código
conflitarem, a função vale: adapte o desenho, não tire a função.

O Pedro recusou várias versões durante a conversa. As recusas estão listadas porque
são tão importantes quanto o que foi aprovado: não volte a elas.

## Regras gerais (todas as telas)
- Título da tela = nome do app, sempre (28, semibold, letras juntas). Nunca um seletor, nunca o nome do item aberto.
- Botão de voltar: só a seta, pequena, sem moldura, centralizada na altura do título.
- Botão +: só o sinal de +, sem círculo cheio, do tamanho da seta e da lupa, alinhado ao título. Lupa no mesmo estilo.
- Fontes no estilo do app original (Plus Jakarta; o nome na saudação em Playfair Display itálico). Texto alinhado à esquerda.
- Tudo alinhado: botões, números e textos de blocos lado a lado na mesma altura (grade fixa).
- Painéis que abrem: sempre PARA BAIXO, colados embaixo do botão tocado. Nunca abrir de baixo da tela quando se tocou em cima.
- Nada fora da tela do celular (sem rolagem lateral).

## Início (01)
- Topo: data em maiúsculas lilás, "Boa noite, *Pedro*" (nome itálico), frase do dia. Sem o mini chat. Sino e foto no canto.
- "Seu dia" = a linha do tempo real do site (períodos, faixas de duração, bolinha agrupada, pílula da Rotina, "agora"), não uma linha simplificada.
- Segurar num horário vazio da linha → vai para a Conversa com a barrinha de criar (05).
- Blocos iguais aos do site, com as mesmas funções (setas/arrastar, bolinhas dos itens, Tomei, Concluir).
  Agenda na largura toda (lista de próximos que rola, mostrando os outros dias como no site); os demais
  quadrados e do mesmo tamanho, sem vão no meio. Rotina: o grupo vira "Cápsulas ⌄" no título (sem pílula grande).
  Price Tracker, Encomendas e Rotina: bolinhas dos itens + passar de item.
  Implementado no chat com Rotina e Finanças na largura toda porque o conteúdo real não coube no quadrado — se couber com ajuste, voltar ao quadrado.

## Agenda (03, 04)
- A mesma Agenda do site: Ano / Mês / Dia, com a animação de zoom do site.
- No Mês do celular: bolinhas coloridas embaixo do dia (NÃO traços).
- No Dia: segurar num horário vazio cria naquele horário.

## Criar pela linha do tempo (05, 06)
- Abre a Conversa normal; em cima do campo, barrinha estilo "responder no WhatsApp": traço lilás, "Criar · hoje às 22:00", "Linha do tempo · diga o que é, a Sofia cria", seta e X.
- A seta abre um menu minimalista (como o do site): Agenda (Compromisso, Tarefa, Lembrete, Rotina) e Finanças (Despesa, Receita), já no horário segurado.
- Recusado: folha grande subindo de baixo com ícones em grade e "Outros apps".

## Biblioteca (20, 21, 22) e Notas (23, 24)
- Título "Biblioteca" / "Notas". Abaixo, uma barra com botões [Área ⌄] [Filtros ⌄] (Notas: só [Área ⌄]) e a ordem à direita.
- Área ⌄ abre a lista das áreas (Biblioteca: Tudo, Filmes, Livros, Séries, Receitas…; Notas: só as áreas que o usuário criou) com a contagem, "Nova área" e "Organizar".
- Filtros ⌄ abre os filtros SÓ da área escolhida (ex.: Filmes → Terror, Sci-fi…; Receitas → Massas…; Livros → Dostoiévski…) com caixinhas, e por ÚLTIMO a linha "Nota" com 5 estrelas pequenas (toca para escolher a nota mínima).
- Linha de resultado: "Terror · 4★ · 4 de 21 filmes" + Limpar.
- Recusados: título como seletor de área; abas de área + "Mais"; fileiras soltas de etiquetas espalhadas; Fixadas/Privadas/Arquivadas misturadas no filtro; botões grandes de nota ("5", "4 ou +"…); estrelas grandes ocupando a largura.

## Tarefas (35)
- Na ordem em que foram criadas (a prioridade aparece em cada linha; filtros de prioridade no topo).

## Páginas (36)
- "Recentes" em cartõezinhos pequenos + "Todas as páginas" em árvore com os ícones das páginas. Recusado: cartão grande "abriu por último".

## Outras telas (02, 10–14, 30–34)
- E-mails, Listas, Encomendas, Rotina, Lembretes, Finanças, Price Tracker, Apps, Perfil, Notificações: seguem as regras gerais. As telas de verdade já tinham a maior parte do conteúdo; o desenho serve para padronizar cabeçalho, alinhamento e acabamento.
- Conversa: listas da Sofia ("- item") aparecem como lista de verdade.

## Site (90, 91)
- Perfil: duas colunas (identidade + menu das seções à esquerda; seções em cartões à direita). Foto do perfil no topo, à direita. NUNCA o perfil no canto inferior esquerdo.
- Notificações (tela inteira): filtros à esquerda com contagem; cartões por dia à direita; ações ao passar o mouse.
