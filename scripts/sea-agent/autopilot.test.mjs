import test from 'node:test';
import assert from 'node:assert/strict';
import { planActions, validAdText } from './autopilot.mjs';
const c = (o) => ({ provider: 'google', status: 'ENABLED', spend7: 5, conv7: 0, dailyBudget: 5, ...o });
const base = { daysLeft: 10, isFirstDayOfMonth: false, weekday: 3 };

test('300 € atteints : tout est mis en pause', () => {
  const a = planActions({ ...base, campaigns: [c({ id: 'a' }), c({ id: 'b', provider: 'meta', status: 'ACTIVE' })], budget: { complete: true, knownSpend: 300 } });
  assert.deepEqual(a.map((x) => [x.type, x.c.id]), [['pause', 'a'], ['pause', 'b']]);
});
test('20 € sans conversion en 7 jours : pause', () => {
  const a = planActions({ ...base, campaigns: [c({ id: 'a', spend7: 34.27 })], budget: { complete: true, knownSpend: 50 } });
  assert.ok(a.some((x) => x.type === 'pause' && x.c.id === 'a'));
});
test('budgets jour ramenés sous 90 % du reste réparti sur les jours restants', () => {
  // reste 100 €, 10 jours -> 9 € / jour maximum ; 2 x 5 € = 10 € -> baisse
  const a = planActions({ ...base, campaigns: [c({ id: 'a' }), c({ id: 'b' })], budget: { complete: true, knownSpend: 200 } });
  const total = a.filter((x) => x.type === 'budget').reduce((s, x) => s + x.to, 0);
  assert.ok(total <= 9.01, String(total));
});
test('gagnant (2 conversions, 25 € max par conversion) : +20 %', () => {
  const a = planActions({ ...base, campaigns: [c({ id: 'a', spend7: 30, conv7: 2 })], budget: { complete: true, knownSpend: 0 } });
  assert.equal(a.find((x) => x.type === 'budget').to, 6);
});
test('données incomplètes : jamais de hausse ni de création', () => {
  const a = planActions({ ...base, weekday: 1, campaigns: [c({ id: 'a', spend7: 30, conv7: 3 })], budget: { complete: false, knownSpend: 0 } });
  assert.ok(!a.some((x) => x.type === 'budget' || x.type === 'new_ad'));
});
test('lundi avec au moins 50 € restants : nouvelle pub', () => {
  const a = planActions({ ...base, weekday: 1, campaigns: [c({ id: 'a' })], budget: { complete: true, knownSpend: 100 } });
  assert.ok(a.some((x) => x.type === 'new_ad'));
});
test('1er du mois : relance de ce qui a été coupé pour plafond', () => {
  const a = planActions({ ...base, isFirstDayOfMonth: true, campaigns: [c({ id: 'a', status: 'PAUSED', pausedByAgentForCap: true })], budget: { complete: true, knownSpend: 0 } });
  assert.ok(a.some((x) => x.type === 'resume'));
});
test('textes interdits : chiffres non prouvés, avis, « meilleur »', () => {
  assert.equal(validAdText('Devis gratuit en 24 h', 30), true);
  assert.equal(validAdText('99 % de clients ravis', 30), false);
  assert.equal(validAdText('Le meilleur déménageur', 30), false);
  assert.equal(validAdText('x'.repeat(31), 30), false);
});
