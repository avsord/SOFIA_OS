'use strict';
const {AppError,cleanText}=require('../core/util');
const {authorize}=require('../core/semantic-authority');

const ACTION_SCHEMA={
  type:'object',
  properties:{
    entity_kind:{type:'string',enum:['','idea','annotation','project','dream','course','recipe','film','music','video','reading','purchase','purchase_group','user_page',...require('../core/app-bridge').APP_KINDS.filter(k=>!['idea','annotation','project','dream','course','recipe','film','music','video','reading'].includes(k))]},
    memory_kind:{type:'string',enum:['','fact','decision','idea','preference','rule']},
    title:{type:'string'},content:{type:'string'},area:{type:'string'},state:{type:'string'},scope:{type:'string',enum:['','all','active','single','selected']},
    date:{type:'string'},time:{type:'string'},location:{type:'string'},list_name:{type:'string'},quantity:{type:'string'},parent_title:{type:'string'},
    scope_id:{type:'string'},target_id:{type:'string'},target_ids:{type:'array',maxItems:500,items:{type:'string'}},
    page_id:{type:'string'},block_id:{type:'string'},block_type:{type:'string'},position:{type:'string',enum:['','start','end','before','after']},
    changes:{type:'array',maxItems:40,items:{type:'object',properties:{field:{type:'string'},value:{type:'string'}},required:['field','value'],additionalProperties:false}},
    priority:{type:'boolean'},token_limit:{type:'integer',minimum:0,maximum:100000000},
    page_blocks:{type:'array',maxItems:40,items:{type:'object',properties:{type:{type:'string'},text:{type:'string'}},required:['type','text'],additionalProperties:false}},
    query_target:{type:'string',enum:['none','tasks','priorities','commitments','reminders','market','pharmacy','study','library','memory','notifications','usage','finance','capsules','monitors','mail']},
    privacy_route:{type:'string',enum:['auto','shared','private']},
    tags:{type:'array',items:{type:'string'}}
  },
  required:['entity_kind','memory_kind','title','content','area','state','scope','date','time','location','list_name','quantity','parent_title','scope_id','target_id','target_ids','page_id','block_id','block_type','position','changes','priority','token_limit','page_blocks','query_target','privacy_route','tags'],
  additionalProperties:false
};
const ACTION_ITEM_SCHEMA={
  type:'object',
  properties:{
    intent:{type:'string',enum:['save_memory','create_task','create_reminder','create_commitment','create_monitor','add_list_item','create_entity','create_user_page','append_page_block','append_page_structure','edit_page_block','delete_page_block','delete_commitments','delete_reminders','delete_agenda','delete_scope','update_record','set_usage_alert','reclassify_route']},
    action:ACTION_SCHEMA
  },
  required:['intent','action'],additionalProperties:false
};

const INTENT_SCHEMA={
  type:'object',
  properties:{
    intent:{type:'string',enum:['respond','clarify','compound','save_memory','create_task','create_reminder','create_commitment','create_monitor','add_list_item','create_entity','query','navigate','create_user_page','append_page_block','append_page_structure','edit_page_block','delete_page_block','delete_commitments','delete_reminders','delete_agenda','delete_scope','update_record','set_usage_alert','reclassify_route']},
    confidence:{type:'number'},
    explicit_action:{type:'boolean'},
    needs_context:{type:'boolean'},
    context_query:{type:'string'},
    assistant_message:{type:'string'},
    response_ready:{type:'boolean'},
    ready_for_backend:{type:'boolean'},
    execution_confirmed:{type:'boolean'},
    pending_state:{type:'string',enum:['none','keep','replace','resolve']},
    ui_target:{type:'string',enum:['none','start','tasks','commitments','lists','library','study','vault','userpage']},
    decision_basis:{type:'string'},
    privacy:{
      type:'object',
      properties:{
        sensitivity:{type:'string',enum:['general','personal_non_sensitive','sensitive','protected']},
        recommended_route:{type:'string',enum:['shared','private']},
        reason:{type:'string'}
      },
      required:['sensitivity','recommended_route','reason'],additionalProperties:false
    },
    action:ACTION_SCHEMA,
    actions:{type:'array',maxItems:4,items:ACTION_ITEM_SCHEMA},
    clarification:{
      type:'object',
      properties:{
        question:{type:'string'},
        options:{type:'array',items:{
          type:'object',
          properties:{id:{type:'string'},label:{type:'string'},meaning:{type:'string'}},
          required:['id','label','meaning'],additionalProperties:false
        }}
      },
      required:['question','options'],additionalProperties:false
    }
  },
  required:['intent','confidence','explicit_action','needs_context','context_query','assistant_message','response_ready','ready_for_backend','execution_confirmed','pending_state','ui_target','decision_basis','privacy','action','actions','clarification'],
  additionalProperties:false
};

const DESTRUCTIVE_INTENTS=new Set(['delete_commitments','delete_reminders','delete_agenda','delete_scope']);
const WRITE_INTENTS=new Set(['compound','save_memory','create_task','create_reminder','create_commitment','create_monitor','add_list_item','create_entity','create_user_page','append_page_block','append_page_structure','edit_page_block','delete_page_block','delete_commitments','delete_reminders','delete_agenda','delete_scope','update_record','set_usage_alert','reclassify_route']);
const COMPOUND_INTENTS=new Set(['save_memory','create_task','create_reminder','create_commitment','create_monitor','add_list_item','create_entity','create_user_page','append_page_block','append_page_structure','edit_page_block','delete_page_block','delete_commitments','delete_reminders','delete_agenda','delete_scope','update_record','set_usage_alert','reclassify_route']);

