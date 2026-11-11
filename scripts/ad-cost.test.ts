import { expect, test } from 'bun:test';
import { computeCostRows } from '../src/utils/adCost';
const summary = { google: { campaigns: [{ spend: 30 }, { spend: 10 }] }, meta: { campaigns: [{ spend: 14 }] } };
const reqs = [{ acquisition_source: 'google_ads' }, { acquisition_source: 'google_ads' }, { acquisition_source: 'calculateur' }];
test('cost per request = spend / requests from that platform', () => {
  const [g, m] = computeCostRows(summary, reqs, null);
  expect(g).toMatchObject({ spend: 40, requests: 2, costPerRequest: 20 });
  expect(m).toMatchObject({ spend: 14, requests: 0, costPerRequest: null });
});
test('alert when cost per request exceeds threshold', () => expect(computeCostRows(summary, reqs, 15)[0].overThreshold).toBe(true));
test('no alert at or under threshold', () => expect(computeCostRows(summary, reqs, 20)[0].overThreshold).toBe(false));
test('alert when spend passes threshold with zero request', () => expect(computeCostRows(summary, reqs, 10)[1].overThreshold).toBe(true));
test('no alert without a threshold', () => expect(computeCostRows(summary, reqs, null).some(r => r.overThreshold)).toBe(false));
