import { test, expect } from 'bun:test';
import { canRemind, canRespond } from '../src/lib/clientPendingQuotes';
test('manual reminder requires pending offers', () => {
  expect(canRemind({ status: 'new' }, 0)).toBe(false);
  expect(canRemind({ status: 'quoted' }, 2)).toBe(true);
});
test('trashed, draft and accepted requests cannot be reminded', () => {
  expect(canRemind({ status: 'quoted', deleted_at: '2026-11-11' }, 2)).toBe(false);
  expect(canRemind({ status: 'quoted', is_draft: true }, 2)).toBe(false);
  expect(canRemind({ status: 'quoted', accepted_quote_id: 'accepted-offer' }, 2)).toBe(false);
});
test('only the owner can give an allowed response', () => {
  expect(canRespond('client-1', 'client-2', 'Je souhaite être rappelé', '')).toBe(false);
  expect(canRespond('client-1', 'client-1', 'Je souhaite être rappelé', '')).toBe(true);
  expect(canRespond('client-1', 'client-1', 'invalid', '')).toBe(false);
});
test('another reason requires an explanation', () => {
  expect(canRespond('client-1', 'client-1', 'Autre raison', '')).toBe(false);
  expect(canRespond('client-1', 'client-1', 'Autre raison', 'Ma date a changé')).toBe(true);
});