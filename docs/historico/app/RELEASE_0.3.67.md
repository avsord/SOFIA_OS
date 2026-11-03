# Sofia OS Android 0.3.67

## Responsividade da abertura

- Mantém a projeção local criptografada de tarefas, Home e Agenda como fonte da primeira tela.
- Adia consultas opcionais de catálogo e configuração de widgets até que a Home real esteja visível e o thread JavaScript tenha cedido a prioridade.
- Adia a primeira varredura de monitoramentos para uma janela ociosa após a abertura; sincronização em primeiro plano continua disponível.
- Não altera login, API, backend Railway, criptografia, banco de dados ou histórico.

### Critérios de aceitação

Validar TypeScript, suíte Android/Node, upgrade sobre a instalação 0.3.66, assinatura idêntica e testes instrumentados do GitHub Actions. O ganho de tempo precisa ser medido em aparelho real com registros e cache de produção; esta mudança não representa abertura garantida em milissegundos.

### Entrega para aprovação

O APK 0.3.67 é gerado como artefato de teste no GitHub Actions (`[manual-apk]`), sem criar release pública. A publicação só poderá ocorrer após aprovação explícita do proprietário, registrada em um commit separado com `[approved-apk]`, e a execução dos testes completos.
