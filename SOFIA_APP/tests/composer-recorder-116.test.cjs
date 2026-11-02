// 0.3.116. 0.3.115 on-device report: composer:recorder = 148.8 ms inside the 224 ms Chat composer; first open of Chat = 741 ms.
// The old Composer created the native AudioRecorder on mount and polled it every 120 ms for as long as the tab existed.
// Real React 19.2 + the REAL Composer.tsx; fake native recorder and fake timers. The old component is a frozen copy in tests/fixtures.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const root=path.join(__dirname,'..');const jsx=require('react/jsx-runtime');

function rig(source,{hooks=false}={}){
 const log={instances:[],created:0,prepared:0,recorded:0,stopped:0,released:0,deleted:[],alerts:[],intervals:[],cleared:0,perf:[]};
 const timers=[];let clock=0;
 class FakeRecorder{constructor(){log.instances.push(this);this.id=++log.created;this.released=false;this.uri='file:///rec-'+this.id+'.m4a';this._ms=0;}
  _live(){if(this.released)throw Object.assign(new Error('Cannot use shared object that was already released'),{code:'ERR_RELEASED'});}
  async prepareToRecordAsync(){this._live();log.prepared++;} record(){this._live();log.recorded++;this.recording=true;}
  async stop(){this._live();log.stopped++;this.recording=false;} getStatus(){this._live();return {durationMillis:this._ms,metering:-30};} release(){this.released=true;log.released++;}}
 const rn={View:'View',Text:'Text',TextInput:'TextInput',ActivityIndicator:'Spinner',Pressable:'Pressable',ScrollView:'ScrollView',Image:'Image',
  Animated:{Value:class{constructor(v){this.v=v;}setValue(v){this.v=v;}},spring:()=>({start(){}}),View:'AnimatedView'},
  AppState:{currentState:'active',addEventListener:()=>({remove(){}})},Alert:{alert:(t,m)=>log.alerts.push([t,m])},Keyboard:{dismiss(){}},PanResponder:{create:()=>({panHandlers:{}})}};
 const audio={AudioModule:{AudioRecorder:FakeRecorder,requestRecordingPermissionsAsync:async()=>({granted:log.denied?false:true})},RecordingPresets:{HIGH_QUALITY:{extension:'.m4a',sampleRate:44100,numberOfChannels:2,bitRate:128000}},setAudioModeAsync:async()=>{}};
 if(hooks){audio.useAudioRecorder=o=>{const r=React.useMemo(()=>new FakeRecorder(o),[]);return r;};audio.useAudioRecorderState=(r,ms)=>{React.useEffect(()=>{const id=g.setInterval(()=>{},ms);return()=>g.clearInterval(id);},[]);return {durationMillis:0};};}
 const g={setInterval:(fn,ms)=>{const t={fn,ms,live:true};timers.push(t);log.intervals.push(ms);return t;},clearInterval:t=>{if(t&&t.live){t.live=false;log.cleared++;}}};
 const deps={react:React,'react/jsx-runtime':jsx,'react-native':rn,'expo-audio':audio,'expo-audio/build/utils/options':{createRecordingOptions:o=>o},
  'expo-image-picker':{},'expo-document-picker':{},'expo-file-system':{File:class{constructor(u){this.u=u;this.exists=true;}delete(){log.deleted.push(this.u);}}},
  './Sheet':{Sheet:()=>null},'../lib/chat-attachments':{attachmentMime:()=>'x',attachmentTypes:[]},'../lib/app-alert':{appAlert:(t,m)=>log.alerts.push([t,m])},'../lib/types':{},'../lib/desktop':{useDesktop:()=>false,contentArea:()=>null},'../lib/attachment-read':{attachmentSize:async()=>1,attachmentBase64:async()=>''},'./Icon':{Icon:()=>null},'../lib/content-width':{ContentWidth:{},columnPadding:()=>0},'../lib/theme':{useTheme:()=>({line:'l',surface:'s',input:'i',text:'t',muted:'m',accent:'a',danger:'d'})},
  '../lib/audio-focus':{silenceVoices:async()=>{}},'../lib/chat-model':{durationLabel:ms=>Math.round(ms/1000)+'s',errorText:e=>String(e&&e.message||e)},
  './UI':{IconButton:p=>React.createElement('Button',p)},'./VoicePlayer':{VoicePlayer:()=>null},'../lib/fluency-metrics':{perfSync:(n,f)=>{log.perf.push(n);return f();}}};
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,require:n=>{if(/(^|\/)palette$/.test(n))return {PALETTE:new Proxy({},{get:()=>'#FFFFFF'})};assert.ok(n in deps,'Unexpected '+n);return deps[n];},console,Promise,Math,Date,Object,Error,String,Number,JSON,Array,Map,Set,Symbol,setTimeout,clearTimeout,setInterval:g.setInterval,clearInterval:g.clearInterval},{});
 const sent=[];
 const props={disabled:false,enterToSend:false,autoSendVoice:false,onText(){},onAttachments(){},onVoice:d=>sent.push(d),onActivity(){},onDraft(){}};
 const el=(mode,extra={})=>React.createElement(React.Activity,{mode},React.createElement(exports.Composer,{...props,...extra}));
 const tick=async ms=>{clock+=ms;for(const t of timers)if(t.live&&clock%t.ms<ms)await act(async()=>{t.fn();});};
 return {log,el,sent,exports,FakeRecorder,timers,tick,set denied(v){log.denied=v;}};
}
const quiet=async fn=>{const q=console.error;console.error=()=>{};try{return await fn();}finally{console.error=q;}};
const byLabel=(t,l)=>t.root.findAll(n=>n.type==='Button'&&n.props&&n.props.label===l); // só o elemento final, não o componente que o envolve
const texts=t=>t.root.findAll(n=>n.type==='Text').map(n=>[].concat(n.props.children).join(''));
const NEW=()=>fs.readFileSync(path.join(root,'src/components/Composer.tsx'),'utf8');
const OLD=()=>fs.readFileSync(path.join(__dirname,'fixtures','Composer.0.3.115.tsx.txt'),'utf8');
async function mount(r,mode='visible'){let tree;await quiet(async()=>{await act(async()=>{tree=create(r.el(mode));});});return tree;}
const mic=t=>byLabel(t,'Gravar mensagem de voz')[0];
const press=async(t,label)=>{await quiet(async()=>{await act(async()=>{await byLabel(t,label)[0].props.onPress();});});};

