<!-- 07/11/2026: lista de controle do Drive contra a Ajuda oficial do Google Drive (atalhos, organizar, pesquisar, enviar, baixar, ver, atividade). Cada FALTA/PARCIAL vira codigo + passo do robo (SOFIA_APP/tools/drive-lab/robot.cjs). Atualizar o status a cada rodada. -->
# Matriz de paridade: Google Drive na Web (computador) x Drive da Sofia

Data: 07/11/2026. Fonte do Google: `kb/google-drive-ajuda.txt` (páginas oficiais da Ajuda, em português). Código lido: `SOFIA_APP/src/screens/Drive.tsx`, `SOFIA_APP/src/components/DrivePreview.tsx`, `SOFIA_APP/src/components/DriveVideoPlayer.tsx`, `SOFIA_APP/src/lib/drive-upload.ts`, `SOFIA_APP/src/lib/api.ts` (métodos `sd*`, linhas 319-360), `src/services/google.js` (funções `sd*`, linhas 1234-1445), `src/channels/mobile.js` (bloco `/api/mobile/md/sofiadrive/`, linhas 315-355), `SOFIA_APP/tools/drive-lab/robot.cjs`.

Convenções:
- Caminhos curtos: `Drive.tsx` = `SOFIA_APP/src/screens/Drive.tsx`; `Preview` = `SOFIA_APP/src/components/DrivePreview.tsx`; `Player` = `SOFIA_APP/src/components/DriveVideoPlayer.tsx`; `google.js` = `src/services/google.js`; `mobile.js` = `src/channels/mobile.js`; `api.ts` = `SOFIA_APP/src/lib/api.ts`.
- "robô já" = existe um `check(...)` em `robot.cjs` que verifica isso hoje (nome do check entre aspas).
- O Google falso do laboratório (`tools/drive-lab/fake-google.cjs`) já entende `files.copy`, `fullText contains`, `orderBy viewedByMeTime/quotaBytesUsed` e `DELETE`; ainda não simula `permissions`, `revisions`, `emptyTrash` nem drives compartilhados (os testes que dependem disso dizem "simular no fake-google").
- Decisão do dono: um clique ABRE. Selecionar é pela caixinha ao passar o mouse, Ctrl/Shift+clique, Ctrl+A ou arrastando no vazio. Isso não é lacuna.
- Fato que pesa em quase todos os atalhos: o teclado do Drive ignora toda tecla com Alt (`Drive.tsx:255`) e toda tecla com Ctrl, exceto Ctrl+A (`Drive.tsx:262`).

## 1. Mouse e seleção

| Função do Google Drive | Status | Evidência | Como implementar | Teste do robô |
|---|---|---|---|---|
| Um clique abre o arquivo ou a pasta (decisão do dono) | TEM | Drive.tsx:214, 127-134 | — | robô já: "um clique abre a pasta (sem precisar de dois)", "um clique abre a foto" |
| Caixinha de marcar ao passar o mouse | TEM | Drive.tsx:297-302 | — | robô já: "caixinha de marcar ao passar o mouse seleciona sem abrir" |
| Ctrl+clique soma ou tira da seleção | TEM | Drive.tsx:212 | — | robô já: "Ctrl+clique seleciona, Ctrl soma, Ctrl+A tudo, Esc limpa" |
| Shift+clique seleciona uma faixa | TEM | Drive.tsx:211 | — | robô já: "Shift seleciona uma faixa" |
| Arrastar no vazio desenha o retângulo e seleciona (rola sozinho na borda; Ctrl/Shift soma) | TEM | Drive.tsx:226-247 | — | robô já: "arrastar o mouse num lugar vazio desenha o retangulo..."; falta um caso com Ctrl apertado somando à seleção anterior |
| Clicar no vazio tira a seleção | TEM | Drive.tsx:218-222 | — | robô já: "clicar no vazio tira a selecao" |
| Clique direito num item abre o menu | TEM | Drive.tsx:292 (contextMenu), 145-160 | — | robô já usa clique direito em "estrela e a lista Com estrela" |
| Itens do menu de contexto iguais aos do Google | PARCIAL | Drive.tsx:152-159: só Visualizar, Baixar, Abrir no Google, Renomear, Mover, Estrela, Lixeira. Faltam Compartilhar, Copiar link, Fazer uma cópia, Organizar > Adicionar atalho / Cor da pasta, Informações do arquivo (Detalhes, Atividade, Versões) | Acrescentar no `menu()` cada ação quando a função existir (files.copy, permissions, webViewLink, files.update folderColorRgb, painel de detalhes) | Clique direito em "Contrato assinado.pdf"; `context-menu` innerText contém "Compartilhar", "Copiar link", "Fazer uma cópia", "Informações" |
| Clique direito com vários selecionados age em todos | TEM | Drive.tsx:145-151 | — | Ctrl+clique em 2 itens, clique direito num deles; menu mostra "Mover 2 itens para…" |
| Botão ⋮ (Mais ações) em cada item | TEM | Drive.tsx:294 | — | Clicar `Mais ações para leia-me.txt`; aparece `context-menu` |
| Clique direito no vazio: Nova pasta / Enviar arquivos / Enviar pasta | TEM | Drive.tsx:339, 392 | — | robô já: "clique direito no vazio oferece Nova pasta e Enviar" |
| Arrastar um item para uma pasta move | TEM | Drive.tsx:199-205 | — | robô já: "arrastar arquivo para uma pasta move" |
| Arrastar vários selecionados de uma vez | TEM | Drive.tsx:204 (`sel.includes(it.id) ? selItems`) | — | Ctrl+clique em 2 arquivos, arrastar um deles até "Pasta do robô"; `state()` mostra os 2 com o novo `parents` |
| Arrastar para "Meu Drive" no menu lateral ou para uma pasta do caminho | TEM | Drive.tsx:354 (dropOn root), 384 | — | Dentro de uma pasta, arrastar um arquivo até `drive-crumb-0`; `state()` mostra o arquivo na raiz |
| Duplo clique (hábito de quem vem do Google) não pode abrir e fechar na hora | PARCIAL | Drive.tsx:208-215 não ignora o segundo clique; o segundo clique cai no fundo do visualizador, que fecha no clique (Preview:124). Não verificado; risco provável em arquivos fora da área do conteúdo | Ignorar clique no mesmo item até 400 ms depois de abrir, ou ligar `dblclick` (já previsto em `bindDom`, Drive.tsx:34-40) como "nada a fazer" | `page.dblclick` em "Contrato assinado.pdf", esperar 800 ms; `drive-preview` continua aberto. Repetir numa pasta: abre só aquela pasta |
| Nome inteiro ao passar o mouse sobre nome cortado | FALTA | Drive.tsx:306-307, 316 (`numberOfLines={1}`, sem `title`) | Em `bindDom`, `setAttribute('title', it.name)` | `getAttribute('title')` do item com nome longo é o nome inteiro |
| Arrastar arquivo do Drive para a área de trabalho | NÃO SE APLICA | A própria Ajuda do Google diz que não é possível | — | — |

## 2. Atalhos de teclado (todos os da fonte, um por linha)

