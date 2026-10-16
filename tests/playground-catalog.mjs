import assert from 'node:assert/strict';
import {load} from './helpers/load-ts.mjs';
const actors=[],queries=[];
const agents=new Map([['alice',[{id:'agent-1',name:'Incident Helper',purpose:'Explain incident records',modelId:'gpt-4.1-mini',graph:{nodes:[],edges:[]}}]],['bob',[]]]);
const custom=new Map([['alice',[{id:'tool-1',name:'Repository Lookup',purpose:'Read repository metadata',method:'GET',summary:'Old stale summary',operations:['Stale operation'],updatedAt:'2026-10-15T10:00:00Z',analyzedAt:'2026-10-14T10:00:00Z'}]],['bob',[]]]);
const db={query:async(sql,args)=>{
 queries.push(sql);assert.ok(sql.includes('user_id=$1'));assert.deepEqual(args,['alice']);
 assert.ok(!/secret|credentials|endpoint_url|instructions/.test(sql));
 if(sql.includes('FROM agents a'))return {rows:agents.get(args[0])};
 if(sql.includes('FROM tools t'))return {rows:custom.get(args[0])};
 throw Error('Unexpected catalog SQL');
}};
let role='admin',reads=0;let connections=[];
const module=load('lib/playground-catalog.ts',{
 './playground-tools':{listPlaygroundTools:async()=>connections,playgroundConnectionSources:async()=>new Map(connections.map(c=>[c.id,{available:true}]))},
 './db':{db},'./tool-knowledge':{readToolKnowledge:async(user,admin)=>{actors.push(user);reads++;assert.equal(admin,role==='admin');return {items:[{id:'profile',name:'My profile',category:'Project tools',purpose:'Read your profile',configured:true,status:'Enabled capability',knowledge:{limits:'Own profile only'}},...(admin?[{id:'project:bound',name:'Ticket Writer',category:'Project tools',purpose:'Create incidents with approval',configured:false,status:'NULL — configure linked integration',knowledge:null}]:[])],checkedAt:new Date().toISOString()};}},
 './agent-sharing':{listAgentShares:async user=>{actors.push(user);return {shared:role==='employee'?[{id:'share-1',name:'Shared Help Desk',purpose:'Published help desk release',version:3}]:[]};}},
 './agent-flow':{agentReferences:()=>[{data:{referenceKind:'tool',referenceId:'tool-1'}},{data:{referenceKind:'tool',referenceId:'deleted'}}]},
});
const member=()=>({role,active:true,user_id:'alice',permissions:[]});
const ask=(q,m=[])=>module.playgroundCatalogReply('alice',member(),q,m);
for(role of ['admin','manager','employee','user']){
 let reply=(await ask('List my agents')).reply;assert.match(reply,/Incident Helper/);assert.doesNotMatch(reply,/Repository Lookup/);
 reply=(await ask('What does Repository Lookup do?')).reply;assert.match(reply,/Read repository metadata/);assert.match(reply,/HTTP method: GET/);assert.match(reply,/NULL/);assert.doesNotMatch(reply,/Old stale summary|Stale operation/);
 reply=(await ask('Tell me about Incident Helper')).reply;assert.match(reply,/Model: gpt-4.1-mini/);assert.match(reply,/Connected tool: Repository Lookup/);assert.match(reply,/unavailable or outside/);
 reply=(await ask('List my tools')).reply;assert.equal(reply.includes('Ticket Writer'),role==='admin');assert.doesNotMatch(reply,/### Incident Helper/);
 reply=(await ask('List my agents')).reply;assert.equal(reply.includes('Shared Help Desk'),role==='employee');
}
role='admin';
assert.match((await ask('What does Imaginary tool do?')).reply,/No matching saved items/);
assert.equal(await ask('Create agent New One'),null);assert.equal(await ask('Delete tool Repository Lookup'),null);
assert.equal(await ask('What is my request status?'),null);
assert.equal(await ask('What is my profile?'),null);
assert.equal(await ask('Show me my workplace requests'),null);
custom.get('alice').push({id:'new-tool',name:'Fresh Tool',purpose:'Freshly saved tool purpose',method:'POST',updatedAt:'2026-10-15T10:00:00Z',analyzedAt:null});
assert.match((await ask('Explain Fresh Tool')).reply,/Freshly saved tool purpose/);
custom.set('alice',custom.get('alice').filter(t=>t.id!=='new-tool'));
assert.match((await ask('Explain Fresh Tool')).reply,/No matching saved items/);
agents.get('alice').push({id:'new-agent',name:'Fresh Agent',purpose:'New specialist',modelId:'',graph:null});
assert.match((await ask('What does Fresh Agent do?')).reply,/New specialist/);
agents.set('alice',agents.get('alice').filter(a=>a.id!=='new-agent'));
assert.match((await ask('Explain Fresh Agent')).reply,/No matching saved items/);
connections=[{id:'dept-connection',source_kind:'department',reference_id:'department_search',name:'Department Search',purpose:'Find saved departments',enabled:true}];
assert.match((await ask('What does Department Search do?')).reply,/Find saved departments/);
connections=[];
const count=reads;assert.equal(await module.playgroundCatalogReply('alice',{...member(),active:false},'List my tools'),null);assert.equal(reads,count);
assert.ok(actors.every(id=>id==='alice'));assert.ok(queries.every(sql=>sql.startsWith('SELECT')));
console.log('PASS: fresh catalog discovery for every role; new/deleted agents and tools; owner filters, role shares, safe metadata, stale analysis, connected references, unknown names, inactive accounts and no writes/execution.');
