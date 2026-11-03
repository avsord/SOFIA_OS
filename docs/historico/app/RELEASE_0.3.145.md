# Sofia OS Android 0.3.145

Atualização automática a partir da 0.3.57.

Package com.avsord.sofiaapp; versionCode 150. Atualização por cima, sem desinstalar nem limpar dados. O backend não é reiniciado por este fluxo.

- Início, Agenda e Apps voltam ao topo depois de 10 s seguidos em outra tela. Agora a volta acontece enquanto a tela está escondida: quem volta já encontra a página no topo, sem ver ela subir. Ir e voltar antes dos 10 s não reinicia.
- Fade mais perceptível entre a abertura e o app (150 ms, saída suave).
- Encomendas: o acesso gratuito do app dos Correios foi fechado (responde 403 para todos). A Sofia agora explica isso com clareza, para de insistir por 24 h e oferece "Abrir rastreio oficial". Se a Railway tiver as credenciais da API oficial dos Correios (CORREIOS_API_USER e CORREIOS_API_KEY), a consulta automática volta a funcionar por ela.