Observação: nas primeiras linhas da tabela de navegação o texto extraído está deslocado (descrição e tecla trocadas uma posição). As letras abaixo seguem a ordem da fonte.

| Função do Google Drive | Status | Evidência | Como implementar | Teste do robô |
|---|---|---|---|---|
| Alt+G, N: ir para o painel de navegação (lista de pastas) | FALTA | Drive.tsx:255 ignora Alt | Leitor de sequência Alt+G → próxima tecla no `onKey`; foco no primeiro `drive-view-*` | Alt+G, N; `document.activeElement` tem testID `drive-view-drive` |
| Alt+G, F: ir para a lista de itens | FALTA | Drive.tsx:255 | Mesma sequência; foco no primeiro `drive-item-*` (precisa de foco por item, ver Ctrl+setas) | Alt+G, F; foco num `drive-item-*` |
| Alt+G, I: ir para a visualização de itens (linha deslocada na fonte) | FALTA | Drive.tsx:255 | Igual ao Alt+G, F | Igual ao anterior |
| Alt+V, L: alternar grade e lista | FALTA | Botão existe (Drive.tsx:367), atalho não (Drive.tsx:255) | Alt+V, L chama `setLayoutSaved` | Alt+V, L; aparece o cabeçalho "Modificado" da lista |
| Alt+G, C: ir para o conteúdo da página | FALTA | Drive.tsx:255 | Foco na área de itens (`scrollRef`) | Alt+G, C; foco dentro de `sofia-drive` |
| Alt+G, D: ir para o painel de detalhes | FALTA | Não há painel de detalhes | Depois do painel (seção 10), focar nele | Alt+G, D; foco no `drive-details` |
| Alt+G, T: ir para o topo (barra do Google) | FALTA | Drive.tsx:255 | Foco em `drive-search` | Alt+G, T; foco em `drive-search` |
| Alt+G, A: ir para o status do download | FALTA | Download vai direto para o navegador (Drive.tsx:121); não há painel de download | Painel de download quando houver .zip (seção 6) | Depois do .zip: Alt+G, A foca o painel |
| Alt+G, U: ir para o status do upload | FALTA | Painel existe (Drive.tsx:419-428), atalho não | Alt+G, U foca `drive-uploads` | Durante um envio, Alt+G, U; foco em `drive-uploads` |
| Alt+V, E: mostrar ou ocultar aprovações | NÃO SE APLICA | Aprovações fora do escopo | — | — |
| Alt+V, D: mostrar ou ocultar o painel de detalhes | FALTA | Não há painel | Alternar o painel da seção 10 | Alt+V, D; `drive-details` aparece e some |
| Alt+V, A: mostrar ou ocultar o painel de atividades | FALTA | Não há painel | Alternar a aba Atividade do painel | Alt+V, A; aba Atividade visível |
| Shift+Espaço: selecionar ou desmarcar o item | FALTA | Drive.tsx:251-275 não trata Espaço | No `onKey`, Shift+Espaço alterna o item em foco | Seta até um item, Shift+Espaço; `selCount` 1; de novo, 0 |
| Seta para baixo: selecionar o item abaixo | TEM | Drive.tsx:264, 283-285 | — | robô já: "setas: direita/baixo andam pela grade" |
| Seta para cima: selecionar o item acima | TEM | Drive.tsx:264, 283-285 | — | Seta para cima depois de descer; volta ao item anterior (bounding box acima) |
| Seta para a esquerda: selecionar o item à esquerda | TEM | Drive.tsx:282 | — | Seta para a esquerda; item selecionado anterior no DOM |
| Seta para a direita: selecionar o item à direita | TEM | Drive.tsx:282 | — | robô já: "setas: direita/baixo andam pela grade" |
| Shift+seta para baixo: ampliar a seleção | TEM | Drive.tsx:265 | — | Ctrl+clique num item, Shift+↓; `selCount` > 1 |
| Shift+seta para cima: ampliar a seleção | TEM | Drive.tsx:265 | — | Igual, com Shift+↑ |
| Shift+seta para a esquerda: ampliar a seleção | TEM | Drive.tsx:265 | — | Shift+← duas vezes; `selCount` 3 |
| Shift+seta para a direita: ampliar a seleção | TEM | Drive.tsx:265 | — | Shift+→ duas vezes; `selCount` 3 |
| Ctrl+A: selecionar todos os itens visíveis | TEM | Drive.tsx:261 | — | robô já: "Ctrl+clique seleciona, Ctrl soma, Ctrl+A tudo, Esc limpa" |
| Esc: desmarcar tudo | TEM | Drive.tsx:268 | — | robô já (mesmo check) |
| Ctrl+seta para baixo: mover sem mudar a seleção | FALTA | Drive.tsx:262 sai com Ctrl; as setas não movem o foco, só a seleção | Foco por item (tabindex móvel) separado da seleção; Ctrl+setas movem só o foco | Ctrl+↓; `activeElement` mudou e `selCount` igual |
| Ctrl+seta para cima: mover sem mudar a seleção | FALTA | Drive.tsx:262 | Igual | Igual, com Ctrl+↑ |
| Ctrl+seta para a esquerda: mover sem mudar a seleção | FALTA | Drive.tsx:262 | Igual | Igual, com Ctrl+← |
| Ctrl+seta para a direita: mover sem mudar a seleção | FALTA | Drive.tsx:262 | Igual | Igual, com Ctrl+→ |
| Enter: abrir os itens selecionados | TEM | Drive.tsx:272 (abre o último selecionado) | — | Ctrl+clique num PDF, Enter; `drive-preview` aparece (hoje o robô só testa Enter num botão) |
| Ctrl+Enter: abrir em nova guia | FALTA | Drive.tsx:262 | `window.open` com `?pasta=<id>` para pasta, `it.web` ou o link assinado para arquivo | Ctrl+Enter com pasta selecionada; `context.waitForEvent('page')` com `pasta=` na URL |
| F2: renomear | TEM | Drive.tsx:274 | — | robô já: "renomear (F2) seleciona so o nome, sem a extensao" |
| Ctrl+Alt+A: compartilhar | FALTA | Drive.tsx:255; não há compartilhar | Abrir o diálogo da seção 11 | Ctrl+Alt+A; aparece `drive-share` |
| Ctrl+Alt+M: mover para uma pasta | FALTA | Drive.tsx:255; `setMoving` existe (Drive.tsx:157) | Ctrl+Alt+M chama `setMoving(selecionados)` | Ctrl+Alt+M; aparece o diálogo "Mover" |
| Ctrl+Alt+S: estrela | FALTA | Drive.tsx:255; `star` existe (Drive.tsx:139) | Ctrl+Alt+S chama `star(sel, !todosComEstrela)` | Ctrl+Alt+S; `state()` mostra `starred: true` |
| Ctrl+Alt+R: criar atalho (aparece duas vezes na fonte) | FALTA | Não existe criar atalho | files.create com mimeType `application/vnd.google-apps.shortcut` e `shortcutDetails.targetId` | Ctrl+Alt+R, escolher pasta; `state()` tem um atalho apontando para o item |
| Delete ou #: remover | PARCIAL | Delete (e Backspace) manda para a lixeira (Drive.tsx:273); "#" não faz nada | Aceitar `e.key === '#'` no mesmo ramo | robô já testa Delete; acrescentar "#" e conferir `trashed` no `state()` |
| Ctrl+Alt+L: copiar os URLs dos selecionados | FALTA | Drive.tsx:255; `it.web` (webViewLink) já vem do servidor (google.js:1260) | `navigator.clipboard.writeText(links.join('\n'))` | `context.grantPermissions(['clipboard-read'])`, Ctrl+Alt+L, ler a área de transferência: contém `drive.google.com` |
| Ctrl+Shift+C: copiar os títulos | FALTA | Drive.tsx:262 | Copiar nomes como texto e como link (`text/html` com `<a href=webViewLink>`) | Ctrl+Shift+C; área de transferência tem o nome |
| Ctrl+C: copiar (para colar como cópia ou link, Ajuda "Organizar") | FALTA | Drive.tsx:262 | Guardar os ids numa área interna e escrever o link na área de transferência | Ctrl+C, abrir outra pasta, Ctrl+V; `state()` tem "Cópia de …" (o fake-google já tem /copy) |
| Ctrl+X: recortar | FALTA | Drive.tsx:262 | Guardar ids com modo "mover" | Ctrl+X, abrir outra pasta, Ctrl+V; `parents` mudou no `state()` |
| Ctrl+V: colar (mover o recortado ou fazer cópia do copiado) | FALTA | Drive.tsx:262 | Recortado: `sdUpdate(parent)`; copiado: files.copy com `parents:[pasta atual]` | Ver os dois testes acima |
| Ctrl+Shift+V: colar como atalho | FALTA | Drive.tsx:262 | files.create de atalho para cada id guardado | Ctrl+C, outra pasta, Ctrl+Shift+V; `state()` tem atalho |
| Ctrl+Y: refazer a última ação desfeita (aparece duas vezes na fonte) | FALTA | Não há pilha de refazer | Guardar a ação desfeita e reaplicar | Renomear, Ctrl+Z, Ctrl+Y; nome novo de volta no `state()` |
| Alt+C, U: enviar arquivo | FALTA | Drive.tsx:255; `pickFiles` existe (Drive.tsx:183) | Sequência Alt+C → U chama `pickFiles` | Alt+C, U; `page.waitForEvent('filechooser')` |
| Alt+C, I: enviar pasta | FALTA | Drive.tsx:255; `pickFolder` existe (Drive.tsx:187) | Alt+C → I chama `pickFolder` | Alt+C, I; `filechooser` com `webkitdirectory` |
| Alt+C, T: novo documento | FALTA | Não cria Documentos Google (Drive.tsx:339) | files.create mimeType `application/vnd.google-apps.document`, depois abrir `webViewLink` | Alt+C, T; `state()` tem um arquivo desse tipo |
| Alt+C, P: nova apresentação | FALTA | Drive.tsx:339 | files.create `application/vnd.google-apps.presentation` | Igual, com esse tipo |
| Alt+C, S: nova planilha | FALTA | Drive.tsx:339 | files.create `application/vnd.google-apps.spreadsheet` | Igual, com esse tipo |
| Alt+C, D: novo desenho | FALTA | Drive.tsx:339 | files.create `application/vnd.google-apps.drawing` | Igual, com esse tipo |
| Alt+C, F: nova pasta | FALTA | Drive.tsx:255; o diálogo existe (Drive.tsx:339, 435) | Alt+C → F chama `setNaming({mode:'folder'})` | Alt+C, F; `drive-name-input` aparece |
| Alt+C, O: novo formulário | NÃO SE APLICA | Criar Formulários pelo Drive está fora do escopo | — | — |
| Alt+N: menu Criar (Novo) | FALTA | Drive.tsx:255 | Abrir `newMenu` ancorado no `drive-new` | Alt+N; `context-menu` contém "Nova pasta" |
| Shift+F10 ou Alt+A: menu Mais ações | FALTA | Drive.tsx:255; as setas mudam a seleção mas não o foco, então o menu de teclado do navegador não cai no item | Shift+F10/Alt+A abre `menu(item atual)` na posição do item | Seta até um item, Shift+F10; `context-menu` contém "Renomear" |
| Alt+Shift+A: menu Ações na pasta atual | FALTA | Não existe menu da pasta atual (o último item do caminho não faz nada, Drive.tsx:384) | Menu da pasta aberta (nova pasta, enviar, renomear, mover, estrela, cor, compartilhar) | Alt+Shift+A; `context-menu` contém "Renomear" |
| Alt+R: menu Classificar | FALTA | Drive.tsx:255; `sortMenu` existe (Drive.tsx:336) | Alt+R chama `sortMenu` | Alt+R; `context-menu` contém "Tamanho" |
| Ctrl+Shift+S: menu Configurações | FALTA | Não há configurações | Ver "Configurações" na seção 3 | Ctrl+Shift+S; aparece `drive-settings` |
| Ctrl+/: lista de atalhos | FALTA | Drive.tsx:262 | Diálogo com a tabela de atalhos | Ctrl+/; aparece diálogo com "F2" |
| Alt+T, Q: próxima densidade visual | FALTA | Não há densidade | Estado `density` (padrão/confortável/compacto) que muda o `paddingVertical` da linha | Alt+T, Q; altura da linha muda |
| Ctrl+F: localizar | TEM | Localizar do navegador não é bloqueado; acha só o que está carregado (300 por vez, Drive.tsx:347) | — | Não dá para testar a barra do navegador no Playwright; não testar |
| Ctrl+P: imprimir | PARCIAL | Imprime a página da Sofia (navegador), não o arquivo; o visualizador não tem Imprimir (Preview:113-123) | No visualizador, `iframe.contentWindow.print()` do PDF (link assinado `preview`) | Abrir PDF, `page.evaluate` espiando `print` do quadro, Ctrl+P; chamado 1 vez |
| Ctrl+Z: desfazer a última ação | FALTA | Só o botão "Desfazer" do aviso (Drive.tsx:432); Drive.tsx:262 ignora Ctrl+Z | Ctrl+Z chama `toast.undo` enquanto o aviso estiver aberto (ou pilha própria) | Delete num arquivo, Ctrl+Z; `trashed: false` no `state()` |
| Alt+G, K: mostrar a última mensagem | FALTA | O aviso some sozinho (Drive.tsx:69) | Guardar o último aviso e reabrir | Depois de renomear, esperar o aviso sumir, Alt+G, K; `drive-toast` volta |
| /: pesquisar no Drive | FALTA | Drive.tsx:251-275 não trata "/" | "/" foca `drive-search` | Tecla "/"; foco em `drive-search` |
| Ctrl+Alt+P: visualizar itens | FALTA | Drive.tsx:255 (clique e Enter abrem; o atalho não) | Ctrl+Alt+P chama `openItem` | Seleciona PDF, Ctrl+Alt+P; `drive-preview` |
| Esc: fechar o visualizador | TEM | Preview:84 | — | Abrir PDF, Escape; `drive-preview` some (hoje o robô fecha clicando fora) |
| Espaço: reproduzir ou pausar | TEM | Player:51 | — | Abrir vídeo, Espaço; `video.paused` muda (hoje o robô chama `play()` por código) |
| + ou =: aumentar zoom | PARCIAL | Só em imagem (Preview:87); PDF e Office no quadro não reagem | Para PDF/Office: escala do quadro (`transform: scale`) ou parâmetro `#zoom=` do leitor de PDF | Abrir PDF, "+"; largura do quadro ou `#zoom` mudou |
| -: diminuir zoom | PARCIAL | Só em imagem (Preview:88) | Igual ao anterior | Igual, com "-" |

