# SellEmbedded Chatbot Build Guide

## Prerequisites

- Node.js 18+ (for `npm` and esbuild)
- PHP/composer dependencies are already committed in `vendor/`

## Install tooling

```bash
cd sellembedded-chatbot
npm install
```

This installs the dev-only build dependencies into `node_modules/` (which should **not** be committed or zipped for distribution).

## Build the JavaScript bundle

```bash
npm run build
```

This will:

- Clean the previous bundle
- Bundle `assets/js/main.js` and its imports
- Minify/obfuscate the output with esbuild
- Write the production file to `dist/main.js`

The WordPress hook automatically enqueues `dist/main.js` and appends the file’s `filemtime` as the version, so browsers get the fresh asset every build.

## Create a distributable zip

```bash
npm run package
```

This command:

- Runs the build to ensure `dist/main.js` is fresh
- Creates `release/sellembedded-chatbot.zip`
- Copies every plugin asset except:
  - `assets/js/**` (source files you want to keep private)
  - `node_modules/`, build scripts, sourcemaps, and other local-only files

Upload the generated zip through the WordPress plugin installer (or unzip it into `wp-content/plugins/`). It already includes `dist/main.js`, PHP files, CSS, images, templates, and the `vendor/` dependencies.

