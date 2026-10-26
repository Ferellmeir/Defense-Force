import { getBuildingFootprint, getBuildingSprite } from '../utils/buildingFootprint.js';

export function createSeededRandom(seed) {
  let state = Number(seed) >>> 0;
  if (!state) state = 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const DIFFICULTIES = { EASY: 1, NORMAL: 2, HARD: 3, EXPERT: 4, NIGHTMARE: 5 };
const SPECIAL_TYPES = ['thermal_enhancement', 'snipers_nest', 'toxin_synthesizers', 'tactical_indoctrination', 'adaptability_network', 'dark_alley'];
const key = ({ x, y }) => `${x},${y}`;
const edgeKey = (a, b) => [key(a), key(b)].sort().join('|');
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const onInnerBoundary = (p, w, h) => p.x === 1 || p.y === 1 || p.x === w - 2 || p.y === h - 2;

function dimensions(random, difficulty) {
  const offset = difficulty - 1;
  const options = [];
  for (let w = 10 + offset; w <= 14 + offset; w += 1) {
    for (let h = 10 + offset; h <= 14 + offset; h += 1) {
      if ([23, 24, 25].includes(w + h - 2 * offset)) options.push([w, h]);
    }
  }
  return options[Math.floor(random() * options.length)];
}

const DIRECTIONS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
];

function randomEdgePoint(width, height, random) {
  const side = Math.floor(random() * 4);
  if (side === 0) return { x: 1, y: 1 + Math.floor(random() * (height - 2)) };
  if (side === 1) return { x: width - 2, y: 1 + Math.floor(random() * (height - 2)) };
  if (side === 2) return { x: 1 + Math.floor(random() * (width - 2)), y: 1 };
  return { x: 1 + Math.floor(random() * (width - 2)), y: height - 2 };
}

function insidePathArea(point, width, height) {
  return point.x >= 1 && point.y >= 1 && point.x < width - 1 && point.y < height - 1;
}

function routeSegment(path, direction, length, width, height, allowCrossing) {
  const points = [];
  const workingPath = [...path];
  const usedEdges = new Set();
  for (let index = 1; index < path.length; index += 1) usedEdges.add(edgeKey(path[index - 1], path[index]));
  let crossingUsed = path.some((point, index) => path.slice(0, index).some(previous =>
    previous.x === point.x && previous.y === point.y));
  let point = path.at(-1);
  for (let step = 0; step < length; step += 1) {
    const previous = point;
    point = { x: point.x + direction.x, y: point.y + direction.y };
    if (!insidePathArea(point, width, height)) return null;
    const visits = workingPath.filter(existing => existing.x === point.x && existing.y === point.y).length;
    const crossing = visits === 1 && allowCrossing && !crossingUsed;
    if (visits > 0 && !crossing) return null;
    if (crossing) crossingUsed = true;
    const next = { x: point.x + direction.x, y: point.y + direction.y };
    const approachingCrossing = allowCrossing && !crossingUsed && insidePathArea(next, width, height)
      && workingPath.filter(existing => existing.x === next.x && existing.y === next.y).length === 1;
    if (workingPath.slice(0, -1).some(existing => {
      if (existing.x === previous.x && existing.y === previous.y) return false;
      if (crossing && existing.x === point.x && existing.y === point.y) return false;
      if (manhattan(existing, point) >= 2) return false;
      if (manhattan(existing, point) === 1 && usedEdges.has(edgeKey(existing, point))) return false;
      return !(approachingCrossing && existing.x === next.x && existing.y === next.y
        && manhattan(existing, point) === 1);
    })) return null;
    points.push(point);
    usedEdges.add(edgeKey(previous, point));
    workingPath.push(point);
  }
  return points;
}

