import { describe, test, expect } from 'bun:test';
import { isGroupageRequestActive } from '../src/lib/groupageEligibility';
const request = { moving_date: '2026-11-21', status: 'new', deleted_at: null, is_draft: false };
describe('Groupage follows request actions', () => {
 test('a deleted duplicate cannot remain in Groupage', () => expect(isGroupageRequestActive({ ...request, deleted_at: '2026-11-11T10:00:00Z' }, '2026-11-11')).toBe(false));
 test('an archived request cannot remain in Groupage', () => expect(isGroupageRequestActive({ ...request, status: 'completed' }, '2026-11-11')).toBe(false));
 test('restoration makes a live request eligible again', () => expect(isGroupageRequestActive(request, '2026-11-11')).toBe(true));
 test('drafts are not eligible', () => expect(isGroupageRequestActive({ ...request, is_draft: true }, '2026-11-11')).toBe(false));
 test('expired moves are not eligible', () => expect(isGroupageRequestActive(request, '2026-11-22')).toBe(false));
});
