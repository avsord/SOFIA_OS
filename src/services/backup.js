'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {spawnSync}=require('node:child_process');
const {AppError,atomicWrite,now,id}=require('../core/util');
const FORMAT='sofia-backup-v1';
class KeyStore {
  constructor(directory) { this.directory=directory || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'.local','share'),'SofiaOS','secure');this.key=null; }
  dpapi(value, protect) {
    const exe=path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const action=protect?'Protect':'Unprotect';
    const command="$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); $r=[Security.Cryptography.ProtectedData]::"+action+"($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($r))";
    const result=spawnSync(exe,['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{input:value.toString('base64'),encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:16384,stdio:['pipe','pipe','pipe']});
    if(result.error || result.status!==0 || !/^[A-Za-z0-9+/=]+$/.test(result.stdout.trim())) throw new AppError('BACKUP_KEY','Não consegui abrir a proteção de backup do seu usuário do Windows. A memória não foi apagada.',500);
    return Buffer.from(result.stdout.trim(),'base64');
  }
  get() {
    if(this.key)return this.key;
    const filename=path.join(this.directory,process.platform==='win32'?'backup-master-v1.dpapi':'backup-master-v1.key');
    fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
    if(fs.existsSync(filename)) {
      const data=fs.readFileSync(filename);this.key=process.platform==='win32'?this.dpapi(data,false):data;
    } else {
      const key=crypto.randomBytes(32);atomicWrite(filename,process.platform==='win32'?this.dpapi(key,true):key);this.key=key;
    }
    if(this.key.length!==32)throw new AppError('BACKUP_KEY','A chave local de backup está inválida. Nenhum backup foi sobrescrito.',500);
    return this.key;
  }
}
function seal(snapshot,{key,passphrase}={}) {
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12);
  if(passphrase!==undefined && (typeof passphrase!=='string'||passphrase.length<12||passphrase.length>512))throw new AppError('WEAK_PASSPHRASE','Use uma senha de backup entre 12 e 512 caracteres. Guarde-a fora da Sofia.');
  const actual=passphrase!==undefined?crypto.scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024}):key;
  if(!Buffer.isBuffer(actual)||actual.length!==32)throw new AppError('BACKUP_KEY','Chave de backup indisponível.',500);
  const header={format:FORMAT,mode:passphrase!==undefined?'password':'local-user',created_at:now(),salt:salt.toString('base64'),iv:iv.toString('base64')};
  const cipher=crypto.createCipheriv('aes-256-gcm',actual,iv);cipher.setAAD(Buffer.from(JSON.stringify(header)));
  const plain=zlib.gzipSync(Buffer.from(JSON.stringify(snapshot),'utf8'));
  const data=Buffer.concat([cipher.update(plain),cipher.final()]);
  return Buffer.from(JSON.stringify({...header,tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}),'utf8');
}
function openBackup(bytes,{key,passphrase}={}) {
  if(!Buffer.isBuffer(bytes)||bytes.length>100*1024*1024)throw new AppError('BAD_BACKUP','Arquivo de backup inválido ou grande demais para esta versão.');
  try {
    const e=JSON.parse(bytes.toString('utf8'));
    if(e.format!==FORMAT || !['password','local-user'].includes(e.mode))throw new Error();
    const salt=Buffer.from(e.salt,'base64'),iv=Buffer.from(e.iv,'base64'),tag=Buffer.from(e.tag,'base64');
    if(salt.length!==16||iv.length!==12||tag.length!==16)throw new Error();
    if(e.mode==='password' && (typeof passphrase!=='string'||passphrase.length>512))throw new Error();
    const actual=e.mode==='password'?crypto.scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024}):key;
    const header={format:e.format,mode:e.mode,created_at:e.created_at,salt:e.salt,iv:e.iv};
    const decipher=crypto.createDecipheriv('aes-256-gcm',actual,iv);decipher.setAAD(Buffer.from(JSON.stringify(header)));decipher.setAuthTag(tag);
    const plain=Buffer.concat([decipher.update(Buffer.from(e.data,'base64')),decipher.final()]);
    return JSON.parse(zlib.gunzipSync(plain,{maxOutputLength:128*1024*1024}).toString('utf8'));
  }catch{throw new AppError('BAD_BACKUP','Não foi possível abrir o backup. Verifique a senha, o usuário do Windows e a integridade do arquivo.');}
}
/** Mesma limpeza de backups.prune(), mas sem precisar de um Store aberto —
 * só mexe com arquivos no disco. Existe para rodar ANTES de tentar abrir o
 * banco: se o disco estiver cheio demais até para o SQLite abrir (ENOSPC
 * logo na inicialização), isto ainda consegue liberar espaço primeiro,
 * porque apagar arquivo nunca precisa de espaço livre. */
