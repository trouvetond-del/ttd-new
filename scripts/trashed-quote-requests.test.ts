import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// A quote request moved to the trash must disappear from every list, counter and statistic.
// Any read of several quote_requests rows must filter deleted_at.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|mts)$/.test(n) ? [p] : [];
  });
}
function chainAt(src: string, i: number) {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (depth === 0) return src.slice(i, j); depth--; }
    else if ((c === ';' || c === ',') && depth === 0) return src.slice(i, j);
  }
  return src.slice(i);
}
const singleRow = /\.(eq|in)\(\s*'id'|\.maybeSingle\(|\.single\(|\.(insert|update|upsert|delete)\(|\.eq\(\s*'reference'|\.ilike\(\s*'reference'/;

// Deliberate exceptions: the trash view toggles its own filter; duplicate-email checks and
// contracts must still see trashed requests (contracts and payments are never hidden).
const allowed = new Set([
  'src/components/admin/AdminRecentQuoteRequests.tsx',
  'src/components/admin/ImportClientsModal.tsx',
  'src/pages/ClientContractsPage.tsx',
]);

test('every multi-row read of quote_requests excludes trashed requests', () => {
  const offenders: string[] = [];
  for (const f of files('src')) {
    if (allowed.has(f)) continue;
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\.from\(\s*'quote_requests'\s*\)/g)) {
      const chain = chainAt(src, m.index!);
      if (!/\.select\(/.test(chain) || singleRow.test(chain)) continue;
      if (!/deleted_at/.test(chain)) offenders.push(`${f}:${src.slice(0, m.index).split('\n').length}`);
    }
  }
  expect(offenders).toEqual([]);
});