## 3. Navegação e visualizações

| Função do Google Drive | Status | Evidência | Como implementar | Teste do robô |
|---|---|---|---|---|
| Início (arquivos sugeridos, abertos ou editados por você) | FALTA | VIEWS só tem Meu Drive, Compartilhados, Recentes, Com estrela, Lixeira (Drive.tsx:27-29) | Nova lista `home`: files.list `orderBy=viewedByMeTime desc` + pastas recentes | Clicar `drive-view-home`; aparecem itens (fake-google já ordena por viewedByMeTime) |
| Meu Drive | TEM | Drive.tsx:75; google.js:1292-1298 | — | robô já: "abre o Meu Drive com as pastas e arquivos" |
| Compartilhados comigo | PARCIAL | google.js:1324 (`sharedWithMe`); a tela reordena por nome (Drive.tsx:101-104); não mostra quem compartilhou nem a data de compartilhamento | Campos `sharingUser,sharedWithMeTime`; coluna "Compartilhado por"; ordem padrão por data de compartilhamento | robô já confere presença; acrescentar: coluna "Compartilhado por" com o e-mail do fixture |
| Recentes | PARCIAL | google.js:1324: por `modifiedTime` de qualquer pessoa, máx. 60, sem pastas; o Google ordena pelo que você abriu/editou e separa em "Hoje", "Semana passada"… | `orderBy=viewedByMeTime desc` (ou `modifiedByMeTime`), paginar, títulos por período | robô já: "Recentes mostra arquivos recentes (sem pastas)"; acrescentar ordem por `viewedByMeTime` e título "Hoje" |
| Com estrela | TEM | google.js:1324 | — | robô já: "estrela e a lista Com estrela" |
| Lixeira | TEM | google.js:1324 | — | robô já: "Lixeira mostra e restaura" |
| Drives compartilhados | FALTA | `sdPages` não passa `supportsAllDrives`/`includeItemsFromAllDrives` (google.js:1284-1290); não há lista | drives.list + files.list `corpora=drive&driveId=…&supportsAllDrives=true`; `supportsAllDrives` em update/trash/copy | Simular drives no fake-google; `drive-view-shareddrives` lista o drive e abre a pasta dele |
| Computadores (backup) | NÃO SE APLICA | Fora do escopo (visão de backup do Drive para computador) | — | — |
| Spam | NÃO SE APLICA | Fora do escopo | — | — |
| Armazenamento (todos os arquivos por tamanho) | FALTA | Só a barra de uso (Drive.tsx:345, 358; google.js:1329); "Armazenamento" não é clicável | Nova lista `storage`: files.list `orderBy=quotaBytesUsed desc`, `'me' in owners`; clicar de novo inverte | Clicar "Armazenamento"; primeiro item é "grande.bin" (fake-google já ordena por quotaBytesUsed) |
| Barra de armazenamento usado | TEM | Drive.tsx:345-346, 358; google.js:1329 | — | Conferir texto "usados" no menu lateral (computador) |
| Alternar grade e lista (e lembrar) | TEM | Drive.tsx:61, 91, 367 | — | robô já clica `drive-layout` em "miniaturas das fotos aparecem"; acrescentar reload e conferir que ficou |
| Caminho de pastas clicável | TEM | Drive.tsx:341, 382-386 | — | Entrar em 2 níveis, clicar `drive-crumb-0`; volta à raiz |
| Menu da pasta atual (clicar no nome da pasta no caminho) | FALTA | Último item do caminho não faz nada (Drive.tsx:384) | `openMore` com ações da pasta aberta | Clicar no último `drive-crumb-*`; aparece `context-menu` com "Nova pasta" e "Renomear" |
| Árvore de pastas no menu lateral (expandir Meu Drive) | FALTA | Menu lateral só tem as listas fixas (Drive.tsx:354-356) | Seta ao lado de "Meu Drive" que carrega `sdList` das subpastas, recursivo, com soltar para mover | Expandir "Meu Drive"; aparece "Trabalho" no menu lateral; arrastar arquivo até ela move |
| O endereço acompanha a pasta; voltar do navegador sobe | TEM | Drive.tsx:82-89 | — | robô já: "o endereco acompanha a pasta e o voltar do navegador sobe" |
| Recarregar a página mantém a pasta | TEM | Drive.tsx:86-88 | — | robô já: "recarregar a pagina fica na mesma pasta" |
| Abrir um atalho leva ao destino | TEM | google.js:1283 (`sdResolve`) | — | robô já: "atalho abre a pasta de destino" |
| Ordenar (Nome, Data de modificação, Modificado por mim, Aberto por mim; pastas em cima ou misturadas) | PARCIAL | Drive.tsx:96-97, 336: só Nome, Modificado e Tamanho; pastas sempre em cima (Drive.tsx:104) | Acrescentar `modifiedByMeTime` e `viewedByMeTime` (campos no SD_FIELDS, google.js:1243) e a opção "Pastas: em cima / misturadas" | Ordenar por "Aberto por mim"; ordem confere com os `viewedByMeTime` do fixture |
| Colunas da lista (Nome, Proprietário, Data de modificação, Tamanho) | PARCIAL | Drive.tsx:407, 316-320: Nome, Local (só fora do Meu Drive), Modificado, Tamanho; sem Proprietário nem "por quem" | Campos `owners(displayName,me),lastModifyingUser`; coluna "Proprietário" ("eu" ou nome) | Lista no computador; cabeçalho contém "Proprietário"; item compartilhado mostra o dono do fixture |
| Densidade visual (altura das linhas) | FALTA | Não existe | Ver atalho Alt+T, Q | Ver atalho Alt+T, Q |
| Configurações (página inicial, converter uploads, abrir PDF em nova guia, densidade) | FALTA | Não existe | Menu de engrenagem guardando preferências (localStorage ou servidor) | Abrir configurações, mudar página inicial para "Início"; recarregar abre Início |
| Pasta grande (rolar e carregar mais) | TEM | Drive.tsx:391, 408; google.js:1295 (até 25 páginas de 400) | — | robô já: "pasta com 250 arquivos abre inteira (rolando)" |
| Modo escuro | TEM | Drive.tsx:13, 55 (`useTheme`) | — | `newContext({colorScheme:'dark'})`; fundo do `sofia-drive` é escuro |
| Sinal de item compartilhado | PARCIAL | Só pasta de outra pessoa fica azul (Drive.tsx:306, 315); arquivo ou pasta que EU compartilhei não tem sinal | Campo `shared` do Google no SD_FIELDS; ícone de pessoas ao lado do nome | Item com `shared: true` no fixture mostra o ícone |
| Sinal de atalho | TEM | Drive.tsx:306, 316 | — | "Atalho para Trabalho" mostra a seta |
| Miniaturas do Google | TEM | Drive.tsx:45-52; google.js:1388 | — | robô já: "miniaturas das fotos aparecem" |

