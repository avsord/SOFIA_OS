# Sofia OS — Master 0.3.48

**Data:** 7 de outubro de 2026. **Base:** Android 0.3.47 + processo de entrega automática com testes nativos paralelos. **Pacote:** `com.avsord.sofiaapp`. **Canal:** `sofia-android-v`. **Versão planejada:** 0.3.48 / versionCode 53.

Este documento consolida a alteração solicitada nesta entrega e as regras de continuidade. Não substitui nem apaga a documentação histórica do repositório. “Implementado” descreve o código; “publicado” exige o APK real e os resultados de validação da execução correspondente.

## 1. Escopo completo do pedido

| Pedido | Implementação nesta entrega | Comportamento esperado |
|---|---|---|
| 1 — Cliques lentos nos menus; swipe já aprovado | Resposta nativa ao toque na barra, antes da entrega do evento ao JavaScript. A lógica de swipe existente permanece. | O destino e seu destaque respondem no toque, sem esperar animação, rede ou processamento dos dados. Bloqueios de gravação/envio continuam respeitados. |
| 2 — Inicialização demorada | Arquitetura local-first com cache de visualização criptografado por conta; pré-carga priorizada e requisições compartilhadas. | Depois de uma utilização com dados carregados, abrir com a última visão local e atualizar pela rede sem bloquear a primeira tela. |
| 3 e 5 — Kanban confuso, arraste travado e disputa com voltar | Novo componente de cartões, medição real das colunas, prévia do cartão e rolagem ao alcançar a borda. Removido o swipe próprio de voltar das páginas. | Toque edita; segurar e arrastar move ou reordena. Arrastar o quadro só navega entre colunas. Voltar é pelo Android ou botão explícito. |
| 4 — Conversa desce ao vivo ao abrir | Lista invertida: posição nativa zero representa a última mensagem. Reentrada e novos envios usam reposicionamento sem animação. | A conversa já aparece na mensagem final. A leitura manual do histórico continua disponível, com botão de retorno ao fim. |
| 6 — Coleção → Formulário | Nome do template e visualização padrão alterados para “Formulário”, emoji 📋. | Preservar o identificador `playlist_links`, campos existentes, dados e identidade das páginas do usuário. |
| 7 — Avisos no sino | Caixa local de avisos recebidos/vencidos integrada às notificações do servidor. | Cápsulas pendentes, rotinas, tarefas com horário e avisos de monitoramento disponíveis no mesmo sino, com leitura e limpeza de avisos. |

## 2. Arquitetura de abertura e resposta

### Caminho crítico da primeira tela

A sessão permanece em SecureStore. A leitura da sessão e das preferências é paralela. Para a conta autenticada, o app restaura a cópia local de bootstrap e dos dados iniciais. A tela utiliza essa visão local sem esperar uma nova viagem de rede. A confirmação atual do servidor acontece em paralelo e continua sendo a autoridade sobre sessão, permissões e dados.

A cópia local não contém senha nem token de acesso. No Android, usa AES-GCM com chave do Android Keystore, arquivo em `noBackupFilesDir`, nome derivado da conta/servidor e dados adicionais autenticados vinculados ao escopo. Não há fallback que grave o cache novo em texto aberto.

O cache admite somente superfícies iniciais selecionadas, limita tamanho e quantidade, descarta entradas antigas e trata corrupção como ausência de cache. Sair da conta elimina a cópia de inicialização; uma resposta de sessão inválida também a descarta. Exclusões invalidam a visão armazenada; leituras anteriores a uma alteração não devem regravar o estado antigo.

### Pré-carga sem saturar o app

A agenda do mês atual começa a carregar independentemente da aba. Início, tarefas, catálogo, biblioteca, preferências de widgets e conexões têm prioridade. Os tipos de entidades prioritários incluem páginas, cápsulas, rotinas, monitoramentos, filmes, livros, compras e notas. A pré-carga de tipos é limitada a três tarefas simultâneas. Leituras em voo são compartilhadas para reduzir pedidos duplicados.

