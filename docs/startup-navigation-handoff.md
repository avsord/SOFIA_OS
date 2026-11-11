## Entrega manual de candidato — 0.3.94/code99, 09/10/2026

Fonte7f95502bf8a894611e2d947428d6bed246836a82; execução37977881730. APK51.619.493 bytes; SHA256b783cd88c499cace1b29e4e564f23d26b45674d82dfe2d87537c3acd1cbea223; assinatura existente fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c. Arquivo exato Sofia-OS-0.3.94.apk disponibilizado como CANDIDATO PARA TESTE, com ressalva explícita de reprovação do tempo de abertura; não é APK aprovado nem release do atualizador. Não afirmar validação completa.

094 substitui AnimatedVectorDrawable da entrada por vetor estático com escala0.88 embutida. O Android usa AppCompatImageView (confirmado no log), sem SurfaceView separada. A própria imagem original cresce por transformação nativa até1/0.88 em800ms, interpolador accelerate/decelerate. O mesmo SplashScreenView faz fade95ms; limpeza180ms, cancelamento e conclusão únicos. Sem nova cobertura, transferência do S, reinício de escala ou controle SurfaceControl do sistema. Mantém desenho maior/anel discreto/roxo#7258E8 e cache/funcionalidades da fonte atual.

Build, tipos, suites prévias, pacote/hash/assinatura passaram. Instalação por cima e Home autenticada offline com dados sintéticos passaram antes do gate. Native smoke REPROVOU: DATA mediana1427ms vsbaseline842ms; fade mediano536ms, remoção mediana535ms, início0ms. Limites150/150/250 ebaseline+200 mantidos; nenhum resultado falsificado ou teste retirado. O gate interrompeu o script: conversa/paginação/primeiro toque desta versão NÃO foram executados. Sem prova de aparelho físico ou preservação de dados reais.

Gravação de migração inspecionada: S37→44px em320×640, aumento contínuo, sem intervalo sem S nem reaparecimento após saída. Dois quadros mostram fade simultâneo de marca/fundo para Home; sem troca de símbolo. O vídeo variável não resolve a pausa de cerca de500ms como causa de UI/RenderThread. Não confundir correção visual observada com aprovação do tempo de abertura.

093/run37975371047 também reprovou (fade mediano581ms, DATA1414 vs899) e seu vídeo mostrou roxo sem S antes de a cobertura aparecer; não entregue. 092 é hipótese DESCARTADA: SurfaceView.getSurfaceControl não permite alterar propriedades do controle retornado. O runtime094 não usa essa transação. 089/090/091 igualmente não entregues como aprovados.

Investigação/edição e CI separadas: runtime094 promovido19:05:57UTC, CI19:05:59–19:15:54UTC. Retomada após pedidos de status18:46BRT: resultado real consultado, evidência baixada e arquivo verificado; candidato oferecido com falha declarada. Houve interrupção de acesso ao terminal durante a sessão, sem entrega ou acompanhamento em segundo plano. Documentação final não recompila APK. Limitação pendente: atraso nativo da saída; não publicar oficialmente enquanto esse gate falhar.

## 0.3.92 — opacidade do ícone no compositor

091/run37972406277 compilou, mas fade mediano≈520ms e remoção≈520ms reprovaram. Mantém desenho50% maior e splash original sem transferência. Troca somente SurfaceView.setAlpha no update listener por SurfaceControl.Transaction.setAlpha, API pública29+, ramoAndroid31+. Evita invalidação/layout da hierarquia do ícone e usa o valor absoluto do RenderNode do fundo. Transaction única, fechada em conclusão/cancelamento. Sem restauraçãoalpha1, acúmulo, cópia do S ou frame novo. Todos os limites numéricos e a ordem real dos eventos preservados. Fonte091 atual como base; teste de contrato local passou. APK/assinatura/smoke/visual92 pendentes. Hipótese de custo da setter precisa de evidência nativa.

## 0.3.91 — fade na própria splash, sem troca do S

090/run37970590920 reprovou: início124ms, fade384ms, DATA1042ms vs658ms; cobertura/frame extra atrasou saída. Delta elimina completamente a nova cobertura e transferência: ViewPropertyAnimator anima o RenderNode da SplashScreenView já visível,95ms. setUpdateListener sincroniza SurfaceView do ícone com splash.alpha absoluta; ImageView herda naturalmente. AOSP SplashScreenView.setAlpha multiplicaria a alpha do SurfaceView; usar o animador de View com atualização explícita evita acumulação e restauração1 que poderia piscar. S48dp/anel100.8dp e entrada finita permanecem no drawable OS original.

