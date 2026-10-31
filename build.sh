#!/bin/sh
# Sestaví web do složky dist (statické soubory pro GitHub Pages).
# Každé sestavení dostane vlastní verzi, aby prohlížeč nepoužil starý main.js z mezipaměti.
set -e
cd "$(dirname "$0")"
VER=$(date -u +%Y%m%d%H%M%S)
rm -rf dist && mkdir dist
bun build src/main.tsx --outdir dist --minify --target browser --define 'process.env.NODE_ENV="production"' --define "__BUILD__=\"$VER\""
cp public/* dist/
sed -i "s/main\.js\"/main.js?v=$VER\"/; s/main\.css\"/main.css?v=$VER\"/; s/config\.js\"/config.js?v=$VER\"/" dist/index.html
sed -i "s/__VER__/$VER/g" dist/sw.js
ls -la dist
