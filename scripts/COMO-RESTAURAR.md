# Como recolocar a Sofia OS no ar a partir do backup com senha

Este guia é para você ou para um assistente (como o Claude) refazer a Sofia OS do zero, mesmo que o
servidor antigo tenha se perdido. Precisa de três coisas:

1. **O código** — repositório `avsord/SOFIA_OS`, branch `sofia-app-android`, no GitHub.
2. **O arquivo de backup** — no Google Drive, pasta **Sofia OS/Backup com senha**, o arquivo mais novo
   `sofia-com-senha-AAAA-MM-DD.sofia-backup` (um por dia; ficam os 7 mais recentes).
3. **A senha do backup** — a mesma colocada na variável `SOFIA_BACKUP_PASSPHRASE` da Railway.
   Sem ela o arquivo não abre (é criptografado com AES-256-GCM).

## Passo a passo

1. Clone o repositório e entre na branch `sofia-app-android`. Rode `npm ci` na raiz (Node 22).
2. Baixe do Drive o arquivo `.sofia-backup` mais novo da pasta *Backup com senha*.
3. Rode:
   ```
   SOFIA_BACKUP_PASSPHRASE='a senha' node scripts/restaurar-backup.cjs caminho/do/arquivo.sofia-backup data
   ```
   Isso cria `data/sofia.sqlite` com tudo: páginas, tarefas, agenda, finanças, conversas, contatos,
   cápsulas, regras de e-mail e configurações. Se já houver um banco, use `--substituir`
   (o antigo fica guardado como `sofia.sqlite.antes-da-restauracao`).
4. Publique o servidor (Railway ou outro) apontando a pasta de dados para essa `data/` — na Railway,
   é o volume montado onde fica `data/sofia.sqlite`. Configure de novo as variáveis de ambiente
   (chaves de IA, login, Google, `SOFIA_BACKUP_PASSPHRASE`).
5. Conecte de novo a Conta Google no app (Perfil → Conta Google). Fotos, capas, comprovantes e
   áudios que já estavam no Drive (pastas *Anexos*, *Comprovantes*, *Áudios*) voltam a abrir
   sozinhos: o backup guarda a referência de cada arquivo no Drive.
6. Cofre: se existir `data/cofre-chave-restaurada.txt`, ela é a chave do cofre de senhas. Importe-a
   pelo app (Perfil → Cofre → Recuperar) e depois apague o arquivo.

## O que fica de fora

- Arquivos que ainda não tinham ido para o Drive quando o servidor se perdeu (no máximo os últimos
  minutos, ou tudo se o Google estava desconectado) estão dentro do próprio backup.
- O app Android não precisa de nada: basta apontar para o mesmo endereço do servidor.
