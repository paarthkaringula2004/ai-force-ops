import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import pg from 'pg';
const require=createRequire(import.meta.url);
function load(path,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>n in deps?deps[n]:require(n),m,m.exports);return m.exports;}
const knowledge=load('lib/epace/knowledge.ts'),types=load('lib/epace/types.ts');
for(const q of ['Can you tell whats in my data?','What is in my data?','What can you tell me about my data?','Summarize my documents','Summarize our docs','What files do I have?','Give me an overview of our knowledge','Describe all my files','Which documents are available?'])assert.equal(knowledge.isKnowledgeOverview(q),true,q);
for(const q of ['Hello','What is our uptime?','What does my data say about salary?','What is in List Of Acceptable Documents.pdf?','Explain the eligibility requirements'])assert.equal(knowledge.isKnowledgeOverview(q),false,q);
assert.equal(knowledge.groupedSources([{id:'passage1',documentId:'document1',name:'Same.pdf',content:'one',score:1},{id:'passage2',documentId:'document2',name:'Same.pdf',content:'two',score:1}]).length,2,'Different files with the same name remain distinct');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),c=await pool.connect();
const db={query:(sql,args)=>c.query(sql,args)};
const store=load('lib/epace/store.ts',{'@/lib/db':{db},'./types':types});
const engine=load('lib/epace/engine.ts',{'@/lib/model-pricing':{},openai:{__esModule:true,default:class{embeddings={create(){throw new Error('Overview/Keyword retrieval must not use embeddings');}}}},'./runtime':{checkTokenAllowance:async()=>{}},'@/lib/model-usage':{},'@/lib/db':{db},'./store':store,'./types':types,'./knowledge':knowledge});
const oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture';
try{
 await c.query('BEGIN');
 for(const role of ['admin','manager','employee']){
  const user=randomUUID(),other=randomUUID(),pid=randomUUID(),otherPid=randomUUID();
  for(const id of [user,other])await c.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,'Knowledge fixture '+role,id+'@example.invalid']);
  await c.query('UPDATE workspace_members SET role=$2 WHERE user_id=$1',[user,role]);
  for(const [id,owner] of [[pid,user],[otherPid,other]])await c.query('INSERT INTO epace_projects(id,user_id,name,settings) VALUES($1,$2,$3,$4)',[id,owner,'Overview fixture',JSON.stringify({...types.defaultSettings,retrieval:'Keyword',model:'gpt-4o-mini'})]);
  const docs=[];
  for(const [name,body] of [['Acceptable Documents.pdf','Identity proof requires a name and photograph. Address evidence is also accepted.'],['Joining Guide.txt','Onboarding includes orientation and verified employment documents.']]){
   const id=randomUUID();docs.push(id);await c.query("INSERT INTO epace_records(id,user_id,project_id,kind,data) VALUES($1,$2,$3,'document',$4)",[id,user,pid,JSON.stringify({name,content:body})]);
   for(let ordinal=0;ordinal<5;ordinal++)await c.query('INSERT INTO epace_chunks(id,document_id,user_id,project_id,ordinal,content) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,user,pid,ordinal,body+' Passage '+ordinal]);
  }
  const foreign=randomUUID();await c.query("INSERT INTO epace_records(id,user_id,project_id,kind,data) VALUES($1,$2,$3,'document',$4)",[foreign,other,otherPid,JSON.stringify({name:'Private other account.txt',content:'PRIVATE_ACCOUNT_VALUE'})]);await c.query('INSERT INTO epace_chunks(id,document_id,user_id,project_id,ordinal,content) VALUES($1,$2,$3,$4,0,$5)',[randomUUID(),foreign,other,otherPid,'PRIVATE_ACCOUNT_VALUE']);
  const p=await store.project(user,pid),spans=[];
  const sources=await engine.retrieve(user,p,'Can you tell whats in my data?',spans);assert.equal(sources.length,2);assert.deepEqual(new Set(sources.map(s=>s.documentId)),new Set(docs));assert.ok(sources.every(s=>s.content.includes('passage 1')&&s.content.includes('passage 3')&&s.content.includes('passage 5')));assert.ok(!JSON.stringify(sources).includes('PRIVATE_ACCOUNT_VALUE'));
  assert.match(spans[0].name,/overview/);
  const specific=await engine.retrieve(user,p,'Identity proof',[]);assert.ok(specific.length>0);assert.ok(specific.every(s=>s.documentId===docs[0]));
  const filename=await engine.retrieve(user,p,'Joining Guide',[]);assert.ok(filename.length>0);assert.ok(filename.every(s=>s.documentId===docs[1]));
  assert.equal((await engine.retrieve(user,p,'unrelatedzz astronomyzz',[])).length,0);
  const grouped=knowledge.groupedSources(specific);assert.equal(grouped.length,1);assert.deepEqual(grouped[0].references,specific.map((_,i)=>i+1));assert.equal(grouped[0].source.documentId,docs[0]);
  await assert.rejects(store.project(other,pid),/Project not found/);
 }
 console.log('PASS: Admin/Manager/Employee get grounded overview excerpts without keyword overlap, specific and filename searches still work, unrelated questions get no evidence, duplicate document citations are grouped without renumbering, account/project isolation preserved. Database fixtures roll back.');
}finally{await c.query('ROLLBACK');c.release();await pool.end();if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
