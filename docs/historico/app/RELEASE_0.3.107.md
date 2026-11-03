# Sofia OS Android 0.3.107 — Rodada 5 (candidato manual)

Otimização do primeiro toque nos menus: telas secundárias podem ser pré-montadas **após** a Home aparecer, sem aguardar a leitura completa e decifração do arquivo histórico. A hidratação permanece ativa e independente. Evita-se uma renderização adicional do Shell ao final da hidratação; o TabPager nativo permanece protegido contra saltar para abas ainda não montadas.

Identidade Android: com.avsord.sofiaapp, versionCode 112, arm64-v8a, assinatura compatível. Não desinstalar, limpar dados nem alterar Railway. Sem publicação OTA até aprovação explícita do dono.

Validação no emulador com histórico sintético; os dados reais e a latência no aparelho físico ainda precisam de aceite. Consulte o PR e o run exato do GitHub Actions.
