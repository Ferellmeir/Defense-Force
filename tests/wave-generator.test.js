import assert from 'node:assert/strict';
import test from 'node:test';
import { generateMissionWaves, getNonBossProbabilities } from '../src/systems/waveGenerator.js';

const enemyTypes = {
  NORMAL: {},
  FAST: {},
  ARMORED: {},
  ELITE: {},
  BOSS: {},
};

test('Wave 1 has 30 enemies and each later raw total grows by 1.15', () => {
  const { waves } = generateMissionWaves({ difficulty: 'EASY', enemies: enemyTypes, random: () => 0.99 });
  assert.equal(waves[0].count, 30);
  for (let index = 1; index < waves.length; index += 1) {
    assert.equal(waves[index].rawEnemyCount, waves[index - 1].rawEnemyCount * 1.15);
    assert.equal(waves[index].nonBossCount, Math.round(waves[index].rawEnemyCount));
  }
});

test('alternate progression starts at Wave 5 and reduces Normal by 5 percentage points', () => {
  assert.equal(getNonBossProbabilities(4, Object.keys(enemyTypes)).NORMAL, 0.9);
  assert.equal(getNonBossProbabilities(5, Object.keys(enemyTypes)).NORMAL, 0.85);
  assert.equal(getNonBossProbabilities(6, Object.keys(enemyTypes)).NORMAL, 0.8);
});

test('redistributed alternate probabilities reach equal non-Boss odds', () => {
  const types = Object.keys(enemyTypes);
  const wave5 = getNonBossProbabilities(5, types);
  assert.equal(wave5.NORMAL, 0.85);
  assert.ok(Math.abs(wave5.FAST - 0.05) < 1e-12);
  assert.ok(Math.abs(wave5.ARMORED - 0.05) < 1e-12);
  assert.ok(Math.abs(wave5.ELITE - 0.05) < 1e-12);
  const equalized = getNonBossProbabilities(17, types);
  assert.deepEqual(equalized, { NORMAL: 0.25, FAST: 0.25, ARMORED: 0.25, ELITE: 0.25 });
  assert.equal(Object.hasOwn(equalized, 'BOSS'), false);
});

test('single-type waves use the normal formula and retain one grouped non-Boss type', () => {
  let call = 0;
  const random = () => {
    const current = call;
    call += 1;
    if (current === 153) return 0.86; // Wave 5 selection: just above Normal's 85% weight.
    return 0;
  };
  const { waves } = generateMissionWaves({ difficulty: 'EASY', enemies: enemyTypes, random });
  const wave5 = waves[4];
  assert.equal(wave5.singleTypeWave, true);
  assert.deepEqual(wave5.groups.filter(group => group.type !== 'BOSS'), [{ type: 'FAST', count: wave5.nonBossCount }]);

  const ordinary = generateMissionWaves({
    difficulty: 'EASY',
    enemies: enemyTypes,
    random: (() => { let index = 0; return () => (index++ === 0 ? 0 : 0.99); })(),
  }).waves[4];
  assert.deepEqual(ordinary.probabilities, wave5.probabilities);
});

test('Elite and Boss availability and mission-local boss chance follow the rules', () => {
  const { waves } = generateMissionWaves({ difficulty: 'INSANE', enemies: enemyTypes, random: () => 0.99 });
  assert.equal(waves.slice(0, 4).some(wave => wave.groups.some(group => group.type === 'ELITE')), false);
  assert.equal(waves.slice(0, 14).some(wave => wave.groups.some(group => group.type === 'BOSS')), false);
  assert.equal(waves[14].bossCount, 0);
  assert.equal(waves[14].bossChanceBeforeWave, 10);
  assert.equal(waves[14].bossChanceAfterWave, 12);
  assert.equal(waves[15].bossChanceAfterWave, 14);
  assert.ok(waves.every(wave => wave.groups.filter(group => group.type === 'BOSS').length <= 1));

  const spawned = generateMissionWaves({ difficulty: 'INSANE', enemies: enemyTypes, random: () => 0 });
  assert.equal(spawned.waves[14].bossCount, 1);
  assert.equal(spawned.waves[14].bossChanceBeforeWave, 10);
  assert.equal(spawned.waves[14].bossChanceAfterWave, 10);
  assert.equal(spawned.waves[14].nonBossCount, spawned.waves[14].groups
    .filter(group => group.type !== 'BOSS')
    .reduce((total, group) => total + group.count, 0));
});

test('all difficulty final-wave counts stay within their authoritative ranges', () => {
  const expected = { EASY: [10, 12], NORMAL: [12, 15], HARD: [16, 19], EXPERT: [20, 24], INSANE: [25, 25] };
  Object.entries(expected).forEach(([difficulty, [minimum, maximum]]) => {
    [0, 0.5, 0.999999].forEach(randomValue => {
      const mission = generateMissionWaves({ difficulty, enemies: enemyTypes, random: () => randomValue });
      assert.ok(mission.totalWaves >= minimum && mission.totalWaves <= maximum);
    });
  });
});
