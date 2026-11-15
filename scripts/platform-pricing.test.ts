import { test, expect } from 'bun:test';
import {
  PLATFORM_MARGIN_PERCENT,
  clientPriceForMoverPrice,
  moverPriceFromClientPrice,
  platformPriceBreakdown,
} from '../src/utils/platformPricing';

test('the platform margin is 15 percent of the mover price', () => {
  expect(PLATFORM_MARGIN_PERCENT).toBe(15);
  expect(clientPriceForMoverPrice(1000)).toBe(1150);
  expect(platformPriceBreakdown(1150).platformFee).toBe(150);
  expect(platformPriceBreakdown(1150).remainingAmount).toBe(1000);
});

test('rounding preserves the exact mover price after repricing', () => {
  expect(clientPriceForMoverPrice(650)).toBe(748);
  expect(platformPriceBreakdown(748, 650).platformFee).toBe(98);
  expect(platformPriceBreakdown(748, 650).moverTotalPayout).toBe(650);
});

test('a historical accepted quote keeps its original mover price and fee', () => {
  const oldQuote = platformPriceBreakdown(1300, 1000);
  expect(oldQuote.platformFee).toBe(300);
  expect(oldQuote.remainingAmount).toBe(1000);
});

test('the reverse calculation uses 15 percent', () => {
  expect(moverPriceFromClientPrice(1150)).toBe(1000);
});
