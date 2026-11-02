import { test, expect } from 'bun:test';
import { getMoveReference } from '../src/utils/moveReference';

test('uses the persisted TTD- six-digit reference rather than deriving letters from the UUID', () => {
  const request = { id: '387980ea-1234-4567-8910-123456789012', reference: 'TTD-837291' };
  expect(getMoveReference(request)).toBe('TTD-837291');
});