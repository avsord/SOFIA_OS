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

## 0. Passagem (onde paramos — substituir a cada sessão, não acumular)

O Pedro alterna entre o **Claude Code** (no computador, pasta `C:\Projetos\sofiaos`) e o **chat do claude.ai**. Quem terminar uma sessão reescreve esta seção; quem começar lê esta seção primeiro. No chat, o Claude clona a branch `sofia-app-android` (repositório público) e lê daqui.

- **Atualizado em:** 2026-11-06 noite (Brasília), no **Claude Code** (nuvem). Railway publica sozinho cada push em `sofia-app-android`.
- **Último (07/11, madrugada, Claude Code):** e-mail da Sofia ligado como remetente (funcionou: "Esqueceu a senha?" saiu às 00:28 e o Pedro redefiniu a senha); Início com prazo fixo e alarme `inicio-incompleto`; portão de qualidade `SOFIA_APP/tools/release-check.cjs` virou regra (§8). Próximo: ler os alarmes do Pedro no Railway (`[fluidez]`, `inicio-incompleto`) e corrigir o que aparecer, sempre passando pelo portão e publicando em lote.
- **Rodada da noite 05/11 (Claude Code):** (1) RAIZ do aviso "Este registro mudou em outro aparelho": o editor mandava a revisão da cópia da lista (cache/edição anterior); agora `api.saveEntity` em 409 busca a versão atual e aplica só os campos que a pessoa mudou (`src/lib/merge-save.ts`; base = item aberto ou a cópia daquela revisão vista do servidor). (2) Mover página na lateral não recusa mais revisão velha (`legacy-md.ts`). (3) Nota reaberta no site mostrava "[object Object]" (textarea sem value) — corrigido; links clicáveis nas notas (camada sobre o textarea) e nas Páginas (colar endereço vira link), cartão Copiar/Remover link. (4) Notas: ⋯ em cada linha, menu pequeno (ContextMenu agora desenhado acima das janelas laterais via portal `over-all.web.tsx`), reordenar arrastando, faixa "Tirar desta pasta" embaixo, voltar como linha acima do nome da pasta. (5) Agenda Dia: itens no mesmo horário lado a lado. (6) Capas sem piscar: todas baixam/decodificam em segundo plano desde o Início (`prefetchAllCovers`) e a página reusa o elemento decodificado (`WebCoverImg`). (7) Capas guardadas cifradas no navegador (`readSecureBytes`/`writeSecureBytes` em encrypted-storage.web.ts) para a 1ª carga; Rotina rápida com dias da semana e dia sim/dia não (`HomeBrief.tsx` + `Home.tsx`, modelo de cápsula já suportava). (8) Tela preta no voltar: `src/core/http-handler.js` manda HTML com no-store e `SOFIA_APP/public/assets/early.js` (v=5) recarrega uma vez se um arquivo /_expo/ falhar. (9) Editor: Shift+Enter, Ctrl+Z (store.undo), imagem selecionável/apagável. (10) Compartilhar página na web: `src/core/page-share.js` (rota pública /p/, link secreto, escopo de subpáginas), `api45.js` /api/pages/:id/share, botão em `SOFIA_APP/src/components/PageSharePanel.tsx`. (11) Capa aparecendo por cima do Início/Agenda: não reproduzido aqui; telas escondidas agora também com opacidade 0 e o texto das Páginas não aceita estilo de fora (posição fixa) ao colar/arrastar.
- **Páginas estilo Notion (05/11, 3 entregas no site):** teclado/menu "/"/atalhos/colar, arrastar e selecionar blocos, texto rico (`src/components/PageRichInput.web.tsx`, HTML com lista fechada de marcas) e barra ao selecionar com a Sofia, espaço → Sofia (resposta entra como blocos; usa a conversa), subpáginas como links (`page_link`) com prévia, endereço /paginas/<id>, topo com Editada/link/favorito, ↑ Topo, barra lateral com arrastar/Favoritos/Próximos eventos. Testes em `tests/paginas-notion-270.test.cjs`. Próximo: o que falta em §9. APK: o teste R7 (Páginas > 8 s no emulador) continua falhando como antes. Obs.: por engano a branch `main` (antiga, não publicada) recebeu 2 commits do painel antigo `public/app.js`; não afeta o site.
- **ABERTURA DO SITE APROVADA pelo Pedro ("agora ta certo, grava essa versão") — commit `adc82a6`, branch `aprovado/site-abertura-2026-11-04` (tags são recusadas pelo proxy da sessão).** Não mexer na abertura sem nova aprovação; para voltar a ela: `git checkout origin/aprovado/site-abertura-2026-11-04 -- SOFIA_APP/src SOFIA_APP/public`.
  - Véu na cor do tema do app (`#sofia-veil` em public/index.html; `revealWebVeil` guarda a cor e `early.js` a aplica na abertura seguinte) sai no 1º quadro do app, fade de 0,8 s (ajuste do Pedro após aprovar).
  - Linha do tempo única em CSS (`INTRO_T` em HomeHero.tsx, adiantada `INTRO_LEAD`=640 ms em Home.tsx): saudação já subindo quando a tela abre; data digitada; resumo; fileiras de blocos (0,70 s, 0,18 s entre elas) que sobem junto; brilho reto→oval começando em 1,35 s (ajuste do Pedro após aprovar).
  - Sem esqueleto/shimmer nos blocos do Início no computador (espaço reservado invisível). Esqueleto só na lista de Páginas da barra lateral, se ela não chegar.
  - Cópia criptografada do Início no navegador (`encrypted-storage.web.ts`, AES-GCM, chave não exportável no IndexedDB; apagada ao sair da conta) + `public/assets/early.js` pede as leituras do Início no carregamento do HTML.
  - Raiz da página com `overflow: clip` (o navegador deslocava a página de lado ao focar algo fora da borda).
  - Desfeito: encaixe (zoom) guardado no navegador — só diminuía e deixou o "Boa tarde" pequeno.
