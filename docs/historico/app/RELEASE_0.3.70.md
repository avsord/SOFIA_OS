# Sofia OS Android 0.3.70 — atualização de teste

- Ícone da abertura: o **S realmente gira e amplia**, em um AnimatedVectorDrawable Android 12+, enquanto o círculo roxo fica fixo. Substitui fade mal visível. Animação de 420 ms é independente da liberação da Home; não aumenta tempo de espera.
- Menus: pré-carregamento opcional de dados foi adiado até haver 3,4 s de Home estável e uma oportunidade ociosa. Toques que mudam de aba cancelam o início desse trabalho. As telas já visitadas continuam montadas, e o cache local preserva o conteúdo real.
- Foto, sino, Cápsulas e dados anteriores preservados. Package com.avsord.sofiaapp, versionCode 75.
- Limitação: Android não exibe splash em hot start; esta animação é da abertura fria/morna, não da simples volta do segundo plano. O tempo e efeito devem ser conferidos visualmente no aparelho.

Esta é uma compilação de teste, não uma publicação oficial de release.

- Também suspendemos o aquecimento síncrono dos módulos de outras abas enquanto a pessoa está navegando, retomando-o em pequenos blocos quando a Home fica ociosa.