function buildWindingPath(width, height, minimumLength, random, fallback = false) {
  const maxAttempts = fallback ? 240 : 96;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const start = randomEdgePoint(width, height, random);
    const path = [start];
    const style = Math.floor(random() * 3);
    const segmentRanges = fallback ? [[2, 7], [3, 8]] : [[2, 3], [2, 5], [3, 6]];
    const initialInward = start.x === 0 ? { x: 1, y: 0 }
      : start.x === width - 1 ? { x: -1, y: 0 }
        : start.y === 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };

    for (let segmentNumber = 0; segmentNumber < 96; segmentNumber += 1) {
      const current = path.at(-1);
      if (path.length >= minimumLength && onInnerBoundary(current, width, height)
        && manhattan(start, current) > 1) return path;

      const range = segmentRanges[(style + Math.floor(segmentNumber / 4)) % segmentRanges.length];
      const length = range[0] + Math.floor(random() * (range[1] - range[0] + 1));
      const hasCrossed = path.some((point, index) => path.slice(0, index).some(previous =>
        previous.x === point.x && previous.y === point.y));
      const allowCrossing = !hasCrossed && random() < 0.3;
      const previousDirection = path.length > 1
        ? { x: Math.sign(current.x - path.at(-2).x), y: Math.sign(current.y - path.at(-2).y) }
        : null;
      const center = { x: (width - 1) / 2, y: (height - 1) / 2 };
      const centerDistance = point => Math.abs(point.x - center.x) + Math.abs(point.y - center.y);
      const legal = [];
      for (const direction of DIRECTIONS) {
        if (previousDirection && direction.x === -previousDirection.x && direction.y === -previousDirection.y) continue;
        if (!previousDirection && (direction.x !== initialInward.x || direction.y !== initialInward.y)) continue;
        const points = routeSegment(path, direction, length, width, height, allowCrossing);
        if (!points) continue;
        const end = points.at(-1);
        const progress = path.length < minimumLength
          ? centerDistance(current) - centerDistance(end)
          : 0;
        // Mix a route-to-center tendency with seeded noise; after meeting the
        // minimum, outward routes are favored so they naturally find an exit.
        const outward = path.length >= minimumLength && onInnerBoundary(end, width, height) ? 2 : 0;
        const inwardStart = path.length < minimumLength && path.length < Math.ceil(minimumLength * 0.55)
          ? Math.max(0, progress) * 1.1 : 0;
        const targetWeight = Math.max(0.25, 1 + outward + inwardStart + (random() * 1.8));
        legal.push({ points, weight: targetWeight });
      }
      if (!legal.length) break;
      const total = legal.reduce((sum, option) => sum + option.weight, 0);
      let roll = random() * total;
      let selected = legal.at(-1);
      for (const option of legal) {
        roll -= option.weight;
        if (roll <= 0) { selected = option; break; }
      }
      path.push(...selected.points);
    }
  }
  return null;
}

function makePath(width, height, random, difficulty) {
  const minimumLength = 22 + (difficulty - 1) * 2;
  return buildWindingPath(width, height, minimumLength, random)
    || buildWindingPath(width, height, minimumLength, random, true);
}

function restrictionTiles(map) {
  const blocked = new Set();
  (map.placementRestrictions || []).forEach(area => {
    for (let x = area.x; x < area.x + area.width; x += 1) {
      for (let y = area.y; y < area.y + area.height; y += 1) blocked.add(`${x},${y}`);
    }
  });
  return blocked;
}

function createBuildingTemplates(baseMap, faction) {
  if (faction === 'Laisung Collective') {
    return [
      { width: 2, height: 2, sprite: 'laisung_building_2x2' },
      { width: 2, height: 4, sprite: 'laisung_building_2x4' },
      { width: 3, height: 3, sprite: 'laisung_building_3x3' },
    ];
  }
  return (baseMap.placementRestrictions || []).map(area => ({
    width: area.width,
    height: area.height,
    sprite: getBuildingSprite(area, faction),
  })).filter(building => building.width > 0 && building.height > 0 && building.sprite);
}

function placeBuildings(templates, width, height, path, random, unavailable = new Set()) {
  const buildings = [];
  const occupied = new Set(unavailable);
  const pathDistance = tile => Math.min(...path.map(point => manhattan(point, tile)));
  const orderedTemplates = [...templates].sort((a, b) => b.width * b.height - a.width * a.height);
  for (const template of orderedTemplates) {
    const candidates = [];
    for (let y = 0; y <= height - template.height; y += 1) {
      for (let x = 0; x <= width - template.width; x += 1) {
        const building = { x, y, width: template.width, height: template.height, sprite: template.sprite };
        const footprint = getBuildingFootprint(building);
        if (footprint.some(tile => occupied.has(key(tile)))) continue;
        candidates.push({ building, footprint, distance: Math.min(...footprint.map(pathDistance)) });
      }
    }
    if (!candidates.length) return null;
    const near = candidates.filter(candidate => candidate.distance <= 2);
    const far = candidates.filter(candidate => candidate.distance > 2);
    // Most footprints use the farther candidate pool; a seeded minority can
    // select near the route when there is room, preserving occasional variety.
    let pool = random() < 0.15 && near.length ? near : far;
    if (!pool.length) pool = near.length ? near : candidates;
    const selected = pool[Math.floor(random() * pool.length)];
    buildings.push(selected.building);
    selected.footprint.forEach(tile => occupied.add(key(tile)));
  }
  return buildings;
}

function footprintRestrictions(buildings) {
  return buildings.map(({ x, y, width, height }) => ({ x, y, width, height }));
}

