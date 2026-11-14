import type {PageBlock} from './page-editor';

export type TemplateId='tasks_personal'|'content_kanban'|'notes_hub'|'playlist_links'|'diary';
export type PageTemplate={
 id:TemplateId;title:string;description:string;icon:string;
 blocks:PageBlock[];
};

const id=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const block=(type:string,text='',data:Record<string,any>={}):PageBlock=>({id:id(),type,text,data});

export const STATUS_COLORS:{id:string;label:string;hex:string}[]=[
 {id:'gray',label:'Cinza',hex:'#8e8e93'},{id:'red',label:'Vermelho',hex:'#e05a5a'},
 {id:'orange',label:'Laranja',hex:'#d9822b'},{id:'yellow',label:'Amarelo',hex:'#c9a227'},
 {id:'green',label:'Verde',hex:'#42a56b'},{id:'teal',label:'Turquesa',hex:'#2d9c9c'},
 {id:'blue',label:'Azul',hex:'#4285d4'},{id:'purple',label:'Roxo',hex:'#8b67d5'},
 {id:'pink',label:'Rosa',hex:'#d66aa6'}
];
export const statusColorHex=(id:string)=>STATUS_COLORS.find(x=>x.id===id)?.hex||STATUS_COLORS[0].hex;

export const PAGE_TEMPLATES:PageTemplate[]=[
 {
  id:'tasks_personal',title:'Kanban',description:'Quadro Kanban com colunas editáveis e cartões arrastáveis.',icon:'▦',
  blocks:[block('collection','',{
   title:'',show_title:false,
   properties:[
    {key:'name',label:'Nome',type:'text',options:[]},
    {key:'status',label:'Status',type:'select',options:['Não iniciada','Prioridade'],option_colors:{'Não iniciada':'gray','Prioridade':'red'}}
   ],
   views:[{id:'board',label:'Kanban',type:'board',group_by:'status',filter_key:'',filter_value:'',sort_by:'',sort_dir:'desc'}],
   active_view:'board',rows:[]
  })]
 },
 {
  // 14/11/2026 (Pedro, item 14: "Kanban avançado" baseado no "Planejamento de conteúdo Kanban" do Notion; o Kanban simples fica).
  id:'content_kanban',title:'Kanban avançado',description:'Planejamento de conteúdo: status, plataformas, prioridade, calendário e próximos.',icon:'◫',
  blocks:[block('collection','',{
   title:'',show_title:false,
   properties:[
    {key:'name',label:'Título',type:'text',options:[]},
    {key:'status',label:'Status',type:'status',options:['Ideia','Projetando','Elaboração','Aprovado','Programado','Publicado'],
     option_colors:{'Ideia':'gray','Projetando':'purple','Elaboração':'orange','Aprovado':'blue','Programado':'yellow','Publicado':'green'}},
    {key:'priority',label:'Prioridade',type:'select',options:['Alta','Média','Baixa'],option_colors:{'Alta':'red','Média':'yellow','Baixa':'green'}},
    {key:'kind',label:'Tipo de conteúdo',type:'select',options:['Post','Vídeo','Reels','Story','Artigo','Newsletter'],option_colors:{'Post':'blue','Vídeo':'red','Reels':'pink','Story':'orange','Artigo':'teal','Newsletter':'purple'}},
    {key:'platforms',label:'Plataforma',type:'multi_select',options:['Instagram','YouTube','TikTok','LinkedIn','Blog'],option_colors:{'Instagram':'pink','YouTube':'red','TikTok':'gray','LinkedIn':'blue','Blog':'teal'}},
    {key:'owner',label:'Responsável',type:'person',options:[]},
    {key:'publish',label:'Data de publicação',type:'date',options:[]},
    {key:'words',label:'Contagem de palavras',type:'number',number_format:'bar',options:[]},
    {key:'notes',label:'Notas',type:'text',options:[]}
   ],
   views:[
    {id:'flow',label:'Fluxo de status',type:'board',group_by:'status',filters:[],sorts:[],hidden:['notes']},
    {id:'platform',label:'Plataforma',type:'board',group_by:'platforms',filters:[],sorts:[],hidden:['notes']},
    {id:'priority',label:'Prioridade',type:'board',group_by:'priority',filters:[],sorts:[],hidden:['notes']},
    {id:'calendar',label:'Calendário',type:'calendar',date_key:'publish',filters:[],sorts:[]},
    {id:'next',label:'Próximos',type:'table',filters:[{key:'publish',op:'future'}],sorts:[{key:'publish',dir:'asc'}],hidden:['notes','words']},
    {id:'all',label:'Tabela',type:'table',filters:[],sorts:[]}
   ],
   active_view:'flow',rows:[]
  })]
 },
 {
  // 14/11/2026 (Pedro, item 13: "modelo de tabela igual ao Notion"): substitui o Formulário. As tabelas já criadas seguem iguais
  // (mesmo id e mesmo formato); "Formulário" agora é uma opção do botão Nova.
  id:'playlist_links',title:'Tabela',description:'Base de dados com colunas de vários tipos, filtros, ordenação e visões.',icon:'▤',
  blocks:[block('collection','',{
   title:'',show_title:false,
   properties:[
    {key:'name',label:'Nome',type:'text',options:[]},
    {key:'status',label:'Status',type:'status',options:['Não iniciado','Em andamento','Concluído'],option_colors:{'Não iniciado':'gray','Em andamento':'blue','Concluído':'green'}},
    {key:'category',label:'Categoria',type:'multi_select',options:[],option_colors:{}},
    {key:'url',label:'URL',type:'url',options:[]},
    {key:'created',label:'Criado em',type:'created',options:[]},
    {key:'description',label:'Texto',type:'text',options:[]},
    {key:'date',label:'Data',type:'date',options:[]},
    {key:'number',label:'Número',type:'number',options:[]},
    {key:'done',label:'Caixa',type:'checkbox',options:[]}
   ],
   views:[
    {id:'links',label:'Tabela',type:'table',group_by:'',filters:[],sorts:[]},
    {id:'board',label:'Quadro',type:'board',group_by:'status',filters:[],sorts:[],hidden:['description','created']}
   ],
   active_view:'links',rows:[]
  })]
 },
 {
  id:'notes_hub',title:'Notas',description:'Pastas com notas e edição livre.',icon:'📝',
  blocks:[block('collection','',{title:'Notas',show_title:true,mode:'notebooks',notebooks:[],properties:[{key:'name',label:'Nome',type:'text'}],views:[{id:'notebooks',label:'Notas',type:'pages'}],active_view:'notebooks',rows:[]})]
 },
 {id:'diary',title:'Diário',description:'Dias com data e registros com a hora em destaque, como um diário.',icon:'✎',blocks:[]}
];

