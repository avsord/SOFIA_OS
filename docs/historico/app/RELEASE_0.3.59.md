# Sofia OS Android 0.3.59

Candidato de otimização. Este documento não comprova publicação nem aprovação no aparelho físico.

## Alterações

- Inicia uma única leitura nativa de sessão e preferências antes da avaliação dos módulos da interface. Mantém as mesmas chaves, validações, criptografia e invalidação no logout ou alteração da conta.
- Evita serialização repetida de registros inalterados e monta o payload do cache em uma passagem. Preserva integralmente o esquema 1, a ordem de prioridade, os limites, as exclusões explícitas e as referências mutáveis expostas às telas.
- Agenda apenas a primeira consulta automática de atualização para uma oportunidade ociosa, sem alterar o agendamento de notificações.
- Carrega o módulo de fala quando utilizado, em vez de carregá-lo na importação da aplicação.

## Identidade e validação

Package com.avsord.sofiaapp; versionCode 64. Não desinstale nem limpe os dados. O pipeline deve verificar novamente a assinatura e a atualização por cima antes de entregar o APK.

Implementação: 8d1adcc8baae65424c44ee569944b18bb510d18d. Preparação dos metadados de versão: 4944996300961b16262f7c69d344cfa42a5b91c.

A primeira tentativa da execução 37803188983 passou em TypeScript, 339 testes do aplicativo, 165 testes isolados do backend e 17 testes de entrega. A compilação Android ainda não ocorreu nessa tentativa: a consulta de saúde do backend retornou HTTP 502. Nenhum banco, credencial ou serviço de produção foi alterado por esta otimização.

Esta alteração de notas permite retomar a compilação a partir dos metadados já preparados, sem incrementar a versão novamente e sem mudar o código de execução. O relatório SOURCE_COMMIT.txt do artefato identifica o commit exato realmente compilado.

Medições sintéticas de serialização não são tempos de abertura Android. A meta de um segundo, a continuidade visual, o primeiro toque e a preservação dos dados no aparelho do usuário ainda exigem validação da versão compilada. A barreira de publicação que exige evidência do APK exato permanece ativa.
