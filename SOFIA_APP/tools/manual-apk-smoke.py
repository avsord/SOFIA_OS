"""QA-equivalent universal APK; synthetic local-start smoke on an x86_64 emulator.
The installed ARM64-only owner APK cannot execute on this x86_64 emulator.
A QA twin is built from the same commit, with identical DEX, JS and ARM64 libs.
Retained QA seed first populates synthetic records; no real owner data is used.
The test never authenticates against the owner's server account or edits its data.
"""
import hashlib,io,json,re,statistics,subprocess,time,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
root=Path(__file__).resolve().parents[1];dist=root/'dist';out=dist/'manual-evidence';out.mkdir(parents=True,exist_ok=True)
pkg='com.avsord.sofiaapp'
def adb(*args):return subprocess.check_output(['adb',*args],timeout=60)
def xml():
 adb('shell','uiautomator','dump','/sdcard/manual-startup.xml')
 return adb('shell','cat','/sdcard/manual-startup.xml').decode(errors='replace')
def cold(label):
 adb('shell','am','force-stop',pkg);adb('logcat','-c')
 manager=adb('shell','am','start','-W','-n',pkg+'/.MainActivity').decode(errors='replace')
 logs=''
 for _ in range(75):
  logs=adb('logcat','-d','-s','SofiaLaunch:I','AndroidRuntime:E').decode(errors='replace')
  if 'SOFIA_LAUNCH_DATA_PROCESS_MS=' in logs:break
  time.sleep(.2)
 (out/(label+'.txt')).write_text(logs)
 assert 'FATAL EXCEPTION' not in logs,logs
 stages={name:int(value) for name,value in re.findall(r'SOFIA_LAUNCH_(SYSTEM_CALLBACK|UI|LOCAL_READY|FADE_START|FADE_DONE|SPLASH_REMOVED|DATA)_PROCESS_MS=(\d+)',logs)}
 assert 'DATA' in stages,logs
 assert stages['UI']<=stages['LOCAL_READY']<=stages['DATA'],stages
 icon=re.search(r'SOFIA_LAUNCH_ICON_KIND=([A-Za-z0-9_$]+)',logs)
 image=re.search(r'SOFIA_LAUNCH_ICON_IS_IMAGE_VIEW=(true|false)',logs)
 surface=re.search(r'SOFIA_LAUNCH_ICON_IS_SURFACE_VIEW=(true|false)',logs)
 return {'stages_ms':stages,'activity_manager':manager,'icon_kind':icon.group(1) if icon else None,
         'icon_is_image_view':image.group(1)=='true' if image else None,
         'icon_is_surface_view':surface.group(1)=='true' if surface else None}
def capture(label):
 tree=xml();(out/(label+'.xml')).write_text(tree);(out/(label+'.png')).write_bytes(adb('exec-out','screencap','-p'));return tree
# 03/11/2026: o Inicio atual saúda com "Bom dia/Boa tarde/Boa noite, <nome>" (nome em itálico, mesmo texto na árvore)
# e no celular mostra a Agenda do site ("Agenda · próximos" e a frase do dia) no lugar do mini calendário
# ("..., com compromissos"). StartupHome (só com conta salva) continua com "Olá, Teste.". A proteção é a mesma:
# conta autenticada visível e registros da agenda salvos aparecendo na abertura.
# (A #278 parou antes, no teste do servidor tests/foto-leitura-203, instável por causa do Quadro em segundo plano; corrigido.)
GREETING=re.compile(r'(Olá|Bom dia|Boa tarde|Boa noite), Teste')
def home_authenticated(tree):return bool(GREETING.search(tree))
def home_agenda_visible(tree):
 if 'com compromissos' in tree or re.search(r'Você tem \d+ compromissos? hoje',tree):return True
 return 'Agenda · próximos' in tree and 'Nenhum compromisso pela frente' not in tree
def capture_home(label,need_agenda=True,wait=6.0):
 end=time.monotonic()+wait
 while True:
  tree=capture(label)
  if home_authenticated(tree) and (not need_agenda or home_agenda_visible(tree)):return tree
  if time.monotonic()>=end:
   # diagnostico no log (os artefatos do CI nem sempre podem ser baixados): o que estava na tela quando falhou
   seen=[n.attrib.get('text') or n.attrib.get('content-desc') for n in ET.fromstring(tree).iter('node') if (n.attrib.get('text') or n.attrib.get('content-desc'))][:60]
   print('SOFIA_HOME_DIAG '+json.dumps({'label':label,'authenticated':home_authenticated(tree),'agenda':home_agenda_visible(tree),'visible':seen},ensure_ascii=False),flush=True)
   return tree
  time.sleep(.5)
