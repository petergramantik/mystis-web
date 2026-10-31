#!/bin/sh
# Sestaví web do složky dist (statické soubory pro GitHub Pages).
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir dist
bun build src/main.tsx --outdir dist --minify --target browser --define 'process.env.NODE_ENV="production"'
cp public/* dist/
ls -la dist
