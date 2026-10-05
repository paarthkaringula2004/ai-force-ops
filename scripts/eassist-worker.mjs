import 'dotenv/config';
const token=process.env.EASSIST_WORKER_TOKEN;
if(!token||token.length<32)throw new Error('Set EASSIST_WORKER_TOKEN to a random secret of at least 32 characters.');
const origin=process.env.EASSIST_APP_URL||process.env.BETTER_AUTH_URL;
if(!origin)throw new Error('Set EASSIST_APP_URL to the application URL.');
let stopped=false;
process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
console.log('eAssist integration worker started.');
while(!stopped){
  try{const response=await fetch(new URL('/api/eassist/worker',origin),{method:'POST',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(120000),redirect:'error'});if(!response.ok)console.error(`Worker request failed: HTTP ${response.status}`);}
  catch{console.error('Application unavailable; integration worker will retry.');}
  if(!stopped)await new Promise(resolve=>setTimeout(resolve,2000));
}
