import { describe, expect, test } from 'bun:test';
import { disassemblyDetailsMissing, disassemblyReminderEmail } from '../src/lib/disassemblyDetails';
describe('démontage/remontage', () => {
  test('liste obligatoire quand le démontage est coché', () => {
    expect(disassemblyDetailsMissing(['Démontage/Remontage meubles'], '')).toBe(true);
    expect(disassemblyDetailsMissing(['Démontage/Remontage meubles'], '1 lit double, 1 armoire')).toBe(false);
  });
  test('pas obligatoire sans démontage', () => {
    expect(disassemblyDetailsMissing(['Emballage/Déballage'], '')).toBe(false);
  });
  test('email : lien vers la demande, sans nom du fondateur', () => {
    const html = disassemblyReminderEmail({ id: 'abc', client_name: 'Lézat', from_city: 'Toulouse', to_city: 'Brest' });
    expect(html).toContain('/client/quote/abc/edit');
    expect(html).not.toContain('Heikel');
    expect(html).toContain('01 89 70 78 81');
  });
});
