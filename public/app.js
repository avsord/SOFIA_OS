'use strict';
const $=id=>document.getElementById(id);
const state={token:'',auth:null,conversation:null,messages:[],busy:false,history:[],offset:0,hasMore:false,settings:null,notes:[],tasks:[],poll:null,archived:false,uiMode:'user',homeWidgets:[],userNavWidgets:['lists','library'],listViews:[],libraryViews:[],userPages:[],selectedUserPage:null,userPageBlocks:[],userPageSaveTimer:null,userPageSaveInFlight:false,userPageSaveQueued:false,userPageDragId:null,userPageHistory:[],userPageRedo:[],userPageHistoryLastAt:0,userPageHistorySuppress:false,userPageExpanded:{},selectedImageBlockId:'',listView:'market',protectedSession:null,protectedMode:false,protectedThread:[],pendingClarification:null,customLists:[],homeThinking:false,optimisticUser:'',optimisticClientId:null,homeError:null,homeTarget:null,startSection:'top',startScrollAnimation:null,startScrollFrame:null,noticeTimer:null,purchaseDragId:null,themePreference:'system',miniSofiaOpen:false,miniSofiaUseContext:true,miniSofiaBusy:false,voiceRecorder:null,optimisticVoice:null,usageStatus:null,homeUsage:null,homeUsageFilter:'shared',homePanorama:null,homeWidgetDragKey:null,homeWidgetDragScrollTop:null,homeWidgetDropPlacement:null,startViewportLock:0,homeThreadDirty:false,pendingImages:{home:[],mini:[],chat:[]}};
try{const savedUsageFilter=localStorage.getItem('sofiaUsageFilter');if(['shared','private'].includes(savedUsageFilter))state.homeUsageFilter=savedUsageFilter;}catch{}
const labels={fact:'Fato informado',decision:'Decisão',idea:'Ideia',preference:'Preferência',rule:'Regra',todo:'A Fazer',scheduled:'Agendada',pending:'Pendente',done:'Concluída',cancelled:'Cancelada',doing:'Em andamento',waiting:'Aguardando'};

function resolveTheme(pref=state.themePreference||'system'){return pref==='dark'||(pref==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}
function applyTheme(pref=state.themePreference||'system',{persist=true}={}){const normalized=['system','light','dark'].includes(pref)?pref:'system';state.themePreference=normalized;document.documentElement.dataset.themePreference=normalized;document.documentElement.dataset.theme=resolveTheme(normalized);if(persist)localStorage.setItem('sofiaTheme',normalized);const select=$('themePreference');if(select&&select.value!==normalized)select.value=normalized;}
const systemThemeMedia=matchMedia('(prefers-color-scheme: dark)');systemThemeMedia.addEventListener?.('change',()=>{if(state.themePreference==='system')applyTheme('system',{persist:false});});
function el(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
function btn(text,callback,className=''){const b=el('button',className,text);b.type='button';b.addEventListener('click',()=>Promise.resolve(callback()).catch(showError));return b;}
function notify(text,error=false){const n=$('notice');clearTimeout(state.noticeTimer);if(!error){if(n){n.hidden=true;n.textContent='';n.className='notice';}const local=(state.currentTab==='start'?$ ('homeStatus'):null)||$('status');if(local&&text){local.textContent=String(text);state.noticeTimer=setTimeout(()=>{if(local.textContent===String(text))local.textContent='';},2600);}return;}if(!n)return;n.textContent=String(text||'Não foi possível concluir a operação.');n.hidden=false;n.className='notice error';state.noticeTimer=setTimeout(()=>{n.hidden=true;n.textContent='';},6500);}
function showError(error){notify(error.message || 'Não foi possível concluir a operação.',true);}
function appendStyledText(node,text){
  const parts=String(text??'').split(/(Safe Chat)/gi);for(const part of parts){if(/^Safe Chat$/i.test(part))node.append(el('span','safe-chat-label','Safe Chat'));else if(part)node.append(document.createTextNode(part));}return node;
}
function appendChatFormattedText(node,text){
  const source=String(text??'').replace(/\r\n?/g,'\n'),lines=source.split('\n');
  const inline=(host,value)=>{const re=/(\*\*[^*]+\*\*|`[^`]+`|Safe Chat)/gi;let last=0,m;while((m=re.exec(value))){if(m.index>last)host.append(document.createTextNode(value.slice(last,m.index)));const token=m[0];if(/^\*\*/.test(token)){const strong=el('strong','chat-strong',token.slice(2,-2));host.append(strong);}else if(/^`/.test(token)){const code=el('code','chat-code',token.slice(1,-1));host.append(code);}else host.append(el('span','safe-chat-label','Safe Chat'));last=m.index+token.length;}if(last<value.length)host.append(document.createTextNode(value.slice(last)));};
  lines.forEach((raw,index)=>{if(index)node.append(document.createElement('br'));let line=raw;const bullet=line.match(/^\s*[-•]\s+(.+)$/),numbered=line.match(/^\s*(\d+)[.)]\s+(.+)$/);if(bullet){node.append(el('span','chat-list-mark','• '));line=bullet[1];}else if(numbered){node.append(el('span','chat-list-mark',numbered[1]+'. '));line=numbered[2];}line=line.replace(/^#{1,4}\s+/,'');inline(node,line);});return node;
}
let confirmResolve=null;
function uiConfirm(message,{title='Confirmar ação',confirmLabel='Confirmar'}={}){
  const d=$('confirmDialog');$('confirmTitle').textContent=title;$('confirmText').textContent=message;$('confirmAccept').textContent=confirmLabel;d.returnValue='';d.showModal();return new Promise(resolve=>{confirmResolve=resolve;});
}
function finishUiConfirm(value){if(confirmResolve){const fn=confirmResolve;confirmResolve=null;fn(Boolean(value));}if($('confirmDialog').open)$('confirmDialog').close();}
function closeOnBackdrop(dialog){if(!dialog)return;dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});}
function quickDeleteButton(record,{task=false}={}){const b=el('button','quick-delete','×');b.type='button';b.title='Excluir rapidamente';b.setAttribute('aria-label','Excluir '+(record.title||'registro'));b.onclick=e=>{e.preventDefault();e.stopPropagation();return Promise.resolve(task?deleteTaskRecord(record):deleteRecord(record)).catch(showError);};return b;}
function date(value){return value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}):'';}
function dateOnly(value){
  if(!value)return '';
  const d=/^\d{4}-\d{2}-\d{2}$/.test(String(value))?new Date(String(value)+'T12:00:00'):new Date(value);
  return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
}
function fieldValue(field,value){
  if(field.type==='datetime')return date(value);
  if(field.type==='date')return dateOnly(value);
  if(field.type==='time')return String(value).slice(0,5);
  if(field.type==='checkbox')return value?'Sim':'Não';
  return typeof value==='boolean'?(value?'Sim':'Não'):String(value);
}
async function api(url,{method='GET',body,raw=false,headers:extraHeaders={},timeoutMs=0}={}){
  const controller=timeoutMs>0?new AbortController():null;const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;let response;
  try{response=await fetch(url,{method,signal:controller?.signal,headers:{...extraHeaders,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-Sofia-Token':state.token}:{})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});}
  catch(error){if(controller?.signal.aborted){const e=new Error('A Sofia demorou mais que o limite para responder. O carregamento foi encerrado e sua mensagem continua salva.');e.data={code:'CLIENT_TIMEOUT'};throw e;}throw error;}finally{if(timer)clearTimeout(timer);}
  if(!response.ok){let data;try{data=await response.json();}catch{data={};}if(response.status===401&&data.code==='AUTH_REQUIRED'){location.replace('/login?expired=1');const expired=new Error('Sua sessão expirou. Entre novamente.');expired.data=data;throw expired;}const error=new Error(data.error || 'O servidor não respondeu como esperado.');error.data=data;throw error;}
  return raw?response:response.json();
}

function formatVoiceDuration(ms){const total=Math.max(0,Math.round(Number(ms||0)/1000)),m=Math.floor(total/60),sec=String(total%60).padStart(2,'0');return m+':'+sec;}
function renderVoiceMessage(voice,{transcript=''}={}){
  const wrap=el('div','voice-message');const play=el('button','voice-play','▶');play.type='button';const audio=document.createElement('audio');audio.preload='metadata';audio.src=voice.audio_url||voice.voiceUrl||'';
  const progress=el('input','voice-progress');progress.type='range';progress.min='0';progress.max='1000';progress.value='0';progress.setAttribute('aria-label','Progresso do áudio');const dur=el('span','voice-duration',formatVoiceDuration(voice.duration_ms));const speed=el('button','voice-speed','1×');speed.type='button';let rate=1;
  const sync=()=>{if(Number.isFinite(audio.duration)&&audio.duration>0){progress.value=String(Math.round(audio.currentTime/audio.duration*1000));dur.textContent=formatVoiceDuration(audio.duration*1000);}};audio.addEventListener('timeupdate',sync);audio.addEventListener('ended',()=>{play.textContent='▶';progress.value='0';});audio.addEventListener('loadedmetadata',sync);play.onclick=()=>{if(audio.paused){audio.play().then(()=>play.textContent='Ⅱ').catch(showError);}else{audio.pause();play.textContent='▶';}};progress.oninput=()=>{if(Number.isFinite(audio.duration))audio.currentTime=audio.duration*Number(progress.value)/1000;};speed.onclick=()=>{rate=rate===1?1.5:rate===1.5?2:1;audio.playbackRate=rate;speed.textContent=String(rate).replace('.5',',5')+'×';};
  wrap.append(play,el('div','voice-wave'),progress,dur,speed);
  if(voice.status)wrap.append(el('span','voice-send-status',voice.status));
  if(transcript){const t=btn('Ver transcrição',()=>{const open=wrap.querySelector('.voice-transcript');if(open){open.remove();return;}const box=el('div','voice-transcript',transcript);wrap.append(box);},'voice-transcript-toggle');wrap.append(t);}return wrap;
}
function setOptimisticVoice(target,blob,durationMs,clientId,status='Enviando…'){
  clearOptimisticVoice();state.optimisticVoice={target,voiceUrl:URL.createObjectURL(blob),duration_ms:Math.max(0,Math.round(durationMs)),clientId,status};
  if(target==='home'){state.homeThinking=true;renderHomeThread();}else if(target==='mini'){state.miniSofiaBusy=true;renderMiniSofia();}else renderMessages();
}
function updateOptimisticVoice(status){if(!state.optimisticVoice)return;state.optimisticVoice.status=status;if(state.optimisticVoice.target==='home')renderHomeThread();else if(state.optimisticVoice.target==='mini')renderMiniSofia();else renderMessages();}
function clearOptimisticVoice(){const v=state.optimisticVoice;if(v?.voiceUrl?.startsWith('blob:'))URL.revokeObjectURL(v.voiceUrl);state.optimisticVoice=null;}
function blobToBase64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||'').split(',')[1]||'');r.onerror=reject;r.readAsDataURL(blob);});}
const CHAT_IMAGE_MIMES=new Set(['image/png','image/jpeg','image/webp','image/gif']);
function imageTargetTray(target){return $(target+'ImageTray');}
function disposePendingImage(image){if(image?.previewUrl?.startsWith('blob:'))URL.revokeObjectURL(image.previewUrl);}
function clearPendingImages(target){for(const image of state.pendingImages[target]||[])disposePendingImage(image);state.pendingImages[target]=[];renderImageTray(target);}
async function fileToChatImage(file,index=0){
  if(!CHAT_IMAGE_MIMES.has(String(file?.type||'').toLowerCase()))throw new Error('Use PNG, JPG, WEBP ou GIF.');
  if(!file.size||file.size>10*1024*1024)throw new Error('Cada imagem pode ter até 10 MB.');
  const base64=await blobToBase64(file);return {id:crypto.randomUUID(),name:file.name||('imagem-'+(index+1)+'.png'),mime:file.type,base64,bytes:file.size,previewUrl:URL.createObjectURL(file)};
}
async function saveChatImageToPage(image,pageId){
  const selected=state.selectedUserPage?.id===pageId&&state.currentTab==='userpage';
  if(selected){const a=await api('/api/entities/'+pageId+'/attachments',{method:'POST',body:{name:image.name,mime:image.mime,base64:image.base64}});state.userPageBlocks.push(newPageBlock('image',{text:a.name,data:{attachment_id:a.id,name:a.name,mime:a.mime,bytes:a.bytes,caption:'',display_width:520,display_x:0}}));renderNotionPage(state.selectedUserPage);queueUserPageSave();notify('Imagem adicionada a esta página.');return;}
  const page=await api('/api/entities/'+pageId),a=await api('/api/entities/'+pageId+'/attachments',{method:'POST',body:{name:image.name,mime:image.mime,base64:image.base64}}),blocks=parseUserPageBlocks(page);blocks.push(newPageBlock('image',{text:a.name,data:{attachment_id:a.id,name:a.name,mime:a.mime,bytes:a.bytes,caption:'',display_width:520,display_x:0}}));
  await api('/api/entities/'+page.id,{method:'PATCH',body:{kind:'user_page',title:page.title,content:page.content||'',area:page.area,privacy:page.privacy,state:page.state,revision:page.revision,data:userPagePersistedData(page,{blocks_json:JSON.stringify(blocks)}),tags:page.tags||[]}});await loadUserPages();notify('Imagem salva na página escolhida.');
}
function saveChatImagePrompt(image,target){
  if(target==='mini'&&state.currentTab==='userpage'&&state.selectedUserPage)return saveChatImageToPage(image,state.selectedUserPage.id);
  const options=state.userPages.map(page=>[page.id,userPageAncestors(page).map(x=>x.title).join(' › ')]);if(!options.length)return notify('Crie uma página em Particular antes de salvar a imagem.',true);
  editor('Salvar imagem em Particular',[{name:'page_id',label:'Página',type:'select',options}],v=>saveChatImageToPage(image,v.page_id));
}
function renderImageTray(target){
  const tray=imageTargetTray(target);if(!tray)return;tray.replaceChildren();const images=state.pendingImages[target]||[];tray.hidden=!images.length;
  for(const image of images){const item=el('div','chat-image-item');const preview=el('img','chat-image-preview');preview.src=image.previewUrl;preview.alt=image.name;const copy=el('div','chat-image-copy');copy.append(el('strong','',image.name),el('small','',Math.max(1,Math.round(image.bytes/1024))+' KB'));const actions=el('div','chat-image-actions');actions.append(btn(target==='mini'&&state.currentTab==='userpage'?'Salvar nesta página':'Salvar em Particular',()=>saveChatImagePrompt(image,target),'chat-image-save'),btn('×',()=>{state.pendingImages[target]=images.filter(x=>x.id!==image.id);disposePendingImage(image);renderImageTray(target);},'chat-image-remove'));item.append(preview,copy,actions);tray.append(item);}
}
async function addPastedImages(target,files){
  const images=[...(files||[])].filter(file=>CHAT_IMAGE_MIMES.has(String(file.type||'').toLowerCase()));if(!images.length)return false;const current=state.pendingImages[target]||[];if(current.length+images.length>4)throw new Error('Envie no máximo 4 imagens por mensagem.');
  for(let i=0;i<images.length;i++)current.push(await fileToChatImage(images[i],current.length+i));state.pendingImages[target]=current;renderImageTray(target);return true;
}
function bindImagePaste(target,input){
  input?.addEventListener('paste',e=>{const files=[...(e.clipboardData?.items||[])].filter(item=>item.kind==='file'&&CHAT_IMAGE_MIMES.has(String(item.type||'').toLowerCase())).map(item=>item.getAsFile()).filter(Boolean);if(!files.length)return;e.preventDefault();addPastedImages(target,files).catch(showError);});
}
function chatImagePayloads(target){return (state.pendingImages[target]||[]).map(({name,mime,base64})=>({name,mime,base64}));}
function voiceUi(target,recording,elapsed=0){const bar=$(target+'VoiceBar'),time=$(target+'VoiceTime'),button=$(target+'VoiceButton');if(bar)bar.hidden=!recording;if(time)time.textContent=formatVoiceDuration(elapsed);if(button){button.classList.toggle('recording',recording);button.setAttribute('aria-label',recording?'Parar e enviar mensagem de voz':'Gravar mensagem de voz');}}
async function startVoiceRecording(target){
  if(state.voiceRecorder||state.busy)return;if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Este navegador não disponibiliza gravação de áudio para a Sofia.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});const preferred=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];const mime=preferred.find(x=>MediaRecorder.isTypeSupported?.(x))||'';let recorder;try{recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:32000});}catch{recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);}const chunks=[],startedAt=Date.now();const rec={target,stream,recorder,chunks,startedAt,send:false,timer:null};state.voiceRecorder=rec;recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};recorder.onstop=async()=>{clearInterval(rec.timer);stream.getTracks().forEach(t=>t.stop());state.voiceRecorder=null;voiceUi(target,false);if(!rec.send)return;const blob=new Blob(chunks,{type:recorder.mimeType||chunks[0]?.type||'audio/webm'});try{await sendVoiceBlob(blob,Date.now()-startedAt,target);}catch(e){showError(e);}};recorder.start(1000);voiceUi(target,true,0);rec.timer=setInterval(()=>voiceUi(target,true,Date.now()-startedAt),250);
}
function stopVoiceRecording(sendIt){const rec=state.voiceRecorder;if(!rec)return;rec.send=Boolean(sendIt);if(rec.recorder.state!=='inactive')rec.recorder.stop();}
async function sendVoiceBlob(blob,durationMs,target){
  if(blob.size>25*1024*1024)throw new Error('O áudio ultrapassou 25 MB. Grave uma mensagem menor.');const mime=blob.type||'audio/webm',clientId=crypto.randomUUID();setOptimisticVoice(target,blob,durationMs,clientId,'Enviando…');const base64Promise=blobToBase64(blob);
  if(target==='home'&&state.protectedMode){let safeVoiceUrl='';try{const base64=await base64Promise;updateOptimisticVoice('Transcrevendo…');const tr=await api('/api/audio/transcribe',{method:'POST',body:{audio_base64:base64,mime,duration_ms:durationMs,route:'private'}});updateOptimisticVoice('Sofia está pensando…');safeVoiceUrl=URL.createObjectURL(blob);const r=await sendProtected(tr.text,{voiceUrl:safeVoiceUrl,voiceDuration:durationMs});safeVoiceUrl='';return r;}finally{if(safeVoiceUrl)URL.revokeObjectURL(safeVoiceUrl);state.homeThinking=false;clearOptimisticVoice();renderHomeThread();}}
  const conversationPromise=state.conversation?Promise.resolve(state.conversation):(state.uiMode==='user'?ensureOwnerChat():newConversation({title:'Mensagem de voz',channel:'web',navigate:false}));const base64=await base64Promise;const conversation=await conversationPromise;updateOptimisticVoice('Enviado · Sofia está entendendo…');state.busy=true;const context=target==='mini'?miniContextPayload():'';try{if(state.uiMode==='user'&&['web','mobile'].includes(conversation.channel))await api('/api/chat-sync/select',{method:'POST',body:{conversation_id:conversation.id}});const r=await api('/chat/audio',{method:'POST',body:{conversation_id:conversation.id,client_message_id:clientId,audio_base64:base64,mime,duration_ms:Math.round(durationMs),route:'auto',ui_context:context||undefined}});await loadConversation(conversation.id,{navigate:false});await refreshHistory();await syncUiAfterAction(r,{navigate:false});if(['shared','private'].includes(r?.details?.usage_filter))state.homeUsageFilter=r.details.usage_filter;await maybeUsageAlert({forceShow:Boolean(r?.details?.usage||r?.details?.usage_alert_changed),preferredFilter:['shared','private'].includes(r?.details?.usage_filter)?r.details.usage_filter:''});return r;}finally{state.busy=false;if(target==='home')state.homeThinking=false;if(target==='mini')state.miniSofiaBusy=false;clearOptimisticVoice();if(target==='mini')renderMiniSofia();else if(target==='home')renderHomeThread();else renderMessages();}
}
function usageCardFromData(raw){
  const root=raw||{},filters=root.filters||null;
  const available=filters?['shared','private'].filter(k=>filters[k]):[root.filter==='private'?'private':'shared'];
  if(!available.includes(state.homeUsageFilter))state.homeUsageFilter=available[0]||'shared';
  const filter=state.homeUsageFilter,u=filters?.[filter]||root,isPrivate=filter==='private'||u.unit==='usd';
  const tokenUsed=Math.max(0,Number(u.total_tokens??u.used??0)),inputTokens=Math.max(0,Number(u.input_tokens||0)),outputTokens=Math.max(0,Number(u.output_tokens||0)),requests=Math.max(0,Number(u.requests||0)),pending=Math.max(0,Number(u.pending_estimate||0));
  const usdUsed=Math.max(0,Number(u.used_usd??(isPrivate?u.used:0)??0)),usdTotal=Math.max(.01,Number(u.total_limit_usd??(isPrivate?u.total_limit:0)??5));
  const tokenTotal=Math.max(1,Number(u.total_limit??u.incentive_daily_tokens??2500000));
  const meterUsed=isPrivate?usdUsed:tokenUsed,meterTotal=isPrivate?usdTotal:tokenTotal;
  const pct=Number(u.usage_percent??(meterTotal?meterUsed/meterTotal*100:0)),alertPct=Math.min(100,Math.max(1,Number(u.alert_percent_config??u.alert_percent??90))),visiblePct=Math.min(100,Math.max(0,pct));
  const card=el('div','inline-usage-card usage-status-card');
  const heading=el('div','usage-card-heading');heading.append(el('strong','','Uso da Sofia'));
  if(filters){const tabs=el('div','usage-filter-tabs');for(const key of available){const b=el('button','usage-filter-tab'+(key===filter?' active':''),key==='shared'?'Compartilhado':'Privado');b.type='button';b.setAttribute('aria-pressed',key===filter?'true':'false');b.onclick=async()=>{state.homeUsageFilter=key;try{localStorage.setItem('sofiaUsageFilter',key);}catch{}try{await refreshUsageStatus({show:true,render:false,preferredFilter:key});renderUsageStatus({fallback:false});}catch{renderUsageStatus({fallback:false});}};tabs.append(b);}heading.append(tabs);}
  const top=el('div','usage-status-top'),right=el('div','usage-status-actions');
  const percent=el('span','usage-percent',Math.min(999,pct).toFixed(2)+'% usado'),close=el('button','usage-close','×');close.type='button';close.title='Ocultar Uso da Sofia';close.setAttribute('aria-label','Ocultar Uso da Sofia');close.onclick=()=>{state.homeUsage=null;document.querySelectorAll('.usage-status-card').forEach(node=>node.remove());};right.append(percent,close);top.append(el('strong','',isPrivate?'Privado':'Compartilhado'),right);
  const bar=el('div','usage-bar');bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.setAttribute('aria-valuenow',String(visiblePct));bar.style.setProperty('--usage-pct',visiblePct+'%');
  const spectrum=el('div','usage-bar-spectrum'),fill=el('div','usage-bar-fill');fill.style.width=visiblePct+'%';const remainder=el('div','usage-bar-remainder');remainder.style.left=visiblePct+'%';const current=el('span','usage-current-marker');current.style.left=visiblePct+'%';current.title=visiblePct.toFixed(2)+'% usado';const marker=el('span','usage-alert-marker');marker.style.left=alertPct+'%';marker.title='Alerta em '+alertPct+'%';marker.setAttribute('aria-label','Alerta em '+alertPct+'%');bar.append(spectrum,fill,remainder,current,marker);
  const stats=el('div','usage-details');
  if(isPrivate){const syncedCost=u.cost_source==='organization-costs';stats.append(el('div','usage-stats',Math.round(tokenUsed).toLocaleString('pt-BR')+' tokens neste mês'),el('small','',Math.round(inputTokens).toLocaleString('pt-BR')+' entrada · '+Math.round(outputTokens).toLocaleString('pt-BR')+' saída · '+requests.toLocaleString('pt-BR')+' requisições'),el('div','usage-stats','US$ '+usdUsed.toFixed(2)+' de US$ '+usdTotal.toFixed(2)+' · US$ '+Math.max(0,usdTotal-usdUsed).toFixed(2)+' restantes'),el('small','',u.priced||syncedCost?'Alerta: '+alertPct+'% · US$ '+(usdTotal*alertPct/100).toFixed(2):'Alerta: '+alertPct+'% · o valor em US$ depende das tarifas configuradas.'),el('small','usage-sync-source',u.source==='organization'?(syncedCost?'Tokens e gasto sincronizados com a OpenAI · Usage + Costs · mês UTC.':'Tokens sincronizados com a OpenAI · Responses/Chat Completions · mês UTC. Gasto ainda estimado localmente.'):'Tokens e gasto somente desta instalação. Para igualar o painel da OpenAI, configure “Uso da OpenAI · chave Admin da organização” em Configurações.'));}
  else{stats.append(el('div','usage-stats',Math.round(tokenUsed).toLocaleString('pt-BR')+' de '+Math.round(tokenTotal).toLocaleString('pt-BR')+' tokens'),el('small','',Math.round(inputTokens).toLocaleString('pt-BR')+' entrada · '+Math.round(outputTokens).toLocaleString('pt-BR')+' saída · '+requests.toLocaleString('pt-BR')+' requisições'),el('div','usage-stats',Math.round(Math.max(0,tokenTotal-tokenUsed)).toLocaleString('pt-BR')+' tokens restantes'),el('small','','Alerta: '+alertPct+'% · '+Math.round(tokenTotal*alertPct/100).toLocaleString('pt-BR')+' tokens'),el('small','usage-sync-source',u.source==='organization'?'Sincronizado com a OpenAI por service tier.':'Contagem local desta instalação.'));}
  if(pending)stats.append(el('small','usage-pending',Math.round(pending).toLocaleString('pt-BR')+' tokens ainda em estimativa local.'));
  card.append(heading,top,bar,stats);return card;
}

