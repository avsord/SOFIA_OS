"""R7: heavy synthetic data, both policies, one QA-equivalent emulator binary.
No owner's records, no network, no uninstall or storage clearing. Re-seed each
trial because the existing 32-route/4MiB cache eviction policy remains intact.
Timing goals are REPORTED only in R7; crashes/lost local drafts fail correctness.
"""
import json, re, time, statistics, subprocess, xml.etree.ElementTree as ET, hashlib, importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];DIST=ROOT/'dist';OUT=DIST/'fluency-evidence';OUT.mkdir(parents=True,exist_ok=True)
PKG='com.avsord.sofiaapp';SEED=DIST/'QA-ONLY-fluency-seed.apk';QA=DIST/'QA-ONLY-manual-universal.apk'
RESULT={'pages_trials':[],'original_failure_mode':'new','correctness_passed':False,'performance_gate_enforced':False,'physical_device':False,'owner_apk_directly_executed':False,'same_qa_binary_both_modes':True,'offline':True,'trials':[], 'scope':'same-emulator New versus instrumented Old policy; cache only, no real user data'}
def adb(*args): return subprocess.check_output(['adb',*args],stderr=subprocess.STDOUT,timeout=90).decode(errors='replace')
def install_checked(apk,label):
 # 03/11/2026 (#282): o emulador continuou mostrando o APK anterior depois do "install -r"; confere os bytes instalados
 # e tenta mais uma vez (por cima, sem apagar dados) antes de seguir.
 import hashlib as _h,json as _j
 want=_h.sha256(Path(apk).read_bytes()).hexdigest()
 for attempt in (1,2):
  out=subprocess.run(['adb','install','-r',str(apk)],capture_output=True,text=True,timeout=120)
  path=subprocess.run(['adb','shell','pm','path','com.avsord.sofiaapp'],capture_output=True,text=True,timeout=30).stdout.strip().split('\n')[0].replace('package:','').strip()
  got=subprocess.run(['adb','shell','sha256sum',path],capture_output=True,text=True,timeout=60).stdout.split(' ')[0].strip() if path else ''
  print('SOFIA_INSTALL_DIAG '+_j.dumps({'label':label,'attempt':attempt,'rc':out.returncode,'out':(out.stdout+out.stderr).strip()[-300:],'path':path,'match':got==want}),flush=True)
  if out.returncode==0 and got==want:return
 raise AssertionError('Installed APK does not match '+label)
def xml():
 # 03/11/2026: o dump falha calado quando a tela nunca fica parada e o cat devolvia o arquivo ANTERIOR; apaga, confere e repete
 for attempt in range(4):
  subprocess.run(['adb','shell','rm','-f','/sdcard/r7.xml'],capture_output=True,timeout=30)
  out=subprocess.run(['adb','shell','uiautomator','dump','/sdcard/r7.xml'],capture_output=True,text=True,timeout=60)
  got=subprocess.run(['adb','shell','cat','/sdcard/r7.xml'],capture_output=True,text=True,timeout=30).stdout
  if got.strip().startswith('<?xml'):return got
  print('SOFIA_DUMP_RETRY '+json.dumps({'attempt':attempt,'out':(out.stdout+out.stderr).strip()[-200:]}),flush=True);time.sleep(1)
 raise AssertionError('UI dump failed (screen never idle?)')
def point(tree,label):
 found=[x for x in ET.fromstring(tree).iter('node') if x.get('text')==label or x.get('content-desc')==label]
 assert found,'Missing QA control '+label
 b=list(map(int,re.findall(r'\d+',found[-1].attrib['bounds'])));return (b[0]+b[2])//2,(b[1]+b[3])//2
def keyboard_shown(wait=3.0):
 end=time.monotonic()+wait
 while True:
  out=adb('shell','dumpsys','input_method')
  if re.search(r'mInputShown=true',out):time.sleep(.15);return True
  if time.monotonic()>=end:return False
  time.sleep(.1)