def tap_label(tree,label):
 for n in ET.fromstring(tree).iter('node'):
  if n.attrib.get('text')==label or n.attrib.get('content-desc')==label:
   bounds=list(map(int,re.findall(r'\d+',n.attrib['bounds'])));adb('shell','input','tap',str((bounds[0]+bounds[2])//2),str((bounds[1]+bounds[3])//2));return
 raise AssertionError('Missing control '+label)
result={'passed':False,'production_apk':False,'qa_emulator_twin':True,'exact_owner_apk_executed':False,'synthetic_seed_records':True,'synthetic_transport_in_tested_apk':False,'physical_device':False,'real_user_data_preservation_tested':False,'published':False,'source_sha':(dist/'SOURCE_COMMIT.txt').read_text().strip(),'apk_sha256':hashlib.sha256((dist/'Sofia-OS.apk').read_bytes()).hexdigest(),'qa_apk_sha256':hashlib.sha256((dist/'QA-ONLY-manual-universal.apk').read_bytes()).hexdigest(),'baseline_runs':[],'previous_105_runs':[],'previous_106_runs':[],'candidate_runs':[]}
try:
 for name in ['window_animation_scale','transition_animation_scale','animator_duration_scale']:adb('shell','settings','put','global',name,'1')
 adb('install',str(dist/'baseline-Sofia-OS.apk'))
 adb('install','-r',str(dist/'seed-060/QA-ONLY-full-fixture.apk'))
 adb('shell','pm','grant',pkg,'android.permission.POST_NOTIFICATIONS')
 cold('seed-060');time.sleep(3)
 seed=capture('seed-060');assert 'Olá, Teste.' in seed,'Synthetic account did not reach Home'
 tap_label(seed,'Conversa');time.sleep(1)
 tap_label(xml(),'Mensagem para a Sofia');adb('shell','input','text','Teste%srolagem')
 tap_label(xml(),'Enviar mensagem');time.sleep(4)
 adb('shell','input','keyevent','BACK');time.sleep(.4)
 seeded_chat=capture('seeded-history');assert 'FIM DA RESPOSTA QA' in seeded_chat,'Long synthetic conversation was not seeded'
 tap_label(seeded_chat,'Início');time.sleep(2)
 adb('shell','am','force-stop',pkg)
 adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
 adb('shell','cmd','connectivity','airplane-mode','enable')
 result['offline']=True
 # Compare the exact last delivered 0.3.65, not the older retained seed.
 previous=dist/'previous-065.apk'
 baseline_zip=subprocess.check_output(['gh','api','repos/avsord/sofiaos/actions/artifacts/11578764274/zip'],timeout=120)
 with zipfile.ZipFile(io.BytesIO(baseline_zip)) as archive:
  previous.write_bytes(archive.read('Sofia-OS.apk'))
 result['baseline_version']='0.3.65'
 result['baseline_apk_sha256']=hashlib.sha256(previous.read_bytes()).hexdigest()
 assert result['baseline_apk_sha256']=='6b5a5732edf762cab14092ccb2e4da1577f0a87e94c0af8dcbe4de42205d3bc5'
 adb('install','-r',str(previous))
 for i in range(5):result['baseline_runs'].append(cold('baseline-'+str(i)))
 before=capture('baseline');assert 'Olá, Teste.' in before,'Previous production APK did not restore the saved account'
 owner_baseline=dist/'previous-094/Sofia-OS.apk'
 assert hashlib.sha256(owner_baseline.read_bytes()).hexdigest()=='b783cd88c499cace1b29e4e564f23d26b45674d82dfe2d87537c3acd1cbea223'
 adb('install','-r',str(owner_baseline))
 result['owner_baseline_runs']=[cold('owner-baseline-'+str(i)) for i in range(5)]
 result['owner_baseline_median_ms']=statistics.median(x['stages_ms']['DATA'] for x in result['owner_baseline_runs'])
 previous105=dist/'previous-105/QA-ONLY-manual-universal.apk'
 result['previous105_apk_sha256']=hashlib.sha256(previous105.read_bytes()).hexdigest()
 adb('install','-r',str(previous105))
 result['previous_105_runs']=[cold('previous105-'+str(i)) for i in range(5)]
 result['previous_105_medians_ms']={stage:statistics.median(x['stages_ms'][stage] for x in result['previous_105_runs']) for stage in ['SYSTEM_CALLBACK','UI','DATA']}
 previous106=dist/'previous-106/QA-ONLY-manual-universal.apk'
 result['previous_106_qa_sha256']=hashlib.sha256(previous106.read_bytes()).hexdigest()
 adb('install','-r',str(previous106))
 result['previous_106_runs']=[cold('previous106-'+str(i)) for i in range(5)]
 result['previous_106_medians_ms']={stage:statistics.median(x['stages_ms'][stage] for x in result['previous_106_runs']) for stage in ['SYSTEM_CALLBACK','UI','DATA']}
 previous107=dist/'previous-107/QA-ONLY-manual-universal.apk'
 result['previous_107_qa_sha256']=hashlib.sha256(previous107.read_bytes()).hexdigest()
 adb('install','-r',str(previous107))
 result['previous_107_runs']=[cold('previous107-'+str(i)) for i in range(5)]
 result['previous_107_medians_ms']={stage:statistics.median(x['stages_ms'][stage] for x in result['previous_107_runs']) for stage in ['SYSTEM_CALLBACK','UI','DATA']}
 # The unchanged 24 native-first gate belongs to the OLD policy. New Activity
 # hides native destinations intentionally; the heavy job tests that policy
 # with guarded taps, state/draft retention, swipe video and honest timings.
 adb('shell','am','force-stop',pkg)
 adb('install','-r',str(dist/'QA-ONLY-fluency-seed.apk'))
 adb('shell','am','start','-W','-n',pkg+'/.MainActivity')
 tap_label(xml(),'Definir Antigo sem dados')
 mode_tree=xml();assert 'QA R7 pronto old mode' in mode_tree,'Failed to select instrumented Old control'
 result['policy_mode']='old'
 result['new_policy_measured_in_separate_heavy_job']=True
 adb('shell','am','force-stop',pkg)
 adb('install','-r',str(dist/'QA-ONLY-manual-universal.apk'));result['in_place_install']=True
 # Retain the actual production transition for visual inspection.
 recording=subprocess.Popen(['adb','shell','screenrecord','--time-limit','8','/sdcard/sofia-launch-079.mp4'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 time.sleep(.5)
 result['migration_run']=cold('candidate-migration')
 # First FOUR menu taps happen immediately after the native DATA marker,
 # before 500ms-interval idle warming could reasonably finish. No UI dump
 # or 8-second recording wait may precede these early interactions.
 early_at=time.monotonic()
 for label in ['Páginas','Conversa','Agenda','Início']:
  tap_label(before,label)
 early_elapsed=time.monotonic()-early_at
 early_logs=adb('logcat','-d','-s','SofiaMenu:I','ReactNativeJS:I').decode(errors='replace')
 (out/'first-four-menu-taps-logcat.txt').write_text(early_logs)
 result['early_menu_sequence']=['Páginas','Conversa','Agenda','Início']
 result['early_menu_first_touch_after_native_DATA']=True
 result['early_menu_sequence_seconds']=round(early_elapsed,3)
 result['early_menu_native_touch_count']=early_logs.count('TOUCH_DOWN index=')
 result['early_menu_native_first_count']=early_logs.count('nativeFirst=true')
 result['early_menu_react_guarded_count']=early_logs.count('nativeFirst=false')
 result['early_js_frame_samples']=[
  {'tab':tab,'ms':int(ms),'window':window}
  for tab,ms,window in re.findall(r'SOFIA_TAB_TAP_TO_FRAME_MS tab=([a-z]+) ms=(\d+) window=(first_3s|after_3s)',early_logs)
 ]
 assert result['early_menu_native_touch_count']>=3,'First taps failed to reach Android native menu after startup'
 recording.wait(timeout=15)
 adb('pull','/sdcard/sofia-launch-079.mp4',str(out/'candidate-launch.mp4'))
 for i in range(5):result['candidate_runs'].append(cold('candidate-'+str(i)))
 result['candidate_icon_kinds']=[run['icon_kind'] for run in result['candidate_runs']]
 assert all(run['icon_is_image_view'] is True and run['icon_is_surface_view'] is False
            for run in result['candidate_runs']), 'Native system splash is not a static ImageView or view markers are missing'
 after=capture_home('candidate');assert home_authenticated(after),'Production authenticated Home is not visible';assert home_agenda_visible(after),'Saved agenda records are not available at startup'
 result['authenticated_home_tested']=True
 result['baseline_median_ms']=statistics.median(x['stages_ms']['DATA'] for x in result['baseline_runs'])
 result['candidate_median_ms']=statistics.median(x['stages_ms']['DATA'] for x in result['candidate_runs'])
 result['candidate_medians_ms']={stage:statistics.median(x['stages_ms'][stage] for x in result['candidate_runs']) for stage in ['SYSTEM_CALLBACK','UI','DATA']}
 result['startup_vs_107_ms']={stage:result['candidate_medians_ms'][stage]-result['previous_107_medians_ms'][stage] for stage in ['SYSTEM_CALLBACK','UI','DATA']}
 result['r7_startup_plus30_target_met']=all(delta<=30 for delta in result['startup_vs_107_ms'].values())
 result['startup_vs_105_ms']={stage:result['candidate_medians_ms'][stage]-result['previous_105_medians_ms'][stage] for stage in ['SYSTEM_CALLBACK','UI','DATA']}
 result['startup_vs_106_ms']={stage:result['candidate_medians_ms'][stage]-result['previous_106_medians_ms'][stage] for stage in ['SYSTEM_CALLBACK','UI','DATA']}
 result['startup_no_worse_than_106']=all(delta<=0 for delta in result['startup_vs_106_ms'].values())
 # Preserve existing limits and also limit a cold-start regression against
 # the immediately preceding R4 APK tested on this exact emulator instance.
 assert result['startup_vs_106_ms']['DATA']<=100,'Startup regression compared with 0.3.106 QA exceeds 100 ms'
 result['startup_no_worse_than_105']=all(diff<=0 for diff in result['startup_vs_105_ms'].values())
 # Preserve all existing timing gates. Compare the immediately previous R8
 # candidate explicitly instead of claiming older baselines represent 0.3.105.
 assert result['startup_vs_105_ms']['DATA']<=100, 'Startup regression compared with 0.3.105 QA exceeds 100 ms'
 # A working APK is NOT an acceptable startup if the system keeps the S over
 # usable content for another half-second. Measure actual native timestamps,
 # not synthetic UI assertions, and compare against the retained 0.3.65 APK.
 spans=[]
 for run in result['candidate_runs']:
  events=run['stages_ms']
  assert 'FADE_START' in events, 'Native fade never started: '+str(events)
  assert events['SPLASH_REMOVED']<=events['FADE_START'] and events['LOCAL_READY']<=events['FADE_START']<=events['FADE_DONE']<=events['DATA'],events
  spans.append({'ready_to_fade_ms':events['FADE_START']-events['LOCAL_READY'],
                'ready_to_splash_remove_ms':events['SPLASH_REMOVED']-events['LOCAL_READY'],
                'fade_to_done_ms':events['FADE_DONE']-events['FADE_START']})
 result['exit_spans']=spans
 result['ready_to_fade_median_ms']=statistics.median(row['ready_to_fade_ms'] for row in spans)
 result['ready_to_splash_remove_median_ms']=statistics.median(row['ready_to_splash_remove_ms'] for row in spans)
 result['fade_to_done_median_ms']=statistics.median(row['fade_to_done_ms'] for row in spans)
 assert result['ready_to_fade_median_ms']<=150,'Home ready but fade starts too late: '+str(spans)
 assert result['ready_to_splash_remove_median_ms']<=150,'OS S still exists after Home ready: '+str(spans)
 assert result['fade_to_done_median_ms']<=250,'Full-screen S is still visible too long: '+str(spans)
 assert result['candidate_median_ms']<=result['baseline_median_ms']+200, 'Startup slower than baseline by over 200 ms: '+str(result['candidate_median_ms']-result['baseline_median_ms'])
 assert result['candidate_median_ms']<=result['owner_baseline_median_ms']+100, 'Startup regression compared with installed 0.3.94'
 result['owner_startup_regression_checked']=True
 result['splash_performance_verified']=True
 # Verify that an actual menu touch works and retained conversation survives.
 tap_label(after,'Conversa');time.sleep(1)
 conversation=capture('conversation')
 assert 'FIM DA RESPOSTA QA' in conversation,'Recent saved messages were lost after fast startup'
 # Target the actual chat viewport. Offline banners can place it below 30%
 # of the display, where the previous test incorrectly began every swipe.
 scrolls=[n for n in ET.fromstring(conversation).iter('node') if n.get('scrollable')=='true' and n.get('class')=='android.widget.ScrollView']
 assert scrolls,'Missing conversation viewport'
 viewport=min(scrolls,key=lambda n:(lambda b:(b[2]-b[0])*(b[3]-b[1]))(list(map(int,re.findall(r'\d+',n.attrib['bounds'])))))
 x1,y1,x2,y2=map(int,re.findall(r'\d+',viewport.attrib['bounds']));x=(x1+x2)//2;top=y1+max(12,(y2-y1)//8);bottom=y2-max(12,(y2-y1)//8)
 result['pagination_swipe_bounds']=[x,top,x,bottom]
 older_visible=False
 for group in range(10):
  for _ in range(4):
   adb('shell','input','swipe',str(x),str(top),str(x),str(bottom),'350');time.sleep(.3)
  older_tree=xml();(out/('older-page-'+str(group)+'.xml')).write_text(older_tree)
  if 'Mensagem preservada' in older_tree or 'Resposta preservada' in older_tree:older_visible=True;break
 capture('older-page-final');assert older_visible,'Scrolling did not automatically restore the previous local page'
 capture('older-page-by-scroll');result['automatic_local_pagination_tested']=True
 result['saved_conversation_preserved']=True
 result['first_menu_touch_works']=True
 # Real fast menu taps in the QA-equivalent x86 emulator APK. Record every transition
 # for frame inspection, then verify Home and retained chat after the sequence.
 menu_tree=xml();menu_points=[]
 for label in ['Início','Conversa','Páginas','Agenda','Apps','Perfil']:
  nodes=[n for n in ET.fromstring(menu_tree).iter('node') if n.attrib.get('text')==label or n.attrib.get('content-desc')==label]
  assert nodes,'Missing menu '+label
  b=list(map(int,re.findall(r'\d+',nodes[-1].attrib['bounds'])));menu_points.append(((b[0]+b[2])//2,(b[1]+b[3])//2))
 adb('logcat','-c')
 menu_record=subprocess.Popen(['adb','shell','screenrecord','--time-limit','10','/sdcard/sofia-menus.mp4'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 time.sleep(.4)
 for _ in range(4):
  for x,y in menu_points:adb('shell','input','tap',str(x),str(y))
 menu_record.wait(timeout=15)
 adb('pull','/sdcard/sofia-menus.mp4',str(out/'candidate-menus.mp4'))
 menu_logs=adb('logcat','-d','-s','SofiaMenu:I').decode(errors='replace')
 (out/'candidate-menu-native.txt').write_text(menu_logs)
 js_logs=adb('logcat','-d','-s','ReactNativeJS:I').decode(errors='replace')
 (out/'candidate-menu-js.txt').write_text(js_logs)
 samples=re.findall(r'SOFIA_TAB_TAP_TO_FRAME_MS tab=([a-z]+) ms=(\d+) window=(first_3s|after_3s)',js_logs)
 result['tab_to_next_js_frame_samples']=[{'tab':tab,'ms':int(ms),'window':window} for tab,ms,window in samples]
 result['tab_frame_measurement_kind']='JS onPressIn through next requestAnimationFrame after React commit, not a physical GPU timestamp'
 result['native_first_taps']=menu_logs.count('nativeFirst=true')
 result['react_guarded_taps']=menu_logs.count('nativeFirst=false')
 assert result['native_first_taps']>=12, 'Warmed tabs did not preserve native touch-down responsiveness'
 tap_label(xml(),'Início');time.sleep(.3)
 assert home_authenticated(capture_home('after-menu-home',need_agenda=False)),'Authenticated Home not visible after rapid menu taps'
 tap_label(xml(),'Conversa');time.sleep(.3)
 assert 'FIM DA RESPOSTA QA' in capture('after-menu-chat')
 result['rapid_menu_sequence_tested']=True
 result['rapid_menu_taps']=24

 result['baseline_median_ms']=statistics.median(x['stages_ms']['DATA'] for x in result['baseline_runs'])
 result['candidate_median_ms']=statistics.median(x['stages_ms']['DATA'] for x in result['candidate_runs'])
 result['passed']=True
finally:
 (out/'manual-result.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(result))
