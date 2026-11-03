# Sofia OS Android 0.3.20

Correção imediata para criação de páginas no app.

- Remove `template_id` do payload enviado ao backend ao criar página em branco ou por template.
- Mantém apenas campos aceitos pelo contrato atual de `user_page`, incluindo `blocks_json`.
- Adiciona regressão para impedir que `template_id` volte ao payload.
- Mantém package `com.avsord.sofiaapp` e atualização in-place; não exige desinstalar o app.
- Esta release não faz deploy do backend Railway.

Instale por cima da versão atual para preservar os dados locais do aplicativo.