function replaceUsageCardPreservingScroll(container){
  const current=container?.querySelector('.usage-status-card');if(!current)return false;const scrollTop=container.scrollTop,atBottom=(container.scrollHeight-container.scrollTop-container.clientHeight)<=8;current.replaceWith(usageCardFromData(state.homeUsage));const restore=()=>{container.scrollTop=atBottom?container.scrollHeight:Math.min(scrollTop,Math.max(0,container.scrollHeight-container.clientHeight));};restore();requestAnimationFrame(restore);return true;
}
function renderUsageStatus({fallback=true}={}){
  let homeUpdated=false,miniUpdated=false;
  if(state.homeUsage&&state.currentTab==='start')homeUpdated=replaceUsageCardPreservingScroll($('homeChatResult'));
  if(state.homeUsage&&state.miniSofiaOpen)miniUpdated=replaceUsageCardPreservingScroll($('miniSofiaThread'));
  if(fallback&&state.currentTab==='start'&&!homeUpdated)renderHomeThread();
  if(fallback&&state.miniSofiaOpen&&!miniUpdated)renderMiniSofia();
}
async function refreshUsageStatus({show=false,render=true,preferredFilter=''}={}){
  const u=(await api('/api/usage-status?refresh='+Date.now())).usage;state.usageStatus=u;
  if(['shared','private'].includes(preferredFilter))state.homeUsageFilter=preferredFilter;
  if(show||state.homeUsage)state.homeUsage=u;
  if(render)renderUsageStatus();
  return u;
}
async function maybeUsageAlert({forceShow=false,preferredFilter=''}={}){
  try{
    const hadCard=Boolean(state.homeUsage),u=await refreshUsageStatus({show:forceShow||hadCard,render:false,preferredFilter}),filters=u.filters||{shared:u};let reachedFilter='';
    for(const key of ['shared','private']){const f=filters[key];if(!f)continue;const pct=Number(f.usage_percent??0),alertPct=Number(f.alert_percent_config??90);if(pct>=alertPct){const period=String(f.day_utc||f.month_utc||'current'),token='sofiaUsageAlert:'+key+':'+period+':'+alertPct;if(!sessionStorage.getItem(token)){sessionStorage.setItem(token,'1');reachedFilter=key;break;}}}
    const shouldRender=forceShow||hadCard||Boolean(reachedFilter);if(reachedFilter&&!preferredFilter)state.homeUsageFilter=reachedFilter;if(shouldRender){state.homeUsage=u;renderUsageStatus();}
    const status=$('homeStatus');if(status&&/^Alerta pessoal de uso|^Uso em .*alerta pessoal/.test(status.textContent||''))status.textContent='';return u;
  }catch{return null;}
}
function normalizeUsageShortcut(value){return String(value||'').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
async function maybeSwitchVisibleUsageFilter(text){
  if(!state.homeUsage)return false;const normalized=normalizeUsageShortcut(text).replace(/[.!?]+$/,'').trim();
  let filter='';if(['privado','private','filtro privado'].includes(normalized))filter='private';else if(['compartilhado','shared','filtro compartilhado'].includes(normalized))filter='shared';if(!filter)return false;
  state.homeUsageFilter=filter;try{localStorage.setItem('sofiaUsageFilter',filter);}catch{}
  await refreshUsageStatus({show:true,preferredFilter:filter});return true;
}
function bindVoiceControls(target){const b=$(target+'VoiceButton'),cancel=$(target+'VoiceCancel'),sendB=$(target+'VoiceSend');if(!b)return;b.onclick=()=>{if(state.voiceRecorder?.target===target)stopVoiceRecording(true);else startVoiceRecording(target).catch(showError);};if(cancel)cancel.onclick=()=>stopVoiceRecording(false);if(sendB)sendB.onclick=()=>stopVoiceRecording(true);}

function setAppsMenuExpanded(expanded,{persist=true}={}){
  const menu=$('appsMenu'),toggle=$('appsMenuToggle');if(!menu||!toggle)return;
  const open=Boolean(expanded);menu.classList.toggle('is-collapsed',!open);menu.setAttribute('aria-hidden',open?'false':'true');toggle.setAttribute('aria-expanded',open?'true':'false');const chevron=toggle.querySelector('.section-chevron');if(chevron){chevron.textContent='';chevron.classList.toggle('is-collapsed',!open);}if(persist){try{localStorage.setItem('sofiaAppsExpanded',open?'1':'0');}catch{}}
}
if($('appsMenuToggle')){let initial=true;try{initial=localStorage.getItem('sofiaAppsExpanded')!=='0';}catch{}$('appsMenuToggle').onclick=()=>setAppsMenuExpanded($('appsMenuToggle').getAttribute('aria-expanded')!=='true');setAppsMenuExpanded(initial,{persist:false});}
function clearStartSectionState(){for(const node of [$('startJump'),$('summaryJump')]){if(!node)continue;node.classList.remove('active');node.removeAttribute('aria-current');}}
function homeThreadRenderDeferred(){const panel=$('tab-start');return Boolean(panel&&!panel.hidden&&state.currentTab==='start'&&state.startSection==='summary');}
function flushDeferredHomeThread(){const panel=$('tab-start');if(!state.homeThreadDirty||!panel||panel.hidden||state.currentTab!=='start'||state.startSection!=='top'||panel.scrollTop>120)return;requestAnimationFrame(()=>{if(state.homeThreadDirty&&state.currentTab==='start'&&state.startSection==='top'&&panel.scrollTop<=120)renderHomeThread({force:true});});}
function setStartSection(section){
  state.startSection=section==='summary'?'summary':'top';
  const panel=$('tab-start'),start=$('startJump'),summary=$('summaryJump');clearStartSectionState();if(!panel||panel.hidden)return;
  const active=state.startSection==='summary'?summary:start;if(active){active.classList.add('active');active.setAttribute('aria-current','page');}if(state.startSection==='top')flushDeferredHomeThread();
}
function ensureUserPageActionsViewportLayer(){
  const pageActions=$('userPageFloatingActions');if(!pageActions)return null;
  const header=document.querySelector('#tab-userpage .user-page-header');
  if(header&&pageActions.parentElement!==header)header.append(pageActions);
  pageActions.style.setProperty('position','absolute','important');
  pageActions.style.setProperty('transform','none','important');
  return pageActions;
}
function setTab(name,{reload=true}={}){
  document.querySelectorAll('.tab').forEach(n=>n.hidden=n.id!=='tab-'+name);
  const pageActions=ensureUserPageActionsViewportLayer();if(pageActions)pageActions.hidden=name!=='userpage';
  state.currentTab=name;requestAnimationFrame(()=>{updateMiniSofiaVisibility();updateStartBackToTop();});
  document.querySelectorAll('[data-tab]').forEach(n=>{const active=n.dataset.tab===name&&name!=='start';n.classList.toggle('active',active);if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
  if(name==='start')setStartSection(state.startSection);else clearStartSectionState();
  if(!reload)return Promise.resolve();
  let job=null;
  if(name==='start')job=loadStart();if(name==='memory')job=loadMemories();if(name==='tasks')job=loadTasks();if(name==='commitments')job=loadCommitments();if(name==='lists')job=loadLists();if(name==='settings')job=loadSettings();if(name==='panorama')job=loadPanorama();if(name==='notifications')job=loadNotificationsPage();if(['study','library'].includes(name))job=loadGroup(name);if(name==='connections')job=loadConnections();if(name==='vault')job=loadVault();if(name==='userpage')job=loadSelectedUserPage();
  return job?Promise.resolve(job).catch(showError):Promise.resolve();
}
function detail(title,text){$('detailTitle').textContent=title;$('detailText').replaceChildren();appendStyledText($('detailText'),text);$('detailDialog').showModal();}
$('closeDetail').onclick=()=>$('detailDialog').close();$('confirmAccept').onclick=()=>finishUiConfirm(true);$('confirmCancel').onclick=()=>finishUiConfirm(false);$('confirmDialog').addEventListener('cancel',e=>{e.preventDefault();finishUiConfirm(false);});$('confirmDialog').addEventListener('close',()=>{if(confirmResolve){const fn=confirmResolve;confirmResolve=null;fn(false);}});
let editorSubmit=null;
function editorIconPicker(field){
  const wrap=el('div','editor-icon-picker');const hidden=el('input');hidden.type='hidden';hidden.name=field.name;hidden.id='field-'+field.name;hidden.value=field.value||'';hidden.dataset.iconMode=field.mode||((field.value)?'emoji':'default');const current=btn('',()=>{panel.hidden=!panel.hidden;},'editor-icon-current');const panel=el('div','editor-icon-panel');panel.hidden=true;
  const refresh=()=>{current.replaceChildren(el('span','editor-icon-preview',hidden.value||'📄'),el('span','',hidden.value?'Alterar ícone':'Ícone padrão'));current.title=hidden.value?'Alterar ícone':'Usar ícone padrão ou escolher outro';};const search=el('input','page-icon-search');search.placeholder='Filtrar símbolos…';const tabs=el('div','page-icon-tabs'),grid=el('div','page-icon-grid');let active=hidden.dataset.iconMode==='icon'?'icon':'emoji';
  const render=()=>{grid.replaceChildren();const q=search.value.trim().toLocaleLowerCase('pt-BR'),items=active==='emoji'?PAGE_EMOJIS:PAGE_ICONS,filtered=q?items.filter(icon=>icon.includes(q)):items;for(const icon of filtered){const b=btn(icon,()=>{hidden.value=icon;hidden.dataset.iconMode=active;panel.hidden=true;refresh();},'page-icon-option');grid.append(b);}tabs.querySelectorAll('button').forEach(t=>t.classList.toggle('active',t.dataset.mode===active));};for(const [mode,label] of [['emoji','Emoji'],['icon','Ícones']]){const b=btn(label,()=>{active=mode;render();},'page-icon-tab');b.dataset.mode=mode;tabs.append(b);}search.oninput=render;const defaultButton=btn('▱ Padrão',()=>{hidden.value='';hidden.dataset.iconMode='default';panel.hidden=true;refresh();},'secondary');panel.append(search,tabs,grid,defaultButton);render();wrap.append(hidden,current,panel);refresh();return {wrap,input:hidden};
}
function editor(title,fields,callback){const dialog=$('editorDialog');dialog.classList.remove('task-editor-dialog','agenda-quick-dialog');$('editorTitle').textContent=title;$('editorFields').replaceChildren();$('editorError').textContent='';
  for(const f of fields){const label=el('label','',f.label);label.dataset.field=f.name;let input;
    if(f.type==='iconpicker'){const custom=editorIconPicker(f);input=custom.input;label.append(custom.wrap);if(f.hint)label.append(el('span','editor-field-hint',f.hint));$('editorFields').append(label);continue;}
    if(f.type==='select'){input=el('select');for(const [value,text] of f.options){const option=el('option','',text);option.value=value;input.append(option);}}
    else if(f.type==='textarea')input=el('textarea');else{input=el('input');input.type=f.type||'text';}
    input.name=f.name;input.id='field-'+f.name;if(f.placeholder)input.placeholder=f.placeholder;
    if(['title','name','area','location','label'].includes(f.name)){input.spellcheck=false;input.setAttribute('autocomplete','off');input.setAttribute('autocorrect','off');input.setAttribute('autocapitalize','off');}
    if(Array.isArray(f.suggestions)&&f.suggestions.length){const list=el('datalist');list.id='list-'+f.name;for(const value of f.suggestions){const option=el('option');option.value=value;list.append(option);}input.setAttribute('list',list.id);label.append(input,list);}else label.append(input);
    if(f.type==='checkbox')input.checked=Boolean(f.value);else input.value=f.value??'';
    if(f.required)input.required=true;if(f.max)input.maxLength=f.max;if(f.min)input.minLength=f.min;
    if(f.hint)label.append(el('span','editor-field-hint',f.hint));$('editorFields').append(label);
  }
  editorSubmit=async()=>{const data={};for(const f of fields){const n=$('field-'+f.name);data[f.name]=f.type==='checkbox'?n.checked:n.value;if(f.type==='iconpicker')data[f.name+'_mode']=n.dataset.iconMode||'default';}await callback(data);};$('editorDialog').showModal();
}
function closeEditor(){$('editorDialog').close();$('editorFields').replaceChildren();editorSubmit=null;}
$('closeEditor').onclick=closeEditor;$('cancelEditor').onclick=closeEditor;
$('editorForm').onsubmit=async event=>{event.preventDefault();const b=event.submitter;b.disabled=true;try{await editorSubmit();closeEditor();}catch(e){$('editorError').textContent=e.message;}finally{b.disabled=false;}};
async function refreshHistory(more=false){if(!more){state.history=[];state.offset=0;}const r=await api('/api/conversations?limit=100&offset='+state.offset);state.history.push(...r.items);state.offset+=r.items.length;$('moreConversations').hidden=r.items.length<100;const list=$('conversationList');list.replaceChildren();
  for(const c of state.history){const b=btn(c.title,()=>loadConversation(c.id),'conversation-item'+(state.conversation?.id===c.id?' selected':''));b.append(el('small','',date(c.updated_at)+(c.state==='paused'?' · Pausada':'')));list.append(b);}
  if(!state.history.length)list.append(el('p','hint','Suas conversas aparecerão aqui.'));
}
async function newConversation({title='Chat',channel='web',navigate=true}={}){if(state.busy)throw new Error('Espere a resposta terminar.');const c=await api('/api/conversations',{method:'POST',body:{title,channel}});if(['web','mobile'].includes(c.channel))await api('/api/chat-sync/select',{method:'POST',body:{conversation_id:c.id}});await loadConversation(c.id,{navigate});await refreshHistory();if(navigate&&state.uiMode==='developer')$('messageInput').focus();return c;}
async function loadConversation(conversationId,{navigate=true}={}){if(state.busy && state.conversation?.id!==conversationId)throw new Error('Espere a resposta antes de trocar de conversa.');const anchor=captureStartViewportAnchor();const r=await api('/api/conversations/'+encodeURIComponent(conversationId));state.conversation=r.conversation;state.messages=r.messages;if(navigate&&['web','mobile'].includes(r.conversation.channel))await api('/api/chat-sync/select',{method:'POST',body:{conversation_id:r.conversation.id}});if(state.lesson?.data.conversation_id&&state.lesson.data.conversation_id!==conversationId){state.lesson=null;$('lessonBanner').hidden=true;}state.hasMore=r.has_more;if(state.uiMode==='developer')localStorage.setItem('sofiaConversationId',conversationId);renderMessages();renderHomeThread();renderMiniSofia();restoreStartViewportAnchor(anchor);$('chatTitle').textContent=r.conversation.title;$('chatSubtitle').textContent=(r.conversation.channel==='whatsapp-simulator'?'Simulação de WhatsApp · nenhum envio real':r.conversation.channel==='test'?'Conversa de teste · sem busca em memórias privadas':'Conversa local · histórico persistente');
  const last=r.checkpoints[0];$('checkpointBanner').hidden=!last;$('checkpointBanner').textContent=last?'Ponto salvo em '+date(last.created_at)+': '+last.topic+(last.next_step?' · Próximo passo: '+last.next_step:' · Nenhum próximo passo foi declarado.') : '';
  $('olderMessages').hidden=!state.hasMore;if(navigate){if(state.uiMode==='developer')setTab('chat');else{state.startSection='top';setTab('start').then(()=>requestAnimationFrame(scrollStartTop));}}for(const b of document.querySelectorAll('.conversation-item'))b.classList.remove('selected');
  clearTimeout(state.poll);if(state.messages.some(m=>m.status==='pending'))state.poll=setTimeout(()=>loadConversation(conversationId).catch(showError),2000);
}
function captureStartViewportAnchor(){
  const panel=$('tab-start'),summary=$('homeSummary');
  if(!panel||!summary||panel.hidden||state.currentTab!=='start'||state.startSection!=='summary')return null;
  return {scrollTop:panel.scrollTop,summaryTop:summary.getBoundingClientRect().top};
}
function restoreStartViewportAnchor(anchor,{frames=5}={}){
  if(!anchor)return;const panel=$('tab-start'),summary=$('homeSummary');if(!panel||!summary||panel.hidden)return;
  state.startViewportLock+=1;panel.classList.add('viewport-stabilizing');let count=0;
  const apply=()=>{if(state.currentTab!=='start'||state.startSection!=='summary'||panel.hidden){finish();return;}const delta=summary.getBoundingClientRect().top-anchor.summaryTop;panel.scrollTop=Math.max(0,anchor.scrollTop+delta);count+=1;if(count<frames)requestAnimationFrame(apply);else{setTimeout(()=>{if(state.currentTab==='start'&&state.startSection==='summary'&&!panel.hidden){const lateDelta=summary.getBoundingClientRect().top-anchor.summaryTop;panel.scrollTop=Math.max(0,anchor.scrollTop+lateDelta);}finish();},60);}};
  const finish=()=>{state.startViewportLock=Math.max(0,state.startViewportLock-1);if(!state.startViewportLock)panel.classList.remove('viewport-stabilizing');};
  apply();
}
async function deleteChatMessage(message){if(state.busy)return notify('Espere a resposta terminar.',true);if(!await uiConfirm('Excluir somente esta mensagem? Ela desaparecerá do app e da web.',{title:'Excluir mensagem',confirmLabel:'Excluir'}))return;await api('/api/messages/'+encodeURIComponent(message.id),{method:'DELETE',body:{}});if(state.conversation)await loadConversation(state.conversation.id,{navigate:false});await refreshHistory();}
function renderMessages(){const area=$('messages');area.replaceChildren();if(!state.messages.length&&!state.optimisticVoice){const empty=el('div','empty');empty.append(el('span','orb large','S'),el('h3','','Uma conversa que continua.'),el('p','','Escreva uma ideia. O histórico desta conversa fica salvo no seu computador.'));area.append(empty);}
  for(const m of state.messages){const row=el('article','message '+m.role);row.append(el('div','message-heading',m.role==='user'?'Você':'Sofia'));const body=el('div','message-body');if(m.voice&&m.role==='user')body.append(renderVoiceMessage(m.voice,{transcript:m.content}));else appendChatFormattedText(body,m.content);row.append(body);const actions=el('div','message-actions');actions.append(btn('Guardar como memória',()=>editMemory(null,m)),btn('Criar tarefa',()=>editTask(null,m)));if(m.status!=='pending')actions.append(btn('Excluir mensagem',()=>deleteChatMessage(m),'danger'));
    if(m.role==='user' && ['failed','interrupted'].includes(m.status)){actions.append(el('span','message-status','Tentativa não concluída: '+(m.error_code||m.status)),btn('Tentar novamente',()=>send(m.content,{clientId:m.client_id,retry:true})));}
    if(m.status==='pending')actions.append(el('span','message-status','Aguardando resposta…'));
    if(state.uiMode==='developer'&&m.privacy)actions.append(el('span','tag route-tag',m.privacy==='shared'?'Filtro Compartilhado':m.privacy==='private'?'Filtro Privado':'Local técnico'));if(state.uiMode==='developer'&&m.route_decision?.context_used)actions.append(el('span','tag','Contexto usado'));
    let refs=[];try{refs=JSON.parse(m.refs||'[]');}catch{}
    for(const r of refs)actions.append(btn('['+r.label+'] '+r.title,()=>showReference(r)));
    row.append(actions);area.append(row);
  }
  const pendingVoice=state.optimisticVoice?.target==='chat'&&!state.messages.some(m=>m.client_id===state.optimisticVoice.clientId);if(pendingVoice){const row=el('article','message user optimistic-voice');row.append(el('div','message-heading','Você'));const body=el('div','message-body');body.append(renderVoiceMessage(state.optimisticVoice));row.append(body);area.append(row);}
  requestAnimationFrame(()=>{const scroll=document.querySelector('.chat-main');scroll.scrollTop=scroll.scrollHeight;});
}
async function showReference(r){if(r.kind==='entity')return openRecord(r.id);if(r.kind==='note'){const memories=await api('/api/memories');const note=memories.items.find(n=>n.id===r.id);detail(r.title,note?note.content:r.snippet+'\n\nA nota pode ter sido arquivada ou revisada.');}else if(r.kind==='user'||r.kind==='assistant'){const m=await api('/api/messages/'+r.id);detail(r.title,date(m.created_at)+'\n\n'+m.content);}else detail(r.title,r.snippet);}
async function syncUiAfterAction(r,{navigate=true}={}){
  const items=Array.isArray(r?.items)?r.items:[],pageItems=items.filter(x=>x?.kind==='user_page'),pageChanged=Boolean(r?.details?.page_changed);const deletedIds=new Set(r?.details?.deleted_ids||[]);
  if(pageItems.length||deletedIds.size||pageChanged)await loadUserPages();
  if(recordDialog.open&&deletedIds.has(recordDialog.dataset.recordId))recordDialog.close();
  if(state.selectedUserPage&&deletedIds.has(state.selectedUserPage.id)){state.selectedUserPage=null;if(state.currentTab==='userpage')await setTab('start');return;}
  if(state.currentTab==='userpage'&&state.selectedUserPage){const fresh=state.userPages.find(x=>x.id===state.selectedUserPage.id);if(fresh){state.selectedUserPage=fresh;if(pageChanged||pageItems.some(x=>x.id===fresh.id))await loadSelectedUserPage();}}
  const created=pageItems.find(x=>r?.intent?.type==='create_user_page'&&x?.id);if(created&&navigate){state.selectedUserPage=state.userPages.find(x=>x.id===created.id)||created;}

  // Ações locais da Sofia precisam atualizar a tela que já está aberta, sem F5.
  const kinds=new Set(items.map(x=>x?.kind).filter(Boolean));
  const target=String(r?.ui_target||r?.details?.target||'');
  const touchesAgenda=target==='commitments'||target==='agenda'||target==='reminders'||kinds.has('commitment')||kinds.has('reminder')||Number(r?.details?.commitments_deleted||0)>0||Number(r?.details?.reminders_deleted||0)>0;
  const touchesTasks=target==='tasks'||kinds.has('task');
  const touchesLists=target==='lists'||['purchase','shopping_item','monitor','purchase_group','list_collection'].some(k=>kinds.has(k));
  const touchesLibrary=target==='library'||[...kinds].some(k=>state.catalog?.[k]?.group==='library');
  // Agenda precisa refletir imediatamente ações confirmadas pela Sofia, sem depender de F5.
  if(state.currentTab==='commitments'&&touchesAgenda)await loadCommitments();
  if(state.currentTab==='tasks'&&touchesTasks)await loadTasks();
  else if(state.currentTab==='lists'&&touchesLists)await loadLists();
  else if(state.currentTab==='library'&&touchesLibrary)await loadGroup('library');
  else if(state.currentTab==='study'&&target==='study')await loadGroup('study');
  if(state.currentTab==='start'&&(touchesAgenda||touchesTasks||touchesLists||touchesLibrary||target==='start')){const keys=target==='start'?state.homeWidgets.slice():['notifications'];if(touchesAgenda)keys.push('commitments');if(touchesTasks)keys.push('priorities','tasks');if(touchesLists)keys.push('shopping','monitors');if(touchesLibrary)keys.push('recent');await refreshHomeWidgets(keys);}
}
async function send(text,{clientId=crypto.randomUUID(),retry=false,simulator=false,route=null,navigate=true,clarificationId=null,clarificationOption='',uiContext='',images=[]}={}){
  if(state.busy)return null;const content=String(text||'').trim();if(!content&&!images.length)return null;if(content&&(!images.length)&&(content==='/.'||content==='./')){setTab('vault');return {ui_target:'vault'};}
  const selected=route||((state.uiMode==='developer'&&$('chatRoute'))?$('chatRoute').value:'auto');
  if(!state.conversation){if(state.uiMode==='user'&&!simulator)await ensureOwnerChat();else await newConversation({title:(content||'Imagem enviada').slice(0,70),channel:simulator?'whatsapp-simulator':'web',navigate:false});}
  state.busy=true;if($('sendButton'))$('sendButton').disabled=true;if($('homeSendButton'))$('homeSendButton').disabled=true;if($('status'))$('status').textContent=simulator?'Processando a simulação no mesmo Core…':'Salvando a mensagem e preparando a resposta…';notify('');
  try{if(!simulator&&state.uiMode==='user'&&['web','mobile'].includes(state.conversation.channel))await api('/api/chat-sync/select',{method:'POST',body:{conversation_id:state.conversation.id}});const r=await api(simulator?'/api/channels/whatsapp/simulate':'/chat',{method:'POST',timeoutMs:125000,body:{conversation_id:state.conversation.id,message:content,client_message_id:clientId,retry,route:selected,lesson_id:state.lesson?.id,clarification_id:clarificationId||undefined,clarification_option:clarificationOption||undefined,ui_context:uiContext||undefined,images:images.length?images:undefined}});if($('messageInput'))$('messageInput').value='';if($('status'))$('status').textContent=(r.filter|| (r.mode==='local-action'?'Ação local':'Resposta salva'))+' · '+(r.route_reason||'Sem nova chamada à IA.');if(r.incomplete)notify('A resposta atingiu o limite de saída e pode estar incompleta. Não fiz outra chamada.');await loadConversation(state.conversation.id,{navigate:false});await refreshHistory();await syncUiAfterAction(r,{navigate});if(['shared','private'].includes(r?.details?.usage_filter))state.homeUsageFilter=r.details.usage_filter;await maybeUsageAlert({forceShow:Boolean(r?.details?.usage||r?.details?.usage_alert_changed),preferredFilter:['shared','private'].includes(r?.details?.usage_filter)?r.details.usage_filter:''});if(navigate&&state.uiMode==='developer')setTab('chat');return r;
  }catch(e){showError(e);if($('status'))$('status').textContent='Operação não concluída. Veja o aviso; o histórico mostra o que foi salvo.';throw e;}
  finally{state.busy=false;if($('sendButton'))$('sendButton').disabled=false;if($('homeSendButton'))$('homeSendButton').disabled=false;}
}
$('chatForm').onsubmit=async e=>{e.preventDefault();const text=$('messageInput').value,images=chatImagePayloads('chat');if(!text.trim()&&!images.length)return;try{await send(text,{images});clearPendingImages('chat');}catch(error){showError(error);}};
$('messageInput').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chatForm').requestSubmit();}};
function resetUserChatSession({focus=false}={}){
  clearTimeout(state.poll);state.poll=null;setProtectedMode(false);clearOptimisticVoice();state.conversation=null;state.messages=[];state.hasMore=false;state.pendingClarification=null;state.homeError=null;state.homeTarget=null;state.homeUsage=null;state.homeThinking=false;state.optimisticUser='';state.optimisticClientId=null;localStorage.removeItem('sofiaConversationId');
  if($('homeMessageInput'))$('homeMessageInput').value='';clearPendingImages('home');renderHomeThread();if(focus)$('homeMessageInput')?.focus();
}
$('newConversation').onclick=async()=>{try{if(state.uiMode==='user'){state.startSection='top';await setTab('start',{reload:$('tab-start').hidden});scrollStartTop();$('homeMessageInput').focus();return;}await newConversation({navigate:false});setTab('chat');}catch(e){showError(e);}};$('refreshHistory').onclick=()=>refreshHistory().catch(showError);$('moreConversations').onclick=()=>refreshHistory(true).catch(showError);
$('olderMessages').onclick=async()=>{try{const before=state.messages[0]?.sequence;const r=await api('/api/conversations/'+state.conversation.id+'/messages?before='+before);state.messages=[...r.items,...state.messages];state.hasMore=r.has_more;renderMessages();$('olderMessages').hidden=!r.has_more;}catch(e){showError(e);}};
$('pauseButton').onclick=()=>{if(!state.conversation)return notify('Abra ou crie uma conversa primeiro.');editor('Salvar ponto de retomada',[{name:'topic',label:'Em que assunto paramos?',value:state.conversation.title,required:true,max:500},{name:'next_step',label:'Próximo passo (opcional)',type:'textarea',max:3000,hint:'Será guardado como você escrever, sem a IA inventar o próximo passo.'}],async values=>{const r=await api('/api/checkpoints',{method:'POST',body:{conversation_id:state.conversation.id,...values}});await loadConversation(state.conversation.id);await refreshHistory();notify(r.warning||'Checkpoint e backup local criados.',Boolean(r.warning));});};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('exportConversation').onclick=async()=>{if(!state.conversation)return notify('Abra uma conversa primeiro.');if(!await uiConfirm('Este arquivo de conversa será texto sem criptografia. Guarde-o em lugar privado. Continuar?',{title:'Exportar conversa',confirmLabel:'Exportar'}))return;try{const r=await api('/api/export/conversation/'+state.conversation.id,{raw:true});download(await r.blob(),'Sofia_conversa.md');}catch(e){showError(e);}};
function editMemory(note=null,message=null){editor(note?'Editar memória · versão '+note.revision:'Nova memória',[{name:'title',label:'Título',value:note?.title||message?.content.slice(0,100),required:true,max:120},{name:'kind',label:'Tipo',type:'select',value:note?.kind||'fact',options:['fact','decision','idea','preference','rule'].map(k=>[k,labels[k]])},{name:'area',label:'Área',value:note?.area||'Geral',required:true,max:80},{name:'content',label:'Conteúdo confirmado por você',type:'textarea',value:note?.content||message?.content,required:true,max:12000},{name:'pinned',label:'Priorizar esta memória nas conversas privadas',type:'checkbox',value:note?.pinned}],async values=>{await api('/api/memories'+(note?'/'+note.id:''),{method:note?'PATCH':'POST',body:{...values,revision:note?.revision,source_id:note?.source_id||message?.id||null}});notify('Memória salva. As versões anteriores foram preservadas.');await loadMemories();});}
async function loadMemories(){state.notes=(await api('/api/memories'+(state.archived?'?state=archived':''))).items;const list=$('memoryList');list.replaceChildren();
  for(const n of state.notes){const c=el('article','data-card');c.append(el('span','tag',labels[n.kind]),el('span','tag',n.area),el('h3','',n.title),el('p','',n.content));const meta=el('p','small-meta','v'+n.revision+' · '+date(n.updated_at)+(n.pinned?' · Prioritária':'')+(n.source_id?' · Com origem no histórico':' · Declarada na configuração ou neste painel'));c.append(meta);const actions=el('div','button-row');actions.append(btn('Editar',()=>editMemory(n)),btn('Versões',async()=>detail(n.title+' · versões',JSON.stringify((await api('/api/memories/'+n.id+'/versions')).items.map(v=>JSON.parse(v.snapshot)),null,2))),btn('Arquivar',async()=>{if(await uiConfirm('Arquivar esta nota? Ela sai da recuperação ativa, mas o histórico de versões permanece.',{title:'Arquivar nota',confirmLabel:'Arquivar'})){await api('/api/memories/'+n.id+'/archive',{method:'POST',body:{revision:n.revision}});await loadMemories();}}));if(n.source_id)actions.append(btn('Ver origem',async()=>{const m=await api('/api/messages/'+n.source_id);detail('Origem — '+date(m.created_at),m.content);}));if(n.state==='archived')actions.append(btn('Reativar',async()=>{await api('/api/memories/'+n.id+'/restore',{method:'POST',body:{revision:n.revision}});await loadMemories();}));c.append(actions);list.append(c);}
  if(!state.notes.length)list.append(el('p','hint','Nenhuma memória ativa. O histórico das conversas permanece disponível na busca.'));
}
$('addMemory').onclick=()=>editMemory();
$('showArchives').onclick=()=>{state.archived=!state.archived;$('showArchives').textContent=state.archived?'Ver ativas':'Ver arquivadas';loadMemories().catch(showError);};
$('searchForm').onsubmit=async e=>{e.preventDefault();try{const items=(await api('/api/history/search?q='+encodeURIComponent($('searchInput').value))).items;$('searchResults').replaceChildren(el('p','hint',items.length+' resultados. Busca lexical no banco local.'));for(const item of items){const c=el('article','data-card search-result');c.append(el('span','tag',item.kind==='note'?'Memória':item.kind==='user'?'Você no histórico':'Resposta histórica da Sofia'),el('h3','',item.title),el('p','',item.content.slice(0,900)),btn('Ver registro',()=>showReference({...item,snippet:item.content})));$('searchResults').append(c);}}catch(e){showError(e);}};
$('clearSearch').onclick=()=>{$('searchInput').value='';$('searchResults').replaceChildren();};
function dateInput(value){if(!value)return '';const d=new Date(value);return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
async function editTask(task=null,message=null,prefill={}){await catalog();const reminderSuggestions=['Na hora','10 minutos antes','30 minutos antes','1 hora antes','1 dia antes'];const fields=[{name:'title',label:'O que precisa ser feito?',value:task?.title||message?.content.slice(0,280)||prefill.title||'',required:true,max:300},{name:'area',label:'Área',value:task?.area||prefill.area||'Geral',max:80,required:true,suggestions:state.areas,hint:'Escolha uma área já usada ou escreva uma nova.'},{name:'state',label:'Estado',type:'select',value:task?.state||prefill.state||'todo',options:['todo','scheduled','pending','doing','waiting','done','cancelled'].map(k=>[k,labels[k]])},{name:'due_at',label:'Data e hora',type:'datetime-local',value:dateInput(task?.due_at||prefill.due_at),hint:'Tarefas com data aparecem automaticamente na Agenda.'},{name:'priority_level',label:'Prioridade',type:'select',value:task?.priority_level||(task?.priority?'important':prefill.priority_level||'none'),options:[['none','Sem prioridade'],['important','Importante'],['medium','Médio'],['light','Leve']]},{name:'location',label:'Local',value:task?.location||prefill.location||'',max:300,placeholder:'Ex.: Escritório, academia ou endereço'},{name:'notifications',label:'Notificações',value:Array.isArray(task?.notifications)?task.notifications.join(', '):(prefill.notifications||''),max:500,suggestions:reminderSuggestions,placeholder:'Ex.: 30 minutos antes, 1 dia antes',hint:'Separe várias notificações por vírgula.'},{name:'color',label:'Cor',type:'select',value:task?.color||prefill.color||'default',options:[['default','Cor padrão'],['gray','Cinza'],['blue','Azul'],['green','Verde'],['yellow','Amarelo'],['orange','Laranja'],['red','Vermelho'],['purple','Roxo'],['pink','Rosa']]},{name:'description',label:'Descrição',type:'textarea',value:task?.description||prefill.description||'',max:8000}];editor(task?'Editar tarefa':'Nova tarefa',fields,async values=>{values.due_at=values.due_at?new Date(values.due_at).toISOString():null;values.notifications=String(values.notifications||'').split(',').map(x=>x.trim()).filter(Boolean);values.priority=values.priority_level!=='none';const saved=await api('/api/tasks'+(task?'/'+task.id:''),{method:task?'PATCH':'POST',body:{...values,revision:task?.revision,source_id:task?.source_id||message?.id||null,calendar_provider:task?.calendar_provider||prefill.calendar_provider||'local',external_calendar_id:task?.external_calendar_id||prefill.external_calendar_id||'',external_event_id:task?.external_event_id||prefill.external_event_id||'',sync_state:task?.sync_state||prefill.sync_state||'local'}});const area=String(saved.area||values.area||'').trim();if(area&&!state.areas.some(x=>x.localeCompare(area,'pt-BR',{sensitivity:'base'})===0)){state.areas.push(area);state.areas.sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));}await loadTasks();if(state.currentTab==='commitments')await loadCommitments();});$('editorDialog').classList.add('task-editor-dialog');}
function miniContextLabel(){if(state.currentTab==='userpage'&&state.selectedUserPage){const path=userPageAncestors(state.selectedUserPage).map(x=>x.title).join(' › ');return path+(state.miniSofiaUseContext?' · contexto completo':' · página em foco');}const names={tasks:'Tarefas',commitments:'Agenda',lists:'Listas',library:'Biblioteca',study:'Estudos',vault:'Diário Pessoal',settings:'Configuração',panorama:'Panorama'};const base=names[state.currentTab]||'Contexto global';return base+(state.miniSofiaUseContext?' · completo':' · leve');}
function renderMiniSofia(){const panel=$('miniSofiaPanel'),thread=$('miniSofiaThread');if(!panel||!thread)return;$('miniSofiaContext').textContent=miniContextLabel();$('miniSofiaClearContext').textContent=state.miniSofiaUseContext?'Reduzir contexto':'Ampliar contexto';thread.replaceChildren();const items=state.messages.filter(m=>['user','assistant'].includes(m.role)).slice(-8);if(!items.length&&!state.optimisticVoice)thread.append(el('p','hint','Pode falar comigo daqui. Eu continuo sendo a mesma Sofia.'));for(const m of items){const row=el('div','mini-turn '+m.role);row.append(el('strong','',m.role==='user'?'Você':'Sofia'));const content=el('div');if(m.voice&&m.role==='user')content.append(renderVoiceMessage(m.voice,{transcript:m.content}));else content.textContent=m.content;row.append(content);thread.append(row);}const pendingVoice=state.optimisticVoice?.target==='mini'&&!items.some(m=>m.client_id===state.optimisticVoice.clientId);if(pendingVoice){const row=el('div','mini-turn user optimistic-voice');row.append(el('strong','','Você'));const content=el('div');content.append(renderVoiceMessage(state.optimisticVoice));row.append(content);thread.append(row);}if(state.homeUsage)thread.append(usageCardFromData(state.homeUsage));if(state.miniSofiaBusy)thread.append(el('div','mini-turn assistant','Sofia está pensando…'));requestAnimationFrame(()=>thread.scrollTop=thread.scrollHeight);}
function updateMiniSofiaVisibility(){const b=$('miniSofiaButton'),p=$('miniSofiaPanel');if(!b||!p)return;const show=state.uiMode==='user'&&state.currentTab&&state.currentTab!=='start';b.hidden=!show;if(!show){p.hidden=true;state.miniSofiaOpen=false;}else{p.hidden=!state.miniSofiaOpen;renderMiniSofia();}}
$('miniSofiaButton').onclick=()=>{state.miniSofiaOpen=!state.miniSofiaOpen;updateMiniSofiaVisibility();if(state.miniSofiaOpen)$('miniSofiaInput').focus();};
$('miniSofiaClose').onclick=()=>{state.miniSofiaOpen=false;updateMiniSofiaVisibility();};
$('miniSofiaClearContext').onclick=()=>{state.miniSofiaUseContext=!state.miniSofiaUseContext;renderMiniSofia();};
$('miniSofiaForm').onsubmit=async e=>{e.preventDefault();const input=$('miniSofiaInput'),text=input.value.trim(),images=chatImagePayloads('mini');if((!text&&!images.length)||state.miniSofiaBusy)return;input.value='';state.miniSofiaBusy=true;renderMiniSofia();try{const r=images.length?await send(text,{route:'auto',navigate:false,uiContext:miniContextPayload(),images}):await send(text,{route:'auto',navigate:false,uiContext:miniContextPayload()});clearPendingImages('mini');state.pendingClarification=r?.clarification||null;state.homeTarget=r?.ui_target||null;}catch(error){showError(error);}finally{state.miniSofiaBusy=false;renderMiniSofia();}};
$('miniSofiaInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('miniSofiaForm').requestSubmit();}});
$('themePreference').addEventListener('change',e=>applyTheme(e.target.value));
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{const menu=$('accountMenu');if(menu)menu.open=false;return b.dataset.tab==='start'?navigateStartSection('top'):setTab(b.dataset.tab);};
const accountMenu=$('accountMenu');
const accountPopover=accountMenu?.querySelector('.account-popover');
function positionAccountPopover(){if(!accountMenu?.open||!accountPopover)return;const trigger=accountMenu.querySelector('.account-summary');if(!trigger)return;const rect=trigger.getBoundingClientRect(),gap=8,width=Math.min(240,Math.max(214,Math.round(rect.width+12)));accountPopover.style.width=width+'px';accountPopover.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-width-8))+'px';accountPopover.style.top='8px';accountPopover.style.right='auto';accountPopover.style.bottom='auto';const height=accountPopover.getBoundingClientRect().height;let top=rect.top-height-gap;if(top<8)top=rect.bottom+gap;if(top+height>window.innerHeight-8)top=Math.max(8,window.innerHeight-height-8);accountPopover.style.top=Math.round(top)+'px';}
function closeAccountMenu(){if(accountMenu)accountMenu.open=false;}
accountMenu?.addEventListener('toggle',()=>{if(accountMenu.open)requestAnimationFrame(positionAccountPopover);});
window.addEventListener('resize',()=>{if(accountMenu?.open)positionAccountPopover();},{passive:true});
document.querySelector('.sidebar')?.addEventListener('scroll',()=>{if(accountMenu?.open)closeAccountMenu();},{passive:true});
document.addEventListener('pointerdown',event=>{if(accountMenu?.open&&!accountMenu.contains(event.target))closeAccountMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&accountMenu?.open){closeAccountMenu();accountMenu.querySelector('summary')?.focus();}});
$('accountProfileButton')?.addEventListener('click',()=>{closeAccountMenu();setTab('settings');requestAnimationFrame(()=>{const card=$('accountProfileCard');card?.scrollIntoView({behavior:'smooth',block:'start'});$('profileName')?.focus({preventScroll:true});});});
$('accountLogoutButton')?.addEventListener('click',()=>{closeAccountMenu();location.assign('/logout');});
$('logoutCurrentSession')?.addEventListener('click',()=>location.assign('/logout'));
$('logoutAllSessions')?.addEventListener('click',async()=>{if(!await uiConfirm('Isso encerra todas as sessões online da Sofia, inclusive em outros navegadores. Continuar?',{title:'Encerrar todas as sessões',confirmLabel:'Encerrar sessões'}))return;const result=await api('/api/auth/logout-all',{method:'POST'});location.replace(result.redirect||'/login?logout=all');});
bindVoiceControls('home');bindVoiceControls('mini');bindVoiceControls('chat');bindImagePaste('home',$('homeMessageInput'));bindImagePaste('mini',$('miniSofiaInput'));bindImagePaste('chat',$('messageInput'));
function profileInitials(name){const parts=String(name||'').trim().split(/\s+/).filter(Boolean);return (parts.length>1?(parts[0][0]+parts[parts.length-1][0]):(parts[0]||'S').slice(0,2)).toUpperCase();}
function renderOwnerProfile(settings=state.settings||{},auth=state.auth||{}){const name=String(settings.profileName||'Pedro Silva').trim()||'Pedro Silva',email=String(settings.profileEmail||'sofiaos.core@gmail.com').trim(),initials=profileInitials(name);for(const id of ['accountAvatar','profileAvatar'])if($(id))$(id).textContent=initials;if($('accountDisplayName'))$('accountDisplayName').textContent=name;if($('accountSessionLabel')){$('accountSessionLabel').textContent=email;$('accountSessionLabel').title=email;}if($('profileHeadingName'))$('profileHeadingName').textContent=name;if($('profileName'))$('profileName').value=name;if($('profileEmail'))$('profileEmail').value=email;if($('profileSessionState'))$('profileSessionState').textContent=auth?.online?'Sessão online ativa':'Acesso local';if($('recoveryEmailStatus'))$('recoveryEmailStatus').textContent=auth?.recovery_email_configured?'Recuperação por e-mail ativa para '+email+'.':'Recuperação por e-mail ainda precisa das credenciais SMTP no Railway.';}
$('profileForm')?.addEventListener('submit',async event=>{event.preventDefault();try{const profileName=$('profileName').value.trim(),profileEmail=$('profileEmail').value.trim();const updated=await api('/api/settings',{method:'PATCH',body:{profileName,profileEmail}});state.settings=updated;renderOwnerProfile(updated,state.auth);notify('Perfil atualizado.');}catch(error){showError(error);}});
$('passwordChangeForm')?.addEventListener('submit',async event=>{event.preventDefault();const currentPassword=$('currentPassword').value,newPassword=$('newAccountPassword').value,confirmPassword=$('confirmAccountPassword').value;if(newPassword!==confirmPassword)return notify('As duas senhas novas precisam ser iguais.',true);try{const result=await api('/api/auth/change-password',{method:'POST',body:{currentPassword,newPassword,confirmPassword}});location.replace(result.redirect||'/login?changed=1');}catch(error){showError(error);}});
// v141: one authenticated owner conversation, shared with the native app.
let ownerSyncBusy=false,ownerSyncEpoch=0;
function ownerHasDraft(){return ['homeMessageInput','miniSofiaInput','messageInput'].some(id=>String($(id)?.value||'').trim())||Object.values(state.pendingImages||{}).some(items=>items?.length);}
function reconcileOwnerMessages(current,snapshot){const removed=new Set(snapshot.deleted_ids||[]),incoming=snapshot.messages||[],floor=snapshot.has_more&&incoming.length?Math.min(...incoming.map(m=>m.sequence||0)):0;const retained=current.filter(m=>Number(m.sequence)<floor&&!removed.has(m.id));const map=new Map([...retained,...incoming].filter(m=>!removed.has(m.id)).map(m=>[m.id,m]));return [...map.values()].sort((a,b)=>(a.sequence||0)-(b.sequence||0));}
async function ensureOwnerChat(){const r=await api('/api/chat-sync/current',{method:'POST',body:{}});if(!r.conversation)throw new Error('Não foi possível abrir a conversa pessoal.');state.conversation=r.conversation;state.messages=r.messages;state.hasMore=r.has_more;return r.conversation;}
async function syncOwnerChat({force=false}={}){
 if(ownerSyncBusy||!state.token||document.hidden||state.uiMode!=='user'||state.protectedMode||state.busy||state.homeThinking||state.miniSofiaBusy||state.voiceRecorder)return;
 ownerSyncBusy=true;const epoch=++ownerSyncEpoch,id=state.conversation?.id,beforeMessages=state.messages;
 try{const r=await api('/api/chat-sync');if(epoch!==ownerSyncEpoch||state.busy||state.protectedMode||state.voiceRecorder||state.conversation?.id!==id||state.messages!==beforeMessages)return;
  if(!r.conversation){if(!ownerHasDraft()){state.conversation=null;state.messages=[];state.hasMore=false;renderMessages();renderHomeThread();renderMiniSofia();}return;}
  if(id!==r.conversation.id&&ownerHasDraft())return;
  const next=id===r.conversation.id?reconcileOwnerMessages(state.messages,r):r.messages;
  if(!force&&id===r.conversation.id&&JSON.stringify(next)===JSON.stringify(state.messages))return;
  const anchor=captureStartViewportAnchor();state.conversation=r.conversation;state.messages=next;state.hasMore=r.has_more;
  renderMessages();renderHomeThread();renderMiniSofia();restoreStartViewportAnchor(anchor);if($('chatTitle'))$('chatTitle').textContent=r.conversation.title;
 }catch(e){if(force)showError(e);}finally{ownerSyncBusy=false;}
}
setInterval(()=>{void syncOwnerChat();},2000);
window.addEventListener('focus',()=>{void syncOwnerChat();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncOwnerChat();});
async function start(){try{state.themePreference=localStorage.getItem('sofiaTheme')||document.documentElement.dataset.themePreference||'system';applyTheme(state.themePreference,{persist:false});const b=await api('/api/bootstrap');state.token=b.token;state.auth=b.auth||null;state.settings=b.settings;state.uiMode=b.settings.uiMode||'user';state.homeWidgets=b.settings.homeWidgets||[];state.userNavWidgets=['lists','library'];state.listViews=b.settings.listViews||['market','pharmacy','purchase','blackfriday','monitor'];state.libraryViews=b.settings.libraryViews||[];applyOptionalNavigation();$('chatRoute').value=['private','shared'].includes(b.settings.privacyMode)?b.settings.privacyMode:'auto';$('connectionLabel').textContent='Memória ativa';$('status').textContent='Pronta · Core '+b.version;const sessionStatus=$('sessionStatus');renderOwnerProfile(b.settings,b.auth);if(sessionStatus&&b.auth?.session_expires_at){sessionStatus.textContent='Sessão online válida até '+date(b.auth.session_expires_at)+'.';}applyUiMode();try{state.userPageExpanded=JSON.parse(localStorage.getItem('sofiaPageExpandedV141')||'{}');}catch{state.userPageExpanded={};}await refreshHistory();await loadUserPages();if(state.uiMode==='developer'){const saved=localStorage.getItem('sofiaConversationId');if(saved){try{await loadConversation(saved,{navigate:false});}catch{localStorage.removeItem('sofiaConversationId');}}}else{resetUserChatSession();await syncOwnerChat({force:true});}if(b.backup_warning)notify(b.backup_warning,true);}catch(e){$('connectionLabel').textContent='Servidor indisponível';showError(e);}}
window.addEventListener('pagehide',()=>{if(state.uiMode==='user')localStorage.removeItem('sofiaConversationId');});
window.addEventListener('pageshow',event=>{if(event.persisted&&state.uiMode==='user'){resetUserChatSession();state.startSection='top';setTab('start',{reload:false});scrollStartSection('top',{smooth:false});}});
start().then(()=>setTab(state.uiMode==='developer'?'panorama':'start'));

