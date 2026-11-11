#!/bin/sh
# Sestaví web do složky dist (statické soubory pro GitHub Pages).
# Každé sestavení dostane vlastní verzi, aby prohlížeč nepoužil starý main.js z mezipaměti.
# CHANNEL=dev ./build.sh [cíl] = vývojová verze (štítek DEV, vlastní úložiště, ikony a service worker).
set -e
cd "$(dirname "$0")"
CHANNEL=${CHANNEL:-prod}
OUT=${1:-dist}
VER=$(date -u +%Y%m%d%H%M%S)
rm -rf "$OUT" && mkdir -p "$OUT"
bun build src/main.tsx --outdir "$OUT" --minify --target browser --define 'process.env.NODE_ENV="production"' --define "__BUILD__=\"$VER\"" --define "__CHANNEL__=\"$CHANNEL\""
cp -r public/. "$OUT"/
sed -i "s/main\.js\"/main.js?v=$VER\"/; s/main\.css\"/main.css?v=$VER\"/; s/config\.js\"/config.js?v=$VER\"/" "$OUT"/index.html
sed -i "s/__VER__/$VER/g; s/__CHANNEL__/$CHANNEL/g" "$OUT"/sw.js
if [ "$CHANNEL" = "dev" ]; then
  # oranžové ikony s nápisem DEV a vlastní název, aby šly mít na ploše obě verze
  for f in icon-192.png icon-512.png icon-512-maskable.png apple-touch-icon.png favicon.ico; do
    [ -f "public/icons-dev/$f" ] && cp "public/icons-dev/$f" "$OUT/icons/$f"
  done
  sed -i 's/"name": "MySTIS"/"name": "MySTIS DEV"/; s/"short_name": "MySTIS"/"short_name": "MySTIS DEV"/; s/"theme_color": "#0E1A33"/"theme_color": "#0E1A33", "id": "mystis-dev"/' "$OUT"/manifest.webmanifest
  sed -i 's/<title>MySTIS<\/title>/<title>MySTIS DEV<\/title>/; s/content="MySTIS"/content="MySTIS DEV"/g' "$OUT"/index.html
fi
rm -rf "$OUT/icons-dev"
ls -la "$OUT"
