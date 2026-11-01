import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetState, proposalsFor } from './rules.mjs';
test('300 euros mensuels pour Google et Meta ensemble', () => {
 const b = budgetState({ok:true,currency:'EUR',monthSpend:180},{ok:true,currency:'EUR',monthSpend:125});
 assert.equal(b.limit,300); assert.equal(b.knownSpend,305); assert.equal(b.exceeded,true); assert.equal(b.remaining,0);
});
test('données manquantes ne sont pas zéro dépense', () => {
 const b=budgetState({ok:true,currency:'EUR',monthSpend:12},{ok:false});
 assert.equal(b.complete,false); assert.equal(b.remaining,null); assert.equal(b.knownSpend,12);
});
test('propositions uniquement, sans ordre de modification des campagnes', () => {
 const report={ok:true,currency:'EUR',monthSpend:310,campaigns:[{id:'one',name:'Paris',spend:30,conversions:0}]};
 const p=proposalsFor(report,{ok:false},budgetState(report,{ok:false}));
 assert.ok(p.some(x=>x.key==='budget_limit')); assert.ok(p.some(x=>x.key==='google_access'));
 assert.ok(p.every(x=>Object.keys(x).sort().join(',')==='detail,key,title'));
});