Smoke muda só ordem legítima dos eventos: remoção ocorre após fade, antes de DATA. Todos os limites numéricos continuam150/150/250ms ebaseline+200; não registra remoção fictícia nem relaxa desempenho. Regressões exigem um único S, nenhuma cópia/fence, alpha absoluta e dados liberados somente após conclusão. Rota manual; sem backend/dados. Fonte090 exata como base, build/testes/assinatura/migração/visual91 pendentes.

## 0.3.90 — observar frame da janela real e manter fade validado

089/run37942044183 compilou, mas reprovou fade mediano591ms, início≈104–123ms, indicando fallback100ms. Causa candidata: observador da ViewOverlay não participa da árvore real submetida. Registrar no decor.viewTreeObserver e retornar95ms/180ms do runtime088 aprovado; manter cobertura renderizada antes da remoção OS, S48dp e anel100.8dp. Sem relaxar gates. Feedback de status do usuário15:01BRT; retoma a execução exata, sem entregar089 reprovado. Ajuste/contrato focado nesta retomada; CI/visual pendentes.

## 0.3.89 — aumentar S e impedir intervalo na troca nativa

Pedido ativo: deixar S maior e corrigir flicker no final, entregar APK. Base d53f2c21bc0b29eaf1c899e0955cb75a881c8284, runtime088 (run37933059646 passou). A087 entregue passou gates, mas vídeo≈19.8fps não resolveu frames intermediários do fade e houve relato físico de piscada. Hipótese do código: splash.remove durante preDraw pode anteceder o primeiro quadro da cobertura criada ali; não é prova de diagnóstico no aparelho.

Delta mínimo: tamanho48dp/anel100.8dp (+50%), mesma escala finita sincronizada com relógio Android. Aguarda registerFrameCommitCallback antes de remover OS; software usa próximo frame, OEM fallback100ms; Runnable protege transferência única e Activity antiga. Fade150ms/cleanup230ms, mantendo todos os gates nativos e correção088 de renders da Shell. Só plugins nativos, identidade/testes e documentação. Rota manual-apk; CI valida suites antes de compilar, assinatura, instalação por cima, Home/conversa/paginação sintéticas e vídeo depois. Sem desinstalação, limpeza de dados ou backend. Investigação/edição≈14:03UTC em diante; CI será registrado separadamente. Build e aceite físico pendentes.

## Entrega manual validada — 0.3.87/code92, 09/10/2026

Fonte d607bcca1a98aea24b5982ae742c2b295caf3213; execução37931493993. Build/assinatura/TypeScript/suites e smoke de produção passaram. APK51.619.377 bytes; SHA256598af617c5f8f7f4be7b07cd7e62da9b322ffc10f96592e6e002ec2710845bda; certificado existente fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c. Download manual Sofia-OS-0.3.87.apk disponibilizado, sem release do atualizador. Fonte e APK conferidos contra o artefato exato.

Cinco partidas frias com dados sintéticos offline: DATA mediana937ms vsbaseline0.3.65 892ms; prontidão→fade5ms, fade→fim118ms. Instalação por cima, Home autenticada sintética, primeiro toque, conversa preservada e paginação automática passaram. Gravação de migração: S branco28→30→32px em320×640, centro fixo e sem encolhimento antes de Home; roxo e círculo discretos. A gravação variável tem média≈19.8fps e não resolve quadros intermediários do fade curto; duração e conclusão foram medidas pelos marcadores nativos. Não é prova de aparelho físico nem preservação de dados reais. A0.3.88 concorrente preserva o desenho/movimento e está em outra execução; a aprovação aqui refere-se somente ao APK087.

Delta final iniciado12:30UTC, promoção12:39:39UTC; CI aguardou execução concorrente até≈12:46:45UTC e terminou≈12:57UTC. Tempos de investigação/edição e fila/CI separados, sem alegação percentual de melhora.

## 0.3.88 — impedir renders intermediários durante a saída

Base d607bcca1a98aea24b5982ae742c2b295caf3213 (0.3.87/code92), alteração concorrente que preserva uma entrada orgânica finita0.88→1 e usa o relógio original do Android. Mantém integralmente esse delta. O S final é maior que083, sem pulso repetido nem reinício na superfície de saída.