test('o ANTIGO (cópia fixa da 0.3.115) cria o gravador nativo ao MONTAR e o consulta de 120 em 120 ms sem ninguém gravar: o teste reproduz o problema',async()=>{
 const r=rig(OLD(),{hooks:true});await mount(r);
 assert.equal(r.log.created,1,'gravador nativo criado só por abrir a Conversa');
 assert.ok(r.log.intervals.includes(120),'consulta periódica ligada o tempo todo');
});

test('NOVO: abrir a Conversa não cria gravador nem liga consulta nenhuma',async()=>{
 const r=rig(NEW());await mount(r);
 assert.equal(r.log.created,0,'nenhum gravador nativo ao montar');assert.equal(r.log.intervals.length,0,'nenhuma consulta periódica ociosa');
 assert.ok(mic(await mount(rig(NEW()))),'o botão do microfone continua lá');
});

test('NOVO: o primeiro toque no microfone cria UM gravador, pede permissão, prepara e começa a gravar; a duração aparece na tela',async()=>{
 const r=rig(NEW());const t=await mount(r);await press(t,'Gravar mensagem de voz');
 assert.equal(r.log.created,1);assert.equal(r.log.prepared,1);assert.equal(r.log.recorded,1);
 assert.ok(r.log.perf.includes('composer:recorder'),'a criação continua medida no relatório');
 assert.ok(r.log.intervals.includes(120),'a consulta liga só agora');
 assert.ok(byLabel(t,'Parar e ouvir antes de enviar').length>0,'tela de gravação');
});

