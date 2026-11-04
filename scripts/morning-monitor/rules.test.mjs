import test from 'node:test';
import assert from 'node:assert/strict';
import { parisDate, expectedKinds, slotResult } from './rules.mjs';
test('Paris date respects winter and summer local day', () => {
  assert.equal(parisDate(new Date('2026-11-04T23:30:00Z')), '2026-11-05');
  assert.equal(parisDate(new Date('2026-07-04T22:30:00Z')), '2026-07-05');
});
test('six weekly articles and two videos follow the approved schedule', () => {
  const week = Array.from({length:7}, (_, i) => expectedKinds(`2026-11-${String(i+2).padStart(2,'0')}`));
  assert.equal(week.flat().filter(k=>k.startsWith('article')).length, 6);
  assert.equal(week.flat().filter(k=>k.startsWith('video')).length, 2);
  assert.deepEqual(expectedKinds('2026-11-04'), ['article_client','video_client']);
  assert.deepEqual(expectedKinds('2026-11-08'), ['video_mover']);
});
test('missing and incomplete rows are never all-clear', () => {
  assert.equal(slotResult([], 'video_client').status, 'warning');
  assert.equal(slotResult([{kind:'video_client',status:'published',published_at:'2026-11-04'}], 'video_client').status,'warning');
});
test('only complete recorded publications pass', () => {
  assert.equal(slotResult([{kind:'video_client',video_url:'https://example.org/v.mp4',status:'published',published_at:'2026-11-04',fb_post_id:'fb',ig_media_id:'ig'}], 'video_client').status,'ok');
});