## 4. Criar e enviar

| Função do Google Drive | Status | Evidência | Como implementar | Teste do robô |
|---|---|---|---|---|
| Botão Novo | TEM | Drive.tsx:339, 342-344 | — | robô já usa `drive-new` |
| Nova pasta | TEM | Drive.tsx:442; google.js:1333 | — | robô já: "criar pasta" |
| Upload de arquivo | TEM | Drive.tsx:183-185 | — | robô já: "enviar arquivo pequeno e um de 20 MB (por partes, com %)" |
| Upload de pasta | PARCIAL | Só no site (Drive.tsx:339 `WEB ?`, 187-188); o app Android não tem "Enviar pasta" | No app: `StorageAccessFramework` (expo-file-system) para escolher a pasta e listar arquivos | Site: `filechooser` com pasta de 2 arquivos; `state()` tem a pasta e os 2 |
| Arrastar arquivos do computador para a tela | TEM | Drive.tsx:190-197; drive-upload.ts | — | robô já (arquivo em cima de pasta); falta soltar uma pasta inteira com subpasta |
| Arrastar pasta inteira do computador | TEM | drive-upload.ts (`droppedSources`, `webkitGetAsEntry`) | — | Não testado: o Playwright não monta `webkitGetAsEntry`; testar pela função com objetos falsos em `page.evaluate` |
| Arquivo grande em partes, com porcentagem e cancelar | TEM | api.ts (sdUploadAny); google.js:1342-1359; Drive.tsx:425-426 | — | robô já testa 20 MB; falta o cancelar: clicar `Cancelar grande.bin` e conferir que não chegou |
| Painel de envios | TEM | Drive.tsx:419-428 | — | `drive-uploads` aparece durante o envio |
| Novo Documento Google | FALTA | `newMenu` só tem pasta e envios (Drive.tsx:339) | files.create `application/vnd.google-apps.document` na pasta aberta e abrir `webViewLink` em nova guia | Novo > Documentos Google; `state()` tem o arquivo e abre página nova |
| Nova Planilha Google | FALTA | Drive.tsx:339 | files.create `application/vnd.google-apps.spreadsheet` | Igual |
| Nova Apresentação Google | FALTA | Drive.tsx:339 | files.create `application/vnd.google-apps.presentation` | Igual |
| Novo Desenho Google | FALTA | Drive.tsx:339 | files.create `application/vnd.google-apps.drawing` | Igual |
| Novo Formulário Google | NÃO SE APLICA | Criar Formulários pela tela do Drive está fora do escopo | — | — |
| Enviar arquivo com nome que já existe: nova versão ou "Manter os dois" | FALTA | `sendFiles` sempre cria outro arquivo (Drive.tsx:164-182) | Antes de enviar, procurar o nome na pasta; perguntar; "substituir" usa files.update com mídia (upload resumable PATCH) | Enviar "pequeno.txt" duas vezes, escolher "Substituir"; `state()` tem 1 arquivo com o conteúdo novo |
| Converter uploads para o formato Google | FALTA | google.js:1342 manda o mimeType do arquivo | Opção nas configurações; na criação usar mimeType de destino `vnd.google-apps.*` | Com a opção ligada, enviar .docx; `state()` mostra mimeType `vnd.google-apps.document` |
| Enviar e criar dentro de pasta compartilhada comigo (com permissão de edição) | PARCIAL | `canWrite` é falso em pasta compartilhada (Drive.tsx:340): some a dica, o menu do vazio e o botão flutuante do celular; o "Novo" ainda funciona | Usar `capabilities.canAddChildren` do Google no lugar de `!data.shared` | Abrir pasta compartilhada editável do fixture; clique direito no vazio mostra "Nova pasta" |
| Nova pasta dentro do "Mover para" | FALTA | MoveDialog sem botão de nova pasta (Drive.tsx:452-467) | Botão "Nova pasta" no diálogo chamando `sdCreateFolder(at, nome)` | Mover > Nova pasta "X" > Mover; `state()` mostra o item dentro de "X" |
| Salvar PDF do Chrome no Drive / Drive para computador | NÃO SE APLICA | São recursos do Chrome e do programa de computador | — | — |

