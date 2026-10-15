import {randomUUID} from 'node:crypto';import {load} from './load-ts.mjs';

// Exercise real handlers/business SQL in disposable source realms. Authentication
// and shared organization boundaries have separate live/role regression checks.
export function reviewRouteFixture(pool){
 const db={query:(sql,args)=>pool.query(sql,args),connect:()=>pool.connect()};
 const transport=load('lib/eassist/transport.ts');
 const offline={...transport,remote:async()=>{throw new transport.UpstreamError('Fixture source unavailable.');}};
 const session={getRequestSession:async request=>{const id=request.headers.get('x-fixture-user');return id?{user:{id}}:null;}};
 const context={sharedOperationsOwner:async user=>user,operationsActor:user=>user,withOperationsActor:async(user,fn)=>fn()};
 const organization=load('lib/organization.ts',{'@/lib/db':{db}});
 const deps={'./db':{db},'@/lib/db':{db},'@/lib/request-session':session,'@/lib/organization-session':session,'./organization-context':context,'@/lib/eassist/organization-context':context,'@/lib/organization':{...organization,organizationOwner:async()=>null},'./transport':offline,'@/lib/eassist/transport':offline,'@/lib/review-ai-config':{reviewAiEnabled:()=>false},'./review-ai-config':{reviewAiEnabled:()=>false}};
 const routes=new Map();
 return {
  async identity(){const id=randomUUID(),email=id+'@example.invalid';await pool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,'Disposable review fixture',email]);await pool.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1",[id]);return {id,email};},
  async request(actor,path,body,origin='http://localhost:3000'){
   const url=new URL(path,'http://localhost:3000'),file='app'+url.pathname+'/route.ts';
   if(!routes.has(file))routes.set(file,load(file,deps));
   const multipart=body instanceof FormData,method=body?'POST':'GET';
   const request=new Request(url,{method,headers:{Origin:origin,...(actor?{'x-fixture-user':actor.id}:{}),...(!multipart?{'Content-Type':'application/json'}:{})},...(body?{body:multipart?body:JSON.stringify(body)}:{})});
   return routes.get(file)[method](request);
  },
 };
}