- **ABERTURA ATUAL (05/11, aprovada pelo Pedro no endereço de teste e promovida à principal):** praticamente só fade (escala 100,5%→100%, subida 0,8% da distância, blocos sobem 1 px, brilho oval logo ao abrir) começando 0,5 s antes de a tela abrir, fileiras logo ao abrir; data em fade junto com a saudação (sem digitar) e resumo em fade de 0,9 s (`INTRO`/`INTRO_T` em HomeHero.tsx). Guardada na branch `aprovado/site-abertura-2026-11-05`. Versões anteriores: `aprovado/site-abertura-2026-11-04` e `-v2`.
- **Em aberto (site):** barra lateral às vezes estreita (~126 px) com o conteúdo largo dentro, cortado (print do Pedro 16:17) — causa não achada; não reproduz aqui em 1763/1410/1175 px. Pulo no fim da abertura: Pedro aprovou a versão atual; se voltar, pedir vídeo (consigo analisar quadro a quadro com ffmpeg).
- **Android:** APKs gerados, mas o teste "R7 heavy data" falhou em 3 de 4 compilações da tarde (0bc5e50, d6966d8, f79294e; 774405b passou): 1–2 tentativas do modo Antigo passam de 8 s para mostrar Páginas (as outras 3,6–4,4 s, igual às verdes). As mudanças da tarde só rodam no site, mas a frequência pede investigação antes de testar no celular. Nada publicado no atualizador.
- **Lição da tarde:** ~20 ajustes publicados direto no site, testados só em condições de laboratório, trouxeram regressões que o Pedro achou. Combinado: versão em endereço de teste + vídeo nas condições dele (tela 1763 px, dados no volume dele, rede lenta) antes de publicar.
- **Próximo passo:** Pedro confere no site: capa não vaza mais, editar compromisso sem o aviso, notas (⋯, arrastar, links). Depois investigar a falha do R7 (modo Antigo, Páginas > 8 s) e a barra lateral estreita; depois, o Pedro testa o APK verde no celular e diz "aprovado" para publicar.

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
- (06/11, Pedro) **Site e app são do usuário: nenhuma configuração do e-mail da Sofia na interface; isso é estrutura do servidor.** **E-mail da Sofia (sofiaos.core@gmail.com) é do app**: só manda os e-mails do sistema ao usuário. **O e-mail do usuário é da conta dele**: Drive, Gmail, Agenda e tudo dele. Nunca misturar.