export function getAdditionalSpecialTileChanceSequence() {
  const chances = [];
  let chance = 96;
  while (chance > 0) {
    chances.push(chance);
    chance = chance / 2 - 2;
  }
  chances.push(chance);
  return chances;
}

export function rollAdditionalSpecialTileCount(random) {
  let count = 0;
  for (const chance of getAdditionalSpecialTileChanceSequence()) {
    if (chance <= 0 || random() * 100 >= chance) break;
    count += 1;
  }
  return count;
}

export function validateGeneratedMap(map, difficulty = map?.generation?.difficulty || 1) {
  const path = map?.paths?.[0];
  if (!Number.isInteger(map?.width) || !Number.isInteger(map?.height) || !Array.isArray(path) || path.length < 2) return false;
  const offset = difficulty - 1;
  if (map.width < 10 + offset || map.width > 14 + offset || map.height < 10 + offset || map.height > 14 + offset
    || ![23 + 2 * offset, 24 + 2 * offset, 25 + 2 * offset].includes(map.width + map.height)) return false;
  const inside = ({ x, y }) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height;
  if (!path.every(point => inside(point) && insidePathArea(point, map.width, map.height))) return false;
  if (!onInnerBoundary(path[0], map.width, map.height) || !onInnerBoundary(path.at(-1), map.width, map.height)) return false;
  if (!map.entryPoints?.some(p => p.x === path[0].x && p.y === path[0].y)
    || !map.exitPoints?.some(p => p.x === path.at(-1).x && p.y === path.at(-1).y)
    || manhattan(path[0], path.at(-1)) <= 1) return false;
  if (path.length < 22 + 2 * offset) return false;
  for (let i = 1; i < path.length; i += 1) if (manhattan(path[i - 1], path[i]) !== 1) return false;
  const pathKeys = new Set(path.map(key));
  // A path may revisit a crossing tile, but may not run parallel directly beside itself.
  const pathEdges = new Set(path.slice(1).map((point, index) => edgeKey(path[index], point)));
  const uniquePathPoints = [...new Map(path.map(point => [key(point), point])).values()];
  for (let i = 0; i < uniquePathPoints.length; i += 1) for (let j = i + 1; j < uniquePathPoints.length; j += 1) {
    if (manhattan(uniquePathPoints[i], uniquePathPoints[j]) === 1
      && !pathEdges.has(edgeKey(uniquePathPoints[i], uniquePathPoints[j]))) return false;
  }
  const restrictions = restrictionTiles(map);
  const buildings = map.buildings || [];
  const buildingTiles = new Set();
  for (const building of buildings) {
    if (!Number.isInteger(building.x) || !Number.isInteger(building.y)
      || !Number.isInteger(building.width) || !Number.isInteger(building.height)
      || !building.sprite || building.x < 0 || building.y < 0
      || building.x + building.width > map.width || building.y + building.height > map.height) return false;
    const footprint = getBuildingFootprint(building);
    if (footprint.some(tile => !restrictions.has(key(tile)) || pathKeys.has(key(tile)))) return false;
    if (footprint.some(tile => (map.blockedClearableTiles || []).some(blocked => key(blocked) === key(tile)))) return false;
    if (footprint.some(tile => buildingTiles.has(key(tile)))) return false;
    footprint.forEach(tile => buildingTiles.add(key(tile)));
  }
  if (buildings.length && !map.buildings) return false;
  if ([...pathKeys].some(tile => restrictions.has(tile))) return false;
  if (!(map.specialTiles || []).length) return false;
  for (const tile of map.specialTiles) {
    if (!inside(tile) || restrictions.has(key(tile)) || pathKeys.has(key(tile))) return false;
    const distance = Math.min(...path.map(p => manhattan(p, tile)));
    if (tile.type === 'dark_alley' ? distance !== 1 : distance < 1 || distance > 3) return false;
  }
  const sectionCount = difficulty <= 2 ? 1 : 2;
  for (const [type, speed] of [['incline', 0.5], ['decline', 2]]) {
    const tiles = (map.terrainModifiers || []).filter(tile => tile.type === type && tile.speedMultiplier === speed);
    if (tiles.length !== sectionCount * 2 || tiles.some(tile => !pathKeys.has(key(tile)))) return false;
    const indices = tiles.map(tile => path.findIndex(point => key(point) === key(tile))).sort((a, b) => a - b);
    const sections = [];
    for (let i = 0; i < indices.length; i += 2) {
      if (indices[i + 1] !== indices[i] + 1) return false;
      sections.push(indices[i]);
    }
    if (sections.some((start, index) => sections.slice(index + 1).some(other => Math.abs(start - other) <= 1))) return false;
  }
  const unclearable = [...restrictions].filter(tile => !pathKeys.has(tile)).length;
  if (Math.abs(unclearable / (map.width * map.height) - 0.4) > 0.08) return false;
  return true;
}

