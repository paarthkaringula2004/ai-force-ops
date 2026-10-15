import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {checkRenderEnvironment} from '../scripts/render-config.mjs';

const source=readFileSync('scripts/render-start.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
async function boot(overrides={}) {
 const children=[],timers=[];
 const process=new EventEmitter();process.execPath='fixture-node';
 process.env={DATABASE_URL:'postgres://user:password@db.example.test/app',BETTER_AUTH_SECRET:'a'.repeat(32),BETTER_AUTH_URL:'https://app.example.test',OPENAI_API_KEY:'fixture',EASSIST_WORKER_TOKEN:'b'.repeat(32),MAIL_WORKER_TOKEN:'c'.repeat(32),RENDER_RUN_MIGRATIONS:'false',PORT:'10000',...overrides};
 const spawn=(executable,args,options)=>{
  const child=new EventEmitter();child.kill=signal=>{child.killed=signal;};children.push({executable,args,options,child});return child;
 };
 await runInNewContext(`(async()=>{${source}\n})()`,{dotenv:{config(){}},checkRenderEnvironment,process,spawn,resolve,console:{warn(){},error(){}},setTimeout:fn=>{const timer={fn,unref(){}};timers.push(timer);return timer;},clearTimeout:timer=>{timer.cleared=true;}});
 return {children,timers,process};
}
const bundled=await boot();
assert.equal(bundled.children.length,3,'Website, integration and mail; no unequipped security scanner');
assert.deepEqual(Array.from(bundled.children[0].args.slice(1)),['start','--hostname','0.0.0.0','--port','10000']);
assert.equal(bundled.children[1].options.env.EASSIST_APP_URL,'http://127.0.0.1:10000');
assert.equal(bundled.children[2].options.env.MAIL_WORKER_APP_URL,'http://127.0.0.1:10000');
assert.equal(bundled.children[2].options.env.BETTER_AUTH_URL,'https://app.example.test','Email links retain the public URL');
bundled.children[1].child.emit('exit',1);assert.equal(bundled.timers.length,1);
bundled.timers[0].fn();assert.equal(bundled.children.length,4);
bundled.process.emit('SIGTERM');assert.equal(bundled.children[2].child.killed,'SIGTERM');
const webOnly=await boot({RENDER_RUN_WORKERS:'false'});assert.equal(webOnly.children.length,1);
webOnly.children[0].child.emit('exit',1);assert.equal(webOnly.process.exitCode,1);
const security=await boot({RENDER_RUN_SECURITY_WORKER:'true',SECURITY_SCAN_WORKER_TOKEN:'d'.repeat(32),SECURITY_SCAN_TARGET_URL:'https://app.example.test'});assert.equal(security.children.length,4);security.process.emit('SIGTERM');
console.log('PASS Render supervisor: Render port/host, loopback worker requests, public email links, optional scanner, failed-worker restart, website failure and graceful shutdown.');
