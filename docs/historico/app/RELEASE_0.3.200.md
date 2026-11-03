# Sofia OS Android 0.3.200

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 205. Atualização por cima, sem desinstalar nem limpar dados. Só o servidor (Railway) muda; o app continua igual.

- Capa de página mais leve: ao enviar, a capa em JPEG é reduzida no servidor para no máximo 1600 px de largura e recomprimida (de 1 a 2 MB passa para algo em torno de 150 a 400 KB). Fotos com rotação EXIF e outros formatos não são mexidos.
- Capa antiga apagada: ao trocar a capa de uma página, ou tirá-la, o arquivo da capa anterior é apagado do servidor e também do Google Drive. Só apaga se for mesmo uma capa daquela página e nenhum outro registro usar o mesmo arquivo; anexos comuns nunca são tocados.
- Capas que já estavam guardadas também ficam leves: as que estão no servidor são reduzidas uma de cada vez (2 minutos depois de ligar e a cada 12 horas, com pausa entre elas e nunca durante o envio ao Drive); as que já foram para o Drive são baixadas, reduzidas e trocadas no mesmo arquivo, até 3 por rodada de 15 minutos. Só mexe em capas JPEG com mais de 1600 px de largura; a redução não tem volta, mas em celular a diferença não aparece.
- Faxina das sobras: 2 minutos depois de ligar e a cada 12 horas, o servidor remove as capas que ficaram de trocas antigas (e que não são mais a capa de nenhuma página), com mais de 1 hora de idade, no servidor e no Drive.
