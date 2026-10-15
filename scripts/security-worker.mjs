import 'dotenv/config';
import {tools,scanProject} from './security-scanner.mjs';
const token=process.env.SECURITY_SCAN_WORKER_TOKEN;
const origin=process.env.SECURITY_SCAN_APP_URL||process.env.BETTER_AUTH_URL;
if(!token||token.length<32||!origin||!process.env.SECURITY_SCAN_TARGET_URL)throw new Error('Configure the security worker token, application URL and approved target in the operator environment.');
const app=new URL(origin);if(app.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(app.hostname))throw new Error('Remote worker requests require HTTPS.');
let stopping=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
const pause=()=>new Promise(r=>setTimeout(r,3000));
async function request(body){
 const r=await fetch(new URL('/api/service-review-center/scans/worker',origin),{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000),redirect:'error'});
 const data=await r.json();if(!r.ok)throw new Error(data.error||`Worker HTTP ${r.status}`);return data;
}
let syncing=false;const collectorTimer=setInterval(()=>{if(stopping||syncing)return;syncing=true;void request({action:'sync-connections'}).catch(()=>{}).finally(()=>{syncing=false;});},10000);
console.log('Security worker started. Backend-managed scans; no paid AI calls.');
const paths=await tools();
if(!paths.java||!paths.zap||!paths.trivy)console.error('Scanner tools are unavailable. Run the operator setup script or configure their executable paths.');
while(!stopping){
 try{
  const {job}=await request({action:'claim',capabilities:{zap:!!paths.java&&!!paths.zap,trivy:!!paths.trivy}});
  await request({action:'sync-connections'});
  if(job){
   let phase='Starting scanners',progress=5,heartbeatFailed=false;
   const reportProgress=async(next,value)=>{phase=next;progress=value;await request({action:'progress',id:job.id,lease:job.lease,phase,progress});};
   const timer=setInterval(()=>{void reportProgress(phase,progress).catch(()=>{heartbeatFailed=true;});},30000);
   try{
    const result=await scanProject(job,paths,reportProgress);
    if(heartbeatFailed)throw new Error('Worker connection was interrupted. Please retry the scan.');
    await request({action:'complete',id:job.id,lease:job.lease,...result});
    console.log(`Scan ${job.id.slice(0,8)} complete: ${result.findings.length} observations.`);
   }catch(e){console.error(`Scan ${job.id.slice(0,8)} failed: ${e.message}`);await request({action:'fail',id:job.id,lease:job.lease,error:e.message}).catch(()=>{});}
   finally{clearInterval(timer);}
  }
 }catch{console.error('Application unavailable; scanner worker will retry.');}
 if(!stopping)await pause();
}

clearInterval(collectorTimer);
