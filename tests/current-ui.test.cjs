'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v142: identidade e cache atuais estão alinhados',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.ok(cfg.includes("const VERSION = '142.0.0'"));
  assert.ok(html.includes('Sofia OS · v142'));
  assert.ok(html.includes('/ui-current.css?v=142'));
  assert.ok(html.includes('/app.js?v=142'));
  assert.ok(html.includes('Core v142 · AVSORD Technology'));
  assert.equal(pkg.version,'1.90.0');
});

test('v141: subpáginas sem preferência começam fechadas',()=>{
  const app=read('public/app.js');
  assert.ok(app.includes('function pageTreeExpanded(pageId){if(state.userPageExpanded[pageId]===undefined)state.userPageExpanded[pageId]=false'));
  assert.ok(!app.includes("localStorage.setItem('sofiaPageTreeExpanded'"));
});

test('v119: Agenda é interativa e cria itens clicando no dia',()=>{
  const app=read('public/app.js'),css=read('public/ui-current.css');
  assert.ok(app.includes('function agendaCreateAt(day)'));
  assert.ok(app.includes("cell.addEventListener('click'"));
  assert.ok(app.includes("options:[['event','Evento'],['task','Tarefa'],['reminder','Lembrete']]"));
  assert.ok(css.includes('.agenda-day:hover'));
});

test('v119: arrastar no calendário atualiza o registro de origem',()=>{
  const app=read('public/app.js');
  assert.ok(app.includes('async function agendaMoveRowToDay(row,day)'));
  assert.ok(app.includes("api('/api/tasks/'+row.id"));
  assert.ok(app.includes("api('/api/entities/'+current.id"));
  assert.ok(app.includes("b.draggable=true"));
});

test('v119: clicar em tarefa/evento existente abre edição da própria origem',()=>{
  const app=read('public/app.js');
  assert.ok(app.includes("function agendaOpenRow(row){if(row._source==='task')return editTask(row);if(['commitment','reminder'].includes(row.kind))return editEntity(row.kind,row,'commitments')"));
});