A086/run37931290792 reprovou novamente: fade mediano574ms e DATA1296ms vs850ms. A hipótese de relayout não resolveu o atraso. Código da Shell ainda habilitava useAfterFirstPaint no caminho com cache, disparando setState(painted) e render completo durante o fade, além de boot/setBooting pelo evento AppState antes de visible. Delta088 desabilita o sinal intermediário nesse caminho e guarda boot por visible. Sem cache, whenInteractive continua liberando leituras essenciais. Sem mudança de dados/auth/backend. Teste de hook desabilitado verifica que não há inscrição nativa ou frame agendado; gates nativos intactos. TypeScript/suites locais executados; APK/smoke/gravação pendentes. Promoção sobre head atual, sem sobrescrever a alteração concorrente087.

## 0.3.87 — escala orgânica sem reinício e proporção do anexo

Base atual725ff51dc2d974fb315619dbfc86e9976ecd25c3 (0.3.86/code91); integra ViewOverlay sem relayout concorrente. Pedido ativo desta conversa exige escala orgânica e fade, além de remover o encolhimento brusco. A0.3.85 concorrente resolveu o reinício removendo movimento; este delta preserva a superfície única, fade95/limpeza180 e troca sem loop independente, usando uma entrada finita0.88→1 em800ms. A superfície de saída segue `SplashScreenView.iconAnimationStart`, curva accelerate/decelerate e bounds1.5× do foreground Android. Sem aguardar fim do movimento para liberar Home. S32dp/círculo67.2dp correspondem ao anexo; são maiores que os20–22px reais do vídeo083. Não adota48dp da085, pois diverge desta referência.

Teste JVM verifica início, fim, monotonicidade e curva; TypeScript e suite prévia executados. Nenhum gate nativo alterado. Fonte e alteração somente no Android e documentação; entrega manual. CI, assinatura, instalação por cima, Home/conversa/paginação sintéticas e inspeção de gravação pendentes. Investigação/edição deste delta iniciada12:30UTC; CI será registrada separadamente. Sem prova de aparelho físico.

## 0.3.86 — saída sem relayout da Home

0.3.85/run37929974207 compilou, mas o smoke reprovou: fade mediano584ms, DATA1332ms vsbaseline904ms. Instalação por cima e Home offline sintética passaram antes do gate. Arquivo085 retido como candidato reprovado; não entregar como validado.

Delta086 mantém o S maior/estável e o mesmo desenho. A superfície adicionada via decor.addView durante preDraw solicita outro layout da árvore; muda para decor.overlay, que apenas invalida a camada desenhada. A hipótese do atraso deve ser confirmada no APK. Mantém o animador existente com cleanup independente180ms e fade95ms, sem relaxar gates ou alterar dados. Testes focados e TypeScript executados; CI e inspeção visual pendentes. Rota manual-apk.

## 0.3.85 — pedido de S maior e correção de flicker

Base fd26883977a00b14fc2b99091eb05932a5cba9bb (0.3.84), ainda não entregue nesta conversa. Usuário aprovou 0.3.83 e pediu aumento e correção da piscada. A 0.3.84 compilou, mas run37928451677 reprovou o gate nativo: fade mediano650ms e DATA1473ms contra907ms. Não entregar esse APK como aprovado.

Causa candidata do flicker: o sistema e a superfície de saída usam instâncias independentes de AnimatedVectorDrawable, reiniciando o pulso1→1.025 na transferência. O código confirma o reinício; não é diagnóstico comprovado do aparelho. Delta085: mesmo vetor estável em ambas, sem pulso/reinício; S e círculo1.5× maiores que084, viewport192 mantido; compensação de bounds1.5 e fallback288 mantidos. Duração retorna95ms/limpeza180ms, caminho que passou na083. Sem dados, rede ou navegação alterados. TypeScript e suites locais executados; APK/certificado/instalação/Home/histórico/gravação ainda pendentes. Rota manual-apk, sem release do atualizador. Tempo de CI será registrado separadamente da investigação/edição.

## 0.3.84 — proporção do anexo e fade mais perceptível

Base 2e7d5c5e31374cb87ddade2e6826bb90b7e2e327, runtime a0ec56250181a0c755e09a97267e0dff4659d84e (0.3.83). Run 37926742074 passou instalação por cima, Home offline autenticada sintética, conversa e paginação; DATA mediana 1007ms contra955ms, fade118ms. Não representa teste físico.

Delta preserva essa estratégia nativa. A medida de 32dp anteriormente registrada foi inferida do viewport; o vídeo real320×640 mostra S de20–22px na0.3.83. O viewport192 corrige o S para32dp e círculo67dp sobre a região interna288dp da iconView192dp. Mesmos limites compensados na transferência, fallback legado288dp. Fade160ms e limpeza225ms; mantém gate250ms e comparação de abertura sem relaxamento. Sem mudanças de dados, rede ou navegação. Build/nativo/visual0.3.84 pendentes.

