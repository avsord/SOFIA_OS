'use strict';
const CATALOG={
  "project": {
    "label": "Projeto",
    "group": "flow",
    "states": [
      "idea",
      "active",
      "paused",
      "completed",
      "archived"
    ],
    "fields": [
      {
        "key": "outcome",
        "label": "Resultado desejado",
        "type": "text"
      },
      {
        "key": "next_step",
        "label": "Próximo passo",
        "type": "text"
      },
      {
        "key": "deadline",
        "label": "Data-alvo",
        "type": "date"
      },
      {
        "key": "parent_id",
        "label": "Projeto principal (ID)",
        "type": "text"
      },
      {
        "key": "reason",
        "label": "Por que importa",
        "type": "text"
      }
    ],
    "description": "Uma intenção com resultado, etapas e histórico. Não é uma tarefa duplicada."
  },
  "dream": {
    "label": "Sonho / intenção",
    "group": "flow",
    "states": [
      "idea",
      "active",
      "paused",
      "completed",
      "archived"
    ],
    "fields": [
      {
        "key": "horizon",
        "label": "Horizonte",
        "type": "text"
      },
      {
        "key": "why",
        "label": "Significado",
        "type": "text"
      },
      {
        "key": "next_step",
        "label": "Primeiro passo possível",
        "type": "text"
      }
    ],
    "description": "Pode ficar em espera sem virar uma cobrança diária."
  },
  "commitment": {
    "label": "Compromisso",
    "group": "flow",
    "states": [
      "planned",
      "confirmed",
      "pending",
      "done",
      "cancelled"
    ],
    "fields": [
      {
        "key": "alarm_mode",
        "label": "Tipo de aviso",
        "type": "select",
        "options": ["none", "once", "ring"]
      },
      {
        "key": "reminders_json",
        "label": "Notificações (minutos antes)",
        "type": "text",
        "max": 400,
        "developerOnly": true
      },
      {"key": "calendar_all_day", "label": "Dia inteiro", "type": "checkbox"},
      {"key": "calendar_date_start", "label": "Dia inicial", "type": "date"},
      {"key": "calendar_date_end", "label": "Dia final (exclusivo)", "type": "date"},
      {"key": "google_etag", "label": "Versão no Google", "type": "text", "max": 120, "developerOnly": true},
      {"key": "google_rev", "label": "Revisão sincronizada", "type": "number", "developerOnly": true},
      {"key": "google_recurring_id", "label": "Série no Google", "type": "text", "max": 200, "developerOnly": true},
      {"key": "google_readonly", "label": "Somente leitura no Google", "type": "checkbox", "developerOnly": true},
      {
        "key": "start_at",
        "label": "Início",
        "type": "datetime"
      },
      {
        "key": "end_at",
        "label": "Fim",
        "type": "datetime"
      },
      {
        "key": "location",
        "label": "Local / link",
        "type": "text"
      },
      {
        "key": "remind_minutes",
        "label": "Lembrar com antecedência (minutos)",
        "type": "number"
      },
      {"key": "priority_level", "label": "Prioridade", "type": "select", "options": ["none", "important", "medium", "light"]},
      {
        "key": "calendar_provider",
        "label": "Provedor do calendário",
        "type": "text",
        "developerOnly": true
      },
      {
        "key": "calendar_id",
        "label": "ID do calendário externo",
        "type": "text",
        "developerOnly": true
      },
      {
        "key": "external_event_id",
        "label": "ID do evento externo",
        "type": "text",
        "developerOnly": true
      },
      {
        "key": "sync_state",
        "label": "Estado da sincronização",
        "type": "text",
        "developerOnly": true
      }
    ],
    "description": "Compromissos com data, horário e local.",
    "defaultPrivacy": "shared"
  },
  "reminder": {
    "label": "Lembrete",
    "group": "flow",
    "states": [
      "active",
      "done",
      "cancelled",
      "archived"
    ],
    "fields": [
      {
        "key": "alarm_mode",
        "label": "Tipo de aviso",
        "type": "select",
        "options": ["none", "once", "ring"]
      },
      {
        "key": "remind_at",
        "label": "Quando lembrar",
        "type": "datetime"
      },
      {
        "key": "repeat_day",
        "label": "Dia original da repetição",
        "type": "number",
        "developerOnly": true
      },
      {
        "key": "message",
        "label": "Lembrete",
        "type": "text"
      },
      {
        "key": "location",
        "label": "Local / referência",
        "type": "text"
      },
      {
        "key": "calendar_provider",
        "label": "Provedor do calendário",
        "type": "text",
        "developerOnly": true
      },
      {
        "key": "calendar_id",
        "label": "ID do calendário externo",
        "type": "text",
        "developerOnly": true
      },
      {
        "key": "external_event_id",
        "label": "ID do evento externo",
        "type": "text",
        "developerOnly": true
      },
      {
        "key": "sync_state",
        "label": "Estado da sincronização",
        "type": "text",
        "developerOnly": true
      }
    ],
    "description": "Lembretes são registros separados de tarefas e compromissos.",
    "defaultPrivacy": "shared"
  },

  "capsule": {
    "label": "Cápsula",
    "group": "health",
    "states": [
      "active",
      "paused",
      "archived"
    ],
    "fields": [
      {"key":"rotina_type","label":"Tipo na Rotina","type":"select","options":["capsula","cuidado","habito","treino","outro"]},{"key":"type_label","label":"Nome do tipo","type":"text","max":40},{"key":"type_color","label":"Cor do tipo","type":"text","max":16,"developerOnly":true},{"key":"type_icon","label":"Símbolo do tipo","type":"text","max":32,"developerOnly":true},{"key":"count_target","label":"Vezes por dia","type":"number"},
      {
        "key": "capsule_type",
        "label": "Tipo",
        "type": "select",
        "options": [
          "medicine",
          "herbal",
          "supplement"
        ]
      },
      {
        "key": "dose_text",
        "label": "Dose",
        "type": "text"
      },
      {
        "key": "times_json",
        "label": "Horários",
        "type": "text",
        "max": 1000
      },
      {
        "key": "start_date",
        "label": "Primeiro dia",
        "type": "date"
      },
      {
        "key": "end_date",
        "label": "Último dia",
        "type": "date"
      },
      {
        "key": "repeat_type",
        "label": "Repetição",
        "type": "select",
        "options": [
          "daily",
          "weekdays",
          "interval",
          "monthly",
          "yearly",
          "once"
        ]
      },
      {
        "key": "weekdays_json",
        "label": "Dias da semana",
        "type": "text",
        "max": 200
      },
      {
        "key": "interval_days",
        "label": "Intervalo em dias",
        "type": "number"
      },
      {
        "key": "remind_minutes",
        "label": "Antecedência",
        "type": "number"
      },
      {
        "key": "notifications",
        "label": "Notificações",
        "type": "checkbox"
      }
    ],
    "description": "Rotina privada de doses e lembretes da área Cápsulas.",
    "private": true
  },
  "routine": {
    "label": "Rotina",
    "group": "flow",
    "states": [
      "draft",
      "active",
      "paused",
      "archived"
    ],
    "fields": [
      {
        "key": "frequency",
        "label": "Frequência",
        "type": "select",
        "options": [
          "daily",
          "weekly",
          "monthly"
        ]
      },
      {
        "key": "time",
        "label": "Horário local",
        "type": "time"
      },
      {
        "key": "weekday",
        "label": "Dia da semana (0=domingo)",
        "type": "number"
      },
      {
        "key": "monthday",
        "label": "Dia do mês",
        "type": "number"
      },
      {
        "key": "starts_on",
        "label": "Começa em",
        "type": "date"
      },
      {
        "key": "ends_on",
        "label": "Termina em",
        "type": "date"
      },
      {
        "key": "delivery",
        "label": "Entrega",
        "type": "select",
        "options": [
          "notification",
          "task"
        ]
      },
      {
        "key": "instruction",
        "label": "O que lembrar",
        "type": "text"
      }
    ],
    "description": "Ao ativar, gera uma ocorrência local por período enquanto a Sofia estiver ligada. Não envia WhatsApp."
  },
  "purchase": {
    "label": "Item para comprar",
    "group": "flow",
    "defaultPrivacy": "shared",
    "states": [
      "interest",
      "planned",
      "purchased",
      "cancelled",
      "archived"
    ],
    "fields": [
      {"key":"unit","label":"Unidade","type":"text"},{"key":"price","label":"Preço total (R$)","type":"number"},{"key":"in_cart","label":"No carrinho","type":"checkbox"},
      {
        "key": "variant",
        "label": "Variante exata (tamanho, capacidade...)",
        "type": "text"
      },
      {
        "key": "url",
        "label": "Anúncio / produto",
        "type": "url"
      },
      {
        "key": "store",
        "label": "Loja preferida",
        "type": "text"
      },
      {
        "key": "target_price",
        "label": "Preço-alvo (R$)",
        "type": "number"
      },
      {
        "key": "quantity",
        "label": "Quantidade",
        "type": "number"
      },
      {
        "key": "occasion",
        "label": "Ocasião",
        "type": "select",
        "options": [
          "none",
          "black-friday"
        ]
      },
      {
        "key": "year",
        "label": "Ano da ocasião",
        "type": "number"
      },
      {
        "key": "paid_price",
        "label": "Total pago (R$)",
        "type": "number"
      },
      {
        "key": "purchased_on",
        "label": "Comprado em",
        "type": "date"
      },
      {
        "key": "purchase_group_id",
        "label": "Grupo de compra",
        "type": "text"
      },
      {
        "key": "seller",
        "label": "Vendedor",
        "type": "text"
      },
      {
        "key": "conditions",
        "label": "Frete, cupom, garantia / condições",
        "type": "text"
      }
    ],
    "description": "Comprar é a lista; Black Friday é um filtro. Monitoramento referencia este mesmo item."
  },
  "shopping_item": {
    "label": "Item de lista",
    "group": "flow",
    "states": [
      "needed",
      "purchased",
      "unavailable",
      "cancelled",
      "archived"
    ],
    "fields": [
      {"key":"unit","label":"Unidade","type":"text"},{"key":"price","label":"Preço total (R$)","type":"number"},{"key":"section","label":"Seção","type":"text"},{"key":"in_cart","label":"No carrinho","type":"checkbox"},
      {
        "key": "list",
        "label": "Lista",
        "type": "select",
        "options": [
          "market",
          "pharmacy",
          "other"
        ]
      },
      {
        "key": "quantity",
        "label": "Quantidade e unidade",
        "type": "text"
      },
      {
        "key": "paid_price",
        "label": "Valor pago (R$)",
        "type": "number"
      },
      {
        "key": "purchased_on",
        "label": "Data da compra",
        "type": "date"
      },
      {
        "key": "recipe_id",
        "label": "Receita de origem (ID)",
        "type": "text"
      }
    ],
    "description": "Mercado e Farmácia são listas distintas. Comprados saem da lista ativa e permanecem no histórico; estoque não é presumido."
  },
  "monitor": {
    "label": "Monitoramento",
    "group": "flow",
    "defaultPrivacy": "shared",
    "states": [
      "draft",
      "active",
      "paused",
      "archived"
    ],
    "fields": [
      {
        "key": "target_id",
        "label": "ID do produto ou curso (obrigatório)",
        "type": "text"
      },
      {
        "key": "variant",
        "label": "Item / edição exata (obrigatório)",
        "type": "text"
      },
      {
        "key": "preferred_url",
        "label": "Link da loja principal",
        "type": "url"
      },
      {
        "key": "source_urls",
        "label": "Outras lojas do mesmo produto (um link por linha)",
        "type": "textarea",
        "max": 4000
      },
      {
        "key": "discover",
        "label": "Procurar este produto em outras lojas",
        "type": "checkbox"
      },
      {
        "key": "currency",
        "label": "Moeda",
        "type": "select",
        "options": [
          "BRL",
          "USD",
          "EUR"
        ]
      },
      {
        "key": "target_price",
        "label": "Preço-alvo",
        "type": "number"
      },
      {
        "key": "drop_percent",
        "label": "Queda mínima (%)",
        "type": "number"
      },
      {
        "key": "new_low",
        "label": "Avisar menor preço observado",
        "type": "checkbox"
      },
      {
        "key": "method",
        "label": "Fonte",
        "type": "select",
        "options": [
          "manual",
          "json",
          "product"
        ]
      },
      {
        "key": "feed_url",
        "label": "URL HTTPS do feed JSON autorizado",
        "type": "url"
      },
      {
        "key": "price_path",
        "label": "Campo do preço (ex.: product.price)",
        "type": "text"
      },
      {
        "key": "variant_path",
        "label": "Campo da variante",
        "type": "text"
      },
      {
        "key": "currency_path",
        "label": "Campo da moeda",
        "type": "text"
      },
      {
        "key": "shipping_path",
        "label": "Campo do frete (opcional)",
        "type": "text"
      },
      {
        "key": "interval_minutes",
        "label": "Intervalo (minutos)",
        "type": "number"
      },
      {
        "key": "consent",
        "label": "Tenho autorização para consultar esse feed",
        "type": "checkbox"
      },
      {
        "key": "line_color",
        "label": "Cor da linha no gráfico",
        "type": "text",
        "max": 20
      },
      {
        "key": "source_identities",
        "label": "Identidade fixa da oferta por link",
        "type": "textarea",
        "max": 24000,
        "developerOnly": true
      },
      {
        "key": "reader_memory",
        "label": "Origem do preço confirmada por loja",
        "type": "textarea",
        "max": 8000,
        "developerOnly": true
      }
    ],
    "description": "Observações reais e notificações locais. Em 'product', a leitura é feita no aparelho sobre a página da loja, só com o app aberto; sem fonte verificável, coleta manual, nunca fingir monitoramento ativo."
  },
  "plan_review": {
    "label": "Revisão de Plano",
    "group": "flow",
    "states": [
      "draft",
      "active",
      "completed",
      "archived"
    ],
    "fields": [
      {
        "key": "strengths",
        "label": "O que está bom",
        "type": "textarea"
      },
      {
        "key": "risks",
        "label": "Riscos / pontos a conferir",
        "type": "textarea"
      },
      {
        "key": "dependencies",
        "label": "Dependências",
        "type": "textarea"
      },
      {
        "key": "costs",
        "label": "Custos informados",
        "type": "textarea"
      },
      {
        "key": "checklist",
        "label": "O que levar / conferir (uma linha por item)",
        "type": "textarea"
      },
      {
        "key": "plan_b",
        "label": "Plano B",
        "type": "textarea"
      },
      {
        "key": "lesson",
        "label": "Lição após realizar",
        "type": "textarea"
      }
    ],
    "description": "Revisão contextual, não aconselhamento clínico, jurídico ou financeiro automático.",
    "private": true
  },
  "checkout": {
    "label": "Checklist de saída",
    "group": "flow",
    "states": [
      "planning",
      "out",
      "returned",
      "archived"
    ],
    "fields": [
      {
        "key": "items",
        "label": "Itens de saída (um por linha)",
        "type": "textarea"
      },
      {
        "key": "returned_items",
        "label": "Itens que voltaram (um por linha)",
        "type": "textarea"
      },
      {
        "key": "notes",
        "label": "Exceções / deixados em outro lugar",
        "type": "textarea"
      },
      {
        "key": "when",
        "label": "Data",
        "type": "date"
      }
    ],
    "description": "Compara a lista de saída com o retorno. Não marca objeto como perdido por falta de confirmação.",
    "private": true
  },
  "approval": {
    "label": "Aprovação",
    "group": "flow",
    "states": [
      "draft",
      "pending",
      "approved",
      "rejected",
      "cancelled",
      "archived"
    ],
    "fields": [
      {
        "key": "recipient",
        "label": "Destinatário",
        "type": "text"
      },
      {
        "key": "channel",
        "label": "Canal",
        "type": "select",
        "options": [
          "whatsapp",
          "email",
          "slack",
          "other"
        ]
      },
      {
        "key": "sender",
        "label": "Conta remetente",
        "type": "text"
      },
      {
        "key": "proposed_text",
        "label": "Texto a revisar",
        "type": "textarea"
      },
      {
        "key": "approved_revision",
        "label": "Revisão aprovada",
        "type": "number"
      },
      {
        "key": "external_id",
        "label": "Protocolo externo (somente se realizado)",
        "type": "text"
      }
    ],
    "description": "Aprovar o rascunho não o envia. Revisão de conteúdo cancela a aprovação anterior.",
    "private": true
  },
  "automation": {
    "label": "Automação",
    "group": "flow",
    "states": [
      "planned",
      "paused",
      "archived"
    ],
    "fields": [
      {
        "key": "provider",
        "label": "Serviço necessário",
        "type": "text"
      },
      {
        "key": "trigger",
        "label": "Gatilho desejado",
        "type": "text"
      },
      {
        "key": "action",
        "label": "Ação desejada",
        "type": "text"
      },
      {
        "key": "limitations",
        "label": "Condições / limites",
        "type": "textarea"
      }
    ],
    "description": "Especificação preservada. Não executa o serviço externo sem um conector implementado e autorizado."
  },
  "invoice": {
    "label": "Nota fiscal",
    "group": "flow",
    "states": [
      "draft",
      "issued_reported",
      "uploaded_reported",
      "cancelled",
      "archived"
    ],
    "fields": [
      {
        "key": "period",
        "label": "Competência (AAAA-MM)",
        "type": "text"
      },
      {
        "key": "amount",
        "label": "Valor validado (R$)",
        "type": "number"
      },
      {
        "key": "deadline",
        "label": "Prazo desejado",
        "type": "date"
      },
      {
        "key": "document_url",
        "label": "PDF já emitido",
        "type": "url"
      },
      {
        "key": "number",
        "label": "Número da nota",
        "type": "text"
      },
      {
        "key": "portal",
        "label": "Portal de envio",
        "type": "url"
      },
      {
        "key": "protocol",
        "label": "Protocolo de envio",
        "type": "text"
      }
    ],
    "description": "Acompanhamento local: emissão e envio ao portal são estados independentes, informados por você.",
    "private": true
  },
  "payment": {
    "label": "Pagamento",
    "group": "flow",
    "states": [
      "draft",
      "review",
      "paid_reported",
      "cancelled",
      "archived"
    ],
    "fields": [
      {
        "key": "payee",
        "label": "Beneficiário",
        "type": "text"
      },
      {
        "key": "amount",
        "label": "Valor (R$)",
        "type": "number"
      },
      {
        "key": "due_on",
        "label": "Vencimento",
        "type": "date"
      },
      {
        "key": "provider",
        "label": "Instituição pretendida",
        "type": "text"
      },
      {
        "key": "confirmation",
        "label": "Referência de confirmação (sem segredos)",
        "type": "text"
      }
    ],
    "description": "Não paga, não acessa banco e não guarda cartão/PIN. Preparação e confirmação manual apenas.",
    "private": true
  },
  "request": {
    "label": "Solicitação / demanda",
    "group": "flow",
    "states": ["new","active","waiting","completed","cancelled","archived"],
    "fields": [
      {"key":"from","label":"Origem / pessoa","type":"text"},
      {"key":"channel","label":"Canal","type":"select","options":["whatsapp","email","slack","other"]},
      {"key":"deadline","label":"Prazo","type":"date"},
      {"key":"next_step","label":"Próximo passo","type":"text"},
      {"key":"approval_required","label":"Exige aprovação antes de responder / executar","type":"checkbox"}
    ],
    "description": "Pedidos e demandas recebidas. Pode aparecer no Fluxo Ativo sem perder sua origem.",
    "private": true
  },
  "opportunity": {
    "label": "Oportunidade / candidatura",
    "group": "flow",
    "states": [
      "idea",
      "active",
      "waiting",
      "completed",
      "cancelled",
      "archived"
    ],
    "fields": [
      {
        "key": "organization",
        "label": "Organização",
        "type": "text"
      },
      {
        "key": "deadline",
        "label": "Prazo",
        "type": "date"
      },
      {
        "key": "url",
        "label": "Origem",
        "type": "url"
      },
      {
        "key": "next_step",
        "label": "Próximo passo",
        "type": "text"
      }
    ],
    "description": "Pipeline local de oportunidades e candidaturas; não envia candidatura.",
    "private": true
  },
  "user_page": {
    "label": "Página / espaço do usuário",
    "group": "user",
    "states": ["active","archived"],
    "fields": [
      {
        "key": "sort_order",
        "label": "Ordem na lista de páginas",
        "type": "number",
        "developerOnly": true
      },
      {
        "key": "template_id",
        "label": "Modelo de origem",
        "type": "text",
        "max": 80,
        "developerOnly": true
      },
      {"key":"icon","label":"Ícone / símbolo","type":"text"},
      {"key":"icon_mode","label":"Modo do ícone","type":"select","options":["default","emoji","icon","upload"]},
      {"key":"cover_type","label":"Tipo de capa","type":"select","options":["preset","attachment","color","gradient"]},
      {"key":"cover_value","label":"Valor da capa","type":"text"},
      {"key":"cover_attachment_id","label":"Anexo da capa","type":"text"},
      {"key":"cover_position","label":"Posição da capa (0 a 100)","type":"number"},
      {"key":"purpose","label":"Finalidade","type":"textarea"},
      {"key":"layout","label":"Modelo visual","type":"select","options":["list","board","gallery","notes"]},
      {"key":"suggested","label":"Criado a partir de sugestão da Sofia","type":"checkbox"},
      {"key":"parent_id","label":"Página pai","type":"text"},
      {"key":"node_type","label":"Tipo de nó","type":"select","options":["space","page"]},
      {"key":"blocks_json","label":"Conteúdo em blocos","type":"textarea","max":250000},
      {"key":"lock_json","label":"Conteúdo trancado (cifrado no navegador)","type":"textarea","max":400000,"developerOnly":true},
      {"key":"sidebar_sub","label":"Subatalho na barra lateral","type":"flag","developerOnly":true},
      {"key":"sidebar_color","label":"Cor do ponto na barra lateral","type":"text","max":20,"developerOnly":true},
      {"key":"sidebar_colors","label":"Cores dos pontos das notas na barra lateral","type":"colormap","developerOnly":true}
    ],
    "description": "Espaço ou página personalizável do usuário. Espaços raiz aparecem em Seus Espaços; páginas podem ficar aninhadas dentro deles.",
    "defaultPrivacy": "private"
  },
  "purchase_group": {
    "label": "Grupo de compras",
    "group": "user",
    "states": ["active","archived"],
    "fields": [
      {"key":"color","label":"Cor","type":"text"},{"key":"budget","label":"Orçamento (R$)","type":"number"},{"key":"keywords","label":"Palavras do grupo","type":"text"},{"key":"collection_id","label":"Lista","type":"text"},
      {"key":"description","label":"Descrição","type":"textarea"}
    ],
    "description": "Filtro definido pelo usuário dentro de Comprar. Excluir o grupo não deve apagar os itens: eles voltam para Sem grupo.",
    "defaultPrivacy": "private"
  },
  "list_collection": {
    "label": "Lista personalizada",
    "group": "user",
    "states": ["active","archived"],
    "fields": [
      {"key":"template","label":"Modelo","type":"select","options":["market","shopping","simple"]},{"key":"system","label":"Lista do app","type":"select","options":["market","shopping"]},{"key":"history_json","label":"Histórico (JSON)","type":"textarea","max":300000},{"key":"remind_at","label":"Lembrar de ir","type":"datetime"},{"key":"remind_agenda","label":"Também na Agenda","type":"checkbox"},{"key":"remind_ref","label":"Lembrete ligado (IDs)","type":"text"},{"key":"position","label":"Posição","type":"number"},
      {"key":"description","label":"Descrição","type":"textarea"},
      {"key":"icon","label":"Ícone / símbolo","type":"text"}
    ],
    "description": "Lista criada pelo usuário. Mercado e Farmácia continuam listas próprias e não são fundidas aqui.",
    "defaultPrivacy": "private"
  },
  "list_item": {
    "label": "Item de lista personalizada",
    "group": "user",
    "states": ["needed","done","unavailable","cancelled","archived"],
    "fields": [
      {"key":"unit","label":"Unidade","type":"text"},{"key":"price","label":"Preço total (R$)","type":"number"},{"key":"section","label":"Seção","type":"text"},{"key":"in_cart","label":"No carrinho / feito","type":"checkbox"},{"key":"group_id","label":"Grupo","type":"text"},{"key":"url","label":"Link","type":"url"},{"key":"store","label":"Loja","type":"text"},
      {"key":"collection_id","label":"Lista (ID obrigatório)","type":"text"},
      {"key":"quantity","label":"Quantidade / unidade","type":"text"},
      {"key":"notes","label":"Observações","type":"textarea"}
    ],
    "description": "Item de uma lista personalizada do usuário.",
    "defaultPrivacy": "private"
  },
  "course": {
    "label": "Curso",
    "group": "study",
    "defaultPrivacy": "shared",
    "states": [
      "interest",
      "acquired",
      "learning",
      "paused",
      "completed",
      "archived"
    ],
    "fields": [
      {
        "key": "mode",
        "label": "Tipo",
        "type": "select",
        "options": [
          "sofia",
          "external"
        ]
      },
      {
        "key": "author",
        "label": "Autor / plataforma",
        "type": "text"
      },
      {
        "key": "url",
        "label": "Link do curso ou acervo",
        "type": "url"
      },
      {
        "key": "level",
        "label": "Nível informado",
        "type": "text"
      },
      {
        "key": "goals",
        "label": "Objetivos",
        "type": "textarea"
      },
      {
        "key": "progress",
        "label": "Progresso informado (%)",
        "type": "number"
      },
      {
        "key": "next_step",
        "label": "Próximo passo",
        "type": "text"
      }
    ],
    "description": "Interesse/aquisição e aprendizado são distintos. A mesma Sofia pode atuar como professora; sem avaliação de nível inventada."
  },
  "lesson": {
    "label": "Aula / sessão de estudo",
    "group": "study",
    "defaultPrivacy": "shared",
    "states": [
      "active",
      "paused",
      "completed",
      "archived"
    ],
    "fields": [
      {
        "key": "course_id",
        "label": "Curso (ID obrigatório)",
        "type": "text"
      },
      {
        "key": "when",
        "label": "Data da aula",
        "type": "date"
      },
      {
        "key": "topics",
        "label": "Conteúdo trabalhado",
        "type": "textarea"
      },
      {
        "key": "exercises",
        "label": "Exercícios",
        "type": "textarea"
      },
      {
        "key": "difficulties",
        "label": "Dificuldades relatadas",
        "type": "textarea"
      },
      {
        "key": "progress",
        "label": "Progresso / feedback",
        "type": "textarea"
      },
      {
        "key": "next_step",
        "label": "Retomar por aqui",
        "type": "text"
      },
      {
        "key": "conversation_id",
        "label": "Conversa associada (ID)",
        "type": "text"
      }
    ],
    "description": "Bruto na conversa, registro de aula, progresso e checkpoint por curso."
  },
  "study_progress": {
    "label": "Acompanhamento de progresso",
    "group": "study",
    "defaultPrivacy": "shared",
    "states": ["active","paused","completed","archived"],
    "fields": [
      {"key":"course_id","label":"Curso (ID obrigatório)","type":"text"},
      {"key":"observed_on","label":"Data da observação","type":"date"},
      {"key":"skill","label":"Habilidade / aspecto observado","type":"text"},
      {"key":"level","label":"Nível percebido / informado","type":"text"},
      {"key":"progress","label":"Progresso informado (%)","type":"number"},
      {"key":"strengths","label":"Pontos fortes percebidos","type":"textarea"},
      {"key":"difficulties","label":"Dificuldades percebidas","type":"textarea"},
      {"key":"evidence","label":"Evidência / exemplo","type":"textarea"},
      {"key":"next_step","label":"Próximo foco","type":"text"}
    ],
    "description": "Histórico de progresso por curso. Registra observações e feedback; não inventa nível, nota ou diagnóstico de aprendizado."
  },
  "recipe": {
    "label": "Receita",
    "group": "library",
    "defaultPrivacy": "shared",
    "states": [
      "draft",
      "ready",
      "archived"
    ],
    "fields": [
      {"key":"cover_url","label":"Capa","type":"url"},{"key":"site","label":"Site","type":"text"},{"key":"links_json","label":"Ligações com o app","type":"textarea","max":4000},
      {
        "key": "author",
        "label": "Origem / autor informado",
        "type": "text"
      },
      {
        "key": "servings",
        "label": "Rendimento",
        "type": "number"
      },
      {
        "key": "ingredients",
        "label": "Ingredientes e quantidades (um por linha)",
        "type": "textarea"
      },
      {
        "key": "steps",
        "label": "Etapas",
        "type": "textarea"
      },
      {
        "key": "time",
        "label": "Tempo informado",
        "type": "text"
      },
      {
        "key": "temperature",
        "label": "Temperatura informada",
        "type": "text"
      },
      {
        "key": "tips",
        "label": "Dicas e variantes",
        "type": "textarea"
      },
      {
        "key": "source_url",
        "label": "Fonte",
        "type": "url"
      },
      {
        "key": "session_id",
        "label": "Sessão de origem (ID)",
        "type": "text"
      }
    ],
    "description": "Não inventa quantidades. Áudios originais podem ser anexados localmente; Drive ainda não está conectado."
  },
  "recipe_session": {
    "label": "Sessão de receita",
    "group": "library",
    "states": [
      "collecting",
      "questions",
      "completed",
      "archived"
    ],
    "fields": [
      {
        "key": "recipe_id",
        "label": "Receita destino (ID)",
        "type": "text"
      },
      {
        "key": "fragments",
        "label": "Áudios transcritos / fragmentos, em ordem",
        "type": "textarea"
      },
      {
        "key": "questions",
        "label": "Dúvidas a resolver",
        "type": "textarea"
      }
    ],
    "description": "Acumula fragmentos sem responder a cada um. “Terminei” encerra a coleta e abre as dúvidas."
  },
  "music": {
    "label": "Música / trilha",
    "group": "library",
    "defaultPrivacy": "shared",
    "states": [
      "saved",
      "archived"
    ],
    "fields": [
      {"key":"cover_url","label":"Capa","type":"url"},{"key":"site","label":"Site","type":"text"},{"key":"links_json","label":"Ligações com o app","type":"textarea","max":4000},
      {
        "key": "artist",
        "label": "Artista",
        "type": "text"
      },
      {
        "key": "url",
        "label": "Link",
        "type": "url"
      },
      {
        "key": "platform",
        "label": "Plataforma",
        "type": "text"
      },
      {
        "key": "sound_tags",
        "label": "Características sonoras informadas",
        "type": "text"
      },
      {
        "key": "license",
        "label": "Licença / direito de uso verificado",
        "type": "text"
      },
      {
        "key": "comments",
        "label": "Seu comentário",
        "type": "textarea"
      }
    ],
    "description": "Biblioteca única com labels Pessoal, AVSORD e Enjoy The Void. Link não comprova licença."
  },
  "film": {
    "label": "Filme",
    "group": "library",
    "defaultPrivacy": "shared",
    "states": [
      "to_watch",
      "watched",
      "archived"
    ],
    "fields": [
      {"key":"cover_url","label":"Capa","type":"url"},{"key":"site","label":"Site","type":"text"},{"key":"links_json","label":"Ligações com o app","type":"textarea","max":4000},
      {
        "key": "year",
        "label": "Ano",
        "type": "number"
      },
      {
        "key": "director",
        "label": "Direção",
        "type": "text"
      },
      {
        "key": "genre",
        "label": "Gênero informado",
        "type": "text"
      },
      {
        "key": "url",
        "label": "Referência",
        "type": "url"
      },
      {
        "key": "watched_on",
        "label": "Assistido em",
        "type": "date"
      },
      {
        "key": "raw_review",
        "label": "Sua opinião original",
        "type": "textarea"
      },
      {
        "key": "review",
        "label": "Crítica organizada",
        "type": "textarea"
      }
    ],
    "description": "Opinião pessoal separada de metadados e revisão editorial. Não presume que você assistiu."
  },
  "video": {
    "label": "Vídeo / assistir depois",
    "group": "library",
    "defaultPrivacy": "shared",
    "states": [
      "to_watch",
      "watched",
      "archived"
    ],
    "fields": [
      {"key":"cover_url","label":"Capa","type":"url"},{"key":"site","label":"Site","type":"text"},{"key":"links_json","label":"Ligações com o app","type":"textarea","max":4000},
      {
        "key": "url",
        "label": "Link",
        "type": "url"
      },
      {
        "key": "channel",
        "label": "Canal / autor",
        "type": "text"
      },
      {
        "key": "watched_on",
        "label": "Assistido em",
        "type": "date"
      },
      {
        "key": "review",
        "label": "Comentário",
        "type": "textarea"
      }
    ],
    "description": "Fila, histórico e referências por tema, sem alegar ter assistido ao vídeo."
  },
  "reading": {
    "label": "Livro / leitura",
    "group": "library",
    "defaultPrivacy": "shared",
    "states": [
      "interest",
      "acquired",
      "reading",
      "completed",
      "archived"
    ],
    "fields": [
      {"key":"cover_url","label":"Capa","type":"url"},{"key":"site","label":"Site","type":"text"},{"key":"links_json","label":"Ligações com o app","type":"textarea","max":4000},
      {
        "key": "author",
        "label": "Autor",
        "type": "text"
      },
      {
        "key": "url",
        "label": "Link",
        "type": "url"
      },
      {
        "key": "progress",
        "label": "Página / progresso informado",
        "type": "text"
      },
      {
        "key": "notes",
        "label": "Anotações",
        "type": "textarea"
      }
    ],
    "description": "Catálogo e progresso de leitura. Não presume posse nem leitura concluída."
  },
  "source": {
    "label": "Canal / fonte preferida",
    "group": "library",
    "defaultPrivacy": "shared",
    "states": [
      "saved",
      "archived"
    ],
    "fields": [
      {
        "key": "url",
        "label": "Link",
        "type": "url"
      },
      {
        "key": "platform",
        "label": "Plataforma",
        "type": "text"
      },
      {
        "key": "scope",
        "label": "Assuntos / escopo",
        "type": "text"
      },
      {
        "key": "monitoring",
        "label": "Desejo acompanhar novidades",
        "type": "checkbox"
      }
    ],
    "description": "Fonte preferida não significa aprovar tudo. Marcar interesse não inicia coleta automática."
  },
  "asset": {
    "label": "Referência / prompt / link",
    "group": "library",
    "defaultPrivacy": "shared",
    "states": [
      "saved",
      "archived"
    ],
    "fields": [
      {"key":"cover_url","label":"Capa","type":"url"},{"key":"site","label":"Site","type":"text"},{"key":"links_json","label":"Ligações com o app","type":"textarea","max":4000},
      {
        "key": "type",
        "label": "Tipo",
        "type": "select",
        "options": [
          "reference",
          "prompt",
          "professional-link",
          "other"
        ]
      },
      {
        "key": "url",
        "label": "Link",
        "type": "url"
      },
      {
        "key": "description",
        "label": "Descrição informada",
        "type": "textarea"
      }
    ],
    "description": "Materiais relacionados a projetos, sem mover sua origem automaticamente."
  },
  "file": {
    "label": "Arquivo / referência de storage",
    "group": "library",
    "states": [
      "saved",
      "archived"
    ],
    "fields": [
      {
        "key": "url",
        "label": "Link do original",
        "type": "url"
      },
      {
        "key": "provider",
        "label": "Origem",
        "type": "select",
        "options": [
          "local",
          "drive",
          "other"
        ]
      },
      {
        "key": "account",
        "label": "Conta / alias",
        "type": "text"
      },
      {
        "key": "file_id",
        "label": "ID externo",
        "type": "text"
      },
      {
        "key": "logical_path",
        "label": "Caminho lógico",
        "type": "text"
      },
      {
        "key": "description",
        "label": "Descrição",
        "type": "textarea"
      }
    ],
    "description": "Originais podem ser anexados localmente. Referências de Drive não equivalem a upload ou sincronização."
  },
  "contact": {
    "label": "Contato / permissão",
    "group": "connection",
    "states": [
      "active",
      "archived"
    ],
    "fields": [
      {
        "key": "phone",
        "label": "Telefone",
        "type": "text"
      },
      {
        "key": "email",
        "label": "E-mail",
        "type": "text"
      },
      {
        "key": "permission",
        "label": "Leitura",
        "type": "select",
        "options": [
          "blocked",
          "allowed"
        ]
      },
      {
        "key": "share_location",
        "label": "Autorizado a pedir localização",
        "type": "checkbox"
      },
      {
        "key": "priority",
        "label": "Contato prioritário",
        "type": "checkbox"
      },
      {
        "key": "scope",
        "label": "Escopos de pré-aprovação",
        "type": "textarea"
      }
    ],
    "description": "Dois grupos: liberado e bloqueado. Permissão aqui é local, não altera o app WhatsApp.",
    "private": true
  },
  "idea": {
    "label": "Ideia",
    "group": "knowledge",
    "states": [
      "idea",
      "active",
      "archived"
    ],
    "fields": [
      {
        "key": "why",
        "label": "Por que importa",
        "type": "text"
      },
      {
        "key": "next_step",
        "label": "Próximo passo",
        "type": "text"
      }
    ],
    "description": "Ideias são diferentes de anotações. Evoluem no mesmo registro com versões."
  },
  "note_tag": {
    "label": "Etiqueta de nota",
    "group": "user",
    "states": ["active","archived"],
    "fields": [
      {"key":"color","label":"Cor","type":"text"},
      {"key":"lock_json","label":"Proteção por senha (sal e teste cifrado)","type":"textarea","max":4000}
    ],
    "description": "Etiqueta criada pela pessoa em Notas (nome, cor e, se quiser, senha). A senha nunca vem para o servidor.",
    "defaultPrivacy": "private"
  },
  "library_item": {
    "label": "Item da Biblioteca",
    "group": "library",
    "states": ["saved","archived"],
    "fields": [
      {"key":"type","label":"Tipo","type":"text"},
      {"key":"status","label":"Status","type":"text"},
      {"key":"status_on","label":"Data do status","type":"date"},
      {"key":"rating","label":"Nota","type":"number"},
      {"key":"year","label":"Ano","type":"number"},
      {"key":"creator","label":"Autor / direção / canal","type":"text"},
      {"key":"url","label":"Link","type":"url"},
      {"key":"site","label":"Site","type":"text"},
      {"key":"cover_url","label":"Capa","type":"url"},
      {"key":"file_id","label":"Arquivo (anexo)","type":"text"},
      {"key":"file_name","label":"Nome do arquivo","type":"text"},
      {"key":"file_mime","label":"Tipo do arquivo","type":"text"},
      {"key":"file_error","label":"Envio pendente","type":"text"},
      {"key":"extra_json","label":"Campos do tipo","type":"textarea","max":8000},
      {"key":"links_json","label":"Ligações com o app","type":"textarea","max":4000}
    ],
    "description": "Item genérico da Biblioteca (filme, série, livro, receita, produto, lugar, artigo, curso, documento ou tipo criado pela pessoa). O tipo define status e campos.",
    "defaultPrivacy": "private"
  },
  "library_type": {
    "label": "Tipo da Biblioteca",
    "group": "user",
    "states": ["active","archived"],
    "fields": [
      {"key":"builtin","label":"Tipo pronto","type":"text"},
      {"key":"icon","label":"Ícone","type":"text"},
      {"key":"model","label":"Modelo","type":"text"},
      {"key":"config_json","label":"Configuração (status, nota, campos)","type":"textarea","max":8000},
      {"key":"position","label":"Posição","type":"number"},
      {"key":"pinned","label":"Fixo","type":"checkbox"},
      {"key":"in_more","label":"No Mais (celular)","type":"checkbox"}
    ],
    "description": "Tipo da Biblioteca criado ou ajustado pela pessoa (nome, ícone, status, nota e campos).",
    "defaultPrivacy": "private"
  },
  "annotation": {
    "label": "Anotação",
    "group": "knowledge",
    "states": [
      "saved",
      "archived"
    ],
    "fields": [
      {"key":"pinned","label":"Fixada","type":"checkbox"},{"key":"lock_tag","label":"Etiqueta protegida","type":"text"},{"key":"enc_json","label":"Conteúdo protegido (cifrado)","type":"textarea","max":200000},
      {
        "key": "context",
        "label": "Contexto",
        "type": "text"
      }
    ],
    "description": "Anotação com área e origem; não é decisão confirmada automaticamente."
  },
  "lesson_learned": {
    "label": "Lição / aprendizado",
    "group": "knowledge",
    "states": [
      "saved",
      "archived"
    ],
    "fields": [
      {
        "key": "situation",
        "label": "Situação",
        "type": "text"
      },
      {
        "key": "consequence",
        "label": "Consequência relatada",
        "type": "text"
      },
      {
        "key": "principle",
        "label": "Princípio sugerido",
        "type": "text"
      },
      {
        "key": "limits",
        "label": "Limites / onde não se aplica",
        "type": "text"
      }
    ],
    "description": "Aprendizado revisável: um caso não vira regra universal."
  },
  "fin_account": {
    "label": "Conta (Finanças)",
    "group": "finance",
    "defaultPrivacy": "private",
    "states": [
      "active",
      "archived"
    ],
    "fields": [
      {
        "key": "month_starts_json",
        "label": "Saldo no início de cada mês",
        "type": "textarea",
        "max": 6000,
        "developerOnly": true
      },
      {
        "key": "spend_caps_json",
        "label": "Teto de gastos de cada mês",
        "type": "textarea",
        "max": 4000,
        "developerOnly": true
      },
      {
        "key": "balance_set_at",
        "label": "Saldo acertado com o banco em",
        "type": "date",
        "developerOnly": true
      },
      {
        "key": "report_start",
        "label": "Relatórios a partir de",
        "type": "date"
      },
      {
        "key": "cycle_day",
        "label": "Dia em que recebe (início do ciclo)",
        "type": "number"
      },
      {
        "key": "account_type",
        "label": "Tipo",
        "type": "select",
        "options": [
          "corrente",
          "poupanca",
          "carteira",
          "investimento",
          "outro"
        ]
      },
      {
        "key": "initial_balance",
        "label": "Saldo inicial",
        "type": "text",
        "max": 20
      },
      {
        "key": "color",
        "label": "Cor",
        "type": "text",
        "max": 20
      },
      {
        "key": "include_total",
        "label": "Somar no saldo geral",
        "type": "checkbox"
      }
    ],
    "description": "Conta bancária, carteira ou investimento. O saldo é calculado a partir dos lançamentos pagos; nada é estimado."
  },
  "fin_card": {
    "label": "Cartão de crédito",
    "group": "finance",
    "defaultPrivacy": "private",
    "states": [
      "active",
      "archived"
    ],
    "fields": [
      {
        "key": "limit",
        "label": "Limite",
        "type": "number"
      },
      {
        "key": "closing_day",
        "label": "Dia de fechamento",
        "type": "number"
      },
      {
        "key": "due_day",
        "label": "Dia de vencimento",
        "type": "number"
      },
      {
        "key": "color",
        "label": "Cor",
        "type": "text",
        "max": 20
      },
      {
        "key": "account_id",
        "label": "Conta que paga a fatura",
        "type": "text",
        "max": 80
      }
    ],
    "description": "Fatura calculada pelas compras e pelo dia de fechamento."
  },
  "fin_tx": {
    "label": "Lançamento",
    "group": "finance",
    "defaultPrivacy": "private",
    "states": [
      "active",
      "archived"
    ],
    "fields": [
      {
        "key": "time",
        "label": "Horário",
        "type": "text",
        "max": 5
      },
      {
        "key": "reserve_part",
        "label": "Parte desta receita que foi para o guardado",
        "type": "number",
        "developerOnly": true
      },
      {
        "key": "remind_days",
        "label": "Avisar dias antes",
        "type": "number"
      },
      {
        "key": "kind",
        "label": "Tipo",
        "type": "select",
        "options": [
          "expense",
          "income",
          "transfer",
          "card_payment"
        ]
      },
      {
        "key": "amount",
        "label": "Valor",
        "type": "number"
      },
      {
        "key": "date",
        "label": "Data",
        "type": "date"
      },
      {
        "key": "category",
        "label": "Categoria",
        "type": "text",
        "max": 60
      },
      {
        "key": "account_id",
        "label": "Conta",
        "type": "text",
        "max": 80
      },
      {
        "key": "to_account_id",
        "label": "Conta de destino",
        "type": "text",
        "max": 80
      },
      {
        "key": "card_id",
        "label": "Cartão",
        "type": "text",
        "max": 80
      },
      {
        "key": "invoice_month",
        "label": "Fatura (AAAA-MM)",
        "type": "text",
        "max": 7
      },
      {
        "key": "paid",
        "label": "Pago / recebido",
        "type": "checkbox"
      },
      {
        "key": "series_id",
        "label": "Série",
        "type": "text",
        "max": 80
      },
      {
        "key": "installment",
        "label": "Parcela",
        "type": "number"
      },
      {
        "key": "installments",
        "label": "Total de parcelas",
        "type": "number"
      },
      {
        "key": "recurrence",
        "label": "Repetir",
        "type": "select",
        "options": [
          "none",
          "monthly",
          "weekly",
          "yearly"
        ]
      },
      {
        "key": "recurrence_end",
        "label": "Repetir até (AAAA-MM)",
        "type": "text",
        "max": 7
      },
        {
          "key": "import_id",
          "label": "Identificador da importação (extrato)",
          "type": "text"
        },
        {
          "key": "no_balance",
          "label": "Não mexe no saldo",
          "type": "checkbox"
        }
    ],
    "description": "Despesa, receita, transferência ou pagamento de fatura."
  },
  "fin_budget": {
    "label": "Orçamento",
    "group": "finance",
    "defaultPrivacy": "private",
    "states": [
      "active",
      "archived"
    ],
    "fields": [
      {
        "key": "category",
        "label": "Categoria",
        "type": "text",
        "max": 60
      },
      {
        "key": "limit",
        "label": "Limite mensal",
        "type": "number"
      }
    ],
    "description": "Limite mensal de gastos por categoria."
  },
  "fin_refund": {
    "label": "Devolução a receber",
    "group": "finance",
    "defaultPrivacy": "private",
    "states": ["pending", "received", "archived"],
    "fields": [
      {"key": "amount", "label": "Valor", "type": "number"},
      {"key": "expected_date", "label": "Previsão", "type": "date"},
      {"key": "account_id", "label": "Conta", "type": "text", "max": 80},
      {"key": "received_at", "label": "Recebida em", "type": "date"},
      {"key": "tx_id", "label": "Lançamento da devolução", "type": "text", "max": 80},
      {"key": "expense_id", "label": "Despesa reembolsada", "type": "text", "max": 80}
    ]
  },
  "fin_goal": {
    "label": "Objetivo",
    "group": "finance",
    "defaultPrivacy": "private",
    "states": [
      "active",
      "completed",
      "archived"
    ],
    "fields": [
      {
        "key": "target",
        "label": "Valor do objetivo",
        "type": "number"
      },
      {
        "key": "saved",
        "label": "Já guardado",
        "type": "number"
      },
      {
        "key": "deadline",
        "label": "Prazo",
        "type": "date"
      },
      {
        "key": "color",
        "label": "Cor",
        "type": "text",
        "max": 20
      },
      {
        "key": "role",
        "label": "Papel",
        "type": "select",
        "options": [
          "goal",
          "reserve"
        ]
      },
      {
        "key": "monthly_plan",
        "label": "Aporte mensal planejado",
        "type": "number"
      },
      {
        "key": "account_id",
        "label": "Conta",
        "type": "text",
        "max": 80
      },
      {
        "key": "plan_day",
        "label": "Dia do aporte",
        "type": "number"
      },
      {
        "key": "plan_time",
        "label": "Hora do aporte (antigo, sem uso)",
        "type": "text",
        "max": 5,
        "developerOnly": true
      },
      {
        "key": "remind_before_days",
        "label": "Lembrar dias antes",
        "type": "number"
      },
      {
        "key": "remind_time",
        "label": "Hora do aviso",
        "type": "text",
        "max": 5
      },
      {
        "key": "remind_repeat_days",
        "label": "Repetir a cada (dias) até aportar",
        "type": "number"
      }
    ],
    "description": "Meta de economia com acompanhamento do quanto falta. Com papel 'reserve', é o Dinheiro guardado (valor separado para preservar)."
  },
  "fin_statement": {
    "label": "Extrato do banco",
    "group": "finance",
    "defaultPrivacy": "private",
    "states": ["active", "archived"],
    "fields": [
      {"key": "account_id", "label": "Conta", "type": "text", "max": 80},
      {"key": "from", "label": "De", "type": "date"},
      {"key": "to", "label": "Até", "type": "date"},
      {"key": "closing_balance", "label": "Saldo no banco no fim do extrato", "type": "number"},
      {"key": "lines_json", "label": "Linhas do extrato", "type": "textarea", "max": 250000}
    ]
  },
  "fin_reserve_move": {
    "label": "Movimento da reserva",
    "group": "finance",
    "defaultPrivacy": "private",
    "states": [
      "active",
      "archived"
    ],
    "fields": [
      {
        "key": "income_id",
        "label": "Receita de onde veio",
        "type": "text",
        "max": 80,
        "developerOnly": true
      },
      {
        "key": "goal_id",
        "label": "Reserva",
        "type": "text",
        "max": 80
      },
      {
        "key": "direction",
        "label": "Sentido",
        "type": "select",
        "options": [
          "in",
          "out"
        ]
      },
      {
        "key": "amount",
        "label": "Valor",
        "type": "number"
      },
      {
        "key": "date",
        "label": "Data",
        "type": "date"
      },
      {
        "key": "note",
        "label": "Observação",
        "type": "text",
        "max": 200
      },
      {
        "key": "planned",
        "label": "Retirada planejada (não precisa recompor)",
        "type": "checkbox"
      }
    ],
    "description": "Guardar ou retirar dinheiro da reserva: muda o destino do dinheiro, não é receita nem despesa e não altera o saldo das contas."
  },
  "mail_account": {
    "label": "Conta de e-mail",
    "group": "mail",
    "defaultPrivacy": "private",
    "states": [
      "active",
      "paused",
      "archived"
    ],
    "fields": [
      {
        "key": "provider",
        "label": "Provedor",
        "type": "select",
        "options": [
          "gmail",
          "outlook",
          "yahoo",
          "icloud",
          "imap",
          "gmail_google"
        ]
      },
      {
        "key": "address",
        "label": "E-mail",
        "type": "text",
        "max": 200
      },
      {
        "key": "group",
        "label": "Grupo",
        "type": "text",
        "max": 60
      },
      {
        "key": "host",
        "label": "Servidor IMAP",
        "type": "text",
        "max": 200
      },
      {
        "key": "port",
        "label": "Porta",
        "type": "number"
      },
      {
        "key": "secret_set",
        "label": "Senha de app salva",
        "type": "checkbox",
        "developerOnly": true
      },
      {
        "key": "last_uid",
        "label": "Última mensagem lida",
        "type": "number",
        "developerOnly": true
      },
      {
        "key": "uid_validity",
        "label": "Validade da caixa",
        "type": "text",
        "max": 40,
        "developerOnly": true
      },
      {
        "key": "last_check",
        "label": "Última verificação",
        "type": "text",
        "max": 40,
        "developerOnly": true
      },
      {
        "key": "last_error",
        "label": "Último erro",
        "type": "text",
        "max": 300,
        "developerOnly": true
      }
    ],
    "description": "Caixa de entrada vigiada por IMAP com senha de app. A senha fica criptografada fora dos registros."
  },
  "mail_rule": {
    "label": "Regra de e-mail",
    "group": "mail",
    "defaultPrivacy": "private",
    "states": [
      "active",
      "paused",
      "archived"
    ],
    "fields": [
      {
        "key": "field",
        "label": "Onde procurar",
        "type": "select",
        "options": [
          "any",
          "from",
          "subject",
          "body"
        ]
      },
      {
        "key": "contains",
        "label": "Contém (vírgula separa opções)",
        "type": "text",
        "max": 400
      },
      {
        "key": "account_id",
        "label": "Só nesta conta",
        "type": "text",
        "max": 80
      },
      {
        "key": "notify",
        "label": "Avisar no celular",
        "type": "checkbox"
      },
      {
        "key": "important",
        "label": "Marcar como importante",
        "type": "checkbox"
      },
      {
        "key": "emoji",
        "label": "Emoji",
        "type": "text",
        "max": 16
      }
    ],
    "description": "Quando um e-mail novo bate com a regra, a Sofia guarda e avisa."
  },
  "package": {
    "label": "Encomenda",
    "group": "flow",
    "defaultPrivacy": "private",
    "states": ["active", "delivered", "archived"],
    "fields": [
      {"key":"fee_amount","label":"Imposto (R$)","type":"number"},{"key":"fee_paid","label":"Imposto pago","type":"checkbox"},{"key":"fee_tx","label":"Lançamento do imposto","type":"text"},{"key":"pickup_reminder","label":"Lembrete de retirada","type":"text"},{"key":"source_mail","label":"E-mail de origem","type":"text"},
      { "key": "code", "label": "Código de rastreio", "type": "text", "max": 40 },
      { "key": "carrier", "label": "Transportadora", "type": "text", "max": 40 },
      { "key": "status", "label": "Último status", "type": "text", "max": 160 },
      { "key": "last_event_at", "label": "Último evento em", "type": "text", "max": 40 },
      { "key": "events", "label": "Linha do tempo", "type": "textarea", "max": 8000 },
      { "key": "checked_at", "label": "Consultado em", "type": "text", "max": 40 },
      { "key": "error", "label": "Motivo da falha", "type": "text", "max": 160 },
      { "key": "blocked_until", "label": "Consulta pausada até", "type": "text", "max": 40 },
      { "key": "ok_at", "label": "Última atualização com sucesso", "type": "text", "max": 40 },
      { "key": "note", "label": "Observação", "type": "text", "max": 300 },
      { "key": "ship24_tracker_id", "label": "Rastreio na Ship24", "type": "text", "max": 80 },
      { "key": "milestone", "label": "Etapa", "type": "text", "max": 40 },
      { "key": "milestone_label", "label": "Etapa (texto)", "type": "text", "max": 80 },
      { "key": "fee", "label": "Taxa a pagar", "type": "checkbox" },
      { "key": "estimated", "label": "Previsão de entrega", "type": "text", "max": 40 }
    ]
  },
  "mail_hit": {
    "label": "E-mail encontrado",
    "group": "mail",
    "defaultPrivacy": "private",
    "states": [
      "new",
      "read",
      "archived"
    ],
    "fields": [
      {
        "key": "from_name",
        "label": "De (nome)",
        "type": "text",
        "max": 160
      },
      {
        "key": "from_addr",
        "label": "De (e-mail)",
        "type": "text",
        "max": 200
      },
      {
        "key": "snippet",
        "label": "Trecho",
        "type": "textarea",
        "max": 400
      },
      {
        "key": "received_at",
        "label": "Recebido em",
        "type": "text",
        "max": 40
      },
      {
        "key": "account_id",
        "label": "Conta",
        "type": "text",
        "max": 80
      },
      {
        "key": "rule_id",
        "label": "Regra",
        "type": "text",
        "max": 80
      },
      {
        "key": "rule_names",
        "label": "Regras",
        "type": "text",
        "max": 300
      },
      {
        "key": "message_key",
        "label": "Mensagem",
        "type": "text",
        "max": 200,
        "developerOnly": true
      },
      {
        "key": "important",
        "label": "Importante",
        "type": "checkbox"
      },
      {
        "key": "emoji",
        "label": "Emoji",
        "type": "text",
        "max": 16
      }
    ],
    "description": "Mensagem que bateu com uma regra. Só cabeçalho e trecho curto; o e-mail continua no provedor."
  }
};
module.exports={CATALOG};