def tap(coords):adb('shell','input','tap',*[str(n) for n in coords])
def start():return adb('shell','am','start','-W','-n',PKG+'/.MainActivity')
def stop():adb('shell','am','force-stop',PKG)
def collect_logs():return adb('logcat','-d','-v','raw','-s','SofiaLaunch:I','SofiaMenu:I','ReactNativeJS:V','AndroidRuntime:E')
def seed(mode,scale=1):
 stop();adb('install','-r',str(SEED));start();time.sleep(.3)
 tree=xml()
 for i in range(1,scale):tap(point(tree,'Escala '+str(i)));tree=xml()
 tap(point(tree,'Semear '+('Novo' if mode=='new' else 'Antigo')))
 for _ in range(18):
  tree=xml()
  if 'QA R7 pronto '+mode+' seed' in tree:break
  assert 'QA R7 ERRO' not in tree,tree
  time.sleep(.25)
 else:raise AssertionError('Heavy QA seed did not finish')
 logs=collect_logs();entries=re.findall(r'SOFIA_QA_VOLUME (\{.*\})',logs)
 assert entries,'QA seed volume not recorded'
 volume=json.loads(entries[-1]);stop();install_checked(QA,'qa-'+mode);return volume
def wait_data():
 for _ in range(120):
  logs=collect_logs()
  assert 'FATAL EXCEPTION' not in logs,logs[-3000:]
  if 'SOFIA_LAUNCH_DATA_PROCESS_MS=' in logs:return time.monotonic(),logs
  time.sleep(.03)
 raise AssertionError('No Home DATA marker')
def events(logs):
 out={}
 for kind,line in re.findall(r'SOFIA_PERF_([A-Z]+) (\{[^\n]*\})',logs):
  try: out.setdefault(kind,[]).append(json.loads(line))
  except json.JSONDecodeError:pass
 return out
