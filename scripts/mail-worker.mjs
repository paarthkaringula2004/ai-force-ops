import './load-env.mjs';
const secret=process.env.MAIL_WORKER_TOKEN,origin=process.env.MAIL_WORKER_APP_URL||process.env.BETTER_AUTH_URL||'http://localhost:3000';
if(!secret||secret.length<32)throw new Error('Configure MAIL_WORKER_TOKEN before starting the mail worker.');
let stopped=false;process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
console.log('Transactional mail worker started.');
while(!stopped){try{const r=await fetch(new URL('/api/mail-worker',origin),{method:'POST',headers:{Authorization:`Bearer ${secret}`},redirect:'error',signal:AbortSignal.timeout(70000)});if(!r.ok)console.error(`Mail worker: HTTP ${r.status}`);}catch{console.error('Mail worker: application unavailable; retrying.');}if(!stopped)await new Promise(resolve=>setTimeout(resolve,3000));}
