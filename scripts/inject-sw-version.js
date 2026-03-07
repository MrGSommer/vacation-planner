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

// --- Precache manifest injection ---
const distDir = path.join(__dirname, '..', 'dist');

function walkDir(dir, baseDir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkDir(fullPath, baseDir));
    } else {
      const relativePath = '/' + path.relative(baseDir, fullPath).replace(/\\/g, '/');
      results.push(relativePath);
    }
  }
  return results;
}

const allFiles = walkDir(distDir, distDir);

// Filter rules for precaching
const SKIP_PATTERNS = [
  /\.js\.map$/,
  /\/version\.json$/,
  /\/metadata\.json$/,
  /\/google.*\.html$/,
  /\/datenschutz\.html$/,
  /\/sw\.js$/,
];

// Only precache these specific fonts (PlusJakartaSans + MaterialIcons + Ionicons)
const ALLOWED_FONT_PATTERNS = [
  /PlusJakartaSans/i,
  /MaterialIcons/i,
  /Ionicons/i,
];

const precacheUrls = allFiles.filter(file => {
  // Skip excluded patterns
  if (SKIP_PATTERNS.some(p => p.test(file))) return false;

  // For font files, only allow specific ones
  if (/\.(woff2?|ttf|eot)$/i.test(file)) {
    return ALLOWED_FONT_PATTERNS.some(p => p.test(file));
  }

  // Include HTML, JS, JSON, images, manifest
  if (/\.(html|js|json|png|jpg|jpeg|svg|ico|webp)$/i.test(file)) return true;

  return false;
});

// Inject PRECACHE_URLS into sw.js
let swContent = fs.readFileSync(swPath, 'utf8');
const precacheJson = JSON.stringify(precacheUrls, null, 2);
swContent = swContent.replace(
  /const PRECACHE_URLS = \[\];?/,
  `const PRECACHE_URLS = ${precacheJson};`
);
fs.writeFileSync(swPath, swContent, 'utf8');
console.log(`[inject-sw-version] Precache manifest: ${precacheUrls.length} URLs injected`);

