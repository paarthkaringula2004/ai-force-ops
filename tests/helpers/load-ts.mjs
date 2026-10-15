import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);

// Load the real TypeScript dependency graph. Fixtures may override individual
// dependencies, but missing fixture mappings must not masquerade as app errors.
export function load(path,dependencies={}){
 const cache=new Map();
 function visit(file){
  const full=resolve(file);
  if(cache.has(full))return cache.get(full).exports;
  const loaded={exports:{}};cache.set(full,loaded);
  if(full.endsWith('.json')){loaded.exports=JSON.parse(readFileSync(full,'utf8'));return loaded.exports;}
  const code=ts.transpileModule(readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','module','exports',code)(name=>{
   if(Object.hasOwn(dependencies,name))return dependencies[name];
   if(name==='server-only')return {};
   if(name.startsWith('.')||name.startsWith('@/')){
    let next=name.startsWith('@/')?resolve(name.slice(2)):resolve(dirname(full),name);
    if(!existsSync(next))next+=existsSync(next+'.ts')?'.ts':'.tsx';
    return visit(next);
   }
   return require(name);
  },loaded,loaded.exports);
  return loaded.exports;
 }
 return visit(path);
}
