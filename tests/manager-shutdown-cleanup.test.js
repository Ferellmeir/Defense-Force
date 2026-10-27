import test from 'node:test';
import assert from 'node:assert/strict';
import TowerManager from '../src/systems/TowerManager.js';
import EnemyManager from '../src/systems/EnemyManager.js';
import ProjectileManager from '../src/systems/ProjectileManager.js';

function createSceneWithGroup() {
  const group = {
    scene: null,
    children: { size: 1 },
    clearCalls: [],
    clear(...args) {
      this.clearCalls.push(args);
      this.children.size = 0;
    },
  };
  const scene = { add: { group: () => group } };
  group.scene = scene;
  return { scene, group };
}

const managerCases = [
  ['tower', TowerManager, 'towerGroup'],
  ['enemy', EnemyManager, 'enemyGroup'],
  ['projectile', ProjectileManager, 'projectileGroup'],
];

for (const [name, Manager, groupProperty] of managerCases) {
  test(`${name} manager clear is safe after Phaser destroys its group during scene shutdown`, () => {
    const { scene, group } = createSceneWithGroup();
    const manager = new Manager(scene);

    // Phaser Group.destroy() clears the group, then invalidates these fields.
    group.children = undefined;
    group.scene = undefined;

    assert.equal(manager.clear(), false);
    assert.equal(manager[groupProperty], null);
    assert.deepEqual(group.clearCalls, []);
    assert.equal(manager.clear(), false);
  });

  test(`${name} manager clear remains repeatable while its group is live`, () => {
    const { scene, group } = createSceneWithGroup();
    const manager = new Manager(scene);

    assert.equal(manager.clear(), true);
    assert.equal(manager.clear(), true);
    assert.deepEqual(group.clearCalls, [[true, true], [true, true]]);
  });
}

test('manager clear propagates errors from a live Phaser group', () => {
  const { scene, group } = createSceneWithGroup();
  const manager = new TowerManager(scene);
  group.clear = () => { throw new Error('unexpected live group failure'); };

  assert.throws(() => manager.clear(), /unexpected live group failure/);
});
