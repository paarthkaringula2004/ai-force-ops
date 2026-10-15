import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync} from 'node:fs';
function load(path,deps){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>deps[n],m,m.exports);return m.exports;}
const {updateMemberInTransaction}=load('lib/workspace-members.ts',{'./organization-security':{organizationWriteAllowed:async()=>{}},'./workspace-permissions':{permitted:p=>p.role==='admin'&&p.active},'node:crypto':{randomUUID:()=> 'fixture'}});
const changes=[],client={query:async(sql,params)=>{if(sql.includes('SELECT *'))return {rows:[{role:'admin',active:true,admin_id:'ADM-FIXTURE',version:'v1'}]};changes.push(sql);return {rows:[],rowCount:0};}};
for(const role of ['user','employee','manager'])await assert.rejects(()=>updateMemberInTransaction(client,'actor',{userId:'target',role,active:true,department:'',employeeId:'',managerId:null,permissions:[]}),e=>e.status===409&&e.message.includes('Admin role is locked'));
assert.equal(changes.some(q=>q.startsWith('UPDATE')||q.startsWith('INSERT')),false);
console.log('PASS: assigned Admin identity rejects all three demotion targets on the shared server path before any writes.');
