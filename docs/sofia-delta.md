# Sofia Delta
Padrão de alteração da Sofia OS — 8 de outubro de 2026.

Escolher, para cada pedido, o caminho de menor tempo total até uma entrega válida. Rapidez inclui evitar retrabalho; não significa omitir testes, preservar um erro ou anunciar resultado sem evidência.

## Decisão por tipo de alteração
| Tipo | Menor caminho válido | Quando gerar APK |
| --- | --- | --- |
| Instruções ou documentação | Editar os arquivos do repositório e conferir o diff. | Nunca por esse motivo. |
| Testes ou processo de entrega | Validar a regra afetada; reutilizar artefatos compatíveis e reexecutar as verificações afetadas. | Somente se mudar uma entrada que afeta o APK ou faltar um artefato válido. |
| Interface, comportamento ou código nativo Android | Corrigir o trecho responsável, rodar verificações focadas, consolidar o pedido e compilar uma vez. | Um candidato de produção por conjunto completo; manter os critérios de publicação. |
| Backend ou web | Alterar e validar apenas o serviço solicitado, com persistência e compatibilidade verificadas. | Apenas se o cliente Android também precisar mudar. |
| Build concluído, teste ou publicação pendente | Consultar a mesma execução e o motivo do bloqueio; retomar a etapa necessária com o mesmo APK, quando aceito pelo fluxo existente. | Não recompilar código idêntico para consultar status ou tentar resolver uma evidência ausente. |
| Falha atribuída a cache | Identificar o cache e o erro; invalidar só a entrada comprovadamente ruim e medir novamente. | Conforme a entrada afetada, nunca como limpeza preventiva. |

Estas são regras operacionais para o agente. Este documento não implementa um novo agendador de CI, atualizações remotas de JavaScript ou seleção automática de suítes. Os testes e gates existentes continuam obrigatórios.

## Execução curta
1. Retomar o handoff, head, versão publicada e artefatos relevantes. Reusar conteúdo já lido quando o SHA não mudou. Não carregar de novo todo o repositório ou todo o histórico da conversa.
2. Registrar em poucas linhas: pedido, causa confirmada ou hipótese, arquivos afetados, rota escolhida e motivo. Considerar o caminho alternativo apenas quando houver uma opção real; não inventar estimativas.
3. Editar apenas o necessário. Consolidar pedidos novos antes de promover a branch. Evitar dependências, refatorações e builds sem relação com a causa.
4. Validar os riscos introduzidos. Rodar primeiro as verificações rápidas necessárias; cumprir os gates de instalação, assinatura, dados e comportamento na publicação. Para fade, validar execução visual no ambiente exigido: procurar texto no código não prova animação.
5. Compilar uma vez quando necessário, reter o APK e reexecutar só etapas compatíveis que falharam. Reuso exige identidade do artefato, entradas de build compatíveis e validade dos testes; mudança de teste exige nova validação.
6. Promover o conjunto atomicamente, com SHA esperado. Registrar resultado, tempos e bloqueio real no handoff existente. Comunicar uma descoberta decisiva e o resultado, sem consultas em loop ou promessas de trabalho após encerrar.

## Caches e leitura da IA
- **Gradle/npm:** preservar se restauram corretamente e há reaproveitamento. Em falha de integridade ou incompatibilidade comprovada, limitar a invalidação à entrada afetada. Comparar no mesmo código e ambiente; uma segunda execução naturalmente aquecida não prova ganho da limpeza.
- **Cache local da Sofia:** contém projeções criptografadas por conta. Apagá-lo pode obrigar novo carregamento pela rede e prolongar a tela S. Não limpar armazenamento, login, mensagens ou páginas para acelerar desenvolvimento.
- **Contexto/cache da OpenAI:** não há neste projeto controle para limpar caches internos do serviço. Não afirmar que foram limpos. Reduzir leituras repetidas usando o handoff curto e buscas direcionadas; isso não garante redução na latência do modelo.
- **Arquivos grandes:** medir trabalho executado, importações, leitura local e espera de rede. Quantidade de linhas ou tamanho de arquivo, isoladamente, não comprova a causa. Dividir arquivos somente quando ajudar a mudança concreta.
- Não executar limpeza global, reinstalação de dependências ou build limpo sem diagnóstico. Um build limpo deliberado para reproduzir um defeito deve ser identificado como teste, não otimização já demonstrada.

## Medição
Separar: pedido → diagnóstico/edição; fila; preparação/compilação; testes; publicação/disponibilidade. Não apresentar tempo de CI como tempo total do pedido.

Para abertura: medir do lançamento nativo à interface utilizável, registrando aparelho, Android, APK, cache, conta e rede. Separar partida fria de retorno com processo vivo e dados locais de primeira carga.

Ganho = (tempo anterior − tempo novo) / tempo anterior. A meta de 70% sobre os 30–40 minutos relatados equivale a 9–12 minutos para alterações comparáveis. Ainda não há comprovação desse ganho. Não prometer um tempo único para todos os tipos de alteração.

## Evidência usada nesta decisão
Execução [37809157208](https://github.com/avsord/SOFIA_OS/actions/runs/37809157208), fonte compilada `60ee20d7a6333cf235d60cb1ff5acb877817d285`:
- Execução completa até o bloqueio: 16 min 41 s; investigação e edição anteriores não estão nesse intervalo.
- Preparação/build: 7 min 15 s. Etapa do APK de produção: 4 min 34 s; build separado de QA: 41 s.
- Testes nativos em paralelo: navegação 8 min 35 s; workspace 7 min 22 s. Esses tempos não devem ser somados.
- Cache npm restaurado; Gradle restaurado. Produção: 357 tarefas, 233 executadas e 124 do cache. QA: 357 tarefas, 14 executadas e 343 já atualizadas.
- Não foi demonstrada corrupção de cache. A restauração Gradle ocupou aproximadamente 17 s e o pós-processamento 42 s; apagá-lo não tem benefício comprovado.
- Build e duas suítes nativas passaram. Publicação bloqueada por ausência do relatório físico exigido; reexecutar o mesmo build não fornece essa evidência.
- Nenhum cache foi apagado por esta revisão. Nenhuma mudança de runtime, backend ou dados é feita ao registrar este padrão.

O estado do candidato, hashes e aceites pendentes permanecem em [startup-navigation-handoff.md](startup-navigation-handoff.md).
