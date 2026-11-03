# Sofia OS Android 0.3.161 — Finanças: ciclo, contas fixas, meta e configuração

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 166. Atualização por cima, sem desinstalar nem limpar dados. O servidor (Railway) também é atualizado (campos novos e resumo financeiro para a conversa).

Inclui tudo da 0.3.160 (histórico da reserva, evolução do guardado, filtros por categoria) mais:

- Ciclo do dinheiro: no cadastro da conta você informa o dia em que recebe (ex.: 25). O ciclo passa a ir de um recebimento ao outro e se adapta a meses curtos. Em branco, tudo segue o mês do calendário.
- Cartão "Saldo" no Resumo: quanto ainda dá para gastar no ciclo, depois das contas fixas e do aporte, com barra que esvazia (verde, amarelo, vermelho), valor e porcentagem. Passando do teto, mostra o quanto furou em vez de parar no zero.
- Contas fixas: seção em Pendentes com as pendências marcadas como "Todo mês" — valor, dia, pagas e a pagar —, total do ciclo e quanto representam do que entrou, comparado à média dos ciclos anteriores.
- Meta do guardado: "Quero juntar" e "Até". A faixa mostra o progresso; em "Sua reserva" aparecem as duas projeções — onde o aporte atual chega na data e quanto por mês fecharia no prazo — sem mudar nada por conta própria.
- Sofia e finanças na conversa: ela responde com os mesmos números da tela (guardado, aporte do mês, meta com as projeções, quanto seria de uma vez, contas fixas e a sobra) e registra aporte ou retirada da reserva pelo chat, inclusive a diferença entre recompor e planejada. Registrar despesa e receita por conversa já funcionava.
- Primeira configuração em 7 passos: conta, dia do recebimento, contas fixas, dinheiro guardado, aporte, meta e um resumo final com o Saldo do ciclo já calculado. Tudo opcional menos a conta, e dá para pular. Quem já usa o app encontra "Refazer a configuração" em Contas e cartões, preenchido com o que já existe e sem apagar nada.
