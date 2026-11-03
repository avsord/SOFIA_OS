# Sofia OS Android 0.3.28

Correções de interface guiadas pelo MD posterior à 0.3.25, que não havia sido seguido nas entregas anteriores.

- Início: compromissos à esquerda e calendário à direita, com Agenda fixa; troca de mês por gesto horizontal.
- Perfil: ícone de pessoa, Perfil do usuário primeiro e Configurações do aplicativo depois.
- Notificações: painel com margens laterais iguais.
- Páginas: posição otimista no arraste e espaço de destino; barra superior fixa; confirmação para remover blocos.
- Coleção: campos configuráveis e tipados. Anotações: cadernos e folhas, títulos, corpo, duplicação, movimentação e exclusão.
- Datas: calendário visual, formato brasileiro e horário de 24 horas; editor respeita área segura.
- Apps: tocar na aba retorna à lista. Nova conversa: criação adiada até o primeiro envio. Painéis com fundo independente.

Este APK não conclui todo o MD. O servidor público v142 não foi reiniciado: sem volume persistente e sem backup integral validado, uma troca poderia perder dados. Reordenação global de widgets, exclusão de conversas selecionadas e fim de tarefa têm implementação preparada, mas exigem o backend atualizado. Limpeza de notificações não cria novos ocultamentos locais. Ordem antiga de páginas ainda tem limitação local. Google OAuth/Supabase, anexos do chat, formulário completo de recorrências/lembretes e equivalência integral do site continuam pendentes. Supabase consta instalado, mas as ferramentas de banco não foram expostas nesta execução.

O canal só publica após TypeScript, regressões, compilação, assinatura, instalação por cima e verificação Android com dados sintéticos. Dados reais não são usados nos testes. Pacote com.avsord.sofiaapp, versionCode 33, mesma assinatura e canal de atualização. Instale por cima, sem desinstalar.
