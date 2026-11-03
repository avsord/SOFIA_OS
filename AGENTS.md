# Sofia OS — entrega de alterações

## Primeiro passo de qualquer agente
Leia [docs/SOFIA_MASTER.md](docs/SOFIA_MASTER.md) (é curto). É o ponto único de continuidade. O histórico das rodadas fica em docs/historico/DIARIO_DE_RODADAS.md e só é consultado com grep, nunca lido inteiro; as notas antigas de versão ficam em docs/historico/app/. Os demais documentos de continuidade são históricos. Se o MASTER divergir do código, dos logs ou do pedido atual do dono, verifique a evidência e atualize o MASTER; não use o documento para ignorar essa divergência. O estado vivo (HEAD, versão, release publicada) se lê pelos comandos da seção 3 dele, nunca de número escrito.

## Leitura econômica (gasto de tokens do agente)
- Leia só o necessário para o pedido: o MASTER (curto) e os arquivos do delta. Não leia o histórico inteiro (docs/historico/), use grep.
- Vários arquivos têm linhas de milhares de caracteres (ex.: Home.tsx). Nunca imprima o arquivo inteiro nem linhas inteiras: use `grep -n -o '.{0,120}trecho.{0,120}'` ou `cut -c1-300`.
- Saídas de teste e de build: mostre só o resumo (pass/fail e as falhas).
- Prints e imagens custam caro: tire só os necessários para conferir a mudança, recortados na área que mudou.

## Pedido de alteração gera candidato, publicação só com aprovação
Quando o dono pede para corrigir ou alterar a Sofia, implemente, valide e entregue um APK candidato `[manual-apk]` no mesmo trabalho, sem esperar outro pedido de "gerar APK". Publicar no atualizador (`[approved-apk]`) exige o "aprovado" explícito do dono para aquele candidato. Uma conversa sobre ideias, por si só, não autoriza implementação.

## Manter o MASTER vivo (obrigatório em toda rodada)
No mesmo PR de qualquer rodada que mude comportamento, decisão ou pendência:
- acrescente UMA linha curta (até ~300 caracteres) na seção 10 do `docs/SOFIA_MASTER.md` (que guarda só as 5 últimas; apague a mais antiga) e a mesma linha no fim de `docs/historico/DIARIO_DE_RODADAS.md`: data, versão, o quê, resultado real;
- atualize a seção 9 (Pendências): remova o que foi concluído, acrescente o que surgiu;
- registre na seção 7 qualquer decisão nova do dono.
Não grave no MASTER valores que o repositório já informa ao vivo. Não crie outro documento de continuidade.

## Padrão de trabalho: Sofia Delta
Se o usuário pedir entrega manual, use o caminho `[manual-apk]`: um único APK de produção, testes prévios identificados e envio direto, sem publicação no atualizador. Não apresente o smoke de login do emulador como teste da Home autenticada ou do aparelho físico. Os critérios de publicação oficial permanecem obrigatórios para a publicação oficial.

Use o padrão [Sofia Delta](docs/sofia-delta.md) em cada alteração: selecionar o caminho de menor tempo total entre os que cumprem o pedido e os critérios de aceite.
- Retome o `docs/SOFIA_MASTER.md`, o head e a execução relevante; leia apenas o código e os logs necessários ao delta. Reuse leituras atuais da mesma sessão.
- Classifique o pedido antes de compilar: documentação, processo/testes, runtime Android, backend/web ou retomada de artefato existente. Não gere APK para registrar instruções.
- Faça a menor mudança completa, com validação proporcional antes do build. Não acrescente refatorações ou novas dependências sem causa demonstrada.
- Reuse o APK exato e os resultados válidos quando nenhuma entrada do build mudou. Se um teste ou critério mudou, revalide-o; nunca atribua aprovação antiga à nova condição.
- Preserve caches saudáveis. Limpeza deve ser específica, motivada por evidência e comparada antes/depois; não apague dados do app, sessão ou histórico. Cache interno da OpenAI não é controlável por este repositório.
- Registre tempo de investigação/edição e tempo de CI separadamente. Percentual de melhoria exige medições comparáveis; 70% é uma meta, não garantia.
- Não encerre com promessa de acompanhamento em segundo plano. Diferencie instrução registrada, código alterado, candidato compilado e APK publicado.

## Fonte correta e entrega atômica
- Antes de editar, leia a branch atual e a maior versão Android publicada. Não republique uma base antiga com número novo. Preserve funcionalidades e dados existentes.
- Faça o conjunto de alterações em uma branch de trabalho baseada na versão atual. Promova o conjunto completo para `sofia-app-android` em um único commit ou avanço fast-forward protegido pelo SHA observado. Nunca faça uma publicação parcial por arquivo.
- Se o usuário acrescentar pedidos durante o trabalho, incorpore-os ao conjunto ainda não promovido; não reinicie repetidamente uma compilação por mudanças parciais.
- `sofia-app-android` é a branch de entrega automática Android. Não atualize `main`, Railway, banco de dados ou serviços externos apenas para entregar um APK.

## Publicação automática
O workflow `.github/workflows/sofia-native-047-update.yml` tem nome de arquivo histórico, mas não deve ser duplicado a cada versão. `SOFIA_APP/tools/delivery.cjs` escolhe a próxima versão, sincroniza identidade/lock/updater/testes de identidade e impede colisões ou downgrade. O commit `[manual-apk]` dispara o candidato sem confirmação adicional; a publicação depende do `[approved-apk]` após aprovação do dono.

O job build pode cancelar uma compilação obsoleta da mesma branch; a publicação usa grupo separado não cancelável. O fluxo usa cache Gradle. Atenção: delivery.cjs compara o HEAD com a última release publicada, não apenas com o último commit; alterações só de documentação/testes em SOFIA_APP/** ainda podem disparar uma compilação por mudanças antigas não publicadas. Para uma instalação exclusivamente documental já validada fora do fluxo Android, use [skip ci] no commit promovido, sem [manual-apk] ou [approved-apk]. Nunca use essa exceção em alterações do app ou para ocultar falha de teste. Os testes de comportamento, instalação por cima, assinatura, servidor compatível e descoberta da atualização continuam obrigatórios. Não retire testes nem masque falhas para publicar rápido.

Se houver erro, investigue a etapa e o log, corrija no trabalho atual e reexecute somente o necessário. Use os relatórios de etapas; não faça consultas em loop a cada poucos segundos. Não afirme estar corrigindo ou acompanhando em segundo plano depois de encerrar a conversa.

## Critério de concluído
“Publicado” exige release real, `Sofia-OS.apk` disponível, hash/assinatura verificados e descoberta pelo atualizador confirmada. Entregue o link do APK, versão, resumo do que entrou e status verdadeiro. Commit, branch, build iniciado e APK de teste NÃO equivalem a entrega publicada. Se a execução ainda estiver pendente ou falhar, declare isso e a etapa exata; não invente previsão ou sucesso.

As atualizações preservam `com.avsord.sofiaapp`, canal `sofia-android-v`, assinatura e versionCode crescente. Nunca desinstale, limpe armazenamento, apague histórico/páginas, afrouxe autenticação ou redeploye backend com armazenamento temporário para resolver publicação. Mudanças de backend só quando fazem parte da solicitação e com verificação prévia de persistência/backup.