// 14/11/2026 (Pedro, página "devaneios"): Diário = dia como título (data · dia da semana) e cada registro com a hora em
// destaque na frente do texto; divisor entre os dias. Usa só blocos que já existem (título 3, texto e divisor).
export const DIARY_TIME_COLOR='#8b67d5';
const WEEKDAYS=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
const pad=(n:number)=>String(n).padStart(2,'0');
const escapeHtml=(t:string)=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function diaryDayTitle(d:Date){return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} · ${WEEKDAYS[d.getDay()]}`;}
export function diaryEntryBlock(time:string,text:string):PageBlock{
 const t=time.trim(),body=text.trim();
 return {...block('text',`${t}  ${body}`),html:`<span style="color:${DIARY_TIME_COLOR}"><b>${escapeHtml(t)}</b></span>&nbsp;&nbsp;${escapeHtml(body)}`} as PageBlock;
}
export function diaryBlocks(now=new Date()):PageBlock[]{
 return [block('heading3',diaryDayTitle(now)),diaryEntryBlock(`${pad(now.getHours())}:${pad(now.getMinutes())}`,'')];
}

export function freshTemplate(template:PageTemplate):PageTemplate{
 if(template.id==='diary')return {...template,blocks:diaryBlocks()};
 const clone=JSON.parse(JSON.stringify(template)) as PageTemplate;
 clone.blocks=clone.blocks.map(b=>({...b,id:id(),data:{...(b.data||{}),rows:Array.isArray(b.data?.rows)?b.data.rows.map((r:any)=>({...r,id:id()})):b.data?.rows}}));
 return clone;
}

/** Insert structure without erasing personal content. A single untouched guide block is replaced. */
export function insertTemplateBlocks(existing:readonly PageBlock[],incoming:readonly PageBlock[]):PageBlock[]{
 const blank=existing.length===1&&existing[0].type==='text'&&!existing[0].text&&!existing[0].html;
 const added=JSON.parse(JSON.stringify(incoming)) as PageBlock[];
 return blank?added:[...existing,...added];
}
