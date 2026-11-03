# Sofia OS — instruções para o Claude Code

@AGENTS.md

## Antes de tudo
1. Leia a seção **0. Passagem** do `docs/SOFIA_MASTER.md`: ela diz onde a última sessão parou (aqui ou no chat do claude.ai) e o próximo passo.
2. Leia o resto do MASTER só no que o pedido precisar (seções 7 e 8 sempre valem).
3. Confira o estado vivo com `git log --oneline -5 origin/sofia-app-android` antes de afirmar versão ou o que já subiu.

## Como o Pedro trabalha (resumo; o detalhe está no MASTER §1)
- Português, direto. Ele não é desenvolvedor: explique o que mudou na tela, não no código.
- Não pergunte o que você mesmo consegue verificar. Pergunte só quando a resposta mudar o trabalho.
- "Só me manda quando estiver tudo pronto": faça a rodada inteira (código, testes, site recompilado, MASTER) antes de dizer que terminou. Nada pela metade.
- Desenho primeiro: mudança visual grande vai para aprovação antes do código (no chat ele usa um quadro com as telas).
- App e site sempre juntos, mesma versão.

## O que muda em relação ao chat
- Aqui você tem o repositório local e o Git: rode os testes, recompile o site e faça commit/push você mesmo. Não gere `.bat` nem patch em base64 (isso era um contorno do chat, que não acessa o computador dele).
- Antes de cada push: `cd SOFIA_APP && npx tsc --noEmit -p . && npm test`, depois `npm run build:web` (o site é o app compilado em `public/web`; sem isso o site não muda) e `public/web` no mesmo commit.
- Commit de entrega com `[manual-apk]` (gera o APK candidato). Publicação no atualizador só com o "aprovado" dele.
- Depois do push, acompanhe a compilação no GitHub Actions (`gh run list`, `gh run view --log-failed`). Se falhar, leia o log e corrija; não declare pronto com compilação vermelha.

## Fim de sessão (obrigatório) — passagem para o chat
Sempre que terminar uma rodada, e **imediatamente** se o Pedro disser que os créditos estão acabando ou que vai voltar para o chat:
1. Atualize a seção **0. Passagem** do `docs/SOFIA_MASTER.md` (substitua o conteúdo, não acumule): data e hora, onde foi feito (Claude Code), o que ficou pronto, o que está pela metade (arquivo e o que falta), último commit/compilação e resultado, próximo passo exato.
2. Atualize §9 (pendências) e §10 (diário), como manda o AGENTS.md.
3. Faça commit e push disso, mesmo que o código esteja pela metade (nesse caso sem `[manual-apk]`, com a mensagem começando por `wip:` e numa branch `wip/<assunto>` se quebrar os testes).
