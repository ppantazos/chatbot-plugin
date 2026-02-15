const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const rootDir = path.resolve(__dirname, '..');
const distFile = path.join(rootDir, 'dist', 'main.js');

if (!fs.existsSync(distFile)) {
  console.error('❌ dist/main.js is missing. Run `npm run build` first.');
  process.exit(1);
}

const releaseDir = path.join(rootDir, 'release');
fs.mkdirSync(releaseDir, { recursive: true });

const zipPath = path.join(releaseDir, 'sellembedded-chatbot.zip');
const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`📦 Created ${zipPath} (${archive.pointer()} bytes)`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

archive.glob('**/*', {
  cwd: rootDir,
  dot: true,
  ignore: [
    'node_modules/**',
    'release/**',
    'scripts/**',
    'dist/*.map',
    'assets/js/**',
    'package.json',
    'package-lock.json',
    '.gitignore',
    'BUILD.md'
  ]
});

archive.finalize();

