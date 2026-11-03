# Sofia OS Android 0.3.11

Corrige a descoberta de atualizações: a lista retornava a 0.3.9 antes da 0.3.10 e o app selecionava somente a primeira. Agora escolhe a maior versão numericamente, consulta também a publicação marcada como mais recente, percorre a paginação e evita cache. Apenas APKs completos, publicados e do canal compatível são aceitos. Erros de rede ou consultas incompletas não são apresentados como “você já está atualizado”.

A verificação automática também é refeita ao voltar ao app e a cada cinco minutos enquanto ativo, sem interromper gravação/resposta e sem repetir o aviso de uma mesma versão dispensada. A verificação manual continua no Perfil e informa a versão instalada e a disponível.

Todas as alterações da 0.3.10 foram preservadas: motion do menu roxo, páginas com salvamento automático, desfazer/refazer, capa/ícone editáveis, subpáginas recolhidas com preferência persistida e chat sincronizado com seleção múltipla.

Importante: o código defeituoso já instalado não pode ser alterado por uma publicação de servidor. Pode ser necessário instalar este APK uma vez pelo link direto, por cima da versão atual, sem desinstalar. As próximas buscas usarão o atualizador corrigido.

Identidade preservada: com.avsord.sofiaapp; versionCode 16; prefixo sofia-android-v; assinatura anterior inalterada. Nenhuma alteração de senha, filtro privado, banco ou configuração do servidor.

Testes: regressão da ordem real 0.3.9/0.3.10, versões numéricas, paginação, cache, falha de rede, timeout, manifesto inválido e segurança de URLs; suíte anterior mantida. Validação completa de tipos, compilação, instalação sequencial sobre 0.3.9/0.3.10 e descoberta pública executadas no pipeline. Os testes não representam validação de todas as telas autenticadas no celular do usuário.
