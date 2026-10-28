const fs = require('node:fs');
const path = require('node:path');
const { getBuildFingerprint } = require('../electron/buildFingerprint.cjs');

const projectRoot = path.resolve(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');
const requiredFiles = ['index.html', 'bundle.js'];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(distPath, file))) {
    throw new Error(`Production build did not emit dist/${file}; build metadata was not written.`);
  }
}

const buildInfo = {
  fingerprint: getBuildFingerprint(projectRoot),
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(distPath, 'build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);
console.log('Wrote dist/build-info.json for the current source and assets.');