- 05/11/2026 (Pedro): **áreas só existem se a pessoa criar** ("isso nunca foi criado pelo usuário... essas áreas têm que ser criadas pelo próprio usuário"). A lista vem de `userAreas` (configurações; começa só com "Pessoal"), cria-se no próprio seletor ("Criar …") e o × tira da lista; a IA não cria área nova (nome fora da lista vira o padrão) e os apps não gravam mais áreas prontas (Lembretes, Encomendas, Notas, Biblioteca). Registros antigos mantêm a área que tinham.

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
- 04/11/2026 (Pedro): abertura do site — véu na cor do fundo que abre no 1º quadro (1 s); a animação do Início já acontecendo por trás; Páginas da barra lateral prontas antes (pedidas no carregamento); blocos do Início no computador SEM esqueleto/shimmer, entrando com conteúdo fileira por fileira.
- 05/11/2026 (Pedro): mover/alterar um item na linha do tempo é definitivo — a tarefa não feita NÃO volta ao horário combinado na virada do dia (substitui a regra da 0.3.317). X na linha do tempo: tarefa pergunta "Tirar da linha do tempo" (fica em Tarefas sem horário) ou "Excluir tarefa".

- **Compartilhar página (06/11/2026, Pedro: "tipo Notion mesmo"):** qualquer pessoa com o link vê, só leitura, sem senha, sem prazo (até desligar). Compartilhar a página leva as subpáginas; compartilhar uma subpágina mostra só ela e o que está dentro dela. Códigos em `settings.pageShares` (fora do conteúdo da página), página pública montada no servidor sem script (`src/core/page-share.js`).

- **Linha do tempo do Início (06/11/2026, aprovado por imagem):** virada do dia = linha com bolinha no topo + rótulo do dia; tudo depois da meia-noite de hoje com listras finas (opacidade baixa) contínuas até o fim da linha; tudo antes do começo de hoje escurecido contínuo (Pedro: "tem que ir ao infinito, não apagar"). Recusados: faixas coloridas fortes, contornos e etiquetas Hoje/Amanhã. Mudança visual na linha do tempo: mandar imagem antes.

- **Linha do tempo do Início — alcance (06/11/2026):** 1 mês para trás e 1 mês para frente a partir de hoje (decisão do Pedro).

- **Tablet (06/11/2026, Pedro):** versão tablet = o próprio site dentro do APK (`SOFIA_APP/src/components/TabletSite.tsx`), para não refazer no nativo o que já foi acertado no site. Precisa de internet; avisos continuam pelo app. Celular segue nativo.

- **Criar pela linha do tempo (06/11/2026, Pedro):** pedido de criar é entendido no próprio app e salvo na hora; sem tipo = Tarefa; "agenda" = compromisso. Só pergunta/foto/texto não reconhecido vai para a IA.

- **Página com senha (06/11/2026, decisões do Pedro; desenho enviado, aguardando aprovação):** dois níveis à escolha — Máxima (só a senha abre, esqueceu = perdeu, tranca ao sair da página) e Média (recuperável confirmando a senha da conta, fica aberta 5 min depois de sair). Conteúdo e subpáginas criptografados; Sofia/busca/link público não leem. Título fica visível com 🔒.

- **Início sem animação dos blocos (06/11/2026, Pedro):** as fileiras de blocos aparecem prontas, sem entrada; a saudação/fade da abertura continua.

- **Senha escrita numa página (06/11/2026, Pedro):** a página pergunta se quer trancar com senha; se "não", salva normalmente (marca sofia-secret-ok-v1) e fica fora do que a IA lê.

## 8. Regras que não se quebram
- **PORTÃO DE QUALIDADE OBRIGATÓRIO (Pedro 07/11: "toda vez que avança um passo regride 10; cria uma forma profissional")**: nenhuma publicação em `sofia-app-android` sem, nesta ordem: testes do servidor e do app, `npm run build:web` e **`cd SOFIA_APP && node tools/release-check.cjs` VERDE** (sobe servidor local com dados de exemplo; confere o Início nas 3 telas reais do Pedro — 1366×768, 1762×832 zoom 109%, 4K 2349×1163 —, visível sem pulo e sem erro; login e "Esqueceu a senha?"; varredura). Portão vermelho = não publica. **Publicar em lote** (no máximo 1–2 vezes por dia): cada publicação derruba o servidor por alguns segundos (volume único). **Toda sessão começa lendo os alarmes do computador do Pedro** no Railway: `[fluidez]` (pulos, partes recriadas) e `inicio-incompleto` (qual leitura não chegou). **Não fazer perguntas ao Pedro sobre o que dá para verificar; ele pediu para não ser perguntado.**
- **Varredura de coerência antes de entregar mudança no site** (Pedro 06/11: "não quero ficar falando item por item"): `node SOFIA_APP/tools/ux-sweep.cjs http://127.0.0.1:<porta> <email> <senha>` contra um servidor LOCAL de teste (clica em botões; recusa produção). Novo achado = corrigir ou registrar em §9 antes de dizer pronto.

