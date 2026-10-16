import {randomUUID} from 'node:crypto';
import {db} from './db';
import {InputError} from './eassist/transport';
import {parseRecipientIds} from './agent-sharing';
import {studioGraph} from './agent-studio-graph';
import type {WorkflowGraph,WorkflowNodeData} from '@/types/workflow';

// Copy configuration, never arbitrary metadata or credential-bearing fields.
const fields=new Set(['label','bgColor','instructions','modelId','temperature','topP','frequencyPenalty','presencePenalty','maxOutputTokens','historyMessages','includeHistory','output','schema','context','ifCondition','elseCondition','condition','conditionOperator','conditionSource','method','includeApiKey','apiKeyLocation','apiKeyName','apiKeyPrefix','approvalPrompt','maxIterations','message','workflowMode','referenceKind','referenceId','description']);
export function copyGraph(graph:WorkflowGraph,ids:Map<string,string>):WorkflowGraph {
 return {
  nodes:graph.nodes.map(node=>{
   const data=Object.fromEntries(Object.entries(node.data).filter(([key,value])=>fields.has(key)&&['string','number','boolean'].includes(typeof value))) as WorkflowNodeData;
   if(node.type==='ApiNode'){data.url='';data.bodyParams='';data.apiKeyPrefix='';data.apiKeyConfigured=false;}
   if(node.type==='ReferenceNode'){
    if(data.referenceKind==='agent'){
     const target=ids.get(String(data.referenceId));
     if(!target)throw new InputError('A connected specialist could not be copied.',409);
     data.referenceId=target;
    }else if(data.referenceKind!=='builtin'){
     data.referenceId='';data.description='Reconnect this private tool or knowledge source from your own library.';
    }
   }
   return {id:node.id,type:node.type,position:{x:node.position.x,y:node.position.y},data};
  }),
  edges:graph.edges.map(edge=>({id:edge.id,source:edge.source,target:edge.target,sourceHandle:edge.sourceHandle,targetHandle:edge.targetHandle,type:edge.type})),
 };
}

export async function sendAgentCopies(sender:string,agentId:string,recipientsInput:unknown,requestId:unknown){
 const recipients=parseRecipientIds(recipientsInput).sort();
 if(!recipients.length||recipients.length>10||recipients.includes(sender))throw new InputError('Enter 1–10 other User account IDs.');
 if(typeof requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId))throw new InputError('Invalid send request. Reopen the dialog and try again.');
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  // Serialize retries before checking the receipt, so network retries never duplicate agents.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[sender+':'+requestId]);
  const members=(await client.query('SELECT user_id,role,active FROM workspace_members WHERE user_id=ANY($1::text[]) ORDER BY user_id FOR SHARE',[[sender,...recipients]])).rows;
  if(members.length!==recipients.length+1||members.some(m=>!m.active||m.role!=='user'))throw new InputError('Only active User accounts can send and receive editable copies. Check the user_id values.',403);
  const previous=(await client.query('SELECT source_agent_id,recipient_ids,result FROM user_agent_copy_receipts WHERE sender_id=$1 AND request_id=$2',[sender,requestId])).rows[0];
  if(previous){
   if(previous.source_agent_id!==agentId||JSON.stringify(previous.recipient_ids)!==JSON.stringify(recipients))throw new InputError('This send request was already used for different recipients.',409);
   await client.query('COMMIT');return previous.result;
  }
  const sources=new Map<string,{name:string;purpose:string;model_id:string;instructions:string;graph:WorkflowGraph}>();
  async function collect(id:string){
   if(sources.has(id))return;
   if(sources.size>=30)throw new InputError('An agent copy can contain up to 30 connected specialists.');
   const row=(await client.query('SELECT a.name,a.purpose,a.model_id,a.instructions,w.graph FROM agents a LEFT JOIN agent_workflows w ON w.user_id=a.user_id AND w.agent_id=a.id WHERE a.id=$1 AND a.user_id=$2 AND a.deleted_at IS NULL FOR SHARE OF a',[id,sender])).rows[0];
   if(!row)throw new InputError('Only agents and specialists you own can be copied.',404);
   row.graph??=studioGraph(row.name,row.model_id,row.instructions);
   if(!Array.isArray(row.graph.nodes)||!Array.isArray(row.graph.edges)||row.graph.nodes.length>500||row.graph.edges.length>1000)throw new InputError('This workflow exceeds the copy limit.');
   sources.set(id,row);
   for(const node of row.graph.nodes)if(node.type==='ReferenceNode'&&node.data.referenceKind==='agent')await collect(String(node.data.referenceId));
  }
  await collect(agentId);
  if(Buffer.byteLength(JSON.stringify([...sources.values()]))>3_000_000)throw new InputError('This agent bundle is too large to send.');
  const copies=[];
  for(const recipient of recipients){
   const ids=new Map([...sources.keys()].map(id=>[id,randomUUID()]));
   for(const [source,row] of sources){
    const id=ids.get(source)!;
    await client.query('INSERT INTO agents(id,user_id,name,purpose,model_id,instructions) VALUES($1,$2,$3,$4,$5,$6)',[id,recipient,row.name,row.purpose,row.model_id,row.instructions]);
    await client.query('INSERT INTO agent_workflows(user_id,agent_id,graph) VALUES($1,$2,$3::jsonb)',[recipient,id,JSON.stringify(copyGraph(row.graph,ids))]);
   }
   copies.push({recipientId:recipient,agentId:ids.get(agentId)});
  }
  const result={copies,agentsPerRecipient:sources.size};
  await client.query('INSERT INTO user_agent_copy_receipts(sender_id,request_id,source_agent_id,recipient_ids,result) VALUES($1,$2,$3,$4,$5)',[sender,requestId,agentId,JSON.stringify(recipients),JSON.stringify(result)]);
  await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
