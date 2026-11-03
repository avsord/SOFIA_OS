# Sofia OS — Master 0.3.50

**Data:** 7 de outubro de 2026. **Base publicada:** Android 0.3.49. **Pacote preservado:** `com.avsord.sofiaapp`. **Canal preservado:** `sofia-android-v`.

## Problemas confirmados

1. Em aparelho de entrada, o usuário ainda percebia aproximadamente três segundos até a Sofia ficar visível.
2. A foto da capa da página era enviada, mas o componente Android que tentava abrir diretamente a URL autenticada mostrava o ícone de imagem quebrada.

## Abertura percebida como imediata

A abertura não espera mais descriptografar todo o snapshot nem consultar o servidor para construir a primeira tela.

- A sessão continua no SecureStore.
- A última resposta de bootstrap do servidor passa a ser guardada dentro da própria sessão segura.
- Assim que a sessão é lida, o app monta uma bootstrap conservadora/segura e mostra uma superfície leve de Início.
- O Home completo só é executado depois da primeira pintura.
- O módulo Home também deixou de executar o enorme módulo Workspace apenas para ter acesso ao editor de compromissos; esse editor agora é carregado somente quando realmente aberto.
- Conversa, Agenda, Páginas, Perfil e Apps continuam com posições fixas no pager, mas os módulos são aquecidos um por vez em segundo plano. Um toque do usuário sempre antecipa imediatamente a aba solicitada.
- Apps permanece por último no aquecimento por possuir a maior árvore de editores e catálogo.
- O servidor continua validando sessão e capacidades em paralelo. A resposta viva substitui a bootstrap provisória e é salva novamente no armazenamento seguro para o próximo início.
- O shell inicial não consulta dados e não altera registros. Dados reais continuam vindo do snapshot criptografado e do servidor.

“Instantâneo” nesta arquitetura significa que a interface aparece sem aguardar a rede, o snapshot completo ou os módulos pesados. O Android ainda precisa criar o processo e iniciar o runtime; portanto, tempo físico zero em cold start não é uma afirmação válida.

## Capa da página

A capa não depende mais de `Image` conseguir enviar cabeçalho Bearer diretamente ao endpoint.

- Ao escolher a foto, o app mantém a URI local como prévia imediata.
- JPEG, PNG, WebP e GIF continuam sendo identificados pelos bytes reais.
- Ao reabrir a página, o app baixa o anexo por uma requisição autenticada para o cache privado do aplicativo.
- O componente de imagem recebe uma URI local, sem depender de cabeçalhos HTTP do `Image` Android.
- Arquivo vazio/corrompido é removido e baixado novamente.
- A URL recebe tentativa sem cache, evitando reaproveitar uma resposta quebrada.
- A página e o ID do anexo não são recriados. Nenhuma mensagem, página, capa válida ou rascunho é apagado.
- A URI local temporária nunca é enviada ao servidor como dado da página.

## Preservação

- Instalação por cima, sem desinstalar.
- Mesmo package e assinatura.
- Histórico, páginas, anexos, sessões e dados existentes preservados.
- Nenhum redeploy do backend é autorizado por esta correção Android.

## Critério de entrega

Só considerar publicado depois de typecheck, regressões, build de produção, instalação por cima, assinatura, testes nativos paralelos, release real e descoberta pelo atualizador.
