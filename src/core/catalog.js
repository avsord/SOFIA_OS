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
        "key": "remind_at",
        "label": "Quando lembrar",
        "type": "datetime"
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
          "json"
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
      }
    ],
    "description": "Observações reais e notificações locais. Sem feed autorizado: coleta manual, nunca fingir monitoramento ativo."
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
      {"key":"icon","label":"Ícone / símbolo","type":"text"},
      {"key":"icon_mode","label":"Modo do ícone","type":"select","options":["default","emoji","icon","upload"]},
      {"key":"cover_type","label":"Tipo de capa","type":"select","options":["preset","attachment","color","gradient"]},
      {"key":"cover_value","label":"Valor da capa","type":"text"},
      {"key":"cover_attachment_id","label":"Anexo da capa","type":"text"},
      {"key":"purpose","label":"Finalidade","type":"textarea"},
      {"key":"layout","label":"Modelo visual","type":"select","options":["list","board","gallery","notes"]},
      {"key":"suggested","label":"Criado a partir de sugestão da Sofia","type":"checkbox"},
      {"key":"parent_id","label":"Página pai","type":"text"},
      {"key":"node_type","label":"Tipo de nó","type":"select","options":["space","page"]},
      {"key":"blocks_json","label":"Conteúdo em blocos","type":"textarea","max":250000}
    ],
    "description": "Espaço ou página personalizável do usuário. Espaços raiz aparecem em Seus Espaços; páginas podem ficar aninhadas dentro deles.",
    "defaultPrivacy": "private"
  },
  "purchase_group": {
    "label": "Grupo de compras",
    "group": "user",
    "states": ["active","archived"],
    "fields": [
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
  "annotation": {
    "label": "Anotação",
    "group": "knowledge",
    "states": [
      "saved",
      "archived"
    ],
    "fields": [
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
  }
};
module.exports={CATALOG};
