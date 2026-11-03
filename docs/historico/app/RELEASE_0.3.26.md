# Sofia OS Android 0.3.26

Conferência do MD, partindo da correção de toque longo da 0.3.25.

- Páginas atualiza alterações remotas enquanto a tela está aberta e ao voltar ao app, sem indicador de carregamento nas transições. Preserva rascunhos pendentes e não retrocede uma revisão mais recente.
- Arraste lateral sobe somente um nível por gesto, mantendo ícone, título e proteção contra refresh/voltar.
- Dica de título oculta quando a página já tem conteúdo ou subpáginas; tocar para editar continua disponível.
- Título Ajustes e nomes dos templates conforme o MD: Tarefas pessoal, Bloco de nota e Lista de reprodução. Templates preservam identidade e conteúdo existente.
- Mantém Agenda 50/50, sino com painel ancorado, cabeçalhos roxos, desfazer/refazer e autosave.

Pacote com.avsord.sofiaapp, versionCode 31, canal sofia-android-v. Instalar por cima; não desinstalar nem limpar dados.

## Limites explícitos
Site/backend NÃO redeployado: produção ainda sem volume persistente e sem acesso de shell para extrair e restaurar backup completo de banco, sessões e chaves. A conexão disponível expõe apenas nomes de variáveis; as credenciais Google não estão configuradas. O serviço não foi reiniciado e nenhum volume vazio foi montado sobre os dados existentes.
Código adicional de site/backend reconciliado e testado isoladamente NÃO é produção. Sincronização integral (item 13) e conexão Google (item 4) continuam pendentes. Ordem e limpeza de notificações seguem locais no servidor legado. Preferências de conta ainda não têm sincronização integral. O APK não conclui esses itens.
