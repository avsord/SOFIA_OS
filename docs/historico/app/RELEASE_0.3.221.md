# Sofia OS Android 0.3.221

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 226. Atualização por cima, sem desinstalar nem limpar dados. O servidor (Railway) também é atualizado.

- Finanças, Saldo: o servidor contava duas vezes lançamentos antigos que também iam para o app (fixas, salário, fatura), e o Saldo mudava conforme o mês ou a aba aberta. Agora dá o mesmo valor em qualquer tela. "Ajustar saldo" e "Refazer a configuração" não gravam mais o acumulado dos meses anteriores dentro do saldo inicial.
- Extrato do saldo: mostra transferências, separa os lançamentos de meses anteriores, avisa se a soma não bater e ganhou "Mudanças no saldo" (data, hora e o que mudou: entrou, saiu do app, deixou de estar pago, valor mudou, ajuste).
- Cartões: pagar a fatura paga junto todas as contas marcadas com aquele cartão. A fatura em aberto é a do mês do calendário; a do mês seguinte só abre no dia 1º.
- Toque que não se perde nos botões de escolha de Finanças (cartão, conta, abas).
- Voltar de Finanças para Apps é imediato, sem tela cinza; se algo ainda carregar, aparece o esqueleto com brilho.
- Apps: ao soltar um app arrastado, ele fica no lugar e o contorno sai na hora.
