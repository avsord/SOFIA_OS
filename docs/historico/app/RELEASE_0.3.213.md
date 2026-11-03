# Sofia OS Android 0.3.213

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 218. Atualização por cima, sem desinstalar nem limpar dados. O servidor (Railway) também é atualizado.

Finanças reestruturadas (junto com a 0.3.212)
- Cinco abas, cada uma com uma função: Resumo (Saldo, Previsto, Controle de gastos, avisos — só leitura), Contas (a pagar e a receber do mês, com as fixas), Lançamentos (tudo o que entrou e saiu, com busca e filtros), Cartões e Relatórios.
- Lançamentos → Extrato do banco: o extrato importado NÃO vira lançamento. Ele fica guardado à parte e confere o app com o banco linha a linha — "bate com …", "falta no app" (botão Lançar) ou "antes do ponto de partida". Com o saldo do banco no fim do extrato, "Acertar Saldo" ajusta o ponto de partida do app sem apagar nada.
- Um só "+", com seis entradas: despesa, receita, transferência, aporte, conta a pagar, conta a receber.
- Cada dinheiro existe num lugar só: conta a pagar é um lançamento ainda não pago; conta fixa é um lançamento que se repete; aporte é um lançamento para a reserva. O Saldo é uma conta só (ponto de partida + tudo o que foi pago ou recebido); Previsto e Controle derivam dele.