// v45: domain panels share the same persistent records, revisions and links.
Object.assign(state,{catalog:null,areas:[],flowKind:'tasks',studyKind:'course',libraryKind:'recipe',knowledgeKind:'idea',taskFilter:'active',lesson:null,vaultGrant:null,entityFilters:{},purchaseGroupFilter:'all'});
const words={interest:'Interesse',planned:'Planejado',idea:'Ideia / intenção',active:'Em andamento',paused:'Em pausa',completed:'Concluído',archived:'Arquivado',confirmed:'Confirmado',draft:'Rascunho',purchased:'Comprado',needed:'Falta comprar',unavailable:'Não encontrado',collecting:'Coletando fragmentos',questions:'Aguardando respostas',ready:'Pronta',saved:'Salvo',learning:'Estudando',acquired:'No acervo',to_watch:'Assistir depois',watched:'Assistido',reading:'Lendo',approved:'Aprovado · não enviado',rejected:'Não aprovado',out:'Em saída',returned:'Retorno conferido',planning:'Planejamento',pending:'Pendente',waiting:'Aguardando',review:'Em revisão',issued_reported:'Emissão informada',uploaded_reported:'Envio informado',paid_reported:'Pagamento informado',private:'Filtro Privado',shared:'Filtro Compartilhado',local:'Local técnico',public:'Filtro Compartilhado',sofia:'Com a Sofia',external:'Curso externo',market:'Mercado',pharmacy:'Farmácia',other:'Outro',none:'Nenhuma','black-friday':'Black Friday',manual:'Observações manuais',json:'Feed JSON autorizado',daily:'Diária',weekly:'Semanal',monthly:'Mensal',notification:'Aviso na central',task:'Criar tarefa local',allowed:'Liberado',blocked:'Bloqueado',reference:'Referência',prompt:'Prompt','professional-link':'Link profissional',drive:'Google Drive (referência)',whatsapp:'WhatsApp',email:'E-mail',slack:'Slack'};
function label(value){return words[value]||labels[value]||value;}
async function catalog(){if(!state.catalog){const c=await api('/api/catalog');state.catalog=c.catalog;state.areas=c.areas;}return state.catalog;}
function localDay(v=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));}
function taskVisible(t){const f=state.taskFilter;if(f==='priority')return t.priority&&!['done','cancelled'].includes(t.state);if(f==='today')return t.due_at&&localDay(t.due_at)===localDay()&&!['done','cancelled'].includes(t.state);if(f==='active')return !['done','cancelled'].includes(t.state);return f==='all'||t.state===f;}
function taskPriorityLabel(level){return ({important:'Importante',medium:'Médio',light:'Leve'})[level]||'';}
function taskPriorityClass(level){return ({important:' priority-important',medium:' priority-medium',light:' priority-light'})[level]||'';}
async function loadTaskCards(){state.tasks=(await api('/api/tasks')).items;const list=$('taskList');list.replaceChildren();for(const t of state.tasks.filter(taskVisible)){const c=el('article','data-card quick-delete-card task-card');c.dataset.taskColor=t.color||'default';c.append(el('span','tag'+(t.state==='done'?' done':''),labels[t.state]),el('span','tag',t.area),quickDeleteButton(t,{task:true}));const priorityLevel=t.priority_level||(t.priority?'important':'none'),priorityText=taskPriorityLabel(priorityLevel);if(priorityText)c.append(el('span','tag task-priority-tag'+taskPriorityClass(priorityLevel),priorityText));c.append(el('h3','',t.title));if(t.description)c.append(el('p','task-card-description',String(t.description).slice(0,320)));const meta=[];meta.push(t.due_at?'Prevista: '+date(t.due_at):'Sem data definida');if(t.location)meta.push('Local: '+t.location);if(Array.isArray(t.notifications)&&t.notifications.length)meta.push('Notificação: '+t.notifications.join(' · '));c.append(el('p','',meta.join(' · ')));if(t.original_due_at&&t.original_due_at!==t.due_at)c.append(el('p','small-meta','Primeira data: '+date(t.original_due_at)));const a=el('div','button-row');a.append(btn('Editar',()=>editTask(t)),btn('Histórico',async()=>detail('Histórico da tarefa',JSON.stringify((await api('/api/tasks/'+t.id+'/versions')).items.map(v=>JSON.parse(v.snapshot)),null,2))));if(t.state!=='done')a.append(btn('Concluir',async()=>{await api('/api/tasks/'+t.id,{method:'PATCH',body:{...t,state:'done'}});await loadTasks();}));c.append(a);list.append(c);}if(!state.tasks.length)list.append(el('p','hint','Nenhuma tarefa ainda. Você também pode escrever: “Coloque no A Fazer revisar o logo”.'));}
const FLOW=['tasks','commitment','reminder','project','dream','purchase','shopping_item','monitor','routine','plan_review','checkout','approval','request','opportunity','invoice','payment','automation'];
async function loadTasks(){await catalog();const controls=$('flowControls');controls.replaceChildren();if(state.uiMode==='user')state.flowKind='tasks';else for(const k of FLOW)controls.append(btn(k==='tasks'?'Tarefas':state.catalog[k].label,()=>{state.flowKind=k;loadTasks();},state.flowKind===k?'selected':''));
 $('flowTitle').textContent=state.uiMode==='user'?'Tarefas.':'Fluxo Ativo.';$('flowSubtitle').textContent=state.uiMode==='user'?'O que precisa de ação, com prioridade e histórico.':'Intenções em movimento: tarefas, projetos, compras, rotinas, solicitações e acompanhamentos conectados.';
 const tasks=state.flowKind==='tasks';$('taskList').hidden=!tasks;$('taskViews').hidden=!tasks;$('flowList').hidden=tasks;$('addTask').textContent=tasks?'＋ Nova tarefa':'＋ '+state.catalog[state.flowKind].label;
 $('addTask').onclick=()=>tasks?editTask():editEntity(state.flowKind,null,'flow');
 if(tasks){$('flowInfo').textContent='A Fazer é uma visão do Fluxo Ativo. Prioridade não duplica tarefa e tarefa vencida não é concluída automaticamente.';const v=$('taskViews');v.replaceChildren();for(const [k,t] of [['active','Ativas'],['todo','A Fazer'],['today','Hoje'],['priority','Prioridades'],['doing','Em andamento'],['waiting','Aguardando'],['pending','Pendentes'],['done','Concluídas'],['all','Histórico completo']])v.append(btn(t,()=>{state.taskFilter=k;loadTasks();},state.taskFilter===k?'selected':''));await loadTaskCards();}
 else{$('flowInfo').textContent=state.catalog[state.flowKind].description;await renderEntities('flow',state.flowKind);}
}
async function loadGroup(group){await catalog();let key=state[group+'Kind'];const target=$(group+'Controls');target.replaceChildren();const groupName=group==='study'?'study':group==='knowledge'?'knowledge':'library';let entries=Object.entries(state.catalog).filter(([,c])=>c.group===groupName);if(group==='library'){const allowed=state.libraryViews?.length?new Set(state.libraryViews):null;if(allowed)entries=entries.filter(([kind])=>allowed.has(kind));if(!entries.length)entries=Object.entries(state.catalog).filter(([,c])=>c.group===groupName).slice(0,1);if(!entries.some(([kind])=>kind===key)){key=entries[0]?.[0]||'recipe';state.libraryKind=key;}}for(const [kind,c] of entries)target.append(btn(c.label,()=>{state[group+'Kind']=kind;loadGroup(group);},key===kind?'selected':''));if(group==='library')target.append(btn('Gerenciar categorias',manageLibraryViews,'secondary'));target.append(btn('＋ Novo',()=>editEntity(key,null,group),'primary'));if($(group+'Info'))$(group+'Info').textContent=state.catalog[key]?.description||'';await renderEntities(group,key);}
function commonFilters(group){const holder=el('div','filter-row');const f=state.entityFilters[group]||{};const q=el('input');q.placeholder='Buscar título, descrição ou label';q.value=f.q||'';q.setAttribute('aria-label','Buscar registros');const area=el('select');area.setAttribute('aria-label','Filtrar área');for(const value of ['',...state.areas]){const o=el('option','',value||'Todas as áreas');o.value=value;area.append(o);}area.value=f.area||'';const stateSel=el('select');for(const [v,t] of [['active','Ativos'],['all','Com arquivados'],['black-friday','Black Friday']]){const o=el('option','',t);o.value=v;stateSel.append(o);}stateSel.value=f.view||'active';holder.append(q,area,stateSel,btn('Filtrar',()=>{state.entityFilters[group]={q:q.value,area:area.value,view:stateSel.value};return group==='flow'?loadTasks():loadGroup(group);}));return holder;}
async function renderEntities(group,kind){const list=$(group+'List');list.replaceChildren();const container=list.parentNode;let filters=$('filters-'+group);if(filters)filters.remove();filters=commonFilters(group);filters.id='filters-'+group;container.insertBefore(filters,list);const f=state.entityFilters[group]||{};const data=await api('/api/entities?kind='+encodeURIComponent(kind)+(f.area?'&area='+encodeURIComponent(f.area):'')+(f.q?'&q='+encodeURIComponent(f.q):'')+'&limit=500');let items=data.items;if(f.view!=='all')items=items.filter(e=>e.state!=='archived');if(f.view==='black-friday')items=items.filter(e=>e.tags.includes('Black Friday')||e.data.occasion==='black-friday');
 for(const e of items){const quickAllowed=group!=='study'&&state.catalog[e.kind]?.group!=='study';const card=el('article','data-card'+(quickAllowed?' quick-delete-card':''));const tags=el('div','tags');tags.append(el('span','tag',label(e.state)),el('span','tag',e.area));for(const t of e.tags)tags.append(el('span','tag',t));card.append(tags,el('h3','',e.title));if(quickAllowed)card.append(quickDeleteButton(e));if(e.content)card.append(el('p','',e.content.slice(0,360)));card.append(el('p','small-meta',label(e.privacy)+' · v'+e.revision+' · '+date(e.updated_at)));const a=el('div','button-row');a.append(btn('Abrir',()=>openRecord(e.id)),btn('Editar',()=>editEntity(kind,e,group)));if(kind!=='course')a.append(btn('Excluir',()=>deleteRecord(e),'danger'));if(kind==='course')a.append(btn('Começar sessão',()=>startStudy(e)),btn('Acompanhar progresso',()=>createMonitor(e,group)));if(kind==='purchase')a.append(btn('Monitorar preço',()=>createMonitor(e,group)));if(kind==='recipe')a.append(btn('Lista de compras',async()=>{const r=await api('/api/entities/'+e.id+'/action',{method:'POST',body:{action:'recipe_to_shopping'}});notify(r.created.length+' itens adicionados. '+r.notice);}));card.append(a);list.append(card);}
 if(!items.length)list.append(el('div','empty-card','Nenhum registro nesta visão. Use “Novo” para começar — sem dados de exemplo misturados à sua memória.'));if(data.items.length===500)list.append(el('p','hint','Exibindo até 500 registros. Use os filtros para reduzir a busca.'));
}
async function choicesFor(field){const kind=({course_id:'course',recipe_id:'recipe',session_id:'recipe_session',parent_id:'project',purchase_group_id:'purchase_group'})[field.key];if(field.key==='target_id'){const a=(await api('/api/entities?kind=purchase&limit=500')).items,b=(await api('/api/entities?kind=course&limit=500')).items;return [['','Selecione'],...[...a,...b].map(e=>[e.id,e.title])];}if(kind)return [['','Selecione'],...(await api('/api/entities?kind='+kind+'&limit=500')).items.map(e=>[e.id,e.title])];return null;}
async function editEntity(kind,entity=null,group=null){
 await catalog();const c=state.catalog[kind];let purchaseGroups=[];let currentPurchaseGroup='';
 if(kind==='purchase'){
   purchaseGroups=(await api('/api/entities?kind=purchase_group&limit=300')).items.filter(x=>x.state==='active');
   currentPurchaseGroup=purchaseGroups.find(x=>x.id===entity?.data?.purchase_group_id)?.title||'';
 }
 const fields=[{name:'title',label:'Título',value:entity?.title||'',required:true,max:240},{name:'area',label:'Área',type:'select',value:entity?.area||'Geral',options:state.areas.map(v=>[v,v])},{name:'state',label:'Estado',type:'select',value:entity?.state||c.states[0],options:c.states.map(v=>[v,label(v)])},{name:'privacy',label:'Filtro preferido para este registro',type:'select',value:entity?.privacy||c.defaultPrivacy||(c.group==='study'||c.group==='library'?'shared':'private'),options:[['shared','Filtro Compartilhado'],['private','Filtro Privado']]},{name:'tags',label:'Labels separadas por vírgula',value:entity?.tags.join(', ')||''},{name:'content',label:'Descrição / anotação original',type:'textarea',value:entity?.content||'',max:16000}];
 for(const f of c.fields){if(f.developerOnly&&state.uiMode!=='developer')continue;if(kind==='purchase'&&f.key==='purchase_group_id'){fields.push({name:'purchase_group_name',label:'Grupo de compra',value:currentPurchaseGroup,placeholder:'Ex.: Studio, Suplementação, Casa…',suggestions:purchaseGroups.map(g=>g.title),max:100,hint:'Escolha um grupo existente ou escreva um novo. Também dá para arrastar o card entre grupos na tela Comprar.'});continue;}const choices=await choicesFor(f);fields.push({name:'data_'+f.key,label:f.label,type:choices?'select':f.type==='datetime'?'datetime-local':f.type==='url'?'url':f.type,value:f.type==='datetime'?dateInput(entity?.data[f.key]):entity?.data[f.key]??(f.type==='checkbox'?false:''),options:choices||(f.options?[['','Não informado'],...f.options.map(v=>[v,label(v)])]:undefined),max:f.type==='textarea'?16000:1000});}
 editor((entity?'Editar · ':'Novo · ')+c.label,fields,async values=>{const data={};let purchaseGroupName=kind==='purchase'?String(values.purchase_group_name||'').trim():'';delete values.purchase_group_name;for(const f of c.fields){if(f.developerOnly&&state.uiMode!=='developer'){data[f.key]=entity?.data?.[f.key]??'';continue;}if(kind==='purchase'&&f.key==='purchase_group_id'){if(!purchaseGroupName)data[f.key]='';else{let found=purchaseGroups.find(g=>g.title.localeCompare(purchaseGroupName,'pt-BR',{sensitivity:'accent'})===0);if(!found)found=await api('/api/entities',{method:'POST',body:{kind:'purchase_group',title:purchaseGroupName,content:'',area:'Pessoal',privacy:'private',state:'active',data:{},tags:['Grupo de compras']}});data[f.key]=found.id;}continue;}let v=values['data_'+f.key];if(f.type==='number')v=v===''?'':Number(v);if(f.type==='datetime')v=v?new Date(v).toISOString():'';data[f.key]=v;delete values['data_'+f.key];}await api('/api/entities'+(entity?'/'+entity.id:''),{method:entity?'PATCH':'POST',body:{...values,kind,data,revision:entity?.revision,source_id:entity?.source_id}});notify(entity?'Registro atualizado.':'Registro criado.');if(group)await(group==='flow'?loadTasks():group==='lists'?loadLists():group==='commitments'?loadCommitments():loadGroup(group));else if(state.currentTab==='commitments'&&['commitment','reminder'].includes(kind))await loadCommitments();else if(kind==='purchase'||kind==='purchase_group')await loadLists();else if(kind==='contact')await loadConnections();});
 if(entity&&kind==='course'){
   const fieldsHost=$('editorFields');
   if(fieldsHost){
     const danger=el('section','course-editor-danger-zone');
     danger.append(el('strong','','Excluir curso'),el('p','editor-field-hint','Esta opção fica somente dentro de Editar. O curso não mostra mais botão de exclusão no card nem na tela Abrir.'));
     const remove=btn('Excluir curso',async()=>{if(!await uiConfirm('Excluir este curso? Esta ação remove o registro do curso.',{title:'Excluir curso',confirmLabel:'Excluir'}))return;closeEditor();await deleteRecord(entity);},'danger course-editor-delete');
     remove.type='button';danger.append(remove);fieldsHost.append(danger);
   }
 }
 if(group==='commitments')$('editorDialog').classList.add('agenda-quick-dialog');
 for(const f of c.fields)if(f.type==='number'&&$('field-data_'+f.key)){const n=$('field-data_'+f.key);n.min='0';n.step='any';}
}

const recordDialog=el('dialog');recordDialog.id='recordDialog';document.body.append(recordDialog);closeOnBackdrop(recordDialog);closeOnBackdrop($('detailDialog'));closeOnBackdrop($('editorDialog'));closeOnBackdrop($('confirmDialog'));
async function openRecord(key){
  await catalog();
  let e;try{e=await api('/api/entities/'+key);}catch(error){if(recordDialog.open)recordDialog.close();throw error;}const definition=state.catalog[e.kind];recordDialog.dataset.recordId=e.id;
  recordDialog.replaceChildren();
  const head=el('div','dialog-title');
  head.append(el('h3','',e.title),btn('×',()=>recordDialog.close(),'icon-button'));
  recordDialog.append(head);
  if(definition.description)recordDialog.append(el('p','hint',definition.description));
  const content=el('div','record-details');
  if(e.content && !/^Registrad[oa] a partir da conversa\.?$/i.test(e.content.trim()))content.append(el('p','',e.content));
  for(const f of definition.fields){
    if(f.developerOnly&&state.uiMode!=='developer')continue;
    const v=e.data[f.key];
    if(v===''||v===null||v===false||v===undefined)continue;
    const row=el('div','record-field');
    row.append(el('strong','',f.label),el('p','',fieldValue(f,v)));
    if(f.type==='url'){const a=el('a','text-link','Abrir fonte ↗');a.href=v;a.target='_blank';a.rel='noopener noreferrer';row.append(a);}
    content.append(row);
  }
  recordDialog.append(content);
  if(state.uiMode==='developer')recordDialog.append(el('p','small-meta','ID '+e.id+' · v'+e.revision+' · criado '+date(e.created_at)));
  else recordDialog.append(el('p','small-meta','Criado em '+date(e.created_at)));
  const actions=el('div','button-row');
  actions.append(btn('Editar',()=>{recordDialog.close();return editEntity(e.kind,e);}));if(e.kind!=='course')actions.append(btn('Excluir',()=>deleteRecord(e),'danger'));
  if(state.uiMode==='developer'){
    actions.append(
      btn('Versões',async()=>{const versions=(await api('/api/entities/'+e.id+'/versions')).items;recordDialog.close();detail('Histórico — '+e.title,versions.map(v=>'VERSÃO '+v.revision+' · '+date(v.created_at)+'\n'+JSON.stringify(v.snapshot,null,2)).join('\n\n'));}),
      btn(e.state==='archived'?'Registro arquivado':'Arquivar',async()=>{if(e.state==='archived')return;if(await uiConfirm('Arquivar preservando todas as versões?',{title:'Arquivar registro',confirmLabel:'Arquivar'})){await api('/api/entities/'+key+'/action',{method:'POST',body:{action:'state',state:'archived',revision:e.revision}});recordDialog.close();notify('Arquivado.');}}),
      btn('Relacionar',()=>{recordDialog.close();return relate(e);}),
      btn('Ver vínculos',async()=>{const items=(await api('/api/relations?type=entity&id='+e.id)).items;recordDialog.close();detail('Vínculos — '+e.title,items.length?JSON.stringify(items,null,2):'Ainda não há vínculos explícitos. Labels também ajudam na busca.');}),
      btn('Anexar original',()=>attachFile(e))
    );
    if(e.kind==='commitment')actions.append(btn('Exportar .ics',async()=>{const r=await api('/api/entities/'+e.id+'/calendar',{raw:true});download(await r.blob(),'Sofia_agenda.ics');notify('Arquivo técnico gerado para teste.');}));
    if(e.kind==='approval'&&e.state!=='approved')actions.append(btn('Aprovar este rascunho',async()=>{if(!await uiConfirm('Revisou destinatário, remetente e texto? Aprovar NÃO envia.',{title:'Aprovar rascunho',confirmLabel:'Aprovar'}))return;await api('/api/entities/'+key+'/action',{method:'POST',body:{action:'approve',revision:e.revision}});await openRecord(key);}));
    if(e.kind==='course')actions.append(btn('Iniciar aula',()=>{recordDialog.close();return startStudy(e);}));
    if(e.kind==='lesson')actions.append(btn('Conversar nesta aula',()=>{recordDialog.close();return useLesson(e);}));
    if(e.kind==='monitor')actions.append(btn('Registrar preço',()=>{recordDialog.close();observe(e);}),btn('Histórico de preços',async()=>{const rows=(await api('/api/entities/'+key+'/observations')).items;recordDialog.close();detail('Preços — '+e.title,rows.length?rows.map(r=>date(r.observed_at)+' · '+r.currency+' '+(r.total_cents/100).toFixed(2)+' (inclui frete informado)\nVariante: '+r.variant+'\nFonte: '+r.source).join('\n\n'):'Nenhuma observação. Não existe ainda uma série histórica.');}));
    if(e.kind==='recipe_session'&&e.state==='collecting')actions.append(btn('Adicionar fragmento',()=>{recordDialog.close();editor('Acrescentar à mesma sessão',[{name:'text',label:'Transcrição / trecho (não há transcrição automática)',type:'textarea',required:true,max:6000}],async b=>{await api('/api/entities/'+key+'/action',{method:'POST',body:{action:'recipe_fragment',...b}});notify('Fragmento acumulado; não iniciei perguntas.');});}),btn('Terminei de enviar',async()=>{await api('/api/entities/'+key+'/action',{method:'POST',body:{action:'recipe_finish'}});await openRecord(key);}));
    if(e.kind==='checkout')actions.append(btn('Conferir retorno',async()=>{const r=await api('/api/entities/'+key+'/action',{method:'POST',body:{action:'checkout_compare'}});recordDialog.close();detail('Conferência',r.note+'\n\nAinda sem confirmação:\n'+r.pending_confirmation.join('\n'));}));
    if(e.kind==='recipe')actions.append(btn('Gerar lista do mercado',async()=>{const r=await api('/api/entities/'+key+'/action',{method:'POST',body:{action:'recipe_to_shopping'}});notify(r.created.length+' itens adicionados. '+r.notice);}));
  }
  recordDialog.append(actions);
  if(state.uiMode==='developer'){
    const files=(await api('/api/entities/'+key+'/attachments')).items;
    if(files.length){recordDialog.append(el('h4','','Originais locais'));for(const a of files)recordDialog.append(btn(a.name+' · '+Math.round(a.bytes/1024)+' KB',async()=>{const r=await api('/api/attachments/'+a.id,{raw:true});download(await r.blob(),a.name);}));}
  }
  if(!recordDialog.open)recordDialog.showModal();
}