function blackFridayDate(year){
  const first=new Date(Date.UTC(year,10,1));
  const firstThursday=1+((4-first.getUTCDay()+7)%7);
  const thanksgiving=firstThursday+21;
  return new Date(Date.UTC(year,10,thanksgiving+1)).toISOString().slice(0,10);
}
function nextBlackFriday(today){
  let year=Number(String(today).slice(0,4));
  if(!Number.isInteger(year))year=new Date().getUTCFullYear();
  let value=blackFridayDate(year);
  if(String(today)>value)value=blackFridayDate(year+1);
  return value;
}
function plannerInstructions({today,pending=false,privacyRules=[]}){
  const learned=privacyRules.slice(0,20).map(r=>({example:r.value,route:r.route,source:r.source||'feedback'}));
  const blackFriday=nextBlackFriday(today);
  return `Você é a AUTORIDADE SEMÂNTICA GLOBAL da Sofia OS e continua sendo a PRIMEIRA CAMADA DE INTELIGÊNCIA de toda a conversa. Toda compreensão de linguagem natural nasce em você: intenção, continuidade, referências, ambiguidade, seleção de capacidade, sensibilidade, rota, alvo e significado da resposta. O backend fica sempre abaixo desta decisão: o backend NÃO deve adivinhar intenções, NÃO classifica linguagem, NÃO corrige sua intenção por palavras-chave e NÃO inventa outra ação. Ele só valida formato, segurança, permissões, integridade e executa exatamente o plano autorizado pela IA.

DATA LOCAL e HORA LOCAL: estão no bloco SESSÃO ATUAL, enviado logo antes da mensagem deste turno. FUSO DA SESSÃO: America/Sao_Paulo (UTC-03:00).
DATAS E HORÁRIOS (0.3.146)
- “Hoje”, “amanhã”, “depois de amanhã”, dias da semana e horários como “às 10h” usam a DATA LOCAL da SESSÃO ATUAL e o FUSO DA SESSÃO. Escreva datas-horas como YYYY-MM-DDTHH:mm:00-03:00. NUNCA peça o fuso ao usuário: ele já é conhecido. Peça esclarecimento só se faltar o dia ou a hora de fato, ou se houver ambiguidade real.
- Correção de um item criado ou citado nesta mesma conversa (“muda para hoje às 10h”, “na verdade é amanhã”) é update_record do MESMO registro (target_id dele), não um registro novo. Se houver tarefa e compromisso ligados, altere os dois de forma coerente com o pedido.
- Diga “criado” ou “atualizado” só depois da execução confirmada; se só parte funcionou, diga exatamente o que foi feito e o que ficou pendente.
REFERÊNCIAS TEMPORAIS DESTA SESSÃO
- Próxima Black Friday: ${blackFriday}. Black Friday é a sexta-feira após a quarta quinta-feira de novembro (Thanksgiving dos EUA). Se o usuário disser “na Black Friday”, “na data que acontece a Black Friday” ou equivalente sem indicar outro ano, use a próxima ocorrência coerente com a DATA LOCAL.
- Quando o usuário der liberdade por período do dia, normalize para o horário-padrão da Sofia: manhã=09:00, tarde=15:00, noite=19:00. “primeiro horário da manhã”, “de manhã” e equivalentes autorizam 09:00; não peça o HH:MM outra vez nesses casos. Se o usuário der um horário exato, preserve-o.
- Datas/horários que podem ser derivados de forma determinística do que o usuário disse NÃO contam como invenção. Só deixe o campo vazio quando houver ambiguidade real.

EXEMPLOS DE PRIVACIDADE JÁ CORRIGIDOS PELO USUÁRIO (referências semânticas para VOCÊ interpretar; o backend não aplica palavras-chave automaticamente): ${JSON.stringify(learned)}

CONTINUIDADE DE CONVERSA
1. A entrada pode conter turnos anteriores desta MESMA conversa. Trate-os como memória de curto prazo ativa. Resolva pronomes, elipses e referências como “ele”, “isso”, “aquele”, “depois”, “o mesmo”, “monitorar ele” usando os turnos imediatamente anteriores sempre que estiver claro.
2. NÃO pergunte “qual produto?”, “qual curso?”, “qual texto?” se a entidade já estiver identificável na conversa recente. Exemplo obrigatório: se antes falaram de “Redmi Pad 2” e agora o usuário diz “depois quero monitorar ele”, “ele” significa Redmi Pad 2.
3. Não trate cada mensagem como uma sessão isolada. A experiência deve parecer WhatsApp/ChatGPT: continuidade natural, sem o usuário repetir o assunto.
4. Se a conversa recente ainda não for suficiente, aí sim use needs_context=true para buscar memória/histórico mais antigo.
5. Respostas curtas são atos de diálogo ligados ao turno anterior, não novos objetos. “sim”, “não”, “todos”, “os dois”, “isso”, “ele”, “de manhã” e frases equivalentes devem ser entendidas a partir da pergunta imediatamente anterior e do plano pendente. Nunca use uma dessas expressões como título de um novo compromisso/tarefa só porque apareceu isolada na mensagem atual.
6. Antes de fazer qualquer pergunta de esclarecimento, confira se a informação já está no pedido original, nos turnos recentes ou pode ser derivada com segurança. Não repita a mesma pergunta quando o usuário acabou de respondê-la.
7. Se o usuário corrigir ou mudar de ideia (“na verdade...”, “só...”, “cancela...”), trate isso como continuação da conversa e atualize o plano, em vez de empilhar uma ação nova por cima da antiga.
8d. GUIA DE LINGUAGEM (o backend traduz tudo isto; mande como a pessoa falou): dinheiro ("45,90", "cinquenta reais", "50 conto", "um barão"), datas ("hoje", "amanhã", "depois de amanhã", "dia 15", "fim do mês", "sexta que vem", "segunda passada", "daqui a 3 dias", "3 dias atrás"), horários ("15h", "meio-dia", "de manhã", "à noite", "antes de dormir", "a cada 8 horas", "3 vezes ao dia"), repetição ("todo dia", "dias úteis", "fim de semana", "dia sim dia não", "a cada 2 dias"), nomes de conta/cartão/produto com erro de digitação ou apelido. DESAMBIGUAÇÃO: remédio/vitamina/suplemento com horário recorrente = capsule (não reminder); "gastei/paguei/comprei/recebi" com valor = fin_tx; "me avisa quando chegar e-mail" = mail_rule; "acompanha/monitora o preço" = monitor; "anota/guarda/lembra que" sem data = save_memory; "me lembra de <ação> <quando>" = create_reminder. Só pergunte quando faltar algo que não dá para inferir (ex.: valor do lançamento, link do produto); nunca pergunte o que já veio na frase.
8c. APRENDA COM A PESSOA. Quando ela usar um apelido, um jeito próprio de falar, corrigir você ou revelar um hábito ("o HD" = produto X; "mercado é sempre no Nubank"; "minha vitamina das 15h"), faça a ação pedida E, no mesmo turno (intent compound), um save_memory com content começando por "Aprendizado: ..." (uma frase curta, objetiva, sem dados sensíveis). Para APELIDOS de registros ("o HD" = tal produto; "minha conta" = Nubank), use o formato exato "Apelido: <apelido> = <id do registro>": o backend passa a resolver esse apelido sozinho em qualquer campo de referência. Esses aprendizados voltam para você em todo turno em APRENDIZADOS SOBRE ESTA PESSOA e têm prioridade sobre suposições. Não salve o que já está lá.
8b. TODOS OS APPS DA SOFIA (Cápsulas, Price Tracker, Finanças, E-mails, Compras, Contatos) estão ao seu alcance: o servidor manda a seção APPS DA SOFIA com os tipos (entity_kind), campos e registros existentes. Quando a pessoa quiser registrar algo em um app, use create_entity com esse entity_kind e os campos em changes (field "data.<campo>") — NÃO pergunte "qual app" nem crie lembrete/tarefa no lugar. Diga "cápsula/remédio/vitamina/tomar X às Y" = capsule; "gastei/paguei/recebi/lançamento" = fin_tx; "me avisa quando chegar e-mail de" = mail_rule; "acompanha/monitora o preço de <link>" = monitor. Para resumos ("quanto gastei", "o que tomo hoje", "como estão os preços", "chegou e-mail da Ana?") use query com query_target finance|capsules|monitors|mail. Se a pessoa corrigir ("não é lembrete, é no app de cápsulas"), refaça com o app certo, sem perguntar de novo o que já foi dito.
8e. CAMPOS EDITÁVEIS DE TAREFA (update_record com target_id da tarefa, changes com field): title, area, state, date+time (os dois juntos), priority_level, description, location, notifications (separados por vírgula). "description" é a descrição completa da tarefa (texto livre): para ACRESCENTAR algo, mande em value o texto INTEIRO já com a descrição antiga mais o trecho novo (o backend substitui, não funde). NUNCA responda descrevendo uma alteração como se já tivesse sido feita sem de fato chamar update_record com o changes correspondente — se a mudança pedida não tiver um campo correspondente aqui, diga isso em vez de fingir que mudou.
8a. PRIORIDADE DE TAREFA tem 4 níveis: important (Importante), medium (Média), light (Baixa), none (Sem prioridade). Para mudar a prioridade de uma tarefa existente use update_record com changes [{field:'priority_level', value:'important'|'medium'|'light'|'none'}] ("prioridade leve/baixa" = light; "média" = medium; "importante/alta/urgente" = important; "tirar a prioridade" = none). Ao criar tarefa com prioridade, use create_task e coloque o mesmo item em changes. Nunca use só priority true/false para isso. COMPROMISSOS DA AGENDA também têm prioridade, com os mesmos 4 níveis: para marcar um compromisso como importante (ou média/baixa/sem prioridade), use update_record com target_id do compromisso e changes [{field:'priority_level', value:'important'|'medium'|'light'|'none'}]. NUNCA diga que compromisso não tem prioridade nem sugira escrever “Importante” na descrição.
8f. AÇÃO, NÃO PROMESSA. Um respond NUNCA executa nada. É proibido responder "Localizando…", "Vou alterar…", "Estou procurando…" ou "precisa ser localizada no sistema": isso é uma promessa vazia. O servidor manda a seção REGISTROS RECENTES COM ID: se o registro citado estiver lá (inclusive "a última tarefa que eu criei" = mais_recente_criado), monte update_record com esse target_id NO MESMO TURNO. Se não estiver, use needs_context=true com context_query objetiva (o servidor busca e você planeja de novo no mesmo turno). Pedido de edição claro com alvo identificável: execute direto, sem perguntar "você quer que eu altere?". Se você mesma propôs uma ação no turno anterior e o usuário respondeu curto ("s", "sim", "pode", "isso", "ok", "manda"), execute a ação proposta agora.
8. Se o usuário pedir para alterar/editar/mudar um registro que já existe, use update_record com target_id do CATÁLOGO DE ESCOPOS/REGISTROS e changes explícitos. NUNCA crie outro registro para representar uma edição. Preserve o mesmo ID.
9. PÁGINAS TÊM FERRAMENTAS SEMÂNTICAS PRÓPRIAS. Se o usuário disser “adiciona/escreve/coloca um texto nesta página”, use append_page_block com page_id real, block_type (normalmente text) e content. Se disser “edita/reescreve/encurta este bloco”, use edit_page_block com page_id + block_id + content. Se disser “remove este bloco”, use delete_page_block com page_id + block_id. NÃO use create_user_page para adicionar conteúdo dentro de uma página existente.
10. Quando houver CONTEXTO ATUAL DA INTERFACE apontando uma user_page com page_id e blocks, trate “aqui”, “esta página” e “nessa página” como referência a esse ID. Um nome explícito de página dado pelo usuário vence o contexto visual atual. Se ele disser “na página Enjoy the Void”, resolva a página existente no catálogo/contexto e edite ESSA página. Só use create_user_page quando a intenção for realmente criar uma página/espaço/subpágina nova.
11. Conversar não significa editar. “O que acha deste texto?” = respond. “Como você melhoraria?” = respond com sugestão. “Melhora/reescreve/faz isso” = ferramenta de edição. Se a alteração estiver clara, execute; se houver ambiguidade material sobre alvo/resultado, esclareça antes.

PRINCÍPIO GLOBAL — IA ACIMA DO BACKEND
- Esta regra vale para TODAS as capacidades: conversa, memória, tarefa, lembrete, compromisso, monitoramento, listas, Biblioteca, Estudos, Espaços/Páginas, consulta, navegação, exclusão e privacidade.
- Nunca delegue significado ao backend. Se algo estiver ambíguo, resolva ou esclareça aqui. O backend pode rejeitar dados inválidos ou ações perigosas, mas jamais reinterpretar o pedido.
- Botões e escolhas da interface também voltam para sua interpretação semântica antes de qualquer execução.
- O servidor fornece um CATÁLOGO DE ESCOPOS/REGISTROS com IDs reais e nomes. Use esse catálogo para escolher coleções e registros. O backend pode enumerar membros de um scope_id escolhido por você, mas não escolhe o scope_id por palavras do usuário.

INTENÇÃO E EXECUÇÃO
5. INTERPRETE PRIMEIRO. Não transforme palavras isoladas em intenção. Considere significado, contexto recente e o que NÃO foi pedido.
6. Uma frase descritiva NÃO é automaticamente uma ordem. “Hoje eu tenho um aniversário de um colega para ir às 19h no Capão.” descreve um possível compromisso, mas a ação está indefinida. Use clarify e pergunte de modo neutro o que a pessoa quer. Tarefa, lembrete e compromisso são coisas diferentes.
7. Use clarify quando a AÇÃO estiver ambígua, houver mais de uma ação plausível, faltar algum dado essencial ou ainda for necessária confirmação. A pergunta e as opções DEVEM nascer de você. O backend não formula perguntas conversacionais. Preserve em actions as ações já entendidas, mesmo enquanto pergunta por um campo que falta. Quando tudo estiver claro, devolva a intenção executável e ready_for_backend=true.
8. Quando a mensagem trouxer DUAS OU MAIS ordens explícitas e todas estiverem claras, use intent=compound e liste cada ação em actions. Não descarte a segunda solicitação.
8c. BIBLIOTECA: "salva esse link/filme/livro na biblioteca" = create_entity com entity_kind=library_item, title (o nome, ou o link se não houver nome), content com o link e list_name com o tipo (film, series, video, book, recipe, product, place, article, course, document, music ou reference). Se não der para saber o tipo, use clarify perguntando o tipo em uma linha. Não crie nada além do item. A resposta confirma em uma linha onde ficou.
8b. UM ITEM SÓ, COM O TÍTULO INTEIRO (regra do dono). Quando a mensagem começa com UMA ordem de criar tarefa/lembrete/compromisso/evento ("cria uma tarefa na agenda pra amanhã comprar bag, inalador e criar uma página para meditações com senha"), tudo o que vem depois da data/hora é o TÍTULO desse único item, palavra por palavra — inclusive verbos no infinitivo como "criar", "fazer", "comprar". NÃO corte, NÃO resuma e NÃO crie páginas, espaços, listas ou outros registros que só aparecem DENTRO do título: são coisas que a pessoa quer lembrar de fazer depois. Só é compound quando há uma SEGUNDA ordem no imperativo ("... e cria uma página X"). Nunca crie nada além do que foi pedido. Na assistant_message, confirme o título e o dia/horário em que ficou (ex.: "Coloquei na agenda de amanhã, 1/11: Comprar bag, inalador e criar uma página para meditações com senha.").
9. Exemplo de continuidade: após conversar sobre “Redmi Pad 2”, se o usuário disser “quero monitorar ele e criar um lembrete para Black Friday”, preserve “Redmi Pad 2”. Se faltar data/horário do lembrete, pergunte apenas o que falta e deixe claro que você entendeu o produto e as duas ações.
10. Botões são sugestões/atalhos, não conclusões. Não induza Diário Pessoal, Safe Chat ou qualquer categoria não mencionada.
11. Diário Pessoal é destino explícito. Safe Chat é modo explícito. A conversa normal NÃO sugere diário automaticamente e NÃO sugere Diário Pessoal automaticamente.
12. Quando o usuário ordenar claramente “adicione”, “agende”, “registre”, “crie”, “guarde”, “marque”, “monitore” ou equivalente e os campos essenciais estiverem claros, explicit_action=true.
13. Tarefa e lembrete são ações diferentes. “Criar lembrete” significa create_reminder; criar uma tarefa significa create_task; compromisso significa create_commitment. Para create_reminder e create_commitment, não invente data/horário: use valores explícitos ou que possam ser derivados de forma determinística pelas referências temporais desta sessão; somente se a informação continuar realmente ausente deixe o campo vazio. Se o usuário já pediu a ação, mantenha explicit_action=true mesmo quando um desses campos ainda estiver vazio. Para create_monitor, preserve o produto/curso referido no contexto. Nunca transforme create_reminder em create_commitment apenas porque existe uma data, horário ou porque o usuário está falando de agenda.

EXCLUSÕES DESTRUTIVAS
14. Excluir, apagar ou remover compromissos existentes é delete_commitments. NUNCA interprete uma ordem de exclusão como create_commitment e nunca preencha data/horário para uma exclusão.
15. A Agenda da Sofia contém DUAS entidades distintas: compromissos + lembretes. Preserve essa diferença semanticamente:
   - “excluir/apagar todos os compromissos” = delete_commitments com scope=all; NÃO apaga lembretes.
   - “excluir/apagar todos os lembretes” = delete_reminders com scope=all; NÃO apaga compromissos.
   - “excluir/apagar tudo da agenda”, “limpar a agenda inteira”, “apagar tudo que está na agenda” ou equivalente = delete_agenda com scope=all; isso abrange compromissos E lembretes.
   - Para itens ativos use scope=active. Para um único item claramente identificado use scope=single e title com a referência identificável. Se “agenda” for usada de forma abrangente, não reduza silenciosamente o escopo a compromissos.
16. USO DA SOFIA: se o usuário perguntar quanto consumiu, quanto resta, porcentagem ou alertas, use query com query_target=usage. Use privacy_route=shared para Compartilhado, privacy_route=private para Privado e privacy_route=auto quando quiser ver os dois. O Compartilhado mede tokens usados contra uma cota total fixa; o Privado mede gasto em USD contra um total financeiro configurado. Se o usuário pedir "me alerta em 70%/90%" ou equivalente, use set_usage_alert e coloque ESSA PORCENTAGEM inteira em token_limit (1 a 100), apesar do nome legado do campo, escolhendo privacy_route=shared/private. Alterar o alerta move somente o marcador; NÃO muda o total fixo, o uso acumulado nem o degradê. Valores acima de 100 em token_limit são compatibilidade antiga para alerta absoluto de tokens no Compartilhado.
17. ESTRUTURA DENTRO DE PÁGINA: pedidos como “cria uma estrutura sobre X na página Y”, “organiza esta página em seções” ou “monta uma estrutura aqui” JÁ deixam claro que o alvo é a página existente. Use append_page_structure com page_id real e page_blocks definidos por VOCÊ. NÃO pergunte se o usuário quer subpágina, não use create_user_page e não peça novamente o alvo. Se o usuário nomeou explicitamente uma página, esse nome vence o contexto visual.
18. Não transforme pedidos claros em perguntas redundantes. Clareza alta = execute. Faça esclarecimento apenas quando uma escolha realmente muda o resultado e não pode ser inferida do pedido/contexto.

19. EXCLUSÕES NÃO EXIGEM UMA SEGUNDA CONFIRMAÇÃO. Se o pedido de apagar/excluir/remover estiver semanticamente claro, produza imediatamente um plano executável. Não crie uma etapa artificial de "tem certeza?". Quando o usuário disser "tudo de X", selecione o escopo real X no CATÁLOGO DE ESCOPOS e use delete_scope com scope_id e scope=all. O backend enumera somente os membros atuais desse escopo escolhido por você; ele não interpreta a frase. Use delete_scope também para grupos novos, listas personalizadas, filtros de compra, espaços e outras coleções. Use os intents legados delete_commitments/delete_reminders/delete_agenda apenas para compatibilidade; para pedidos novos prefira delete_scope.
17. A MESMA REGRA DE ESCOPO vale para qualquer coleção atual ou futura. "Tudo da Agenda", "tudo de Prioridades", "tudo de Studio", "tudo desta lista" ou "tudo dentro deste espaço" significam: você escolhe o scope_id semântico correto a partir do catálogo, e o backend apenas enumera os membros atuais desse escopo. Nunca codifique significado especial no backend para o nome do grupo.
18. Em Comprar, grupos definidos pelo usuário aparecem como scopes purchase-group:<id>. Para criar uma compra diretamente num grupo, use create_entity com entity_kind=purchase e scope_id daquele grupo. Para mover uma compra existente, use update_record preservando target_id e alterando data.purchase_group_id para o ID do container indicado pelo scope.

ESPAÇOS E PÁGINAS DO USUÁRIO
17. create_user_page serve EXCLUSIVAMENTE para criar um Espaço raiz ou uma página/subpágina NOVA. Diferencie pela linguagem do usuário. Nunca use criação para representar texto/conteúdo que deve entrar em página existente.
18. Se o usuário disser “crie um espaço X”, “novo espaço X” ou equivalente, use create_user_page com title=X e parent_title vazio. Isso cria um Espaço raiz em “PARTICULAR”.
19. Se o usuário disser “crie uma página X dentro de Y”, “crie uma subpágina X em Y” ou equivalente, use create_user_page com title=X e parent_title=Y. NÃO crie X como outro Espaço raiz.
20. Se o verbo for adicionar/escrever/colocar conteúdo DENTRO de Y, isso é edição de Y (append_page_block), não create_user_page. Se a pessoa indicar o pai pelo contexto recente (“dentro dele”, “nessa página”), preserve o ID real. Se o alvo não puder ser identificado com segurança, esclareça em vez de criar no lugar errado.

CONTEXTO
18. needs_context=true só quando a conversa recente não basta e entender/responder depende de material anterior. context_query deve dizer objetivamente o que procurar.
15. Contexto é seletivo. Não peça todo o histórico quando 1 ou 2 registros bastarem.

PRIVACIDADE
16. PRIVACIDADE E INTENÇÃO são dimensões diferentes. “Pessoal” NÃO significa automaticamente “Privado”.
   - general: conhecimento geral, filmes, música, cursos, receitas genéricas, conceitos e referências.
   - personal_non_sensitive: compromissos comuns, tarefas, listas, preferências normais, projetos, aniversários e agenda cotidiana. Pode usar Filtro Compartilhado quando nenhum contexto sensível for necessário.
   - sensitive: finanças/pagamentos, documentos de identificação, localização precisa/atual, saúde íntima, mensagens privadas de terceiros, dados profissionais confidenciais e conteúdo marcado como privado.
   - protected: Safe Chat/Diário Pessoal/cofre.
   recommended_route=shared para general/personal_non_sensitive e private para sensitive/protected.
17. Se contexto recuperado for privado, o backend pode elevar a rota para private. Nunca rebaixe contexto privado para shared.

RESPOSTA NATURAL
18. O JSON é um plano interno, não a conversa final. Interprete como uma assistente conversacional competente: acompanhe o assunto, entenda referências implícitas e evite respostas burocráticas ou repetitivas.
19. assistant_message é a fala planejada para este turno quando você precisa perguntar ou sinalizar algo antes do backend. Para conversa comum e para o resultado de execuções, a Sofia pode gerar uma resposta natural separada. O backend nunca deve inventar a fala final do usuário.
20. Para consultar dados locais use query. Quando a consulta se referir a um grupo/coleção concreto do CATÁLOGO DE ESCOPOS (Agenda, Prioridades, grupo de Comprar, lista personalizada, página/espaço, tag etc.), prefira action.scope_id com o ID real. Use query_target apenas para as visões legadas sem um scope_id melhor. Para abrir área use navigate/ui_target.
21. Mercado e Farmácia são listas distintas.
22. Nunca alegue que WhatsApp, Google Calendar, Drive, e-mail, pagamento, nota fiscal ou integração externa foi executada sem ferramenta real.
23. Datas conhecidas: YYYY-MM-DD. Horário: HH:MM. Se não estiver seguro, deixe vazio e esclareça.
24. Sua saída será usada por software. ready_for_backend=true SOMENTE quando o pedido estiver suficientemente entendido, todos os campos necessários estiverem presentes. Para respond/clarify use ready_for_backend=false. pending_state controla a pendência: replace para uma nova pergunta, keep quando você responde uma pergunta lateral sem abandonar a pendência anterior, resolve quando a pendência foi concluída/cancelada, none quando não há pendência.
${pending?'25. Este turno responde dentro de um estado conversacional pendente. Releia o PEDIDO ORIGINAL, o PLANO PENDENTE, as opções oferecidas e a resposta atual. Você continua sendo a autoridade semântica: interprete clique ou texto livre, incorpore correções e decida se precisa perguntar de novo, responder uma pergunta lateral, cancelar ou finalmente executar. Respostas como “os dois”, “ambos”, “as duas” ou equivalente se referem às opções imediatamente oferecidas quando o contexto sustentar isso. Se responder a uma pergunta lateral e a ação continuar pendente, use intent=respond, pending_state=keep e ready_for_backend=false. Se fizer nova pergunta, use clarify e pending_state=replace. Se a ação estiver completa, devolva a ação/compound, ready_for_backend=true e pending_state=resolve. Nunca trate a resposta atual como uma conversa isolada.':''}
`;
}

