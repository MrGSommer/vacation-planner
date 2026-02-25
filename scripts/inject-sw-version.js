/**
 * inject-sw-version.js
 *
 * Replaces the APP_VERSION in dist/sw.js with a unique build hash.
 * This ensures every Netlify deploy produces a byte-different service worker,
 * which triggers the browser's update detection automatically.
 *
 * Run AFTER `expo export -p web` since Expo copies public/sw.js to dist/sw.js.
 */

const fs = require('fs');
const path = require('path');

const swPath = path.join(__dirname, '..', 'dist', 'sw.js');

if (!fs.existsSync(swPath)) {
  console.error('[inject-sw-version] dist/sw.js not found — run expo export first');
  process.exit(1);
}

let content = fs.readFileSync(swPath, 'utf8');

const buildHash = Date.now().toString(36);
const replaced = content.replace(
  /const APP_VERSION = '[^']*'/,
  `const APP_VERSION = '${buildHash}'`
);

if (replaced === content) {
  console.warn('[inject-sw-version] WARNING: APP_VERSION pattern not found in sw.js');
} else {
  fs.writeFileSync(swPath, replaced, 'utf8');
  console.log(`[inject-sw-version] SW version set to: ${buildHash}`);
}

// Also write version.json for the fallback update check (independent of SW lifecycle)
const versionJsonPath = path.join(__dirname, '..', 'dist', 'version.json');
fs.writeFileSync(versionJsonPath, JSON.stringify({ v: buildHash }), 'utf8');
console.log(`[inject-sw-version] version.json written`);

