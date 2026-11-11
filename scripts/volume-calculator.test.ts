import { expect, test } from 'bun:test';
import { computeVolume, homeSizeForVolume } from '../src/utils/volumeCalculator';
test('adds 10 % and rounds up to half m³', () => expect(computeVolume({ canape3: 1, lit2: 1, carton: 10 })).toBe(5.5)); // 5 m³ * 1.1
test('empty inventory is zero', () => expect(computeVolume({})).toBe(0));
test('unknown items and negatives ignored', () => expect(computeVolume({ nope: 3, frigo: -2 })).toBe(0));
test('home size thresholds', () => { expect(homeSizeForVolume(15)).toBe('Studio'); expect(homeSizeForVolume(45)).toBe('T3'); expect(homeSizeForVolume(90)).toBe('T5+'); });
