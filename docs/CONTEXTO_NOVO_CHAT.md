# CONTEXTO PARA NOVO CHAT — Sofia OS v111

Este arquivo existe para impedir perda de contexto ao continuar a Sofia OS em outro chat.

## Ordem de leitura recomendada

1. `docs/GUIA_MASTER_COMPLETO.md` — regras de trabalho, arquitetura e padrão de entrega.
2. `docs/MASTER.md` — mapa do estado atual e caminhos principais.
3. `docs/UI_MAP.md` — mapa rápido dos pontos de interface mais editados.
4. `Comando atual.md` — resumo corrente da versão e decisões recentes.
5. `docs/historico_bruto/README.md` — índice do histórico bruto preservado.

## Regra mais importante

A partir da v106, o projeto pode ser simplificado apenas na **área ativa** para acelerar edição, testes e manutenção. O histórico documental não deve ser apagado. Documentos antigos e testes históricos que ajudem a explicar decisões devem permanecer dentro do pacote em `docs/historico_bruto/`.

## O que foi recuperado

O histórico bruto da v103 foi reintegrado, incluindo:
- 57 documentos de arquitetura/checkpoints/correções em `projeto/docs` da época;
- 34 documentos de raiz da versão, incluindo `LEIA_Vxx`, `Comando atual.md`, `PROMPT_CONTINUAR_SOFIA.md` e o PDF de continuação;
- testes versionados antigos como material histórico, fora da suíte ativa;
- snapshots dos documentos de master simplificado da v104 e v105.

## Estado atual

Versão atual: **v111**.
Base funcional: v106, com documentação bruta preservada. Na v109, o preview do sino foi corrigido para abrir para a esquerda e não ser cortado na borda direita; hover/foco continuam ativos.

Comando oficial para iniciar:

```powershell
Set-Location "$HOME\SOFIA-OS"
& "$HOME\SOFIA-OS\INICIAR_SOFIA.cmd"
```

## Para o próximo chat

Não trate `docs/historico_bruto/` como lixo ou arquivos descartáveis. Eles são a memória documental do desenvolvimento. Use `MASTER.md` para chegar rápido ao código atual e procure o histórico bruto quando precisar entender requisitos, regressões, decisões antigas ou comportamento de versões anteriores.


## v110
Capa e ícones voltaram ao comportamento visual anterior. Placeholders de blocos vazios e a ação de adicionar bloco ficam ocultos fora do hover, seguindo a referência do Notion.


## v111
O editor ganhou espaçamento correto entre os controles laterais do bloco e o texto, sem mudar o hover discreto definido na v110.


## Atualização v118
- A Agenda passa a ser um calendar viewer com visão mensal e Programação.
- Reúne eventos/compromissos, lembretes, tarefas com data e outros registros com campo de data.
- Mantém filtros por origem e navegação temporal.


## v120 — correção da tela Tarefas
A v119 removeu acidentalmente `loadTaskCards()` e os helpers de prioridade. A v120 restaura essas funções e adiciona teste de regressão para evitar o erro `loadTaskCards is not defined`.


## v122
A barra de scroll dos menus laterais deve permanecer visível no desktop e seguir um estilo fino/discreto semelhante ao Notion, inclusive ao entrar em subpáginas.


## Atualização v126 — checkpoint Meta/Railway
- Repositório GitHub oficial: `avsord/SOFIA_OS` (branch `main`).
- Backend publicado no Railway; `/health` validado publicamente.
- Política de privacidade pública em `/privacy`.
- Webhook Meta validado com `WHATSAPP_VERIFY_TOKEN` e campo `messages` assinado.
- Empresa Meta verificada; permissões `whatsapp_business_messaging` e `whatsapp_business_management` estão no fluxo de App Review.
- O número escolhido já está no WhatsApp Business; NÃO desconectar nem migrar pelo cadastro normal. Usar coexistência via Embedded Signup.
- v126 adiciona a página `/whatsapp/connect` e botão na Sofia que lança o fluxo com `whatsapp_business_app_onboarding`.
- Depois de validar a coexistência, voltar diretamente ao App Review e anexar a gravação real do fluxo para `whatsapp_business_management`.


## Atualização v127 — CSP do fluxo Meta
- O console do Edge mostrou que a v126 era bloqueada pela própria Content Security Policy ao tentar acessar `connect.facebook.net/app_config/json/...`.
- v127 libera somente as origens necessárias ao SDK da Meta na página pública de conexão e mantém o painel privado.
- Próximo teste: publicar v127 no Railway e clicar novamente em Conectar WhatsApp Business.

