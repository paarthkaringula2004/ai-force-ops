// Bounded active XSS checks against this project's public localhost pages.
// No credentials, authenticated sessions, form submissions or external targets.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {DOMParser} from '@xmldom/xmldom';
import {tools} from '../scripts/security-scanner.mjs';
const origin='http://localhost:3000';
const pathsToCheck=['/','/sign-in','/sign-up'];
const require=createRequire(import.meta.url),renderResults=[];
// Exercise the actual Playground JSX renderer rather than a separate lookalike.
const source=await readFile('app/dashboard/_components/PlaygroundView.tsx','utf8');
const ast=ts.createSourceFile('PlaygroundView.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let markdownNode;
function walk(node){if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='ReactMarkdown'&&!markdownNode)markdownNode=node;ts.forEachChild(node,walk);}
walk(ast);assert.ok(markdownNode,'Playground Markdown renderer was not found.');
const jsx=markdownNode.getText(ast);
const compiled=ts.transpileModule(`export function render(item){return ${jsx};}`,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const bundle={exports:{}};
new Function('require','module','exports','ReactMarkdown','remarkGfm',compiled)(require,bundle,bundle.exports,ReactMarkdown,remarkGfm);
const payloads=[
 {name:'script element',text:'<script>window.__xssTest=1</script>'},
 {name:'image event handler',text:'<img src=x onerror="window.__xssTest=1">'},
 {name:'SVG event handler',text:'<svg onload="window.__xssTest=1"></svg>'},
 {name:'JavaScript Markdown link',text:'[Click](javascript:alert(1))'},
 {name:'HTML data URL link',text:'[Click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'},
 {name:'iframe executable content',text:'<iframe srcdoc="<script>window.__xssTest=1</script>"></iframe>'}
];
for(const p of payloads){
 const html=renderToStaticMarkup(bundle.exports.render({content:p.text}));
 const document=new DOMParser().parseFromString('<div>'+html+'</div>','text/html');
 const elements=Array.from(document.getElementsByTagName('*'));
 assert.ok(!elements.some(e=>['script','iframe','svg'].includes(e.tagName.toLowerCase())),`${p.name}: executable element`);
 for(const e of elements)for(const attr of Array.from(e.attributes)){
  assert.ok(!/^on/i.test(attr.name),`${p.name}: event attribute`);
  if(['href','src'].includes(attr.name))assert.doesNotMatch(attr.value,/^(?:javascript:|data:text\/html)/i,`${p.name}: executable URL`);
 }
 const userHtml=renderToStaticMarkup(React.createElement('div',null,p.text));
 assert.doesNotMatch(userHtml,/<(?:script|iframe|svg|img)\b/i);
 renderResults.push({payload:p.name,assistantRenderer:'blocked executable markup/URL',userText:'escaped'});
}
console.log(`PASS: ${renderResults.length} XSS payloads in the actual Playground Markdown renderer and React user-text output.`);
const bin=await tools();assert.ok(bin.java&&bin.zap,'Install the existing Java/ZAP tools first.');
const ready=await fetch(origin,{redirect:'manual',signal:AbortSignal.timeout(20000)});assert.equal(ready.status,200,'Start npm run dev on localhost:3000 first.');
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const root=resolve('.security-runs');await mkdir(root,{recursive:true});const profile=await mkdtemp(join(root,'project-xss-'));
const key=randomBytes(32).toString('hex'),wait=ms=>new Promise(r=>setTimeout(r,ms));
const zap=spawn(bin.java,['-Xmx512m','-jar',bin.zap,'-daemon','-silent','-host','127.0.0.1','-port',String(port),'-dir',profile,'-config',`api.key=${key}`,'-config','api.addrs.addr.name=127.0.0.1','-config','api.addrs.addr.regex=false','-config','autoupdate.checkOnStart=false'],{cwd:dirname(bin.zap),shell:false,windowsHide:true,stdio:'ignore'});
let startupError=false;zap.on('error',()=>{startupError=true;});
const api=async(group,kind,action,params={})=>{const url=new URL(`http://127.0.0.1:${port}/JSON/${group}/${kind}/${action}/`);url.searchParams.set('apikey',key);for(const[k,v]of Object.entries(params))url.searchParams.set(k,String(v));const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});const b=await r.json();if(!r.ok||b.code)throw new Error(`ZAP ${action}: ${b.code||r.status}`);return b;};
try{
 let version;for(let i=0;i<90;i++){if(startupError||zap.exitCode!==null)throw new Error('ZAP stopped.');try{version=(await api('core','view','version')).version;break;}catch{await wait(1000);}}
 assert.ok(version,'ZAP did not start.');await api('core','action','newSession',{overwrite:true});
 await api('ascan','action','addScanPolicy',{scanPolicyName:'Project reflected XSS only'});
 await api('ascan','action','disableAllScanners',{scanPolicyName:'Project reflected XSS only'});
 await api('ascan','action','enableScanners',{ids:'40012',scanPolicyName:'Project reflected XSS only'});
 // Avoid destructive/POST vectors; scope is seeded public GET query parameters only.
 await api('ascan','action','setOptionThreadPerHost',{Integer:1});
 const checks=[];
 for(const path of pathsToCheck){
  const url=origin+path+'?xss_test=AIForceXssCanary';assert.equal(new URL(url).origin,origin);
  const initial=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(initial.status!==200){checks.push({path,status:'not_tested',httpStatus:initial.status});continue;}
  await api('core','action','accessUrl',{url,followRedirects:false});
  let recorded=false;for(let i=0;i<20;i++){if(((await api('core','view','urls',{baseurl:origin})).urls||[]).includes(url)){recorded=true;break;}await wait(250);}
  assert.ok(recorded,`${path}: request absent from scanner tree.`);
  const id=(await api('ascan','action','scan',{url,recurse:false,inScopeOnly:false,scanPolicyName:'Project reflected XSS only'})).scan;
  console.log(`Testing actual project ${path} with reflected-XSS rule 40012.`);
  let done=false;for(let i=0;i<120;i++){if(Number((await api('ascan','view','status',{scanId:id})).status)===100){done=true;break;}await wait(1000);}
  assert.ok(done,`${path}: scan exceeded its time limit.`);
  const alerts=((await api('core','view','alerts',{baseurl:origin+path,start:0,count:1000})).alerts||[]).filter(a=>String(a.pluginId)==='40012'&&new URL(a.url).pathname===path);
  checks.push({path,status:'completed',rule:'40012',xssFindings:alerts.length,findings:alerts.map(a=>({title:a.alert,risk:a.risk,parameter:a.param,cwe:a.cweid,confidence:a.confidence}))});
  console.log(`${path}: ${alerts.length} reflected-XSS findings.`);
 }
 const report={checkedAt:new Date().toISOString(),target:origin,zapVersion:version,renderChecks:renderResults,publicPageChecks:checks,limits:['Only three public localhost GET pages and their xss_test query parameter were actively checked.','No authenticated workflows, form submissions, stored-XSS or browser DOM-XSS scan.','Rendering checks exercise the actual Playground server-rendered Markdown output, not all interactive application components.','No credentials or existing user data were supplied. Zero findings is not proof of an XSS-free application.']};
 await mkdir('docs/verification',{recursive:true});await writeFile('docs/verification/project-xss.json',JSON.stringify(report,null,2));
 console.log('Project XSS evidence saved to docs/verification/project-xss.json.');
 assert.equal(checks.filter(c=>c.status==='completed').length,pathsToCheck.length,'Some public pages were not tested.');
 assert.equal(checks.reduce((n,c)=>n+(c.xssFindings||0),0),0,'Reflected-XSS finding requires review.');
}finally{zap.kill();await new Promise(r=>{if(zap.exitCode!==null)return r();zap.once('exit',r);setTimeout(r,5000);});}
