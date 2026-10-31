# Sofia OS — MASTER (fonte única de verdade)

Este é o único documento de continuidade que vale. Qualquer agente (Claude,
ChatGPT ou outro) começa aqui. Os documentos antigos (`docs/MASTER.md`,
`docs/GUIA_MASTER_COMPLETO.md`, `docs/CONTEXTO_NOVO_CHAT.md`,
`PROMPT_CONTINUAR_SOFIA.md`, `Comando atual.md`,
`docs/startup-navigation-handoff.md`) são históricos. Este é o ponto de entrada; código, logs e instruções atuais do dono devem ser conferidos se houver divergência, e o MASTER corrigido com evidências.

Este arquivo **não guarda valores que mudam sozinhos** (HEAD, versão, release
publicada). Eles são lidos ao vivo pelos comandos da seção 3 e dependem de uma
consulta atual bem-sucedida. O que muda por decisão humana (pendências, decisões,
diário) precisa ser atualizado no mesmo PR de cada rodada — regra no `AGENTS.md`.
O teste protege a estrutura, não a veracidade ou a atualização automática da narrativa.
O MASTER não guarda senhas, tokens ou chaves: leitura pública não concede escrita
no GitHub nem acesso ao Railway, banco, contas ou serviços de terceiros. Cada novo
ambiente precisa de seus próprios conectores/permissões; confirme-os antes de agir.

---

## 1. O dono e a forma de trabalhar

- O dono (Pedro) não é desenvolvedor. Responder em português, com explicação
  clara e decisões apresentadas como escolhas concretas.
- Quer velocidade: fazer uma pergunta só quando a resposta mudar o trabalho.
  Não reabrir decisões já registradas na seção 7.
- Honestidade com prova: verificar no código/histórico antes de afirmar,
  admitir erro com evidência, nunca prometer APK que não pode entregar.
- Ele testa no celular físico. O relato dele vale mais que o emulador do CI;
  os dois já divergiram (ver seção 6).

## 2. O projeto

- **Sofia OS**, "Personal AI OS": app Android React Native/Expo
  (`com.avsord.sofiaapp`) + backend Node/Express/SQLite na Railway.
- **Branch de entrega:** `sofia-app-android`. App em `SOFIA_APP/`, backend em `src/`.
- **Stack:** Expo ~57, React Native 0.86, Hermes, R8 ligado
  (`expo-build-properties`) desde a 0.3.105. APK do dono só arm64-v8a.
- **Abas:** Início, Conversa, Páginas, Agenda, Apps, Perfil.
- **Funcionalidades:** conversa com áudio transcrito e anexos; Páginas estilo
  Notion (hierarquia, blocos, templates, capas); Agenda com recorrência;
  Tarefas; Biblioteca/Listas; Cápsulas com notificação; central de
  notificações; temas; privacidade/Safe Chat/Diário; onboarding WhatsApp
  Business (pendente na Meta); monitoramento de preços (parcial, seção 7.2).

## 3. Estado vivo — sempre ler ao vivo, nunca confiar em número escrito

