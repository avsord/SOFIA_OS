# Sofia OS Android 0.3.146

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 151. Atualização por cima, sem desinstalar nem limpar dados. O servidor (Railway) também é atualizado: notificações, e-mails, datas e Finanças dependem dele.

E-mails
- Conta Google: salvar a conta não dá mais "mudou em outra aba" quando só a verificação automática mudou a conta; conflito real de outro aparelho continua avisando sem perder o que foi digitado. "Salvar e testar" mostra o resultado real do teste. O cartão de conta pela Conta Google não diz mais "falta a senha de app".
- Grupos de contas criados por você (Profissional, Minha loja...). O título vira seletor: todas as contas, um grupo ou uma conta; a lista e os contadores seguem a seleção. Renomear e excluir grupo não mexe no endereço, não desconecta e não apaga e-mails.
- Regras: ao criar ou editar, a Sofia reavalia os últimos 14 dias (antes só via e-mails que chegassem depois). E-mail já registrado por uma regra soma a outra regra que também bate. A verificação mostra "verificando", "concluída" ou "falha de acesso".
- "Abrir no Gmail" no e-mail encontrado: abre a mensagem na conta certa (Conta Google) ou a busca nela (senha de app).

Price Tracker
- Saiu a busca automática "Encontrar em outras lojas"; adicionar loja colando o link continua.
- O Início mostra a oferta principal escolhida (loja principal), não a mais barata do momento. As outras ofertas ficam recolhidas no produto e continuam acompanhadas. Dá para trocar a principal e mover uma oferta para outro produto.

Notificações
- Aviso apagado não volta. "Marcar tudo" e "Limpar todas" valem para todos os avisos no servidor; o sino mostra o total real. Arrastar para a direita marca como lida. Feriados do calendário de feriados não geram aviso no celular (compromissos seus nesses dias continuam avisando).

Retomada do app
- O aviso "sua mensagem pode ter chegado" é só do envio do chat; outras demoras dizem o que demorou. Leituras interrompidas porque o app foi para o segundo plano repetem sozinhas na volta. Ao sair, o foco do campo é solto (o teclado não reabre sozinho); ao voltar, as abas se realinham.

Conversa e datas
- Horário sem fuso é lido no fuso de São Paulo (a Sofia não pede mais fuso). O planejador recebe hora e fuso da sessão e corrige o mesmo registro quando você ajusta algo criado na conversa. Corrigido: Lembretes que não salvavam sem mexer no campo "Quando". Logo oficial no cabeçalho do chat e no avatar da Sofia.

Finanças
- Dinheiro guardado x Dinheiro para o dia a dia: a reserva é um destino do dinheiro (não soma de novo o que já está nas contas). Mostra guardado, dia a dia, comprometido com despesas previstas e livre; aporte mensal planejado x realizado; retirada consciente com confirmação; falta no dia a dia é sinalizada sem usar a reserva. O saldo total fica como resumo secundário.

Apps e Encomendas
- Ícones próprios por app (caixa, checklist, carrinho, ciclo, sino, envelope, etiqueta). Encomendas mostram a última atualização com sucesso separada da última tentativa.

Pendências conhecidas
- Encomendas: consulta automática dos Correios depende das credenciais da API oficial (CORREIOS_API_USER / CORREIOS_API_KEY na Railway).
- Teclado, abas e avisos na retomada, e a abertura do Gmail, precisam de validação no aparelho.