- Site: telas fora de vista NUNCA com display:none (o navegador mede tudo como 0 e o que guarda medida volta achatado). DesktopPages usa visibility hidden + pointerEvents none.

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
- **E-mail da Sofia (remetente) LIGADO em 07/11:** sofiaos.core@gmail.com autorizou só envio (gmail.send) via /setup/email-sofia (rota interna, sem tela; recusa outra conta). Token guardado no volume (md_kv google.sender.v1). Os e-mails do sistema (redefinir senha, código do login) saem dele pela API do Gmail, grátis, apesar do bloqueio de SMTP do Railway. SOFIA_SMTP_USER no Railway está com o e-mail PESSOAL do usuário (configuração antiga) e não é mais usado como remetente. Falta: confirmar o 1º envio real no log.
- Ferramentas de compilação do app (Expo CLI) com 13 avisos de segurança: não chegam ao usuário; resolver na próxima atualização do Expo, não rebaixando versão.
- Perguntar ao Pedro se alguma dose/compromisso dele "mudou de horário sozinho" (defeito do arrasto pendurado, corrigido 06/11): pode haver registros movidos sem ele perceber (tag `sofia-move-v1:` nos itens).
- Avisos "locais" (doses da Rotina, tarefa/rotina atrasada) gerados no aparelho (`bell-inbox.ts`): o "limpar" fica só naquele navegador/celular (IndexedDB) e se perde ao sair da conta — limpar no celular não limpa no site e vice-versa. Pedro (06/11): "cliquei pra limpar e não limpou"; aqui o X e "Tomei" funcionam no mesmo navegador. Confirmar com ele qual botão/onde; provável solução: guardar os avisos locais dispensados no servidor.
- Início do site: conferir o próximo relatório `[fluidez]` do Pedro após a correção do encaixe/nomes (esperado: `greet` vazio, `shifts` vazio). Testar também telas mais baixas (zoom do navegador 125%).
- Início do site: travada de ~0,5 s na montagem (primeiros 3 s, CPU 4×) — investigar o que o HomeBrief monta de uma vez; o meio pixel de salto no começo da subida aprovada é da animação pendente enquanto a página está ocupada.
- Página com senha: imagens/anexos dentro da página ainda NÃO são criptografados (só o texto/blocos); subpágina nova dentro de trancada é cifrada só se a chave estiver aberta. Pedro não respondeu sobre anexos.
- Chave de backup (KeyStore) no Railway fica na pasta "secure" padrão, que é apagada a cada deploy (descoberto 06/11 ao fazer a página com senha) — verificar se os backups cifrados continuam abríveis.
- Mercado Livre no site: "Identidade, preço ou data inválidos" sem causa achada (o formato do servidor passa nos testes); a mensagem agora mostra o campo entre colchetes — pedir ao Pedro o texto novo.

- **Páginas estilo Notion — o que falta (pedido do Pedro 05/11: "tudo igual ao Notion"):** feito no site: teclado, menu "/", atalhos, colar, arrastar/selecionar blocos, texto rico com barra ao selecionar, Sofia na página, subpáginas como links com prévia, janelas de ícone/capa, topo (Editada/link/favorito), barra lateral (arrastar, ⋯/+, Favoritos, Próximos eventos). Falta: Tab para recuar (blocos aninhados), alternante (toggle), imagem/arquivo como bloco no site, comentários, tooltip no +. Texto rico só no site: editar a mesma linha no celular tira a formatação dela. Favoritos ficam no navegador (não sincronizam).