def cold_trial(mode,index,points,scale=1,video=False):
 expected=seed(mode,scale);stop();adb('logcat','-c')
 rec=None;label=f'{index:02d}-{mode}-x{scale}'
 if video:
  rec=subprocess.Popen(['adb','shell','screenrecord','--time-limit','15','/sdcard/r7.mp4'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(.25)
 am=start();observed,launch=wait_data();commands=[]
 for offset,name in [(0.5,'Páginas'),(1,'Conversa'),(1.5,'Agenda'),(2,'Apps'),(6,'Páginas'),(6.5,'Conversa'),(7,'Agenda'),(7.5,'Apps')]:
  pause=observed+offset-time.monotonic()
  if pause>0:time.sleep(pause)
  before=time.monotonic();tap(points[name]);commands.append({'tab':name,'targetSeconds':offset,'actualSeconds':round(before-observed,3),'adbDurationMs':round((time.monotonic()-before)*1000,1)})
 time.sleep(max(0,observed+12.8-time.monotonic()));logs=collect_logs();assert 'FATAL EXCEPTION' not in logs,logs[-4000:]
 (OUT/(label+'.log')).write_text(logs)
 if rec:
  rec.wait(timeout=20);adb('pull','/sdcard/r7.mp4',str(OUT/(label+'.mp4')))
 data=events(logs);assert data.get('SUMMARY'),'Missing R7 JS metrics summary, cannot claim performance test'
 summary=data['SUMMARY'][-1];assert summary['mode']==mode,(mode,summary)
 volumes=data.get('VOLUME',[]);assert volumes,'Full heavy cache was never observed'
 actual=max(volumes,key=lambda d:d['messages'])
 for field in ['pages','conversations','messages']:assert actual[field]>=expected[field],(field,actual,expected)
 assert actual['entities']>=expected['entities'],(actual,expected)
 timings={k:int(v) for k,v in re.findall(r'SOFIA_LAUNCH_(SYSTEM_CALLBACK|UI|DATA)_PROCESS_MS=(\d+)',launch)}
 result={'label':label,'mode':mode,'fixture':expected,'observedVolume':actual,'stages_ms':timings,'commands':commands,'metrics':data,'summary':summary,'activity_manager':am}
 (OUT/(label+'.json')).write_text(json.dumps(result,indent=2,ensure_ascii=False));RESULT['trials'].append(result)
 return result


# Per-mode first-content observations run in a separate fresh process so that
# probing does not delay the original 0.5/1/1.5/2s stress-tap sequence.
_spec=importlib.util.spec_from_file_location('pages_probe',Path(__file__).with_name('pages-first-content.py'))
_probe=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_probe)
_geom_spec=importlib.util.spec_from_file_location('ui_geometry',Path(__file__).with_name('ui-probes.py'))
_geom=importlib.util.module_from_spec(_geom_spec);_geom_spec.loader.exec_module(_geom)

def xml_bounded(remaining):
 before=time.monotonic()
 try:
  subprocess.run(['adb','shell','rm','-f','/sdcard/r71.xml'],capture_output=True,timeout=max(.5,remaining)) # sem arquivo velho se o dump falhar
  subprocess.check_output(['adb','shell','uiautomator','dump','/sdcard/r71.xml'],stderr=subprocess.STDOUT,timeout=remaining)
  rest=max(.001,remaining-(time.monotonic()-before))
  got=subprocess.run(['adb','shell','cat','/sdcard/r71.xml'],capture_output=True,timeout=rest).stdout.decode(errors='replace')
  return got if got.strip().startswith('<?xml') else '<?xml version="1.0"?><hierarchy rotation="0"></hierarchy>' # dump falhou: tela vazia, a medicao tenta de novo
 except subprocess.TimeoutExpired as error:
  raise TimeoutError('UIAutomator exceeded remaining observation window') from error

def observe_page_list(mode,trial,points):
 started=time.monotonic();tap(points['Páginas'])
 def snapshot(label,tree,observed):
  (OUT/(str(trial)+'-pages-'+label+'.xml')).write_text(tree)
 result=_probe.measure_pages(xml_bounded,mode=mode,trial=trial,started_at=started,on_snapshot=snapshot)
 print('SOFIA_PERF_PAGES_CONTENT '+json.dumps(result,ensure_ascii=False),flush=True)
 (OUT/(str(trial)+'-pages-content.json')).write_text(json.dumps(result,indent=2,ensure_ascii=False))
 return result

def pages_trial(mode,index,points,scale=1):
 expected=seed(mode,scale);stop();adb('logcat','-c');start();observed,launch=wait_data()
 # Matches the first Pages interaction of the stress protocol (0.5s after DATA).
 time.sleep(max(0,observed+.5-time.monotonic()))
 row=observe_page_list(mode,f'{index:02d}-{mode}-x{scale}-cold',points)
 row['fixture']=expected;row['separate_cold_start']=True
 logs=collect_logs();(OUT/(row['trial']+'-pages.log')).write_text(logs)
 row['crashed']='FATAL EXCEPTION' in logs
 row['correctness_passed']=row['correctness_passed'] and not row['crashed']
 RESULT['pages_trials'].append(row)
 return row

def correctness(points,mode):
 # No network or deleting: verify the actual editor survives hide/show with a dirty draft.
 page=observe_page_list(mode,'correctness-'+mode,points);RESULT['correctness_mode']=mode
 assert not page['false_empty'],'False empty Page list with confirmed heavy cache; mode='+mode
 if not page['content_visible']:
  try:
   t=(OUT/('correctness-'+mode+'-pages-content.xml')).read_text()
   seen=[n.get('text') or n.get('content-desc') for n in ET.fromstring(t).iter('node') if (n.get('text') or n.get('content-desc'))][:60]
  except Exception as err:seen=['(sem arvore: '+str(err)[:120]+')']
  print('SOFIA_PAGES_DIAG '+json.dumps({'mode':mode,'visible':seen},ensure_ascii=False),flush=True)
 assert page['content_visible'],'Heavy page list not visible within 8000ms; mode='+mode
 tree=(OUT/('correctness-'+mode+'-pages-content.xml')).read_text()
 (OUT/'pages-heavy.xml').write_text(tree)
 tap(point(tree,'Abrir página principal Página QA 0000'));time.sleep(.4);tree=xml()
 expected='_R8_KEEP'
 for cycle in range(20):
  # 03/11/2026: a #280 mostrou o BACK fechando a pagina (teclado ainda nao aberto) e o texto entrando no meio do titulo.
  # Espera o teclado abrir antes de mover o cursor/digitar; sem teclado o teste falha com o motivo certo.
  tap(point(tree,'Título da página'));assert keyboard_shown(),'Keyboard did not open on the Page title; mode='+mode+' cycle='+str(cycle)
  adb('shell','input','keyevent','KEYCODE_MOVE_END')
  addition=expected if cycle==0 else str(cycle%10)
  if cycle:expected+=addition
  adb('shell','input','text',addition);adb('shell','input','keyevent','BACK');time.sleep(.15)
  tap(points['Conversa']);time.sleep(.25);tap(points['Páginas']);time.sleep(.25)
  tree=xml();(OUT/(f'draft-{mode}-{cycle:02d}.xml')).write_text(tree)
  if expected not in tree:
   # 03/11/2026: diagnostico no log (os artefatos nem sempre podem ser baixados): o campo do titulo existe? o que tem nele?
   nodes=list(ET.fromstring(tree).iter('node'))
   title=[(n.get('text'),n.get('focused'),n.get('bounds')) for n in nodes if n.get('content-desc')=='Título da página' or 'Título da página' in (n.get('hint') or '')]
   seen=[n.get('text') or n.get('content-desc') for n in nodes if (n.get('text') or n.get('content-desc'))][:40]
   print('SOFIA_DRAFT_DIAG '+json.dumps({'mode':mode,'cycle':cycle,'expected':expected,'title_nodes':title,'visible':seen},ensure_ascii=False),flush=True)
  assert expected in tree,'Actual Page draft lost across Activity hide/show; mode='+mode+' cycle='+str(cycle)
  assert 'Algo deu errado nesta tela' not in tree and 'Vamos reabrir' not in tree,'Screen error while preserving Page draft'
 RESULT.setdefault('draft_cycles',{})[mode]=20
 RESULT['page_draft_preserved']=True
 # Page is open and blocks horizontal gestures; use Home, then swipe to Chat.
 tap(points['Início']);time.sleep(.5);tree=xml();(OUT/'home-before-swipe.xml').write_text(tree)
 swipe=_geom.home_pager_swipe(tree)
 RESULT.setdefault('pager_swipe_targets',{})[mode]=swipe
 rec=subprocess.Popen(['adb','shell','screenrecord','--time-limit','6','/sdcard/r7-swipe.mp4'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(.3)
 try:
  adb('shell','input','swipe',*[str(v) for v in swipe],'450');time.sleep(.8)
  tree=xml();(OUT/('after-swipe-'+mode+'.xml')).write_text(tree)
  assert 'Mensagem para a Sofia' in tree,'Swipe did not reach neighboring content; mode='+mode
 finally:
  rec.wait(timeout=10);adb('pull','/sdcard/r7-swipe.mp4',str(OUT/('swipe-neighbor-'+mode+'.mp4')))
 RESULT['swipe_video_retained']=True;RESULT['audio_behavior_observed']=False

def percentile(values,p=.95):
 if not values:return None
 a=sorted(values);return a[min(len(a)-1,max(0,int((len(a)-1)*p+.999999)))]
def summarize():
 out={}
 for mode in ['old','new']:
  trials=[t for t in RESULT['trials'] if t['mode']==mode]
  taps=[p['ms'] for t in trials for p in t['metrics'].get('TAP',[])]
  blocks=[p for t in trials for p in t['metrics'].get('BLOCK',[]) if p['early']]
  out[mode]={'trials':len(trials),'first5sBlocksOver50':len(blocks),'first5sBlocksOver100':sum(p['delayMs']>100 for p in blocks),'first5sMaxMs':max([p['delayMs'] for p in blocks] or [0]),'tapP95Ms':percentile(taps),'tapSamples':len(taps),'stagesMedianMs':{k:statistics.median(t['stages_ms'][k] for t in trials) for k in ['SYSTEM_CALLBACK','UI','DATA']},'top5Blocks':sorted(blocks,key=lambda p:p['delayMs'],reverse=True)[:5]}
 RESULT['comparison']=out
 RESULT['old_reproduced']=out['old']['first5sBlocksOver100']>0 or (out['old']['tapP95Ms'] or 0)>100
 RESULT['new_targets_met']=out['new']['first5sBlocksOver100']==0 and out['new']['tapP95Ms'] is not None and out['new']['tapP95Ms']<=100
try:
 for key in ['window_animation_scale','transition_animation_scale','animator_duration_scale']:adb('shell','settings','put','global',key,'1')
 adb('shell','svc','wifi','disable');adb('shell','svc','data','disable');adb('shell','cmd','connectivity','airplane-mode','enable')
 RESULT['qa_sha256']=hashlib.sha256(QA.read_bytes()).hexdigest();RESULT['source_sha']=(DIST/'SOURCE_COMMIT.txt').read_text().strip()
 seed('old');start();wait_data();time.sleep(2);tree=xml()
 points={label:point(tree,label) for label in ['Início','Páginas','Conversa','Agenda','Apps','Perfil']};RESULT['menu_points']=points
 for i,mode in enumerate(['old','new','new','old','old','new','new','old','old','new']):
  cold_trial(mode,i+1,points,video=i<2)
  pages_trial(mode,i+1,points)
 summarize()
 if not RESULT['old_reproduced']:
  RESULT['fixture_escalated']=True
  cold_trial('old',11,points,scale=2,video=True);cold_trial('new',12,points,scale=2,video=True);summarize()
  RESULT['caution']='Escalated trials x2 reported separately by label; mixed-volume summary is exploratory, not equal-load improvement percent'
 RESULT['pages_by_mode']={mode:[{'trial':r['trial'],'pages_first_content_ms':r['pages_first_content_ms'],'correctness_passed':r['correctness_passed'],'goal_met':r['goal_met'],'false_empty':r['false_empty'],'timed_out':r['timed_out']} for r in RESULT['pages_trials'] if r['mode']==mode] for mode in ['old','new']}
 RESULT['pages_failed_modes']=sorted({r['mode'] for r in RESULT['pages_trials'] if not r['correctness_passed']})
 RESULT['pages_all_targets_met']=all(r['goal_met'] for r in RESULT['pages_trials'])
 assert not RESULT['pages_failed_modes'],'First page content correctness failed; modes='+','.join(RESULT['pages_failed_modes'])+'; inspect per-trial JSON (goal is reported separately)'
 for mode in ['old','new']:
  seed(mode);stop();adb('logcat','-c');start();wait_data()
  correctness(points,mode)
  logs=collect_logs();(OUT/('correctness-'+mode+'-logcat.txt')).write_text(logs)
  assert not events(logs).get('ERROR') and 'FATAL EXCEPTION' not in logs,'Runtime exception during editor/pager correctness; mode='+mode
 RESULT['correctness_passed']=True
finally:
 try:
  logs=collect_logs();(OUT/'final-logcat.txt').write_text(logs)
  RESULT['runtime_errors']=events(logs).get('ERROR',[])
 except Exception as diagnostic_error:RESULT['log_collection_error']=str(diagnostic_error)
 (OUT/'result.json').write_text(json.dumps(RESULT,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({k:v for k,v in RESULT.items() if k!='trials'},ensure_ascii=False))
