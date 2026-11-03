# Sofia OS Android 0.3.150 — Finanças reorganizadas

APK candidato manual: sem publicação automática no atualizador antes da aprovação do dono.

- O gesto de voltar e o botão Android voltam à seção anterior do Finanças antes de sair para Apps.
- Seletor no topo alterna entre a conta principal e contas secundárias (ex.: família, empresa), isolando saldo, cartões relacionados, receitas, despesas e relatórios. O resumo de contas deixa de ocupar um cartão na home.
- Reserva guardada em faixa laranja ligeiramente sobreposta pelo saldo roxo, com valor visível e gerenciamento ao tocar. Só na conta principal. Não transfere valores reais nem duplica saldo.
- A aba Planejamento e a aba Lançamentos saem da navegação; o extrato com entradas e saídas aparece no Resumo, com busca, filtros e importação mantidos.
- Aba Pendentes com cadastro manual de boletos/dívidas, data de vencimento, recorrência mensal, edição, exclusão, marcação como pago e lembrete local às 9h no Android (permissão de notificações). Extratos não criam boletos automaticamente. O lançamento passa ao extrato ao confirmar pagamento.
- Relatórios ganham análise baseada em dados reais registrados e por conta, com ressalva de incompletude.
- Botão Excluir cartão: consulta histórico completo; sem vínculo permite exclusão definitiva confirmada; com vínculo, arquiva preservando lançamentos anteriores, com restauração possível.
- Formatação brasileira em campos monetários, sem trocar ponto de milhar por vírgula ao apagar um dígito.
- Mantidos orçamentos e planejamento existentes no banco, mas ocultos da navegação principal. Nenhuma migração destrutiva nem redeploy na Railway.

Identidade preservada: com.avsord.sofiaapp; 0.3.150 / versionCode 155. Candidato para instalar por cima, sem limpar dados ou sessão.
