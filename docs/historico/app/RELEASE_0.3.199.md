# Sofia OS Android 0.3.199

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 204. Atualização por cima, sem desinstalar nem limpar dados. O servidor (Railway) também é atualizado (nova biblioteca pura em JavaScript: jpeg-js 0.4.4).

- Foto do cupom/comprovante no chat: a Sofia agora LÊ a foto (antes recebia só o link) e registra o gasto. Logo depois, o original sobe para o Google Drive, em Sofia OS/Comprovantes, e sai do servidor (só depois de o Drive confirmar). No chat fica uma miniatura desfocada de menos de 1 KB com "🧾 Toque para ver"; tocar busca a foto no Drive e mostra nítida, com "Salvar no celular" e "Fechar". Depois de salvar, a cópia temporária sai do celular.
- Frase completa: "anteontem" e dia da semana ("sexta") viram a data que já passou; "no cartão Nubank" vai para o cartão; "em 3x" vira 3 lançamentos, um por mês (centavos que sobram na 1ª parcela; fim de mês respeita fevereiro); "recebi 800 do freela" vira receita.
- Resumo da semana: em Relatórios, "Semana passada" mostra o total e as categorias da última semana completa, comparadas com a média das 8 semanas anteriores. Toda segunda às 9h chega um aviso para ver o resumo.
- Gasto fora do padrão: quando uma categoria passa pelo menos 30% (e R$ 50) do que você costuma gastar no mês, o Resumo mostra o aviso ("Alimentação: R$ 680 em outubro, 127% acima do que você costuma gastar") e chega uma notificação, uma vez por categoria por mês.
