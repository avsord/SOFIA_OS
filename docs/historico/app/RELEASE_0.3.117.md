# Sofia OS 0.3.117 — candidato manual

Rodada estrutural: os princípios dos apps que parecem leves (resposta no gesto, trabalho pesado só com o usuário parado, nada repetido).

1. **O toque nunca paga pela tela.** Tocar numa aba ainda não montada mostra um esqueleto imediatamente (título e blocos neutros) e a tela é renderizada numa transição do React, que cede ao toque. Antes, a montagem inteira (Conversa 161–331 ms, Agenda 222–362 ms no aparelho do dono) acontecia dentro do gesto. Modo Antigo intocado.
2. **Nada pesado na rajada inicial.** A fila ociosa trata a abertura como um toque: hidratação do histórico e pré-montagens só começam depois de 800 ms sem toques, e quem começa a tocar logo mantém isso adiado (prazos continuam forçando tarefas atrasadas; hidratação até 8 s). Antes, a hidratação começava aos 310 ms, no meio dos primeiros toques.
3. **Sincronização da Conversa respeita o toque.** A verificação de 2 s só vai à rede quando o usuário está parado.
4. **Toda renderização é medida.** Cada render de Início, Conversa, Páginas, Agenda, Apps, Perfil, pager, mini calendário e serviços de fundo vira `render:<nome>` no relatório, com `renders` (contagem/total/pior). Bloqueios "sem evento" passam a nomear o componente. A leitura nativa do histórico aparece como `hidratar:read`.

Efeito esperado no uso: ao tocar pela primeira vez numa aba, o esqueleto aparece na hora e o conteúdo chega ~0,2 s depois, em vez de o app congelar. Primeira visita à Conversa antes de o histórico hidratar mostra "carregando" por um instante e busca na rede.

Pacote com.avsord.sofiaapp, mesma assinatura, ARM64 e R8. Código 122, instalação por cima da 0.3.116. Candidato manual: não publicado no atualizador.
