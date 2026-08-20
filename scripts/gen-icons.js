const sharp = require('sharp');
const path = require('path');

const SRC = 'E:/app.jpg';
const STATIC = 'C:/Users/123/Chat-C/static';
const IOS_ICONSET = 'C:/Users/123/Chat-C/ios/App/App/Assets.xcassets/AppIcon.appiconset';

const sizes = [
  // PWA manifest icons
  { dir: STATIC, name: 'icon-48.png', size: 48 },
  { dir: STATIC, name: 'icon-72.png', size: 72 },
  { dir: STATIC, name: 'icon-96.png', size: 96 },
  { dir: STATIC, name: 'icon-144.png', size: 144 },
  { dir: STATIC, name: 'icon-180.png', size: 180 },
  { dir: STATIC, name: 'icon-192.png', size: 192 },
  { dir: STATIC, name: 'icon-512.png', size: 512 },
  { dir: STATIC, name: 'icon-1024.png', size: 1024 },
  // iOS AppIcon
  { dir: IOS_ICONSET, name: 'AppIcon-512@2x.png', size: 1024 },
  // apple-touch-icon (same as 180)
  { dir: STATIC, name: 'apple-touch-icon.png', size: 180 },
  // logo and favicon
  { dir: STATIC, name: 'logo.png', size: 512 },
  { dir: STATIC, name: 'favicon-32.png', size: 32 },
];

async function main() {
  for (const { dir, name, size } of sizes) {
    const outPath = path.join(dir, name);
    await sharp(SRC)
      .resize(size, size, { fit: 'cover', position: 'center' })
      .png()
      .toFile(outPath);
    console.log(`✅ ${name} (${size}x${size})`);
  }
  console.log('\nDone! All icons generated.');
}

main().catch(e => { console.error(e); process.exit(1); });
