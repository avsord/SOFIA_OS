import type {Auth,Prefs} from './types';
import type {StartupSnapshot} from './startup-snapshot';

export type LocalLaunch={auth:Auth|null;prefs:Prefs;snapshot:StartupSnapshot|null};
/** The entrypoint starts disk preparation before React's first mount. Consume
 * it once; retries and later mounts must read the current account again. */
export function createLaunchPreparation(start:()=>Promise<LocalLaunch>){
 let pending:Promise<LocalLaunch>|null=null;
 const begin=()=>{let work:Promise<LocalLaunch>;try{work=start();}catch(e){work=Promise.reject(e);}void work.catch(()=>{});return work;};
 return {prime(){if(!pending)pending=begin();},take(){const work=pending;pending=null;return work||begin();}};
}
/** Disk-only launch lane: authentication, theme and existing encrypted records.
 * No requests, timers, notification inventory or offscreen view work here. */
export async function prepareLocalLaunch(
 readAuth:()=>Promise<Auth|null>,readPrefs:()=>Promise<Prefs>,
 snapshotFor:(scope:string)=>StartupSnapshot
):Promise<LocalLaunch>{
 const account=readAuth();
 const restored=account.then(async auth=>{
  if(!auth)return {auth,snapshot:null};
  const snapshot=snapshotFor(auth.profile.email);
  // Restore the already-saved profile photo alongside Home and Agenda.
  // The first real Home frame must not briefly fall back to initials.
  // Offline startup still uses only local storage: no HTTP dependency.
  const photoReady=import('./profile-photo-cloud')
   .then(({readProfilePhoto})=>import('./profile-photo-events')
    .then(({primeProfilePhoto})=>primeProfilePhoto(auth.profile.email,readProfilePhoto)))
   .catch(()=>{});
  // The native disk projection is the only work that must finish before the
  // first Home draw. ProfileAvatar already subscribes to the photo cache and
  // updates itself; waiting for a separate image decode/module import here
  // prolonged the entire S splash on slower devices.
  void photoReady;
  await snapshot.hydrateLaunch();
  console.info('SOFIA_STARTUP_CACHE_READY');
  return {auth,snapshot};
 });
 const [saved,prefs]=await Promise.all([restored,readPrefs()]);
 return {...saved,prefs};
}
