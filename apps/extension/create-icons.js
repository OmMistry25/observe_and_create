const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Create a simple icon with text
async function createIcon(size) {
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="#667eea" rx="${size/8}"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white" font-size="${size/2}" font-family="Arial" font-weight="bold">O&amp;C</text></svg>`;

  const buffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  return buffer;
}

async function generateIcons() {
  const sizes = [16, 32, 48, 128];
  const distDir = path.join(__dirname, 'dist');

  for (const size of sizes) {
    const iconBuffer = await createIcon(size);
    const filename = `icon-${size}.png`;
    const filepath = path.join(distDir, filename);
    
    fs.writeFileSync(filepath, iconBuffer);
    console.log(`✓ Created ${filename}`);
  }
}

generateIcons().catch(console.error);
