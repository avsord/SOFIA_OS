'use strict';
// Delivery metadata only. This never changes runtime logic or disables tests.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const REPO='avsord/SOFIA_OS',BRANCH='sofia-app-android',PREFIX='sofia-android-v',PACKAGE='com.avsord.sofiaapp';
function version(v){if(typeof v!=='string'||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v))throw Error('Invalid Android version');const n=v.split('.').map(Number);if(!n.every(Number.isSafeInteger))throw Error('Version overflow');return n;}
function compare(a,b){const x=version(a),y=version(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;}
function tagged(tag){if(typeof tag!=='string'||!tag.startsWith(PREFIX))return null;try{version(tag.slice(PREFIX.length));return tag.slice(PREFIX.length);}catch{return null;}}
function newest(releases){if(!Array.isArray(releases))throw Error('Incomplete release response');const rows=releases.filter(r=>r&&tagged(r.tag_name)&&r.draft===false&&r.prerelease===false&&Number.isFinite(Date.parse(r.published_at))&&Array.isArray(r.assets)&&r.assets.some(a=>a.name==='Sofia-OS.apk'&&a.state==='uploaded'&&a.size>0));rows.sort((a,b)=>compare(tagged(b.tag_name),tagged(a.tag_name)));if(!rows.length)throw Error('No verified Android baseline; refusing an unrelated rebuild');return rows[0];}
function runtimeFile(file){if(!file.startsWith('SOFIA_APP/'))return false;const p=file.slice(10);if(/^(tests|docs)\//.test(p)||/\.md$/i.test(p))return false;if(/^tools\/(delivery(?:\.test)?\.cjs|publish-release\.cjs|test\.cjs|native-[^/]+\.py)$/.test(p))return false;return true;}
function plan(current,baseline,releases,files,tags=[]){
 const cv=current.version,bv=baseline.version;version(cv);version(bv);if(compare(cv,bv)<0)throw Error('App source is older than the published release; integrate the current app before delivering');
 for(const config of [current,baseline])if(config.android?.package!==PACKAGE||!Number.isSafeInteger(config.android.versionCode)||config.android.versionCode<1)throw Error('Android identity changed; refusing to break in-place updates');
 if(!files.some(runtimeFile))return {release:false,version:cv,version_code:current.android.versionCode,baseline_version:bv,baseline_tag:PREFIX+bv,reason:'No runtime changes since the published APK'};
 const reserved=[bv,...releases.map(r=>tagged(r.tag_name)),...tags.map(tagged)].filter(Boolean).sort(compare).at(-1);
 let next=cv;if(compare(next,reserved)<=0){const n=version(reserved);n[2]++;next=n.join('.');version(next);}
 const code=Math.max(current.android.versionCode,baseline.android.versionCode+1);if(code>2100000000)throw Error('Android versionCode exhausted');
 return {release:true,version:next,version_code:code,baseline_version:bv,baseline_tag:PREFIX+bv,reason:'Runtime changes ready for validated automatic publication'};
}
function prepareFiles(root,p){
 const app=path.join(root,'SOFIA_APP'),read=f=>fs.readFileSync(path.join(app,f),'utf8'),changes=new Map(),json=f=>JSON.parse(read(f));
 const pkg=json('package.json'),cfg=json('app.json'),lock=json('package-lock.json');
 if(cfg.expo.android.package!==PACKAGE)throw Error('Package changed');
 pkg.version=p.version;cfg.expo.version=p.version;cfg.expo.android.versionCode=p.version_code;lock.version=p.version;
 if(!lock.packages?.[''])throw Error('Lockfile root package missing');lock.packages[''].version=p.version;
 for(const [f,v] of [['package.json',pkg],['app.json',cfg],['package-lock.json',lock]])changes.set(f,JSON.stringify(v,null,2)+'\n');
 const updater=read('src/lib/update.ts'),matches=[...updater.matchAll(/export const APP_VERSION = '[^']+';/g)];if(matches.length!==1)throw Error('Updater version declaration changed');
 changes.set('src/lib/update.ts',updater.replace(matches[0][0],`export const APP_VERSION = '${p.version}';`));
 // These literals are version metadata, not behavioural assertions. Keep the
 // existing exact-equality tests, aligned with the same monotonic release plan.
 for(const f of ['tests/navigation.test.cjs','tests/release-024.test.cjs']){
  let text=read(f);let names=0,codes=0;
  text=text.replace(/assert\.equal\(config\.version,'\d+\.\d+\.\d+'\)/g,()=>{names++;return `assert.equal(config.version,'${p.version}')`;});
  text=text.replace(/assert\.equal\(config\.android\.versionCode,\d+\)/g,()=>{codes++;return `assert.equal(config.android.versionCode,${p.version_code})`;});
  text=text.replace(/APP_VERSION = '\d+\.\d+\.\d+'/g,`APP_VERSION = '${p.version}'`);
  if(names!==1||codes!==1)throw Error('Release identity test layout changed: '+f);changes.set(f,text);
 }
 // Validate every input before writing any file. Preserve authored release notes.
 const notes=`RELEASE_${p.version}.md`;
 if(!fs.existsSync(path.join(app,notes)))changes.set(notes,`# Sofia OS Android ${p.version}\n\nAtualização automática a partir da ${p.baseline_version}.\n\nConsulte o commit e o relatório da execução para as alterações e verificações deste pacote.\n\nPackage ${PACKAGE}; versionCode ${p.version_code}. Atualização por cima, sem desinstalar nem limpar dados. O backend não é reiniciado por este fluxo.\n`);
 for(const [file,text] of changes)fs.writeFileSync(path.join(app,file),text);
 return [...changes.keys()];
}
function run(command,args,root,options={}){return cp.execFileSync(command,args,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe'],...options}).trim();}
function output(p){for(const [k,v] of Object.entries(p))if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`${k}=${v}\n`);if(process.env.GITHUB_ENV){const names={version:'SOFIA_RELEASE_VERSION',version_code:'SOFIA_RELEASE_CODE',baseline_version:'SOFIA_BASELINE_VERSION',baseline_tag:'SOFIA_BASELINE_TAG'};for(const [key,name] of Object.entries(names))if(p[key]!==undefined)fs.appendFileSync(process.env.GITHUB_ENV,`${name}=${p[key]}\n`);}console.log(JSON.stringify(p));}
function prepare(root){
 if(process.env.GITHUB_REPOSITORY!==REPO||process.env.GITHUB_REF!==`refs/heads/${BRANCH}`)throw Error('Only the approved Android delivery branch may release');
 const git=(...a)=>run('git',a,root),gh=(...a)=>JSON.parse(run('gh',['api',...a],root));
 const head=git('rev-parse','HEAD'),remote=gh(`repos/${REPO}/git/ref/heads/${BRANCH}`).object.sha;
 if(remote!==head){output({release:false,reason:'Superseded by a newer complete change; the latest queued run owns delivery'});return;}
 const pages=gh(`repos/${REPO}/releases?per_page=100`,'--paginate','--slurp');if(!Array.isArray(pages)||!pages.every(Array.isArray))throw Error('Incomplete release pagination');
 const releases=pages.flat(),base=newest(releases),baselineRef=`refs/tags/${base.tag_name}`;
 const cfg=JSON.parse(fs.readFileSync(path.join(root,'SOFIA_APP/app.json'),'utf8')).expo;
 const baseline=JSON.parse(git('show',`${baselineRef}:SOFIA_APP/app.json`)).expo;
 if(baseline.version!==tagged(base.tag_name))throw Error('Published tag and manifest disagree');
 const files=git('diff','--name-only',baselineRef,'HEAD','--','SOFIA_APP').split('\n').filter(Boolean);
 const p=plan(cfg,baseline,releases,files,git('tag','--list',PREFIX+'*').split('\n'));
 if(p.release)prepareFiles(root,p);output(p);
}
function report(root){
 const p=process.env,status=p.DELIVERY_STATUS||'failure',releasing=p.DELIVERY_PLANNED==='true',published=p.DELIVERY_PUBLISHED==='success',v=p.DELIVERY_VERSION||'';
 const stages=JSON.parse(p.DELIVERY_STEPS||'{}'),failed=Object.entries(stages).filter(([,s])=>s.outcome==='failure').map(([id])=>id);
 const link=`https://github.com/${REPO}/actions/runs/${p.GITHUB_RUN_ID}`;
 let text=published&&status==='success'?`APK publicado: ${v}`:status==='failure'?`Entrega bloqueada: ${failed.join(', ')||'consulte a execução'}`:!releasing?`Sem novo APK: ${p.DELIVERY_REASON||'não há mudança de aplicativo'}`:'Entrega não publicada';
 let body=`## Sofia Android — ${text}\n\nExecução: ${link}\n`;
 if(published&&status==='success')body+=`\nAPK: https://github.com/${REPO}/releases/download/${PREFIX+v}/Sofia-OS.apk\n`;
 if(p.GITHUB_STEP_SUMMARY)fs.appendFileSync(p.GITHUB_STEP_SUMMARY,body);
 const dir=path.join(root,'SOFIA_APP/dist');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'delivery-status.json'),JSON.stringify({status,published:published&&status==='success',version:v,failed,run:link,reason:p.DELIVERY_REASON||''},null,2)+'\n');
 // Notify on actual release or failure, not on a docs-only/no-op validation.
 if(p.GITHUB_REPOSITORY===REPO&&(published||status==='failure')){
  const pulls=JSON.parse(run('gh',['api',`repos/${REPO}/pulls?state=open&head=avsord:${BRANCH}`],root));
  const pr=pulls.find(pr=>pr.head.ref===BRANCH);if(pr)try{run('gh',['api',`repos/${REPO}/issues/${pr.number}/comments`,'--method','POST','--input','-'],root,{input:JSON.stringify({body:`@avsord\n\n${body}`})});}catch{console.warn('GitHub PR notification unavailable; delivery and test results remain authoritative.');}
 }
 console.log(text);
}
module.exports={version,compare,tagged,newest,runtimeFile,plan,prepareFiles};
if(require.main===module){try{const root=path.resolve(__dirname,'../..');if(process.argv[2]==='prepare')prepare(root);else if(process.argv[2]==='report')report(root);else throw Error('Usage: delivery.cjs prepare|report');}catch(e){console.error('Delivery:',e.message);process.exitCode=1;}}