test('NOVO: parar gera o rascunho com a duração; gravar de novo REUSA o mesmo gravador (um só criado)',async()=>{
 const r=rig(NEW());const t=await mount(r);await press(t,'Gravar mensagem de voz');
 const created=()=>r.log.created;
 r.log.instances[0]._ms=3000;                              // 3 s gravados (abaixo de 350 ms o componente descarta, regra dele)
 await press(t,'Parar e ouvir antes de enviar');
 assert.equal(r.log.stopped,1);assert.equal(byLabel(t,'Enviar mensagem de voz').length,1,'rascunho para ouvir antes de enviar');
 await press(t,'Descartar áudio');assert.equal(r.log.deleted.length,1,'descartar apaga o arquivo');
 await press(t,'Gravar mensagem de voz');
 assert.equal(created(),1,'o gravador é reaproveitado, não recriado');
});

test('NOVO: permissão negada mostra o aviso e NÃO cria gravador',async()=>{
 const r=rig(NEW());r.denied=true;const t=await mount(r);await press(t,'Gravar mensagem de voz');
 assert.equal(r.log.created,0);assert.equal(r.log.alerts.length,1);assert.match(r.log.alerts[0][1],/microfone/i);
});

test('NOVO: sair da Conversa GRAVANDO para a gravação e libera o gravador, sem erro',async()=>{
 const r=rig(NEW());const t=await mount(r);await press(t,'Gravar mensagem de voz');
 await quiet(async()=>{await act(async()=>{t.unmount();});await new Promise(res=>setTimeout(res,10));});
 assert.equal(r.log.stopped,1,'gravação parada');assert.equal(r.log.released,1,'gravador liberado');
});

test('NOVO: esconder e mostrar a aba (Activity) nunca derruba o app, com o gravador ocioso ou gravando, e o microfone volta a funcionar',async()=>{
 for(const recordingFirst of [false,true]){
  const r=rig(NEW());let caught=null;class B extends React.Component{state={e:null};static getDerivedStateFromError(e){return {e};}componentDidCatch(e){caught=e;}render(){return this.state.e?React.createElement('Text',null,'FALLBACK'):this.props.children;}}
  const wrap=mode=>React.createElement(B,null,r.el(mode));let t;
  await quiet(async()=>{await act(async()=>{t=create(wrap('visible'));});});
  if(recordingFirst)await press(t,'Gravar mensagem de voz');
  for(let i=0;i<5;i++){await quiet(async()=>{await act(async()=>{t.update(wrap('hidden'));});await act(async()=>{await new Promise(res=>setTimeout(res,5));});await act(async()=>{t.update(wrap('visible'));});});}
  assert.equal(caught,null,'erro ao esconder/mostrar (recordingFirst='+recordingFirst+'): '+(caught&&caught.message));
  assert.ok(byLabel(t,'Gravar mensagem de voz').length>0,'volta ocioso, sem estado velho de "gravando"');
  const before=r.log.created;await press(t,'Gravar mensagem de voz');
  assert.equal(r.log.created,before+1,'um gravador NOVO é criado, nunca o liberado');assert.equal(r.log.recorded,(recordingFirst?2:1));
 }
});

test('as garantias antigas do envio de voz continuam no código (cancelar deslizando, sem limite de duração)',()=>{
 const s=NEW();for(const token of ['PanResponder.create','g.dx<-7','x<=-88','Solte para cancelar','stopRef.current(true,false)'])assert.ok(s.includes(token),token);
 assert.ok(!s.includes('useAudioRecorder')||s.includes('0.3.115 on-device report'),'sem os ganchos do gravador no código');
 assert.ok(!/\buseAudioRecorder(State)?\(/.test(s),'nenhuma chamada aos ganchos');
});