async function relate(e){const items=(await api('/api/entities?limit=500')).items.filter(x=>x.id!==e.id);if(!items.length)return notify('Crie outro registro para fazer um vínculo.');editor('Relacionar registros',[{name:'to_id',label:'Registro relacionado',type:'select',options:items.map(x=>[x.id,x.title+' · '+state.catalog[x.kind].label])},{name:'kind',label:'Tipo de relação',value:'related',max:80}],async b=>{await api('/api/relations',{method:'POST',body:{from_type:'entity',from_id:e.id,to_type:'entity',...b}});notify('Vínculo salvo. Nenhum registro foi movido ou duplicado.');});}
async function refreshCurrentSurface(kind=''){
  const active=[...document.querySelectorAll('.tab')].find(x=>!x.hidden)?.id?.replace(/^tab-/,'')||'start';
  if(active==='start'){
    if(['commitment','reminder'].includes(kind))return refreshHomeWidgets(['commitments','notifications']);
    if(kind==='task')return refreshHomeWidgets(['priorities','tasks','notifications']);
    if(['purchase','shopping_item','monitor','purchase_group','list_collection'].includes(kind))return refreshHomeWidgets(['shopping','monitors','notifications']);
    if(state.catalog?.[kind]?.group==='library')return refreshHomeWidgets(['recent','notifications']);
    return;
  }
  if(active==='commitments')return loadCommitments();
  if(active==='lists')return loadLists();if(active==='tasks')return loadTasks();if(active==='study')return loadGroup('study');if(active==='library')return loadGroup('library');if(active==='userpage')return loadSelectedUserPage();
}
async function deleteRecord(e){
  try{
    notify('');if(document.activeElement instanceof HTMLElement)document.activeElement.blur();const anchor=captureStartViewportAnchor();
    const parentId=e.kind==='user_page'?userPageData(e).parent_id||'':'';await api('/api/entities/'+encodeURIComponent(e.id),{method:'DELETE',body:{}});
    if(recordDialog.open)recordDialog.close();recordDialog.dataset.recordId='';if($('detailDialog').open)$('detailDialog').close();
    if(e.kind==='user_page'){await loadUserPages();const parent=parentId?state.userPages.find(x=>x.id===parentId):null;if(parent){state.selectedUserPage=parent;await setTab('userpage');}else{state.selectedUserPage=null;await navigateStartSection('top');}}
    else await refreshCurrentSurface(e.kind);notify('');restoreStartViewportAnchor(anchor);
  }catch(error){showError(error);}
}
async function deleteTaskRecord(t){try{notify('');if(document.activeElement instanceof HTMLElement)document.activeElement.blur();const anchor=captureStartViewportAnchor();await api('/api/tasks/'+encodeURIComponent(t.id),{method:'DELETE',body:{}});if(recordDialog.open)recordDialog.close();recordDialog.dataset.recordId='';if($('detailDialog').open)$('detailDialog').close();await refreshCurrentSurface('task');notify('');restoreStartViewportAnchor(anchor);}catch(error){showError(error);}}
async function attachFile(e){const input=el('input');input.type='file';input.accept='.mp3,.ogg,.wav,.m4a,.webm,.pdf,.png,.jpg,.jpeg,.txt';input.onchange=async()=>{try{const f=input.files[0];if(!f)return;if(f.size>10*1024*1024)throw new Error('Máximo de 10 MB por original.');const reader=new FileReader();const base64=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(f);});const ext=f.name.split('.').pop().toLowerCase(),types={mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',m4a:'audio/mp4',webm:'audio/webm',pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',txt:'text/plain'};await api('/api/entities/'+e.id+'/attachments',{method:'POST',body:{name:f.name,mime:types[ext]||f.type,base64}});notify('Original salvo localmente e incluído nos próximos backups. Não foi enviado ao Drive nem à IA.');await openRecord(e.id);}catch(error){showError(error);}};input.click();}
async function createMonitor(e,group){
  if(e.kind==='course'){
    const progress=await api('/api/entities/'+e.id+'/action',{method:'POST',body:{action:'watch'}});
    notify('Acompanhamento de progresso criado para este curso. Não é monitoramento de preço.');
    state.studyKind='study_progress';setTab('study');return openRecord(progress.id);
  }
  editor('Monitorar preço sem duplicar o item',[{name:'variant',label:'Variante / versão exata do produto',value:e.data.variant||e.title,required:true,max:1000}],async b=>{await api('/api/entities/'+e.id+'/action',{method:'POST',body:{action:'watch',variant:b.variant}});notify('Monitor de preço criado com coleta manual. Para automatizar, configure um feed JSON autorizado.');state.listView='monitor';setTab(state.uiMode==='user'?'lists':'tasks');});
}
function observe(e){editor('Registrar uma observação real',[{name:'price',label:'Preço na moeda '+e.data.currency,type:'number',required:true},{name:'shipping',label:'Frete informado (zero se grátis)',type:'number',value:'0',required:true},{name:'source',label:'Fonte / anúncio consultado',type:'url',required:true},{name:'observed_at',label:'Consultado em (vazio = agora)',type:'datetime-local'}],async b=>{await api('/api/entities/'+e.id+'/observations',{method:'POST',body:{price:Number(b.price),shipping:Number(b.shipping),variant:e.data.variant,currency:e.data.currency,source:b.source,observed_at:b.observed_at?new Date(b.observed_at).toISOString():undefined}});notify('Observação registrada. Eventuais oportunidades ficam na central, não no WhatsApp.');});$('field-price').step='0.01';$('field-shipping').step='0.01';}
async function startStudy(course){const lesson=await api('/api/entities/'+course.id+'/action',{method:'POST',body:{action:'course_session'}});await useLesson(lesson);}
async function useLesson(lesson){state.lesson=lesson;if(lesson.data.conversation_id){await loadConversation(lesson.data.conversation_id,{navigate:false});}else{await newConversation({title:lesson.title,navigate:false});lesson=await api('/api/entities/'+lesson.id,{method:'PATCH',body:{...lesson,data:{...lesson.data,conversation_id:state.conversation.id}}});state.lesson=lesson;}$('lessonBanner').hidden=false;$('lessonBanner').replaceChildren(el('span','','Modo de estudo · '+lesson.title+' · filtro escolhido automaticamente conforme o conteúdo '),btn('Sair da aula',()=>{state.lesson=null;$('lessonBanner').hidden=true;}));$('chatRoute').value='auto';notify('Aula aberta. Conteúdo geral de estudo pode usar o Filtro Compartilhado; informação pessoal ou reservada continua no Filtro Privado.');if(state.uiMode==='user')setTab('start');else setTab('chat');}
async function loadPanorama(){const data=await api('/api/panorama');const metrics=$('panoramaMetrics');metrics.replaceChildren();for(const [n,l] of [[data.active_flows.length,'fluxos em acompanhamento'],[data.priorities.length,'prioridades'],[data.stats.notes,'memórias confirmadas'],[data.notifications.length,'avisos não lidos']]){const c=el('div','metric');c.append(el('strong','',n),el('span','',l));metrics.append(c);}$('noticeCount').textContent=data.notifications.length;const panel=$('panoramaContent');panel.replaceChildren();const section=(title,items,render)=>{const a=el('article','settings-card');a.append(el('h3','',title));if(!items.length)a.append(el('p','hint','Nada nesta visão por enquanto.'));for(const x of items.slice(0,6))a.append(render(x));panel.append(a);};section('Suas prioridades',data.priorities,x=>btn(x.title,()=>{state.taskFilter='priority';setTab('tasks');},'dashboard-link'));section('De onde continuar',data.lessons,x=>btn(x.title,()=>useLesson(x),'dashboard-link'));section('Fluxos em movimento',data.active_flows,x=>btn(x.title+' · '+label(x.state),()=>openRecord(x.id),'dashboard-link'));section('Linha do tempo',data.timeline,x=>el('p','timeline-item',date(x.created_at)+' · '+x.summary));if(data.truncated)panel.append(el('p','hint','Panorama limitado aos 500 registros mais recentes. Use filtros para consultar o restante.'));}
$('openTimeline').onclick=async()=>{try{await catalog();recordDialog.replaceChildren();const head=el('div','dialog-title');head.append(el('h3','','Linha do tempo'),btn('×',()=>recordDialog.close()));const area=el('select');area.setAttribute('aria-label','Área da linha do tempo');for(const value of ['',...state.areas]){const o=el('option','',value||'Todas as áreas');o.value=value;area.append(o);}const items=el('div');async function load(){const rows=(await api('/api/timeline?area='+encodeURIComponent(area.value))).items;items.replaceChildren();for(const r of rows){const c=el('article','timeline-item');c.append(el('small','',date(r.created_at)+' · '+r.area),el('p','',r.summary));if(r.entity_type==='entity')c.append(btn('Abrir registro',()=>openRecord(r.entity_id)));items.append(c);}if(!rows.length)items.append(el('p','hint','Sem eventos neste recorte.'));}area.onchange=()=>load().catch(showError);recordDialog.append(head,area,items);await load();recordDialog.showModal();}catch(e){showError(e);}};
$('memoryKnowledge').onclick=()=>{const open=$('knowledgeList').hidden;$('knowledgeList').hidden=!open;$('knowledgeControls').hidden=!open;if(open)loadGroup('knowledge').catch(showError);};
let notificationsDialog=$('notificationsDialog');if(!notificationsDialog){notificationsDialog=el('aside','notifications-mini-dialog');notificationsDialog.id='notificationsDialog';notificationsDialog.setAttribute('role','dialog');notificationsDialog.setAttribute('aria-label','Prévia de notificações');notificationsDialog.setAttribute('aria-hidden','true');document.body.append(notificationsDialog);}
const NOTIFICATION_SOURCE_LABELS={automation:'Automações',reminder:'Lembretes',routine:'Rotinas',price:'Compras e monitoramentos'};
function notificationArea(n){return String(n.area||'Geral').trim()||'Geral';}
function notificationSource(n){const key=String(n.category||'').trim().toLocaleLowerCase('pt-BR');return NOTIFICATION_SOURCE_LABELS[key]||'Sofia';}
function notificationGroup(n){const source=notificationSource(n),area=notificationArea(n);return {source,area,key:source+'\u0000'+area};}
function notificationsPreviewOpen(){return notificationsDialog.classList.contains('is-open');}
function positionNotificationsDialog(){/* v105: posição controlada pelo CSS dentro do hover shell. */}
async function markNotificationRead(n,{refreshPage=false}={}){await api('/api/notifications/'+n.id+'/read',{method:'POST',body:{}});n.state='read';if(refreshPage)await loadNotificationsPage();if(state.currentTab==='start')await refreshHomeWidgets(['notifications']);}
let notificationsAnchor=null,notificationsHoverCloseTimer=null,notificationsOpenSerial=0;
function cancelNotificationsHoverClose(){if(notificationsHoverCloseTimer){clearTimeout(notificationsHoverCloseTimer);notificationsHoverCloseTimer=null;}}
function closeNotificationsPreview(){cancelNotificationsHoverClose();notificationsOpenSerial++;notificationsDialog.dataset.previewTrigger='';notificationsDialog.classList.remove('is-open');notificationsDialog.setAttribute('aria-hidden','true');const bell=$('startNotifications');if(bell)bell.setAttribute('aria-expanded','false');}
function scheduleNotificationsHoverClose(delay=260){cancelNotificationsHoverClose();notificationsHoverCloseTimer=setTimeout(()=>{notificationsHoverCloseTimer=null;if(notificationsPreviewOpen()&&notificationsDialog.dataset.previewTrigger==='hover')closeNotificationsPreview();},delay);}
function openNoticesDialogAt(anchor,{trigger='click'}={}){notificationsAnchor=anchor||$('startNotifications');notificationsDialog.dataset.previewTrigger=trigger;return openNoticesDialog();}
function renderNotificationsPopover(rows,{loading=false,error=''}={}){
  const items=Array.isArray(rows)?rows:[];notificationsDialog.replaceChildren();
  const head=el('div','notifications-mini-head'),headActions=el('div','notifications-mini-head-actions');
  const viewAll=btn('Ver todas',async()=>{closeNotificationsPreview();await setTab('notifications');},'notifications-mini-link');viewAll.title='Abrir a central completa de notificações';viewAll.setAttribute('aria-label','Abrir todas as notificações');
  headActions.append(viewAll,btn('×',closeNotificationsPreview,'icon-button notifications-mini-close'));head.append(el('strong','','Notificações'),headActions);notificationsDialog.append(head);
  const list=el('div','notifications-mini-list');
  if(error)list.append(el('p','hint notifications-empty-state',error));else if(!items.length)list.append(el('div','notifications-empty-state',loading?'Carregando notificações…':'Você não tem notificações.'));
  for(const n of items.slice(0,12)){const group=notificationGroup(n),row=el('article','notification-mini-item');row.append(el('span','notification-dot '+(n.state==='unread'?'unread':'read')),el('div','notification-mini-copy'));const copy=row.lastChild;copy.append(el('strong','',n.title),el('p','',n.body),el('small','',group.area+' · '+group.source+' · '+date(n.created_at)));if(n.state==='unread')row.append(btn('✓',async()=>{await markNotificationRead(n);const fresh=(await api('/api/notifications?refresh='+Date.now())).items;renderNotificationsPopover(fresh);},'notification-read'));list.append(row);}notificationsDialog.append(list);
}
async function openNoticesDialog(){
  const anchor=notificationsAnchor||$('startNotifications');notificationsAnchor=null;cancelNotificationsHoverClose();
  if(notificationsPreviewOpen()){positionNotificationsDialog(anchor);return;}
  const serial=++notificationsOpenSerial,cached=Array.isArray(state.homePanorama?.notifications)?state.homePanorama.notifications:[];
  renderNotificationsPopover(cached);notificationsDialog.classList.add('is-open');notificationsDialog.setAttribute('aria-hidden','false');if(anchor?.id==='startNotifications')anchor.setAttribute('aria-expanded','true');positionNotificationsDialog(anchor);
  try{const rows=(await api('/api/notifications?refresh='+Date.now())).items;if(serial!==notificationsOpenSerial||!notificationsPreviewOpen())return;renderNotificationsPopover(rows);positionNotificationsDialog(anchor);}catch(e){if(serial===notificationsOpenSerial&&notificationsPreviewOpen()&&!cached.length)renderNotificationsPopover([],{error:'Não foi possível carregar as notificações.'});showError(e);}
}
function closeNotificationsOnOutsidePointer(e){if(!notificationsPreviewOpen())return;if(notificationsDialog.contains(e.target)||e.target?.closest?.('#startNotifications,.notifications-widget'))return;closeNotificationsPreview();}
document.addEventListener('pointerdown',closeNotificationsOnOutsidePointer,true);
notificationsDialog.addEventListener('mouseenter',cancelNotificationsHoverClose);
notificationsDialog.addEventListener('mouseleave',()=>{if(notificationsDialog.dataset.previewTrigger==='hover')scheduleNotificationsHoverClose();});
function bindStartNotificationsHover(){
  const bell=$('startNotifications');if(!bell||bell.dataset.notificationsHoverBound==='1')return;
  bell.dataset.notificationsHoverBound='1';
  const openHover=()=>{cancelNotificationsHoverClose();openNoticesDialogAt(bell,{trigger:'hover'}).catch(showError);};
  bell.addEventListener('pointerenter',openHover);
  bell.addEventListener('mouseenter',openHover);
  bell.addEventListener('mouseleave',e=>{if(e.relatedTarget&&notificationsDialog.contains(e.relatedTarget))return;scheduleNotificationsHoverClose();});
  bell.addEventListener('focus',openHover);
  bell.addEventListener('blur',()=>scheduleNotificationsHoverClose());
}
bindStartNotificationsHover();
window.addEventListener('resize',()=>{if(notificationsPreviewOpen())positionNotificationsDialog($('startNotifications'));});
async function loadNotificationsPage(){
  const rows=(await api('/api/notifications?refresh='+Date.now())).items,host=$('notificationsPageContent'),count=$('notificationsPageCount');host.replaceChildren();if(count)count.textContent=rows.length+' '+(rows.length===1?'notificação':'notificações');
  const groups=new Map();for(const n of rows){const area=notificationArea(n);if(!groups.has(area))groups.set(area,{area,items:[]});groups.get(area).items.push(n);}const ordered=[...groups.values()].sort((a,b)=>a.area.localeCompare(b.area,'pt-BR',{sensitivity:'base'}));
  if(!ordered.length){host.append(el('div','empty-card notifications-page-empty','Você não tem notificações.'));return;}
  for(const group of ordered){const {area,items}=group,section=el('section','notifications-area');const head=el('div','notifications-area-head');head.append(el('div','notifications-area-title'),el('span','notifications-area-count',items.length+' '+(items.length===1?'notificação':'notificações')));head.firstChild.append(el('span','notifications-area-kicker','ÁREA'),el('h3','',area),el('small','notifications-area-subtitle','Notificações detalhadas desta área'));section.append(head);
    const bySource=new Map();for(const n of items){const source=notificationSource(n);if(!bySource.has(source))bySource.set(source,[]);bySource.get(source).push(n);}const sourceGroups=[...bySource.entries()].sort((a,b)=>a[0].localeCompare(b[0],'pt-BR',{sensitivity:'base'}));
    for(const [source,sourceItems] of sourceGroups){const sourceSection=el('div','notifications-source-group'),sourceHead=el('div','notifications-source-head');sourceHead.append(el('strong','',source),el('span','',sourceItems.length+' '+(sourceItems.length===1?'item':'itens')));sourceSection.append(sourceHead);const list=el('div','notifications-page-list');
      for(const n of sourceItems){const card=el('article','notification-page-item'+(n.state==='unread'?' unread':''));const copy=el('div','notification-page-copy');copy.append(el('div','notification-page-title-row'),el('p','',n.body),el('div','notification-page-meta'));copy.firstChild.append(el('span','tag',n.state==='read'?'Lido':'Novo'),el('strong','',n.title));const meta=copy.lastChild;meta.append(el('small','','Origem: '+source),el('small','','Categoria: '+(n.category||'geral')),el('small','','Importância: '+(n.importance||'info')),el('small','',date(n.created_at)),el('small','',n.entity_id?'Vinculada a um registro da Sofia':'Notificação geral da Sofia'));card.append(copy);const actions=el('div','notification-page-actions');if(n.entity_id)actions.append(btn('Abrir detalhe',()=>openRecord(n.entity_id),'secondary'));if(n.state==='unread')actions.append(btn('Marcar como lido',()=>markNotificationRead(n,{refreshPage:true}),'secondary'));card.append(actions);list.append(card);}sourceSection.append(list);section.append(sourceSection);
    }
    host.append(section);
  }
}
$('openNotices').onclick=e=>openNoticesDialogAt(e.currentTarget);
async function loadConnections(){await catalog();const rows=(await api('/api/integrations')).items;$('connectionsList').replaceChildren();for(const r of rows){const c=el('article','data-card'),status=r.status==='not-connected'?'Não conectado':r.status==='planned'?'Planejado':r.status==='ready-to-connect'?'Pronto para conectar':'Recurso local / configurável';c.append(el('span','tag',status),el('h3','',r.name),el('p','',r.description));if(r.key==='whatsapp'&&r.connect_url){const actions=el('div','button-row'),connect=btn('Conectar WhatsApp Business',()=>{const w=window.open(r.connect_url,'_blank','noopener,noreferrer');if(w)w.opener=null;},'primary');connect.title='Abrir o Cadastro Incorporado da Meta em modo de coexistência';actions.append(connect);c.append(actions);} $('connectionsList').append(c);}const people=(await api('/api/entities?kind=contact')).items;$('contactList').replaceChildren();for(const e of people){const c=el('article','data-card');c.append(el('span','tag',label(e.data.permission||'blocked')),el('h3','',e.title),btn('Editar escopos',()=>editEntity('contact',e)));$('contactList').append(c);}}
$('addContact').onclick=()=>editEntity('contact');
const booleanSettings=['routingEnabled','privateConfirmed','sharedConfirmed','sharedBillingAcknowledged'];const numericSettings=['dailyCallLimit','maxOutputTokens','privateDailyUSD','privateMonthlyUSD','sharedDailyUSD','sharedMonthlyUSD','privateInputPerMillion','privateOutputPerMillion','sharedInputPerMillion','sharedOutputPerMillion','sharedDailyTokenCap','sharedIncentiveDailyTokens','sharedUsageAlertPercent','privateUsageAlertPercent','privateUsageTotalUSD'];const textSettings=['privacyMode','legacyRoute','privateModel','sharedModel'];
function renderRoutingSetup(r,s){
  const host=$('routingSetupStatus');
  if(!host)return;
  host.replaceChildren();
  const rows=[
    ['Filtro Compartilhado',r.shared_key_present,s.sharedConfirmed&&s.sharedBillingAcknowledged,r.shared_ready],
    ['Filtro Privado',r.private_key_present,s.privateConfirmed,r.private_ready]
  ];
  for(const [name,keyOk,confirmed,ready] of rows){
    const c=el('div','setup-row');
    c.append(
      el('strong','',name),
      el('span',keyOk?'status-ok':'status-warn',keyOk?'Chave validada/salva':'Chave pendente'),
      el('span',confirmed?'status-ok':'status-warn',confirmed?'Projeto confirmado':'Confirmação pendente'),
      el('span',ready?'status-ok':'status-warn',ready?'Pronto para uso':'Ainda não pronto')
    );
    host.append(c);
  }
  host.append(el('p','hint',s.routingEnabled?'Roteamento automático ativado.':'Roteamento automático ainda está desativado.'));
}
async function loadSettings(){
  const b=await api('/api/bootstrap');
  state.token=b.token;state.settings=b.settings;
  for(const k of booleanSettings)$(k).checked=Boolean(b.settings[k]);
  for(const k of numericSettings)$(k).value=b.settings[k]??0;
  for(const k of textSettings)$(k).value=b.settings[k]==='test'?'auto':b.settings[k]||'';
  const r=await api('/api/routing');
  $('keyStatus').textContent='Privado: '+(r.private_key_present?'chave presente':'falta salvar')+' · Compartilhado: '+(r.shared_key_present?'chave presente':'falta salvar')+' · Usage Admin: '+(r.admin_key_present?'conectado à OpenAI':'falta chave Admin para sincronizar o painel')+(r.legacy_key_present?' · chave antiga preservada':'');
  renderRoutingSetup(r,b.settings);
  $('routeUsage').replaceChildren();
  for(const u of r.usage){
    const c=el('div','metric');
    c.append(el('strong','',label(u.route)),el('span','','Hoje: até USD '+(u.daily_microusd/1e6).toFixed(4)),el('span','','Mês: até USD '+(u.monthly_microusd/1e6).toFixed(4)),el('small','',u.uncertain+' reservas com consumo incerto'));
    $('routeUsage').append(c);
  }
  try{state.usageStatus=(await api('/api/usage-status')).usage;const host=$('routeUsage');host.prepend(usageCardFromData(state.usageStatus));}catch(e){console.warn('usage-status',e);}
  $('usageCards').replaceChildren();
  for(const [n,l] of [[b.usage.calls,'tentativas hoje'],[b.usage.input_tokens,'tokens de entrada informados'],[b.usage.output_tokens,'tokens de saída informados']]){
    const c=el('div','metric');c.append(el('strong','',n),el('span','',l));$('usageCards').append(c);
  }
  $('modelLabel').textContent='Modelo anterior preservado: '+b.model+'. '+r.notice;
  const backup=await api('/api/backups');
  $('backupStatus').textContent=backup.warning||('Backups locais encontrados: '+backup.items.length);
}
if($('clearChatHistory'))$('clearChatHistory').onclick=async()=>{try{if(!await uiConfirm('Apagar todo o histórico sincronizado de conversa do app e da web? Memórias e tarefas já salvas continuam existindo.',{title:'Apagar histórico do chat',confirmLabel:'Apagar tudo'}))return;await api('/api/chat-history',{method:'DELETE',body:{}});resetUserChatSession();await refreshHistory();notify('Histórico do chat apagado no app e na web.');}catch(e){showError(e);}};
$('settingsForm').onsubmit=async e=>{e.preventDefault();try{const data={};for(const k of booleanSettings)data[k]=$(k).checked;for(const k of numericSettings)data[k]=Number($(k).value);for(const k of textSettings)data[k]=$(k).value;await api('/api/settings',{method:'PATCH',body:data});await loadSettings();$('chatRoute').value=data.privacyMode==='private'?'private':data.privacyMode==='shared'?'shared':'auto';notify('Rotas e limites salvos. A configuração de compartilhamento da OpenAI não foi alterada por este botão.');}catch(error){showError(error);}};
$('credentialsForm').onsubmit=async e=>{e.preventDefault();const input=$('credentialKey'),route=$('credentialRoute').value;try{await api('/api/credentials',{method:'POST',body:{route,key:input.value}});input.value='';await loadSettings();if(route==='admin'){try{await refreshUsageStatus({show:Boolean(state.homeUsage),render:true});}catch{}notify('Chave Admin validada no Usage da OpenAI e salva no .env local. Os números de uso agora podem ser sincronizados com o painel.');}else notify('Chave validada na OpenAI e salva no .env local. Nenhuma conversa ou memória foi enviada no teste.');}catch(error){input.value='';showError(error);}};
$('quickMenu').onclick=()=>{recordDialog.replaceChildren();const head=el('div','dialog-title');head.append(el('h3','','Menu /.'),btn('×',()=>recordDialog.close()));recordDialog.append(head,btn('Ativar Safe Chat',()=>{recordDialog.close();setTab('start');setProtectedMode(true);},'dashboard-link'),btn('Abrir Diário Pessoal',()=>{recordDialog.close();setTab('vault');},'dashboard-link'),el('p','hint','No uso normal, a Sofia escolhe o filtro automaticamente. Safe Chat é um modo da conversa; Diário Pessoal é um espaço protegido separado.'));recordDialog.showModal();};
$('previewRoute').onclick=async()=>{try{const r=await api('/api/privacy/preview',{method:'POST',body:{}});$('routePreview').textContent='IA primeiro: '+r.reason;}catch(e){showError(e);}};
async function loadVault(){const s=await api('/api/vault/status');$('vaultStatus').textContent=s.initialized?'Diário Pessoal protegido · '+s.count+' registros criptografados. Leitura bloqueada até autorizar.':'Configure o Authenticator para começar a usar o Diário Pessoal protegido.';$('vaultControls').replaceChildren();if(!s.initialized)$('vaultControls').append(btn('Configurar proteção',setupVault,'primary'));else $('vaultControls').append(btn('Desbloquear por 5 minutos',unlockVault,'primary'),btn('Recuperar acesso',recoverVault));if(state.vaultGrant)await showVaultEntries();else $('vaultList').replaceChildren();}
function keepGrant(r){state.vaultGrant=r.grant;clearTimeout(state.vaultTimer);state.vaultTimer=setTimeout(()=>{state.vaultGrant=null;$('vaultList').replaceChildren();$('vaultStatus').textContent='Leitura bloqueada: a autorização temporária terminou.';},Math.max(0,new Date(r.expires_at)-Date.now()));}
async function setupVault(){const r=await api('/api/vault/setup',{method:'POST',body:{}});setupVaultDisplay(r);}
function setupVaultDisplay(r){recordDialog.replaceChildren();const head=el('div','dialog-title');head.append(el('h3','','Cadastrar proteção do Diário'),btn('×',()=>recordDialog.close()));recordDialog.append(head,el('p','','No Google Authenticator: + → Inserir chave de configuração. Conta: Sofia Área Protegida. Tipo: baseado no tempo.'),el('p','warning','Este segredo só serve ao Authenticator. Não envie prints desta tela ou cole no chat. O cadastro nesta versão é por chave manual.'),el('pre','setup-secret',r.secret));const code=el('input');code.placeholder='Código atual de 6 dígitos';code.type='password';code.inputMode='numeric';code.maxLength=6;recordDialog.append(code,btn('Confirmar cadastro',async()=>{const result=await api('/api/vault/confirm',{method:'POST',body:{code:code.value}});code.value='';keepGrant(result);recordDialog.replaceChildren(el('h3','','Guarde o código de recuperação'),el('p','warning',result.notice),el('pre','setup-secret',result.recovery),btn('Guardei em local seguro',()=>{recordDialog.close();return loadVault();}));}));if(!recordDialog.open)recordDialog.showModal();}
function unlockVault(){editor('Desbloquear Safe Chat',[{name:'code',label:'Código atual do Authenticator',type:'password',required:true,max:6}],async b=>{const r=await api('/api/vault/unlock',{method:'POST',body:b});keepGrant(r);await showVaultEntries();});}
function recoverVault(){editor('Recuperar Authenticator',[{name:'recovery',label:'Código de recuperação guardado fora da Sofia',type:'password',required:true,max:48}],async b=>{const r=await api('/api/vault/recover',{method:'POST',body:b});setTimeout(()=>setupVaultDisplay(r),0);});}
async function showVaultEntries(){try{const rows=(await api('/api/vault/entries',{headers:{'X-Sofia-Vault':state.vaultGrant}})).items;$('vaultList').replaceChildren();$('vaultStatus').textContent='Leitura temporariamente autorizada. Texto só aparece neste painel, não na busca geral.';for(const e of rows){const c=el('article','data-card');c.append(el('h3','',e.title),el('p','',e.content),el('p','small-meta','v'+e.revision+' · '+date(e.created_at)),btn('Refletir com IA privada',()=>{editor('Enviar apenas esta entrada ao projeto privado',[{name:'message',label:'O que quer explorar?',type:'textarea',required:true,max:6000}],async b=>{if(!await uiConfirm('A entrada selecionada e seu pedido serão processados pela OpenAI no projeto privado. Isso pode gerar custo dentro dos limites configurados. Continuar?',{title:'Usar IA privada',confirmLabel:'Continuar'}))return;await api('/api/vault/discuss',{method:'POST',headers:{'X-Sofia-Vault':state.vaultGrant},body:{id:e.id,message:b.message,confirm_private:true}});await showVaultEntries();});}));$('vaultList').append(c);}}catch(e){state.vaultGrant=null;$('vaultList').replaceChildren();throw e;}}
$('lockVault').onclick=async()=>{state.vaultGrant=null;clearTimeout(state.vaultTimer);$('vaultList').replaceChildren();await api('/api/vault/lock',{method:'POST',body:{}});loadVault().catch(showError);};
$('vaultAddForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/vault/entries',{method:'POST',body:{title:$('vaultTitle').value,content:$('vaultContent').value}});$('vaultContent').value='';notify('Entrada criptografada e salva localmente. Nenhuma chamada à IA.');await loadVault();}catch(error){showError(error);}};

// v46 — interface dupla: usuário e desenvolvimento.
function applyUiMode(){
  document.body.classList.toggle('mode-user',state.uiMode==='user');
  document.body.classList.toggle('mode-developer',state.uiMode==='developer');
  $('userNavigation').hidden=state.uiMode!=='user';
  $('developerNavigation').hidden=state.uiMode!=='developer';
  $('modeToggle').textContent=state.uiMode==='developer'?'Voltar para interface do usuário':'Modo desenvolvedor';
}
$('modeToggle').onclick=async()=>{try{if(!state.settings?.developerModeAllowed&&state.uiMode!=='developer')throw new Error('Modo desenvolvedor não está liberado nesta instalação.');state.uiMode=state.uiMode==='developer'?'user':'developer';await api('/api/settings',{method:'PATCH',body:{uiMode:state.uiMode}});state.settings.uiMode=state.uiMode;applyUiMode();if(state.uiMode==='user')resetUserChatSession();setTab(state.uiMode==='developer'?'panorama':'start');}catch(e){showError(e);}};