## Entrega validada 09/10/2026 — 0.3.83/code88

Execução 37926742074, fonte a0ec56250181a0c755e09a97267e0dff4659d84e. Build, testes de app/backend e smoke nativo passaram. APK 51.620.433 bytes, SHA256 997a2b0eca88aeb537ca0f8835fb295246bf65e6b83b1612e41fb20fb4bf443b; certificado existente fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c. Cinco partidas frias offline com dados sintéticos: DATA mediana 1007ms, baseline0.3.65 955ms; fade mediano118ms, início após prontidão3ms. Instalação por cima, Home autenticada sintética, primeiro toque, conversa e paginação salvos passaram. Gravação de migração inspecionada: fundo roxo, S branco32dp e círculo67dp; saída conjunta. Não é prova de velocidade ou dados reais no aparelho do proprietário. Entrega manual; sem publicação no atualizador. O usuário recebe o arquivo exato Sofia-OS-0.3.83.apk.

## 0.3.83 — consolidar a referência roxa concorrente com saída validada

Enquanto este trabalho estava ativo, entrou o commit 945cca31e9aa6f91e635b6af57df6010e7554b2f com a referência roxa da 0.3.82. A consolidação anterior havia sobrescrito dois arquivos dessa alteração concorrente; a 0.3.83 restaura o visual do anexo 1000266787.png: fundo #7258E8, S branco 32dp e círculo discreto 67dp. Mantém a compensação AOSP de 1,5 nos bounds e fallback432dp para esse novo viewport288. Combina o visual com a splash original mantida até Home, escala repetida 1→1.025 no RenderThread e fade conjunto de95ms, como no caminho validado da0.3.78. Não reduz os gates de teste. 0.3.83/code88 manual; build/smoke pendentes neste registro.

## 0.3.82 — retornar à coordenação validada e animar a splash original

A 0.3.81 também reprovou: fade mediano 673 ms; DATA 1667 ms vs baseline 976 ms. A animação vetorial sozinha não resolveu o atraso introduzido pela transferência antecipada da splash. Retoma-se a criação da superfície somente na saída, com fade 95 ms como na 0.3.78 (mediana anterior 117 ms), preservando o logo original do Android enquanto Home prepara. O animador da splash original agora repete a escala suave sem overshoot. O ícone ausente/sem bounds usa 288dp (padrão Android sem icon background), não 192dp; a gravação mostrou que a fallback anterior ainda encolhia o S. Não se relaxa nenhum gate de desempenho. 0.3.82/code87 manual; build/smoke pendentes neste registro.

## 0.3.81 — diagnóstico do atraso da animação

A 0.3.79 compilou e instalou por cima, mas o smoke reprovou: fade mediano 538 ms e DATA 1495 ms, contra baseline 886 ms. Na gravação houve troca abrupta de tamanho, tratada por bounds do ícone na 0.3.80. A animação via canvas invalidava a árvore nativa a cada frame; a 0.3.81 usa AnimatedVectorDrawable com repetição suave na RenderThread, sem esse loop de invalidação. Mantém a mesma superfície e bounds, fade 190 ms sem end action e limpeza independente em 230 ms. Não se relaxa o gate de 250 ms nem o limite de abertura. Testes/build nativos da 0.3.81 ainda pendentes ao registrar este delta. Entrega manual, sem backend ou publicação no atualizador.

## Retomada 09/10/2026 — 0.3.80 manual

Base observada: 5935635d43f579f035ef9f42030113b5023a0f5c, após APK 0.3.78/code83. A execução 37917803822 falhou antes de compilar porque startup-fade-060 exigia 95 ms, embora o código tivesse sido alterado para 190 ms. Outros contratos também mantinham o literal antigo.

Delta: a única superfície nativa é criada no primeiro callback da splash, mantida durante a preparação da Home e reutilizada no fade; o movimento não reinicia na saída. Invalidação acompanha frames e respeita animações desativadas. O marcador SPLASH_REMOVED agora pode anteceder LOCAL_READY; o smoke exige ambos antes de FADE_START, mantendo limites de início, duração e interação. A superfície também captura os limites reais do ícone do sistema antes de removê-lo, evitando trocar as dimensões OEM pelo tamanho fixo de 192dp. Versão 0.3.80/code85; sem backend ou publicação no atualizador. Build e smoke ainda pendentes no momento deste registro. Sem evidência física.

