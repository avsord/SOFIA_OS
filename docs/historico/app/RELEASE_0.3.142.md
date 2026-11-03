# Sofia OS Android 0.3.142

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 147. Atualização por cima, sem desinstalar nem limpar dados. O backend não é reiniciado por este fluxo.

- Novo app Encomendas (em Apps), inspirado no Muambator: cole o código de rastreio, dê um nome e a Sofia acompanha. A transportadora é detectada pelo formato do código. Correios são consultados automaticamente pelo servidor a cada 2 horas e sempre que você toca em "Atualizar agora"; a linha do tempo fica guardada e o sino/celular avisa a cada mudança de status (e quando entrega). Outras transportadoras: a Sofia guarda o código e abre o rastreio oficial com um toque.
- Se a consulta aos Correios falhar, o registro mostra o motivo e mantém o último status conhecido; nunca inventa status.