## 5. Organizar

| Função do Google Drive | Status | Evidência | Como implementar | Teste do robô |
|---|---|---|---|---|
| Mover para… (diálogo) | PARCIAL | Drive.tsx:452-467: só anda a partir da pasta atual; sem abas Com estrela/Compartilhados/Recentes, sem pesquisa, sem nova pasta | Abas e pesquisa no diálogo, reaproveitando `sdView`/`sdSearch` | robô já: "mover varios pelo Mover para…"; acrescentar aba "Com estrela" escolhendo destino |
| Arrastar para mover | TEM | Drive.tsx:199-205 | — | robô já |
| Desfazer mover | TEM | Drive.tsx:140-143 (só no Meu Drive) | — | Mover, clicar `drive-undo`; `parents` voltou no `state()` |
| Renomear (seleciona o nome sem a extensão) | TEM | Drive.tsx:144, 443, 446-450 | — | robô já: "renomear (F2)…" e "desfazer o renomear" |
| Adicionar ou remover estrela | TEM | Drive.tsx:139, 158, 378 | — | robô já: "estrela e a lista Com estrela" |
| Cor da pasta | FALTA | SD_FIELDS sem `folderColorRgb` (google.js:1243); ícone da pasta usa cor fixa (Drive.tsx:306) | files.update `folderColorRgb`; mostrar a cor no ícone; submenu Organizar > Cor | Clique direito numa pasta > Cor > Verde; `state()` tem `folderColorRgb`; ícone verde |
| Fazer uma cópia | FALTA | Não existe | files.copy (nome "Cópia de …", mesma pasta) | Clique direito > Fazer uma cópia; `state()` tem "Cópia de Contrato assinado.pdf" (fake-google já tem /copy) |
| Adicionar atalho | FALTA | Não existe criar atalho | files.create `application/vnd.google-apps.shortcut` com `shortcutDetails.targetId`; escolher pasta com o MoveDialog | Clique direito > Organizar > Adicionar atalho > pasta; `state()` tem o atalho |
| Remover atalho sem apagar o original | TEM | google.js:1283 (atalho só é resolvido para abrir), 1372 (lixeira age no próprio atalho) | — | Delete em "Atalho para Trabalho"; `state()`: atalho `trashed`, "Trabalho" não |
| Mandar para a lixeira | TEM | Drive.tsx:135-137; google.js:1372 | — | robô já: "Delete manda para a lixeira e Desfazer volta" |
| Remover da minha lista um item compartilhado comigo | FALTA | Menu esconde a lixeira para itens de outros (Drive.tsx:159; google.js:1372 recusa) | Ação "Remover": permissions.delete da própria permissão (ou ocultar localmente) | Clique direito em "Planilha do cliente (compartilhada)" > Remover; some de Compartilhados |
| Descrição do arquivo ou pasta | FALTA | Sem campo `description` (google.js:1243) | files.update `description` no painel de detalhes | Escrever descrição no painel; `state()` tem `description` |

