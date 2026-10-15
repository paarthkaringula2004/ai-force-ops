import 'dotenv/config';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {google} from '@better-auth/core/social-providers';
const require=createRequire(import.meta.url);
function load(path,dependencies={}){const output=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const loaded={exports:{}};new Function('require','module','exports',output)(name=>name in dependencies?dependencies[name]:require(name),loaded,loaded.exports);return loaded.exports;}
const helper=load('lib/google-auth.ts',{'server-only':{}});
delete process.env.GOOGLE_CLIENT_ID;delete process.env.GOOGLE_CLIENT_SECRET;
assert.equal(helper.googleSignInConfigured(),false);
process.env.GOOGLE_CLIENT_ID='fixture.apps.googleusercontent.com';assert.equal(helper.googleSignInConfigured(),false);
process.env.GOOGLE_CLIENT_SECRET='fixture-only-not-real';assert.equal(helper.googleSignInConfigured(),true);
assert.ok(!helper.googleAuthError('<script>untrusted error</script>').includes('<script>'));
assert.ok(helper.googleAuthError('account_not_linked').includes('verify your email'));
let options;
function configure(){load('lib/auth.ts',{'./google-auth':helper,'better-auth':{betterAuth:value=>{options=value;return {};}},'better-auth/plugins':{emailOTP:()=>({})},'@/lib/mail':{queueMail:async()=>{}},'@/lib/mail-templates':{},'@/lib/db':{db:{}},'@/lib/organization':{organizationEvent:async()=>{}}});return options;}
process.env.AUTH_DISABLE_SIGNUP='false';configure();
assert.equal(options.socialProviders.google.prompt,'select_account');assert.equal(options.socialProviders.google.disableSignUp,false);
assert.equal(options.account.accountLinking.requireLocalEmailVerified,true);assert.equal(options.account.accountLinking.allowDifferentEmails,false);
const provider=google(options.socialProviders.google);
const url=new URL(await provider.createAuthorizationURL({state:'fixture-state',codeVerifier:'fixture-verifier-with-enough-length-123456789',redirectURI:'http://localhost:3000/api/auth/callback/google'}));
assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('redirect_uri'),'http://localhost:3000/api/auth/callback/google');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(url.searchParams.get('code_challenge'));assert.equal(url.searchParams.get('state'),'fixture-state');assert.equal(url.searchParams.get('prompt'),'select_account');assert.equal(url.searchParams.get('access_type'),'online');
assert.deepEqual(new Set(url.searchParams.get('scope').split(' ')),new Set(['email','profile','openid']));assert.ok(!url.href.includes(process.env.GOOGLE_CLIENT_SECRET));
process.env.AUTH_DISABLE_SIGNUP='true';configure();assert.equal(options.socialProviders.google.disableSignUp,true);
delete process.env.GOOGLE_CLIENT_SECRET;configure();assert.deepEqual(options.socialProviders,{});
console.log('PASS: credential gating, OAuth authorization URL, PKCE/state, minimal scopes, secret exclusion, verified same-email linking, signup closure and safe callback errors. No Google account or external OAuth exchange used.');
