# Sofia OS Android 0.3.243

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 244. Atualização por cima, sem desinstalar nem limpar dados.

- Início, Meta ("Dinheiro guardado"): continuava sumida e aparecendo depois. A Meta é calculada alguns segundos após abrir, mas só era gravada no pacote de abertura até 30 s depois (ou ao sair do app); se o Android congelasse/fechasse o app antes disso, ela nunca era gravada e a abertura seguinte começava sem ela. Agora é gravada no pacote de abertura no instante em que é calculada (gravação pequena, com o app aberto), então a próxima abertura já começa com ela.
- A leitura local de Finanças não pode mais esconder a Meta: só a resposta do servidor pode dizer que não há meta.
