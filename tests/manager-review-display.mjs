import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const module={exports:{}};new Function('module','exports',ts.transpileModule(readFileSync('lib/manager-review-display.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports);
const {managerOverviewReply}=module.exports;
const records=[
 {recordType:'health',recordKey:'a:target:down',payload:{device:'ai-force-ops.onrender.com',category:'eassist',status:'Down'},observedAt:'2026-10-08T10:51:39Z'},
 {recordType:'health',recordKey:'b:connection-health',payload:{device:'localhost:9090',status:'Healthy'},observedAt:'2026-10-08T10:51:39Z'},
 {recordType:'metric',recordKey:'csat',payload:{label:'Demo customer satisfaction',value:90,unit:'%'},observedAt:'2026-10-08T10:33:30Z'},
 {recordType:'metric',recordKey:'financial',payload:{label:'Demo savings',value:50000,unit:'INR'},observedAt:'2026-10-08T10:33:30Z'}
];
const now=new Date('2026-10-08T10:52:00Z');
const health=managerOverviewReply('Observability',records,'',now);assert.match(health.answer,/ai-force-ops/);assert.doesNotMatch(health.answer,/50000|satisfaction/);
const down=managerOverviewReply('why its down?',records,'',now);assert.match(down.answer,/ai-force-ops/);assert.match(down.answer,/does not establish the cause/);assert.doesNotMatch(down.answer,/50000|satisfaction|localhost/);
const time=managerOverviewReply('Demo customer satisfaction: 90 % Observed 2026-10-08T10:33:30.000Z which time?',records,'',now);assert.match(time.answer,/4:03:30 pm IST/i);assert.doesNotMatch(time.answer,/50000|localhost/);
const followup=managerOverviewReply('which time?',records,'customer satisfaction',now);assert.match(followup.answer,/customer satisfaction/);assert.match(followup.answer,/4:03:30 pm IST/i);assert.doesNotMatch(followup.answer,/50000|localhost/);
const value=managerOverviewReply('Value dashboard',records,'',now);assert.match(value.answer,/demonstration values/);assert.doesNotMatch(value.answer,/ai-force-ops/);
console.log('PASS: relevant health, actual down service without invented cause, timestamp conversion to IST, contextual time follow-up, demo-labelled business values.');

for(const question of ['Helo','Hello!','hi','hey','Good morning','**Hello**','_Hello_','`Hello`']){const reply=managerOverviewReply(question,records,'',now);assert.match(reply.answer,/Hello/);assert.equal(reply.readings.length,0);assert.doesNotMatch(reply.answer,/localhost|Down|Latest observation/);}
const unknown=managerOverviewReply('something unrelated',records,'',now);assert.match(unknown.answer,/What would you like to check/);assert.equal(unknown.readings.length,0);
assert.match(health.answer,/service needs.*attention/);assert.doesNotMatch(health.answer,/localhost/);
console.log('PASS: greetings including Helo stay conversational, unknown intent asks for clarification, health overview leads with the issue instead of dumping all endpoints.');
