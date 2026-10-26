/**
 * Generates the production 2D art assets for the tower defense game.
 *
 * The sprites are deliberately simple, high-contrast, and readable at their
 * in-game sizes. Enemy and projectile sprites face right because the game
 * rotates them toward their movement target.
 */

import fs from 'fs';
import path from 'path';
import { createCanvas } from 'canvas';
import { fileURLToPath } from 'url';
import { writeGeneratedAsset } from './utils/generatedAssetProtection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const assetsDir = path.join(__dirname, '../public/assets');
const uiDir = path.join(assetsDir, 'ui');

fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(uiDir, { recursive: true });

const towersConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'assets/config/towers.json'), 'utf-8')
);

const towerPalettes = {
  BASIC: {
    base: '#1e63c7',
    mid: '#2e9ff5',
    light: '#b8efff',
    dark: '#0d2555',
    metal: '#8fb1c9',
    accent: '#42d8ff',
  },
  AOE: {
    base: '#b92820',
    mid: '#ff4939',
    light: '#ffd66f',
    dark: '#3a1012',
    metal: '#a48a70',
    accent: '#ff9b24',
  },
  SLOW: {
    base: '#0d8ca5',
    mid: '#24c8df',
    light: '#d5fbff',
    dark: '#073243',
    metal: '#8ec0cf',
    accent: '#7af7ff',
  },
  SNIPER: {
    base: '#55229a',
    mid: '#8a45f0',
    light: '#e2c6ff',
    dark: '#170f38',
    metal: '#9385bb',
    accent: '#ff6dff',
  },
  MULTISHOT: {
    base: '#bf6700',
    mid: '#ff9f22',
    light: '#ffe1a3',
    dark: '#3b1a08',
    metal: '#b59668',
    accent: '#ffcf48',
  },
  SUPPORT: {
    base: '#1e853c',
    mid: '#43c961',
    light: '#c4ffd0',
    dark: '#0d321c',
    metal: '#86b995',
    accent: '#7dff89',
  },
};

const enemyPalettes = {
  basic: ['#ff8a1f', '#ffd06b', '#4b190a'],
  fast: ['#f6d326', '#fff48b', '#4c3600'],
  armored: ['#8241bd', '#c69bff', '#21102f'],
  flying: ['#42b85f', '#baf5c8', '#073318'],
  healer: ['#14c978', '#bdffe0', '#073222'],
  shield: ['#96a7b1', '#e8f3fb', '#15242f'],
  split: ['#ff5f2f', '#ffc187', '#481407'],
  teleport: ['#d22cff', '#f2b3ff', '#250038'],
};

function save(canvas, filename, dir = assetsDir) {
  writeGeneratedAsset(filename, canvas.toBuffer('image/png'), (assetFilename, content) => {
    fs.writeFileSync(path.join(dir, assetFilename), content);
  });
  console.log(`Created ${path.relative(path.join(__dirname, '..'), path.join(dir, filename))}`);
}

