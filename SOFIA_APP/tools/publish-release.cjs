'use strict';
// Publish exactly the tested APK. Never replace an existing version or rewrite main.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),os=require('node:os');
const app=path.resolve(__dirname,'..'),root=path.resolve(app,'..');
function run(command,args,env={}){return cp.execFileSync(command,args,{cwd:root,encoding:'utf8',env:{...process.env,...env},stdio:['ignore','pipe','pipe']}).trim();}
function git(...args){return run('git',args);}
function api(...args){return JSON.parse(run('gh',['api',...args]));}
const pkg=JSON.parse(fs.readFileSync(path.join(app,'package.json'),'utf8'));
const config=JSON.parse(fs.readFileSync(path.join(app,'app.json'),'utf8')).expo;
const version=pkg.version,repo=process.env.GITHUB_REPOSITORY,tag='sofia-android-v'+version;
if(!/^\d+\.\d+\.\d+$/.test(version)||repo!=='avsord/SOFIA_OS'||config.android.package!=='com.avsord.sofiaapp'||config.version!==version)throw Error('Invalid release identity');
const source=fs.readFileSync(path.join(app,'dist/SOURCE_COMMIT.txt'),'utf8').trim();
if(source!==git('rev-parse','HEAD'))throw Error('Build source mismatch');
if(git('status','--porcelain','--','SOFIA_APP').split('\n').some(line=>line && !line.startsWith('?? SOFIA_APP/dist/')))throw Error('Uncommitted app source');
const bytes=fs.readFileSync(path.join(app,'dist/Sofia-OS.apk')),hash=crypto.createHash('sha256').update(bytes).digest('hex');
const originalHash=fs.readFileSync(path.join(app,'dist/Sofia-OS.apk.sha256'),'utf8').split(/\s+/)[0];
if(hash!==originalHash||bytes.length===0)throw Error('APK hash mismatch');
// Do not repeat 0.3.57: passing smoke tests did not prove the requested 1000 ms limit.
require('./startup-release-gate.cjs').verifyFile(path.join(app,'dist/startup-navigation-acceptance.json'),{source_sha:source,apk_sha256:hash});
// main's workflows remain unchanged in the release snapshot. The release integration
// needs contents permission only, and is not asked to create or modify workflow files.
git('fetch','--no-tags','origin','main');
const main=git('rev-parse','FETCH_HEAD'),appTree=git('rev-parse',source+':SOFIA_APP');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-release-index-'));
let tree;
try{
 const env={GIT_INDEX_FILE:path.join(temporary,'index')};
 run('git',['read-tree',main],env);
 run('git',['rm','-r','--cached','--ignore-unmatch','SOFIA_APP'],env);
 run('git',['read-tree','--prefix=SOFIA_APP/',appTree],env);
 tree=run('git',['write-tree'],env);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
git('config','user.name','Sofia build');git('config','user.email','sofia-build@users.noreply.github.com');
const snapshot=git('commit-tree',tree,'-p',main,'-m',`release: validated Android ${version}; source ${source}`);
if(git('rev-parse',snapshot+':SOFIA_APP')!==appTree||git('rev-parse',snapshot+':.github')!==git('rev-parse',main+':.github'))throw Error('Snapshot mismatch');
const existing=cp.spawnSync('gh',['release','view',tag,'--repo',repo],{cwd:root,stdio:'ignore'});
if(existing.status===0)throw Error('Release already exists; increment the version instead of replacing its binary');
git('push','origin',snapshot+':refs/heads/release/'+tag);
const notes=path.join(app,`RELEASE_${version}.md`);
const files=['Sofia-OS.apk','Sofia-OS.apk.sha256','SOURCE_COMMIT.txt'].map(x=>path.join(app,'dist',x));
run('gh',['release','create',tag,...files,'--target',snapshot,'--repo',repo,'--latest','--title',`Sofia OS Android ${version}`,'--notes-file',notes]);
const release=api(`repos/${repo}/releases/tags/${tag}`),asset=release.assets.find(a=>a.name==='Sofia-OS.apk');
if(release.draft||release.prerelease||!release.published_at||!asset||asset.state!=='uploaded'||asset.size!==bytes.length||asset.digest!=='sha256:'+hash)throw Error('Published asset verification failed');
const latest=api(`repos/${repo}/releases/latest`);
if(latest.tag_name!==tag)throw Error('Release is published but latest discovery is not aligned');
console.log('PUBLISHED',tag,asset.browser_download_url,asset.digest);
