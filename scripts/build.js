const { build } = require('esbuild');
const path = require('path');
const fs = require('fs');

const outDir = path.resolve(__dirname, '..', 'dist');

fs.mkdirSync(outDir, { recursive: true });

build({
  entryPoints: [path.resolve(__dirname, '..', 'assets', 'js', 'main.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  outfile: path.join(outDir, 'main.js'),
  sourcemap: process.env.GENERATE_SOURCEMAP ? true : false,
  logLevel: 'info',
  legalComments: 'none'
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

