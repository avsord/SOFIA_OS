# Sofia OS 0.3.247 — o site é o app

Atualização automática a partir da 0.3.57. O servidor (Railway) também é atualizado.

Package com.avsord.sofiaapp; versionCode 248. Atualização por cima, sem desinstalar nem limpar dados.

- Site (sofiaos.up.railway.app): passa a ser o próprio app rodando no navegador — mesmo código, mesmo design, mesmas funções (Início, Conversa, Páginas, Agenda, Apps, Perfil). Login com a mesma conta do app. O painel antigo continua em /painel-antigo.
- Módulos só de celular (avisos, alarmes, armazenamento seguro, navegador invisível de lojas, tarefas em segundo plano) ganham substitutos de navegador; no site, avisos não são agendados.
- O site fala sempre com o servidor que o serviu, com política de segurança própria (só scripts, estilos e dados do próprio servidor).
- Build do site: `npm run build:web` (gera public/web).
