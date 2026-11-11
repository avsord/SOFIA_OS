#!/usr/bin/env node
'use strict';
// Sofia OS state snapshot: read-only generator; publishing belongs to the workflow.
const cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const PREFIX='sofia-android-v', APK='Sofia-OS.apk';
function git(dir,...args){return cp.execFileSync('git',args,{cwd:dir,encoding:'utf8',maxBuffer:64*1024*1024}).trim();}
function safeGit(dir,...args){try{return git(dir,...args)}catch{return ''}}
const versionParts=v=>typeof v==='string'&&/^\d+\.\d+\.\d+$/.test(v)?v.split('.').map(Number):null;
const cmp=(a,b)=>{for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]-b[i];return 0};
const flat=a=>Array.isArray(a)?(Array.isArray(a[0])?a.flat():a):[];
function newestPublished(rows){
 let best=null;
 for(const r of flat(rows)){
  if(!r||r.draft||r.prerelease||typeof r.tag_name!=='string'||!r.tag_name.startsWith(PREFIX))continue;
  const version=r.tag_name.slice(PREFIX.length),parts=versionParts(version);
  if(!parts||!(r.assets||[]).some(a=>a&&a.name===APK))continue;
  if(!best||cmp(parts,best.parts)>0)best={version,parts,published_at:r.published_at||null,url:r.html_url||null};
 }
 return best;
}
function diaryMaxVersion(master){
 const start=master.search(/^## 10\./m);if(start<0)return null;
 let best=null;
 for(const row of master.slice(start).matchAll(/^\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*(\d+\.\d+\.\d+)\s*\|/gm)){
  const parts=versionParts(row[1]);if(parts&&(!best||cmp(parts,best.parts)>0))best={version:row[1],parts};
 }
 return best;
}
const meaningful=f=>/^(SOFIA_APP|src)\//.test(f)&&!/(^|\/)(tests?|docs)\//.test(f)&&!/\.md$/i.test(f);
function masterDrift(dir,codeVersion){
 const warnings=[];
 const info=safeGit(dir,'log','-1','--format=%H|%cs','--','docs/SOFIA_MASTER.md');
 if(!info){warnings.push('MASTER não encontrado no histórico.');return{warnings,lastMaster:null,behind:[]}}
 const [hash,date]=info.split('|');
 const log=safeGit(dir,'log','--format=\u0001%h %s','--name-only',hash+'..HEAD');
 const behind=[];
 for(const block of log.split('\u0001').slice(1)){
  const lines=block.split('\n').filter(Boolean);
  if(lines.slice(1).some(meaningful))behind.push(lines[0]);
 }
 if(behind.length)warnings.push('MASTER não foi atualizado há '+behind.length+' commit(s) de app/backend (último toque: '+date+').');
 const master=safeGit(dir,'show','HEAD:docs/SOFIA_MASTER.md');
 const diary=diaryMaxVersion(master),code=versionParts(codeVersion);
 if(code&&diary&&cmp(code,diary.parts)>0)warnings.push('Diário do MASTER parou na '+diary.version+', mas o código está na '+codeVersion+'.');
 if(code&&!diary)warnings.push('Diário do MASTER sem versão válida.');
 return {warnings,lastMaster:{hash:hash.slice(0,7),date},behind};
}
function collect(dir,input={}){
 const app=JSON.parse(fs.readFileSync(path.join(dir,'SOFIA_APP','app.json'),'utf8')).expo;
 const version=app.version,versionCode=app.android&&app.android.versionCode;
 const published=input.releases==null?undefined:newestPublished(input.releases);
 const drift=masterDrift(dir,version);
 const code=versionParts(version),pub=published&&versionParts(published.version);
 const runs=input.runs && typeof input.runs==='object'?flat(input.runs.workflow_runs||input.runs).filter(r=>r&&typeof r.status==='string').slice(0,6):undefined;
 const pulls=input.pulls==null?undefined:flat(input.pulls).filter(p=>p&&p.merged_at).slice(0,8);
 return {generatedAt:input.now||new Date().toISOString(),repo:input.repo||'avsord/SOFIA_OS',
  head:safeGit(dir,'log','-1','--format=%H'),
  commits:safeGit(dir,'log','-15','--format=%h|%cs|%s').split('\n').filter(Boolean).map(line=>{const [h,d,...s]=line.split('|');return{h,d,s:s.join('|')}}),
  version,versionCode,published,unpublished:code&&pub?cmp(code,pub)>0:null,
  drift,warnings:drift.warnings,runs,pulls};
}
function render(s){
 const L=['# ESTADO VIVO — Sofia OS','',
  'Snapshot gerado em '+s.generatedAt+' a partir de `'+s.head.slice(0,7)+'` na `sofia-app-android`.',
  'Este arquivo é atualizado por push/release; a conclusão posterior de uma execução pode exigir consulta ao GitHub. Decisões humanas ficam em `docs/SOFIA_MASTER.md`.','',
  '## Alertas',''];
 if(s.warnings.length){for(const w of s.warnings)L.push('- ⚠ '+w);L.push('','**Com ⚠ de MASTER:** conferir commits e PRs e atualizar as seções 9 e 10 antes de confiar na narrativa.');}
 else L.push('- Nenhum alerta detectado automaticamente; isto não certifica todas as decisões humanas.');
 L.push('','## Versões','', '- Código: **'+s.version+'** (versionCode '+s.versionCode+')');
 if(s.published===undefined)L.push('- Atualizador oferece: não consultado nesta geração (API inacessível).');
 else if(s.published===null)L.push('- Atualizador oferece: nenhuma release com Sofia-OS.apk encontrada.');
 else L.push('- Atualizador oferece: **'+s.published.version+'** (publicada '+(s.published.published_at||'data desconhecida')+')');
 if(s.unpublished)L.push('- Há código **não publicado**; isto NÃO garante que exista um APK compilado/aprovado.');
 if(s.unpublished===false)L.push('- Versão do código e release publicada são iguais; consulte o celular para saber a oferta real.');
 L.push('','## Últimos commits','');
 for(const c of s.commits)L.push('- `'+c.h+'` '+c.d+' '+c.s);
 L.push('','## Últimas execuções do workflow de APK','');
 if(s.runs===undefined)L.push('- Não consultado nesta geração.');
 else if(!s.runs.length)L.push('- Nenhuma encontrada.');
 else for(const r of s.runs)L.push('- '+r.status+(r.conclusion?'/'+r.conclusion:'')+' · `'+String(r.head_sha||'').slice(0,7)+'` · '+(r.display_title||r.name)+' · '+r.html_url);
 L.push('','O status do build pode mudar depois deste snapshot; conferir execução ao vivo antes de aprovar.','','## PRs integrados recentemente','');
 if(s.pulls===undefined)L.push('- Não consultado nesta geração.');
 else if(!s.pulls.length)L.push('- Nenhum encontrado.');
 else for(const p of s.pulls)L.push('- #'+p.number+' '+p.title+' (integrado '+String(p.merged_at).slice(0,10)+')');
 L.push('','## Frescor do MASTER','');
 if(s.drift.lastMaster)L.push('- Última edição do MASTER: `'+s.drift.lastMaster.hash+'` em '+s.drift.lastMaster.date+'.');
 if(s.drift.behind.length){L.push('- Commits com código alterado desde o MASTER:');for(const b of s.drift.behind.slice(0,10))L.push('  - '+b);}
 else L.push('- Nenhum commit de app/backend após a edição do MASTER.');
 return L.join('\n')+'\n';
}
function readJson(file){if(!file)return undefined;try{const s=fs.readFileSync(file,'utf8').trim();return s?JSON.parse(s):undefined}catch{return undefined}}
if(require.main===module){
 const args=process.argv.slice(2),arg=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1]};
 const dir=path.resolve(arg('--repo-dir')||'.');
 const state=collect(dir,{repo:arg('--repo-slug'),releases:readJson(arg('--release-json')),runs:readJson(arg('--runs-json')),pulls:readJson(arg('--pulls-json'))});
 fs.writeFileSync(path.resolve(arg('--out')||'ESTADO_VIVO.md'),render(state));
 console.log('ESTADO_VIVO gerado: '+state.version+', '+state.warnings.length+' alerta(s)');
}
module.exports={newestPublished,diaryMaxVersion,masterDrift,collect,render};