- **Capa por cima do Início/Agenda (05/11 noite):** não reproduzido localmente (capa enviada + voltar ao Início). Proteções aplicadas (opacidade 0 na tela escondida; texto das Páginas sem estilo de fora). Se voltar, pedir print com F12 > elemento.
- **Compartilhar página:** só no computador por enquanto (no celular falta o botão); a página pública mostra blocos de texto, imagens, notas e tabelas (visões kanban/calendário viram tabela).
- **Lembrete "coloquei 15 e fica 3 da manhã" (06/11):** não reproduzido (novo lembrete e servidor guardam 15:00 certo); falta saber em qual campo/tela ele vê 03:00.
- **Tablet (06/11):** conferir num tablet real (login automático, voltar, envio de capa/arquivo pela WebView, avisos). Tocar num aviso no tablet abre a tela nativa de avisos por cima do site (ideal: abrir no site).
- **Tarefa com fim (06/11):** falta campo de "fim" para editar à mão no editor da tarefa (hoje só pela conversa).
- **Price Tracker no site (06/11):** conferir com KaBuM real; "buscar outras lojas" (readLinks) ainda depende do navegador invisível e não funciona no site.
- **Links (05/11):** colar várias linhas nas Páginas ainda não preserva link; links nas notas só no site (celular segue texto).

- **Railway (05/11):** cada publicação reinicia o servidor e corta a resposta da Sofia em andamento ("A chamada foi interrompida"); o app agora reenvia sozinho. Proposto ao Pedro: ligar o tempo de espera no desligamento (~30 s) — mudança de configuração do Railway, só com o OK dele. O servidor hoje cancela a resposta antes de esperar (src/server.js `stop`).

- **Lista do Pedro (WhatsApp 03–04/11) — DEFEITOS:** corrigidos em 04/11 à noite: mini chat por baixo das fileiras (fileira 1 com zIndex), nomes do balão (380 px, 2 linhas, balão acima dos rótulos), "agora" desliza ao voltar à aba, clicar numa bolinha cria naquele horário (no computador; prévia no passar do mouse), segurar a data abre o criador, criar pela Sofia atualiza na hora (leituras não reaproveitam dado velho após escrita; agenda relê), painel Editar (largura em % da janela, sem passar da borda) e confirmação por cima do painel. Price Tracker: decisão do Pedro (05/11) — o menor preço real entre as lojas em todo lugar (`primaryNow` = oferta atual mais barata). **Falta confirmar com o Pedro:** perfil no canto inferior esquerdo (não existe no código atual; já saiu antes) e "tirar tudo do filtro" de Notas/Biblioteca (a rodada de 03/11 já deixou só áreas — ver se ainda falta algo).
- **Lista do Pedro — NOVO (desenho antes, aprovação dele):** linha do tempo "microscópica" (entrar como num universo); painel de edição de eventos fixo à direita, didático e premium (05/11: já existe o mini editor no balão da linha do tempo — `QuickEditor`/`QuickDose` em HomeBrief.tsx, `quickEdit` em Home.tsx: nome, descrição, data/hora por seletor, nível de importância; doses: horário + Tomei); "drive" na Sofia; colar/arrastar imagem no mini chat.

- **Android R7 (04/11):** teste "R7 heavy data" falhando em 3/4 compilações (modo Antigo: 1–2 de 5 tentativas > 8 s até mostrar Páginas). Investigar antes do celular.
- **Site — barra lateral estreita e cortada (print do Pedro 04/11 16:17):** causa não achada; pedir vídeo/print com F12.

- **CI Android:** verde na #293 (04/11). Falta: "Native checks" dos commits sem `[manual-apk]`.
- **Servidor a publicar no Railway:** restauração de backup, lembretes (só ativos, dia do mês, marcas usadas), Quadro apagado com a conversa, apagar conversas selecionadas, retenção de backups por dia. Antes: confirmar backup/volume.
- **Desenho 03/11 ainda não feito:** Agenda Mês com lista do dia embaixo e faixa da semana no Dia; Tarefas com chips de prioridade (seletor mantido: os roteiros nativos tocam nele); Finanças com + no cabeçalho (o botão redondo continua); painéis da Biblioteca/Notas por cima com fundo escuro; botões 32 px em todos os cabeçalhos; Perfil do celular em lista compacta; arrastar itens na linha do tempo do celular; Rotina e Finanças quadradas (ficaram na largura toda: não cabem).
- **Áudio pela barrinha "Criar":** a foto leva o horário; o áudio não (o servidor usa só a transcrição) — precisa de campo novo no servidor.

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

