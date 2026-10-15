#!/usr/bin/env node
// Run on a machine with Nmap installed and access to the asset you administer.
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {isIP} from 'node:net';
const args=process.argv.slice(2);
const value=name=>{const index=args.indexOf(name);return index<0?'':args[index+1]||'';};
const target=value('--target'),ports=value('--ports')||'22,80,443,3000,3389';
if(args.includes('--help')||!target){console.log('Usage: node nmap-collector.mjs --target HOST --ports 22,80,443 [--upload] [--scope "Nmap · production"]\nFor upload, set REVIEW_CENTER_URL and REVIEW_COLLECTOR_TOKEN. Targets must be assets you own or administer. One host, up to 100 explicit TCP ports per scan.');process.exit(args.includes('--help')?0:1);}
if(!isIP(target)&&!(/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(target)))throw new Error('Provide one IP address or hostname; CIDR ranges and command flags are not accepted.');
const numbers=ports.split(',');if(!numbers.length||numbers.length>100||numbers.some(p=>!/^\d{1,5}$/.test(p)||Number(p)<1||Number(p)>65535))throw new Error('Choose up to 100 explicit TCP ports between 1 and 65535.');
const upload=args.includes('--upload'),base=process.env.REVIEW_CENTER_URL,token=process.env.REVIEW_COLLECTOR_TOKEN;
if(upload){if(!base||!token)throw new Error('Set REVIEW_CENTER_URL and REVIEW_COLLECTOR_TOKEN before uploading.');const url=new URL(base);if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Use HTTPS for remote Review Center uploads.');}
const scanArgs=['-sT','-Pn','-sV','--version-light','--max-retries','1','--host-timeout','120s','-p',[...new Set(numbers)].join(','),'-oX','-',target];
console.log(`Discovering TCP services on ${target}. No exploit scripts or remediation commands are run.`);
const xml=await new Promise((resolve,reject)=>{
 const child=spawn('nmap',scanArgs,{shell:false,windowsHide:true}),chunks=[];let size=0,stderr='';
 const timer=setTimeout(()=>{child.kill();reject(new Error('Nmap exceeded the 150-second scan limit.'));},150000);
 child.stdout.on('data',chunk=>{size+=chunk.length;if(size>5_000_000){child.kill();reject(new Error('Nmap output exceeded 5 MB. Narrow the scan.'));}else chunks.push(chunk);});
 child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-2000);});
 child.on('error',error=>{clearTimeout(timer);reject(new Error(error.code==='ENOENT'?'Nmap is not installed or is missing from PATH. Install it from https://nmap.org/download.html, then reopen your terminal.':error.message));});
 child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(new Error(`Nmap failed (${code}): ${stderr}`));else resolve(Buffer.concat(chunks));});
});
const filename=`nmap-report-${Date.now()}.xml`;await writeFile(filename,xml,{flag:'wx'});console.log(`Saved ${filename}. Import it in Review Center → Vulnerability reports.`);
if(upload){
 const endpoint=new URL('/api/service-review-center/vulnerabilities',base),headers={Authorization:`Bearer ${token}`};
 async function checked(response){const result=await response.json();if(!response.ok)throw new Error(result.error||`Upload failed (${response.status}).`);return result;}
 const form=new FormData();form.set('file',new Blob([xml]),filename);
 const preview=await checked(await fetch(endpoint,{method:'POST',headers,body:form,redirect:'error',signal:AbortSignal.timeout(30000)}));
 if(!preview.scannedAt)throw new Error('Scan timestamp missing. Import the saved XML manually.');
 await new Promise(resolve=>setTimeout(resolve,1100));
 const result=await checked(await fetch(endpoint,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'save',id:preview.id,mapping:preview.mapping,scope:value('--scope')||`Nmap · ${target}`,scannedAt:preview.scannedAt}),redirect:'error',signal:AbortSignal.timeout(60000)}));
 console.log(`Review Center updated: ${result.created} new, ${result.updated} changed, ${result.unchanged} unchanged.`);
}