function canvas(width, height, draw) {
  const out = createCanvas(width, height);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, width, height);
  draw(ctx, width, height);
  return out;
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function ellipse(ctx, x, y, rx, ry, fill, stroke = null, width = 1) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function circle(ctx, x, y, r, fill, stroke = null, width = 1) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function line(ctx, x1, y1, x2, y2, color, width = 1, cap = 'round') {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function polygon(ctx, points, fill, stroke = null, width = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function gradient(ctx, x0, y0, x1, y1, stops) {
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([offset, color]) => grad.addColorStop(offset, color));
  return grad;
}

function radial(ctx, x0, y0, r0, x1, y1, r1, stops) {
  const grad = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  stops.forEach(([offset, color]) => grad.addColorStop(offset, color));
  return grad;
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clearShadow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function drawGroundTexture(ctx, width, height, spec) {
  const rand = mulberry32(spec.seed);
  ctx.fillStyle = gradient(ctx, 0, 0, width, height, [
    [0, spec.top],
    [1, spec.bottom],
  ]);
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.22;
  for (let i = 0; i < spec.speckles; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = 0.7 + rand() * 2.8;
    ctx.fillStyle = rand() > 0.45 ? spec.light : spec.dark;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.4 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (spec.blades) {
    for (let i = 0; i < 26; i++) {
      const x = rand() * width;
      const y = rand() * height;
      line(ctx, x, y + 4, x + (rand() - 0.5) * 5, y, rand() > 0.5 ? spec.light : spec.dark, 1);
    }
  }

  if (spec.cracks) {
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 9; i++) {
      const x = rand() * width;
      const y = rand() * height;
      line(ctx, x, y, x + (rand() - 0.5) * 16, y + (rand() - 0.5) * 12, spec.dark, 1);
    }
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
}

function drawPathTile(ctx, width, height) {
  drawGroundTexture(ctx, width, height, {
    seed: 1099,
    top: '#7a563f',
    bottom: '#4f382b',
    light: '#b58a61',
    dark: '#2f211a',
    speckles: 80,
    cracks: true,
  });

  ctx.globalAlpha = 0.52;
  for (let y = -12; y < height + 20; y += 16) {
    line(ctx, -5, y, width + 8, y + 12, '#2b1d15', 3, 'butt');
    line(ctx, -5, y + 3, width + 8, y + 15, '#b79267', 1, 'butt');
  }
  ctx.globalAlpha = 1;
}

function drawPlacementTile(ctx, width, height) {
  ctx.fillStyle = radial(ctx, width / 2, height / 2, 4, width / 2, height / 2, 40, [
    [0, 'rgba(110, 235, 255, 0.95)'],
    [0.65, 'rgba(48, 166, 209, 0.58)'],
    [1, 'rgba(12, 67, 92, 0.18)'],
  ]);
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(219, 252, 255, 0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(5, 5, width - 10, height - 10);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(15, 91, 116, 0.75)';
  ctx.strokeRect(11, 11, width - 22, height - 22);
  circle(ctx, width / 2, height / 2, 13, 'rgba(255,255,255,0.1)', 'rgba(221,252,255,0.9)', 2);
  line(ctx, width / 2 - 9, height / 2, width / 2 + 9, height / 2, 'rgba(221,252,255,0.85)', 2);
  line(ctx, width / 2, height / 2 - 9, width / 2, height / 2 + 9, 'rgba(221,252,255,0.85)', 2);
}

function drawTowerBase(ctx, palette, level) {
  ellipse(ctx, 16, 25, 11.5, 4.7, 'rgba(0,0,0,0.32)');
  ellipse(ctx, 16, 22, 11.5, 5.5, palette.dark, '#07101d', 1.2);
  ellipse(ctx, 16, 20.5, 10.5, 5.4, palette.metal, palette.dark, 1);
  ellipse(ctx, 16, 19.5, 8.2, 4.2, palette.base, palette.dark, 1);

  if (level >= 2) {
    line(ctx, 6.2, 22, 3.6, 25.5, palette.metal, 2);
    line(ctx, 25.8, 22, 28.4, 25.5, palette.metal, 2);
  }
  if (level >= 3) {
    ctx.globalAlpha = 0.72;
    circle(ctx, 16, 20, 12.5, 'transparent', palette.accent, 1);
    ctx.globalAlpha = 1;
  }
}

function drawCore(ctx, x, y, radius, palette) {
  ctx.shadowColor = palette.accent;
  ctx.shadowBlur = 5;
  circle(ctx, x, y, radius, radial(ctx, x - 1, y - 1, 1, x, y, radius, [
    [0, '#ffffff'],
    [0.45, palette.light],
    [1, palette.accent],
  ]), palette.dark, 1);
  clearShadow(ctx);
}

function drawBasicTower(ctx, palette, level) {
  drawTowerBase(ctx, palette, level);
  roundedRect(ctx, 14, 11, 14, 6, 2);
  ctx.fillStyle = gradient(ctx, 14, 11, 28, 17, [
    [0, palette.metal],
    [1, palette.dark],
  ]);
  ctx.fill();
  ctx.strokeStyle = '#07101d';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  roundedRect(ctx, 24, 12, 5.5, 4, 1.5);
  ctx.fillStyle = palette.light;
  ctx.fill();
  ctx.stroke();
  circle(ctx, 14, 15, 8.5, gradient(ctx, 9, 8, 20, 23, [
    [0, palette.light],
    [0.45, palette.mid],
    [1, palette.base],
  ]), palette.dark, 1.4);
  drawCore(ctx, 13.5, 14.4, level >= 3 ? 3.2 : 2.5, palette);
  if (level >= 2) {
    line(ctx, 9, 8, 5.5, 13, palette.metal, 2);
    line(ctx, 20.8, 20.4, 25.5, 23, palette.metal, 2);
  }
}

function drawAoeTower(ctx, palette, level) {
  drawTowerBase(ctx, palette, level);
  circle(ctx, 16, 14.8, 8.7, gradient(ctx, 10, 8, 23, 22, [
    [0, palette.light],
    [0.42, palette.mid],
    [1, palette.base],
  ]), palette.dark, 1.5);
  circle(ctx, 16, 14.8, 5.6, '#41120b', palette.dark, 1);
  drawCore(ctx, 16, 14.8, 3.6 + level * 0.25, palette);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    line(ctx, 16 + Math.cos(a) * 7, 14.8 + Math.sin(a) * 7, 16 + Math.cos(a) * 11, 14.8 + Math.sin(a) * 11, palette.accent, 1.4);
  }
  if (level >= 2) circle(ctx, 16, 14.8, 11.2, 'transparent', palette.light, 1.2);
  if (level >= 3) circle(ctx, 16, 14.8, 13.4, 'transparent', palette.accent, 1);
}

function drawSlowTower(ctx, palette, level) {
  drawTowerBase(ctx, palette, level);
  polygon(ctx, [[16, 3.5], [24, 15], [18.5, 24], [10, 22], [8, 13]], gradient(ctx, 10, 4, 23, 23, [
    [0, palette.light],
    [0.38, palette.mid],
    [1, palette.base],
  ]), palette.dark, 1.2);
  polygon(ctx, [[16, 3.5], [18.5, 24], [14.5, 18.5]], 'rgba(255,255,255,0.28)');
  line(ctx, 9, 16, 5.5, 12.5, palette.light, 1.3);
  line(ctx, 23, 13, 27, 9.5, palette.light, 1.3);
  if (level >= 2) {
    line(ctx, 8, 23, 4, 27, palette.accent, 1.6);
    line(ctx, 24, 23, 28, 27, palette.accent, 1.6);
  }
  if (level >= 3) {
    ctx.shadowColor = palette.accent;
    ctx.shadowBlur = 6;
    circle(ctx, 16, 14, 13, 'transparent', palette.accent, 1);
    clearShadow(ctx);
  }
}

function drawSniperTower(ctx, palette, level) {
  drawTowerBase(ctx, palette, level);
  roundedRect(ctx, 12, 8, 8, 14, 3);
  ctx.fillStyle = gradient(ctx, 12, 8, 20, 22, [
    [0, palette.light],
    [0.45, palette.mid],
    [1, palette.base],
  ]);
  ctx.fill();
  ctx.strokeStyle = palette.dark;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  line(ctx, 17, 12, 30, 9, palette.dark, 4);
  line(ctx, 17, 12, 30, 9, palette.metal, 2);
  line(ctx, 24, 7, 29, 6, palette.accent, 1);
  drawCore(ctx, 16, 13.8, level >= 3 ? 3.2 : 2.5, palette);
  if (level >= 2) {
    line(ctx, 11.5, 9.5, 6.2, 5.8, palette.metal, 1.7);
    line(ctx, 12, 21.5, 7.2, 26, palette.metal, 1.7);
  }
  if (level >= 3) circle(ctx, 16, 14, 8.5, 'transparent', palette.accent, 1);
}

function drawMultishotTower(ctx, palette, level) {
  drawTowerBase(ctx, palette, level);
  const barrels = level >= 3 ? [-0.42, 0, 0.42] : [-0.32, 0.32];
  barrels.forEach((offset) => {
    ctx.save();
    ctx.translate(16, 14);
    ctx.rotate(offset);
    roundedRect(ctx, 1, -2.2, 12, 4.4, 1.5);
    ctx.fillStyle = palette.dark;
    ctx.fill();
    ctx.strokeStyle = '#07101d';
    ctx.lineWidth = 1;
    ctx.stroke();
    roundedRect(ctx, 9, -1.6, 4.5, 3.2, 1);
    ctx.fillStyle = palette.light;
    ctx.fill();
    ctx.restore();
  });
  circle(ctx, 15, 15.8, 8, gradient(ctx, 9, 9, 22, 23, [
    [0, palette.light],
    [0.48, palette.mid],
    [1, palette.base],
  ]), palette.dark, 1.4);
  drawCore(ctx, 15, 15.8, level >= 2 ? 2.7 : 2.1, palette);
  if (level >= 2) circle(ctx, 15, 15.8, 10.2, 'transparent', palette.light, 1);
}

function drawSupportTower(ctx, palette, level) {
  drawTowerBase(ctx, palette, level);
  roundedRect(ctx, 12, 9, 8, 14, 3);
  ctx.fillStyle = gradient(ctx, 12, 9, 20, 23, [
    [0, palette.light],
    [0.38, palette.mid],
    [1, palette.base],
  ]);
  ctx.fill();
  ctx.strokeStyle = palette.dark;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  line(ctx, 16, 9, 16, 3.8, palette.metal, 1.6);
  drawCore(ctx, 16, 6.3, 2.8 + level * 0.18, palette);
  ctx.globalAlpha = 0.5;
  circle(ctx, 16, 15.5, 9 + level, 'transparent', palette.accent, 1);
  ctx.globalAlpha = 1;
  if (level >= 2) {
    line(ctx, 12.5, 10.5, 8, 7, palette.accent, 1.2);
    line(ctx, 19.5, 10.5, 24, 7, palette.accent, 1.2);
  }
  if (level >= 3) {
    line(ctx, 10, 23, 6, 27, palette.metal, 1.7);
    line(ctx, 22, 23, 26, 27, palette.metal, 1.7);
  }
}

const towerDrawers = {
  BASIC: drawBasicTower,
  AOE: drawAoeTower,
  SLOW: drawSlowTower,
  SNIPER: drawSniperTower,
  MULTISHOT: drawMultishotTower,
  SUPPORT: drawSupportTower,
};

function drawTower(type, level) {
  const palette = towerPalettes[type];
  return canvas(32, 32, (ctx) => {
    towerDrawers[type](ctx, palette, level);
  });
}

function enemyBody(ctx, palette, opts = {}) {
  const [base, light, dark] = palette;
  ellipse(ctx, 15, 24.5, 10.5, 3.2, 'rgba(0,0,0,0.28)');

  if (opts.wings) {
    polygon(ctx, [[10, 14], [2.7, 7], [13, 11]], 'rgba(188,255,216,0.72)', dark, 1);
    polygon(ctx, [[10, 18], [2.7, 25], [13, 21]], 'rgba(188,255,216,0.72)', dark, 1);
  }

  ctx.beginPath();
  ctx.moveTo(4.5, 16);
  ctx.quadraticCurveTo(9, 6.8, 22.5, 8.4);
  ctx.lineTo(29, 16);
  ctx.quadraticCurveTo(22.5, 23.6, 9, 25.2);
  ctx.closePath();
  ctx.fillStyle = gradient(ctx, 6, 8, 25, 25, [
    [0, light],
    [0.42, base],
    [1, dark],
  ]);
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = dark;
  ctx.stroke();

  if (opts.armor) {
    [9, 14, 19].forEach((x) => line(ctx, x, 9.8, x - 1.4, 22.4, 'rgba(255,255,255,0.32)', 1.3));
    line(ctx, 6.2, 16, 24, 16, dark, 1);
  }

  if (opts.speed) {
    line(ctx, 6.5, 10, 1.5, 7, light, 2);
    line(ctx, 6.5, 22, 1.5, 25, light, 2);
    line(ctx, 3, 13, 0.5, 13, base, 1);
    line(ctx, 3, 19, 0.5, 19, base, 1);
  }

  circle(ctx, 22.2, 14, 2, light, dark, 0.7);
  circle(ctx, 23, 14.1, 0.7, '#ffffff');
}

function drawEnemy(type) {
  return canvas(32, 32, (ctx) => {
    const palette = enemyPalettes[type];
    if (type === 'fast') enemyBody(ctx, palette, { speed: true });
    else if (type === 'armored') enemyBody(ctx, palette, { armor: true });
    else if (type === 'flying') enemyBody(ctx, palette, { wings: true });
    else if (type === 'healer') {
      enemyBody(ctx, palette);
      line(ctx, 13.5, 16, 19.5, 16, '#eafff4', 1.8);
      line(ctx, 16.5, 13, 16.5, 19, '#eafff4', 1.8);
    } else if (type === 'shield') {
      enemyBody(ctx, palette);
      ctx.globalAlpha = 0.62;
      circle(ctx, 17, 16, 12.5, 'rgba(102,198,255,0.18)', '#8ee9ff', 1.5);
      ctx.globalAlpha = 1;
    } else if (type === 'split') {
      enemyBody(ctx, palette);
      circle(ctx, 11, 16, 5.2, 'rgba(255,255,255,0.18)', enemyPalettes.split[2], 1);
      circle(ctx, 18, 16, 5.2, 'rgba(255,255,255,0.14)', enemyPalettes.split[2], 1);
    } else if (type === 'teleport') {
      ctx.shadowColor = '#e852ff';
      ctx.shadowBlur = 6;
      enemyBody(ctx, palette);
      clearShadow(ctx);
      circle(ctx, 16, 16, 13, 'transparent', '#f4b8ff', 1);
      polygon(ctx, [[16, 6], [22, 16], [16, 26], [10, 16]], 'rgba(255,255,255,0.18)', '#f4b8ff', 1);
    } else {
      enemyBody(ctx, palette);
    }
  });
}

function drawBoss() {
  return canvas(56, 56, (ctx) => {
    ellipse(ctx, 26, 45, 20, 5.5, 'rgba(0,0,0,0.32)');
    polygon(ctx, [[4, 28], [13, 12], [36, 10], [52, 28], [36, 46], [13, 44]], gradient(ctx, 8, 12, 46, 46, [
      [0, '#ff94a8'],
      [0.35, '#e31855'],
      [1, '#3d0820'],
    ]), '#14040b', 2);
    polygon(ctx, [[6, 28], [0, 18], [10, 22]], '#650f27', '#14040b', 1.2);
    polygon(ctx, [[6, 28], [0, 38], [10, 34]], '#650f27', '#14040b', 1.2);
    polygon(ctx, [[48, 28], [56, 18], [50, 26]], '#ff4c7a', '#14040b', 1.2);
    polygon(ctx, [[48, 28], [56, 38], [50, 30]], '#ff4c7a', '#14040b', 1.2);
    [17, 26, 35].forEach((x) => line(ctx, x, 13, x - 2, 43, 'rgba(255,210,218,0.26)', 2));
    circle(ctx, 36, 24, 4.2, '#ffd6dd', '#14040b', 1);
    circle(ctx, 38, 24.5, 1.2, '#ffffff');
    ctx.shadowColor = '#ff2a6e';
    ctx.shadowBlur = 8;
    circle(ctx, 24, 28, 7, radial(ctx, 22, 25, 1, 24, 28, 7, [
      [0, '#ffffff'],
      [0.4, '#ff9aac'],
      [1, '#fb255b'],
    ]), '#14040b', 1.5);
    clearShadow(ctx);
  });
}

function drawProjectile(type) {
  const colors = {
    basic: ['#54c8ff', '#e9fbff', '#06456d'],
    aoe: ['#ff603a', '#ffe292', '#7a1308'],
    slow: ['#55edff', '#ecffff', '#07566b'],
    sniper: ['#b064ff', '#fff1ff', '#31115f'],
    multishot: ['#ffb22d', '#fff0aa', '#744009'],
  }[type];

  return canvas(16, 16, (ctx) => {
    ellipse(ctx, 7, 12.4, 5.5, 1.4, 'rgba(0,0,0,0.2)');
    if (type === 'sniper') {
      polygon(ctx, [[1.5, 8], [12.5, 4], [15, 8], [12.5, 12]], colors[0], colors[2], 1);
      line(ctx, 4, 8, 13, 8, colors[1], 1.1);
    } else if (type === 'slow') {
      polygon(ctx, [[2, 8], [8, 2], [14, 8], [8, 14]], colors[0], colors[2], 1);
      polygon(ctx, [[8, 2], [9.5, 8], [8, 14], [6.8, 8]], 'rgba(255,255,255,0.4)');
    } else if (type === 'multishot') {
      polygon(ctx, [[2, 5], [13, 8], [2, 11], [5, 8]], colors[0], colors[2], 1);
      line(ctx, 4, 6.2, 10.5, 8, colors[1], 1);
      line(ctx, 4, 9.8, 10.5, 8, colors[1], 1);
    } else {
      ctx.shadowColor = colors[0];
      ctx.shadowBlur = 5;
      circle(ctx, 8, 8, type === 'aoe' ? 5.4 : 4.7, radial(ctx, 6, 6, 1, 8, 8, 5.5, [
        [0, colors[1]],
        [0.48, colors[0]],
        [1, colors[2]],
      ]), colors[2], 1);
      clearShadow(ctx);
      if (type === 'aoe') circle(ctx, 8, 8, 7, 'transparent', '#ffd57a', 1);
    }
  });
}

function drawExplosion() {
  return canvas(32, 32, (ctx) => {
    ctx.shadowColor = '#ffb236';
    ctx.shadowBlur = 7;
    const spikes = [];
    for (let i = 0; i < 18; i++) {
      const a = (Math.PI * 2 * i) / 18;
      const r = i % 2 === 0 ? 14 : 7.5;
      spikes.push([16 + Math.cos(a) * r, 16 + Math.sin(a) * r]);
    }
    polygon(ctx, spikes, radial(ctx, 13, 12, 1, 16, 16, 14, [
      [0, '#ffffff'],
      [0.24, '#fff08a'],
      [0.58, '#ff8f24'],
      [1, 'rgba(187,38,12,0.18)'],
    ]));
    clearShadow(ctx);
    circle(ctx, 16, 16, 6, 'rgba(255,255,255,0.64)');
  });
}

function drawFavicon() {
  return canvas(16, 16, (ctx) => {
    ctx.fillStyle = '#10243b';
    ctx.fillRect(0, 0, 16, 16);
    ellipse(ctx, 8, 12.5, 5.4, 2.1, '#0b1423');
    circle(ctx, 7.3, 8.2, 4.8, '#2e9ff5', '#07101d', 1);
    line(ctx, 9, 7, 15, 5.2, '#b8efff', 2);
    circle(ctx, 7.3, 8.2, 1.7, '#ffffff');
  });
}

function drawUiButton(kind, width, height) {
  return canvas(width, height, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;

    ctx.shadowColor = 'rgba(0,0,0,0.42)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    roundedRect(ctx, 5, 5, w - 10, h - 10, 12);
    ctx.fillStyle = gradient(ctx, 0, 5, 0, h - 5, [
      [0, '#48594a'],
      [0.55, '#26352d'],
      [1, '#17211c'],
    ]);
    ctx.fill();
    clearShadow(ctx);

    ctx.strokeStyle = '#a8d98f';
    ctx.lineWidth = 3;
    ctx.stroke();

    roundedRect(ctx, 10, 10, w - 20, h - 20, 8);
    ctx.strokeStyle = 'rgba(245,255,220,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fff7df';
    ctx.fillStyle = '#fff7df';

    if (kind === 'mute' || kind === 'unmute') {
      polygon(ctx, [
        [cx - 24, cy - 10],
        [cx - 12, cy - 10],
        [cx + 4, cy - 25],
        [cx + 4, cy + 25],
        [cx - 12, cy + 10],
        [cx - 24, cy + 10],
      ], '#fff7df', '#1b241f', 2.4);
      if (kind === 'unmute') {
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx + 7, cy, 13, -0.7, 0.7);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + 11, cy, 22, -0.58, 0.58);
        ctx.stroke();
      } else {
        line(ctx, cx + 14, cy - 16, cx + 31, cy + 16, '#fff7df', 6);
        line(ctx, cx + 31, cy - 16, cx + 14, cy + 16, '#fff7df', 6);
        line(ctx, cx + 14, cy - 16, cx + 31, cy + 16, '#1b241f', 2);
        line(ctx, cx + 31, cy - 16, cx + 14, cy + 16, '#1b241f', 2);
      }
    } else if (kind === 'restart') {
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0.42, Math.PI * 1.78);
      ctx.stroke();
      polygon(ctx, [
        [cx - 8, cy - 20],
        [cx + 15, cy - 25],
        [cx + 8, cy - 4],
      ], '#fff7df', '#1b241f', 2);
    } else if (kind === 'mainmenu') {
      polygon(ctx, [
        [cx - 24, cy - 2],
        [cx, cy - 27],
        [cx + 24, cy - 2],
      ], '#fff7df', '#1b241f', 2.2);
      roundedRect(ctx, cx - 18, cy - 2, 36, 30, 4);
      ctx.fillStyle = '#fff7df';
      ctx.fill();
      ctx.strokeStyle = '#1b241f';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      roundedRect(ctx, cx - 5, cy + 10, 10, 18, 2);
      ctx.fillStyle = '#314038';
      ctx.fill();
    }
  });
}

