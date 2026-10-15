import {AsyncLocalStorage} from 'node:async_hooks';
import {organizationOwner} from '@/lib/organization';
import {workspaceAccess} from '@/lib/workspace-access';
import {permitted} from '@/lib/workspace-permissions';
import {InputError} from './transport';
const actors=new AsyncLocalStorage<string>();
export function operationsActor(fallback:string){return actors.getStore()||fallback;}
export function withOperationsActor<T>(actor:string,fn:()=>Promise<T>){return actors.run(actor,fn);}
export async function sharedOperationsOwner(actor:string){
 if(!permitted(await workspaceAccess(actor),'admin'))throw new InputError('Admin access required.',403);
 const owner=await organizationOwner();
 if(!owner)throw new InputError('Configure the organization integration owner first.',409);
 if(!permitted(await workspaceAccess(owner),'admin'))throw new InputError('The organization integration owner must be an active Admin.',409);
 return owner;
}

