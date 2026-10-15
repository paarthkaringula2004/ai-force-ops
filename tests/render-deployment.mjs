import '../scripts/load-env.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {checkRenderEnvironment} from '../scripts/render-config.mjs';

const valid = {DATABASE_URL:'postgresql://user:password@db.example.test/app',BETTER_AUTH_SECRET:'a'.repeat(32),BETTER_AUTH_URL:'https://app.example.test',OPENAI_API_KEY:'test-key',EASSIST_WORKER_TOKEN:'b'.repeat(32),MAIL_WORKER_TOKEN:'c'.repeat(32)};
assert.deepEqual(checkRenderEnvironment(valid).errors,[]);
for(const edit of [{BETTER_AUTH_URL:'http://localhost:3000'},{BETTER_AUTH_URL:'https://localhost'},{DATABASE_URL:'postgres://user:password@localhost/app'},{RENDER_RUN_WORKERS:'yes'},{MAIL_WORKER_TOKEN:'short'},{SMTP_USER:'test@example.test',SMTP_PASS:'secret',MAIL_ENCRYPTION_KEY:'invalid'}]) assert.ok(checkRenderEnvironment({...valid,...edit}).errors.length);
assert.deepEqual(checkRenderEnvironment({...valid,RENDER_RUN_WORKERS:'false',MAIL_WORKER_TOKEN:''}).errors,[]);
const envText=await readFile('.env','utf8');
assert.ok(!/^\w+=.*localhost/m.test(envText),'Render import must not contain laptop URLs');
console.log('PASS Render configuration rejects invalid URLs, missing worker secrets, invalid encryption keys and malformed switches.');

const schema='render_test_'+randomUUID().replaceAll('-','');
const control=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const url=new URL(process.env.DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema}`);
const env={...process.env,RENDER:'true',DATABASE_URL:url.toString()};
async function run(file){
 const child=spawn(process.execPath,[file],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
 let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk;});
 const timer=setTimeout(()=>child.kill('SIGTERM'),600000);
 try{await new Promise((ok,fail)=>{child.on('error',fail);child.on('exit',code=>code===0?ok():fail(new Error(`${file} failed: ${output.slice(-2500)}`)));});}finally{clearTimeout(timer);}
}
try{
 await control.query(`CREATE SCHEMA "${schema}"`);
 await run('scripts/auth-migrate.mjs');
 await run('scripts/migrate.mjs');
 await run('scripts/auth-migrate.mjs');
 await run('scripts/migrate.mjs');
 const check=new pg.Pool({connectionString:url.toString(),max:1});
 try{
  for(const table of ['user','session','account','verification','workspace_members','mail_outbox','payment_orders']) assert.ok((await check.query('SELECT to_regclass($1) AS name',[table])).rows[0].name,`${table} should exist`);
  const applied=(await check.query('SELECT count(*) AS n FROM aiforce_schema_migrations')).rows[0].n;
  console.log(`PASS fresh PostgreSQL schema: authentication plus ${applied} application migrations, repeated safely without changing user data.`);
 }finally{await check.end();}
}finally{
 // Only this generated, disposable schema is removed, never the application schema.
 assert.match(schema,/^render_test_[a-f0-9]{32}$/);
 await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
 await control.end();
}
