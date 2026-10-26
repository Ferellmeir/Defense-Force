export function selectTarget(candidates, mode = 'first') {
  return [...candidates].sort((a, b) => {
    if (mode === 'highestHealth') return b.health - a.health;
    if (mode === 'lowestHealth') return a.health - b.health;
    const progress = enemy => enemy.getPathProgress();
    return mode === 'last' ? progress(a) - progress(b) : progress(b) - progress(a);
  })[0] || null;
}
