# Sofia OS Android 0.3.25

Corrige uma exceção ao tocar/segurar páginas: a versão 0.3.24 chamava setNativeProps na instância composta de RefreshControl, que não implementa esse método. A atualização passa a controlar enabled por estado, mantendo a proteção síncrona contra refresh atrasado e o bloqueio dos gestos de navegação.

Mantém segurar para ações, arrastar para mover e tocar para abrir. Sem alteração de banco, histórico, páginas, login ou preferências. Pacote com.avsord.sofiaapp, versionCode 30, canal sofia-android-v. Instalar por cima, sem desinstalar.

Validação: regressão reproduz a exceção antiga e executa o callback corrigido; suíte completa e TypeScript; teste Android da tela real Pages com dados sintéticos para toques longos em ícone/texto, página/subpágina e cancelamento. O APK de teste é separado e nunca publicado. Assinatura e instalação sobre 0.3.24 verificadas antes de publicar.

Site/backend permanecem na versão anterior. As pendências de sincronização integral registradas na master 0.3.24 continuam pendentes.
