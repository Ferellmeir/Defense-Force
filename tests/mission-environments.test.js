import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeededRandom, generateMissionMap } from '../src/systems/missionGeneration.js';
import { createMissionBoard } from '../src/systems/missionBoard.js';
import { FACTIONS } from '../src/utils/factions.js';
import { getFactionEnvironment } from '../src/systems/missionEnvironments.js';
import { getMissionCardBounds } from '../src/systems/missionScreenLayout.js';

test('all 12 mission cards fit in a 3-column by 4-row 1280x720 viewport', () => {
  const cards = Array.from({ length: 12 }, (_, index) => getMissionCardBounds(index, 1280, 720));
  assert.equal(cards.length, 12);
  assert.ok(cards.every(card => card.x >= 0 && card.y >= 0
    && card.x + card.width <= 1280 && card.y + card.height <= 720));
  assert.equal(cards[0].y, cards[2].y);
  assert.ok(cards[3].y > cards[0].y);
  assert.ok(cards[11].y + cards[11].height < 540);
});

test('mission refreshes preserve each faction environment across all three offers', () => {
  for (const turnNumber of [0, 3, 8]) {
    const missions = createMissionBoard({ turnNumber, random: createSeededRandom(455 + turnNumber) });
    assert.equal(missions.length, 12);
    for (const faction of FACTIONS) {
      const offers = missions.filter(mission => mission.faction === faction);
      assert.equal(offers.length, 3);
      const expected = getFactionEnvironment(faction);
      assert.ok(offers.every(mission => mission.environmentKey === expected.key));
      assert.ok(offers.every(mission => mission.environmentLabel === expected.label));
      assert.ok(offers.every(mission => mission.mapKeys.length === (mission.missionType === 'DYNAMIC_ENGAGEMENT' ? 3 : 1)));
    }
  }
});

test('faction battlefield environments use only present assets and disclose unspecified themes', () => {
  assert.equal(getFactionEnvironment('Laisung Collective').backgroundKey, 'laisung_background');
  assert.equal(getFactionEnvironment('Underworld Network').backgroundKey, 'sewer_rat_battlefield_background');
  for (const faction of ['Ordo Sanctus', 'Strozek Supremacy']) {
    const environment = getFactionEnvironment(faction);
    assert.equal(environment.backgroundKey, 'generic_scifi_background');
    assert.equal(environment.factionSpecific, false);
    assert.match(environment.label, /unspecified/i);
  }
});

test('generated map metadata keeps the selected faction environment', () => {
  const baseMap = { name: 'Test', theme: 'forest', width: 20, height: 12, tileSize: 64, paths: [], entryPoints: [], exitPoints: [], placementRestrictions: [] };
  const map = generateMissionMap(baseMap, 1234, { difficulty: 1, environmentKey: 'underworld' });
  assert.equal(map.generation.environmentKey, 'underworld');
});
