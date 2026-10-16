import assert from 'node:assert/strict';
import React from 'react';
import {load} from './helpers/load-ts.mjs';

function hooks(){let cursor=0;const states=[];return {reset(){cursor=0;},react:{...React,useEffect(){},useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],next=>{states[index]=typeof next==='function'?next(states[index]):next;}];},useSyncExternalStore(_subscribe,snapshot){return snapshot();}}};}
function all(node,predicate){if(!React.isValidElement(node))return [];return [...(predicate(node)?[node]:[]),...React.Children.toArray(node.props.children).flatMap(child=>all(child,predicate))];}
const routes=[],stored=new Map(),sent=[],verified=[];
const router={push:href=>routes.push(href),replace:href=>routes.push(href),refresh(){}};
const prior=globalThis.sessionStorage;
globalThis.sessionStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)};
try{
 const state=hooks();
 const {default:AuthForm}=load('components/auth/AuthForm.tsx',{
  '@/lib/browser-cookies':{saveCookieChoice:()=>true},react:state.react,'next/navigation':{useRouter:()=>router},
  '@/lib/auth-client':{authClient:{signIn:{email:async()=>({error:{code:'EMAIL_NOT_VERIFIED',message:'Email not verified'}})}}},
 });
 const render=()=>{state.reset();return AuthForm({mode:'sign-in',initialCookieChoice:'required'});};
 let tree=render();
 all(tree,n=>n.type==='input'&&n.props.type==='email')[0].props.onChange({currentTarget:{value:'verify-fixture@example.invalid'}});
 tree=render();await all(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 tree=render();
 const button=all(tree,n=>n.type==='button'&&n.props.children==='Verify email')[0];
 assert.ok(button,'unverified sign-in must offer a verification action');
 assert.equal(button.props.type,'button');assert.equal(button.props.disabled,false);
 assert.equal(routes.length,0,'failure must not navigate without the verification action');
 button.props.onClick();
 assert.deepEqual(routes,['/verify-email']);assert.equal(stored.get('aiforce_verification_email'),'verify-fixture@example.invalid');
 const verifyState=hooks();
 const {default:Verify}=load('components/auth/VerifyEmailForm.tsx',{
  react:verifyState.react,'next/navigation':{useRouter:()=>router},
  '@/lib/auth-client':{authClient:{useSession:()=>({data:null}),emailOtp:{sendVerificationOtp:async value=>{sent.push(value);return {};},verifyEmail:async value=>{verified.push(value);return {};}},getSession:async()=>({})}},
 });
 const renderVerify=()=>{verifyState.reset();return Verify();};
 tree=renderVerify();assert.equal(all(tree,n=>n.type==='input'&&n.props.type==='email')[0].props.value,'verify-fixture@example.invalid');
 assert.equal(sent.length,0,'opening the verification page must not send unsolicited mail');
 all(tree,n=>n.type==='button'&&n.props.children==='Send verification code')[0].props.onClick();
 await new Promise(setImmediate);
 assert.deepEqual(sent,[{email:'verify-fixture@example.invalid',type:'email-verification'}]);
 tree=renderVerify();assert.ok(all(tree,n=>n.type==='button'&&n.props.children==='Resend verification code').length);assert.equal(all(tree,n=>n.type==='button'&&n.props.children==='Resend verification code')[0].props.disabled,true,'resend must cool down after a successful request');all(tree,n=>n.type==='button'&&n.props.children==='Resend verification code')[0].props.onClick();await new Promise(setImmediate);assert.equal(sent.length,1,'cooldown must also guard the handler');
 all(tree,n=>n.type==='input'&&n.props.autoComplete==='one-time-code')[0].props.onChange({target:{value:'123456'}});
 tree=renderVerify();all(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 await new Promise(setImmediate);
 assert.deepEqual(verified,[{email:'verify-fixture@example.invalid',otp:'123456'}]);
 assert.equal(routes.at(-1),'/sign-in?verified=1');assert.equal(stored.has('aiforce_verification_email'),false);
 const signupState=hooks();let created=0;
 const {default:Signup}=load('components/auth/AuthForm.tsx',{
  '@/lib/browser-cookies':{saveCookieChoice:()=>true},react:signupState.react,'next/navigation':{useRouter:()=>router},
  '@/lib/auth-client':{authClient:{signUp:{email:async()=>{created++;return {data:{user:{emailVerified:false}}};}}}},
 });
 const renderSignup=()=>{signupState.reset();return Signup({mode:'sign-up',initialCookieChoice:'required'});};
 tree=renderSignup();all(tree,n=>n.type==='input'&&n.props.type==='email')[0].props.onChange({currentTarget:{value:'new-fixture@example.invalid'}});
 tree=renderSignup();await all(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 assert.equal(created,1);assert.equal(routes.at(-1),'/verify-email');
 assert.equal(stored.get('aiforce_verification_email'),'new-fixture@example.invalid');
 console.log('PASS: unverified sign-in offers a non-submit Verify email action, preserves the correct email without URL exposure, explicitly requests an OTP, supports resend and returns to sign-in after verification; signup goes directly to verification. Auth and mail providers mocked; no email sent.');
}finally{globalThis.sessionStorage=prior;}
