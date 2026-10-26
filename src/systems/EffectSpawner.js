const EFFECT_TINTS = {
  basic: 0xffff00,
  physical: 0xffff00,
  ranged: 0xffff00,
  melee: 0xffffff,
  energy: 0x55ddff,
  fire: 0xff4422,
  acid: 0x88ff33,
  aoe: 0xff6600,
  slow: 0x00ffff,
};

export default class EffectSpawner {
  constructor(scene) {
    this.scene = scene;
  }

  createHitEffect(x, y, type = 'basic') {
    const point = this.scene.projectWorldPoint?.(x, y) || { x, y };
    const projectionScale = this.scene.battlefieldProjection?.scale || 1;
    const tint = EFFECT_TINTS[String(type).toLowerCase()] || EFFECT_TINTS.basic;
    const emitter = this.scene.add.particles(0, 0, 'explosion', {
      tint,
      lifespan: 350,
      speed: { min: 80 * projectionScale, max: 160 * projectionScale },
      scale: { start: 0.4, end: 0 },
      quantity: 10,
      alpha: { start: 1, end: 0 },
      angle: { min: 0, max: 360 },
      blendMode: 'ADD',
    });
    emitter.explode(10, point.x, point.y);
    this.scene.time.delayedCall(350, () => {
      emitter.destroy();
    });
  }

  createExplosionEffect(x, y, radius, type = 'basic') {
    const point = this.scene.projectWorldPoint?.(x, y) || { x, y };
    const projectionScale = this.scene.battlefieldProjection?.scale || 1;
    const normalizedType = String(type).toLowerCase();
    const tint = ['energy', 'fire', 'acid', 'melee', 'aoe', 'slow'].includes(normalizedType)
      ? EFFECT_TINTS[normalizedType]
      : undefined;
    const emitter = this.scene.add.particles(0, 0, 'explosion', {
      ...(tint === undefined ? {} : { tint }),
      lifespan: 500,
      speed: { min: 100 * projectionScale, max: 220 * projectionScale },
      scale: { start: (radius * projectionScale) / 120, end: 0 },
      quantity: 20,
      alpha: { start: 0.9, end: 0 },
      angle: { min: 0, max: 360 },
      blendMode: 'ADD',
    });
    emitter.explode(20, point.x, point.y);
    this.scene.time.delayedCall(550, () => {
      emitter.destroy();
    });
  }
}