Não se consulta todo tipo de entidade do servidor antes de liberar a primeira tela. O processamento completo dos alarmes começa depois da primeira pintura. Dados que já estão no aparelho podem aparecer antes da resposta remota; informações nunca baixadas e mudanças em outros dispositivos continuam dependendo da rede.

**Limite importante:** primeira instalação, primeiro login, cache expirado/ausente ou dados nunca consultados não podem apresentar conteúdo real antes de obtê-lo. A arquitetura reduz o bloqueio e reutiliza dados; não afirma que uma conexão lenta deixou de existir.

### Menus

O caminho nativo de toque identifica somente os seis controles da barra, não o contêiner. Confere a geometria do pager, move sem animação e atualiza o destaque. O evento React continua sendo processado para registrar a seleção e a navegação. A implementação existente de swipe, calendário e gesto de borda do Android é preservada. Os logs de desempenho registram apenas índice da aba e duração, sem conteúdo pessoal.

## 3. Kanban e páginas

O cartão mostra título e um resumo de descrição. O editor abre por toque e reúne título, descrição, coluna e exclusão explícita. Campos de texto não ficam capturando o gesto na superfície arrastável.

Durante o arraste, o destino é calculado com a geometria medida das colunas e o deslocamento real de rolagem. O quadro rola quando o dedo chega à borda e destaca o destino. Ao soltar, a função de movimentação preserva ID, descrição, campos personalizados e os demais cartões. É possível reordenar na mesma coluna. A troca de coluna também está disponível no editor como alternativa acessível.

O editor de páginas não tem mais PanResponder de voltar nem uma página anterior renderizada por trás para esse efeito. O retorno segue o caminho real de entrada por BackHandler do Android ou pelo botão. A rolagem normal da lista de páginas permanece independente da proteção contra pull-to-refresh; apenas arrastes ativos bloqueiam a rolagem apropriada.

Autosave, rascunhos, desfazer/refazer, hierarquia e conflitos continuam na estrutura existente de PageEditorStore. Aplicar template altera conteúdo, não o nome, emoji ou capa pessoal da página. Nenhuma migração destrutiva foi acrescentada.

## 4. Conversa

O histórico canônico continua em ordem cronológica; apenas a apresentação é invertida. A posição inicial é zero e o item mais recente está nesse ponto, evitando estimar a altura de todas as mensagens para chegar ao final.

Resposta nova, retorno à conversa e retorno ao app usam posicionamento sem animação. Uma rolagem manual permite consultar mensagens antigas. O botão de descer retorna diretamente ao final. Paginação, seleção de múltiplas mensagens, anexos, áudio e exclusões explícitas são mantidos.

Respostas confirmadas são incorporadas à cópia de visualização da conversa para a próxima abertura. Esse cache não substitui o histórico do servidor e não elimina mensagens antigas: a janela local guarda somente as últimas mensagens necessárias à abertura rápida.

## 5. Sino, horário e atraso

A caixa do sino combina dois conjuntos sem substituir os registros originais:

- **Servidor:** notificações já persistidas pela Sofia, incluindo monitoramentos e eventos de suas integrações.
- **Aparelho:** avisos nativos recebidos e ocorrências locais vencidas derivadas dos planos e horários da mesma conta.

Cápsulas futuras não geram atraso. Doses já marcadas não são recriadas como pendências. Rotinas respeitam frequência, dia, início, término e pausa. Tarefas concluídas ou canceladas não geram novas pendências. IDs determinísticos evitam repetir a mesma dose quando ela é identificada pelo horário e também chega pelo Android.

A conferência no primeiro plano é alinhada ao minuto do relógio. Quando o app volta do segundo plano, reconcilia notificações apresentadas pelo Android e pendências. Uma notificação que foi apenas lida ou limpa não é confundida com concluir uma tarefa ou marcar uma dose.

