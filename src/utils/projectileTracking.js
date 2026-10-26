export function moveTowardTarget(projectile, target, speed, delta) {
  const dx = target.x - projectile.x;
  const dy = target.y - projectile.y;
  const distance = Math.hypot(dx, dy);
  const travel = speed * delta / 1000;
  if (distance <= travel) {
    projectile.x = target.x;
    projectile.y = target.y;
    return true;
  }
  projectile.x += dx / distance * travel;
  projectile.y += dy / distance * travel;
  return false;
}
