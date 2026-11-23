import { describe, expect, it } from 'bun:test';
import { fitDescription, fitTitle } from '../src/utils/seoText.mjs';

describe('limites SEO', () => {
  it('un titre ne dépasse jamais 60 caractères', () => {
    const t = fitTitle('Calculateur de volume de déménagement (m³) pièce par pièce | TrouveTonDéménageur');
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t).toBe('Calculateur de volume de déménagement (m³) pièce par pièce');
  });
  it('un titre court reste inchangé', () => {
    expect(fitTitle('Page introuvable | TrouveTonDéménageur')).toBe('Page introuvable | TrouveTonDéménageur');
  });
  it('une description ne dépasse jamais 160 caractères', () => {
    const d = fitDescription('Mot '.repeat(80));
    expect(d.length).toBeLessThanOrEqual(160);
  });
});