## 0.3.65 — toque dos menus, círculo na abertura e caminho manual sem testes

Base exata entregue: 0.3.64/code69, fonte 55b2abae8512bf54a4a2bc595b10aa8b5a3f4ef0. Novo candidato 0.3.65/code70. O usuário relatou atraso ao tocar nos menus, pediu o S dentro do círculo e nova redução de espera inicial. Autorizou entrega manual sem testes e solicitou o arquivo pronto, sem sucessivos avisos de progresso. Publicação oficial aguarda retorno do usuário.

Caminho observado: SofiaCalendarTouchGuard procurava calendário/agenda/Home mesmo após reconhecer um toque fora do pager, na barra de menus. O novo retorno antecipado preserva onPressIn e a decisão de navegação no React. Telas ocultas montam uma a uma após commit e oportunidade ociosa, com startTransition. A splash coleta os mesmos marcadores em uma varredura por frame; não reduz a condição de prontidão. O desenho circular substitui apenas a imagem da splash, sem uma segunda tela ou timer.

Rota [manual-apk] [no-tests]: não roda suites de código, backend ou emulador. Retém build de produção e conferência de identidade/assinatura. Os caminhos de publicação oficial mantêm todos os gates. Nenhuma medição de melhora ou validação física é afirmada. Nenhuma mudança em main, servidor, banco, login ou histórico.

0.3.64 foi enviada à conversa e salva como APK; após erro no download, foram gerados novo anexo e ZIP. O relato de atraso na navegação iniciou este delta. Não reutilizar a 0.3.64 como a nova correção.

# Sofia OS — startup/navigation handoff, 2026-10-08

## Current work: 0.3.64 earlier local preparation

User reports 0.3.63 opens faster on their phone and authorized another attempt. Evidence 11576479261 from run 37838702548 recorded five offline cold starts: 0.3.62 DATA median 1377 ms, 0.3.63 median 876 ms. The production upgrade, saved Home agenda and recent-chat display worked. The overall native job failed on the older-message scroll assertion: the swipe began at y=192 on the offline error banner, above the actual chat viewport y=226..478 in the retained XML. The next smoke derives both gesture endpoints from the actual vertical ScrollView, retains final failure screenshots and compares the exact 0.3.63 APK.

The next candidate starts full local preparation before registering React, seeds SafeAreaProvider with the native initial window metrics, and warms/reuses the existing Android Keystore handle on the serial snapshot I/O worker. No plaintext storage, scope changes, data loss, server deployment or readiness-gate removal. Cache/UI readiness remains mandatory. It may reduce pre-Home work; only the measured same-emulator result may be described as faster. User additionally requested exactly 10 recent messages as the default. The shared launch/UI page size is now 10, with older batches loaded only after upward scrolling; polling does not reopen hidden history. Full archives remain intact. Version 0.3.64/code69; build/test results pending.

## 0.3.63 direct candidate delivery checkpoint

Exact source: 4ac25d8dc59add8a37dd098e629478760a799961. Run 37838702548. Build job 113522290371 succeeded; APK version 0.3.63/code68, 51,609,212 bytes, SHA256 fcd2c27dd8cd44da8ec27af14c635daaa856fe8fe20470ce9c771d308d164217. Production package and signing certificate match; six changed runtime/test source files match the compiled source archive byte-for-byte. 368 local app tests and TypeScript passed. Build artifact 11577306140; uploaded direct file Sofia-OS-0.3.63.apk (Library libfile_da67cbc8210081918d0776cf2f5ff768). User explicitly requested the APK immediately, without further progress messages.

At this checkpoint the manual emulator job 113525118759 is still running. Do not claim its installation/pagination results or a speed improvement until its real result is retrieved. No official updater release was published. Next action: retrieve the exact job/evidence and record the measured five-start comparison; reuse this APK if no runtime changes are necessary.

Railway verified the Android-only commit as SKIPPED (e1394b41-7a50-45e0-bb64-285d372fb69e); the existing server deployment stayed unchanged. Health check succeeded with HTTP 200 in 0.182413 s. Production Gradle build took 4m17s with 124 tasks from cache. The identified unnecessary-server-restart cause was corrected by root-anchored watch paths; do not infer a general guarantee against all 502s or an OpenAI outage.

## Current work: 0.3.63 faster native reveal

