const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const buildOutput = path.join(projectRoot, '.launcher-build-final');
const builtLauncher = path.join(buildOutput, 'Sci-Fi Tower Defense RPG Launcher.exe');
const stableLauncher = path.join(projectRoot, 'Sci-Fi Tower Defense RPG Launcher.exe');

if (!fs.existsSync(builtLauncher)) {
  throw new Error(`Portable launcher was not created at ${builtLauncher}`);
}

try {
  fs.copyFileSync(builtLauncher, stableLauncher);
} catch (error) {
  if (error.code === 'EPERM' || error.code === 'EBUSY' || error.code === 'EACCES') {
    throw new Error('Close the launcher, then run npm run build:launcher again to replace it.');
  }
  throw error;
}

console.log(`Updated stable launcher: ${stableLauncher}`);
try {
  fs.rmSync(buildOutput, { recursive: true, force: true });
} catch (error) {
  console.warn(`The temporary launcher build folder could not be removed: ${error.message}`);
}