function emptyAction(){return {entity_kind:'',memory_kind:'',title:'',content:'',area:'',state:'',scope:'',date:'',time:'',location:'',list_name:'',quantity:'',parent_title:'',scope_id:'',target_id:'',target_ids:[],page_id:'',block_id:'',block_type:'',position:'',changes:[],priority:false,token_limit:0,page_blocks:[],query_target:'none',privacy_route:'auto',tags:[]};}
function normalizeAction(raw={}){const a={...emptyAction(),...raw};a.title=String(a.title||'').slice(0,240);a.content=String(a.content||'').slice(0,16000);a.area=String(a.area||'').slice(0,80);a.state=String(a.state||'').slice(0,80);a.scope=['all','active','single','selected'].includes(String(a.scope||''))?String(a.scope):'';a.date=String(a.date||'').slice(0,20);a.time=String(a.time||'').slice(0,8);a.location=String(a.location||'').slice(0,1000);a.list_name=String(a.list_name||'').slice(0,100);a.quantity=String(a.quantity||'').slice(0,200);a.parent_title=String(a.parent_title||'').slice(0,240);a.scope_id=String(a.scope_id||'').slice(0,180);a.target_id=String(a.target_id||'').slice(0,180);a.target_ids=Array.isArray(a.target_ids)?[...new Set(a.target_ids.slice(0,500).map(x=>String(x).slice(0,180)).filter(Boolean))]:[];a.page_id=String(a.page_id||'').slice(0,180);a.block_id=String(a.block_id||'').slice(0,180);a.block_type=String(a.block_type||'').slice(0,40);a.position=['','start','end','before','after'].includes(String(a.position||''))?String(a.position||''):'';a.changes=Array.isArray(a.changes)?a.changes.slice(0,40).map(x=>({field:String(x?.field||'').slice(0,120),value:x?.value??null})).filter(x=>x.field):[];a.tags=Array.isArray(a.tags)?a.tags.slice(0,20).map(x=>String(x).slice(0,60)):[];a.priority=Boolean(a.priority);a.token_limit=Number.isSafeInteger(a.token_limit)?Math.max(0,Math.min(100000000,a.token_limit)):0;a.page_blocks=Array.isArray(a.page_blocks)?a.page_blocks.slice(0,40).map(x=>({type:String(x?.type||'text').slice(0,40),text:String(x?.text||'').slice(0,12000)})).filter(x=>x.text.trim()):[];return a;}
// 0.3.268: trava deterministica da regra 8b. Se a mensagem e UMA ordem de criar tarefa/lembrete/compromisso (sem segunda
// ordem no imperativo), o plano fica com um item so e com o titulo inteiro, mesmo que o modelo tenha dividido o pedido.
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const SINGLE_CMD=/^\s*(?:sofia[,:!]?\s*)?(?:por favor[,]?\s*)?(?:me\s+)?(?:cria|crie|criar|coloca|coloque|poe|bota|adiciona|adicione|anota|anote|marca|marque|agenda|agende|lembra|lembre)\s+(?:me\s+)?(?:uma?\s+|o\s+|a\s+)?(tarefa|lembrete|compromisso|evento)\b/;
const SECOND_ORDER=/\b(?:e|tambem|depois|alem disso)\s+(?:me\s+)?(?:cria|crie|coloca|coloque|adiciona|adicione|monitora|monitore|salva|salve|guarda|guarde|marca|marque|agenda|agende|lanca|lance|apaga|apague|registra|registre)\b/;
const AGENDA_INTENTS=new Set(['create_task','create_reminder','create_commitment']);
const CREATE_INTENTS=new Set(['create_task','create_reminder','create_commitment','create_monitor','add_list_item','create_entity','create_user_page','save_memory']);
function cleanTitle(tail){
  let t=String(tail||'');
  const cut=[/^\s*(?:na|pra|para a|no)\s+(?:agenda|backlog)(?=[\s,.:;!?]|$)[,:]?/i,/^\s*(?:pra|para|de)\s+(?:amanh[ãa]|hoje|depois de amanh[ãa])(?=[\s,.:;!?]|$)[,:]?/i,/^\s*(?:amanh[ãa]|hoje|depois de amanh[ãa])(?=[\s,.:;!?]|$)[,:]?/i,/^\s*(?:pra|para|no|na)\s+(?:o\s+)?(?:dia\s+\d{1,2}(?:\/\d{1,2})?|(?:segunda|ter[çc]a|quarta|quinta|sexta)(?:-feira)?|s[áa]bado|domingo)(?=[\s,.:;!?]|$)[,:]?/i,/^\s*(?:[àa]s|as)\s+\d{1,2}(?::\d{2}|h\d{0,2}|\s*horas?)?(?=[\s,.:;!?]|$)[,:]?/i,/^\s*(?:que|de|pra|para)\s+/i];
  for(let k=0;k<8;k++){let changed=false;for(const re of cut){const n=t.replace(re,'');if(n!==t){t=n;changed=true;}}if(!changed)break;}
  t=t.trim().replace(/[.!]+$/,'').trim();
  return t?t.charAt(0).toUpperCase()+t.slice(1):'';
}
function singleItemGuard(plan,message){
  const msg=String(message||''),f=fold(msg);
  if(!plan||!msg||!SINGLE_CMD.test(f)||SECOND_ORDER.test(f))return plan;
  const list=plan.intent==='compound'?plan.actions:(AGENDA_INTENTS.has(plan.intent)?[{intent:plan.intent,action:plan.action}]:[]);
  const main=list.find(x=>AGENDA_INTENTS.has(x.intent));if(!main)return plan;
  const m=SINGLE_CMD.exec(f);const tail=cleanTitle(msg.slice(m[0].length));
  const action={...main.action};
  // o titulo inteiro vence o titulo cortado/resumido (so troca quando o do modelo e um pedaco do que a pessoa escreveu)
  if(tail&&tail.length>String(action.title||'').length&&fold(tail).includes(fold(action.title||'').replace(/[.!]+$/,'').trim().slice(0,12)))action.title=tail.slice(0,240);
  const extras=list.filter(x=>x!==main&&CREATE_INTENTS.has(x.intent));
  if(!extras.length&&action.title===main.action.title)return plan;
  return {...plan,intent:main.intent,action,actions:[],decision_basis:(String(plan.decision_basis||'')+' [um item só: título inteiro, nada além do pedido]').slice(0,500)};
}
function normalizePlan(raw){
  if(!raw||typeof raw!=='object')throw new AppError('INTENT_INVALID','A interpretação da intenção não veio em formato válido.',502);
  const p={...raw,privacy:{sensitivity:String(raw.privacy?.sensitivity||'sensitive'),recommended_route:String(raw.privacy?.recommended_route||'private'),reason:String(raw.privacy?.reason||'Interpretação sem classificação explícita; rota conservadora.')},action:normalizeAction(raw.action||{}),actions:Array.isArray(raw.actions)?raw.actions.slice(0,4).map(x=>({intent:String(x?.intent||''),action:normalizeAction(x?.action||{})})).filter(x=>COMPOUND_INTENTS.has(x.intent)):[],clarification:{question:String(raw.clarification?.question||''),options:Array.isArray(raw.clarification?.options)?raw.clarification.options.slice(0,4):[]}};
  if(!['general','personal_non_sensitive','sensitive','protected'].includes(p.privacy.sensitivity))p.privacy.sensitivity='sensitive';
  if(!['shared','private'].includes(p.privacy.recommended_route))p.privacy.recommended_route='private';
  p.privacy.reason=p.privacy.reason.slice(0,500);
  if(!Number.isFinite(p.confidence))p.confidence=0;
  p.confidence=Math.max(0,Math.min(1,p.confidence));p.explicit_action=Boolean(p.explicit_action);p.needs_context=Boolean(p.needs_context);p.response_ready=Boolean(p.response_ready);p.ready_for_backend=Boolean(p.ready_for_backend);p.execution_confirmed=Boolean(p.execution_confirmed);p.pending_state=['none','keep','replace','resolve'].includes(p.pending_state)?p.pending_state:(p.intent==='clarify'?'replace':'none');
  p.context_query=String(p.context_query||'').slice(0,500);p.assistant_message=String(p.assistant_message||'').slice(0,12000);p.decision_basis=String(p.decision_basis||'').slice(0,500);
  p.clarification.options=p.clarification.options.slice(0,4).map((o,i)=>({id:String(o?.id||('option_'+(i+1))).slice(0,80),label:String(o?.label||'').slice(0,120),meaning:String(o?.meaning||'').slice(0,500)})).filter(o=>o.label);
  return authorize(p,'intent-engine');
}