## Atualização v128 — callback do Embedded Signup
- v127 foi publicada no Railway e os erros CSP desapareceram.
- Restou no SDK da Meta: `Expression is of type asyncfunction, not function`.
- v128 troca o callback direto `async` do `FB.login` por callback `Function` normal com uma rotina assíncrona interna.
- Próximo teste: publicar v128, abrir `/whatsapp/connect` e clicar em **Conectar WhatsApp Business** com o Console aberto.


## Atualização v129 — site institucional para Meta
- A verificação de acesso da Meta está sendo preenchida como Plataforma de SaaS.
- `/site` é a página pública institucional para o campo de website da Meta; `/terms` e `/data-deletion` completam as informações públicas.
- App Review de `whatsapp_business_messaging`, `whatsapp_business_management` e `public_profile` já foi enviado e está em análise.

## Atualização v130 — login do painel no Railway
- A raiz pública `https://sofiaos.up.railway.app` agora redireciona para `/login` quando não há sessão.
- Login correto redireciona de volta à raiz e libera o painel/API durante a sessão.
- `SOFIA_LOGIN_PASSWORD` é segredo do Railway/.env; não entra em Git, ZIP ou documentação com valor real.
- Sessão: cookie opaco HttpOnly/Secure/SameSite=Lax, 12h, memória do processo.
- Páginas Meta/WhatsApp continuam públicas.
- O login é do proprietário/admin de uma instalação single-owner; não tratar como sistema multiusuário.

## Atualização v131 — experiência de conta e sessão
- Menu de conta no rodapé da sidebar com **Sair**.
- Configuração possui **Conta e sessão** e comando para encerrar todas as sessões online.
- Sessão expirada redireciona automaticamente ao login.
- Login possui mostrar/ocultar senha, Caps Lock, mensagens de logout/expiração e links legais.
- Permanece uma instalação single-owner; cadastro público, reset por e-mail e múltiplos usuários não devem ser simulados sem backend de contas e isolamento de dados.


### v132
Perfil do proprietário adicionado. O menu da conta deve fechar ao clicar fora. Nome/e-mail são editáveis e persistidos nas configurações locais; senha continua no Railway/.env.

## Atualização v133 — login por e-mail e recuperação
- Login online exige o e-mail cadastrado no perfil + senha.
- Proprietário padrão desta instalação: Pedro Silva. O e-mail de login/recuperação vem de `SOFIA_LOGIN_EMAIL` e não deve ser hardcoded no repositório.
- `Esqueceu a senha?` abre `/forgot-password`; um link de uso único com validade de 30 minutos é enviado somente ao e-mail cadastrado.
- Nova senha fica como hash scrypt em `data/owner-auth.json`; nunca salvar senha em texto claro no projeto.
- Recuperação exige SMTP seguro no Railway: `SOFIA_SMTP_USER` + `SOFIA_SMTP_PASS` (host padrão Gmail `smtp.gmail.com`, porta 465).
- Alterar o e-mail em Meu perfil também altera o nome de login e o destino futuro da recuperação.
- Trocar/redefinir senha encerra todas as sessões online.

## Atualização v134 — sidebar / perfil
- Corrigido o recorte visual do card Pedro Silva/e-mail no rodapé da sidebar.
- O e-mail quebra de linha em vez de desaparecer sob a scrollbar.
- O menu Meu perfil / Conta e configurações / Site público / Sair abre em overlay de viewport e não é mais clipado pelo scroll lateral.
- Preservar fechamento por clique fora, `Esc` e ações do menu.


## v138 — aplicativo Android e mesma base

Login nativo por e-mail e senha, sessão Bearer com hash e expiração, mensagens e áudios no mesmo SofiaCore. A API do app expõe somente operações de usuário autenticadas, reutilizando o catálogo e as mesmas operações do site. Sessões web e nativas são revogadas juntas ao trocar a senha ou sair de todos os dispositivos. O diário mantém autenticação adicional e criptografia, separado da memória comum. Nenhuma dependência da aprovação Meta para conversar no app. Não significa que o WhatsApp esteja ativado ou que as conversas de outros contatos possam usar a memória privada do proprietário.

Base desta integração no GitHub: v134; documentos anteriores preservados em snapshots_v138. Não altera .env, senhas, diretórios existentes de dados ou backups. Publicar em produção somente depois dos testes e da conferência de persistência/backup. APK compilado não comprova a credencial real da IA nem equivalência a todos os gestos avançados do editor desktop.
