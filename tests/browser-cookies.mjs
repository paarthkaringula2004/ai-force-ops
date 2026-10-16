import assert from 'node:assert/strict';
import React from 'react';
import {load} from './helpers/load-ts.mjs';

const priorDocument=globalThis.document, priorWindow=globalThis.window;
const jar=new Map(), writes=[];
let blocked=false, throws=false;
globalThis.window={location:{protocol:'https:'}};
globalThis.document={get cookie(){if(throws)throw new Error('denied');return [...jar].map(([k,v])=>`${k}=${v}`).join('; ');},set cookie(value){
 writes.push(value);if(throws)throw new Error('denied');if(blocked)return;
 const [entry]=value.split(';'),[key,val]=entry.split('=');
 if(value.includes('Max-Age=0'))jar.delete(key);else jar.set(key,val);
}};
try{
 const {saveCookieChoice}=load('lib/browser-cookies.ts');
 assert.equal(saveCookieChoice('required'),true);
 assert.equal(jar.get('aiforce_cookie_choice'),'required');
 assert.equal(jar.has('aiforce_cookie_test'),false,'probe must be cleaned up');
 assert.ok(writes.every(v=>v.includes('; Secure')&&v.includes('SameSite=Lax')&&v.includes('Path=/')));
 blocked=true;
 assert.equal(saveCookieChoice('required'),false,'existing preference must not disguise blocked new writes');
 blocked=false;throws=true;assert.equal(saveCookieChoice('required'),false);throws=false;
 assert.equal(saveCookieChoice('declined'),true);assert.equal(jar.get('aiforce_cookie_choice'),'declined');
 globalThis.window.location.protocol='http:';assert.equal(saveCookieChoice('required'),true,'localhost HTTP works');

 let cursor=0;const states=[];let signins=0;
 const {default:Auth}=load('components/auth/AuthForm.tsx',{
  react:{...React,useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];}},
  'next/navigation':{useRouter:()=>({replace(){},refresh(){}})},
  '@/lib/auth-client':{authClient:{signIn:{email:async()=>{signins++;return {};}}}},
 });
 const all=(node,p)=>!React.isValidElement(node)?[]:[...(p(node)?[node]:[]),...React.Children.toArray(node.props.children).flatMap(n=>all(n,p))];
 const render=()=>{cursor=0;return Auth({mode:'sign-in'});};
 const click=(tree,label)=>all(tree,n=>n.type==='button'&&n.props.children===label)[0].props.onClick();
 let tree=render();blocked=true;click(tree,'Allow required cookies');tree=render();
 assert.equal(all(tree,n=>n.type==='form').length,0);assert.ok(all(tree,n=>n.props.role==='alert').length);
 blocked=false;click(tree,'Allow required cookies');tree=render();assert.equal(all(tree,n=>n.type==='form').length,1);
 blocked=true;await all(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 assert.equal(signins,0,'blocked cookies must stop authentication before provider call');
 tree=render();blocked=false;click(tree,'Allow required cookies');tree=render();click(tree,'Cookie settings');tree=render();click(tree,'Decline');tree=render();
 assert.equal(all(tree,n=>n.type==='form').length,0);assert.equal(jar.get('aiforce_cookie_choice'),'declined');
 console.log('PASS: cookie persistence, fresh blocked-write detection, denied storage, Secure/SameSite attributes, probe cleanup, retry, settings reopening, decline and pre-sign-in recheck.');
}finally{globalThis.document=priorDocument;globalThis.window=priorWindow;}
