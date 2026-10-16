import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from './helpers/load-ts.mjs';

const {integrationCatalog}=load('lib/integrations/catalog.ts');
const shared=integrationCatalog.find(p=>p.id==='dnr_mail');
const own={...shared,id:'custom_manager_fixture',name:'Manager own integration'};
const snapshot={catalog:[shared,own],canCreate:true,canShare:true,canGrantCreation:false,shareableProviders:[{provider:shared.id,roles:["employee","user"]},{provider:own.id,roles:["admin","employee","user"]}],deletableProviders:[own.id],shares:[],removed:[],connections:[],existing:[],history:[],monitors:[]};
let stateIndex=0;
const mockedReact={...React,useState(initial){return React.useState(stateIndex++===0?snapshot:initial);}};
const {default:Catalog}=load('app/dashboard/_components/IntegrationCatalog.tsx',{
 react:mockedReact,
 '@/components/themed-select':{__esModule:true,default:({portalContainer:_,...props})=>React.createElement('select',props)},
});
const html=renderToStaticMarkup(React.createElement(Catalog));
const cards=html.match(/<article\b[\s\S]*?<\/article>/g);
assert.equal(cards.length,2);
assert.match(cards[0],/Shared integration/);
assert.doesNotMatch(cards[0],/Delete integration/);assert.match(cards[0],/Share integration DNR Mail Notifications/);
assert.match(cards[1],/Delete integration Manager own integration/);
assert.doesNotMatch(cards[1],/Shared integration/);
assert.match(html,/>Add integration<\/button>/);
assert.doesNotMatch(html,/aria-label="Share integration creation access"/);
console.log('PASS: real IntegrationCatalog rendering keeps Add integration available, marks shared DNR, hides its delete control, and permits deletion only on the Manager-owned card.');