Antes dos comandos abaixo, consulte **[ESTADO_VIVO.md](https://raw.githubusercontent.com/avsord/sofiaos/sofia-state/ESTADO_VIVO.md)** na branch separada `sofia-state`. O workflow `Sofia estado vivo` gera esse *snapshot* após pushes em `sofia-app-android`: versão, último HEAD, releases, PRs, resultados disponíveis e alertas de possível defasagem do MASTER. A versão do snapshot não é necessariamente o resultado final de uma compilação ainda em andamento; confira a execução ao vivo para aprovar ou entregar um APK.

Se a branch ainda não existir, o arquivo estiver desatualizado ou a consulta falhar, use os comandos/conectores abaixo. O detector sinaliza alterações de código sem atualização do MASTER, mas não substitui a revisão das decisões humanas. Para um agente novo, o protocolo inicial está em [SOFIA_KEY.md](SOFIA_KEY.md).

```bash
git clone --branch sofia-app-android https://github.com/avsord/sofiaos.git
cd sofiaos
git log --oneline -15
node -e "const c=require('./SOFIA_APP/app.json').expo; console.log({version:c.version,versionCode:c.android.versionCode,package:c.android.package})"

# Requer GitHub CLI autenticado e dependências JS do app instaladas (npm ci).
# Só consulta: não executa delivery.cjs prepare, não compila nem publica.
# Usa a mesma seleção de releases do atualizador, não a ordem do Atom feed.
gh api --paginate --slurp 'repos/avsord/sofiaos/releases?per_page=100' | node -e "const fs=require('node:fs'); const pages=JSON.parse(fs.readFileSync(0,'utf8')); if(!Array.isArray(pages)||!pages.every(Array.isArray))throw Error('Listagem incompleta'); const rows=pages.flat(); const load=require('./SOFIA_APP/tests/load-ts.cjs'); const u=load('src/lib/update.ts'); const current=require('./SOFIA_APP/app.json').expo.version; console.log(JSON.stringify({codigo:current,publicada:u.newestPublishedUpdate(rows,'0.0.0'),ofertaParaVersaoDoCodigo:u.newestPublishedUpdate(rows,current)},null,2));"
gh pr list --repo avsord/sofiaos --state all --base sofia-app-android --limit 5 --json number,title,state,updatedAt,headRefName,baseRefName
gh run list --repo avsord/sofiaos --branch sofia-app-android --limit 5 --json databaseId,headSha,status,conclusion,workflowName
```

Sem git, gh ou rede no terminal, use os conectores GitHub disponíveis para ler
os mesmos arquivos, releases, PRs e execuções. Ausência de permissão/rede não
significa ausência de release ou de resultado: reporte o que não foi verificado.
Para saber a oferta ao celular, use a versão realmente instalada, que pode ser
diferente da versão do código. Código mais novo que a release indica trabalho
não publicado; não prova que já exista um APK aprovado ou sequer compilado.

## 4. Papéis

- **Arquiteto/revisor (Claude):** lê o repositório, diagnostica, escreve diff
  exato e briefing, revisa o que o executor entregou (rodando testes, conferindo
  merge e hashes). Na sessão que originou este pacote, o Claude relatou ausência de Android SDK, bloqueio do Maven do Google e ausência de escrita no GitHub. Isso descreve aquela sessão, não todos os modelos ou contas; cada agente deve verificar suas ferramentas atuais.
- **Executor (ChatGPT ou quem tiver escrita no GitHub):** aplica, dispara o CI,
  baixa artefatos, entrega o APK, relata.
- O dono faz a ponte entre os dois.
- Um executor, uma rodada, um escopo por vez. Nunca dois agentes mexendo no
  mesmo arquivo ao mesmo tempo.

## 5. Pipeline de entrega

Workflow: `.github/workflows/sofia-native-047-update.yml`. Dispara em push na
`sofia-app-android` que toque `SOFIA_APP/**` ou o próprio workflow. A classificação de arquivos não-runtime não basta para garantir ausência de APK: `delivery.cjs prepare` compara todas as mudanças desde a última release publicada. Um commit documental pode reencontrar alterações antigas do aplicativo. Nesta instalação documental, validar os testes em branch isolada e promover com `[skip ci]`, sem os marcadores de candidato/publicação; não alterar o pipeline Android nem usá-lo para validar documentação. Essa exceção não vale para mudanças de runtime.

| Marcador no commit | Efeito |
|---|---|
| `[manual-apk]` | APK candidato para o dono testar. **Não publica.** |
| `[manual-apk] [no-tests]` | Iteração rápida. Só em passos intermediários; o candidato final roda completo. |
| `[approved-apk]` sem `[manual-apk]` | Publicação no atualizador. **Só depois do "aprovado" explícito do dono.** |

- `SOFIA_APP/tools/delivery.cjs prepare` decide a próxima versão e reescreve
  `app.json`, `package.json`, lock e `src/lib/update.ts` **antes** dos testes.
- Concorrência: job `build` cancelável por branch; job `release` em grupo
  separado, não cancelável. Travado por `SOFIA_APP/tools/native-delivery-test.py`.
- O APK do dono é só `arm64-v8a`. Há uma cópia QA universal (`QA-ONLY-manual-universal.apk`) para o smoke manual x86_64 e uma compilação de fixture (`QA-ONLY-full-fixture.apk`) no fluxo completo. Ambas mantêm `arm64-v8a,x86_64`. DEX, JS/Hermes, bibliotecas ARM64 e assinatura da cópia manual são comparados com o APK do dono. Smoke dessa cópia não é execução do APK ARM64 no celular.

## 6. Abertura do app — como funciona (não reinventar)

- Não existe S em JavaScript ativo: `LaunchSAnimation.tsx` é código morto e um
  teste garante que não seja montado no `App.tsx`.
- O S é nativo: `SOFIA_APP/plugins/native/SofiaLaunchOverlay.kt`,
  `SofiaLaunchMotion.java` (curva 0,70 → 1,00 em 650 ms),
  `SofiaLaunchTransition.java` (máquina de estados), instalados por
  `plugins/with-sofia-logo.cjs` e `plugins/with-sofia-launch.cjs`.
- O overlay nasce no `setOnExitAnimationListener`, que o Android chama quando o
  app desenha o primeiro frame (~280–420 ms). Antes disso aparece o splash do
  sistema.
- O ícone **animado** do sistema (AnimatedVectorDrawable/SurfaceView) custou
  111 ms (A/B controlado, PR #6) e 132 ms (PR #8), e no celular do dono não
  animou visivelmente ("nasce parado e pula"). Não depender dele.
- Fade de saída 95 ms. Revelação exige o marcador `sofia-home-data-ready`
  (bit 8): a Home não abre com tarefas/agenda vazias. **Não remover.**
- Pré-aquecimento de shader (0.3.99–0.3.103) foi testado e revertido. **Não
  reintroduzir.**
- Rodada 4: ícone inicial transparente no Android 12+, mantendo a geometria; o S surge no overlay com fade-in de 140 ms e escala nativa. Há uma fase inicial roxa sem S; não prometer S visível/animado no frame zero. O caminho Android anterior a 12 foi preservado.
- Cache de abertura: `SOFIA_APP/src/lib/startup-snapshot.ts`. `launchRead` só
  guarda rotas da Home; o restante hidrata por `api.hydrate()`.

## 7. Decisões fechadas

### 7.1 Arquitetura
- Reescrita nativa completa (estilo Telegram) **não** está aprovada. Antes,
  medir quanto da abertura é custo de JavaScript. Se for o gargalo, migrar uma
  tela por vez, começando pela Home. O APK do Telegram foi analisado: activity
  única, motor gráfico C++ próprio de 21 MB, não portável para RN.

### 7.2 Monitoramento de preços
- **Decisão do dono, 13/10/2026 — integração do pacote Mercado Livre unificado:** leituras do ML usam a rota autenticada `POST /api/mobile/price-tracker/mercadolivre/read`, HTML como texto, sem WebView nem abertura externa automática. Falha nunca aciona o leitor antigo. Anúncio/vendedor ficam fixos em `source_identities`, mantendo a URL original como chave do histórico. Catálogo sem anúncio só adota oferta na prévia de cadastro, com confirmação ao salvar. Esta seção registra a implementação do patch; publicação e leitura ao vivo exigem comprovação separada.
- Já existe: entidade `monitor` (`src/core/catalog.js`), tabela `observations`,
  job no `src/services/scheduler.js`, `workspace.observe()` com alertas por
  preço-alvo, queda percentual e menor total histórico (`new_low`), e na UI
  `PriceWidget`, `priceGeometry` e `StoreComparison` (lojas ordenadas, ★
  Principal via `monitor.data.preferred_url`).
- Faltam: campos `preferred_url`, `line_color`, `source_urls` no catálogo;
  leitura de página de loja (`safe-feed.js` só aceita JSON); coleta de várias
  fontes.
- **Sem registro de aplicativo em loja nenhuma** (sem OAuth, sem chave de API).
- Para outras lojas, coleta **no aparelho**, em WebView invisível, sobre a página renderizada
  (`react-native-webview` via `npx expo install`).
- Lojas desejadas: Mercado Livre, AliExpress, Pichau, Kabum, Shopee e outras.
  Busca interna confirmada só no Kabum (`/busca/<termo>`); demais a confirmar
  no aparelho. Shopee e AliExpress são as de maior risco.
- Outras lojas do mesmo produto: **o app busca e o dono confirma os links.**
  Sem casamento automático de produto.
- Código pronto e testado em `docs/monitoramento/` (`npm install && npm test`,
  19 testes). Briefing de implementação no mesmo diretório.
- Limite declarado ao dono: a coleta só ocorre com o app aberto.

### 7.3 Arquitetura de fluidez — o toque tem prioridade
- Rodada 7 substitui a Rodada 6: [plano recebido](PLANO_FLUIDEZ.md) e [briefing](briefings/BRIEFING_RODADA7_fluidez.md). Fila central pós-reveal e Activity nas abas; comparar Novo/Antigo no mesmo APK.
- O agendador não interrompe JS síncrono que já iniciou nem cancela automaticamente rede em voo. O deadline de 8s pode forçar trabalho. Os nove testes recebidos foram mantidos; foi corrigida uma brecha de cooldown com teste adicional.
- Activity preserva estado e destrói/recria efeitos, não garante por si só que efeitos arbitrários ou pedidos de rede sejam seguros. Rascunhos de Páginas usam geração de sessão para impedir descarte por cleanup atrasado.
- Antigo mantém o algoritmo da 0.3.107 (abas montadas, rAF/500ms), com instrumentação e correções de segurança compartilhadas. Não é o binário histórico exato.
- Execução direta autorizada pelo dono: editar branch de trabalho, testar e entregar candidato pelo conector GitHub; não exigir `.bat`, comandos locais nem mediação do Claude. Sem publicar OTA.
- FlatList é dona da rolagem da lista principal; não aninhar outra FlatList vertical em ScrollView vertical. O editor conserva subpáginas compactas no caminho embutido até migração específica. Estado de expansão/rascunho permanece fora das células virtualizadas.
- Benchmark usa dados sintéticos; seu volume não foi comparado ao acervo real do Pedro. Não afirmar margem de 3× nem que emulador é universalmente mais lento que telefone.

### 7.3 Rodadas R16–R24 (Claude, 11–12/10/2026)
- **Monitoramento** é app próprio (Apps → Monitoramento): coleta no aparelho numa WebView única em fila (`src/lib/price-reader.tsx`), leitura ambígua nunca gravada sozinha (`reader_memory` por loja), queda % compara com a leitura anterior **da mesma loja** (app e servidor — regra do dono, não mudar), produtos não se comparam entre si, cor escolhida pelo sistema e alterável nos ajustes. Diagnóstico em Perfil → 5 toques na versão (`monitoring`).
- **Finanças** (estilo Mobills): kinds `fin_account`, `fin_card`, `fin_tx`, `fin_budget`, `fin_goal`; lógica em `SOFIA_APP/src/lib/finance.ts`.
- **E-mails**: IMAP com senha de app (`src/services/mail-watch.js`, imapflow 2.0.7), kinds `mail_account`, `mail_rule`, `mail_hit`; senha criptografada (usar `SOFIA_MAIL_KEY` na Railway).
- **Conta Google** (`src/services/google.js`): um OAuth para Agenda (2 sentidos no calendário escolhido; outros visíveis só leitura; syncToken/410; conflitos não sobrescrevem) e Drive (`drive.file`, backup diário em "Sofia OS/Backups", 14 guardados). Callback público `/google/oauth/callback`. Rotas `/api/mobile/md/{capabilities,dashboard,calendar/*,drive/backup,monitors/observations}`.
- **Avisos com app fechado**: `expo-background-task` (`src/lib/background-notify.ts`), sem Firebase.
- Sino: arrastar para apagar, resumo "Pede atenção agora" pré-carregado, tocar leva ao app certo.

### 7.4 Finanças — entrada monetária e apresentação da reserva (dono, 16/10/2026)
- Valores digitados em reais mostram pontos de milhares enquanto se digita, vírgula para centavos quando informados e duas casas decimais ao concluir. Não usar máscara de centavos por dígito: a sequência `191146` deve significar R$ 191.146,00, não R$ 1.911,46. Permitir digitar `191146,35` para R$ 191.146,35. A função de conversão persistida para número continua igual.
- Preservar o cartão original "Saldo geral" (soma das contas, incluindo guardado), receita, despesa e previsão. O cartão não terá segundo bloco "Para usar" ao lado de Guardado, pois cria redundância visual.
- O Guardado aparece como uma linha compacta "Reserva separada" dentro do saldo, com valor e progresso mensal opcional, tocável. Detalhes e ações originais ficam em sheet: saldo geral, fora da reserva, despesas previstas, livre após compromissos; guardar, retirar com confirmação e ajustar aporte.
- Não omitir a distinção matemática: saldo geral inclui reserva; `livre` desconta guardado e compromissos. Separação é visual/contábil no app, não bloqueio ou transferência bancária. Preservar entidades `fin_goal` e `fin_reserve_move` e dados existentes.

### 7.4 Finanças — separação por conta e vencimentos (16/10/2026)
- A página principal de Finanças exibe a conta escolhida; seletor no topo permite contas pessoais, da esposa e da empresa. Não somar saldos ou gastos entre titulares sem seleção explícita; manter registros e contas anteriores.
- Conta principal conserva saldo geral, previsões e reserva guardada: faixa laranja levemente atrás do cartão roxo com valor de guardado; contas secundárias apresentam os próprios valores apenas quando selecionadas. Reserva é separação contábil, não transferência bancária nem despesa.
- Navegação interna respeita histórico: gesto pela borda, seta e botão de voltar Android retornam à página de Finanças anterior antes de sair para Apps.
- Resumo inclui extrato com entradas/saídas e filtros; remover abas Lançamentos e Planejamento do menu, sem apagar os registros antigos de orçamentos, objetivos ou transações. A aba Pendentes contém boletos e dívidas cadastrados manualmente (não derivados do extrato), com vencimentos, repetições, pagamento e avisos locais Android.
- Excluir cartão: quando não houver movimento vinculado, exclusão definitiva com confirmação; havendo registros, arquivar e esconder da lista preservando faturas, compras e histórico, com opção de reativar.
- Relatórios mostram análise conservadora dos valores efetivamente registrados por conta; não simular aconselhamento financeiro nem inferir gastos que não constam do histórico.
- Toda máscara monetária usa separação pt-BR e evita transformar milhares em centavos ao apagar um caractere. A carteira não armazena senhas de banco nem faz transferências reais.
- Implementação desta rodada está em candidato 0.3.150, ainda não é aprovação de atualização OTA.

### 7.5 Arquivos da Sofia no Drive (dono, 26/10/2026)
- Tudo o que a Sofia guarda no Drive fica na **área oculta do app** (`appDataFolder`, escopo `drive.appdata`): não aparece no Drive (web, celular, PC), ninguém apaga sem querer. `drive.file` continua só para a cópia visível pedida pela pessoa.
- Porta de entrada: tela **Arquivos da Sofia** (Perfil → Conta Google, e o site em `/arquivos`): tipos com quantidade/espaço, abrir/compartilhar, **apagar** (de vez; menos as cópias .md das páginas, que acompanham a página) e **Exportar cópia** numa pasta visível.
- Conta conectada antes da 0.3.244: segue na pasta visível até tocar em Reconectar; a migração copia, confere o tamanho, troca a referência e só então manda o original para a lixeira. Arquivo que falha 3 vezes fica onde está e a pasta antiga não é apagada.
- **Armazenamento** (Perfil → Configurações do aplicativo): espaço da conta como o Drive mostra, a Sofia separada do resto.
- **Comprovantes** (fotos da conversa para Finanças) e **Áudios** da conversa se apagam sozinhos com mais de 7 dias (cada um com a sua chave, ligada por padrão); a despesa, a miniatura e a transcrição ficam. Arquivo apagado deixa a linha com `removed_at` e a rota responde 410 com o motivo.

## 8. Regras que não se quebram

- Preservar assinatura, package `com.avsord.sofiaapp`, versionCode crescente,
  prefixo `sofia-android-v`, login, histórico, SQLite e Railway. Instalação por
  cima; nunca limpar dados.
- Não afrouxar teste para passar. Se um teste trava um valor, mudar teste e
  código juntos mantendo a proteção.
- Não publicar candidato sem o "aprovado" do dono. Relatar separado:
  compilado / smoke aprovado ou reprovado / publicado sim ou não.
- Uma variável por experimento ao investigar desempenho.
- R8 quebrando em runtime → regra keep em `extraProguardRules`, nunca desligar
  o R8 inteiro.
- Não mover os documentos históricos: `sofia-mobile-backend.yml` e
  `tools/apply-mobile-v138.cjs` dependem dos nomes deles.

### Regras permanentes de fluidez (adoção em etapas)
1. Trabalho opcional pós-abertura passa pelo agendador; operações explícitas de usuário e persistência de rascunhos não podem depender de o usuário parar de tocar.
2. Abas usam Activity; efeitos devem limpar e reativar com segurança. Exceções medidas de pré-visualização durante arrasto precisam ser documentadas.
3. Listas crescentes devem ser virtualizadas (migração R8, não incluída na R7).
4. Histórico crescente deve ser fragmentado/limitado (R8); nenhuma remoção de dados para simular velocidade.
5. Regressões acima do orçamento passarão a reprovar o CI na R9, após validar a semente e calibrar 3× o volume real. Na R7 há relatório de metas; testes funcionais permanecem obrigatórios.
- Todo commit que muda o app aumenta a versão (app.json, package.json, package-lock.json em 2 pontos, src/lib/update.ts, 2 testes e RELEASE_<versão>.md). O CI não numera sozinho: sem isso o APK sai com a versão anterior e não é reconhecido como atualização.

## 9. Pendências (atualizar a cada rodada)

- **Site no computador (após 0.3.253):** fundação pronta (escala e rolagem). Próximo: seguir docs/WEB_DIAGNOSTICO.md — Finanças em 2 colunas e tabelas, Price Tracker e Tarefas em tabela, E-mails em 3 colunas, arrastar páginas com mouse, clique direito no lugar de segurar.

- **Site 0.3.250 (computador):** dono conferir no navegador depois do deploy. Próxima fase pedida: listas virando tabelas com colunas/ordenação/filtros (Tarefas, Finanças, Price Tracker, E-mails, Encomendas), detalhes em side peek, menus de clique direito.

- **0.3.244 Arquivos da Sofia:** depois do deploy, tocar em Reconectar (Perfil → Conta Google) para a permissão `drive.appdata`; conferir no celular a migração (pasta "Sofia OS" na lixeira do Drive e aviso no sino), abrir/apagar um arquivo, Exportar cópia e a limpeza dos comprovantes. Se o Google recusar o escopo novo, incluir `drive.appdata` em Google Cloud → Acesso a dados.

- **Finanças 0.3.150:** executar checks e CI Android, testar no aparelho a troca de conta, gesto voltar, datas/avisos Android com app fechado, baixa sem duplicidade, render da faixa laranja, cartas ocultadas e restauráveis e extratos de contas diferentes. Candidato não aprovado para OTA; quando os testes falharem, corrigir sem apagar dados ou desabilitar validações.


- **Financeiro 0.3.149 (16/10):** validar no celular o número "191146" → "191.146,00" após terminar, centavos com vírgula e ponto do teclado, edição/reabertura de lançamentos, reserva com/s/ aporte, e instalação por cima da 0.3.148. Candidato manual não implica publicação no atualizador.

- **Mercado Livre — integração HTML:** patch local pronto; obter escrita no GitHub e promover o conjunto completo; confirmar backup/volume antes do deploy do backend; rodar suíte completa/typecheck do app com dependências do lock; testar HTTP real na Railway e Android com receptor de intents. Nenhum preço ao vivo nem ausência de abertura de outro app foi comprovado em aparelho físico nesta rodada. HTML original é dado privado e não entra no repositório.

0. **0.3.117 — rodada estrutural (princípios Telegram/Notion), decidida pelo dono sem nova consulta.** (1) Toque nunca monta tela: esqueleto imediato (`ScreenSkeleton`) + render da tela em `startTransition` (`useStartupMounts` não força mais a aba ativa no conjunto montado). (2) Fila ociosa com `startQuiet`: abertura conta como toque; hidratação e pré-montagens só após 800 ms de silêncio; prazos continuam. (3) Sincronização da Conversa de 2 s só com usuário parado (`userIsIdle`). (4) Toda renderização é evento `render:<nome>`; relatório ganha `renders`; `hidratar:read`. Base: relatório 0.3.116 (`docs/evidencias/relatorio-0.3.116-celular.md`): Conversa monta em 161 ms mas 1º toque segue 760 ms; bloqueios sem evento; hipóteses eliminadas (props instáveis, recorrência, leitura do histórico). **Decisão registrada:** o app passa a preferir mostrar esqueleto a congelar. **Ainda não feito (depende do `renders`):** reduzir o custo do re-render das duas telas cujo `active` muda; `useVisibleLoad` buscar rede a cada ativação; `BackgroundServices` re-renderizar ao entrar/sair do Início. **Regra: o caminho do gesto só pode conter trabalho O(1); tudo o mais vai para transição ou fila ociosa.**
0. **0.3.116 — o relatório da 0.3.115 desmentiu uma hipótese e confirmou outra (`docs/evidencias/relatorio-0.3.115-celular.md`).** `agenda:expand` custa 0,6 ms: a expansão de recorrências NÃO era o custo da Agenda (a memória da 0.3.115 fica, é exata, mas não era o alvo). `composer:recorder` custa 148,8 ms: o `Composer` criava o gravador nativo ao montar e o consultava a cada 120 ms; abrir a Conversa pela 1ª vez levava 741 ms. Feito na 0.3.116: gravador criado só no 1º toque no microfone, consultado só enquanto grava, ciclo de vida próprio (sem ganchos do expo-audio). **Ainda sem causa medida:** ~146 ms do corpo da Agenda antes do calendário; 312 ms ao voltar ao Início. **Regra reforçada: uma medição que desmente a hipótese vale tanto quanto a que a confirma; não otimizar antes de medir, e dizer ao dono quando a hipótese cai.**
0. **0.3.115 — primeira atribuição por dentro (relatório `docs/evidencias/relatorio-0.3.114-celular.md`).** Celular de dono = SoC Unisoc (CPU modesta). Agenda: 154 ms de JS puro ANTES do calendário; Conversa: 209 ms entre campo de digitação e commit; Início: 282–440 ms a cada retorno. Feito: memória exata das conversões de fuso (`agenda-recurrence.ts`; 2ª expansão = 0 chamadas a Intl, dia inteiro ~20x menos na 1ª; respostas idênticas, provado contra cópia congelada). **Não provado:** que isso explique os 154 ms. 0.3.115 mede `agenda:expand`, `agenda:priority`, `home:expand`, `home:priority`, `composer:recorder` em `operations`. **Próximo passo decidido pelos números do próximo relatório:** se `agenda:expand` for pequeno, o custo está em outro lugar da Agenda; se `composer:recorder` for grande, criar o gravador só ao tocar no microfone; se não, atacar o Início (retorno 282–440 ms).
0. **0.3.114 — LIÇÃO da 0.3.113 e o que falta.** O relatório da 0.3.113 (`docs/evidencias/relatorio-0.3.113-celular.md`) mostrou que a espera fixa de 2,5 s antes da pré-montagem foi um erro: todas as abas foram montadas pelo gesto do usuário antes de ela terminar. Removida. **Causa que permanece:** a PRIMEIRA montagem de Conversa/Agenda/Apps (~200–290 ms cada) acontece dentro de um toque ou arrasto (o arrasto monta as vizinhas de forma síncrona). O app congela um instante em vez de mostrar página em branco (`TabPager`), e isso só muda por decisão do dono. 0.3.114 mede por dentro (`chat:list`, `chat:composer`, `agenda:month`); a próxima correção ataca a parte que o relatório mostrar. Candidatos já conhecidos: gravador de áudio criado ao montar a Conversa e consultado a cada 120 ms; `initialNumToRender` da lista da Conversa. **Regra: não otimizar às cegas; medir, reproduzir, corrigir. Testes nunca dependem do histórico do git (checkout raso no CI).**
0. **0.3.113 — primeiros segundos (guiado pelo 1º relatório limpo do celular, `docs/evidencias/relatorio-0.3.112-celular.md`):** montagem de Conversa/Agenda/Apps custava 385/248/247 ms em passada única com bloqueios de até 899 ms, e o histórico de ~4 MB era regravado 11 vezes em 3 min (~200 ms de bloqueio cada). Agora: pré-montagem fatiada com `startTransition` e só após 2,5 s sem trocar de aba; resposta idêntica não regrava; intervalo mínimo de 30 s entre gravações comuns (apagar dados/conversa/registro continuam imediatos); grava ao ir para segundo plano. **Ainda aberto:** cada troca de aba custa ~100–300 ms de JS mesmo com a aba já montada (re-render ao ativar). Meta de aceite: relatório novo com `first5s.over250` ≤ 1 e `maxMs` ≤ 300 (era 5 e 899).
0. **0.3.112 — erro "Vamos reabrir": CAUSA CONFIRMADA por log real do celular (adb logcat, 0.3.109).** `Error: Cannot use shared object that was already released` em `VoicePlayer` (Conversa). O `Activity` esconde a aba; o gancho `useReleasingSharedObject` do expo-audio solta o player no cleanup e o `useEventListener` tenta remover a assinatura de um objeto já liberado. Reproduzido em teste com os ganchos REAIS da biblioteca (`tests/helpers/expo-audio-harness.cjs`, `voice-player-111.test.cjs`). Correção: `VoicePlayer` preguiçoso (nenhum player nativo até o primeiro toque), um único ciclo de efeito próprio, chamadas nativas protegidas; mais pager que nunca esconde aba já vista, AppBoundary que se recupera e mostra o motivo, DeferredScreen contido. **Regra: qualquer componente com objeto nativo liberado em cleanup (expo-audio, câmera, etc.) deve ter ciclo de vida próprio e simétrico, nunca depender dos ganchos de liberação sob `Activity`.**
0. **Medição REAL no celular do dono (0.3.109, 1ª vez; log em docs/evidencias/):** `count:history` 918 ms e `hidratar` 2344 ms (bloqueio de 1011 ms logo após abrir; `count:history` já saiu da abertura na 0.3.110+), `snapshot:write` 1735 ms (stringify + gravação de ~4 MB de histórico num bloco, roda ~3,5 s após abrir: PRÓXIMO ALVO de lag), `module:chat` ~430 ms + montagem de Conversa 451 ms e toque→Conversa 1528 ms no primeiro uso (cada bolha de voz criava um player nativo; resolvido pelo VoicePlayer preguiçoso). Abertura: SYSTEM_CALLBACK 523 ms, UI 2035 ms, DATA 2195 ms (cronômetro do dono: 2,18 s).
0. **R7 integrada; R7.1 em validação:** a 0.3.108 compilou no commit `39121fd`, smoke normal passou e smoke pesado falhou em Páginas no modo Novo (run 38089508740). A R7.1 corrige prazos de todas as tarefas mantendo folga de 50ms; movimentos contínuos renovam os 800ms sem setState. A medição de Páginas usa partidas separadas por modo/trial, teto 8s, meta 1s reportada e falha obrigatória para falso vazio/timeout. Candidato 0.3.109; aceite físico e resultados do novo CI pendentes. Não implementar virtualização/R8/R9 nem publicar OTA nesta rodada.
0. **R8 direta (0.3.111 / 116), validação em andamento:** código parte da 0.3.110 sem repetir envio pelo computador do dono. Lista principal de Páginas, registros de Apps e Tarefas passam a FlatList limitada à janela visível; medir drag só em células montadas ao iniciar gesto. Subpáginas compactas dentro de editor ainda não estão virtualizadas. Não mexer no histórico sem causalidade medida.
0. **Evidência anterior:** 0.3.110 compilou, mas smoke normal falhou ao buscar mensagem antiga específica; pesado preservou rascunho e falhou no swipe. Capturas mostram o gesto dentro de `calendar-month-swipe`, mudando o mês em vez da aba. O novo teste deriva a linha do swipe do cabeçalho fora do calendário, sem retirar a obrigação de alcançar Conversa. Os bloqueios de 319 ms / p95 418 ms eram acima das metas; não há aprovação de fluidez. Rodada direta exige 20 ciclos editar/voltar em cada modo e coleta os logs do erro até no finally.
0. **R9:** calibrar carga ≥3× contagens reais do painel, habilitar gates reprovadores de desempenho e remover Antigo. Não iniciar nesta R7.

1. **Rodada 5 (0.3.107) compilada, smoke QA aprovado; confirmar primeiros toques no celular** — aquecimento depois da Home sem aguardar histórico, Shell sem rerender ao concluir hidratação. A/B em emulador: DATA 956 → 975 ms (+19 ms); nos quatro primeiros toques, três eventos nativos registrados, incluindo Páginas ainda não montada (um salto protegido). Portanto, ausência total de delay no aparelho físico **não comprovada**. APK candidato manual, não publicado; [execução 38080609693](https://github.com/avsord/sofiaos/actions/runs/38080609693) e [evidências PR #15](https://github.com/avsord/sofiaos/pull/15#issuecomment-6101539253).
2. **Rodada 4 implementada; confirmar no celular** — briefing histórico em `docs/briefings/BRIEFING_RODADA4_S_e_abas.md`. Conferir o candidato existente antes de recompilar: S entrando em movimento, Páginas com cache sem falso aviso de primeira página e resposta aos toques nos primeiros segundos. O build e o smoke QA da rodada terminaram com sucesso (registro na seção 10); isso não substitui o aceite físico.
2. **Validar R8 no celular**: login, conversa, páginas, agenda, notificação de
   cápsula, alarmes, secure store, atualizador.
3. **Publicar no atualizador** o primeiro candidato aprovado pelo dono.
4. **Medir o custo de JavaScript na abertura** (pré-requisito da seção 7.1).
5. **Monitoramento de preços** (seção 7.2).
6. **Organização do código**: arquivos comprimidos (`Workspace.tsx` 46 KB,
   `Chat.tsx` 29 KB, `Pages.tsx` 27 KB). Reformatar sem mudar comportamento.
7. **Padronização e bugs antigos** (conferir no código antes, podem já estar
   resolvidos): "Anotações → Notas", "Novo caderno → Nova pasta", câmera do
   perfil em círculo, labels de Perfil/Aparência/Segurança na página Apps,
   gesto Agenda→Apps→Agenda, scroll do chat com teclado, sessão expirando em
   12 h, filtro privado preservado em updates.

## 10. Diário de rodadas (só acrescentar; uma linha por rodada)
- 27/10/2026 · 0.3.254 (code 255) · candidato manual: proporção do site em monitores grandes (Início 1480, Agenda 1280, Apps 1120 de largura máxima; painel do dia fixo; busca/filtros de Apps alinhados; hierarquia da descrição da tarefa). Revisado com dados em 1440/1920/2560 px. Celular sem mudança.
- 27/10/2026 · 0.3.255 (code 256) · candidato manual: lote de pedidos do Pedro — Início abre o compromisso direto (voltar fica no Início) e ganhou + na Agenda; calendário aberto rola até caber na tela (RevealScroll); capa das Páginas com Reposicionar (campo cover_position no catálogo); ordem das Páginas sem piscar (snapshot da lista já na ordem do aparelho); olho dos valores salvo e igual no Início (Meta) e em Finanças (/local/values-mask); apps abertos pelo Início entram da direita (só celular); Notas sem tipos prontos — categorias criadas pela pessoa (tags cat:), notas antigas Ideia/Lição mantêm a categoria; Biblioteca só cria Filme, Livro e Receita + áreas da pessoa (tipos com registro continuam no filtro, nada apagado); Histórico mostra data/hora em que o item foi lançado; Controle de gastos começa no dia do salário (saldo de antes + salário e receitas − despesas pagas, avulsas e previstas − fatura − aporte; 100% = sobra + gastos avulsos pagos); aba Devoluções (fin_refund: não mexe no Saldo; Recebi vira receita paga de hoje); evento tarefa (tarefa com estado scheduled na agenda, com check; ticada fica riscada; não ticada passa para o dia seguinte à meia-noite no mesmo horário, feito pelo app no Início); Tarefas → Tarefas backlog: o check virou botão de levar para a agenda (janela com dia, horário, prioridade e observação). Testes: tests/lote-255.test.cjs. Reenvio 28/10: o primeiro build parou nos testes do servidor (teste de E-mails instável: contas criadas no mesmo milissegundo sorteavam a 'mais antiga'); corrigido o desempate em mail-watch.js, sem mudar o app nem o site.
- 28/10/2026 · 0.3.256 (code 257) · candidato manual: Controle de gastos voltou a ser o do mês (início do mês × agora; o cálculo desde o salário saiu); despesa com "Vai ser reembolsada" no editar (cria a devolução em Devoluções com expense_id, valor ajustável; a linha do Histórico mostra reembolso pendente/reembolsada); Páginas nunca aparecem fora da ordem (esqueleto até a ordem guardada no aparelho ser lida; lista guardada já decorada); criar e editar evento (Agenda e + do Início) com "Tornar tarefa" e "Buscar tarefa" (usa uma existente ou cria nova; evento que vira tarefa sai dos compromissos e a tarefa vai para a agenda e o Google); o tipo separado "Evento tarefa" saiu. Testes: tests/lote-256.test.cjs.
- 28/10/2026 · 0.3.257 (code 258) · candidato manual: E-mails com "Entrar com Google" por conta (tabela google_mail_link, escopo só gmail.readonly, login_hint; conta errada recusa e revoga; lê a própria caixa sem mexer na Conta Google do Perfil; erro do teste até 300 caracteres) e seletor de conta salvo no aparelho; Finanças: "Não mexer no saldo" (fin_tx.no_balance: fica no Histórico e nos totais, fora do Saldo, também no chat), "Vai ser reembolsada" entre as opções de baixo, cabeçalho roxo do editar sempre por cima; Início: + menor na altura do título Agenda, criar ao segurar a data sem piscar (janela transparente com fade), Tarefas backlog no widget e no menu do site; Área sem nomes de fábrica (só as criadas/usadas, sem Assets/Geral/tipos da Biblioteca) e sempre com criar nova. Testes: tests/lote-257.test.cjs, tests/mail-google-257.test.cjs.
- 28/10/2026 · 0.3.258 (code 259) · candidato manual: FASE ZERO da rodada premium (lista única em docs/PEDIDOS.md — ler e atualizar a cada versão): segundo passo no login do SITE (navegador com Origin e sem marca de confiança recebe código de 6 dígitos no e-mail cadastrado; acerto dá marca de 90 dias; app sem Origin não muda; sem SMTP ou com falha de envio não tranca); ensaio de restauração achou tabelas de dado fora do backup e agora entram em `extra` (mobile_capsule_doses, md_kv, google_tombstones; credenciais e sessões continuam fora de propósito); tomada pronta para o público (GOOGLE_MAIL_CLIENT_ID/SECRET opcionais, docs/PUBLICO.md); ferramenta de prints do site (SOFIA_APP/tools/site-shots.cjs). Testes: web-2fa-258, backup-restore-258.
- 28/10/2026 · 0.3.259 (code 260) · candidato manual: FASE 1 da rodada premium — fonte própria Plus Jakarta Sans (OFL; SOFIA_APP/assets/fonts para o Android via plugins/with-sofia-fonts.cjs; public/assets/fonts woff2 para o site; src/lib/sofia-font.ts troca Text/TextInput do react-native no Android pelo arquivo do peso, CSS @font-face no site); escala de letras de 13 tamanhos e pesos um degrau abaixo (tools/type-scale-259.py aplicado no código e nos testes); ícones Phosphor (phosphor-react-native, importados um a um; tipos em types/phosphor-icon.d.ts) com estado preenchido na aba atual; categorias/notificações/Monitoramento com ícones; escuro desenhado e tokens good/warn/info/elevated; Finanças sem cores fixas. Site +330 KB (pesos dos ícones), resolver na 4.6. Ver docs/PEDIDOS.md.
- 28/10/2026 · 0.3.260 (code 261) · candidato manual: FASE 2 da rodada premium (site com comportamento de site) — endereço por tela (src/lib/web-route.ts; servidor entrega index.html em /inicio, /conversa, /paginas, /agenda, /apps[/app], /avisos, /perfil), título da aba por tela, página base própria em SOFIA_APP/public/index.html (pt-BR, descrição, prévia de link, manifest instalável, preload da fonte), teclado rola a área principal e impressão inteira (src/lib/web-page.ts), clique direito = segurar (rightClick() nos lugares com onLongPress de ação simples), DESKTOP_MIN 900, textos de celular via tap(). Ver docs/PEDIDOS.md.
- 28/10/2026 · 0.3.261 (code 262) · candidato manual: FASE 3 começa — docs/DESIGN.md com o diagnóstico de cada tela (sem moldes); login do computador em duas colunas (marca à esquerda, formulário de 400 px à direita, DialogContext para o botão ocupar a largura); CORREÇÃO da fonte no site: o react-native-web escreve a pilha de fontes do sistema por classe e ganhava da regra geral, então os nomes -apple-system/BlinkMacSystemFont/Segoe UI/Roboto/Helvetica/Arial agora são @font-face apontando para a Plus Jakarta Sans (conferido no navegador: fonte carregada).
- 28/10/2026 · 0.3.262 (code 263) · candidato manual: FASE 3 (Início em 2 colunas no computador, Agenda com títulos dentro de cada dia e datas "Outubro de 2026", Páginas recentes em cartões) e FASE 4 (site comprimido brotli/gzip em http-handler compressedWeb; números tabular-nums no app e no site; BigMoney no saldo; sombra sutil nos cartões; estalo no check; Empty novo e frases na voz da Sofia; ícones próprios sofia/capsule em Icon.tsx; aba Conversa com a marca). Adiados com motivo em docs/PEDIDOS.md: 3.3/3.4 (dividir telas gigantes + testes de comportamento), tarefas no Ctrl+K, número de avisos no título.
- 28/10/2026 · 0.3.263 (code 264) · candidato manual: fecha a rodada premium (docs/PEDIDOS.md sem pendências, exceto o log do emulador). Site: hover visível, foco nos campos, Enter confirma, rodinha de qualquer lugar, folhas perto do clique (Sheet anchored), movimentos curtos (motion.ts), menu do botão direito (src/components/ContextMenu.tsx: Finanças, Tarefas, Páginas, registros), Ctrl+K com tarefas (evento sofia:open-task), avisos no título, Conversa com lista ao lado, listas em 2 colunas, Páginas sem cabeçalho repetido, gráfico com detalhe no mouse, telas sob demanda (src/lib/screen-loader.web.tsx com import()). App e site: paleta única (src/lib/palette.ts), ícone do Guardado, aspas tipográficas, últimos emojis de interface trocados. Refatoração: Finanças, Apps e Price Tracker divididos em src/screens/{finance,workspace,monitoring}/ por tools/split-screen.py; os testes leem a tela inteira por tests/split-sources.cjs (--require no script de teste). Testes novos: lote-263 e tests/site-263 (servidor).
- 29/10/2026 · 0.3.264 (code 265) · candidato manual: Início no DESENHO APROVADO pelo Pedro (mockup Inicio_opcao_H): saudação centralizada (Bom dia/Boa tarde/Boa noite + nome em Playfair Display itálico, SofiaDisplay-MediumItalic, OFL), frase do dia (daySentence), barra da Sofia com atalhos (HomeHero: api.ensureChat + api.chat, resposta em cartão, Continuar na Conversa); no computador: Resumo do dia (avisos não lidos + tarefas importantes) ao lado da Agenda (horário à esquerda, calendário esticado na altura da lista), embaixo Tarefas backlog que estica até a coluna da direita (Meta, Price Tracker, Cápsulas com barra de cor e caixinha de marcar; ordem pelo Organizar). Celular: mesma saudação e barra no topo, widgets como antes. Componentes: src/components/HomeHero.tsx, src/desktop/HomeDeskCards.tsx; SortableWidgets sheetOnly para o Organizar; ícone do Guardado no lugar do 🎯.
- 31/10/2026 · 0.3.265 (code 266) · candidato manual: Conversa no desenho aprovado — Quadro da conversa (src/services/conversation-board.js: depois de cada resposta, provider.structured organiza as últimas 80 mensagens por assunto em decidido/a fazer/em aberto/números/referências; tabela conversation_board; GET/POST /api/mobile/conversations/:id/board; o título automático da conversa vira o assunto), lateral do computador com o Quadro (assunto atual aberto, anteriores em etiquetas com data e hora, ⋯ Guardar em Páginas/Copiar resumo), no celular botão Quadro com contador de em aberto e folha; separador "Novo assunto" na conversa; foto da conversa visível; status "Recebida" some. Bug das conversas vazias: o + reaproveita a vazia e a lista esconde vazias. CORREÇÃO: a barra da Sofia no Início (0.3.264) mandava `content` em vez de `message` e o servidor recusava.
- 31/10/2026 · 0.3.266 (code 267) · correção: (1) falso alarme de credencial — "sistema de diário com senha e conteúdo criptografado" era recusado porque o "e" de ligação contava como "senha e <segredo>"; rejectSecrets (src/core/util.js) agora só bloqueia senha/password/pin seguido de :, = ou é/eh e de um valor com número ou símbolo (tests/secret-false-positive-266); (2) foto da conversa vazia no SITE — o navegador não manda o cabeçalho de login em <img>; miniatura e foto grande agora são baixadas com o login (fetch + blob) no site; a miniatura mostra ícone enquanto carrega.
- 27/10/2026 · 0.3.253 (code 254) · candidato manual: fundação do site no computador — camada web (src/web/rn-desktop.tsx + desktop-scale.ts, ligada pelo metro.config.js só na web) com escala de computador em todas as telas; rolagem na largura toda com conteúdo centralizado (ContentWidth); Agenda lado a lado; cabeçalhos alinhados. Moldura do computador movida para src/desktop/ (o Metro guarda a resolução por pasta). Conferido com dados em 1440 e 1920 px. Celular sem mudança.
- 27/10/2026 · 0.3.252 (code 253) · candidato manual: Conversa de cabeça para baixo no site (RefreshControl do RN-web duplicava a inversão do FlatList) corrigida; Finanças Resumo em 2 colunas e + no topo; Perfil com menu lateral. Lição: testar o site com dados reais (conversa, lançamentos), não com conta vazia.
- 27/10/2026 · 0.3.251 (code 252) · candidato manual: site sem cara de app no computador — telas cheias viram painel lateral, botões/ícones/cabeçalho de computador, textos de toque viram de mouse (35), Páginas com capa larga e texto em coluna, pastas em cartões fixos, Apps com largura máxima. Diagnóstico por código em docs/WEB_DIAGNOSTICO.md. Celular sem mudança; suíte 100%.
- 27/10/2026 · 0.3.250 (code 251) · candidato manual: site com layout de computador estilo Notion (≥1024 px, só na web): barra lateral recolhível com menus, apps e árvore de Páginas; barra de cima com caminho, busca, sino e perfil; Ctrl+K, Alt+1…6, Ctrl+\; Início em colunas com botão Organizar; folhas viram janela central; grade de Apps com mais colunas. Celular sem mudança. Testado no navegador local (1440 e 420 px). Pendente: tabelas/visões de banco nas listas, side peek e menu de clique direito por tela.
- 26/10/2026 · 0.3.246 (code 247) · candidato manual: áudios da conversa na limpeza automática de 7 dias (chave própria, ligada por padrão), aviso "Áudio apagado" na conversa, rota genérica /md/drive/cleanup. Celular pendente.
- 26/10/2026 · 0.3.245 (code 246) · candidato manual: cartão Armazenamento nas configurações (usado/livre/total como o Drive; fatias Sofia, resto do Drive, Gmail e Fotos, lixeira) e o mesmo quadro em /arquivos; rota /md/drive/storage com contagem reaproveitada por 10 min. Servidor 385/385, app 871 + verificações Python, tsc 0. Celular pendente.
- 26/10/2026 · 0.3.244 (code 245) · candidato manual: Arquivos da Sofia na área oculta do Drive, migração da pasta visível, tela no app e no site (/arquivos), apagar, exportar cópia, limpeza semanal dos comprovantes, proteções (pasta na lixeira, área oculta apagada) e correção do backup que regravava o estado do Drive. Servidor 384/384, app 869 + verificações Python, tsc 0 erros. Celular e reconexão real pendentes.
- 16/10/2026 · 0.3.150 · candidato manual em elaboração: selector de conta, reserva sobreposta, resumo com extrato, Pendentes manuais + notificações Android, exclusão segura de cartões e análise por conta. Sem alterar dados existentes no backend ou liberar OTA; validação CI/celular pendente.

- 13/10/2026 · candidato 0.3.137 / código 142, patch local, sem PR: leitor ML unificado com rota autenticada, cancelamento, fila limitada, identidade estável e integração Android sem fallback. Validações e limitações constam de `LEIA-ME.md` e relatórios do pacote de entrega. Sem deploy nem APK gerado nesta sessão.
- 12/10/2026 · R24: Conta Google (Agenda completa + backup no Drive), avisos com app fechado, e-mail → conta a pagar, "Comprei" → despesa, leituras de preço num pedido só, agenda sem teto de 500, chave de e-mail com migração, versão oficial pedida ao CI ([approved-apk]).

| Data | Versão | PR | O quê | Resultado |
|---|---|---|---|---|
| 2026-10-10 | 0.3.104 | #5 | CI: build cancelável por branch, publicação protegida | Validado ao vivo |
| 2026-10-10 | 0.3.104 | #6 | A/B ícone do sistema estático vs animado | Estático −111 ms (DATA) |
| 2026-10-10 | 0.3.104 | #7 | Abas pré-aquecidas após o reveal; toque protegido | Melhorou; dono ainda vê delay/branco |
| 2026-10-10 | 0.3.104 | #8 | Ícone animado de volta para "S desde o início" | Reprovado: +132 ms; no celular nasce parado e pula |
| 2026-10-10 | 0.3.105 | #9, #10 | R8, APK só arm64, ícone estático, curva reinicia no handoff | APK 51,6 → 26,25 MB; dono: S ainda parado no início; abas com delay/branco |
| 2026-10-10 | 0.3.106 | — | Rodada 4: S único, restauração de cache e aquecimento que cede aos toques; base `ef3a6f7` | [Execução 38070454563](https://github.com/avsord/sofiaos/actions/runs/38070454563) concluída com sucesso; validação física pendente, sem aprovação OTA |
| 2026-10-10 | — | — | Instalação do MASTER permanente, prompt fixo e guardião de estrutura | Commit exclusivamente documental/testes; ver resultado no PR de instalação, sem novo APK |

| 2026-10-10 | 0.3.106 | #14 | Protocolo SOFIA_KEY e estado vivo automático em branch independente; guardas de segredo e aprovação | Validado no workflow 38078156195; nenhum APK novo |
| 2026-10-10 | 0.3.107 | #15 | Aquecer abas após Home sem esperar histórico e sem rerender geral; manter navegação nativa protegida | [CI 38080609693](https://github.com/avsord/sofiaos/actions/runs/38080609693) compilação e smoke QA aprovados; DATA +19 ms vs 0.3.106 no mesmo emulador; primeiros toques ainda com aba não montada; físico pendente, OTA não publicado |

| 2026-10-10 | 0.3.108 | R7 | Agendador, Activity, proteção de rascunhos, painel e semente pesada Novo/Antigo | Compilação e smoke normal aprovados no run 38089508740; pesado reprovado no modo Novo, lista não apareceu na captura; nenhuma aprovação de desempenho |

| 2026-10-10 | 0.3.109 | R7.1 | Prazos por tarefa, proteção durante movimento e medição de conteúdo de Páginas por modo/trial | Candidato em validação; metas de desempenho não equivalem a corretude; não publicado OTA |
| 2026-10-10 | 0.3.110 | patch R8 | Store de Páginas sem descarte ao esconder; proteção de erro por tela com registro; contagem do histórico fora da abertura; árvore de Páginas em blocos | Local: tsc 0 erros, npm test 447/447 (8 novos, cada um reprovando com o código antigo). O primeiro envio saiu sem aumentar a versão (APK saiu como 0.3.109/114, igual à R7.1); corrigido para 0.3.110/115 em patch seguinte. CI e celular pendentes |

| 2026-10-10 | 0.3.111 | execução direta | FlatList principal de Páginas, registros e tarefas; drag limitado a células montadas; teste de swipe fora do calendário e 20 ciclos por modo | Código em validação, sem APK ou desempenho aprovado até evidências; sem publicar OTA |
| 2026-10-11 | 0.3.112 | patch do arquiteto | Causa do "Vamos reabrir" confirmada por logcat: player de áudio liberado sob Activity. VoicePlayer preguiçoso e seguro; pager nunca esconde aba vista; AppBoundary com recuperação e motivo na tela; DeferredScreen contido | Local: reproduzido com ganchos reais da biblioteca (antigo falha, novo passa); tsc e npm test verdes. CI e celular pendentes |
| 2026-10-11 | 0.3.113 | patch do arquiteto | Pré-montagem das abas fatiada e adiada; histórico não regrava resposta idêntica e tem intervalo mínimo; grava ao ir para segundo plano | Local: tsc e npm test verdes; 8 testes novos, cada mutação reprovada (inclusive a de privacidade). Confirmar com novo relatório do celular |
| 2026-10-11 | 0.3.114 | patch do arquiteto | Remove a espera de 2,5 s (regressão da 0.3.113); mede montagem por dentro da Conversa e da Agenda; teste sem dependência de git | Local: tsc e npm test verdes. Relatório do celular da 0.3.113: máximo 607 ms (era 899), 7 bloqueios > 250 ms (era 5): meta não atingida |
| 2026-10-11 | 0.3.115 | patch do arquiteto | Memória exata das conversões de fuso na recorrência da agenda; medição de agenda:expand, agenda:priority, home:expand, home:priority, composer:recorder | Local: tsc e npm test verdes; 6 testes novos, equivalência com a versão anterior em 264 combinações e 7 fusos; defeitos de chave reprovados. Confirmar com relatório do celular |
| 2026-10-11 | 0.3.116 | patch do arquiteto | Gravador de áudio criado só no 1º toque no microfone e consultado só enquanto grava; ciclo de vida próprio | Local: tsc e npm test verdes; 8 testes novos com o Composer real, o antigo reprova 7 e 3 defeitos reintroduzidos são pegos. Relatório 0.3.115: agenda:expand 0,6 ms (hipótese desmentida), composer:recorder 148,8 ms |
| 2026-10-11 | 0.3.117 | patch do arquiteto | Esqueleto imediato + montagem em transição; fila ociosa quieta na abertura; sync da Conversa só com usuário parado; medição de toda renderização | Local: tsc e npm test 491/491; 6 testes novos; mutações A/B reprovadas. Celular pendente |
| 2026-10-16 | 0.3.149 | PR desta rodada | Finanças: máscara monetária brasileira, reserva compacta sem caixinha redundante, detalhes e ações preservados | Código + testes em branch isolada; CI, APK e validação física a conferir. OTA não autorizado. |
| 2026-10-31 | 0.3.267 | rodada 1 do site | Janela flutuante não pula ao fechar; saída no computador 170 ms; painel do Price Tracker anima a saída; site sem contorno de clique; Páginas/Apps/Perfil fora do menu de cima; título da página numa linha; tique de Cápsulas neutro | Local: tsc e npm test verdes; tests/lote-267 (5). APK candidato pelo CI. |
| 2026-10-31 | 0.3.268 (versão escolhida pelo delivery) | rodada 1 completa (site + Conversa + E-mails) | Site gerado de novo (a parte 1 não tinha gerado `public/web`); esqueleto só após 300 ms e app abre no mesmo clique no computador, telas baixadas em segundo plano; sem anel de foco no campo; hover 100 ms; `Presence` mantém ~35 janelas condicionais na tela durante a saída; alerta mantém o texto; menu do botão direito animado; seta da árvore gira; página solta sem voltar; notificação some por posição no celular; voltar do navegador/Esc fecham painéis (`lib/web-panels.ts`); Price Tracker fecha o produto ao sair; foto do perfil no servidor (`/api/mobile/profile/photo`, camada `profile-photo-cloud`) e capas no site sem a pasta do celular; tique neutro das Cápsulas no app; barra de cima na mesma escala das listas (busca alinhada aos cards); Conversa: Enter envia/Shift+Enter quebra linha no site, trava `singleItemGuard` (um item só com título inteiro), Quadro da conversa chamava `runtime.provider` (inexistente em produção) e agora usa o roteamento; E-mails: painel lateral com ↑↓/Esc/voltar, marcações em ícone de traço, contador coerente, "Regra apagada". Testes: app 941, servidor 485; conferência em navegador headless OK. |

## 11. Lições de erro (para calibrar quem chegar)

- Afirmou-se que havia "dois S" (JS + nativo); o JS era código morto.
- A fila do GitHub Actions é 1 em andamento + 1 pendente, não ilimitada.
- Constante existir no código ≠ ser exigida: conferir a condição que usa.
- Antes de trocar um valor de configuração, procurar teste que o trava.
- Antes de comparar versões, achar o commit realmente versionado como tal.
- O CI reescreve a versão antes dos testes: teste que compara versão fixa quebra.
- Emulador ≠ celular. Animação e tempo precisam do relato do dono.