## 6. Download

| Função do Google Drive | Status | Evidência | Como implementar | Teste do robô |
|---|---|---|---|---|
| Baixar um arquivo | TEM | Drive.tsx:117-126; google.js:1383 | — | robô já: "baixar Google Apresentacoes sai como .pptx…" |
| Docs, Planilhas e Apresentações saem em .docx, .xlsx, .pptx | TEM | google.js SD_EXPORT, 1375-1386 | — | robô já (mesmo check) |
| Baixar vários de uma vez | PARCIAL | Drive.tsx:149, 376: um download por arquivo (o navegador pode bloquear vários); o Google junta num .zip | Rota no servidor que monta um .zip em fluxo (pastas e Docs convertidos) | Ctrl+clique em 3 arquivos > Baixar; um único `download` terminado em .zip |
| Baixar uma pasta | FALTA | Drive.tsx:118 e google.js:1384 recusam | Mesma rota de .zip, percorrendo a pasta (sem nada da área da Sofia) | Clique direito em "Fotos 📷 de família" > Baixar; .zip com retrato.png dentro |
| Baixar em outro formato (PDF, etc.) | FALTA | Formato fixo por tipo (google.js SD_EXPORT) | Submenu "Baixar como" usando files.export com o mimeType escolhido | Baixar "Notas da reunião" como PDF; `content-disposition` termina em .pdf |
| Baixar no app do celular (abre o compartilhar do aparelho) | TEM | Drive.tsx:122-124 | — | Não coberto pelo robô (é o app Android) |
| Aviso de arquivo suspeito, com "baixar mesmo assim" | FALTA | Erro do Google vira mensagem genérica (google.js:1377) | Tratar `cannotDownloadAbusiveFile` e repetir com `acknowledgeAbuse=true` depois de confirmar | Fixture com arquivo marcado como abusivo no fake-google; aparece o aviso e o botão |

## 7. Visualização

| Função do Google Drive | Status | Evidência | Como implementar | Teste do robô |
|---|---|---|---|---|
| Ver PDF | TEM | Preview:107-109 (quadro) | — | robô já: "PDF aparece no visualizador (quadro liberado)" |
| Ver Word, Excel, PowerPoint | TEM | Preview:79; google.js:1427-1445 (vira PDF) | — | robô já: "ver Proposta comercial.docx (vira PDF)" e outros |
| Abrir Documentos, Planilhas e Apresentações Google | PARCIAL | Abre um PDF dentro da Sofia (Preview:79); o Google abre o editor; há o botão "Abrir no Google" (Preview:120) | Clique num `vnd.google-apps.*` abre `webViewLink` em nova guia (ou perguntar uma vez) | Clicar "Notas da reunião"; `context.waitForEvent('page')` com docs.google.com |
| Imagens com zoom | TEM | Preview:135-150 | — | robô já: "foto abre e da zoom" |
| Vídeo (player, tela cheia, velocidade, janela flutuante) | TEM | Player:8, 27-28, 47-54 | — | robô já: "video toca, avanca e pula" |
| Áudio | TEM | Preview:107 | — | robô já: "audio toca" |
| Texto | TEM | Preview:104 (só os primeiros 256 KB, com aviso) | — | robô já: "texto com acentos aparece" |
| ZIP e outros tipos sem visualização | PARCIAL | `viewable` falso para zip e outros (Preview:41): o clique baixa direto (Drive.tsx:131); o Google abre a tela "sem visualização" com Baixar (e lista o conteúdo do .zip) | Abrir o visualizador com ícone, nome, tamanho e botão Baixar; para .zip, ler o índice no servidor | Clicar "backup.zip"; aparece `drive-preview` com "Baixar", sem download automático |
| Anterior e próximo (setas, botões e "1 de N") | TEM | Preview:91, 98-100, 119 | — | robô já: "setas passam de arquivo no visualizador" |
| Clicar fora fecha | TEM | Preview:124 | — | robô já: "clicar fora fecha o visualizador" |
| Abrir com (outro app) | PARCIAL | Só "Abrir no Google" (Drive.tsx:155; Preview:120); não há lista de apps | Submenu "Abrir com" com os editores do Google pelo `webViewLink`; apps de terceiros ficam de fora | Clique direito num .docx > Abrir com; aparece "Documentos Google" |
| Imprimir pelo visualizador | FALTA | Barra do visualizador sem Imprimir (Preview:113-123) | Botão Imprimir chama `print()` do quadro do PDF | Ver Ctrl+P |
| Compartilhar, estrela e detalhes dentro do visualizador | FALTA | Barra só tem zoom, contador, Abrir no Google e Baixar (Preview:113-123) | Botões que reutilizam as ações do menu | Abrir PDF; barra contém "Compartilhar" e "Detalhes" |
| App do celular: foto e texto no app, o resto no visualizador do aparelho | TEM | Preview:56-62, 152-176 | — | Não coberto pelo robô (app Android) |

## 8. Pesquisa e filtros