**Limites registrados:** o estado dos avisos locais no sino é armazenado neste aparelho e nesta conta; esta entrega não o apresenta como sincronizado com o sino do site. Avisos remotos continuam usando o servidor. Alertas de monitoramento dependem de resultados reais do monitoramento, não de preços inventados. Com o processo fechado, a interface do sino é reconstruída ao abrir; os alarmes do Android mantêm seu mecanismo existente e dependem das permissões do aparelho.

A caixa local mantém até 30 dias de avisos. A limpeza remove avisos, não cápsulas, tarefas, rotinas, páginas ou mensagens. Dados locais novos usam o mesmo armazenamento criptografado, com escopo próprio para o sino.

## 6. Entrega automática e velocidade do trabalho

Pedir uma correção concreta inclui implementar, validar, publicar e entregar o link aplicável. Não exigir outra mensagem de “atualizar”, “subir” ou “gerar APK”. Discussões de ideias não são, por si só, autorização de implementação.

Antes de editar, conferir a branch e a maior versão publicada. Reunir as alterações em um único conjunto baseado no código atual. Promover uma única vez com proteção pelo SHA esperado. Nunca publicar uma base antiga apenas aumentando a versão, nem empurrar arquivos incompletos um por vez à branch de entrega.

O fluxo permanente é `.github/workflows/sofia-native-047-update.yml`. O número histórico no nome não significa criar outro workflow a cada versão. `tools/delivery.cjs` calcula identidade crescente e alinha manifest, package, lockfile, atualizador e os testes de identidade.

Compilar uma vez os APKs de produção e de aceitação. Rodar os grupos nativos independentes `navigation` e `workspace` em paralelo. Guardar os binários e as evidências para repetir somente etapas malsucedidas quando o código não mudou. Resultados de outro APK, commit, suite ou execução não autorizam publicação. Compilações em andamento não devem ser canceladas a cada novo arquivo.

Não remover testes para aparentar velocidade. Medir o processo completo antes de afirmar um percentual de ganho. Evitar consultas repetitivas ao mesmo status sem outra atividade útil. Comunicar marcos reais e impedimentos concretos durante o trabalho.

## 7. Validação e critério de concluído

A suíte inclui regressões de geometria e preservação de cartões, lista de chat, isolamento do cache, criptografia, seleção nativa, horários do sino, duplicação, leitura/limpeza persistida e identidade do Formulário. O teste nativo exercita a interface real com transporte sintético isolado, sem usar dados pessoais ou alterar produção.

A entrega só é considerada publicada depois de: TypeScript e regressões aprovados; APK de produção compilado; package, versionCode, assinatura e hash conferidos; instalação por cima da versão anterior; todos os grupos nativos aprovados sobre os mesmos arquivos; servidor compatível; publicação real; descoberta da atualização pelo atualizador instalado e pelo novo.

O arquivo `SOURCE_COMMIT.txt` da release identifica o código exato que gerou o binário. Resultados, capturas de tela, durações e logs ficam nos artefatos da execução. Uma branch criada, um commit enviado ou uma compilação iniciada não equivalem a APK entregue.

## 8. Preservação e continuidade

Manter `com.avsord.sofiaapp`, a assinatura existente, o canal `sofia-android-v` e versionCode crescente. Instalação por cima, sem desinstalar e sem limpar dados. Não apagar histórico ou páginas para corrigir performance.

Esta alteração Android não autoriza redeploy automático do backend, alterações de autenticação, migração de banco, qualquer ação externa não relacionada. O fluxo não reinicia Railway. Mudanças de servidor devem ter escopo próprio, persistência e backup verificados.

Em novas entregas, atualizar uma nova master e as notas da versão. Registrar resultados observados, limitações e pendências reais. Nunca afirmar correção absoluta em todos os aparelhos somente porque houve uma execução de emulador aprovada.
