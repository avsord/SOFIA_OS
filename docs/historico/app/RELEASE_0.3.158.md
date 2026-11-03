# Sofia OS Android 0.3.158

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 163. Atualização por cima, sem desinstalar nem limpar dados.

- Corrige a compilação do APK, que falhava desde a 0.3.157: a verificação do build ainda exigia os arquivos da esfera (o ícone do launcher apontando para o padrão do Expo e o arquivo sofia_launch_orb), que deixaram de existir quando o "S" voltou. Agora ela procura os arquivos do S.
- Abertura sem salto: o "S" que o Android desenha antes do app abrir passa a começar no mesmo tamanho (0,86) e a crescer no mesmo tempo (1,1 s) da animação da Sofia. Antes ele começava em 0,70 e durava 650 ms, então a letra dava um pulo na troca de uma tela para a outra.
