export const MAX_UNIT_STARS = 5;

export function getUnitRankProgress(ownedUnit) {
  if (!ownedUnit || typeof ownedUnit !== 'object') return null;
  const stars = Math.max(0, Math.min(MAX_UNIT_STARS,
    Math.floor(Number(ownedUnit.stars ?? ownedUnit.rank) || 0)));
  const extraCopies = stars < MAX_UNIT_STARS
    ? Math.max(0, Math.min(stars, Math.floor(Number(ownedUnit.extraCopies) || 0)))
    : 0;
  return { stars, extraCopies, copiesRequired: stars + 1, maxed: stars === MAX_UNIT_STARS };
}
