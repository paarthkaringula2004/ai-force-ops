import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from './helpers/load-ts.mjs';
const flow={Position:{Left:'left',Right:'right',Top:'top',Bottom:'bottom'},Handle:({position,type,id})=>React.createElement('i',{'data-handle':position,'data-kind':type,'data-id':id||'default'})};
const {workflowNodeTypes}=load('app/agent-builder/_costumNodes/workflow-node-types.ts',{'@xyflow/react':flow,'@/context/WorkflowContext':{useWorkflow:()=>({})}});
const render=(actual,type)=>renderToStaticMarkup(React.createElement(workflowNodeTypes(actual)[type],{id:'fixture',type,data:{label:'Fixture'},selected:false}));
for(const type of ['AgentNode','ReferenceNode','ModelNode','MemoryNode','ToolsNode','AgentsNode']){
 const html=render(true,type);assert.equal((html.match(/data-handle=/g)||[]).length,2,type+' has exactly two connectors');
 assert.match(html,/data-handle="left"/);assert.match(html,/data-handle="right"/);assert.doesNotMatch(html,/data-handle="(?:top|bottom)"/);
}
const actualWhile=render(true,'WhileNode');assert.equal((actualWhile.match(/data-handle="right"/g)||[]).length,1);assert.match(actualWhile,/data-handle="bottom" data-kind="source" data-id="done"/);
const superTool=render(false,'ReferenceNode');assert.equal((superTool.match(/data-handle=/g)||[]).length,4);assert.match(superTool,/data-id="attachment"/);assert.match(superTool,/data-id="children"/);
assert.equal((render(false,'WhileNode').match(/data-handle="right"/g)||[]).length,2,'Super Agent While unchanged');
console.log('PASS: Actual Agent and reference boxes expose only left/right connectors; Actual While has one right Loop and bottom Done; Super Agent keeps its original connectors.');

const superAgent=render(false,'AgentNode');
assert.match(superAgent,/data-handle="right" data-kind="source" data-id="output"/);
for(const id of ['model','memory','tools'])assert.match(superAgent,new RegExp('data-handle="bottom" data-kind="source" data-id="'+id+'"'));
assert.match(superTool,/data-handle="right" data-kind="source" data-id="output"/);
console.log('PASS: Super Agent right output is uniquely named; original bottom dependency connectors remain distinct.');
