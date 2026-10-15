import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
class InputError extends Error {constructor(message,status=400){super(message);this.status=status;}}
let mode='success',optionsSeen,urlSeen,bodySeen='';
const request=(url,options,callback)=>{
 optionsSeen=options;urlSeen=url;const req=new EventEmitter();req.write=b=>{bodySeen+=b;};req.destroy=()=>{};
 req.end=()=>queueMicrotask(()=>{
  if(mode==='network'){req.emit('error',new Error('fixture unreachable'));return;}
  const res=new EventEmitter();res.statusCode=mode==='redirect'?302:mode==='rate'?429:200;res.headers={'content-type':'application/json','x-fixture':'true'};res.resume=()=>{};callback(res);
  if(res.statusCode===200){res.emit('data',mode==='large'?Buffer.alloc(2*1024*1024+1):Buffer.from('{"ok":true}'));res.emit('end');}
 });return req;
};
const m={exports:{}};
new Function('require','module','exports',ts.transpileModule(readFileSync('lib/integrations/transport.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>n==='node:https'?{request}:n==='node:dns/promises'?{lookup:async()=>[{address:'203.0.113.25',family:4}]}:n==='../eassist/transport'?{InputError}:require(n),m,m.exports);
const external=m.exports.external;
const result=await external(new URL('https://public-fixture.example/api'),'POST',{'content-type':'application/json'},'{"value":1}');
assert.equal(urlSeen.hostname,'public-fixture.example');assert.equal(bodySeen,'{"value":1}');assert.equal(result.content,'{"ok":true}');assert.equal(result.response.status,200);
optionsSeen.lookup('public-fixture.example',{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'203.0.113.25');assert.equal(family,4);});
optionsSeen.lookup('public-fixture.example',{all:true},(error,addresses)=>{assert.equal(error,null);assert.deepEqual(addresses,[{address:'203.0.113.25',family:4}]);});
assert.equal(optionsSeen.rejectUnauthorized,undefined); // TLS default remains enabled.
assert.equal(optionsSeen.headers['user-agent'],'AIForce.Ops/1.0');
mode='redirect';await assert.rejects(()=>external(new URL('https://public-fixture.example/api'),'GET',{}),/HTTP 302/);
mode='rate';await assert.rejects(()=>external(new URL('https://public-fixture.example/api'),'GET',{}),/Rate limited/);
mode='network';await assert.rejects(()=>external(new URL('https://public-fixture.example/api'),'POST',{},'{}'),/completion is unknown/);
mode='large';await assert.rejects(()=>external(new URL('https://public-fixture.example/api'),'GET',{}),/exceeds 2 MB/);
console.log('PASS: HTTPS transport pins validated DNS while retaining the hostname/TLS defaults, sends exact bodies, rejects redirects, bounds responses and exposes rate-limit/ambiguous-write failures. Mock sockets only; no network traffic.');