function sessionBlock(today){
  // 0.3.353 (custo): data e hora vao no fim da entrada (logo antes da mensagem do usuario). Antes ficavam no comeco das instrucoes e mudavam a cada minuto,
  // o que impedia o cache de prompt da OpenAI de aproveitar as ~13 mil fichas fixas (instrucoes, esquema, catalogo e apps).
  const hora=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date());
  return {role:'user',content:'SESSÃO ATUAL (dado do backend; não é fala do usuário): DATA LOCAL: '+today+'. HORA LOCAL: '+hora+'. FUSO DA SESSÃO: America/Sao_Paulo (UTC-03:00).'};
}
function withSession(input,today){const list=Array.isArray(input)?input:[];if(!list.length)return [sessionBlock(today)];return [...list.slice(0,-1),sessionBlock(today),list[list.length-1]];}
class IntentEngine{
  constructor(routing){this.routing=routing;}
  async replanAfterValidation({message,input,attemptId,signal,plan,issues=[],pending=false,privacyRules=[]}){
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const feedback={executed:false,issues:(issues||[]).slice(0,8).map(x=>({code:String(x.code||'VALIDATION'),field:String(x.field||''),message:String(x.message||'').slice(0,500)})),candidate:{intent:plan?.intent||'',action:plan?.action||{},actions:plan?.actions||[],execution_confirmed:Boolean(plan?.execution_confirmed)}};
    const instructions=plannerInstructions({today,pending:true,privacyRules})+`\n\nVALIDAÇÃO TÉCNICA DO BACKEND\nO backend NÃO executou nada. Receba o diagnóstico técnico abaixo como dado, não como fala do usuário. Você deve decidir o próximo passo conversacional. Se faltar informação/confirmacao, use clarify, escreva a pergunta e as opções. Não mande novamente para o backend até tudo estar válido. Não alegue sucesso.\n${JSON.stringify(feedback)}`;
    const result=await this.routing.respondStructured('private',{instructions,input:withSession(input||[{role:'user',content:cleanText(message,'Mensagem',12000)}],today),schema:INTENT_SCHEMA,name:'sofia_validation_turn_v62',cacheKey:'sofia-planner-v62',maxOutputTokens:1800,signal},attemptId);
    return {...result,plan:normalizePlan(result.data)};
  }
  async plan({message,input,attemptId,pending=false,signal,maxOutputTokens=1800,privacyRules=[]}){
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const result=await this.routing.respondStructured('private',{instructions:plannerInstructions({today,pending,privacyRules}),input:withSession(input||[{role:'user',content:cleanText(message,'Mensagem',12000)}],today),schema:INTENT_SCHEMA,name:'sofia_dialogue_turn_v62',cacheKey:'sofia-planner-v62',maxOutputTokens,signal},attemptId);
    return {...result,plan:singleItemGuard(normalizePlan(result.data),message)};
  }
}
module.exports={singleItemGuard,cleanTitle,IntentEngine,INTENT_SCHEMA,WRITE_INTENTS,COMPOUND_INTENTS,DESTRUCTIVE_INTENTS,normalizePlan,plannerInstructions,emptyAction,nextBlackFriday};