export function generateMissionMap(baseMap, seed, { difficulty = 1, maxAttempts = 1000, faction = null } = {}) {
  const level = typeof difficulty === 'string' ? (DIFFICULTIES[difficulty] || 1) : Math.max(1, Math.min(5, Number(difficulty) || 1));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const attemptSeed = (Number(seed) + Math.imul(attempt, 0x9e3779b9)) >>> 0;
    const random = createSeededRandom(attemptSeed);
    const [width, height] = dimensions(random, level);
    const generatedPath = makePath(width, height, random, level);
    if (!generatedPath) continue;
    const paths = [generatedPath];
    const path = paths[0];
    const pathKeys = new Set(path.map(key));
    if (manhattan(path[0], path.at(-1)) <= 1) continue;
    const buildingTemplates = createBuildingTemplates(baseMap, faction);
    const buildings = placeBuildings(buildingTemplates, width, height, path, random, pathKeys);
    if (!buildings) continue;
    const buildingTiles = new Set(buildings.flatMap(building => getBuildingFootprint(building).map(key)));
    const occupied = new Set([...pathKeys, ...buildingTiles]);
    const candidates = [];
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const p = { x, y };
      if (!occupied.has(key(p))) candidates.push(p);
    }
    const distances = p => Math.min(...path.map(point => manhattan(point, p)));
    const near = candidates.filter(p => distances(p) >= 1 && distances(p) <= 3);
    const specials = [];
    if (!near.length) continue;
    const choose = arr => arr.splice(Math.floor(random() * arr.length), 1)[0];
    const rolls = rollAdditionalSpecialTileCount(random);
    for (let i = 0; i < Math.min(1 + rolls, near.length); i += 1) {
      const location = choose(near);
      specials.push({ ...location, type: SPECIAL_TYPES[Math.floor(random() * SPECIAL_TYPES.length)] });
    }
    // Ensure melee-only tiles are adjacent.
    specials.forEach(tile => { if (tile.type === 'dark_alley' && distances(tile) !== 1) tile.type = 'thermal_enhancement'; });
    const specialKeys = new Set(specials.map(key));
    const reserved = new Set([...occupied, ...specialKeys]);
    const all = [];
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (!reserved.has(`${x},${y}`)) all.push({ x, y });
    all.sort((a, b) => distances(b) - distances(a));
    const unclearableCount = Math.max(0, Math.round(width * height * 0.4) - buildingTiles.size);
    const unclearable = all.splice(0, Math.min(unclearableCount, all.length));
    const restricted = [...footprintRestrictions(buildings), ...unclearable.map(tile => ({ ...tile, width: 1, height: 1 }))];
    const available = all;
    const clearableCount = Math.round(available.length * (0.4 + random() * 0.2));
    const map = {
      ...baseMap, width, height, paths, entryPoints: [{ ...path[0] }], exitPoints: [{ ...path.at(-1) }],
      placementRestrictions: restricted, buildings, specialTiles: specials,
      blockedClearableTiles: available.slice(0, clearableCount),
      clearTiles: available.slice(clearableCount),
      terrainModifiers: [],
      generation: { seed: attemptSeed, difficulty: level },
    };
    const sectionCount = level <= 2 ? 1 : 2;
    const eligibleStarts = Array.from({ length: path.length - 1 }, (_, index) => index)
      .filter(index => index > 0 && index < path.length - 2
        && path.findIndex(point => key(point) === key(path[index])) === index
        && path.findIndex(point => key(point) === key(path[index + 1])) === index + 1);
    for (const [type, speedMultiplier] of [['incline', 0.5], ['decline', 2]]) {
      for (let section = 0; section < sectionCount; section += 1) {
        const options = eligibleStarts.filter(index => !map.terrainModifiers.some(tile =>
          [key(path[index]), key(path[index + 1])].includes(key(tile))));
        if (!options.length) break;
        const index = options[Math.floor(random() * options.length)];
        map.terrainModifiers.push({ ...path[index], type, speedMultiplier }, { ...path[index + 1], type, speedMultiplier });
        eligibleStarts.splice(eligibleStarts.indexOf(index), 1);
      }
    }
    if (validateGeneratedMap(map, level)) return map;
  }
  throw new Error(`Could not generate a valid map from seed ${seed}`);
}

export function createMissionSeed() { return Math.floor(Math.random() * 0x100000000) >>> 0; }
