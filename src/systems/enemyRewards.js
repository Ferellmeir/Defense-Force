export function awardEnemyKillRewards(enemy, scene) {
  if (enemy.rewardsAwarded) return null;

  enemy.rewardsAwarded = true;
  let forceReward = Math.max(1, Number(enemy.data.force) || 1);
  const killerProperties = enemy.lastDamageSource?.towerData?.specialProperties || [];
  const killForceBonus = killerProperties.find(property => property.property === 'forceBonusPerUnitKill');
  if (killForceBonus) forceReward *= 1 + Number(killForceBonus.value || 0);
  const flatKillBonus = killerProperties.find(property => property.property === 'forceFlatPerKill');
  if (flatKillBonus) forceReward += Number(flatKillBonus.value || 0);
  const survivedHit = enemy.forceBonusTowers?.has(enemy.lastDamageSource);
  const survivedBonus = survivedHit && killerProperties.find(property => property.property === 'forceBonusForSurvivingTargets');
  if (survivedBonus) forceReward *= 1 + Number(survivedBonus.value || 0);
  scene.economyManager.addEnemyKill();
  scene.economyManager.addForce(forceReward);

  if (enemy.lastDamageSource && !enemy.xpAwarded) {
    enemy.lastDamageSource.onEnemyKilled?.(enemy);
    const bonusXp = Number(enemy.lastDamageSource.towerData?.xpPerKill) || 0;
    const marked = (enemy.statusEffects || []).some(effect => effect.type === 'marked');
    const markedXpBonus = marked && killerProperties.find(property => property.property === 'markedEnemyXpBonus');
    const markedXp = markedXpBonus ? forceReward * Number(markedXpBonus.value || 0) : 0;
    enemy.lastDamageSource.addExperience(forceReward + bonusXp + markedXp);
    enemy.xpAwarded = true;
  }

  return forceReward;
}