function generateTiles() {
  save(canvas(64, 64, (ctx) => drawGroundTexture(ctx, 64, 64, {
    seed: 311,
    top: '#67b84c',
    bottom: '#306f33',
    light: '#b3e56a',
    dark: '#1d5125',
    speckles: 88,
    blades: true,
  })), 'tile.png');

  save(canvas(64, 64, (ctx) => drawGroundTexture(ctx, 64, 64, {
    seed: 719,
    top: '#d9b060',
    bottom: '#a86d34',
    light: '#f7d98a',
    dark: '#7b4c28',
    speckles: 92,
    cracks: true,
  })), 'tile_desert.png');

  save(canvas(64, 64, (ctx) => drawGroundTexture(ctx, 64, 64, {
    seed: 941,
    top: '#8596a1',
    bottom: '#4a6170',
    light: '#d9e4e6',
    dark: '#273846',
    speckles: 96,
    cracks: true,
  })), 'tile_mountain.png');

  save(canvas(64, 64, drawPathTile), 'path.png');
  save(canvas(64, 64, drawPlacementTile), 'placement.png');
}

function generateTowers() {
  for (const [type, data] of Object.entries(towersConfig)) {
    for (let level = 1; level <= data.maxLevel; level++) {
      save(drawTower(type, level), `tower_${type.toLowerCase()}_${level}.png`);
    }
  }

  save(drawTower('BASIC', 1), 'tower_basic.png');
  save(drawTower('AOE', 1), 'tower_aoe.png');
  save(drawTower('SLOW', 1), 'tower_slow.png');
}

function generateEnemies() {
  Object.keys(enemyPalettes).forEach((type) => {
    save(drawEnemy(type), `generated_enemy_${type}.png`);
  });
  save(drawBoss(), 'generated_enemy_boss.png');
}

function generateProjectilesAndEffects() {
  ['basic', 'aoe', 'slow', 'sniper', 'multishot'].forEach((type) => {
    save(drawProjectile(type), `projectile_${type}.png`);
  });
  save(drawExplosion(), 'explosion.png');
  save(drawFavicon(), 'favicon.png');
}

function generateUi() {
  save(drawUiButton('mute', 80, 80), 'mute.png', uiDir);
  save(drawUiButton('unmute', 80, 80), 'unmute.png', uiDir);
  save(drawUiButton('restart', 80, 80), 'restart.png', uiDir);
  save(drawUiButton('mainmenu', 80, 80), 'mainmenu.png', uiDir);
}

generateTiles();
generateTowers();
generateEnemies();
generateProjectilesAndEffects();
generateUi();

console.log('All production assets generated successfully.');
