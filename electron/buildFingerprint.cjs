const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BUILD_INPUTS = [
  'src',
  'public',
  'electron/main.cjs',
  'electron/diagnostics-preload.cjs',
  'webpack.config.js',
  '.babelrc',
  'package.json',
  'package-lock.json',
];

function walkFiles(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [relativePath];
  return fs.readdirSync(absolutePath).sort().flatMap(name => walkFiles(root, path.join(relativePath, name)));
}

function getBuildFingerprint(projectRoot) {
  const hash = crypto.createHash('sha256');
  const files = BUILD_INPUTS.flatMap(input => walkFiles(projectRoot, input)).sort();

  for (const file of files) {
    hash.update(file.replaceAll(path.sep, '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(projectRoot, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

module.exports = { getBuildFingerprint };
