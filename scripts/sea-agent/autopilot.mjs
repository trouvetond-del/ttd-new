// Règles de pilotage automatique SEA (pures, testées). Plafond dur : 300 € / mois Google + Meta ensemble.
export const MONTHLY_LIMIT_EUR = 300;
export const SAFETY = 0.9;           // on ne planifie que 90 % du reste, Google pouvant dépasser un budget jour
export const PAUSE_SPEND_EUR = 20;   // 7 jours, 0 conversion, au moins 20 € dépensés -> pause
export const SCALE_MAX_CPA_EUR = 25; // coût par conversion jugé bon
export const SCALE_STEP = 1.2;       // +20 % maximum par jour
export const MIN_DAILY_EUR = 1;

const isActive = (c) => ['ENABLED', 'ACTIVE'].includes(c.status);

/**
 * campaigns: [{provider:'google'|'meta', id, name, status, spend7, conv7, dailyBudget (EUR|null), pausedByAgentForCap}]
 * budget: {complete, knownSpend}
 */
export function planActions({ campaigns, budget, daysLeft, isFirstDayOfMonth, weekday }) {
  const actions = [];
  const active = campaigns.filter(isActive);

  // 1. Plafond atteint (ou presque) : tout couper.
  if (budget.knownSpend >= MONTHLY_LIMIT_EUR * 0.98) {
    for (const c of active) actions.push({ type: 'pause', c, reason: `Plafond mensuel atteint (${budget.knownSpend.toFixed(2)} € / ${MONTHLY_LIMIT_EUR} €)`, cap: true });
    return actions;
  }

  // 2. Nouveau mois : relancer ce que l'agent avait coupé pour plafond.
  if (isFirstDayOfMonth) for (const c of campaigns) if (c.pausedByAgentForCap && !isActive(c)) actions.push({ type: 'resume', c, reason: 'Nouveau mois : plafond remis à zéro' });

  // 3. Couper ce qui coûte sans rien rapporter.
  const losers = new Set();
  for (const c of active) if (c.spend7 >= PAUSE_SPEND_EUR && c.conv7 === 0) { losers.add(c.id); actions.push({ type: 'pause', c, reason: `${c.spend7.toFixed(2)} € en 7 jours sans aucune conversion` }); }

  // Sans données complètes, aucune dépense supplémentaire.
  if (!budget.complete) return actions;

  const remaining = Math.max(0, MONTHLY_LIMIT_EUR - budget.knownSpend);
  const allowance = (remaining * SAFETY) / Math.max(1, daysLeft); // budget jour total autorisé
  const running = active.filter((c) => !losers.has(c.id) && c.dailyBudget != null);
  const resumed = actions.filter((a) => a.type === 'resume' && a.c.dailyBudget != null).map((a) => a.c);
  const pool = [...running, ...resumed];

  // 4. Monter les gagnants (+20 %), puis ramener le total sous l'enveloppe.
  const target = new Map(pool.map((c) => [c.id, c.dailyBudget]));
  for (const c of pool) if (c.conv7 >= 2 && c.spend7 / c.conv7 <= SCALE_MAX_CPA_EUR) target.set(c.id, c.dailyBudget * SCALE_STEP);
  const total = [...target.values()].reduce((s, v) => s + v, 0);
  const factor = total > allowance ? allowance / total : 1;
  for (const c of pool) {
    const next = Math.max(MIN_DAILY_EUR, Math.round(target.get(c.id) * factor * 100) / 100);
    if (Math.abs(next - c.dailyBudget) >= 0.1) actions.push({ type: 'budget', c, from: c.dailyBudget, to: next, reason: next > c.dailyBudget ? 'Bons résultats : budget augmenté' : `Enveloppe du mois : ${allowance.toFixed(2)} € / jour maximum` });
  }
  // Si même le minimum dépasse l'enveloppe, couper le plus cher sans conversion.
  if (pool.length * MIN_DAILY_EUR > allowance && pool.length) {
    const worst = [...pool].sort((a, b) => (a.conv7 - b.conv7) || (b.spend7 - a.spend7))[0];
    actions.push({ type: 'pause', c: worst, reason: 'Enveloppe restante trop faible pour toutes les campagnes', cap: true });
  }

  // 5. Créer : chaque lundi, une nouvelle pub dans la meilleure campagne de chaque plateforme, s'il reste au moins 50 €.
  if (weekday === 1 && remaining >= 50) {
    for (const provider of ['google', 'meta']) {
      const best = pool.filter((c) => c.provider === provider).sort((a, b) => b.conv7 - a.conv7 || a.spend7 - b.spend7)[0];
      if (best) actions.push({ type: 'new_ad', c: best, reason: 'Test hebdomadaire d’une nouvelle annonce' });
    }
  }
  return actions;
}

// Contrôle des textes générés par IA avant mise en ligne.
const BANNED = [/\d+\s?%/, /n[°o]\s?1/i, /meilleur/i, /garanti/i, /\d[\d\s]*avis/i, /étoiles?/i];
export function validAdText(s, max) {
  const t = String(s || '').trim();
  return t.length > 0 && t.length <= max && !BANNED.some((r) => r.test(t));
}
