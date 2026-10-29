import assert from 'node:assert/strict';
import test from 'node:test';
import { getMissionTypeColor, sortMissionsByDifficulty } from '../src/systems/missionPresentation.js';
import { getMissionCardBounds } from '../src/systems/missionScreenLayout.js';

test('missions sort from configured low to high difficulty in visual left-to-right order', () => {
  const missions = [
    { id: 'gauntlet-hard', missionType: 'GAUNTLET', difficulty: 'HARD' },
    { id: 'secure-easy', missionType: 'SECURE_REGION', difficulty: 'EASY' },
    { id: 'dynamic-normal', missionType: 'DYNAMIC_ENGAGEMENT', difficulty: 'NORMAL' },
    { id: 'barricade-expert', missionType: 'BARRICADE', difficulty: 'EXPERT' },
    { id: 'gauntlet-easy', missionType: 'GAUNTLET', difficulty: 'EASY' },
  ];
  const sorted = sortMissionsByDifficulty(missions);
  assert.deepEqual(sorted.map(mission => mission.id), [
    'secure-easy', 'gauntlet-easy', 'dynamic-normal', 'gauntlet-hard', 'barricade-expert',
  ]);
  const bounds = sorted.map((_, index) => getMissionCardBounds(index, 1280, 720));
  assert.ok(bounds[0].x < bounds[1].x && bounds[1].x < bounds[2].x);
  assert.ok(bounds[3].y > bounds[2].y);
  assert.ok(bounds[3].x < bounds[4].x);
});

test('equal difficulties preserve original mission order and type does not affect sorting', () => {
  const missions = [
    { id: 'gauntlet', missionType: 'GAUNTLET', difficulty: 'NORMAL' },
    { id: 'barricade', missionType: 'BARRICADE', difficulty: 'NORMAL' },
    { id: 'secure', missionType: 'SECURE_REGION', difficulty: 'EASY' },
  ];
  assert.deepEqual(sortMissionsByDifficulty(missions).map(mission => mission.id), ['secure', 'gauntlet', 'barricade']);
});

test('mission type identifiers map to the requested screen accent colors', () => {
  assert.equal(getMissionTypeColor('GAUNTLET'), 0xe05252);
  assert.equal(getMissionTypeColor('SECURE_REGION'), 0x55aaff);
  assert.equal(getMissionTypeColor('BARRICADE'), 0x9aa3ad);
  assert.equal(getMissionTypeColor('DYNAMIC_ENGAGEMENT'), 0xff9f43);
});