## 10. Diário de rodadas (só as 5 últimas aqui)
O histórico completo fica em [docs/historico/DIARIO_DE_RODADAS.md](historico/DIARIO_DE_RODADAS.md): não ler inteiro, consultar com grep pela versão ou pelo assunto. Cada rodada acrescenta UMA linha curta (até ~300 caracteres) aqui E no histórico; aqui ficam só as 5 mais recentes.

| Data | Versão | PR | O quê | Resultado |
|---|---|---|---|---|
| 2026-11-06 | (delivery) | Raiz do arrasto pendurado: num clique rápido o "apertou" chegava depois do "soltou"; o arrasto era preparado com o botão já solto e segurava o Esc (balão não fechava). Agora não prepara com botão solto e só segura Esc em arrasto de verdade. Varredura do Início: 0 achados reais | testes ok; [manual-apk] |
| 2026-11-06 | (delivery) | Checkup geral: 635 respostas 502 na semana, todas no minuto de publicações (volume único = servidor desliga antes de ligar o novo) → leituras do app tentam até 3x; dependências do servidor sem falhas (body-parser/qs); Páginas da barra lateral não pulam mais (Próximos eventos reserva espaço). E-mail do servidor bloqueado (SMTP) | testes ok; [manual-apk] |
| 2026-11-06 | (delivery) | E-mails da Sofia (redefinir senha, código do login) saem pela conta Google ligada (gmail.send), já que o Railway bloqueia SMTP; SMTP fica como 2ª opção. Perfil → Conexões mostra "Religar o Google" até a permissão ser dada. Ao liberar, o código do 2º passo passa a valer de verdade | testes ok; [manual-apk] |
| 2026-11-06 | (delivery) | E-mail da Sofia (sofiaos.core) é o remetente do app (redefinir senha, código do login), ligado só para envio e só aceitando essa conta; a conta Google do usuário fica só com Agenda/Drive/Gmail. Perfil → Conexões → "E-mail da Sofia" | testes ok; [manual-apk] |
| 2026-11-07 | (delivery) | Início só com a saudação (print do Pedro, monitor 4K): o prazo de 8 s recomeçava a cada dado. Agora fixo + alarme `inicio-incompleto` com a leitura que faltou (testado travando a agenda: blocos em 8,5 s, alarme certo). Portão `tools/release-check.cjs` obrigatório (MASTER §8) | portão verde; [manual-apk] |

## 11. Lições de erro (para calibrar quem chegar)

- Depois de publicar, abrir o site compilado e conferir que nenhuma tela mostra "Algo deu errado" (teste local olhava só a parte mudada; 1eb44b2 derrubou todas as telas e passou despercebido) (06/11/2026).
- Campo novo gravado pelo servidor precisa estar no catálogo do tipo (workspace recusa com BAD_FIELD); teste unitário de função pura não pega: testar a gravação real (06/11/2026).
- Capa "piscando": medir só o <img> ou testar com imagens pequenas não reproduz; o navegador descarta a decodificação de fotos grandes fora da tela. Gravar a tela e usar foto do tamanho real.

- Afirmou-se que havia "dois S" (JS + nativo); o JS era código morto.
- A fila do GitHub Actions é 1 em andamento + 1 pendente, não ilimitada.
- Constante existir no código ≠ ser exigida: conferir a condição que usa.
- Antes de trocar um valor de configuração, procurar teste que o trava.
- Antes de comparar versões, achar o commit realmente versionado como tal.
- O CI reescreve a versão antes dos testes: teste que compara versão fixa quebra.
- Emulador ≠ celular. Animação e tempo precisam do relato do dono.
- No site, animationKeyframes só vale via StyleSheet.create e com transform em texto ('translateX(8px)'); em estilo solto o react-native-web ignora sem erro (03/11/2026: o brilho do esqueleto ficou parado por isso).
- O site é o app compilado em public/web: mudança em SOFIA_APP/src só aparece no site depois de `npm run build:web` e com public/web no mesmo commit (03/11/2026: uma rodada subiu sem isso e o site não mudou).