const DEFAULT_PAGE_ICON='📄';
const DEFAULT_PAGE_COVER_TYPE='preset';
const DEFAULT_PAGE_COVER_VALUE='linear-gradient(135deg,#d9d2ff,#b8aaff)';
const DEFAULT_PAGE_COVER_ATTACHMENT_ID='';
function userPageData(page={}){const d={icon:'',icon_mode:'default',cover_type:DEFAULT_PAGE_COVER_TYPE,cover_value:DEFAULT_PAGE_COVER_VALUE,cover_attachment_id:DEFAULT_PAGE_COVER_ATTACHMENT_ID,purpose:'',layout:'notes',suggested:false,parent_id:'',node_type:'space',template_id:'',blocks_json:'[]',...(page.data||{})};if(!d.icon)d.icon_mode='default';else if(!['emoji','icon','upload'].includes(d.icon_mode))d.icon_mode='emoji';return d;}
const USER_PAGE_DATA_KEYS=['icon','icon_mode','cover_type','cover_value','cover_attachment_id','purpose','layout','suggested','parent_id','node_type','template_id','blocks_json'];
function userPagePersistedData(pageOrData={},overrides={}){const source=pageOrData&&Object.prototype.hasOwnProperty.call(pageOrData,'data')?userPageData(pageOrData):userPageData({data:pageOrData||{}}),clean={};for(const key of USER_PAGE_DATA_KEYS)clean[key]=source[key];for(const [key,value] of Object.entries(overrides||{}))if(USER_PAGE_DATA_KEYS.includes(key))clean[key]=value;return clean;}
function pageDisplayIcon(page){const d=page?.data!==undefined?userPageData(page):page||{};return d.icon||DEFAULT_PAGE_ICON;}
function userPageDescendants(pageId){
  const out=new Set(),walk=id=>{for(const p of state.userPages){if(userPageData(p).parent_id===id&&!out.has(p.id)){out.add(p.id);walk(p.id);}}};walk(pageId);return out;
}
function userPageAncestors(page){
  const byId=new Map(state.userPages.map(p=>[p.id,p])),chain=[];let cur=page,guard=0;
  while(cur&&guard++<30){chain.unshift(cur);const parentId=userPageData(cur).parent_id;cur=parentId?byId.get(parentId):null;}
  return chain;
}
function renderUserPageBreadcrumb(page){const host=$('userPageBreadcrumb');if(!host)return;host.replaceChildren();const chain=userPageAncestors(page);if(!chain.length){host.append(el('span','', 'Particular'));return;}chain.forEach((node,index)=>{const b=btn(node.title,()=>{state.selectedUserPage=node;setTab('userpage');},'breadcrumb-link');b.title='Abrir '+node.title;host.append(b);if(index<chain.length-1)host.append(el('span','breadcrumb-separator','/'));});}
function pageTreeExpanded(pageId){if(state.userPageExpanded[pageId]===undefined)state.userPageExpanded[pageId]=false;return state.userPageExpanded[pageId]===true;}
function setPageTreeExpanded(pageId,value){state.userPageExpanded[pageId]=Boolean(value);try{localStorage.setItem('sofiaPageExpandedV141',JSON.stringify(state.userPageExpanded));}catch{}loadUserPages().catch(showError);}
async function loadUserPages(){
  const r=await api('/api/ui/pages');state.userPages=r.items.filter(x=>x.state!=='archived');
  if(state.selectedUserPage){const fresh=state.userPages.find(x=>x.id===state.selectedUserPage.id);if(fresh)state.selectedUserPage=fresh;}
  const host=$('userPagesNav');host.replaceChildren();const byParent=new Map();
  for(const page of state.userPages){const parent=userPageData(page).parent_id||'';if(!byParent.has(parent))byParent.set(parent,[]);byParent.get(parent).push(page);}
  for(const list of byParent.values())list.sort((a,b)=>a.title.localeCompare(b.title,'pt-BR',{sensitivity:'base'}));
  const roots=state.userPages.filter(page=>{const parent=userPageData(page).parent_id;return !parent||!state.userPages.some(x=>x.id===parent);}).sort((a,b)=>a.title.localeCompare(b.title,'pt-BR',{sensitivity:'base'}));
  const seen=new Set();
  const renderNode=(page,depth=0)=>{
    if(seen.has(page.id))return;seen.add(page.id);
    const children=byParent.get(page.id)||[],data=userPageData(page),expanded=pageTreeExpanded(page.id);
    const row=el('div','space-tree-node');row.style.setProperty('--page-depth',String(depth));
    const treeControls=el('div','space-tree-controls');
    const expand=btn(children.length?(expanded?'⌄':'›'):'',()=>children.length&&setPageTreeExpanded(page.id,!expanded),'space-tree-expander'+(children.length&&!expanded?' is-collapsed':''));expand.disabled=!children.length;expand.classList.toggle('is-collapsed',!!children.length&&!expanded);expand.setAttribute('aria-label',children.length?(expanded?'Recolher subpáginas':'Expandir subpáginas'):'Sem subpáginas');
    const iconMode=data.icon?(data.icon_mode==='icon'?'icon':'emoji'):'default';const b=btn('',()=>{state.selectedUserPage=page;setTab('userpage');},'nav mini-nav space-tree-button'+(state.selectedUserPage?.id===page.id?' active':''));b.append(el('span','nav-icon space-tree-page-icon page-icon-mode-'+iconMode,pageDisplayIcon(data)),el('span','nav-label space-tree-page-title',page.title));b.title=depth?'Página dentro de '+(state.userPages.find(x=>x.id===data.parent_id)?.title||'outra página'):'Página';
    const add=btn('＋',()=>showPageCreateMenu(page),'space-tree-add');add.title='Criar subpágina em '+page.title;add.setAttribute('aria-label','Criar subpágina em '+page.title);
    treeControls.append(expand,b,add);row.append(treeControls);host.append(row);
    if(expanded)for(const child of children)renderNode(child,depth+1);
  };
  for(const root of roots)renderNode(root,0);
  if(!state.userPages.length)host.append(el('p','hint','Nenhuma página criada. Comece do zero quando quiser.'));
}
$('addUserPage').onclick=()=>showPageCreateMenu();
function setParticularMenuExpanded(expanded){
  const host=$('userPagesNav'),toggle=$('particularMenuCollapse');if(!host||!toggle)return;
  const wasOpen=toggle.getAttribute('aria-expanded')==='true',open=Boolean(expanded);host.hidden=!open;toggle.setAttribute('aria-expanded',open?'true':'false');
  const chevron=toggle.querySelector('.particular-section-chevron');if(chevron)chevron.classList.toggle('is-collapsed',!open);
  if(open&&!wasOpen){loadUserPages().catch(showError);}try{localStorage.setItem('sofiaParticularExpanded',open?'1':'0');}catch{}
}
if($('particularMenuCollapse')){
  let initial=true;try{initial=localStorage.getItem('sofiaParticularExpanded')!=='0';}catch{}
  $('particularMenuCollapse').onclick=()=>setParticularMenuExpanded($('particularMenuCollapse').getAttribute('aria-expanded')!=='true');
  setParticularMenuExpanded(initial);
}
function editUserPage(page=null,parent=null){
  const current=userPageData(page||{}),desc=page?userPageDescendants(page.id):new Set();
  const fields=[
    {name:'title',label:page?'Nome':'Nome da página',value:page?.title||'',required:true,max:100},
    {name:'purpose',label:'Descrição / finalidade (opcional)',type:'textarea',value:current.purpose||page?.content||'',max:2000},
    {name:'icon',label:'Ícone da página (opcional)',type:'iconpicker',value:current.icon||'',mode:current.icon_mode||'default',hint:'Se você não escolher nada, a Sofia usa o ícone padrão de documento.'}
  ];
  if(page||parent){
    const candidates=state.userPages.filter(x=>x.id!==page?.id&&!desc.has(x.id));
    fields.push({name:'parent_id',label:'Dentro de',type:'select',value:parent?.id||current.parent_id||'',options:[['','Nenhum — Página raiz'],...candidates.map(x=>[x.id,userPageAncestors(x).map(y=>y.title).join(' › ')])]});
  }
  editor(page?'Configurar página':(parent?'Nova subpágina dentro de '+parent.title:'Nova página'),fields,async v=>{
    const parentId=(page||parent)?(v.parent_id||''):'';
    const saved=await api('/api/entities'+(page?'/'+page.id:''),{method:page?'PATCH':'POST',body:{kind:'user_page',title:v.title,content:v.purpose||'',area:page?.area||'Pessoal',privacy:page?.privacy||'private',state:'active',revision:page?.revision,data:{...current,purpose:v.purpose||'',icon:v.icon||'',icon_mode:v.icon?(v.icon_mode||'emoji'):'default',layout:'notes',suggested:false,parent_id:parentId,node_type:parentId?'page':'space',blocks_json:current.blocks_json||'[]'},tags:page?.tags||[]}});
    state.selectedUserPage=saved;await loadUserPages();await setTab('userpage');notify(parentId?'Subpágina salva dentro da página escolhida.':'Página salva.');
  });
}
function parseUserPageBlocks(page){
  let raw=[];try{raw=JSON.parse(userPageData(page).blocks_json||'[]');}catch{raw=[];}
  const allowed=new Set(['text','heading1','heading2','heading3','heading4','bullet','number','todo','toggle','code','quote','callout','equation','divider','page_link','image','file','table','date','task_link','commitment_link','bookmark','sofia','collection']);
  const blocks=Array.isArray(raw)?raw.filter(x=>x&&typeof x==='object').slice(0,500).map(x=>({
    id:String(x.id||crypto.randomUUID()),type:allowed.has(String(x.type))?String(x.type):'text',text:String(x.text||''),html:typeof x.html==='string'?x.html:'',checked:Boolean(x.checked),open:x.open!==false,
    data:x.data&&typeof x.data==='object'&&!Array.isArray(x.data)?structuredClone(x.data):{},comments:Array.isArray(x.comments)?x.comments.slice(0,100).map(c=>({id:String(c?.id||crypto.randomUUID()),quote:String(c?.quote||''),text:String(c?.text||''),created_at:String(c?.created_at||'')})):[]
  })):[];
  return blocks.length?blocks:[newPageBlock()];
}
const PAGE_BLOCK_TYPES=[
  {type:'text',icon:'T',label:'Texto',desc:'Texto sem formatação de bloco',group:'Básico'},
  {type:'heading1',icon:'H1',label:'Título 1',desc:'Título grande',group:'Básico'},
  {type:'heading2',icon:'H2',label:'Título 2',desc:'Título médio',group:'Básico'},
  {type:'heading3',icon:'H3',label:'Título 3',desc:'Título menor',group:'Básico'},
  {type:'heading4',icon:'H4',label:'Título 4',desc:'Título compacto',group:'Básico'},
  {type:'page',icon:'▤',label:'Página',desc:'Cria uma subpágina aqui',group:'Básico',action:true},
  {type:'linkpage',icon:'↗',label:'Página existente',desc:'Vincula outra página da Sofia',group:'Básico',action:true},
  {type:'bullet',icon:'•',label:'Lista com marcadores',desc:'Item com marcador',group:'Listas'},
  {type:'number',icon:'1.',label:'Lista numerada',desc:'Item numerado',group:'Listas'},
  {type:'todo',icon:'☑',label:'Lista de tarefas',desc:'Item que pode ser marcado',group:'Listas'},
  {type:'toggle',icon:'▸',label:'Lista de alternantes',desc:'Conteúdo que abre e fecha',group:'Listas'},
  {type:'code',icon:'</>',label:'Código',desc:'Bloco monoespaçado com linguagem',group:'Conteúdo'},
  {type:'quote',icon:'❝',label:'Citação',desc:'Trecho destacado por uma barra',group:'Conteúdo'},
  {type:'callout',icon:'💡',label:'Frase de destaque',desc:'Caixa de observação com ícone',group:'Conteúdo'},
  {type:'equation',icon:'∑',label:'Equação em bloco',desc:'Expressão matemática / LaTeX',group:'Conteúdo'},
  {type:'divider',icon:'—',label:'Divisor',desc:'Linha de separação',group:'Conteúdo'},
  {type:'image',icon:'▧',label:'Imagem',desc:'Imagem anexada localmente à página',group:'Mídia',action:true},
  {type:'file',icon:'⌑',label:'Arquivo',desc:'Arquivo anexado localmente à página',group:'Mídia',action:true},
  {type:'bookmark',icon:'🔗',label:'Link / bookmark',desc:'Cartão para um endereço da web',group:'Mídia',action:true},
  {type:'table',icon:'▦',label:'Tabela simples',desc:'Tabela editável por células',group:'Dados'},
  {type:'date',icon:'◷',label:'Data',desc:'Data ou referência temporal',group:'Dados'},
  {type:'task_link',icon:'✓',label:'Vincular tarefa',desc:'Mostra uma tarefa real da Sofia',group:'Sofia',action:true},
  {type:'commitment_link',icon:'◉',label:'Vincular Agenda',desc:'Mostra evento ou lembrete real da Agenda',group:'Sofia',action:true},
  {type:'collection',icon:'▦',label:'Coleção / database',desc:'Tabela, lista ou quadro com propriedades e visualizações',group:'Dados'},
  {type:'sofia',icon:'S',label:'Perguntar à Sofia',desc:'Leva este bloco para o Chat com contexto da página',group:'Sofia'}
];
const TEXTUAL_PAGE_BLOCKS=new Set(['text','heading1','heading2','heading3','heading4','bullet','number','todo','toggle','quote','callout','sofia']);
function newPageBlock(type='text',extra={}){return {id:crypto.randomUUID(),type,text:'',html:'',checked:false,open:true,data:{},comments:[],...extra};}
function pageBlockById(id){return state.userPageBlocks.find(x=>x.id===id);}
function pageBlockType(type){return PAGE_BLOCK_TYPES.find(x=>x.type===type)||PAGE_BLOCK_TYPES[0];}
function escapeHtml(value=''){const d=document.createElement('div');d.textContent=String(value);return d.innerHTML;}
function sanitizeInlineHTML(value=''){
  const source=document.createElement('template');source.innerHTML=String(value||'');
  const allowed=new Set(['B','STRONG','I','EM','U','S','STRIKE','CODE','A','MARK','SPAN','BR','SUB','SUP']);
  const build=node=>{
    if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent||'');
    if(node.nodeType!==Node.ELEMENT_NODE){const f=document.createDocumentFragment();for(const c of [...node.childNodes])f.append(build(c));return f;}
    if(!allowed.has(node.tagName)){const f=document.createDocumentFragment();for(const c of [...node.childNodes])f.append(build(c));return f;}
    const out=document.createElement(node.tagName.toLowerCase());
    if(node.tagName==='A'){const href=String(node.getAttribute('href')||'');if(/^(https?:|mailto:)/i.test(href)){out.setAttribute('href',href);out.setAttribute('target','_blank');out.setAttribute('rel','noopener noreferrer');}}
    if(node.tagName==='SPAN'&&node.hasAttribute('data-equation'))out.setAttribute('data-equation',String(node.getAttribute('data-equation')||'').slice(0,500));
    if(node.tagName==='MARK'&&node.hasAttribute('data-comment-id'))out.setAttribute('data-comment-id',String(node.getAttribute('data-comment-id')||'').slice(0,100));
    for(const c of [...node.childNodes])out.append(build(c));return out;
  };
  const target=document.createElement('template');for(const c of [...source.content.childNodes])target.content.append(build(c));return target.innerHTML;
}
function syncEditableBlock(editable,block){block.text=editable.innerText.replace(/\r/g,'');block.html=sanitizeInlineHTML(editable.innerHTML);}
function setEditableBlockContent(editable,block){if(block.html)editable.innerHTML=sanitizeInlineHTML(block.html);else editable.textContent=block.text||'';}
function focusPageBlock(index){requestAnimationFrame(()=>{const node=document.querySelector(`[data-page-block-index="${index}"] [contenteditable="true"]`);node?.focus();if(node){const r=document.createRange();r.selectNodeContents(node);r.collapse(false);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);}});}
function closePageMenus(){document.querySelectorAll('.block-command-menu,.block-more-menu').forEach(n=>n.remove());}
async function createSubpageBlock(index){
  const parent=state.selectedUserPage;if(!parent)return;const pd=userPageData(parent);
  const saved=await api('/api/entities',{method:'POST',body:{kind:'user_page',title:'Sem título',content:'',area:parent.area||'Pessoal',privacy:parent.privacy||'private',state:'active',data:{icon:'',icon_mode:'default',cover_type:DEFAULT_PAGE_COVER_TYPE,cover_value:DEFAULT_PAGE_COVER_VALUE,cover_attachment_id:DEFAULT_PAGE_COVER_ATTACHMENT_ID,purpose:'',layout:'notes',suggested:false,parent_id:parent.id,node_type:'page',blocks_json:'[]'},tags:[]}});
  state.userPageBlocks.splice(index,1,newPageBlock('page_link',{text:saved.title,data:{page_id:saved.id}}));await loadUserPages();renderNotionPage(parent);queueUserPageSave();
}
function chooseExistingPageBlock(index){
  const options=state.userPages.filter(p=>p.id!==state.selectedUserPage?.id).map(p=>[p.id,userPageAncestors(p).map(x=>x.title).join(' › ')]);
  if(!options.length)return notify('Não há outra página para vincular.');
  editor('Vincular página',[{name:'page_id',label:'Página',type:'select',options}],async v=>{const p=state.userPages.find(x=>x.id===v.page_id);state.userPageBlocks.splice(index,1,newPageBlock('page_link',{text:p?.title||'Página',data:{page_id:v.page_id}}));renderNotionPage(state.selectedUserPage);queueUserPageSave();});
}
async function uploadPageAttachment(index,kind){
  const page=state.selectedUserPage;if(!page)return;const input=el('input');input.type='file';input.accept=kind==='image'?'image/png,image/jpeg,image/webp,image/gif':'.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,.json,.zip,.mp3,.wav,.m4a,.webm';
  input.onchange=async()=>{const f=input.files?.[0];if(!f)return;try{if(f.size>10*1024*1024)throw new Error('Máximo de 10 MB por arquivo nesta versão.');const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(f);});const a=await api('/api/entities/'+page.id+'/attachments',{method:'POST',body:{name:f.name,mime:f.type||'application/octet-stream',base64}});state.userPageBlocks.splice(index,1,newPageBlock(kind,{text:f.name,data:{attachment_id:a.id,name:a.name,mime:a.mime,bytes:a.bytes,caption:''}}));renderNotionPage(page);queueUserPageSave();}catch(error){showError(error);}};input.click();
}
async function addImageFileToCurrentPage(file,index=state.userPageBlocks.length){
  const page=state.selectedUserPage;if(!page)return;if(!CHAT_IMAGE_MIMES.has(String(file?.type||'').toLowerCase()))throw new Error('Use PNG, JPG, WEBP ou GIF.');if(!file.size||file.size>10*1024*1024)throw new Error('Máximo de 10 MB por imagem.');
  const base64=await blobToBase64(file),a=await api('/api/entities/'+page.id+'/attachments',{method:'POST',body:{name:file.name||'imagem-colada.png',mime:file.type,base64}}),block=newPageBlock('image',{text:a.name,data:{attachment_id:a.id,name:a.name,mime:a.mime,bytes:a.bytes,caption:'',display_width:520,display_x:0}});
  state.userPageBlocks.splice(Math.max(0,Math.min(index,state.userPageBlocks.length)),0,block);renderNotionPage(page);queueUserPageSave();notify('Imagem colada na página.');
}
function chooseBookmarkBlock(index){editor('Adicionar link',[{name:'url',label:'Endereço',type:'url',required:true,max:2000},{name:'title',label:'Título (opcional)',max:240}],async v=>{let u;try{u=new URL(v.url);}catch{throw new Error('Use um endereço válido, incluindo https://');}if(!['http:','https:'].includes(u.protocol))throw new Error('Use um link http ou https.');state.userPageBlocks.splice(index,1,newPageBlock('bookmark',{text:v.title||u.hostname,data:{url:u.href}}));renderNotionPage(state.selectedUserPage);queueUserPageSave();});}
async function chooseTaskLinkBlock(index){const tasks=(await api('/api/tasks')).items;if(!tasks.length)return notify('Não há tarefas para vincular.');editor('Vincular tarefa',[{name:'id',label:'Tarefa',type:'select',options:tasks.map(t=>[t.id,t.title])}],async v=>{const t=tasks.find(x=>x.id===v.id);state.userPageBlocks.splice(index,1,newPageBlock('task_link',{text:t?.title||'Tarefa',data:{task_id:v.id,state:t?.state||''}}));renderNotionPage(state.selectedUserPage);queueUserPageSave();});}
async function chooseCommitmentLinkBlock(index){const commitments=(await api('/api/entities?kind=commitment&limit=300')).items,reminders=(await api('/api/entities?kind=reminder&limit=300')).items,items=[...commitments.map(x=>({...x,_label:'Evento'})),...reminders.map(x=>({...x,_label:'Lembrete'}))];if(!items.length)return notify('Não há eventos ou lembretes na Agenda para vincular.');editor('Vincular item da Agenda',[{name:'id',label:'Item',type:'select',options:items.map(x=>[x.id,x._label+' · '+x.title])}],async v=>{const item=items.find(x=>x.id===v.id);state.userPageBlocks.splice(index,1,newPageBlock('commitment_link',{text:item?.title||'Agenda',data:{entity_id:v.id,kind:item?.kind||'commitment',when:item?.data?.start_at||item?.data?.remind_at||''}}));renderNotionPage(state.selectedUserPage);queueUserPageSave();});}
async function selectPageBlockType(index,type){
  const block=state.userPageBlocks[index];if(!block)return;
  if(type==='page')return createSubpageBlock(index);if(type==='linkpage')return chooseExistingPageBlock(index);if(type==='image'||type==='file')return uploadPageAttachment(index,type);if(type==='bookmark')return chooseBookmarkBlock(index);if(type==='task_link')return chooseTaskLinkBlock(index);if(type==='commitment_link')return chooseCommitmentLinkBlock(index);
  block.type=type;if(block.text.trim().startsWith('/')){block.text='';block.html='';}
  if(type==='table'&&!Array.isArray(block.data?.rows))block.data={...block.data,rows:[['',''],['','']]};if(type==='collection'&&!Array.isArray(block.data?.properties))block.data=defaultCollectionData();if(type==='date'&&!block.data?.value)block.data={...block.data,value:''};if(type==='callout'&&!block.data?.icon)block.data={...block.data,icon:'💡'};if(type==='code'&&!block.data?.language)block.data={...block.data,language:'text'};if(type==='toggle'&&block.data?.details===undefined)block.data={...block.data,details:''};
  renderNotionPage(state.selectedUserPage);queueUserPageSave();focusPageBlock(index);
}
function pageCommandMenu(row,index,query=''){
  closePageMenus();const q=String(query||'').trim().replace(/^\//,'').toLocaleLowerCase('pt-BR');const menu=el('div','block-command-menu');let lastGroup='';const matches=PAGE_BLOCK_TYPES.filter(x=>(x.label+' '+x.desc+' '+x.group).toLocaleLowerCase('pt-BR').includes(q));
  for(const item of matches){if(item.group!==lastGroup){menu.append(el('p','block-menu-group',item.group));lastGroup=item.group;}const b=btn('',()=>selectPageBlockType(index,item.type),'block-command');b.append(el('span','block-command-icon',item.icon),el('span','block-command-copy'));b.lastChild.append(el('strong','',item.label),el('small','',item.desc));menu.append(b);}
  if(!matches.length)menu.append(el('p','hint','Nenhum bloco encontrado.'));row.append(menu);
}
function pageMoreMenu(row,index){closePageMenus();const block=state.userPageBlocks[index],menu=el('div','block-more-menu');menu.append(el('p','block-menu-group','BLOCO'));
  menu.append(btn('Transformar em…',()=>pageCommandMenu(row,index),'block-more-action'),btn('Duplicar',()=>{state.userPageBlocks.splice(index+1,0,{...structuredClone(block),id:crypto.randomUUID()});renderNotionPage(state.selectedUserPage);queueUserPageSave();},'block-more-action'),btn('Mover para cima',()=>movePageBlock(index,-1),'block-more-action'),btn('Mover para baixo',()=>movePageBlock(index,1),'block-more-action'),btn('Excluir',()=>removePageBlock(index),'block-more-action danger-text'));row.append(menu);}
function movePageBlock(index,delta){const to=index+delta;if(to<0||to>=state.userPageBlocks.length)return;const [b]=state.userPageBlocks.splice(index,1);state.userPageBlocks.splice(to,0,b);renderNotionPage(state.selectedUserPage);queueUserPageSave();focusPageBlock(to);}
function insertPageBlock(index,type='text'){state.userPageBlocks.splice(index,0,newPageBlock(type));renderNotionPage(state.selectedUserPage);queueUserPageSave();focusPageBlock(index);}
function removePageBlock(index){if(state.userPageBlocks.length<=1){state.userPageBlocks[0]=newPageBlock();renderNotionPage(state.selectedUserPage);queueUserPageSave();focusPageBlock(0);return;}state.userPageBlocks.splice(index,1);renderNotionPage(state.selectedUserPage);queueUserPageSave();focusPageBlock(Math.max(0,index-1));}
function pageNumberFor(index){let n=0;for(let i=0;i<=index;i++)if(state.userPageBlocks[i].type==='number')n++;return n;}
function maybeMarkdownShortcut(e,editable,block,index){if(e.key!==' '||e.isComposing)return false;const raw=editable.innerText;const map={'#':'heading1','##':'heading2','###':'heading3','####':'heading4','-':'bullet','*':'bullet','1.':'number','[]':'todo','[ ]':'todo','>':'quote','```':'code'};const type=map[raw];if(!type)return false;e.preventDefault();block.text='';block.html='';selectPageBlockType(index,type);return true;}
function editablePlaceholder(type){return ({heading1:'Título 1',heading2:'Título 2',heading3:'Título 3',heading4:'Título 4',quote:'Citação',todo:'Tarefa',toggle:'Alternante',callout:'Digite algo importante…',sofia:'Escreva algo para levar à Sofia…'})[type]||'Digite / para escolher um bloco';}
function bindEditable(editable,block,index,row){setEditableBlockContent(editable,block);editable.addEventListener('input',()=>{syncEditableBlock(editable,block);queueUserPageSave();if(block.text.trim().startsWith('/'))pageCommandMenu(row,index,block.text.trim());else row.querySelector('.block-command-menu')?.remove();});editable.addEventListener('keydown',e=>{if(maybeMarkdownShortcut(e,editable,block,index))return;if((e.ctrlKey||e.metaKey)&&['b','i','u'].includes(e.key.toLowerCase()))return;if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();insertPageBlock(index+1,['heading1','heading2','heading3','heading4'].includes(block.type)?'text':(['bullet','number','todo'].includes(block.type)?block.type:'text'));return;}if(e.key==='Backspace'&&!editable.innerText&&state.userPageBlocks.length){e.preventDefault();removePageBlock(index);}});editable.addEventListener('mouseup',()=>setTimeout(updatePageInlineToolbar));editable.addEventListener('keyup',()=>setTimeout(updatePageInlineToolbar));}
function renderTextualPageBlock(block,index,row,content){
  if(block.type==='todo'){const box=document.createElement('input');box.type='checkbox';box.checked=block.checked;box.onchange=()=>{block.checked=box.checked;queueUserPageSave();};content.append(box);}
  if(block.type==='bullet')content.append(el('span','block-prefix','•'));if(block.type==='number')content.append(el('span','block-prefix',pageNumberFor(index)+'.'));
  if(block.type==='toggle'){const toggle=btn(block.open?'▾':'▸',()=>{block.open=!block.open;renderNotionPage(state.selectedUserPage);queueUserPageSave();},'toggle-arrow');content.append(toggle);}
  if(block.type==='callout'){const icon=btn(block.data?.icon||'💡',()=>editor('Ícone do destaque',[{name:'icon',label:'Ícone ou emoji',value:block.data?.icon||'💡',max:10}],async v=>{block.data={...block.data,icon:v.icon||'💡'};renderNotionPage(state.selectedUserPage);queueUserPageSave();}),'callout-icon');content.append(icon);}
  const editable=el('div','block-editable');editable.contentEditable='true';editable.spellcheck=true;editable.dataset.placeholder=editablePlaceholder(block.type);bindEditable(editable,block,index,row);content.append(editable);
  if(block.type==='toggle'&&block.open){const details=el('div','toggle-details');details.contentEditable='true';details.spellcheck=true;details.dataset.placeholder='Conteúdo do alternante';details.textContent=block.data?.details||'';details.oninput=()=>{block.data={...block.data,details:details.innerText.replace(/\r/g,'')};queueUserPageSave();};content.append(details);}
}
function renderCodeBlock(block,content){const head=el('div','code-block-head');const select=el('select','code-language');for(const lang of ['text','javascript','typescript','json','html','css','python','bash','sql','markdown']){const o=el('option','',lang);o.value=lang;select.append(o);}select.value=block.data?.language||'text';select.onchange=()=>{block.data={...block.data,language:select.value};queueUserPageSave();};head.append(select,btn('Copiar',()=>navigator.clipboard?.writeText(block.text||''),'code-copy'));const pre=el('pre','code-block-editor');pre.contentEditable='true';pre.spellcheck=false;pre.dataset.placeholder='Cole ou escreva o código…';pre.textContent=block.text||'';pre.oninput=()=>{block.text=pre.innerText.replace(/\r/g,'');block.html='';queueUserPageSave();};content.append(head,pre);}
function renderEquationBlock(block,content){const fx=el('span','equation-prefix','ƒx');const input=el('div','equation-editor');input.contentEditable='true';input.spellcheck=false;input.dataset.placeholder='Digite uma expressão ou LaTeX…';input.textContent=block.text||'';input.oninput=()=>{block.text=input.innerText.replace(/\r/g,'');queueUserPageSave();};content.append(fx,input);}
function renderTableBlock(block,content){let rows=Array.isArray(block.data?.rows)?block.data.rows.map(r=>Array.isArray(r)?r.map(c=>String(c??'')):[]):[['',''],['','']];if(!rows.length)rows=[['',''],['','']];const cols=Math.max(1,...rows.map(r=>r.length));rows=rows.map(r=>[...r,...Array(Math.max(0,cols-r.length)).fill('')]);block.data={...block.data,rows};const wrap=el('div','simple-table-wrap'),table=el('table','simple-table'),tbody=el('tbody');rows.forEach((r,ri)=>{const tr=el('tr');r.forEach((cell,ci)=>{const td=el('td');const e=el('div','table-cell');e.contentEditable='true';e.textContent=cell;e.oninput=()=>{block.data.rows[ri][ci]=e.innerText.replace(/\r/g,'');queueUserPageSave();};td.append(e);tr.append(td);});tbody.append(tr);});table.append(tbody);const controls=el('div','table-controls');controls.append(btn('＋ Linha',()=>{block.data.rows.push(Array(cols).fill(''));renderNotionPage(state.selectedUserPage);queueUserPageSave();}),btn('＋ Coluna',()=>{block.data.rows.forEach(r=>r.push(''));renderNotionPage(state.selectedUserPage);queueUserPageSave();}));wrap.append(table,controls);content.append(wrap);}
const collectionPageDialog=el('dialog','collection-page-dialog');collectionPageDialog.id='collectionPageDialog';document.body.append(collectionPageDialog);closeOnBackdrop(collectionPageDialog);collectionPageDialog.addEventListener('close',()=>{if(state.selectedUserPage)renderNotionPage(state.selectedUserPage);});
function defaultCollectionData(){return {title:'Coleção',properties:[{key:'name',label:'Nome',type:'text'},{key:'status',label:'Status',type:'select',options:['Não iniciada','Prioridade','Concluído']},{key:'created',label:'Criado',type:'date'}],views:[{id:'table',label:'Tabela',type:'table'},{id:'board',label:'Quadro',type:'board',group_by:'status'}],active_view:'table',rows:[]};}
function normalizeCollection(block){
  const fallback=defaultCollectionData(),d=block.data&&typeof block.data==='object'?block.data:{};
  const props=Array.isArray(d.properties)&&d.properties.length?d.properties:fallback.properties;
  const views=Array.isArray(d.views)&&d.views.length?d.views:fallback.views;
  const rows=Array.isArray(d.rows)?d.rows:[];
  block.data={...d,
    title:d.title===undefined?String(block.text||'Coleção').slice(0,120):String(d.title).slice(0,120),
    show_title:d.show_title!==false,
    properties:props.slice(0,20).map((p,i)=>({
      key:String(p.key||('field'+i)).replace(/[^a-z0-9_-]/gi,'_').slice(0,40),
      label:String(p.label||p.key||'Campo').slice(0,80),
      type:['text','select','url','date','tags','checkbox'].includes(p.type)?p.type:'text',
      options:Array.isArray(p.options)?p.options.map(x=>String(x).slice(0,80)).slice(0,30):[],
      option_colors:p.option_colors&&typeof p.option_colors==='object'&&!Array.isArray(p.option_colors)?Object.fromEntries(Object.entries(p.option_colors).slice(0,30).map(([k,v])=>[String(k).slice(0,80),String(v).slice(0,20)])):{}
    })),
    views:views.slice(0,12).map((v,i)=>({
      id:String(v.id||('view'+i)).slice(0,40),label:String(v.label||'Visualização').slice(0,80),
      type:['table','board','list','gallery','pages'].includes(v.type)?v.type:'table',group_by:String(v.group_by||''),
      filter_key:String(v.filter_key||''),filter_value:v.filter_value??'',sort_by:String(v.sort_by||''),sort_dir:v.sort_dir==='asc'?'asc':'desc'
    })),
    active_view:String(d.active_view||views[0]?.id||'table'),
    rows:rows.slice(0,300).map(r=>({id:String(r?.id||crypto.randomUUID()),values:r?.values&&typeof r.values==='object'?r.values:{},page_content:String(r?.page_content||'').slice(0,100000)}))
  };return block.data;
}
function syncCollectionSource(block,d,{schema=false}={}){const source=String(d?.source_id||'');if(!source)return;for(const peer of state.userPageBlocks){if(peer===block||peer.type!=='collection'||String(peer.data?.source_id||'')!==source)continue;peer.data={...(peer.data||{}),rows:structuredClone(d.rows)};if(schema)peer.data.properties=structuredClone(d.properties);}}
function collectionDefaultValue(prop){if(prop.type==='date')return new Date().toISOString().slice(0,10);if(prop.type==='checkbox')return false;return '';}
function addCollectionRow(block,seed={},view=null){
  const d=normalizeCollection(block),values={};for(const prop of d.properties)values[prop.key]=collectionDefaultValue(prop);
  Object.assign(values,seed||{});if(view?.filter_key)values[view.filter_key]=view.filter_value;
  const today=new Date().toISOString().slice(0,10);if(Object.hasOwn(values,'created'))values.created=today;if(Object.hasOwn(values,'updated'))values.updated=today;
  const row={id:crypto.randomUUID(),values,page_content:''};d.rows.push(row);syncCollectionSource(block,d);renderNotionPage(state.selectedUserPage);queueUserPageSave();return row;
}
function addCollectionProperty(block){editor('Nova propriedade',[{name:'label',label:'Nome',required:true,max:80},{name:'type',label:'Tipo',type:'select',options:[['text','Texto'],['select','Seleção / status'],['url','URL'],['date','Data'],['tags','Tags'],['checkbox','Caixa de seleção']]},{name:'options',label:'Opções (separadas por vírgula)',max:500,hint:'Usado em Status/Seleção.'}],async v=>{const d=normalizeCollection(block),base=v.label.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'campo';let key=base,n=2;while(d.properties.some(p=>p.key===key))key=base+'_'+n++;const options=v.options.split(',').map(x=>x.trim()).filter(Boolean).slice(0,30);d.properties.push({key,label:v.label,type:v.type,options});for(const row of d.rows)row.values[key]=v.type==='checkbox'?false:'';syncCollectionSource(block,d,{schema:true});renderNotionPage(state.selectedUserPage);queueUserPageSave();});}
function configureCollection(block){const d=normalizeCollection(block);editor('Configurar banco de dados',[{name:'title',label:'Nome interno do banco',value:d.title||'',max:120},{name:'show_title',label:'Mostrar nome do banco na página',type:'checkbox',value:d.show_title!==false}],async v=>{d.title=String(v.title||'').slice(0,120);d.show_title=Boolean(v.show_title);renderNotionPage(state.selectedUserPage);queueUserPageSave();});}
function editCollectionProperty(block,key){const d=normalizeCollection(block),prop=d.properties.find(p=>p.key===key);if(!prop)return;editor('Configurar propriedade',[{name:'label',label:'Nome',value:prop.label,required:true,max:80},{name:'type',label:'Tipo',type:'select',value:prop.type,options:[['text','Texto'],['select','Seleção / status'],['url','URL'],['date','Data'],['tags','Tags'],['checkbox','Caixa de seleção']]},{name:'options',label:'Opções (separadas por vírgula)',value:(prop.options||[]).join(', '),max:500,hint:'Usado em Status/Seleção.'},{name:'remove',label:'Excluir esta propriedade',type:'checkbox',value:false}],async v=>{if(v.remove){if(d.properties.length<=1)throw new Error('A coleção precisa ter pelo menos uma propriedade.');d.properties=d.properties.filter(p=>p.key!==key);for(const row of d.rows)delete row.values[key];for(const view of d.views){if(view.group_by===key)view.group_by='';if(view.filter_key===key)view.filter_key='';if(view.sort_by===key)view.sort_by='';}}else{prop.label=v.label;prop.type=v.type;prop.options=String(v.options||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,30);if(prop.type==='checkbox')for(const row of d.rows)row.values[key]=Boolean(row.values[key]);}syncCollectionSource(block,d,{schema:true});renderNotionPage(state.selectedUserPage);queueUserPageSave();});}
function addCollectionView(block){const d=normalizeCollection(block),groupOptions=[['','Automático'],...d.properties.filter(p=>p.type==='select').map(p=>[p.key,p.label])];editor('Nova visualização',[{name:'label',label:'Nome',required:true,max:80},{name:'type',label:'Tipo',type:'select',options:[['table','Tabela'],['board','Quadro'],['list','Lista'],['gallery','Galeria'],['pages','Páginas']]},{name:'group_by',label:'Agrupar por (para quadro)',type:'select',options:groupOptions}],async v=>{let base=v.label.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'view';let id=base,n=2;while(d.views.some(x=>x.id===id))id=base+'_'+n++;d.views.push({id,label:v.label,type:v.type,group_by:v.group_by||'',filter_key:'',filter_value:'',sort_by:'',sort_dir:'desc'});d.active_view=id;renderNotionPage(state.selectedUserPage);queueUserPageSave();});}
function editCollectionView(block,id){const d=normalizeCollection(block),view=d.views.find(v=>v.id===id);if(!view)return;const groupOptions=[['','Automático'],...d.properties.filter(p=>p.type==='select').map(p=>[p.key,p.label])];editor('Configurar visualização',[{name:'label',label:'Nome',value:view.label,required:true,max:80},{name:'type',label:'Tipo',type:'select',value:view.type,options:[['table','Tabela'],['board','Quadro'],['list','Lista'],['gallery','Galeria'],['pages','Páginas']]},{name:'group_by',label:'Agrupar por (para quadro)',type:'select',value:view.group_by||'',options:groupOptions},{name:'remove',label:'Excluir esta visualização',type:'checkbox',value:false}],async v=>{if(v.remove){if(d.views.length<=1)throw new Error('A coleção precisa ter pelo menos uma visualização.');d.views=d.views.filter(x=>x.id!==id);if(d.active_view===id)d.active_view=d.views[0].id;}else{view.label=v.label;view.type=v.type;view.group_by=v.group_by||'';}renderNotionPage(state.selectedUserPage);queueUserPageSave();});}
function touchCollectionRow(row,d){const updated=d.properties.find(p=>p.key==='updated');if(updated)row.values.updated=new Date().toISOString().slice(0,10);}
function collectionEditor(block,row,prop){
  let input;if(prop.type==='checkbox'){input=el('input','collection-cell-checkbox');input.type='checkbox';input.checked=Boolean(row.values?.[prop.key]);}
  else if(prop.type==='select'){input=el('select','collection-cell-input');const blank=el('option','','');blank.value='';input.append(blank);for(const x of prop.options||[]){const o=el('option','',x);o.value=x;input.append(o);}input.value=String(row.values?.[prop.key]??'');}
  else{input=el('input','collection-cell-input');input.type=prop.type==='url'?'url':prop.type==='date'?'date':'text';input.value=String(row.values?.[prop.key]??'');input.placeholder=prop.label;}
  const save=()=>{const d=block.data;row.values[prop.key]=prop.type==='checkbox'?input.checked:input.value;touchCollectionRow(row,d);syncCollectionSource(block,d);queueUserPageSave();};input.onchange=save;if(prop.type!=='checkbox')input.oninput=save;return input;
}
function filteredCollectionRows(d,view){let rows=[...d.rows];if(view?.filter_key){const wanted=view.filter_value;rows=rows.filter(r=>wanted===true||wanted===false?Boolean(r.values?.[view.filter_key])===Boolean(wanted):String(r.values?.[view.filter_key]??'')===String(wanted??''));}if(view?.sort_by){const dir=view.sort_dir==='asc'?1:-1;rows.sort((a,b)=>String(a.values?.[view.sort_by]??'').localeCompare(String(b.values?.[view.sort_by]??''),'pt-BR',{numeric:true})*dir);}return rows;}
function renderCollectionTable(block,d,wrap,view=null){const rows=filteredCollectionRows(d,view),table=el('table','collection-table'),thead=el('thead'),hr=el('tr');for(const p of d.properties){const th=el('th');const h=btn(p.label,()=>editCollectionProperty(block,p.key),'collection-property-header');h.title='Configurar '+p.label;th.append(h);hr.append(th);}hr.append(el('th','collection-row-actions',''));thead.append(hr);const tbody=el('tbody');for(const row of rows){const tr=el('tr');for(const p of d.properties){const td=el('td');td.append(collectionEditor(block,row,p));tr.append(td);}const actions=el('td','collection-row-actions');actions.append(btn('×',()=>{d.rows=d.rows.filter(x=>x.id!==row.id);syncCollectionSource(block,d);renderNotionPage(state.selectedUserPage);queueUserPageSave();},'collection-delete-row'));tr.append(actions);tbody.append(tr);}table.append(thead,tbody);wrap.append(table);}
function collectionStatusClass(value){const key=String(value||'').toLocaleLowerCase('pt-BR');if(key.includes('prioridade'))return 'status-priority';if(key.includes('conclu'))return 'status-done';return 'status-neutral';}
const COLLECTION_STATUS_COLORS={gray:'#8e8e93',red:'#e05a5a',orange:'#d9822b',yellow:'#c9a227',green:'#42a56b',teal:'#2d9c9c',blue:'#4285d4',purple:'#8b67d5',pink:'#d66aa6'};
const COLLECTION_STATUS_COLOR_OPTIONS=[['gray','Cinza'],['red','Vermelho'],['orange','Laranja'],['yellow','Amarelo'],['green','Verde'],['teal','Turquesa'],['blue','Azul'],['purple','Roxo'],['pink','Rosa']];
function collectionOptionName(base,options,exclude=''){let name=String(base||'Nova coluna').trim().slice(0,60)||'Nova coluna',n=2;const used=options.filter(x=>x!==exclude);if(!used.includes(name))return name;while(used.includes(name+' '+n))n++;return name+' '+n;}
function collectionOptionColor(prop,value){return COLLECTION_STATUS_COLORS[String(prop?.option_colors?.[value]||'gray')]||COLLECTION_STATUS_COLORS.gray;}
function styleCollectionStatus(node,prop,value){const color=collectionOptionColor(prop,value);node.classList.add('custom-status');node.style.setProperty('--status-color',color);return node;}
function editCollectionBoardGroup(block,propKey,value=null){
  const d=normalizeCollection(block),prop=d.properties.find(p=>p.key===propKey);if(!prop)return;prop.options=prop.options||[];prop.option_colors=prop.option_colors||{};
  const exists=value!==null&&prop.options.includes(value),fields=[
    {name:'name',label:'Nome da coluna',value:exists?value:'',required:true,max:60},
    {name:'color',label:'Cor',type:'select',value:exists?(prop.option_colors[value]||'gray'):'gray',options:COLLECTION_STATUS_COLOR_OPTIONS}
  ];
  if(exists)fields.push({name:'duplicate',label:'Duplicar esta coluna',type:'checkbox',value:false},{name:'remove',label:'Excluir esta coluna',type:'checkbox',value:false});
  editor(exists?'Configurar coluna':'Nova coluna',fields,async v=>{
    const next=normalizeCollection(block),p=next.properties.find(x=>x.key===propKey);if(!p)return;p.options=p.options||[];p.option_colors=p.option_colors||{};
    if(exists&&v.remove){p.options=p.options.filter(x=>x!==value);delete p.option_colors[value];for(const row of next.rows)if(String(row.values?.[p.key]||'')===value)row.values[p.key]='';}
    else if(exists&&v.duplicate){const name=collectionOptionName(v.name+' cópia',p.options);p.options.push(name);p.option_colors[name]=v.color||'gray';}
    else if(exists){const name=collectionOptionName(v.name,p.options,value);p.options=p.options.map(x=>x===value?name:x);for(const row of next.rows)if(String(row.values?.[p.key]||'')===value)row.values[p.key]=name;delete p.option_colors[value];p.option_colors[name]=v.color||'gray';}
    else{const name=collectionOptionName(v.name,p.options);p.options.push(name);p.option_colors[name]=v.color||'gray';}
    syncCollectionSource(block,next,{schema:true});renderNotionPage(state.selectedUserPage);queueUserPageSave();
  });
}
function renderCollectionBoard(block,d,view,wrap){
  const group=d.properties.find(p=>p.key===view.group_by)||d.properties.find(p=>p.type==='select');if(!group){wrap.append(el('p','hint','Adicione uma propriedade de seleção para usar a visualização em quadro.'));return;}
  const hasUngrouped=d.rows.some(r=>!String(r.values?.[group.key]||''));const groups=[...(group.options||[]),...(hasUngrouped?['Sem grupo']:[])],board=el('div','collection-board notion-board');
  for(const g of groups){const statusClass=collectionStatusClass(g),col=el('section','collection-board-column '+statusClass),rows=filteredCollectionRows(d,view).filter(r=>(String(r.values?.[group.key]||'')||'Sem grupo')===g);if(g!=='Sem grupo')styleCollectionStatus(col,group,g);
    const title=el('div','collection-board-title'),chip=g==='Sem grupo'?el('span','collection-status-chip '+statusClass,g):btn(g,()=>editCollectionBoardGroup(block,group.key,g),'collection-status-chip '+statusClass);if(g!=='Sem grupo')styleCollectionStatus(chip,group,g);title.append(chip,el('span','collection-status-count',String(rows.length)));if(g!=='Sem grupo'){const more=btn('•••',()=>editCollectionBoardGroup(block,group.key,g),'collection-column-more');more.title='Configurar '+g;title.append(more);}col.append(title);
    col.addEventListener('dragover',e=>{e.preventDefault();col.classList.add('drop-target');});col.addEventListener('dragleave',()=>col.classList.remove('drop-target'));col.addEventListener('drop',e=>{e.preventDefault();col.classList.remove('drop-target');const id=e.dataTransfer.getData('text/sofia-collection-row'),row=d.rows.find(x=>x.id===id);if(row){row.values[group.key]=g==='Sem grupo'?'':g;touchCollectionRow(row,d);syncCollectionSource(block,d);renderNotionPage(state.selectedUserPage);queueUserPageSave();}});
    const nameProp=d.properties.find(p=>p.key==='name')||d.properties[0];for(const row of rows){const card=el('article','collection-board-card');card.draggable=true;card.tabIndex=0;card.addEventListener('dragstart',e=>e.dataTransfer.setData('text/sofia-collection-row',row.id));card.append(el('strong','',String(row.values?.[nameProp?.key]||'Sem título')));for(const p of d.properties.filter(p=>p.key!==nameProp?.key&&p.key!==group.key).slice(0,2)){const raw=row.values?.[p.key],value=p.type==='checkbox'?(raw?'Sim':''):String(raw||'');if(value)card.append(el('small','',p.label+': '+value));}card.addEventListener('click',()=>openCollectionPage(block,row));card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openCollectionPage(block,row);}});col.append(card);}
    col.append(btn('＋ Nova página',()=>{const seed={[group.key]:g==='Sem grupo'?'':g};const row=addCollectionRow(block,seed),rowId=row.id;setTimeout(()=>{const latest=normalizeCollection(block).rows.find(x=>x.id===rowId);if(latest)openCollectionPage(block,latest);},0);},'collection-add-card'));board.append(col);
  }
  board.append(btn('＋ Coluna',()=>editCollectionBoardGroup(block,group.key,null),'collection-add-column'));wrap.append(board);
}
function editCollectionRow(block,row){const d=normalizeCollection(block),fields=d.properties.map(p=>({name:p.key,label:p.label,type:p.type==='select'?'select':p.type==='date'?'date':p.type==='url'?'url':p.type==='checkbox'?'checkbox':'text',value:p.type==='checkbox'?Boolean(row.values?.[p.key]):String(row.values?.[p.key]||''),options:p.type==='select'?[['','Sem valor'],...(p.options||[]).map(x=>[x,x])]:undefined,max:2000}));editor('Editar item',fields,async values=>{for(const p of d.properties)row.values[p.key]=p.type==='checkbox'?Boolean(values[p.key]):(values[p.key]||'');touchCollectionRow(row,d);syncCollectionSource(block,d);renderNotionPage(state.selectedUserPage);queueUserPageSave();});}
function renderCollectionList(block,d,wrap,gallery=false,view=null){const grid=el('div',gallery?'collection-gallery':'collection-list'),nameProp=d.properties.find(p=>p.key==='name')||d.properties[0];for(const row of filteredCollectionRows(d,view)){const card=el('article',gallery?'collection-gallery-card':'collection-list-row');card.append(el('strong','',String(row.values?.[nameProp?.key]||'Sem título')));for(const p of d.properties.filter(p=>p.key!==nameProp?.key).slice(0,gallery?4:2)){const raw=row.values?.[p.key],value=p.type==='checkbox'?(raw?'Sim':''):String(raw||'');if(value)card.append(el('small','',p.label+': '+value));}card.onclick=()=>editCollectionRow(block,row);grid.append(card);}wrap.append(grid);}
function openCollectionPage(block,row){
  const d=normalizeCollection(block),nameProp=d.properties.find(p=>p.key==='name')||d.properties[0];collectionPageDialog.replaceChildren();
  const top=el('div','collection-page-top');top.append(el('span','collection-page-doc','🗎'));const close=btn('×',()=>collectionPageDialog.close(),'icon-button collection-page-close');close.setAttribute('aria-label','Fechar página');top.append(close);collectionPageDialog.append(top);
  const title=el('h1','collection-page-title');title.contentEditable='true';title.spellcheck=true;title.dataset.placeholder='Sem título';title.textContent=String(row.values?.[nameProp.key]||'');title.oninput=()=>{row.values[nameProp.key]=title.innerText.replace(/\r/g,'').slice(0,500);touchCollectionRow(row,d);syncCollectionSource(block,d);queueUserPageSave();};collectionPageDialog.append(title);
  const props=el('div','collection-page-properties');for(const prop of d.properties){if(prop.key===nameProp.key)continue;const line=el('div','collection-page-property');line.append(el('span','collection-page-property-label',prop.label));line.append(collectionEditor(block,row,prop));props.append(line);}collectionPageDialog.append(props,el('div','collection-page-divider'));
  const body=el('div','collection-page-content');body.contentEditable='true';body.spellcheck=true;body.dataset.placeholder='Digite / para escrever nesta página…';body.textContent=row.page_content||'';body.oninput=()=>{row.page_content=body.innerText.replace(/\r/g,'').slice(0,100000);touchCollectionRow(row,d);syncCollectionSource(block,d);queueUserPageSave();};collectionPageDialog.append(body);
  if(!collectionPageDialog.open)collectionPageDialog.showModal();
}
function renderCollectionPages(block,d,view,wrap){
  const rows=filteredCollectionRows(d,view),nameProp=d.properties.find(p=>p.key==='name')||d.properties[0],updated=d.properties.find(p=>p.key==='updated')||d.properties.find(p=>p.key==='created');const list=el('div','collection-pages-list');
  for(const row of rows){const item=btn('',()=>openCollectionPage(block,row),'collection-page-row');const left=el('span','collection-page-row-title');left.append(el('span','collection-page-row-icon','🗎'),el('span','',String(row.values?.[nameProp.key]||'Sem título')));item.append(left);if(updated&&row.values?.[updated.key])item.append(el('span','collection-page-row-date',dateOnly(row.values[updated.key])));list.append(item);}
  const add=btn('＋ Nova página',()=>{const row=addCollectionRow(block,{},view),rowId=row.id;setTimeout(()=>{const latest=normalizeCollection(block).rows.find(x=>x.id===rowId);if(latest)openCollectionPage(block,latest);},0);},'collection-page-new');list.append(add);wrap.append(list);
}
function renderCollectionBlock(block,content){
  const d=normalizeCollection(block),wrap=el('div','collection-block'),head=el('div','collection-head');if(d.show_title!==false){const title=el('strong','collection-title',d.title);title.contentEditable='true';title.spellcheck=true;title.dataset.placeholder='Nome do banco';title.oninput=()=>{d.title=title.innerText.replace(/\r/g,'').slice(0,120);queueUserPageSave();};head.append(title);}const actions=el('div','collection-actions');actions.append(btn('＋ Item',()=>addCollectionRow(block),'collection-action'),btn('＋ Propriedade',()=>addCollectionProperty(block),'collection-action'),btn('＋ Visualização',()=>addCollectionView(block),'collection-action'),btn('•••',()=>configureCollection(block),'collection-action'));head.append(actions);wrap.append(head);
  const views=el('div','collection-views');for(const view of d.views){const item=el('div','collection-view-item');item.append(btn(view.label,()=>{d.active_view=view.id;renderNotionPage(state.selectedUserPage);queueUserPageSave();},d.active_view===view.id?'collection-view active':'collection-view'),btn('•••',()=>editCollectionView(block,view.id),'collection-view-config'));views.append(item);}wrap.append(views);
  const active=d.views.find(v=>v.id===d.active_view)||d.views[0],body=el('div','collection-body');if(active?.type==='board')renderCollectionBoard(block,d,active,body);else if(active?.type==='list')renderCollectionList(block,d,body,false,active);else if(active?.type==='gallery')renderCollectionList(block,d,body,true,active);else if(active?.type==='pages')renderCollectionPages(block,d,active,body);else renderCollectionTable(block,d,body,active);wrap.append(body,el('div','collection-count','CONTAGEM '+filteredCollectionRows(d,active).length));content.append(wrap);
}
function renderPageLinkBlock(block,content){const page=state.userPages.find(x=>x.id===block.data?.page_id);const title=page?.title||block.text||'Página indisponível';const link=btn((page?pageDisplayIcon(page):DEFAULT_PAGE_ICON)+' '+title,()=>{if(!page)return notify('Essa página não existe mais.',true);state.selectedUserPage=page;setTab('userpage');},'page-link-block');content.append(link);}
function clearImageSelection(){state.selectedImageBlockId='';document.querySelectorAll('.resizable-image-block.selected').forEach(node=>{node.classList.remove('selected','resizing','moving');node.querySelector('figcaption')?.blur();});}
function selectImageBlock(figure,block){state.selectedImageBlockId=block.id;document.querySelectorAll('.resizable-image-block.selected').forEach(node=>{if(node!==figure){node.classList.remove('selected','resizing','moving');node.querySelector('figcaption')?.blur();}});figure.classList.add('selected');}
function editImageBlock(block){const d=block.data||{};editor('Editar imagem',[{name:'caption',label:'Legenda',value:d.caption||'',max:2000},{name:'alt',label:'Texto alternativo',value:d.alt||'',max:1000},{name:'reset_position',label:'Redefinir tamanho e posição na página',type:'checkbox',value:false}],async v=>{block.data={...block.data,caption:String(v.caption||''),alt:String(v.alt||'')};if(v.reset_position){delete block.data.display_width;delete block.data.display_x;}renderNotionPage(state.selectedUserPage);queueUserPageSave();});}
function editImageLink(block){const current=String(block.data?.link||'');editor(current?'Editar link da imagem':'Adicionar link à imagem',[{name:'url',label:'Link (deixe vazio para remover)',type:'url',value:current,max:2000}],async v=>{let url=String(v.url||'').trim();if(url){let parsed;try{parsed=new URL(url);}catch{throw new Error('Use um link válido.');}if(!['http:','https:'].includes(parsed.protocol))throw new Error('Use um link http ou https.');url=parsed.href;}block.data={...block.data,link:url};renderNotionPage(state.selectedUserPage);queueUserPageSave();});}
function editImageComment(block){editor(block.data?.image_comment?'Editar comentário da imagem':'Adicionar comentário à imagem',[{name:'comment',label:'Comentário (deixe vazio para remover)',type:'textarea',value:block.data?.image_comment||'',max:8000}],async v=>{block.data={...block.data,image_comment:String(v.comment||'').trim()};renderNotionPage(state.selectedUserPage);queueUserPageSave();});}
function openImageLink(block){const url=String(block.data?.link||'');if(!url)return;window.open(url,'_blank','noopener,noreferrer');}
function renderAttachmentBlock(block,content){const d=block.data||{};if(block.type==='image'&&d.attachment_id){
  const figure=el('figure','image-block resizable-image-block'+(state.selectedImageBlockId===block.id?' selected':''));figure.tabIndex=0;figure.dataset.imageBlockId=block.id;figure.style.width=Math.max(120,Number(d.display_width||520))+'px';figure.style.marginLeft=Math.max(0,Number(d.display_x||0))+'px';
  const toolbar=el('div','image-context-toolbar');toolbar.setAttribute('aria-label','Ações da imagem');toolbar.append(btn('Editar imagem',()=>editImageBlock(block),'image-context-action'),btn(d.link?'Editar link':'Adicionar link',()=>editImageLink(block),'image-context-action'),btn(d.image_comment?'Editar comentário':'Adicionar comentário',()=>editImageComment(block),'image-context-action'));if(d.link)toolbar.append(btn('Abrir link',()=>openImageLink(block),'image-context-action secondary'));
  const frame=el('div','image-resize-frame'),img=el('img');img.src='/api/attachments/'+encodeURIComponent(d.attachment_id)+'?inline=1';img.alt=d.alt||d.caption||d.name||block.text||'Imagem';img.loading='lazy';img.draggable=false;frame.append(img);
  const clampLayout=(width,x)=>{const host=Math.max(160,content.clientWidth||content.getBoundingClientRect().width||900),w=Math.max(120,Math.min(width,host)),left=Math.max(0,Math.min(x,Math.max(0,host-w)));return {w,left};};
  const saveLayout=(w,left)=>{block.data={...block.data,display_width:Math.round(w),display_x:Math.round(left)};queueUserPageSave();};
  const beginResize=(event,side)=>{event.preventDefault();event.stopPropagation();selectImageBlock(figure,block);figure.classList.add('resizing');const rect=figure.getBoundingClientRect(),startX=event.clientX,startW=rect.width,startLeft=Math.max(0,Number(block.data?.display_x||0)),pointer=event.pointerId;event.currentTarget.setPointerCapture?.(pointer);
    const move=e=>{const delta=e.clientX-startX,width=side.includes('e')?startW+delta:startW-delta,left=side.includes('w')?startLeft+delta:startLeft,next=clampLayout(width,left);figure.style.width=next.w+'px';figure.style.marginLeft=next.left+'px';};
    const stop=()=>{event.currentTarget.releasePointerCapture?.(pointer);event.currentTarget.removeEventListener('pointermove',move);event.currentTarget.removeEventListener('pointerup',stop);event.currentTarget.removeEventListener('pointercancel',stop);figure.classList.remove('resizing');const final=clampLayout(figure.getBoundingClientRect().width,parseFloat(figure.style.marginLeft)||0);saveLayout(final.w,final.left);};event.currentTarget.addEventListener('pointermove',move);event.currentTarget.addEventListener('pointerup',stop);event.currentTarget.addEventListener('pointercancel',stop);};
  for(const side of ['nw','ne','sw','se']){const h=el('button','image-resize-handle image-resize-'+side);h.type='button';h.title='Arraste para redimensionar mantendo a proporção';h.setAttribute('aria-label','Redimensionar imagem');h.addEventListener('pointerdown',e=>beginResize(e,side));frame.append(h);}
  img.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();selectImageBlock(figure,block);const rect=figure.getBoundingClientRect(),startX=event.clientX,startLeft=Math.max(0,Number(block.data?.display_x||0)),width=rect.width,pointer=event.pointerId;let dragging=false;img.setPointerCapture?.(pointer);const move=e=>{const delta=e.clientX-startX;if(!dragging&&Math.abs(delta)<5)return;if(!dragging){dragging=true;figure.classList.add('moving');}const next=clampLayout(width,startLeft+delta);figure.style.marginLeft=next.left+'px';};const stop=()=>{img.releasePointerCapture?.(pointer);img.removeEventListener('pointermove',move);img.removeEventListener('pointerup',stop);img.removeEventListener('pointercancel',stop);figure.classList.remove('moving');if(dragging){const next=clampLayout(width,parseFloat(figure.style.marginLeft)||0);saveLayout(next.w,next.left);}};img.addEventListener('pointermove',move);img.addEventListener('pointerup',stop);img.addEventListener('pointercancel',stop);});
  figure.addEventListener('pointerdown',event=>{if(event.target.closest('.image-context-toolbar,figcaption'))selectImageBlock(figure,block);else if(!event.target.closest('.image-resize-handle,img'))selectImageBlock(figure,block);});figure.addEventListener('focus',()=>selectImageBlock(figure,block));
  const cap=el('figcaption');cap.contentEditable='true';cap.dataset.placeholder='Adicionar legenda';cap.textContent=d.caption||'';cap.onfocus=()=>selectImageBlock(figure,block);cap.oninput=()=>{block.data={...block.data,caption:cap.innerText.replace(/\r/g,'')};queueUserPageSave();};
  const comment=el('div','image-context-comment');comment.append(el('strong','','Comentário'));comment.append(el('p','',d.image_comment||''));if(!d.image_comment)comment.classList.add('empty-comment');
  figure.append(toolbar,frame,cap,comment);content.append(figure);return;
  }
  const card=btn('',async()=>{const r=await api('/api/attachments/'+encodeURIComponent(d.attachment_id),{raw:true});download(await r.blob(),d.name||block.text||'arquivo');},'file-block');card.append(el('span','file-icon','⌑'),el('span','file-copy'));card.lastChild.append(el('strong','',d.name||block.text||'Arquivo'),el('small','',d.bytes?Math.round(d.bytes/1024)+' KB':'Anexo local'));content.append(card);
}