test('v119: formulário de tarefa foi rediagramado',()=>{
  const app=read('public/app.js'),css=read('public/ui-current.css');
  assert.ok(app.includes("classList.add('task-editor-dialog')"));
  assert.ok(css.includes('#editorDialog.task-editor-dialog #editorFields'));
  assert.ok(css.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'));
  assert.ok(css.includes('label[data-field="description"]'));
});

test('v119: tarefas têm metadados de sincronização futura de calendário',()=>{
  const migration=read('src/memory/migration119.js'),store=read('src/memory/store.js');
  assert.ok(migration.includes('calendar_provider'));
  assert.ok(migration.includes('external_event_id'));
  assert.ok(store.includes("migrate119"));
  assert.ok(store.includes("sync_state"));
});


test('v120: tela Tarefas possui todas as funções usadas por loadTasks',()=>{
  const app=read('public/app.js');
  assert.ok(app.includes('function taskPriorityLabel(level)'));
  assert.ok(app.includes('function taskPriorityClass(level)'));
  assert.ok(app.includes('async function loadTaskCards()'));
  assert.ok(app.includes('await loadTaskCards();'));
});


test('v121: Início usa o destino solicitado e não o estado alterado pelo scroll antigo do Resumo',()=>{
  const app=read('public/app.js');
  assert.ok(app.includes("const requestedSection=section==='summary'?'summary':'top'"));
  assert.ok(app.includes("state.startSection=requestedSection;"));
  assert.ok(app.includes("requestAnimationFrame(()=>scrollStartSection(requestedSection,{smooth:true}))"));
  assert.ok(!app.includes("requestAnimationFrame(()=>scrollStartSection(state.startSection,{smooth:true}))"));
});


test('v122: barra lateral dos menus mantém thumb visível no estilo Notion',()=>{
  const css=read('public/ui-current.css');
  assert.ok(css.includes('/* v122 — barra lateral de rolagem sempre visível'));
  assert.ok(css.includes('.mode-user .sidebar::-webkit-scrollbar-thumb{'));
  assert.ok(css.includes('background:rgba(55,53,47,.30)!important'));
  assert.ok(css.includes('scrollbar-width:thin!important'));
  assert.ok(css.includes('scrollbar-gutter:stable!important'));
  assert.ok(!css.slice(css.indexOf('/* v122 — barra lateral de rolagem sempre visível')).includes('.mode-user .sidebar:hover::-webkit-scrollbar-thumb'));
});


test('v124: APPS e PARTICULAR persistem e subpáginas preservam a escolha do usuário',()=>{
  const app=read('public/app.js');
  assert.ok(app.includes("localStorage.setItem('sofiaAppsExpanded',open?'1':'0')"));
  assert.ok(app.includes("localStorage.getItem('sofiaAppsExpanded')!=='0'"));
  assert.ok(app.includes("localStorage.setItem('sofiaParticularExpanded',open?'1':'0')"));
  assert.ok(app.includes("localStorage.getItem('sofiaParticularExpanded')!=='0'"));
  assert.ok(!app.includes("localStorage.setItem('sofiaPageTreeExpanded'"));
  assert.ok(app.includes("if(open&&!wasOpen){loadUserPages().catch(showError);}"));
  assert.ok(app.includes("localStorage.setItem('sofiaPageExpandedV141'"));
  assert.ok(app.includes("localStorage.getItem('sofiaPageExpandedV141'"));
});


test('v124: excluir curso aparece apenas dentro de Editar',()=>{
  const app=read('public/app.js');
  assert.match(app,/entity&&kind==='course'/);
  assert.match(app,/Excluir curso/);
  assert.match(app,/if\(kind!=='course'\)a\.append\(btn\('Excluir'/);
  assert.match(app,/if\(e\.kind!=='course'\)actions\.append\(btn\('Excluir'/);
});


test('v125: curso só pode ser excluído dentro de Editar',()=>{
  const app=read('public/app.js');
  assert.match(app,/if\(kind!=='course'\)a\.append\(btn\('Excluir'/);
  assert.match(app,/if\(e\.kind!=='course'\)actions\.append\(btn\('Excluir'/);
  assert.match(app,/course-editor-danger-zone/);
  assert.match(app,/Esta opção fica somente dentro de Editar/);
  assert.match(app,/Excluir curso/);
});


test('v127: Conexões oferece botão real de coexistência do WhatsApp Business',()=>{
  const app=read('public/app.js'),api=read('src/core/api45.js');
  assert.ok(app.includes('Conectar WhatsApp Business'));
  assert.ok(app.includes("r.status==='ready-to-connect'?'Pronto para conectar'"));
  assert.ok(api.includes("status:'ready-to-connect'"));
  assert.ok(api.includes("connect_url:base+'/whatsapp/connect'"));
});

test('v127: Embedded Signup abre o fluxo de coexistência e não o cadastro normal',()=>{
  const js=read('public/whatsapp-connect.js'),html=read('public/whatsapp-connect.html');
  assert.ok(html.includes('Conectar WhatsApp Business'));
  assert.ok(js.includes("featureType:'whatsapp_business_app_onboarding'"));
  assert.ok(js.includes("sessionInfoVersion:'3'"));
  assert.ok(js.includes("config_id:state.config.configId"));
  assert.ok(js.includes("override_default_response_type:true"));
});

test('v130: infraestrutura Railway mantém endpoints públicos e protege o painel online com login',()=>{
  const handler=read('src/core/http-handler.js'),server=read('src/server.js');
  assert.ok(handler.includes("p==='/health'"));
  assert.ok(handler.includes("p==='/privacy'"));
  assert.ok(handler.includes("p==='/webhook'"));
  assert.ok(handler.includes("p==='/whatsapp/connect'"));
  assert.ok(handler.includes("p==='/login'"));
  assert.ok(handler.includes("p==='/auth/login'"));
  assert.ok(handler.includes('validSession(req)'));
  assert.ok(handler.includes('checkLocalRequest(req)'));
  assert.ok(server.includes("?'0.0.0.0':config.host"));
  assert.ok(server.includes('process.env.PORT'));
});


test('v129: site público descreve serviço, responsável e políticas sem abrir o painel',()=>{
  const site=read('public/site.html'),terms=read('public/terms.html'),deletion=read('public/data-deletion.html'),handler=read('src/core/http-handler.js');
  assert.ok(site.includes('Organização pessoal com IA'));
  assert.ok(site.includes('<span class="mark">S</span>'),'0.3.157: o S da marca voltou ao site');
  assert.ok(!/whatsapp/i.test(site));
  assert.ok(site.includes('Pedro Henrique Silva'));
  assert.ok(site.includes('sofiaos.core@gmail.com'));
  assert.ok(site.includes('/login'));
  assert.ok(site.includes('Entrar na Sofia OS'));
  assert.ok(site.includes('/privacy'));
  assert.ok(site.includes('/terms'));
  assert.ok(site.includes('/data-deletion'));
  assert.ok(terms.includes('Termos de Serviço'));
  assert.ok(deletion.includes('Solicitação de exclusão de dados'));
  assert.ok(handler.includes("'/site':['site.html'"));
  assert.ok(handler.includes("'/terms':['terms.html'"));
  assert.ok(handler.includes("'/data-deletion':['data-deletion.html'"));
});


test('v131: interface possui convenções de conta, logout e sessão',()=>{
  const html=read('public/index.html'),app=read('public/app.js'),handler=read('src/core/http-handler.js'),login=read('public/login.js');
  assert.ok(html.includes('accountLogoutButton'));
  assert.ok(html.includes('Sair deste dispositivo'));
  assert.ok(html.includes('Encerrar todas as sessões'));
  assert.ok(handler.includes("'/login?logout=1'"));
  assert.ok(handler.includes("p==='/api/auth/logout-all'"));
  assert.ok(app.includes("location.replace('/login?expired=1')"));
  assert.ok(login.includes('togglePassword'));
  assert.ok(login.includes("getModifierState('CapsLock')"));
});


test('v133: menu de usuário fecha fora e perfil do proprietário é editável',()=>{
  const html=read('public/index.html'),app=read('public/app.js'),store=read('src/memory/store.js');
  assert.ok(html.includes('id="accountMenu"'));
  assert.ok(html.includes('id="accountProfileButton"'));
  assert.ok(html.includes('id="profileForm"'));
  assert.ok(html.includes('Pedro Silva'));
  assert.ok(app.includes("document.addEventListener('pointerdown'"));
  assert.ok(app.includes('!accountMenu.contains(event.target)'));
  assert.ok(app.includes("event.key==='Escape'"));
  assert.ok(app.includes("body:{profileName,profileEmail}"));
  assert.ok(store.includes("profileName: 'Pedro Silva'"));
  assert.ok(!store.includes("profileEmail: 'sofiaos.core@gmail.com'"),'07/11/2026: e-mail da Sofia e corporativo, nunca e-mail de usuario');
});


test('v133: login usa e-mail, recuperação e troca de senha estão presentes',()=>{
  const html=read('public/index.html'),app=read('public/app.js'),handler=read('src/core/http-handler.js'),login=read('public/login.js'),runtime=read('src/config/runtime.js');
  assert.ok(handler.includes('name=\"email\"'));
  assert.ok(handler.includes('/forgot-password'));
  assert.ok(handler.includes('/auth/forgot-password'));
  assert.ok(handler.includes('/reset-password'));
  assert.ok(handler.includes('/auth/reset-password'));
  assert.ok(handler.includes("p==='/api/auth/change-password'"));
  assert.ok(handler.includes('ownerAuth.verifyLogin(email,password)'));
  assert.ok(html.includes('E-mail de login e recuperação'));
  assert.ok(html.includes('id=\"passwordChangeForm\"'));
  assert.ok(app.includes("'/api/auth/change-password'"));
  assert.ok(runtime.includes('SOFIA_LOGIN_EMAIL'));
  assert.ok(runtime.includes('SOFIA_SMTP_USER'));
  assert.ok(runtime.includes('SOFIA_SMTP_PASS'));
  assert.ok(login.includes('resetPasswordForm'));
});


test('v134: perfil da sidebar não corta conteúdo e menu da conta usa overlay de viewport',()=>{
  const css=read('public/ui-current.css'),app=read('public/app.js');
  assert.ok(css.includes('v134 — perfil da sidebar sem recorte'));
  assert.ok(css.includes('.mode-user .account-popover{'));
  assert.ok(css.includes('position:fixed!important'));
  assert.ok(css.includes('overflow-wrap:anywhere!important'));
  assert.ok(app.includes('function positionAccountPopover()'));
  assert.ok(app.includes("accountMenu?.addEventListener('toggle'"));
  assert.ok(app.includes("accountSessionLabel').title=email"));
});


test('v141: web permite apagar mensagem individual e limpar histórico sincronizado',()=>{
  const app=read('public/app.js'),html=read('public/index.html'),handler=read('src/core/http-handler.js'),store=read('src/memory/store.js');
  assert.ok(app.includes('deleteChatMessage(message)'));
  assert.ok(app.includes("api('/api/chat-history'"));
  assert.ok(html.includes('id="clearChatHistory"'));
  assert.ok(handler.includes("p==='/api/chat-history'"));
  assert.ok(handler.includes("m==='DELETE'&&match"));
  assert.ok(store.includes('deleteMessage(messageId)'));
  assert.ok(store.includes('clearChatHistory()'));
});


test('v142: templates oficiais substituem os antigos e o + oferece duas funções',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  for(const id of ["tasks_personal","notes_hub","playlist_links"])assert.ok(app.includes("id:'"+id+"'"));
  for(const title of ['Tarefas pessoal','Bloco de nota','Lista de reprodução'])assert.ok(app.includes("title:'"+title+"'"));
  for(const old of ['ideas_database','pages_directory'])assert.ok(!app.includes("id:'"+old+"'"));
  assert.ok(app.includes('function showPageCreateMenu(parent=null)'));
  assert.ok(app.includes('＋ Página em branco'));
  assert.ok(app.includes('▦ Usar template'));
  assert.ok(app.includes("$('addUserPage').onclick=()=>showPageCreateMenu()"));
  assert.ok(app.includes("showPageCreateMenu(state.selectedUserPage)"));
  assert.ok(css.includes('.page-create-choice'));
});

test('v142: quadro de tarefas permite criar, renomear, colorir e duplicar colunas',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.ok(app.includes('COLLECTION_STATUS_COLORS'));
  assert.ok(app.includes('function editCollectionBoardGroup'));
  assert.ok(app.includes("label:'Duplicar esta coluna'"));
  assert.ok(app.includes("btn('＋ Coluna'"));
  assert.ok(app.includes('option_colors'));
  assert.ok(css.includes('.collection-board-column.custom-status'));
  assert.ok(css.includes('.collection-add-column'));
});
