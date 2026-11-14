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
const escapeHtml=(t:string)=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
export function diaryDayTitle(d:Date){return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} · ${WEEKDAYS[d.getDay()]}`;}
export function diaryEntryBlock(time:string,text:string):PageBlock{
 const t=time.trim(),body=text.trim();
 return {...block('text',`${t}  ${body}`),html:`<span style="color:${DIARY_TIME_COLOR}"><b>${escapeHtml(t)}</b></span>&nbsp;&nbsp;${escapeHtml(body)}`} as PageBlock;
}
export function diaryBlocks(now=new Date()):PageBlock[]{
 return [block('heading3',diaryDayTitle(now)),diaryEntryBlock(`${pad(now.getHours())}:${pad(now.getMinutes())}`,'')];
}

const TEXTY=new Set(['text','heading1','heading2','heading3','quote','callout','bullet','number']);
/** Aplicar o Diário numa página que já tem texto reorganiza o que existe: linha só com data (07/11/2026) vira o título do
 * dia, linha que começa com hora (19:30 - ...) vira um registro com a hora em destaque; linhas seguintes sem hora entram
 * no mesmo registro. Imagens, arquivos e outros blocos ficam onde estavam. Devolve null se não achar nenhuma data ou hora. */
export function diaryFromBlocks(existing:readonly PageBlock[]):PageBlock[]|null{
 const out:PageBlock[]=[];let days=0,hits=0,cur:{time:string;lines:string[]}|null=null;
 const close=()=>{if(cur){out.push(diaryEntryBlock(cur.time,cur.lines.join('\n')));cur=null;}};
 for(const b of existing){
  if(b.type==='divider')continue;
  if(!TEXTY.has(b.type)){close();out.push(b);continue;}
  for(const raw of String(b.text||'').replace(/ /g,' ').split(/\r?\n/)){
   const line=raw.trim();if(!line)continue;
   const d=/^(\d{1,2})\/(\d{1,2})\/(\d{4})(\s*·\s*\S+)?$/.exec(line);
   if(d){close();if(days++)out.push(block('divider'));out.push(block('heading3',diaryDayTitle(new Date(+d[3],+d[2]-1,+d[1]))));hits++;continue;}
   const t=/^(\d{1,2})[:h](\d{2})\s*(?:[-–—:]\s*)?([\s\S]*)$/.exec(line);
   if(t&&+t[1]<24&&+t[2]<60){close();cur={time:`${pad(+t[1])}:${t[2]}`,lines:t[3]?[t[3]]:[]};hits++;continue;}
   if(cur)cur.lines.push(line);else out.push(block('text',line));
  }
 }
 close();
 return hits?out:null;
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

// 14/11/2026 (Pedro: "esse template não faz nada além de deixar hora grifado"): o Diário passa a agir na página.
const DAY_RE=/^(\d{2})\/(\d{2})\/(\d{4}) · /,ENTRY_RE=/^\d{2}:\d{2}\s\s/;
/** Data (AAAA-MM-DD) do título de dia do Diário, ou '' se o bloco não for um. */
export function diaryDayKey(b:PageBlock|undefined):string{const m=b&&b.type==='heading3'?DAY_RE.exec(String(b.text||'')):null;return m?`${m[3]}-${m[2]}-${m[1]}`:'';}
export const isDiaryEntry=(b:PageBlock|undefined)=>!!b&&b.type==='text'&&ENTRY_RE.test(String(b.text||''));
export const isDiaryPage=(blocks:readonly PageBlock[])=>blocks.some(b=>!!diaryDayKey(b));
const keyOf=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
/** Enter no fim de um registro: a linha nova já nasce com a hora de agora; se o dia virou, o título do dia novo entra
 * no fim da página antes dela. Registro vazio (só a hora) segue o Enter comum. */
export function diaryEnter(blocks:readonly PageBlock[],id:string,now=new Date()):{blocks:PageBlock[];focus:string;caret:number}|null{
 const i=blocks.findIndex(b=>b.id===id),b=blocks[i];
 if(i<0||!isDiaryEntry(b)||!String(b.text||'').replace(ENTRY_RE,'').trim()||!isDiaryPage(blocks))return null;
 const time=`${pad(now.getHours())}:${pad(now.getMinutes())}`,entry=diaryEntryBlock(time,''),next=blocks.slice();
 let lastDay='';for(const x of blocks){const k=diaryDayKey(x);if(k)lastDay=k;}
 if(lastDay!==keyOf(now))next.push(block('divider'),block('heading3',diaryDayTitle(now)),entry);else next.splice(i+1,0,entry);
 return {blocks:next,focus:entry.id,caret:time.length+2};
}
/** Blocos escondidos pelos dias recolhidos (título do dia com data.collapsed) até o próximo dia. */
export function diaryHidden(blocks:readonly PageBlock[]):Set<string>{
 const out=new Set<string>();let hide=false;
 blocks.forEach((b,i)=>{if(diaryDayKey(b)){hide=!!b.data?.collapsed;return;}if(hide&&!(b.type==='divider'&&diaryDayKey(blocks[i+1])))out.add(b.id);});
 return out;
}
/** Dias do Diário na ordem da página, com quantos registros cada um tem (para o índice e o contador). */
export function diaryDays(blocks:readonly PageBlock[]):{id:string;key:string;label:string;count:number;collapsed:boolean}[]{
 const out:{id:string;key:string;label:string;count:number;collapsed:boolean}[]=[];
 for(const b of blocks){const k=diaryDayKey(b);if(k){const [y,m,d]=k.split('-');out.push({id:b.id,key:k,label:`${d}/${m} · ${WEEKDAYS[new Date(+y,+m-1,+d).getDay()].slice(0,3)}`,count:0,collapsed:!!b.data?.collapsed});}else if(out.length&&isDiaryEntry(b))out[out.length-1].count++;}
 return out;
}
