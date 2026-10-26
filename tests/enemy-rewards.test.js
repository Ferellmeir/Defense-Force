import assert from 'node:assert/strict';
import test from 'node:test';
import { awardEnemyKillRewards } from '../src/systems/enemyRewards.js';

function createEnemy(force) {
  const rewards = { force: 0, xp: 0, kills: 0, removals: 0 };
  const tower = { addExperience: amount => { rewards.xp += amount; } };
  const scene = {
    economyManager: {
      addEnemyKill: () => { rewards.kills += 1; },
      addForce: amount => { rewards.force += amount; },
      getMoney: () => 0,
      getScore: () => 0,
      getLives: () => 10,
    },
    events: { emit: () => {} },
    textures: { exists: () => false },
    tweens: { add: ({ onComplete }) => onComplete() },
    enemyManager: { removeEnemy: () => { rewards.removals += 1; } },
  };
  const enemy = {
    data: { force },
    lastDamageSource: tower,
    rewardsAwarded: false,
    xpAwarded: false,
  };
  return { enemy, rewards, scene };
}

test('normal, fast, armored, elite, and boss kills award their configured Force as XP once', () => {
  for (const configuredReward of [2, 4, 10, 20, 400]) {
    const { enemy, rewards, scene } = createEnemy(configuredReward);
    awardEnemyKillRewards(enemy, scene);
    awardEnemyKillRewards(enemy, scene);

    assert.equal(rewards.force, configuredReward);
    assert.equal(rewards.xp, configuredReward);
    assert.equal(rewards.kills, 1);
  }
});
