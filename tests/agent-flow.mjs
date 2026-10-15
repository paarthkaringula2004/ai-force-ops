import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>n in deps?deps[n]:require(n),m,m.exports);return m.exports;}
class InputError extends Error{constructor(message,status){super(message);this.status=status;}}
const graphs=load('lib/agent-studio-graph.ts'),flow=load('lib/agent-flow.ts',{'./eassist/transport':{InputError},'./agent-studio-graph':graphs});
const node=(id,type,data={})=>({id,type,position:{x:0,y:0},data:{label:id,...data}});
const graph={nodes:[node('start','StartNode',{workflowMode:'actual'}),node('branch','IfElseNode',{conditionSource:'message',ifCondition:'urgent'}),node('a','AgentNode'),node('b','AgentNode'),node('end','EndNode'),node('unused','ApiNode')],edges:[{id:'s',source:'start',target:'branch'},{id:'if',source:'branch',sourceHandle:'if',target:'a'},{id:'else',source:'branch',sourceHandle:'else',target:'b'},...['a','b'].map(id=>({id,source:id,target:'end'}))]};
for(const [request,expected] of [['URGENT request','a'],['ordinary request','b']]){const calls=[],branches=[];const answer=await flow.executeAgentFlow(graph,request,async(node,previous)=>{calls.push(node.id);assert.equal(previous,request);return {output:node.id};},(_,branch)=>branches.push(branch));assert.equal(answer,expected);assert.deepEqual(calls,[expected]);assert.equal(branches[0],expected==='a'?'if':'else');}
const broken=structuredClone(graph);broken.edges.pop();broken.edges.push({id:'cycle',source:'b',target:'branch'});assert.throws(()=>flow.validateAgentFlow(broken),/cycle/);
const missing=structuredClone(graph);missing.edges=missing.edges.filter(e=>e.id!=='else');assert.throws(()=>flow.validateAgentFlow(missing),/both If and Else/);
const fanout=structuredClone(graph);fanout.edges.push({id:'extra',source:'a',target:'b'});assert.throws(()=>flow.validateAgentFlow(fanout),/branch/);
const invalid=structuredClone(graph);invalid.nodes[1].data.conditionOperator='eval';assert.throws(()=>flow.validateAgentFlow(invalid),/supported/);
const stop=await flow.executeAgentFlow(graph,'urgent',async()=>({output:'approval pending',stop:true}));assert.equal(stop,'approval pending');
assert.equal(flow.isActualAgent(graphs.studioGraph('Existing Admin')),false);
assert.ok(!flow.validateAgentFlow(graph).has('unused'));
const ref=node('reference','ReferenceNode',{referenceKind:'builtin',referenceId:'profile'});graph.nodes.push(ref);graph.edges.push({id:'ref',source:'b',sourceHandle:'tools',target:'reference'});assert.deepEqual(flow.agentReferences(graph).map(n=>n.id),['reference']);
console.log('PASS: actual-agent routing, both branches, disconnected nodes, cycles, missing branches, fan-out rejection, invalid operators, approval stop and existing Super Agent mode.');

const loopGraph={nodes:[node('start','StartNode',{workflowMode:'actual'}),node('loop','WhileNode',{condition:'repeat',maxIterations:3}),node('body','AgentNode'),node('end','EndNode')],edges:[{id:'s',source:'start',target:'loop'},{id:'body',source:'loop',sourceHandle:'body',target:'body'},{id:'done',source:'loop',sourceHandle:'done',target:'end'},{id:'return',source:'body',target:'loop'}]};
let iterations=0;assert.equal(await flow.executeAgentFlow(loopGraph,'repeat',async()=>({output:++iterations===2?'finished':'repeat'})),'finished');assert.equal(iterations,2);
await assert.rejects(()=>flow.executeAgentFlow(loopGraph,'repeat',async()=>({output:'repeat'})),/maximum iterations/);
const review={nodes:[node('start','StartNode',{workflowMode:'actual'}),node('review','UserApprovalNode'),node('yes','EndNode',{message:'approved'}),node('no','EndNode',{message:'rejected'})],edges:[{id:'s',source:'start',target:'review'},{id:'a',source:'review',sourceHandle:'approve',target:'yes'},{id:'r',source:'review',sourceHandle:'reject',target:'no'}]};
let paused;assert.equal(await flow.executeAgentFlow(review,'request',async(_,output,state)=>{paused=state;return {output:'review needed',stop:true};}),'review needed');
assert.equal(await flow.executeAgentFlow(review,'request',async()=>{throw Error('Cannot repeat review');},undefined,{...paused,id:'yes'}),'approved');
assert.equal(await flow.executeAgentFlow(review,'request',async()=>{throw Error('Cannot repeat review');},undefined,{...paused,id:'no'}),'rejected');
console.log('PASS: While repeats, exits, enforces limits and approval resumes either branch without rerunning prior steps.');
