# Sofia OS 0.3.115 — candidato manual

Guiado pelo primeiro relatório do celular com a montagem medida por dentro (0.3.114).

1. A conversão de fuso horário usada na expansão de compromissos recorrentes (`agenda-recurrence.ts`) passou a lembrar resultados. Ela fazia ~13 chamadas a `Intl.formatToParts` por evento recorrente a cada expansão, e Home e Agenda repetem a conta. Agora a segunda expansão não chama `Intl` nenhuma vez, e eventos de dia inteiro custam ~20x menos na primeira. As respostas são idênticas às da versão anterior (comparação com cópia congelada: 264 combinações aleatórias, 7 fusos, dias de horário de verão).
2. Medição, sem mudar comportamento: `agenda:expand`, `agenda:priority`, `home:expand`, `home:priority` e `composer:recorder` aparecem em `operations` no relatório.

Pacote com.avsord.sofiaapp, mesma assinatura, ARM64 e R8. Código 120, instalação por cima da 0.3.114. Candidato manual: não publicado no atualizador.