function renderBookmarkBlock(block,content){const url=block.data?.url||'';const a=el('a','bookmark-block');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.append(el('strong','',block.text||url),el('small','',url));content.append(a);}
function renderDateBlock(block,content){const input=el('input','date-block-input');input.type='date';input.value=String(block.data?.value||'').slice(0,10);input.onchange=()=>{block.data={...block.data,value:input.value};queueUserPageSave();};const labelInput=el('input','date-block-label');labelInput.placeholder='Descrição da data';labelInput.value=block.text||'';labelInput.oninput=()=>{block.text=labelInput.value;queueUserPageSave();};content.append(input,labelInput);}
function renderLinkedRecordBlock(block,content){const isTask=block.type==='task_link',button=btn('',()=>{if(isTask)setTab('tasks');else if(block.data?.entity_id)openRecord(block.data.entity_id);},'linked-record-block');button.append(el('span','linked-record-kind',isTask?'TAREFA':block.data?.kind==='reminder'?'LEMBRETE':'AGENDA'),el('strong','',block.text||'Registro'));if(block.data?.when)button.append(el('small','',date(block.data.when)));content.append(button);}
function pageToChat(block){state.startSection='top';setTab('start').then(()=>{const input=$('homeMessageInput');if(!input)return;const path=userPageAncestors(state.selectedUserPage).map(x=>x.title).join(' › ');input.value=`Na página ${path}, ${block.text||'quero trabalhar neste conteúdo'}`;scrollStartTop();input.focus();input.setSelectionRange(input.value.length,input.value.length);});}
function renderSofiaAction(block,content){content.append(btn('Perguntar à Sofia sobre este bloco',()=>pageToChat(block),'sofia-block-action'));}
function renderBlockComments(block,content){if(!block.comments?.length)return;const c=btn('💬 '+block.comments.length,()=>{const text=block.comments.map(x=>'“'+x.quote+'”\n'+x.text).join('\n\n');detail('Comentários do bloco',text);},'block-comments');content.append(c);}
function renderPageBlock(block,index){
  const row=el('div','notion-block notion-'+block.type);row.dataset.pageBlockIndex=String(index);row.addEventListener('dragover',e=>{e.preventDefault();row.classList.add('drag-over');});row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));row.addEventListener('drop',e=>{e.preventDefault();row.classList.remove('drag-over');const from=state.userPageBlocks.findIndex(x=>x.id===state.userPageDragId);const to=index;if(from<0||from===to)return;const [moved]=state.userPageBlocks.splice(from,1);state.userPageBlocks.splice(to,0,moved);state.userPageDragId=null;renderNotionPage(state.selectedUserPage);queueUserPageSave();});
  const gutter=el('div','block-gutter');const add=btn('＋',()=>pageCommandMenu(row,index),'block-add'),grip=btn('⋮⋮',()=>pageMoreMenu(row,index),'block-grip');grip.draggable=true;grip.addEventListener('dragstart',e=>{state.userPageDragId=block.id;e.dataTransfer.effectAllowed='move';});gutter.append(add,grip);row.append(gutter);
  if(block.type==='divider'){row.append(el('hr','notion-divider'));return row;}
  const content=el('div','block-content');
  if(TEXTUAL_PAGE_BLOCKS.has(block.type))renderTextualPageBlock(block,index,row,content);else if(block.type==='code')renderCodeBlock(block,content);else if(block.type==='equation')renderEquationBlock(block,content);else if(block.type==='table')renderTableBlock(block,content);else if(block.type==='collection')renderCollectionBlock(block,content);else if(block.type==='page_link')renderPageLinkBlock(block,content);else if(['image','file'].includes(block.type))renderAttachmentBlock(block,content);else if(block.type==='bookmark')renderBookmarkBlock(block,content);else if(block.type==='date')renderDateBlock(block,content);else if(['task_link','commitment_link'].includes(block.type))renderLinkedRecordBlock(block,content);else{block.type='text';renderTextualPageBlock(block,index,row,content);}
  if(block.type==='sofia')renderSofiaAction(block,content);renderBlockComments(block,content);row.append(content);return row;
}
function selectionContext(){const sel=getSelection();if(!sel||!sel.rangeCount||sel.isCollapsed)return null;const range=sel.getRangeAt(0);let node=range.commonAncestorContainer;if(node.nodeType===Node.TEXT_NODE)node=node.parentElement;const editable=node?.closest?.('.block-editable');if(!editable||!$('userPageBody')?.contains(editable))return null;const row=editable.closest('[data-page-block-index]');if(!row)return null;return {range:range.cloneRange(),editable,row,index:Number(row.dataset.pageBlockIndex)};}
function restorePageSelection(){const r=state.userPageSelectionRange;if(!r)return false;const sel=getSelection();sel.removeAllRanges();sel.addRange(r);return true;}
function syncSelectedPageBlock(){const ctx=state.userPageSelectionContext;if(!ctx)return;const block=state.userPageBlocks[ctx.index];if(block){syncEditableBlock(ctx.editable,block);queueUserPageSave();}}
function inlineWrap(tag,attrs={}){if(!restorePageSelection())return;const sel=getSelection(),range=sel.getRangeAt(0),node=document.createElement(tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);try{range.surroundContents(node);}catch{const f=range.extractContents();node.append(f);range.insertNode(node);}const nr=document.createRange();nr.selectNodeContents(node);sel.removeAllRanges();sel.addRange(nr);state.userPageSelectionRange=nr.cloneRange();syncSelectedPageBlock();updatePageInlineToolbar();}
function execInline(command,value=null){if(!restorePageSelection())return;document.execCommand(command,false,value);const sel=getSelection();if(sel.rangeCount)state.userPageSelectionRange=sel.getRangeAt(0).cloneRange();syncSelectedPageBlock();updatePageInlineToolbar();}
function addInlineLink(){const current=state.userPageSelectionContext;if(!current)return;editor('Adicionar link',[{name:'url',label:'Endereço',type:'url',required:true,max:2000}],async v=>{let u;try{u=new URL(v.url);}catch{throw new Error('Use um endereço válido.');}if(!['http:','https:','mailto:'].includes(u.protocol))throw new Error('Use http, https ou mailto.');restorePageSelection();document.execCommand('createLink',false,u.href);syncSelectedPageBlock();});}
function addInlineEquation(){if(!state.userPageSelectionContext)return;const selected=state.userPageSelectionRange?.toString()||'';editor('Equação inline',[{name:'equation',label:'Expressão',value:selected,required:true,max:500}],async v=>{restorePageSelection();inlineWrap('span',{'data-equation':v.equation});});}
function addInlineComment(){const ctx=state.userPageSelectionContext;if(!ctx)return;const quote=state.userPageSelectionRange?.toString()||'';editor('Comentar seleção',[{name:'comment',label:'Comentário',type:'textarea',required:true,max:2000}],async v=>{const block=state.userPageBlocks[ctx.index],comment={id:crypto.randomUUID(),quote,text:v.comment,created_at:new Date().toISOString()};block.comments=block.comments||[];block.comments.push(comment);restorePageSelection();inlineWrap('mark',{'data-comment-id':comment.id});renderNotionPage(state.selectedUserPage);queueUserPageSave();});}
function transformSelectedBlock(type){const ctx=state.userPageSelectionContext;if(ctx)selectPageBlockType(ctx.index,type);}
function updatePageInlineToolbar(){
  const ctx=selectionContext(),toolbar=$('pageInlineToolbar');if(!toolbar)return;if(!ctx){toolbar.hidden=true;return;}state.userPageSelectionRange=ctx.range;state.userPageSelectionContext=ctx;toolbar.replaceChildren();
  const type=el('select','inline-type-select');for(const x of PAGE_BLOCK_TYPES.filter(x=>TEXTUAL_PAGE_BLOCKS.has(x.type))){const o=el('option','',x.label);o.value=x.type;type.append(o);}type.value=state.userPageBlocks[ctx.index]?.type||'text';type.onmousedown=e=>e.stopPropagation();type.onchange=()=>transformSelectedBlock(type.value);toolbar.append(type);
  const add=(label,title,fn)=>{const b=btn(label,fn,'inline-tool');b.title=title;b.onmousedown=e=>e.preventDefault();toolbar.append(b);};add('B','Negrito',()=>execInline('bold'));add('I','Itálico',()=>execInline('italic'));add('U','Sublinhado',()=>execInline('underline'));add('S','Tachado',()=>execInline('strikeThrough'));add('</>','Código inline',()=>inlineWrap('code'));add('A','Destaque',()=>inlineWrap('mark'));add('🔗','Link',addInlineLink);add('∑','Equação inline',addInlineEquation);add('💬','Comentário',addInlineComment);add('Tx','Limpar formatação',()=>execInline('removeFormat'));
  const rect=ctx.range.getBoundingClientRect(),width=Math.min(560,window.innerWidth-24);toolbar.style.width='max-content';toolbar.style.maxWidth=width+'px';toolbar.style.left=Math.max(12,Math.min(window.innerWidth-width-12,rect.left+rect.width/2-width/2))+'px';toolbar.style.top=Math.max(8,rect.top-52)+'px';toolbar.hidden=false;
}
const PAGE_TEMPLATES=[
  {id:'tasks_personal',title:'Tarefas pessoal',description:'Quadro de tarefas com colunas de status editáveis: nome, cor, duplicação e novas colunas.',icon:'🧏',cover_type:'',cover_value:'',blocks:[
    ['collection','',{title:'',show_title:false,properties:[
      {key:'name',label:'Nome',type:'text'},
      {key:'status',label:'Status',type:'select',options:['Não iniciada','Prioridade'],option_colors:{'Não iniciada':'gray','Prioridade':'red'}}
    ],views:[{id:'board',label:'Visualização em quadro',type:'board',group_by:'status'}],active_view:'board',rows:[]}]
  ]},
  {id:'notes_hub',title:'Bloco de nota',description:'Cadernos e notas em uma página limpa no estilo da referência.',icon:'📖',cover_type:'',cover_value:'',blocks:[
    ['heading2','Cadernos',{}],
    ['collection','',{title:'Cadernos',show_title:false,properties:[{key:'name',label:'Nome',type:'text'}],views:[{id:'main',label:'Principais',type:'pages'}],active_view:'main',rows:[]}],
    ['collection','',{title:'Notas',show_title:false,properties:[{key:'name',label:'Nome',type:'text'}],views:[{id:'notes',label:'Notas',type:'list'}],active_view:'notes',rows:[
      {id:'notes-db',values:{name:'Notas - db'},page_content:''},{id:'meditacoes',values:{name:'Meditações'},page_content:''}
    ]}]
  ]},
  {id:'playlist_links',title:'Lista de reprodução',description:'Guidance + gerenciador de links com nome, URL, categoria e data.',icon:'▶️',cover_type:'preset',cover_value:'linear-gradient(135deg,#102b75,#173b98)',blocks:[
    ['callout','Quick-capture new links using Notion Web Clipper',{icon:'➤'}],
    ['callout','Guidance',{icon:'ℹ️'}],
    ['collection','',{title:'Link Manager',show_title:false,properties:[
      {key:'name',label:'Name',type:'text'},{key:'url',label:'URL',type:'url'},
      {key:'category',label:'Category',type:'select',options:['Vídeo','Artigo','Curso','Referência'],option_colors:{'Vídeo':'blue','Artigo':'green','Curso':'purple','Referência':'gray'}},
      {key:'created',label:'Created',type:'date'}
    ],views:[{id:'links',label:'Link Manager',type:'table',sort_by:'created',sort_dir:'desc'}],active_view:'links',rows:[]}]
  ]}
]
function templateBlocks(template){return template.blocks.map(item=>{const [type,text,data]=item;return newPageBlock(type,{text:text||'',data:data?structuredClone(data):(type==='table'?{rows:[['Item','Valor'],['','']]}:{})});});}
const PAGE_EMOJIS=[...'😀 😃 😄 😁 😆 😅 😂 😊 🙂 🙃 😉 😌 😍 🥰 😘 😎 🤓 🧐 🤔 🤩 🥳 😴 🤖 👻 💀 ❤️ 🧡 💛 💚 💙 💜 🤍 🤎 🖤 💡 🔥 ✨ ⭐ 🌟 ⚡ ☀️ 🌙 ☁️ 🌈 🌱 🌿 🌵 🌲 🌊 🪨 🧪 ⚗️ 🔬 🧬 🧠 👁️ 🎯 🧭 🗺️ 🚀 ✈️ 🚗 🚲 🏠 🏢 🏗️ 💼 🧰 🛠️ ⚙️ 🔧 🔨 💻 🖥️ ⌨️ 📱 📷 🎥 🎬 🎞️ 🎨 🖌️ ✏️ 📝 📌 📍 📅 🗓️ ⏰ ⌚ 📚 📖 🔖 📁 📂 🗂️ 📦 🧾 📊 📈 📉 💰 💳 🛒 🛍️ 🎁 💊 🩺 🧴 🥗 ☕ 🍵 🍎 🎵 🎧 🎤 🎹 🎸 🎮 🏋️ 🧘 ⚽ 🏆 🎓 🧑‍💻 🔗 🔎 🔐 🔒 🔓 ✅ ☑️ ❌ ⚠️ ℹ️ ❓ 💬 🗨️ 📣 📡 🧩 ♟️ 🎲 🧱 💎 🪄 🧿'.split(' ')];
const PAGE_ICONS=[...'♡ ♥ ☆ ★ ○ ● ◌ ◉ ◎ ◇ ◆ □ ■ △ ▲ ▽ ▼ ◁ ◀ ▷ ▶ ✓ ✔ ✕ × + − ± ≡ ∞ ∑ ∆ ∇ ⌂ ⌘ ⌁ ⌗ ⎋ ⏱ ⚑ ⚐ ⚙ ⚡ ☀ ☾ ☁ ☂ ☰ ☷ ▦ ▤ ▥ ⊞ ⊟ ⊕ ⊗ ↖ ↑ ↗ ← → ↙ ↓ ↘ ↔ ↕ ↳ ↪ ⇄ ⇧ ⇩ ⤴ ⤵ ✎ ✐ ✚ ✦ ✧ ✪ ❖ ☑ ☐ ☒ ♫ ♪ ♬ ✉ ☎ ⌚ ⚒ ⚔ ♟ ♜ ♞ ♝ ♛ ♚ ⛳ ⚓ ⚗ ⚖ ⚕ ⚛ ⚙ ⎈ ◐ ◑ ◒ ◓ ⬡ ⬢ ⬣ ◈ ◊ ⌑ ⎔ ⎚'.split(' ')];
const PAGE_COVER_PRESETS=[
  {name:'Areia',value:'linear-gradient(135deg,#efe9df,#d8cfc2)'},
  {name:'Lavanda',value:'linear-gradient(135deg,#d9d2ff,#b8aaff)'},
  {name:'Azul',value:'linear-gradient(135deg,#b9d7ff,#7da8ea)'},
  {name:'Verde',value:'linear-gradient(135deg,#cde8d8,#8fc9aa)'},
  {name:'Pêssego',value:'linear-gradient(135deg,#f4d5c3,#e7ad8b)'},
  {name:'Grafite',value:'linear-gradient(135deg,#6d6c69,#3f3f3c)'},
  {name:'Aurora',value:'linear-gradient(135deg,#cebaf7 0%,#9ed5e8 48%,#f1c5d9 100%)'},
  {name:'Noite',value:'linear-gradient(135deg,#1f2a44,#394c77)'}
];
function updateSelectedPageVisual(patch){
  if(!state.selectedUserPage)return;state.selectedUserPage={...state.selectedUserPage,data:{...userPageData(state.selectedUserPage),...patch}};
  const i=state.userPages.findIndex(x=>x.id===state.selectedUserPage.id);if(i>=0)state.userPages[i]=state.selectedUserPage;
  renderUserPageBreadcrumb(state.selectedUserPage);renderNotionPage(state.selectedUserPage);queueUserPageSave();
}
function showPageIconPicker(){
  if(!state.selectedUserPage)return;recordDialog.replaceChildren();const h=el('div','dialog-title');h.append(el('h3','','Ícone da página'),btn('×',()=>recordDialog.close(),'icon-button'));recordDialog.append(h,el('p','hint','Emoji usa o conjunto Unicode do sistema (no iPhone/macOS, aparência Apple). Ícones são símbolos convencionais. A escolha aparece no topo, breadcrumb e menu lateral.'));
  const search=el('input','page-icon-search');search.placeholder='Buscar / filtrar símbolos…';search.setAttribute('aria-label','Filtrar ícones e emojis');const tabs=el('div','page-icon-tabs'),body=el('div','page-icon-grid');let active=userPageData(state.selectedUserPage).icon_mode==='icon'?'icon':'emoji';
  const render=()=>{body.replaceChildren();const q=search.value.trim().toLocaleLowerCase('pt-BR');const items=active==='emoji'?PAGE_EMOJIS:PAGE_ICONS;const filtered=q?items.filter(icon=>icon.includes(q)):items;for(const icon of filtered){const b=btn(icon,()=>{updateSelectedPageVisual({icon,icon_mode:active});recordDialog.close();},'page-icon-option');b.title=active==='emoji'?'Emoji Unicode':'Ícone convencional';body.append(b);}if(!filtered.length)body.append(el('p','hint','Nenhum símbolo corresponde ao filtro.'));tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x.dataset.mode===active));};
  for(const [mode,label] of [['emoji','Emoji'],['icon','Ícones']]){const b=btn(label,()=>{active=mode;render();},'page-icon-tab');b.dataset.mode=mode;tabs.append(b);}search.oninput=render;const remove=btn('📄 Usar ícone padrão',()=>{updateSelectedPageVisual({icon:'',icon_mode:'default'});recordDialog.close();},'secondary');recordDialog.append(search,tabs,body,remove);render();recordDialog.showModal();
}
async function uploadPageCover(){
  const page=state.selectedUserPage;if(!page)return;const input=el('input');input.type='file';input.accept='image/png,image/jpeg,image/webp,image/gif';input.onchange=async()=>{const f=input.files?.[0];if(!f)return;try{if(f.size>10*1024*1024)throw new Error('Máximo de 10 MB por capa nesta versão.');const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(f);});const a=await api('/api/entities/'+page.id+'/attachments',{method:'POST',body:{name:f.name,mime:f.type||'image/jpeg',base64}});updateSelectedPageVisual({cover_type:'attachment',cover_value:'',cover_attachment_id:a.id});recordDialog.close();}catch(error){showError(error);}};input.click();
}
function showPageCoverPicker(){
  if(!state.selectedUserPage)return;recordDialog.replaceChildren();const h=el('div','dialog-title');h.append(el('h3','','Capa da página'),btn('×',()=>recordDialog.close(),'icon-button'));recordDialog.append(h,el('p','hint','A capa é opcional. Escolha um preset ou envie uma imagem.'));
  const grid=el('div','page-cover-grid');for(const preset of PAGE_COVER_PRESETS){const b=btn('',()=>{updateSelectedPageVisual({cover_type:'preset',cover_value:preset.value,cover_attachment_id:''});recordDialog.close();},'page-cover-option');b.style.background=preset.value;b.title=preset.name;b.setAttribute('aria-label','Capa '+preset.name);grid.append(b);}const actions=el('div','button-row');actions.append(btn('Fazer upload',uploadPageCover),btn('Remover capa',()=>{updateSelectedPageVisual({cover_type:'',cover_value:'',cover_attachment_id:''});recordDialog.close();},'secondary'));recordDialog.append(grid,actions);recordDialog.showModal();
}
function pageCoverStyle(data){if(data.cover_type==='preset'&&String(data.cover_value||'').startsWith('linear-gradient('))return data.cover_value;return '';}
function pageCoverUrl(data){return data.cover_type==='attachment'&&data.cover_attachment_id?'/api/attachments/'+encodeURIComponent(data.cover_attachment_id)+'?inline=1':'';}
async function createUserPageFromTemplate(template,parent=null){
  const blocks=templateBlocks(template),parentId=parent?.id||'',saved=await api('/api/entities',{method:'POST',body:{kind:'user_page',title:template.title,content:'',area:parent?.area||'Pessoal',privacy:'private',state:'active',tags:[],data:userPagePersistedData({},{icon:template.icon||'',icon_mode:template.icon?'emoji':'default',cover_type:template.cover_type||'',cover_value:template.cover_value||'',cover_attachment_id:'',purpose:'',layout:'notes',suggested:false,parent_id:parentId,node_type:parentId?'page':'space',template_id:template.id,blocks_json:JSON.stringify(blocks)})}});
  state.selectedUserPage=saved;await loadUserPages();await setTab('userpage');notify('Página criada com o template '+template.title+'.');
}
function showPageCreateMenu(parent=null){
  recordDialog.replaceChildren();const h=el('div','dialog-title');h.append(el('h3','',parent?'Criar subpágina':'Criar página'),btn('×',()=>recordDialog.close(),'icon-button'));recordDialog.append(h);
  if(parent)recordDialog.append(el('p','hint','Dentro de '+parent.title));
  const menu=el('div','page-create-menu');const blank=btn('',()=>{recordDialog.close();editUserPage(null,parent);},'page-create-choice');blank.append(el('strong','','＋ Página em branco'),el('span','','Começar sem estrutura pronta.'));
  const templates=btn('',()=>{recordDialog.close();showPageTemplates({create:true,parent});},'page-create-choice template-choice');templates.append(el('strong','','▦ Usar template'),el('span','','Tarefas pessoal, Bloco de nota ou Lista de reprodução.'));
  menu.append(blank,templates);recordDialog.append(menu);recordDialog.showModal();
}
function showPageTemplates({create=false,parent=null}={}){
  recordDialog.replaceChildren();const h=el('div','dialog-title');h.append(el('h3','',create?'Criar com template':'Templates de página'),btn('×',()=>recordDialog.close(),'icon-button'));recordDialog.append(h,el('p','hint',create?'Escolha uma estrutura pronta. Depois tudo continua editável.':'Insere a estrutura do template na página atual. Ícone e capa existentes são preservados.'));
  const grid=el('div','template-grid');for(const t of PAGE_TEMPLATES){const c=el('article','template-card'),head=el('div','template-card-head');head.append(el('span','template-card-icon',t.icon),el('h3','',t.title));c.append(head,el('p','',t.description));const a=el('div','button-row');a.append(btn(create?'Criar':'Inserir',async()=>{if(create){recordDialog.close();await createUserPageFromTemplate(t,parent);return;}state.userPageBlocks.push(...templateBlocks(t));if(!state.userPageBlocks.length)state.userPageBlocks=[newPageBlock('text')];recordDialog.close();renderNotionPage(state.selectedUserPage);queueUserPageSave();},'primary'));c.append(a);grid.append(c);}recordDialog.append(grid);recordDialog.showModal();
}
function renderNotionPage(page){
  if(!page)return;const body=$('userPageBody');body.replaceChildren();const data=userPageData(page);
  const coverPreset=pageCoverStyle(data),coverUrl=pageCoverUrl(data);if(coverPreset||coverUrl){const cover=el('div','notion-page-cover');cover.tabIndex=0;cover.title='Clique para alterar a capa';cover.setAttribute('aria-label','Alterar capa da página');cover.onclick=e=>{if(e.target.closest('.notion-cover-action'))return;showPageCoverPicker();};cover.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showPageCoverPicker();}};if(coverPreset)cover.style.background=coverPreset;if(coverUrl){cover.style.backgroundImage='url("'+coverUrl.replace(/"/g,'')+'")';cover.classList.add('image-cover');}const change=btn('Alterar capa',showPageCoverPicker,'notion-cover-action');cover.append(change);body.append(cover);}
  const visualActions=el('div','notion-visual-actions');if(!coverPreset&&!coverUrl)visualActions.append(btn('＋ Adicionar capa',showPageCoverPicker,'page-meta-action page-top-ghost-action'));if(visualActions.childNodes.length)body.append(visualActions);
  {const iconRow=el('div','notion-page-icon-row');const icon=btn(pageDisplayIcon(data),showPageIconPicker,'notion-page-icon'+(data.icon?'':' default-icon'));icon.title=data.icon?'Alterar ícone':'Ícone padrão — clique para personalizar';icon.setAttribute('aria-label',icon.title);iconRow.append(icon);body.append(iconRow);}
  const top=el('div','notion-page-top');const title=el('h1','notion-page-title');title.id='notionPageTitle';title.contentEditable='true';title.spellcheck=false;title.setAttribute('autocorrect','off');title.setAttribute('autocapitalize','off');title.dataset.placeholder='Sem título';title.textContent=page.title;title.addEventListener('input',queueUserPageSave);title.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();focusPageBlock(0);}});
  const saveState=el('span','page-save-state','Salvo');saveState.id='userPageSaveState';top.append(title,saveState);body.append(top);
  const children=state.userPages.filter(x=>userPageData(x).parent_id===page.id);if(children.length){const sub=el('div','notion-subpages');for(const child of children){const b=btn('',()=>{state.selectedUserPage=child;setTab('userpage');},'notion-subpage-link');const icon=el('span','notion-subpage-icon',pageDisplayIcon(child));const copy=el('span','notion-subpage-copy');copy.append(el('strong','',child.title));const purpose=String(userPageData(child).purpose||'').trim();if(purpose)copy.append(el('small','',purpose));b.append(icon,copy);sub.append(b);}body.append(sub);}
  const editorHost=el('div','notion-editor');for(let i=0;i<state.userPageBlocks.length;i++)editorHost.append(renderPageBlock(state.userPageBlocks[i],i));body.append(editorHost);body.append(btn('＋ Adicionar bloco',()=>insertPageBlock(state.userPageBlocks.length),'notion-add-block'));
  let toolbar=$('pageInlineToolbar');if(!toolbar){toolbar=el('div','page-inline-toolbar');toolbar.id='pageInlineToolbar';toolbar.hidden=true;document.body.append(toolbar);}toolbar.hidden=true;
}
document.addEventListener('selectionchange',()=>{if(!$('tab-userpage')?.hidden)setTimeout(updatePageInlineToolbar);});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.block-command-menu,.block-more-menu,.block-add,.block-grip'))closePageMenus();if(!e.target.closest('.page-inline-toolbar,.block-editable')){const t=$('pageInlineToolbar');if(t)t.hidden=true;}if(!e.target.closest('.resizable-image-block,#editorDialog,#confirmDialog,#recordDialog,#collectionPageDialog'))clearImageSelection();});
document.addEventListener('paste',e=>{if($('tab-userpage')?.hidden||!state.selectedUserPage)return;if(e.target?.closest?.('#miniSofiaInput,#homeMessageInput,#messageInput'))return;const files=[...(e.clipboardData?.items||[])].filter(item=>item.kind==='file'&&CHAT_IMAGE_MIMES.has(String(item.type||'').toLowerCase())).map(item=>item.getAsFile()).filter(Boolean);if(!files.length)return;e.preventDefault();const row=e.target?.closest?.('[data-page-block-index]'),startIndex=row?Number(row.dataset.pageBlockIndex)+1:state.userPageBlocks.length;(async()=>{let index=startIndex;for(const file of files.slice(0,4))await addImageFileToCurrentPage(file,index++);})().catch(showError);});
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||$('tab-userpage')?.hidden)return;clearImageSelection();closePageMenus();const toolbar=$('pageInlineToolbar');if(toolbar)toolbar.hidden=true;});

