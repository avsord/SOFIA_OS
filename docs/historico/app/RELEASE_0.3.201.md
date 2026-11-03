# Sofia OS Android 0.3.201

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 206. Atualização por cima, sem desinstalar nem limpar dados. O servidor (Railway) também é atualizado. Novo som de alarme no app (o APK precisa ser gerado de novo pela aba Actions, como sempre).

Correções
- "Campo não previsto: sort_order": a página reordenada não salvava. O servidor agora aceita a posição da página e o modelo de origem. Páginas que ficaram "Não salvo": toque em "Tentar novamente".
- Apagar regra de e-mail não mostra mais "Cannot read property 'map' of undefined".
- O título do bloco criado por template (Kanban, Formulário, Notas) agora se edita com um toque.
- Enter no editor de páginas e de notas não faz mais o texto pular.
- Arrastar páginas (reordenar ou virar subpágina) sem tremer, e a página desliza até o lugar ao soltar.

Agenda (registrada na Sofia e espelhada no Google Agenda)
- Notificações como no Google Agenda: no horário, 5 e 10 min, 2 horas, 1, 2 e 4 dias, ou personalizado (até 5 por compromisso), também no "Novo compromisso" do Início. Vão e voltam do Google.
- Com a conta Google conectada, compromisso novo já nasce sincronizando (app e chat da Sofia).
- Tarefa programada vira evento no Google Agenda, com os lembretes dela; concluir, tirar a data ou apagar tira do Google. O evento não volta duplicado como compromisso.
- Lembrete com alarme: notificação normal, som de alarme (uma vez, mesmo no "Não perturbe") ou alarme até desligar (repete a cada minuto por até 10 minutos, com Desligar e Adiar 5 min).

Tarefas
- Busca que acha mesmo com letra errada, no Início e no app de Tarefas.
- Tocar na tarefa abre a programação rápida: Hoje, Amanhã ou escolher o dia, horário, lembrete e importância. Com data, aparece na Agenda (como "Tarefa"). Vale no Início, no app de Tarefas e na Agenda.

Apps
- "Organizar" (ou segurar um app): setas para mudar os apps de lugar; a ordem fica guardada no celular.

Notas
- Reestruturadas: pastas em cartões (ícone, quantidade, última nota), notas com prévia e data da última edição, busca, "+ Pasta" e "+ Nota", segurar a pasta para renomear, trocar ícone ou excluir. As notas existentes continuam (mesmo formato).

Backup completo
- Todo dia vai para o Drive, em Sofia OS/Backup com senha, um backup que abre SEM o servidor, só com a senha (ficam os 7 mais novos), junto do guia COMO-RESTAURAR.md. O repositório tem o script scripts/restaurar-backup.cjs que recoloca tudo no ar. Precisa da senha (12+ caracteres) na variável SOFIA_BACKUP_PASSPHRASE da Railway; o app mostra o estado em Perfil → Conta Google.
