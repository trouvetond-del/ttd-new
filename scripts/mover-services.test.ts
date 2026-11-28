import { describe, expect, test } from 'bun:test';
import { CLIENT_SERVICES, MOVER_SERVICE_LABELS, MOVER_SERVICES, moverServiceFields, ownsFurnitureLift } from '../src/lib/moverServices';
describe('prestations et équipement', () => {
  test('le client peut demander le débarras avec nettoyage et démontage', () => {
    expect(CLIENT_SERVICES).toContain('Débarras');
    expect(CLIENT_SERVICES).toContain('Nettoyage après déménagement');
    expect(CLIENT_SERVICES).toContain('Démontage/Remontage meubles');
  });
  test('toutes les inscriptions proposent débarras, montage, lourd et piano', () => {
    expect(MOVER_SERVICE_LABELS).toContain('Débarras');
    expect(MOVER_SERVICE_LABELS).toContain('Objets lourds/volumineux');
    expect(MOVER_SERVICE_LABELS).toContain('Démontage/Remontage meubles');
    expect(MOVER_SERVICE_LABELS).toContain('Piano et objets volumineux');
    for (const id of ['debarras', 'montage_meubles', 'objets_lourds', 'piano']) expect(MOVER_SERVICES.some(service => service.id === id)).toBe(true);
  });
  test('services et propriété du monte-meuble sont enregistrés séparément', () => {
    expect(moverServiceFields(['Débarras'], true)).toEqual({ services: ['Débarras'], specialties: ['Débarras'], has_furniture_lift: true });
    expect(moverServiceFields(['Monte-meuble'], false).has_furniture_lift).toBe(false);
  });
  test('admin repère uniquement une propriété explicitement déclarée', () => {
    expect(ownsFurnitureLift({ has_furniture_lift: true })).toBe(true);
    expect(ownsFurnitureLift({ has_furniture_lift: false })).toBe(false);
    expect(ownsFurnitureLift({})).toBe(false);
  });
});
