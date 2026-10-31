import assert from 'node:assert/strict';
import test from 'node:test';
import RPGManager from '../src/systems/RPGManager.js';
import { formatSignedPercent, formatStatModifier } from '../src/utils/statFormatting.js';

test('fractional stat modifiers display as signed percentages without rounding to zero', () => {
  assert.equal(formatStatModifier('attackSpeedModifier', 0.1), '+10%');
  assert.equal(formatStatModifier('attackSpeedModifier', -0.1), '-10%');
  assert.equal(formatStatModifier('attackSpeedModifier', 0), '+0%');
  assert.equal(formatStatModifier('criticalChance', -0.05), '-5%');
});

test('flat stats keep their existing numeric scale and signed display', () => {
  assert.equal(formatStatModifier('damage', 10), '+10');
  assert.equal(formatStatModifier('damage', -10), '-10');
});

test('percent effect labels include exactly one sign', () => {
  assert.equal(formatSignedPercent(0.1), '+10%');
  assert.equal(formatSignedPercent(-0.1), '-10%');
  assert.equal(formatSignedPercent(0), '+0%');
});

test('negative percentage effects reduce the resulting stat and combine multiplicatively', () => {
  const manager = Object.create(RPGManager.prototype);
  const stats = { damage: 100 };
  manager.applyEffect(stats, { type: 'stat', stat: 'damage', mode: 'percent', value: -0.1 });
  manager.applyEffect(stats, { type: 'stat', stat: 'damage', mode: 'percent', value: 0.1 });
  assert.ok(Math.abs(stats.damage - 99) < 1e-12);

  manager.applyEffect(stats, { type: 'stat', stat: 'damage', mode: 'percent', value: -0.1 });
  assert.ok(Math.abs(stats.damage - 89.1) < 1e-12);
});
