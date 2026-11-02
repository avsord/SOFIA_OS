import React,{useState} from 'react';
import {tap} from '../lib/desktop';
import {TaskLinkPanel,saveEventAsTask,type TaskLink} from './TaskLinkPanel';
import {RemindersField} from './RemindersField';
import {reminderFields} from '../lib/agenda-reminders';
import {KeyboardAvoidingView,Platform,Switch,Text,TextInput,View} from 'react-native';
// 0.3.255: ScrollView que rola sozinho ate o calendario aberto caber na tela (ver RevealScroll)
import {RevealScrollView as ScrollView} from './RevealScroll';
import {SafeAreaView} from 'react-native-safe-area-context';
import {SofiaApi} from '../lib/api';
import {TASK_PRIORITIES} from '../lib/task-filters';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {Choice} from './Choice';
import {MotionModal} from './MotionModal';
import {DateTimeField} from './DateTimeField';
import {GoogleCalendarProperty} from './GoogleCalendarProperty';
import {requestAgendaPermission} from '../lib/agenda-notifications';
import {Button,ErrorBanner,IconButton,forms} from './UI';
/** The initial calendar opens its own form without waiting for the remote catalog. */
export function HomeCommitmentEditor({api,day,areas,onClose,onSaved}:{api:SofiaApi;day:string;areas:string[];onClose:()=>void;onSaved:()=>void}){
 const c=useTheme();
 const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[start,setStart]=useState(()=>new Date(day.includes('T')?day:day+'T09:00:00').toISOString()),[end,setEnd]=useState(()=>day.includes('T')?new Date(Date.parse(day)+3600000).toISOString():''),/* 0.3.331: vindo da linha do tempo do Inicio, ja com o horario clicado e 1 h de duracao */[priority,setPriority]=useState('none'),[area,setArea]=useState('Pessoal'),[google,setGoogle]=useState(true),[notify,setNotify]=useState(true),[reminders,setReminders]=useState<{reminders_json:string;remind_minutes:number|''}>(reminderFields([10])),[saving,setSaving]=useState(false),[error,setError]=useState('');
 // 0.3.256: igual ao criar da Agenda - "Tornar tarefa" (check + passa para o dia seguinte) e buscar/criar a tarefa
 const [taskLink,setTaskLink]=useState<TaskLink>({asTask:false,task:null}),type=taskLink.asTask?'task':'commitment';
 async function save(){
  if(saving||!title.trim())return;
  setSaving(true);setError('');
  try{
   const begin=new Date(start),finish=end?new Date(end):null;
   if(!Number.isFinite(begin.getTime()))throw Error('Escolha uma data e horário válidos.');
   if(type==='task'){await saveEventAsTask(api,{title,startIso:begin.toISOString(),description,priority,area:area.trim()||'Pessoal',task:taskLink.task});onSaved();return;}
   if(finish&&(!Number.isFinite(finish.getTime())||finish<=begin))throw Error('O fim deve ser depois do início.');
   await api.saveEntity({
    kind:'commitment',title:title.trim(),content:description,area:area.trim()||'Pessoal',
    state:'planned',privacy:'private',tags:notify?[]:['sofia-notify-v1:off'],
    data:{start_at:begin.toISOString(),...(finish?{end_at:finish.toISOString()}:{}),priority_level:priority,...reminders,calendar_provider:google?'google':'local'}
   });
   if(notify)void requestAgendaPermission().catch(()=>false);
   onSaved();
  }catch(e){setError(errorText(e));}finally{setSaving(false);}
 }
 // 0.3.257: segurar a data no Inicio abria a janela com uma piscada (a janela cheia do Android mostrava o fundo dela
 // antes do conteudo). Agora ela entra suave por cima do Inicio, ja com o fundo do app.
 return <MotionModal visible transparent animationType="fade" onRequestClose={()=>{if(!saving)onClose();}}>
  <SafeAreaView style={{flex:1,backgroundColor:c.bg}}>
   <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <View style={{padding:12,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderColor:c.line}}>
     <IconButton name="close" label="Fechar novo compromisso" disabled={saving} onPress={onClose}/>
     <Text style={{color:c.text,fontSize:20,fontWeight:'600',flex:1}}>Novo compromisso</Text>
    </View>
    <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{padding:22,paddingBottom:40,gap:16}}>
     {error?<ErrorBanner text={error}/>:null}
     <View><Text style={[forms.label,{color:c.muted}]}>Título</Text>
      <TextInput autoFocus accessibilityLabel="Título do compromisso" value={title} onChangeText={setTitle} placeholder="Nome do compromisso" placeholderTextColor={c.muted} style={[forms.input,{color:c.text,borderColor:c.line,backgroundColor:c.input}]}/>
     </View>
     <TaskLinkPanel api={api} value={taskLink} onChange={setTaskLink} onPick={(t,task)=>{setTitle(t);if(task?.description&&!description.trim())setDescription(task.description);if(task?.priority_level&&task.priority_level!=='none')setPriority(task.priority_level);}}/>
     <DateTimeField label={type==='task'?'Dia e horário':'Início'} value={start} onChange={setStart} allowClear={false}/>
     {type==='commitment'?<DateTimeField label="Fim" value={end} onChange={setEnd}/>:null}
     <Choice label="Prioridade do compromisso" value={priority} options={TASK_PRIORITIES.map(p=>({value:p.value,label:p.label}))} onChange={setPriority}/>
     <Choice label="Área do compromisso" creatable value={area} options={[...new Set([area,...areas].filter(Boolean))].map(value=>({value,label:value}))} onChange={setArea}/>
     <View><Text style={[forms.label,{color:c.muted}]}>Descrição</Text>
      <TextInput accessibilityLabel="Descrição do compromisso" multiline value={description} onChangeText={setDescription} style={[forms.input,{color:c.text,borderColor:c.line,backgroundColor:c.input,minHeight:88,textAlignVertical:'top'}]}/>
     </View>
     {type==='commitment'?<><GoogleCalendarProperty api={api} autoEnable value={google} onChange={setGoogle}/>
     <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{color:c.text}}>{tap('Notificar neste celular')}</Text><Switch accessibilityLabel="Notificar compromisso neste celular" value={notify} onValueChange={setNotify}/></View>{notify?<RemindersField data={reminders} onChange={setReminders}/>:null}</>:null}
     <Button title={type==='task'?'Salvar na agenda':'Salvar compromisso'} loading={saving} disabled={!title.trim()} onPress={()=>void save()}/>
    </ScrollView>
   </KeyboardAvoidingView>
  </SafeAreaView>
 </MotionModal>;
}
