# Sofia OS Android 0.3.137 — candidato de integração ML

- Consulta autenticada à Sofia: `/api/mobile/price-tracker/mercadolivre/read`.
- Leitura de HTML como texto no backend; sem fallback automático à WebView do ML.
- Oferta e vendedor preservados sem reescrever URLs do histórico existente.
- Prévia de cadastro mostra o vendedor e o preço sem frete; cancelar/pausar descarta leitura tardia.
- App exige o backend desta rodada; servidor antigo retorna erro explícito, sem abrir a loja.
- Agenda: novo compromisso com prioridade não dá mais "Campo não previsto: priority_level" — a prioridade agora é um campo oficial do compromisso e sobrevive ao envio ao Google.
- Price Tracker: preço que nunca mudou não aparece mais como "menor" (verde) e "maior" (vermelho) ao mesmo tempo; vira um card "Preço no período — sem variação", veredito "Preço estável" e nada de selo/aviso "menor preço já visto".
- Início: o widget do Price Tracker aparece já na abertura com a última leitura salva; sem nada salvo, mostra esqueleto com reflexo (não mais o convite "Acompanhe o preço…" que depois trocava sozinho).
- Google Drive: pastas "Sofia OS" repetidas se juntam sozinhas também para quem já estava conectado (antes só ao reconectar); conteúdo é movido para a mais antiga, as sobras vão para a lixeira.
- Google Agenda: corrigido "Cannot specify both default reminders and overrides at the same time" ao reenviar compromisso que tinha lembrete próprio; se o Google ainda recusar lembretes, o evento é enviado sem mexer neles (não trava mais a sincronização).
- Testes: a limpeza das pastas temporárias não derruba mais a suíte no Windows (EPERM com o SQLite ainda aberto); só os testes mudaram, nenhum código do app/servidor.

Package `com.avsord.sofiaapp`; versionCode 142. Assinatura e instalação por cima preservadas no pipeline existente.
O pacote foi preparado localmente. Sem publicação, APK compilado ou aprovação no aparelho.
Testes simulados/HTML salvo não comprovam a coleta ao vivo na Railway.
