import { expect, test } from 'bun:test';
import { countActive, selectedVisibleIds, toggleVisibleSelection } from '../src/lib/adminListSelection';
test('only selected visible records are removed',()=>expect(selectedVisibleIds(new Set(['a','b']),['b','c'])).toEqual(['b']));
test('select all does not discard selection on other pages',()=>expect([...toggleVisibleSelection(new Set(['a']),['b','c'])]).toEqual(['a','b','c']));
test('deselect visible does not deselect other pages',()=>expect([...toggleVisibleSelection(new Set(['a','b','c']),['b','c'])]).toEqual(['a']));
test('empty list cannot select hidden records',()=>expect(selectedVisibleIds(new Set(['a']),[])).toEqual([]));
const contracts=[{id:'1',status:'expired'},{id:'2',status:'expired'},{id:'3',status:'signed'}];
test('deleting the 2 expired contracts sets Expirés to 0',()=>expect(countActive(contracts,new Set(['1','2']),c=>c.status==='expired')).toBe(0));
test('total excludes records in the trash',()=>expect(countActive(contracts,new Set(['1','2']))).toBe(1));