function pageHistorySnapshot(){const d=userPageData(state.selectedUserPage||{});return JSON.stringify({title:String($('notionPageTitle')?.innerText||state.selectedUserPage?.title||''),blocks:state.userPageBlocks,visual:{icon:d.icon||'',icon_mode:d.icon_mode||'default',cover_type:d.cover_type||'',cover_value:d.cover_value||'',cover_attachment_id:d.cover_attachment_id||''}});}
function resetUserPageHistory(){const d=userPageData(state.selectedUserPage||{});state.userPageHistory=[{snapshot:JSON.stringify({title:state.selectedUserPage?.title||'',blocks:state.userPageBlocks,visual:{icon:d.icon||'',icon_mode:d.icon_mode||'default',cover_type:d.cover_type||'',cover_value:d.cover_value||'',cover_attachment_id:d.cover_attachment_id||''}}),at:0}];state.userPageRedo=[];state.userPageHistoryLastAt=0;}
function recordUserPageHistory(){if(state.userPageHistorySuppress||!state.selectedUserPage)return;const snap=pageHistorySnapshot(),last=state.userPageHistory.at(-1);if(last?.snapshot===snap)return;const now=Date.now();if(last&&last.at>0&&now-last.at<700){last.snapshot=snap;last.at=now;}else{state.userPageHistory.push({snapshot:snap,at:now});if(state.userPageHistory.length>120)state.userPageHistory.shift();}state.userPageRedo=[];state.userPageHistoryLastAt=now;}
function restoreUserPageHistory(entry){if(!entry)return;let parsed;try{parsed=JSON.parse(entry.snapshot);}catch{return;}state.userPageHistorySuppress=true;state.userPageBlocks=structuredClone(parsed.blocks||[newPageBlock()]);if(parsed.visual&&state.selectedUserPage)state.selectedUserPage={...state.selectedUserPage,data:{...userPageData(state.selectedUserPage),...parsed.visual}};renderUserPageBreadcrumb(state.selectedUserPage);renderNotionPage(state.selectedUserPage);const title=$('notionPageTitle');if(title)title.textContent=parsed.title||'Sem título';state.userPageHistorySuppress=false;queueUserPageSave({skipHistory:true});}
function pageHistoryFeedback(text){const status=$('userPageSaveState');if(!status)return;clearTimeout(state.userPageHistoryFeedbackTimer);status.textContent=text;state.userPageHistoryFeedbackTimer=setTimeout(()=>{if(status.textContent===text)status.textContent='Salvo';},1100);}
function undoUserPage(){if(state.userPageHistory.length<=1){pageHistoryFeedback('Nada para desfazer');return;}const current=state.userPageHistory.pop();state.userPageRedo.push(current);restoreUserPageHistory(state.userPageHistory.at(-1));pageHistoryFeedback('Desfeito');}
function redoUserPage(){const entry=state.userPageRedo.pop();if(!entry){pageHistoryFeedback('Nada para refazer');return;}state.userPageHistory.push(entry);restoreUserPageHistory(entry);pageHistoryFeedback('Refeito');}
document.addEventListener('keydown',e=>{if($('tab-userpage')?.hidden)return;if(!(e.ctrlKey||e.metaKey)||e.altKey)return;const key=e.key.toLowerCase();if(key==='z'&&!e.shiftKey){e.preventDefault();undoUserPage();}else if(key==='y'||(key==='z'&&e.shiftKey)){e.preventDefault();redoUserPage();}});
function queueUserPageSave({skipHistory=false}={}){
  if(!state.selectedUserPage)return;if(!skipHistory)recordUserPageHistory();const status=$('userPageSaveState');if(status)status.textContent='Alterações não salvas';
  clearTimeout(state.userPageSaveTimer);state.userPageSaveTimer=setTimeout(()=>saveUserPageEditor().catch(showError),650);
}
async function saveUserPageEditor(){
  if(!state.selectedUserPage)return;if(state.userPageSaveInFlight){state.userPageSaveQueued=true;return;}
  state.userPageSaveInFlight=true;state.userPageSaveQueued=false;const page=state.selectedUserPage,status=$('userPageSaveState');if(status)status.textContent='Salvando…';
  try{
    const data=userPageData(page),title=String($('notionPageTitle')?.innerText||page.title).trim().replace(/\s+/g,' ').slice(0,240)||'Sem título';
    const saved=await api('/api/entities/'+page.id,{method:'PATCH',body:{kind:'user_page',title,content:page.content||'',area:page.area,privacy:page.privacy,state:page.state,revision:page.revision,data:userPagePersistedData(data,{blocks_json:JSON.stringify(state.userPageBlocks)}),tags:page.tags||[]}});
    state.selectedUserPage=saved;const i=state.userPages.findIndex(x=>x.id===saved.id);if(i>=0)state.userPages[i]=saved;if(status)status.textContent='Salvo';await loadUserPages();
  }catch(error){if(status)status.textContent='Erro ao salvar';throw error;}
  finally{state.userPageSaveInFlight=false;if(state.userPageSaveQueued){state.userPageSaveQueued=false;queueUserPageSave();}}
}
async function loadSelectedUserPage(){
  if(!state.selectedUserPage)return;clearTimeout(state.userPageSaveTimer);
  const p=await api('/api/entities/'+state.selectedUserPage.id);state.selectedUserPage=p;
  const i=state.userPages.findIndex(x=>x.id===p.id);if(i>=0)state.userPages[i]=p;
  $('userPageTitle').textContent=p.title;$('userPagePurpose').textContent=userPageData(p).purpose||p.content||'';renderUserPageBreadcrumb(p);
  state.userPageBlocks=parseUserPageBlocks(p);resetUserPageHistory();renderNotionPage(p);await loadUserPages();updateMiniSofiaVisibility();
}
function pageBlockHasContent(block){if(!block)return false;if(String(block.text||'').trim()||String(block.html||'').trim())return true;if(Array.isArray(block.comments)&&block.comments.length)return true;if(block.type!=='text')return true;const data=block.data&&typeof block.data==='object'?block.data:{};return Object.values(data).some(v=>Array.isArray(v)?v.length:Boolean(String(v??'').trim()));}
async function resetUserPageToDefault(){
  const hasCustomPageVisuals=data=>Boolean(data.template_id||data.icon||(data.cover_type||'')!==DEFAULT_PAGE_COVER_TYPE||(data.cover_value||'')!==DEFAULT_PAGE_COVER_VALUE||(data.cover_attachment_id||'')!==DEFAULT_PAGE_COVER_ATTACHMENT_ID);
  if(!state.selectedUserPage)return;const data=userPageData(state.selectedUserPage),hasContent=state.userPageBlocks.some(pageBlockHasContent)||hasCustomPageVisuals(data);
  if(hasContent){const ok=await uiConfirm('Esta ação remove o conteúdo, o template, a capa e o ícone personalizado desta página. O título será preservado. Deseja voltar ao modo default?',{title:'Voltar ao modo default',confirmLabel:'Voltar ao default'});if(!ok)return;}
  clearTimeout(state.userPageSaveTimer);const page=state.selectedUserPage,emptyBlocks=[newPageBlock('text')];state.selectedImageBlockId='';
  const defaultData=userPagePersistedData(data,{icon:'',icon_mode:'default',cover_type:DEFAULT_PAGE_COVER_TYPE,cover_value:DEFAULT_PAGE_COVER_VALUE,cover_attachment_id:DEFAULT_PAGE_COVER_ATTACHMENT_ID,purpose:'',layout:'notes',suggested:false,template_id:'',blocks_json:JSON.stringify(emptyBlocks)});
  const saved=await api('/api/entities/'+page.id,{method:'PATCH',body:{kind:'user_page',title:page.title,content:'',area:page.area,privacy:page.privacy,state:page.state,revision:page.revision,data:defaultData,tags:page.tags||[]}});
  state.userPageBlocks=emptyBlocks;state.selectedUserPage=saved;const index=state.userPages.findIndex(x=>x.id===saved.id);if(index>=0)state.userPages[index]=saved;
  renderUserPageBreadcrumb(saved);renderNotionPage(saved);resetUserPageHistory();await loadUserPages();notify('Página restaurada ao modo default.');
}
function showUserPageActions(){if(!state.selectedUserPage)return;recordDialog.replaceChildren();const h=el('div','dialog-title');h.append(el('h3','','Mais ações'),btn('×',()=>recordDialog.close(),'icon-button'));recordDialog.append(h);const menu=el('div','page-actions-list');menu.append(btn('Configurar página',()=>{recordDialog.close();editUserPage(state.selectedUserPage);},'block-more-action'),btn('Criar subpágina',()=>{recordDialog.close();showPageCreateMenu(state.selectedUserPage);},'block-more-action'),btn('Templates de página',()=>{recordDialog.close();showPageTemplates();},'block-more-action'),btn('Alterar ícone',()=>{recordDialog.close();showPageIconPicker();},'block-more-action'),btn('Editar capa',()=>{recordDialog.close();showPageCoverPicker();},'block-more-action'),btn('Modo default',async()=>{recordDialog.close();await resetUserPageToDefault();},'block-more-action'),btn('Excluir página e subpáginas',async()=>{recordDialog.close();await deleteRecord(state.selectedUserPage);},'block-more-action danger-text'));recordDialog.append(menu);recordDialog.showModal();}
$('editUserPage').onclick=()=>state.selectedUserPage&&editUserPage(state.selectedUserPage);
$('addSubPage').onclick=()=>state.selectedUserPage&&showPageCreateMenu(state.selectedUserPage);
$('deleteUserPage').onclick=showUserPageActions;

function applyOptionalNavigation(){const lists=$('navWidgetLists'),library=$('navWidgetLibrary');if(lists)lists.hidden=false;if(library)library.hidden=false;}
const HOME_WIDGETS={
  priorities:{title:'Prioridades',description:'O que merece atenção sem virar cobrança.'},
  tasks:{title:'Tarefas',description:'Tarefas ativas e próximas ações.'},
  commitments:{title:'Agenda',description:'Eventos, lembretes e tarefas com data.'},
  notifications:{title:'Notificações',description:'Avisos ainda não lidos.'},
  study:{title:'Estudos',description:'Aulas e cursos em andamento.'},
  shopping:{title:'Comprar',description:'Itens e listas que ainda estão ativos.'},
  monitors:{title:'Monitoramentos',description:'Acompanhamentos ativos.'},
  recent:{title:'Atividade recente',description:'Linha do tempo mais recente.'}
};
async function loadStart(){const r=await api('/api/ui/home');state.homeWidgets=r.widgets?.length?r.widgets:['priorities','tasks','commitments','notifications','study'];state.userPages=r.pages||state.userPages;state.homePanorama=r.panorama;$('startNoticeCount').textContent=r.panorama.notifications.length;await renderHomeWidgets(r.panorama);await loadUserPages();renderHomeThread();requestAnimationFrame(updateStartBackToTop);}
// O módulo e seus dados continuam na Sofia; ocultar widget nunca apaga dados.
async function hideHomeWidget(key){const selected=state.homeWidgets.filter(k=>k!==key),panel=$('tab-start'),scrollTop=panel?.scrollTop||0,card=$('homeWidgets')?.querySelector('[data-widget-key="'+key+'"]');await api('/api/settings',{method:'PATCH',body:{homeWidgets:selected}});state.homeWidgets=selected;if(card)card.remove();if(panel)panel.scrollTop=scrollTop;if(!$('homeWidgets')?.children.length)$('homeWidgets')?.append(el('div','empty-card','Escolha widgets em “Personalizar início”. Os módulos continuam disponíveis mesmo quando seus widgets estão ocultos.'));}
function reorderHomeWidgets(fromKey,toKey,{placeAfter=null}={}){const widgets=state.homeWidgets.filter(k=>HOME_WIDGETS[k]);const from=widgets.indexOf(fromKey),to=widgets.indexOf(toKey);if(from<0||to<0||from===to)return widgets;const next=widgets.slice();const [moved]=next.splice(from,1);let target=next.indexOf(toKey);if(target<0)return widgets;const after=placeAfter===null?from<to:Boolean(placeAfter);if(after)target+=1;next.splice(target,0,moved);state.homeWidgets=next;return next;}
async function persistHomeWidgetOrder(){await api('/api/settings',{method:'PATCH',body:{homeWidgets:state.homeWidgets.filter(k=>HOME_WIDGETS[k])}});}
function lockHomeWidgetDrag(){const panel=$('tab-start');if(panel){state.homeWidgetDragScrollTop=panel.scrollTop;panel.classList.add('widget-reordering');}}
function keepHomeWidgetDragScroll(){const panel=$('tab-start');if(panel&&state.homeWidgetDragKey&&Number.isFinite(state.homeWidgetDragScrollTop)&&panel.scrollTop!==state.homeWidgetDragScrollTop)panel.scrollTop=state.homeWidgetDragScrollTop;}
function clearHomeWidgetDragState(){document.querySelectorAll('.home-widget').forEach(node=>node.classList.remove('dragging','drag-over','drag-before','drag-after'));const panel=$('tab-start');if(panel){if(Number.isFinite(state.homeWidgetDragScrollTop))panel.scrollTop=state.homeWidgetDragScrollTop;panel.classList.remove('widget-reordering');}state.homeWidgetDragKey=null;state.homeWidgetDragScrollTop=null;state.homeWidgetDropPlacement=null;}
async function buildHomeWidgetCard(key,p){
  const card=el('article','settings-card home-widget');card.dataset.widgetKey=key;
  const head=el('div','home-widget-head'),titleWrap=el('div','home-widget-title-row'),dragHandle=el('button','widget-drag-handle','⋮⋮');dragHandle.type='button';dragHandle.draggable=true;dragHandle.title='Arrastar widget';dragHandle.setAttribute('aria-label','Arrastar widget '+HOME_WIDGETS[key].title);const title=key==='notifications'?btn(HOME_WIDGETS[key].title,()=>setTab('notifications'),'home-widget-title-link'):el('h3','',HOME_WIDGETS[key].title);titleWrap.append(dragHandle,title);head.append(titleWrap);const hide=btn('×',()=>hideHomeWidget(key),'widget-hide');hide.title='Ocultar somente este widget do Início';head.append(hide);card.append(head,el('p','',HOME_WIDGETS[key].description));
  if(key==='notifications'){
    card.classList.add('notifications-widget');card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','Abrir prévia das notificações');
    const openMini=e=>{if(e?.target?.closest?.('button'))return;openNoticesDialogAt(card);};
    card.addEventListener('click',openMini);card.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button')){e.preventDefault();openNoticesDialogAt(card);}});
  }
  dragHandle.addEventListener('dragstart',e=>{state.homeWidgetDragKey=key;lockHomeWidgetDrag();card.classList.add('dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',key);}catch{}});dragHandle.addEventListener('dragend',()=>clearHomeWidgetDragState());
  card.addEventListener('dragover',e=>{if(!state.homeWidgetDragKey||state.homeWidgetDragKey===key)return;e.preventDefault();keepHomeWidgetDragScroll();const widgets=state.homeWidgets.filter(k=>HOME_WIDGETS[k]),from=widgets.indexOf(state.homeWidgetDragKey),to=widgets.indexOf(key),after=from<to;state.homeWidgetDropPlacement={target:key,after};card.classList.toggle('drag-after',after);card.classList.toggle('drag-before',!after);card.classList.add('drag-over');});
  card.addEventListener('dragleave',e=>{if(card.contains(e.relatedTarget))return;card.classList.remove('drag-over','drag-before','drag-after');});
  card.addEventListener('drop',async e=>{e.preventDefault();e.stopPropagation();keepHomeWidgetDragScroll();if(!state.homeWidgetDragKey||state.homeWidgetDragKey===key)return clearHomeWidgetDragState();const widgets=state.homeWidgets.filter(k=>HOME_WIDGETS[k]),from=widgets.indexOf(state.homeWidgetDragKey),to=widgets.indexOf(key),after=state.homeWidgetDropPlacement?.target===key?state.homeWidgetDropPlacement.after:from<to;reorderHomeWidgets(state.homeWidgetDragKey,key,{placeAfter:after});const locked=state.homeWidgetDragScrollTop;clearHomeWidgetDragState();await renderHomeWidgets(state.homePanorama);if(Number.isFinite(locked))$('tab-start').scrollTop=locked;try{await persistHomeWidgetOrder();}catch(error){showError(error);}});
  const list=el('div','widget-list');let rows=[];
  if(key==='priorities')rows=(p?.priorities||[]).slice(0,6).map(x=>({text:x.title,record:x,task:true,open:()=>{state.taskFilter='priority';setTab('tasks');}}));
  if(key==='tasks'){const tasks=((await api('/api/tasks')).items||[]).filter(x=>!['done','cancelled'].includes(x.state)).slice(0,6);rows=tasks.map(x=>({text:x.title+(x.due_at?' · '+date(x.due_at):''),record:x,task:true,open:()=>editTask(x)}));}
  if(key==='commitments'){
    const agendaEvents=(await api('/api/entities?kind=commitment&limit=100')).items.filter(x=>!['cancelled','archived'].includes(x.state)).map(x=>({...x,_when:x.data.start_at||'',_kind:'Agenda',_source:'entity'}));
    const reminders=(await api('/api/entities?kind=reminder&limit=100')).items.filter(x=>!['cancelled','archived'].includes(x.state)).map(x=>({...x,_when:x.data.remind_at||'',_kind:'Lembrete',_source:'entity'}));
    const datedTasks=((await api('/api/tasks')).items||[]).filter(x=>x.due_at).map(x=>({...x,_when:x.due_at,_kind:'Tarefa > '+taskAgendaStatus(x.state),_source:'task'}));
    const c=[...agendaEvents,...reminders,...datedTasks].sort((a,b)=>String(a._when||'9999').localeCompare(String(b._when||'9999'))).slice(0,6);rows=c.map(x=>({text:x._kind+' · '+x.title+(x._when?' · '+date(x._when):''),record:x,task:x._source==='task',open:()=>x._source==='task'?editTask(x):openRecord(x.id)}));
  }
  if(key==='notifications')rows=(p?.notifications||[]).slice(0,6).map(x=>({text:x.title,open:()=>openNoticesDialogAt(card)}));
  if(key==='study')rows=(p?.lessons||[]).slice(0,6).map(x=>({text:x.title,open:()=>openRecord(x.id)}));
  if(key==='shopping'){const a=(await api('/api/entities?kind=purchase&limit=100')).items.filter(x=>!['purchased','cancelled','archived'].includes(x.state));const b=(await api('/api/entities?kind=shopping_item&limit=100')).items.filter(x=>!['purchased','cancelled','archived'].includes(x.state));rows=[...a,...b].slice(0,6).map(x=>({text:x.title,record:x,open:()=>openRecord(x.id)}));}
  if(key==='monitors'){const m=(await api('/api/entities?kind=monitor&limit=100')).items.filter(x=>x.state==='active');rows=m.slice(0,6).map(x=>({text:x.title,record:x,open:()=>openRecord(x.id)}));}
  if(key==='recent')rows=(p?.timeline||[]).slice(0,6).map(x=>({text:date(x.created_at)+' · '+x.summary,open:()=>x.entity_type==='entity'&&openRecord(x.entity_id)}));
  if(!rows.length)list.append(el('p','hint','Nada aqui por enquanto.'));for(const r of rows){const row=el('div','widget-row');row.append(btn(r.text,r.open,'dashboard-link'));if(r.record&&key!=='study')row.append(quickDeleteButton(r.record,{task:r.task===true}));list.append(row);}card.append(list);return card;
}
async function renderHomeWidgets(p=state.homePanorama){const host=$('homeWidgets');host.replaceChildren();const widgets=state.homeWidgets.filter(k=>HOME_WIDGETS[k]);host.ondragover=e=>{if(!state.homeWidgetDragKey)return;e.preventDefault();keepHomeWidgetDragScroll();};host.ondrop=async e=>{if(!state.homeWidgetDragKey||e.target.closest('.home-widget'))return;e.preventDefault();keepHomeWidgetDragScroll();const dragged=state.homeWidgetDragKey,filtered=state.homeWidgets.filter(k=>HOME_WIDGETS[k]&&k!==dragged);filtered.push(dragged);state.homeWidgets=filtered;const locked=state.homeWidgetDragScrollTop;clearHomeWidgetDragState();await renderHomeWidgets(state.homePanorama);if(Number.isFinite(locked))$('tab-start').scrollTop=locked;try{await persistHomeWidgetOrder();}catch(error){showError(error);}};for(const key of widgets)host.append(await buildHomeWidgetCard(key,p));if(!widgets.length)host.append(el('div','empty-card','Escolha widgets em “Personalizar início”. Os módulos continuam disponíveis mesmo quando seus widgets estão ocultos.'));}
async function refreshHomeWidgets(keys=[]){const wanted=[...new Set(keys.filter(k=>HOME_WIDGETS[k]))];if(!wanted.length)return;const anchor=captureStartViewportAnchor(),panel=$('tab-start'),scrollTop=panel?.scrollTop||0,r=await api('/api/ui/home');state.homeWidgets=r.widgets?.length?r.widgets:state.homeWidgets;state.userPages=r.pages||state.userPages;state.homePanorama=r.panorama;$('startNoticeCount').textContent=r.panorama.notifications.length;const host=$('homeWidgets');for(const key of wanted){const old=host?.querySelector('[data-widget-key="'+key+'"]');if(!old||!state.homeWidgets.includes(key))continue;const widgetScrollTop=old.scrollTop;const fresh=await buildHomeWidgetCard(key,r.panorama);const freshList=fresh.querySelector('.widget-list'),oldList=old.querySelector('.widget-list');if(oldList&&freshList)oldList.replaceChildren(...freshList.childNodes);const desc=old.querySelector(':scope > p'),freshDesc=fresh.querySelector(':scope > p');if(desc&&freshDesc&&desc.textContent!==freshDesc.textContent)desc.textContent=freshDesc.textContent;old.scrollTop=widgetScrollTop;}if(anchor)restoreStartViewportAnchor(anchor);else if(panel){panel.scrollTop=scrollTop;requestAnimationFrame(()=>{panel.scrollTop=scrollTop;});}}
$('customizeHome').onclick=()=>{const current=new Set(state.homeWidgets);const fields=Object.entries(HOME_WIDGETS).map(([name,w])=>({name:'home_'+name,label:'Início · '+w.title,type:'checkbox',value:current.has(name)}));editor('Personalizar Início',fields,async values=>{const selected=Object.keys(HOME_WIDGETS).filter(k=>values['home_'+k]);await api('/api/settings',{method:'PATCH',body:{homeWidgets:selected}});state.homeWidgets=selected;await loadStart();notify('Widgets do Início atualizados. Listas e Biblioteca continuam fixos no menu.');});};
const startNotificationsButton=$('startNotifications');if(startNotificationsButton){bindStartNotificationsHover();startNotificationsButton.onclick=e=>{cancelNotificationsHoverClose();openNoticesDialogAt(e.currentTarget,{trigger:'click'}).catch(showError);};}if($('notificationsBack'))$('notificationsBack').onclick=()=>navigateStartSection('summary');
function startSectionOffset(section){
  const panel=$('tab-start');if(!panel||section!=='summary')return 0;
  const target=$('homeSummary');if(!target)return 0;
  const panelRect=panel.getBoundingClientRect(),targetRect=target.getBoundingClientRect();
  return Math.max(0,panel.scrollTop+(targetRect.top-panelRect.top)-12);
}
function cancelStartScrollAnimation(){
  if(state.startScrollAnimation){cancelAnimationFrame(state.startScrollAnimation.frame);state.startScrollAnimation=null;}$('tab-start')?.classList.remove('start-scrolling');
}
function startScrollEase(t){return 1-Math.pow(1-t,4);}
function scrollStartSection(section,{smooth=true}={}){
  const panel=$('tab-start');if(!panel)return;
  const normalized=section==='summary'?'summary':'top';const target=startSectionOffset(normalized);setStartSection(normalized);cancelStartScrollAnimation();
  if(!smooth||Math.abs(panel.scrollTop-target)<2){panel.scrollTop=target;syncStartSectionFromScroll();return;}
  const from=panel.scrollTop,distance=target-from,duration=Math.min(900,Math.max(360,300+Math.abs(distance)*.18)),started=performance.now();
  const animation={frame:0};state.startScrollAnimation=animation;panel.classList.add('start-scrolling');
  const tick=now=>{if(state.startScrollAnimation!==animation){panel.classList.remove('start-scrolling');return;}const progress=Math.min(1,(now-started)/duration);panel.scrollTop=from+distance*startScrollEase(progress);if(progress<1){animation.frame=requestAnimationFrame(tick);}else{panel.scrollTop=target;state.startScrollAnimation=null;panel.classList.remove('start-scrolling');setStartSection(normalized);syncStartSectionFromScroll();}};
  animation.frame=requestAnimationFrame(tick);
}
function scrollStartTop(){scrollStartSection('top');}
function updateStartBackToTop(){const panel=$('tab-start'),button=$('startBackToTop');if(!button||!panel)return;button.hidden=panel.hidden||panel.scrollTop<280;}
if($('startBackToTop'))$('startBackToTop').onclick=()=>scrollStartTop();
async function navigateStartSection(section){
  const requestedSection=section==='summary'?'summary':'top';
  const panel=$('tab-start');const hidden=Boolean(panel?.hidden);state.startSection=requestedSection;
  await setTab('start',{reload:hidden});
  // Ao voltar de outra área, o scroll antigo do Resumo pode disparar um evento antes
  // do próximo frame. Não reutilize state.startSection aqui: mantenha o destino pedido.
  state.startSection=requestedSection;
  requestAnimationFrame(()=>scrollStartSection(requestedSection,{smooth:true}));
}
function syncStartSectionFromScroll(){
  const panel=$('tab-start'),summary=$('homeSummary');if(!panel||!summary||panel.hidden||state.startScrollAnimation||state.startViewportLock)return;if(state.homeWidgetDragKey){keepHomeWidgetDragScroll();return;}
  cancelAnimationFrame(state.startScrollFrame);state.startScrollFrame=requestAnimationFrame(()=>{
    const panelRect=panel.getBoundingClientRect(),summaryRect=summary.getBoundingClientRect();
    const summaryTop=panel.scrollTop+(summaryRect.top-panelRect.top);const threshold=Math.max(24,summaryTop-Math.min(150,panel.clientHeight*.22));
    const maxScroll=Math.max(0,panel.scrollHeight-panel.clientHeight),nearBottom=maxScroll>0&&panel.scrollTop>=maxScroll-2;
    setStartSection(nearBottom||panel.scrollTop>=threshold?'summary':'top');
  });
}
$('tab-start').addEventListener('scroll',syncStartSectionFromScroll,{passive:true});
$('tab-start').addEventListener('scroll',updateStartBackToTop,{passive:true});
$('tab-start').addEventListener('wheel',cancelStartScrollAnimation,{passive:true});
$('tab-start').addEventListener('wheel',e=>{
  const panel=$('tab-start'),summary=$('homeSummary');if(!panel||!summary)return;
  // Quando o usuário está no Resumo e gira a roda para cima, a rolagem pertence
  // à página principal, mesmo se o cursor estiver sobre Agenda/Notificações.
  if(e.deltaY<0&&panel.scrollTop>0&&summary.contains(e.target)){
    e.preventDefault();
    panel.scrollTop=Math.max(0,panel.scrollTop+e.deltaY);
    syncStartSectionFromScroll();
  }
},{passive:false});
$('tab-start').addEventListener('touchstart',cancelStartScrollAnimation,{passive:true});
$('summaryJump').onclick=()=>navigateStartSection('summary');

