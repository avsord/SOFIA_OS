# Sofia OS 0.3.111 — candidato manual, execução direta

A lista principal de Páginas, a lista de registros dos Apps e a lista de Tarefas
usam janelas FlatList: itens afastados da tela não são montados por temporizadores.
A geometria de arrasto é lida somente nas células montadas e apenas quando começa
um arrasto. Árvores compactas dentro do documento ainda usam o caminho embutido.

O teste de swipe identifica o cabeçalho real da Home e rejeita alvos dentro do
minicalendário. Teste Android reforçado para 20 ciclos de rascunho por modo;
mantém todos os critérios anteriores e registra exceções mesmo ao reprovar.

0.3.111 / código 116 / com.avsord.sofiaapp / assinatura preservada / ARM64.
Sem mudança do splash, login, banco, história, backend ou publicação OTA.
Não declarar desempenho aprovado antes do teste pesado e do aceite do telefone.
