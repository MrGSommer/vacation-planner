/**
 * Generate WayFable branded icons from SVG template.
 * Usage: node scripts/generate-icons.js
 * Requires: npx sharp-cli
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// WayFable brand icon SVG — stylized "W" with path/compass motif
// Colors: primary coral #FF6B6B, secondary teal #4ECDC4
const createIconSvg = (size, { maskable = false, favicon = false } = {}) => {
  const padding = maskable ? size * 0.2 : favicon ? size * 0.08 : size * 0.1;
  const inner = size - padding * 2;
  const cx = size / 2;
  const cy = size / 2;
  const r = inner / 2;

  // Background
  const bgRoundness = maskable ? 0 : size * 0.18;
  const bg = maskable
    ? `<rect width="${size}" height="${size}" fill="url(#grad)" />`
    : `<rect x="${padding * 0.3}" y="${padding * 0.3}" width="${size - padding * 0.6}" height="${size - padding * 0.6}" rx="${bgRoundness}" fill="url(#grad)" />`;

  // "W" letter dimensions — positioned inside the rounded rect
  const wTop = cy - r * 0.42;
  const wBottom = cy + r * 0.42;
  const wLeft = cx - r * 0.52;
  const wRight = cx + r * 0.52;
  const wMid = cx;
  const wMidLeft = cx - r * 0.2;
  const wMidRight = cx + r * 0.2;
  const wPeak = cy - r * 0.08;

  // Stylized W path with rounded connections
  const strokeW = Math.max(size * 0.045, 2);

  // Small compass dot at top
  const dotR = size * 0.035;

  // Decorative path line below W
  const pathY = wBottom + r * 0.22;
  const pathStroke = Math.max(size * 0.025, 1.5);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF6B6B" />
      <stop offset="100%" stop-color="#FF8E8E" />
    </linearGradient>
  </defs>
  ${bg}
  <!-- Compass dot -->
  <circle cx="${cx}" cy="${wTop - r * 0.15}" r="${dotR}" fill="#FFFFFF" opacity="0.9" />
  <!-- Stylized W -->
  <polyline points="${wLeft},${wTop} ${wMidLeft},${wBottom} ${wMid},${wPeak} ${wMidRight},${wBottom} ${wRight},${wTop}" fill="none" stroke="#FFFFFF" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round" />
  <!-- Decorative path/road line -->
  <line x1="${cx - r * 0.3}" y1="${pathY}" x2="${cx + r * 0.3}" y2="${pathY}" stroke="#4ECDC4" stroke-width="${pathStroke}" stroke-linecap="round" opacity="0.9" />
  <circle cx="${cx + r * 0.36}" cy="${pathY}" r="${pathStroke * 0.8}" fill="#4ECDC4" opacity="0.9" />
</svg>`;
};

const projectRoot = path.join(__dirname, '..');
const tmpDir = path.join(projectRoot, 'tmp-icons');

// Create tmp dir
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

// Define all icons to generate
const icons = [
  // App icons (assets/)
  { name: 'icon.png', size: 1024, dest: 'assets/icon.png' },
  { name: 'adaptive-icon.png', size: 1024, dest: 'assets/adaptive-icon.png', maskable: true },
  { name: 'splash-icon.png', size: 1024, dest: 'assets/splash-icon.png' },

  // Favicon
  { name: 'favicon-48.png', size: 48, dest: 'assets/favicon.png', favicon: true },
  { name: 'favicon-48-pub.png', size: 48, dest: 'public/favicon.png', favicon: true },

  // PWA icons (public/)
  { name: 'icon-192.png', size: 192, dest: 'public/icon-192.png' },
  { name: 'icon-512.png', size: 512, dest: 'public/icon-512.png' },
  { name: 'icon-maskable-192.png', size: 192, dest: 'public/icon-maskable-192.png', maskable: true },
  { name: 'icon-maskable-512.png', size: 512, dest: 'public/icon-maskable-512.png', maskable: true },
];

for (const icon of icons) {
  const svgPath = path.join(tmpDir, icon.name.replace('.png', '.svg'));
  const pngPath = path.join(tmpDir, icon.name);
  const destPath = path.join(projectRoot, icon.dest);

  // Write SVG
  const svg = createIconSvg(icon.size, { maskable: icon.maskable, favicon: icon.favicon });
  fs.writeFileSync(svgPath, svg);

  // Convert to PNG using sharp-cli
  try {
    execSync(`npx sharp-cli -i "${svgPath}" -o "${pngPath}" --format png`, { stdio: 'pipe' });

    // Copy to destination
    fs.copyFileSync(pngPath, destPath);
    console.log(`✓ ${icon.dest} (${icon.size}x${icon.size})`);
  } catch (err) {
    console.error(`✗ ${icon.dest}: ${err.message}`);
  }
}

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('\nDone! All icons generated.');
