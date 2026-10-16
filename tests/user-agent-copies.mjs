import '../scripts/load-env.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {load} from './helpers/load-ts.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),c=await pool.connect();
const db={query:(...args)=>c.query(...args),connect:async()=>({query:(sql,args)=>c.query(sql==='BEGIN'?'SAVEPOINT copy_test':sql==='COMMIT'?'RELEASE SAVEPOINT copy_test':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT copy_test':sql,args),release(){}})};
const copies=load('lib/agent-copies.ts',{'./db':{db}}),{studioGraph}=load('lib/agent-studio-graph.ts');
try{
 await c.query('BEGIN');
 const ids={};for(const [name,role]of [['sender','user'],['friend','user'],['friend2','user'],['manager','manager'],['employee','employee']]){
  const id=ids[name]=randomUUID();await c.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,'Copy fixture',id+'@example.invalid']);
  await c.query('UPDATE workspace_members SET role=$2,active=true WHERE user_id=$1',[id,role]);
 }
 const root=randomUUID(),child=randomUUID(),foreign=randomUUID();
 const graph=studioGraph('Copy fixture');
 graph.nodes.push({id:'specialist',type:'ReferenceNode',position:{x:1,y:2},data:{label:'Specialist',referenceKind:'agent',referenceId:child}},
 {id:'private',type:'ReferenceNode',position:{x:2,y:3},data:{label:'Private',referenceKind:'tool',referenceId:'sender-private-tool',apiKey:'SECRET',settings:{token:'SECRET'}}},
 {id:'api',type:'ApiNode',position:{x:3,y:4},data:{label:'API',url:'https://SECRET.example/?token=SECRET',bodyParams:'SECRET',apiKeyDraft:'SECRET',apiKeyPrefix:'SECRET',headers:{Authorization:'SECRET'}}});
 graph.edges.push({id:'specialist-edge',source:'agents',target:'specialist',sourceHandle:'output',targetHandle:'input'});
 for(const [id,owner,g]of [[root,ids.sender,graph],[child,ids.sender,studioGraph('Child')],[foreign,ids.friend,studioGraph('Foreign')]]){
  await c.query("INSERT INTO agents(id,user_id,name,model_id,instructions) VALUES($1,$2,'Copy fixture','gpt-4.1-mini','Task instructions')",[id,owner]);
  await c.query('INSERT INTO agent_workflows(user_id,agent_id,graph) VALUES($1,$2,$3)',[owner,id,JSON.stringify(g)]);
 }
 await c.query("INSERT INTO agent_api_credentials(user_id,agent_id,node_id,encrypted_value) VALUES($1,$2,'api','SECRET')",[ids.sender,root]);
 const send=(recipients,request=randomUUID(),agent=root,sender=ids.sender)=>copies.sendAgentCopies(sender,agent,recipients,request);
 for(const recipient of [ids.manager,ids.employee,randomUUID()])await assert.rejects(()=>send([recipient]),e=>e.status===403);
 await assert.rejects(()=>send([ids.sender]),e=>e.status===400);
 await assert.rejects(()=>send([],randomUUID()),e=>e.status===400);
 await assert.rejects(()=>send(['bad id']),e=>e.status===400);
 await assert.rejects(()=>send([ids.friend],randomUUID(),foreign),e=>e.status===404);
 await assert.rejects(()=>send([ids.friend],randomUUID(),root,ids.manager),e=>e.status===403);
 await c.query('UPDATE workspace_members SET active=false WHERE user_id=$1',[ids.friend]);await assert.rejects(()=>send([ids.friend]),e=>e.status===403);await c.query('UPDATE workspace_members SET active=true WHERE user_id=$1',[ids.friend]);
 const request=randomUUID(),result=await send([ids.friend,ids.friend2],request);
 assert.equal(result.agentsPerRecipient,2);assert.equal(result.copies.length,2);
 assert.deepEqual(await send([ids.friend2,ids.friend],request),result,'retry must return the same copies');
 await assert.rejects(()=>send([ids.friend],request),e=>e.status===409);
 for(const {recipientId,agentId}of result.copies){
  const row=(await c.query('SELECT a.instructions,w.graph FROM agents a JOIN agent_workflows w ON w.agent_id=a.id AND w.user_id=a.user_id WHERE a.id=$1 AND a.user_id=$2',[agentId,recipientId])).rows[0];
  assert.equal(row.instructions,'Task instructions');assert.equal(JSON.stringify(row.graph).includes('SECRET'),false);assert.equal(JSON.stringify(row.graph).includes('sender-private-tool'),false);
  const ref=row.graph.nodes.find(n=>n.id==='specialist');assert.notEqual(ref.data.referenceId,child);
  assert.equal((await c.query('SELECT 1 FROM agents WHERE id=$1 AND user_id=$2',[ref.data.referenceId,recipientId])).rowCount,1);
  assert.equal((await c.query('SELECT 1 FROM agent_api_credentials WHERE user_id=$1 AND agent_id=$2',[recipientId,agentId])).rowCount,0);
  assert.deepEqual(row.graph.edges,graph.edges);
  await c.query("UPDATE agents SET name='Recipient edited' WHERE id=$1 AND user_id=$2",[agentId,recipientId]);
 }
 assert.equal((await c.query('SELECT name FROM agents WHERE id=$1 AND user_id=$2',[root,ids.sender])).rows[0].name,'Copy fixture');
 await c.query('DELETE FROM agents WHERE id=$1 AND user_id=$2',[root,ids.sender]);
 for(const copy of result.copies)assert.equal((await c.query('SELECT name FROM agents WHERE id=$1 AND user_id=$2',[copy.agentId,copy.recipientId])).rows[0].name,'Recipient edited');
 await c.query('DELETE FROM agents WHERE id=$1 AND user_id=$2',[result.copies[0].agentId,ids.friend]);
 assert.equal((await c.query('SELECT 1 FROM agents WHERE id=$1 AND user_id=$2',[result.copies[1].agentId,ids.friend2])).rowCount,1);
 console.log('PASS: specific active Users only, ownership, atomic specialist copies, secret/API/private reference removal, handle preservation, idempotent retries, recipient editing/deleting independently of sender and other recipients. All fixtures rolled back; no external calls.');
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