| Função do Google Drive | Status | Evidência | Como implementar | Teste do robô |
|---|---|---|---|---|
| Pesquisar pelo nome no Drive todo | TEM | Drive.tsx:94-95; google.js:1315-1320 | — | robô já: "pesquisa no Drive todo, com onde esta, sem nada da Sofia" |
| Pesquisar pelo texto de dentro do arquivo | FALTA | Só `name contains` (google.js:1318) | `(name contains 'x' or fullText contains 'x')` | Pesquisar uma palavra que só existe no texto de "leia-me.txt"; aparece (fake-google já entende fullText) |
| Resultados por relevância | PARCIAL | A tela reordena os resultados por nome (Drive.tsx:102-104) | Na pesquisa, manter a ordem do servidor até a pessoa clicar num cabeçalho; sem `orderBy` com fullText | Pesquisar; primeiro resultado é o mais relevante do fixture |
| Mostra onde está cada resultado | TEM | google.js:1300-1311; Drive.tsx:318 | — | robô já (mesmo check) |
| Lista suspensa com resultados enquanto digita | FALTA | Resultados só aparecem na área principal (Drive.tsx:94-100) | Menu abaixo de `drive-search` com os 5 primeiros e "Enter para mais" | Digitar "relat"; aparece lista abaixo da caixa |
| Esc limpa a pesquisa | TEM | Drive.tsx:334 | — | Digitar, Escape; `drive-search` vazio |
| Filtro (chip) Tipo | FALTA | Não há chips | Chip com Pastas, Documentos, Planilhas, Apresentações, PDF, Fotos, Vídeos…; `mimeType = …` no q | Chip Tipo > PDF; só PDFs na tela |
| Filtro (chip) Pessoas | FALTA | Não há chips | `'email' in owners` (ou `in writers`/`in readers`) | Chip Pessoas > dono do fixture; só os itens dele |
| Filtro (chip) Modificado | FALTA | Não há chips | Hoje / 7 dias / 30 dias / este ano / período: `modifiedTime > '…'` | Chip Modificado > Últimos 7 dias; só itens recentes do fixture |
| Filtro (chip) Local (Em qualquer lugar, Meu Drive, Compartilhados, Com estrela, Lixeira, esta pasta) | FALTA | Não há chips; com 2 letras a pesquisa sempre troca para o Drive todo (Drive.tsx:95, 100) e `sdList(folder, q)` existe sem uso (api.ts:320; google.js:1292) | Chip Local; "Esta pasta" usa `sdList(folder, q)`; lixeira usa `trashed=true` | Dentro de "Trabalho", chip Local > Esta pasta, pesquisar "001"; só itens de "Trabalho" |
| Remover um chip e "Limpar filtros" | FALTA | Não há chips | X em cada chip e botão "Limpar filtros" | Ligar 2 chips, "Limpar filtros"; lista volta inteira |
| Combinar chip com texto | FALTA | Não há chips | Juntar as condições com `and` no q | Chip Tipo > Apresentações + texto "Pitch"; só "Pitch" |
| Sugestão de filtro ao digitar (ex.: "doc" sugere Documentos) | FALTA | Não existe | Dicionário de palavras → chip sugerido na lista suspensa | Digitar "doc"; sugestão "Documentos" aparece |
| Pesquisa avançada: aspas (frase exata) | FALTA | O texto vai inteiro para `name contains` (google.js:1318) | Reconhecer "…" e usar `fullText contains '"frase"'` | Pesquisar "\"Contrato assinado\""; só esse arquivo |
| Pesquisa avançada: sinal de menos (excluir palavra) | FALTA | google.js:1318 | Palavra com "-" vira `not fullText contains 'x'` e `not name contains 'x'` | Pesquisar "relatório -001"; não aparece "Relatório 001.txt" |
| Pesquisa avançada: owner: | FALTA | google.js:1318 | `'email' in owners` | `owner:` com o e-mail do dono do fixture; só os itens dele |
| Pesquisa avançada: pendingowner:me | FALTA | google.js:1318 | Arquivos com permissão `pendingOwner` para mim (permissions.list e filtro) | Simular permissão pendente no fake-google; aparece o arquivo |
| Pesquisa avançada: creator: (drives compartilhados) | NÃO SE APLICA | A API do Drive não tem "criador" na pesquisa nem no arquivo; depende de drives compartilhados | — | — |
| Pesquisa avançada: to: | FALTA | google.js:1318 | Itens meus com `'email' in readers or writers`; to:me = `sharedWithMe` | `to:me`; só itens compartilhados comigo |
| Pesquisa avançada: from: | FALTA | google.js:1318 | from:me = meus e compartilhados; from:email = `sharedWithMe and 'email' in owners` | `from:` com o e-mail do fixture; só a planilha compartilhada |
| Pesquisa avançada: app: | NÃO SE APLICA | A pesquisa da API do Drive não tem filtro por app | — | — |
| Pesquisa avançada: sharedwith: (pessoa, me, external, public) | FALTA | google.js:1318 | `'email' in readers/writers`; public = `visibility = 'anyoneWithLink' or 'anyoneCanFind'` | `sharedwith:public` com fixture público; só ele |
| Pesquisa avançada: is:starred | FALTA | google.js:1318 | `starred = true` | `is:starred`; só os com estrela |
| Pesquisa avançada: is:trashed | FALTA | A pesquisa sempre põe `trashed=false` (google.js:1318) | `trashed = true` quando pedido | `is:trashed`; só itens da lixeira |
| Pesquisa avançada: type: (pasta, documento, planilha, apresentação, PDF, imagem, vídeo, desenho, formulário, site, script, tabela, layout de e-mail, Jam) | FALTA | google.js:1318 | Tabela tipo → `mimeType` | `type:spreadsheet`; só planilhas |
| Pesquisa avançada: before: e after: | FALTA | google.js:1318 | `modifiedTime < 'AAAA-MM-DD'` / `>` | `after:` com data do fixture; só os mais novos |
| Pesquisa avançada: createdbefore: e createdafter: | FALTA | google.js:1318; `createdTime` não está no SD_FIELDS (google.js:1243) | `createdTime < … / >` | `createdafter:`; confere com `createdTime` do fixture |
| Pesquisa avançada: title: | FALTA | "title:Congresso" vira a busca literal pelo texto "title:Congresso" (google.js:1318) | Tirar o prefixo e usar `name contains` | `title:Contrato`; aparece "Contrato assinado.pdf" |
| Pesquisa avançada: followup: | NÃO SE APLICA | A pesquisa da API do Drive não tem itens de ação e sugestões | — | — |
| Pesquisa avançada: is:unorganized | FALTA | google.js:1318 | Meus arquivos sem pasta: `'me' in owners` e filtrar sem `parents` no servidor | Fixture com arquivo sem pasta; `is:unorganized owner:me` mostra só ele |
| Encontrar arquivos por tamanho | FALTA | Ver "Armazenamento" na seção 3 | files.list `orderBy=quotaBytesUsed desc` | Ver seção 3 |

## 9. Lixeira

| Função do Google Drive | Status | Evidência | Como implementar | Teste do robô |
|---|---|---|---|---|
| Ver a lixeira | TEM | google.js:1324 (`trashed=true and 'me' in owners`) | — | robô já: "Lixeira mostra e restaura" |
| Restaurar um ou vários | TEM | Drive.tsx:138, 146, 375; google.js:1373 | — | robô já (mesmo check) |
| Desfazer ao mandar para a lixeira | TEM | Drive.tsx:137, 432 | — | robô já: "Delete manda para a lixeira e Desfazer volta" |
| Aviso de que o Google apaga em 30 dias | TEM | Drive.tsx:394 | — | Abrir a Lixeira; `drive-status` contém "30 dias" |
| Excluir para sempre | FALTA | Lixeira só oferece Restaurar (Drive.tsx:146, 375) | files.delete com confirmação | Simular no fake-google (DELETE já existe); excluir para sempre; item some do `state()` |
| Esvaziar lixeira | FALTA | Não existe | files.emptyTrash com confirmação | Simular emptyTrash no fake-google; botão "Esvaziar lixeira"; nenhum `trashed` no `state()` |
| Abrir item da lixeira | PARCIAL | Pede para restaurar antes (Drive.tsx:128); o Google mostra a visualização | Abrir o visualizador; o servidor já aceita item na lixeira em `sdPath` com `allowTrashed` (google.js:1264) | Na Lixeira, clicar num PDF; aparece `drive-preview` |
| Ordem e coluna "Data de exclusão" | PARCIAL | Ordena por `modifiedTime` (google.js:1324) e mostra "Modificado" | Campo `trashedTime`; `orderBy` por ele e coluna "Excluído em" | Apagar 2 arquivos em ordem; o último apagado aparece primeiro |
| Pesquisar dentro da lixeira | PARCIAL | Com 2 letras, a pesquisa troca a lixeira por resultados do Drive todo FORA da lixeira (Drive.tsx:95, 100; google.js:1318 `trashed=false`) | Na Lixeira, pesquisar com `trashed=true` (ou filtrar a lista local) | Na Lixeira, digitar o nome de um item apagado; ele aparece, e nada fora da lixeira |