User asked for further startup improvement after receiving 0.3.62. In run 37834460902, offline production-APK upgrade and authenticated Home/Chat checks passed. Exact delivered 0.3.62: source b03aa69646c178e556b17e871447c85a72826b9a, code67, APK SHA256 d8033b9566fdd9b0af74380d1a55e9856851f0285b3ca208a203597e86642013. Emulator medians were 1448 ms for 0.3.61 and 1394 ms for 0.3.62; this small three-sample difference is not proof of a substantial speedup on the user's phone.

Candidate 0.3.63/code68 removes the additional native opacity animation once the real Home's data/layout requirements are met. The original system splash still stays until that readiness condition. The same next-frame DATA timing boundary remains, and visibility subscribers cannot run early. No cache, API, data, login or ready markers are removed. Manual CI compares five cold starts of the exact 0.3.62 and new production APKs on the same offline seeded account, with in-place installation and Home/Chat checks; record the result before claiming a speed gain.

The same 0.3.63 candidate now also opens with the latest 20 messages, restores older local/server history in batches of 20 on deliberate upward scrolling, and prevents polling/send acknowledgements from reopening hidden older rows. The encrypted first-screen projection stores 20; full hydration merges back the untouched larger archive before saving. Existing server endpoints still return up to 100 messages per request; this change bounds the launch/UI window without deploying the backend. Focused executable tests cover polling, optimistic acknowledgement, deletions, legacy records, pagination and archive preservation. The single-production-APK emulator check now seeds a longer conversation and scrolls to the preserved oldest synthetic messages offline.

Run 37837214009 failed at 20:09:35 UTC before compilation when the public health endpoint returned HTTP 502. The next manual build retains server compatibility checks, retries transient HTTP failures up to three times within a bounded window, records request headers/timing and reuses that same fresh response for the adjacent capability check instead of making a duplicate request. This mitigates delivery interruption; it does not assert that the server fault itself is fixed.

