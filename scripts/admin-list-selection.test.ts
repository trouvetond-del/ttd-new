import { expect, test } from 'bun:test';
import { selectedVisibleIds, toggleVisibleSelection } from '../src/lib/adminListSelection';
test('only selected visible records are removed',()=>expect(selectedVisibleIds(new Set(['a','b']),['b','c'])).toEqual(['b']));
test('select all does not discard selection on other pages',()=>expect([...toggleVisibleSelection(new Set(['a']),['b','c'])]).toEqual(['a','b','c']));
test('deselect visible does not deselect other pages',()=>expect([...toggleVisibleSelection(new Set(['a','b','c']),['b','c'])]).toEqual(['a']));
test('empty list cannot select hidden records',()=>expect(selectedVisibleIds(new Set(['a']),[])).toEqual([]));