/** 03/11/2026: cada publicacao no Railway cria um backup ao desligar; com varias por dia os 7 mais novos eram todos do
 * mesmo dia e os de dias anteriores sumiam. Fica: os 7 mais novos + o mais novo de cada um dos ultimos 7 dias. */
function backupsToRemove(names, keep = 7) {
  const sorted = [...names].sort().reverse(), keepSet = new Set(sorted.slice(0, keep)), days = new Set();
  for (const n of sorted) { const day = n.slice(6, 16); if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || days.has(day)) continue; if (days.size >= keep) break; days.add(day); keepSet.add(n); }
  return sorted.filter(n => !keepSet.has(n));
}
function pruneBackupsSync(directory, keep = 7) {
  try {
    if (!fs.existsSync(directory)) return 0;
    const files = fs.readdirSync(directory).filter(n => /^sofia-.*\.sofia-backup$/.test(n)).sort().reverse();
    const extra = backupsToRemove(files, keep);
    for (const name of extra) { try { fs.unlinkSync(path.join(directory, name)); } catch { /* um arquivo preso não impede os outros */ } }
    return extra.length;
  } catch { return 0; }
}
class BackupService {
  constructor(store,directory,keyStore=new KeyStore()) {this.store=store;this.directory=directory;this.keyStore=keyStore;this.lastError=null;fs.mkdirSync(directory,{recursive:true,mode:0o700});}
  snapshot(){const snapshot=this.store.export();if(this.vault)snapshot.vault_key=this.vault.exportKey();return snapshot;}
  list() {return fs.readdirSync(this.directory).filter(n=>/^sofia-.*\.sofia-backup$/.test(n)).sort().reverse().map(name=>({name,bytes:fs.statSync(path.join(this.directory,name)).size})).slice(0,100);}
  create(reason='manual') {
    const snapshot=this.snapshot();
    const bytes=seal(snapshot,{key:this.keyStore.get()});
    const name='sofia-'+now().replace(/[:.]/g,'-')+'-'+id().slice(0,8)+'.sofia-backup';
    atomicWrite(path.join(this.directory,name),bytes);this.lastError=null;this.store.audit('backup.'+reason,name);return {name,bytes:bytes.length,encrypted:true,mode:'local-user'};
  }
  tryCreate(reason) {try{return this.create(reason);}catch{this.lastError='O backup não foi criado. Sua memória continua no banco local. Use Diagnóstico e gere um backup portátil.';return null;}}
  daily() {if(!this.list().some(b=>b.name.startsWith('sofia-'+now().slice(0,10))))return this.tryCreate('daily');return null;}
  /** Cada backup é uma cópia inteira do banco, com fotos e áudios dentro:
   * sem isso, um por dia nunca apagado enche o disco sozinho, só com o tempo. */
  prune(keep=7) {const extra=backupsToRemove(fs.readdirSync(this.directory).filter(n=>/^sofia-.*\.sofia-backup$/.test(n)),keep).map(name=>({name}));for(const b of extra){try{fs.unlinkSync(path.join(this.directory,b.name));}catch{/* um arquivo preso não impede os outros */}}return extra.length;}
  portable(passphrase) {return seal(this.snapshot(),{passphrase});}
  /** 0.3.182: registros que existiam nos backups recentes e foram apagados depois. Abre os backups
   * mais novos primeiro e devolve a versao mais recente de cada registro que nao existe mais. */
  recoverable(kinds, exists, limit = 7) {
    const out = new Map();
    for (const b of this.list().slice(0, limit)) {
      let snap; try { snap = openBackup(fs.readFileSync(path.join(this.directory, b.name)), {key: this.keyStore.get()}); } catch { continue; }
      const rows = (snap && snap.tables && snap.tables.entities) || [];
      for (const r of rows) {
        if (!kinds.includes(r.kind) || out.has(r.id) || exists(r.id)) continue;
        let data = {}, tags = [];
        try { data = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {}); } catch { data = {}; }
        try { tags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []); } catch { tags = []; }
        out.set(r.id, {id: r.id, kind: r.kind, title: r.title, content: r.content || '', area: r.area, privacy: r.privacy, state: r.state, tags, data, updated_at: r.updated_at, backup: b.name});
      }
    }
    return [...out.values()].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }
}
module.exports={KeyStore,BackupService,seal,openBackup,pruneBackupsSync,backupsToRemove};
