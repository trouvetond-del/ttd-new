export const MONTHLY_LIMIT_EUR = 300;
export function budgetState(meta, google) {
  const known = [meta, google].filter(x => x?.ok && x.currency === 'EUR');
  const knownSpend = known.reduce((sum, x) => sum + x.monthSpend, 0);
  const complete = known.length === 2;
  return { limit: MONTHLY_LIMIT_EUR, knownSpend, complete, remaining: complete ? Math.max(0, MONTHLY_LIMIT_EUR - knownSpend) : null, exceeded: knownSpend >= MONTHLY_LIMIT_EUR };
}
export function proposalsFor(meta, google, budget) {
  const proposals = [];
  if (!google.ok) proposals.push({ key: 'google_access', title: 'Rétablir la lecture Google Ads', detail: 'Le compte Google connecté ne permet pas de lire les résultats. Vérifier son accès au compte publicitaire ; aucun résultat Google ni total complet ne peut être annoncé.' });
  if (!meta.ok) proposals.push({ key: 'meta_access', title: 'Rétablir la lecture Facebook / Instagram', detail: 'Les résultats Meta sont indisponibles. Vérifier les accès ; ne pas augmenter les budgets sur des données manquantes.' });
  if (!budget.complete) proposals.push({ key: 'budget_unknown', title: 'Vérifier le total mensuel avant toute hausse', detail: 'Le plafond de 300 € concerne Google et Meta ensemble. Le total est incomplet : aucune marge de budget fiable ne peut être calculée.' });
  if (budget.exceeded) proposals.push({ key: 'budget_limit', title: 'Plafond mensuel atteint : décision administrateur requise', detail: 'Les dépenses connues atteignent au moins 300 €. L’agent ne coupe pas les campagnes : examiner immédiatement les dépenses et décider des mesures dans les comptes publicitaires.' });
  for (const [provider, report] of [['Meta', meta], ['Google', google]]) {
    if (!report.ok) continue;
    for (const c of report.campaigns || []) {
      if (c.spend > 0 && c.conversions === 0) proposals.push({ key: `${provider}_${c.id}_measurement`, title: `${c.name} : vérifier le parcours et la mesure`, detail: `${provider} : ${c.spend.toFixed(2)} ${report.currency} dépensés, aucune conversion enregistrée sur la période. Ce constat ne prouve pas qu’aucun client existe. Contrôler la page, le formulaire et le suivi avant de proposer une hausse.` });
    }
  }
  proposals.push({ key: 'quality', title: 'Qualifier les demandes et inscriptions', detail: 'Rappeler les contacts et distinguer inscription, demande de devis et client payant. Aucune promesse de clients ni de rentabilité à partir des clics seuls.' });
  return proposals;
}