## 10. Detalhes, atividade e versões

| Função do Google Drive | Status | Evidência | Como implementar | Teste do robô |
|---|---|---|---|---|
| Painel de detalhes (botão Informações, clique direito > Informações do arquivo) | FALTA | Não existe | Painel à direita com files.get (campos abaixo) e abas Detalhes/Atividade | Clique direito > Informações do arquivo; `drive-details` aparece com o nome |
| Detalhes: tipo, tamanho, local, proprietário, modificado (por quem), criado em | FALTA | SD_FIELDS sem `createdTime`, `owners`, `lastModifyingUser` (google.js:1243) | Acrescentar esses campos num files.get próprio do painel | Painel mostra "Criado em" com a data do fixture |
| Detalhes: quem tem acesso | FALTA | Não existe | permissions.list (ou campo `permissions`) | Painel lista o e-mail com acesso do fixture |
| Atividade de um arquivo ou pasta | FALTA | Não existe | Drive Activity API v2 (`activity:query` com `itemName`), precisa da permissão `drive.activity.readonly` | Simular activity no laboratório; aba Atividade mostra "renomeou" depois de renomear |
| Atividade recente do Meu Drive | FALTA | Não existe | Drive Activity API v2 com `ancestorName` da raiz | Aba Atividade sem item selecionado mostra a última ação |
| Gerenciar versões (lista) | FALTA | Não existe | revisions.list | Simular revisions no fake-google; "Gerenciar versões" lista 2 versões |
| Enviar nova versão | FALTA | Não existe | files.update com mídia (mesmo id) | Enviar nova versão de "pequeno.txt"; mesmo id no `state()`, conteúdo novo |
| Manter versão para sempre | FALTA | Não existe | revisions.update `keepForever: true` | Marcar; `keepForever` no `state()` |
| Baixar uma versão antiga | FALTA | Não existe | revisions.get `alt=media` pelo servidor | Baixar a versão 1; conteúdo antigo |
| Excluir uma versão antiga | FALTA | Não existe | revisions.delete | Excluir; a lista fica com 1 versão |
| Histórico de versões dos Documentos, Planilhas e Apresentações | NÃO SE APLICA | Fica dentro do editor do Google; o "Abrir no Google" já leva até ele | — | — |

## 11. Compartilhamento

| Função do Google Drive | Status | Evidência | Como implementar | Teste do robô |
|---|---|---|---|---|
| Botão e diálogo Compartilhar | FALTA | Não existe (menu Drive.tsx:152-159; barra Drive.tsx:375-379) | Diálogo `drive-share` com permissions.list | Clique direito > Compartilhar; `drive-share` aparece com o dono |
| Adicionar pessoa como leitor, comentador ou editor | FALTA | Não existe | permissions.create (`type=user`, `role=reader/commenter/writer`, aviso por e-mail opcional) | Simular permissions no fake-google; adicionar e-mail como Editor; `state()` tem a permissão |
| Mudar ou remover o acesso de uma pessoa | FALTA | Não existe | permissions.update / permissions.delete | Mudar para Leitor e depois remover; `state()` acompanha |
| Acesso geral: qualquer pessoa com o link | FALTA | Não existe | permissions.create `type=anyone` (e delete para restringir) | Ligar "Qualquer pessoa com o link"; `state()` tem `anyone` |
| Copiar link | FALTA | `webViewLink` já chega na tela como `it.web` (google.js:1260), mas não há ação | Item "Copiar link" no menu e na barra: `navigator.clipboard.writeText(it.web)` | Clique direito > Copiar link; área de transferência tem o `webViewLink` do fixture |
| Transferir a propriedade | FALTA | Não existe | permissions.update `role=owner` (ou `pendingOwner=true` em conta pessoal) | Simular no fake-google; dono muda no `state()` |
| Impedir que leitores baixem, imprimam ou copiem | FALTA | Não existe | files.update `copyRequiresWriterPermission` | Ligar no diálogo; `state()` tem o campo `true` |
| Ver o que foi compartilhado comigo | TEM | google.js:1324 | — | robô já: "Compartilhados comigo mostra o que outra pessoa compartilhou" |

## 12. Celular (site)

| Função do Google Drive | Status | Evidência | Como implementar | Teste do robô |
|---|---|---|---|---|
| Um toque abre a pasta ou o arquivo | TEM | Drive.tsx:210 | — | robô já: "celular: um toque abre a pasta", "celular: um toque abre a foto" |
| Segurar seleciona e mostra a barra de seleção | TEM | Drive.tsx:216, 372-380 | — | robô já: "celular: segurar seleciona, e a barra aparece" |
| Com seleção ativa, um toque soma ou tira | TEM | Drive.tsx:210 | — | Depois de segurar um item, tocar outro; `drive-selcount` mostra "2 selecionados" |
| Listas em botões no topo | TEM | Drive.tsx:370 | — | robô já: "celular: listas e botao Novo a vista" |
| Botão Novo flutuante | TEM | Drive.tsx:415 | — | robô já (mesmo check) |
| Lista como padrão no celular | TEM | Drive.tsx:61 | — | Contexto novo 390 px sem localStorage; não aparecem os títulos "Pastas"/"Arquivos" da grade |
| Ordenar no celular | FALTA | Na lista (padrão do celular) não há como ordenar: o botão de ordem só aparece na grade (Drive.tsx:396) e os cabeçalhos só no computador (Drive.tsx:407 `wide ?`) | Mostrar o botão `drive-sort` também na lista quando `!wide` | No celular (lista), `drive-sort` existe; ordenar por Tamanho muda a ordem |
| Armazenamento usado no celular | FALTA | A barra só existe no menu lateral do computador (Drive.tsx:358) | Linha de armazenamento no fim da lista ou no menu da tela | No celular, aparece o texto "usados" |
| Menu ⋮ de cada item | TEM | Drive.tsx:294 | — | Tocar `Mais ações para retrato.png`; `context-menu` aparece |
| Caminho de pastas | TEM | Drive.tsx:381-387 | — | Dentro de uma pasta, `drive-crumb-0` volta ao Meu Drive |
| Botão Voltar | TEM | Drive.tsx:364 | — | Não coberto (depende do `onBack` do app) |
| Visualizador no celular | TEM | Preview (o site usa o mesmo visualizador) | — | robô já: "celular: um toque abre a foto" |
| Nada passa da largura | TEM | — | — | robô já: "celular: nada passa da largura" |
| Rótulos dos botões da barra de seleção | PARCIAL | No celular a barra só tem ícones, sem texto nem dica (Drive.tsx:375-379, `label={wide ? … : undefined}`) | `accessibilityLabel` em cada `GhostButton` (Baixar, Mover, Estrela, Lixeira) | `getByLabel('Mover')` existe na barra do celular |
