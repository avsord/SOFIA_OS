# Sofia OS Android 0.3.241

Atualização automática a partir da 0.3.57. O servidor (Railway) também é atualizado.

Package com.avsord.sofiaapp; versionCode 242. Atualização por cima, sem desinstalar nem limpar dados.

- E-mails: apagar (ou pausar) uma regra não dispara mais a releitura da caixa de entrada. Antes, qualquer saída da janela da regra relia os últimos 14 dias, e a tela ficava ~18 s em "Lendo as caixas de entrada…" — inclusive ao apagar, quando não há nada a reavaliar. Agora só criar, editar e reativar uma regra releem (a regra pode passar a bater em e-mails já lidos). Os e-mails já encontrados continuam.
- E-mails, servidor: a leitura do Gmail buscava as mensagens uma por uma (até 80 chamadas em sequência, ~18,5 s). Agora busca em paralelo, no máximo 6 por vez (dentro da cota do Gmail), na mesma ordem e com o mesmo resultado — leva alguns segundos.
