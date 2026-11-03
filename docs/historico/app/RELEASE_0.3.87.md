# Sofia OS Android 0.3.87 — abertura conforme o anexo

Entrega manual de produção, sem publicar no atualizador. Package `com.avsord.sofiaapp`, versionCode92, assinatura existente e instalação por cima preservados.

Fundo roxo #7258E8, S branco32dp e círculo discreto67.2dp. Escala orgânica finita0.88→1 em800ms, sem rotação, pulso repetido ou overshoot. A transferência nativa usa o tempo original informado pelo Android e os bounds reais expandidos1.5×; não reinicia uma segunda animação nem encolhe o S. S e fundo saem juntos em uma única superfície com fade95ms, sem espera adicional pelo fim da escala.

Integra a camada ViewOverlay da0.3.86 concorrente, sem relayout da Home. Mantém o caminho nativo validado na0.3.83 e os gates de desempenho existentes. Sem alterações na sessão, histórico, dados, navegação ou backend. Testes locais de curva nativa, suites e TypeScript; build, assinatura, smoke e gravação ainda pendentes neste registro. Não representa teste no aparelho físico.
