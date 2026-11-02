#!/usr/bin/env bash
# Copyright (C) 2026 wendsell
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Build store-ready zips into dist/.
#   scripts/build.sh            -> Chrome + Firefox
#   scripts/build.sh chrome     -> Chrome only
#   scripts/build.sh firefox    -> Firefox only (see store/firefox/README.md, not yet tested)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/extension"
DIST="$ROOT/dist"
VERSION="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['version'])" "$SRC/manifest.json")"
TARGET="${1:-all}"

mkdir -p "$DIST"

build_chrome() {
  local out="$DIST/spoolghetti-chrome-$VERSION.zip"
  rm -f "$out"
  (cd "$SRC" && zip -qr "$out" manifest.json content.js icons)
  echo "Chrome:  $out"
}

build_firefox() {
  local out="$DIST/spoolghetti-firefox-$VERSION.zip"
  local tmp
  tmp="$(mktemp -d)"
  cp -r "$SRC/content.js" "$SRC/icons" "$tmp/"
  # Base manifest + Firefox-only keys (gecko id, data collection declaration)
  python3 - "$SRC/manifest.json" "$ROOT/platforms/firefox/manifest.overrides.json" "$tmp/manifest.json" <<'PY'
import json, sys
base, over, out = sys.argv[1:4]
m = json.load(open(base))
def merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            merge(a[k], v)
        else:
            a[k] = v
merge(m, json.load(open(over)))
json.dump(m, open(out, "w"), indent=2, ensure_ascii=False)
PY
  rm -f "$out"
  (cd "$tmp" && zip -qr "$out" manifest.json content.js icons)
  rm -rf "$tmp"
  echo "Firefox: $out  (untested, see store/firefox/README.md)"
}

case "$TARGET" in
  chrome)  build_chrome ;;
  firefox) build_firefox ;;
  all)     build_chrome; build_firefox ;;
  *) echo "Usage: $0 [chrome|firefox|all]" >&2; exit 1 ;;
esac
