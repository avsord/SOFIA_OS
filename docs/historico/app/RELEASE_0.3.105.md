# Sofia OS 0.3.105 — Rodada 3 (candidato manual)

**Estado:** código candidato para validação, sem aprovação ou publicação no atualizador.

- R8 e shrinking de recursos ativados por `expo-build-properties` compatível com Expo 57; manter regras ProGuard específicas apenas se a execução de teste provar necessidade.
- APK de usuário ARM64 (`arm64-v8a`) com código 110. A compilação x86_64 permanece disponível somente para os testes do CI; o APK para instalação não leva x86_64.
- O splash do sistema usa S estático a 70% e o overlay nativo começa sua curva também a 70%, eliminando a incompatibilidade de tamanho na transferência. Isso **não** antecipa o início do movimento à primeira imagem do splash; a curva nativa começa quando o sistema entrega a tela ao app.
- Preservar `com.avsord.sofiaapp`, assinatura, fade nativo de 95ms, dados locais, sessões, histórico, Agenda, abas e backend Railway.
- O smoke de emulador roda uma cópia QA com x86_64; comparação de DEX, JS e bibliotecas ARM64 com o APK principal é exigida. **Não equivale a testar o APK ARM64 em dispositivo físico.**
- Não liberar a versão oficialmente sem validar assinatura, instalação por cima, acessibilidade, notificação, carregamento, atualização e dados no aparelho real.

Fonte e evidências: PR da Rodada 3 e respectiva execução do GitHub Actions.