function setProtectedMode(force){
  state.protectedMode=typeof force==='boolean'?force:!state.protectedMode;
  if(state.protectedMode&&!state.protectedSession)state.protectedSession=crypto.randomUUID();
  if(!state.protectedMode){state.protectedThread=[];state.protectedSession=null;}
  const b=$('protectedModeToggle');if(!b)return;
  b.classList.toggle('active',state.protectedMode);b.setAttribute('aria-pressed',state.protectedMode?'true':'false');
  const copy=b.querySelector('.safe-chat-copy');if(copy)copy.textContent=state.protectedMode?'Safe Chat ativo':'Safe Chat';
  $('protectedModeText').textContent=state.protectedMode?'Conversa protegida · armazenamento criptografado':'Enter envia · Shift + Enter quebra a linha';
  $('homeMessageInput').placeholder=state.protectedMode?'Escreva no Safe Chat…':'Pergunte, registre ou peça para a Sofia abrir alguma coisa…';
}
$('protectedModeToggle').onclick=()=>setProtectedMode();
async function sendProtected(text,{voiceUrl='',voiceDuration=0}={}){
  if(state.busy)return null;const content=text.trim();if(!content)return null;
  state.busy=true;$('homeSendButton').disabled=true;notify('');$('homeStatus').textContent='Safe Chat: preparando resposta privada…';
  try{
    const context=state.protectedThread.slice(-6).map(x=>({role:x.role,content:x.content}));
    const r=await api('/api/vault/chat',{method:'POST',body:{message:content,category:'Safe Chat',session_id:state.protectedSession,context}});
    state.protectedSession=r.session_id;state.protectedThread.push({role:'user',content,voice:voiceUrl?{voiceUrl,duration_ms:voiceDuration}:null},{role:'assistant',content:r.reply});if(state.protectedThread.length>8)state.protectedThread=state.protectedThread.slice(-8);
    return r;
  }catch(err){if(err.data?.code==='NOT_SETUP'){notify('Configure a proteção do Diário Pessoal uma vez antes de usar o Safe Chat.',true);setTab('vault');}throw err;}
  finally{state.busy=false;$('homeSendButton').disabled=false;}
}
function homeBubble(role,content,message=null){
  const row=el('div','home-turn '+role);const bubble=el('div','home-bubble');const text=el('div','home-bubble-text');
  const voice=message?.voice;if(voice&&role==='user')text.append(renderVoiceMessage(voice,{transcript:content}));else appendChatFormattedText(text,content);bubble.append(el('div','home-speaker',role==='user'?'Você':'Sofia'),text);row.append(bubble);return row;
}
function homeClarificationNode(r){
  if(!r)return null;
  const wrap=el('div','home-clarification');
  wrap.append(el('div','home-speaker','Sofia'),el('p','clarification-question',r.question||'O que você quer que eu faça?'));
  const actions=el('div','clarification-actions');
  for(const option of (r.options||[]).slice(0,4))actions.append(btn(option.label,async()=>{
    const previousClarification=state.pendingClarification;
    try{
      state.homeError=null;state.pendingClarification=null;state.optimisticUser=option.label;state.optimisticClientId=crypto.randomUUID();state.homeThinking=true;renderHomeThread();
      const next=await send(option.label,{clientId:state.optimisticClientId,route:'auto',navigate:false,clarificationId:r.id,clarificationOption:option.id});
      state.homeThinking=false;state.optimisticUser='';state.optimisticClientId=null;state.pendingClarification=next.clarification||null;state.homeTarget=next.ui_target||null;renderHomeThread();
    }catch(err){state.homeThinking=false;state.pendingClarification=previousClarification;state.homeError={message:err.message,code:err.data?.code||'',text:option.label,clientId:state.optimisticClientId,clarificationId:r.id,clarificationOption:option.id};renderHomeThread();}
  },'secondary'));
  wrap.append(actions,el('p','hint','Ou responda naturalmente no campo abaixo.'));
  return wrap;
}
function renderHomeThread({force=false}={}){
  const box=$('homeChatResult');if(!box)return;if(!force&&homeThreadRenderDeferred()){state.homeThreadDirty=true;return;}state.homeThreadDirty=false;
  const viewportAnchor=captureStartViewportAnchor();
  box.replaceChildren();box.hidden=false;
  const items=state.protectedMode?state.protectedThread:state.messages;
  const normalized=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
  let clarificationMessageIndex=-1;
  if(!state.protectedMode&&state.pendingClarification?.question){
    const question=normalized(state.pendingClarification.question);
    for(let i=items.length-1;i>=0;i--){if(items[i]?.role==='assistant'&&normalized(items[i]?.content)===question){clarificationMessageIndex=i;break;}}
  }
  if(!items.length&&!state.optimisticUser){
    box.append(homeBubble('assistant','Oi. Pode falar comigo como falaria no WhatsApp. Eu acompanho esta conversa e uso o contexto recente quando ele for necessário.'));
  }else{
    items.forEach((m,index)=>{if(index!==clarificationMessageIndex&&(m.role==='user'||m.role==='assistant'))box.append(homeBubble(m.role,m.content,m));});
  }
  const optimisticAlready=state.optimisticClientId&&items.some(m=>m.client_id===state.optimisticClientId);
  if(state.optimisticUser&&!optimisticAlready)box.append(homeBubble('user',state.optimisticUser));
  const pendingVoice=state.optimisticVoice?.target==='home'&&!items.some(m=>m.client_id===state.optimisticVoice.clientId);if(pendingVoice)box.append(homeBubble('user','',{voice:state.optimisticVoice}));
  if(!state.protectedMode&&state.pendingClarification){
    const node=homeClarificationNode(state.pendingClarification);if(node)box.append(node);
  }
  if(state.homeTarget&&!state.pendingClarification){
    const names={tasks:'Tarefas',commitments:'Agenda',lists:'Listas',study:'Estudos',library:'Biblioteca',vault:'Diário Pessoal',start:'Início',userpage:'Espaço'};
    box.append(btn('Abrir '+(names[state.homeTarget]||'área'),()=>setTab(state.homeTarget==='start'?'start':state.homeTarget),'secondary home-open-target'));
  }
  if(state.homeUsage)box.append(usageCardFromData(state.homeUsage));
  const last=items[items.length-1];
  if(state.homeThinking&&(state.optimisticUser||state.optimisticVoice?.target==='home'||last?.role!=='assistant')){
    const typing=el('div','home-turn assistant');const bubble=el('div','home-bubble typing-bubble');bubble.append(el('div','home-speaker','Sofia'),el('div','typing-dots','•••'));typing.append(bubble);box.append(typing);
  }
  if(state.homeError){
    const err=el('div','home-inline-error');
    err.append(el('span','',state.homeError.message||'Não consegui concluir a resposta.'));
    if(['API_CONNECTION','API_TIMEOUT','TURN_TIMEOUT','CLIENT_TIMEOUT','CANCELLED'].includes(state.homeError.code))err.append(btn('Tentar novamente',async()=>{
      const data=state.homeError;state.homeError=null;state.homeThinking=true;state.optimisticUser=data.text||'';state.optimisticClientId=data.clientId||crypto.randomUUID();renderHomeThread();
      try{const r=await send(data.text,{clientId:state.optimisticClientId,retry:true,route:'auto',navigate:false,clarificationId:data.clarificationId||null,clarificationOption:data.clarificationOption||'',images:data.images||[]});if(data.images?.length)clearPendingImages('home');state.pendingClarification=r.clarification||null;state.homeTarget=r.ui_target||null;state.homeError=null;}catch(e){state.homeError={message:e.message,code:e.data?.code||'',text:data.text,clientId:state.optimisticClientId,clarificationId:data.clarificationId||null,clarificationOption:data.clarificationOption||'',images:data.images||[]};}finally{state.homeThinking=false;state.optimisticUser='';state.optimisticClientId=null;renderHomeThread();}
    },'secondary'));
    box.append(err);
  }
  requestAnimationFrame(()=>{box.scrollTop=box.scrollHeight;});restoreStartViewportAnchor(viewportAnchor);
}
function renderHomeRetry(text,clientId,error){
  state.homeThinking=false;
  state.homeError={message:'Não consegui concluir a chamada agora. Sua mensagem continua salva.',code:error?.data?.code||'',text,clientId};
  renderHomeThread();
}
function renderClarification(box,r){state.pendingClarification=r?.clarification||r||null;renderHomeThread();}
function renderHomeResponse(r,text){
  state.pendingClarification=r.clarification||null;
  state.homeTarget=r.ui_target||null;
  state.homeError=null;
  renderHomeThread();
}
$('homeChatForm').onsubmit=async e=>{e.preventDefault();const text=$('homeMessageInput').value.trim(),images=chatImagePayloads('home');if(!text&&!images.length)return;if(!images.length&&await maybeSwitchVisibleUsageFilter(text)){$('homeMessageInput').value='';return;}if(state.protectedMode&&images.length){showError(new Error('Imagens usam o Filtro Privado normal. Desative o Safe Chat para enviar esta imagem.'));return;}const clientId=crypto.randomUUID();const pending=!state.protectedMode?state.pendingClarification:null;
  $('homeMessageInput').value='';state.homeError=null;if(pending)state.pendingClarification=null;state.optimisticUser=text||'🖼️ Imagem enviada';state.optimisticClientId=clientId;state.homeThinking=true;renderHomeThread();
  $('homeStatus').textContent=state.protectedMode?'Safe Chat ativo…':'';
  try{
    const r=state.protectedMode?await sendProtected(text):await send(text,{clientId,route:'auto',navigate:false,clarificationId:pending?.id||null,images});
    if(!state.protectedMode)clearPendingImages('home');state.pendingClarification=state.protectedMode?null:(r.clarification||null);state.homeTarget=r.ui_target||null;state.homeError=null;
  }catch(err){
    if(pending)state.pendingClarification=pending;
    const fallbackText=text||'Veja a imagem que enviei.';if(['API_CONNECTION','API_TIMEOUT','TURN_TIMEOUT','CLIENT_TIMEOUT','CANCELLED'].includes(err.data?.code))state.homeError={message:'A conexão com a IA falhou. Sua mensagem foi preservada.',code:err.data?.code||'',text:fallbackText,clientId,clarificationId:pending?.id||null,images};
    else state.homeError={message:err.message||'Não consegui concluir a resposta.',code:err.data?.code||'',text:fallbackText,clientId,clarificationId:pending?.id||null,images};
  }finally{
    state.homeThinking=false;state.optimisticUser='';state.optimisticClientId=null;renderHomeThread();
  }
};
$('homeMessageInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('homeChatForm').requestSubmit();}});

function taskAgendaStatus(value){return ({todo:'A fazer',scheduled:'Agendada',pending:'Pendente',doing:'Ativa',waiting:'Aguardando',done:'Concluída',cancelled:'Cancelada'})[value]||label(value||'todo');}
let agendaCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1),agendaView='month',agendaRows=[];
const agendaFilters=new Set(['event','reminder','task','other']);
function agendaWhenFromEntity(e){const preferred=['start_at','remind_at','deadline','due_at','review_at','scheduled_at','date','target_date'];for(const key of preferred){const v=e?.data?.[key];if(v&&Number.isFinite(Date.parse(v)))return v;}const def=state.catalog?.[e?.kind];for(const f of def?.fields||[]){if(!['date','datetime'].includes(f.type))continue;const v=e?.data?.[f.key];if(v&&Number.isFinite(Date.parse(v)))return v;}return '';}
function agendaType(row){if(row._source==='task')return'task';if(row.kind==='reminder')return'reminder';if(row.kind==='commitment')return'event';return'other';}
function agendaDateKey(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))return'';return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function agendaDayKey(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function agendaTime(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))return'';return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
function agendaMonthText(d){return d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase());}
function agendaOpenRow(row){if(row._source==='task')return editTask(row);if(['commitment','reminder'].includes(row.kind))return editEntity(row.kind,row,'commitments');return openRecord(row.id);}
function agendaVisibleRows(){return agendaRows.filter(row=>agendaFilters.has(agendaType(row)));}
function agendaEventClass(row){const type=agendaType(row);let c='agenda-event agenda-'+type;if(type==='task'){const p=row.priority_level||(row.priority?'important':'none');if(p!=='none')c+=' agenda-priority-'+p;}return c;}
function agendaLocalDateValue(day){return agendaDayKey(day);}
function agendaLocalDateTime(day,time='09:00'){const [h,m]=String(time||'09:00').split(':').map(Number),d=new Date(day.getFullYear(),day.getMonth(),day.getDate(),Number.isFinite(h)?h:9,Number.isFinite(m)?m:0,0,0);return d.toISOString();}
function agendaDefaultTime(day){const now=new Date();if(agendaDayKey(day)!==agendaDayKey(now))return'09:00';const total=Math.min(23*60+30,Math.ceil((now.getHours()*60+now.getMinutes()+5)/30)*30),h=Math.floor(total/60),m=total%60;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');}
function agendaCreateAt(day){const defaultTime=agendaDefaultTime(day),defaultEnd=(()=>{const [h,m]=defaultTime.split(':').map(Number),total=Math.min(23*60+59,h*60+m+60);return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');})();editor('Novo item na Agenda',[{name:'kind',label:'Tipo',type:'select',value:'event',options:[['event','Evento'],['task','Tarefa'],['reminder','Lembrete']]},{name:'title',label:'Título',required:true,max:300,placeholder:'O que vai acontecer?'},{name:'date',label:'Data',type:'date',value:agendaLocalDateValue(day),required:true},{name:'time',label:'Horário',type:'time',value:defaultTime,required:true},{name:'end_time',label:'Fim (evento)',type:'time',value:defaultEnd},{name:'area',label:'Área',value:'Geral',max:80,suggestions:state.areas},{name:'location',label:'Local / link',max:300,placeholder:'Opcional'},{name:'notes',label:'Descrição',type:'textarea',max:5000}],async v=>{const localDay=new Date(v.date+'T12:00:00');if(!Number.isFinite(localDay.getTime()))throw new Error('Escolha uma data válida.');const when=agendaLocalDateTime(localDay,v.time||'09:00'),area=String(v.area||'Geral').trim()||'Geral';if(v.kind==='task'){await api('/api/tasks',{method:'POST',body:{title:v.title,area,state:'scheduled',due_at:when,priority:false,priority_level:'none',location:v.location||'',notifications:[],color:'default',description:v.notes||'',calendar_provider:'local',external_calendar_id:'',external_event_id:'',sync_state:'local'}});}else if(v.kind==='reminder'){await api('/api/entities',{method:'POST',body:{kind:'reminder',title:v.title,content:v.notes||'',area,privacy:'shared',state:'active',data:{remind_at:when,message:v.notes||v.title,location:v.location||'',calendar_provider:'local',calendar_id:'',external_event_id:'',sync_state:'local'},tags:['Agenda']}});}else{let end='';if(v.end_time){const endIso=agendaLocalDateTime(localDay,v.end_time);if(Date.parse(endIso)>Date.parse(when))end=endIso;}if(!end)end=new Date(Date.parse(when)+60*60*1000).toISOString();await api('/api/entities',{method:'POST',body:{kind:'commitment',title:v.title,content:v.notes||'',area,privacy:'shared',state:'planned',data:{start_at:when,end_at:end,location:v.location||'',remind_minutes:'',calendar_provider:'local',calendar_id:'',external_event_id:'',sync_state:'local'},tags:['Agenda']}});}await loadCommitments();notify('Item adicionado à Agenda.');});$('editorDialog').classList.add('agenda-quick-dialog');}
function agendaWhenKeyFromEntity(e){for(const key of ['start_at','remind_at','deadline','due_at','review_at','scheduled_at','date','target_date']){const v=e?.data?.[key];if(v&&Number.isFinite(Date.parse(v)))return key;}const def=state.catalog?.[e?.kind];for(const f of def?.fields||[]){if(!['date','datetime'].includes(f.type))continue;const v=e?.data?.[f.key];if(v&&Number.isFinite(Date.parse(v)))return f.key;}return'';}
function agendaMoveValueToDay(value,day){const old=new Date(value);if(!Number.isFinite(old.getTime()))return agendaLocalDateTime(day,'09:00');return new Date(day.getFullYear(),day.getMonth(),day.getDate(),old.getHours(),old.getMinutes(),old.getSeconds(),0).toISOString();}
async function agendaMoveRowToDay(row,day){const next=agendaMoveValueToDay(row._when,day);if(agendaDateKey(next)===agendaDateKey(row._when))return;if(row._source==='task'){await api('/api/tasks/'+row.id,{method:'PATCH',body:{title:row.title,area:row.area||'Geral',state:row.state||'scheduled',due_at:next,priority:Boolean(row.priority),priority_level:row.priority_level||(row.priority?'important':'none'),location:row.location||'',notifications:Array.isArray(row.notifications)?row.notifications:[],color:row.color||'default',description:row.description||'',revision:row.revision,source_id:row.source_id||null,calendar_provider:row.calendar_provider||'local',external_calendar_id:row.external_calendar_id||'',external_event_id:row.external_event_id||'',sync_state:row.sync_state||'local'}});}else{const current=await api('/api/entities/'+row.id),key=agendaWhenKeyFromEntity(current);if(!key)return;const data={...current.data};if(current.kind==='commitment'&&key==='start_at'&&data.end_at){const duration=Math.max(0,Date.parse(data.end_at)-Date.parse(data.start_at));data.start_at=next;if(duration)data.end_at=new Date(Date.parse(next)+duration).toISOString();}else data[key]=next;await api('/api/entities/'+current.id,{method:'PATCH',body:{kind:current.kind,title:current.title,content:current.content,area:current.area,privacy:current.privacy,state:current.state,revision:current.revision,data,tags:current.tags||[]}});}await loadCommitments();notify('Data atualizada. O registro original também foi atualizado.');}
let agendaDragRow=null;
function agendaRenderMonth(){
  const host=$('agendaCalendar');if(!host)return;host.replaceChildren();host.hidden=agendaView!=='month';$('commitmentList').hidden=agendaView==='month';if(agendaView!=='month')return;
  const week=el('div','agenda-weekdays');for(const n of ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'])week.append(el('span','',n));host.append(week);
  const y=agendaCursor.getFullYear(),m=agendaCursor.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0),cells=Math.ceil((first.getDay()+last.getDate())/7)*7,start=new Date(y,m,1-first.getDay()),todayKey=agendaDayKey(new Date()),rows=agendaVisibleRows();
  const grid=el('div','agenda-month-grid');let visible=0;
  for(let i=0;i<cells;i++){
    const day=new Date(start);day.setDate(start.getDate()+i);const key=agendaDayKey(day),cell=el('div','agenda-day'+(day.getMonth()!==m?' outside':'')+(key===todayKey?' today':''));cell.tabIndex=0;cell.setAttribute('role','button');cell.setAttribute('aria-label','Criar item em '+day.toLocaleDateString('pt-BR'));const head=el('div','agenda-day-head');head.append(el('span','agenda-day-number',String(day.getDate())));cell.append(head);
    cell.addEventListener('click',e=>{if(e.target.closest('button'))return;agendaCreateAt(day);});cell.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button')){e.preventDefault();agendaCreateAt(day);}});cell.addEventListener('dragover',e=>{if(!agendaDragRow)return;e.preventDefault();cell.classList.add('drop-target');});cell.addEventListener('dragleave',()=>cell.classList.remove('drop-target'));cell.addEventListener('drop',e=>{if(!agendaDragRow)return;e.preventDefault();cell.classList.remove('drop-target');const row=agendaDragRow;agendaDragRow=null;agendaMoveRowToDay(row,day).catch(showError);});
    const items=rows.filter(r=>agendaDateKey(r._when)===key).sort((a,b)=>String(a._when).localeCompare(String(b._when)));visible+=items.length;
    for(const item of items.slice(0,4)){const b=btn('',()=>agendaOpenRow(item),agendaEventClass(item));b.draggable=true;b.addEventListener('dragstart',e=>{agendaDragRow=item;b.classList.add('dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',item.id||'agenda-item');}catch{}});b.addEventListener('dragend',()=>{agendaDragRow=null;b.classList.remove('dragging');document.querySelectorAll('.agenda-day.drop-target').forEach(n=>n.classList.remove('drop-target'));});const time=agendaTime(item._when);b.append(el('span','agenda-event-dot'),el('span','agenda-event-time',time),el('span','agenda-event-title',item.title));b.title=(item._kind||'Item')+' · '+item.title+(time?' · '+time:'')+' · clique para editar ou arraste para mudar o dia';cell.append(b);}
    if(items.length>4){const more=btn('+'+(items.length-4)+' mais',()=>{agendaView='list';agendaSyncView();renderAgendaViewer();},'agenda-more');cell.append(more);}
    grid.append(cell);
  }
  host.append(grid);const count=$('agendaVisibleCount');if(count)count.textContent=visible+' '+(visible===1?'item':'itens')+' neste mês';
}
function agendaRenderList(){
  const host=$('commitmentList');if(!host||agendaView!=='list')return;host.replaceChildren();const rows=agendaVisibleRows().filter(r=>r._when).sort((a,b)=>String(a._when).localeCompare(String(b._when)));const groups=new Map();for(const row of rows){const key=agendaDateKey(row._when);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}const now=new Date();
  for(const [key,items] of groups){const d=new Date(key+'T12:00:00'),section=el('section','agenda-schedule-day');const head=el('div','agenda-schedule-date');head.append(el('strong','',d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})),el('span','',String(d.getFullYear())));section.append(head);for(const item of items){const row=btn('',()=>agendaOpenRow(item),'agenda-schedule-row '+agendaEventClass(item));row.append(el('span','agenda-schedule-time',agendaTime(item._when)||'—'),el('span','agenda-event-dot'),el('span','agenda-schedule-copy',item.title),el('span','agenda-schedule-kind',item._kind));section.append(row);}host.append(section);}
  if(!rows.length)host.append(el('div','agenda-empty','Nenhum item agendado.'));const count=$('agendaVisibleCount');if(count)count.textContent=rows.length+' '+(rows.length===1?'item':'itens')+' agendados';
}
function agendaSyncView(){const month=$('agendaMonthView'),list=$('agendaListView');if(month)month.classList.toggle('active',agendaView==='month');if(list)list.classList.toggle('active',agendaView==='list');}
function renderAgendaViewer(){const label=$('agendaMonthLabel');if(label)label.textContent=agendaMonthText(agendaCursor);agendaSyncView();agendaRenderMonth();agendaRenderList();}
function bindAgendaViewer(){
  const viewer=$('agendaCalendar');if(!viewer||viewer.dataset.bound==='1')return;viewer.dataset.bound='1';
  $('agendaToday').onclick=()=>{const d=new Date();agendaCursor=new Date(d.getFullYear(),d.getMonth(),1);renderAgendaViewer();};
  $('agendaPrev').onclick=()=>{agendaCursor=new Date(agendaCursor.getFullYear(),agendaCursor.getMonth()-1,1);renderAgendaViewer();};
  $('agendaNext').onclick=()=>{agendaCursor=new Date(agendaCursor.getFullYear(),agendaCursor.getMonth()+1,1);renderAgendaViewer();};
  $('agendaMonthView').onclick=()=>{agendaView='month';renderAgendaViewer();};$('agendaListView').onclick=()=>{agendaView='list';renderAgendaViewer();};
  document.querySelectorAll('[data-agenda-filter]').forEach(input=>input.addEventListener('change',()=>{if(input.checked)agendaFilters.add(input.dataset.agendaFilter);else agendaFilters.delete(input.dataset.agendaFilter);renderAgendaViewer();}));
}
async function loadCommitments(){
  await catalog();const [entitiesResponse,tasksResponse]=await Promise.all([api('/api/entities?limit=500'),api('/api/tasks')]);const entities=(entitiesResponse.items||[]).filter(x=>x.state!=='archived');
  const agendaEvents=entities.filter(x=>x.kind==='commitment').map(x=>({...x,_kind:'Evento',_source:'entity',_when:x.data.start_at||''}));
  const reminders=entities.filter(x=>x.kind==='reminder').map(x=>({...x,_kind:'Lembrete',_source:'entity',_when:x.data.remind_at||''}));
  const datedTasks=(tasksResponse.items||[]).filter(x=>x.due_at&&!['cancelled'].includes(x.state)).map(x=>({...x,_kind:'Tarefa · '+taskAgendaStatus(x.state),_source:'task',_when:x.due_at}));
  const extras=entities.filter(x=>!['commitment','reminder','user_page'].includes(x.kind)).map(x=>{const when=agendaWhenFromEntity(x);return when?{...x,_kind:state.catalog?.[x.kind]?.label||label(x.kind),_source:'entity',_when:when}:null;}).filter(Boolean);
  agendaRows=[...agendaEvents,...reminders,...datedTasks,...extras].filter(x=>x._when&&Number.isFinite(Date.parse(x._when))).sort((a,b)=>String(a._when).localeCompare(String(b._when)));
  bindAgendaViewer();renderAgendaViewer();
}
$('addCommitment').onclick=()=>editEntity('commitment',null,'commitments');$('addReminder').onclick=()=>editEntity('reminder',null,'commitments');if($('addAgendaTask'))$('addAgendaTask').onclick=()=>editTask();

const LIST_VIEWS={market:'Mercado',pharmacy:'Farmácia',purchase:'Comprar',blackfriday:'Black Friday',monitor:'Monitoramentos'};
function activeListViews(){const allowed=state.listViews?.length?state.listViews:Object.keys(LIST_VIEWS);return allowed.filter(k=>LIST_VIEWS[k]);}
async function manageListViews(){const current=new Set(activeListViews());const fields=Object.entries(LIST_VIEWS).map(([k,t])=>({name:'view_'+k,label:t,type:'checkbox',value:current.has(k)}));editor('Listas padrão visíveis',fields,async v=>{let selected=Object.keys(LIST_VIEWS).filter(k=>v['view_'+k]);if(!selected.length)selected=['purchase'];await api('/api/settings',{method:'PATCH',body:{listViews:selected}});state.listViews=selected;if(!selected.includes(state.listView)&&!state.listView.startsWith('custom:'))state.listView=selected[0];await loadLists();notify('Listas padrão atualizadas. O módulo Listas continua no menu.');});}
async function manageLibraryViews(){await catalog();const all=Object.entries(state.catalog).filter(([,c])=>c.group==='library');const current=new Set(state.libraryViews?.length?state.libraryViews:all.map(([k])=>k));const fields=all.map(([k,c])=>({name:'lib_'+k,label:c.label,type:'checkbox',value:current.has(k)}));editor('Categorias padrão da Biblioteca',fields,async v=>{let selected=all.map(([k])=>k).filter(k=>v['lib_'+k]);if(!selected.length)selected=[all[0][0]];await api('/api/settings',{method:'PATCH',body:{libraryViews:selected}});state.libraryViews=selected;if(!selected.includes(state.libraryKind))state.libraryKind=selected[0];await loadGroup('library');notify('Categorias da Biblioteca atualizadas. A Biblioteca continua no menu.');});}
async function movePurchaseToGroup(record,groupId){const current=await api('/api/entities/'+record.id);const data={...current.data,purchase_group_id:groupId||''};await api('/api/entities/'+record.id,{method:'PATCH',body:{kind:current.kind,title:current.title,content:current.content,area:current.area,privacy:current.privacy,state:current.state,revision:current.revision,data,tags:current.tags||[]}});state.purchaseDragId=null;notify(groupId?'Item movido para o grupo.':'Item movido para Sem grupo.');await loadLists();}
function makePurchaseDropTarget(button,groupId){button.dataset.purchaseDrop=groupId||'';button.addEventListener('dragover',e=>{if(!state.purchaseDragId)return;e.preventDefault();button.classList.add('drop-target');});button.addEventListener('dragleave',()=>button.classList.remove('drop-target'));button.addEventListener('drop',e=>{e.preventDefault();button.classList.remove('drop-target');if(!state.purchaseDragId)return;const id=state.purchaseDragId;state.purchaseDragId=null;api('/api/entities/'+id).then(record=>movePurchaseToGroup(record,groupId)).catch(showError);});return button;}

async function createCustomList(){editor('Nova lista',[{name:'title',label:'Nome da lista',required:true,max:100},{name:'description',label:'Para que serve?',type:'textarea',max:1000}],async v=>{const saved=await api('/api/entities',{method:'POST',body:{kind:'list_collection',title:v.title,content:v.description||'',area:'Pessoal',privacy:'private',state:'active',data:{description:v.description||'',icon:''},tags:['Lista personalizada']}});state.listView='custom:'+saved.id;await loadLists();notify('Lista criada. A Sofia também pode criar listas quando você pedir explicitamente.');});}
async function createPurchaseGroup(){editor('Novo grupo de compras',[{name:'title',label:'Nome do grupo',required:true,max:100}],async v=>{await api('/api/entities',{method:'POST',body:{kind:'purchase_group',title:v.title,content:'',area:'Pessoal',privacy:'private',state:'active',data:{},tags:['Grupo de compras']}});state.purchaseGroupFilter='all';await loadLists();notify('Grupo criado.');});}
async function managePurchaseGroups(){const groups=(await api('/api/entities?kind=purchase_group&limit=300')).items.filter(x=>x.state==='active');recordDialog.replaceChildren();const h=el('div','dialog-title');h.append(el('h3','','Grupos de Comprar'),btn('×',()=>recordDialog.close(),'icon-button'));recordDialog.append(h,btn('＋ Novo grupo',()=>{recordDialog.close();createPurchaseGroup();},'primary'));if(!groups.length)recordDialog.append(el('p','hint','Ainda não há grupos.'));for(const g of groups){const row=el('article','data-card');row.append(el('h3','',g.title));const actions=el('div','button-row');actions.append(btn('Renomear',()=>{recordDialog.close();editEntity('purchase_group',g,'lists');}),btn('Excluir grupo',async()=>{await api('/api/entities/'+g.id+'/action',{method:'POST',body:{action:'delete_purchase_group',revision:g.revision}});if(recordDialog.open)recordDialog.close();state.purchaseGroupFilter='all';await loadLists();},'danger'));row.append(actions);recordDialog.append(row);}recordDialog.showModal();}
function purchaseGroupControls(groups){const row=el('div','purchase-group-controls');row.append(btn('Todos',()=>{state.purchaseGroupFilter='all';loadLists();},state.purchaseGroupFilter==='all'?'selected':''));row.append(makePurchaseDropTarget(btn('Sem grupo',()=>{state.purchaseGroupFilter='ungrouped';loadLists();},state.purchaseGroupFilter==='ungrouped'?'selected':''),''));for(const g of groups){const key='group:'+g.id;row.append(makePurchaseDropTarget(btn(g.title,()=>{state.purchaseGroupFilter=key;loadLists();},state.purchaseGroupFilter===key?'selected':''),g.id));}row.append(btn('＋ Grupo',createPurchaseGroup,'secondary'),btn('Gerenciar',managePurchaseGroups));return row;}
async function loadLists(){await catalog();document.querySelectorAll('.purchase-group-controls').forEach(n=>n.remove());const controls=$('listControls');controls.replaceChildren();for(const k of activeListViews()){const t=LIST_VIEWS[k];controls.append(btn(t,()=>{state.listView=k;loadLists();},state.listView===k?'selected':''));}state.customLists=(await api('/api/entities?kind=list_collection&limit=300')).items.filter(x=>x.state==='active');for(const list of state.customLists){const key='custom:'+list.id;controls.append(btn(list.title,()=>{state.listView=key;loadLists();},state.listView===key?'selected':''));}controls.append(btn('＋',()=>createCustomList(),'primary'),btn('Gerenciar listas',manageListViews,'secondary'));
  const info=$('listInfo'),host=$('listList');host.replaceChildren();let items=[];
  if(['market','pharmacy'].includes(state.listView)){items=(await api('/api/entities?kind=shopping_item&limit=500')).items.filter(x=>x.data.list===state.listView&&x.state!=='archived');info.textContent=(state.listView==='market'?'Mercado':'Farmácia')+' é uma lista independente; comprar um item não altera a outra.';$('addListItem').textContent='＋ Item de '+LIST_VIEWS[state.listView];$('addListItem').onclick=()=>editShopping(state.listView);}
  else if(state.listView==='purchase'){const groups=(await api('/api/entities?kind=purchase_group&limit=300')).items.filter(x=>x.state==='active');items=(await api('/api/entities?kind=purchase&limit=500')).items.filter(x=>x.state!=='archived');if(state.purchaseGroupFilter==='ungrouped')items=items.filter(x=>!x.data?.purchase_group_id);else if(state.purchaseGroupFilter.startsWith('group:'))items=items.filter(x=>x.data?.purchase_group_id===state.purchaseGroupFilter.slice(6));info.textContent='Comprar pode ser organizado em grupos definidos por você. Arraste um item para um grupo acima ou abra/edite o item e escreva o nome do grupo.';info.after(purchaseGroupControls(groups));$('addListItem').textContent='＋ Item para comprar';$('addListItem').onclick=()=>editEntity('purchase',null,'lists');}
  else if(state.listView==='blackfriday'){items=(await api('/api/entities?kind=purchase&limit=500')).items.filter(x=>x.state!=='archived'&&(x.data.occasion==='black-friday'||x.tags.includes('Black Friday')));info.textContent='Black Friday é uma ocasião/filtro, não uma cópia do produto.';$('addListItem').textContent='＋ Item Black Friday';$('addListItem').onclick=()=>editEntity('purchase',null,'lists');}
  else if(state.listView==='monitor'){items=(await api('/api/entities?kind=monitor&limit=500')).items.filter(x=>x.state!=='archived');info.textContent='Monitoramentos registram observações reais. Automação depende de fonte autorizada e da Sofia estar executando.';$('addListItem').textContent='＋ Monitoramento';$('addListItem').onclick=()=>editEntity('monitor',null,'lists');}
  else if(state.listView.startsWith('custom:')){const list=state.customLists.find(x=>x.id===state.listView.slice(7));if(!list){state.listView='market';return loadLists();}items=(await api('/api/entities?kind=list_item&limit=500')).items.filter(x=>x.data.collection_id===list.id&&x.state!=='archived');info.textContent=list.content||'Lista personalizada.';$('addListItem').textContent='＋ Item em '+list.title;$('addListItem').onclick=()=>editCustomListItem(list);}
  for(const e of items){const c=el('article','data-card quick-delete-card');c.append(el('span','tag',label(e.state)),el('h3','',e.title),quickDeleteButton(e));if(state.listView==='purchase'){c.draggable=true;c.classList.add('purchase-draggable');c.addEventListener('dragstart',ev=>{state.purchaseDragId=e.id;c.classList.add('dragging');try{ev.dataTransfer.setData('text/plain',e.id);ev.dataTransfer.effectAllowed='move';}catch{}});c.addEventListener('dragend',()=>{state.purchaseDragId=null;c.classList.remove('dragging');document.querySelectorAll('.drop-target').forEach(n=>n.classList.remove('drop-target'));});}if(e.data?.quantity)c.append(el('p','small-meta','Quantidade: '+e.data.quantity));if(e.data?.notes)c.append(el('p','',e.data.notes));if(state.uiMode==='developer')c.append(el('p','small-meta',(e.privacy==='shared'?'Filtro Compartilhado':'Filtro Privado')+' · '+date(e.updated_at)));const actions=el('div','button-row');actions.append(btn('Abrir',()=>openRecord(e.id)),btn('Excluir',()=>deleteRecord(e),'danger'));c.append(actions);host.append(c);}if(!items.length)host.append(el('div','empty-card','Nenhum item nesta lista.'));
}
function editShopping(list){editor('Novo item · '+LIST_VIEWS[list],[{name:'title',label:'Item',required:true,max:240},{name:'quantity',label:'Quantidade / unidade',max:200}],async v=>{await api('/api/entities',{method:'POST',body:{kind:'shopping_item',title:v.title,content:'',area:'Pessoal',privacy:list==='pharmacy'?'private':'shared',state:'needed',data:{list,quantity:v.quantity,paid_price:'',purchased_on:''},tags:[LIST_VIEWS[list]]}});await loadLists();});}
function editCustomListItem(list){editor('Novo item · '+list.title,[{name:'title',label:'Item',required:true,max:240},{name:'quantity',label:'Quantidade / unidade',max:200},{name:'notes',label:'Observações',type:'textarea',max:1200}],async v=>{await api('/api/entities',{method:'POST',body:{kind:'list_item',title:v.title,content:'',area:list.area||'Pessoal',privacy:list.privacy||'private',state:'needed',data:{collection_id:list.id,quantity:v.quantity,notes:v.notes},tags:[list.title]}});await loadLists();});}

$('routingHistory').onclick=async()=>{try{const rows=(await api('/api/routing/decisions')).items;recordDialog.replaceChildren();const h=el('div','dialog-title');h.append(el('h3','','Histórico de roteamento'),btn('×',()=>recordDialog.close()));recordDialog.append(h);if(!rows.length)recordDialog.append(el('p','hint','Ainda não há decisões registradas.'));for(const r of rows.slice(0,100)){const c=el('article','data-card');c.append(el('span','tag',r.route==='shared'?'Filtro Compartilhado':r.route==='private'?'Filtro Privado':'Local técnico'),el('span','tag',r.requested_mode==='auto'?'Automático':'Escolha técnica'),el('p','',r.reason),el('p','small-meta',(r.context_used?'Com contexto · ':'Sem contexto extra · ')+date(r.created_at)));recordDialog.append(c);}recordDialog.showModal();}catch(e){showError(e);}};
