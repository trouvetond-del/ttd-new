// Temporary commercial rule requested on 2026-11-15.
// The mover's price never includes the platform margin.
export const PLATFORM_MARGIN_RATE = 0.15;
export const PLATFORM_MARGIN_PERCENT = 15;
export const PLATFORM_PRICE_MULTIPLIER = 1 + PLATFORM_MARGIN_RATE;

export function clientPriceForMoverPrice(moverPrice: number): number {
  // Avoid binary floating point turning 747.5 into 747.4999999999999.
  return Math.round(moverPrice * PLATFORM_PRICE_MULTIPLIER + 1e-9);
}

export function moverPriceFromClientPrice(clientDisplayPrice: number): number {
  return Math.round(clientDisplayPrice / PLATFORM_PRICE_MULTIPLIER);
}

/**
 * When the original mover price is known, keep it as the source of truth.
 * This preserves historical accepted/paid quotes created with another margin.
 */
export function platformPriceBreakdown(clientDisplayPrice: number, knownMoverPrice?: number | null) {
  const moverPrice = knownMoverPrice && knownMoverPrice > 0
    ? Math.round(knownMoverPrice)
    : moverPriceFromClientPrice(clientDisplayPrice);
  const platformFee = Math.max(0, clientDisplayPrice - moverPrice);

  return {
    clientDisplayPrice,
    moverPrice,
    totalAmount: clientDisplayPrice,
    platformFee,
    depositAmount: platformFee,
    remainingAmount: moverPrice,
    guaranteeAmount: 0,
    moverTotalPayout: moverPrice,
    moverDeposit: 0,
    escrowAmount: 0,
    moverAdvance: 0,
    moverTotal: moverPrice,
  };
}
