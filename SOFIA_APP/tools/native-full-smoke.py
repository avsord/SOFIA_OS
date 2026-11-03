"""Real production shell with isolated transport: MD acceptance, no personal account."""
import subprocess,time,re,json,xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime,timedelta
out=Path('dist/full-app-evidence');out.mkdir(parents=True,exist_ok=True)
pkg='com.avsord.sofiaapp';checks=[]
def adb(*a):return subprocess.check_output(['adb',*a],timeout=30)
def tree():
 adb('shell','uiautomator','dump','/sdcard/full.xml')
 return ET.fromstring(adb('shell','cat','/sdcard/full.xml'))
def find(root,label):
 nodes=[n for n in reversed(list(root.iter('node'))) if n.get('bounds')!='[0,0][0,0]']
 for attr in ['content-desc','resource-id','text']:
  for n in nodes:
   if n.get(attr)==label or (attr=='resource-id' and n.get(attr,'').endswith(label)):return n
 return None
def wait(label):
 for _ in range(12):
  root=tree();n=find(root,label)
  if n is not None:return n
  time.sleep(.3)
 raise AssertionError('Missing '+label+' '+ET.tostring(root,encoding='unicode'))
def box(n):return list(map(int,re.findall(r'\d+',n.get('bounds'))))
def tap(label):
 x,y,r,b=box(wait(label));adb('shell','input','tap',str((x+r)//2),str((y+b)//2));time.sleep(.2)
def snapshot(name):
 assert adb('shell','pidof',pkg).strip()==pid,'App restarted'
 root=tree();(out/(name+'.xml')).write_text(ET.tostring(root,encoding='unicode'));(out/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'));checks.append(name);return root
def swipe(x,y,tx,ty,duration=450):adb('shell','input','swipe',str(x),str(y),str(tx),str(ty),str(duration));time.sleep(.3)
def hold(label,icon=False):
 x,y,r,b=box(wait(label));x=x+18 if icon else (x+r)//2;swipe(x,(y+b)//2,x,(y+b)//2,800)
def back():adb('shell','input','keyevent','4');time.sleep(.3)
adb('shell','settings','put','secure','show_ime_with_hard_keyboard','1')
wait('Início');pid=adb('shell','pidof',pkg).strip();assert pid
# Fast interrupted gestures and taps; the last settled menu must not roll back.
record=subprocess.Popen(['adb','shell','screenrecord','--time-limit','25','/sdcard/menu-motion.mp4'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for repeat in range(2):
 swipe(620,850,100,850,600);swipe(100,850,620,850,600)
for repeat in range(3):
 swipe(620,850,100,850,100);swipe(100,850,620,850,100)
time.sleep(1)
root=snapshot('00-rapid-gestures-diagnostic');selected=[n.get('content-desc') for n in root.iter('node') if n.get('selected')=='true' and n.get('resource-id','') in ['menu-home','menu-chat','menu-pages','menu-agenda','menu-apps','menu-profile']]
assert len(selected)==1,[dict(n.attrib) for n in root.iter('node') if n.get('resource-id','').startswith('menu-')]
time.sleep(1.2)
root=tree();assert selected==[n.get('content-desc') for n in root.iter('node') if n.get('selected')=='true' and n.get('resource-id','') in ['menu-home','menu-chat','menu-pages','menu-agenda','menu-apps','menu-profile']]
snapshot('00-rapid-gestures-settled')
for label in ['Páginas','Agenda','Conversa','Apps','Perfil','Início']:tap(label)
wait('Consulta de hoje');snapshot('00b-rapid-tabs-final-home')
# Home is real Home inside production pager. No conversation card.
wait('Agenda');wait('Consulta de hoje');root=snapshot('01-home')
assert 'Sua Sofia está aqui' not in ET.tostring(root,encoding='unicode')
a=box(wait('agenda-calendar-half'));b=box(wait('agenda-items-half'));assert b[0]<a[0] and abs((a[2]-a[0])-(b[2]-b[0]))<=2 and abs(a[1]-b[1])<=2,(a,b)
# Swipe calendar switches month while Home stays selected.
x,y,r,b=box(wait('agenda-calendar-half'))
month_before=ET.tostring(tree(),encoding='unicode')
before_days={n.get('content-desc') for n in tree().iter('node') if n.get('resource-id','').startswith('agenda-day-')}
for attempt in range(3):
 sx=x+40;ex=r-40;sy=y+110
 adb('shell','input','motionevent','DOWN',str(sx),str(sy));time.sleep(.1)
 for step in range(1,13):
  adb('shell','input','motionevent','MOVE',str(round(sx+(ex-sx)*step/12)),str(sy));time.sleep(.04)
 adb('shell','input','motionevent','UP',str(ex),str(sy));time.sleep(.8)
 current_days={n.get('content-desc') for n in tree().iter('node') if n.get('resource-id','').startswith('agenda-day-')}
 if current_days!=before_days:break
snapshot('01b-month-gesture-result')
after_days={n.get('content-desc') for n in tree().iter('node') if n.get('resource-id','').startswith('agenda-day-')}
assert before_days and after_days and before_days!=after_days,'Calendar swipe must change month'
wait('Início');snapshot('01b-month-swipe');tap('Voltar ao dia de hoje');wait('Consulta de hoje')
# Day selection changes the adjacent list without navigating away.
day=(datetime.now()+timedelta(days=1)).strftime('%d/%m/%Y')
root=tree();daynode=next(n for n in root.iter('node') if n.get('content-desc','').startswith(day))
x,y,r,b=box(daynode);adb('shell','input','tap',str((x+r)//2),str((y+b)//2));wait('Compromisso de amanha');snapshot('02-agenda-day-selection')
# Popup comes from the actual bell and dates are grouped.
bell=box(wait('Notificações: 2 não lidas'));tap('Notificações: 2 não lidas');wait('Hoje');wait('Ontem');popup=box(wait('notification-popover'));assert popup[1]>=bell[3],(bell,popup);snapshot('03-bell-anchor')
# Record the real modal surface: its dim layer must not pulse while opening/closing.
bell_record=subprocess.Popen(['adb','shell','screenrecord','--time-limit','25','/sdcard/bell-motion.mp4'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(.5)
for cycle in range(3):
 back();time.sleep(.4);tap('Notificações: 2 não lidas');wait('notification-popover');snapshot('03b-bell-stable-'+str(cycle))
bell_record.wait(timeout=30);adb('pull','/sdcard/bell-motion.mp4',str(out/'bell-motion.mp4'))
# A fixed background strip below the popover is only covered by the scrim.
raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(out/'bell-motion.mp4'),'-vf','crop=14:30:4:1400,scale=1:1','-f','rawvideo','-pix_fmt','gray','-'])
values=list(raw);assert values and min(values)>90,(min(values) if values else None)
cut=(min(values)+max(values))/2;states=[v<cut for v in values];transitions=sum(a!=b for a,b in zip(states,states[1:]));assert 4<=transitions<=6,('backdrop pulsed',transitions,min(values),max(values))
(out/'bell-backdrop-luminance.json').write_text(json.dumps({'frames':len(values),'min':min(values),'max':max(values),'transitions':transitions,'passed':True}))
tap('Marcar como lida: Lembrete da agenda');tap('Ver todas as notificações');wait('Notificações');wait('Agenda · 1');snapshot('04-notification-center');back()
# Settings split, appearance, real version, and configured state visible.
tap('Perfil');wait('Perfil do usuário');wait('E-MAIL DE LOGIN');snapshot('05-profile-first');tap('Configurações do aplicativo');wait('Versão instalada 0.3.33');tap('Escuro');snapshot('06-settings-dark');tap('Claro')
# Apps goes back exactly to Apps; hardware back does not jump to Home.
tap('Apps');wait('Apps');tap('Tarefas');wait('Nova tarefa');snapshot('07-tasks');back();wait('Apps');snapshot('08-apps-back')
# Apps with slow responses preserve their confirmed rows/empty message on reentry.
from PIL import Image,ImageChops
import io
for module,label,stem in [('Biblioteca','Livro preservado','library'),('Listas','Nenhum registro aqui','empty-list')]:
 tap(module);wait(label);snapshot('08b-'+stem+'-loaded');reference=Image.open(io.BytesIO(adb('exec-out','screencap','-p'))).convert('RGB');back();wait('Apps')
 coords=box(wait(module));adb('shell','input','tap',str((coords[0]+coords[2])//2),str((coords[1]+coords[3])//2))
 metrics=[]
 for frame_id in range(3):
  pixels=adb('exec-out','screencap','-p');(out/f'08c-{stem}-return-{frame_id}.png').write_bytes(pixels);frame=Image.open(io.BytesIO(pixels)).convert('RGB');crop=(0,280,720,1300);diff=ImageChops.difference(reference.crop(crop),frame.crop(crop));fraction=sum(max(p)>12 for p in diff.getdata())/(720*1020);metrics.append(fraction);assert fraction<.015,(module,'content flashed',fraction)
 wait(label);(out/(stem+'-reentry-pixels.json')).write_text(json.dumps(metrics))
 if module=='Biblioteca':
  wait('Tudo');wait('Documento preservado');tap('Tipo de registro');tap('Livro');wait('Livro preservado');assert find(tree(),'Documento preservado') is None;snapshot('08d-library-filtered');tap('Tipo de registro');tap('Tudo');wait('Livro preservado');wait('Documento preservado');snapshot('08e-library-all');tap('Criar registro');wait('Novo registro na Biblioteca');wait('Criar Livro');wait('Criar Documento');snapshot('08f-library-create-types');back()
  tap('Tipo de registro');tap('Filme');wait('Filme de Acao');wait('Filtrar por estrelas');wait('Filtrar por gênero');tap('Filtrar por estrelas');tap('5 estrelas');wait('Filme de Drama');assert find(tree(),'Filme de Acao') is None;snapshot('08g-film-five-stars')
  tap('Filtrar por gênero');tap('Comédia');wait('Nenhum filme neste filtro');tap('Filtrar por estrelas');tap('Sem avaliação');wait('Filme de Comedia');snapshot('08h-film-genre-unrated');tap('Filtrar por gênero');tap('Todos os gêneros');tap('Filtrar por estrelas');tap('Todas as avaliações');wait('Filme de Acao');tap('Filme de Acao');wait('Dar 4 estrelas');tap('Dar 4 estrelas');snapshot('08i-film-rating-edit')
  for _ in range(7):
   if find(tree(),'Salvar alterações') is not None:break
   swipe(640,1240,640,550,250)
  tap('Salvar alterações');wait('Filme de Acao');wait('Avaliação: 4 de 5 estrelas');tap('Filme de Acao');wait('4 de 5 estrelas');snapshot('08j-film-rating-reopened');tap('Fechar editor')
  tap('Tipo de registro');tap('Livro');wait('Livro preservado');wait('Filtrar por gênero literário');tap('Livro preservado');tap('Dar 3 estrelas');tap('Gênero literário');adb('shell','input','text','Romance');back()
  for _ in range(7):
   if find(tree(),'Salvar alterações') is not None:break
   swipe(640,1240,640,550,250)
  tap('Salvar alterações');wait('Livro preservado');wait('Avaliação: 3 de 5 estrelas');tap('Filtrar por gênero literário');tap('Romance');wait('Livro preservado');snapshot('08k-book-rating-genre');tap('Livro preservado');wait('3 de 5 estrelas');assert wait('Gênero literário').get('text')=='Romance';snapshot('08l-book-rating-reopened');tap('Fechar editor')
  # Personal areas: fields suggested by name, real saved data creates filter options.
  tap('Nova área');tap('Nome da área');adb('shell','input','text','Artistas% sde% sfotografia'.replace('% s','%s'));back();assert wait('Filtro 1').get('text')=='Estilo';assert wait('Filtro 2').get('text')=='Técnica';snapshot('08m-custom-area-fields')
  for _ in range(5):
   if find(tree(),'Salvar área') is not None:break
   swipe(640,1240,640,500,250)
  tap('Salvar área');wait('Editar área');tap('Criar registro');tap('Nome do registro');adb('shell','input','text','Artista%stest');back();tap('Dar 5 estrelas')
  for label,value in [('Estilo','Retrato'),('Técnica','Digital'),('País','Brasil')]:
   for _ in range(4):
    if find(tree(),label) is not None:break
    swipe(640,1240,640,650,250)
   tap(label);adb('shell','input','text',value);back()
  for _ in range(5):
   if find(tree(),'Salvar registro') is not None:break
   swipe(640,1240,640,550,250)
  tap('Salvar registro');wait('Artista test');wait('Filtrar por Estilo');tap('Filtrar por Estilo');tap('Retrato');tap('Filtrar por estrelas');tap('5 estrelas');wait('Artista test');snapshot('08n-custom-auto-filters');tap('Artista test');wait('5 de 5 estrelas');assert wait('Estilo').get('text')=='Retrato';snapshot('08o-custom-record-reopened');tap('Fechar área da Biblioteca');back();wait('Apps');tap('Biblioteca');wait('Tudo');wait('Artista test');snapshot('08p-custom-in-all')
 back();wait('Apps')
# Entry-path navigation: direct tree entry returns to menu, nested entry returns to parent.
tap('Páginas');wait('Abrir página principal Teste principal');tap('Expandir subpáginas de Teste principal');tap('Expandir subpáginas de Teste filha');tap('Abrir subpágina Teste neta');wait('Título da página');snapshot('09-direct-grandchild');back();wait('Abrir página principal Teste principal');assert find(tree(),'Título da página') is None

tap('Abrir página principal Teste principal');tap('Abrir subpágina Teste filha');tap('Abrir subpágina Teste neta');back();assert wait('Título da página').get('text')=='Teste filha';snapshot('10-back-to-parent');back();assert wait('Título da página').get('text')=='Teste principal';snapshot('11-back-to-grandparent');back();wait('Criar página')
# Actual icon/text holds and cancellation stay alive with no writes/deletes.
for i in range(2):
 hold('Abrir página principal Teste principal',True);wait('Excluir página Teste principal');snapshot('12-root-hold-'+str(i));tap('Fechar ações da página')
hold('Abrir página principal Outra pagina');wait('Excluir página Outra pagina');tap('Fechar ações da página');wait('QA moves 0 deletes 0')
tap('Abrir página principal Teste principal');hold('Abrir subpágina Teste filha',True);wait('Excluir página Teste filha');snapshot('13-child-hold');tap('Fechar ações da página');back()
# Remote refresh and drag: exactly one persisted move with real label preserved.
tap('QA atualizar remoto');wait('Abrir página principal Nome remoto')
x,y,r,b=box(wait('Abrir página principal Nome remoto'));tx,ty,tr,tb=box(wait('Abrir página principal Teste principal'));x+=18;y=(y+b)//2;tx+=18;ty=(ty+tb)//2
adb('shell','input','motionevent','DOWN',str(x),str(y));time.sleep(.4)
for i in range(1,9):adb('shell','input','motionevent','MOVE',str(round(x+(tx-x)*i/8)),str(round(y+(ty-y)*i/8)));time.sleep(.04)
adb('shell','input','motionevent','UP',str(tx),str(ty));wait('Abrir subpágina Nome remoto');wait('QA moves 1 deletes 0');snapshot('14-icon-drag')
# Exact templates and identity preservation. Applying content keeps page title.
tap('Abrir página principal Teste principal');tap('Criar página ou usar template');tap('Usar template de conteúdo')
for label in ['Quadro de tarefas','Notas','Coleção']:wait('Aplicar template '+label)
snapshot('15-template-picker');tap('Aplicar template Quadro de tarefas');wait('Não iniciada');snapshot('16-template-preserves-page')
# A board pan away from the edge must not navigate back.
node=wait('Não iniciada');x,y,r,b=box(node);swipe((x+r)//2,(y+b)//2,(x+r)//2+180,(y+b)//2);wait('Título da página');snapshot('17-board-pan-stays-in-page')
# Empty page: hint, body editor, autosave and undo/redo.
back();tap('Criar página');tap('Criar página em branco');wait('Título da página');snapshot('18-empty-page')
tap('Título da página');adb('shell','input','text','Minha%spagina');back();time.sleep(1);snapshot('19-autosave-title');tap('Desfazer');time.sleep(.8);tap('Refazer');time.sleep(.8);snapshot('20-undo-redo');back();wait('Abrir página principal Minha pagina');snapshot('21-saved-title-in-tree')
# Notebook flows use production components and persist through the page autosave API.
tap('Abrir página principal Minha pagina');tap('Criar página ou usar template');tap('Usar template de conteúdo');tap('Aplicar template Notas');tap('Nova pasta');tap('Nome da pasta');adb('shell','input','text','Trabalho');back();tap('Criar pasta');wait('Abrir pasta Trabalho');snapshot('21d-notebook-created')
tap('Nova nota em Trabalho');wait('Ao começar a escrever');root=snapshot('21d-empty-note');assert find(root,'leaf-format-toolbar') is None;tap('Título da nota');adb('shell','input','text','Reuniao');back();tap('Conteúdo da nota');adb('shell','input','text','Conteudo%spreservado');back();time.sleep(1);root=snapshot('21e-leaf-edited');assert find(root,'Ao começar a escrever') is None;assert find(root,'leaf-format-toolbar') is None
# Manual date and time: edit the day and choose another visible minute.
tap('Criado em');wait('Confirmar data e horário')
now=datetime.now();target=(now+timedelta(days=1)) if now.day<27 else now-timedelta(days=1)
tap('Selecionar '+target.strftime('%d/%m/%Y'))
root=tree();minutes=[n for n in root.iter('node') if n.get('content-desc','').startswith('Minuto ') and box(n)[3]-box(n)[1]>30]
assert minutes
n=minutes[0];x,y,r,b=box(n);adb('shell','input','tap',str((x+r)//2),str((y+b)//2))
tap('Confirmar data e horário');snapshot('21i-manual-created-date')
tap('Conteúdo da nota');wait('leaf-format-toolbar');snapshot('21j-keyboard-toolbar');tap('Estilos de texto');wait('Título 1');wait('Lista de tarefas');wait('Citação');snapshot('21h-text-styles');tap('Título 1');wait('Conteúdo da nota')
tap('Ações da nota');tap('Duplicar');wait('Título da nota');snapshot('21f-leaf-duplicate');tap('Voltar às notas');wait('Abrir nota Reuniao');root=snapshot('21g-leaf-direct-return');assert find(root,'Título da pasta') is None;back();wait('Criar página')
# Apps repeated tap returns to root, then editor shows visual dates safely below status bar.
tap('Apps');tap('Tarefas');wait('Nova tarefa');tap('Apps');wait('Apps');snapshot('21b-apps-reset')
tap('Agenda');tap('Criar item na data selecionada');wait('Criar · Compromisso');tap('Início');wait('Confirmar data e horário');snapshot('21c-date-picker');back();back()
# Chat remains a dedicated destination; existing messages and selection work.
tap('Conversa');wait('Você: Mensagem preservada');hold('Você: Mensagem preservada');snapshot('22-chat-selection');back()
# Attachment menu and real software keyboard geometry (no simulated keyboard coordinates).
tap('Anexar arquivo');wait('Imagens');wait('Documentos');wait('Câmera');snapshot('23-attachment-menu');back()
adb('shell','settings','put','secure','show_ime_with_hard_keyboard','1')
tap('Mensagem para a Sofia');adb('shell','input','text','Teclado');time.sleep(1)
root=snapshot('24-chat-keyboard');composer=box(wait('chat-composer'))
ime=adb('shell','dumpsys','input_method').decode();windows=adb('shell','dumpsys','window').decode()
(out/'keyboard-input-method.txt').write_text(ime);(out/'keyboard-window.txt').write_text(windows)
assert re.search(r'mInputShown=true|mIsInputViewShown=true',ime),'IME must report that its input is shown'
frames=[]
for line in windows.splitlines():
 if ('ITYPE_IME' in line or 'type=ime' in line) and 'visible=true' in line:
  match=re.search(r'frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]',line)
  if match:
   bounds=list(map(int,match.groups()))
   if bounds[3]>bounds[1] and bounds[1]>0:frames.append(bounds)
assert frames,'Visible IME frame must be present in Android window insets'
keyboard_top=min(b[1] for b in frames);assert composer[3]<=keyboard_top+3,(composer,keyboard_top)
(out/'keyboard-geometry.json').write_text(json.dumps({'composer':composer,'ime_frames':frames,'passed':True}))
back()
# Pick a real document with Android's system picker, then upload and persist its reference.
adb('shell','mkdir','-p','/sdcard/Download')
fixture=out/'Sofia-QA.txt';fixture.write_text('Arquivo sintetico para verificar anexos.')
adb('push',str(fixture),'/sdcard/Download/Sofia-QA.txt')
adb('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file:///sdcard/Download/Sofia-QA.txt')
tap('Anexar arquivo');tap('Documentos');time.sleep(1);snapshot('24b-document-picker')
root=tree()
if find(root,'Sofia-QA.txt') is None:
 tap('Show roots');tap('Downloads')
tap('Sofia-QA.txt');time.sleep(.5)
root=tree()
for confirm in ['OPEN','Open','SELECT','Select']:
 if find(root,confirm) is not None:tap(confirm);break
wait('Remover anexo Sofia-QA.txt');snapshot('25-document-preview');tap('Enviar mensagem');wait('QA uploads 1');wait('Abrir anexo Sofia-QA.txt');snapshot('26-document-sent')
record.wait(timeout=30);adb('pull','/sdcard/menu-motion.mp4',str(out/'menu-motion.mp4'))
logs=adb('logcat','-d','-s','ReactNativeJS:E','AndroidRuntime:E').decode();(out/'native-errors.txt').write_text(logs)
assert 'FATAL EXCEPTION' not in logs and 'TypeError' not in logs,logs
(out/'result.json').write_text(json.dumps({'passed':True,'screens':sorted(p.stem for p in out.glob('*.png')),'synthetic_transport':True,'production_shell':True},indent=2))
print('PASS: production shell MD acceptance: home, agenda halves/day, anchored bell, shared center, settings/themes, Apps back, page ancestor back, holds, drag, templates, autosave/undo/redo, chat selection')