Railway diagnosis: deployment 5e26f014-2e0a-4f0c-9385-d2ea8f99c621 was triggered by Android-only commit 77464032. At 20:09:20 UTC the previous container stopped; /health and /api/mobile/chat-sync returned 502 at 20:09:35 after three 5-second connection-dial timeouts. Requests recovered at 20:09:36. Existing gitignore-style watch patterns included unanchored package.json/package-lock.json, which also match SOFIA_APP/package.json and its lockfile. Updated only watchPatterns to /src/**, /tools/**, /package.json, /package-lock.json in production, preserving the mounted /sofia volume and running deployment. Verify the next Android-only commit is skipped by Railway. No redeploy, reset, backend code edit or data write was requested/performed for this fix.

Status discipline after the voice-response error: keep the exact run ID and source SHA as the resume checkpoint. A failed/interrupted status lookup is not evidence of a failed build or lost access. Report lookup failure, build failure, build completion and artifact delivery as separate observable states. Re-query the same run automatically under the existing delivery authorization. Never ask for authorization again solely because a status lookup was interrupted, restart a successful build for a lookup error, or announce an attached APK before upload/link completion. A failed response must be corrected explicitly rather than attributed to an unverified OpenAI outage.

## Current work: 0.3.62 local-first manual delivery

The user reported that 0.3.61 remained slow and explicitly prioritized startup over fade. Home must already contain the current-month agenda and tasks; Chat must open with saved recent messages. Older conversations must stay preserved. The user authorized one candidate APK delivered directly for phone testing, without updater publication.

Base remote commit: bfea46be70a38e8b650ef0c13f0127e55fe127b2, delivered 0.3.61/code66. Candidate: 0.3.62/code67, same package/channel/signing configuration. A separate encrypted account-scoped launch projection restores current-month agenda, tasks, Home metadata and recent conversation without parsing all retained history. First upgrade falls back to the legacy archive and creates the projection. Before writes, deferred archive hydration merges older data so a lightweight launch cannot replace it. Live bootstrap waits for the visible Home; backgrounding flushes the saved projection. No fade or server changes.

Local full app tests and the 11 focused launch/cache tests passed. The latter cover retained recent messages, agenda/tasks, legacy migration, saving after lightweight hydration, explicit deletion and account isolation. Fixture size reductions are not device timing results. Manual CI reuses the retained 0.3.60 QA APK only to seed an isolated emulator, then installs the exact 0.3.61 production APK and this candidate in place, offline. It compares cold-start markers and checks Home agenda and a real Chat menu tap with retained synthetic messages. No second APK is compiled; no real user account or physical-device result is fabricated. Compilation and native acceptance remain pending until the current run confirms them.

## Current work: 0.3.61 manual delivery
User requested one production APK sent directly, without publishing on the updater channel. Base: 6c09f5e04fced6d507e0e2d33eee16e52ead031d; version 0.3.61/code66 prepared. This section supersedes the older delivery target below; no new build result is presumed.

Changes: production SofiaLaunchTransition.java coordinates data readiness with Android's splash callback, preventing premature completion for both callback orders. Configuration/retry recreation without a starting window is handled separately. The actual Java class is compiled and executed in a JVM regression test. Home monitoring and adjacent-month warming wait for visual completion; tasks/current month remain in the essential path. No data/cache/authentication deletion.

Manual delivery uses the existing workflow with an explicit [manual-apk] commit marker. Full app tests, isolated backend tests, package/signature/version checks, one production build and production-APK upgrade/login/native-transition smoke run; no separate QA APK and no release publication. The normal official route and physical-device gate remain unchanged. Manual smoke does not test authenticated Home, physical-device speed or the owner's real records. Preserve this distinction in the delivery report.

Delivery diagnosis: prior run 37809157208 spent 274 s in production build, 41 s building QA, and 500 s in the navigation emulator step. About 101 s prepared SDK/emulator and booted; the native Python suite ran approximately 382 s. Both native shards were already parallel. Many checks repeatedly dump Android's complete UI tree. This identifies work/overhead, not a measured gain for the new route. Internal OpenAI cache, chat history and file length have no demonstrated causal attribution. As checked on 08/10, public OpenAI status reported operational, which does not exclude an individual-session issue.

Project entry point: SOFIA_MASTER.md, then only the relevant Sofia Delta route. Do not reread historical masters for every change. The companion consolidated master preserves old sources separately.

## Current deliverable: 0.3.60 candidate, not promoted

Base branch commit: 089c97e2aac31b0db5204e0a9b5d0f927a40ec0e (0.3.59 runtime plus documentation).
Change commit: b1810474986b832fc7015ad6a409a3ce6dd80b7a.
Exact compiled source: 60ee20d7a6333cf235d60cb1ff5acb877817d285 (CI-aligned version metadata).
Run: https://github.com/avsord/SOFIA_OS/actions/runs/37809157208
Successful build job: 113421197079.
Artifact: 11564921396, Sofia-build-37809157208-1.
Production APK: 51,599,876 bytes; SHA-256 18fb2a5f3a4d541fe6bed174a7751890227ee172a10627ee7624bd33807d8652.
Package com.avsord.sofiaapp; versionCode 65; versionName 0.3.60.
Certificate SHA-256 fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c, matching the preceding installed-candidate/published signing identity.

Deliver Sofia-OS.apk as an explicitly unapproved candidate, never QA-ONLY-full-fixture.apk. The extracted production bytes match both the SHA-256 file and sealed bundle. Changed runtime/test files in the compiled source ZIP match the locally tested files byte-for-byte. The manually staged SOFIA_APP tree also matched local git hashing before the atomic delivery-branch update.

## Confirmed causes and focused changes

1. Any DELETE previously discarded all non-chat startup snapshots, even before server success. Acknowledged task/entity removal now reconciles only affected cached rows. Failed deletions preserve the existing snapshot. A second request-generation fence prevents reads begun during deletion from repopulating removed rows. Chat erasure remains explicit and scoped.
2. The 32-entry retention order previously allowed secondary history windows to evict Home/Tasks/Agenda. These essential reads now rank ahead of secondary detail windows. Schema 1, storage keys, encryption, account scope, age policy and size/entry limits are preserved. A deterministic before/after test with 50 history windows reproduced loss of all three essential paths in 0.3.59 and retention of all three after the change. This is a cache regression test, NOT an Android speed benchmark.
3. Home previously held a successfully resolved task list behind Promise.all with a slow Home summary. Independent read callbacks now publish each result immediately. Failed reads are not converted into confirmed empty lists.
4. Layout-based whenInteractive remains permission for essential network progress. New whenRevealed is a separate visual-completion fence: hidden-screen warming, BackgroundServices module mounting and optional notification inventory no longer compete under the S. Existing notification scheduling logic was not removed or rewritten. Selected tabs remain directly mountable.
5. The user explicitly requested a short fade. The original Android 12+ splash now fades opacity over the real app for a configured 120 ms, with no minimum splash dwell or second logo. Legacy Android fades the actual content over its existing window drawable. Cancellation, disabled Android animations and explicit error recovery are handled. LOCAL_READY and FADE_START diagnostics distinguish readiness from the final DATA marker, which includes the fade.

## Completed validation and remaining acceptance

CI with locked dependencies passed TypeScript, 352/352 app tests, 165/165 isolated backend tests, 17/17 delivery tests, production Gradle compilation, package/version/certificate checks, separate QA fixture compilation and sealed artifact retention.

The 13 new tests cover independent slow/failed reads, snapshot retention, scoped deletion, late reads, bridge visibility/cancellation and static native-fade contracts. They include pure logic/mocks/source assertions, not handset visual proof. Final local focused checks passed 35/35; broader startup checks 106/106; native-delivery contract unit tests 10/10. The local full suite's absent React Native dependency check was not suppressed; CI installed the locked runtime and passed the complete suite.

Read-only follow-up on 2026-10-08: native navigation job 113424502110 and workspace job 113424502179 completed successfully. Release job 113428338504 failed at publish-release.cjs because the required physical-device acceptance report was absent. Run 37809157208 finished with failure at 16:45:54 UTC; 0.3.60 was not promoted. The authenticated emulator suite uses the separate synthetic-transport fixture; these passes are not production-handset startup evidence. Reuse the retained APK rather than rebuilding identical code to obtain a report that requires actual device validation.

No physical device was available. Full icon-to-verified-interaction timing, 20 cold starts, 100 native sequences with representative real records, white-frame continuity through the fade and real-account in-place upgrade remain unproved for 0.3.60. No whole-app speed factor or <=1000 ms phone guarantee is claimed. Cache projections already missing in an older installation must be reconstructed from the legitimate origin, never fabricated.

## Earlier relevant state

Published baseline at inspection: 0.3.57, code 62, run 37789662903. Its two synthetic DATA samples 1583/1255 ms failed the requested 1000 ms goal despite smoke success.

0.3.58: source 724c70139cca79e59ca5dabfa041009d6a92e895; code 63; run 37797262718; APK e334175fafa00437d16721773274a2be2624f27993c71c581416740bd73d6ff8. Removed competing native menu writes and retained the original system splash. Its subsequent native passes are not evidence for a different APK.

0.3.59: source 164e973858852f20a96f477cf983987c192a94a8; code 64; run 37804038235; APK c946d2fc1fe219805eaf664c0d794b83c9e15e3d1cfc7fe50e23e2743d6c587e. Added early one-use session/preferences reads, bounded snapshot serialization and deferred speech/update discovery. 339 app tests passed. No physical acceptance was supplied. Historical detailed reports remain in repository history.

## Safety and publication boundary

No backend, database, main branch, credential, encryption implementation, package or updater-channel mutation was made by this change. Install candidates in place; do not uninstall or clear data. Matching signing identity is necessary but does not by itself prove preservation of the owner's displayed records.

startup-release-gate.cjs remains unchanged and requires SOFIA_APP/dist/startup-navigation-acceptance.json for the exact source/APK. Never synthesize it from unit-test fixtures, ready markers or QA transport. Missing physical acceptance intentionally blocks approved publication. This is an installable candidate, not an approved release.

## Sofia Delta follow-up — 2026-10-08
Use [Sofia Delta](sofia-delta.md) for subsequent changes. This review changes instructions only; no runtime optimization or new APK is claimed.

Measured delivery: build job 435 s; native navigation 515 s and workspace 442 s in parallel; release job 39 s; total run 1001 s including inter-job overhead. Gradle reused 124 production tasks and 343 QA tasks were up-to-date. No cache corruption was demonstrated, so no cache was purged. OpenAI internal caches are outside this repository's control.

Source inspection confirmed the configured 120 ms fade and the 0.3.60 cache/initialization changes. It also found a possible fade-skip ordering: on Android 12+, if reveal's posted callback runs before exitSystemSplash is assigned, completeReveal marks the app visible; a later system-splash callback then removes the splash immediately. This is a static code-path finding, not reproduction on the user's phone; inspect LOCAL_READY, FADE_START and DATA timing plus video before asserting the cause. Disabled animations and warm starts are separate intended cases.

The fade-specific unit test checks source strings and bridge mocks, not this native callback ordering or a visible transition. Home's native ready marker still requires tasksReady and calendar.loadedAt; missing local records can therefore leave network completion in the launch path. The exact contribution to the user's delay remains unmeasured. Do not report a source edit or passed mock as a demonstrated visual fix.

The [official OpenAI status page](https://status.openai.com/) reported operational when checked. The [Codex/Work degradation on October 7](https://status.openai.com/incidents/01M4BP5JE7DKJSP3VG2S2DCWF2) was marked resolved. There is no established causal link between that incident and this APK's missing fade or GitHub build/test duration.

